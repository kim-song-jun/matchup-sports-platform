'use client';

import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, ErrorState } from '@/components/v1-ui/primitives';
import { useState } from 'react';
import {
  useV1Tournament,
  useV1TournamentParticipantCheck,
  useV1MyTournamentReview,
  useV1SubmitTournamentReview,
} from '@/hooks/use-v1-api';
import { hasStoredV1Session } from '@/lib/session-storage';
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
function IndividualAwardsSection({ tournament }: { tournament: V1TournamentDetail }) {
  const awards = tournament.awards ?? [];

  if (awards.length === 0) {
    return (
      <section style={{ marginBottom: 20 }}>
        <h3 className="tm-hub-section-title">개인 어워드</h3>
        <Card pad={20} style={{ background: 'var(--grey50)', textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⭐</div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-caption)', lineHeight: 1.6 }}>
            MVP · 득점왕 등 개인 어워드는<br />집계 중이에요.
          </p>
        </Card>
      </section>
    );
  }

  const AWARD_ICON: Record<string, string> = {
    mvp: '🏅', top_scorer: '⚽', best_defense: '🛡️',
    best_keeper: '🧤', fair_play: '🤝', best_rookie: '🌟',
  };

  return (
    <section style={{ marginBottom: 20 }}>
      <h3 className="tm-hub-section-title">개인 어워드</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {awards.map((award) => (
          <div key={award.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 16px', background: 'var(--surface)',
            borderRadius: 10, border: '1px solid var(--grey150)',
          }}>
            <span style={{ fontSize: 24, flexShrink: 0 }} aria-hidden="true">
              {AWARD_ICON[award.awardType] ?? '🏆'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-caption)', marginBottom: 2 }}>
                {award.awardLabel}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {award.recipientName}
              </div>
              {award.teamName && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{award.teamName}</div>
              )}
            </div>
            {award.note && (
              <div style={{ fontSize: 11, color: 'var(--text-caption)', flexShrink: 0, maxWidth: 80, textAlign: 'right' }}>{award.note}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── 별점 컴포넌트 ── */
function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="별점 선택">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n} type="button"
          style={{ background: 'none', border: 'none', padding: '2px', fontSize: 22, cursor: onChange ? 'pointer' : 'default', lineHeight: 1 }}
          onClick={() => onChange?.(n)}
          aria-label={`${n}점`}
        >
          {n <= value ? '⭐' : '☆'}
        </button>
      ))}
    </div>
  );
}

/* ── 리뷰 작성 모달 ── */
function ReviewFormModal({
  tournamentId, onClose,
}: { tournamentId: string; onClose: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const { mutate, isPending, isError } = useV1SubmitTournamentReview(tournamentId);

  const handleSubmit = () => {
    mutate({ rating, comment: comment.trim() || undefined }, {
      onSuccess: () => onClose(),
    });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="리뷰 작성" style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        width: '100%', maxWidth: 480, background: 'var(--background)',
        borderRadius: '16px 16px 0 0', padding: '24px 20px',
        paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>대회 후기 작성</h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }} aria-label="닫기">✕</button>
        </div>

        <div style={{ marginBottom: 16, textAlign: 'center' }}>
          <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-caption)' }}>대회는 어떠셨나요?</p>
          <StarRating value={rating} onChange={setRating} />
        </div>

        <textarea
          value={comment} onChange={(e) => setComment(e.target.value)}
          placeholder="대회 운영, 경기장, 대진표 등 솔직한 후기를 남겨주세요. (선택)"
          maxLength={500}
          rows={4}
          style={{
            width: '100%', padding: '12px', borderRadius: 8,
            border: '1px solid var(--grey200)', fontSize: 13, lineHeight: 1.6,
            color: 'var(--text-strong)', background: 'var(--surface)',
            resize: 'none', boxSizing: 'border-box',
          }}
        />
        <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-caption)', marginBottom: 16 }}>{comment.length}/500</div>

        {isError && <p style={{ color: 'var(--red500)', fontSize: 12, marginBottom: 12 }}>리뷰 작성 중 오류가 발생했어요. 다시 시도해주세요.</p>}

        <button
          type="button" onClick={handleSubmit} disabled={isPending || rating === 0}
          className="tm-btn tm-btn-primary"
          style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: 14, fontWeight: 700 }}
        >
          {isPending ? '저장 중...' : '후기 등록'}
        </button>
      </div>
    </div>
  );
}

/* ── 리뷰 섹션 (실제 데이터 + 권한 gate) ── */
function ReviewsSection({ tournament }: { tournament: V1TournamentDetail }) {
  const [showForm, setShowForm] = useState(false);
  const hasSession = hasStoredV1Session();
  const isCompleted = tournament.status === 'completed';

  const { data: participantData } = useV1TournamentParticipantCheck(tournament.id, hasSession && isCompleted);
  const { data: myReview } = useV1MyTournamentReview(tournament.id, hasSession && isCompleted);

  const isParticipant = participantData?.isParticipant ?? false;
  const alreadyReviewed = !!myReview;
  const canWrite = isCompleted && isParticipant && !alreadyReviewed;

  const reviews = tournament.reviews ?? [];

  return (
    <>
      {showForm && (
        <ReviewFormModal tournamentId={tournament.id} onClose={() => setShowForm(false)} />
      )}
      <section style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 className="tm-hub-section-title" style={{ margin: 0 }}>참가팀 후기</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {reviews.length > 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-caption)' }}>{reviews.length}개</span>
            )}
            {canWrite && (
              <button
                type="button"
                className="tm-btn tm-btn-sm tm-btn-secondary"
                style={{ padding: '5px 12px', fontSize: 12 }}
                onClick={() => setShowForm(true)}
              >
                + 후기 쓰기
              </button>
            )}
            {isCompleted && isParticipant && alreadyReviewed && (
              <span style={{ fontSize: 11, color: 'var(--text-caption)', background: 'var(--grey100)', padding: '3px 8px', borderRadius: 6 }}>
                ✓ 작성완료
              </span>
            )}
          </div>
        </div>

        {reviews.length === 0 ? (
          <Card pad={20} style={{ background: 'var(--grey50)', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-caption)', lineHeight: 1.6 }}>
              {isCompleted && isParticipant && !alreadyReviewed
                ? '첫 번째 후기를 남겨보세요!'
                : '아직 등록된 후기가 없어요.'}
            </p>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reviews.map((review) => {
              const letter = (review.teamName ?? review.authorNickname ?? '?').charAt(0);
              const date = new Date(review.createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
              return (
                <div key={review.id} className="tm-review-card">
                  <div className="tm-review-card-header">
                    <div className="tm-review-card-avatar" aria-hidden="true">{letter}</div>
                    <div>
                      <div className="tm-review-card-author">{review.teamName ?? review.authorNickname}</div>
                      <div className="tm-review-card-date">{date}</div>
                    </div>
                    <div className="tm-review-card-stars" aria-label={`별점 ${review.rating}점`}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span key={i} className="tm-review-card-star" aria-hidden="true">
                          {i < review.rating ? '⭐' : '☆'}
                        </span>
                      ))}
                    </div>
                  </div>
                  {review.comment && <p className="tm-review-card-body">{review.comment}</p>}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
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
            <IndividualAwardsSection tournament={tournament} />

            {/* 참가팀 후기 */}
            <ReviewsSection tournament={tournament} />

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
