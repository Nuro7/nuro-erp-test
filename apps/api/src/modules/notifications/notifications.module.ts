import { Module } from "@nestjs/common";
import { NotificationPreferencesController } from "./notification-preferences.controller";
import { NotificationPreferencesService } from "./notification-preferences.service";
import { NotificationsController } from "./notifications.controller";
import { NotificationsGateway } from "./notifications.gateway";
import { NotificationsScheduler } from "./notifications.scheduler";
import { NotificationsService } from "./notifications.service";

@Module({
  controllers: [NotificationsController, NotificationPreferencesController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    NotificationsScheduler,
    NotificationPreferencesService,
  ],
  exports: [NotificationsService, NotificationPreferencesService],
})
export class NotificationsModule {}
