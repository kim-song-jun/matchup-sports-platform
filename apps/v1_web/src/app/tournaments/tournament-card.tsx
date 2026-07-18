'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Trophy } from 'lucide-react';
import { getTournamentStatusConfig } from '@/lib/v1-tournament-status';
import { getSportAccent } from '@/lib/v1-sport-accent';
import { formatTournamentDateRangeShort, formatEntryFee } from '@/lib/date-utils';
import { publicAssetPath } from '@/lib/assets';
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

export function TournamentCard({ item }: { item: V1TournamentListItem }) {
  const status = getTournamentStatusConfig(item.status);
  const sportAccent = getSportAccent(item.sport.code);
  const pendingPaymentCount = getPendingPaymentCount(item);
  const reservedTeamCount = getReservedTeamCount(item);
  // coverImageUrl이 없는 대회도 홈 프로모션용으로 등록된 실사진(promoHomeImageUrl)이 있으면
  // 아이콘 대신 그 사진을 썸네일로 재사용한다 (둘 다 없으면 종목색 그라디언트+아이콘 폴백).
  const thumbnailImageUrl = item.coverImageUrl ?? item.promoHomeImageUrl;

  return (
    <div role="listitem" style={{ height: '100%' }}>
      <Link
        className="tm-card tm-pressable"
        href={`/tournaments/${item.id}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          padding: '16px 16px 14px',
          textDecoration: 'none',
        }}
        aria-label={`${item.title} — ${sportAccent.label} — ${status.label}`}
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
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, justifyContent: 'space-between' }}>
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
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px' }}>
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
              style={{ color: 'var(--text-strong)', fontWeight: 600, minWidth: 0, whiteSpace: 'pre-wrap' }}
            >
              {item.prizeSummary}
            </span>
          </div>
        ) : null}

        <div style={{ marginTop: 10 }}>
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
            marginTop: 10,
            paddingTop: 10,
            borderTop: '1px solid var(--grey100)',
          }}
        >
          {/* #7: 참가비 — text-strong + weight700로 시각 강도 격상 */}
          <span className="tm-text-label" style={{ color: 'var(--text-strong)', fontWeight: 700 }}>
            참가비 {formatEntryFee(item.entryFee)}
          </span>
          <span className="tm-text-caption" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* #7: 확정 팀 ≥80% 이상이면 '거의 마감' orange 배지 */}
            {item.teamCount > 0 && reservedTeamCount / item.teamCount >= 0.8
              ? <span className="tm-badge tm-badge-orange">{reservedTeamCount >= item.teamCount ? '마감' : '거의 마감'}</span>
              : null}
            <span className="tab-num">{item.confirmedCount}</span>
            {pendingPaymentCount > 0 ? (
              <>
                <span style={{ color: 'var(--orange500)' }}>+</span>
                <span className="tab-num" style={{ color: 'var(--orange500)' }}>{pendingPaymentCount}</span>
              </>
            ) : null}
            <span>/</span>
            <span className="tab-num">{item.teamCount}</span>
            <span>{pendingPaymentCount > 0 ? '팀 예약' : '팀 확정'}</span>
          </span>
        </div>
      </Link>
    </div>
  );
}
