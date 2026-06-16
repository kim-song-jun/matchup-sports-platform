'use client';

import Link from 'next/link';
import { Card } from '@/components/v1-ui/primitives';
import { TrophyIcon } from '@/components/v1-ui/icons';
import { useV1Tournaments } from '@/hooks/use-v1-api';
import { formatTournamentDateShort } from '@/lib/date-utils';

/** 상금 금액 컴팩트 포맷 — 1만원 이상은 'N만원', 그 미만은 'N원'. */
function formatPrizeShort(n: number): string {
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString('ko-KR')}만원`;
  return `${n.toLocaleString('ko-KR')}원`;
}

/**
 * 홈 "오늘의 추천"의 대회 히어로.
 * 매치 히어로(FeaturedMatchCard)와 동일한 풀폭 미디어+오버레이 비중으로 모집중 대회를 노출한다.
 * 일정이 가장 가까운 open 대회 1개를 고르고, open 대회가 없으면 렌더하지 않는다(빈 히어로 방지).
 */
export function TournamentHeroCard() {
  const { data } = useV1Tournaments({ status: 'open', limit: 5 });
  const items = data?.items ?? [];
  const featured = items
    .slice()
    .sort((a, b) => (a.scheduledAt ?? '~').localeCompare(b.scheduledAt ?? '~'))[0];

  if (!featured) return null;

  const dateLabel = formatTournamentDateShort(featured.scheduledAt);
  const facts = [
    dateLabel,
    `${featured.confirmedCount}/${featured.teamCount}팀 확정`,
    featured.prizePool != null && featured.prizePool > 0
      ? `상금 ${formatPrizeShort(featured.prizePool)}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link
      className="tm-featured-link tm-pressable"
      href={`/tournaments/${featured.id}`}
      aria-label={`대회 상세 — ${featured.title}`}
      style={{ marginTop: 10 }}
    >
      <Card pad={0} style={{ overflow: 'hidden' }}>
        <div
          className="tm-featured-media"
          style={{ background: 'linear-gradient(135deg, var(--blue500), var(--blue600))' }}
        >
          {/* 은은한 트로피 워터마크 (장식) */}
          <div
            aria-hidden="true"
            style={{ position: 'absolute', right: -10, top: -8, opacity: 0.16, color: 'var(--static-white)' }}
          >
            <TrophyIcon size={134} strokeWidth={1.4} />
          </div>
          <div className="tm-featured-overlay" />
          <div className="tm-featured-text">
            <div
              className="tm-text-micro"
              style={{ color: 'var(--static-white)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <TrophyIcon size={13} strokeWidth={2} aria-hidden="true" /> 상금 대회 · 모집 중
            </div>
            <div className="tm-text-subhead" style={{ color: 'var(--static-white)', marginTop: 4 }}>
              {featured.title}
            </div>
          </div>
        </div>
        <div style={{ padding: 16 }}>
          <div className="tm-text-body-lg">{featured.venue ?? `${featured.sport.name} 대회`}</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>
            {facts}
          </div>
        </div>
      </Card>
    </Link>
  );
}
