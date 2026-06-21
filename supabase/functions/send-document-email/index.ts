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

async function checkRateLimit(
  supabase: ReturnType<typeof createClient>,
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<boolean> {
  const { data } = await supabase.rpc('check_rate_limit', {
    p_key: key,
    p_max_requests: maxRequests,
    p_window_seconds: windowSeconds,
  });
  return data === true;
}

function rateLimitResponse(headers: Record<string, string>, retryAfter: number) {
  return new Response(
    JSON.stringify({ error: 'Too many requests. Please try again later.' }),
    {
      status: 429,
      headers: { ...headers, 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
    }
  );
}

function makeCorsHeaders(req: Request) {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(req),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  };
}

interface SendEmailRequest {
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  attachmentBase64: string;
  attachmentFilename: string;
  caseId?: string;
  documentType?: string;
}


Deno.serve(async (req: Request) => {
  const corsHeaders = makeCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Rate limit: 5 emails per 60 seconds per user
    const rateLimitKey = `send-email:${user.id}`;
    const allowed = await checkRateLimit(supabaseClient, rateLimitKey, 5, 60);
    if (!allowed) {
      return rateLimitResponse(corsHeaders, 60);
    }

    const body: SendEmailRequest = await req.json();

    if (!body.to || !body.subject || !body.body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, body" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.to)) {
      return new Response(
        JSON.stringify({ error: "Invalid email address" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (body.cc && body.cc.length > 0) {
      for (const email of body.cc) {
        if (!emailRegex.test(email)) {
          return new Response(
            JSON.stringify({ error: `Invalid CC email address: ${email}` }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }
    }

    if (body.bcc && body.bcc.length > 0) {
      for (const email of body.bcc) {
        if (!emailRegex.test(email)) {
          return new Response(
            JSON.stringify({ error: `Invalid BCC email address: ${email}` }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }
    }

    const { data: userProfile } = await supabaseClient
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .maybeSingle();

    const { data: companySettings } = await supabaseClient
      .from("company_settings")
      .select("basic_info, contact_info")
      .eq("tenant_id", userProfile?.tenant_id)
      .maybeSingle();

    const fromEmail = companySettings?.contact_info?.email_general || "noreply@example.com";
    const companyName = companySettings?.basic_info?.company_name || "Document Service";

    const gmailUser = Deno.env.get("GMAIL_USER");
    const gmailAppPassword = Deno.env.get("GMAIL_APP_PASSWORD");

    if (!gmailUser || !gmailAppPassword) {
      return new Response(
        JSON.stringify({
          error: "Email service not configured. Please set GMAIL_USER and GMAIL_APP_PASSWORD environment variables."
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const smtpClient = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 587,
        tls: true,
        auth: {
          username: gmailUser,
          password: gmailAppPassword,
        },
      },
    });

    try {
      const plainTextBody = body.body.replace(/<[^>]*>/g, '');

      const emailMessage: {
        from: string;
        to: string;
        cc?: string;
        bcc?: string;
        subject: string;
        content: string;
        html: string;
        attachments?: Array<{
          filename: string;
          content: string;
          encoding: string;
        }>;
      } = {
        from: `${companyName} <${gmailUser}>`,
        to: body.to,
        subject: body.subject,
        content: plainTextBody,
        html: body.body,
      };

      if (body.cc && body.cc.length > 0) {
        emailMessage.cc = body.cc.join(", ");
      }

      if (body.bcc && body.bcc.length > 0) {
        emailMessage.bcc = body.bcc.join(", ");
      }

      if (body.attachmentBase64 && body.attachmentFilename) {
        emailMessage.attachments = [
          {
            filename: body.attachmentFilename,
            content: body.attachmentBase64,
            encoding: "base64",
          },
        ];
      }

      await smtpClient.send(emailMessage);
      await smtpClient.close();
      console.log("Email sent successfully via Gmail SMTP");
    } catch (smtpError) {
      console.error("Gmail SMTP error:", smtpError);
      try {
        await smtpClient.close();
      } catch (e) {
        console.error("Error closing SMTP client:", e);
      }
      return new Response(
        JSON.stringify({
          error: `Failed to send email: ${smtpError.message || "SMTP connection error"}`
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const messageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    if (body.caseId) {
      try {
        const recipients = [body.to];
        if (body.cc && body.cc.length > 0) {
          recipients.push(...body.cc.map(email => `CC: ${email}`));
        }
        if (body.bcc && body.bcc.length > 0) {
          recipients.push(...body.bcc.map(email => `BCC: ${email}`));
        }

        await supabaseClient.rpc("log_case_communication", {
          p_case_id: body.caseId,
          p_type: "email",
          p_subject: body.subject,
          p_content: body.body,
          p_sent_to: recipients.join(", "),
          // Service-role context has no auth.uid(); attribute the send to the
          // authenticated user we validated above.
          p_sent_by: user.id,
        });
      } catch (logError) {
        console.error("Failed to log communication:", logError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        messageId: messageId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in send-document-email function:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred. Please try again later." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});