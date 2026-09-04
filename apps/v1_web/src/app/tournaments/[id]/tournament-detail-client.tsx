'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useShellOverride } from '@/components/v1-ui/shell-override';
import { Card, EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { FormattedText } from '@/components/v1-ui/formatted-text';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { Trophy, Goal, ChevronLeft, ChevronRight } from 'lucide-react';
import { useV1Tournament, useV1MyRegistrations } from '@/hooks/use-v1-api';
import { v1Get } from '@/lib/api-client';
import {
  LeagueStandingsTable,
  type LeagueStandingsTableData,
} from '@/components/tournaments/league-standings-table';
import { trackEvent } from '@/lib/analytics';
import { extractErrorMessage } from '@/lib/error-message';
import { hasStoredV1Session } from '@/lib/session-storage';
import { getSportAccent } from '@/lib/v1-sport-accent';
import { getTournamentStatusConfig } from '@/lib/v1-tournament-status';
import { splitPrizeSegments, isPrizeAmountValue, formatPrizeRowValue } from '@/lib/prize-breakdown';
import { TournamentBracket } from '@/components/tournaments/tournament-bracket';
import { LeagueFixtureCard } from '@/components/tournaments/league-fixture-card';
import {
  CompetitionFixtureCard,
  CompetitionFixtureVenue,
} from '@/components/tournaments/competition-fixture-card';
import {
  TournamentApplicationGuideSection,
  TournamentParticipantSection,
} from '@/components/tournaments/tournament-event-hub-sections';
import {
  TournamentPostEventHubSection,
  TournamentVenuePrepSection,
} from '@/components/tournaments/tournament-venue-retention-sections';
import { TournamentSponsorSection } from '@/components/tournaments/tournament-sponsor-section';
import { TournamentInquirySection } from '@/components/tournaments/tournament-inquiry-section';
import { getTournamentAnnouncementCategoryLabel } from '@/components/tournaments/tournament-announcement-category';
import { isLeagueCompetition } from '@/lib/competition-kind';
import {
  formatTournamentDateShort,
  formatTournamentDateTimeShort,
  formatTournamentDateRangeWithTime,
  formatTournamentDateLong,
  formatEntryFee,
} from '@/lib/date-utils';
import {
  resolveTournamentRegistrationBlock,
  describeTournamentRegistrationBlock,
  resolveTournamentCapacity,
  type TournamentRegistrationBlockReason,
} from '@/lib/tournament-registration-availability';
import type {
  V1TournamentDetail,
  V1TournamentFormat,
  V1TournamentGroup,
  V1TournamentFixture,
  V1TournamentAnnouncement,
  V1TournamentRegistration,
  V1TournamentStatus,
} from '@/types/api';

export { getParticipantTeamBuckets } from '@/components/tournaments/tournament-event-hub-sections';

/* ── Format helpers ── */

/**
 * 거울 행의 `format` 은 사실이 아니므로(백필이 안 채워 기본값 `group_knockout` 이 남는다)
 * **리그 판정을 먼저** 한다 — 안 그러면 정규 리그 배지에 "조별리그 후 토너먼트"라고 적힌다.
 */
function getFormatLabel(competition: V1TournamentDetail): string {
  if (isLeagueCompetition(competition)) return '리그';
  return competition.format === 'knockout' ? '토너먼트' : '조별리그 후 토너먼트';
}

/**
 * /bracket(순위·대진표·일정 통합 허브, §B-6)로 향하는 단일 진입 CTA의 문구 — 대회
 * 상태별로 다르게 정한다. 예전엔 in_progress 전용 "순위표 · 대진표 보기"(topCTA)와
 * 상태 무관 "전체 경기 일정 보기" 링크가 따로 있었는데(§A-1·2), 이제 이 하나로 합친다.
 *  - in_progress: 오너가 명시한 문구 "진행 중인 대회 보기"를 그대로 쓴다.
 *  - completed: "진행 중"은 끝난 대회엔 거짓 정보다(오너 지적 그대로). 이 CTA는 최종
 *    일정·대진표를 다시 보는 용도이고, 시상식 하이라이트는 /results가 별도로 맡고
 *    있어(CompletedResultHero) 문구를 겹치지 않게 "경기 결과 · 대진표 보기"로 뒀다.
 *  - open(모집 중)·closed(모집 마감 · 시작 전="예정"): 대진 편성이 아직 안 끝났을 수
 *    있어 "확정"을 단언하지 않고 "대진표 · 일정 보기"로 통일한다. /bracket 은 대진이
 *    비어 있어도 빈 화면이 아니라 "대진표 준비 중" 안내를 보여주므로 미리 눌러도
 *    오류처럼 보이지 않는다(BracketEmpty).
 *  - draft(비공개 준비 상태)·cancelled(취소): 볼 대진 자체가 무의미하므로 null을
 *    반환해 CTA를 아예 숨긴다 — 데이터 없는 화면을 억지로 보여주지 않는다는 원칙.
 */
export function getBracketEntryCtaLabel(
  status: V1TournamentStatus,
  /**
   * **정규 리그 시즌인가(`kind === 'regular_league'`).** 리그엔 대진표가 없어 대회 문구가
   * 그대로 거짓이 된다. 2026-09-01 사용자 확정 — 리그 문구는 상태별로
   * '진행 중인 리그 보기' / '최종 순위 보기' / '일정 보기' 이고, **대회 문구는 그대로 둔다.**
   *
   * ⚠️ `isLeagueCompetition` 으로 묻지 않는다 — 그건 `format === 'league'` 인 리그 방식
   * **대회**(alpha 62건 중 7건)도 true 라 그 대회들의 문구까지 바꾼다.
   *
   * ⚠️ 리그의 `open`/`closed` 는 실제로 도달하지 않는다(리그 상태는 draft·active·completed
   * 만 거울 상태로 매핑된다). 그래도 적어 둔다 — 빠뜨리면 그 경로가 열리는 날 대회 문구가
   * 조용히 새어 나온다.
   */
  isRegularLeague = false,
): string | null {
  switch (status) {
    case 'in_progress':
      return isRegularLeague ? '진행 중인 리그 보기' : '진행 중인 대회 보기';
    case 'completed':
      return isRegularLeague ? '최종 순위 보기' : '경기 결과 · 대진표 보기';
    case 'open':
    case 'closed':
      return isRegularLeague ? '일정 보기' : '대진표 · 일정 보기';
    case 'draft':
    case 'cancelled':
    default:
      return null;
  }
}

function getGenderCategoryLabel(category: V1TournamentDetail['genderCategory']) {
  if (category === 'mixed') return '혼성';
  if (category === 'male') return '남성부';
  if (category === 'female') return '여성부';
  return null;
}

function getGenderQuotaLabel(
  tournament: Pick<
    V1TournamentDetail,
    | 'genderCategory'
    | 'genderMinMale'
    | 'genderMaxMale'
    | 'genderMinFemale'
    | 'genderMaxFemale'
  >,
) {
  if (tournament.genderCategory !== 'mixed') return null;
  const formatRange = (label: string, min: number | null, max: number | null) => {
    if (min === null && max === null) return null;
    if (min !== null && max !== null) return `${label} ${min}~${max}명`;
    if (min !== null) return `${label} 최소 ${min}명`;
    return `${label} 최대 ${max}명`;
  };
  return [
    formatRange('남성', tournament.genderMinMale, tournament.genderMaxMale),
    formatRange('여성', tournament.genderMinFemale, tournament.genderMaxFemale),
  ]
    .filter((value): value is string => value !== null)
    .join(' · ');
}

/**
 * 완료 대회 결과 히어로용 우승팀명 — 결선(final) 픽스처 승자(knockout·group_knockout) 또는
 * 단일 그룹 1위 팀(league)만 계산한다. 결선 미기록 등으로 간단히 확정되지 않으면 null을 반환해
 * 히어로가 기존 "대회가 끝났어요" 문구로 안전하게 폴백하도록 한다(과설계 방지).
 */
export function getCompletedChampionName(tournament: V1TournamentDetail): string | null {
  if (isLeagueCompetition(tournament)) {
    const leagueGroup = tournament.groups.find((g) => g.phase === 'group');
    if (!leagueGroup) return null;
    const top = [...leagueGroup.standings].sort((a, b) => a.position - b.position)[0];
    return top?.teamName ?? null;
  }

  const finalFixture = tournament.fixtures.find((f) => f.round === 'final' || f.round === '결승');
  if (!finalFixture?.result) return null;

  const { homeScore, awayScore, hasPenalty, homePenaltyScore, awayPenaltyScore } = finalFixture.result;
  let winnerSide: 'home' | 'away' | null = null;
  if (hasPenalty && homePenaltyScore !== null && awayPenaltyScore !== null) {
    if (homePenaltyScore !== awayPenaltyScore) winnerSide = homePenaltyScore > awayPenaltyScore ? 'home' : 'away';
  } else if (homeScore !== awayScore) {
    winnerSide = homeScore > awayScore ? 'home' : 'away';
  }
  if (winnerSide === 'home') return finalFixture.homeTeamName || null;
  if (winnerSide === 'away') return finalFixture.awayTeamName || null;
  return null;
}

/**
 * 상금 칩 분리 — lib/prize-breakdown의 공용 스플리터(splitPrizeSegments)를 그대로 소비한다.
 * 구분자 규칙("/"·줄바꿈·비-천단위 콤마, "·"는 물품 나열용으로 보존)이 시상 페이지·어드민
 * 미리보기(parsePrizeRows)와 단일 소스로 통일되어 화면 간 항목 수가 어긋나지 않는다.
 */
export function getPrizeBreakdownChips(prizeBreakdown: string | null): string[] {
  if (!prizeBreakdown) return [];
  return splitPrizeSegments(prizeBreakdown);
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
          background: 'var(--grey300)',
        }}
      />
    </div>
  );
}

