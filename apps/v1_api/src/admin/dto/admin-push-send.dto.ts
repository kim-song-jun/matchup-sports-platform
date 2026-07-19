import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';

/**
 * 어드민 수동 웹 푸시 발송 요청.
 *
 * target이 'user'면 userId가 필수(특정 유저 1명 지정), 'broadcast'면 userId를
 * 무시하고 현재 구독 중인 전체 유저에게 발송한다. class-validator는 단일 DTO
 * 안에서 필드 간 상호 의존을 표현할 표준 데코레이터가 없어(@IsNotEmpty는 값 자체만
 * 봄) `@ValidateIf`로 target === 'user'일 때만 userId 존재를 요구하는 조합
 * 검증을 쓴다 — 이 패턴은 이 레포 다른 DTO(tournament-sponsor.dto.ts 등)에서도
 * 이미 쓰이는 컨벤션이다.
 */
export class AdminPushSendDto {
  @IsIn(['user', 'broadcast'])
  target!: 'user' | 'broadcast';

  @ValidateIf((dto: AdminPushSendDto) => dto.target === 'user')
  @IsUUID()
  userId?: string;

  @IsString()
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

  // 알림 target.route로 그대로 전달되므로, 외부 URL을 허용하면 운영자가 실수로
  // 피싱성 외부 이동 링크를 발송할 수 있다 — 앱 내부 상대 경로만 허용한다
  // (login 페이지의 sanitizeRedirect()와 동일한 open-redirect 방지 정책).
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^\/(?!\/)/, { message: 'url must be a relative in-app path starting with a single /' })
  url?: string;
}
