import Link from 'next/link';
import type { ReactNode } from 'react';
import { Trophy, LayoutGrid, Star, ChevronRight, Video, Gift, Search } from 'lucide-react';
import { Card } from '@/components/v1-ui/primitives';
import type {
  V1TournamentFixture,
  V1TournamentStatus,
} from '@/types/api';
import {
  getTournamentPostEventCards,
  getTournamentVenuePrepItems,
  type HubState,
  type TournamentAnnouncementSummary,
  type TournamentPostEventCard,
  type TournamentVenuePrepItem,
} from './tournament-venue-retention-model';
import { TournamentVenueMap } from './tournament-venue-map';
import { TournamentVenueNavigationButton } from './tournament-venue-navigation-button';

export {
  getTournamentPostEventCards,
  getTournamentVenuePrepItems,
} from './tournament-venue-retention-model';

export function TournamentVenuePrepSection({
  venue,
  announcements,
  latitude = null,
  longitude = null,
}: {
  venue: string | null;
  announcements: TournamentAnnouncementSummary[];
  /** 카카오 지오코딩 좌표. 둘 다 있을 때만 지도 임베드 + 내비게이션 버튼을 보여준다. */
  latitude?: number | null;
  longitude?: number | null;
}) {
  const items = getTournamentVenuePrepItems({ venue, announcements, latitude, longitude });
  const hasCoordinates = venue !== null && latitude !== null && longitude !== null;

  return (
    <section aria-labelledby="venue-prep-heading" style={{ marginTop: 24 }}>
      <div id="venue-prep-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
        현장 안내
      </div>
      <Card pad={16} style={{ marginTop: 4 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((item) => (
            <HubFactRow key={item.key} item={item} />
          ))}
        </div>
        {hasCoordinates ? (
          <>
            <TournamentVenueMap venue={venue} latitude={latitude} longitude={longitude} />
            <TournamentVenueNavigationButton venue={venue} latitude={latitude} longitude={longitude} />
          </>
        ) : null}
      </Card>
    </section>
  );
}

export function TournamentPostEventHubSection({
  tournamentId,
  status,
  fixtures,
  hasAnnouncements,
  sponsorCount,
  announcements,
}: {
  tournamentId: string;
  status: V1TournamentStatus;
  fixtures: V1TournamentFixture[];
  hasAnnouncements: boolean;
  sponsorCount?: number;
  announcements: TournamentAnnouncementSummary[];
}) {
  // completed: verbose 5카드 대신 Toss식 컴팩트 액션 리스트로 대체(스크롤·복잡도 축소).
  if (status === 'completed') {
    return <TournamentCompletedActionList tournamentId={tournamentId} />;
  }

  // draft/open/closed: 대회가 아직 시작도 안 했는데 "대회 후" 콘텐츠를 보여줄 단계가
  // 아니다 — 예전엔 이 상태에서도 전부 "준비 중"인 5카드를 그대로 노출해 혼란을 줬다.
  if (status !== 'in_progress') {
    return null;
  }

  const hasCompletedFixture = fixtures.some(
    (fixture) => fixture.status === 'completed' && fixture.result !== null,
  );
  const cards = getTournamentPostEventCards({
    status,
    hasCompletedFixture,
    hasAnnouncements,
    sponsorCount,
    announcements,
  });

  // in_progress: "준비 중"(upcoming)·"공지 대기"(operator_update) 같은 빈 placeholder는
  // 숨기고, 실제로 확인할 거리가 있는(available) 항목만 컴팩트 리스트로 노출한다.
  // "다음 대회"는 상태 무관 항상 available이라 완료 리스트(TournamentCompletedActionList)와
  // 동일하게 절제 원칙상 제외. 아무것도 없으면(경기 결과·공지 전무) 섹션째 숨긴다 — 조별
  // 순위·대진표는 이미 같은 페이지 다른 섹션에서 보여주고 있어 여기서 반복하지 않는다.
  const availableCards = cards.filter((card) => card.status === 'available' && card.key !== 'next_tournament');
  if (availableCards.length === 0) return null;

  return <PostEventActionList heading="대회 현황" cards={availableCards} />;
}

const POST_EVENT_CARD_ICON: Record<TournamentPostEventCard['key'], ReactNode> = {
  results: <Trophy size={18} strokeWidth={2} aria-hidden="true" />,
  video: <Video size={18} strokeWidth={2} aria-hidden="true" />,
  reviews: <Star size={18} strokeWidth={2} aria-hidden="true" />,
  sponsor: <Gift size={18} strokeWidth={2} aria-hidden="true" />,
  next_tournament: <Search size={18} strokeWidth={2} aria-hidden="true" />,
};

/** completed 전용 리스트(TournamentCompletedActionList)와 동일한 hairline-row 스타일 공유. */
function PostEventActionList({ heading, cards }: { heading: string; cards: TournamentPostEventCard[] }) {
  return (
    <section aria-labelledby="post-event-heading" style={{ marginTop: 24 }}>
      <div id="post-event-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
        {heading}
      </div>
      <Card pad={0} style={{ overflow: 'hidden' }}>
        {cards.map((card, idx) => (
          <Link
            key={card.key}
            href={card.href ?? '#'}
            className="tm-list-row-interactive tm-pressable"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              minHeight: 60,
              padding: '12px 16px',
              borderBottom: idx < cards.length - 1 ? '1px solid var(--border)' : 'none',
              textDecoration: 'none',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                flexShrink: 0,
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'var(--blue50)',
                color: 'var(--blue500)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {POST_EVENT_CARD_ICON[card.key]}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>
                {card.title}
              </div>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 1 }}>
                {card.body}
              </div>
            </div>
            <ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" style={{ color: 'var(--text-caption)', flexShrink: 0 }} />
          </Link>
        ))}
      </Card>
    </section>
  );
}

