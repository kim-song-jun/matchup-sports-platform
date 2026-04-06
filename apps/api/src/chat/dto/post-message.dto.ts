import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PostMessageDto {
  @ApiProperty({ description: 'Message content (1-2000 chars)' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;
}
