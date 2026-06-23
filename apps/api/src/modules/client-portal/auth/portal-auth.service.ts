import { Injectable, Logger } from "@nestjs/common";
import type { ClientContact } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { MailService } from "../../../common/mail/mail.service";
import { env } from "../../../config/env";
import { randomBytes } from "node:crypto";
import { generateToken, sha256 } from "../token.util";

/**
 * Namespace prefix for invoice-view tokens. The raw token never sees
 * this prefix — we apply it before hashing into `tokenHash`. Two
 * security properties follow:
 *   1. `verify()` looks up by `sha256(raw)`; an invoice-view token's
 *      stored hash is `sha256("inv-view:<invoiceId>:" + raw)`, so
 *      `verify()` will never find it. A leaked invoice-view URL
 *      therefore cannot be exchanged for a portal session.
 *   2. The hash is bound to a specific invoiceId. Re-using the same
 *      raw token against a different invoice ID gives a different
 *      hash → DB miss → 404. A leaked token can only ever view the
 *      one invoice it was issued for.
 */
const INVOICE_VIEW_NS = "inv-view:";

function invoiceViewHash(invoiceId: string, raw: string): string {
  return sha256(`${INVOICE_VIEW_NS}${invoiceId}:${raw}`);
}

/**
 * Allow only relative paths under `/portal/*` for the post-verify
 * redirect target. Anything else (absolute URLs, protocol-relative
 * `//evil.com`, paths outside the portal) is dropped silently so a
 * tampered email link can't be used as an open redirect.
 */
export function sanitizePortalNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/portal/") && next !== "/portal") return null;
  if (next.startsWith("//")) return null;
  return next;
}

@Injectable()
export class PortalAuthService {
  private readonly logger = new Logger(PortalAuthService.name);

  constructor(private readonly prisma: PrismaService, private readonly mail: MailService) {}

  /**
   * Generate (and optionally email) a one-time magic link for the given
   * contact email. Returns the fully-qualified URL + expiry so staff
   * callers can present "Copy link" / WhatsApp-share affordances when
   * email delivery isn't possible — useful when SMTP isn't configured
   * yet or the client prefers a different channel.
   *
   * Returns `null` for unknown / disabled contacts so the public
   * `/portal/auth/request` route can still avoid leaking existence —
   * callers that only need the side-effect (the email) can ignore the
   * return value.
   */
  async requestLink(
    email: string,
    ip: string | null,
    opts: { sendEmail?: boolean; next?: string | null } = {},
  ): Promise<{ link: string; token: string; expiresAt: Date } | null> {
    const sendEmail = opts.sendEmail ?? true;
    const contact = await this.prisma.clientContact.findFirst({
      where: { email: email.toLowerCase(), status: "ACTIVE" },
    });
    if (!contact) {
      // do not leak existence
      return null;
    }

    return this.issueMagicLink(contact, ip, { sendEmail, next: opts.next });
  }

  /**
   * Same as {@link requestLink} but scoped to a known client: if no
   * ACTIVE contact exists for (clientId, email) we auto-create one
   * and then issue the link. Used by transactional emails (invoices,
   * proposals, project updates) where the recipient is typically the
   * Client's billing email — which historically wasn't registered as
   * a portal contact, so the magic link silently failed and the CTA
   * bounced through `/portal/login`. By upserting on demand, the link
   * in the email "just works" on first click.
   *
   * Returns `null` (caller falls back to the plain portal URL) when
   * the contact exists but is INACTIVE — staff explicitly disabled
   * that contact, so we respect that decision instead of silently
   * reactivating them.
   */
  async ensureContactAndRequestLink(
    email: string,
    clientId: string,
    opts: { sendEmail?: boolean; next?: string | null; name?: string | null; ip?: string | null } = {},
  ): Promise<{ link: string; token: string; expiresAt: Date } | null> {
    const lc = email.toLowerCase();
    const existing = await this.prisma.clientContact.findUnique({
      where: { clientId_email: { clientId, email: lc } },
    });
    if (existing && existing.status !== "ACTIVE") {
      // Don't auto-reactivate a contact staff explicitly disabled.
      return null;
    }
    const contact =
      existing ??
      (await this.prisma.clientContact.create({
        data: { clientId, email: lc, name: opts.name ?? null, status: "ACTIVE" },
      }));
    return this.issueMagicLink(contact, opts.ip ?? null, {
      sendEmail: opts.sendEmail ?? true,
      next: opts.next,
    });
  }

