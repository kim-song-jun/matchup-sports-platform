import { Body, Controller, Param, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { AssignSlotDto } from './dto/tournament-slot.dto';
import { TournamentSlotService } from './tournament-slot.service';

/** 어드민 전용. 인증은 V1AuthGuard, 쓰기 권한(support 거부)은 서비스의 getMutationAdmin 이 다시 본다. */
@Controller()
@UseGuards(V1AuthGuard)
export class TournamentSlotController {
  constructor(private readonly slots: TournamentSlotService) {}

  @Put('admin/tournament-slots/:slotId/assignment')
  assign(
    @CurrentUser() user: V1AuthUser,
    @Param('slotId') slotId: string,
    @Body() dto: AssignSlotDto,
  ) {
    return this.slots.assignSlot(user, slotId, dto.registrationId);
  }
}
