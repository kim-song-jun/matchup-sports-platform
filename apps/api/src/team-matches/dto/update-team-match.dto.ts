import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateTeamMatchDto } from './create-team-match.dto';

export class UpdateTeamMatchDto extends PartialType(OmitType(CreateTeamMatchDto, ['hostTeamId'] as const)) {}
