import { presentTournamentCard } from './tournament-card.presenter';
import { presentTournamentDetail } from './tournament-detail.presenter';
import type { TournamentDetailRow, TournamentListRow } from './tournaments-read.query';

// 리그는 '미설정'과 '0원 무료 확정'이 다르고, 대회는 항상 설정된 것으로 본다. 입금 계좌는 어느 응답에도 없어야 한다.
const SECRET = { bankName: 'SENTINEL-BANK', bankAccount: 'SENTINEL-ACCOUNT-9901', bankHolder: 'SENTINEL-HOLDER' };

type Overrides = { kind: 'regular_league' | 'regular_tournament' | null; entryFeeConfiguredAt: Date | null; entryFee?: number };

function commonRow({ kind, entryFeeConfiguredAt, entryFee = 0 }: Overrides) {
  return {
    id: 'row-1', sportId: 'sport-1', sport: { code: 'futsal', name: '풋살' }, title: '제목', status: 'draft',
    format: 'league', kind, registrationDeadlineAt: null, rosterDeadlineAt: null, bracketPublishedAt: null,
    bracketPublishScheduledAt: null, scheduledAt: null, scheduledEndAt: null, venue: null, parkingInfo: null,
    latitude: null, longitude: null, coverImageUrl: null, teamCount: 8, minPlayers: 6, maxPlayers: 10,
    genderCategory: 'mixed', genderMinMale: null, genderMaxMale: null, genderMinFemale: null, genderMaxFemale: null,
    tier: 1, seasonNo: 1, seriesId: null, entryFee, entryFeeConfiguredAt, ...SECRET,
    rulesText: null, refundPolicyText: null, prizePool: null, prizeSummary: null, prizeBreakdown: null,
    promoHomeEnabled: false, promoListEnabled: false, promoHomePriority: 0, promoListPriority: 0,
    campaign: null, _count: { registrations: 0, reviews: 0 }, registrations: [], groups: [], announcements: [],
    sponsors: [], reviews: [], awards: [], tournamentMatchDetails: [],
    createdAt: new Date('2026-10-01T00:00:00Z'), updatedAt: new Date('2026-10-01T00:00:00Z'),
  };
}

const card = (overrides: Overrides) => presentTournamentCard(commonRow(overrides) as unknown as TournamentListRow);
const detail = (overrides: Overrides) =>
  presentTournamentDetail(commonRow(overrides) as unknown as TournamentDetailRow, true);

describe.each([
  ['목록 카드', card],
  ['대회 상세', detail],
])('%s — entryFeeConfigured', (_name, present) => {
  const configuredAt = new Date('2026-10-02T00:00:00Z');

  it('미설정 리그는 false', () => {
    expect(present({ kind: 'regular_league', entryFeeConfiguredAt: null }).entryFeeConfigured).toBe(false);
  });

  it('설정된 리그는 true — 0원 무료 확정도 true 이고 금액은 그대로 내려간다', () => {
    expect(present({ kind: 'regular_league', entryFeeConfiguredAt: configuredAt }).entryFeeConfigured).toBe(true);
    const paid = present({ kind: 'regular_league', entryFeeConfiguredAt: configuredAt, entryFee: 70000 });
    expect(paid).toMatchObject({ entryFeeConfigured: true, entryFee: 70000 });
  });

  it('대회는 설정 시각이 null 이어도 항상 true(kind null 인 옛 행 포함)', () => {
    expect(present({ kind: 'regular_tournament', entryFeeConfiguredAt: null }).entryFeeConfigured).toBe(true);
    expect(present({ kind: null, entryFeeConfiguredAt: null }).entryFeeConfigured).toBe(true);
  });

  it('행에 입금 계좌·설정 시각 원값이 있어도 응답에는 없다', () => {
    const json = JSON.stringify(present({ kind: 'regular_league', entryFeeConfiguredAt: configuredAt, entryFee: 1000 }));
    for (const value of Object.values(SECRET)) expect(json).not.toContain(value);
    expect(json).not.toContain('entryFeeConfiguredAt');
    expect(json).not.toContain(configuredAt.toISOString());
  });
});