type CompletedActionItem = {
  key: string;
  label: string;
  caption: string;
  href: string;
  icon: ReactNode;
};

/**
 * completed 전용 Toss식 컴팩트 액션 리스트 — 결과·시상 / 대진표·조별 순위 / 후기·매너 평가
 * 3개 행을 하나의 Card에 hairline 구분선으로 묶는다. 각 row 전체가 링크(44px+ 터치 타겟).
 * 하이라이트 영상 "준비 중"·협찬 "공지 대기" 같은 빈 placeholder는 제거하고, "다음 대회" 링크도
 * Toss 절제 원칙에 따라 생략했다(핵심 3개 행만 유지).
 */
function TournamentCompletedActionList({ tournamentId }: { tournamentId: string }) {
  const items: CompletedActionItem[] = [
    {
      key: 'results',
      label: '최종 결과·시상',
      caption: '최종 순위와 시상 내역을 확인해요',
      href: `/tournaments/${tournamentId}/results`,
      icon: <Trophy size={18} strokeWidth={2} aria-hidden="true" />,
    },
    {
      key: 'bracket',
      label: '대진표·조별 순위',
      caption: '전체 경기 기록과 순위를 확인해요',
      href: `/tournaments/${tournamentId}/bracket`,
      icon: <LayoutGrid size={18} strokeWidth={2} aria-hidden="true" />,
    },
    {
      key: 'reviews',
      label: '후기·매너 평가',
      caption: '함께한 팀에게 리뷰를 남겨요',
      href: '/my/reviews',
      icon: <Star size={18} strokeWidth={2} aria-hidden="true" />,
    },
  ];

  return (
    <section aria-labelledby="post-event-heading" style={{ marginTop: 24 }}>
      <div id="post-event-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
        대회 후 더보기
      </div>
      <Card pad={0} style={{ overflow: 'hidden' }}>
        {items.map((item, idx) => (
          <Link
            key={item.key}
            href={item.href}
            className="tm-list-row-interactive tm-pressable"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              minHeight: 60,
              padding: '12px 16px',
              borderBottom: idx < items.length - 1 ? '1px solid var(--border)' : 'none',
              textDecoration: 'none',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                flexShrink: 0,
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'var(--blue50)',
                color: 'var(--blue500)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {item.icon}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>
                {item.label}
              </div>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 1 }}>
                {item.caption}
              </div>
            </div>
            <ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" style={{ color: 'var(--text-caption)', flexShrink: 0 }} />
          </Link>
        ))}
      </Card>
    </section>
  );
}

function HubFactRow({ item }: { item: TournamentVenuePrepItem }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr auto', gap: 10, alignItems: 'start' }}>
      <div className="tm-text-caption" style={{ color: 'var(--text-caption)', paddingTop: 2 }}>
        {item.label}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>
          {item.value}
        </div>
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 2 }}>
          {item.detail}
        </div>
        {item.actionLabel && item.href ? (
          item.hrefExternal ? (
            <a
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="tm-btn tm-btn-sm tm-btn-neutral"
              style={{ marginTop: 8 }}
            >
              {item.actionLabel}
            </a>
          ) : (
            <Link href={item.href} className="tm-btn tm-btn-sm tm-btn-neutral" style={{ marginTop: 8 }}>
              {item.actionLabel}
            </Link>
          )
        ) : null}
        {item.notice ? (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <div className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {item.notice.summary}
            </div>
            <Link
              href={item.notice.href}
              className="tm-text-caption"
              style={{ color: 'var(--blue500)', fontWeight: 600, marginTop: 2, display: 'inline-block' }}
            >
              {item.notice.actionLabel}
            </Link>
          </div>
        ) : null}
      </div>
      <StatusBadge status={item.status} />
    </div>
  );
}

function StatusBadge({ status }: { status: HubState }) {
  const label = getStatusLabel(status);
  const badgeClass = status === 'confirmed' || status === 'available' ? 'tm-badge-blue' : 'tm-badge-grey';

  return (
    <span className={`tm-badge ${badgeClass}`} style={{ whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

function getStatusLabel(status: HubState): string {
  switch (status) {
    case 'confirmed':
      return '확정';
    case 'available':
      return '확인 가능';
    case 'operator_update':
      return '공지 대기';
    case 'upcoming':
      return '준비 중';
  }
}
