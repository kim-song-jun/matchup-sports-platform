import type { V1TournamentDetail } from '@/types/api';

export interface NextFixtureRef {
  /** 콘솔 경로의 `fixtureId` — 대회는 대진 id, 리그는 팀매치 id. */
  readonly fixtureId: string;
  /** 대회는 "홈 vs 원정", 리그는 대진 제목("2주차 1경기"). */
  readonly label: string;
}

interface Candidate {
  readonly fixtureId: string;
  readonly label: string;
  readonly startMs: number | null;
  readonly finished: boolean;
}

function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * 방금 끝난 경기 다음에 치를 경기. 일정 시각 순으로 늘어놓고 현재 경기 뒤의 첫 미종료 경기를
 * 고른다 — 시각이 없는 경기는 맨 뒤로 보낸다. 현재 경기를 목록에서 찾지 못하면 `null`
 * (엉뚱한 경기를 "다음"이라 부르지 않는다).
 */
export function findNextFixture(
  tournament: Pick<V1TournamentDetail, 'fixtures' | 'leagueFixtures'>,
  currentFixtureId: string,
): NextFixtureRef | null {
  const candidates: Candidate[] = [
    ...tournament.fixtures.map((fixture) => ({
      fixtureId: fixture.id,
      label: `${fixture.homeTeamName ?? '미정'} vs ${fixture.awayTeamName ?? '미정'}`,
      startMs: toMs(fixture.scheduledAt),
      finished: fixture.liveStatus === 'ended' || fixture.liveStatus === 'cancelled',
    })),
    ...tournament.leagueFixtures.map((fixture) => ({
      fixtureId: fixture.teamMatchId,
      label: fixture.title,
      startMs: toMs(fixture.startAt),
      finished: fixture.status === 'cancelled' || fixture.status === 'completed',
    })),
  ];
  // 안정 정렬 — 같은 시각이면 서버가 준 순서를 지킨다.
  const ordered = candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((left, right) => {
      const leftMs = left.candidate.startMs ?? Number.POSITIVE_INFINITY;
      const rightMs = right.candidate.startMs ?? Number.POSITIVE_INFINITY;
      return leftMs === rightMs ? left.index - right.index : leftMs - rightMs;
    })
    .map((entry) => entry.candidate);

  const currentIndex = ordered.findIndex((candidate) => candidate.fixtureId === currentFixtureId);
  if (currentIndex === -1) return null;
  const next = ordered.slice(currentIndex + 1).find((candidate) => !candidate.finished);
  return next ? { fixtureId: next.fixtureId, label: next.label } : null;
}
