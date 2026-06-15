'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AppChrome } from '@/components/v1-ui/shell';
import { EmptyState, ErrorState, SectionTitle } from '@/components/v1-ui/primitives';
import { TrophyIcon } from '@/components/v1-ui/icons';
import { useV1Tournaments } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { getSportAccent } from '@/lib/v1-sport-accent';
import type { V1TournamentListItem, V1TournamentStatus } from '@/types/api';

/* ── Sport filter chip data ── (codes must match v1Sport.code in DB) */
const FILTER_SPORTS: Array<{ code: string; label: string }> = [
  { code: 'soccer',     label: '축구' },
  { code: 'futsal',     label: '풋살' },
  { code: 'basketball', label: '농구' },
  { code: 'baseball',   label: '야구' },
  { code: 'volleyball', label: '배구' },
  { code: 'badminton',  label: '배드민턴' },
  { code: 'tennis',     label: '테니스' },
  { code: 'running',    label: '러닝' },
  { code: 'swimming',   label: '수영' },
  { code: 'cycling',    label: '사이클' },
  { code: 'golf',       label: '골프' },
];

export default function TournamentsPage() {
  return (
    <AppChrome title="대회" activeTab="tournaments" showNotifications>
      <TournamentsListContent />
    </AppChrome>
  );
}

/* ── Prize formatter ── */
function formatPrize(amount: number): string {
  if (amount >= 10000) {
    const man = Math.floor(amount / 10000);
    const rem = amount % 10000;
    if (rem === 0) return `${man.toLocaleString('ko-KR')}만원`;
    return `${man.toLocaleString('ko-KR')}만 ${rem.toLocaleString('ko-KR')}원`;
  }
  return `${amount.toLocaleString('ko-KR')}원`;
}

/* ── Status helpers ── */

type StatusConfig = {
  badgeClass: string;
  label: string;
};

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

