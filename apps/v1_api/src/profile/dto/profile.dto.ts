import { IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  realName?: string | null;

  /** @deprecated Rolling-deploy compatibility for clients that predate realName. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  displayName?: string | null;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  nickname!: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(320)
  email?: string | null;

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

  @IsIn(['male', 'female'])
  gender!: 'male' | 'female';

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
