import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

const ACTIVITY_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const ACTIVITY_FREQUENCIES = ['weekly_1', 'weekly_2', 'weekly_3', 'weekly_4_plus', 'biweekly_1', 'irregular'] as const;
const ACTIVITY_TIME_SLOTS = ['morning', 'lunch', 'afternoon', 'evening', 'late_night'] as const;
const ACTIVITY_TYPES = [
  'regular_meetup',
  'friendly_match',
  'team_match',
  'tournament_prep',
  'training',
  'free_participation',
  'beginner_friendly',
  'competitive',
] as const;

export class MutateTeamDto {
  @IsUUID()
  sportId!: string;

  @IsString()
  @MaxLength(100)
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
  @IsArray()
  @IsIn(ACTIVITY_DAYS, { each: true })
  activityDays?: string[];

  @IsOptional()
  @IsIn(ACTIVITY_FREQUENCIES)
  activityFrequency?: string | null;

  @IsOptional()
  @IsArray()
  @IsIn(ACTIVITY_TIME_SLOTS, { each: true })
  activityTimeSlots?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(ACTIVITY_TYPES, { each: true })
  activityTypes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  activityMemo?: string | null;

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
  @Min(2)
  @Max(50)
  memberGoalCount?: number | null;
}

export class UpdateTeamDto extends MutateTeamDto {
  @IsString()
  version!: string;

  @IsOptional()
  @IsBoolean()
  membersVisibilityEnabled?: boolean;
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
  @IsIn(['owner', 'manager', 'member'])
  role!: 'owner' | 'manager' | 'member';
}

export class RemoveTeamMembershipDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}

export class LeaveTeamDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}
