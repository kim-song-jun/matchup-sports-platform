import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsString, IsOptional } from 'class-validator';

export class AckPushFailuresDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'IDs of WebPushFailureLog records to acknowledge. Omit or leave empty to acknowledge all within the current alert window.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];
}
