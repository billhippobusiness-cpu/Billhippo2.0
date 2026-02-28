import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Resend } from "resend";

initializeApp();

// Stored in Secret Manager via: firebase functions:secrets:set RESEND_API_KEY
const resendApiKey = defineSecret("RESEND_API_KEY");

// Plain env params (set via firebase functions:params:set)
const fromEmail = defineString("RESEND_FROM_EMAIL", {
  default: "noreply@billhippo.in",
});
const appUrl = defineString("APP_URL", {
  default: "https://billhippo-42f95.web.app",
});

const LOGO_URL =
  "https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Image%20assets%2FBillhippo%20logo.png?alt=media&token=539dea5b-d69a-4e72-be63-e042f09c267c";

// ═══════════════════════════════════════════
//  CLOUD FUNCTIONS
// ═══════════════════════════════════════════

/**
 * Triggered when a professional invite document is created.
 * Sends a styled invitation email to the professional.
 */
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
      html: buildInviteEmail({
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

/**
 * Triggered when a business profile document is first created (on signup/onboarding).
 * Sends a welcome email to the new business owner.
 */
export const sendBusinessWelcomeEmail = onDocumentCreated(
  { document: "users/{userId}/profile/main", secrets: [resendApiKey] },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const businessName = data.name as string | undefined;
    const email = data.email as string | undefined;
    if (!businessName || !email) return;

    const dashboardUrl = `${appUrl.value()}/#/dashboard`;
    const resend = new Resend(resendApiKey.value());
    await resend.emails.send({
      from: `BillHippo <${fromEmail.value()}>`,
      to: email,
      subject: `Welcome to BillHippo, ${businessName}!`,
      html: buildBusinessWelcomeEmail({ businessName, dashboardUrl }),
    });
  }
);

/**
 * Triggered when a professional profile document is first created (on pro registration).
 * Sends a welcome email to the new professional user.
 */
export const sendProfessionalWelcomeEmail = onDocumentCreated(
  { document: "users/{userId}/professional/main", secrets: [resendApiKey] },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const firstName = data.firstName as string | undefined;
    const lastName = data.lastName as string | undefined;
    const email = data.email as string | undefined;
    const professionalId = data.professionalId as string | undefined;
    const designation = data.designation as string | undefined;
    if (!firstName || !email || !professionalId) return;

    const portalUrl = `${appUrl.value()}/#/pro/dashboard`;
    const resend = new Resend(resendApiKey.value());
    await resend.emails.send({
      from: `BillHippo <${fromEmail.value()}>`,
      to: email,
      subject: "Welcome to BillHippo Professional Portal!",
      html: buildProfessionalWelcomeEmail({
        firstName,
        lastName: lastName ?? "",
        professionalId,
        designation: designation ?? "Professional",
        portalUrl,
      }),
    });
  }
);

/**
 * Triggered when a new invoice document is created.
 * Looks up the customer's email and sends them a copy of the invoice.
 * Silently skips if the customer has no email on record.
 */
export const sendInvoiceEmail = onDocumentCreated(
  { document: "users/{userId}/invoices/{invoiceId}", secrets: [resendApiKey] },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const userId = event.params.userId;
    const customerId = data.customerId as string | undefined;
    const customerName = data.customerName as string | undefined;
    const invoiceNumber = data.invoiceNumber as string | undefined;
    const date = data.date as string | undefined;
    const totalAmount = data.totalAmount as number | undefined;
    const status = data.status as string | undefined;
    const items = (data.items ?? []) as Array<{
      description: string;
      quantity: number;
      rate: number;
      gstRate: number;
    }>;

    if (!customerId || !invoiceNumber || !totalAmount) return;

    const db = getFirestore();

    // Fetch customer email
    const customerSnap = await db
      .collection("users")
      .doc(userId)
      .collection("customers")
      .doc(customerId)
      .get();

    const customerEmail = customerSnap.data()?.email as string | undefined;
    if (!customerEmail) return; // No email on file — skip

    // Fetch business profile for sender details
    const profileSnap = await db
      .collection("users")
      .doc(userId)
      .collection("profile")
      .doc("main")
      .get();

    const profile = profileSnap.data();
    const businessName = (profile?.name as string | undefined) ?? "Your Business";
    const businessPhone = (profile?.phone as string | undefined) ?? "";

    const formattedDate = date
      ? new Date(date).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : date ?? "";

    const resend = new Resend(resendApiKey.value());
    await resend.emails.send({
      from: `${businessName} via BillHippo <${fromEmail.value()}>`,
      to: customerEmail,
      subject: `Invoice #${invoiceNumber} from ${businessName}`,
      html: buildInvoiceEmail({
        customerName: customerName ?? customerEmail,
        businessName,
        businessPhone,
        invoiceNumber,
        date: formattedDate,
        totalAmount,
        status: status ?? "Unpaid",
        items: items.slice(0, 6),
      }),
    });
  }
);

