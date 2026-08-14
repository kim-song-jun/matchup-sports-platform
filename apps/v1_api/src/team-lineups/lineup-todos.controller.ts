import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { LineupTodoService } from './lineup-todo.service';

/**
 * 내가 팀장·매니저로 있는 팀들의 "아직 라인업을 넣지 않은 다가오는 경기".
 *
 * 알림(푸시·인앱)과 달리 이 목록은 상태를 저장하지 않고 볼 때마다 다시 계산한다 —
 * 알림을 놓쳤거나 지웠어도, 알림이 아예 꺼져 있어도 여기에는 남아 있다.
 */
@Controller('me')
@UseGuards(V1AuthGuard)
export class LineupTodosController {
  constructor(private readonly todoService: LineupTodoService) {}

  @Get('lineup-todos')
  lineupTodos(@CurrentUser() user: V1AuthUser) {
    return this.todoService.listForUser(user);
  }
}
