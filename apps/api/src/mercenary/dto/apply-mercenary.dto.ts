import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ApplyMercenaryDto {
  @ApiProperty({ required: false, description: 'Application message to the team' })
  @IsOptional()
  @IsString()
  message?: string;
}
