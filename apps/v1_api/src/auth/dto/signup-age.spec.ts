import { isSignupAgeEligible } from './required-signup-profile.dto';
describe('signup age boundary', () => {
  const now = new Date('2026-09-19T00:00:00Z');
  it.each([['20120919', true], ['20120920', false], ['20260919', false], ['20270919', false], ['20120230', false], ['19950115', true]])('%s eligibility %s', (date, expected) => {
    expect(isSignupAgeEligible(date as string, now)).toBe(expected);
  });
  it('waits until March 1 for a leap-day birthday in a non-leap year', () => {
    expect(isSignupAgeEligible('20120229', new Date('2026-02-28T23:59:59Z'))).toBe(false);
    expect(isSignupAgeEligible('20120229', new Date('2026-03-01T00:00:00Z'))).toBe(true);
  });
});
