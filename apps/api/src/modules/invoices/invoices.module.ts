import { Module } from "@nestjs/common";
import { PdfService } from "../../common/pdf/pdf.service";
import { FinanceModule } from "../finance/finance.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PortalAuthModule } from "../client-portal/auth/portal-auth.module";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";

@Module({
  imports: [FinanceModule, NotificationsModule, PortalAuthModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, PdfService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
