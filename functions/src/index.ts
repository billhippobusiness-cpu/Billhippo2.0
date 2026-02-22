import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { Resend } from "resend";

initializeApp();

// Stored in Secret Manager via: firebase functions:secrets:set RESEND_API_KEY
const resendApiKey = defineSecret("RESEND_API_KEY");

// Plain env params (set via .env or firebase functions:params:set)
const fromEmail = defineString("RESEND_FROM_EMAIL", {
  default: "invites@billhippo.in",
});
const appUrl = defineString("APP_URL", {
  default: "https://billhippo-42f95.web.app",
});

export const sendInviteEmail = onDocumentCreated(
  { document: "invites/{token}", secrets: [resendApiKey] },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const {
      token,
      businessName,
      professionalEmail,
      professionalFirstName,
      professionalLastName,
      designation,
      accessLevel,
      expiresAt,
    } = data as {
      token: string;
      businessName: string;
      professionalEmail: string;
      professionalFirstName: string;
      professionalLastName: string;
      designation: string;
      accessLevel: string;
      expiresAt: string;
    };

    const inviteLink = `${appUrl.value()}/#/invite/${token}`;
    const expiryDate = new Date(expiresAt).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const resend = new Resend(resendApiKey.value());

    await resend.emails.send({
      from: `BillHippo <${fromEmail.value()}>`,
      to: professionalEmail,
      subject: `${businessName} has invited you to BillHippo`,
      html: buildEmailHtml({
        firstName: professionalFirstName,
        lastName: professionalLastName,
        businessName,
        designation,
        accessLevel,
        inviteLink,
        expiryDate,
      }),
    });
  }
);

function buildEmailHtml(p: {
  firstName: string;
  lastName: string;
  businessName: string;
  designation: string;
  accessLevel: string;
  inviteLink: string;
  expiryDate: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BillHippo Invite</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #0f172a; padding: 32px 40px; text-align: center; }
    .header img { height: 36px; }
    .header h1 { color: #ffffff; font-size: 22px; margin: 12px 0 0; font-weight: 600; letter-spacing: -0.3px; }
    .body { padding: 36px 40px; }
    .greeting { font-size: 16px; color: #1e293b; margin: 0 0 16px; }
    .message { font-size: 15px; color: #475569; line-height: 1.6; margin: 0 0 28px; }
    .details { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px 24px; margin: 0 0 28px; }
    .details p { margin: 0 0 8px; font-size: 14px; color: #64748b; }
    .details p:last-child { margin: 0; }
    .details strong { color: #1e293b; }
    .cta { text-align: center; margin: 0 0 28px; }
    .cta a { display: inline-block; background: #f59e0b; color: #0f172a; font-weight: 700; font-size: 15px; padding: 14px 36px; border-radius: 8px; text-decoration: none; letter-spacing: 0.2px; }
    .expiry { text-align: center; font-size: 13px; color: #94a3b8; margin: 0 0 28px; }
    .footer { background: #f8fafc; padding: 20px 40px; text-align: center; border-top: 1px solid #e2e8f0; }
    .footer p { font-size: 12px; color: #94a3b8; margin: 0; line-height: 1.6; }
    .footer a { color: #64748b; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>BillHippo</h1>
    </div>
    <div class="body">
      <p class="greeting">Hi ${p.firstName},</p>
      <p class="message">
        <strong>${p.businessName}</strong> has invited you to access their
        account on BillHippo as their <strong>${p.designation}</strong>.
      </p>
      <div class="details">
        <p>Business: <strong>${p.businessName}</strong></p>
        <p>Your Role: <strong>${p.designation}</strong></p>
        <p>Access Level: <strong>${p.accessLevel}</strong></p>
        <p>Invite Expires: <strong>${p.expiryDate}</strong></p>
      </div>
      <div class="cta">
        <a href="${p.inviteLink}">Accept Invite &rarr;</a>
      </div>
      <p class="expiry">This invite link expires on ${p.expiryDate}.</p>
    </div>
    <div class="footer">
      <p>
        You received this email because <strong>${p.businessName}</strong> invited you.<br />
        If you were not expecting this, you can safely ignore it.<br />
        &copy; ${new Date().getFullYear()} <a href="https://billhippo.in">BillHippo</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}
