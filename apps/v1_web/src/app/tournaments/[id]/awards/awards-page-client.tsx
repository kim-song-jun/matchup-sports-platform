'use client';

import Link from 'next/link';
import { Star, ImagePlus, X, Trophy, Medal } from 'lucide-react';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, ErrorState } from '@/components/v1-ui/primitives';
import { useRef, useState } from 'react';
import {
  useV1Tournament,
  useV1TournamentParticipantCheck,
  useV1Reviews,
  useV1MyTournamentReview,
  useV1SubmitTournamentReview,
  useV1UploadImages,
} from '@/hooks/use-v1-api';
import { hasStoredV1Session } from '@/lib/session-storage';
import { trackEvent } from '@/lib/analytics';
import { extractErrorMessage } from '@/lib/error-message';
import { V1ApiError } from '@/lib/api-client';
import { TournamentFlowNav } from '@/components/tournaments/tournament-flow-nav';
import { TournamentFixtureReviewEntrySection } from '@/components/tournaments/tournament-venue-retention-sections';
import { formatEntryFee } from '@/lib/date-utils';
import { parsePrizeRows, isPrizeAmountValue, formatPrizeRowValue } from '@/lib/prize-breakdown';
import { PrizeRankIcon } from '@/components/tournaments/prize-rank-icon';
import { publicAssetPath } from '@/lib/assets';
import { TournamentAwardIcon } from '@/components/tournaments/tournament-award-icon';

