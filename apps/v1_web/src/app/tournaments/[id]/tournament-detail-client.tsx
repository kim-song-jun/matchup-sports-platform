'use client';

import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, SectionTitle } from '@/components/v1-ui/primitives';
import { TrophyIcon } from '@/components/v1-ui/icons';
import { useV1Tournament } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import type {
  V1TournamentDetail,
  V1TournamentStatus,
  V1TournamentGroup,
  V1TournamentFixture,
  V1TournamentAnnouncement,
  V1TournamentStanding,
} from '@/types/api';

/* ── Status helpers ── */

type StatusConfig = { badgeClass: string; label: string; icon: string };

function getTournamentStatusConfig(status: V1TournamentStatus): StatusConfig {
  switch (status) {
    case 'open':
      return { badgeClass: 'tm-badge-blue', label: '모집중', icon: '●' };
    case 'in_progress':
      return { badgeClass: 'tm-badge-green', label: '진행중', icon: '▶' };
    case 'completed':
      return { badgeClass: 'tm-badge-grey', label: '종료', icon: '■' };
    case 'closed':
      return { badgeClass: 'tm-badge-grey', label: '마감', icon: '■' };
    case 'cancelled':
      return { badgeClass: 'tm-badge-red', label: '취소', icon: '✕' };
    default:
      return { badgeClass: 'tm-badge-grey', label: status, icon: '○' };
  }
}

function formatTournamentDate(dateStr: string | null): string {
  if (!dateStr) return '날짜 미정';
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const weekday = weekdays[d.getDay()];
  return `${year}년 ${month}월 ${day}일 (${weekday})`;
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return '미정';
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const weekday = weekdays[d.getDay()];
  return `${month}/${day} (${weekday})`;
}

function formatEntryFee(fee: number): string {
  if (fee === 0) return '무료';
  return `${fee.toLocaleString('ko-KR')}원`;
}

