const MAILEROO_API_URL =
  process.env.MAILEROO_API_URL ?? "https://smtp.maileroo.com/api/v2/emails";
const API_KEY = process.env.MAILEROO_API_KEY ?? "";
const FROM_ADDRESS = process.env.MAILEROO_FROM ?? "noreply@yourdomain.com";
const FROM_NAME = process.env.MAILEROO_FROM_NAME ?? "TradeGPT";
const TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

export async function sendVerificationEmail(
  to: string,
  code: string
): Promise<void> {
  const subject = "Your TradeGPT verification code";
  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1e293b">
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0d9488">TradeGPT</h1>
      <h2 style="margin:0 0 16px;font-size:18px;font-weight:600">Verify your email</h2>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#475569">
        Enter the code below in the app to complete your registration:
      </p>
      <div style="background:#f0fdfa;border:1px solid #ccfbf1;border-radius:12px;padding:20px;text-align:center;margin:0 0 24px">
        <span style="font-size:32px;font-weight:700;letter-spacing:0.3em;color:#0f766e">${code}</span>
      </div>
      <p style="margin:0;font-size:13px;color:#94a3b8">
        This code expires in 10 minutes. If you didn&rsquo;t request this, you can safely ignore this email.
      </p>
    </div>
  `.trim();
  const plain = `Your TradeGPT verification code is: ${code}. This code expires in 10 minutes.`;

  await sendEmail({ to, subject, html, plain });
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  plain: string;
}

async function sendEmail(params: SendEmailParams): Promise<void> {
  if (!API_KEY) {
    console.error("MAILEROO_API_KEY is not set; skipping email send");
    throw new Error("Email service is not configured");
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await attemptSend(params);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isTimeout =
        lastError.message.includes("fetch failed") ||
        lastError.message.includes("timeout") ||
        lastError.cause instanceof Error && lastError.cause.message.includes("Timeout");

      if (isTimeout && attempt < MAX_RETRIES) {
        console.warn(
          `Maileroo request timed out (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying…`
        );
        await delay(1000 * (attempt + 1));
        continue;
      }

      if (isTimeout) {
        console.error(
          `Cannot reach ${MAILEROO_API_URL} — your network may be blocking outbound connections to this host. ` +
          `Verify that your firewall/VPN allows HTTPS to smtp.maileroo.com:443.`
        );
        throw new Error(
          "Cannot reach the email service. Check your network or firewall settings."
        );
      }
      throw lastError;
    }
  }
}

async function attemptSend({
  to,
  subject,
  html,
  plain,
}: SendEmailParams): Promise<void> {
  const body = {
    from: { address: FROM_ADDRESS, display_name: FROM_NAME },
    to: [{ address: to, display_name: to }],
    subject,
    html,
    plain,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(MAILEROO_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Maileroo API error:", res.status, text);
      let message = "Failed to send verification email";
      try {
        const json = JSON.parse(text) as { message?: string };
        if (typeof json.message === "string" && json.message) message = json.message;
      } catch {
        // use default message
      }
      throw new Error(message);
    }
  } finally {
    clearTimeout(timer);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
