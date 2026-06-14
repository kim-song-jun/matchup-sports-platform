'use client';

import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, ErrorState } from '@/components/v1-ui/primitives';
import { TrophyIcon, ChevronLeftIcon } from '@/components/v1-ui/icons';
import { useV1Tournament } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { getSportAccent } from '@/lib/v1-sport-accent';
import { TournamentBracket } from '@/components/tournaments/tournament-bracket';
import type {
  V1TournamentDetail,
  V1TournamentFormat,
  V1TournamentStatus,
  V1TournamentGroup,
  V1TournamentFixture,
  V1TournamentAnnouncement,
  V1TournamentStanding,
} from '@/types/api';

/* ── Status helpers ── */

type StatusConfig = { badgeClass: string; label: string };

function getTournamentStatusConfig(status: V1TournamentStatus): StatusConfig {
  switch (status) {
    case 'open':
      return { badgeClass: 'tm-badge-blue', label: '모집중' };
    case 'in_progress':
      return { badgeClass: 'tm-badge-green', label: '진행중' };
    case 'completed':
      return { badgeClass: 'tm-badge-grey', label: '종료' };
    case 'closed':
      return { badgeClass: 'tm-badge-grey', label: '마감' };
    case 'cancelled':
      return { badgeClass: 'tm-badge-red', label: '취소' };
    default:
      return { badgeClass: 'tm-badge-grey', label: status };
  }
}

/* ── Format helpers ── */

