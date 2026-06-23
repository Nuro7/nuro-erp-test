import { Module } from "@nestjs/common";
import { PdfService } from "../../common/pdf/pdf.service";
import { PortalAuthModule } from "../client-portal/auth/portal-auth.module";
import { ProposalsController } from "./proposals.controller";
import { ProposalsService } from "./proposals.service";

@Module({
  imports: [PortalAuthModule],
  controllers: [ProposalsController],
  providers: [ProposalsService, PdfService],
})
export class ProposalsModule {}
