import Link from 'next/link';
import type { ReactNode } from 'react';
import { Trophy, LayoutGrid, Star, ChevronRight } from 'lucide-react';
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
  type TournamentVenuePrepItem,
} from './tournament-venue-retention-model';

export {
  getTournamentPostEventCards,
  getTournamentVenuePrepItems,
} from './tournament-venue-retention-model';

export function TournamentVenuePrepSection({
  venue,
  hasRules,
  minPlayers,
  maxPlayers,
  announcements,
}: {
  venue: string | null;
  hasRules: boolean;
  minPlayers: number;
  maxPlayers: number;
  announcements: TournamentAnnouncementSummary[];
}) {
  const items = getTournamentVenuePrepItems({
    venue,
    hasRules,
    minPlayers,
    maxPlayers,
    announcements,
  });

  return (
    <section aria-labelledby="venue-prep-heading" style={{ marginTop: 24 }}>
      <div id="venue-prep-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
        장소·준비 안내
      </div>
      <Card pad={16} style={{ marginTop: 4 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((item) => (
            <HubFactRow key={item.key} item={item} />
          ))}
        </div>
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

  return (
    <section aria-labelledby="post-event-heading" style={{ marginTop: 24 }}>
      <div id="post-event-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
        대회 후 허브
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {cards.map((card) => (
          <Card key={card.key} pad={16}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>
                  {card.title}
                </div>
                <div className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 3 }}>
                  {card.body}
                </div>
              </div>
              <StatusBadge status={card.status} />
            </div>
            {card.actionLabel && card.href ? (
              <Link href={card.href} className="tm-btn tm-btn-sm tm-btn-neutral" style={{ marginTop: 12 }}>
                {card.actionLabel}
              </Link>
            ) : null}
          </Card>
        ))}
      </div>
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
          <Link href={item.href} className="tm-btn tm-btn-sm tm-btn-neutral" style={{ marginTop: 8 }}>
            {item.actionLabel}
          </Link>
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
