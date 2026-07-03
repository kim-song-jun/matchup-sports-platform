'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, ErrorState } from '@/components/v1-ui/primitives';
import { TrophyIcon, ChevronLeftIcon, ChevronRightIcon } from '@/components/v1-ui/icons';
import { useV1Tournament, useV1MyRegistrations } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { hasStoredV1Session } from '@/lib/session-storage';
import { getSportAccent } from '@/lib/v1-sport-accent';
import { TournamentBracket } from '@/components/tournaments/tournament-bracket';
import { formatTournamentDateShort, formatTournamentDateLong, formatEntryFee } from '@/lib/date-utils';
import type {
  V1TournamentDetail,
  V1TournamentFormat,
  V1TournamentStatus,
  V1TournamentGroup,
  V1TournamentFixture,
  V1TournamentAnnouncement,
  V1TournamentStanding,
  V1TournamentRegistration,
} from '@/types/api';

/* ── Status helpers ── */

type StatusConfig = { badgeClass: string; label: string };

function getTournamentStatusConfig(status: V1TournamentStatus): StatusConfig {
  switch (status) {
    case 'open':
      return { badgeClass: 'tm-badge-blue', label: '모집 중' };
    case 'in_progress':
      return { badgeClass: 'tm-badge-green', label: '진행 중' };
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
    case 'group_knockout': return '조별리그 후 토너먼트';
  }
}

function formatPrize(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}

