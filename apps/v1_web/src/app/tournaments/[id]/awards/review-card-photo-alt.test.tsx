import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { V1TournamentReview } from '@/types/api';
import { ReviewCard } from './awards-page-client';

const review = {
  id: 'review-1', authorId: 'author-1', authorNickname: '참가팀장', authorProfileImageUrl: null,
  teamName: '주말팀', rating: 5, comment: '운영이 원활했어요.', createdAt: '2026-10-01T16:30:00Z',
  photoUrls: ['/uploads/a.jpg', '/uploads/b.jpg'],
} as unknown as V1TournamentReview;

describe('후기 사진의 대체 텍스트', () => {
  it('사진 링크마다 누구의 몇 번째 사진인지 이름이 있다', () => {
    render(<ReviewCard review={review} />);
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.querySelector('img')?.getAttribute('alt'))).toEqual([
      '주말팀의 후기 사진 1/2',
      '주말팀의 후기 사진 2/2',
    ]);
  });

  it('팀 이름이 없으면 작성자 별명으로 적는다', () => {
    render(<ReviewCard review={{ ...review, teamName: null, photoUrls: ['/uploads/a.jpg'] }} />);
    expect(screen.getByAltText('참가팀장의 후기 사진 1/1')).toBeInTheDocument();
  });
});
