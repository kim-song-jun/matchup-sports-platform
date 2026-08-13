import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';

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

export class ChangeTeamMembershipJerseyDto {
  /**
   * 팀 고정 등번호. **null이면 해제**하고, 숫자면 그 번호로 지정한다.
   *
   * 필드 자체를 생략하는 것은 허용하지 않는다(Copilot 리뷰 지적). `@IsOptional`이었을
   * 때는 생략해도 검증을 통과했는데, 그러면 서비스가 Prisma update에 `undefined`를
   * 실어 보내고 Prisma는 그것을 "이 필드는 건드리지 마"로 해석한다 — 아무것도 바뀌지
   * 않았는데 200이 나가므로 해제한 줄 알았던 호출자가 조용히 속는다. `@ValidateIf`로
   * null일 때만 숫자 검증을 건너뛰게 해서, 생략은 400으로 막고 해제는 명시적인
   * `{"jerseyNumber": null}`로만 되게 한다.
   */
  @ValidateIf((_object, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  jerseyNumber!: number | null;
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
