import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, Res, HttpStatus } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { PaginationDto } from "../../common/pagination/pagination.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CreateLeadDto } from "./dto/create-lead.dto";
import { LeadsService } from "./leads.service";

@Controller("leads")
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  /**
   * Public Meta (Facebook/Instagram) Lead Ads Webhook verification (GET).
   * Meta sends hub.mode, hub.verify_token, hub.challenge to verify webhook endpoint.
   */
  @Get("meta-webhook")
  verifyMetaWebhook(
    @Query("hub.mode") mode?: string,
    @Query("hub.verify_token") verifyToken?: string,
    @Query("hub.challenge") challenge?: string,
  ) {
    if (mode === "subscribe" && challenge) {
      // Return plain challenge string to satisfy Meta's verification check
      return challenge;
    }
    return { ok: true, message: "Meta Lead Ads Webhook endpoint active" };
  }

  /**
   * Public Meta Lead Ads Webhook ingestion (POST).
   * Accepts both raw Meta webhook payloads and direct API lead posts from ad campaigns.
   */
  @Post("meta-webhook")
  async handleMetaWebhook(@Body() payload: any) {
    return this.leadsService.ingestMetaLead(payload);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.FINANCE_MANAGER, RoleCode.EMPLOYEE)
  @Get()
  findAll(
    @Query() query: any,
    @CurrentUser() user: { id: string; roles?: any },
  ) {
    return this.leadsService.findAll(query, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Post()
  create(@Body() dto: CreateLeadDto) {
    return this.leadsService.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: Partial<CreateLeadDto>,
    @CurrentUser() user: { id: string; roles?: any },
  ) {
    return this.leadsService.update(id, dto, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.leadsService.remove(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Post(":id/convert")
  convert(@Param("id") id: string) {
    return this.leadsService.convert(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Post("import")
  importCsv(@Body() body: { rows: Array<Record<string, string>> }) {
    return this.leadsService.importCsv(body.rows ?? []);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER)
  @Get("staff-workload")
  getStaffWorkload() {
    return this.leadsService.getStaffWorkload();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER)
  @Post("auto-distribute")
  autoDistributeLeads(@Body() body: { leadIds?: string[]; staffUserIds?: string[]; rebalanceAll?: boolean }) {
    return this.leadsService.autoDistributeLeads(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER)
  @Post("bulk-assign")
  bulkAssignLeads(@Body() body: { leadIds: string[]; targetStaffId: string }) {
    return this.leadsService.bulkAssignLeads(body.leadIds, body.targetStaffId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Get("categories")
  getCategories() {
    return this.leadsService.getCategories();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Get("sales-staff")
  getSalesStaff() {
    return this.leadsService.getSalesStaff();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Get("meta-campaigns")
  getMetaCampaigns() {
    return this.leadsService.getMetaCampaigns();
  }
}
