import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateCompetitionConfigDto {
  @IsString()
  @MinLength(1)
  sportCode!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsObject()
  config!: Record<string, unknown>;
}

export class CreateCompetitionConfigVersionDto {
  @IsObject()
  config!: Record<string, unknown>;
}

export class ChangeTournamentCompetitionConfigDto {
  @IsString()
  @MinLength(1)
  competitionConfigVersionId!: string;

  @IsString()
  @MinLength(1)
  expectedVersion!: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  confirmRecalculation?: boolean;

  @ValidateIf((value: ChangeTournamentCompetitionConfigDto) => value.confirmRecalculation === true)
  @IsString()
  @MinLength(64)
  previewHash?: string;
}

/** GET /admin/competition-configs/lineup-size-options?sportId=... 의 쿼리. sportCode가
 * 아니라 sportId를 받는다 — 대회 생성/수정 화면이 이미 sportId만 알고 있고(선택된 종목),
 * sportCode로의 정규화는 서버가 대신 해준다. */
export class LineupSizeOptionsQueryDto {
  @IsUUID(undefined, { message: '올바른 종목 ID를 입력해 주세요.' })
  sportId!: string;
}

export class CompetitionConfigListQueryDto {
  @IsOptional()
  @IsString()
  sportCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;
}
