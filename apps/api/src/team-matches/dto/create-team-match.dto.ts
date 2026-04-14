import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, IsInt, Min, Max, IsOptional, IsEnum, IsBoolean, Matches, IsIn, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SportType, MatchStyle } from '@prisma/client';
import { VenueInfoDto } from './venue-info.dto';

export class CreateTeamMatchDto {
  @ApiProperty() @IsUUID() hostTeamId!: string;
  @ApiProperty({ enum: SportType, enumName: 'SportType' }) @IsEnum(SportType) sportType!: SportType;
  @ApiProperty() @IsString() title!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;
  @ApiProperty() @Matches(/^\d{4}-\d{2}-\d{2}$/) matchDate!: string;
  @ApiProperty() @Matches(/^\d{2}:\d{2}$/) startTime!: string;
  @ApiProperty() @Matches(/^\d{2}:\d{2}$/) endTime!: string;
  @ApiProperty({ required: false, default: 120 }) @IsOptional() @IsInt() @Min(30) totalMinutes?: number;
  @ApiProperty({ required: false, default: 4 }) @IsOptional() @IsInt() @Min(1) @Max(10) quarterCount?: number;
  @ApiProperty() @IsString() venueName!: string;
  @ApiProperty() @IsString() venueAddress!: string;

  @ApiProperty({ required: false, type: VenueInfoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => VenueInfoDto)
  venueInfo?: VenueInfoDto;

  @ApiProperty({ required: false, default: 0 }) @IsOptional() @IsInt() @Min(0) totalFee?: number;
  @ApiProperty({ required: false, default: 0 }) @IsOptional() @IsInt() @Min(0) opponentFee?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() paymentDeadline?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() cancellationPolicy?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(1) @Max(5) requiredLevel?: number;
  @ApiProperty({ required: false, default: false }) @IsOptional() @IsBoolean() hasProPlayers?: boolean;
  @ApiProperty({ required: false, default: true }) @IsOptional() @IsBoolean() allowMercenary?: boolean;
  @ApiProperty({ required: false, enum: MatchStyle, enumName: 'MatchStyle' }) @IsOptional() @IsEnum(MatchStyle) matchStyle?: MatchStyle;
  @ApiProperty({ required: false, default: false }) @IsOptional() @IsBoolean() hasReferee?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;

  // Matching meta fields (task 17)
  @ApiProperty({ required: false, enum: ['S', 'A+', 'A', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D'] })
  @IsOptional() @IsIn(['S', 'A+', 'A', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D'])
  skillGrade?: string;

  @ApiProperty({ required: false, enum: ['11:11', '8:8', '6:6', '5:5'] })
  @IsOptional() @IsIn(['11:11', '8:8', '6:6', '5:5'])
  gameFormat?: string;

  @ApiProperty({ required: false, enum: ['invitation', 'exchange', 'away'] })
  @IsOptional() @IsIn(['invitation', 'exchange', 'away'])
  matchType?: string;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional() @IsInt() @Min(0) @Max(20)
  proPlayerCount?: number;

  @ApiProperty({ required: false, maxLength: 30 })
  @IsOptional() @IsString() @MaxLength(30)
  uniformColor?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional() @IsBoolean()
  isFreeInvitation?: boolean;
}
