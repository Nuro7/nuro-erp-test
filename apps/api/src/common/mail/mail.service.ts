import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { PrismaService } from "../prisma/prisma.service";
import {
  BrandInfo,
  GenericEmailData,
  InvoiceEmailData,
  OnboardingEmailData,
  ProjectCompleteEmailData,
  ProposalEmailData,
  buildInvoiceSubject,
  buildOnboardingSubject,
  buildProjectCompleteSubject,
  buildProposalSubject,
  renderGenericHtml,
  renderGenericText,
  renderInvoiceHtml,
  renderInvoiceText,
  renderOnboardingHtml,
  renderOnboardingText,
  renderProjectCompleteHtml,
  renderProjectCompleteText,
  renderProposalHtml,
  renderProposalText,
} from "./mail-templates";

/**
 * Result returned by every send entry point. Lets callers (e.g. the
 * invoice/proposal send endpoints) surface real mail delivery state in
 * their API response instead of silently claiming success when the
 * SMTP transport is missing or the provider rejected the message.
 *
 *   sent    — provider accepted the message
 *   skipped — no transport configured (placeholder creds / mail disabled)
 *   failed  — transport tried to deliver but the provider/network errored
 */
export type MailDispatchResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

/**
 * Rollup of N per-recipient dispatch results into a single outcome the
 * API response carries to the UI. Adds `no-recipients` for the case
 * where the client record has no email at all — distinguishing it from
 * "transport not configured" matters for the operator: one needs them
 * to fix the client contact, the other to set up SMTP.
 */
export type MailSendOutcome = {
  status: "sent" | "skipped" | "failed" | "no-recipients";
  reason?: string;
  recipients: string[];
};

/**
 * Roll N per-recipient results into a single outcome. Status precedence:
 * sent > skipped > failed. "Sent" wins if at least one provider
 * acceptance happened; "skipped" wins over "failed" because a missing
 * transport is an operator-config problem the UI should prompt about,
 * not a transient delivery error.
 */
export function summarizeMailResults(
  results: MailDispatchResult[],
  recipients: string[],
): MailSendOutcome {
  if (results.length === 0) {
    return { status: "no-recipients", recipients };
  }
  const anySent = results.some((r) => r.status === "sent");
  if (anySent) return { status: "sent", recipients };
  const skipped = results.find((r) => r.status === "skipped") as
    | { status: "skipped"; reason: string }
    | undefined;
  if (skipped) return { status: "skipped", reason: skipped.reason, recipients };
  const failed = results.find((r) => r.status === "failed") as
    | { status: "failed"; reason: string }
    | undefined;
  return { status: "failed", reason: failed?.reason ?? "Unknown mail error.", recipients };
}

