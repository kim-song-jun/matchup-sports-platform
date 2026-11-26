'use client';

import Link from 'next/link';
import { formatTournamentDateMedium } from '@/lib/date-utils';
import { competitionDetailHref } from '@/lib/fixture-detail-route';
import { registrationRosterPath } from '@/lib/game-roster-routes';
import { rosterStateBadgeLabel } from '@/lib/roster-editability';
import { withFromPath } from '@/lib/session-storage';
import { tournamentRegistrationStatusConfig } from '@/lib/v1-status-labels';
import { getTournamentStatusConfig } from '@/lib/v1-tournament-status';
import type { V1TeamCompetitionEntries } from '@/types/api';
import { TeamGameKindBadge } from './team-game-kind-badge';

export type TeamCompetitionEntryRow = {
  key: string;
  kind: 'TOURNAMENT' | 'LEAGUE';
  title: string;
  href: string;
  statusLabel: string;
  statusColor: string;
  playerCount: number;
  /** 명단을 지금 고칠 수 있는지 한 마디 — "수정 가능" · "10월 8일 (목)까지 수정" · "제출 마감" · "종료" · 멤버는 "팀장에게 요청" */
  rosterNote: string;
  rosterHref: string;
  /** 보는 사람이 팀장·매니저이고 명단도 고칠 수 있을 때만 [참가 선수 관리]. 아니면 [참가 선수 보기]. */
  canEdit: boolean;
};

export type TeamCompetitionEntriesModel = {
  rows: TeamCompetitionEntryRow[];
  viewerCanManageRoster: boolean;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
};

const ENDED = new Set(['completed', 'cancelled']);

/** `GET /teams/:teamId/competition-entries` 응답 → 팀 상세 줄. 링크는 이 팀 화면을 출처로 싣는다. */
export function toCompetitionEntryRows(
  entries: V1TeamCompetitionEntries,
  selfHref: string,
  now: number = Date.now(),
): TeamCompetitionEntryRow[] {
  return entries.items.map((entry) => {
    const isLeague = entry.competitionKind === 'regular_league';
    const status = tournamentRegistrationStatusConfig(entry.registrationStatus, null);
    const deadline = entry.rosterDeadlineAt;
    const rosterNote =
      entry.rosterBlockedBy === 'closed' && ENDED.has(entry.status)
        ? getTournamentStatusConfig(entry.status).label
        : (rosterStateBadgeLabel(entry.rosterBlockedBy, entries.viewerCanManageRoster) ??
          (deadline !== null && new Date(deadline).getTime() > now
            ? `${formatTournamentDateMedium(deadline)}까지 수정`
            : '수정 가능'));
    return {
      key: entry.registrationId,
      kind: isLeague ? 'LEAGUE' : 'TOURNAMENT',
      title: entry.title,
      href: competitionDetailHref({ isRegularLeague: isLeague, competitionId: entry.competitionId, fromHref: selfHref }),
      statusLabel: status.label,
      statusColor: status.textColor,
      playerCount: entry.playerCount,
      rosterNote,
      rosterHref: withFromPath(registrationRosterPath(entry.competitionId, entry.registrationId), selfHref),
      canEdit: entries.viewerCanManageRoster && entry.rosterEditable,
    };
  });
}

/**
 * 팀 상세 "참가 중인 경기"의 리그·대회 탭(팀원 전용, Task 180 R-1 B) — 신청 줄 목록. 줄을 누르면
 * 대회·리그 상세, 오른쪽 버튼은 참가 명단 화면으로 바로 간다. 빈 목록·조회 실패는 탭이 따로 보인다.
 */
export function TeamCompetitionEntryList({ rows }: { rows: TeamCompetitionEntryRow[] }) {
  return (
    <div className="tm-card" style={{ padding: '4px 16px' }}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {rows.map((row, index) => (
          <li
            key={row.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 0',
              borderBottom: index === rows.length - 1 ? undefined : '1px solid var(--border)',
            }}
          >
            <Link
              href={row.href}
              style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minHeight: 44, justifyContent: 'center', color: 'inherit', textDecoration: 'none' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <TeamGameKindBadge kind={row.kind} />
                <span className="tm-text-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.title}
                </span>
              </span>
              <span className="tm-text-caption">
                <span style={{ color: row.statusColor, fontWeight: 700 }}>{row.statusLabel}</span>
                {` · 선수 ${row.playerCount}명 · ${row.rosterNote}`}
              </span>
            </Link>
            <Link
              href={row.rosterHref}
              className={`tm-btn tm-btn-sm ${row.canEdit ? 'tm-btn-outline' : 'tm-btn-neutral'}`}
              style={{ minHeight: 44, flex: '0 0 auto' }}
              aria-label={`${row.title} 참가 선수 ${row.canEdit ? '관리' : '보기'}`}
            >
              {row.canEdit ? '참가 선수 관리' : '참가 선수 보기'}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