const COLLAPSED_POLICY_MAX_HEIGHT = 96; // 대략 4줄 분량
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
  const collapsed = shouldCollapse && !expanded;
  const fadeMask = 'linear-gradient(180deg, #000 55%, transparent 100%)';

  return (
    <>
      <div
        id={id}
        style={
          collapsed
            ? {
                maxHeight: COLLAPSED_POLICY_MAX_HEIGHT,
                overflow: 'hidden',
                maskImage: fadeMask,
                WebkitMaskImage: fadeMask,
              }
            : undefined
        }
      >
        <FormattedText text={text} className={className} style={{ color, lineHeight }} />
      </div>
      {shouldCollapse ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button
            type="button"
            className="tm-btn tm-btn-sm tm-btn-ghost"
            aria-controls={id}
            aria-expanded={expanded}
            onClick={() => setExpanded((prev) => !prev)}
            style={{
              fontSize: 'var(--font-size-caption)',
              fontWeight: 500,
              color: 'var(--text-muted)',
            }}
          >
            {expanded ? '접기' : '전체 보기'}
            <ChevronRight
              size={12}
              strokeWidth={2.2}
              aria-hidden="true"
              style={{
                marginLeft: 2,
                transform: expanded ? 'rotate(-90deg)' : 'rotate(90deg)',
                transition: 'transform 0.16s ease',
              }}
            />
          </button>
        </div>
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
/** 차단 사유별 버튼 라벨 — '모집 마감'(정원)과 '신청 마감'(기한)을 구분해 보여준다. */
function getApplyBlockButtonLabel(reason: TournamentRegistrationBlockReason): string {
  return reason === 'deadline_passed' ? '신청 마감' : '모집 마감';
}

function ApplyCTAButtons({
  tournament,
  blockReason,
  myRegistration,
}: {
  tournament: V1TournamentDetail;
  /** null이면 신청 가능. `resolveTournamentRegistrationBlock()` 단일 소스 판정. */
  blockReason: TournamentRegistrationBlockReason | null;
  myRegistration: V1TournamentRegistration | null;
}) {
  const hasActiveRegistration =
    myRegistration !== null && myRegistration.status !== 'cancelled';

  if (hasActiveRegistration) {
    return (
      <Link
        href={`/tournaments/${tournament.id}/my`}
        className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
        style={{ fontSize: 'var(--font-size-body-lg)' }}
        aria-label="내 신청 내역 보기"
      >
        내 신청 보기
      </Link>
    );
  }

  const applyLabel = myRegistration?.status === 'cancelled' ? '다시 신청하기' : '참가 신청하기';
  const applyAriaLabel = myRegistration?.status === 'cancelled' ? '대회 다시 신청하기' : '참가 신청하기';

  if (blockReason !== null) {
    const description = describeTournamentRegistrationBlock(
      blockReason,
      resolveTournamentCapacity(tournament),
    );
    return (
      <button
        type="button"
        className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
        style={{ fontSize: 'var(--font-size-body-lg)' }}
        disabled
        aria-disabled="true"
        aria-label={description}
      >
        {getApplyBlockButtonLabel(blockReason)}
      </button>
    );
  }

  return (
    <Link
      href={`/tournaments/${tournament.id}/my`}
      className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
      style={{ fontSize: 'var(--font-size-body-lg)' }}
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

  if (!isOpen) return null;

  const blockReason = resolveTournamentRegistrationBlock(tournament);

  return (
    /* Mobile-only fixed CTA — hidden on desktop via .tm-hide-desktop */
    <div className="tm-fixed-cta tm-hide-desktop">
      <ApplyCTAButtons tournament={tournament} blockReason={blockReason} myRegistration={myRegistration} />
    </div>
  );
}

/* ── Unified bracket-entry CTA (top-sticky + bottom, mobile/tablet only — desktop
   uses the always-visible sticky rail below) ── */

function BracketEntryCtaButton({ tournament }: { tournament: V1TournamentDetail }) {
  const label = getBracketEntryCtaLabel(tournament.status, tournament.kind === 'regular_league');
  if (!label) return null;
  const isLive = tournament.status === 'in_progress';

  return (
    <Link
      href={`/tournaments/${tournament.id}/bracket`}
      className="tm-pressable"
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '16px 16px',
        borderRadius: 'var(--radius-field)',
        textDecoration: 'none',
        background: isLive ? 'var(--blue500)' : 'var(--surface)',
        border: isLive ? 'none' : '1px solid var(--border)',
        boxShadow: isLive ? '0 2px 14px rgba(49,130,246,0.3)' : 'none',
      }}
    >
      {isLive ? (
        <span
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'rgba(255,255,255,0.18)', borderRadius: 20,
            padding: '3px 8px', flexShrink: 0,
          }}
        >
          <span
            style={{
              width: 6, height: 6, borderRadius: 'var(--radius-circle)',
              background: '#4ADE80', flexShrink: 0,
              boxShadow: '0 0 0 2px rgba(74,222,128,0.35)',
            }}
            aria-hidden="true"
          />
          <span style={{ fontSize: 'var(--font-size-caption)', fontWeight: 800, color: '#fff', letterSpacing: '0.02em' }}>LIVE</span>
        </span>
      ) : (
        <span
          aria-hidden="true"
          // 2026-08-11: 순수 내비게이션 CTA라 경고색 의미가 없는데 파란 틴트가 튀어
          // 보인다는 지적 — 무채색으로 통일 (마이허브 메뉴 아이콘과 동일 근거)
          style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--grey100)' }}
        >
          <Goal size={16} color="var(--text-strong)" strokeWidth={2.2} />
        </span>
      )}
      <span style={{ flex: 1, fontSize: 'var(--font-size-body-lg)', fontWeight: 800, letterSpacing: '-0.01em', color: isLive ? '#fff' : 'var(--text-strong)' }}>
        {label}
      </span>
      <ChevronRight
        size={18}
        strokeWidth={2.5}
        style={{ color: isLive ? 'rgba(255,255,255,0.65)' : 'var(--text-caption)', flexShrink: 0 }}
        aria-hidden="true"
      />
    </Link>
  );
}

/**
 * 하단 CTA가 실제로 뷰포트에 들어왔는지 감지 — 상단 스티키 CTA와 하단 CTA가 동시에
 * 화면에 보이지 않게 하려는 용도(오너 요구: "CTA 가 화면에 동시에 2개 보이면 안 된다").
 * 방향을 "하단이 보이면 상단을 끈다"로 잡은 이유: position:sticky는 자기 컨테이너가
 * 끝나기 전까지 계속 화면에 붙어 있는 게 정상 동작이라, 실행 가능한 유일한 신호는
 * "하단 CTA가 실제로 뷰포트에 들어왔다"는 이벤트뿐이다. IntersectionObserver로
 * 하단 CTA 엘리먼트의 실제 노출 여부를 관찰한다(스크롤 리스너 + getBoundingClientRect
 * 폴링보다 가볍고, 스크롤 컨테이너가 `.tm-scroll-area`(모바일)든 문서(데스크톱)든
 * root 를 명시하지 않아도 실제 클리핑을 그대로 따라간다).
 */
function useIsInViewport(ref: React.RefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return visible;
}

/* ── Entry point ── */

