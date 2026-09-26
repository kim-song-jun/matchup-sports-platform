import { canConfirmTeamMatch, validateTeamMatchDates } from './team-match-dates';

const start = new Date(Date.now() + 86400000);
const past = new Date(Date.now() - 86400000);
describe('team/platform recruitment date contract', () => {
  it.each([past.toISOString(), start.toISOString(), 'invalid'])('rejects invalid deadline %s', (deadlineAt) => {
    expect(() => validateTeamMatchDates({ startsAt: start.toISOString(), deadlineAt })).toThrow();
  });
  it('accepts no deadline and a next-day end', () => {
    const end = new Date(start.getTime() + 86400000);
    expect(validateTeamMatchDates({ startsAt: start.toISOString(), endsAt: end.toISOString() }))
      .toEqual({ startsAt: start, endsAt: end, deadlineAt: null });
  });
  it('retains the exact elapsed deadline on edit without allowing a different elapsed deadline', () => {
    expect(validateTeamMatchDates({ startsAt: start.toISOString(), deadlineAt: past.toISOString() }, past).deadlineAt).toEqual(past);
    expect(() => validateTeamMatchDates({ startsAt: start.toISOString(), deadlineAt: new Date(past.getTime() - 60000).toISOString() }, past)).toThrow();
  });
  it.each(['invalid', past.toISOString(), start.toISOString()])('rejects invalid end %s', (endsAt) => {
    expect(() => validateTeamMatchDates({ startsAt: start.toISOString(), endsAt })).toThrow();
  });
  it('allows review only until kickoff and only while recruiting', () => {
    expect(canConfirmTeamMatch({ status: 'recruiting', startAt: start })).toBe(true);
    expect(canConfirmTeamMatch({ status: 'recruiting', startAt: past })).toBe(false);
    expect(canConfirmTeamMatch({ status: 'closed', startAt: start })).toBe(false);
    expect(canConfirmTeamMatch({ status: 'recruiting', startAt: null })).toBe(false);
  });
});
