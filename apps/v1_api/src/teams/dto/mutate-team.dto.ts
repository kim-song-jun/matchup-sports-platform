import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class MutateTeamDto {
  @IsUUID()
  sportId!: string;

  @IsUUID()
  regionId!: string;

  @IsString()
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsString()
  logoUrl?: string | null;

  @IsOptional()
  @IsString()
  coverImageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  introduction?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  activityAreaText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  skillLevelText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  minLevelCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  maxLevelCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  genderRule?: string | null;

  @IsIn(['approval_required', 'closed'])
  joinPolicy!: 'approval_required' | 'closed';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  memberGoalCount?: number | null;
}

export class UpdateTeamDto extends MutateTeamDto {
  @IsString()
  version!: string;
}

export class TeamMembersQueryDto {
  @IsOptional()
  @IsIn(['owner', 'manager', 'member'])
  role?: 'owner' | 'manager' | 'member';

  @IsOptional()
  @IsIn(['active', 'left', 'removed'])
  status?: 'active' | 'left' | 'removed';

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ChangeTeamMembershipRoleDto {
  @IsIn(['manager', 'member'])
  role!: 'manager' | 'member';
}

export class RemoveTeamMembershipDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}
