'use client';

import { TournamentTitle } from '@/components/tournaments/tournament-title';
import { Trophy } from 'lucide-react';
import { pendingCapacityLabel } from '@/lib/tournament-registration-availability';
import { getTournamentStatusConfig } from '@/lib/v1-tournament-status';
import { getSportAccent } from '@/lib/v1-sport-accent';
import { formatTournamentDateRangeShort, formatEntryFee } from '@/lib/date-utils';
import { resolveTournamentImage } from '@/lib/tournament-promo';
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
 * 정원 관련 계산은 **`teamCount` 가 있는 것을 전제로 한다.** 리그에는 정원 개념이 없어
 * 서버가 그 필드를 생략하므로, optional 을 여기서 풀지 않고 **호출부가 대회임을 확인한
 * 뒤 넘기게** 한다 — 여기서 `?? 0` 으로 메우면 리그가 "정원 0" 으로 조용히 흘러든다.
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
}: {
  item: V1TournamentListItem;
  /**
   * false면 참가자 목록으로 이동하는 <Link>가 아니라 순수 미리보기용 <div>로 렌더한다.
   * 관리자 위저드의 "공개 화면 확인" 단계처럼 실제 카드 그대로를 보여주되 클릭·포커스는
   * 막아야 하는 곳에서 쓴다(기본값 true — 기존 목록 페이지 동작은 그대로 유지).
   */
  interactive?: boolean;
}) {
  const sportAccent = getSportAccent(item.sport.code);
  const pendingPaymentCount = getPendingPaymentCount(item);
  /**
   * **정원은 대회에만 있다.** `teamCount` 가 있으면 대회, 없으면 리그다 — 서버가 리그에서
   * 그 필드를 생략한다(정원 개념이 없다). `isLeagueCompetition` 대신 **필드 유무로** 좁히는
   * 이유는 그래야 타입이 아래 계산을 실제로 막아 주기 때문이다: `kind` 로 분기하면 TS 는
   * `teamCount` 가 여전히 `undefined` 일 수 있다고 본다.
   */
  const capacity = item.teamCount === undefined ? null : { ...item, teamCount: item.teamCount };
  /* 배지·메타는 **`kind` 로만** 고른다. `isLeagueCompetition` 은 `format==='league'` 인
     **리그 방식 대회**(alpha 실측 7건)도 true 로 주는데, 그건 진짜 대회라 성별부도 정원도
     있다 — 거기에 "리그" 배지를 붙이면 대회를 리그라고 말하는 것이 된다.
     `format` 은 "어떻게 치르나", `kind` 는 "무엇인가"이고 여기 질문은 뒤쪽이다. */
  const isLeague = item.kind === 'regular_league';
  const reservedTeamCount = capacity === null ? 0 : getReservedTeamCount(capacity);
  // 예약에는 정원을 점유하는 입금/확인 대기도 포함한다. 실제 진행·종료 상태는 덮지 않는다.
  const isCapacityFull = capacity !== null && capacity.teamCount > 0 && reservedTeamCount >= capacity.teamCount;
  const isNearlyFull = capacity !== null && capacity.teamCount > 0 && reservedTeamCount / capacity.teamCount >= 0.8;
  const status = item.status === 'closed' || (item.status === 'open' && isCapacityFull)
    ? { ...getTournamentStatusConfig('closed'), label: '모집 마감' }
    : item.status === 'open' && isNearlyFull
      ? { badgeClass: 'tm-badge-orange', label: '거의 마감' }
      : getTournamentStatusConfig(item.status);
  const displayedTeamCount = capacity ? reservedTeamCount : item.confirmedCount + pendingPaymentCount;
  // 커버가 없는 대회도 홍보용으로 등록한 실사진이 있으면 아이콘 대신 그 사진을 썸네일로
  // 재사용한다 (셋 다 없으면 종목색 그라디언트+아이콘 폴백).
  const thumbnailImageUrl = resolveTournamentImage(item, 'cover');

  return (
    <div role="listitem" style={{ height: '100%' }}>
      <CompetitionCardShell
        interactive={interactive}
        href={`/tournaments/${item.id}`}
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

        {capacity ? (
          <div style={{ marginTop: 12 }}>
            <CapacityMiniBar item={capacity} />
          </div>
        ) : null}

        {/* 카드 간 높이 차(상금 유무 등)를 흡수해 하단 행을 같은 라인에 맞춤 */}
        <div style={{ flex: 1 }} aria-hidden="true" />

        <div className={styles.footer} data-testid="tournament-card-footer">
          <div className={styles.price}>
            <span className={`tm-text-caption ${styles.muted}`}>참가비</span>
            <strong className={`tm-text-body tab-num ${styles.amount}`}>
              {formatEntryFee(item.entryFee)}
            </strong>
          </div>
          <div className={styles.capacity}>
            <span className={`tm-text-label tab-num ${styles.summary}`}>
              {capacity ? `${displayedTeamCount}/${capacity.teamCount}` : displayedTeamCount}
              {capacity ? (pendingPaymentCount > 0 ? '팀 예약' : '팀 확정') : '팀 참가'}
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
