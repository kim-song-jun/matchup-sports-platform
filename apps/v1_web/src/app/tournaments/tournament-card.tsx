'use client';

import { useEffect, useState } from 'react';
import { TournamentTitle } from '@/components/tournaments/tournament-title';
import { Trophy } from 'lucide-react';
import { pendingCapacityLabel, resolveTournamentCapacity, resolveTournamentRegistrationBlock, type TournamentCapacityInput } from '@/lib/tournament-registration-availability';
import { getTournamentStatusConfig } from '@/lib/v1-tournament-status';
import { getSportAccent } from '@/lib/v1-sport-accent';
import { formatTournamentDateRangeShort, formatEntryFee } from '@/lib/date-utils';
import { resolveTournamentImage } from '@/lib/tournament-promo';
import { withFromPath } from '@/lib/session-storage';
import {
  CompetitionCardHeader,
  CompetitionCardShell,
} from '@/components/v1-ui/competition-card';
import type { V1TournamentListItem } from '@/types/api';
import styles from './tournament-card.module.css';

/**
 * Split out of page.tsx (2026-07) — Next.js App Router restricts `page.tsx`
 * files to a fixed export whitelist (default/metadata/generateStaticParams/…),
 * so a unit-testable named export like `TournamentCard` cannot live there
 * (`tsc` fails with "does not satisfy the constraint '{ [x: string]: never }'").
 */

function getPendingPaymentCount(item: Pick<V1TournamentListItem, 'pendingPaymentCount'>): number {
  return Math.max(0, item.pendingPaymentCount ?? 0);
}

/**
 * 진행바에는 유한한 참가팀 정원만 전달한다. 무제한 리그의 null을 0으로 바꾸지 않는다.
 */
type WithCapacity = Pick<V1TournamentListItem, 'confirmedCount' | 'pendingPaymentCount' | 'entryFee'> & {
  teamCount: number;
};

function getReservedTeamCount(item: WithCapacity): number {
  return Math.min(item.teamCount, item.confirmedCount + getPendingPaymentCount(item));
}

function getGenderCategoryLabel(category: V1TournamentListItem['genderCategory']): string {
  if (category === 'male') return '남성부';
  if (category === 'female') return '여성부';
  if (category === 'mixed') return '혼성';
  return '성별 구분 없음';
}

/**
 * interactive=true면 실제 목록에서 쓰는 <Link>(참가자가 상세로 이동), false면 순수 미리보기용
 * <div>(관리자 위저드의 "공개 화면 확인" 단계처럼 클릭·포커스를 막아야 하는 곳)로 렌더한다.
 * 두 분기 모두 같은 className/style/aria-label을 써서 시각적으로는 완전히 동일하게 보인다.
 */
function CapacityMiniBar({ item }: { item: WithCapacity }) {
  const pendingPaymentCount = getPendingPaymentCount(item);
  const max = Math.max(item.teamCount, 1);
  const confirmedPct = Math.min(100, (item.confirmedCount / max) * 100);
  const pendingPct = Math.min(100 - confirmedPct, (pendingPaymentCount / max) * 100);

  return (
    <div
      role="progressbar"
      aria-valuenow={getReservedTeamCount(item)}
      aria-valuemin={0}
      aria-valuemax={item.teamCount}
      aria-label={`정원 ${item.confirmedCount}팀 확정, ${pendingPaymentCount}팀 ${pendingCapacityLabel(item.entryFee === 0)}, 총 ${item.teamCount}팀`}
      style={{ height: 5, background: 'var(--grey100)', borderRadius: 5, overflow: 'hidden', display: 'flex' }}
    >
      <div aria-hidden="true" style={{ width: `${confirmedPct}%`, background: 'var(--blue500)' }} />
      <div aria-hidden="true" style={{ width: `${pendingPct}%`, background: 'var(--grey300)' }} />
    </div>
  );
}