function formatPublishedAt(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${month}월 ${day}일`;
}

/* ── Apply CTA ── */

function ApplyCTA({ tournament }: { tournament: V1TournamentDetail }) {
  const isOpen = tournament.status === 'open';
  const isFull = tournament.confirmedCount >= tournament.teamCount;

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '12px 20px calc(12px + env(safe-area-inset-bottom))',
        background: 'var(--surface)',
        borderTop: '1px solid var(--grey100)',
        zIndex: 100,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
        <Link
          href={`/tournaments/${tournament.id}/my`}
          className="tm-btn tm-btn-lg tm-btn-neutral"
          aria-label="내 신청 상태 확인"
        >
          내 신청
        </Link>
        {isFull ? (
          <button
            type="button"
            className="tm-btn tm-btn-lg tm-btn-primary"
            disabled
            aria-disabled="true"
            aria-label="모집이 마감되었어요"
          >
            모집 마감
          </button>
        ) : (
          <Link
            href={`/tournaments/${tournament.id}/apply`}
            className="tm-btn tm-btn-lg tm-btn-primary"
            aria-label="참가 신청하기"
          >
            참가 신청하기
          </Link>
        )}
      </div>
    </div>
  );
}

/* ── Entry point ── */

export function TournamentDetailPageClient({ tournamentId }: { tournamentId: string }) {
  const { data, isLoading, isError, error } = useV1Tournament(tournamentId);

  if (isLoading) {
    return (
      <AppChrome title="대회 상세" backHref="/tournaments" bottomNav={false}>
        <TournamentDetailSkeleton />
      </AppChrome>
    );
  }

  if (isError || !data) {
    const msg = extractErrorMessage(error, '대회 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    return (
      <AppChrome title="대회 상세" backHref="/tournaments" bottomNav={false}>
        <TournamentDetailError message={msg} />
      </AppChrome>
    );
  }

  return (
    <AppChrome
      title={data.title}
      backHref="/tournaments"
      bottomNav={false}
      floatingSlot={<ApplyCTA tournament={data} />}
    >
      <TournamentDetailView tournament={data} />
    </AppChrome>
  );
}

/* ── Full detail view ── */

function TournamentDetailView({ tournament }: { tournament: V1TournamentDetail }) {
  const status = getTournamentStatusConfig(tournament.status);
  const hasGroups = tournament.groups.length > 0;
  const hasFixtures = tournament.fixtures.length > 0;
  const hasAnnouncements = tournament.announcements.length > 0;
  // Extra bottom padding when sticky CTA is shown so content isn't occluded
  const bottomPad = tournament.status === 'open' ? 96 : 48;

  return (
    <article style={{ padding: `0 20px ${bottomPad}px` }}>

      {/* ── Section 1: Header ── */}
      <section aria-label="대회 기본 정보" style={{ marginTop: 20 }}>
        {/* Hero icon + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <div
            aria-hidden="true"
            style={{
              flexShrink: 0,
              width: 52,
              height: 52,
              borderRadius: 16,
              background: 'linear-gradient(135deg, var(--blue500) 0%, color-mix(in srgb, var(--blue500) 70%, #6366f1) 100%)',
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
            }}
          >
            <TrophyIcon size={28} strokeWidth={1.6} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="tm-text-heading" style={{ color: 'var(--text-strong)', margin: 0, lineHeight: 1.3 }}>
              {tournament.title}
            </h1>
            <div style={{ marginTop: 5 }}>
              <span className={`tm-badge ${status.badgeClass}`}>
                <span aria-hidden="true">{status.icon}&nbsp;</span>
                {status.label}
              </span>
            </div>
          </div>
        </div>

        <Card pad={0}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <InfoRow label="일정" value={formatTournamentDate(tournament.scheduledAt)} />
            {tournament.registrationDeadlineAt ? (
              <InfoRow
                label="신청 마감"
                value={formatTournamentDate(tournament.registrationDeadlineAt)}
                divider
              />
            ) : null}
            {tournament.venue ? (
              <InfoRow label="장소" value={tournament.venue} divider />
            ) : null}
            <InfoRow
              label="참가비"
              value={formatEntryFee(tournament.entryFee)}
              valueColor="var(--blue500)"
              divider
            />
            <InfoRow
              label="정원"
              value={`${tournament.confirmedCount}/${tournament.teamCount}팀 확정`}
              divider
            />
            <InfoRow
              label="선수단 규모"
              value={`팀당 ${tournament.minPlayers}~${tournament.maxPlayers}명`}
              divider
            />
          </div>
        </Card>
      </section>

      {/* ── Section 2: Rules ── */}
      {tournament.rulesText ? (
        <section aria-labelledby="rules-heading" style={{ marginTop: 24 }}>
          <SectionTitle title="대회 규정" />
          <Card pad={16} style={{ marginTop: 4 }}>
            <p
              id="rules-heading"
              className="tm-text-body"
              style={{ color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}
            >
              {tournament.rulesText}
            </p>
          </Card>
        </section>
      ) : null}

      {/* ── Section 3: Fixtures (schedule / bracket) ── */}
      {hasFixtures ? (
        <section aria-labelledby="fixtures-heading" style={{ marginTop: 24 }}>
          <SectionTitle title="일정 · 대진" />
          <div id="fixtures-heading" className="sr-only">일정 및 대진표</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            {tournament.fixtures.map((fixture) => (
              <FixtureCard key={fixture.id} fixture={fixture} />
            ))}
          </div>
        </section>
      ) : (
        <section aria-labelledby="fixtures-placeholder-heading" style={{ marginTop: 24 }}>
          <SectionTitle title="일정 · 대진" />
          <Card pad={16} style={{ marginTop: 4, background: 'var(--grey50)' }}>
            <div id="fixtures-placeholder-heading" className="tm-text-label" style={{ color: 'var(--text-muted)' }}>
              대진표 준비 중
            </div>
            <div className="tm-text-caption" style={{ marginTop: 4 }}>
              대회 시작 전에 대진표가 공개돼요.
            </div>
          </Card>
        </section>
      )}

      {/* ── Section 4: Group standings ── */}
      {hasGroups ? (
        <section aria-labelledby="standings-heading" style={{ marginTop: 24 }}>
          <SectionTitle title="조별 순위" />
          <div id="standings-heading" className="sr-only">조별 리그 순위표</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
            {tournament.groups.map((group) => (
              <GroupStandingsTable key={group.id} group={group} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Section 5: Announcements ── */}
      {hasAnnouncements ? (
        <section aria-labelledby="announcements-heading" style={{ marginTop: 24 }}>
          <SectionTitle title="공지사항" />
          <div id="announcements-heading" className="sr-only">대회 공지사항</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            {tournament.announcements.map((announcement) => (
              <AnnouncementCard key={announcement.id} announcement={announcement} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Refund policy ── */}
      {tournament.refundPolicyText ? (
        <section aria-labelledby="refund-heading" style={{ marginTop: 24 }}>
          <SectionTitle title="환불 정책" />
          <Card pad={16} style={{ marginTop: 4, background: 'var(--grey50)' }}>
            <p
              id="refund-heading"
              className="tm-text-caption"
              style={{ color: 'var(--text-muted)', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}
            >
              {tournament.refundPolicyText}
            </p>
          </Card>
        </section>
      ) : null}
    </article>
  );
}

/* ── InfoRow ── */

function InfoRow({
  label,
  value,
  divider = false,
  valueColor,
}: {
  label: string;
  value: string;
  divider?: boolean;
  valueColor?: string;
}) {
  return (
    <div
      className="tm-info-row"
      style={{
        borderTop: divider ? '1px solid var(--grey100)' : undefined,
        padding: '12px 16px',
      }}
    >
      <div className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>
        {label}
      </div>
      <div
        className="tm-text-label"
        style={{ textAlign: 'right', color: valueColor ?? 'var(--text-strong)' }}
      >
        {value}
      </div>
    </div>
  );
}

/* ── Fixture card ── */

function fixtureStatusLabel(status: string): string {
  switch (status) {
    case 'scheduled': return '예정';
    case 'in_progress': return '진행중';
    case 'completed': return '종료';
    case 'cancelled': return '취소';
    default: return status;
  }
}

function fixtureStatusBadge(status: string): string {
  switch (status) {
    case 'in_progress': return 'tm-badge-green';
    case 'completed': return 'tm-badge-grey';
    case 'cancelled': return 'tm-badge-red';
    default: return 'tm-badge-blue';
  }
}

function FixtureCard({ fixture }: { fixture: V1TournamentFixture }) {
  const hasResult = fixture.result !== null;
  const homeScore = hasResult ? fixture.result!.homeScore : null;
  const awayScore = hasResult ? fixture.result!.awayScore : null;
  const roundLabel = fixture.round
    ? fixture.round.replace('group', '조별').replace('semi', '준결승').replace('final', '결승').replace('third_place', '3·4위')
    : `${fixture.fixtureNumber}경기`;

  return (
    <Card pad={14}>
      {/* Round + date row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="tm-text-caption" style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
            {roundLabel}
          </span>
          {fixture.scheduledAt ? (
            <span className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>
              {formatShortDate(fixture.scheduledAt)}
            </span>
          ) : null}
        </div>
        <span className={`tm-badge ${fixtureStatusBadge(fixture.status)}`}>
          {fixtureStatusLabel(fixture.status)}
        </span>
      </div>

      {/* VS row */}
      <div
        role="group"
        aria-label={`${fixture.homeTeamName || 'TBD'} 대 ${fixture.awayTeamName || 'TBD'}`}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {/* Home team */}
        <div style={{ textAlign: 'right' }}>
          <div
            className="tm-text-body"
            style={{
              color: 'var(--text-strong)',
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {fixture.homeTeamName || 'TBD'}
          </div>
        </div>

        {/* Score / VS */}
        <div style={{ textAlign: 'center', minWidth: 52 }}>
          {hasResult ? (
            <div
              className="tab-num"
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: 'var(--text-strong)',
                letterSpacing: 1,
              }}
            >
              {homeScore} : {awayScore}
            </div>
          ) : (
            <div
              className="tm-text-caption"
              style={{ color: 'var(--text-caption)', fontWeight: 700, letterSpacing: 1 }}
            >
              VS
            </div>
          )}
        </div>

        {/* Away team */}
        <div style={{ textAlign: 'left' }}>
          <div
            className="tm-text-body"
            style={{
              color: 'var(--text-strong)',
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {fixture.awayTeamName || 'TBD'}
          </div>
        </div>
      </div>

      {/* Penalty */}
      {hasResult && fixture.result!.hasPenalty ? (
        <div
          className="tm-text-micro"
          style={{ textAlign: 'center', marginTop: 6, color: 'var(--text-caption)' }}
        >
          승부차기 {fixture.result!.homePenaltyScore} : {fixture.result!.awayPenaltyScore}
        </div>
      ) : null}

      {/* Venue */}
      {fixture.venue ? (
        <div
          className="tm-text-micro"
          style={{ textAlign: 'center', marginTop: 6, color: 'var(--text-muted)' }}
        >
          {fixture.venue}
        </div>
      ) : null}
    </Card>
  );
}

/* ── Group standings table ── */

function GoalDiff({ goalsFor, goalsAgainst }: { goalsFor: number; goalsAgainst: number }) {
  const diff = goalsFor - goalsAgainst;
  const color = diff > 0 ? 'var(--green500)' : diff < 0 ? 'var(--red500, #ef4444)' : 'var(--text-muted)';
  const prefix = diff > 0 ? '+' : '';
  return (
    <span className="tab-num" style={{ color }}>
      {prefix}{diff}
    </span>
  );
}

function StandingRow({ standing, rank }: { standing: V1TournamentStanding; rank: number }) {
  const isTop = rank <= 2;
  return (
    <tr>
      <td
        style={{
          padding: '8px 8px 8px 0',
          textAlign: 'center',
          width: 24,
        }}
      >
        <span
          className="tm-text-caption tab-num"
          style={{ fontWeight: isTop ? 700 : 400, color: isTop ? 'var(--blue500)' : 'var(--text-caption)' }}
        >
          {rank}
        </span>
      </td>
      <td
        style={{ padding: '8px 4px', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        <span className="tm-text-label" style={{ color: 'var(--text-strong)', fontWeight: isTop ? 600 : 400 }}>
          {standing.teamName}
        </span>
      </td>
      <td style={{ padding: '8px 4px', textAlign: 'center' }}>
        <span className="tm-text-caption tab-num" style={{ fontWeight: 700, color: 'var(--text-strong)' }}>
          {standing.points}
        </span>
      </td>
      <td style={{ padding: '8px 4px', textAlign: 'center' }}>
        <span className="tm-text-micro tab-num" style={{ color: 'var(--text-muted)' }}>
          {standing.wins}승{standing.draws}무{standing.losses}패
        </span>
      </td>
      <td style={{ padding: '8px 0 8px 4px', textAlign: 'center' }}>
        <span className="tm-text-micro">
          <GoalDiff goalsFor={standing.goalsFor} goalsAgainst={standing.goalsAgainst} />
        </span>
      </td>
    </tr>
  );
}

function GroupStandingsTable({ group }: { group: V1TournamentGroup }) {
  const sorted = [...group.standings].sort((a, b) => a.position - b.position);

  return (
    <Card pad={0}>
      <div style={{ padding: '12px 14px 8px' }}>
        <div className="tm-text-label" style={{ color: 'var(--text-strong)', fontWeight: 700 }}>
          {group.name}
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{ width: '100%', borderCollapse: 'collapse', minWidth: 280 }}
          aria-label={`${group.name} 순위표`}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid var(--grey100)' }}>
              <th
                scope="col"
                className="tm-text-micro"
                style={{ padding: '6px 8px 6px 0', color: 'var(--text-caption)', textAlign: 'center', fontWeight: 600, width: 24 }}
              >
                순위
              </th>
              <th
                scope="col"
                className="tm-text-micro"
                style={{ padding: '6px 4px', color: 'var(--text-caption)', textAlign: 'left', fontWeight: 600 }}
              >
                팀
              </th>
              <th
                scope="col"
                className="tm-text-micro"
                style={{ padding: '6px 4px', color: 'var(--text-caption)', textAlign: 'center', fontWeight: 600 }}
              >
                승점
              </th>
              <th
                scope="col"
                className="tm-text-micro"
                style={{ padding: '6px 4px', color: 'var(--text-caption)', textAlign: 'center', fontWeight: 600 }}
              >
                전적
              </th>
              <th
                scope="col"
                className="tm-text-micro"
                style={{ padding: '6px 0 6px 4px', color: 'var(--text-caption)', textAlign: 'center', fontWeight: 600 }}
              >
                득실
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length > 0 ? (
              sorted.map((standing, index) => (
                <StandingRow key={standing.registrationId} standing={standing} rank={index + 1} />
              ))
            ) : (
              <tr>
                <td
                  colSpan={5}
                  className="tm-text-caption"
                  style={{ padding: '12px 0', textAlign: 'center', color: 'var(--text-muted)' }}
                >
                  경기 시작 전이에요
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ── Announcement card ── */

function AnnouncementCard({ announcement }: { announcement: V1TournamentAnnouncement }) {
  return (
    <Card pad={16}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div className="tm-text-label" style={{ color: 'var(--text-strong)', fontWeight: 600, flex: 1, minWidth: 0 }}>
          {announcement.title}
        </div>
        <span className="tm-text-micro" style={{ color: 'var(--text-caption)', flexShrink: 0 }}>
          {formatPublishedAt(announcement.publishedAt)}
        </span>
      </div>
      <p
        className="tm-text-caption"
        style={{ marginTop: 6, color: 'var(--text-secondary)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}
      >
        {announcement.body}
      </p>
    </Card>
  );
}

/* ── Skeleton ── */

function TournamentDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="대회 정보 불러오는 중" style={{ padding: '0 20px 48px', marginTop: 20 }}>
      {/* Header skeleton */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <div
          aria-hidden="true"
          style={{ width: 52, height: 52, borderRadius: 16, background: 'var(--grey100)', flexShrink: 0 }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ height: 18, borderRadius: 7, background: 'var(--grey100)', width: '75%' }} />
          <div style={{ height: 22, borderRadius: 11, background: 'var(--grey100)', width: 48, marginTop: 8 }} />
        </div>
      </div>
      <Card pad={0}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            aria-hidden="true"
            style={{
              padding: '12px 16px',
              borderTop: i > 1 ? '1px solid var(--grey100)' : undefined,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ height: 12, borderRadius: 5, background: 'var(--grey100)', width: '28%' }} />
            <div style={{ height: 12, borderRadius: 5, background: 'var(--grey100)', width: '40%' }} />
          </div>
        ))}
      </Card>
    </div>
  );
}

/* ── Error ── */

function TournamentDetailError({ message }: { message: string }) {
  return (
    <div style={{ padding: '0 20px' }}>
      <Card pad={16} style={{ marginTop: 24, background: 'var(--grey50)' }}>
        <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>
          대회 정보를 불러오지 못했어요
        </div>
        <div className="tm-text-caption" style={{ marginTop: 5, lineHeight: 1.55, color: 'var(--text-muted)' }}>
          {message}
        </div>
        <Link
          className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"
          href="/tournaments"
          style={{ marginTop: 14 }}
        >
          목록으로 돌아가기
        </Link>
      </Card>
    </div>
  );
}
