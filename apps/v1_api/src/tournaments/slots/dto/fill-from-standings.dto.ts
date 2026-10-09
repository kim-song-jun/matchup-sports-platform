// apps/v1_api/src/tournaments/slots/dto/fill-from-standings.dto.ts
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { MAX_GROUP_RANK_SLOTS } from '../../templates/group-rank-pairings';

export class SlotStandingsOverrideDto {
  @IsUUID()
  slotId!: string;

  @IsUUID()
  registrationId!: string;
}

export class FillFromStandingsDto {
  /** 동률 자리에서 운영자가 고른 팀. 자리 수 상한은 결선 크기 상한과 같다. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_GROUP_RANK_SLOTS)
  @ValidateNested({ each: true })
  @Type(() => SlotStandingsOverrideDto)
  overrides?: SlotStandingsOverrideDto[];
}
