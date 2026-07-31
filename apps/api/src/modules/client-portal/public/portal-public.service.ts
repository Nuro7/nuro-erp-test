import { Injectable, NotFoundException } from "@nestjs/common";
import { PortalInvoicesService } from "../invoices/portal-invoices.service";
import { PortalMeService } from "../me/portal-me.service";
import { PortalAuthService } from "../auth/portal-auth.service";

/**
 * Public, tokenized portal views — used for the "view invoice" link
 * in transactional emails. We deliberately do NOT rely on the session
 * cookie here: clients on different browsers / devices / strict
 * third-party cookie policies (Brave, Safari Intelligent Tracking
 * Prevention) couldn't keep a cross-origin session, and the CTA in
 * the invoice email would silently bounce to /portal/login.
 *
 * Auth model: the `?t=` token is a *view-only* token issued at email
 * send time and stored in a namespaced row in `ClientMagicLink`. It
 * CANNOT be redeemed at `/auth/verify` for a portal session (the
 * stored hash uses a `inv-view:<invoiceId>:` prefix that verify()
 * doesn't compute) and it can only ever open the one invoice it was
 * issued for (the invoiceId is mixed into the hash). A leaked URL
 * therefore exposes one invoice, not the client's whole portal.
 */
@Injectable()
export class PortalPublicService {
  constructor(
    private readonly auth: PortalAuthService,
    private readonly invoices: PortalInvoicesService,
    private readonly me: PortalMeService,
  ) {}

  /**
   * Returns the invoice detail + org letterhead in a single payload
   * so the public view page only needs one round-trip (no
   * portalApi.me() call that would require a session). Shape matches
   * what the existing portal invoice page passes to
   * <NuroInvoicePrint />.
   */
  async getInvoiceByToken(invoiceId: string, token: string) {
    const owner = await this.auth.findInvoiceViewToken(invoiceId, token);
    if (!owner) {
      // Same 404 for missing / wrong-invoice / revoked tokens so
      // leaked tokens can't be used to probe for valid IDs.
      throw new NotFoundException();
    }
    const [invoice, org] = await Promise.all([
      this.invoices.detail(owner.clientId, invoiceId),
      this.me.me(owner.contactId, owner.clientId),
    ]);
    return { invoice, org };
  }

  async assertInvoiceOwnedByToken(invoiceId: string, token: string): Promise<string> {
    const owner = await this.auth.findInvoiceViewToken(invoiceId, token);
    if (!owner) throw new NotFoundException();
    await this.invoices.assertOwned(owner.clientId, invoiceId);
    return owner.clientId;
  }
}
