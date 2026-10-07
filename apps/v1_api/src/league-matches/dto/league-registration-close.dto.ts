import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CloseLeagueRegistrationDto {
  /** 공백만 보내면 null — 감사 로그에 빈 사유가 남지 않게 한다. */
  @IsOptional()
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const value = obj[key];
    return typeof value === 'string' ? value.trim() || null : value;
  })
  @IsString()
  @MaxLength(200)
  reason?: string | null;
}