export function TournamentDetailPageClient({ tournamentId }: { tournamentId: string }) {
  const [hasSessionHint, setHasSessionHint] = useState(false);
  const { data, isLoading, isError, error, refetch } = useV1Tournament(tournamentId);
  const { data: myRegistrations = [] } = useV1MyRegistrations(tournamentId, {
    enabled: hasSessionHint,
  });
  const hasCompletedFixture =
    data?.fixtures.some((fixture) => fixture.status === 'completed' && fixture.result !== null) ?? false;
  const myRegistration =
    myRegistrations.find((registration) => registration.status !== 'cancelled') ??
    myRegistrations[0] ??
    null;
  const trackedViewRef = useRef<string | null>(null);

  useEffect(() => {
    setHasSessionHint(hasStoredV1Session());
  }, []);

  useEffect(() => {
    if (!data || trackedViewRef.current === tournamentId) return;
    trackedViewRef.current = tournamentId;
    trackEvent('tournament_view', { tournamentId });
  }, [data, tournamentId]);

  // fetch된 대회명이 있을 때만 덮어쓴다 — 로딩/에러 중엔 테이블의 "대회 상세" 기본값이
  // 그대로 쓰인다(§1.9 "fetch된 제목" 하위유형). desktopHead:false는 TournamentDetailView가
  // 자기 desktop head를 직접 그리기 때문(§1.9 R3, :1321 참조) — 로딩/에러 분기의
  // 제너릭 desktop head(테이블 desktopHead:true)와 중복 렌더를 막는다.
  useShellOverride(
    data
      ? {
          title: data.title,
          desktopHead: false,
          floatingSlot: <ApplyCTA tournament={data} myRegistration={myRegistration} />,
        }
      : {},
  );

  if (isLoading) {
    return <TournamentDetailSkeleton />;
  }

  if (isError || !data) {
    const msg = extractErrorMessage(error, '대회 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    return (
      <div style={{ padding: '48px 20px 0' }}>
        <ErrorState
          message={msg}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  return (
    <TournamentDetailView
      tournament={data}
      myRegistration={myRegistration}
    />
  );
}

/* ── Full detail view ──
 * Exported (in addition to the data-fetching TournamentDetailPageClient wrapper above) so unit
 * tests can render the completed vs non-completed section-rendering contract directly with a
 * plain V1TournamentDetail fixture, without needing to mock the data hooks — same pattern as
 * teams-page.tsx's exported *PageView components. */
export function TournamentDetailView({
  tournament,
  myRegistration,
}: {
  tournament: V1TournamentDetail;
  myRegistration: V1TournamentRegistration | null;
}) {
  const status = getTournamentStatusConfig(tournament.status);
  const sportAccent = getSportAccent(tournament.sport.code);
  const isOpen = tournament.status === 'open';
  const isCompleted = tournament.status === 'completed';
  const pendingPaymentCount = getPendingPaymentCount(tournament);
  const reservedTeamCount = getReservedTeamCount(tournament);
  /**
   * **정원·참가비는 대회에만 그린다.**
   *
   * 리그에는 정원 개념이 없다 — `V1League` 모델에 `max`·`capacity` 계열 필드가 아예 없다.
   * 그런데 거울 행은 `v1_tournaments` 에 살고 `team_count` 가 `@default(8)` 이라, 그대로
   * 그리면 **참여할 방법이 없는 리그에 "정원 2/8팀 아직 6자리 남았어요" 가 뜬다**
   * (alpha 실측 — #898 로 이 화면을 연 뒤 실제로 그랬다).
   *
   * ⚠️ **타입이 아니라 분기로 닫는다.** 상세 타입(`V1TournamentDetail.teamCount`)을
   * optional 로 바꾸면 `my`·`apply`·`bracket` 등 **리그가 도달할 수 없는 화면 5개 20곳**이
   * 함께 열린다(실측). 그 셋은 리그와 무관하고, 거기서 undefined 처리를 새로 짜는 것은
   * 이 결함과 관계없는 작업이다. 목록은 리그가 섞여 들어오는 게 목적이라 타입으로 막았고,
   * 상세는 리그 분기가 이미 있어 그 분기로 닫는다 — **판단 기준은 도달 가능성이다.**
   *
   * 분기는 기억에 의존하므로 **테스트로 못박는다**(`tournament-detail-client.test.ts`).
   */
  /**
   * **여기서는 `isLeagueCompetition` 을 쓰면 안 된다.**
   * ```
   * 리그 방식 대회   format='league'  kind='regular_tournament'   ← 진짜 대회다. 정원·참가비 있다
   * 정규 리그 시즌   kind='regular_league'                        ← 거울 행. 둘 다 없다
   * ```
   * `isLeagueCompetition` 은 위 둘을 **모두** true 로 준다(`format==='league' || kind===…`).
   * 그 판정은 *"어떻게 치르나"* 를 물을 때 맞다 — 순위표를 그릴지, 대진표 대신 리그 일정을
   * 보여줄지는 리그 방식 대회에도 같이 적용된다. 하지만 *"정원 개념이 있나"* 는 **무엇인가**의
   * 질문이라 `kind` 만 봐야 한다. 섞으면 alpha 의 리그 방식 대회 7건이 신청 정원을 잃는다
   * (실제로 이 스펙이 red 로 잡았다).
   *
   * 목록 카드는 같은 질문에 **필드 유무**(`teamCount === undefined`)로 답한다 — 서버가
   * `kind === 'regular_league'` 일 때만 생략하므로 결과가 같고, 거기서는 타입이 계산까지
   * 막아 준다.
   */
  const isLeagueMirror = tournament.kind === 'regular_league';
  const showsCapacity = !isLeagueMirror;
  /* 참가비도 정규 리그에는 개념이 없다 — `V1League` 에 참가비 필드가 **없고**, 거울의
     `entry_fee` 는 `@default(0)` 이라 그리면 **"무료"** 가 뜬다. 그건 사실이 아니라
     미설정이다(정원 8 과 같은 자리). 정원과 따로 두는 이유는 두 개념이 언젠가 갈릴 수
     있어서다 — 한 이름으로 묶으면 그때 이름이 거짓이 된다. */
  const showsEntryFee = !isLeagueMirror;
  /* 신규 신청 차단 사유(마감 경과·정원 마감) — CTA·안내 문구·정원 캡션이 전부 이 하나의
     판정을 공유한다. status만 보던 예전 로직은 신청 마감이 지난 open 대회에서도
     '참가 신청하기'를 활성으로 그렸다. */
  const registrationBlock = resolveTournamentRegistrationBlock(tournament);
  const prizeText = tournament.prizeSummary?.trim() ?? '';
  const genderCategoryLabel = getGenderCategoryLabel(tournament.genderCategory);
  const genderQuotaLabel = getGenderQuotaLabel(tournament);
  const hasPrize = prizeText.length > 0;
  const hasActiveRegistration =
    myRegistration !== null && myRegistration.status !== 'cancelled';
  // Mobile: extra bottom padding so fixed CTA doesn't occlude last content row.
  // Desktop: fixed CTA is hidden via .tm-hide-desktop; sticky right panel takes over.
  const bottomPad = isOpen ? 96 : 48;

  /* ── 신청자 본인 대상 targeted 공지(confirmed_only/waitlist/all_registered) ──
     공개 상세 프로젝션(`tournament.announcements`)은 audience='public'만 담는다(의도된
     계약 — 비로그인 방문자에게 team-scoped 공지를 노출하면 안 되므로). 하지만 그 결과
     신청 팀에게 "공지를 확인해 보세요" 알림이 발송돼도 본문을 읽을 화면이 이 페이지
     어디에도 없었다(실사고). 신청 이력이 있는 사용자만 `/announcements/me`를 조회해
     본인 자격에 맞는 공지를 가져와 공개 목록과 병합한다.
     `LeagueStandingsSection`과 같은 이유로 useQuery 대신 수동 fetch — 이 컴포넌트는
     QueryClientProvider 없이 단독 렌더되는 기존 테스트가 있다(tournament-detail-cta.test.tsx). */
  const [participantAnnouncements, setParticipantAnnouncements] = useState<V1TournamentAnnouncement[]>([]);
  useEffect(() => {
    if (!hasActiveRegistration) {
      setParticipantAnnouncements([]);
      return;
    }
    let cancelled = false;
    v1Get<{ items: V1TournamentAnnouncement[] }>(`/tournaments/${tournament.id}/announcements/me`)
      .then((res) => {
        if (!cancelled) setParticipantAnnouncements(res.items);
      })
      .catch(() => {
        // 이 fetch는 공개 목록을 보강하는 보조 데이터다 — 실패해도 이미 렌더된
        // public 공지·나머지 상세 화면은 멀쩡하므로 화면을 막을 이유가 없다.
        // (조용한 실패지만, silent catch 안티패턴과 달리 "실패해도 안전한 보조
        // 데이터"라는 판단 근거가 있고 사용자 액션에 대한 응답이 아니다.)
        if (!cancelled) setParticipantAnnouncements([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tournament.id, hasActiveRegistration]);

  const allAnnouncements = (() => {
    if (participantAnnouncements.length === 0) return tournament.announcements;
    const seen = new Set(tournament.announcements.map((a) => a.id));
    const extra = participantAnnouncements.filter((a) => !seen.has(a.id));
    if (extra.length === 0) return tournament.announcements;
    return [...tournament.announcements, ...extra].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
  })();
  const hasAnnouncements = allAnnouncements.length > 0;

  /* ── 통합 진입 CTA(상단 스티키 + 하단, §A-3·4·5) — 모바일/태블릿 전용.
     데스크탑은 railCTA가 이미 항상 보이는 sticky 패널이라 별도 처리가 필요 없다. */
  const bracketCtaLabel = getBracketEntryCtaLabel(tournament.status, isLeagueMirror);
  const bottomCtaRef = useRef<HTMLDivElement | null>(null);
  const bottomCtaVisible = useIsInViewport(bottomCtaRef);

  /* ── Prize card — rendered in left column just after metric strip ── */
  // 상금 칩 분리: '/'·개행·콤마 구분 지원. 단 "600,000" 같은 천단위 콤마(양옆이 숫자)는
  // 분리하지 않는다 — dev의 콤마 구분 요구를 더 견고한 getPrizeBreakdownChips 헬퍼(테스트 보유)로 충족.
  const prizeChips = getPrizeBreakdownChips(tournament.prizeBreakdown);
  const prizeCard = hasPrize ? (
    <section aria-label="상품 및 상금 안내" style={{ marginTop: 16 }}>
      <Card pad={20} style={{ background: 'var(--orange50)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            aria-hidden="true"
            style={{ width: 44, height: 44, borderRadius: 'var(--radius-control)', background: 'var(--orange500)', display: 'grid', placeItems: 'center', flexShrink: 0 }}
          >
            <Trophy size={24} color="var(--static-white)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tm-text-caption" style={{ color: 'var(--text-muted)', fontWeight: 700 }}>상품 및 상금</div>
            <div className="tm-text-body-lg" style={{ marginTop: 4, color: 'var(--orange700)', fontWeight: 800, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
              {prizeText}
            </div>
          </div>
        </div>
        {prizeChips.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            {prizeChips.map((seg, i) => {
              const m = seg.match(/^(우승|준우승|공동 ?[1-9]위|[1-9]위|MVP|득점왕|도움왕|(?:참가(?:팀|자) )?전원)\s+(.+)$/);
              return (
                <span
                  key={i}
                  className="tm-text-caption"
                  // 2026-08-11: 중립 --surface(라이트 흰색/다크 근흑색)를 쓰면 이 칩이 속한
                  // 주황 카드(Card background: --orange50)와 색이 완전히 분리돼 보인다 —
                  // 특히 다크모드에서 카드는 따뜻한 주황조인데 칩만 차가운 무채색 검정으로
                  // 떠 보이는 결함이 실측 확인됐다(라이브 alpha 스크린샷). 카드 톤에 맞춘
                  // 반투명 --tint-orange(주황 10%, 라이트/다크 공용)로 교체.
                  style={{ background: 'var(--tint-orange)', border: '1px solid var(--tint-orange-border)', color: 'var(--text-body)', fontWeight: 600, padding: '4px 12px', borderRadius: 'var(--radius-pill)' }}
                >
                  {m ? (
                    <>
                      <strong style={{ color: 'var(--text-strong)', fontWeight: 800, marginRight: 4 }}>{m[1]}</strong>
                      {isPrizeAmountValue(m[2]) ? (
                        formatPrizeRowValue(m[2])
                      ) : (
                        <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>{m[2].trim()}</span>
                      )}
                    </>
                  ) : (
                    seg
                  )}
                </span>
              );
            })}
          </div>
        ) : null}
      </Card>
    </section>
  ) : null;

  /* ── Header identity block (icon + title + badges) — shared by open/scheduled/in_progress
     layout and the completed layout, which relocates it above the result hero (TARGET §1). ── */
  const headerIdentitySection = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
      <div
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: 56,
          height: 56,
          borderRadius: 'var(--radius-container)',
          background: 'linear-gradient(135deg, var(--blue500) 0%, var(--blue600) 100%)',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--static-white)',
        }}
      >
        <Trophy size={28} strokeWidth={1.6} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 className="tm-text-heading" style={{ color: 'var(--text-strong)', margin: 0, lineHeight: 1.3 }}>
          {tournament.title}
        </h1>
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className={`tm-badge ${status.badgeClass}`}>
            {status.label}
          </span>
          <span className="tm-badge tm-badge-grey" aria-label={`대회 형식: ${getFormatLabel(tournament)}`}>
            {getFormatLabel(tournament)}
          </span>
          {genderCategoryLabel ? (
            <span className="tm-badge tm-badge-grey" aria-label={`성별 카테고리: ${genderCategoryLabel}`}>
              {genderCategoryLabel}
            </span>
          ) : null}
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
                borderRadius: 'var(--radius-circle)',
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
  );

  /* ── Left column body content (open / scheduled / in_progress — unchanged behavior) ── */
  const leftContent = (
    <>
      {/* ── Section 1: Header ── */}
      <section aria-label="대회 기본 정보" style={{ marginTop: 20 }}>
        {headerIdentitySection}

        {/* 핵심 정보 — 하나의 카드로 통합(기존: 틴트 3카드 + 별도 info 카드로 분산).
            일정·정원·참가비는 데스크탑 우측 sticky 레일과 중복되어 모바일 전용(tm-hide-desktop). */}
        <Card pad={0}>
          {/* 정원 진행 + 잔여 (모바일 전용) — 리그는 정원 개념이 없어 통째로 안 그린다 */}
          {showsCapacity ? (
          <div className="tm-hide-desktop" style={{ padding: '16px 16px', borderBottom: '1px solid var(--grey100)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>정원</span>
              {/* P1 숫자:단위 2:1 + tabular-nums */}
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 1 }}>
                <span className="tab-num" style={{ fontSize: 'var(--font-size-body-lg)', fontWeight: 700, color: 'var(--text-strong)' }}>
                  {reservedTeamCount}
                </span>
                <span style={{ fontSize: 'var(--font-size-label)', color: 'var(--text-muted)', fontWeight: 500 }}>/{tournament.teamCount}팀</span>
              </span>
            </div>
            <CapacityProgressBar
              confirmedCount={tournament.confirmedCount}
              pendingPaymentCount={pendingPaymentCount}
              teamCount={tournament.teamCount}
            />
            {pendingPaymentCount > 0 ? (
              <div className="tm-text-caption" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', color: 'var(--text-muted)', marginTop: 8 }}>
                <span><b style={{ color: 'var(--blue700)', fontWeight: 600 }}>{tournament.confirmedCount}팀</b> 확정</span>
                <span><b style={{ color: 'var(--orange700)', fontWeight: 600 }}>{pendingPaymentCount}팀</b> 입금 대기</span>
              </div>
            ) : null}
            {(() => {
              const remaining = tournament.teamCount - reservedTeamCount;
              if (remaining <= 0) {
                return <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 8 }}>정원이 가득 찼어요</div>;
              }
              /* 정원은 남았어도 신청 마감이 지났으면 "아직 N자리 남았어요"는 신청 가능하다는
                 오해를 만든다(CTA·이 캡션 둘 다 초대 신호를 보내는 문제였다). */
              if (registrationBlock === 'deadline_passed') {
                return <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 8 }}>신청이 마감됐어요</div>;
              }
              const pct = Math.round((reservedTeamCount / Math.max(tournament.teamCount, 1)) * 100);
              const almostFull = pct >= 80;
              return (
                <div className="tm-text-caption" style={{ color: almostFull ? 'var(--orange700)' : 'var(--text-muted)', marginTop: 8 }}>
                  {almostFull ? '마감 임박! ' : '아직 '}
                  <b style={{ color: almostFull ? 'var(--orange700)' : 'var(--blue700)', fontWeight: 500 }}>{remaining}자리</b> 남았어요
                </div>
              );
            })()}
          </div>
          ) : null}
          {/* 일정·참가비 (모바일 전용 — 데스크탑은 우측 레일) */}
          <div className="tm-hide-desktop">
            <InfoRow label="일정" value={formatTournamentDateRangeWithTime(tournament.scheduledAt, tournament.scheduledEndAt) ?? '미정'} />
            <ScheduleNoticeCaption style={{ padding: '12px 16px 16px', marginTop: 0, borderBottom: '1px solid var(--grey100)' }} />
            {showsEntryFee ? <InfoRow label="참가비" value={formatEntryFee(tournament.entryFee)} /> : null}
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
            isLast={!genderQuotaLabel}
          />
          {genderQuotaLabel ? (
            <InfoRow label="혼성 명단 조건" value={genderQuotaLabel} isLast />
          ) : null}
        </Card>
      </section>

      {/* ── Prize card — shown HIGH in left column, right after metric strip ── */}
      {prizeCard}

      {/* 신청을 실제로 받는 상태에서만 노출한다. 마감·진행 중·완료된 대회는 물론, status는
          여전히 open이어도 신청 마감·정원 마감으로 신규 신청이 막힌 대회에서
          "회원가입 후 팀을 만들어 신청하세요" 안내는 따라 할 수 없는 안내라 혼란만 준다. */}
      {isOpen && registrationBlock === null ? <TournamentApplicationGuideSection /> : null}

      <TournamentParticipantSection
        teams={tournament.participantTeams}
        teamCount={showsCapacity ? tournament.teamCount : null}
        status={tournament.status}
        confirmedCount={tournament.confirmedCount}
      />

      <TournamentVenuePrepSection
        venue={tournament.venue}
        parkingInfo={tournament.parkingInfo}
        announcements={allAnnouncements}
        latitude={tournament.latitude}
        longitude={tournament.longitude}
      />

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
              className="tm-text-caption"
              color="var(--text-body)"
              lineHeight={1.7}
            />
          </Card>
        </section>
      ) : null}

      <TournamentSponsorSection sponsors={tournament.sponsors} />

      <TournamentPostEventHubSection
        tournamentId={tournament.id}
        status={tournament.status}
        fixtures={tournament.fixtures}
        hasAnnouncements={hasAnnouncements}
        sponsorCount={tournament.sponsors.length}
        announcements={allAnnouncements}
      />

      {/* ── Section 3 + 4: Format-aware fixtures / standings (non-bracket portions) ── */}
      <div id="tournament-results">
        <FormatLeftSections tournament={tournament} />
      </div>

      <TournamentInquirySection tournamentId={tournament.id} tournamentTitle={tournament.title} />

      {/* ── 하단 통합 진입 CTA — 페이지를 끝까지 읽은 사람이 다시 위로 스크롤하지
          않아도 되게(§A-5). ref는 상단 스티키 CTA와의 동시 노출을 막는 신호로 쓰인다. */}
      {bracketCtaLabel ? (
        <div ref={bottomCtaRef} className="tm-hide-desktop" style={{ marginTop: 24 }}>
          <BracketEntryCtaButton tournament={tournament} />
        </div>
      ) : null}
    </>
  );

  /* ── Left column body content (completed — TARGET §1~6 축약 레이아웃) ──
     헤더 → 결과 히어로 → 액션 리스트 → 참가팀 → 기본정보·상금 → (협찬) → 아코디언(규정/환불/유의사항).
     신청 안내·진행 방식·인라인 조별순위/일정·결선 대진표는 완료 상세에서 제거(중복 해소, 스크롤 감소). ── */
  const completedLeftContent = (
    <>
      <section aria-label="대회 기본 정보" style={{ marginTop: 20 }}>
        {headerIdentitySection}
      </section>

      <CompletedResultHero tournament={tournament} />

      <TournamentPostEventHubSection
        tournamentId={tournament.id}
        status={tournament.status}
        fixtures={tournament.fixtures}
        hasAnnouncements={hasAnnouncements}
        sponsorCount={tournament.sponsors.length}
        announcements={allAnnouncements}
      />

      <TournamentParticipantSection
        teams={tournament.participantTeams}
        teamCount={showsCapacity ? tournament.teamCount : null}
        status={tournament.status}
        confirmedCount={tournament.confirmedCount}
      />

      <section aria-labelledby="completed-basic-info-heading" style={{ marginTop: 24 }}>
        <div id="completed-basic-info-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
          기본 정보
        </div>
        <Card pad={0}>
          <InfoRow label="일정" value={formatTournamentDateRangeWithTime(tournament.scheduledAt, tournament.scheduledEndAt) ?? '미정'} />
          <ScheduleNoticeCaption style={{ padding: '12px 16px 16px', marginTop: 0, borderBottom: '1px solid var(--grey100)' }} />
          <InfoRow
            label="참가팀"
            value={
              showsCapacity
                ? `${tournament.confirmedCount}/${tournament.teamCount}팀 확정`
                : `${tournament.confirmedCount}팀 참가`
            }
          />
          {showsEntryFee ? <InfoRow label="참가비" value={formatEntryFee(tournament.entryFee)} /> : null}
          {tournament.venue ? (
            <InfoRow label="장소" value={tournament.venue} />
          ) : null}
          <InfoRow
            label="선수단 규모"
            value={`팀당 ${tournament.minPlayers}~${tournament.maxPlayers}명`}
            isLast={!genderQuotaLabel}
          />
          {genderQuotaLabel ? (
            <InfoRow label="혼성 명단 조건" value={genderQuotaLabel} isLast />
          ) : null}
        </Card>
      </section>

      {prizeCard}

      <TournamentSponsorSection sponsors={tournament.sponsors} />

      {/* ── 아코디언: 대회 규정 / 환불 정책 / 참가 전 유의사항 — 기본 collapsed, 1회만 노출 ── */}
      <div style={{ marginTop: 24 }}>
        {tournament.rulesText ? (
          <AccordionSection id="rules-content" title="대회 규정">
            <FormattedText
              text={tournament.rulesText}
              className="tm-text-caption"
              style={{ color: 'var(--text-body)', lineHeight: 1.7 }}
            />
          </AccordionSection>
        ) : null}

        {tournament.refundPolicyText ? (
          <AccordionSection id="refund-content" title="환불 정책">
            <FormattedText
              text={tournament.refundPolicyText}
              className="tm-text-caption"
              style={{ color: 'var(--text-muted)', lineHeight: 1.65 }}
            />
          </AccordionSection>
        ) : null}

        <AccordionSection id="precheck-content" title="참가 전 유의사항">
          <div style={{ display: 'grid', gap: 0 }}>
            {PRE_PARTICIPATION_CHECK_ITEMS.map((item, idx, arr) => (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: idx === 0 ? '0 0 10px' : '10px 0',
                  borderBottom: idx < arr.length - 1 ? '1px solid var(--grey100)' : 'none',
                  alignItems: 'flex-start',
                }}
              >
                <span style={{ flexShrink: 0, fontSize: 'var(--font-size-caption)', fontWeight: 800, color: 'var(--text-strong)', minWidth: 52, letterSpacing: '-0.01em' }}>
                  {item.label}
                </span>
                <span className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {item.text}
                </span>
              </div>
            ))}
          </div>
        </AccordionSection>
      </div>

      <TournamentInquirySection tournamentId={tournament.id} tournamentTitle={tournament.title} />

      {/* ── 하단 통합 진입 CTA — completed 도 leftContent와 동일하게 페이지 끝에 둔다. ── */}
      {bracketCtaLabel ? (
        <div ref={bottomCtaRef} className="tm-hide-desktop" style={{ marginTop: 24 }}>
          <BracketEntryCtaButton tournament={tournament} />
        </div>
      ) : null}
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
            {allAnnouncements.map((announcement) => (
              <AnnouncementCard key={announcement.id} announcement={announcement} />
            ))}
          </div>
        </section>
      ) : null}

      {/* completed: 환불 정책은 leftContent의 아코디언(규정/환불/유의사항)으로 단일화 — 여기서는 skip */}
      {!isCompleted && tournament.refundPolicyText ? (
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

      {/* 참가 전 확인 사항 — 데스크탑 우측 aside 전용.
          completed: leftContent 아코디언의 "참가 전 유의사항"으로 단일화되어 중복 렌더를 없앤다. */}
      {!isCompleted ? (
        <section aria-label="참가 전 꼭 확인해 주세요" className="tm-show-desktop">
          <div className="tm-text-body-lg" style={{ marginBottom: 8 }}>참가 전 꼭 확인해 주세요</div>
          <Card pad={0} style={{ background: 'var(--grey50)', overflow: 'hidden' }}>
            {([
              { label: '신청 확정', text: '운영진 확인 + 참가비 입금 완료 후 확정됩니다.' },
              { label: '환불 불가', text: '단순 변심·일정 착오·팀 사정으로 인한 취소는 원칙적으로 불가합니다.' },
              { label: '주최 취소', text: '주최 측 사정 취소 시 참가비 100% 환불됩니다.' },
              { label: '노쇼 실격', text: '노쇼 시 실격 처리되며 참가비는 환불되지 않습니다.' },
              { label: '허위 정보', text: '경력·소속 이력 허위 제출 시 팀 탈락됩니다.' },
              { label: '본인 확인', text: '당일 신분증 또는 확인 자료 제출을 요청할 수 있습니다.' },
              { label: '부상 책임', text: '경기 전 본인 건강 상태를 확인 후 참가하세요.' },
              { label: '현장 촬영', text: '대회 현장에서 사진·영상이 촬영될 수 있습니다.' },
            ] as { label: string; text: string }[]).map((item, idx, arr) => (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '8px 16px',
                  borderBottom: idx < arr.length - 1 ? '1px solid var(--grey100)' : 'none',
                  alignItems: 'flex-start',
                }}
              >
                <span style={{ flexShrink: 0, fontSize: 'var(--font-size-caption)', fontWeight: 800, color: 'var(--text-strong)', minWidth: 48, paddingTop: 2, letterSpacing: '-0.01em' }}>
                  {item.label}
                </span>
                <span className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.55 }}>
                  {item.text}
                </span>
              </div>
            ))}
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
        <div style={{ marginTop: 20 }}>
          <ApplyCTAButtons tournament={tournament} blockReason={registrationBlock} myRegistration={myRegistration} />
        </div>
      </div>

      {/* Key facts: schedule, capacity, entry fee (the canonical desktop facts panel —
          the mobile metric strip is hidden on desktop to avoid duplication). */}
      <div
        style={{
          marginTop: 16,
          paddingTop: 16,
          borderTop: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>일정</span>
          <span className="tm-text-caption" style={{ color: 'var(--text-strong)', fontWeight: 500 }}>
            {formatTournamentDateRangeWithTime(tournament.scheduledAt, tournament.scheduledEndAt) ?? '미정'}
          </span>
        </div>
        <ScheduleNoticeCaption style={{ marginTop: 0 }} />
        {showsCapacity ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>정원</span>
            <span className="tm-text-caption" style={{ color: 'var(--text-strong)', fontWeight: 500 }}>
              {reservedTeamCount}/{tournament.teamCount}팀
            </span>
          </div>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>참가비</span>
          <span className="tm-text-caption" style={{ color: 'var(--text-strong)', fontWeight: 500 }}>
            {formatEntryFee(tournament.entryFee)}
          </span>
        </div>
      </div>
    </aside>
  ) : tournament.status === 'in_progress' ? (
    <aside className="tm-tournament-rail tm-show-desktop" role="complementary" aria-label="대회 진행 상태">
      {/* Live CTA */}
      <Link
        href={`/tournaments/${tournament.id}/bracket`}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '16px 16px',
          background: 'var(--blue500)', borderRadius: 'var(--radius-field)',
          textDecoration: 'none',
          boxShadow: '0 2px 14px rgba(49,130,246,0.28)',
          marginBottom: 16,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.18)', borderRadius: 20, padding: '3px 8px', flexShrink: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: 'var(--radius-circle)', background: '#4ADE80', flexShrink: 0, boxShadow: '0 0 0 2px rgba(74,222,128,0.35)' }} aria-hidden="true" />
          <span style={{ fontSize: 'var(--font-size-caption)', fontWeight: 800, color: '#fff', letterSpacing: '0.02em' }}>LIVE</span>
        </span>
        {/* 라벨: getBracketEntryCtaLabel과 단일 소스 — 모바일 상단/하단 CTA와 동일 문구("진행 중인 대회 보기")를 쓴다. */}
        <span style={{ flex: 1, fontSize: 'var(--font-size-body-lg)', fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>{getBracketEntryCtaLabel(tournament.status, isLeagueMirror)}</span>
        <ChevronRight size={17} strokeWidth={2.5} style={{ color: 'rgba(255,255,255,0.65)', flexShrink: 0 }} aria-hidden="true" />
      </Link>
      {/* Key facts */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>일정</span>
          <span className="tm-text-caption" style={{ color: 'var(--text-strong)', fontWeight: 500 }}>{formatTournamentDateRangeWithTime(tournament.scheduledAt, tournament.scheduledEndAt) ?? '미정'}</span>
        </div>
        <ScheduleNoticeCaption style={{ marginTop: 0 }} />
        {/* **리그가 실제로 닿는 레일은 여기(in_progress)다.** 위 `open` 레일은 리그가
            도달하지 못한다(거울 status 에 `open` 이 없다) — 진행 중인 리그에 "정원 2/8팀 ·
            참가비 무료" 가 뜨던 자리가 이쪽이다. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>
            {showsCapacity ? '정원' : '참가팀'}
          </span>
          <span className="tm-text-caption" style={{ color: 'var(--text-strong)', fontWeight: 500 }}>
            {showsCapacity
              ? `${tournament.confirmedCount}/${tournament.teamCount}팀`
              : `${tournament.confirmedCount}팀`}
          </span>
        </div>
        {showsEntryFee ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>참가비</span>
            <span className="tm-text-caption" style={{ color: 'var(--text-strong)', fontWeight: 500 }}>{formatEntryFee(tournament.entryFee)}</span>
          </div>
        ) : null}
      </div>
    </aside>
  ) : tournament.status === 'closed' ? (
    /* closed(모집 마감·시작 전="예정") — 예전엔 이 상태에서 데스크탑 레일이 비어
       있었다(모바일만 새 통합 CTA를 받고 데스크탑은 그대로면 반응형 불일치라 함께
       채운다). in_progress 레일과 동일 구조에서 LIVE 배지·강조색만 뺀 중립 톤. */
    <aside className="tm-tournament-rail tm-show-desktop" role="complementary" aria-label="대진표·일정">
      <Link
        href={`/tournaments/${tournament.id}/bracket`}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '16px 16px',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-field)',
          textDecoration: 'none',
          marginBottom: 16,
        }}
      >
        <span
          aria-hidden="true"
          // 2026-08-11: 순수 내비게이션 CTA — 위 in_progress/completed 분기(line ~416)와
          // 동일 근거로 무채색 통일
          style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--grey100)' }}
        >
          <Goal size={16} color="var(--text-strong)" strokeWidth={2.2} />
        </span>
        <span style={{ flex: 1, fontSize: 'var(--font-size-body-lg)', fontWeight: 800, color: 'var(--text-strong)', letterSpacing: '-0.01em' }}>{getBracketEntryCtaLabel(tournament.status, isLeagueMirror)}</span>
        <ChevronRight size={17} strokeWidth={2.5} style={{ color: 'var(--text-caption)', flexShrink: 0 }} aria-hidden="true" />
      </Link>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>일정</span>
          <span className="tm-text-caption" style={{ color: 'var(--text-strong)', fontWeight: 500 }}>{formatTournamentDateRangeWithTime(tournament.scheduledAt, tournament.scheduledEndAt) ?? '미정'}</span>
        </div>
        <ScheduleNoticeCaption style={{ marginTop: 0 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>정원</span>
          <span className="tm-text-caption" style={{ color: 'var(--text-strong)', fontWeight: 500 }}>{tournament.confirmedCount}/{tournament.teamCount}팀</span>
        </div>
      </div>
    </aside>
  ) : tournament.status === 'completed' ? (
    <aside className="tm-tournament-rail tm-show-desktop" role="complementary" aria-label="대회 결과">
      <Link
        href={`/tournaments/${tournament.id}/results`}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '16px 16px',
          background: 'linear-gradient(135deg, #1A1A2E 0%, #111827 100%)', borderRadius: 'var(--radius-field)',
          textDecoration: 'none',
          boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
          marginBottom: 16,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 20, padding: '3px 8px', flexShrink: 0 }}>
          <Trophy size={12} className="tm-medal-gold" strokeWidth={2.4} aria-hidden="true" />
          <span style={{ fontSize: 'var(--font-size-caption)', fontWeight: 800, color: '#fff', letterSpacing: '0.02em' }}>종료</span>
        </span>
        <span style={{ flex: 1, fontSize: 'var(--font-size-body-lg)', fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>최종 결과 · 시상 보기</span>
        <ChevronRight size={17} strokeWidth={2.5} style={{ color: 'rgba(255,255,255,0.55)', flexShrink: 0 }} aria-hidden="true" />
      </Link>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>일정</span>
          <span className="tm-text-caption" style={{ color: 'var(--text-strong)', fontWeight: 500 }}>{formatTournamentDateRangeWithTime(tournament.scheduledAt, tournament.scheduledEndAt) ?? '미정'}</span>
        </div>
        <ScheduleNoticeCaption style={{ marginTop: 0 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>정원</span>
          <span className="tm-text-caption" style={{ color: 'var(--text-strong)', fontWeight: 500 }}>{tournament.confirmedCount}/{tournament.teamCount}팀</span>
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
          <ChevronLeft size={20} strokeWidth={2.2} aria-hidden="true" />
        </Link>
        <div className="tm-text-heading" style={{ margin: 0 }} aria-hidden="true">대회 상세</div>
      </div>

      {/* ── Desktop 2-column layout: left=body, right=sticky CTA rail ──
          .tm-tournament-detail-grid: minmax(0,1fr) 340px (≥1440: 360px), gap 32px.
          Mobile: single-column, no grid applied. */}
      {/* ── 상단 통합 진입 CTA(§A-1~5) — 예전엔 in_progress 전용 "순위표 · 대진표
          보기"(topCTA)와 상태 무관 "전체 경기 일정 보기" 링크가 따로 있었다. 이제
          하나로 합쳐 /bracket(순위·대진표·일정 통합 허브, §B-6)으로 보낸다.
          position:sticky — `.tm-scroll-area`가 모바일/태블릿(<1024px)의 실제 스크롤
          컨테이너라 top:0만으로 헤더(56px, .tm-scroll-area 바깥) 바로 아래에 붙고
          겹치지 않는다. 데스크탑(≥1024px)은 .tm-scroll-area가 static이 되며 이 CTA도
          .tm-hide-desktop으로 숨겨지고, 항상 보이는 railCTA(우측 sticky 레일)가
          같은 역할을 대신한다 — 그래서 desktop에서 top 오프셋을 따로 계산할 필요가
          없다. 하단 CTA(leftContent/completedLeftContent 맨 끝)와 동시에 화면에
          보이지 않도록 bottomCtaVisible이 true면 display:none 처리한다(§A-4·5).
          isOpen(모집 중)은 ApplyCTA가 스크롤 내내 화면 하단에 고정(.tm-fixed-cta)돼
          있어 이 스티키 CTA를 숨길 스크롤 위치가 존재하지 않는다 — 데스크탑 rail도
          isOpen일 땐 ApplyCTAButtons만 두고 대진표 링크를 넣지 않으므로(railCTA 위,
          §isOpen 분기), 동일하게 여기서도 렌더 자체를 건너뛰어 "참가 신청하기" 하나만
          1차 CTA로 남긴다(토스 루브릭: 카드당 주요 CTA 1개). */}
      {bracketCtaLabel && !isOpen ? (
        <div
          className="tm-hide-desktop"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 15,
            background: 'var(--bg)',
            padding: '8px 20px 12px',
            display: bottomCtaVisible ? 'none' : 'block',
          }}
        >
          <BracketEntryCtaButton tournament={tournament} />
        </div>
      ) : null}

      <div className="tm-tournament-detail-grid">
        {/* Left column: header + metrics + prize + rules + standings + group fixtures */}
        <div className="tm-match-detail-body">
          {isCompleted ? completedLeftContent : leftContent}
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

        {/* Bracket 진입 카드와 참가 전 확인 사항 — completed는 leftContent(액션 리스트·아코디언)로 이전.
            예전엔 여기 그리드 맨 끝에 in_progress 전용 "대회가 진행 중이에요" 카드
            (TournamentStatusEntryCard)가 하나 더 있었는데, leftContent 맨 끝의 새
            통합 하단 CTA(§A-5)와 목적지·문구가 완전히 겹쳐(둘 다 /bracket) 제거했다 —
            남겨두면 in_progress 페이지 하나에 같은 의미의 CTA가 3개(옛 topCTA는 이미
            제거, 이 카드, 새 하단 CTA) 쌓이는 상황이었다. */}
        {!isCompleted && <BracketSection tournament={tournament} />}
        {!isCompleted && <TournamentPreParticipationNotice />}
      </div>
    </article>
  );
}

/**
 * completed 전용 결과 요약 히어로 — 헤더 직후 최상단에 배치해 "대회가 끝났어요" 진입점을
 * 스크롤 없이 바로 보이게 한다(TARGET §2). 우승팀명을 간단히 계산할 수 있으면 제목에 노출하고,
 * 아니면 기존 "대회가 끝났어요" 문구로 폴백한다. 모바일·데스크탑 공통(예전 topCTA/railCTA처럼
 * 브레이크포인트별로 나뉘지 않음 — leftContent는 두 화면 모두에서 렌더되는 영역).
 */
function CompletedResultHero({ tournament }: { tournament: V1TournamentDetail }) {
  const championName = getCompletedChampionName(tournament);
  const title = championName ? `${championName} 우승!` : '대회가 끝났어요';

  return (
    <section style={{ marginTop: 16 }}>
      <Link
        href={`/tournaments/${tournament.id}/results`}
        className="tm-pressable"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '16px 20px',
          background: 'linear-gradient(135deg, #1A1A2E 0%, #111827 100%)',
          borderRadius: 'var(--radius-container)',
          textDecoration: 'none',
          boxShadow: '0 2px 14px rgba(0,0,0,0.2)',
        }}
        aria-label={championName ? `${championName} 우승. 최종 결과와 시상 내역 보기` : '대회 최종 결과 보기'}
      >
        <span
          aria-hidden="true"
          style={{
            flexShrink: 0,
            width: 48,
            height: 48,
            borderRadius: 'var(--radius-field)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.14)',
          }}
        >
          <Trophy size={24} className="tm-medal-gold" strokeWidth={2} aria-hidden="true" />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 'var(--font-size-body-lg)',
              fontWeight: 800,
              color: '#fff',
              marginBottom: 2,
              letterSpacing: '-0.01em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 'var(--font-size-caption)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
            최종 순위와 시상 결과를 확인해보세요.
          </div>
        </div>
        <ChevronRight size={18} strokeWidth={2.2} style={{ color: 'rgba(255,255,255,0.7)', flexShrink: 0 }} aria-hidden="true" />
      </Link>
    </section>
  );
}

