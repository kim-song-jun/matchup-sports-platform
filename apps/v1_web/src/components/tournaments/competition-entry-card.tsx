'use client';

import Link from 'next/link';
import { useEffect, useId, useState, type CSSProperties } from 'react';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { useCurrentHref } from '@/components/v1-ui/use-current-href';
import { useV1MyRegistrations, useV1MyTeams, useV1TeamUpcomingGames, useV1Tournament } from '@/hooks/use-v1-api';
import { formatKstMeridiemTime, formatTournamentDateMedium, formatTournamentDateTimeShort } from '@/lib/date-utils';
import { gameRosterScreenPath, registrationRosterPath } from '@/lib/game-roster-routes';
import {
  getRosterDeadlineState,
  registrationRosterBlockReason,
  rosterStateBadgeLabel,
  tournamentRosterClosedMessage,
  type RosterEditBlockReason,
} from '@/lib/roster-editability';
import { hasStoredV1Session, withFromPath } from '@/lib/session-storage';
import { isTeamOperatorRole, normalizeMyTeamsResponse } from '@/lib/team-role';
import { tournamentRegistrationStatusConfig } from '@/lib/v1-status-labels';
import type { V1MyTeam, V1TournamentDetail, V1TournamentRegistration } from '@/types/api';

type EntryCompetition = Pick<V1TournamentDetail, 'id' | 'status' | 'kind' | 'rosterDeadlineAt' | 'scheduledEndAt'>;
type HeadingLevel = 2 | 3;

/**
 * 대회·리그 상세의 "우리 팀 참가" 카드(Task 180 R-1 A) — 내 팀 신청마다 한 장, 참가 명단으로 바로 간다.
 * 공개 화면이라 비로그인에게는 조회를 보내지 않는다. 조회가 실패하면 카드만 접는다(본문을 가리는 부가 안내).
 * `competition` 이 없으면(리그 상세 — 응답에 명단 마감이 없다) 신청이 있을 때만 대회 상세를 따로 받는다.
 */
export function CompetitionEntrySection({
  competitionId,
  competition,
  headingLevel = 3,
  style,
}: {
  competitionId: string;
  competition?: EntryCompetition;
  headingLevel?: HeadingLevel;
  style?: CSSProperties;
}) {
  const [hasSessionHint, setHasSessionHint] = useState(false);
  useEffect(() => {
    setHasSessionHint(hasStoredV1Session());
  }, []);
  const registrations = useV1MyRegistrations(competitionId, { enabled: hasSessionHint });
  // enabled 는 요청만 막고 캐시 렌더는 막지 않는다 — 로그아웃 뒤 옛 신청이 남지 않게 힌트를 다시 건다.
  const active = hasSessionHint ? (registrations.data ?? []).filter((row) => row.status !== 'cancelled') : [];
  if (active.length === 0) return null;
  const cards = { registrations: active, headingLevel, style };
  return competition ? (
    <EntryCards competition={competition} {...cards} />
  ) : (
    <FetchedEntryCards competitionId={competitionId} {...cards} />
  );
}

type CardsProps = { registrations: V1TournamentRegistration[]; headingLevel: HeadingLevel; style?: CSSProperties };

function FetchedEntryCards({ competitionId, ...cards }: CardsProps & { competitionId: string }) {
  const { data } = useV1Tournament(competitionId);
  return data === undefined ? null : <EntryCards competition={data} {...cards} />;
}

function EntryCards({ competition, registrations, headingLevel, style }: CardsProps & { competition: EntryCompetition }) {
  const myTeams = useV1MyTeams();
  // 역할을 모르는 채로 그리면 [명단 보기]가 잠깐 떴다가 [명단 수정]으로 바뀐다.
  if (myTeams.isPending) return null;
  const teams = normalizeMyTeamsResponse(myTeams.data);
  return (
    <div style={{ display: 'grid', gap: 12, ...style }}>
      {registrations.map((registration) => (
        <CompetitionEntryCard
          key={registration.id}
          competition={competition}
          registration={registration}
          team={teams.find((team) => team.teamId === registration.teamId) ?? null}
          headingLevel={headingLevel}
        />
      ))}
    </div>
  );
}

