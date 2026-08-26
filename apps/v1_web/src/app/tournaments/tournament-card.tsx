'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Trophy } from 'lucide-react';
import { getTournamentStatusConfig } from '@/lib/v1-tournament-status';
import { getSportAccent } from '@/lib/v1-sport-accent';
import { formatTournamentDateRangeShort, formatEntryFee } from '@/lib/date-utils';
import { publicAssetPath } from '@/lib/assets';
import { resolveTournamentImage } from '@/lib/tournament-promo';
import { SportGlyph } from '@/components/v1-ui/sport-glyph';
import type { V1TournamentListItem } from '@/types/api';

/**
 * Split out of page.tsx (2026-07) — Next.js App Router restricts `page.tsx`
 * files to a fixed export whitelist (default/metadata/generateStaticParams/…),
 * so a unit-testable named export like `TournamentCard` cannot live there
 * (`tsc` fails with "does not satisfy the constraint '{ [x: string]: never }'").
 */

function getPendingPaymentCount(item: Pick<V1TournamentListItem, 'pendingPaymentCount'>): number {
  return Math.max(0, item.pendingPaymentCount ?? 0);
}

function getReservedTeamCount(item: Pick<V1TournamentListItem, 'confirmedCount' | 'pendingPaymentCount' | 'teamCount'>): number {
  return Math.min(item.teamCount, item.confirmedCount + getPendingPaymentCount(item));
}

function getGenderCategoryLabel(category: V1TournamentListItem['genderCategory']): string {
  if (category === 'male') return '남성부';
  if (category === 'female') return '여성부';
  if (category === 'mixed') return '혼성';
  return '성별 구분 없음';
}

