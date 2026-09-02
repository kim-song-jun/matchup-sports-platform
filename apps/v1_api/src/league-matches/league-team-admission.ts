import { UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { checkLeagueTeamAddAllowed } from './league-lifecycle-rules';
import { tierLabel } from './league-series-admin.service';

/**
 * **팀을 리그 로스터에 넣어도 되는가** 를 DB 를 보고 판정하는 단일 경로 (Task 164 BE-3).
 *
 * ## 왜 뽑아냈나
 * 지금까지 리그 로스터에 팀이 들어오는 길은 어드민 `addTeam` 하나였다. D7 이 **참가 신청
 * 확정**이라는 두 번째 길을 여는데, 확정 훅이 `v1LeagueTeam.create` 만 부르면
 * `addTeam` 이 지키는 불변식을 **전부 우회한다.** 특히 형제 티어 중복은 조용히 깨진다:
 * 같은 시즌의 다른 티어에 이미 있는 팀이 확정되면
 *   · 공개 순위표에 같은 팀이 두 티어에 동시에 노출되고(로스터 기준이라 대진 없이 즉시),
 *   · 승강 확정이 `computedByTeamId` 중복으로 **항상 422 PROMOTION_ENTRIES_DUPLICATED** 에
 *     막혀 그 시즌을 닫을 수 없게 된다.
 * 둘 다 에러 없이 데이터가 만들어진 뒤에야 드러난다. 그래서 두 길이 같은 함수를 지난다.
 *
 * ## 신청 경로가 이미 검사하는 것과 겹치는 부분
 * 신청 생성 시 `assertTeamManager`(팀 active) 와 `assertTeamSportMatchesTournament`(종목
 * 일치)를 이미 지난다. 그래도 여기서 다시 본다 — **신청과 확정 사이에 시간이 있다.**
 * 팀이 그 사이 해체되면(`status !== 'active'`) 없어진 팀이 리그 로스터에 들어간다.
 */
export type LeagueAdmissionBlocker =
  | { readonly kind: 'ALREADY_IN_LEAGUE' }
  | { readonly kind: 'TEAM_INVALID' }
  | { readonly kind: 'SIBLING_TIER'; readonly tier: number | null };

export async function findLeagueAdmissionBlocker(
  tx: Prisma.TransactionClient,
  input: { leagueId: string; teamId: string },
): Promise<LeagueAdmissionBlocker | null> {
  const league = await tx.v1League.findUnique({
    where: { id: input.leagueId },
    select: { id: true, sportId: true, seriesId: true, seasonNo: true },
  });
  if (league === null) return { kind: 'TEAM_INVALID' };

  const [alreadyInLeague, team] = await Promise.all([
    tx.v1LeagueTeam.findUnique({
      where: { leagueId_teamId: { leagueId: input.leagueId, teamId: input.teamId } },
      select: { leagueId: true },
    }),
    tx.v1Team.findFirst({
      where: { id: input.teamId, status: 'active', deletedAt: null },
      select: { id: true, sportId: true },
    }),
  ]);

  const blocked = checkLeagueTeamAddAllowed({
    alreadyInLeague: alreadyInLeague !== null,
    teamActive: team !== null,
    teamSportId: team?.sportId ?? '',
    leagueSportId: league.sportId,
  });
  if (blocked === 'ALREADY_IN_LEAGUE') return { kind: 'ALREADY_IN_LEAGUE' };
  if (blocked === 'TEAM_INVALID') return { kind: 'TEAM_INVALID' };

  // 형제 티어 중복 — 무소속 리그(seriesId === null)엔 형제가 없으므로 볼 필요가 없다.
  if (league.seriesId === null) return null;
  const sibling = await tx.v1League.findFirst({
    where: {
      seriesId: league.seriesId,
      seasonNo: league.seasonNo,
      id: { not: input.leagueId },
      teams: { some: { teamId: input.teamId } },
    },
    select: { tier: true },
  });
  return sibling === null ? null : { kind: 'SIBLING_TIER', tier: sibling.tier };
}

/**
 * 막힌 이유를 사용자 문구로. 전부 `LEAGUE_TEAM_INVALID` 한 코드 아래 있고 **메시지로만**
 * 갈린다 — 이 저장소가 이미 그렇게 하고 있고(같은 팀 두 번 / 미등록 팀도 같은 코드),
 * 구분 코드를 늘려도 읽는 쪽이 없다.
 */
export function leagueAdmissionBlockerMessage(blocker: LeagueAdmissionBlocker): string {
  if (blocker.kind === 'ALREADY_IN_LEAGUE') return '이미 참가 중인 팀이에요.';
  if (blocker.kind === 'TEAM_INVALID') return '리그 종목과 일치하는 활성 팀만 등록할 수 있어요.';
  return blocker.tier === null
    ? '이 팀은 이미 같은 시즌의 다른 리그에 참가 중이에요. 한 팀을 두 티어에 동시에 배정할 수 없어요.'
    : `이 팀은 이미 같은 시즌 ${tierLabel(blocker.tier)}에 참가 중이에요. 한 팀을 두 티어에 동시에 배정할 수 없어요.`;
}

/**
 * 로스터 행과 **짝이 되는 `confirmed` 등록**을 만든다 (Task 164 BE-3 ⑤).
 *
 * ## 왜 짝을 맞춰야 하나
 * D7 이후 리그 참가는 `V1TournamentRegistration` 이 정본이 되고, `V1LeagueTeam` 은
 * contract 까지 남는 거울이다. 백필(`league-team-registration-backfill.ts`)이 기존
 * 로스터 전부에 `confirmed` 등록을 만들어 **"로스터 행 ⟺ confirmed 등록"** 불변식을
 * 세워 뒀다. 로스터를 만드는 경로가 등록을 안 만들면 그 불변식이 그날부터 썩는다 —
 * 그리고 백필은 **한 번 돌고 끝났으므로** 아무도 다시 맞춰 주지 않는다.
 *
 * 로스터를 만드는 길은 **다섯**이다: 리그 생성(`create` 의 `teamIds`) · 어드민 `addTeam` ·
 * 시즌 시드 · 승계(다음 시즌 생성) · 참가 신청 확정. 마지막 하나만 등록에서 출발하므로,
 * 앞의 넷이 여기를 지난다.
 *
 * (처음엔 넷으로 셌다가 통합 스펙이 `create` 를 잡았다 — 유닛 fake 는 `v1League.create` 의
 * 중첩 `teams.createMany` 를 그냥 통과시켜서 로스터가 생겼다는 사실 자체가 안 보인다.)
 *
 * ## `entrySource` 를 왜 나누나
 * enum 에 `applied`·`promoted`·`seeded` 가 이미 있는데 지금까지 `seeded` 만 쓰였다.
 * 승계로 들어온 팀과 운영자가 손으로 넣은 팀은 **운영상 다른 사건**이다 — 다음 시즌
 * 참가 통보·이의 처리에서 "이 팀은 왜 여기 있나" 의 답이 다르다.
 *
 * ## `appliedByUserId` 는 `V1Team.ownerUserId` 에서 온다 (멤버십이 아니다)
 * 백필은 `V1TeamMembership(role='owner', status='active')` 를 봤다. 그건 **한 번 도는
 * 마이그레이션**이라 owner 를 못 찾으면 멈추는 게 맞았지만, 여기는 **리그를 만들 때마다
 * 지나는 경로**다. 멤버십 행을 요구하면 멀쩡히 돌던 리그 생성이 데이터 모양 때문에 새로
 * 실패할 수 있다(실제로 통합 스펙이 422 로 무너졌다 — 픽스처 팀엔 멤버십 행이 없다).
 *
 * `V1Team.ownerUserId` 는 **스키마상 non-null** 이고 `onDelete: Restrict` 라 가리키는 유저가
 * 반드시 있다. 소유권 이전(`teams.service.ts` 의 transfer)이 멤버십 role 과 이 필드를
 * **같은 트랜잭션에서** 함께 옮기므로 둘은 어긋나지 않는다. 즉 같은 답을 주면서 새 실패
 * 모드가 없는 쪽이다.
 */
export async function createLeagueRosterRegistration(
  tx: Prisma.TransactionClient,
  input: {
    leagueId: string;
    teamId: string;
    entrySource: 'promoted' | 'seeded';
    /** 등록 생성 시각. 로스터 행과 같은 값을 주면 두 축의 시각이 어긋나지 않는다. */
    createdAt?: Date;
  },
): Promise<void> {
  const team = await tx.v1Team.findUnique({
    where: { id: input.teamId },
    select: { ownerUserId: true },
  });
  if (team === null) {
    // 로스터 행이 같은 트랜잭션에서 이미 FK 를 통과했으므로 실질적으로 도달하지 않는다.
    // 그래도 500 대신 도메인 코드로 남긴다 — 도달했다면 그건 팀이 사라졌다는 뜻이다.
    throw new UnprocessableEntityException({
      code: 'LEAGUE_TEAM_INVALID',
      message: '없는 팀은 리그에 등록할 수 없어요.',
    });
  }
  await tx.v1TournamentRegistration.create({
    data: {
      tournamentId: input.leagueId,
      teamId: input.teamId,
      appliedByUserId: team.ownerUserId,
      status: 'confirmed',
      entrySource: input.entrySource,
      confirmedAt: input.createdAt ?? new Date(),
      ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt }),
    },
  });
}
