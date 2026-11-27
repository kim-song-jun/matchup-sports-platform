import type { V1CompetitionKind, V1TournamentStaffRole } from '@/types/api';
import type { TournamentOpsOrigin } from '@/lib/session-storage';

export interface OpsBridge {
  href: string;
  label: string;
}

interface BridgeInput {
  origin: TournamentOpsOrigin;
  role: V1TournamentStaffRole;
  /** `undefined` = 아직 모름(공개 상세 조회 중), `null` = 옛 대회 행(대회 쪽이다). */
  kind: V1CompetitionKind | null | undefined;
  tournamentId: string;
  /** 지금 표면의 base(`/admin/live/:id` 또는 `/tournament-ops/tournaments/:id`). */
  basePath: string;
  isConsole: boolean;
}

/**
 * 운영 셸 맨 위 「돌아가기」 한 줄의 목적지와 문구. 종류를 모르는 동안 어드민 목적지는 자리만 남기고 `null`.
 * 어드민 화면(`/admin/*`)은 플랫폼 운영자만 열 수 있어서, 다른 역할은 어떤 출처에서도 담당 경기 목록으로 보낸다.
 */
export function resolveOpsBridge({ origin, role, kind, tournamentId, basePath, isConsole }: BridgeInput): OpsBridge | null {
  const id = encodeURIComponent(tournamentId);
  const supportOnly = role === 'SUPPORT_READONLY';
  const myStaff: OpsBridge = {
    href: supportOnly ? '/my/tournament-staff' : `/my/tournament-staff/${id}`,
    label: '담당 경기 목록으로 돌아가기',
  };

  if (role === 'TOURNAMENT_DIRECTOR' && kind !== undefined && kind !== 'regular_league' && !isConsole) {
    return { href: `/tournament-management/tournaments/${id}/overview`, label: '대회 관리로 돌아가기' };
  }
  if (isConsole && (origin !== 'staff' || supportOnly)) {
    return { href: `${basePath}/operations`, label: '운영 보드로 돌아가기' };
  }
  if (origin === 'staff') return myStaff;
  if (kind === undefined) return null;
  if (role !== 'PLATFORM_OPS') return myStaff;
  return kind === 'regular_league'
    ? { href: `/admin/league-matches/${id}`, label: '리그 관리로 돌아가기' }
    : { href: `/admin/tournaments/${id}`, label: '대회 관리로 돌아가기' };
}

interface ConsoleContextInput {
  fixtureId: string;
  fixtures: ReadonlyArray<{ id: string; fixtureNumber: number | null; fieldId?: string | null }>;
  leagueFixtures: ReadonlyArray<{ teamMatchId: string; title: string }>;
  fields: ReadonlyArray<{ id: string; name: string }>;
}

/** 경기 콘솔 돌아가기 줄 옆의 「구장 1 · 3번 경기」. 경기를 못 찾거나 쓸 말이 없으면 null. */
export function consoleContextLabel({ fixtureId, fixtures, leagueFixtures, fields }: ConsoleContextInput): string | null {
  const league = leagueFixtures.find((f) => f.teamMatchId === fixtureId);
  if (league) return league.title;
  const fixture = fixtures.find((f) => f.id === fixtureId);
  if (!fixture) return null;
  const fieldName = fixture.fieldId ? fields.find((f) => f.id === fixture.fieldId)?.name ?? null : null;
  const parts = [fieldName, typeof fixture.fixtureNumber === 'number' ? `${fixture.fixtureNumber}번 경기` : null].filter((p): p is string => p !== null);
  return parts.length === 0 ? null : parts.join(' · ');
}