/**
 * completed 전용 아코디언 — 기본 collapsed, 헤더 탭으로 토글(WCAG: aria-expanded/aria-controls).
 * 대회 규정·환불 정책·참가 전 유의사항을 동일한 패턴으로 묶어 스크롤을 줄인다(TARGET §6).
 */
function AccordionSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card pad={0} style={{ marginTop: 8, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls={id}
        className="tm-list-row-interactive tm-pressable"
        style={{
          width: '100%',
          minHeight: 52,
          padding: '16px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          background: 'transparent',
          border: 'none',
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <span className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{title}</span>
        <ChevronRight
          size={16}
          strokeWidth={2.2}
          aria-hidden="true"
          style={{
            color: 'var(--text-caption)',
            flexShrink: 0,
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.16s ease',
          }}
        />
      </button>
      {open ? (
        <div id={id} style={{ padding: '16px 16px 16px', borderTop: '1px solid var(--grey100)' }}>
          {children}
        </div>
      ) : null}
    </Card>
  );
}

/**
 * "참가 전 확인" 체크리스트 — non-completed 하단 카드(TournamentPreParticipationNotice)와
 * completed 아코디언(completedLeftContent)이 공유하는 단일 소스. 두 곳 모두 렌더링은 별도이지만
 * 데이터는 이 상수 하나로 통일한다.
 */
const PRE_PARTICIPATION_CHECK_ITEMS: { label: string; text: string }[] = [
  { label: '신청 확정', text: '운영진 확인 + 참가비 입금 완료 후 참가가 확정됩니다.' },
  { label: '환불 불가', text: '참가비 입금 후 단순 변심·일정 착오·팀 사정으로 인한 취소는 원칙적으로 불가합니다.' },
  { label: '주최 취소', text: '주최 측 사정으로 대회가 취소되는 경우 참가비 100% 환불됩니다.' },
  { label: '대회 연기', text: '대회 연기 시 기존 대회일 2주 전까지 취소·환불 요청이 가능합니다.' },
  { label: '노쇼 실격', text: '노쇼 시 실격 처리되며 참가비는 환불되지 않습니다.' },
  { label: '허위 정보', text: '선수 경력·소속 이력 등 허위 제출 시 팀 탈락 사유가 됩니다.' },
  { label: '본인 확인', text: '대회 당일 신분증 또는 본인 확인 자료 제출을 요청할 수 있습니다.' },
  { label: '부상 책임', text: '경기 중 부상 위험에 대비해 참가 전 본인 건강 상태를 확인하세요.' },
  { label: '현장 촬영', text: '대회 현장에서 사진 및 영상이 촬영될 수 있습니다.' },
];

function TournamentPreParticipationNotice() {
  return (
    <div className="tm-tournament-bleed tm-hide-desktop">
      <div className="tm-match-detail-body">
        <section aria-labelledby="tournament-precheck-heading" style={{ marginTop: 24 }}>
          <div id="tournament-precheck-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
            참가 전 꼭 확인해 주세요
          </div>
          <Card pad={0} style={{ background: 'var(--grey50)', overflow: 'hidden' }}>
            {PRE_PARTICIPATION_CHECK_ITEMS.map((item, idx, arr) => (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '12px 16px',
                  borderBottom: idx < arr.length - 1 ? '1px solid var(--grey100)' : 'none',
                  alignItems: 'flex-start',
                }}
              >
                <span style={{ flexShrink: 0, fontSize: 'var(--font-size-caption)', fontWeight: 800, color: 'var(--text-strong)', minWidth: 52, paddingTop: 1, letterSpacing: '-0.01em' }}>
                  {item.label}
                </span>
                <span className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {item.text}
                </span>
              </div>
            ))}
          </Card>
        </section>
      </div>
    </div>
  );
}

