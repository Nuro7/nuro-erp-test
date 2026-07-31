import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { NotificationType } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PaginationDto, getPagination } from "../../common/pagination/pagination.dto";
import { NotificationsService } from "../notifications/notifications.service";
import { CreateLeadDto } from "./dto/create-lead.dto";

interface FindAllLeadsQuery extends PaginationDto {
  status?: string;
  category?: string;
  assignedToId?: string;
  followUp?: "OVERDUE" | "TODAY" | "UPCOMING" | "NONE";
}

interface UserContext {
  id: string;
  roles?: any;
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(query: FindAllLeadsQuery, userCtx?: UserContext) {
    const { skip, take, page, pageSize } = getPagination(query);
    const where: any = {};

    // Staff scoping: non-admin / non-manager staff only see their assigned leads
    if (userCtx) {
      const rolesArray = Array.isArray(userCtx.roles) ? userCtx.roles : [];
      const roleCodes = rolesArray.map((r: any) => (typeof r === "string" ? r : r?.role?.code));
      const isPrivileged = roleCodes.some((code: string) =>
        ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER", "HR_MANAGER"].includes(code),
      );

      if (!isPrivileged) {
        where.assignedToId = userCtx.id;
      } else if (query.assignedToId) {
        where.assignedToId = query.assignedToId;
      }
    } else if (query.assignedToId) {
      where.assignedToId = query.assignedToId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.category) {
      where.category = { equals: query.category, mode: "insensitive" };
    }

    if (query.search) {
      where.OR = [
        { companyName: { contains: query.search, mode: "insensitive" as const } },
        { contactName: { contains: query.search, mode: "insensitive" as const } },
        { email: { contains: query.search, mode: "insensitive" as const } },
        { phone: { contains: query.search, mode: "insensitive" as const } },
        { campaignName: { contains: query.search, mode: "insensitive" as const } },
      ];
    }

    if (query.followUp) {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      if (query.followUp === "OVERDUE") {
        where.nextFollowUpAt = { lt: startOfDay };
      } else if (query.followUp === "TODAY") {
        where.nextFollowUpAt = { gte: startOfDay, lte: endOfDay };
      } else if (query.followUp === "UPCOMING") {
        where.nextFollowUpAt = { gt: endOfDay };
      } else if (query.followUp === "NONE") {
        where.nextFollowUpAt = null;
      }
    }

    try {
      const [data, total] = await this.prisma.$transaction([
        this.prisma.lead.findMany({
          where,
          include: {
            assignedTo: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
            convertedTo: { select: { id: true, companyName: true } },
          },
          skip,
          take,
          orderBy: [{ nextFollowUpAt: "asc" }, { createdAt: "desc" }],
        }),
        this.prisma.lead.count({ where }),
      ]);

      return {
        data,
        meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
      };
    } catch (err) {
      this.logger.warn(`findAll primary query failed: ${(err as Error).message}. Attempting resilient raw fallback.`);
      try {
        const rawData: any[] = await this.prisma.$queryRawUnsafe(
          `SELECT id, "companyName", "contactName", email, phone, source, status, "createdAt" FROM "Lead" ORDER BY "createdAt" DESC LIMIT ${take} OFFSET ${skip}`
        );
        const countRes: any[] = await this.prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as count FROM "Lead"`);
        const total = countRes[0]?.count ?? rawData.length;
        return {
          data: rawData.map(r => ({ ...r, category: "General" })),
          meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
        };
      } catch (rawErr) {
        this.logger.error(`Resilient raw fallback also failed: ${(rawErr as Error).message}`);
        return { data: [], meta: { page, pageSize, total: 0, pageCount: Math.ceil(0 / pageSize) } };
      }
    }
  }

  async create(dto: CreateLeadDto) {
    const { nextFollowUpAt, ...rest } = dto;
    const data: any = {
      ...rest,
      email: dto.email ?? "",
      category: dto.category?.trim() || "General",
      nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : null,
    };

    let lead: any;
    try {
      lead = await this.prisma.lead.create({ data });
    } catch (err) {
      this.logger.warn(`Lead create with extended fields failed: ${(err as Error).message}. Retrying with core fields.`);
      // Strip un-migrated DB fields if necessary
      const coreData = {
        companyName: dto.companyName,
        contactName: dto.contactName,
        email: dto.email ?? "",
        phone: dto.phone ?? null,
        source: dto.source ?? null,
        status: dto.status ?? "NEW",
        estimatedValue: dto.estimatedValue != null ? dto.estimatedValue : undefined,
        notes: dto.notes ?? null,
      };
      lead = await this.prisma.lead.create({ data: coreData });
    }

    try {
      const admins = await this.prisma.user.findMany({
        where: {
          status: "ACTIVE",
          roles: { some: { role: { code: { in: ["SUPER_ADMIN", "ADMIN"] } } } },
        },
        select: { id: true },
      });
      const recipients = new Set<string>(admins.map((u) => u.id));
      if (lead.assignedToId) recipients.add(lead.assignedToId);
      await Promise.all(
        Array.from(recipients).map((uid) =>
          this.notifications.create(uid, {
            type: NotificationType.GENERIC,
            title: `New lead: ${lead.companyName}`,
            body: `${lead.contactName}${lead.source ? ` · via ${lead.source}` : ""}${lead.estimatedValue ? ` · est. ₹${Number(lead.estimatedValue).toLocaleString("en-IN")}` : ""}`,
            link: `/leads`,
          }).catch(() => undefined),
        ),
      );
    } catch {
      /* non-fatal */
    }
    return lead;
  }

  async update(id: string, dto: Partial<CreateLeadDto>, userCtx?: UserContext) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      throw new NotFoundException("Lead not found.");
    }

    if (userCtx) {
      const rolesArray = Array.isArray(userCtx.roles) ? userCtx.roles : [];
      const roleCodes = rolesArray.map((r: any) => (typeof r === "string" ? r : r?.role?.code));
      const isPrivileged = roleCodes.some((code: string) =>
        ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER", "HR_MANAGER"].includes(code),
      );
      if (!isPrivileged && lead.assignedToId !== userCtx.id) {
        throw new NotFoundException("Lead not found or access denied.");
      }
    }

    const { nextFollowUpAt, ...rest } = dto;
    const data: any = { ...rest };
    if (nextFollowUpAt !== undefined) {
      data.nextFollowUpAt = nextFollowUpAt ? new Date(nextFollowUpAt) : null;
    }

    try {
      return await this.prisma.lead.update({
        where: { id },
        data,
      });
    } catch (err) {
      this.logger.warn(`Lead update failed with extended fields: ${(err as Error).message}. Retrying with core fields.`);
      delete data.category;
      delete data.nextFollowUpAt;
      delete data.campaignName;
      delete data.adsetName;
      delete data.adName;
      delete data.metaLeadId;
      delete data.assignedToId;
      return this.prisma.lead.update({
        where: { id },
        data,
      });
    }
  }

  /**
   * Get dynamic list of all distinct lead categories in the CRM.
   */
  async getCategories() {
    try {
      const leads = await this.prisma.lead.findMany({ select: { category: true } });
      const unique = Array.from(new Set(leads.map((l) => l.category).filter(Boolean)));
      const defaults = ["General", "Meta Campaign", "Inbound", "Outbound", "Web Form", "Referral", "Event", "Enterprise", "SMB"];
      return Array.from(new Set([...defaults, ...unique]));
    } catch {
      return ["General", "Meta Campaign", "Inbound", "Outbound", "Web Form", "Referral", "Event", "Enterprise", "SMB"];
    }
  }

  /**
   * Get list of all Meta Lead Ads campaigns with lead count breakdowns.
   */
  async getMetaCampaigns() {
    try {
      const campaigns = await this.prisma.lead.groupBy({
        by: ["campaignName"],
        where: { campaignName: { not: null } },
        _count: { id: true },
      });
      return campaigns.map((c) => ({
        campaignName: c.campaignName,
        leadCount: c._count.id,
      }));
    } catch {
      return [];
    }
  }

  async remove(id: string) {
    return this.prisma.lead.delete({ where: { id } });
  }

  /**
   * Ingest Meta (Facebook / Instagram) Lead Ads payload.
   * Supports both direct webhook triggers and raw Meta payload parsing.
   * Prevents duplicate insertion via metaLeadId.
   */
  async ingestMetaLead(payload: any) {
    // 1. Check if payload is in Meta Webhook wrapper format { entry: [...] }
    let metaLeadId = payload.metaLeadId || payload.leadgen_id;
    let contactName = payload.contactName || payload.full_name;
    let email = payload.email;
    let phone = payload.phone || payload.phone_number;
    let companyName = payload.companyName || payload.company;
    let campaignName = payload.campaignName || payload.campaign_name || "Meta Lead Ad Campaign";
    let adsetName = payload.adsetName || payload.adset_name;
    let adName = payload.adName || payload.ad_name;
    let notes = payload.notes || payload.form_name;
    let estimatedValue = payload.estimatedValue ? Number(payload.estimatedValue) : undefined;

    if (payload.entry && Array.isArray(payload.entry)) {
      for (const entryItem of payload.entry) {
        const changes = entryItem.changes || [];
        for (const change of changes) {
          const value = change.value || {};
          if (value.leadgen_id) metaLeadId = value.leadgen_id;
          if (value.form_id) notes = `Meta Form ID: ${value.form_id}`;
          const fieldData = value.field_data || [];
          for (const f of fieldData) {
            const name = (f.name || "").toLowerCase();
            const val = Array.isArray(f.values) ? f.values[0] : f.values;
            if (name.includes("name") || name.includes("full_name")) contactName = val;
            if (name.includes("email")) email = val;
            if (name.includes("phone")) phone = val;
            if (name.includes("company")) companyName = val;
          }
        }
      }
    }

    if (!contactName) contactName = "Meta Lead " + (metaLeadId ? `#${metaLeadId.slice(-4)}` : "");
    if (!companyName) companyName = contactName;

    // Duplicate check if metaLeadId provided
    if (metaLeadId) {
      const existing = await this.prisma.lead.findUnique({ where: { metaLeadId } });
      if (existing) {
        return { status: "DUPLICATE", lead: existing };
      }
    }

    // Auto-assign to an active Sales/Admin user if possible
    const defaultAssignee = await this.prisma.user.findFirst({
      where: {
        status: "ACTIVE",
        roles: { some: { role: { code: { in: ["ADMIN", "PROJECT_MANAGER", "SUPER_ADMIN"] } } } },
      },
      select: { id: true },
    });

    const lead = await this.prisma.lead.create({
      data: {
        companyName,
        contactName,
        email: email || "",
        phone: phone || null,
        source: "META_ADS",
        category: "Meta Campaign",
        status: "NEW",
        notes: notes || null,
        campaignName: campaignName || "Meta Ads",
        adsetName: adsetName || null,
        adName: adName || null,
        metaLeadId: metaLeadId || null,
        estimatedValue: estimatedValue || null,
        assignedToId: defaultAssignee?.id || null,
      },
    });

    try {
      const admins = await this.prisma.user.findMany({
        where: {
          status: "ACTIVE",
          roles: { some: { role: { code: { in: ["SUPER_ADMIN", "ADMIN"] } } } },
        },
        select: { id: true },
      });
      await Promise.all(
        admins.map((u) =>
          this.notifications.create(u.id, {
            type: NotificationType.GENERIC,
            title: `🎯 New Meta Ad Lead: ${lead.contactName}`,
            body: `Campaign: ${campaignName} · Source: Facebook/Instagram`,
            link: `/leads`,
          }).catch(() => undefined),
        ),
      );
    } catch {
      /* non-fatal */
    }

    return { status: "SUCCESS", lead };
  }

  /**
   * Bulk-create leads from a parsed CSV. Frontend has already mapped CSV
   * columns to our field names (companyName, contactName, email, phone,
   * source, status, estimatedValue, notes) — backend just validates and
   * inserts per row, skipping bad rows rather than failing the whole batch.
   *
   * Returns the createdCount + a list of skipped rows with reasons so the
   * UI can show a per-row failure summary.
   */
  async importCsv(rows: Array<Record<string, string>>) {
    const created: string[] = [];
    const skipped: Array<{ row: number; reason: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] ?? {};
      const contactName = (row.contactName ?? "").trim();
      // Company name is OPTIONAL on import. Meta Lead Ads, Google Forms,
      // and most lead-capture surfaces only collect person-level fields,
      // so we fall back to the contact name when company is missing —
      // the DB column is non-null and we'd rather ingest the lead with
      // a placeholder company the user can edit than reject it.
      const companyName = (row.companyName ?? "").trim() || contactName;
      if (!contactName) {
        skipped.push({ row: i + 1, reason: "Missing contact name" });
        continue;
      }

      const emailRaw = (row.email ?? "").trim();
      // Validate email only when provided — phone/walk-in leads are valid
      // without one. The Lead.email column is non-nullable so empty stays
      // as "" (matching the regular create() path).
      if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
        skipped.push({ row: i + 1, reason: `Invalid email: ${emailRaw}` });
        continue;
      }

      // estimatedValue may arrive as "₹50,000", "$1,200", "1200.50", etc.
      // Strip everything that isn't a digit or decimal point and parse.
      const estRaw = (row.estimatedValue ?? "").trim();
      const estimatedValue = estRaw
        ? Number(estRaw.replace(/[^0-9.]/g, "")) || undefined
        : undefined;

      // Normalise status — Meta exports often have lowercase / arbitrary
      // labels like "new", "follow_up". Map to our LeadStatus enum;
      // unknown values fall back to NEW (the default for a fresh lead).
      const statusRaw = (row.status ?? "").trim().toUpperCase().replace(/[\s-]/g, "_");
      const validStatuses = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST"] as const;
      type LeadStatusLiteral = (typeof validStatuses)[number];
      const status = (validStatuses as readonly string[]).includes(statusRaw)
        ? (statusRaw as LeadStatusLiteral)
        : undefined;

      try {
        const lead = await this.prisma.lead.create({
          data: {
            companyName,
            contactName,
            email: emailRaw,
            phone: (row.phone ?? "").trim() || null,
            source: (row.source ?? "").trim() || null,
            status: status ?? "NEW",
            estimatedValue: estimatedValue != null ? estimatedValue : undefined,
            notes: (row.notes ?? "").trim() || null,
          },
        });
        created.push(lead.id);
      } catch (err) {
        skipped.push({ row: i + 1, reason: (err as Error).message ?? "Create failed" });
      }
    }
    return { createdCount: created.length, skippedCount: skipped.length, skipped };
  }

