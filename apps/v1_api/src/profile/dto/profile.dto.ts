import { IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProfileDto {
  @IsString()
  @MaxLength(40)
  displayName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  nickname!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(320)
  email!: string;

  @IsOptional()
  @IsString()
  profileImageUrl?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d{8}$/)
  birthDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string | null;

  @IsIn(['public', 'members_only', 'private'])
  visibilityStatus!: 'public' | 'members_only' | 'private';
}

class SettingsNotificationsDto {
  @IsOptional()
  @IsBoolean()
  matchEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  teamEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  teamMatchEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  chatEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  noticeEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  marketingEnabled?: boolean;
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsIn(['public', 'members_only', 'private'])
  visibilityStatus?: 'public' | 'members_only' | 'private';

  @IsOptional()
  @ValidateNested()
  @Type(() => SettingsNotificationsDto)
  notifications?: SettingsNotificationsDto;
}

export class UpdateMyRegionsDto {
  @IsUUID()
  regionId!: string;
}

class MySportPreferenceDto {
  @IsUUID()
  sportId!: string;

  @IsOptional()
  @IsUUID()
  levelId?: string | null;
}

class MyRegionPreferenceDto {
  @IsUUID()
  regionId!: string;

  @IsBoolean()
  primary!: boolean;
}

export class UpdateMyPreferencesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MySportPreferenceDto)
  sports!: MySportPreferenceDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MyRegionPreferenceDto)
  regions!: MyRegionPreferenceDto[];
}

export class WithdrawalRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}
