import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateAdminTeamMatchRecruitmentDto {
  @IsUUID()
  clientCommandId!: string;

  @IsUUID()
  sportId!: string;

  @IsUUID()
  regionId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string | null;

  @IsDateString()
  deadlineAt!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  manualPlaceName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  costNote?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rulesText?: string | null;
}

export class AssignAdminTeamMatchApplicationsDto {
  @IsUUID()
  clientCommandId!: string;

  @IsUUID()
  homeApplicationId!: string;

  @IsUUID()
  awayApplicationId!: string;
}
