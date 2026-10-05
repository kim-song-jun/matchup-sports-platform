import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { V1TournamentCampaignListItem } from '@/types/tournament-campaign';
import { EventCampaignCard } from './event-campaign-card';
import { campaign } from './tournament-campaign-template.test-fixture';

function eventItem(
  overrides: Partial<V1TournamentCampaignListItem['tournament']> = {},
): V1TournamentCampaignListItem {
  const source = campaign('open');
  return {
    id: source.id,
    slug: source.slug,
    heroTitle: source.content.hero.title,
    heroSummary: source.content.hero.summary ?? null,
    heroImageUrl: source.content.hero.imageUrl ?? null,
    publishedAt: source.publishedAt ?? source.updatedAt,
    updatedAt: source.updatedAt,
    tournament: { ...source.tournament, ...overrides },
  };
}

describe('EventCampaignCard — 대표 배지와 신청 가능 상태', () => {
  it('마감일이 지난 0/4팀 대회는 카드와 접근성 이름 모두 모집 마감으로 표시해요', () => {
    render(<EventCampaignCard item={eventItem({
      registrationDeadlineAt: '2020-01-01T00:00:00.000Z',
      registrationAvailability: 'deadline_passed',
      confirmedCount: 0,
      teamCount: 4,
    })} />);

    expect(screen.getByText('모집 마감')).toHaveClass('tm-badge-grey');
    expect(screen.getByRole('link')).toHaveAccessibleName(/모집 마감/);
    expect(screen.queryByText('모집 중')).not.toBeInTheDocument();
    expect(screen.queryByText('오늘 신청 마감')).not.toBeInTheDocument();
  });

  it.each(['full', 'closed', 'started'] as const)('%s 사유로 신청할 수 없는 open 대회는 모집 마감이에요', (registrationAvailability) => {
    render(<EventCampaignCard item={eventItem({ registrationAvailability })} />);
    expect(screen.getByText('모집 마감')).toHaveClass('tm-badge-grey');
  });

  it.each([null, '2099-01-01T00:00:00.000Z'])('신청 가능한 대회는 마감일 %s에도 모집 중을 유지해요', (registrationDeadlineAt) => {
    render(<EventCampaignCard item={eventItem({ registrationDeadlineAt })} />);
    expect(screen.getByText('모집 중')).toHaveClass('tm-badge-blue');
  });

  it.each([
    ['closed', '마감'],
    ['in_progress', '진행 중'],
    ['completed', '종료'],
  ] as const)('마감일 경과가 실제 %s 상태를 덮지 않아요', (status, label) => {
    render(<EventCampaignCard item={eventItem({
      status,
      registrationAvailability: 'closed',
      registrationDeadlineAt: '2020-01-01T00:00:00.000Z',
    })} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText('모집 마감')).not.toBeInTheDocument();
  });
});
