'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@/components/v1-ui/primitives';
import { formatPublicationTime, resolvePublicLineupAt } from '@/app/team-matches/[id]/lineup/lineup.view-model';
import { useV1TeamMatch, useV1TeamMatchLineup } from '@/hooks/use-v1-api';
import type { V1TeamMatchLineup } from '@/types/api';

/**
 * 팀매치 상세의 참석명단 카드(H5 D-1) — 우리 팀과 상대 팀을 한 카드에. 상대 명단은 공개 시각(기본 킥오프 1시간 전)
 * 전에는 제출 여부만, 뒤에는 [보기]로 번호·이름을 읽는다. 참석명단 조회가 팀장·매니저 전용이라 부모가 그때만 그린다.
 */
export function TeamMatchAttendanceCard({
  teamMatchId,
  manageHref,
  primary,
}: {
  teamMatchId: string;
  manageHref: string;
  /** 매치 관리의 첫 할 일이면 primary(화면당 primary 1개). */
  primary: boolean;
}) {
  const lineup = useV1TeamMatchLineup(teamMatchId).data;
  const kickoffAt = useV1TeamMatch(teamMatchId).data?.startsAt ?? null;
  const now = Date.now();
  const publicAt = lineup ? resolvePublicLineupAt(lineup.publicLineupAt, kickoffAt) : null;
  const time = formatPublicationTime(publicAt, now);
  const published = publicAt !== null && Date.parse(publicAt) <= now;

  return (
    <Card pad={16} style={{ marginTop: 12 }}>
      <div className="tm-text-body-lg" style={{ fontWeight: 700, marginBottom: 4 }}>참석명단</div>
      <AttendanceRow
        caption="우리 팀"
        name={lineup?.ownTeamName ?? null}
        badge={lineup ? <OwnBadge lineup={lineup} /> : null}
        note={time === null ? null : published ? `${time}에 상대 팀에게 공개됐어요` : `${time}에 상대 팀에게 공개돼요`}
        action={
          <Link
            className={`tm-btn tm-btn-sm ${primary ? 'tm-btn-primary' : 'tm-btn-outline'}`}
            href={manageHref}
            aria-label="참석명단 관리"
            style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
          >
            관리
          </Link>
        }
      />
      {lineup?.opponent && lineup.opponent.teamName !== null ? (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <OpponentRow teamMatchId={teamMatchId} opponent={lineup.opponent} time={time} published={published} />
        </div>
      ) : null}
    </Card>
  );
}

function OwnBadge({ lineup }: { lineup: V1TeamMatchLineup }) {
  const submitted = lineup.state === 'SUBMITTED' || lineup.state === 'LOCKED';
  const count = lineup.revision === 1 ? 0 : lineup.starters.length + lineup.bench.length;
  return (
    <span className={`tm-badge tm-badge-sm ${submitted ? 'tm-badge-green' : 'tm-badge-grey'}`}>
      {submitted ? `제출 완료 · ${count}명` : '제출 전'}
    </span>
  );
}

function OpponentRow({
  teamMatchId,
  opponent,
  time,
  published,
}: {
  teamMatchId: string;
  opponent: NonNullable<V1TeamMatchLineup['opponent']>;
  time: string | null;
  published: boolean;
}) {
  const visible = opponent.published;
  const badge = visible
    ? { tone: 'tm-badge-blue', label: `공개됨 · ${opponent.participantCount ?? 0}명` }
    : opponent.submitted
      ? { tone: 'tm-badge-green', label: '제출 완료' }
      : { tone: 'tm-badge-grey', label: '제출 전' };
  const note = visible
    ? time === null ? '상대 팀 명단이 공개됐어요' : `${time}에 공개됐어요`
    : published
      ? '상대 팀이 아직 참석명단을 내지 않았어요'
      : time === null
        ? '지금은 제출 여부만 보여요'
        : `명단은 ${time}에 공개돼요 · 지금은 제출 여부만 보여요`;
  return (
    <AttendanceRow
      caption="상대 팀"
      name={opponent.teamName}
      badge={<span className={`tm-badge tm-badge-sm ${badge.tone}`}>{badge.label}</span>}
      note={note}
      action={
        visible ? (
          <Link
            className="tm-btn tm-btn-sm tm-btn-outline"
            href={`/team-matches/${teamMatchId}/lineup/opponent`}
            aria-label="상대 참석명단 보기"
            style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
          >
            보기
          </Link>
        ) : (
          <button type="button" className="tm-btn tm-btn-sm tm-btn-neutral" disabled style={{ minHeight: 44, whiteSpace: 'nowrap' }}>
            공개 전
          </button>
        )
      }
    />
  );
}

function AttendanceRow({
  caption,
  name,
  badge,
  note,
  action,
}: {
  caption: string;
  name: string | null;
  badge: ReactNode;
  note: string | null;
  action: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{caption}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
          {name !== null ? <span className="tm-text-label" style={{ fontWeight: 700 }}>{name}</span> : null}
          {badge}
        </div>
        {note !== null ? (
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>{note}</div>
        ) : null}
      </div>
      <div style={{ flex: '0 0 auto' }}>{action}</div>
    </div>
  );
}