function CompetitionEntryCard({
  competition,
  registration,
  team,
  headingLevel,
}: {
  competition: EntryCompetition;
  registration: V1TournamentRegistration;
  team: V1MyTeam | null;
  headingLevel: HeadingLevel;
}) {
  const headingId = useId();
  const currentHref = useCurrentHref();
  // 수정은 팀장·매니저만 — 팀원도 같은 카드로 명단을 본다(결정 R-1-member).
  const canManage = isTeamOperatorRole(team?.role);
  const blockReason = registrationRosterBlockReason(competition, registration);
  const editable = canManage && blockReason === null;
  const stateBadge = rosterStateBadgeLabel(blockReason, canManage);
  // 참가 명단이 막혀도 이번 경기에서 빼는 건 경기 명단에서 된다 — 그 길을 같은 자리에 둔다.
  const offersGameRoster = canManage && (blockReason === 'deadline' || blockReason === 'locked');
  const upcoming = useV1TeamUpcomingGames(registration.teamId, { enabled: offersGameRoster });
  const nextGame = offersGameRoster
    ? (upcoming.data?.items ?? [])
        .filter((game) => game.tournamentId === competition.id && game.scheduledAt !== null)
        .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''))[0] ?? null
    : null;
  const teamName = registration.teamName ?? team?.name ?? '우리 팀';
  const status = tournamentRegistrationStatusConfig(registration.status);
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const rosterHref = withFromPath(registrationRosterPath(competition.id, registration.id), currentHref);
  const secondaryButton = 'tm-btn tm-btn-md tm-btn-neutral';

  return (
    <section aria-labelledby={headingId} className="tm-card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Heading id={headingId} className="tm-text-body-lg" style={{ margin: 0, fontWeight: 700 }}>
          우리 팀 참가
        </Heading>
        <span className={`tm-badge tm-badge-sm ${status.badgeClass}`}>{status.label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <TeamAvatar seed={registration.teamId} name={teamName} logoUrl={team?.logoUrl ?? null} size="sm" />
        <span className="tm-text-label" style={{ fontWeight: 700, minWidth: 0, overflowWrap: 'anywhere' }}>
          {teamName}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>참가 명단</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {stateBadge === null ? null : <span className="tm-badge tm-badge-sm tm-badge-grey">{stateBadge}</span>}
          <span className="tm-text-label tab-num" style={{ fontWeight: 700 }}>
            선수 {registration.playerCount}명
          </span>
        </span>
      </div>
      <p className="tm-text-caption" style={{ margin: '8px 0 0', color: 'var(--text-muted)', lineHeight: 1.6, wordBreak: 'keep-all' }}>
        {entryMessage({ competition, registration, canManage, blockReason })}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: editable ? '1fr auto' : '1fr 1fr', gap: 8, marginTop: 12 }}>
        <Link
          href={rosterHref}
          className={`tm-btn tm-btn-md ${editable ? 'tm-btn-primary' : 'tm-btn-outline'}`}
          style={{ minHeight: 44 }}
          aria-label={`${teamName} 참가 ${editable ? '명단 수정하기' : '명단 보기'}`}
        >
          {editable ? '명단 수정' : '명단 보기'}
        </Link>
        {nextGame === null ? (
          <Link
            href={withFromPath(`/tournaments/${competition.id}/my?reg=${registration.id}`, currentHref)}
            className={secondaryButton}
            style={{ minHeight: 44 }}
          >
            신청 내역
          </Link>
        ) : (
          <Link
            href={withFromPath(gameRosterScreenPath(registration.teamId, nextGame.gameId), currentHref)}
            className={secondaryButton}
            style={{ minHeight: 44 }}
            aria-label={`다음 경기 명단 열기 (${formatTournamentDateTimeShort(nextGame.scheduledAt) ?? '일정 미정'})`}
          >
            다음 경기 명단
          </Link>
        )}
      </div>
    </section>
  );
}

/** '9월 26일 (토) 오후 11:59' — 연도 없이, KST 로. */
function deadlineLabel(iso: string): string {
  return [formatTournamentDateMedium(iso), formatKstMeridiemTime(iso)].filter(Boolean).join(' ');
}

/** 카드 본문 한 줄 — 지금 고칠 수 있는지와, 못 고치면 그 이유·다음에 할 일. */
export function entryMessage({
  competition,
  registration,
  canManage,
  blockReason,
  now = new Date(),
}: {
  competition: EntryCompetition;
  registration: Pick<V1TournamentRegistration, 'rosterDeadlineOverrideAt'>;
  canManage: boolean;
  blockReason: RosterEditBlockReason;
  now?: Date;
}): string {
  const deadlineAt = competition.rosterDeadlineAt;
  if (blockReason === 'closed') {
    return tournamentRosterClosedMessage(competition.status, competition.kind, competition.scheduledEndAt, now.getTime());
  }
  if (blockReason === 'cancelled') return '취소를 요청한 신청이라 선수 명단을 고칠 수 없어요.';
  if (blockReason === 'deadline' || blockReason === 'locked') {
    const reason =
      blockReason === 'deadline' && deadlineAt !== null
        ? `명단 제출 마감(${deadlineLabel(deadlineAt)})이 지났어요.`
        : '운영진이 명단을 잠갔어요.';
    return canManage
      ? `${reason} 선수를 바꿔야 하면 운영진에게 문의해 주세요. 이번 경기에 빠지는 선수는 경기 명단에서 뺄 수 있어요.`
      : reason;
  }
  if (!canManage) return '참가 명단은 볼 수 있어요. 선수 추가·빼기와 등번호는 팀장·매니저가 바꿔요.';
  const deadline = getRosterDeadlineState(deadlineAt, registration.rosterDeadlineOverrideAt, now);
  if (deadline.overridden) return '명단 제출 마감이 지났지만 운영진이 수정을 열어 뒀어요. 선수 추가·빼기와 등번호를 바꿀 수 있어요.';
  if (deadlineAt !== null) return `명단 제출 마감(${deadlineLabel(deadlineAt)})까지 선수 추가·빼기와 등번호를 바꿀 수 있어요.`;
  return '운영진이 명단을 잠그기 전까지 선수 추가·빼기와 등번호를 바꿀 수 있어요.';
}