  async convert(id: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      throw new NotFoundException("Lead not found.");
    }

    return this.prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          companyName: lead.companyName,
          contactPerson: lead.contactName,
          // Client.email is nullable + @unique; coerce empty-string from
          // an emailless lead to null so we don't trip the unique
          // constraint when two such leads convert.
          email: lead.email ? lead.email : null,
          phone: lead.phone,
        },
      });

      const updatedLead = await tx.lead.update({
        where: { id },
        data: {
          convertedToId: client.id,
          status: "WON",
        },
        include: { convertedTo: true },
      });

      return updatedLead;
    });
  }

  /**
   * Get staff members with CRM access along with their lead workload counts.
   */
  async getStaffWorkload() {
    // Find active staff (exclude client-portal accounts)
    const staffUsers = await this.prisma.user.findMany({
      where: {
        status: "ACTIVE",
        clientContacts: { none: {} },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        avatarUrl: true,
        roles: { select: { role: { select: { code: true, name: true } } } },
      },
      orderBy: { firstName: "asc" },
    });

    const leadCounts = await this.prisma.lead.groupBy({
      by: ["assignedToId", "status"],
      _count: { id: true },
    });

    const workloadMap: Record<string, { total: number; active: number; won: number; lost: number }> = {};
    for (const item of leadCounts) {
      const staffId = item.assignedToId || "unassigned";
      if (!workloadMap[staffId]) {
        workloadMap[staffId] = { total: 0, active: 0, won: 0, lost: 0 };
      }
      const count = item._count.id;
      workloadMap[staffId].total += count;
      if (item.status === "WON") workloadMap[staffId].won += count;
      else if (item.status === "LOST") workloadMap[staffId].lost += count;
      else workloadMap[staffId].active += count;
    }

    const unassignedCount = await this.prisma.lead.count({ where: { assignedToId: null } });

    return {
      staff: staffUsers.map((u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`.trim(),
        email: u.email,
        avatarUrl: u.avatarUrl,
        roles: u.roles.map((r) => r.role.name),
        workload: workloadMap[u.id] || { total: 0, active: 0, won: 0, lost: 0 },
      })),
      unassignedCount,
    };
  }

  /**
   * Auto-distribute leads equally across active staff members using Round-Robin.
   * If leadIds is omitted, auto-distributes all currently unassigned leads.
   * If rebalanceAll = true, re-balances ALL non-won/non-lost active leads equally!
   */
  async autoDistributeLeads(opts: { leadIds?: string[]; staffUserIds?: string[]; rebalanceAll?: boolean } = {}) {
    let targetStaffIds = opts.staffUserIds && opts.staffUserIds.length > 0 ? opts.staffUserIds : [];
    
    if (targetStaffIds.length === 0) {
      const activeStaff = await this.prisma.user.findMany({
        where: {
          status: "ACTIVE",
          clientContacts: { none: {} },
        },
        select: { id: true },
      });
      targetStaffIds = activeStaff.map((u) => u.id);
    }

    if (targetStaffIds.length === 0) {
      throw new NotFoundException("No active staff members available for lead distribution.");
    }

    let leadsToDistribute: Array<{ id: string }> = [];

    if (opts.leadIds && opts.leadIds.length > 0) {
      leadsToDistribute = await this.prisma.lead.findMany({
        where: { id: { in: opts.leadIds } },
        select: { id: true },
      });
    } else if (opts.rebalanceAll) {
      leadsToDistribute = await this.prisma.lead.findMany({
        where: { status: { notIn: ["WON", "LOST"] } },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
    } else {
      leadsToDistribute = await this.prisma.lead.findMany({
        where: { assignedToId: null },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
    }

    if (leadsToDistribute.length === 0) {
      return { success: true, count: 0, message: "No leads needed distribution." };
    }

    // Round-Robin distribution algorithm
    let staffIndex = 0;
    const distributionResult: Record<string, number> = {};
    targetStaffIds.forEach((id) => { distributionResult[id] = 0; });

    for (const lead of leadsToDistribute) {
      const assignedStaffId = targetStaffIds[staffIndex % targetStaffIds.length];
      await this.prisma.lead.update({
        where: { id: lead.id },
        data: { assignedToId: assignedStaffId },
      });
      distributionResult[assignedStaffId] = (distributionResult[assignedStaffId] || 0) + 1;
      staffIndex++;
    }

    // Send notifications to assigned staff
    try {
      await Promise.all(
        Object.entries(distributionResult).map(([staffId, count]) => {
          if (count > 0) {
            return this.notifications.create(staffId, {
              type: NotificationType.GENERIC,
              title: `📋 ${count} Leads Assigned to You`,
              body: `${count} leads have been assigned to your pipeline via equal round-robin distribution.`,
              link: `/leads`,
            }).catch(() => undefined);
          }
        }),
      );
    } catch {
      /* non-fatal */
    }

    return {
      success: true,
      count: leadsToDistribute.length,
      staffCount: targetStaffIds.length,
      distributionResult,
    };
  }

  /**
   * Bulk assign selected leads to a specific staff member.
   */
  async bulkAssignLeads(leadIds: string[], targetStaffId: string) {
    if (!leadIds || leadIds.length === 0) {
      throw new NotFoundException("No leads selected.");
    }
    const staff = await this.prisma.user.findUnique({ where: { id: targetStaffId } });
    if (!staff) {
      throw new NotFoundException("Target staff member not found.");
    }

    await this.prisma.lead.updateMany({
      where: { id: { in: leadIds } },
      data: { assignedToId: targetStaffId },
    });

    try {
      await this.notifications.create(targetStaffId, {
        type: NotificationType.GENERIC,
        title: `📋 ${leadIds.length} Leads Reassigned to You`,
        body: `${leadIds.length} leads have been transferred to your lead pipeline.`,
        link: `/leads`,
      });
    } catch {
      /* non-fatal */
    }

    return { success: true, count: leadIds.length, assignedToName: `${staff.firstName} ${staff.lastName}` };
  }
}
