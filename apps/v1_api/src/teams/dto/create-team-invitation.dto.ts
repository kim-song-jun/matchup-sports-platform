import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/** 한 번에 보낼 수 있는 초대 수. 화면의 받는 사람 칩 상한과 같다. */
export const TEAM_INVITATION_BATCH_MAX = 20;

export class CreateTeamInvitationDto {
  // require_tld: false — 회원가입 DTO 는 이메일 형식을 검사하지 않으므로, 여기서만 엄격하면
  // 가입은 되는데 초대는 못 하는 계정이 생긴다. 이 값은 기존 계정을 찾는 조회 키일 뿐
  // 메일 발송 주소가 아니다.
  @IsEmail({ require_tld: false }, { message: '이메일 형식이 올바르지 않아요.' })
  @MaxLength(254, { message: '이메일이 너무 길어요.' })
  invitedEmail: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  message?: string;
}

export class CreateTeamInvitationsBatchDto {
  /** 이메일(`@` 포함) 또는 닉네임을 정확히 적은 값. */
  @IsArray()
  @ArrayMinSize(1, { message: '초대할 사람을 한 명 이상 담아 주세요.' })
  @ArrayMaxSize(TEAM_INVITATION_BATCH_MAX, { message: `한 번에 ${TEAM_INVITATION_BATCH_MAX}명까지 초대할 수 있어요.` })
  @IsString({ each: true })
  @Matches(/\S/, { each: true, message: '빈 값은 담을 수 없어요.' })
  @MaxLength(254, { each: true, message: '너무 긴 값이 있어요.' })
  recipients: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  message?: string;
}
