import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class PreviewLeagueConversionDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3)
  @IsInt({ each: true }) @Min(2, { each: true }) @Max(100, { each: true })
  tierSizes!: number[];
}
export class LeagueConversionEntryDto {
  @IsUUID() teamId!: string;
  @IsInt() @Min(1) @Max(3) tier!: number;
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}
export class CommitLeagueConversionDto extends PreviewLeagueConversionDto {
  @IsString() @MinLength(1) @MaxLength(100) title!: string;
  @IsDateString() startsOn!: string;
  @IsDateString() endsOn!: string;
  @IsString() @Matches(/^[a-f0-9]{64}$/) fingerprint!: string;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(300)
  @ValidateNested({ each: true }) @Type(() => LeagueConversionEntryDto)
  entries!: LeagueConversionEntryDto[];
}
