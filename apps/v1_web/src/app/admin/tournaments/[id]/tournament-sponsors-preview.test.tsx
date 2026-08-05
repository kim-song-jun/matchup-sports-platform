import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { V1AdminTournamentSponsor } from '@/types/api';
import { TournamentSponsorsPreview } from './tournament-sponsors-preview';

function sponsor(overrides: Partial<V1AdminTournamentSponsor> = {}): V1AdminTournamentSponsor {
  return {
    id: 'sponsor-1',
    tournamentId: 'tournament-1',
    name: '서울 스포츠랩',
    description: '풋살 장비 파트너',
    logoUrl: '/uploads/2026/08/sportslab.webp',
    websiteUrl: 'https://sportslab.example.com',
    instagramUrl: null,
    benefitText: '참가팀 유니폼 할인',
    boothText: '본부석 옆 체험 부스',
    eventTitle: '매너 리뷰 이벤트',
    eventDescription: '경기 후 리뷰를 작성해 주세요.',
    eventResultText: null,
    sortOrder: 0,
    isActive: true,
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-04T00:00:00.000Z',
    ...overrides,
  };
}

describe('TournamentSponsorsPreview', () => {
  it('renders the same embedded sponsor facts used by the campaign', () => {
    render(<TournamentSponsorsPreview sponsors={[sponsor()]} />);
    const preview = screen.getByRole('region', { name: '캠페인 협찬 미리보기' });

    expect(within(preview).getByRole('heading', { name: '공식 파트너' })).toBeInTheDocument();
    expect(within(preview).getByText('서울 스포츠랩')).toBeInTheDocument();
    expect(within(preview).getByText('참가팀 유니폼 할인')).toBeInTheDocument();
    expect(within(preview).getByText('본부석 옆 체험 부스')).toBeInTheDocument();
    expect(within(preview).getByRole('link', { name: '홈페이지' })).toHaveAttribute(
      'href',
      'https://sportslab.example.com',
    );
  });

  it('excludes private sponsors and shows the real campaign empty state', () => {
    render(<TournamentSponsorsPreview sponsors={[sponsor({ isActive: false })]} />);

    expect(screen.queryByText('서울 스포츠랩')).not.toBeInTheDocument();
    expect(screen.getByText('공식 후원사를 준비하고 있어요')).toBeInTheDocument();
  });
});
