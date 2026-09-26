import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class MutateTeamMatchRecordDto {
  @IsUUID() commandId!: string;
  @IsInt() @Min(0) expectedVersion!: number;
  @IsIn(['add', 'edit', 'delete', 'undo', 'confirm', 'reopen', 'submatch_add', 'submatch_edit', 'submatch_delete'])
  action!: 'add' | 'edit' | 'delete' | 'undo' | 'confirm' | 'reopen' | 'submatch_add' | 'submatch_edit' | 'submatch_delete';
  @IsOptional() @IsUUID() goalId?: string;
  @IsOptional() @IsUUID() changeId?: string;
  @IsOptional() @IsUUID() subMatchId?: string | null;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) title?: string;
  @IsOptional() @IsUUID() sideId?: string;
  @IsOptional() @IsUUID() participantId?: string | null;
  @IsOptional() @IsBoolean() ownGoal?: boolean;
  @ValidateIf((dto: MutateTeamMatchRecordDto) => dto.minute != null)
  @IsInt() @Min(0) @Max(999) minute?: number | null;
}
