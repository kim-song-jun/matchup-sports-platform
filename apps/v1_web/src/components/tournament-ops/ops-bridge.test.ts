import { describe, expect, it } from 'vitest';
import type { V1CompetitionKind, V1TournamentStaffRole } from '@/types/api';
import type { TournamentOpsOrigin } from '@/lib/session-storage';
import { consoleContextLabel, resolveOpsBridge } from './ops-bridge';

const ADMIN = '/admin/live/t-1';
const STAFF = '/tournament-ops/tournaments/t-1';

type Row = [
  name: string,
  input: { origin: TournamentOpsOrigin; role: V1TournamentStaffRole; kind: V1CompetitionKind | null | undefined; basePath: string; isConsole: boolean },
  want: { label: string; href: string } | null,
];

const rows: Row[] = [
  ['대회 운영자는 대회 관리로 돌아간다(스태프 출처)', { origin: 'staff', role: 'TOURNAMENT_DIRECTOR', kind: 'regular_tournament', basePath: STAFF, isConsole: false }, { label: '대회 관리로 돌아가기', href: '/tournament-management/tournaments/t-1/overview' }],
  ['옛 대회 행(kind null)도 대회 관리다', { origin: 'home', role: 'TOURNAMENT_DIRECTOR', kind: null, basePath: STAFF, isConsole: false }, { label: '대회 관리로 돌아가기', href: '/tournament-management/tournaments/t-1/overview' }],
  ['리그의 대회 운영자는 담당 경기 목록으로(어드민 화면은 못 연다)', { origin: 'home', role: 'TOURNAMENT_DIRECTOR', kind: 'regular_league', basePath: STAFF, isConsole: false }, { label: '담당 경기 목록으로 돌아가기', href: '/my/tournament-staff/t-1' }],
  ['담당 경기에서 온 리그의 대회 운영자', { origin: 'staff', role: 'TOURNAMENT_DIRECTOR', kind: 'regular_league', basePath: STAFF, isConsole: false }, { label: '담당 경기 목록으로 돌아가기', href: '/my/tournament-staff/t-1' }],
  ['지원은 담당 대회 목록으로', { origin: 'staff', role: 'SUPPORT_READONLY', kind: 'regular_tournament', basePath: STAFF, isConsole: false }, { label: '담당 경기 목록으로 돌아가기', href: '/my/tournament-staff' }],
  ['직접 들어온 지원도 서비스 홈이 아니라 담당 대회 목록으로', { origin: 'home', role: 'SUPPORT_READONLY', kind: 'regular_tournament', basePath: STAFF, isConsole: false }, { label: '담당 경기 목록으로 돌아가기', href: '/my/tournament-staff' }],
  ['플랫폼 운영자(어드민 출처)는 대회 관리로', { origin: 'admin', role: 'PLATFORM_OPS', kind: 'regular_tournament', basePath: ADMIN, isConsole: false }, { label: '대회 관리로 돌아가기', href: '/admin/tournaments/t-1' }],
  ['플랫폼 운영자(어드민 출처)는 리그면 리그 관리로', { origin: 'admin', role: 'PLATFORM_OPS', kind: 'regular_league', basePath: ADMIN, isConsole: false }, { label: '리그 관리로 돌아가기', href: '/admin/league-matches/t-1' }],
  ['플랫폼 운영자가 직접 들어와도 서비스 홈이 아니라 대회 관리로', { origin: 'home', role: 'PLATFORM_OPS', kind: 'regular_tournament', basePath: ADMIN, isConsole: false }, { label: '대회 관리로 돌아가기', href: '/admin/tournaments/t-1' }],
  ['플랫폼 운영자가 보드에서 와도 리그는 리그 관리로', { origin: 'board', role: 'PLATFORM_OPS', kind: 'regular_league', basePath: ADMIN, isConsole: false }, { label: '리그 관리로 돌아가기', href: '/admin/league-matches/t-1' }],
  ['담당 경기에서 온 플랫폼 운영자는 담당 경기 목록으로', { origin: 'staff', role: 'PLATFORM_OPS', kind: 'regular_tournament', basePath: STAFF, isConsole: false }, { label: '담당 경기 목록으로 돌아가기', href: '/my/tournament-staff/t-1' }],
  ['콘솔: 어드민 출처는 운영 보드로', { origin: 'admin', role: 'PLATFORM_OPS', kind: 'regular_tournament', basePath: ADMIN, isConsole: true }, { label: '운영 보드로 돌아가기', href: '/admin/live/t-1/operations' }],
  ['콘솔: 직접 들어온 대회 운영자도 운영 보드로(대회 관리가 아니다)', { origin: 'home', role: 'TOURNAMENT_DIRECTOR', kind: 'regular_tournament', basePath: STAFF, isConsole: true }, { label: '운영 보드로 돌아가기', href: '/tournament-ops/tournaments/t-1/operations' }],
  ['콘솔: 보드에서 연 지원도 운영 보드로', { origin: 'board', role: 'SUPPORT_READONLY', kind: 'regular_tournament', basePath: STAFF, isConsole: true }, { label: '운영 보드로 돌아가기', href: '/tournament-ops/tournaments/t-1/operations' }],
  ['콘솔: 담당 경기에서 온 지원은 운영 보드로', { origin: 'staff', role: 'SUPPORT_READONLY', kind: 'regular_tournament', basePath: STAFF, isConsole: true }, { label: '운영 보드로 돌아가기', href: '/tournament-ops/tournaments/t-1/operations' }],
  ['콘솔: 담당 경기에서 온 대회 운영자는 담당 경기 목록으로', { origin: 'staff', role: 'TOURNAMENT_DIRECTOR', kind: 'regular_tournament', basePath: STAFF, isConsole: true }, { label: '담당 경기 목록으로 돌아가기', href: '/my/tournament-staff/t-1' }],
  ['콘솔: 담당 경기에서 온 플랫폼 운영자는 담당 경기 목록으로', { origin: 'staff', role: 'PLATFORM_OPS', kind: 'regular_league', basePath: STAFF, isConsole: true }, { label: '담당 경기 목록으로 돌아가기', href: '/my/tournament-staff/t-1' }],
  ['종류를 모르는 동안 어드민 출처는 자리만 남긴다', { origin: 'admin', role: 'PLATFORM_OPS', kind: undefined, basePath: ADMIN, isConsole: false }, null],
  ['종류를 모르는 동안에도 콘솔은 운영 보드로 돌아갈 수 있다', { origin: 'admin', role: 'PLATFORM_OPS', kind: undefined, basePath: ADMIN, isConsole: true }, { label: '운영 보드로 돌아가기', href: '/admin/live/t-1/operations' }],
  ['종류를 모르는 동안에도 스태프 출처는 담당 경기 목록이 있다', { origin: 'staff', role: 'TOURNAMENT_DIRECTOR', kind: undefined, basePath: STAFF, isConsole: false }, { label: '담당 경기 목록으로 돌아가기', href: '/my/tournament-staff/t-1' }],
];

