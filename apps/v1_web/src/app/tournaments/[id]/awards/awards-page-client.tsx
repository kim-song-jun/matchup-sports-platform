'use client';

import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, ErrorState } from '@/components/v1-ui/primitives';
import { useV1Tournament } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { TournamentHubHeader } from '@/components/tournaments/tournament-hub-header';
import { TournamentFlowNav } from '@/components/tournaments/tournament-flow-nav';
import { formatEntryFee } from '@/lib/date-utils';
import type {
  V1TournamentDetail,
  V1TournamentFixture,
  V1TournamentFixtureResult,
  V1TournamentGroup,
  V1TournamentStanding,
} from '@/types/api';

/* ── 챔피언 결정 ── */
function getWinnerSide(result: V1TournamentFixtureResult): 'home' | 'away' | null {
  const { homeScore, awayScore, hasPenalty, homePenaltyScore, awayPenaltyScore } = result;
  if (hasPenalty && homePenaltyScore !== null && awayPenaltyScore !== null) {
    if (homePenaltyScore === awayPenaltyScore) return null;
    return homePenaltyScore > awayPenaltyScore ? 'home' : 'away';
  }
  if (homeScore > awayScore) return 'home';
  if (awayScore > homeScore) return 'away';
  return null;
}

function getTopThree(tournament: V1TournamentDetail): Array<{ pos: number; name: string }> {
  const allStandings = tournament.groups
    .flatMap((g) => g.standings)
    .filter((s, i, arr) => arr.findIndex((x) => x.registrationId === s.registrationId) === i)
    .sort((a, b) => a.position - b.position);

  if (allStandings.length >= 3) {
    return [1, 2, 3].map((pos) => {
      const s = allStandings[pos - 1];
      return { pos, name: s?.teamName ?? '미정' };
    });
  }

  // knockout: final + third_place 픽스처에서 추출
  const finalFixture = tournament.fixtures.find((f) => f.round === 'final' || f.round === '결승');
  const thirdFixture = tournament.fixtures.find(
    (f) => f.round === 'third_place' || f.round === '3·4위전',
  );

  const result: Array<{ pos: number; name: string }> = [];

  if (finalFixture?.result) {
    const w = getWinnerSide(finalFixture.result);
    const champion = w === 'home' ? finalFixture.homeTeamName : w === 'away' ? finalFixture.awayTeamName : null;
    const runner = w === 'home' ? finalFixture.awayTeamName : w === 'away' ? finalFixture.homeTeamName : null;
    if (champion) result.push({ pos: 1, name: champion });
    if (runner) result.push({ pos: 2, name: runner });
  }

  if (thirdFixture?.result) {
    const w = getWinnerSide(thirdFixture.result);
    const third = w === 'home' ? thirdFixture.homeTeamName : w === 'away' ? thirdFixture.awayTeamName : null;
    if (third) result.push({ pos: 3, name: third });
  }

  return result;
}

