const MAILEROO_API_URL =
  process.env.MAILEROO_API_URL ?? "https://smtp.maileroo.com/api/v2/emails";
const API_KEY = process.env.MAILEROO_API_KEY ?? "";
const FROM_ADDRESS = process.env.MAILEROO_FROM ?? "noreply@yourdomain.com";
const FROM_NAME = process.env.MAILEROO_FROM_NAME ?? "TradeGPT";
const TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

export async function sendVerificationEmail(
  to: string,
  code: string,
): Promise<void> {
  const subject = "Your TradeGPT verification code";
  const html = `
    <!doctype html>
<html lang="und" dir="auto" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
    <title>
    </title>
    <!--[if !mso]>
    <!-->
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <!--<![endif]-->
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style type="text/css">
      #outlook a { padding:0; } body { margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%; } table, td { border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt; } img { border:0;height:auto;line-height:100%; outline:none;text-decoration:none;-ms-interpolation-mode:bicubic; } p { display:block;margin:13px 0; } 
    </style>
    <!--[if mso]>
    <noscript>
      <xml>
        <o:OfficeDocumentSettings>
          <o:AllowPNG/>
          <o:PixelsPerInch>
            96
          </o:PixelsPerInch>
        </o:OfficeDocumentSettings>
      </xml>
    </noscript>
    <![endif]-->
    <!--[if lte mso 11]>
    <style type="text/css">
      .mj-outlook-group-fix { width:100% !important; } 
    </style>
    <![endif]-->
    <style type="text/css">
      @media only screen and (min-width:480px) { .mj-column-per-100 { width:100% !important; max-width: 100%; } } 
    </style>
    <style media="screen and (min-width:480px)">
      .moz-text-html .mj-column-per-100 { width:100% !important; max-width: 100%; } 
    </style>
    <style type="text/css">
      @media only screen and (max-width:479px) { table.mj-full-width-mobile { width: 100% !important; } td.mj-full-width-mobile { width: auto !important; } } 
    </style>
    <style type="text/css">
      ::-webkit-scrollbar { width: 6px; height: 6px; /* background: transparent; */ background: rgba(233, 228, 226, 0.1); } ::-webkit-scrollbar-thumb { background: #E9E4E2; border-radius: 15px; } .body { background-size: auto; background-repeat: no-repeat; background-position: left; width: 640px; margin: 0px auto; } .section { width: 100%; max-width: 640px !important; } .body>
      div { } .body a { color: inherit; text-decoration: none; } .body a:hover { } .body * { box-sizing: border-box; } .img-a5a2ny1v452ysd2 img { object-position: center; } .img-a5a2ny1v452ysd2 table { } .name-a5a2ny1v452ysd2 { } 
    </style>
  </head>
  <body style="word-spacing:normal;">
    <div class="body" style="" lang="und" dir="auto">
      <!--[if mso | IE]>
      <table align="center" border="0" cellpadding="0" cellspacing="0" class="section-outlook" role="presentation" style="width:600px;" width="600" bgcolor="#00897B">
        <tr>
          <td style="line-height:0px;font-size:0px;mso-line-height-rule:exactly;">
      <![endif]-->
      <div class="section" style="background:#00897B;background-color:#00897B;margin:0px auto;max-width:600px;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:#00897B;background-color:#00897B;width:100%;">
          <tbody>
            <tr>
              <td style="border:1px transparent;direction:ltr;font-size:0px;padding:10px 10px 10px 10px;text-align:center;">
                <!--[if mso | IE]>
                <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                  <tr>
                    <td class="" style="vertical-align:top;width:578px;">
                <![endif]-->
                <div class="mj-column-per-100 mj-outlook-group-fix" style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;">
                  <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;" width="100%">
                    <tbody>
                      <tr>
                        <td align="left" class="img-a5a2ny1v452ysd2" style="font-size:0px;padding:0px 15px 0px 15px;word-break:break-word;">
                          <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;border-spacing:0px;">
                            <tbody>
                              <tr>
                                <td style="width:64px;">
                                  <img alt="" src="https://i.ibb.co/ch6RDk2T/White-Logo.png" style="border:0;border-radius:0px;display:block;outline:none;text-decoration:none;height:64px;width:100%;font-size:13px;" width="64" height="64" />
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="font-size:0px;padding:0px;word-break:break-word;">
                          <div style="font-family:serif;font-size:36px;font-weight:800;line-height:1.5;text-align:center;color:#000000;">
                            <div style="padding: 0px 25px 0px 25px; ">
                              <span style="color: rgb(255, 255, 255);">
                                Welcome to TradeGPT CryptDocker
                              </span>
                              <br />
                            </div>
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td align="left" style="font-size:0px;padding:0px;word-break:break-word;">
                          <div style="font-family:sans-serif;font-size:14px;line-height:1.5;text-align:left;color:#000000;">
                            <div style="padding: 10px 15px 10px 15px; ">
                              <br />
                              <br />
                              <span style="color: rgb(255, 255, 255);">
                                Welcome to TradeGPT CryptDocker!
                              </span>
                              <br />
                              <br />
                              <span style="color: rgb(255, 255, 255);">
                                Please use this code to verify your account:
                              </span>
                              <br />
                            </div>
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="font-size:0px;padding:0px;word-break:break-word;">
                          <div style="font-family:sans-serif;font-size:24px;line-height:1.5;text-align:center;color:#000000;">
                            <div style="padding: 10px 25px 10px 25px; ">
                              <span style="font-weight: bold; color: rgb(255, 255, 255);">
                                ${code}
                              </span>
                              <br />
                            </div>
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td align="left" style="font-size:0px;padding:0px;word-break:break-word;">
                          <div style="font-family:sans-serif;font-size:14px;line-height:1.5;text-align:left;color:#000000;">
                            <div style="padding: 10px 25px 10px 15px; ">
                              <span style="color: rgb(255, 255, 255);">
                                Best Regards,
                              </span>
                              <br />
                              <span style="color: rgb(255, 255, 255);">
                                CryptDocker Teams!
                              </span>
                              <br />
                            </div>
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="font-size:0px;padding:10px 0px 10px 0px;word-break:break-word;">
                          <p style="border-top:solid 2px #ffffff;font-size:1px;margin:0px auto;width:100%;">
                          </p>
                          <!--[if mso | IE]>
                          <table align="center" border="0" cellpadding="0" cellspacing="0" style="border-top:solid 2px #ffffff;font-size:1px;margin:0px auto;width:578px;" role="presentation" width="578px">
                            <tr>
                              <td style="height:0;line-height:0;">
                                &nbsp; 
                              </td>
                            </tr>
                          </table>
                          <![endif]-->
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="font-size:0px;padding:0px;word-break:break-word;">
                          <div style="font-family:sans-serif;font-size:12px;line-height:1;text-align:center;color:#000000;">
                            <div style="padding: 10px 0px 10px 0px; ">
                              <span style="color: rgb(255, 255, 255);">
                                This is auto-generated message. Please don't reply here
                              </span>
                              <br />
                            </div>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <!--[if mso | IE]>
              </td>
            </tr>
          </table>
                <![endif]-->
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <!--[if mso | IE]>
    </td>
  </tr>
</table>
      <![endif]-->
    </div>
  </body>
</html>
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
        (lastError.cause instanceof Error &&
          lastError.cause.message.includes("Timeout"));

      if (isTimeout && attempt < MAX_RETRIES) {
        console.warn(
          `Maileroo request timed out (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying…`,
        );
        await delay(1000 * (attempt + 1));
        continue;
      }

      if (isTimeout) {
        console.error(
          `Cannot reach ${MAILEROO_API_URL} — your network may be blocking outbound connections to this host. ` +
            `Verify that your firewall/VPN allows HTTPS to smtp.maileroo.com:443.`,
        );
        throw new Error(
          "Cannot reach the email service. Check your network or firewall settings.",
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
        if (typeof json.message === "string" && json.message)
          message = json.message;
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