/* ── TournamentFlowSection — explains how the tournament progresses ──
 * The format badge alone ("조별리그 후 토너먼트") doesn't tell a participant how it
 * actually runs, so spell it out as numbered steps, format-aware, in 해요체.
 */
function tournamentFormatLabel(competition: V1TournamentDetail): string {
  if (isLeagueCompetition(competition)) return '리그 방식 (풀리그)';
  return competition.format === 'knockout' ? '토너먼트 (단판 승부)' : '조별 리그 후 토너먼트';
}

function getFlowSteps(competition: V1TournamentDetail): Array<{ title: string; body: string }> {
  // 리그를 **먼저** 걸러야 한다. 거울 행은 group_knockout 이라 아래 첫 분기에 걸려
  // "조별 리그 → 결선 진출 → 결선 토너먼트" 를 리그 참가자에게 보여준다.
  if (isLeagueCompetition(competition)) {
    return [
      { title: '풀리그', body: '참가한 모든 팀이 서로 한 번씩 맞붙어요.' },
      { title: '순위 집계', body: '승점과 득실차로 최종 순위를 가려요.' },
      { title: '시상', body: '최종 순위에 따라 상금과 순위를 시상해요.' },
    ];
  }
  const { format } = competition;
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
  const steps = getFlowSteps(tournament);
  return (
    <section aria-labelledby="flow-heading" style={{ marginTop: 24 }}>
      <div id="flow-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>대회 진행 방식</div>
      <Card pad={16} style={{ marginTop: 4 }}>
        <div className="tm-tourn-flow-format">{tournamentFormatLabel(tournament)}</div>
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

/**
 * 순위표가 상세에서 빠졌다는 안내 + /bracket 바로가기 — §A-1(조별 순위 섹션을 상세에서
 * 제거하고 /bracket으로 일원화)로 비워진 자리를 채우는 요소. 그냥 지우고 빈 공간을
 * 남기지 않기 위해(규칙 5), 원래 순위표가 있던 그 위치에 그대로 둔다. 순위표만 옮기고
 * 일정/대진 카드는 그대로 두는 이유는 오너 발화("조별순위는 /bracket 에서만")가
 * 순위표 한정이고, 참가자가 자기 경기 시간을 확인하는 일정 카드는 상세에서도 계속
 * 바로 봐야 하기 때문이다.
 */
function StandingsMovedNotice({ tournamentId }: { tournamentId: string }) {
  return (
    <section aria-label="순위표 안내" style={{ marginTop: 24 }}>
      <Link
        href={`/tournaments/${tournamentId}/bracket`}
        className="tm-pressable"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '16px 16px',
          background: 'var(--grey50)',
          borderRadius: 'var(--radius-field)',
          textDecoration: 'none',
        }}
      >
        <span
          aria-hidden="true"
          // 2026-08-11: 카드 배경(--surface)과 아이콘 배지 배경이 같은 토큰이라 트로피
          // 아이콘 뒤 원형 배지가 통째로 사라져 보였다 — 바로 위 "대회 현황"
          // 리스트(PostEventActionList, tournament-venue-retention-sections.tsx)의
          // 동일 아이콘 배지 관례(무채색 --grey100 + --text-strong 아이콘, 순수
          // 내비게이션이라 색 의미 없음)와 맞춘다.
          style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--grey100)' }}
        >
          <Trophy size={18} color="var(--text-strong)" strokeWidth={2} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>실시간 순위표는 대진표에서 확인하세요</div>
          <div className="tm-text-caption" style={{ color: 'var(--text-caption)', marginTop: 2 }}>
            조별 순위와 결선 진행 상황을 한 곳에서 볼 수 있어요.
          </div>
        </div>
        <ChevronRight size={16} strokeWidth={2.4} style={{ color: 'var(--text-caption)', flexShrink: 0 }} aria-hidden="true" />
      </Link>
    </section>
  );
}

