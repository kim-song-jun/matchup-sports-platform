import { IsIn, IsUUID, ValidateIf } from 'class-validator';

export class SetByeSideDto {
  @IsIn(['HOME', 'AWAY'])
  side!: 'HOME' | 'AWAY';

  @IsIn(['HOME', 'AWAY'])
  expectedSide!: 'HOME' | 'AWAY';
}

export class AssignSlotDto {
  /** null = 자리 비우기. 키를 아예 빼면 400 — 비우려면 null 을 명시한다. */
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  registrationId!: string | null;
}
