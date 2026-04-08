import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserBlockDto {
  @ApiProperty({ description: '차단할 사용자 ID' })
  @IsString()
  blockedId: string;

  @ApiPropertyOptional({ description: '차단 사유', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