function formatPublishedAt(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${month}월 ${day}일`;
}

function getPendingPaymentCount(tournament: Pick<V1TournamentDetail, 'pendingPaymentCount'>): number {
  return Math.max(0, tournament.pendingPaymentCount ?? 0);
}

function getReservedTeamCount(tournament: Pick<V1TournamentDetail, 'confirmedCount' | 'pendingPaymentCount' | 'teamCount'>): number {
  return Math.min(tournament.teamCount, tournament.confirmedCount + getPendingPaymentCount(tournament));
}

function CapacityProgressBar({
  confirmedCount,
  pendingPaymentCount,
  teamCount,
  height = 5,
}: {
  confirmedCount: number;
  pendingPaymentCount: number;
  teamCount: number;
  height?: number;
}) {
  const max = Math.max(teamCount, 1);
  const confirmedPct = Math.min(100, (confirmedCount / max) * 100);
  const pendingPct = Math.min(100 - confirmedPct, (pendingPaymentCount / max) * 100);

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.min(teamCount, confirmedCount + pendingPaymentCount)}
      aria-valuemin={0}
      aria-valuemax={teamCount}
      aria-label={`정원 ${confirmedCount}팀 확정, ${pendingPaymentCount}팀 입금 대기, 총 ${teamCount}팀`}
      style={{ height, background: 'var(--grey100)', borderRadius: height, overflow: 'hidden', marginTop: 8, display: 'flex' }}
    >
      <div
        style={{
          width: `${confirmedPct}%`,
          height: '100%',
          background: 'var(--blue500)',
        }}
      />
      <div
        style={{
          width: `${pendingPct}%`,
          height: '100%',
          background: 'var(--orange500)',
        }}
      />
    </div>
  );
}

const COLLAPSED_POLICY_LINES = 4;
const POLICY_TOGGLE_THRESHOLD = 160;

function CollapsiblePolicyText({
  id,
  text,
  className,
  color,
  lineHeight,
}: {
  id: string;
  text: string;
  className: string;
  color: string;
  lineHeight: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const shouldCollapse = text.length > POLICY_TOGGLE_THRESHOLD || text.includes('\n');

  return (
    <>
      <p
        id={id}
        className={className}
        style={{
          color,
          lineHeight,
          margin: 0,
          whiteSpace: 'pre-wrap',
          ...(shouldCollapse && !expanded
            ? {
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: COLLAPSED_POLICY_LINES,
                overflow: 'hidden',
              }
            : {}),
        }}
      >
        {text}
      </p>
      {shouldCollapse ? (
        <button
          type="button"
          className="tm-btn tm-btn-sm tm-btn-ghost"
          aria-controls={id}
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
          style={{ marginTop: 10, paddingInline: 0, minHeight: 36 }}
        >
          {expanded ? '접기' : '전체 보기'}
          <ChevronRightIcon
            size={14}
            strokeWidth={2.2}
            aria-hidden="true"
            style={{
              marginLeft: 2,
              transform: expanded ? 'rotate(-90deg)' : 'rotate(90deg)',
              transition: 'transform 0.16s ease',
            }}
          />
        </button>
      ) : null}
    </>
  );
}

/* ── Apply CTA ── */

/**
 * Renders the CTA button pair, aware of the viewer's existing registration.
 * Tournament registrations are team-scoped, so an existing registration must not
 * hide the apply entry; the viewer may manage another team that can still apply.
 */
function ApplyCTAButtons({
  tournament,
  isFull,
  myRegistration,
}: {
  tournament: V1TournamentDetail;
  isFull: boolean;
  myRegistration: V1TournamentRegistration | null;
}) {
  const hasActiveRegistration =
    myRegistration !== null && myRegistration.status !== 'cancelled';

  if (hasActiveRegistration) {
    return (
      <Link
        href={`/tournaments/${tournament.id}/my`}
        className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
        aria-label="내 신청 내역 보기"
      >
        내 신청 보기
      </Link>
    );
  }

  const applyLabel = myRegistration?.status === 'cancelled' ? '다시 신청하기' : '참가 신청하기';
  const applyAriaLabel = myRegistration?.status === 'cancelled' ? '대회 다시 신청하기' : '참가 신청하기';

  if (isFull) {
    return (
      <button
        type="button"
        className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
        disabled
        aria-disabled="true"
        aria-label="모집이 마감되었어요"
      >
        모집 마감
      </button>
    );
  }

  return (
    <Link
      href={`/tournaments/${tournament.id}/my`}
      className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
      aria-label={applyAriaLabel}
    >
      {applyLabel}
    </Link>
  );
}

function ApplyCTA({
  tournament,
  myRegistration,
}: {
  tournament: V1TournamentDetail;
  myRegistration: V1TournamentRegistration | null;
}) {
  const isOpen = tournament.status === 'open';
  const isFull = getReservedTeamCount(tournament) >= tournament.teamCount;

  if (!isOpen) return null;

  return (
    /* Mobile-only fixed CTA — hidden on desktop via .tm-hide-desktop */
    <div className="tm-fixed-cta tm-hide-desktop">
      <ApplyCTAButtons tournament={tournament} isFull={isFull} myRegistration={myRegistration} />
    </div>
  );
}

/* ── Entry point ── */

export function TournamentDetailPageClient({ tournamentId }: { tournamentId: string }) {
  const [hasSessionHint, setHasSessionHint] = useState(false);
  const { data, isLoading, isError, error, refetch } = useV1Tournament(tournamentId);
  const { data: myRegistrations = [] } = useV1MyRegistrations(tournamentId, {
    enabled: hasSessionHint,
  });
  const myRegistration =
    myRegistrations.find((registration) => registration.status !== 'cancelled') ??
    myRegistrations[0] ??
    null;

  useEffect(() => {
    setHasSessionHint(hasStoredV1Session());
  }, []);

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
      floatingSlot={<ApplyCTA tournament={data} myRegistration={myRegistration} />}
    >
      <TournamentDetailView tournament={data} myRegistration={myRegistration} />
    </AppChrome>
  );
}

/* ── Full detail view ── */

function TournamentDetailView({
  tournament,
  myRegistration,
}: {
  tournament: V1TournamentDetail;
  myRegistration: V1TournamentRegistration | null;
}) {
  const status = getTournamentStatusConfig(tournament.status);
  const sportAccent = getSportAccent(tournament.sport.code);
  const hasAnnouncements = tournament.announcements.length > 0;
  const isOpen = tournament.status === 'open';
  const pendingPaymentCount = getPendingPaymentCount(tournament);
  const reservedTeamCount = getReservedTeamCount(tournament);
  const isFull = reservedTeamCount >= tournament.teamCount;
  const hasPrize = tournament.prizePool != null;
  const hasActiveRegistration =
    myRegistration !== null && myRegistration.status !== 'cancelled';
  // Mobile: extra bottom padding so fixed CTA doesn't occlude last content row.
  // Desktop: fixed CTA is hidden via .tm-hide-desktop; sticky right panel takes over.
  const bottomPad = isOpen ? 96 : 48;

  /* ── Prize card — rendered in left column just after metric strip ── */
  const prizeChips = tournament.prizeBreakdown
    ? tournament.prizeBreakdown.split(/[/·,\n]+/).map((s) => s.trim()).filter(Boolean)
    : [];
  const prizeCard = hasPrize ? (
    <section aria-label="상금 안내" style={{ marginTop: 16 }}>
      <Card pad={18} style={{ background: 'var(--orange50)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            aria-hidden="true"
            style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--orange500)', display: 'grid', placeItems: 'center', flexShrink: 0 }}
          >
            <TrophyIcon size={24} color="var(--static-white)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tm-text-micro" style={{ color: 'var(--text-muted)', fontWeight: 700 }}>상금</div>
            {/* P1 숫자:단위 2:1 + tabular-nums — 상금 금액 */}
            <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, lineHeight: 1.2 }}>
              <span className="tm-text-micro" style={{ color: 'var(--text-muted)', fontWeight: 600, alignSelf: 'center', marginRight: 2 }}>총</span>
              <span
                className="tab-num"
                style={{ fontSize: 'var(--font-size-subhead)', fontWeight: 800, color: 'var(--text-strong)' }}
              >
                {tournament.prizePool!.toLocaleString('ko-KR')}
              </span>
              <span
                style={{ fontSize: 'var(--font-size-body)', fontWeight: 600, color: 'var(--text-strong)' }}
              >
                원
              </span>
            </div>
          </div>
        </div>
        {prizeChips.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
            {prizeChips.map((seg, i) => (
              <span
                key={i}
                className="tm-text-micro"
                style={{ background: 'var(--surface)', color: 'var(--text-body)', fontWeight: 600, padding: '4px 10px', borderRadius: 999 }}
              >
                {seg}
              </span>
            ))}
          </div>
        ) : null}
      </Card>
    </section>
  ) : null;

  /* ── Left column body content ── */
  const leftContent = (
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

        {/* 핵심 정보 — 하나의 카드로 통합(기존: 틴트 3카드 + 별도 info 카드로 분산).
            일정·정원·참가비는 데스크탑 우측 sticky 레일과 중복되어 모바일 전용(tm-hide-desktop). */}
        <Card pad={0}>
          {/* 정원 진행 + 잔여 (모바일 전용) */}
          <div className="tm-hide-desktop" style={{ padding: '14px 16px', borderBottom: '1px solid var(--grey100)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
              <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>정원</span>
              {/* P1 숫자:단위 2:1 + tabular-nums */}
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 1 }}>
                <span className="tab-num" style={{ fontSize: 'var(--font-size-body-lg)', fontWeight: 700, color: 'var(--text-strong)' }}>
                  {reservedTeamCount}
                </span>
                <span style={{ fontSize: 'var(--font-size-body-sm)', color: 'var(--text-muted)', fontWeight: 500 }}>/{tournament.teamCount}팀</span>
              </span>
            </div>
            <CapacityProgressBar
              confirmedCount={tournament.confirmedCount}
              pendingPaymentCount={pendingPaymentCount}
              teamCount={tournament.teamCount}
            />
            {pendingPaymentCount > 0 ? (
              <div className="tm-text-caption" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', color: 'var(--text-muted)', marginTop: 6 }}>
                <span><b style={{ color: 'var(--blue500)', fontWeight: 600 }}>{tournament.confirmedCount}팀</b> 확정</span>
                <span><b style={{ color: 'var(--orange500)', fontWeight: 600 }}>{pendingPaymentCount}팀</b> 입금 대기</span>
              </div>
            ) : null}
            {(() => {
              const remaining = tournament.teamCount - reservedTeamCount;
              if (remaining <= 0) {
                return <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 6 }}>정원이 가득 찼어요</div>;
              }
              const pct = Math.round((reservedTeamCount / Math.max(tournament.teamCount, 1)) * 100);
              const almostFull = pct >= 80;
              return (
                <div className="tm-text-caption" style={{ color: almostFull ? 'var(--orange500)' : 'var(--text-muted)', marginTop: 6 }}>
                  {almostFull ? '마감 임박! ' : '아직 '}
                  <b style={{ color: almostFull ? 'var(--orange500)' : 'var(--blue500)', fontWeight: 500 }}>{remaining}자리</b> 남았어요
                </div>
              );
            })()}
          </div>
          {/* 일정·참가비 (모바일 전용 — 데스크탑은 우측 레일) */}
          <div className="tm-hide-desktop">
            <InfoRow label="일정" value={formatTournamentDateShort(tournament.scheduledAt) ?? '미정'} />
            <InfoRow label="참가비" value={formatEntryFee(tournament.entryFee)} />
          </div>
          {/* 항상 표시 */}
          {tournament.registrationDeadlineAt ? (
            <InfoRow label="신청 마감" value={formatTournamentDateLong(tournament.registrationDeadlineAt)} />
          ) : null}
          {tournament.venue ? (
            <InfoRow label="장소" value={tournament.venue} />
          ) : null}
          <InfoRow
            label="선수단 규모"
            value={`팀당 ${tournament.minPlayers}~${tournament.maxPlayers}명`}
            isLast
          />
        </Card>
      </section>

      {/* ── Prize card — shown HIGH in left column, right after metric strip ── */}
      {prizeCard}

      {/* ── 대회 진행 방식 — format-aware step-by-step flow explanation ── */}
      <TournamentFlowSection tournament={tournament} />

      {/* ── Section 2: Rules ── */}
      {tournament.rulesText ? (
        <section aria-labelledby="rules-heading" style={{ marginTop: 24 }}>
          <div id="rules-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>대회 규정</div>
          <Card pad={16} style={{ marginTop: 4 }}>
            <CollapsiblePolicyText
              id="rules-content"
              text={tournament.rulesText}
              className="tm-text-body"
              color="var(--text-body)"
              lineHeight={1.7}
            />
          </Card>
        </section>
      ) : null}

      {/* ── Section 3 + 4: Format-aware fixtures / standings (non-bracket portions) ── */}
      <FormatLeftSections tournament={tournament} />

    </>
  );

  /* ── Aside extra: 공지/환불 — 데스크탑에서 우측 컬럼(스티키 CTA 레일 아래)으로 배치해
     2단 레이아웃 우측 하단 빈 공간을 채우고 좌우 균형을 맞춘다. 모바일에서는 좌측 본문 다음·
     대진표 앞에 자연 흐름으로 표시(읽기 순서 유지). 간격은 .tm-tournament-detail-aside flex gap. ── */
  const asideExtra = (
    <>
      {hasAnnouncements ? (
        <section aria-labelledby="announcements-heading">
          <div id="announcements-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>공지사항</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tournament.announcements.map((announcement) => (
              <AnnouncementCard key={announcement.id} announcement={announcement} />
            ))}
          </div>
        </section>
      ) : null}

      {tournament.refundPolicyText ? (
        <section aria-labelledby="refund-heading">
          <div id="refund-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>환불 정책</div>
          <Card pad={16} style={{ background: 'var(--grey50)' }}>
            <CollapsiblePolicyText
              id="refund-content"
              text={tournament.refundPolicyText}
              className="tm-text-caption"
              color="var(--text-muted)"
              lineHeight={1.65}
            />
          </Card>
        </section>
      ) : null}
    </>
  );

  /* ── Desktop right-rail CTA card ── */
  const railCTA = isOpen ? (
    <aside
      className="tm-tournament-rail tm-show-desktop"
      role="complementary"
      aria-label="참가 신청"
    >
      {/* Registration status / CTA */}
      <div style={{ marginBottom: 12 }}>
        <div className="tm-text-label" style={{ color: 'var(--text-strong)', marginBottom: 2 }}>
          {hasActiveRegistration ? '내 신청' : '참가 신청'}
        </div>
        <div className="tm-text-caption" style={{ color: 'var(--text-caption)', marginBottom: 12 }}>
          {tournament.confirmedCount}/{tournament.teamCount}팀 확정
          {pendingPaymentCount > 0 ? ` · 입금대기 ${pendingPaymentCount}팀` : ''}
        </div>
        <CapacityProgressBar
          confirmedCount={tournament.confirmedCount}
          pendingPaymentCount={pendingPaymentCount}
          teamCount={tournament.teamCount}
          height={6}
        />
        <ApplyCTAButtons tournament={tournament} isFull={isFull} myRegistration={myRegistration} />
      </div>

      {/* Key facts: schedule, capacity, entry fee (the canonical desktop facts panel —
          the mobile metric strip is hidden on desktop to avoid duplication). */}
      <div
        style={{
          marginTop: 14,
          paddingTop: 14,
          borderTop: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>일정</span>
          <span className="tm-text-caption" style={{ color: 'var(--text-strong)', fontWeight: 500 }}>
            {formatTournamentDateShort(tournament.scheduledAt) ?? '미정'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>정원</span>
          <span className="tm-text-caption" style={{ color: 'var(--text-strong)', fontWeight: 500 }}>
            {reservedTeamCount}/{tournament.teamCount}팀
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>참가비</span>
          <span className="tm-text-caption" style={{ color: 'var(--text-strong)', fontWeight: 500 }}>
            {formatEntryFee(tournament.entryFee)}
          </span>
        </div>
      </div>
    </aside>
  ) : null;

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

      {/* ── Desktop 2-column layout: left=body, right=sticky CTA rail ──
          .tm-tournament-detail-grid: minmax(0,1fr) 340px (≥1440: 360px), gap 32px.
          Mobile: single-column, no grid applied. */}
      <div className="tm-tournament-detail-grid">
        {/* Left column: header + metrics + prize + rules + standings + group fixtures */}
        <div className="tm-match-detail-body">
          {leftContent}
        </div>

        {/* Right column: sticky CTA rail (desktop, open only) + 공지/환불.
            On desktop these fill the area below the short rail and balance the 2-col;
            on mobile the rail is hidden (.tm-show-desktop) and 공지/환불 flow naturally. */}
        {(railCTA || hasAnnouncements || tournament.refundPolicyText) ? (
          <div className="tm-tournament-detail-aside">
            {railCTA}
            {asideExtra}
          </div>
        ) : null}

        {/* Bracket: direct grid child spanning both columns via .tm-tournament-bleed
            (grid-column 1/-1) — full-width below the 2-col on desktop; normal flow on mobile. */}
        <BracketSection tournament={tournament} />
      </div>
    </article>
  );
}

/* ── TournamentFlowSection — explains how the tournament progresses ──
 * The format badge alone ("조별리그 후 토너먼트") doesn't tell a participant how it
 * actually runs, so spell it out as numbered steps, format-aware, in 해요체.
 */
function tournamentFormatLabel(format: V1TournamentFormat): string {
  switch (format) {
    case 'group_knockout': return '조별 리그 후 토너먼트';
    case 'knockout': return '토너먼트 (단판 승부)';
    case 'league': return '리그전 (풀리그)';
    default: return '대회';
  }
}

function getFlowSteps(format: V1TournamentFormat): Array<{ title: string; body: string }> {
  if (format === 'group_knockout') {
    return [
      { title: '조별 리그', body: '같은 조 팀끼리 돌아가며 맞붙어 조 안에서 순위를 가려요.' },
      { title: '결선 진출', body: '각 조 상위 팀이 결선 토너먼트에 올라가요.' },
      { title: '결선 토너먼트', body: '4강·결승 단판 승부로 우승팀을 가려요. 4강에서 진 두 팀은 3·4위전을 치러요.' },
    ];
  }
  if (format === 'knockout') {
    return [
      { title: '대진 편성', body: '참가 팀을 토너먼트 대진표에 배치해요.' },
      { title: '토너먼트', body: '단판 승부로 이긴 팀만 다음 라운드에 올라가요.' },
      { title: '결승 · 시상', body: '마지막까지 이긴 팀이 우승해요. 3·4위전도 함께 진행돼요.' },
    ];
  }
  return [
    { title: '풀리그', body: '참가한 모든 팀이 서로 한 번씩 맞붙어요.' },
    { title: '순위 집계', body: '승점과 득실차로 최종 순위를 가려요.' },
    { title: '시상', body: '최종 순위에 따라 상금과 순위를 시상해요.' },
  ];
}

function TournamentFlowSection({ tournament }: { tournament: V1TournamentDetail }) {
  const steps = getFlowSteps(tournament.format);
  return (
    <section aria-labelledby="flow-heading" style={{ marginTop: 24 }}>
      <div id="flow-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>대회 진행 방식</div>
      <Card pad={16} style={{ marginTop: 4 }}>
        <div className="tm-tourn-flow-format">{tournamentFormatLabel(tournament.format)}</div>
        <ol className="tm-tourn-flow">
          {steps.map((step, index) => (
            <li key={step.title} className="tm-tourn-flow-step">
              <span className="tm-tourn-flow-num" aria-hidden="true">{index + 1}</span>
              <div className="tm-tourn-flow-text">
                <div className="tm-text-label">{step.title}</div>
                <div className="tm-text-caption" style={{ marginTop: 2, lineHeight: 1.5 }}>{step.body}</div>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}

/* ── FormatLeftSections —
 * Renders standings + group fixtures but NOT the bracket.
 * The bracket is extracted to BracketSection (full-width bleed).
 */
function FormatLeftSections({ tournament }: { tournament: V1TournamentDetail }) {
  const { format, fixtures, groups } = tournament;

  const {
    groupPhaseGroups,
    groupFixtures,
    hasGroupStandings,
    hasGroupFixtures,
    hasAnyFixtures,
  } = partitionTournamentSections(format, fixtures, groups);

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

  /* knockout: bracket only — nothing in left sections, bracket goes to bleed */
  if (format === 'knockout') {
    return null;
  }

  /* group_knockout: group standings + group fixtures only (bracket to bleed) */
  return (
    <>
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
    </>
  );
}

/* ── BracketSection — spans full width via .tm-tournament-bleed on desktop ── */
function BracketSection({ tournament }: { tournament: V1TournamentDetail }) {
  const { format, fixtures, groups } = tournament;
  const { knockoutFixtures, hasKnockoutFixtures, hasAnyFixtures } =
    partitionTournamentSections(format, fixtures, groups);

  /* league: no bracket */
  if (format === 'league') return null;

  /* knockout: bracket for all fixtures */
  if (format === 'knockout') {
    return (
      <div className="tm-tournament-bleed">
        <div className="tm-match-detail-body">
          <section aria-labelledby="bracket-heading" style={{ marginTop: 24 }}>
            <div id="bracket-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
              대진표
            </div>
            <div style={{ marginTop: 4 }}>
              {hasAnyFixtures ? (
                <TournamentBracket fixtures={knockoutFixtures} groups={groups} />
              ) : (
                <FixturesPlaceholder />
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }

  /* group_knockout: knockout bracket only */
  return (
    <div className="tm-tournament-bleed">
      <div className="tm-match-detail-body">
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
                  결선 대진표
                </div>
                <div className="tm-text-caption" style={{ marginTop: 4 }}>
                  조별 리그가 끝나면 결선 대진표가 공개돼요.
                </div>
              </Card>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ── partitionTournamentSections ──
 * Pure partition helper — exported for unit testing.
 * Splits fixtures and groups into display zones:
 *  - groupPhaseGroups / groupFixtures: for standings + schedule tables (left column)
 *  - knockoutFixtures: for TournamentBracket (full-width bleed below 2-col)
 */
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

  // TB-3: group_knockout에서 groupId=null이지만 round가 녹아웃 단계인 픽스처가 결선 대진표에서
  // 누락되는 문제 수정 — knockoutFixtures에 fallback으로 포함. round 는 표시 라벨이라 한글('4강'·
  // '결승'·'3·4위전')이 정상값이므로 영문 키와 한글 라벨을 모두 매칭(어드민 자동생성은 한글 라벨 사용).
  const knockoutRoundLabels = ['semi', 'final', 'third_place', '4강', '결승', '3·4위전'];
  const knockoutFixtures =
    format === 'knockout'
      ? fixtures
      : fixtures.filter(
          (f) =>
            (f.groupId !== null && knockoutGroupIds.has(f.groupId)) ||
            (f.groupId === null && knockoutRoundLabels.some((r) => f.round.includes(r))),
        );

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
    case 'in_progress': return '진행 중';
    case 'completed': return '종료';
    case 'cancelled': return '취소';
    default: return '알 수 없음';
  }
}

function fixtureStatusBadge(status: string): string {
  switch (status) {
    case 'in_progress': return 'tm-badge-green';
    case 'completed': return 'tm-badge-grey';
    case 'cancelled': return 'tm-badge-red';
    default: return 'tm-badge-grey';
  }
}

/**
 * D4: Scheduled 예정 뱃지 — 회색 배경 + 파란 점으로 종료(completed)와 시각 구분.
 * 점에만 의존하지 않고 '예정' 텍스트를 함께 유지 (a11y: 컬러+텍스트 병행).
 */
function FixtureStatusBadge({ status }: { status: string }) {
  const badgeClass = fixtureStatusBadge(status);
  const label = fixtureStatusLabel(status);
  return (
    <span className={`tm-badge ${badgeClass}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {status === 'scheduled' ? (
        <span
          aria-hidden="true"
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: 'var(--blue500)',
            flexShrink: 0,
            display: 'inline-block',
          }}
        />
      ) : null}
      {label}
    </span>
  );
}

