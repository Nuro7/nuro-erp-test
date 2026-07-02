import { ExecutionContext, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RoleCode } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type RequestUser = {
  id: string;
  email: string;
  name: string;
  roles: RoleCode[];
  permissions: string[];
};

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  // Cached so the demo bypass costs one DB lookup per process, not one per
  // request. Populated lazily on the first demo-mode request.
  private cachedDemoUser: RequestUser | null = null;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Demo mode (DEMO_MODE=true): skip JWT verification entirely and run
    // every request as the seeded "demo" account. This lets the public demo
    // open with a single click and zero login round-trip. Real authentication
    // is completely unaffected whenever the flag is unset — which is the
    // production default — so this is safe to leave in the codebase.
    if (process.env.DEMO_MODE === "true") {
      const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
      return this.resolveDemoUser().then((user) => {
        request.user = user;
        return true;
      });
    }
    return super.canActivate(context);
  }

  private async resolveDemoUser(): Promise<RequestUser> {
    if (this.cachedDemoUser) return this.cachedDemoUser;

    const user = await this.prisma.user.findFirst({
      where: { email: "demo" },
      include: {
        roles: {
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
    });

    // Seed hasn't run yet — fall back to a synthetic SUPER_ADMIN so the demo
    // still renders. User-scoped queries just return empty sets in that case.
    if (!user) {
      return {
        id: "demo",
        email: "demo",
        name: "Demo User",
        roles: [RoleCode.SUPER_ADMIN],
        permissions: [],
      };
    }

    this.cachedDemoUser = {
      id: user.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      roles: user.roles.map((entry) => entry.role.code as RoleCode),
      permissions: user.roles.flatMap((entry) =>
        entry.role.permissions.map(
          (permission) =>
            `${permission.permission.resource}:${permission.permission.action.toLowerCase()}`,
        ),
      ),
    };
    return this.cachedDemoUser;
  }
}