describe('resolveOpsBridge', () => {
  it.each(rows)('%s', (_name, input, want) => {
    expect(resolveOpsBridge({ ...input, tournamentId: 't-1' })).toEqual(want);
  });

  it('어느 조합에서도 「서비스로 돌아가기」·「경기 목록으로 돌아가기」가 나오지 않는다', () => {
    const origins: TournamentOpsOrigin[] = ['admin', 'staff', 'board', 'home'];
    const roles: V1TournamentStaffRole[] = ['PLATFORM_OPS', 'TOURNAMENT_DIRECTOR', 'SUPPORT_READONLY'];
    const kinds: Array<V1CompetitionKind | null | undefined> = ['regular_tournament', 'regular_league', null, undefined];
    for (const origin of origins) for (const role of roles) for (const kind of kinds) for (const isConsole of [true, false]) {
      const bridge = resolveOpsBridge({ origin, role, kind, tournamentId: 't-1', basePath: ADMIN, isConsole });
      expect(bridge?.label ?? '').not.toMatch(/서비스로|^경기 목록으로/);
      expect(bridge?.href ?? '').not.toBe('/home');
    }
  });

  it('대회 id 의 특수문자는 주소에서 인코딩한다', () => {
    expect(resolveOpsBridge({ origin: 'admin', role: 'PLATFORM_OPS', kind: 'regular_tournament', tournamentId: 'a/b', basePath: '/admin/live/a%2Fb', isConsole: false })?.href).toBe('/admin/tournaments/a%2Fb');
  });
});

describe('consoleContextLabel', () => {
  const fields = [{ id: 'fld1', name: '구장 1' }];

  it('대회 경기는 구장과 번호를 잇는다', () => {
    expect(consoleContextLabel({ fixtureId: 'f3', fixtures: [{ id: 'f3', fixtureNumber: 3, fieldId: 'fld1' }], leagueFixtures: [], fields })).toBe('구장 1 · 3번 경기');
  });

  it('구장이 없으면 번호만, 번호가 없으면 구장만 보인다', () => {
    expect(consoleContextLabel({ fixtureId: 'f3', fixtures: [{ id: 'f3', fixtureNumber: 3, fieldId: null }], leagueFixtures: [], fields })).toBe('3번 경기');
    expect(consoleContextLabel({ fixtureId: 'f3', fixtures: [{ id: 'f3', fixtureNumber: null, fieldId: 'fld1' }], leagueFixtures: [], fields })).toBe('구장 1');
  });

  it('리그 경기는 대진 제목을 쓴다', () => {
    expect(consoleContextLabel({ fixtureId: 'tm-1', fixtures: [], leagueFixtures: [{ teamMatchId: 'tm-1', title: '2주차 1경기' }], fields })).toBe('2주차 1경기');
  });

  it('경기를 못 찾으면 null 이고 null·undefined 글자를 만들지 않는다', () => {
    expect(consoleContextLabel({ fixtureId: 'x', fixtures: [], leagueFixtures: [], fields })).toBeNull();
    expect(consoleContextLabel({ fixtureId: 'f3', fixtures: [{ id: 'f3', fixtureNumber: null, fieldId: null }], leagueFixtures: [], fields })).toBeNull();
  });
});
