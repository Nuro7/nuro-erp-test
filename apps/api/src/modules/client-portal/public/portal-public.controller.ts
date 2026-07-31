import { Controller, Get, Header, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { PortalPublicService } from "./portal-public.service";
import { InvoicesService } from "../../invoices/invoices.service";

/**
 * Public, unauthenticated portal views. Routes here intentionally do
 * NOT use `ClientPortalGuard` — auth is the (view-only, invoice-
 * scoped) token in the `?t=` query string. `Referrer-Policy:
 * no-referrer` so any outbound subresource fetch can't leak the
 * token via the Referer header.
 */
@Controller("client-portal/public")
export class PortalPublicController {
  constructor(
    private readonly svc: PortalPublicService,
    private readonly staff: InvoicesService,
  ) {}

  @Get("invoices/:id")
  @Header("Referrer-Policy", "no-referrer")
  @Header("Cache-Control", "no-store")
  invoice(@Param("id") id: string, @Query("t") token: string) {
    return this.svc.getInvoiceByToken(id, token);
  }

  @Get("invoices/:id/pdf")
  async invoicePdf(
    @Param("id") id: string,
    @Query("t") token: string,
    @Res() res: Response,
  ) {
    await this.svc.assertInvoiceOwnedByToken(id, token);
    const buffer = await this.staff.exportPdf(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="invoice-${id}.pdf"`);
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    return res.send(buffer);
  }
}
