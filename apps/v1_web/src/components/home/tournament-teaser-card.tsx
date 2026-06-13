'use client';

import Link from 'next/link';
import { TrophyIcon } from '@/components/v1-ui/icons';
import { useV1Tournaments } from '@/hooks/use-v1-api';

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
  const dateLabel = formatTeaserDate(featured?.scheduledAt ?? null);

  return (
    <Link className="tm-pressable tm-tournament-teaser" href={href} aria-label={ariaLabel}>
      <div className="tm-tournament-teaser-inner">
        <div className="tm-tournament-teaser-badge" aria-hidden="true">
          <TrophyIcon size={22} strokeWidth={2} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tm-text-micro" style={{ color: 'var(--blue500)', marginBottom: 2 }}>
            {featured ? '대회 · 모집중' : '대회 · 풋살'}
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

        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          style={{ flexShrink: 0, color: 'var(--text-muted)' }}
        >
          <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </Link>
  );
}

function formatTeaserDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}
