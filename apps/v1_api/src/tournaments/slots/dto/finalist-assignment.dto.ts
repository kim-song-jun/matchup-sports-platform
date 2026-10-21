import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString, IsUUID, Length, Matches, ValidateNested } from 'class-validator';

export class FinalistTargetDto {
  @IsUUID() fixtureId!: string;
  @IsIn(['HOME', 'AWAY']) side!: 'HOME' | 'AWAY';
  @IsUUID() registrationId!: string;
}

export class FinalistAssignmentDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) version!: string;
  @IsString() @Length(1, 500) @Matches(/\S/) reason!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(128) @ValidateNested({ each: true }) @Type(() => FinalistTargetDto)
  assignments!: FinalistTargetDto[];
}
