import {
  PrismaClient,
  RoleCode,
  PermissionAction,
  ProjectStatus,
  TaskStatus,
  Priority,
  EmploymentType,
  LeaveType,
  LeaveStatus,
  InvoiceStatus,
  ProposalStatus,
  UserStatus,
  MilestoneStatus,
  TransactionType,
  DocumentEntityType,
} from "@prisma/client";
import { createHash, randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

const passwordHash = hashPassword("ChangeMe123!");
// Demo login — username "demo", password "demo" (see login page). Full
// SUPER_ADMIN access so the whole app is browsable in the demo deployment.
const demoPasswordHash = hashPassword("demo");

const permissionSeeds = [
  ["users", PermissionAction.READ],
  ["users", PermissionAction.CREATE],
  ["users", PermissionAction.UPDATE],
  ["users", PermissionAction.DELETE],
  ["users", PermissionAction.INVITE],
  ["clients", PermissionAction.READ],
  ["clients", PermissionAction.CREATE],
  ["clients", PermissionAction.UPDATE],
  ["projects", PermissionAction.READ],
  ["projects", PermissionAction.CREATE],
  ["projects", PermissionAction.UPDATE],
  ["projects", PermissionAction.ASSIGN],
  ["tasks", PermissionAction.READ],
  ["tasks", PermissionAction.CREATE],
  ["tasks", PermissionAction.UPDATE],
  ["tasks", PermissionAction.COMMENT],
  ["hr", PermissionAction.READ],
  ["hr", PermissionAction.APPROVE],
  ["finance", PermissionAction.READ],
  ["finance", PermissionAction.CREATE],
  ["finance", PermissionAction.UPDATE],
  ["invoices", PermissionAction.READ],
  ["invoices", PermissionAction.CREATE],
  ["invoices", PermissionAction.SEND],
  ["reports", PermissionAction.READ],
  ["reports", PermissionAction.EXPORT],
  ["documents", PermissionAction.READ],
  ["documents", PermissionAction.UPLOAD],
  ["settings", PermissionAction.READ],
  ["settings", PermissionAction.UPDATE],
] as const;

const rolePermissions: Record<RoleCode, Array<[string, PermissionAction]>> = {
  SUPER_ADMIN: permissionSeeds as unknown as Array<[string, PermissionAction]>,
  ADMIN: permissionSeeds.filter(([resource]) => resource !== "settings") as unknown as Array<[string, PermissionAction]>,
  PROJECT_MANAGER: [
    ["clients", PermissionAction.READ],
    ["projects", PermissionAction.READ],
    ["projects", PermissionAction.UPDATE],
    ["projects", PermissionAction.ASSIGN],
    ["tasks", PermissionAction.READ],
    ["tasks", PermissionAction.CREATE],
    ["tasks", PermissionAction.UPDATE],
    ["tasks", PermissionAction.COMMENT],
    ["reports", PermissionAction.READ],
    ["documents", PermissionAction.READ],
    ["documents", PermissionAction.UPLOAD],
  ],
  HR_MANAGER: [
    ["users", PermissionAction.READ],
    ["hr", PermissionAction.READ],
    ["hr", PermissionAction.APPROVE],
    ["reports", PermissionAction.READ],
    ["documents", PermissionAction.READ],
  ],
  FINANCE_MANAGER: [
    ["clients", PermissionAction.READ],
    ["finance", PermissionAction.READ],
    ["finance", PermissionAction.CREATE],
    ["finance", PermissionAction.UPDATE],
    ["invoices", PermissionAction.READ],
    ["invoices", PermissionAction.CREATE],
    ["invoices", PermissionAction.SEND],
    ["reports", PermissionAction.READ],
    ["reports", PermissionAction.EXPORT],
  ],
  EMPLOYEE: [
    ["projects", PermissionAction.READ],
    ["tasks", PermissionAction.READ],
    ["tasks", PermissionAction.UPDATE],
    ["tasks", PermissionAction.COMMENT],
    ["documents", PermissionAction.READ],
  ],
  CLIENT: [
    ["projects", PermissionAction.READ],
    ["invoices", PermissionAction.READ],
    ["documents", PermissionAction.READ],
  ],
};

async function main() {
  // Wipe all application data before reseeding. A dynamic TRUNCATE … CASCADE
  // over every public table is used instead of a hand-ordered list of
  // deleteMany() calls: as new tables are added by later migrations, an
  // ordered list silently goes stale and a forgotten dependent (e.g. a
  // credit note referencing a client) trips a foreign-key constraint before
  // the seed can rebuild. Truncating everything at once with CASCADE is
  // order-independent and always clears the full schema. `_prisma_migrations`
  // is excluded so migration history survives.
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length > 0) {
    const names = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`,
    );
  }

  const permissions = await Promise.all(
    permissionSeeds.map(([resource, action]) =>
      prisma.permission.create({
        data: {
          resource,
          action,
          name: `${resource}:${action.toLowerCase()}`,
        },
      }),
    ),
  );

  const roles = await Promise.all(
    Object.values(RoleCode).map((code) =>
      prisma.role.create({
        data: {
          code,
          name: code.replaceAll("_", " "),
          permissions: {
            create: rolePermissions[code].map(([resource, action]) => ({
              permission: {
                connect: {
                  resource_action: {
                    resource,
                    action,
                  },
                },
              },
            })),
          },
        },
      }),
    ),
  );

  const superAdminRole = roles.find((role) => role.code === RoleCode.SUPER_ADMIN)!;
  const pmRole = roles.find((role) => role.code === RoleCode.PROJECT_MANAGER)!;
  const financeRole = roles.find((role) => role.code === RoleCode.FINANCE_MANAGER)!;
  const hrRole = roles.find((role) => role.code === RoleCode.HR_MANAGER)!;
  const employeeRole = roles.find((role) => role.code === RoleCode.EMPLOYEE)!;
  const clientRole = roles.find((role) => role.code === RoleCode.CLIENT)!;

  const admin = await prisma.user.create({
    data: {
      email: "admin@nuro7.com",
      passwordHash,
      firstName: "Nuro7",
      lastName: "Admin",
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      roles: {
        create: [{ roleId: superAdminRole.id }],
      },
      employeeProfile: {
        create: {
          department: "Operations",
          designation: "Super Admin",
          salary: 250000,
          joinDate: new Date("2024-01-01"),
          employmentType: EmploymentType.FULL_TIME,
          performanceScore: 4.8,
        },
      },
    },
  });

  const demoUser = await prisma.user.create({
    data: {
      email: "demo",
      passwordHash: demoPasswordHash,
      firstName: "Demo",
      lastName: "User",
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      roles: {
        create: [{ roleId: superAdminRole.id }],
      },
      employeeProfile: {
        create: {
          department: "Operations",
          designation: "Demo Admin",
          salary: 120000,
          joinDate: new Date("2024-01-01"),
          employmentType: EmploymentType.FULL_TIME,
          performanceScore: 5,
        },
      },
    },
  });

  const manager = await prisma.user.create({
    data: {
      email: "pm@nuro7.com",
      passwordHash,
      firstName: "Riya",
      lastName: "Mehta",
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      roles: {
        create: [{ roleId: pmRole.id }],
      },
      employeeProfile: {
        create: {
          department: "Delivery",
          designation: "Project Manager",
          salary: 175000,
          joinDate: new Date("2024-02-10"),
          employmentType: EmploymentType.FULL_TIME,
          performanceScore: 4.6,
        },
      },
    },
  });

  const financeManager = await prisma.user.create({
    data: {
      email: "finance@nuro7.com",
      passwordHash,
      firstName: "Aarav",
      lastName: "Kapoor",
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      roles: {
        create: [{ roleId: financeRole.id }],
      },
      employeeProfile: {
        create: {
          department: "Finance",
          designation: "Finance Manager",
          salary: 165000,
          joinDate: new Date("2024-03-14"),
          employmentType: EmploymentType.FULL_TIME,
          performanceScore: 4.4,
        },
      },
    },
  });

  const hrManager = await prisma.user.create({
    data: {
      email: "hr@nuro7.com",
      passwordHash,
      firstName: "Priya",
      lastName: "Nair",
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      roles: {
        create: [{ roleId: hrRole.id }],
      },
      employeeProfile: {
        create: {
          department: "People Ops",
          designation: "HR Manager",
          salary: 160000,
          joinDate: new Date("2024-04-01"),
          employmentType: EmploymentType.FULL_TIME,
          performanceScore: 4.5,
        },
      },
    },
  });

  const engineer = await prisma.user.create({
    data: {
      email: "engineer@nuro7.com",
      passwordHash,
      firstName: "Kunal",
      lastName: "Verma",
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      roles: {
        create: [{ roleId: employeeRole.id }],
      },
      employeeProfile: {
        create: {
          department: "Engineering",
          designation: "AI Engineer",
          salary: 140000,
          joinDate: new Date("2024-05-01"),
          employmentType: EmploymentType.FULL_TIME,
          performanceScore: 4.3,
        },
      },
    },
  });

  const clientPortalUser = await prisma.user.create({
    data: {
      email: "client@acme.com",
      passwordHash,
      firstName: "Nina",
      lastName: "Shah",
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      roles: {
        create: [{ roleId: clientRole.id }],
      },
    },
  });

  const client = await prisma.client.create({
    data: {
      companyName: "Acme Health Labs",
      contactPerson: "Nina Shah",
      email: "client@acme.com",
      phone: "+91-9999999999",
      address: "Bengaluru, India",
      website: "https://acmehealthlabs.example",
      notes: "Strategic AI delivery client.",
      portalUserId: clientPortalUser.id,
      contracts: {
        create: {
          title: "AI Automation Master Services Agreement",
          startDate: new Date("2025-01-01"),
          value: 350000,
          status: "Active",
        },
      },
    },
  });

  const project = await prisma.project.create({
    data: {
      name: "Conversational Care Assistant",
      clientId: client.id,
      description: "Internal patient support workflow platform with AI copilots.",
      startDate: new Date("2025-02-01"),
      endDate: new Date("2025-08-30"),
      budget: 225000,
      status: ProjectStatus.ACTIVE,
      managerId: manager.id,
      members: {
        create: [
          {
            userId: manager.id,
            roleLabel: "Project Manager",
            allocation: 40,
          },
          {
            userId: engineer.id,
            roleLabel: "AI Engineer",
            allocation: 80,
          },
          {
            userId: demoUser.id,
            roleLabel: "Demo Admin",
            allocation: 50,
          },
        ],
      },
      milestones: {
        create: [
          {
            title: "Discovery and solution design",
            description: "Workshops, backlog, and architecture signoff.",
            dueDate: new Date("2025-03-10"),
          },
          {
            title: "MVP release",
            description: "Client dashboard, workflow automations, and reporting.",
            dueDate: new Date("2025-06-15"),
            status: MilestoneStatus.IN_PROGRESS,
          },
        ],
      },
    },
  });

  const task = await prisma.task.create({
    data: {
      projectId: project.id,
      title: "Build AI triage workflow",
      description: "Create the orchestration pipeline and escalation dashboard.",
      assignedToId: engineer.id,
      status: TaskStatus.IN_PROGRESS,
      priority: Priority.HIGH,
      dueDate: new Date("2025-05-12"),
      estimatedHrs: 32,
    },
  });

  await prisma.taskComment.create({
    data: {
      taskId: task.id,
      authorId: manager.id,
      content: "Keep the workflow event-driven so ops can extend it later.",
    },
  });

  // A couple of tasks assigned to the demo user so the "My Tasks" views and
  // dashboard task board show data when signed in as demo.
  await prisma.task.createMany({
    data: [
      {
        projectId: project.id,
        title: "Review demo deployment checklist",
        description: "Walk through the hosted environment and confirm each module loads.",
        assignedToId: demoUser.id,
        status: TaskStatus.IN_PROGRESS,
        priority: Priority.MEDIUM,
        dueDate: new Date("2025-06-20"),
        estimatedHrs: 6,
      },
      {
        projectId: project.id,
        title: "Prepare client onboarding deck",
        description: "Draft slides summarizing project scope and timeline.",
        assignedToId: demoUser.id,
        status: TaskStatus.TODO,
        priority: Priority.HIGH,
        dueDate: new Date("2025-06-28"),
        estimatedHrs: 4,
      },
    ],
  });

  await prisma.timeEntry.create({
    data: {
      userId: engineer.id,
      projectId: project.id,
      taskId: task.id,
      startTime: new Date("2025-04-10T04:00:00.000Z"),
      endTime: new Date("2025-04-10T08:30:00.000Z"),
      duration: 270,
      notes: "Integrated vector retrieval and escalation routing.",
    },
  });

  await prisma.attendance.create({
    data: {
      userId: engineer.id,
      date: new Date("2025-04-10"),
      checkIn: new Date("2025-04-10T03:30:00.000Z"),
      checkOut: new Date("2025-04-10T12:30:00.000Z"),
      totalHours: 9,
    },
  });

  await prisma.leaveBalance.createMany({
    data: [
      { userId: engineer.id, leaveType: LeaveType.ANNUAL, totalDays: 18, usedDays: 3, remaining: 15 },
      { userId: engineer.id, leaveType: LeaveType.SICK, totalDays: 8, usedDays: 1, remaining: 7 },
      { userId: engineer.id, leaveType: LeaveType.CASUAL, totalDays: 6, usedDays: 0, remaining: 6 },
    ],
  });

  await prisma.leaveRequest.create({
    data: {
      userId: engineer.id,
      leaveType: LeaveType.ANNUAL,
      startDate: new Date("2025-05-20"),
      endDate: new Date("2025-05-22"),
      status: LeaveStatus.APPROVED,
      approvedById: admin.id,
      reason: "Family travel",
    },
  });

  await prisma.resourceAllocation.create({
    data: {
      userId: engineer.id,
      projectId: project.id,
      allocatedHours: 120,
      roleLabel: "AI Engineer",
      startDate: new Date("2025-04-01"),
      endDate: new Date("2025-06-30"),
    },
  });

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: "INV-2025-0001",
      clientId: client.id,
      projectId: project.id,
      amount: 75000,
      tax: 13500,
      total: 88500,
      status: InvoiceStatus.SENT,
      dueDate: new Date("2025-05-05"),
      createdById: financeManager.id,
      items: {
        create: [
          {
            description: "AI workflow design and implementation sprint",
            quantity: 1,
            price: 75000,
            total: 75000,
          },
        ],
      },
    },
  });

  const revenue = await prisma.revenue.create({
    data: {
      title: "Milestone payment from Acme Health Labs",
      source: "Client Payment",
      amount: 88500,
      receivedAt: new Date("2025-04-20"),
      createdById: financeManager.id,
    },
  });

  await prisma.transaction.create({
    data: {
      type: TransactionType.REVENUE,
      amount: 88500,
      reference: invoice.invoiceNumber,
      revenueId: revenue.id,
      createdById: financeManager.id,
    },
  });

  const expense = await prisma.expense.create({
    data: {
      title: "AWS model inference spend",
      category: "Cloud",
      amount: 18500,
      spentAt: new Date("2025-04-18"),
      createdById: financeManager.id,
      notes: "Inference and vector indexing cost for project workloads.",
    },
  });

  await prisma.transaction.create({
    data: {
      type: TransactionType.EXPENSE,
      amount: 18500,
      reference: "AWS-APR-2025",
      expenseId: expense.id,
      createdById: financeManager.id,
    },
  });

  await prisma.proposal.create({
    data: {
      clientId: client.id,
      projectId: project.id,
      projectName: "Expansion Phase",
      description: "Proposal for multilingual support and analytics automation.",
      timeline: "12 weeks",
      pricing: "INR 14,00,000",
      status: ProposalStatus.SENT,
      createdById: manager.id,
      blocks: {
        create: [
          {
            heading: "Objectives",
            content: "Extend the assistant into multilingual workflows and leadership reporting.",
            sortOrder: 1,
          },
          {
            heading: "Delivery model",
            content: "Dedicated pod with PM, AI engineer, and frontend engineer.",
            sortOrder: 2,
          },
        ],
      },
    },
  });

  await prisma.document.create({
    data: {
      fileUrl: "/uploads/contracts/acme-msa-v1.pdf",
      fileName: "acme-msa-v1.pdf",
      entityType: DocumentEntityType.CLIENT,
      clientId: client.id,
      uploadedById: admin.id,
      mimeType: "application/pdf",
      sizeInBytes: 184000,
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: manager.id,
        title: "Invoice sent",
        body: "INV-2025-0001 was sent to Acme Health Labs.",
        actionUrl: `/finance?invoice=${invoice.id}`,
      },
      {
        userId: engineer.id,
        title: "Task updated",
        body: "Build AI triage workflow is due on May 12.",
        actionUrl: `/tasks?task=${task.id}`,
      },
      {
        userId: demoUser.id,
        title: "Welcome to Nuro7",
        body: "You're signed in as the demo admin. Explore projects, finance, and HR.",
        actionUrl: `/dashboard`,
      },
      {
        userId: demoUser.id,
        title: "New task assigned",
        body: "Review demo deployment checklist is due on June 20.",
        actionUrl: `/tasks`,
      },
    ],
  });

  console.log(`Seeded ${permissions.length} permissions, ${roles.length} roles, and demo ERP data.`);

  // ── HR foundation seed enrichment ──
  const managerUser = await prisma.user.findFirst({
    where: { roles: { some: { role: { code: RoleCode.PROJECT_MANAGER } } } },
    select: { id: true },
  });
  const reportProfile = await prisma.employeeProfile.findFirst({
    where: { managerId: null, user: { id: { not: managerUser?.id } } },
    select: { id: true, userId: true },
  });
  if (managerUser && reportProfile) {
    await prisma.employeeProfile.update({
      where: { id: reportProfile.id },
      data: { managerId: managerUser.id },
    });
  }

  const hrAuthor = await prisma.user.findFirst({
    where: { roles: { some: { role: { code: RoleCode.HR_MANAGER } } } },
    select: { id: true },
  });
  if (hrAuthor && reportProfile) {
    const existingNote = await prisma.hrNote.findFirst({
      where: { employeeId: reportProfile.id, body: "Initial HR note seeded for development testing." },
      select: { id: true },
    });
    if (!existingNote) {
      await prisma.hrNote.create({
        data: {
          employeeId: reportProfile.id,
          authorId: hrAuthor.id,
          category: "GENERAL",
          body: "Initial HR note seeded for development testing.",
        },
      });
    }
  }

  // Seed default NotificationPreference rows so the Settings →
  // Notifications UI renders with sensible defaults (everything on)
  // the first time an admin opens it. Idempotent: re-running leaves
  // any toggle the admin has already changed alone.
  const NOTIFICATION_EVENT_KEYS = [
    "ACCOUNT_CREATED",
    "PROJECT_ASSIGNED",
    "PROJECT_DEADLINE_3D",
    "PROJECT_DEADLINE_1D",
    "PROJECT_OVERDUE",
    "TASK_ASSIGNED",
    "TASK_DUE_SOON",
    "ATTENDANCE_ABSENT",
    "ATTENDANCE_MISSED_PUNCH",
    "ATTENDANCE_HALF_DAY_AUTO",
    "ATTENDANCE_LATE_STREAK",
    "LEAVE_APPROVED",
    "LEAVE_REJECTED",
    "HOLIDAY_UPCOMING",
  ];
  for (const eventKey of NOTIFICATION_EVENT_KEYS) {
    await prisma.notificationPreference.upsert({
      where: { eventKey },
      update: {},
      create: { eventKey, emailEnabled: true, inAppEnabled: true },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
