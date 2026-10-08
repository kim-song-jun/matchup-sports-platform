import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { BracketTemplateService } from './bracket-template.service';
import { ApplyBracketTemplateDto } from './dto/bracket-template.dto';

/** 어드민 전용. 인증은 V1AuthGuard, 쓰기 권한(support 거부)은 서비스의 getMutationAdmin 이 다시 본다. */
@Controller()
@UseGuards(V1AuthGuard)
export class BracketTemplateController {
  constructor(private readonly templates: BracketTemplateService) {}

  @Post('admin/tournaments/:tournamentId/bracket/template')
  apply(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: ApplyBracketTemplateDto,
  ) {
    return this.templates.apply(user, tournamentId, dto);
  }
}