const REVIEW_PHOTO_MAX = 3;
const REVIEW_EMBED_CAP = 3;
import type {
  V1TournamentDetail,
  V1TournamentFixture,
  V1TournamentFixtureResult,
  V1TournamentGroup,
  V1TournamentReview,
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

export function getTopThree(tournament: V1TournamentDetail): Array<{ pos: number; name: string }> {
  const allStandings = tournament.groups
    .flatMap((g) => g.standings)
    .filter((s, i, arr) => arr.findIndex((x) => x.registrationId === s.registrationId) === i)
    .sort((a, b) => a.position - b.position);

  if (allStandings.length >= 3 && tournament.format === 'league') {
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
  const champion = top3.find((t) => t.pos === 1)?.name;
  // 3위 → 2위 → 1위 순으로 차오르는 등장 딜레이(챔피언 공개에 살짝 뜸을 둠)
  const REVEAL_DELAY_MS: Record<number, number> = { 3: 0, 2: 140, 1: 300 };

  return (
    <div>
      {champion ? (
        <p className="tm-awards-podium-caption">
          <strong>{champion}</strong>, 우승을 축하드려요! 🎉
        </p>
      ) : null}
      <div className="tm-awards-podium" aria-label="최종 시상대">
        {podiumSlots.map((slot, idx) => {
          const pos = podiumOrder[idx];
          const posClass = `tm-awards-podium-${pos}` as const;
          return (
            <div
              key={pos}
              className={`tm-awards-podium-slot ${posClass}`}
              style={{ '--podium-delay': `${REVEAL_DELAY_MS[pos]}ms` } as React.CSSProperties}
            >
            {/* 팀명 (podium 위) */}
            <span className="tm-awards-podium-name">
              {slot?.name ?? '—'}
            </span>
            <span className={`tm-awards-podium-pos tm-medal-${pos === 1 ? 'gold' : pos === 2 ? 'silver' : 'bronze'}`} aria-hidden="true">
              <Medal size={pos === 1 ? 26 : 22} strokeWidth={2} />
            </span>
            {/* 단상 */}
            <div className="tm-awards-podium-block" aria-hidden="true">
              <span
                style={{
                  position: 'relative',
                  zIndex: 1,
                  color: '#fff',
                  fontWeight: 900,
                  fontSize: pos === 1 ? 28 : 20,
                  lineHeight: 1,
                  textShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  background: 'var(--scrim-dark-72)',
                  borderRadius: 999,
                  padding: pos === 1 ? '4px 12px' : '3px 9px',
                }}
              >
                {pos}
              </span>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── 상금 상세 — 파서·아이콘은 어드민 미리보기와 공유 (lib/prize-breakdown, prize-rank-icon) ── */

function hasPrizeData(tournament: V1TournamentDetail): boolean {
  return Boolean(tournament.prizeSummary?.trim() || tournament.prizePool);
}

function PrizeSection({
  tournament, top3 = [],
}: {
  tournament: V1TournamentDetail;
  top3?: Array<{ pos: number; name: string }>;
}) {
  if (!hasPrizeData(tournament)) return null;

  const rows = tournament.prizeBreakdown ? parsePrizeRows(tournament.prizeBreakdown) : [];
  const safeTop3 = Array.isArray(top3) ? top3 : [];
  const teamByPos = Object.fromEntries(safeTop3.map((t) => [t.pos, t.name]));

  return (
    <section className="tm-prize-section" style={{ marginBottom: 20 }}>
      <h3 className="tm-hub-section-title">상금 · 시상</h3>
      <div className="tm-prize-card" style={{ background: 'var(--card-surface)', borderRadius: 14, border: '1px solid var(--grey150)', overflow: 'hidden' }}>
        {/* 총 상금 헤더 */}
        {tournament.prizePool !== null && tournament.prizePool > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', background: 'var(--blue50)', borderBottom: '1px solid var(--grey100)' }}>
            <span style={{ display: 'inline-flex', marginRight: 10 }} aria-hidden="true">
              <Trophy size={20} className="tm-medal-gold" strokeWidth={2} />
            </span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>총 상금</span>
            <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--blue700)', letterSpacing: '-0.01em' }}>{formatEntryFee(tournament.prizePool)}</span>
          </div>
        )}

        {/* 순위별 상금 배분 — 금액 행은 강조 스타일, 물품(goods) 행은 일반 텍스트로 우측에 표시 */}
        {rows.length > 0 && rows.map((row, idx) => {
          const posNum = row.label.match(/^(\d+)위$/)?.[1];
          const teamName = posNum ? teamByPos[Number(posNum)] : undefined;
          const isAmount = isPrizeAmountValue(row.amount);
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', borderTop: idx > 0 || tournament.prizePool ? '1px solid var(--grey100)' : 'none' }}>
              <span style={{ display: 'inline-flex', marginRight: 10, flexShrink: 0 }} aria-hidden="true">
                <PrizeRankIcon label={row.label} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{row.label}</div>
                {teamName && (
                  <div style={{ fontSize: 12, color: 'var(--text-caption)', marginTop: 1 }}>{teamName}</div>
                )}
              </div>
              {row.amount && (
                isAmount ? (
                  <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)', letterSpacing: '-0.01em', flexShrink: 0 }}>{formatPrizeRowValue(row.amount)}</span>
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-caption)', flexShrink: 0, marginLeft: 10, textAlign: 'right', maxWidth: '55%' }}>{row.amount}</span>
                )
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
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }} aria-hidden="true">
            <Star size={28} fill="var(--orange500)" stroke="var(--orange500)" strokeWidth={1.4} />
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-caption)', lineHeight: 1.6 }}>
            MVP · 득점왕 등 개인 어워드는<br />집계 중이에요.
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section style={{ marginBottom: 20 }}>
      <h3 className="tm-hub-section-title">개인 어워드</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {awards.map((award) => (
          <div key={award.id} className="tm-award-card" style={{
            alignItems: 'center', gap: 12,
            padding: '12px 16px', background: 'var(--surface)',
            borderRadius: 10, border: '1px solid var(--grey150)',
          }}>
            <span style={{ display: 'inline-flex', flexShrink: 0 }} aria-hidden="true">
              <TournamentAwardIcon iconKey={award.iconKey} awardType={award.awardType} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* [R-T2] flex:1/minWidth:0 컬럼 — 고정폭 아님, 12로 상향. */}
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-caption)', marginBottom: 2 }}>
                {award.awardLabel}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {award.recipientName}
              </div>
              {award.teamName && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{award.teamName}</div>
              )}
            </div>
            {award.note && (
              // [R-T2] maxWidth:80이지만 overflow/ellipsis 미설정이라 넘치면 줄바꿈으로
              // 흡수된다(잘림 없음) — 12로 상향.
              <div style={{ fontSize: 12, color: 'var(--text-caption)', flexShrink: 0, maxWidth: 80, textAlign: 'right' }}>{award.note}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── 별 아이콘 (채움/빈 별 공용) ── */
export function RatingStar({ filled, size = 18 }: { filled: boolean; size?: number }) {
  return (
    <Star
      size={size}
      aria-hidden="true"
      fill={filled ? 'var(--orange500)' : 'none'}
      stroke={filled ? 'var(--orange500)' : 'var(--grey300)'}
      strokeWidth={1.6}
    />
  );
}

/* ── 별점 컴포넌트 ── */
function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="별점 선택">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n} type="button"
          style={{ display: 'inline-flex', background: 'none', border: 'none', padding: '2px', cursor: onChange ? 'pointer' : 'default', lineHeight: 1 }}
          onClick={() => onChange?.(n)}
          aria-label={`${n}점`}
        >
          <RatingStar filled={n <= value} size={26} />
        </button>
      ))}
    </div>
  );
}

/* ── 리뷰 작성 모달 ── */
/** 서버 400 TEAM_SELECTION_REQUIRED 의 details.teams 를 안전하게 파싱한다. */
function parseTeamSelectionOptions(error: unknown): { teamId: string; teamName: string }[] | null {
  if (!(error instanceof V1ApiError) || error.code !== 'TEAM_SELECTION_REQUIRED') return null;
  const details = error.details as { teams?: unknown } | null;
  if (!Array.isArray(details?.teams)) return null;
  const teams = details.teams.filter(
    (t): t is { teamId: string; teamName: string } =>
      !!t && typeof t === 'object' && typeof (t as { teamId?: unknown }).teamId === 'string'
      && typeof (t as { teamName?: unknown }).teamName === 'string',
  );
  return teams.length > 0 ? teams : null;
}

/**
 * 대회 후기 작성 폼(바텀시트). 시상 화면의 후기 섹션과 후기 전용 목록 페이지
 * (`/tournaments/:id/reviews`)가 **같은 폼**을 띄운다 — 후기 진입점이 둘로 갈리면서
 * 폼이 복제되면 팀 선택 재제출·사진 업로드 같은 예외 처리가 곧장 두 벌로 갈라진다.
 */
export function ReviewFormModal({
  tournamentId, onClose,
}: { tournamentId: string; onClose: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // 여러 팀의 팀장·운영진을 겸하고 그 팀들이 모두 이 대회에 참가 확정된 경우에만 채워진다
  // (서버 400 TEAM_SELECTION_REQUIRED 응답에서 파싱). 단일 자격 팀 사용자는 절대 겪지 않는다.
  const [teamOptions, setTeamOptions] = useState<{ teamId: string; teamName: string }[] | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [genericError, setGenericError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { mutate, isPending } = useV1SubmitTournamentReview(tournamentId);
  const uploadImages = useV1UploadImages();

  const handlePickPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setPhotoError(null);
    const remaining = REVIEW_PHOTO_MAX - photoUrls.length;
    if (remaining <= 0) return;
    const toUpload = Array.from(files).slice(0, remaining);
    try {
      const { urls } = await uploadImages.mutateAsync(toUpload);
      setPhotoUrls((prev) => [...prev, ...urls].slice(0, REVIEW_PHOTO_MAX));
    } catch (err) {
      setPhotoError(extractErrorMessage(err, '사진 업로드에 실패했어요.'));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = () => {
    // 로딩 중 재클릭 시 중복 제출 방지 — isPending 은 disabled 속성과 동일하게 리렌더
    // 이후에나 반영되는 값이라 동시 클릭까지 막지는 못하지만, 스피너가 보이는 동안의
    // 재클릭은 막는다(동시 클릭 방지가 필요하면 ref 락을 따로 둔다).
    if (isPending) return;
    // 팀 선택이 필요한 상태인데 아직 고르지 않았으면 제출하지 않는다(라디오 그룹이
    // required 이므로 버튼도 비활성화돼 있지만, 방어적으로 한 번 더 막는다).
    if (teamOptions && !selectedTeamId) return;
    setGenericError(false);
    mutate(
      {
        rating,
        comment: comment.trim() || undefined,
        photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
        teamId: selectedTeamId ?? undefined,
      },
      {
        onSuccess: () => onClose(),
        onError: (err) => {
          const teams = parseTeamSelectionOptions(err);
          if (teams) {
            // 평점·코멘트·사진은 그대로 보존한 채 팀 선택 UI만 노출한다 — 다시 입력하게
            // 만들지 않는다. 사용자가 하나를 고르면 같은 폼으로 재제출된다.
            setTeamOptions(teams);
            return;
          }
          setGenericError(true);
        },
      },
    );
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
          <button type="button" onClick={onClose} style={{ display: 'inline-flex', background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--text-muted)' }} aria-label="닫기"><X size={20} /></button>
        </div>

        <div style={{ marginBottom: 16, textAlign: 'center' }}>
          <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-caption)' }}>대회는 어떠셨나요?</p>
          <StarRating value={rating} onChange={setRating} />
        </div>

        {teamOptions && (
          <div style={{ marginBottom: 16 }}>
            <p id="review-team-select-heading" style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
              여러 팀을 운영하고 계세요. 리뷰를 남길 팀을 선택해주세요.
            </p>
            {/*
              커스텀 `role="radio"` 버튼 대신 sr-only native radio + 라벨 패턴을 쓴다
              (tournament-roster-client.tsx의 eligibility 라디오와 같은 패턴). role만
              선언한 버튼 묶음은 스크린리더에 라디오 그룹으로 보이지만 화살표 키 이동과
              roving tabindex가 없어 실제로는 그렇게 동작하지 않는다 — native input은
              그 전부를 브라우저가 제공한다.
            */}
            <div
              role="radiogroup"
              aria-labelledby="review-team-select-heading"
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              {teamOptions.map((team) => {
                const isSelected = team.teamId === selectedTeamId;
                return (
                  <label
                    key={team.teamId}
                    htmlFor={`review-team-${team.teamId}`}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', minHeight: 44, padding: '10px 14px', borderRadius: 10,
                      border: isSelected ? '1.5px solid var(--blue500)' : '1px solid var(--grey200)',
                      background: isSelected ? 'var(--blue50)' : 'var(--surface)',
                      color: 'var(--text-strong)', fontSize: 13, fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box',
                    }}
                  >
                    <input
                      id={`review-team-${team.teamId}`}
                      type="radio"
                      name="review-team-select"
                      value={team.teamId}
                      checked={isSelected}
                      onChange={() => setSelectedTeamId(team.teamId)}
                      className="sr-only"
                    />
                    {team.teamName}
                    {isSelected && <span aria-hidden="true" style={{ color: 'var(--blue500)' }}>✓</span>}
                  </label>
                );
              })}
            </div>
          </div>
        )}

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
        {/* [R-T2] 고정폭 없는 카운터 텍스트 — 12로 상향. */}
        <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-caption)', marginBottom: 12 }}>{comment.length}/500</div>

        {/* 사진 첨부 (선택, 최대 3장) */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {photoUrls.map((url) => (
              <div key={url} style={{ position: 'relative', width: 64, height: 64, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
                <img src={publicAssetPath(url)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button
                  type="button"
                  onClick={() => setPhotoUrls((prev) => prev.filter((u) => u !== url))}
                  aria-label="사진 삭제"
                  style={{
                    position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
                  }}
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              </div>
            ))}
            {photoUrls.length < REVIEW_PHOTO_MAX && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadImages.isPending}
                aria-label="사진 추가"
                style={{
                  width: 64, height: 64, borderRadius: 10, flexShrink: 0,
                  border: '1px dashed var(--grey300)', background: 'var(--grey50)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                  color: 'var(--text-muted)', cursor: uploadImages.isPending ? 'default' : 'pointer',
                }}
              >
                <ImagePlus size={18} strokeWidth={1.8} aria-hidden="true" />
                {/* [R-T2] 64×64 버튼 안 아이콘(18px)+텍스트 세로 스택 — 12px로도
                    세로 공간(64px)은 여유. 라이브 화면(대회 후기 작성)에서 실측 필요. */}
                <span style={{ fontSize: 12 }}>{uploadImages.isPending ? '업로드 중' : `${photoUrls.length}/${REVIEW_PHOTO_MAX}`}</span>
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={(e) => void handlePickPhotos(e.target.files)}
            style={{ display: 'none' }}
          />
          {/* [R-T2] 고정폭 없는 에러 문구 — 12로 상향. */}
          {photoError && <p style={{ color: 'var(--red700)', fontSize: 12, marginTop: 6 }}>{photoError}</p>}
        </div>

        {genericError && <p style={{ color: 'var(--red700)', fontSize: 12, marginBottom: 12 }}>리뷰 작성 중 오류가 발생했어요. 다시 시도해주세요.</p>}

        <button
          type="button" onClick={handleSubmit}
          disabled={isPending || rating === 0 || (!!teamOptions && !selectedTeamId)}
          className="tm-btn tm-btn-primary"
          style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: 14, fontWeight: 700 }}
        >
          {isPending ? '저장 중...' : teamOptions ? '선택한 팀으로 등록' : '후기 등록'}
        </button>
      </div>
    </div>
  );
}

/* ── 후기 카드 (임베드 목록 · 전체보기 페이지 공용) ── */
export function ReviewCard({ review }: { review: V1TournamentReview }) {
  const letter = (review.teamName ?? review.authorNickname ?? '?').charAt(0);
  const date = new Date(review.createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  const photoUrls = review.photoUrls ?? [];

  return (
    <div className="tm-review-card">
      <div className="tm-review-card-header">
        <div className="tm-review-card-avatar" aria-hidden="true">{letter}</div>
        <div>
          <div className="tm-review-card-author">{review.teamName ?? review.authorNickname}</div>
          <div className="tm-review-card-date">{date}</div>
        </div>
        <div className="tm-review-card-stars" aria-label={`별점 ${review.rating}점`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <RatingStar key={i} filled={i < review.rating} size={14} />
          ))}
        </div>
      </div>
      {review.comment && <p className="tm-review-card-body">{review.comment}</p>}
      {photoUrls.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {photoUrls.map((url) => (
            <a key={url} href={publicAssetPath(url)} target="_blank" rel="noreferrer" style={{ display: 'block', width: 72, height: 72, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
              <img src={publicAssetPath(url)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 후기를 쓸 수 있는지 판정하는 단 하나의 자리. 시상 화면의 후기 섹션과 후기 전용
 * 목록 페이지가 이 훅을 공유한다 — 권한 규칙(대회 종료 + 참가 확정 팀의 팀장·운영진 +
 * 미작성)이 화면마다 따로 적히면, 한쪽만 고쳐져 "여기선 쓸 수 있는데 저기선 안 되는"
 * 상태가 조용히 생긴다.
 *
 * `isParticipant`/`alreadyReviewed`는 버튼뿐 아니라 **빈 상태 안내 문구**를 고르는 데도
 * 쓰이므로(왜 못 쓰는지를 상태별로 안내한다) 판정 결과를 통째로 돌려준다.
 */
export function useTournamentReviewWriteGate(tournamentId: string, status: V1TournamentDetail['status']) {
  const hasSession = hasStoredV1Session();
  const isCompleted = status === 'completed';

  const { data: participantData } = useV1TournamentParticipantCheck(tournamentId, hasSession && isCompleted);
  const { data: myReview } = useV1MyTournamentReview(tournamentId, hasSession && isCompleted);

  const isParticipant = participantData?.isParticipant ?? false;
  const alreadyReviewed = !!myReview;
  return {
    hasSession,
    isCompleted,
    isParticipant,
    alreadyReviewed,
    canWrite: isCompleted && isParticipant && !alreadyReviewed,
  };
}

/* ── 리뷰 섹션 (실제 데이터 + 권한 gate) ── */
/**
 * 이 대회의 경기별 후기 진입 — 예전엔 대회 상세에 있었다. 대회 상세에 후기 입구가 두 개
 * ("대회 후기" 행 + "리뷰할 수 있는 경기" 섹션)라 어디로 가야 하는지 헷갈려서, 후기는 이
 * 화면 하나로 모았다. 대회 후기(대회 자체)와 경기별 후기(상대팀·상대 선수)를 같이 본다.
 */
function FixtureReviewsSection({ tournament }: { tournament: V1TournamentDetail }) {
  const hasSession = hasStoredV1Session();
  const hasCompletedFixture = tournament.fixtures.some(
    (fixture) => fixture.status === 'completed' && fixture.result !== null,
  );
  const query = useV1Reviews(
    { tab: 'pending', tournamentId: tournament.id, limit: 50 },
    { enabled: hasSession && hasCompletedFixture },
  );
  if (!hasSession || !hasCompletedFixture) return null;

  const state = query.isError
    ? { status: 'error' as const, items: [], onRetry: () => void query.refetch() }
    : query.isPending || query.isFetching
      ? { status: 'loading' as const, items: [] }
      : { status: 'ready' as const, items: query.data?.items ?? [] };

  return (
    <div style={{ marginBottom: 20 }}>
      <TournamentFixtureReviewEntrySection fixtures={tournament.fixtures} state={state} />
    </div>
  );
}

function ReviewsSection({ tournament }: { tournament: V1TournamentDetail }) {
  const [showForm, setShowForm] = useState(false);
  const { hasSession, isCompleted, isParticipant, alreadyReviewed, canWrite } =
    useTournamentReviewWriteGate(tournament.id, tournament.status);

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
              // [R-T2] 고정폭 없는 pill 배지 — 12로 상향.
              <span style={{ fontSize: 12, color: 'var(--text-caption)', background: 'var(--grey100)', padding: '3px 8px', borderRadius: 6 }}>
                ✓ 작성완료
              </span>
            )}
          </div>
        </div>

        {reviews.length === 0 ? (
          <Card pad={20} style={{ background: 'var(--grey50)', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-caption)', lineHeight: 1.6 }}>
              {/* 왜 후기를 쓸 수 없는지(또는 어떻게 쓰는지)를 상태별로 안내한다 */}
              {/* 실제 권한은 참가 확정 팀의 owner(팀장) + manager(운영진)다
                  — tournaments/tournament-reviews.service.ts eligibleTeamWhere 참조.
                  "팀 대표만"이라고 안내하면 운영진이 자기는 못 쓴다고 오해한다. */}
              {isCompleted && isParticipant && !alreadyReviewed
                ? '첫 번째 후기를 남겨보세요!'
                : isCompleted && !hasSession
                  ? '아직 등록된 후기가 없어요. 로그인하면 참가팀의 팀장·운영진은 후기를 작성할 수 있어요.'
                  : isCompleted && hasSession && !isParticipant
                    ? '아직 등록된 후기가 없어요. 후기는 대회에 참가한 팀의 팀장·운영진만 작성할 수 있어요.'
                    : '아직 등록된 후기가 없어요.'}
            </p>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reviews.slice(0, REVIEW_EMBED_CAP).map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
            {reviews.length > REVIEW_EMBED_CAP && (
              <Link
                href={`/tournaments/${tournament.id}/reviews`}
                className="tm-btn tm-btn-sm tm-btn-outline"
                style={{ justifyContent: 'center' }}
              >
                후기 전체보기 →
              </Link>
            )}
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
            팀밋 대회에서 새로운 팀을 만나고<br />
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
                trackEvent('tournament_share', { channel: 'native_share' });
                void navigator.share({
                  title: '팀밋 대회 결과',
                  url: window.location.href,
                });
              } else {
                trackEvent('tournament_share', { channel: 'clipboard' });
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
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }} aria-hidden="true">
        <Medal size={32} className="tm-medal-gold" strokeWidth={1.8} />
      </div>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-caption)', lineHeight: 1.6 }}>
        {msg}
      </p>
    </Card>
  );
}

/* ── 메인 콘텐츠 ──
 * 데스크탑: bracket/results 서브페이지와 동일한 tm-tourn-sub-* 2열 그리드 시스템 재사용
 * (좌: 시상 결과·상금 / 우: 개인 어워드·후기) — 모바일은 클래스가 no-op이라 기존 스택 유지. */
function AwardsPageContent({ tournament }: { tournament: V1TournamentDetail }) {
  const isCompleted = tournament.status === 'completed';
  const top3 = isCompleted ? getTopThree(tournament) : [];
  const showPrizeColumn = isCompleted && hasPrizeData(tournament);

  return (
    <div className="tm-tourn-sub-page">
      <h1 className="sr-only">{tournament.title} 시상과 리뷰</h1>
      {!isCompleted && (
        <div style={{ padding: '20px 20px 0' }}>
          <NotCompletedNotice status={tournament.status} />
          {/* 진행 중에도 상금 정보는 표시 */}
          {tournament.prizeSummary && <PrizeSection tournament={tournament} top3={top3} />}
        </div>
      )}

      {isCompleted && top3.length > 0 && (
        /* 시상대는 그리드 밖 풀와이드 히어로로 — 좌/우 콘텐츠양 격차(포디움+상금 vs 어워드+후기)를 줄임 */
        <div className="tm-tourn-hero-full" style={{ padding: '20px 20px 0' }}>
          <section style={{ marginBottom: 20 }}>
            <h3 className="tm-hub-section-title">시상 결과</h3>
            <Card pad={16}>
              <AwardsPodium top3={top3} />
            </Card>
          </section>
        </div>
      )}

      {isCompleted && showPrizeColumn && (
        <div className="tm-tourn-sub-grid tm-tourn-sub-grid-6040 tm-awards-grid">
          <div className="tm-tourn-sub-col tm-awards-col-prize" style={{ padding: '0 20px' }}>
            {/* 상금 */}
            <PrizeSection tournament={tournament} top3={top3} />
          </div>

          <div className="tm-tourn-sub-col" style={{ padding: '0 20px' }}>
            {/* 개인 어워드 */}
            <IndividualAwardsSection tournament={tournament} />

            {/* 참가팀 후기 */}
            <FixtureReviewsSection tournament={tournament} />
            <ReviewsSection tournament={tournament} />
          </div>
        </div>
      )}

      {isCompleted && !showPrizeColumn && (
        /* 상금 정보가 없는 대회는 2열 그리드 대신 전체 폭 단일 컬럼으로 — 빈 좌측 트랙이 생기지 않도록 */
        <div className="tm-tourn-hero-full" style={{ padding: '0 20px' }}>
          <IndividualAwardsSection tournament={tournament} />
          <FixtureReviewsSection tournament={tournament} />
            <ReviewsSection tournament={tournament} />
        </div>
      )}

      {isCompleted && (
        <div className="tm-tourn-hero-full" style={{ padding: '0 20px' }}>
          <RetentionSection tournamentId={tournament.id} />
        </div>
      )}

      {/* 이전 네비게이터 (시상리뷰는 흐름의 마지막) */}
      <div className="tm-tourn-sub-flownav">
        <TournamentFlowNav
          prev={{ href: `/tournaments/${tournament.id}/results`, label: '최종결과' }}
        />
      </div>
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
      <AppChrome title="시상·리뷰" backHref={`/tournaments/${tournamentId}/results`} activeTab="tournaments" desktopHead>
        <AwardsPageSkeleton />
      </AppChrome>
    );
  }

  if (isError || !data) {
    const msg = extractErrorMessage(error, '대회 정보를 불러오지 못했어요.');
    return (
      <AppChrome title="시상·리뷰" backHref={`/tournaments/${tournamentId}/results`} activeTab="tournaments" desktopHead>
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
      activeTab="tournaments"
      desktopHead
    >
      <AwardsPageContent tournament={data} />
    </AppChrome>
  );
}
