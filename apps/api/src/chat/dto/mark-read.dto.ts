import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MarkReadDto {
  @ApiProperty({ description: 'ID of the last message to mark as read' })
  @IsUUID()
  messageId!: string;
}
