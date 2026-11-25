import { IsIn, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { PUSH_AUDIENCE_GENDERS, type PushAudienceGender } from '../admin-push-audience';

/** 확인창의 예상 수신 인원 조회 — 발송 요청(`AdminPushSendDto`)과 같은 대상·성별 규칙을 쓴다. */
export class AdminPushAudienceQueryDto {
  @IsIn(['broadcast', 'competition'])
  target!: 'broadcast' | 'competition';

  @ValidateIf((dto: AdminPushAudienceQueryDto) => dto.target === 'competition')
  @IsUUID()
  competitionId?: string;

  @IsOptional()
  @IsIn([...PUSH_AUDIENCE_GENDERS])
  gender?: PushAudienceGender;
}