/**
 * Task 11: 리그 대회 공개 상세의 통합 순위표 — `GET /tournaments/:id/standings/overall`을
 * 직접 조회한다. 도메인 훅 파일(`hooks/use-v1-api.ts`)은 이 태스크의 배정 파일이 아니라서
 * 여기서 `v1Get`을 인라인으로 호출한다(Task 10이 그 파일에 전용 react-query 훅을 추가하면
 * 이 컴포넌트를 그 훅 호출로 교체할 수 있다). `useQuery`(react-query)가 아니라 수동
 * `useEffect` 페칭을 쓰는 이유: `TournamentDetailView`는 기존 테스트(`tournament-detail-client.test.ts`,
 * 이 태스크의 배정 파일이 아니라 여기서 함께 고칠 수 없다)에서 `QueryClientProvider` 없이
 * 단독 렌더되므로, `useQuery`를 쓰면 "No QueryClient set" 에러로 그 테스트들이 깨진다.
 * 로딩 중에는 조용히 아무것도 렌더하지 않고(레이아웃 흔들림 방지), 실패 시에는 기존
 * `ErrorState`를 재사용한다.
 */
type LeagueStandingsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'success'; data: LeagueStandingsTableData };

/**
 * 통합 순위 조회. **한 번만 부르고 두 곳이 쓴다** — 순위표가 그리고, 일정 카드가 팀 이름을
 * 여기서 얻는다(리그 대진은 팀 id 만 실려 오고 이름은 순위 응답에 있다. 리그 자기 페이지가
 * 쓰는 방식 그대로다). 두 번 부르면 같은 화면이 같은 데이터를 두 번 가져온다.
 */
