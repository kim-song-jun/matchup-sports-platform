import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, IsInt, Min, Max, IsOptional, IsEnum, IsBoolean, Matches } from 'class-validator';
import { SportType, MatchStyle } from '@prisma/client';

export class CreateTeamMatchDto {
  @ApiProperty() @IsUUID() hostTeamId!: string;
  @ApiProperty({ enum: SportType }) @IsEnum(SportType) sportType!: SportType;
  @ApiProperty() @IsString() title!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;
  @ApiProperty() @Matches(/^\d{4}-\d{2}-\d{2}$/) matchDate!: string;
  @ApiProperty() @Matches(/^\d{2}:\d{2}$/) startTime!: string;
  @ApiProperty() @Matches(/^\d{2}:\d{2}$/) endTime!: string;
  @ApiProperty({ required: false, default: 120 }) @IsOptional() @IsInt() @Min(30) totalMinutes?: number;
  @ApiProperty({ required: false, default: 4 }) @IsOptional() @IsInt() @Min(1) @Max(10) quarterCount?: number;
  @ApiProperty() @IsString() venueName!: string;
  @ApiProperty() @IsString() venueAddress!: string;
  @ApiProperty({ required: false }) @IsOptional() venueInfo?: Record<string, unknown>;
  @ApiProperty({ required: false, default: 0 }) @IsOptional() @IsInt() @Min(0) totalFee?: number;
  @ApiProperty({ required: false, default: 0 }) @IsOptional() @IsInt() @Min(0) opponentFee?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() paymentDeadline?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() cancellationPolicy?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(1) @Max(5) requiredLevel?: number;
  @ApiProperty({ required: false, default: false }) @IsOptional() @IsBoolean() hasProPlayers?: boolean;
  @ApiProperty({ required: false, default: true }) @IsOptional() @IsBoolean() allowMercenary?: boolean;
  @ApiProperty({ required: false, enum: MatchStyle }) @IsOptional() @IsEnum(MatchStyle) matchStyle?: MatchStyle;
  @ApiProperty({ required: false, default: false }) @IsOptional() @IsBoolean() hasReferee?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}