/**
 * SMTP-backed mail service.
 *
 * Outbound messages fall into one of five shapes — each shape has a
 * dedicated typed entry point that builds its own visually-distinct
 * HTML body:
 *
 *   sendProposalEmail(to, data)         — cover-sheet style
 *   sendInvoiceEmail(to, data)          — statement style
 *   sendOnboardingEmail(to, data)       — welcome card
 *   sendProjectCompleteEmail(to, data)  — delivery card
 *   sendGenericEmail(to, subject, data) — magic links, password resets
 *
 * Plus a legacy `sendTemplateEmail(to, subject, payload)` that maps
 * the old flat key/value payload onto the generic template so old
 * call sites keep working without churn.
 *
 * Logos are referenced by public URL in the rendered HTML (see
 * mail-templates.ts) — no CID attachments — so they do not appear as
 * paperclip attachments in the recipient's mail client.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private fromAddress: string = "";
  private configSummary: string | null = null;
  private cacheLoadedAt: number = 0;
  private readonly CACHE_TTL_MS = 60_000;
  private brandCache: BrandInfo | null = null;
  private brandCacheLoadedAt: number = 0;

  constructor(private readonly prisma: PrismaService) {}

  invalidateTransport() {
    this.transporter = null;
    this.cacheLoadedAt = 0;
    this.brandCache = null;
    this.brandCacheLoadedAt = 0;
  }

  // ── Typed send entry points ────────────────────────────────────────────

  async sendProposalEmail(to: string, data: ProposalEmailData): Promise<MailDispatchResult> {
    const brand = await this.getBrand();
    return this.dispatch(to, buildProposalSubject(data), renderProposalHtml(data, brand), renderProposalText(data, brand));
  }

  async sendInvoiceEmail(to: string, data: InvoiceEmailData): Promise<MailDispatchResult> {
    const brand = await this.getBrand();
    return this.dispatch(to, buildInvoiceSubject(data), renderInvoiceHtml(data, brand), renderInvoiceText(data, brand));
  }

  async sendOnboardingEmail(to: string, data: OnboardingEmailData): Promise<MailDispatchResult> {
    const brand = await this.getBrand();
    return this.dispatch(to, buildOnboardingSubject(brand), renderOnboardingHtml(data, brand), renderOnboardingText(data, brand));
  }

  async sendProjectCompleteEmail(to: string, data: ProjectCompleteEmailData): Promise<MailDispatchResult> {
    const brand = await this.getBrand();
    return this.dispatch(to, buildProjectCompleteSubject(data), renderProjectCompleteHtml(data, brand), renderProjectCompleteText(data, brand));
  }

  async sendGenericEmail(to: string, subject: string, data: GenericEmailData): Promise<MailDispatchResult> {
    const brand = await this.getBrand();
    return this.dispatch(to, subject, renderGenericHtml(subject, data, brand), renderGenericText(subject, data, brand));
  }

  /**
   * Legacy flat-payload send. Translates the old `{name, link,
   * tempPassword, portalUrl, ttlMinutes, ...}` shape into the generic
   * template. Kept so existing call sites (auth, hr, tasks, staff
   * requests) continue to work — they all get the new branded
   * rendering for free.
   */
  async sendTemplateEmail(
    to: string,
    subject: string,
    payload: Record<string, string>,
  ): Promise<MailDispatchResult> {
    return this.sendGenericEmail(to, subject, legacyPayloadToGeneric(payload));
  }

  // ── Test send (called from Settings → Email) ───────────────────────────

  async sendTestEmail(args: {
    host: string;
    port: number;
    user: string;
    pass: string;
    from?: string;
    to: string;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    const brand = await this.getBrand();
    const subject = `${brand.name} — SMTP test email`;
    const data: GenericEmailData = {
      kicker: "SMTP diagnostic",
      documentTitle: "Settings · Email",
      headline: "Your email configuration is working.",
      intro:
        "This message proves the platform can deliver mail through your configured provider. You can now safely send proposals, invoices, onboarding and project notifications from production.",
      extras: [
        { label: "Host", value: `${args.host}:${args.port}` },
        { label: "Secure", value: args.port === 465 ? "Yes (SMTPS)" : "STARTTLS / plain" },
        { label: "From", value: args.from || args.user },
      ],
      cta: null,
      footerNote: "You can rotate these credentials anytime under Settings → Email.",
    };
    const html = renderGenericHtml(subject, data, brand);
    const text = renderGenericText(subject, data, brand);

    // Resend HTTPS API — used when RESEND_API_KEY is set. Required on
    // Render free tier which blocks outbound SMTP.
    const resendKey = process.env.RESEND_API_KEY?.trim();
    if (resendKey) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: args.from || args.user || "Nuro 7 <onboarding@resend.dev>",
            to: args.to,
            subject,
            html,
            text,
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          return { ok: false, error: `Resend ${res.status}: ${body}` };
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    }

    // SMTP path — used for local dev and self-hosted servers.
    const transport = nodemailer.createTransport({
      host: args.host,
      port: args.port,
      secure: args.port === 465,
      auth: { user: args.user, pass: args.pass },
    });
    try {
      await transport.verify();
      await transport.sendMail({
        from: args.from || args.user,
        to: args.to,
        subject,
        text,
        html,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async getStatus(): Promise<{ enabled: boolean; summary: string | null }> {
    await this.ensureTransport();
    return { enabled: this.transporter !== null, summary: this.configSummary };
  }

  // ── Transport + brand caching ──────────────────────────────────────────

  private async dispatch(to: string, subject: string, html: string, text: string): Promise<MailDispatchResult> {
    // Resend HTTPS API path — used when RESEND_API_KEY is set. Bypasses
    // SMTP entirely, which is the only reliable way to send mail from
    // Render's free tier (it filters outbound SMTP traffic).
    const resendKey = process.env.RESEND_API_KEY?.trim();
    if (resendKey) {
      return this.dispatchViaResend(resendKey, to, subject, html, text);
    }

    await this.ensureTransport();
    if (!this.transporter) {
      // No usable transport (placeholder creds, mail disabled, or no
      // OrganizationSettings row yet). Surface this to callers so the
      // UI can tell the operator that the entity was marked SENT but no
      // email actually went out — was masquerading as success before.
      const reason = this.configSummary ?? "SMTP not configured — configure it under Settings → Email.";
      this.logger.warn(`[mail-skipped] ${reason} — would have sent to ${to} — subject: "${subject}"`);
      return { status: "skipped", reason };
    }
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject,
        html,
        text,
      });
      this.logger.log(`Sent "${subject}" → ${to}`);
      return { status: "sent" };
    } catch (err) {
      const reason = (err as Error).message;
      this.logger.error(`Failed to send "${subject}" → ${to}: ${reason}`);
      return { status: "failed", reason };
    }
  }

  private async dispatchViaResend(apiKey: string, to: string, subject: string, html: string, text: string): Promise<MailDispatchResult> {
    // Resolve the From: header. Prefer the configured smtpFrom, then env,
    // then fall back to Resend's onboarding sender (works without a
    // verified domain — useful for first-time setup).
    let from = this.fromAddress;
    if (!from) {
      const settings = await this.prisma.organizationSettings.findFirst();
      from = settings?.smtpFrom?.trim() || process.env.SMTP_FROM?.trim() || "Nuro 7 <onboarding@resend.dev>";
    }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to, subject, html, text }),
      });
      if (!res.ok) {
        const body = await res.text();
        const reason = `Resend ${res.status}: ${body}`;
        this.logger.error(`Failed to send "${subject}" → ${to}: ${reason}`);
        return { status: "failed", reason };
      }
      this.logger.log(`Sent "${subject}" → ${to} (via Resend)`);
      return { status: "sent" };
    } catch (err) {
      const reason = (err as Error).message;
      this.logger.error(`Failed to send "${subject}" → ${to}: ${reason}`);
      return { status: "failed", reason };
    }
  }

  private async ensureTransport(): Promise<void> {
    if (this.transporter && Date.now() - this.cacheLoadedAt < this.CACHE_TTL_MS) return;

    const settings = await this.prisma.organizationSettings.findFirst();
    const host = settings?.smtpHost?.trim() || process.env.SMTP_HOST?.trim() || "";
    const port = settings?.smtpPort ?? Number(process.env.SMTP_PORT ?? 587);
    const user = settings?.smtpUser?.trim() || process.env.SMTP_USER?.trim() || "";
    const pass = settings?.smtpPass?.trim() || process.env.SMTP_PASS?.trim() || "";
    const from = (settings?.smtpFrom?.trim() || process.env.SMTP_FROM?.trim() || user);
    const enabled = settings ? settings.smtpEnabled : true;

    const isPlaceholder = (v: string) =>
      !v || v.includes("example.com") || v === "changeme" || v === "noreply@example.com";

    if (!enabled || isPlaceholder(host) || isPlaceholder(user) || isPlaceholder(pass)) {
      this.transporter = null;
      this.configSummary = !enabled
        ? "Mail disabled in Settings → Email."
        : "SMTP credentials missing — configure them in Settings → Email.";
      this.cacheLoadedAt = Date.now();
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    this.fromAddress = from;
    this.configSummary = `Mail enabled via ${host}:${port} as ${from}`;
    this.cacheLoadedAt = Date.now();
    this.logger.log(this.configSummary);
  }

  private async getBrand(): Promise<BrandInfo> {
    if (this.brandCache && Date.now() - this.brandCacheLoadedAt < this.CACHE_TTL_MS) {
      return this.brandCache;
    }
    const s = await this.prisma.organizationSettings.findFirst();
    this.brandCache = {
      name: s?.name?.trim() || "Nuro 7",
      logoUrl: s?.logoUrl?.trim() || null,
      email: s?.email?.trim() || null,
      phone: s?.phone?.trim() || null,
      website: s?.website?.trim() || null,
      addressLine1: s?.addressLine1?.trim() || null,
      city: s?.city?.trim() || null,
      country: s?.country?.trim() || null,
    };
    this.brandCacheLoadedAt = Date.now();
    return this.brandCache;
  }
}