// ═══════════════════════════════════════════
//  SHARED LAYOUT HELPERS
// ═══════════════════════════════════════════

/**
 * Wraps email body content in the BillHippo branded layout:
 * dark navy header with logo, indigo accent bar, white content area, light footer.
 */
function emailBase(title: string, preheader: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-font-smoothing:antialiased;">
  <!--[if !gte mso 9]><!-->
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f1f5f9;">${preheader}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
  <!--<![endif]-->

  <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

          <!-- ── HEADER ── -->
          <tr>
            <td align="center" bgcolor="#0f172a" style="background-color:#0f172a;border-radius:16px 16px 0 0;padding:28px 40px;">
              <img src="${LOGO_URL}" alt="BillHippo" height="44" style="display:block;border:0;outline:none;height:44px;max-height:44px;" />
            </td>
          </tr>

          <!-- ── ACCENT BAR ── -->
          <tr>
            <td bgcolor="#6366f1" style="background-color:#6366f1;height:4px;line-height:4px;font-size:4px;">&nbsp;</td>
          </tr>

          <!-- ── BODY ── -->
          <tr>
            <td bgcolor="#ffffff" style="background-color:#ffffff;padding:40px 48px 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
              ${body}
            </td>
          </tr>

          <!-- ── FOOTER ── -->
          <tr>
            <td bgcolor="#f8fafc" style="background-color:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 16px 16px;padding:24px 48px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
              <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;line-height:1.6;">
                &copy; ${new Date().getFullYear()} BillHippo &mdash; GST Billing &amp; Invoicing for India
              </p>
              <p style="margin:0;font-size:11px;line-height:1.6;">
                <a href="https://billhippo.in" style="color:#6366f1;text-decoration:none;font-weight:600;">billhippo.in</a>
                &nbsp;&bull;&nbsp;
                <a href="https://billhippo.in/privacy" style="color:#94a3b8;text-decoration:none;">Privacy Policy</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Renders a prominent CTA button (indigo background, white text). */
function ctaButton(href: string, label: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 24px;">
  <tr>
    <td align="center">
      <a href="${href}"
         style="display:inline-block;background-color:#6366f1;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;font-weight:700;padding:15px 44px;border-radius:10px;text-decoration:none;letter-spacing:0.4px;">
        ${label} &rarr;
      </a>
    </td>
  </tr>
</table>`;
}

/** Renders a bordered detail card with label/value rows. */
function detailCard(rows: Array<[string, string]>): string {
  const rowsHtml = rows
    .map(
      ([label, value]) => `
    <tr>
      <td style="padding:10px 20px 10px 20px;font-size:13px;color:#64748b;width:42%;vertical-align:top;white-space:nowrap;">${label}</td>
      <td style="padding:10px 20px 10px 8px;font-size:13px;color:#1e293b;font-weight:600;vertical-align:top;">${value}</td>
    </tr>
    <tr><td colspan="2" style="padding:0;height:1px;background-color:#f1f5f9;font-size:1px;line-height:1px;">&nbsp;</td></tr>`
    )
    .join("");

  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin:0 0 28px;overflow:hidden;">
  ${rowsHtml}
</table>`;
}

/** Feature highlight card with left accent border. */
function featureCard(title: string, description: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;background-color:#f8fafc;border-left:3px solid #6366f1;border-radius:0 8px 8px 0;">
  <tr>
    <td style="padding:13px 16px;">
      <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#1e293b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${title}</p>
      <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${description}</p>
    </td>
  </tr>
</table>`;
}

/** Formats a number as Indian Rupees (e.g. ₹1,23,456.78). */
function formatCurrency(amount: number): string {
  return `&#8377;${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ═══════════════════════════════════════════
//  EMAIL TEMPLATES
// ═══════════════════════════════════════════

function buildInviteEmail(p: {
  firstName: string;
  lastName: string;
  businessName: string;
  designation: string;
  accessLevel: string;
  inviteLink: string;
  expiryDate: string;
}): string {
  const body = `
    <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#6366f1;letter-spacing:1px;text-transform:uppercase;">Professional Invitation</p>
    <h2 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#0f172a;line-height:1.3;">You have been invited!</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.7;">
      Hi <strong style="color:#1e293b;">${p.firstName}</strong>,<br /><br />
      <strong style="color:#1e293b;">${p.businessName}</strong> has invited you to access their account on
      <strong style="color:#6366f1;">BillHippo</strong> as their <strong style="color:#1e293b;">${p.designation}</strong>.
      Review the details below and accept the invitation to get started.
    </p>

    ${detailCard([
      ["Business", p.businessName],
      ["Your Role", p.designation],
      ["Access Level", p.accessLevel],
      ["Invite Expires", p.expiryDate],
    ])}

    ${ctaButton(p.inviteLink, "Accept Invitation")}

    <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.7;">
      This invitation expires on <strong style="color:#64748b;">${p.expiryDate}</strong>.<br />
      If you were not expecting this email, you can safely ignore it.
    </p>`;

  return emailBase(
    "BillHippo — Professional Invitation",
    `${p.businessName} has invited you as ${p.designation} on BillHippo`,
    body
  );
}

function buildBusinessWelcomeEmail(p: {
  businessName: string;
  dashboardUrl: string;
}): string {
  const body = `
    <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#6366f1;letter-spacing:1px;text-transform:uppercase;">Welcome aboard</p>
    <h2 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#0f172a;line-height:1.3;">Your account is ready!</h2>
    <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.7;">
      Hi <strong style="color:#1e293b;">${p.businessName}</strong>,<br /><br />
      Welcome to <strong style="color:#6366f1;">BillHippo</strong> &mdash; India's smartest GST billing platform.
      Your account is set up and everything is ready to go. Here's what you can do:
    </p>

    ${featureCard("GST Invoicing", "Create professional, GST-compliant invoices in seconds and share them with your customers.")}
    ${featureCard("GST Reports", "Auto-generate GSTR-1, GSTR-3B and other statutory reports with a single click.")}
    ${featureCard("Ledger & Payments", "Track customer balances, record payments, and manage your receivables with ease.")}
    ${featureCard("Professional Access", "Collaborate with your CA, accountant, or tax consultant securely.")}

    ${ctaButton(p.dashboardUrl, "Go to Dashboard")}

    <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.7;">
      Have questions? Reply to this email or visit our
      <a href="https://billhippo.in/help" style="color:#6366f1;text-decoration:none;">Help Center</a>.
    </p>`;

  return emailBase(
    "Welcome to BillHippo!",
    `Your BillHippo account for ${p.businessName} is ready — start creating GST invoices today`,
    body
  );
}

function buildProfessionalWelcomeEmail(p: {
  firstName: string;
  lastName: string;
  professionalId: string;
  designation: string;
  portalUrl: string;
}): string {
  const body = `
    <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#6366f1;letter-spacing:1px;text-transform:uppercase;">Professional Portal</p>
    <h2 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#0f172a;line-height:1.3;">Welcome to BillHippo Pro!</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.7;">
      Hi <strong style="color:#1e293b;">${p.firstName}</strong>,<br /><br />
      Your professional account on <strong style="color:#6366f1;">BillHippo</strong> has been created successfully.
      You can now receive client invitations and manage their GST data from a unified dashboard.
    </p>

    ${detailCard([
      ["Name", `${p.firstName} ${p.lastName}`],
      ["Professional ID", p.professionalId],
      ["Designation", p.designation],
    ])}

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;background-color:#fef9ee;border:1px solid #fde68a;border-radius:10px;">
      <tr>
        <td style="padding:14px 20px;">
          <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#92400e;">Your Professional ID</p>
          <p style="margin:0;font-size:13px;color:#78350f;line-height:1.6;">
            <strong style="font-size:18px;color:#1e293b;letter-spacing:1px;">${p.professionalId}</strong><br />
            Share this ID with your clients so they can quickly find and invite you on BillHippo.
          </p>
        </td>
      </tr>
    </table>

    ${featureCard("Client Dashboard", "View all your linked clients' GST data from one place.")}
    ${featureCard("Bulk Downloads", "Download GSTR reports and ledgers for multiple clients at once.")}
    ${featureCard("Filing Tracker", "Stay on top of GST filing deadlines for all your clients.")}

    ${ctaButton(p.portalUrl, "Open Professional Portal")}

    <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.7;">
      Have questions? Reply to this email or visit our
      <a href="https://billhippo.in/help" style="color:#6366f1;text-decoration:none;">Help Center</a>.
    </p>`;

  return emailBase(
    "Welcome to BillHippo Professional Portal!",
    `Your BillHippo Professional account is ready — Professional ID: ${p.professionalId}`,
    body
  );
}

function buildInvoiceEmail(p: {
  customerName: string;
  businessName: string;
  businessPhone: string;
  invoiceNumber: string;
  date: string;
  totalAmount: number;
  status: string;
  items: Array<{
    description: string;
    quantity: number;
    rate: number;
    gstRate: number;
  }>;
}): string {
  const statusColor =
    p.status === "Paid" ? "#16a34a" : p.status === "Partial" ? "#d97706" : "#dc2626";
  const statusBg =
    p.status === "Paid" ? "#dcfce7" : p.status === "Partial" ? "#fef3c7" : "#fee2e2";

  const itemRows = p.items
    .map(
      (item) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${item.description}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#475569;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${item.quantity}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;font-weight:600;text-align:right;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${formatCurrency(item.quantity * item.rate)}</td>
    </tr>`
    )
    .join("");

  const phoneNote = p.businessPhone
    ? `at <a href="tel:${p.businessPhone}" style="color:#6366f1;text-decoration:none;">${p.businessPhone}</a>`
    : "";

  const body = `
    <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#6366f1;letter-spacing:1px;text-transform:uppercase;">Invoice from ${p.businessName}</p>
    <h2 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#0f172a;line-height:1.3;">Invoice #${p.invoiceNumber}</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.7;">
      Hi <strong style="color:#1e293b;">${p.customerName}</strong>,<br /><br />
      Please find your invoice details below from <strong style="color:#1e293b;">${p.businessName}</strong>.
    </p>

    ${detailCard([
      ["Invoice No.", `#${p.invoiceNumber}`],
      ["Date", p.date],
      ["Billed by", p.businessName],
      ...(p.businessPhone ? ([["Contact", p.businessPhone]] as Array<[string, string]>) : []),
    ])}

    <!-- Line items table -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px;">
      <tr>
        <th style="padding:8px 0 10px;font-size:11px;font-weight:700;color:#94a3b8;text-align:left;border-bottom:2px solid #e2e8f0;text-transform:uppercase;letter-spacing:0.8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Item / Description</th>
        <th style="padding:8px 8px 10px;font-size:11px;font-weight:700;color:#94a3b8;text-align:center;border-bottom:2px solid #e2e8f0;text-transform:uppercase;letter-spacing:0.8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Qty</th>
        <th style="padding:8px 0 10px;font-size:11px;font-weight:700;color:#94a3b8;text-align:right;border-bottom:2px solid #e2e8f0;text-transform:uppercase;letter-spacing:0.8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Amount</th>
      </tr>
      ${itemRows}
    </table>

    <!-- Total block -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 28px;">
      <tr>
        <td bgcolor="#0f172a" style="background-color:#0f172a;border-radius:10px;padding:16px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-size:14px;font-weight:600;color:#94a3b8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Total Amount (incl. GST)</td>
              <td style="font-size:22px;font-weight:800;color:#ffffff;text-align:right;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${formatCurrency(p.totalAmount)}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding-top:10px;">
                <span style="display:inline-block;padding:4px 14px;background-color:${statusBg};color:${statusColor};font-size:12px;font-weight:700;border-radius:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${p.status}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.7;">
      For any questions about this invoice, please contact
      <strong style="color:#1e293b;">${p.businessName}</strong>${phoneNote ? " " + phoneNote : ""}.<br />
      This invoice was generated via <a href="https://billhippo.in" style="color:#6366f1;text-decoration:none;">BillHippo</a>.
    </p>`;

  return emailBase(
    `Invoice #${p.invoiceNumber} from ${p.businessName}`,
    `Invoice #${p.invoiceNumber} — Total: ${formatCurrency(p.totalAmount)} — Status: ${p.status}`,
    body
  );
}
