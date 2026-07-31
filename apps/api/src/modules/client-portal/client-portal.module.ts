import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { InvoicesModule } from "../invoices/invoices.module";
import { ClientPortalGuard } from "./client-portal.guard";
import { PortalAuthModule } from "./auth/portal-auth.module";
import { PortalProjectsController } from "./projects/portal-projects.controller";
import { PortalProjectsService } from "./projects/portal-projects.service";
import { PortalMeController } from "./me/portal-me.controller";
import { PortalMeService } from "./me/portal-me.service";
import { PortalProposalsController } from "./proposals/portal-proposals.controller";
import { PortalProposalsService } from "./proposals/portal-proposals.service";
import { PortalRequestsController } from "./requests/portal-requests.controller";
import { PortalRequestsService } from "./requests/portal-requests.service";
import { PortalInvoicesController } from "./invoices/portal-invoices.controller";
import { PortalInvoicesService } from "./invoices/portal-invoices.service";
import { PortalChatController } from "./chat/portal-chat.controller";
import { PortalChatService } from "./chat/portal-chat.service";
import { PortalPublicController } from "./public/portal-public.controller";
import { PortalPublicService } from "./public/portal-public.service";

@Module({
  imports: [NotificationsModule, InvoicesModule, PortalAuthModule],
  controllers: [PortalProjectsController, PortalMeController, PortalProposalsController, PortalRequestsController, PortalInvoicesController, PortalChatController, PortalPublicController],
  providers: [ClientPortalGuard, PortalProjectsService, PortalMeService, PortalProposalsService, PortalRequestsService, PortalInvoicesService, PortalChatService, PortalPublicService],
  exports: [ClientPortalGuard, PortalAuthModule],
})
export class ClientPortalModule {}
