import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NOTIFICATION_EVENTS, NOTIFICATION_EVENT_KEYS, NotificationEventKey } from "./notification-events";

interface CachedPref {
  emailEnabled: boolean;
  inAppEnabled: boolean;
}

/**
 * Org-wide master switches for notification events. Backed by the
 * `NotificationPreference` table, with a 60s in-memory cache so the
 * gate doesn't add a DB roundtrip to every notify call.
 *
 * On first access for an unseen eventKey we lazily auto-create a row
 * with both channels enabled — same effect as the seed, just so a
 * fresh deployment without a seed run still works.
 */
@Injectable()
export class NotificationPreferencesService {
  private readonly logger = new Logger(NotificationPreferencesService.name);
  private cache: Map<string, CachedPref> | null = null;
  private cacheLoadedAt = 0;
  private readonly CACHE_TTL_MS = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.notificationPreference.findMany();
    const byKey = new Map(rows.map((r) => [r.eventKey, r]));
    // Always render every known event — fill in unseeded ones with
    // defaults so the UI never shows a half-populated table.
    return NOTIFICATION_EVENTS.map((meta) => {
      const row = byKey.get(meta.eventKey);
      return {
        eventKey: meta.eventKey,
        label: meta.label,
        description: meta.description,
        emailEnabled: row?.emailEnabled ?? true,
        inAppEnabled: row?.inAppEnabled ?? true,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  }

  async upsert(
    eventKey: string,
    data: { emailEnabled?: boolean; inAppEnabled?: boolean },
  ) {
    if (!NOTIFICATION_EVENT_KEYS.includes(eventKey as NotificationEventKey)) {
      throw new BadRequestException(`Unknown notification event: ${eventKey}`);
    }
    const patch: { emailEnabled?: boolean; inAppEnabled?: boolean } = {};
    if (typeof data.emailEnabled === "boolean") patch.emailEnabled = data.emailEnabled;
    if (typeof data.inAppEnabled === "boolean") patch.inAppEnabled = data.inAppEnabled;
    const row = await this.prisma.notificationPreference.upsert({
      where: { eventKey },
      update: patch,
      create: {
        eventKey,
        emailEnabled: patch.emailEnabled ?? true,
        inAppEnabled: patch.inAppEnabled ?? true,
      },
    });
    this.invalidate();
    return row;
  }

  async isEmailEnabled(eventKey: string): Promise<boolean> {
    return (await this.lookup(eventKey)).emailEnabled;
  }

  async isInAppEnabled(eventKey: string): Promise<boolean> {
    return (await this.lookup(eventKey)).inAppEnabled;
  }

  invalidate() {
    this.cache = null;
    this.cacheLoadedAt = 0;
  }

  private async lookup(eventKey: string): Promise<CachedPref> {
    if (!this.cache || Date.now() - this.cacheLoadedAt > this.CACHE_TTL_MS) {
      const rows = await this.prisma.notificationPreference.findMany();
      this.cache = new Map(
        rows.map((r) => [r.eventKey, { emailEnabled: r.emailEnabled, inAppEnabled: r.inAppEnabled }]),
      );
      this.cacheLoadedAt = Date.now();
    }
    const hit = this.cache.get(eventKey);
    if (hit) return hit;
    // Unknown event — default to on so a missing seed doesn't silently
    // suppress notifications. Log once so it shows up in ops review.
    this.logger.warn(`NotificationPreference row missing for eventKey="${eventKey}" — defaulting to enabled`);
    const defaults = { emailEnabled: true, inAppEnabled: true };
    this.cache.set(eventKey, defaults);
    return defaults;
  }
}
