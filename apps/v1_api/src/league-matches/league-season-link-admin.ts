import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { LEAGUE_STATE_BY_STATUS } from '../tournaments/league-competition-mirror';
import { findTournamentOnSurface, LEAGUE_KINDS } from '../tournaments/tournament-surface-lookup';
import { assertNextSeasonSourceInTx, findNextSeasonLeague } from './league-season-link';
import type { LinkNextSeasonDto } from './dto/league-match.dto';

/**
 * 이미 따로 만든 독립 리그를 나중에 다음 시즌으로 잇고 푼다(2026-11-19 사용자 요청).
 *
 * 만들 때 잇는 길(`CreateLeagueMatchDto.previousLeagueId`)과 **같은 컬럼·같은 검사**(`assertNextSeasonSourceInTx`)를 쓴다.
 * 사후에 잇는 길만 더해진 것이라, 잇는 것만으로는 이미 들어온 팀·명단을 바꾸지 않는다 — 지난 시즌 팀은
 * 참가팀 관리의 '지난 시즌 팀 넣기'로 넣는다.
 */

type Db = Prisma.TransactionClient | PrismaService;

/** 후보 목록 상한. 최근 리그부터 보여 주고, 넘으면 `hasMore` 로 알린다. */
const CANDIDATE_LIMIT = 100;
/** 지난 시즌을 거슬러 올라가는 최대 단계 — 순환 판정이 끝나지 않는 일을 막는 안전장치다. */
const CHAIN_LIMIT = 100;

function leagueNotFound() {
  return new NotFoundException({ code: 'LEAGUE_NOT_FOUND', message: '리그를 찾을 수 없어요.' });
}

function nextSeasonInvalid(message: string) {
  return new UnprocessableEntityException({ code: 'LEAGUE_NEXT_SEASON_INVALID', message });
}

/**
 * `startId` 에서 지난 시즌을 거슬러 올라간 리그 id(자기 자신 제외, 가까운 것부터).
 * 지운 리그도 따라간다 — 지운 리그가 되살아나면 그 연결이 순환을 만들기 때문이다.
 */
export async function previousSeasonChain(db: Db, startId: string): Promise<string[]> {
  const chain: string[] = [];
  const seen = new Set<string>([startId]);
  let cursor: string = startId;
  while (chain.length < CHAIN_LIMIT) {
    const row: { previousLeagueId: string | null } | null = await findTournamentOnSurface(db, LEAGUE_KINDS, {
      where: { id: cursor },
      select: { previousLeagueId: true },
    });
    const parent = row?.previousLeagueId ?? null;
    if (parent === null || seen.has(parent)) break;
    seen.add(parent);
    chain.push(parent);
    cursor = parent;
  }
  return chain;
}

/** 두 리그 행을 id 순서로 잠근다 — 잇기·풀기·리그 체계 전환이 같은 행을 다른 순서로 잡아 서로 기다리는 일을 막는다. */
async function lockLeaguesInOrder(tx: Prisma.TransactionClient, ids: readonly string[]) {
  for (const id of [...new Set(ids)].sort()) {
    await tx.$queryRaw`SELECT id FROM "v1_tournaments" WHERE id = ${id} AND kind = 'regular_league' FOR UPDATE`;
  }
}

/**
 * 이 리그의 다음 시즌으로 이을 수 있는 리그 후보. 같은 종목의 독립 리그 중 지난 시즌이 아직 없는 것이고,
 * 자기 자신과 이 리그의 지난 시즌들(이으면 순환이 된다)은 뺀다. 최종 판정은 잇는 쪽 서버가 다시 한다.
 */
export async function listNextSeasonCandidates(
  prisma: PrismaService,
  admins: AdminContextService,
  user: V1AuthUser,
  leagueId: string,
) {
  await admins.getActiveAdmin(user.id);
  const previous = await findTournamentOnSurface(prisma, LEAGUE_KINDS, {
    where: { id: leagueId, deletedAt: null },
    select: { id: true, sportId: true },
  });
  if (previous === null) throw leagueNotFound();
  const ancestors = await previousSeasonChain(prisma, leagueId);
  const rows = await prisma.v1Tournament.findMany({
    where: {
      kind: 'regular_league',
      deletedAt: null,
      seriesId: null,
      previousLeagueId: null,
      sportId: previous.sportId,
      status: { not: 'cancelled' },
      id: { notIn: [leagueId, ...ancestors] },
    },
    orderBy: [{ scheduledAt: 'desc' }, { id: 'asc' }],
    take: CANDIDATE_LIMIT + 1,
    select: {
      id: true,
      title: true,
      status: true,
      scheduledAt: true,
      scheduledEndAt: true,
      _count: { select: { registrations: { where: { status: 'confirmed' } } } },
    },
  });
  return {
    leagueId,
    hasMore: rows.length > CANDIDATE_LIMIT,
    candidates: rows.slice(0, CANDIDATE_LIMIT).map((row) => ({
      leagueId: row.id,
      title: row.title,
      state: LEAGUE_STATE_BY_STATUS[row.status],
      startsOn: row.scheduledAt?.toISOString() ?? null,
      endsOn: row.scheduledEndAt?.toISOString() ?? null,
      confirmedCount: row._count.registrations,
    })),
  };
}

