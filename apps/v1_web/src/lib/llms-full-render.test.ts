import { describe, expect, it } from 'vitest';
import type { LlmsFullSnapshot } from '@/lib/llms-full';
import { renderLlmsFull } from '@/lib/llms-full-render';
import type { V1Match, V1Team, V1TeamMatch, V1TournamentListItem } from '@/types/api';

const empty: LlmsFullSnapshot = {
  tournaments: [], leagues: [], campaigns: [], matches: [], teamMatches: [], teams: [],
};

const tournament = (over: Partial<V1TournamentListItem>) => ({
  id: 't1', title: '가을 풋살컵', status: 'open', kind: 'regular_tournament',
  sport: { code: 'futsal', name: '풋살' }, scheduledAt: '2026-10-03T01:00:00.000Z',
  registrationDeadlineAt: '2026-09-30T14:59:00.000Z', venue: '송파 풋살파크', entryFee: 0,
  teamCount: 8, confirmedCount: 2, pendingPaymentCount: 0,
  ...over,
}) as V1TournamentListItem;

const match = (over: Partial<V1Match>) => ({
  matchId: 'm1', title: '토요일 풋살', sportName: '풋살', startsAt: '2026-10-04T01:00:00.000Z',
  status: 'open', displayState: 'recruiting', place: { name: '송파 풋살파크', addressText: '서울 송파구 어딘가 101동' },
  approvalRequired: true, ...over,
}) as unknown as V1Match;

describe('renderLlmsFull', () => {
  it('조회에 실패한 섹션(null)은 빼고, 비어 있는 섹션은 "없어요"로 적는다', () => {
    const text = renderLlmsFull({ ...empty, matches: null });
    expect(text).not.toContain('## 모집 중인 개인 매치');
    expect(text).toContain('## 모집 중인 팀 매치');
    expect(text).toContain('지금 상대 팀을 찾는 팀 매치가 없어요.');
  });

  it('마감이 지나 화면에서 모집 마감으로 보이는 매치는 status 가 남아 있어도 싣지 않는다', () => {
    const text = renderLlmsFull({
      ...empty,
      matches: [match({}), match({ matchId: 'm2', title: '마감된 매치', displayState: 'closed' })],
    });
    expect(text).toContain('https://teameet.co.kr/matches/m1');
    expect(text).not.toContain('마감된 매치');
  });

  it('제목의 줄바꿈·대괄호로 링크 문법을 깨거나 가짜 링크를 끼워 넣지 못한다', () => {
    const text = renderLlmsFull({
      ...empty,
      tournaments: [tournament({ title: '컵](https://evil.example)\n## 가짜 섹션' })],
    });
    expect(text).not.toContain('](https://evil.example)');
    expect(text).not.toMatch(/^## 가짜 섹션/m);
  });

  it('사용자가 쓴 긴 글과 상세 주소는 싣지 않는다', () => {
    const team = {
      id: 'team1', name: '한강 로버스', sportName: '풋살', regionName: '서울 송파구', memberCount: 12,
      joinPolicy: 'approval_required', introductionPreview: '연락 010-1234-5678',
    } as unknown as V1Team;
    const text = renderLlmsFull({ ...empty, teams: [team], matches: [match({ descriptionPreview: '카톡 abc123' })] });
    expect(text).toContain('[한강 로버스](https://teameet.co.kr/teams/team1)');
    expect(text).not.toContain('010-1234-5678');
    expect(text).not.toContain('카톡 abc123');
    expect(text).not.toContain('101동');
  });

  it('같은 구장의 대회와 매치를 구장별 일정으로 묶는다', () => {
    const teamMatch = {
      teamMatchId: 'tm1', title: '친선 한 판', sportName: '풋살', startsAt: '2026-10-05T01:00:00.000Z',
      displayState: 'recruiting', place: { name: '잠실 코트' }, hostTeam: { name: '한강 로버스' }, league: null,
    } as unknown as V1TeamMatch;
    const text = renderLlmsFull({ ...empty, tournaments: [tournament({})], matches: [match({})], teamMatches: [teamMatch] });
    const venueLine = text.split('\n').find((line) => line.startsWith('- **송파 풋살파크**'));
    expect(venueLine).toContain('/tournaments/t1');
    expect(venueLine).toContain('/matches/m1');
    expect(text).toContain('- **잠실 코트**: [친선 한 판]');
  });

  it('리그 거울 행은 대회 목록에서 빼고(리그 섹션이 정본), 준비 중 대회도 싣지 않는다', () => {
    const text = renderLlmsFull({
      ...empty,
      tournaments: [
        tournament({}),
        tournament({ id: 't2', title: '리그 거울', kind: 'regular_league' }),
        tournament({ id: 't3', title: '비공개 준비', status: 'draft' }),
      ],
    });
    expect(text).toContain('/tournaments/t1');
    expect(text).not.toContain('리그 거울');
    expect(text).not.toContain('비공개 준비');
  });

  it('status 가 open 이어도 마감이 지났거나 정원이 찼으면 신청 받는 중이라고 적지 않는다', () => {
    const now = new Date('2026-09-27T00:00:00.000Z');
    const text = renderLlmsFull({
      ...empty,
      tournaments: [
        tournament({ id: 'ok' }),
        tournament({ id: 'late', registrationDeadlineAt: '2026-09-26T14:59:00.000Z' }),
        tournament({ id: 'full', confirmedCount: 6, pendingPaymentCount: 2 }),
      ],
    }, now);
    const line = (id: string) => text.split('\n').find((l) => l.includes(`/tournaments/${id})`)) ?? '';
    expect(line('ok')).toContain('신청 받는 중');
    expect(line('late')).toContain('신청 마감');
    expect(line('full')).toContain('정원 마감');
  });
});
