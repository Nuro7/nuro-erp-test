import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { NotificationPreferencesService } from "./notification-preferences.service";

interface UpdateBody {
  emailEnabled?: boolean;
  inAppEnabled?: boolean;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("notification-preferences")
export class NotificationPreferencesController {
  constructor(private readonly service: NotificationPreferencesService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Get()
  list() {
    return this.service.list();
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Patch(":eventKey")
  update(@Param("eventKey") eventKey: string, @Body() body: UpdateBody) {
    return this.service.upsert(eventKey, body);
  }
}
