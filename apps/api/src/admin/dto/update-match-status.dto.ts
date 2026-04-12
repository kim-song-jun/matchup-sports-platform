import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MatchStatus } from '@prisma/client';

export class UpdateMatchStatusDto {
  @ApiProperty({ enum: MatchStatus, enumName: 'MatchStatus', description: '변경할 매치 상태' })
  @IsEnum(MatchStatus)
  status!: MatchStatus;
}
