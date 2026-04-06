import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsInt, Min, Max, IsOptional, IsString } from 'class-validator';

export class EvaluateTeamMatchDto {
  @ApiProperty() @IsUUID() evaluatorTeamId!: string;
  @ApiProperty() @IsUUID() evaluatedTeamId!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(5) levelAccuracy!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(5) infoAccuracy!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(5) mannerRating!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(5) punctuality!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(5) paymentClarity!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(5) cooperation!: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() comment?: string;
}
