/* ──────────────────────────────────────────────────────────────────────
   Branded email templates.

   Four distinct HTML treatments share one masthead/footer shell:

     • proposal        — cover-sheet style: project name as display
                          type, 3-stat strip (Investment · Timeline ·
                          Valid Until), Prepared-For / Prepared-By
                          line, scope summary list. Reads like the
                          opening page of the proposal PDF.

     • invoice         — statement-style: invoice number, oversized
                          AMOUNT DUE figure, Due-By / Issued-On /
                          Project meta strip, line-item summary,
                          "Pay now" CTA wording.

     • onboarding      — welcome card: warm intro, 3-cell feature
                          grid (Projects · Proposals · Invoices), and
                          one prominent "Open your portal" CTA.

     • project-complete— delivery card: DELIVERED pill, project name,
                          duration / lead / completed-on stats, thank
                          you + what's-next checklist, portal CTA.

   The shell (HTML head, masthead with logo, footer with brand strip,
   responsive media queries) is identical across kinds — every email
   carries the same brand signature even though the bodies differ.

   No emoji. No icon fonts. The visual identity comes from typography
   (Inter/system stack), tight tracking, hairline + heavy black rules,
   and a single brand colour (pure black).
   ────────────────────────────────────────────────────────────────────── */

import { env } from "../../config/env";

// Bundled Nuro 7 wordmark variants served from the web app's public/ dir.
// Both files are already shipped (used by /login, /portal, print layouts).
// Naming is unfortunately legacy: /logo-white.png is the BLACK wordmark
// (dark ink on transparent), /logo-white-inverted.png is the WHITE one.
const BUNDLED_LOGO_LIGHT_PATH = "/logo-white.png";          // black ink — light mode
const BUNDLED_LOGO_DARK_PATH = "/logo-white-inverted.png";  // white ink — dark mode

// ── Public template payloads ─────────────────────────────────────────────

export interface BrandInfo {
  name: string;
  logoUrl: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  addressLine1: string | null;
  city: string | null;
  country: string | null;
}

export interface ProposalEmailData {
  recipientName?: string | null;
  clientName: string;
  projectName: string;
  proposalNumber?: string | null;
  /** ISO date string when the proposal was prepared. */
  preparedOn?: string | null;
  /** Display-formatted "valid until" date — e.g. "30 June 2026". */
  validUntil?: string | null;
  /** Already-formatted currency string — e.g. "₹4,50,000". */
  investment?: string | null;
  /** Free-form timeline label — e.g. "12 weeks". */
  timeline?: string | null;
  /** Short executive blurb (the proposal's description / lede). */
  summary?: string | null;
  /** Optional scope items shown as a bulleted "WHAT'S INCLUDED" list. */
  inclusions?: string[];
  preparedBy?: string | null;
  /** URL of the proposal in the client portal. */
  portalUrl: string;
  /** "sent" vs "resent" controls the eyebrow + intro wording. */
  variant: "sent" | "resent";
}

export interface InvoiceEmailData {
  recipientName?: string | null;
  clientName: string;
  invoiceNumber: string;
  /** Already-formatted total — e.g. "₹4,50,000". */
  amountFormatted: string;
  /** Already-formatted due date — e.g. "30 June 2026". */
  dueDate: string;
  /** Already-formatted issue date. */
  issuedOn?: string | null;
  projectName?: string | null;
  /** Optional PO / client reference number. */
  referenceNumber?: string | null;
  /** Optional one-line bank/payment instruction summary. */
  paymentInstructions?: string | null;
  portalUrl: string;
}

export interface OnboardingEmailData {
  recipientName?: string | null;
  clientName: string;
  portalSignInUrl: string;
  /** Minutes until the magic link expires. */
  linkTtlMinutes: number;
}

export interface ProjectCompleteEmailData {
  recipientName?: string | null;
  clientName: string;
  projectName: string;
  /** Already-formatted completion date. */
  completedOn: string;
  /** Optional duration label — e.g. "12 weeks". */
  duration?: string | null;
  /** Project manager display name. */
  projectLead?: string | null;
  /** Project manager email — appended next to the lead name when present. */
  projectLeadEmail?: string | null;
  portalUrl: string;
}

// ── Subject builders (shared by service.dispatch() and renderShell <title>) ─

export function buildProposalSubject(data: ProposalEmailData): string {
  return data.variant === "resent"
    ? `Updated proposal — ${data.projectName}`
    : `Your proposal — ${data.projectName}`;
}

export function buildInvoiceSubject(data: InvoiceEmailData): string {
  // Project name is folded in when available so recipients can triage
  // multi-project relationships from the inbox without opening the mail.
  // Falls back cleanly when no project is associated.
  const project = data.projectName ? ` · ${data.projectName}` : "";
  return `Invoice ${data.invoiceNumber}${project} — ${data.amountFormatted} due ${data.dueDate}`;
}

export function buildOnboardingSubject(brand: BrandInfo): string {
  return `Welcome to your ${brand.name} portal`;
}

export function buildProjectCompleteSubject(data: ProjectCompleteEmailData): string {
  return `Project delivered — ${data.projectName}`;
}

