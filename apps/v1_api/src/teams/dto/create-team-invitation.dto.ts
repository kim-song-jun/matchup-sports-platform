import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

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
