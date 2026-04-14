import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class VenueInfoDto {
  @ApiPropertyOptional({ description: 'Indoor (true) or outdoor (false) venue' })
  @IsBoolean()
  @IsOptional()
  isIndoor?: boolean;

  @ApiPropertyOptional({ description: 'Parking available' })
  @IsBoolean()
  @IsOptional()
  hasParking?: boolean;

  @ApiPropertyOptional({ description: 'Shower facilities available' })
  @IsBoolean()
  @IsOptional()
  hasShower?: boolean;

  @ApiPropertyOptional({ description: 'Additional venue notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}
