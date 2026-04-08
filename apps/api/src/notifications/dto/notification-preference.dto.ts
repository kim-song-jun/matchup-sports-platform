import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateNotificationPreferenceDto {
  @ApiPropertyOptional({ description: 'Enable match notifications' })
  @IsOptional()
  @IsBoolean()
  matchEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable team notifications' })
  @IsOptional()
  @IsBoolean()
  teamEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable chat notifications' })
  @IsOptional()
  @IsBoolean()
  chatEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable payment notifications' })
  @IsOptional()
  @IsBoolean()
  paymentEnabled?: boolean;
}
