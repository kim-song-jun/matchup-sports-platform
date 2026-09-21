import { IsBoolean, IsIn, IsInt, IsOptional, IsUUID, Max, Min, ValidateIf } from 'class-validator';

export class MutateTeamMatchRecordDto {
  @IsUUID() commandId!: string;
  @IsInt() @Min(0) expectedVersion!: number;
  @IsIn(['add', 'edit', 'delete', 'undo', 'confirm', 'reopen'])
  action!: 'add' | 'edit' | 'delete' | 'undo' | 'confirm' | 'reopen';
  @IsOptional() @IsUUID() goalId?: string;
  @IsOptional() @IsUUID() changeId?: string;
  @IsOptional() @IsUUID() sideId?: string;
  @IsOptional() @IsUUID() participantId?: string | null;
  @IsOptional() @IsBoolean() ownGoal?: boolean;
  @ValidateIf((dto: MutateTeamMatchRecordDto) => dto.minute != null)
  @IsInt() @Min(0) @Max(999) minute?: number | null;
}