  /**
   * Mint a view-only token for a single invoice. Unlike the
   * session-granting magic link, this token is:
   *   - Namespaced so {@link verify} cannot redeem it for a session.
   *   - Bound to the invoiceId so reusing it against another invoice
   *     yields a hash that doesn't exist in the DB (→ 404).
   *   - Stored in `ClientMagicLink` (reusing the table to avoid a
   *     migration); the `tokenHash` carries the namespace so a join
   *     on hash from `verify()` will never see these rows.
   *
   * Auto-creates an ACTIVE `ClientContact` for the recipient under
   * the given client when one doesn't already exist — the common
   * case where the invoice goes to the billing `client.email` that
   * was never registered as a portal contact. Returns `null` only
   * when an existing contact has been explicitly deactivated, so
   * staff-revoked access stays revoked.
   */
  async ensureContactAndIssueInvoiceViewToken(
    email: string,
    clientId: string,
    invoiceId: string,
    opts: { name?: string | null; ip?: string | null } = {},
  ): Promise<{ token: string; expiresAt: Date } | null> {
    const lc = email.toLowerCase();
    const existing = await this.prisma.clientContact.findUnique({
      where: { clientId_email: { clientId, email: lc } },
    });
    if (existing && existing.status !== "ACTIVE") {
      return null;
    }
    const contact =
      existing ??
      (await this.prisma.clientContact.create({
        data: { clientId, email: lc, name: opts.name ?? null, status: "ACTIVE" },
      }));
    const raw = randomBytes(32).toString("base64url");
    const tokenHash = invoiceViewHash(invoiceId, raw);
    const expiresAt = new Date(Date.now() + env.portalMagicLinkTtlMinutes * 60 * 1000);
    await this.prisma.clientMagicLink.create({
      data: { contactId: contact.id, tokenHash, expiresAt, ip: opts.ip ?? null },
    });
    return { token: raw, expiresAt };
  }

  /**
   * Look up a previously-issued invoice-view token. Returns the
   * owning contact + clientId so the public endpoint can authorize
   * the view. Pure DB lookup keyed on the namespaced hash —
   * mismatched (invoiceId, token) pairs simply miss.
   */
  async findInvoiceViewToken(
    invoiceId: string,
    rawToken: string,
  ): Promise<{ contactId: string; clientId: string } | null> {
    if (!rawToken) return null;
    const link = await this.prisma.clientMagicLink.findUnique({
      where: { tokenHash: invoiceViewHash(invoiceId, rawToken) },
      include: { contact: true },
    });
    if (!link || link.contact.status !== "ACTIVE") return null;
    return { contactId: link.contactId, clientId: link.contact.clientId };
  }

  private async issueMagicLink(
    contact: ClientContact,
    ip: string | null,
    opts: { sendEmail: boolean; next?: string | null },
  ): Promise<{ link: string; token: string; expiresAt: Date }> {
    const { raw, hash } = generateToken();
    const expiresAt = new Date(Date.now() + env.portalMagicLinkTtlMinutes * 60 * 1000);
    await this.prisma.clientMagicLink.create({
      data: { contactId: contact.id, tokenHash: hash, expiresAt, ip },
    });

    // Magic link points at the API verify endpoint, not the SPA. The
    // API exchanges the token for a session cookie and then redirects
    // the browser to the portal — to a specific deep link when `next`
    // is provided (so proposal/invoice emails open the right document
    // on first click instead of bouncing through the login page), or
    // to the portal home otherwise.
    const params = new URLSearchParams({ token: raw });
    const safeNext = sanitizePortalNext(opts.next);
    if (safeNext) params.set("next", safeNext);
    const link = `${env.apiUrl}/client-portal/auth/verify?${params.toString()}`;
    // Email send is best-effort: if SMTP is misconfigured we still want
    // the staff caller to receive the link so they can share manually.
    // Callers can suppress the email (e.g. PortalContactsService when
    // it's about to send a richer onboarding email itself) by passing
    // sendEmail=false — that way the contact doesn't get two pings.
    if (opts.sendEmail) {
      try {
        await this.mail.sendGenericEmail(contact.email, "Sign in to your portal", {
          kicker: "Client portal · Sign in",
          documentTitle: "Client portal",
          headline: "Your private portal link.",
          greeting: contact.name ? `Hi ${contact.name.split(" ")[0]},` : "Hi there,",
          intro:
            "Tap the button below to open your portal. You can bookmark this link — it'll keep working whenever you need to come back, so there's no password to remember.",
          cta: { label: "Open portal", url: link },
          footerNote:
            "This is a private link for you. Don't share it — anyone with the link can see your projects and invoices. If you didn't expect this email, just ignore it.",
        });
      } catch (err) {
        this.logger.warn(`Magic-link email failed for ${contact.email}: ${(err as Error).message}`);
      }
    }
    return { link, token: raw, expiresAt };
  }

  async verify(rawToken: string, ip: string | null, ua: string | null): Promise<{ sessionRaw: string; expiresAt: Date }> {
    const hash = sha256(rawToken);
    // Portal links are intentionally permanent and reusable: the same URL
    // emailed to a client works whenever they click it (today, tomorrow, a
    // year from now) until the contact's status changes. We deliberately do
    // NOT check `link.usedAt` or `link.expiresAt` — the single source of
    // truth for "can this person still access the portal?" is the contact's
    // ACTIVE status, which staff control from the client management UI.
    // This trades the bounded-window security of one-time links for a much
    // smoother client UX (no "link expired" friction from old emails).
    const link = await this.prisma.clientMagicLink.findUnique({
      where: { tokenHash: hash },
      include: { contact: true },
    });
    if (!link) throw new Error("invalid");
    if (link.contact.status !== "ACTIVE") throw new Error("invalid");

    const session = generateToken();
    const expiresAt = new Date(Date.now() + env.portalSessionTtlDays * 24 * 60 * 60 * 1000);
    await this.prisma.clientPortalSession.create({
      data: { contactId: link.contactId, tokenHash: session.hash, expiresAt, ip, userAgent: ua },
    });

    return { sessionRaw: session.raw, expiresAt };
  }

  async revoke(rawSession: string): Promise<void> {
    const hash = sha256(rawSession);
    await this.prisma.clientPortalSession.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
