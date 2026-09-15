/**
 * 목업 유출 회귀 방지 — 한 파일에 모아 두는 이유.
 *
 * 화면 골격용 목업(`*.view-model.ts`)을 API 응답의 **폴백**으로 쓰면, 실제 매치·팀 카드에
 * 다른(가짜) 개체의 값이 그대로 붙는다. 실제로 프로덕션에서 어느 팀 매치를 열어도
 * "매너 4.8 · 승 23"이 보였고, 조건을 안 적은 매치에는 "140,000원"·"초보-중수"·"김정민"이
 * 붙었다. 매퍼마다 흩어 놓으면 다음 사람이 새 매퍼를 추가할 때 같은 함정을 못 본다.
 *
 * 각 테스트는 **API 가 그 필드를 안 준 실제 개체**를 매퍼에 넣고, 목업의 정확한 값이
 * 결과에 나타나지 않는지를 본다.
 */
import { describe, expect, it } from 'vitest';
import { toMatchCard } from './matches/matches.card-model';
import { getMatchDetailViewModel } from './matches/matches.view-model';
import { toTeamDetail } from './teams/teams-client';
import { toTeamMatch } from './team-matches/team-matches.card-model';
import { getTeamMatchListViewModel } from './team-matches/team-matches.view-model';
import type { V1Match, V1TeamDetail, V1TeamMatch } from '@/types/api';

describe('목업(view-model)이 실제 개체의 폴백으로 새지 않는다', () => {
  it('매치 카드: 레벨·성별·지역·호스트를 API 가 안 주면 목업 값이 아니라 "모른다"를 보여준다', () => {
    const mock = getMatchDetailViewModel().match;
    const bare: V1Match = {
      id: 'real-match-1',
      matchId: 'real-match-1',
      title: '실제 매치',
      sportName: '농구',
      placeName: '진짜 체육관',
      startsAt: '2026-09-20T10:00:00.000Z',
      capacityText: '3/10',
      status: 'open',
    } as V1Match;

    const model = toMatchCard(bare, mock);

    expect(model.level).not.toBe(mock.level);
    expect(model.gender).not.toBe(mock.gender);
    expect(model.host).not.toBe(mock.host);
    expect(model.region).not.toBe(mock.region);
    expect(model.venue).toBe('진짜 체육관');
    expect(model.sport).toBe('농구');
    // 실제로 읽은 값은 그대로 살아 있어야 한다(전부 지워버린 게 아니다).
    expect(model.current).toBe(3);
    expect(model.capacity).toBe(10);
  });

  it('매치 카드: 인원을 못 읽으면 목업 인원(18/22)이 아니라 0 이다', () => {
    const mock = getMatchDetailViewModel().match;
    const bare = {
      id: 'real-match-2',
      title: '실제 매치',
      sportName: '농구',
      placeName: '진짜 체육관',
      startsAt: '2026-09-20T10:00:00.000Z',
      status: 'open',
    } as V1Match;

    const model = toMatchCard(bare, mock);

    expect(model.current).toBe(0);
    expect(model.capacity).toBe(0);
  });

  it('팀 상세: 소개·태그·다음 일정에 목업 팀의 문구가 붙지 않는다', () => {
    const bare = {
      teamId: 'real-team-1',
      name: '진짜 FC',
      status: 'active',
      visibility: 'public',
      sport: { sportId: 'sport-basketball', name: '농구' },
      region: { regionId: 'r1', name: '수유동', parentName: '서울 강북구' },
      membersVisibilityEnabled: true,
      canViewMembers: true,
      memberCount: 5,
      profile: {
        logoUrl: null,
        coverImageUrl: null,
        introduction: null,
        activityAreaText: null,
        activityDays: [],
        activityFrequency: null,
        activityTimeSlots: [],
        activityTypes: [],
        activityMemo: null,
        activitySummary: null,
        skillLevelText: null,
        genderRule: null,
        joinPolicy: 'approval_required',
        memberGoalCount: null,
      },
      owner: { userId: 'u1', displayName: '팀장', profileImageUrl: null },
      membersPreview: [],
      viewer: { role: 'none', joinState: 'none' },
    } as unknown as V1TeamDetail;

    const model = toTeamDetail(bare);

    // 결함으로 보고된 정확한 목업 값들 — 하나도 나타나면 안 된다.
    expect(model.next).not.toBe('오늘 21:00 정기전');
    expect(model.next).toBe('');
    expect(model.intro).not.toContain('주 1회 정기적으로 풋살을 즐기는');
    expect(model.tags).not.toContain('초보-중수');
    expect(model.tags).not.toContain('친선');
    expect(model.genderRule).toBe('');
    // 소개는 목업이 아니라 이 팀의 실제 지역·종목으로 만든 문장이다.
    expect(model.intro).toContain('농구');
    expect(model.ownerName).toBe('팀장');
  });

  it('팀 매치: 호스트팀 이름·경기장·비용에 목업이 붙지 않는다', () => {
    const mock = getTeamMatchListViewModel().matches[0];
    const bare = {
      id: 'real-team-match-1',
      teamMatchId: 'real-team-match-1',
      title: '실제 팀매치',
      sportName: '풋살',
      placeName: '진짜 구장',
      startsAt: '2026-09-20T10:00:00.000Z',
      capacityText: '1/2',
      status: 'open',
      costNote: null,
    } as unknown as V1TeamMatch;

    const model = toTeamMatch(bare, mock);

    expect(model.hostTeam).not.toBe('FC 발빠른놈들');
    expect(model.hostTeam).toBe('');
    expect(model.venue).toBe('진짜 구장');
    // costNote 가 없으면 목업 금액(280,000 / 140,000)이 아니라 "모른다"(null)다.
    expect(model.cost).toBeNull();
    expect(model.opponentCost).toBeNull();
    // imageUrl 이 없으면 목업 사진(team-huddle.webp/futsal-rooftop.webp)이 아니라 null —
    // 화면이 종목 그래픽을 그린다(웨이브4, 2026-09-04).
    expect(model.imageUrl).not.toBe(mock.imageUrl);
    expect(model.imageUrl).toBeNull();
  });
});