function formatTournamentDate(dateStr: string | null): string {
  if (!dateStr) return '날짜 미정';
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

/* ── Main content (client component for data fetching) ── */

function TournamentsListContent() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allItems, setAllItems] = useState<V1TournamentListItem[]>([]);
  // D3: 종목 필터 — null = '전체'
  const [activeSportCode, setActiveSportCode] = useState<string | null>(null);

  const { data, isLoading, isError, error, isFetching, refetch } = useV1Tournaments({
    cursor,
    limit: 20,
    sportId: activeSportCode ?? undefined,
  });

  // Accumulate pages when cursor is set
  const pageItems = data?.items ?? [];
  const displayItems: V1TournamentListItem[] = cursor
    ? [...allItems, ...pageItems.filter((item) => !allItems.some((prev) => prev.id === item.id))]
    : pageItems;

  const hasNext = data?.pageInfo?.hasNext ?? false;

  // Derive featured tournament: max prizePool among open items; tie-break by closest scheduledAt
  const openWithPrize = pageItems.filter(
    (item) => item.status === 'open' && item.prizePool != null && item.prizePool > 0,
  );
  const featured: V1TournamentListItem | null = openWithPrize.length > 0
    ? openWithPrize.reduce((best, cur) => {
        const bestPrize = best.prizePool ?? 0;
        const curPrize = cur.prizePool ?? 0;
        if (curPrize > bestPrize) return cur;
        if (curPrize === bestPrize) {
          // Tie-break: earlier scheduledAt wins (closer to now)
          const bestDate = best.scheduledAt ? new Date(best.scheduledAt).getTime() : Infinity;
          const curDate = cur.scheduledAt ? new Date(cur.scheduledAt).getTime() : Infinity;
          return curDate < bestDate ? cur : best;
        }
        return best;
      })
    : null;

  const maxPrize = featured?.prizePool ?? 0;

  const handleLoadMore = () => {
    if (!data?.pageInfo?.nextCursor) return;
    setAllItems(displayItems);
    setCursor(data.pageInfo.nextCursor);
  };

  /** D3: 종목 칩 선택 — 페이지/누적 목록 리셋 후 필터 적용 */
  const handleSportFilter = (code: string | null) => {
    setActiveSportCode(code);
    setCursor(undefined);
    setAllItems([]);
  };

  return (
    <div className="tm-tournament-list" style={{ padding: '0 0 48px' }}>

      {/* ══════════════════════════════════════════════════════════════
          PROMO SECTIONS (prize-led marketing landing)
          ══════════════════════════════════════════════════════════════ */}

      {/* ── 1. Prize-led Hero ── */}
      <section
        aria-labelledby="promo-hero-heading"
        className="tm-tournament-promo-hero"
      >
        {/* Eyebrow chip */}
        <div className="tm-tournament-promo-eyebrow" aria-hidden="true">
          <TrophyIcon size={13} strokeWidth={2} aria-hidden="true" />
          <span>상금 걸린 대회</span>
        </div>

        <p className="tm-tournament-promo-tagline">우승하면 상금을 드려요</p>

        {/* Big prize amount */}
        {featured ? (
          <div className="tm-tournament-promo-prize-row">
            <span className="tm-tournament-promo-prize-label">최대</span>
            <span
              id="promo-hero-heading"
              className="tm-tournament-promo-prize-amount"
            >
              {formatPrize(maxPrize)}
            </span>
          </div>
        ) : (
          <p
            id="promo-hero-heading"
            className="tm-tournament-promo-fallback-headline"
          >
            조별리그부터 결선 토너먼트까지,<br />
            팀과 함께 겨뤄보세요
          </p>
        )}

        {/* Featured tournament meta */}
        {featured ? (
          <>
            <p className="tm-tournament-promo-featured-title">{featured.title}</p>
            <p className="tm-tournament-promo-meta" aria-label="대회 정보">
              {featured.scheduledAt ? formatTournamentDate(featured.scheduledAt) : '날짜 미정'}
              {' · '}
              <span aria-label={`${featured.confirmedCount}팀 확정 / ${featured.teamCount}팀`}>
                {featured.confirmedCount}/{featured.teamCount}팀 확정
              </span>
              {featured.venue ? ` · ${featured.venue}` : ''}
            </p>
          </>
        ) : null}

        {/* CTAs */}
        <div className="tm-tournament-promo-cta-row">
          {featured ? (
            <Link
              href={`/tournaments/${featured.id}/apply`}
              className="tm-btn tm-btn-lg tm-tournament-promo-cta-primary"
              aria-label={`${featured.title} 참가 신청`}
            >
              참가 신청
            </Link>
          ) : null}
          <Link
            href="#tournament-list"
            className="tm-btn tm-btn-lg tm-tournament-promo-cta-ghost"
            aria-label="대회 목록으로 이동"
          >
            대회 둘러보기
          </Link>
        </div>
      </section>

      {/* ── 2. Prize Breakdown (only when featured has a prize) ── */}
      {featured && featured.prizePool != null && featured.prizePool > 0 ? (
        <section
          aria-labelledby="prize-breakdown-heading"
          className="tm-tournament-promo-section"
          style={{ paddingTop: 28, paddingBottom: 4 }}
        >
          <h2
            id="prize-breakdown-heading"
            className="tm-tournament-promo-section-title"
          >
            상금 배분
          </h2>

          {featured.prizeBreakdown ? (
            <PrizeBreakdownCards
              prizeBreakdown={featured.prizeBreakdown}
              totalPrize={featured.prizePool}
            />
          ) : (
            /* No breakdown detail — single total card */
            <div className="tm-tournament-promo-prize-single">
              <TrophyIcon size={32} color="var(--orange500)" aria-hidden="true" />
              <div>
                <p className="tm-tournament-promo-prize-single-label">총 상금</p>
                <p className="tm-tournament-promo-prize-single-amount">
                  {formatPrize(featured.prizePool)}
                </p>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {/* ── 3. 진행 방식 (Process Flow) ── */}
      <section
        aria-labelledby="process-flow-heading"
        className="tm-tournament-promo-section"
        style={{ paddingTop: 28, paddingBottom: 4 }}
      >
        <h2
          id="process-flow-heading"
          className="tm-tournament-promo-section-title"
        >
          진행 방식
        </h2>

        <div className="tm-tournament-promo-steps">
          {PROCESS_STEPS.map((step, i) => (
            <div key={step.label} className="tm-tournament-promo-step">
              <div className="tm-tournament-promo-step-icon" aria-hidden="true" style={{ color: 'var(--blue500)' }}>
                {step.icon}
              </div>
              <span className="tm-tournament-promo-step-num" aria-hidden="true">
                {i + 1}
              </span>
              <span className="tm-tournament-promo-step-label">{step.label}</span>
              {i < PROCESS_STEPS.length - 1 ? (
                <span
                  className="tm-tournament-promo-step-connector"
                  aria-hidden="true"
                />
              ) : null}
            </div>
          ))}
        </div>

        {/* Mini bracket preview (static, decorative) */}
        <div
          className="tm-tournament-promo-bracket-preview"
          aria-hidden="true"
          role="img"
          aria-label="대진표 예시"
        >
          <span className="tm-text-caption" style={{ color: 'var(--text-caption)', marginBottom: 8, display: 'block', textAlign: 'center' }}>
            대진표 예시
          </span>
          <MiniBracketPreview />
        </div>
      </section>

      {/* ── 4. 참가 방법 (How to Join) ── */}
      <section
        aria-labelledby="how-to-join-heading"
        className="tm-tournament-promo-section"
        style={{ paddingTop: 28, paddingBottom: 4 }}
      >
        <h2
          id="how-to-join-heading"
          className="tm-tournament-promo-section-title"
        >
          참가 방법
        </h2>

        <div className="tm-tournament-promo-how-grid">
          {HOW_TO_STEPS.map((step, i) => (
            <div key={step.title} className="tm-tournament-promo-how-card">
              <div className="tm-tournament-promo-how-icon" aria-hidden="true" style={{ color: 'var(--blue500)' }}>
                {step.icon}
              </div>
              <p className="tm-tournament-promo-how-step-num">STEP {i + 1}</p>
              <p className="tm-tournament-promo-how-title">{step.title}</p>
              <p className="tm-tournament-promo-how-desc">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 5. Final CTA ── */}
      <section
        aria-labelledby="final-cta-heading"
        className="tm-tournament-promo-final-cta"
      >
        <p
          id="final-cta-heading"
          className="tm-tournament-promo-final-cta-text"
        >
          지금 참가할 대회를 찾아보세요
        </p>
        <Link
          href="#tournament-list"
          className="tm-btn tm-btn-lg tm-btn-primary"
          aria-label="대회 목록으로 이동"
        >
          <TrophyIcon size={16} strokeWidth={1.8} aria-hidden="true" />
          <span>대회 목록 보기</span>
        </Link>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          EXISTING TOURNAMENT LIST (preserved as-is)
          ══════════════════════════════════════════════════════════════ */}

      {/* ── Tournament list ── */}
      <section id="tournament-list" aria-labelledby="tournament-list-heading" style={{ marginTop: 28, padding: '0 20px' }}>
        <div style={{ marginLeft: -20, marginRight: -20 }}>
          <SectionTitle title="진행 중인 대회" />
        </div>
        <div id="tournament-list-heading" className="sr-only">진행 중인 대회 목록</div>

        {/* D3: 종목 필터 칩 — 컬러+텍스트 병행으로 a11y 준수 */}
        <div
          role="group"
          aria-label="종목 필터"
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            marginTop: 10,
            marginBottom: 12,
          }}
        >
          {/* 전체 칩 */}
          <button
            type="button"
            onClick={() => handleSportFilter(null)}
            aria-pressed={activeSportCode === null}
            aria-label="전체 종목"
            className="tm-btn"
            style={{
              padding: '4px 12px',
              borderRadius: 999,
              fontSize: 'var(--font-size-caption)',
              fontWeight: activeSportCode === null ? 700 : 500,
              background: activeSportCode === null ? 'var(--blue500)' : 'var(--grey100)',
              color: activeSportCode === null ? 'var(--static-white)' : 'var(--text-body)',
              border: 'none',
              cursor: 'pointer',
              minHeight: 32,
              lineHeight: 1,
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            전체
          </button>

          {FILTER_SPORTS.map(({ code, label }) => {
            const accent = getSportAccent(code);
            const isActive = activeSportCode === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => handleSportFilter(code)}
                aria-pressed={isActive}
                aria-label={`${label} 종목만 보기`}
                className="tm-btn"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 10px',
                  borderRadius: 999,
                  fontSize: 'var(--font-size-caption)',
                  fontWeight: isActive ? 700 : 500,
                  background: isActive ? accent.badgeBg : 'var(--grey100)',
                  color: isActive ? accent.badgeText : 'var(--text-body)',
                  border: isActive ? `1.5px solid ${accent.dot}` : '1.5px solid transparent',
                  cursor: 'pointer',
                  minHeight: 32,
                  lineHeight: 1,
                  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                }}
              >
                {/* 종목 색깔 점 — 컬러 단독이 아닌 텍스트와 병행 */}
                <span
                  aria-hidden="true"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: isActive ? accent.dot : 'var(--grey400)',
                    flexShrink: 0,
                  }}
                />
                {label}
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <TournamentSkeletonList />
        ) : isError ? (
          <ErrorState
            message={extractErrorMessage(error, '대회 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')}
            onRetry={() => void refetch()}
          />
        ) : displayItems.length === 0 ? (
          <EmptyState
            title="현재 모집 중인 대회가 없어요"
            sub="새로운 대회가 열리면 앱 알림으로 안내드릴게요."
            icon={<TrophyIcon size={36} strokeWidth={1.5} />}
          />
        ) : (
          <>
            <div
              role="list"
              aria-label="대회 목록"
              className="tm-tournament-list-grid"
              style={{ marginTop: 4 }}
            >
              {displayItems.map((item) => (
                <TournamentCard key={item.id} item={item} />
              ))}
            </div>

            {hasNext ? (
              <button
                className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"
                type="button"
                disabled={isFetching}
                onClick={handleLoadMore}
                style={{ marginTop: 16 }}
              >
                {isFetching ? '불러오는 중…' : '더 보기'}
              </button>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

/* ── Prize Breakdown Cards ── */
function PrizeBreakdownCards({
  prizeBreakdown,
  totalPrize,
}: {
  prizeBreakdown: string;
  totalPrize: number;
}) {
  // breakdown 문자열('1위 100만원 · 2위 50만원 · 3위 30만원')을 세그먼트로 분리하고
  // [순위 라벨, 금액 원문]으로만 나눈다. 금액은 절대 재파싱하지 않음 — 원문('100만원')을
  // 그대로 표시해 만/원 단위를 보존하고 잘못된 숫자 변환을 방지한다.
  const parts = prizeBreakdown.split(/[/·,\n]+/).map((s) => s.trim()).filter(Boolean);
  const RANK_RE = /^(준우승|우승|\d+\s*위)\s*[:：]?\s*(.+)$/;
  const entries = parts
    .map((part) => {
      const m = part.match(RANK_RE);
      return m ? { rank: m[1].replace(/\s+/g, ''), amount: m[2].trim() } : null;
    })
    .filter((e): e is { rank: string; amount: string } => e != null);

  // 순위 라벨이 2개 이상 인식되면 카드 그리드 (최대 3개)
  if (entries.length >= 2) {
    return (
      <div className="tm-tournament-promo-prize-cards">
        {entries.slice(0, 3).map((e, i) => (
          <div
            key={`${e.rank}-${i}`}
            className="tm-tournament-promo-prize-card"
            style={i === 0 ? { border: '1.5px solid var(--orange500)' } : undefined}
          >
            <TrophyIcon size={22} color={i === 0 ? 'var(--orange500)' : 'var(--grey400)'} aria-hidden="true" />
            <p className="tm-tournament-promo-prize-card-rank">{e.rank}</p>
            <p className="tm-tournament-promo-prize-card-amount">{e.amount}</p>
          </div>
        ))}
      </div>
    );
  }

  // Fallback: single large card showing total + breakdown text
  return (
    <div className="tm-tournament-promo-prize-single">
      <TrophyIcon size={32} color="var(--orange500)" aria-hidden="true" />
      <div>
        <p className="tm-tournament-promo-prize-single-label">총 상금 {formatPrize(totalPrize)}</p>
        <p className="tm-tournament-promo-prize-single-desc">{prizeBreakdown}</p>
      </div>
    </div>
  );
}

/* ── Static Mini Bracket Preview ── */
function MiniBracketPreview() {
  // Static 4팀 → 결승 mini graphic
  const semis: Array<{ a: string; b: string }> = [
    { a: 'A팀', b: 'B팀' },
    { a: 'C팀', b: 'D팀' },
  ];
  return (
    <div className="tm-tournament-promo-bracket">
      {/* Semi-final column */}
      <div className="tm-tournament-promo-bracket-col">
        <p className="tm-tournament-promo-bracket-round">4강</p>
        <div className="tm-tournament-promo-bracket-matches">
          {semis.map((m, i) => (
            <div key={i} className="tm-tournament-promo-bracket-match">
              <span>{m.a}</span>
              <span className="tm-tournament-promo-bracket-vs">vs</span>
              <span>{m.b}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Connector */}
      <div className="tm-tournament-promo-bracket-conn" aria-hidden="true" />

      {/* Final column */}
      <div className="tm-tournament-promo-bracket-col">
        <p className="tm-tournament-promo-bracket-round">결승</p>
        <div className="tm-tournament-promo-bracket-matches" style={{ justifyContent: 'center' }}>
          <div className="tm-tournament-promo-bracket-match tm-tournament-promo-bracket-match--final">
            <TrophyIcon size={14} color="var(--orange500)" aria-hidden="true" />
            <span>결승전</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Inline icon components (stroke=currentColor, 24 viewBox, 1.8 strokeWidth) ── */

function IconClipboard({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

function IconCreditCard({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}

function IconUsers({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconSoccerBall({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      <path d="M2 12h20" />
    </svg>
  );
}

function IconBracket({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h4v12H3" />
      <path d="M7 12h5" />
      <path d="M12 8h2v8h-2" />
      <path d="M14 12h3" />
      <path d="M17 10h3v4h-3" />
    </svg>
  );
}

function IconTeam({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
      <path d="M12 8v4l3 3" />
    </svg>
  );
}

function IconFileText({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

/* ── Static data ── */

const PROCESS_STEPS: Array<{ icon: React.ReactNode; label: string }> = [
  { icon: <IconClipboard size={20} />, label: '신청' },
  { icon: <IconCreditCard size={20} />, label: '결제' },
  { icon: <IconUsers size={20} />, label: '선수 명단' },
  { icon: <IconSoccerBall size={20} />, label: '조별 리그' },
  { icon: <IconBracket size={20} />, label: '결선 토너먼트' },
  { icon: <TrophyIcon size={20} strokeWidth={1.8} />, label: '우승' },
];

const HOW_TO_STEPS: Array<{ icon: React.ReactNode; title: string; desc: string }> = [
  {
    icon: <IconTeam size={28} />,
    title: '팀 선택/만들기',
    desc: '내 팀으로 참가하거나 새 팀을 만들어 준비해요.',
  },
  {
    icon: <IconCreditCard size={28} />,
    title: '대회 신청·결제',
    desc: '참가 신청 후 참가비를 결제해요.',
  },
  {
    icon: <IconFileText size={28} />,
    title: '선수 명단 등록',
    desc: '대회 전까지 선수 명단을 등록하면 준비 완료예요.',
  },
];

/* ── Tournament card ── */

function TournamentCard({ item }: { item: V1TournamentListItem }) {
  const status = getTournamentStatusConfig(item.status);
  const sportAccent = getSportAccent(item.sport.code);

  return (
    <div role="listitem">
      <Link
        className="tm-card tm-pressable"
        href={`/tournaments/${item.id}`}
        style={{ display: 'block', padding: '16px 16px 14px', textDecoration: 'none' }}
        aria-label={`${item.title} — ${sportAccent.label} — ${status.label}`}
      >
        {/* Top row: title + status badge */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, justifyContent: 'space-between' }}>
          <div
            className="tm-text-body-lg"
            style={{ color: 'var(--text-strong)', flex: 1, minWidth: 0, lineHeight: 1.35 }}
          >
            {item.title}
          </div>
          <span className={`tm-badge ${status.badgeClass}`} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
            {status.label}
          </span>
        </div>

        {/* Sport identity chip + meta row */}
        <div
          style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px' }}
        >
          {/* Sport chip: colored dot + Korean label */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '2px 8px',
              borderRadius: 999,
              background: sportAccent.badgeBg,
              flexShrink: 0,
            }}
            aria-label={`종목: ${sportAccent.label}`}
          >
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: sportAccent.dot,
                flexShrink: 0,
              }}
            />
            <span
              className="tm-text-caption"
              style={{ color: sportAccent.badgeText, fontWeight: 600, lineHeight: 1 }}
            >
              {sportAccent.label}
            </span>
          </span>

          {/* Date + venue */}
          {item.scheduledAt ? (
            <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
              {formatTournamentDate(item.scheduledAt)}
            </span>
          ) : null}
          {item.venue ? (
            <span
              className="tm-text-caption"
              style={{
                color: 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 160,
              }}
            >
              {item.venue}
            </span>
          ) : null}
        </div>

        {/* Prize pool line — shown only when present */}
        {item.prizePool != null ? (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              marginTop: 8,
              padding: '3px 8px',
              borderRadius: 999,
              background: 'var(--orange50)',
            }}
            aria-label={`총 상금 ${item.prizePool.toLocaleString('ko-KR')}원`}
          >
            <TrophyIcon size={12} color="var(--orange500)" aria-hidden="true" />
            <span
              className="tm-text-caption"
              style={{ color: 'var(--text-strong)', fontWeight: 600 }}
            >
              총 상금 {item.prizePool.toLocaleString('ko-KR')}원
            </span>
          </div>
        ) : null}

        {/* Bottom row: entry fee + team count */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 10,
            paddingTop: 10,
            borderTop: '1px solid var(--grey100)',
          }}
        >
          <span className="tm-text-label" style={{ color: 'var(--text-muted)' }}>
            참가비 {formatEntryFee(item.entryFee)}
          </span>
          <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
            <span className="tab-num">{item.confirmedCount}</span>
            <span>/</span>
            <span className="tab-num">{item.teamCount}</span>
            <span>팀 확정</span>
          </span>
        </div>
      </Link>
    </div>
  );
}

/* ── Skeleton list ── */

function TournamentSkeletonList() {
  return (
    <div
      aria-busy="true"
      aria-label="대회 목록 불러오는 중"
      style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}
    >
      <TournamentSkeletonCard opacity={1} />
      <TournamentSkeletonCard opacity={0.65} />
      <TournamentSkeletonCard opacity={0.35} />
    </div>
  );
}

function TournamentSkeletonCard({ opacity }: { opacity: number }) {
  return (
    <div
      className="tm-card"
      aria-hidden="true"
      style={{ opacity, padding: '16px 16px 14px', pointerEvents: 'none' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ height: 14, borderRadius: 6, background: 'var(--grey100)', width: '60%' }} />
        <div className="tm-badge tm-badge-grey" style={{ opacity: 0.5, width: 48 }}>&nbsp;</div>
      </div>
      <div style={{ height: 11, borderRadius: 6, background: 'var(--grey100)', width: '44%', marginTop: 8 }} />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 10,
          paddingTop: 10,
          borderTop: '1px solid var(--grey100)',
        }}
      >
        <div style={{ height: 11, borderRadius: 6, background: 'var(--grey100)', width: '22%' }} />
        <div style={{ height: 11, borderRadius: 6, background: 'var(--grey100)', width: '28%' }} />
      </div>
    </div>
  );
}
