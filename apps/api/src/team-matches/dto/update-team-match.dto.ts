import { PartialType, OmitType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { TeamMatchStatus } from '@prisma/client';
import { CreateTeamMatchDto } from './create-team-match.dto';

export class UpdateTeamMatchDto extends PartialType(OmitType(CreateTeamMatchDto, ['hostTeamId'] as const)) {
  @IsOptional()
  @IsEnum(TeamMatchStatus)
  status?: TeamMatchStatus;
}