// ── Legacy payload → generic template ───────────────────────────────────

/**
 * Translate the flat {name, link, tempPassword, portalUrl, ttlMinutes,
 * note, ...} payload used by older auth / magic-link / staff-request
 * call sites into the typed GenericEmailData structure.
 */
function legacyPayloadToGeneric(p: Record<string, string>): GenericEmailData {
  const known = new Set(["name", "link", "tempPassword", "portalUrl", "ttlMinutes", "note"]);
  const extras: Array<{ label: string; value: string }> = [];
  if (p.portalUrl) extras.push({ label: "Portal URL", value: p.portalUrl });
  for (const [k, v] of Object.entries(p)) {
    if (!known.has(k)) extras.push({ label: humanize(k), value: v });
  }
  return {
    headline: p.note ? p.note.split("\n")[0] : "Hello from Nuro 7",
    greeting: p.name ? `Hi ${p.name},` : undefined,
    intro: p.note,
    code: p.tempPassword ? { label: "Temporary password", value: p.tempPassword } : undefined,
    extras: extras.length ? extras : undefined,
    cta: p.link ? { label: "Open", url: p.link } : null,
    footerNote: p.ttlMinutes ? `This link expires in ${p.ttlMinutes} minutes.` : undefined,
  };
}

function humanize(k: string): string {
  return k
    .replace(/[_-]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