// ── Public renderers ─────────────────────────────────────────────────────

export function renderProposalHtml(data: ProposalEmailData, brand: BrandInfo): string {
  const subject = buildProposalSubject(data);
  const eyebrow = data.variant === "resent" ? "Proposal · Updated" : "Proposal";
  const intro =
    data.variant === "resent"
      ? `We've revised the proposal for <strong>${escape(data.projectName)}</strong> based on your feedback. The headline numbers and timeline are summarised below; the full revised document is one tap away.`
      : `Thank you for the opportunity to scope <strong>${escape(data.projectName)}</strong>. The headline numbers, timeline and key inclusions are summarised below — the full document, with scope, deliverables and terms, lives in your portal.`;

  const stats = [
    data.investment && { label: "Investment", value: data.investment },
    data.timeline && { label: "Timeline", value: data.timeline },
    data.validUntil && { label: "Valid until", value: data.validUntil },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const body = `
    ${renderEyebrow(eyebrow)}
    ${renderDisplayHeadline(data.projectName)}
    ${data.proposalNumber ? renderRefLine(`Ref. ${data.proposalNumber}`, data.preparedOn ?? null) : ""}
    ${renderHairline()}
    ${renderGreeting(data.recipientName ?? data.clientName)}
    <p style="margin:0 0 26px;font-size:15px;line-height:1.6;color:${ZINC_700};">${intro}</p>
    ${stats.length ? renderStatsStrip(stats) : ""}
    ${renderPreparedLine(data.clientName, data.preparedBy ?? brand.name)}
    ${data.summary ? renderQuoteBlock(data.summary) : ""}
    ${data.inclusions && data.inclusions.length ? renderInclusionList(data.inclusions) : ""}
    ${renderCta("View proposal", data.portalUrl)}
    ${renderFooterNote(
      data.validUntil
        ? `This proposal is valid until ${escape(data.validUntil)}. Reply directly to this email if you need anything clarified before accepting.`
        : `Reply directly to this email if you need anything clarified before accepting.`,
    )}
  `;

  return renderShell({
    subject,
    preheader: stripTags(intro),
    documentTitle: data.proposalNumber ? `Proposal · ${data.proposalNumber}` : "Proposal",
    bodyHtml: body,
    brand,
  });
}

export function renderInvoiceHtml(data: InvoiceEmailData, brand: BrandInfo): string {
  const subject = buildInvoiceSubject(data);
  // Eyebrow folds in the project when present so the invoice is immediately
  // contextual — recipients dealing with several active projects can see
  // which one this charge belongs to before reading any further.
  const eyebrow = data.projectName ? `Invoice · ${data.projectName}` : "Invoice";
  // Issued / due are surfaced in the ref line under the headline, so
  // the meta grid below the amount hero only carries the supplementary
  // project + reference fields to avoid showing the same dates twice.
  const meta: Array<{ label: string; value: string }> = [];
  if (data.projectName) meta.push({ label: "Project", value: data.projectName });
  if (data.referenceNumber) meta.push({ label: "Reference", value: data.referenceNumber });
  const projectPreheader = data.projectName ? ` for ${data.projectName}` : "";

  const body = `
    ${renderEyebrow(eyebrow)}
    ${renderDisplayHeadline(`Invoice ${data.invoiceNumber}`)}
    ${data.issuedOn ? renderRefLine(`Issued ${data.issuedOn}`, `Due ${data.dueDate}`) : renderRefLine(`Due ${data.dueDate}`, null)}
    ${renderHairline()}
    ${renderGreeting(data.recipientName ?? data.clientName)}
    <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:${ZINC_700};">
      Please find attached the summary of invoice <strong>${escape(data.invoiceNumber)}</strong>${data.projectName ? ` issued for <strong>${escape(data.projectName)}</strong>` : ""}. Full line items, applicable taxes and payment instructions are available in your client portal.
    </p>
    ${renderAmountHero(data.amountFormatted, "Amount due")}
    ${meta.length ? renderMetaGrid(meta) : ""}
    ${data.paymentInstructions ? renderQuoteBlock(data.paymentInstructions) : ""}
    ${renderCta("View & pay invoice", data.portalUrl)}
    ${renderFooterNote(
      `Kindly arrange settlement by ${escape(data.dueDate)}. If any detail on this invoice needs revision, reply to this email — we'd rather correct a record than chase a payment.`,
    )}
  `;

  return renderShell({
    subject,
    preheader: `Invoice ${data.invoiceNumber}${projectPreheader} for ${data.amountFormatted} is due ${data.dueDate}.`,
    documentTitle: `Invoice · ${data.invoiceNumber}`,
    bodyHtml: body,
    brand,
  });
}

export function renderOnboardingHtml(data: OnboardingEmailData, brand: BrandInfo): string {
  const subject = buildOnboardingSubject(brand);
  const features = [
    {
      label: "Projects",
      body: "Live status, milestones and the team shipping your work.",
    },
    {
      label: "Proposals",
      body: "Review scope and pricing in detail. Accept on the spot.",
    },
    {
      label: "Invoices",
      body: "Download PDFs, track payments, settle in one tap.",
    },
  ];

  const body = `
    ${renderEyebrow("Client portal · Welcome")}
    ${renderDisplayHeadline("A workspace built around your projects.")}
    ${renderHairline()}
    ${renderGreeting(data.recipientName ?? data.clientName)}
    <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:${ZINC_700};">
      ${escape(data.clientName)} now has a dedicated portal on our platform. No passwords to manage — every sign-in uses a one-tap link sent to this email. Tap the button below to sign in for the first time.
    </p>
    ${renderFeatureGrid(features)}
    ${renderCta("Open your portal", data.portalSignInUrl)}
    ${renderFooterNote(formatSignInLinkNote(data.linkTtlMinutes))}
  `;

  return renderShell({
    subject,
    preheader: `Welcome to the ${brand.name} client portal. Your sign-in link is inside.`,
    documentTitle: "Client portal",
    bodyHtml: body,
    brand,
  });
}

export function renderProjectCompleteHtml(data: ProjectCompleteEmailData, brand: BrandInfo): string {
  const subject = buildProjectCompleteSubject(data);
  const stats: Array<{ label: string; value: string }> = [];
  if (data.duration) stats.push({ label: "Duration", value: data.duration });
  if (data.projectLead) {
    stats.push({
      label: "Project lead",
      value: data.projectLead + (data.projectLeadEmail ? ` · ${data.projectLeadEmail}` : ""),
    });
  }
  stats.push({ label: "Completed", value: data.completedOn });

  const body = `
    ${renderEyebrow("Project · Delivered")}
    ${renderDisplayHeadline(`${data.projectName} is complete.`)}
    ${renderHairline()}
    ${renderGreeting(data.recipientName ?? data.clientName)}
    <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:${ZINC_700};">
      Every milestone on this engagement is wrapped. Thank you for the trust and the collaboration — it was a pleasure shipping <strong>${escape(data.projectName)}</strong> with you. Final deliverables, files and the full project history will remain available in your portal.
    </p>
    ${renderStatsStrip(stats)}
    ${renderChecklist("What's next", [
      "Review and settle any open invoices in the portal.",
      "Reach out any time for tweaks, additions or a new engagement.",
      "If you have a minute — a short referral or testimonial means the world.",
    ])}
    ${renderCta("Open project workspace", data.portalUrl)}
    ${renderFooterNote(
      "If anything still needs attention before we close the books on this one, just reply — we'd rather hear it now than after the project is archived.",
    )}
  `;

  return renderShell({
    subject,
    preheader: `${data.projectName} is complete. Final deliverables are in your portal.`,
    documentTitle: `Project · ${data.projectName}`,
    bodyHtml: body,
    brand,
  });
}

// ── Generic transactional renderer (auth flows, password reset, etc.) ───

export interface GenericEmailData {
  /** Eyebrow line above the headline. */
  kicker?: string;
  /** Document type label shown in the masthead, e.g. "Portal · Sign in". */
  documentTitle?: string;
  /** H1 of the email. */
  headline: string;
  greeting?: string;
  /** Lead paragraph immediately under the headline. Multiline is honoured. */
  intro?: string;
  /** Optional inline code block — e.g. temporary password, token. */
  code?: { label: string; value: string };
  /** Single CTA. Pass null to omit. */
  cta?: { label: string; url: string } | null;
  /** Optional footer disclaimer/expiry notice. */
  footerNote?: string;
  /** Plain key:value rows rendered below the intro — used by legacy
   *  payloads with unknown fields. */
  extras?: Array<{ label: string; value: string }>;
}

export function renderGenericHtml(
  subject: string,
  data: GenericEmailData,
  brand: BrandInfo,
): string {
  const greeting = data.greeting ? renderGreeting(stripPrefix(data.greeting, "Hi ", ",")) : "";
  const body = `
    ${data.kicker ? renderEyebrow(data.kicker) : ""}
    <h1 class="headline" style="margin:0;font-size:24px;line-height:1.18;font-weight:800;letter-spacing:-0.015em;color:${ZINC_900};">${escape(data.headline)}</h1>
    ${renderHairline()}
    ${greeting}
    ${data.intro ? `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${ZINC_700};">${escapeMultiline(data.intro)}</p>` : ""}
    ${data.code ? renderCodeBlock(data.code.label, data.code.value) : ""}
    ${data.extras && data.extras.length ? renderMetaGrid(data.extras) : ""}
    ${data.cta ? renderCta(data.cta.label, data.cta.url) : ""}
    ${data.footerNote ? renderFooterNote(data.footerNote) : ""}
  `;
  return renderShell({
    subject,
    preheader: data.intro ? stripTags(data.intro) : data.headline,
    documentTitle: data.documentTitle ?? brand.name,
    bodyHtml: body,
    brand,
  });
}

// ── Shell + shared building blocks ───────────────────────────────────────

// Colours: pure-black accent + neutral zinc grayscale. No accent colour
// is used anywhere on purpose — the brand reads "premium-monochrome",
// matching the proposal print template.
const BLACK = "#0a0a0a";
const ZINC_900 = "#18181b";
const ZINC_700 = "#3f3f46";
const ZINC_500 = "#71717a";
const ZINC_400 = "#a1a1aa";
const ZINC_300 = "#d4d4d8";
const ZINC_200 = "#e4e4e7";
const ZINC_100 = "#f4f4f5";
const ZINC_50 = "#fafafa";

const HEADER_LOGO_W = 132;
const HEADER_LOGO_H = 36;
const FOOTER_LOGO_W = 92;
const FOOTER_LOGO_H = 24;

interface ShellArgs {
  subject: string;
  preheader: string;
  documentTitle: string;
  bodyHtml: string;
  brand: BrandInfo;
}

function renderShell({ subject, preheader, documentTitle, bodyHtml, brand }: ShellArgs): string {
  // Logo resolution: use the brand's uploaded logo when present,
  // otherwise fall back to the bundled Nuro 7 wordmark served from the
  // web app's public/ dir. URLs (not CID attachments) so the image does
  // not show up as a paperclip attachment in the recipient's mail client.
  //
  // When falling back to the bundled wordmark we also render a hidden
  // white-on-transparent variant that becomes visible under
  // prefers-color-scheme: dark (and we flip the masthead/footer dark to
  // match). For brand-uploaded logos we can't auto-invert their artwork,
  // so the masthead/footer stay white in dark mode — same as before.
  const customLogoUrl = resolveLogoUrl(brand.logoUrl);
  const useBundledLogo = !customLogoUrl;
  const appBase = env.appUrl.replace(/\/$/, "");
  const logoLightSrc = customLogoUrl ?? `${appBase}${BUNDLED_LOGO_LIGHT_PATH}`;
  const logoDarkSrc = `${appBase}${BUNDLED_LOGO_DARK_PATH}`;
  const contactStrip = [brand.website, brand.email, brand.phone]
    .filter(Boolean)
    .map((v) => escape(v as string))
    .join(`<span style="color:${ZINC_300};margin:0 8px;">&middot;</span>`);

  // Paired imgs for the masthead/footer logo, with the dark variant
  // hidden by default and swapped in via media query when bundled.
  // mso-hide:all keeps Outlook (no prefers-color-scheme support) from
  // ever revealing the dark image.
  const renderLogoPair = (
    klass: string,
    width: number,
    height: number,
  ): string => {
    const baseStyle = `display:block;width:${width}px;height:auto;max-height:${height}px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;`;
    const lightImg = `<img class="${klass} logo-light" src="${escape(logoLightSrc)}" alt="${escape(brand.name)}" width="${width}" height="${height}" style="${baseStyle}" />`;
    if (!useBundledLogo) return lightImg;
    const darkImg = `<!--[if !mso]><!--><img class="${klass} logo-dark" src="${escape(logoDarkSrc)}" alt="${escape(brand.name)}" width="${width}" height="${height}" style="${baseStyle}display:none;mso-hide:all;" /><!--<![endif]-->`;
    return `${lightImg}${darkImg}`;
  };

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${escape(subject)}</title>
  <!--[if mso]>
  <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  <![endif]-->
  <style>
    u + #body a { color: inherit; text-decoration: none; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    img { -ms-interpolation-mode: bicubic; image-rendering: -webkit-optimize-contrast; }

    /* Dark mode: the body card always flips to a dark surface. When the
       bundled Nuro 7 wordmark is in use, the masthead/footer/legal rows
       also flip dark and the white wordmark variant swaps in via
       .logo-light/.logo-dark display rules. When a brand-uploaded logo
       is in use we leave the masthead/footer white — we can't safely
       invert an arbitrary brand mark to white, so keeping it on a
       white surface preserves contrast (black-on-black was the old
       failure mode). */
    @media (prefers-color-scheme: dark) {
      .email-shell { background-color: #0a0a0a !important; }
      .email-card { background-color: #111111 !important; border-color: #1f1f1f !important; }
      .body-row { background-color: #111111 !important; }
      .ink-strong { color: #fafafa !important; }
      .ink-muted { color: #a1a1aa !important; }
      .rule-soft { background-color: #1f1f1f !important; }
      ${useBundledLogo ? `
      .masthead { background-color: #111111 !important; }
      .footer-row { background-color: #0a0a0a !important; }
      .legal-row { background-color: #111111 !important; }
      .logo-light { display: none !important; }
      .logo-dark { display: block !important; }
      ` : ""}
    }

    @media only screen and (max-width: 600px) {
      .email-shell-pad { padding: 16px 0 !important; }
      .email-card { width: 100% !important; max-width: 100% !important; border-left: 0 !important; border-right: 0 !important; }
      .masthead { padding: 18px 20px !important; }
      .body-pad { padding: 28px 20px 20px !important; }
      .footer-pad { padding: 18px 20px !important; }
      .legal-pad { padding: 14px 20px !important; }
      .display-headline { font-size: 24px !important; line-height: 1.15 !important; }
      .headline { font-size: 19px !important; line-height: 1.2 !important; }
      .amount-hero { font-size: 36px !important; }
      .stack { display: block !important; width: 100% !important; }
      .stack-right { text-align: left !important; padding-top: 10px !important; }
      .stat-cell { display: block !important; width: 100% !important; padding: 14px 0 !important; border-right: 0 !important; border-bottom: 1px solid ${ZINC_200} !important; }
      .stat-cell-last { border-bottom: 0 !important; }
      .feature-cell { display: block !important; width: 100% !important; padding: 18px 0 !important; border-right: 0 !important; border-bottom: 1px solid ${ZINC_200} !important; }
      .feature-cell-last { border-bottom: 0 !important; }
      .cta-link { padding: 16px 24px !important; font-size: 13px !important; display: block !important; text-align: center !important; }
      .contact-strip { font-size: 11px !important; line-height: 1.7 !important; }
      .legal-text { font-size: 10px !important; line-height: 1.65 !important; }
      .doc-title { font-size: 9px !important; letter-spacing: 0.24em !important; }
      .header-logo-img { width: 108px !important; height: auto !important; max-height: 32px !important; }
      .footer-logo-img { width: 80px !important; height: auto !important; max-height: 22px !important; }
    }
    @media only screen and (max-width: 380px) {
      .doc-title-cell { display: none !important; }
      .display-headline { font-size: 22px !important; }
    }
  </style>
</head>
<body id="body" class="email-shell" style="margin:0;padding:0;background-color:${ZINC_100};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${ZINC_900};-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;color:${ZINC_100};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escape(preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="email-shell" style="background-color:${ZINC_100};">
    <tr>
      <td align="center" class="email-shell-pad" style="padding:32px 12px;">
        <table role="presentation" class="email-card" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid ${ZINC_200};border-collapse:separate;">
          <!-- MASTHEAD: white background with the brand (or fallback)
               logo on the left and the document-type eyebrow on the
               right. White means brand logos of any colour display
               naturally, no separate light/dark uploads required. -->
          <tr>
            <td class="masthead masthead-row" bgcolor="#ffffff" style="padding:24px 36px;background-color:#ffffff;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="stack" align="left" valign="middle" style="vertical-align:middle;">
                    ${renderLogoPair("header-logo-img", HEADER_LOGO_W, HEADER_LOGO_H)}
                  </td>
                  <td class="stack stack-right doc-title-cell" align="right" valign="middle" style="vertical-align:middle;">
                    <span class="doc-title ink-muted" style="font-size:10px;font-weight:700;letter-spacing:0.28em;text-transform:uppercase;color:${ZINC_500};">${escape(documentTitle.toUpperCase())}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td style="height:3px;background-color:${BLACK};line-height:1px;font-size:1px;">&nbsp;</td></tr>

          <!-- BODY -->
          <tr>
            <td class="body-pad body-row" style="padding:40px 44px 32px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- FOOTER -->
          <tr><td class="rule-soft" style="height:1px;background-color:${ZINC_200};line-height:1px;font-size:1px;">&nbsp;</td></tr>
          <tr>
            <td class="footer-pad footer-row" style="padding:22px 36px;background-color:${ZINC_50};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="stack" align="left" valign="middle" style="vertical-align:middle;">
                    ${renderLogoPair("footer-logo-img", FOOTER_LOGO_W, FOOTER_LOGO_H)}
                  </td>
                  <td class="stack stack-right contact-strip ink-muted" align="right" valign="middle" style="vertical-align:middle;font-size:11px;color:${ZINC_500};">
                    ${contactStrip}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td style="height:3px;background-color:${BLACK};line-height:1px;font-size:1px;">&nbsp;</td></tr>
          <tr>
            <td class="legal-pad legal-row" style="padding:14px 36px;background-color:#ffffff;">
              <p class="legal-text ink-muted" style="margin:0;font-size:10px;line-height:1.6;color:${ZINC_400};">
                Sent by ${escape(brand.name)}. If this email arrived unexpectedly, you can safely disregard it.
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

// ── Body primitives ──────────────────────────────────────────────────────

function renderEyebrow(text: string): string {
  return `<div class="eyebrow" style="font-size:11px;font-weight:700;letter-spacing:0.28em;text-transform:uppercase;color:${ZINC_500};margin:0 0 14px;">${escape(text)}</div>`;
}

function renderDisplayHeadline(text: string): string {
  // Larger display type for the document-specific headlines (project
  // name, invoice number, "Welcome…"). Tight letter-spacing and big
  // weight to read like a printed cover sheet.
  return `<h1 class="display-headline" style="margin:0;font-size:32px;line-height:1.1;font-weight:800;letter-spacing:-0.02em;color:${ZINC_900};">${escape(text)}</h1>`;
}

function renderRefLine(left: string, right: string | null): string {
  // Slim two-column reference line, shown just under the headline.
  // Used to display "Ref. 0042  ·  Prepared 23 May 2026" style metadata.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:14px 0 0;">
    <tr>
      <td align="left" style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${ZINC_500};">${escape(left)}</td>
      ${right ? `<td align="right" style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${ZINC_500};">${escape(right)}</td>` : ""}
    </tr>
  </table>`;
}

function renderHairline(): string {
  // 3px black accent rule below the headline. Mirrors the proposal
  // print SectionRule but a touch heavier so it reads from a phone.
  return `<div style="height:3px;width:56px;background-color:${BLACK};margin:18px 0 26px;line-height:3px;font-size:1px;">&nbsp;</div>`;
}

function renderGreeting(name: string): string {
  const firstName = name.trim().split(/\s+/)[0] || name.trim();
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${ZINC_900};font-weight:600;">Hi ${escape(firstName)},</p>`;
}

function renderStatsStrip(stats: Array<{ label: string; value: string }>): string {
  // Three-up (or two-up) stat strip with internal vertical dividers.
  // On mobile, cells collapse to a stacked list (see .stat-cell media
  // query). The strip has a subtle outer border so it reads as a card.
  if (!stats.length) return "";
  const cells = stats
    .map((s, i) => {
      const isLast = i === stats.length - 1;
      const dividerStyle = isLast ? "" : `border-right:1px solid ${ZINC_200};`;
      return `<td class="stat-cell ${isLast ? "stat-cell-last" : ""}" valign="top" style="padding:18px 20px;${dividerStyle};vertical-align:top;width:${Math.floor(100 / stats.length)}%;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${ZINC_500};margin-bottom:8px;">${escape(s.label)}</div>
        <div style="font-size:18px;font-weight:700;letter-spacing:-0.01em;color:${ZINC_900};line-height:1.25;">${escape(s.value)}</div>
      </td>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:6px 0 28px;border:1px solid ${ZINC_200};border-collapse:collapse;background-color:${ZINC_50};">
    <tr>${cells}</tr>
  </table>`;
}

function renderPreparedLine(client: string, preparedBy: string): string {
  // Two-column "Prepared for X · Prepared by Y" strip under the stats.
  // Reads like the title-page metadata of the proposal PDF.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 28px;">
    <tr>
      <td align="left" valign="top" style="vertical-align:top;padding-right:16px;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${ZINC_500};margin-bottom:4px;">Prepared for</div>
        <div style="font-size:14px;font-weight:700;color:${ZINC_900};">${escape(client)}</div>
      </td>
      <td align="right" valign="top" style="vertical-align:top;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${ZINC_500};margin-bottom:4px;">Prepared by</div>
        <div style="font-size:14px;font-weight:700;color:${ZINC_900};">${escape(preparedBy)}</div>
      </td>
    </tr>
  </table>`;
}

function renderQuoteBlock(text: string): string {
  // Pull-quote style block — left-side black rule + slightly larger
  // italic-ish copy. Used for proposal summary lead, payment notes.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 28px;">
    <tr>
      <td style="border-left:3px solid ${BLACK};padding:4px 0 4px 18px;">
        <p style="margin:0;font-size:15px;line-height:1.6;color:${ZINC_900};">${escapeMultiline(text)}</p>
      </td>
    </tr>
  </table>`;
}

function renderInclusionList(items: string[]): string {
  // Lightweight bullet list with arrow markers, capped at 6 items so
  // the email doesn't bloat. Anything beyond gets a "+ N more in the
  // portal" trailer line.
  if (!items.length) return "";
  const visible = items.slice(0, 6);
  const overflow = items.length - visible.length;
  const rows = visible
    .map(
      (it) => `<tr>
        <td valign="top" style="vertical-align:top;width:18px;padding:2px 10px 6px 0;color:${ZINC_400};font-size:13px;line-height:1.5;">&rsaquo;</td>
        <td valign="top" style="vertical-align:top;padding:0 0 6px;font-size:14px;line-height:1.55;color:${ZINC_900};">${escape(it)}</td>
      </tr>`,
    )
    .join("");
  const trailer = overflow > 0
    ? `<tr><td colspan="2" style="padding:6px 0 0;font-size:12px;color:${ZINC_500};font-style:italic;">+${overflow} more item${overflow === 1 ? "" : "s"} in the full proposal.</td></tr>`
    : "";
  return `<div style="margin:0 0 24px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${ZINC_500};margin-bottom:10px;">What's included</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}${trailer}</table>
  </div>`;
}

function renderAmountHero(amount: string, label: string): string {
  // Statement-style amount block: huge tabular figure, label below.
  // The single thing the recipient will look at — sized accordingly.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:6px 0 22px;background-color:${BLACK};">
    <tr>
      <td style="padding:28px 32px;text-align:left;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.28em;text-transform:uppercase;color:${ZINC_400};margin-bottom:8px;">${escape(label)}</div>
        <div class="amount-hero" style="font-size:48px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;line-height:1.0;font-variant-numeric:tabular-nums;">${escape(amount)}</div>
      </td>
    </tr>
  </table>`;
}

function renderMetaGrid(items: Array<{ label: string; value: string }>): string {
  // 2-column meta grid for invoice / generic key:value pairs. Each row
  // has a label (uppercase tracking) and value (bold). Borders only
  // between rows for a quiet, professional grid.
  if (!items.length) return "";
  const rows = items
    .map((it, i) => {
      const isLast = i === items.length - 1;
      return `<tr>
        <td valign="top" style="vertical-align:top;padding:12px 16px 12px 0;${!isLast ? `border-bottom:1px solid ${ZINC_200};` : ""}width:38%;">
          <div style="font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${ZINC_500};">${escape(it.label)}</div>
        </td>
        <td valign="top" align="right" style="vertical-align:top;padding:12px 0;${!isLast ? `border-bottom:1px solid ${ZINC_200};` : ""}">
          <div style="font-size:14px;font-weight:600;color:${ZINC_900};">${escape(it.value)}</div>
        </td>
      </tr>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 26px;border-top:1px solid ${ZINC_200};">${rows}</table>`;
}

function renderFeatureGrid(items: Array<{ label: string; body: string }>): string {
  // Three-up feature grid for the onboarding email — each cell has a
  // numbered monogram (01/02/03) over a label and short body. Looks
  // like a magazine TOC, not a SaaS onboarding splash.
  if (!items.length) return "";
  const cells = items
    .map((it, i) => {
      const isLast = i === items.length - 1;
      const dividerStyle = isLast ? "" : `border-right:1px solid ${ZINC_200};`;
      return `<td class="feature-cell ${isLast ? "feature-cell-last" : ""}" valign="top" style="padding:22px 20px;${dividerStyle};vertical-align:top;width:${Math.floor(100 / items.length)}%;">
        <div style="font-size:20px;font-weight:800;color:${ZINC_300};letter-spacing:-0.02em;line-height:1;margin-bottom:10px;font-variant-numeric:tabular-nums;">${String(i + 1).padStart(2, "0")}</div>
        <div style="font-size:13px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${ZINC_900};margin-bottom:6px;">${escape(it.label)}</div>
        <div style="font-size:13px;line-height:1.55;color:${ZINC_700};">${escape(it.body)}</div>
      </td>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 28px;border:1px solid ${ZINC_200};border-collapse:collapse;background-color:${ZINC_50};">
    <tr>${cells}</tr>
  </table>`;
}

function renderChecklist(title: string, items: string[]): string {
  // Small uppercase title + dash-bulleted list. Used for the project-
  // complete "what's next" block.
  const rows = items
    .map(
      (it) => `<tr>
        <td valign="top" style="vertical-align:top;width:18px;padding:2px 10px 8px 0;color:${ZINC_400};font-size:13px;line-height:1.5;">&mdash;</td>
        <td valign="top" style="vertical-align:top;padding:0 0 8px;font-size:14px;line-height:1.55;color:${ZINC_900};">${escape(it)}</td>
      </tr>`,
    )
    .join("");
  return `<div style="margin:0 0 26px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${ZINC_500};margin-bottom:10px;">${escape(title)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>
  </div>`;
}

function renderCta(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 6px;">
    <tr>
      <td bgcolor="${BLACK}" style="border-radius:2px;">
        <a href="${escape(url)}" target="_blank" rel="noopener" class="cta-link" style="display:inline-block;padding:15px 30px;font-size:13px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#ffffff;text-decoration:none;background-color:${BLACK};border:1px solid ${BLACK};border-radius:2px;mso-padding-alt:0;">${escape(label)} &rarr;</a>
      </td>
    </tr>
  </table>
  <p style="margin:8px 0 0;font-size:11px;line-height:1.5;color:${ZINC_500};word-break:break-all;">${escape(url)}</p>`;
}

function renderFooterNote(html: string): string {
  return `<p style="margin:28px 0 0;font-size:12px;line-height:1.6;color:${ZINC_500};">${escapeMultiline(html)}</p>`;
}

function renderCodeBlock(label: string, value: string): string {
  return `<div style="margin:0 0 24px;">
    <div style="font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${ZINC_500};margin-bottom:8px;">${escape(label)}</div>
    <code style="display:inline-block;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:15px;font-weight:600;background-color:${ZINC_100};border:1px solid ${ZINC_200};padding:10px 14px;border-radius:2px;color:${ZINC_900};letter-spacing:0.06em;">${escape(value)}</code>
  </div>`;
}

// ── Plain-text rendering (one fallback for every kind) ──────────────────

export function renderProposalText(data: ProposalEmailData, brand: BrandInfo): string {
  const eyebrow = data.variant === "resent" ? "PROPOSAL · UPDATED" : "PROPOSAL";
  const lines = [
    eyebrow,
    data.projectName.toUpperCase(),
    "─".repeat(40),
    data.proposalNumber ? `Ref. ${data.proposalNumber}` : "",
    `Prepared for ${data.clientName}`,
    "",
    data.summary ?? "",
    "",
    data.investment ? `Investment: ${data.investment}` : "",
    data.timeline ? `Timeline:   ${data.timeline}` : "",
    data.validUntil ? `Valid until: ${data.validUntil}` : "",
    "",
    `View proposal: ${data.portalUrl}`,
    "",
    "—",
    brand.name,
    [brand.website, brand.email].filter(Boolean).join(" · "),
  ].filter((l) => l !== "");
  return lines.join("\n");
}

export function renderInvoiceText(data: InvoiceEmailData, brand: BrandInfo): string {
  // Eyebrow folds in the project so the project name appears alongside
  // the INVOICE label, matching the HTML eyebrow exactly.
  const eyebrow = data.projectName ? `INVOICE · ${data.projectName.toUpperCase()}` : "INVOICE";
  const lines = [
    eyebrow,
    data.invoiceNumber,
    "─".repeat(40),
    `Amount due: ${data.amountFormatted}`,
    `Pay by:     ${data.dueDate}`,
    data.issuedOn ? `Issued:     ${data.issuedOn}` : "",
    data.projectName ? `Project:    ${data.projectName}` : "",
    data.referenceNumber ? `Reference:  ${data.referenceNumber}` : "",
    "",
    `View & pay: ${data.portalUrl}`,
    "",
    "—",
    brand.name,
    [brand.website, brand.email].filter(Boolean).join(" · "),
  ].filter((l) => l !== "");
  return lines.join("\n");
}

export function renderOnboardingText(data: OnboardingEmailData, brand: BrandInfo): string {
  return [
    "CLIENT PORTAL · WELCOME",
    "─".repeat(40),
    `Welcome to your ${brand.name} client portal, ${data.clientName}.`,
    "",
    "Inside you can track projects, review and accept proposals, and",
    "settle invoices — all in one place.",
    "",
    `Open your portal: ${data.portalSignInUrl}`,
    "",
    `(${formatSignInLinkNote(data.linkTtlMinutes)})`,
    "",
    "—",
    brand.name,
    [brand.website, brand.email].filter(Boolean).join(" · "),
  ].filter((l) => l !== "").join("\n");
}

export function renderProjectCompleteText(data: ProjectCompleteEmailData, brand: BrandInfo): string {
  return [
    "PROJECT · DELIVERED",
    `${data.projectName} is complete`,
    "─".repeat(40),
    data.duration ? `Duration:     ${data.duration}` : "",
    data.projectLead ? `Project lead: ${data.projectLead}${data.projectLeadEmail ? ` (${data.projectLeadEmail})` : ""}` : "",
    `Completed:    ${data.completedOn}`,
    "",
    "Thank you for the trust and the collaboration. Final deliverables",
    "and the full project history remain available in your portal.",
    "",
    `Open project workspace: ${data.portalUrl}`,
    "",
    "—",
    brand.name,
    [brand.website, brand.email].filter(Boolean).join(" · "),
  ].filter((l) => l !== "").join("\n");
}

export function renderGenericText(
  subject: string,
  data: GenericEmailData,
  brand: BrandInfo,
): string {
  const lines: string[] = [];
  if (data.kicker) lines.push(data.kicker.toUpperCase(), "");
  lines.push(data.headline);
  lines.push("─".repeat(Math.min(40, data.headline.length)));
  if (data.greeting) lines.push("", data.greeting);
  if (data.intro) lines.push("", data.intro);
  if (data.code) lines.push("", `${data.code.label}: ${data.code.value}`);
  if (data.extras) {
    for (const e of data.extras) lines.push(`${e.label}: ${e.value}`);
  }
  if (data.cta) lines.push("", `${data.cta.label}:`, data.cta.url);
  if (data.footerNote) lines.push("", data.footerNote);
  lines.push("", "—", brand.name, [brand.website, brand.email].filter(Boolean).join(" · "));
  return lines.join("\n");
}

// ── Utilities ────────────────────────────────────────────────────────────

/**
 * Render the sign-in-link expiry note shown on the onboarding email.
 * Portal links in this system are intentionally long-lived (multi-year TTL)
 * so the raw "5,256,000 minutes" figure that came out of the env config
 * was both meaningless and alarming to recipients. For anything ≥ 30 days
 * we fall back to a reassurance line; below that we render a tight,
 * human-readable duration.
 */
function formatSignInLinkNote(minutes: number): string {
  const safe = Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : 0;
  const DAY = 60 * 24;
  if (safe >= DAY * 30) {
    return "This sign-in link stays active — bookmark it for next time. If you ever misplace this email, request a fresh link from the portal sign-in page using the same address.";
  }
  return `This first sign-in link expires in ${formatDuration(safe)}. If it has lapsed by the time you read this, request a fresh link from the portal sign-in page — same email, no setup required.`;
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(minutes / (60 * 24));
  return `${days} day${days === 1 ? "" : "s"}`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeMultiline(s: string): string {
  return escape(s).replace(/\r?\n/g, "<br/>");
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function stripPrefix(s: string, pfx: string, sfx: string): string {
  let out = s;
  if (out.startsWith(pfx)) out = out.slice(pfx.length);
  if (out.endsWith(sfx)) out = out.slice(0, -sfx.length);
  return out;
}

function resolveLogoUrl(raw: string | null): string | null {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = env.appUrl.replace(/\/$/, "");
  return raw.startsWith("/") ? `${base}${raw}` : `${base}/${raw}`;
}
