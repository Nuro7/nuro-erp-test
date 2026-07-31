import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { env } from "../../config/env";
import { sha256 } from "./token.util";

export const PORTAL_COOKIE = "cp_session";

@Injectable()
export class ClientPortalGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    // Accept `Authorization: Bearer <session>` in addition to the
    // legacy `cp_session` cookie. The bearer path is what the SPA
    // uses now — cookies don't survive cross-origin requests when
    // the API and SPA are on unrelated domains (e.g.
    // nuro-api.onrender.com vs app.nuro7.com) under strict third-
    // party cookie policies (Brave, Safari ITP).
    const authHeader = (req.headers?.authorization ?? "") as string;
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    const cookie = req.cookies?.[PORTAL_COOKIE] as string | undefined;
    const raw = bearer || cookie;
    if (!raw) throw new UnauthorizedException("unauthenticated");

    const tokenHash = sha256(raw);
    const session = await this.prisma.clientPortalSession.findUnique({
      where: { tokenHash },
      include: { contact: true },
    });
    if (!session) throw new UnauthorizedException("unauthenticated");
    if (session.revokedAt) throw new UnauthorizedException("unauthenticated");
    if (session.expiresAt < new Date()) throw new UnauthorizedException("unauthenticated");
    if (session.contact.status !== "ACTIVE") throw new UnauthorizedException("unauthenticated");

    const newExpires = new Date(Date.now() + env.portalSessionTtlDays * 24 * 60 * 60 * 1000);
    await this.prisma.clientPortalSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), expiresAt: newExpires },
    });

    req.portal = { contactId: session.contactId, clientId: session.contact.clientId };
    return true;
  }
}
