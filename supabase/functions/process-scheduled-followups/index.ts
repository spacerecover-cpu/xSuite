// process-scheduled-followups: delivers auto-send email follow-ups.
//
// Invoked asynchronously via net.http_post from process_due_case_follow_ups()
// (pg_cron, every 15 min). Body: { follow_up_id: string }.
//
// The email content (subject/message) was rendered and FROZEN at scheduling
// time — the author previewed exactly what goes out — so this function only
// resolves the recipient, sends via SMTP, flips status, and logs the
// communication. Retry: the scanner increments attempt_count before each
// dispatch and gives up at 3; a failure here leaves status='pending' with
// last_error so the next tick retries.

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

    try {
      await smtpClient.send({
        from: gmailUser,
        to: recipient,
        subject: followUp.subject || "Follow-up",
        content: followUp.message,
      });
      await smtpClient.close();
    } catch (smtpError) {
      try { await smtpClient.close(); } catch { /* already closed */ }
      const message = smtpError instanceof Error ? smtpError.message : "SMTP error";
      const terminal = (followUp.attempt_count ?? 0) >= 3;
      return await fail(`smtp: ${message}`, terminal);
    }

    await supabase
      .from("case_follow_ups")
      .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
      .eq("id", followUpId);

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
