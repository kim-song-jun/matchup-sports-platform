import { matchListGroup } from './match-list-group';

const AT = new Date('2026-10-21T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(AT.getTime() + offsetMs);
const host = { role: 'host', status: 'active' } as const;
const player = { role: 'participant', status: 'active' } as const;

function match(overrides: Partial<Parameters<typeof matchListGroup>[0]> = {}): Parameters<typeof matchListGroup>[0] {
  return {
    status: 'recruiting',
    startAt: at(24 * HOUR),
    endAt: at(26 * HOUR),
    deadlineAt: at(12 * HOUR),
    maxParticipants: 4,
    proceedConfirmedAt: null,
    participants: [host, player],
    ...overrides,
  } as Parameters<typeof matchListGroup>[0];
}

describe('matchListGroup — 개인 매치 공개 목록 묶음', () => {
  it.each([
    ['모집 중 · 정원 남음 · 마감 전', match(), 'open'],
    ['정원이 참', match({ participants: [host, player, player, player] }), 'scheduled'],
    ['주최자가 진행을 확정', match({ proceedConfirmedAt: at(-HOUR) }), 'scheduled'],
    ['마감이 지났는데 인원 부족(보류)', match({ deadlineAt: at(-HOUR) }), 'closed'],
    ['직접 마감', match({ status: 'closed' }), 'closed'],
    ['경기 중', match({ startAt: at(-HOUR), endAt: at(HOUR), proceedConfirmedAt: at(-2 * HOUR) }), 'live'],
    ['종료 시각이 지나 종료 확인 중', match({ startAt: at(-3 * HOUR), endAt: at(-HOUR), proceedConfirmedAt: at(-4 * HOUR) }), 'ended'],
    ['완료', match({ status: 'completed', startAt: at(-48 * HOUR) }), 'ended'],
    ['시작이 지나도록 인원이 모자라 열리지 못함', match({ startAt: at(-HOUR), endAt: at(HOUR) }), 'ended'],
  ] as const)('%s → %s', (_, value, expected) => {
    expect(matchListGroup(value, AT)).toBe(expected);
  });

  it('노쇼는 진행 판정에는 세지만 정원 판정에는 세지 않는다(카드와 같은 기준)', () => {
    const withNoShow = match({ participants: [host, player, player, { role: 'participant', status: 'no_show' }] });
    expect(matchListGroup(withNoShow, AT)).toBe('open');
  });
});