function FixtureCard({ fixture }: { fixture: V1TournamentFixture }) {
  const hasResult = fixture.result !== null;
  const homeScore = hasResult ? fixture.result!.homeScore : null;
  const awayScore = hasResult ? fixture.result!.awayScore : null;
  // 라운드 라벨: tournament-bracket.tsx ROUND_LABELS 맵과 동일하게 '4강' 사용
  const roundLabel = fixture.round
    ? fixture.round.replace('group', '조별').replace('semi', '4강').replace('final', '결승').replace('third_place', '3·4위')
    : `${fixture.fixtureNumber}경기`;
  // 날짜 라벨: invalid/누락이면 null → 빈 span(스타일된 공백) 대신 날짜 영역 자체를 숨긴다 (Copilot)
  const scheduledLabel = formatTournamentDateShort(fixture.scheduledAt);

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
          {scheduledLabel ? (
            <span className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>
              {scheduledLabel}
            </span>
          ) : null}
        </div>
        <FixtureStatusBadge status={fixture.status} />
      </div>

      {/* VS row */}
      <div
        role="group"
        aria-label={`${fixture.homeTeamName || '미정'} 대 ${fixture.awayTeamName || '미정'}`}
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
            {fixture.homeTeamName || '미정'}
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
              vs
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
            {fixture.awayTeamName || '미정'}
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
          style={{ color: isQualifying ? 'var(--text-strong)' : 'var(--text-caption)' }}
        >
          {rank}
        </span>
      </td>
      <td
        style={{ padding: '8px 4px', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        <span className="tm-text-label" style={{ color: 'var(--text-strong)' }}>
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
      <div style={{ overflowX: 'auto' }}>
        <table
          /* colgroup으로 열 너비를 명시해 카드 끝선까지 순위표가 확장되도록 함.
             maxWidth 캡 제거 — 카드 너비에 맞게 테이블이 늘어남. */
          style={{ width: '100%', borderCollapse: 'collapse', minWidth: 280 }}
          aria-label={`${group.name} 순위표`}
        >
          <colgroup>
            {/* 순위 */}
            <col style={{ width: 32 }} />
            {/* 팀명 — 남은 공간을 모두 차지 */}
            <col />
            {/* 승점 */}
            <col style={{ width: 48 }} />
            {/* 전적 */}
            <col style={{ width: 88 }} />
            {/* 득실 */}
            <col style={{ width: 48 }} />
          </colgroup>
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
