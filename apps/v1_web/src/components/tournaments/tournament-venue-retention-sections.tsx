import Link from 'next/link';
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
  status,
  fixtures,
  hasAnnouncements,
  sponsorCount,
  announcements,
}: {
  status: V1TournamentStatus;
  fixtures: V1TournamentFixture[];
  hasAnnouncements: boolean;
  sponsorCount?: number;
  announcements: TournamentAnnouncementSummary[];
}) {
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
