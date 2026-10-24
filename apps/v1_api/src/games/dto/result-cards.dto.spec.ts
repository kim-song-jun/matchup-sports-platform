import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GameResultParticipantDto } from './game-result.dto';

const validateCards = (cards: unknown) => validate(plainToInstance(GameResultParticipantDto, {
  participantId: '11111111-1111-4111-8111-111111111111', sideId: '22222222-2222-4222-8222-222222222222',
  goals: 0, goalkeeper: false, cards,
}, { enableImplicitConversion: true }), { whitelist: true, forbidNonWhitelisted: true });

describe('result cards HTTP contract', () => {
  it('accepts aggregate-only cards and validated timed or untimed snapshots', async () => {
    for (const cards of [
      { yellow: 1, red: 0 },
      { yellow: 1, red: 1, events: [{ id: 'y', card: 'YELLOW', minute: 0, period: 1 }, { id: 'r', card: 'RED' }] },
      { yellow: 0, red: 0, events: [] },
    ]) expect(await validateCards(cards)).toEqual([]);
  });
  it.each([
    { yellow: -1, red: 0 },
    { yellow: 0, red: 0, events: [{ id: 'y', card: 'YELLOW' }] },
    { yellow: 1, red: 0, events: [{ id: 'y', card: 'YELLOW', minute: -1 }] },
    { yellow: 1, red: 0, events: [{ id: 'y', card: 'YELLOW', minute: 1.5 }] },
    { yellow: 1, red: 0, events: [{ id: 'y', card: 'YELLOW', minute: null }] },
    { yellow: 1, red: 0, events: [{ id: 'y', card: 'YELLOW', period: 0 }] },
    { yellow: 1, red: 0, events: [{ id: 'y', card: 'BLUE' }] },
    { yellow: 2, red: 0, events: [{ id: 'y', card: 'YELLOW' }, { id: 'y', card: 'YELLOW' }] },
    { yellow: 0, red: 0, events: null },
  ])('rejects malformed or inconsistent cards %j', async (cards) => {
    expect((await validateCards(cards)).length).toBeGreaterThan(0);
  });
});
