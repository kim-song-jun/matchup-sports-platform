import { http } from 'msw';
import { success, paged } from './_utils';
import { mockVenue, mockVenueScheduleSlot, mockVenueReview } from '../../fixtures/venues';

export const venuesHandlers = [
  http.get('/api/v1/venues', () => {
    return paged([mockVenue]);
  }),

  http.get('/api/v1/venues/:id', ({ params }) => {
    return success({ ...mockVenue, id: params.id as string });
  }),

  http.get('/api/v1/venues/:id/schedule', ({ params }) => {
    return success([{ ...mockVenueScheduleSlot, venueId: params.id as string }]);
  }),

  http.post('/api/v1/venues/:id/reviews', ({ params }) => {
    return success({ ...mockVenueReview, venueId: params.id as string });
  }),
];