/** `leagueId` 리그의 다음 시즌으로 `dto.nextLeagueId` 리그를 잇는다. 이미 들어온 팀·명단은 바꾸지 않는다. */
export async function linkNextSeason(
  prisma: PrismaService,
  admins: AdminContextService,
  user: V1AuthUser,
  leagueId: string,
  dto: LinkNextSeasonDto,
) {
  const admin = await admins.getMutationAdmin(user.id);
  const nextLeagueId = dto.nextLeagueId;
  if (nextLeagueId === leagueId) throw nextSeasonInvalid('같은 리그를 다음 시즌으로 이을 수 없어요.');

  return prisma.$transaction(async (tx) => {
    await lockLeaguesInOrder(tx, [leagueId, nextLeagueId]);
    const next = await findTournamentOnSurface(tx, LEAGUE_KINDS, {
      where: { id: nextLeagueId, deletedAt: null },
      select: { id: true, title: true, sportId: true, seriesId: true, previousLeagueId: true, status: true },
    });
    if (next === null) throw nextSeasonInvalid('다음 시즌으로 이을 리그를 찾을 수 없어요.');
    // 지난 리그 쪽 판정(시작했거나 끝난 같은 종목 독립 리그, 전환하지 않음, 다음 시즌 없음)은 만들 때 잇는 길과 같은 함수다.
    const previous = await assertNextSeasonSourceInTx(tx, { previousLeagueId: leagueId, sportId: next.sportId });
    if (next.seriesId !== null) {
      throw nextSeasonInvalid('리그 체계에 속한 리그는 다음 시즌으로 이을 수 없어요. 리그 체계는 승강 확정으로 이어져요.');
    }
    if (next.status === 'cancelled') throw nextSeasonInvalid('취소된 리그는 다음 시즌으로 이을 수 없어요.');
    if (next.previousLeagueId !== null) {
      throw new ConflictException({ code: 'LEAGUE_PREVIOUS_SEASON_EXISTS', message: '이미 지난 시즌이 이어진 리그예요.' });
    }
    if ((await previousSeasonChain(tx, leagueId)).includes(nextLeagueId)) {
      throw nextSeasonInvalid('이 리그의 지난 시즌을 다음 시즌으로 이을 수 없어요.');
    }
    await tx.v1Tournament.update({ where: { id: nextLeagueId }, data: { previousLeagueId: leagueId } });
    await admins.logAdminAction(
      admin,
      {
        action: 'league_match.link_next_season',
        targetType: 'league_match',
        targetId: leagueId,
        afterJson: { previousLeagueId: leagueId, nextLeagueId },
      },
      tx,
    );
    return { leagueId, previousTitle: previous.title, nextSeason: { leagueId: next.id, title: next.title } };
  });
}

/** `leagueId` 리그에 이어진 다음 시즌 연결을 푼다. 이미 옮겨 온 명단은 그대로 남는다. */
export async function unlinkNextSeason(
  prisma: PrismaService,
  admins: AdminContextService,
  user: V1AuthUser,
  leagueId: string,
) {
  const admin = await admins.getMutationAdmin(user.id);
  return prisma.$transaction(async (tx) => {
    const current = await findNextSeasonLeague(tx, leagueId);
    if (current === null) {
      throw new UnprocessableEntityException({ code: 'LEAGUE_NEXT_SEASON_MISSING', message: '이어진 다음 시즌이 없어요.' });
    }
    // 잇기와 같은 순서(id 순)로 두 행을 잠근 뒤, 그 사이에 바뀌지 않았는지 다시 본다.
    await lockLeaguesInOrder(tx, [leagueId, current.id]);
    const locked = await findNextSeasonLeague(tx, leagueId);
    if (locked === null || locked.id !== current.id) {
      throw new ConflictException({ code: 'LEAGUE_NEXT_SEASON_CHANGED', message: '다른 운영 작업으로 다음 시즌 연결이 바뀌었어요. 화면을 새로 불러와 주세요.' });
    }
    await tx.v1Tournament.update({ where: { id: locked.id }, data: { previousLeagueId: null } });
    await admins.logAdminAction(
      admin,
      {
        action: 'league_match.unlink_next_season',
        targetType: 'league_match',
        targetId: leagueId,
        beforeJson: { previousLeagueId: leagueId, nextLeagueId: locked.id },
      },
      tx,
    );
    return { leagueId, unlinkedLeagueId: locked.id };
  });
}
