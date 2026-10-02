import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * 팀 스코프 라인업 자산(히스토리·프리셋)에 접근할 수 있는지 판정한다.
 *
 * 팀 id는 URL에 그대로 드러나므로, id를 바꿔 가며 남의 팀 과거 라인업을 훑는 시도가
 * 가능하다. 그래서 **데이터를 만지기 전에** 이 검증을 먼저 통과해야 한다 — 존재하지
 * 않는 팀과 권한 없는 팀이 서로 다른 응답을 주면 그 자체로 팀 존재 여부를 알려주는
 * 신호가 되므로, 팀이 없을 때만 404이고 권한이 없으면 언제나 같은 403을 준다.
 */
export async function assertTeamLineupManager(
  prisma: PrismaService,
  teamId: string,
  userId: string,
): Promise<void> {
  const team = await prisma.v1Team.findFirst({
    where: { id: teamId, deletedAt: null },
    select: { id: true },
  });
  if (team === null) {
    throw new NotFoundException({ code: 'TEAM_NOT_FOUND', message: '팀을 찾을 수 없어요.' });
  }
  const membership = await prisma.v1TeamMembership.findFirst({
    where: { teamId, userId, status: 'active', role: { in: ['owner', 'manager'] } },
    select: { id: true },
  });
  if (membership === null) {
    throw new ForbiddenException({
      code: 'PERMISSION_DENIED',
      message: '팀장 또는 매니저만 팀 라인업을 관리할 수 있어요.',
    });
  }
}

/**
 * 팀 스코프 라인업 자산을 **볼 수** 있는지 판정한다 — 역할을 가리지 않고 활성 멤버면 된다.
 *
 * 위 `assertTeamLineupManager`(쓰기)와 나뉘어 있는 이유는 전술보드 때문이다: 배치를
 * 짜는 것은 팀 운영진이지만, 그 배치를 봐야 하는 사람은 그 경기에 뛰는 팀원 전체다.
 * 두 권한을 한 함수로 합치면 둘 중 하나가 반드시 틀린다 — 멤버에게 쓰기를 열거나,
 * 자기 팀 전술을 자기가 못 보게 된다.
 *
 * 404/403 구분 규칙은 위 함수와 동일하다(팀이 없을 때만 404, 권한 없으면 언제나 403).
 */
export async function assertTeamLineupMember(
  prisma: PrismaService,
  teamId: string,
  userId: string,
): Promise<void> {
  const team = await prisma.v1Team.findFirst({
    where: { id: teamId, deletedAt: null },
    select: { id: true },
  });
  if (team === null) {
    throw new NotFoundException({ code: 'TEAM_NOT_FOUND', message: '팀을 찾을 수 없어요.' });
  }
  const membership = await prisma.v1TeamMembership.findFirst({
    where: { teamId, userId, status: 'active' },
    select: { id: true },
  });
  if (membership === null) {
    throw new ForbiddenException({
      code: 'PERMISSION_DENIED',
      message: '팀원만 볼 수 있어요.',
    });
  }
}
