import { IsString, MinLength, MaxLength, IsOptional, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PostMessageDto {
  @ApiProperty({ description: 'Message content (0-2000 chars; may be empty when imageUrl is provided)' })
  @IsString()
  @MinLength(0)
  @MaxLength(2000)
  content!: string;

  @ApiPropertyOptional({ description: 'Image URL attached to the message' })
  @IsOptional()
  @IsUrl()
  imageUrl?: string;
}
