import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const ALLOWED_ORIGINS = [
  'https://xsuite.space',
  'https://space-recovery.pages.dev',
  ...(Deno.env.get('ALLOWED_ORIGINS') || Deno.env.get('ALLOWED_ORIGIN') || '').split(',').map(o => o.trim()).filter(Boolean),
];

function getAllowedOrigin(req: Request): string {
  const origin = req.headers.get('Origin') || '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function makeCorsHeaders(req: Request) {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(req),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  };
}

let _corsHeaders: Record<string, string> = {};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ..._corsHeaders, "Content-Type": "application/json" },
  });
}

function generateOtp(): string {
  const digits = '0123456789';
  let otp = '';
  const array = new Uint8Array(6);
  crypto.getRandomValues(array);
  for (let i = 0; i < 6; i++) {
    otp += digits[array[i] % 10];
  }
  return otp;
}

function getOtpEmailHtml(otp: string, companyName: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
    <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);padding:32px 40px;text-align:center;">
      <h1 style="color:#ffffff;font-size:24px;margin:0 0 4px 0;font-weight:700;">xSuite</h1>
      <p style="color:#94a3b8;font-size:13px;margin:0;">Data Recovery Management Platform</p>
    </div>
    <div style="padding:40px;">
      <h2 style="color:#0f172a;font-size:20px;margin:0 0 8px 0;">Verify Your Email</h2>
      <p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 28px 0;">
        You're setting up <strong style="color:#0f172a;">${companyName || 'your lab'}</strong> on xSuite. Enter the verification code below to confirm your email address.
      </p>
      <div style="background:#f8fafc;border:2px dashed #cbd5e1;border-radius:8px;padding:24px;text-align:center;margin:0 0 28px 0;">
        <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#0f172a;font-family:'Courier New',monospace;">${otp}</span>
      </div>
      <p style="color:#94a3b8;font-size:12px;line-height:1.5;margin:0 0 4px 0;">This code expires in <strong>30 minutes</strong>.</p>
      <p style="color:#94a3b8;font-size:12px;line-height:1.5;margin:0;">If you didn't request this, you can safely ignore this email.</p>
    </div>
    <div style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="color:#94a3b8;font-size:11px;margin:0;">Sent by xSuite &mdash; Trusted by data recovery labs worldwide</p>
    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = makeCorsHeaders(req);
  _corsHeaders = corsHeaders;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json();
    const { action, email, otp_code, company_name } = body;

    if (!email) {
      return jsonResponse({ error: "Email is required" }, 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return jsonResponse({ error: "Invalid email address" }, 400);
    }

    if (action === "send") {
      const { data: rateLimitOk } = await supabase.rpc('check_rate_limit', {
        p_key: `otp-send:${email.toLowerCase()}`,
        p_max_requests: 3,
        p_window_seconds: 300,
      });

      if (rateLimitOk !== true) {
        return jsonResponse({ error: "Too many requests. Please wait a few minutes before trying again." }, 429);
      }

      await supabase
        .from('signup_otps')
        .update({ deleted_at: new Date().toISOString() })
        .eq('email', email.toLowerCase())
        .is('deleted_at', null);

      const otp = generateOtp();

      const { error: insertError } = await supabase
        .from('signup_otps')
        .insert({
          email: email.toLowerCase(),
          otp_code: otp,
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        });

      if (insertError) {
        console.error('Failed to store OTP:', insertError);
        return jsonResponse({ error: "Failed to generate verification code" }, 500);
      }

      const gmailUser = Deno.env.get("GMAIL_USER");
      const gmailAppPassword = Deno.env.get("GMAIL_APP_PASSWORD");

      if (!gmailUser || !gmailAppPassword) {
        return jsonResponse({ error: "Email service not configured" }, 500);
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
        const htmlBody = getOtpEmailHtml(otp, company_name || '');
        const plainText = `Your xSuite verification code is: ${otp}. This code expires in 30 minutes.`;

        await smtpClient.send({
          from: `xSuite <${gmailUser}>`,
          to: email,
          subject: `${otp} is your xSuite verification code`,
          content: plainText,
          html: htmlBody,
        });
        await smtpClient.close();
      } catch (smtpError) {
        console.error('SMTP error:', smtpError);
        try { await smtpClient.close(); } catch (_) { /* ignore */ }
        return jsonResponse({ error: "Failed to send verification email" }, 500);
      }

      return jsonResponse({ success: true, message: "Verification code sent" }, 200);

    } else if (action === "verify") {
      if (!otp_code) {
        return jsonResponse({ error: "Verification code is required" }, 400);
      }

      const { data: rateLimitOk } = await supabase.rpc('check_rate_limit', {
        p_key: `otp-verify:${email.toLowerCase()}`,
        p_max_requests: 10,
        p_window_seconds: 300,
      });

      if (rateLimitOk !== true) {
        return jsonResponse({ error: "Too many attempts. Please request a new code." }, 429);
      }

      const { data: otpRecord, error: fetchError } = await supabase
        .from('signup_otps')
        .select('*')
        .eq('email', email.toLowerCase())
        .is('deleted_at', null)
        .eq('verified', false)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) {
        console.error('Failed to fetch OTP:', fetchError);
        return jsonResponse({ error: "Verification failed" }, 500);
      }

      if (!otpRecord) {
        return jsonResponse({ error: "Code expired or not found. Please request a new code." }, 400);
      }

      await supabase
        .from('signup_otps')
        .update({ attempts: (otpRecord.attempts || 0) + 1 })
        .eq('id', otpRecord.id);

      if ((otpRecord.attempts || 0) >= 5) {
        await supabase
          .from('signup_otps')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', otpRecord.id);
        return jsonResponse({ error: "Too many failed attempts. Please request a new code." }, 400);
      }

      if (otpRecord.otp_code !== otp_code) {
        return jsonResponse({ error: "Invalid verification code", attempts_remaining: 5 - ((otpRecord.attempts || 0) + 1) }, 400);
      }

      await supabase
        .from('signup_otps')
        .update({ verified: true })
        .eq('id', otpRecord.id);

      return jsonResponse({ success: true, verified: true }, 200);

    } else {
      return jsonResponse({ error: "Invalid action. Use 'send' or 'verify'." }, 400);
    }

  } catch (error) {
    console.error('Error in send-otp-email:', error);
    return jsonResponse({ error: "An internal error occurred" }, 500);
  }
});
