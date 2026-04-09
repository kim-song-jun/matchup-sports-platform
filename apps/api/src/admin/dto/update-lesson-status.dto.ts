import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LessonStatus } from '@prisma/client';

export class UpdateLessonStatusDto {
  @ApiProperty({ enum: LessonStatus, description: '변경할 강좌 상태' })
  @IsEnum(LessonStatus)
  status!: LessonStatus;
}
