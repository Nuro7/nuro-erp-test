import { Type } from "class-transformer";
import { IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString } from "class-validator";
import { ProjectStatus } from "@prisma/client";

/**
 * Only `name` and `clientId` are required at the API boundary — the
 * service fills in sensible defaults for the rest:
 *
 *   startDate → today
 *   budget    → 0
 *   managerId → the authenticated actor
 *
 * The DB columns are still NOT NULL, but the UX shouldn't force PMs
 * to fill out a five-field modal just to spin up a quick project.
 * Previously these were @IsDateString / @IsNumber / @IsString without
 * @IsOptional, so leaving them blank in the form returned a 400 from
 * the class-validator pipe and the user only saw a generic toast.
 */
export class CreateProjectDto {
  @IsString()
  name!: string;

  @IsString()
  clientId!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  budget?: number;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @IsString()
  managerId?: string;

  @IsOptional()
  @IsArray()
  memberIds?: string[];
}