function renderTitleWithBoundStatusPhrases(title: string) {
  return title.split(/((?:경기|모집)\s+중)/g).map((part, index) =>
    /^(?:경기|모집)\s+중$/.test(part) ? (
      <span key={`${part}-${index}`} style={{ whiteSpace: 'nowrap' }}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

/**
 * interactive=true면 실제 목록에서 쓰는 <Link>(참가자가 상세로 이동), false면 순수 미리보기용
 * <div>(관리자 위저드의 "공개 화면 확인" 단계처럼 클릭·포커스를 막아야 하는 곳)로 렌더한다.
 * 두 분기 모두 같은 className/style/aria-label을 써서 시각적으로는 완전히 동일하게 보인다.
 */
function CardShell({
  interactive,
  href,
  ariaLabel,
  children,
}: {
  interactive: boolean;
  href: string;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  const shellStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '16px 16px 14px',
    textDecoration: 'none',
  };
  if (interactive) {
    return (
      <Link className="tm-card tm-pressable" href={href} style={shellStyle} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }
  return (
    <div className="tm-card tm-pressable" style={shellStyle} aria-label={ariaLabel}>
      {children}
    </div>
  );
}

function CapacityMiniBar({ item }: { item: V1TournamentListItem }) {
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
      aria-label={`정원 ${item.confirmedCount}팀 확정, ${pendingPaymentCount}팀 입금 대기, 총 ${item.teamCount}팀`}
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
  const status = getTournamentStatusConfig(item.status);
  const sportAccent = getSportAccent(item.sport.code);
  const pendingPaymentCount = getPendingPaymentCount(item);
  const reservedTeamCount = getReservedTeamCount(item);
  // 커버가 없는 대회도 홍보용으로 등록한 실사진이 있으면 아이콘 대신 그 사진을 썸네일로
  // 재사용한다 (셋 다 없으면 종목색 그라디언트+아이콘 폴백).
  const thumbnailImageUrl = resolveTournamentImage(item, 'cover');

  return (
    <div role="listitem" style={{ height: '100%' }}>
      <CardShell
        interactive={interactive}
        href={`/tournaments/${item.id}`}
        ariaLabel={`${item.title} — ${sportAccent.label} — ${status.label}`}
      >
        {/* Top row: (선택) 커버 이미지 썸네일 + [제목·배지 / 종목·일정·장소] 세로 스택 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {thumbnailImageUrl ? (
            <div
              aria-hidden="true"
              style={{ width: 56, height: 56, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: 'var(--grey100)' }}
            >
              <Image
                src={publicAssetPath(thumbnailImageUrl)}
                alt=""
                width={56}
                height={56}
                sizes="56px"
                unoptimized
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          ) : (
            // 커버 이미지도 홈 프로모션 사진(promoHomeImageUrl)도 없는 대회는 종목색
            // 그라디언트 배지로 대체한다 — 대회 상세 헤더의 트로피 배지(linear-gradient
            // 135deg, 500→600 + 흰 아이콘)와 동일한 시각 언어.
            // 이전의 옅은 pastel bg(badgeBg)+톤온톤 아이콘(badgeText) 조합은 카드 목록에서
            // 밋밋하고 흐릿하게 보였다(사용자 피드백: "아이콘도 촌스러워").
            <div
              aria-hidden="true"
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                overflow: 'hidden',
                flexShrink: 0,
                background: `linear-gradient(135deg, ${sportAccent.dot} 0%, ${sportAccent.gradientTo} 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SportGlyph code={item.sport.code} size={28} style={{ color: 'var(--static-white)' }} />
            </div>
          )}
          {/* 제목·배지 행 + 종목·일정·장소 메타 행을 같은 컬럼에 묶어 아이콘이 아닌
              제목과 같은 x축에 메타 행이 정렬되도록 한다(이전엔 형제 div라 아이콘 밑에
              깔려 제목과 어긋나 보였다 — 사용자 피드백: "align도 안맞네"). */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, justifyContent: 'space-between' }}>
              <div
                className="tm-text-body-lg"
                style={{
                  color: 'var(--text-strong)',
                  flex: 1,
                  minWidth: 0,
                  lineHeight: 1.35,
                  overflowWrap: 'break-word',
                  wordBreak: 'keep-all',
                }}
              >
                {renderTitleWithBoundStatusPhrases(item.title)}
              </div>
              <span className={`tm-badge ${status.badgeClass}`} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                {status.label}
              </span>
            </div>

            {/* Sport identity chip + meta row */}
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px' }}>
              {/* Sport chip: colored dot + Korean label */}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
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

              <span
                className="tm-badge tm-badge-grey"
                aria-label={`성별 카테고리: ${getGenderCategoryLabel(item.genderCategory)}`}
              >
                {getGenderCategoryLabel(item.genderCategory)}
              </span>

              {/* Date + venue */}
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
            </div>
          </div>
        </div>

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
              borderRadius: 999,
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

        <div style={{ marginTop: 12 }}>
          <CapacityMiniBar item={item} />
        </div>

        {/* 카드 간 높이 차(상금 유무 등)를 흡수해 하단 행을 같은 라인에 맞춤 */}
        <div style={{ flex: 1 }} aria-hidden="true" />

        {/* #7: Bottom row: entry fee(강조) + team fill rate(마감 임박 배지) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid var(--grey100)',
          }}
        >
          {/* #7: 참가비 — text-strong + weight700로 시각 강도 격상 */}
          <span className="tm-text-label" style={{ color: 'var(--text-strong)', fontWeight: 700 }}>
            참가비 {formatEntryFee(item.entryFee)}
          </span>
          <span className="tm-text-caption" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* #7: 확정 팀 ≥80% 이상이면 '거의 마감' orange 배지 */}
            {item.teamCount > 0 && reservedTeamCount / item.teamCount >= 0.8
              ? <span className="tm-badge tm-badge-orange">{reservedTeamCount >= item.teamCount ? '마감' : '거의 마감'}</span>
              : null}
            {/* 입금대기 팀도 정원을 점유하므로(서버 CAPACITY_HOLD_STATUSES) "+N 팀 예약"만으론
                왜 신청을 못 받는지 알 수 없었다 — 대회 상세와 같은 낱말로 명시한다. */}
            {pendingPaymentCount > 0 ? (
              <span className="tm-badge tm-badge-grey" style={{ whiteSpace: 'nowrap' }}>
                입금대기 {pendingPaymentCount}팀
              </span>
            ) : null}
            <span className="tab-num">{item.confirmedCount}</span>
            {pendingPaymentCount > 0 ? (
              <>
                <span style={{ color: 'var(--orange700)' }}>+</span>
                <span className="tab-num" style={{ color: 'var(--orange700)' }}>{pendingPaymentCount}</span>
              </>
            ) : null}
            <span>/</span>
            <span className="tab-num">{item.teamCount}</span>
            <span>{pendingPaymentCount > 0 ? '팀 예약' : '팀 확정'}</span>
          </span>
        </div>
      </CardShell>
    </div>
  );
}
