import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class CompleteMatchParticipantDto {
  @IsString()
  participantId!: string;

  @IsIn(['completed', 'no_show'])
  status!: 'completed' | 'no_show';
}

export class CompleteMatchDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CompleteMatchParticipantDto)
  participants!: CompleteMatchParticipantDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}