/* ── 시상대 (podium) ── */
function AwardsPodium({
  top3,
}: {
  top3: Array<{ pos: number; name: string }>;
}) {
  if (top3.length === 0) return null;

  // 2위(왼) / 1위(중) / 3위(오) 배치
  const podiumOrder = [2, 1, 3];
  const podiumSlots = podiumOrder.map((pos) => top3.find((t) => t.pos === pos) ?? null);

  return (
    <div className="tm-awards-podium" aria-label="최종 시상대">
      {podiumSlots.map((slot, idx) => {
        const pos = podiumOrder[idx];
        const posClass = `tm-awards-podium-${pos}` as const;
        return (
          <div key={pos} className={`tm-awards-podium-slot ${posClass}`}>
            {/* 팀명 (podium 위) */}
            <span className="tm-awards-podium-name">
              {slot?.name ?? '—'}
            </span>
            <span className="tm-awards-podium-pos">
              {pos === 1 ? '🥇' : pos === 2 ? '🥈' : '🥉'}
            </span>
            {/* 단상 */}
            <div className="tm-awards-podium-block" aria-hidden="true">
              <span style={{ color: '#fff', fontWeight: 900, fontSize: pos === 1 ? 22 : 18 }}>
                {pos}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── 상금 상세 ── */
function parsePrizeRows(breakdown: string): Array<{ label: string; amount: string }> {
  return breakdown
    .split(/[\/·\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(\S+)\s+(.+)$/);
      return m ? { label: m[1], amount: m[2] } : { label: s, amount: '' };
    });
}

const PRIZE_RANK_ICON: Record<string, string> = {
  '1위': '🥇', '2위': '🥈', '3위': '🥉',
  'MVP': '⭐', '득점왕': '⚽', '도우이': '🤝',
};
function prizeIcon(label: string): string {
  return PRIZE_RANK_ICON[label] ?? '🏆';
}

function PrizeSection({
  tournament, top3 = [],
}: {
  tournament: V1TournamentDetail;
  top3?: Array<{ pos: number; name: string }>;
}) {
  const hasPrize = tournament.prizeSummary?.trim() || tournament.prizePool;
  if (!hasPrize) return null;

  const rows = tournament.prizeBreakdown ? parsePrizeRows(tournament.prizeBreakdown) : [];
  const safeTop3 = Array.isArray(top3) ? top3 : [];
  const teamByPos = Object.fromEntries(safeTop3.map((t) => [t.pos, t.name]));

  return (
    <section style={{ marginBottom: 20 }}>
      <h3 className="tm-hub-section-title">상금 · 시상</h3>
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--grey150)', overflow: 'hidden' }}>
        {/* 총 상금 헤더 */}
        {tournament.prizePool !== null && tournament.prizePool > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', background: 'var(--blue50)', borderBottom: '1px solid var(--grey100)' }}>
            <span style={{ fontSize: 20, marginRight: 10 }}>🏆</span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>총 상금</span>
            <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--blue500)', letterSpacing: '-0.01em' }}>{formatEntryFee(tournament.prizePool)}</span>
          </div>
        )}

        {/* 순위별 상금 배분 */}
        {rows.length > 0 && rows.map((row, idx) => {
          const posNum = row.label.match(/^(\d+)위$/)?.[1];
          const teamName = posNum ? teamByPos[Number(posNum)] : undefined;
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', borderTop: idx > 0 || tournament.prizePool ? '1px solid var(--grey100)' : 'none' }}>
              <span style={{ fontSize: 22, marginRight: 10, flexShrink: 0 }}>{prizeIcon(row.label)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{row.label}</div>
                {teamName && (
                  <div style={{ fontSize: 12, color: 'var(--text-caption)', marginTop: 1 }}>{teamName}</div>
                )}
              </div>
              {row.amount && (
                <span style={{ fontSize: 15, fontWeight: 800, color: '#111827', letterSpacing: '-0.01em', flexShrink: 0 }}>{row.amount}</span>
              )}
            </div>
          );
        })}

        {/* prizeSummary */}
        {tournament.prizeSummary?.trim() && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--grey100)' }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-caption)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {tournament.prizeSummary}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
function IndividualAwardsSection() {
  return (
    <section style={{ marginBottom: 20 }}>
      <h3 className="tm-hub-section-title">개인 어워드</h3>
      <Card pad={20} style={{ background: 'var(--grey50)', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>⭐</div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-caption)', lineHeight: 1.6 }}>
          MVP · 득점왕 등 개인 어워드는<br />추후 공개될 예정이에요.
        </p>
      </Card>
    </section>
  );
}

/* ── 리뷰 섹션 (현재는 placeholder — 토너먼트 리뷰 API 연동 예정) ── */
function ReviewsSection({ tournamentId }: { tournamentId: string }) {
  // TODO: 토너먼트 리뷰 API 연동 시 실제 리뷰 목록으로 교체
  const sampleReviews = [
    {
      id: '1',
      author: '성수 러너스',
      avatarLetter: '성',
      stars: 5,
      body: '운영이 정말 매끄러웠어요. 대진표도 공정하고 경기장 컨디션도 좋았습니다. 다음 시즌에도 꼭 참가하고 싶어요!',
      date: '5월 22일',
    },
    {
      id: '2',
      author: '한강 FC',
      avatarLetter: '한',
      stars: 4,
      body: '첫 공식 대회였는데 경험이 정말 좋았습니다. 조금 더 심판이 많았으면 했지만 전반적으로 만족해요.',
      date: '5월 22일',
    },
  ];

  return (
    <section style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 className="tm-hub-section-title" style={{ margin: 0 }}>참가팀 후기</h3>
        <span style={{ fontSize: 12, color: 'var(--text-caption)' }}>{sampleReviews.length}개</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sampleReviews.map((review) => (
          <div key={review.id} className="tm-review-card">
            <div className="tm-review-card-header">
              <div className="tm-review-card-avatar" aria-hidden="true">
                {review.avatarLetter}
              </div>
              <div>
                <div className="tm-review-card-author">{review.author}</div>
                <div className="tm-review-card-date">{review.date}</div>
              </div>
              <div className="tm-review-card-stars" aria-label={`별점 ${review.stars}점`}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <span key={i} className="tm-review-card-star" aria-hidden="true">
                    {i < review.stars ? '⭐' : '☆'}
                  </span>
                ))}
              </div>
            </div>
            <p className="tm-review-card-body">{review.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── 리텐션 CTA ── */
function RetentionSection({ tournamentId }: { tournamentId: string }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <div className="tm-retention-card">
        <div>
          <p className="tm-retention-card-title">다음 대회도 함께해요 🎉</p>
          <p className="tm-retention-card-sub">
            티밋 대회에서 새로운 팀을 만나고<br />
            더 나은 기록에 도전해보세요.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link
            href="/tournaments"
            className="tm-btn tm-btn-sm tm-btn-primary"
            style={{ flex: '1 1 auto', justifyContent: 'center', minWidth: 120 }}
          >
            다른 대회 보기
          </Link>
          <button
            type="button"
            className="tm-btn tm-btn-sm tm-btn-secondary"
            style={{ flex: '1 1 auto', minWidth: 100 }}
            onClick={() => {
              if (navigator.share) {
                void navigator.share({
                  title: '티밋 대회 결과',
                  url: window.location.href,
                });
              } else {
                void navigator.clipboard.writeText(window.location.href);
              }
            }}
          >
            결과 공유
          </button>
        </div>
      </div>
    </section>
  );
}

/* ── 아직 종료 전 안내 ── */
function NotCompletedNotice({ status }: { status: string }) {
  const msg =
    status === 'open'
      ? '대회가 시작되지 않았어요. 종료 후 시상 결과를 확인할 수 있어요.'
      : status === 'in_progress'
      ? '대회가 진행 중이에요. 종료 후 시상 결과가 공개돼요.'
      : '시상 결과를 준비 중이에요.';

  return (
    <Card pad={24} style={{ textAlign: 'center', margin: '0 0 20px' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>🏅</div>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-caption)', lineHeight: 1.6 }}>
        {msg}
      </p>
    </Card>
  );
}

/* ── 메인 콘텐츠 ── */
function AwardsPageContent({ tournament }: { tournament: V1TournamentDetail }) {
  const isCompleted = tournament.status === 'completed';
  const top3 = isCompleted ? getTopThree(tournament) : [];

  return (
    <div style={{ paddingBottom: 40 }}>
      <TournamentHubHeader
        title={tournament.title}
        sportName={tournament.sport.name}
        status={tournament.status}
        format={tournament.format}
      />

      <div style={{ padding: '20px 20px 0' }}>
        {!isCompleted && <NotCompletedNotice status={tournament.status} />}

        {isCompleted && (
          <>
            {/* 시상대 */}
            {top3.length > 0 && (
              <section style={{ marginBottom: 20 }}>
                <h3 className="tm-hub-section-title">시상 결과</h3>
                <Card pad={16}>
                  <AwardsPodium top3={top3} />
                </Card>
              </section>
            )}

            {/* 상금 */}
            <PrizeSection tournament={tournament} top3={top3} />

            {/* 개인 어워드 */}
            <IndividualAwardsSection />

            {/* 참가팀 후기 */}
            <ReviewsSection tournamentId={tournament.id} />

            {/* 리텐션 */}
            <RetentionSection tournamentId={tournament.id} />
          </>
        )}

        {/* 진행 중에도 상금 정보는 표시 */}
        {!isCompleted && tournament.prizeSummary && (
          <PrizeSection tournament={tournament} top3={top3} />
        )}
      </div>

      {/* 이전 네비게이터 (시상리뷰는 흐름의 마지막) */}
      <TournamentFlowNav
        prev={{ href: `/tournaments/${tournament.id}/results`, label: '최종결과' }}
      />
    </div>
  );
}

/* ── 스켈레톤 ── */
function AwardsPageSkeleton() {
  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="tm-skeleton" style={{ height: 56, borderRadius: 10 }} />
      <div className="tm-skeleton" style={{ height: 180, borderRadius: 12 }} />
      <div className="tm-skeleton" style={{ height: 120, borderRadius: 12 }} />
    </div>
  );
}

/* ── 진입점 ── */
export function AwardsPageClient({ tournamentId }: { tournamentId: string }) {
  const { data, isLoading, isError, error, refetch } = useV1Tournament(tournamentId);

  if (isLoading) {
    return (
      <AppChrome title="시상·리뷰" backHref={`/tournaments/${tournamentId}/results`} bottomNav={false} activeTab="tournaments">
        <AwardsPageSkeleton />
      </AppChrome>
    );
  }

  if (isError || !data) {
    const msg = extractErrorMessage(error, '대회 정보를 불러오지 못했어요.');
    return (
      <AppChrome title="시상·리뷰" backHref={`/tournaments/${tournamentId}/results`} bottomNav={false} activeTab="tournaments">
        <div style={{ padding: '40px 20px' }}>
          <ErrorState message={msg} onRetry={() => void refetch()} />
        </div>
      </AppChrome>
    );
  }

  return (
    <AppChrome
      title="시상·리뷰"
      backHref={`/tournaments/${tournamentId}/results`}
      bottomNav={false}
      activeTab="tournaments"
    >
      <AwardsPageContent tournament={data} />
    </AppChrome>
  );
}
