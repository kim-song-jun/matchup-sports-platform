import { ValidationPipe } from '@nestjs/common';
import { TournamentListQueryDto } from './dto/tournament-read.dto';
import { presentTournamentCard } from './tournament-card.presenter';

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const parse = (input: Record<string, unknown>) => pipe.transform(input, { type: 'query', metatype: TournamentListQueryDto });
const now = new Date('2026-10-22T00:00:00Z');
type Row = Parameters<typeof presentTournamentCard>[0];
const card = (overrides: Record<string, unknown> = {}) => ({
  id: 'test', title: '대회', sportId: 'sport', sport: { code: 'futsal', name: '풋살' }, kind: 'regular_tournament',
  status: 'open', teamCount: 4, maxTeams: null, _count: { registrations: 1 }, registrations: [],
  registrationDeadlineAt: new Date(now.getTime() + 1), scheduledAt: null, scheduledEndAt: null,
  createdAt: now, updatedAt: now, ...overrides,
} as unknown as Row);

describe('목록 API 입력 검증', () => {
  it('모집·진행·기간·무료 조건과 총 건수 입력을 변환한다', async () => {
    await expect(parse({ kind: 'tournament', phase: 'upcoming', registration: 'open', dateFrom: '2026-11-01', feeMax: '0', withTotal: 'true' })).resolves.toMatchObject({ feeMax: 0, phase: 'upcoming', registration: 'open', withTotal: 'true' });
  });
  it.each([
    { phase: 'draft' }, { registration: 'yes' }, { sort: 'random' }, { format: 'unknown' },
    { feeMin: '-1' }, { feeMax: '3.5' }, { feeMax: '99999999999' },
    { dateFrom: '0000-01-01' }, { dateFrom: '2026-02-30' }, { dateTo: '2026-11-01T00:00:00Z' }, { withTotal: 'false' }, { arbitrary: 'value' },
  ])('잘못된 필터를 400으로 거절한다: %j', async (input) => {
    await expect(parse(input)).rejects.toMatchObject({ status: 400 });
  });
});

describe('목록 응답의 신규 신청 접수 판정', () => {
  it('마감 순간까지 열고 그 이후 닫는다', () => {
    expect(presentTournamentCard(card({ registrationDeadlineAt: now }), now).registrationOpen).toBe(true);
    expect(presentTournamentCard(card({ registrationDeadlineAt: new Date(now.getTime() - 1) }), now).registrationOpen).toBe(false);
  });
  it('입금 확인 중이 점유한 자리도 정원에 포함한다', () => {
    expect(presentTournamentCard(card({ _count: { registrations: 2 }, registrations: [{ status: 'payment_checking' }, { status: 'paid' }] }), now).registrationOpen).toBe(false);
    expect(presentTournamentCard(card({ _count: { registrations: 2 }, registrations: [{ status: 'payment_checking' }] }), now).registrationOpen).toBe(true);
  });
  it('대회와 리그 모두 접수 중이면 마감 미설정도 접수한다', () => {
    expect(presentTournamentCard(card({ registrationDeadlineAt: null }), now).registrationOpen).toBe(true);
    expect(presentTournamentCard(card({ kind: 'regular_league', registrationDeadlineAt: null }), now).registrationOpen).toBe(true);
  });
  it('리그도 접수 중일 때만 받는다 — 시작·보류·종료 상태는 마감이 남아도 닫는다', () => {
    expect(presentTournamentCard(card({ kind: 'regular_league', teamCount: 0 }), now).registrationOpen).toBe(true);
    expect(presentTournamentCard(card({ kind: 'regular_league', maxTeams: 1 }), now).registrationOpen).toBe(false);
    for (const status of ['draft', 'closed', 'in_progress', 'completed', 'cancelled', 'on_hold']) {
      expect(presentTournamentCard(card({ kind: 'regular_league', status }), now).registrationOpen).toBe(false);
    }
  });
});
