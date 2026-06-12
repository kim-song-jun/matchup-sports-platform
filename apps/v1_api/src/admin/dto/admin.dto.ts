import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

// ─── List query DTOs ──────────────────────────────────────────────────────────

export class AdminUserListQueryDto {
  @IsOptional()
  @IsIn(['active', 'suspended', 'blocked', 'withdrawal_pending', 'deleted'])
  status?: 'active' | 'suspended' | 'blocked' | 'withdrawal_pending' | 'deleted';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class AdminMatchListQueryDto {
  @IsOptional()
  @IsIn(['recruiting', 'closed', 'cancelled', 'completed', 'archived'])
  status?: 'recruiting' | 'closed' | 'cancelled' | 'completed' | 'archived';

  @IsOptional()
  @IsUUID()
  sportId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class AdminTeamListQueryDto {
  @IsOptional()
  @IsIn(['active', 'suspended', 'archived'])
  status?: 'active' | 'suspended' | 'archived';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class AdminTeamMatchListQueryDto {
  @IsOptional()
  @IsIn(['recruiting', 'matched', 'cancelled', 'completed', 'archived'])
  status?: 'recruiting' | 'matched' | 'cancelled' | 'completed' | 'archived';

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class AdminOverviewQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ChangeUserStatusDto {
  @IsIn(['active', 'suspended', 'blocked', 'deleted'])
  status!: 'active' | 'suspended' | 'blocked' | 'deleted';

  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class ChangeMatchStatusDto {
  @IsIn(['recruiting', 'closed', 'cancelled', 'completed', 'archived'])
  status!: 'recruiting' | 'closed' | 'cancelled' | 'completed' | 'archived';

  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class ChangeTeamStatusDto {
  @IsIn(['active', 'suspended', 'archived'])
  status!: 'active' | 'suspended' | 'archived';

  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class ChangeTeamMatchStatusDto {
  @IsIn(['recruiting', 'matched', 'cancelled', 'completed', 'archived'])
  status!: 'recruiting' | 'matched' | 'cancelled' | 'completed' | 'archived';

  @IsString()
  @MaxLength(500)
  reason!: string;
}

// ─── Admin-management DTOs ────────────────────────────────────────────────────

export class AdminListQueryDto {
  @IsOptional()
  // Read filter only — aligns with all displayed admin states (V1AdminStatus
  // includes `suspended`, shown as 정지 with a 재부여 action). The write DTO
  // (UpdateAdminDto) intentionally excludes `suspended`: owners grant/revoke/
  // re-grant, there is no owner "suspend" action, and allowing it would need
  // last-owner lockout-guard coverage first.
  @IsIn(['active', 'suspended', 'revoked'])
  status?: 'active' | 'suspended' | 'revoked';

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class GrantAdminDto {
  @IsUUID()
  userId!: string;

  @IsIn(['ops', 'support'])
  adminRole!: 'ops' | 'support';

  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class UpdateAdminDto {
  @IsOptional()
  @IsIn(['ops', 'support', 'owner'])
  adminRole?: 'ops' | 'support' | 'owner';

  @IsOptional()
  @IsIn(['active', 'revoked'])
  status?: 'active' | 'revoked';

  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class AdminLogsQueryDto {
  @IsOptional()
  @IsUUID()
  adminUserId?: string;

  @IsOptional()
  @IsString()
  targetType?: string;

  @IsOptional()
  @IsString()
  targetId?: string;

  @IsOptional()
  @IsString()
  actionType?: string;

  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
