'use client';

import Link from 'next/link';
import { TrophyIcon, ChevronRightIcon } from '@/components/v1-ui/icons';
import { useV1Tournaments } from '@/hooks/use-v1-api';
import { formatTournamentDateShort } from '@/lib/date-utils';

/** 홈 "오늘의 추천"의 대회 슬롯 — 모집중 대회가 있으면 실데이터, 없으면 티저 fallback. */
export function TournamentTeaserCard() {
  const { data } = useV1Tournaments({ status: 'open', limit: 5 });
  const items = data?.items ?? [];
  // 일정이 가장 가까운 open 대회 1개(scheduledAt 오름차순, 없는 건 뒤로).
  const featured = items
    .slice()
    .sort((a, b) => (a.scheduledAt ?? '~').localeCompare(b.scheduledAt ?? '~'))[0];

  const href = featured ? `/tournaments/${featured.id}` : '/tournaments';
  const ariaLabel = featured
    ? `대회 상세 — ${featured.title}`
    : '대회 페이지로 이동 — 상금 걸린 풋살 대회';
  const dateLabel = formatTournamentDateShort(featured?.scheduledAt ?? null);

  return (
    <Link className="tm-pressable tm-tournament-teaser" href={href} aria-label={ariaLabel}>
      <div className="tm-tournament-teaser-inner">
        <div className="tm-tournament-teaser-badge" aria-hidden="true">
          <TrophyIcon size={22} strokeWidth={2} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>
              대회
            </span>
            {featured && <span className="tm-badge tm-badge-blue">모집중</span>}
          </div>
          <div className="tm-text-label line-clamp-1" style={{ color: 'var(--text-strong)' }}>
            {featured ? featured.title : '상금 걸린 풋살 대회, 팀과 함께 도전!'}
          </div>
          <div className="tm-text-micro" style={{ color: 'var(--text-muted)', marginTop: 3 }}>
            {featured
              ? [dateLabel, `${featured.confirmedCount}/${featured.teamCount}팀 확정`].filter(Boolean).join(' · ')
              : '조별리그 → 토너먼트 · 곧 오픈 예정이에요'}
          </div>
        </div>

        <ChevronRightIcon size={16} strokeWidth={2} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
      </div>
    </Link>
  );
}
