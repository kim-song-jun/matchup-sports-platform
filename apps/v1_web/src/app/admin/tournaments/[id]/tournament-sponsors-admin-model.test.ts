import { describe, expect, it } from 'vitest';
import {
  emptySponsorForm,
  formFromSponsor,
  sponsorPayloadFromForm,
} from './tournament-sponsors-admin-model';
import type { V1AdminTournamentSponsor } from '@/types/api';

describe('tournament sponsor admin model', () => {
  it('hydrates an edit form from an existing sponsor row', () => {
    const form = formFromSponsor(sponsorRow({
      name: '서울 스포츠랩',
      benefitText: '리뷰 참여자 선물',
      isActive: false,
      sortOrder: 7,
    }));

    expect(form).toMatchObject({
      name: '서울 스포츠랩',
      benefitText: '리뷰 참여자 선물',
      isActive: false,
      sortOrder: '7',
    });
  });

  it('omits empty optional fields for create but sends empty fields for update clearing', () => {
    const form = {
      ...emptySponsorForm,
      name: ' 서울 스포츠랩 ',
      benefitText: '',
      isActive: false,
      sortOrder: '5',
    };

    expect(sponsorPayloadFromForm(form, 'create')).toMatchObject({
      name: '서울 스포츠랩',
      isActive: false,
      sortOrder: 5,
    });
    expect(sponsorPayloadFromForm(form, 'create')).not.toHaveProperty('benefitText');
    expect(sponsorPayloadFromForm(form, 'update')).toMatchObject({
      name: '서울 스포츠랩',
      benefitText: '',
      isActive: false,
      sortOrder: 5,
    });
  });
});

function sponsorRow(overrides: Partial<V1AdminTournamentSponsor>): V1AdminTournamentSponsor {
  return {
    id: 'sponsor-1',
    tournamentId: 'tournament-1',
    name: '서울 스포츠랩',
    description: null,
    logoUrl: null,
    websiteUrl: null,
    instagramUrl: null,
    benefitText: null,
    boothText: null,
    eventTitle: null,
    eventDescription: null,
    eventResultText: null,
    sortOrder: 0,
    isActive: true,
    createdAt: '2026-06-14T00:00:00.000Z',
    updatedAt: '2026-06-14T00:00:00.000Z',
    ...overrides,
  };
}
