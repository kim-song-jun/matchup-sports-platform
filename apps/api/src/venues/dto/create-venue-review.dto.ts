import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateVenueReviewDto {
  @ApiProperty({ description: 'Overall rating (1-5)', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiProperty({ description: 'Facility rating (1-5)', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  facilityRating!: number;

  @ApiProperty({ description: 'Accessibility rating (1-5)', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  accessRating!: number;

  @ApiProperty({ description: 'Cost-effectiveness rating (1-5)', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  costRating!: number;

  @ApiPropertyOptional({ description: 'Ice quality rating (1-5, ice rinks only)', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  iceQuality?: number;

  @ApiPropertyOptional({ description: 'Review comment' })
  @IsString()
  @IsOptional()
  comment?: string;

  @ApiPropertyOptional({ description: 'Review image URLs', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  imageUrls?: string[];
}