function getFormatLabel(format: V1TournamentFormat): string {
  switch (format) {
    case 'league': return '리그';
    case 'knockout': return '토너먼트';
    case 'group_knockout': return '조별리그+토너먼트';
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

function ApplyCTAButtons({
  tournament,
  isFull,
}: {
  tournament: V1TournamentDetail;
  isFull: boolean;
}) {
  return (
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
  );
}

function ApplyCTA({ tournament }: { tournament: V1TournamentDetail }) {
  const isOpen = tournament.status === 'open';
  const isFull = tournament.confirmedCount >= tournament.teamCount;

  if (!isOpen) return null;

  return (
    /* Mobile-only fixed CTA — hidden on desktop via .tm-hide-desktop */
    <div className="tm-fixed-cta tm-hide-desktop">
      <ApplyCTAButtons tournament={tournament} isFull={isFull} />
    </div>
  );
}

/* ── Entry point ── */

export function TournamentDetailPageClient({ tournamentId }: { tournamentId: string }) {
  const { data, isLoading, isError, error, refetch } = useV1Tournament(tournamentId);

  if (isLoading) {
    return (
      <AppChrome title="대회 상세" backHref="/tournaments" bottomNav={false} activeTab="tournaments">
        <TournamentDetailSkeleton />
      </AppChrome>
    );
  }

  if (isError || !data) {
    const msg = extractErrorMessage(error, '대회 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    return (
      <AppChrome title="대회 상세" backHref="/tournaments" bottomNav={false} activeTab="tournaments">
        <div style={{ padding: '48px 20px 0' }}>
          <ErrorState
            message={msg}
            onRetry={() => void refetch()}
          />
        </div>
      </AppChrome>
    );
  }

  return (
    <AppChrome
      title={data.title}
      backHref="/tournaments"
      bottomNav={false}
      activeTab="tournaments"
      floatingSlot={<ApplyCTA tournament={data} />}
    >
      <TournamentDetailView tournament={data} />
    </AppChrome>
  );
}

/* ── Full detail view ── */

function TournamentDetailView({ tournament }: { tournament: V1TournamentDetail }) {
  const status = getTournamentStatusConfig(tournament.status);
  const sportAccent = getSportAccent(tournament.sport.code);
  const hasAnnouncements = tournament.announcements.length > 0;
  const isOpen = tournament.status === 'open';
  const isFull = tournament.confirmedCount >= tournament.teamCount;
  // Mobile: extra bottom padding so fixed CTA doesn't occlude last content row.
  // Desktop: fixed CTA is hidden via .tm-hide-desktop; sticky right panel takes over.
  const bottomPad = isOpen ? 96 : 48;

  const bodyContent = (
    <>
      {/* ── Section 1: Header ── */}
      <section aria-label="대회 기본 정보" style={{ marginTop: 20 }}>
        {/* Hero icon + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <div
            aria-hidden="true"
            style={{
              flexShrink: 0,
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'linear-gradient(135deg, var(--blue500) 0%, var(--blue600) 100%)',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--static-white)',
            }}
          >
            <TrophyIcon size={28} strokeWidth={1.6} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="tm-text-heading" style={{ color: 'var(--text-strong)', margin: 0, lineHeight: 1.3 }}>
              {tournament.title}
            </h1>
            <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span className={`tm-badge ${status.badgeClass}`}>
                {status.label}
              </span>
              <span className="tm-badge tm-badge-grey" aria-label={`대회 형식: ${getFormatLabel(tournament.format)}`}>
                {getFormatLabel(tournament.format)}
              </span>
              {/* Sport identity chip — color dot + Korean label (color + text, not color-only) */}
              <span
                className="tm-badge"
                aria-label={`종목: ${sportAccent.label}`}
                style={{
                  background: sportAccent.badgeBg,
                  color: sportAccent.badgeText,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: sportAccent.dot,
                    flexShrink: 0,
                    display: 'inline-block',
                  }}
                />
                {sportAccent.label}
              </span>
            </div>
          </div>
        </div>

        {/* 핵심 3사실 메트릭 카드(정원 progress bar 내장) + 보조 정보 InfoRow */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 10 }}>
          <div style={{ background: 'var(--grey50)', borderRadius: 12, padding: 12 }}>
            <div className="tm-text-caption" style={{ color: 'var(--text-caption)', marginBottom: 4 }}>일정</div>
            <div className="tm-text-body" style={{ color: 'var(--text-strong)', fontWeight: 500 }}>
              {formatShortDate(tournament.scheduledAt)}
            </div>
          </div>
          <div style={{ background: 'var(--blue50)', borderRadius: 12, padding: 12 }}>
            <div className="tm-text-caption" style={{ color: 'var(--blue600)', marginBottom: 4 }}>정원</div>
            <div className="tm-text-body" style={{ color: 'var(--text-strong)', fontWeight: 500, marginBottom: 5 }}>
              {tournament.confirmedCount}/{tournament.teamCount}팀
            </div>
            <div
              role="progressbar"
              aria-valuenow={tournament.confirmedCount}
              aria-valuemin={0}
              aria-valuemax={tournament.teamCount}
              aria-label={`정원 ${tournament.confirmedCount} / ${tournament.teamCount}팀`}
              style={{ height: 5, background: 'var(--surface)', borderRadius: 3, overflow: 'hidden' }}
            >
              <div
                style={{
                  width: `${Math.min(100, Math.round((tournament.confirmedCount / Math.max(tournament.teamCount, 1)) * 100))}%`,
                  height: '100%',
                  background: 'var(--blue500)',
                  borderRadius: 3,
                }}
              />
            </div>
          </div>
          <div style={{ background: 'var(--grey50)', borderRadius: 12, padding: 12 }}>
            <div className="tm-text-caption" style={{ color: 'var(--text-caption)', marginBottom: 4 }}>참가비</div>
            <div className="tm-text-body" style={{ color: 'var(--blue500)', fontWeight: 500 }}>
              {formatEntryFee(tournament.entryFee)}
            </div>
          </div>
        </div>
        {(() => {
          const remaining = tournament.teamCount - tournament.confirmedCount;
          if (remaining <= 0) {
            return (
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginBottom: 10 }}>
                정원이 가득 찼어요
              </div>
            );
          }
          const pct = Math.round((tournament.confirmedCount / Math.max(tournament.teamCount, 1)) * 100);
          const almostFull = pct >= 80;
          return (
            <div
              className="tm-text-caption"
              style={{ color: almostFull ? 'var(--orange500)' : 'var(--text-muted)', marginBottom: 10 }}
            >
              {almostFull ? '마감 임박! ' : '아직 '}
              <b style={{ color: almostFull ? 'var(--orange500)' : 'var(--blue500)', fontWeight: 500 }}>{remaining}자리</b> 남았어요
            </div>
          );
        })()}
        <Card pad={0}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {tournament.registrationDeadlineAt ? (
              <InfoRow label="신청 마감" value={formatTournamentDate(tournament.registrationDeadlineAt)} />
            ) : null}
            {tournament.venue ? (
              <InfoRow label="장소" value={tournament.venue} />
            ) : null}
            <InfoRow
              label="선수단 규모"
              value={`팀당 ${tournament.minPlayers}~${tournament.maxPlayers}명`}
              isLast
            />
          </div>
        </Card>
      </section>

      {/* ── Section 2: Rules ── */}
      {tournament.rulesText ? (
        <section aria-labelledby="rules-heading" style={{ marginTop: 24 }}>
          <div className="tm-text-body-lg" style={{ marginBottom: 8 }}>대회 규정</div>
          <Card pad={16} style={{ marginTop: 4 }}>
            <p
              id="rules-heading"
              className="tm-text-body"
              style={{ color: 'var(--text-body)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}
            >
              {tournament.rulesText}
            </p>
          </Card>
        </section>
      ) : null}

      {/* ── Section 3 + 4: Format-aware fixtures / bracket / standings ── */}
      <FormatSections tournament={tournament} />

      {/* ── Section 5: Announcements ── */}
      {hasAnnouncements ? (
        <section aria-labelledby="announcements-heading" style={{ marginTop: 24 }}>
          <div id="announcements-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>공지사항</div>
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
          <div className="tm-text-body-lg" style={{ marginBottom: 8 }}>환불 정책</div>
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
    </>
  );

  return (
    <article style={{ paddingBottom: bottomPad }}>
      {/* ── Desktop back navigation (hidden on mobile via .tm-show-desktop) ── */}
      <div className="tm-desktop-page-head tm-show-desktop">
        <Link
          className="tm-desktop-back"
          href="/tournaments"
          aria-label="대회 목록으로 돌아가기"
        >
          <ChevronLeftIcon size={20} strokeWidth={2.2} aria-hidden="true" />
        </Link>
        <h1 className="tm-text-heading" style={{ margin: 0 }}>대회 상세</h1>
      </div>

      {/* ── Desktop 2-column layout: left=body, right=sticky CTA ── */}
      {/* Reuses .tm-match-detail-desktop-layout (matches.css @media ≥1024px:
          grid-template-columns 1fr 360px, gap 32px). */}
      <div className="tm-match-detail-desktop-layout">
        {/* Left column: all body content.
            Horizontal padding comes solely from .tm-match-detail-body (globals.css: 20px),
            which matches the .tm-fixed-cta gutter (--v1-shell-page-x: 20px).
            article no longer adds its own 20px so there is no 20+20=40px double-gutter
            on mobile. The desktop override (matches.css:175) zeroes body padding, so the
            desktop grid gap provides the breathing room instead. */}
        <div className="tm-match-detail-body">
          {bodyContent}
        </div>

        {/* Right column: sticky CTA card (desktop only, replaces fixed bottom bar).
            .tm-match-detail-desktop-cta: position sticky top:80px, Card-style border+shadow. */}
        {isOpen ? (
          <aside
            className="tm-match-detail-desktop-cta tm-show-desktop"
            role="complementary"
            aria-label="참가 신청"
          >
            <div className="tm-match-detail-desktop-cta-label">
              <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>
                참가 신청
              </div>
              <div className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>
                {tournament.confirmedCount}/{tournament.teamCount}팀 확정
              </div>
            </div>
            <div className="tm-match-detail-desktop-cta-actions">
              <ApplyCTAButtons tournament={tournament} isFull={isFull} />
            </div>
          </aside>
        ) : null}
      </div>
    </article>
  );
}

/* ── FormatSections ──
 * Renders the fixtures / bracket / standings area based on tournament.format:
 *
 *  league          → 순위표(phase=group 첫 그룹) + 전체 fixtures 리스트
 *  knockout        → TournamentBracket(전체 fixtures). 조별 순위 숨김.
 *  group_knockout  → 조별 순위(phase=group 그룹들) + TournamentBracket(준결승·결승·3위전 fixtures)
 */

/** Pure partition helper — exported for unit testing. */
export function partitionTournamentSections(
  format: V1TournamentFormat,
  fixtures: V1TournamentFixture[],
  groups: V1TournamentGroup[],
) {
  const groupPhaseGroups = groups.filter((g) => g.phase === 'group');
  const knockoutPhases = new Set(['semi', 'final', 'third_place']);
  const knockoutGroupIds = new Set(
    groups.filter((g) => knockoutPhases.has(g.phase)).map((g) => g.id),
  );

  const groupFixtures = fixtures.filter((f) =>
    f.groupId !== null && !knockoutGroupIds.has(f.groupId),
  );

  const knockoutFixtures =
    format === 'knockout'
      ? fixtures
      : fixtures.filter((f) => f.groupId !== null && knockoutGroupIds.has(f.groupId));

  return {
    groupPhaseGroups,
    groupFixtures,
    knockoutFixtures,
    hasGroupStandings: groupPhaseGroups.length > 0,
    hasGroupFixtures: groupFixtures.length > 0,
    hasKnockoutFixtures: knockoutFixtures.length > 0,
    hasAnyFixtures: fixtures.length > 0,
  };
}

function FormatSections({ tournament }: { tournament: V1TournamentDetail }) {
  const { format, fixtures, groups } = tournament;

  /* ── Partition groups and fixtures by phase ── */
  const {
    groupPhaseGroups,
    groupFixtures,
    knockoutFixtures,
    hasGroupStandings,
    hasGroupFixtures,
    hasKnockoutFixtures,
    hasAnyFixtures,
  } = partitionTournamentSections(format, fixtures, groups);

  /* ── league: single standings table (first group or all) + full fixture list ── */
  if (format === 'league') {
    return (
      <>
        {hasGroupStandings ? (
          <section aria-labelledby="standings-heading" style={{ marginTop: 24 }}>
            <div id="standings-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
              순위표
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
              {groupPhaseGroups.map((group) => (
                <GroupStandingsTable key={group.id} group={group} />
              ))}
            </div>
          </section>
        ) : null}

        {hasAnyFixtures ? (
          <section aria-labelledby="fixtures-heading" style={{ marginTop: 24 }}>
            <div id="fixtures-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
              일정 · 대진
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              {fixtures.map((fixture) => (
                <FixtureCard key={fixture.id} fixture={fixture} />
              ))}
            </div>
          </section>
        ) : (
          <FixturesPlaceholder />
        )}
      </>
    );
  }

  /* ── knockout: bracket only ── */
  if (format === 'knockout') {
    return (
      <section aria-labelledby="bracket-heading" style={{ marginTop: 24 }}>
        <div id="bracket-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
          대진표
        </div>
        <div style={{ marginTop: 4 }}>
          <TournamentBracket fixtures={knockoutFixtures} groups={groups} />
        </div>
      </section>
    );
  }

  /* ── group_knockout: group standings + group fixtures, then knockout bracket ── */
  return (
    <>
      {/* Group-phase standings */}
      {hasGroupStandings ? (
        <section aria-labelledby="standings-heading" style={{ marginTop: 24 }}>
          <div id="standings-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
            조별 순위
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
            {groupPhaseGroups.map((group) => (
              <GroupStandingsTable key={group.id} group={group} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Group-phase fixtures */}
      {hasGroupFixtures ? (
        <section aria-labelledby="group-fixtures-heading" style={{ marginTop: 24 }}>
          <div id="group-fixtures-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
            조별 일정
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            {groupFixtures.map((fixture) => (
              <FixtureCard key={fixture.id} fixture={fixture} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Knockout bracket */}
      <section aria-labelledby="bracket-heading" style={{ marginTop: 24 }}>
        <div id="bracket-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
          결선 대진표
        </div>
        <div style={{ marginTop: 4 }}>
          {hasKnockoutFixtures ? (
            <TournamentBracket fixtures={knockoutFixtures} groups={groups} />
          ) : (
            <Card pad={16} style={{ background: 'var(--grey50)' }}>
              <div className="tm-text-label" style={{ color: 'var(--text-muted)' }}>
                결선 대진 준비 중
              </div>
              <div className="tm-text-caption" style={{ marginTop: 4 }}>
                조별 리그가 끝나면 결선 대진표가 공개돼요.
              </div>
            </Card>
          )}
        </div>
      </section>
    </>
  );
}

function FixturesPlaceholder() {
  return (
    <section aria-labelledby="fixtures-placeholder-heading" style={{ marginTop: 24 }}>
      <div className="tm-text-body-lg" style={{ marginBottom: 8 }}>일정 · 대진</div>
      <Card pad={16} style={{ marginTop: 4, background: 'var(--grey50)' }}>
        <div id="fixtures-placeholder-heading" className="tm-text-label" style={{ color: 'var(--text-muted)' }}>
          대진표 준비 중
        </div>
        <div className="tm-text-caption" style={{ marginTop: 4 }}>
          대회 시작 전에 대진표가 공개돼요.
        </div>
      </Card>
    </section>
  );
}

/* ── InfoRow ── */

function InfoRow({
  label,
  value,
  valueColor,
  isLast,
}: {
  label: string;
  value: string;
  valueColor?: string;
  /** Pass true on the final row of a card to remove the redundant bottom hairline. */
  isLast?: boolean;
}) {
  return (
    <div
      className="tm-info-row"
      style={{ padding: '0 16px', ...(isLast ? { borderBottom: 'none' } : {}) }}
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
          <span className="tm-text-label" style={{ color: 'var(--text-muted)' }}>
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
            className="tm-text-body-lg"
            style={{
              color: 'var(--text-strong)',
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
              className="tm-text-body-lg tab-num"
              style={{
                color: 'var(--text-strong)',
                letterSpacing: 1,
              }}
            >
              {homeScore} : {awayScore}
            </div>
          ) : (
            <div
              className="tm-text-label"
              style={{ color: 'var(--text-caption)', letterSpacing: 1 }}
            >
              VS
            </div>
          )}
        </div>

        {/* Away team */}
        <div style={{ textAlign: 'left' }}>
          <div
            className="tm-text-body-lg"
            style={{
              color: 'var(--text-strong)',
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
  const color = diff > 0 ? 'var(--green500)' : diff < 0 ? 'var(--red500)' : 'var(--text-muted)';
  const prefix = diff > 0 ? '+' : '';
  return (
    <span className="tab-num" style={{ color }}>
      {prefix}{diff}
    </span>
  );
}

function StandingRow({
  standing,
  rank,
  isQualifying,
}: {
  standing: V1TournamentStanding;
  rank: number;
  isQualifying: boolean;
}) {
  return (
    <tr style={isQualifying ? { background: 'var(--blue50)' } : undefined}>
      <td
        style={{
          padding: '8px 8px 8px 0',
          textAlign: 'center',
          width: 24,
        }}
      >
        <span
          className="tm-text-caption tab-num"
          style={{ color: isQualifying ? 'var(--blue500)' : 'var(--text-caption)' }}
        >
          {rank}
        </span>
      </td>
      <td
        style={{ padding: '8px 4px', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        <span className="tm-text-label" style={{ color: isQualifying ? 'var(--blue500)' : 'var(--text-strong)' }}>
          {standing.teamName}
        </span>
        {isQualifying ? (
          <span className="tm-badge tm-badge-blue" style={{ marginLeft: 6, verticalAlign: 'middle' }}>
            진출
          </span>
        ) : null}
      </td>
      <td style={{ padding: '8px 4px', textAlign: 'center' }}>
        <span className="tm-text-label tab-num" style={{ color: 'var(--text-strong)' }}>
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
  const advanceCount = group.advanceCount;

  return (
    <Card pad={0}>
      <div style={{ padding: '12px 14px 8px' }}>
        <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>
          {group.name}
        </div>
      </div>
      <div style={{ overflowX: 'auto', maxWidth: 420 }}>
        <table
          style={{ width: '100%', borderCollapse: 'collapse', minWidth: 280 }}
          aria-label={`${group.name} 순위표`}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid var(--grey100)' }}>
              <th
                scope="col"
                className="tm-text-micro"
                style={{ padding: '6px 8px 6px 0', color: 'var(--text-caption)', textAlign: 'center', width: 32, whiteSpace: 'nowrap' }}
              >
                순위
              </th>
              <th
                scope="col"
                className="tm-text-micro"
                style={{ padding: '6px 4px', color: 'var(--text-caption)', textAlign: 'left' }}
              >
                팀
              </th>
              <th
                scope="col"
                className="tm-text-micro"
                style={{ padding: '6px 4px', color: 'var(--text-caption)', textAlign: 'center' }}
              >
                승점
              </th>
              <th
                scope="col"
                className="tm-text-micro"
                style={{ padding: '6px 4px', color: 'var(--text-caption)', textAlign: 'center' }}
              >
                전적
              </th>
              <th
                scope="col"
                className="tm-text-micro"
                style={{ padding: '6px 0 6px 4px', color: 'var(--text-caption)', textAlign: 'center' }}
              >
                득실
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length > 0 ? (
              sorted.map((standing, index) => (
                <StandingRow
                  key={standing.registrationId}
                  standing={standing}
                  rank={index + 1}
                  isQualifying={advanceCount != null && advanceCount > 0 && index + 1 <= advanceCount}
                />
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
      {advanceCount != null && advanceCount > 0 ? (
        <div className="tm-text-micro" style={{ padding: '0 14px 12px', color: 'var(--text-muted)' }}>
          상위 {advanceCount}팀이 다음 단계로 진출해요
        </div>
      ) : null}
    </Card>
  );
}

/* ── Announcement card ── */

function AnnouncementCard({ announcement }: { announcement: V1TournamentAnnouncement }) {
  return (
    <Card pad={16}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div className="tm-text-label" style={{ color: 'var(--text-strong)', flex: 1, minWidth: 0 }}>
          {announcement.title}
        </div>
        <span className="tm-text-micro" style={{ color: 'var(--text-caption)', flexShrink: 0 }}>
          {formatPublishedAt(announcement.publishedAt)}
        </span>
      </div>
      <p
        className="tm-text-caption"
        style={{ marginTop: 6, color: 'var(--text-body)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}
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

