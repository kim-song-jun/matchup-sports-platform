import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * PATCH /admin/settings/integrations 바디.
 * 필드가 undefined면 해당 값 유지, 빈 문자열("")이면 키 삭제(폴백 env var로 복귀),
 * 비어있지 않은 문자열이면 그 값으로 저장 — 부분 수정(PATCH) 시맨틱.
 */
export class UpdateIntegrationSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '카카오 REST API 키는 200자를 넘을 수 없어요.' })
  kakaoRestApiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '카카오맵 JS 키는 200자를 넘을 수 없어요.' })
  kakaoMapsJsKey?: string;
}