function useLeagueOverallStandings(tournamentId: string) {
  const [state, setState] = useState<LeagueStandingsState>({ status: 'loading' });
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!tournamentId) return;
    let cancelled = false;
    setState({ status: 'loading' });
    v1Get<LeagueStandingsTableData>(`/tournaments/${tournamentId}/standings/overall`)
      .then((data) => {
        if (!cancelled) setState({ status: 'success', data });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [tournamentId, retryToken]);

  return { state, retry: () => setRetryToken((n) => n + 1) };
}

function LeagueStandingsSection({
  state,
  onRetry,
}: {
  state: LeagueStandingsState;
  onRetry: () => void;
}) {
  if (state.status === 'loading') return null;

  if (state.status === 'error') {
    return (
      <section aria-label="통합 순위표" style={{ marginTop: 24 }}>
        <ErrorState message="순위표를 불러오지 못했어요." onRetry={onRetry} />
      </section>
    );
  }

  return (
    <section aria-labelledby="league-standings-heading" style={{ marginTop: 24 }}>
      <div id="league-standings-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
        통합 순위
      </div>
      <LeagueStandingsTable data={state.data} />
    </section>
  );
}

/**
 * 정규 리그 시즌 화면의 좌측 섹션 — 통합 순위 + 일정.
 *
 * `FormatLeftSections` 안의 분기로 두지 않고 컴포넌트로 뺀 이유는 **훅 때문**이다. 순위
 * 조회를 두 소비처(순위표·일정의 팀 이름)가 함께 써야 하는데, 분기 안에서 훅을 부르면
 * 조건부 호출이 된다.
 */
function LeagueSections({ tournament }: { tournament: V1TournamentDetail }) {
  const { state, retry } = useLeagueOverallStandings(tournament.id);

  // 팀 이름은 대진에 실려 오지 않는다(팀 id 만 온다) — 순위 응답에서 붙인다. 리그 자기
  // 페이지가 쓰는 방식과 같다. 순위 조회가 실패하면 빈 Map 이 되고 카드는 fallback 문구를
  // 보여준다 — 일정 섹션이 통째로 깨지지 않는다.
  const teamNameById = useMemo(() => {
    const map = new Map<string, string>();
    if (state.status !== 'success') return map;
    for (const row of state.data.standings) {
      if (row.teamId) map.set(row.teamId, row.teamName);
    }
    return map;
  }, [state]);

  const fixtures = tournament.leagueFixtures;

  return (
    <>
      {/* 조가 없어도 그린다 — 리그 거울에는 조가 아예 없고, 조 개수로 게이팅하면
          순위표가 영영 안 뜬다. 대회 쪽 동작(조 없으면 숨김)은 건드리지 않는다. */}
      <LeagueStandingsSection state={state} onRetry={retry} />

      {fixtures.length > 0 ? (
        <section aria-labelledby="fixtures-heading" style={{ marginTop: 24 }}>
          <div id="fixtures-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
            일정 · 대진
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            {fixtures.map((fixture) => (
              <LeagueFixtureCard
                key={fixture.teamMatchId}
                fixture={fixture}
                homeLabel={teamNameById.get(fixture.homeTeamId) ?? '홈팀 정보 없음'}
                awayLabel={
                  fixture.awayTeamId === null
                    ? '상대팀 미정'
                    : teamNameById.get(fixture.awayTeamId) ?? '상대팀 정보 없음'
                }
              />
            ))}
          </div>
        </section>
      ) : (
        /* 대회용 `FixturesPlaceholder` 를 쓰지 않는다 — 그건 "대회 시작 전에 대진표가
           공개돼요" 라고 적는데, 진행 중인 리그 시즌에 그 말이 뜨면 **틀린 말을 확신 있게**
           하는 것이다. 리그에는 "대진표 공개" 라는 사건이 없고 "대진 확정" 이 있다.
           문구는 리그 일정 목록(league-match-standings-client.tsx)이 같은 상황에 쓰는 것을
           그대로 가져왔다 — 두 화면이 같은 상황을 다르게 부르지 않게. */
        <section aria-labelledby="fixtures-empty-heading" style={{ marginTop: 24 }}>
          <div id="fixtures-empty-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
            일정 · 대진
          </div>
          <EmptyState illustration={{ name: 'matches-empty' }} title="아직 등록된 경기가 없어요" sub="대진이 확정되면 경기 일정이 여기에 나타나요." />
        </section>
      )}
    </>
  );
}

