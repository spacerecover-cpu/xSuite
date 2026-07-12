// process-scheduled-followups: delivers auto-send email follow-ups.
//
// Invoked asynchronously via net.http_post from process_due_case_follow_ups()
// (pg_cron, every 15 min). Body: { follow_up_id: string }.
//
// The email content (subject/message) was rendered and FROZEN at scheduling
// time — the author previewed exactly what goes out — so this function only
// resolves the recipient, sends via SMTP, flips status, and logs the
// communication. Idempotency: the row is CLAIMED (status pending -> sent) with
// an atomic conditional UPDATE *before* the irreversible SMTP send, so a lost
// status write or a concurrent tick can never re-send the same frozen email —
// a re-invocation finds status != 'pending' and no-ops. Retry: the scanner
// increments attempt_count before each dispatch and gives up at 3; a send
// failure releases the claim back to status='pending' with last_error so the
// next tick retries (or marks 'failed' once the attempt cap is reached).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!SERVICE_ROLE_KEY || authHeader !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  let followUpId: string | undefined;
  try {
    const body = await req.json();
    followUpId = body?.follow_up_id;
  } catch {
    // fallthrough to validation below
  }
  if (!followUpId) {
    return new Response(JSON.stringify({ error: "follow_up_id required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const fail = async (message: string, terminal = false) => {
    await supabase
      .from("case_follow_ups")
      .update({
        last_error: message.slice(0, 500),
        ...(terminal ? { status: "failed" } : {}),
      })
      .eq("id", followUpId);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const { data: followUp, error } = await supabase
      .from("case_follow_ups")
      .select("id, case_id, status, channel, auto_send, send_to, subject, message, attempt_count, created_by")
      .eq("id", followUpId)
      .maybeSingle();

    if (error || !followUp) return await fail("follow-up not found");
    if (followUp.status !== "pending") {
      // Already sent/completed by an earlier invocation — idempotent no-op.
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (followUp.channel !== "email" || !followUp.auto_send) {
      return await fail("follow-up is not an auto-send email", true);
    }
    if (!followUp.message) {
      return await fail("follow-up has no message content", true);
    }

    let recipient = followUp.send_to as string | null;
    if (!recipient) {
      const { data: caseRow } = await supabase
        .from("cases")
        .select("customer_id")
        .eq("id", followUp.case_id)
        .maybeSingle();
      if (caseRow?.customer_id) {
        const { data: customer } = await supabase
          .from("customers_enhanced")
          .select("email")
          .eq("id", caseRow.customer_id)
          .maybeSingle();
        recipient = customer?.email ?? null;
      }
    }
    if (!recipient) return await fail("no recipient email available", true);

    const gmailUser = Deno.env.get("GMAIL_USER");
    const gmailAppPassword = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!gmailUser || !gmailAppPassword) {
      return await fail("email service not configured (GMAIL_USER/GMAIL_APP_PASSWORD)");
    }

    const smtpClient = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 587,
        tls: true,
        auth: { username: gmailUser, password: gmailAppPassword },
      },
    });

    // Claim the row BEFORE the irreversible send: atomically flip pending ->
    // sent, conditioned on status='pending'. Exactly one invocation wins this
    // conditional UPDATE, so a lost status write or a concurrent tick can never
    // re-send the same frozen email. If it matches no row, another invocation
    // already owns this follow-up and we no-op. A send failure releases the
    // claim below (back to 'pending' for retry, or 'failed' at the cap).
    const { data: claimed, error: claimError } = await supabase
      .from("case_follow_ups")
      .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
      .eq("id", followUpId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (claimError) return await fail(`claim failed: ${claimError.message}`);
    if (!claimed) {
      // Lost the claim race — already sent/claimed by another invocation.
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      // Only send() may route to the revert. denomailer's send() resolves only
      // after the server has ACCEPTED the message (DATA committed) — an
      // irreversible act. close() (QUIT + socket teardown) runs in finally and
      // can throw on a connection reset / already-closed socket AFTER a
      // committed send; that must NOT revert the claim, or the frozen email is
      // re-sent on the next tick.
      await smtpClient.send({
        from: gmailUser,
        to: recipient,
        subject: followUp.subject || "Follow-up",
        content: followUp.message,
      });
    } catch (smtpError) {
      const message = smtpError instanceof Error ? smtpError.message : "SMTP error";
      const terminal = (followUp.attempt_count ?? 0) >= 3;
      // Release the claim so the send is retried on the next tick. Revert to
      // 'pending' (clearing sent_at) unless the attempt cap is reached, in
      // which case fail terminally.
      await supabase
        .from("case_follow_ups")
        .update({
          status: terminal ? "failed" : "pending",
          sent_at: null,
          last_error: `smtp: ${message}`.slice(0, 500),
        })
        .eq("id", followUpId);
      return new Response(JSON.stringify({ success: false, error: `smtp: ${message}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } finally {
      // Never routes to the revert: a close() failure after a committed send is
      // swallowed here so the claim stays 'sent'.
      try { await smtpClient.close(); } catch { /* already closed / reset after DATA */ }
    }
    // Status already committed to 'sent' at claim time — no post-send flip
    // needed (that write is exactly the one whose failure caused re-sends).

    try {
      await supabase.rpc("log_case_communication", {
        p_case_id: followUp.case_id,
        p_type: "email",
        p_subject: followUp.subject || "Scheduled follow-up",
        p_content: followUp.message,
        p_direction: "outbound",
        p_sent_to: recipient,
        p_sent_by: followUp.created_by ?? undefined,
      });
    } catch (logError) {
      console.error("Failed to log follow-up communication:", logError);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("process-scheduled-followups error:", err);
    return await fail(err instanceof Error ? err.message : "internal error");
  }
});