export function TournamentCard({
  item,
  interactive = true,
  fromPath,
}: {
  item: V1TournamentListItem;
  /** 목록 필터를 상세의 공통 뒤로가기에 전달한다. 다른 카드 소비처는 기존 URL을 유지한다. */
  fromPath?: string;
  /**
   * false면 참가자 목록으로 이동하는 <Link>가 아니라 순수 미리보기용 <div>로 렌더한다.
   * 관리자 위저드의 "공개 화면 확인" 단계처럼 실제 카드 그대로를 보여주되 클릭·포커스는
   * 막아야 하는 곳에서 쓴다(기본값 true — 기존 목록 페이지 동작은 그대로 유지).
   */
  interactive?: boolean;
}) {
  const [, refreshClock] = useState(0);
  const now = Date.now();
  const sportAccent = getSportAccent(item.sport.code);
  const pendingPaymentCount = getPendingPaymentCount(item);
  /* 배지·메타는 **`kind` 로만** 고른다. `isLeagueCompetition` 은 `format==='league'` 인
     **리그 방식 대회**(alpha 실측 7건)도 true 로 주는데, 그건 진짜 대회라 성별부도 정원도
     있다 — 거기에 "리그" 배지를 붙이면 대회를 리그라고 말하는 것이 된다.
     `format` 은 "어떻게 치르나", `kind` 는 "무엇인가"이고 여기 질문은 뒤쪽이다. */
  const isLeague = item.kind === 'regular_league';
  // 리그는 별도 maxTeams, 정규 대회는 기존 teamCount로 정원과 신청 상태를 함께 판정한다.
  const capacityInput: TournamentCapacityInput | null = isLeague
    ? { ...item, kind: 'regular_league' }
    : item.teamCount === undefined ? null : { ...item, teamCount: item.teamCount };
  const capacity = capacityInput === null ? null : resolveTournamentCapacity(capacityInput);
  const teamCapacity = capacity?.teamCount ?? null;
  const finiteCapacity = teamCapacity === null ? null : { ...item, teamCount: teamCapacity };
  const reservedTeamCount = capacity?.reservedCount ?? item.confirmedCount + pendingPaymentCount;
  // 저장된 open 상태는 마감 후에도 남을 수 있어 상세와 같은 신청 게이트를 쓴다.
  const registrationBlocked = capacityInput !== null && resolveTournamentRegistrationBlock(capacityInput, new Date(now)) !== null;
  const deadline = item.registrationDeadlineAt ? new Date(item.registrationDeadlineAt).getTime() : null;
  const hasUpcomingDeadline = capacityInput !== null && !registrationBlocked
    && deadline !== null && Number.isFinite(deadline) && deadline >= now;

  useEffect(() => {
    if (!hasUpcomingDeadline) return;
    // 홈과 같은 1분 주기로 체류 중 마감을 갱신하고, 닫힌 카드에는 타이머를 남기지 않는다.
    const timer = window.setInterval(() => refreshClock((tick) => tick + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [hasUpcomingDeadline]);

  const isNearlyFull = teamCapacity !== null && teamCapacity > 0 && reservedTeamCount / teamCapacity >= 0.8;
  const status = item.status === 'closed'
    ? { ...getTournamentStatusConfig('closed'), label: '모집 마감' }
    : item.status === 'open' && !registrationBlocked && isNearlyFull
      ? { badgeClass: 'tm-badge-orange', label: '거의 마감' }
      : getTournamentStatusConfig(item.status, registrationBlocked, item.kind === 'regular_league');
  // 커버가 없는 대회도 홍보용으로 등록한 실사진이 있으면 아이콘 대신 그 사진을 썸네일로
  // 재사용한다 (셋 다 없으면 종목색 그라디언트+아이콘 폴백).
  const thumbnailImageUrl = resolveTournamentImage(item, 'cover');

  return (
    <div role="listitem" style={{ height: '100%' }}>
      <CompetitionCardShell
        interactive={interactive}
        // 통합 목록은 리그도 소개·신청 정보가 있는 기존 상세로 연결하고 목록 필터를 보존한다.
        href={withFromPath(`/tournaments/${item.id}`, fromPath)}
        ariaLabel={`${item.title} — ${sportAccent.label} — ${status.label}`}
      >
        <CompetitionCardHeader
          sportCode={item.sport.code}
          imageUrl={thumbnailImageUrl}
          title={<TournamentTitle title={item.title} />}
          statusBadge={{ label: status.label, badgeClass: status.badgeClass }}
          meta={
            <>
              {isLeague ? (
                /* 한 목록에 두 종류가 섞이므로 "이건 리그다" 를 카드에서 알려야 한다.
                   상태 배지(진행중 등)는 대회와 글자가 같아서 구분이 안 된다.
                   티어("1부")도 함께 띄우고 싶지만 **지금은 못 만든다** — 통합 목록 API 는
                   `tier` 숫자만 주고, 표시 라벨은 시리즈마다 다른 커스텀 값(`tierLabels`)이라
                   `${tier}부` 로 지어내면 커스텀 라벨을 쓰는 시리즈에서 틀린 이름이 뜬다.
                   서버가 `tierLabel` 을 이 목록에 실어주면 그때 붙인다. */
                <span className="tm-badge tm-badge-grey" aria-label="정규 리그">
                  리그
                </span>
              ) : (
                /* 성별 배지는 대회에만 그린다. 리그 거울은 `genderCategory` 를 채우는 경로가
                   아예 없어 항상 null 이고, 그러면 모든 리그 카드에 "성별 구분 없음" 이 붙는다
                   — 정보가 아니라 소음이다(`teamCount` 를 리그에서 뺀 것과 같은 이유). */
                <span
                  className="tm-badge tm-badge-grey"
                  aria-label={`성별 카테고리: ${getGenderCategoryLabel(item.genderCategory)}`}
                >
                  {getGenderCategoryLabel(item.genderCategory)}
                </span>
              )}
              {item.scheduledAt ? (
                <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                  {formatTournamentDateRangeShort(item.scheduledAt, item.scheduledEndAt) ?? '날짜 미정'}
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
            </>
          }
        />

        {/* Prize line — admin-entered text is shown as-is. */}
        {item.prizeSummary?.trim() ? (
          <div
            style={{
              display: 'inline-flex',
              alignSelf: 'flex-start',
              alignItems: 'center',
              gap: 4,
              marginTop: 8,
              padding: '3px 8px',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--orange50)',
              whiteSpace: 'normal',
            }}
            aria-label={`상품 및 상금 ${item.prizeSummary}`}
          >
            <Trophy size={12} color="var(--orange500)" aria-hidden="true" />
            <span
              className="tm-text-caption"
              style={{ color: 'var(--orange700)', fontWeight: 600, minWidth: 0, whiteSpace: 'pre-wrap' }}
            >
              {item.prizeSummary}
            </span>
          </div>
        ) : null}

        {finiteCapacity ? (
          <div style={{ marginTop: 12 }}>
            <CapacityMiniBar item={finiteCapacity} />
          </div>
        ) : null}

        {/* 카드 간 높이 차(상금 유무 등)를 흡수해 하단 행을 같은 라인에 맞춤 */}
        <div style={{ flex: 1 }} aria-hidden="true" />

        <div className={styles.footer} data-testid="tournament-card-footer">
          {item.kind === 'regular_league' && !item.entryFeeConfigured ? null : (
            <div className={styles.price}>
              <span className={`tm-text-caption ${styles.muted}`}>참가비</span>
              <strong className={`tm-text-body tab-num ${styles.amount}`}>
                {formatEntryFee(item.entryFee)}
              </strong>
            </div>
          )}
          <div className={styles.capacity}>
            <span className={`tm-text-label tab-num ${styles.summary}`}>
              {finiteCapacity
                ? pendingPaymentCount > 0
                  ? `${item.confirmedCount} + ${pendingPaymentCount} / ${finiteCapacity.teamCount} 팀 예약`
                  : `${item.confirmedCount}/${finiteCapacity.teamCount}팀 확정`
                : `${reservedTeamCount}팀 참가`}
            </span>
            {pendingPaymentCount > 0 ? (
              <span className={`tm-text-caption ${styles.muted} ${styles.pending}`}>
                {pendingCapacityLabel(item.entryFee === 0)} {pendingPaymentCount}팀
              </span>
            ) : null}
          </div>
        </div>
      </CompetitionCardShell>
    </div>
  );
}
