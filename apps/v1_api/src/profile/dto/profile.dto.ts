import { IsArray, IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
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

  /**
   * 한 줄 소개. 컬럼(`V1UserProfile.bio`)은 오래전부터 있었지만 저장 경로가 없어
   * admin 조회로만 존재했다(프로덕션 실측 2026-08-24: 245개 프로필 중 비어 있지 않은
   * 값 1건). Task 154 P1 에서 사용자가 직접 쓰고 공개 프로필에 보이게 한다.
   *
   * 300자 상한은 카드 한 장에 접힘 없이 들어가는 분량 기준이다 -- 더 길면 프로필의
   * 다른 정보를 밀어낸다. null 로 보내면 지운다.
   */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  bio?: string | null;

  /**
   * 휴대폰 번호를 바꿀 때만 필요한 본인인증 증명. 가입과 같은 발급 경로
   * (POST /auth/phone/issue → verify)에서 받은 토큰을 그대로 전달한다.
   * 번호를 바꾸지 않는 저장에는 없어도 된다.
   */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  phoneProofToken?: string | null;

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
  @IsIn(['light', 'dark', 'system'])
  theme?: 'light' | 'dark' | 'system';

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

/**
 * 사용자 단위 공개 기록 동의 저장. granted=false 는 즉시 철회(REVOKED) — 개별
 * participant 스냅샷과 달리 이 스위치 하나가 사용자에 연결된 모든 참가 기록의
 * 공개 여부를 결정한다(과거 경기 포함, 시간 비교 없음).
 */
export class UpdateMyRecordConsentDto {
  @IsBoolean()
  granted!: boolean;

  @IsString()
  @IsNotEmpty()
  policyHash!: string;
}

/**
 * 대회 경기 기록(라인업/이벤트 득점자/MVP)에 닉네임 대신 실명을 보여줄지 (2026-08-18
 * 사용자 결정). `UpdateMyRecordConsentDto`와 달리 이건 "동의"가 아니라 표시 선호도
 * 스위치라 정책 버전을 감사할 `policyHash`가 없다 -- 대회 신청 때마다 다시 묻지 않고
 * 한 번 켜면 계속 적용되는 값이라서다. `PublicTournamentRecordsService`가 표시
 * 시점에 이 값을 조인해 즉시 반영한다.
 */
export class UpdateTournamentRealNameVisibilityDto {
  @IsBoolean()
  visible!: boolean;
}
