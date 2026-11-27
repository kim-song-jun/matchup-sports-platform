import { IsIn, IsUUID, ValidateIf } from 'class-validator';

export class SetByeSideDto {
  @IsIn(['HOME', 'AWAY'])
  side!: 'HOME' | 'AWAY';

  @IsIn(['HOME', 'AWAY'])
  expectedSide!: 'HOME' | 'AWAY';
}

export class MoveByeDto extends SetByeSideDto {
  @IsUUID() sourceFixtureId!: string;
  @IsUUID() targetFixtureId!: string;
  @IsUUID() expectedOrigin!: string;
}

export class AssignSlotDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsUUID()
  swapSlotId?: string;

  @ValidateIf(o => o.swapSlotId !== undefined && o.expectedRegistrationId !== null)
  @IsUUID()
  expectedRegistrationId?: string | null;

  /** null = 자리 비우기. 키를 아예 빼면 400 — 비우려면 null 을 명시한다. */
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  registrationId!: string | null;
}