/* ── FormatLeftSections —
 * Renders group fixtures but NOT the bracket and NOT standings (TARGET §A-1: 순위표는
 * /bracket으로 일원화되어 StandingsMovedNotice로 대체됐다 — GroupStandingsTable/
 * StandingRow/GoalDiff는 이 파일 어디에서도 더 쓰이지 않아 완전히 삭제했다).
 * The bracket is extracted to BracketSection (full-width bleed).
 */
function FormatLeftSections({ tournament }: { tournament: V1TournamentDetail }) {
  const { format, fixtures, groups } = tournament;

  const {
    groupFixtures,
    hasGroupStandings,
    hasGroupFixtures,
    hasAnyFixtures,
  } = partitionTournamentSections(format, fixtures, groups);

  // 리그 시즌은 조도 대회 대진도 없다 — 자기 축의 데이터를 쓰는 전용 섹션으로 보낸다.
  if (isLeagueCompetition(tournament)) return <LeagueSections tournament={tournament} />;

  /* knockout: bracket only — nothing in left sections, bracket goes to bleed */
  if (format === 'knockout') {
    return null;
  }

  /* group_knockout: 순위표 안내 + 조별 일정만(대진표는 bleed) */
  return (
    <>
      {hasGroupStandings ? <StandingsMovedNotice tournamentId={tournament.id} /> : null}

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

  /* league: 브래킷 없음 — 거울 행은 format 이 group_knockout 이라 format 만 보면
     여기서 안 걸리고 아래 group_knockout 경로로 떨어져 **없는 대진표를 그린다**. */
  if (isLeagueCompetition(tournament)) return null;

  /* knockout: 픽스처가 있을 때만 표시 (모집 중/마감 단계엔 미표시) */
  if (format === 'knockout') {
    if (!hasAnyFixtures) return null;
    return (
      <div className="tm-tournament-bleed">
        <div className="tm-match-detail-body">
          <section aria-labelledby="bracket-heading" style={{ marginTop: 24 }}>
            <div id="bracket-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
              대진표
            </div>
            <div style={{ marginTop: 4 }}>
              <TournamentBracket fixtures={knockoutFixtures} groups={groups} />
            </div>
          </section>
        </div>
      </div>
    );
  }

  /* group_knockout도 결선 fixture가 생성된 순간부터 구조를 공개한다. 팀이 아직
   * 배정되지 않은 슬롯은 TournamentBracket의 기존 `미정` 표현을 사용하고,
   * 실제 진출 팀 확정·배정 규칙은 서버 계약에 그대로 맡긴다. */
  if (!hasKnockoutFixtures) return null;

  return (
    <div className="tm-tournament-bleed">
      <div className="tm-match-detail-body">
        <section aria-labelledby="bracket-heading" style={{ marginTop: 24 }}>
          <div id="bracket-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
            결선 대진표
          </div>
          <div style={{ marginTop: 4 }}>
            <TournamentBracket fixtures={knockoutFixtures} groups={groups} />
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * 조 하나의 조별리그가 실제로 끝났는지 판정 — 그 조에 속한 픽스처가 하나 이상 있고
 * 전부 completed 또는 cancelled 상태일 때만 true. 픽스처가 0개(아직 일정도 안 잡힘)면
 * "끝났다"고 볼 수 없으므로 false. 오너 지적의 핵심 기준: "실제 조별리그가 다 끝나야"
 * — 픽스처 1경기만 끝나도 진출/결선이 확정처럼 보이던 버그(§B-7·8)를 여기서 막는다.
 */
export function isGroupStageComplete(groupId: string, fixtures: V1TournamentFixture[]): boolean {
  const groupFixtures = fixtures.filter((f) => f.groupId === groupId);
  if (groupFixtures.length === 0) return false;
  return groupFixtures.every((f) => f.status === 'completed' || f.status === 'cancelled');
}

/**
 * group_knockout 대회의 조별리그 전체가 끝났는지 — phase==='group'인 그룹이 전부
 * isGroupStageComplete여야 true. 조별 그룹이 하나도 없으면(아직 대진 편성 전) false.
 */
export function allGroupPhasesComplete(groups: V1TournamentGroup[], fixtures: V1TournamentFixture[]): boolean {
  const groupPhaseGroups = groups.filter((g) => g.phase === 'group');
  if (groupPhaseGroups.length === 0) return false;
  return groupPhaseGroups.every((g) => isGroupStageComplete(g.id, fixtures));
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

/**
 * "일정" 표시 근처에 공통으로 붙는 안내 캡션 — 대회 상태(open/scheduled/in_progress/completed)
 * 전체에서 공유하는 단일 소스. 일정·경기 방식이 현장 상황에 따라 바뀔 수 있음을 안내한다.
 * 기본 marginTop=8 은 InfoRow 리스트 밖 등 독립 블록 배치용 — desktop rail 의 flex(gap) 목록
 * 안에서는 gap 이 간격을 이미 담당하므로 style로 marginTop:0 을 넘겨 이중 여백을 막는다.
 */
function ScheduleNoticeCaption({ style }: { style?: React.CSSProperties }) {
  return (
    <div
      className="tm-text-caption"
      style={{ color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 8, ...style }}
    >
      대회 일정 및 경기 방식은 현장 상황에 따라 일부 변경될 수 있습니다. 참가 전 꼭 확인해 주세요.
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
            borderRadius: 'var(--radius-circle)',
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

/**
 * 대회 대진 카드. 껍데기(배치·간격·정렬 축)는 `CompetitionFixtureCard` 와 공유하고
 * **어휘는 여기서만 갖는다** — 대회 status 는 `scheduled | completed`, 리그는
 * `matched | completed | cancelled` 로 값 영역이 다르다.
 */
export function FixtureCard({ fixture }: { fixture: V1TournamentFixture }) {
  // 라운드 라벨: tournament-bracket.tsx ROUND_LABELS 맵과 동일하게 '4강' 사용
  const roundLabel = fixture.round
    ? fixture.round.replace('group', '조별').replace('semi', '4강').replace('final', '결승').replace('third_place', '3·4위')
    : `${fixture.fixtureNumber}경기`;
  // 일정 라벨: 날짜 + **시각**. 참가자는 이 카드로 "내 경기가 몇 시인지"를 판단하므로
  // 날짜만으로는 쓸모가 없다(오너 지적: "조별 일정에도 각 경기 시간들 나타나야하고").
  // invalid/누락이면 null 이 오는데, 그때 영역을 통째로 숨기면 "시간이 안 정해진 것"과
  // "화면이 빠뜨린 것"을 구분할 수 없다 — 미정임을 명시한다.
  const scheduledLabel = formatTournamentDateTimeShort(fixture.scheduledAt);
  // 참가팀 공개 정책 통일(fix/v1-publish) — homeTeamName===null(배정은 됐지만
  // 모집 중이라 가려짐)과 homeTeamName==='TBD'(아직 미배정)는 다른 상태다.
  // `|| '미정'`은 둘 다 "미정"으로 뭉개 사용자가 구분할 수 없었다.
  const homeLabel = fixture.homeTeamName === null ? '비공개' : fixture.homeTeamName || '미정';
  const awayLabel = fixture.awayTeamName === null ? '비공개' : fixture.awayTeamName || '미정';

  return (
    <CompetitionFixtureCard
      header={{ label: roundLabel, caption: scheduledLabel ?? '시간 미정' }}
      badge={<FixtureStatusBadge status={fixture.status} />}
      homeLabel={homeLabel}
      awayLabel={awayLabel}
      // 이 카드는 점수를 싣지 않는다 — 결선 대진표·경기 상세가 그 자리다.
      center={
        <div className="tm-text-label" style={{ color: 'var(--text-caption)', letterSpacing: 1 }}>
          vs
        </div>
      }
      caption={fixture.venue ? <CompetitionFixtureVenue venue={fixture.venue} /> : undefined}
    />
  );
}


/* ── Announcement card ── */

function AnnouncementCard({ announcement }: { announcement: V1TournamentAnnouncement }) {
  return (
    <div id={`announcement-${announcement.id}`} style={{ scrollMarginTop: 96 }}>
      <Card pad={16}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div className="tm-text-label" style={{ color: 'var(--text-strong)', flex: 1, minWidth: 0 }}>
            {announcement.title}
          </div>
          <span className="tm-text-caption" style={{ color: 'var(--text-caption)', flexShrink: 0 }}>
            {formatPublishedAt(announcement.publishedAt)}
          </span>
        </div>
        <span className="tm-badge tm-badge-grey" style={{ marginTop: 8 }}>
          {getTournamentAnnouncementCategoryLabel(announcement.category)}
        </span>
        <FormattedText
          text={announcement.body}
          className="tm-text-caption"
          style={{ marginTop: 8, color: 'var(--text-body)', lineHeight: 1.65 }}
        />
      </Card>
    </div>
  );
}

/* ── Skeleton ── */

function TournamentDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="대회 정보 불러오는 중" style={{ padding: '0 20px 48px', marginTop: 20 }}>
      {/* Header skeleton */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <div
          aria-hidden="true"
          style={{ width: 52, height: 52, borderRadius: 'var(--radius-container)', background: 'var(--grey100)', flexShrink: 0 }}
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
