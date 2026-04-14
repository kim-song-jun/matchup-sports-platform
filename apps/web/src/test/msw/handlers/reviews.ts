import { http } from 'msw';
import { success, paged } from './_utils';
import { mockReview } from '../../fixtures/misc';

export const reviewsHandlers = [
  http.get('/api/v1/reviews', () => {
    return paged([mockReview]);
  }),

  http.post('/api/v1/reviews', () => {
    return success(mockReview);
  }),

  http.get('/api/v1/reviews/pending', () => {
    return success([
      {
        matchId: 'match-1',
        matchTitle: '주말 풋살 경기',
        target: { id: 'user-2', nickname: '상대유저', profileImageUrl: null },
      },
    ]);
  }),
];
