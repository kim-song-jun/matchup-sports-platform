import { describe, expect, it } from 'vitest';
import { applyDemoCommand, createDemoState, demoScore, encodeDemoSession, replayDemoSession, type DemoCommand, type DemoState } from './tournament-ops-demo';

function prepared() {
  const commands: DemoCommand[] = [
    { role: 'director', type: 'settings', title: '업체 체험컵', venue: '체험 코트' },
    ...['blue', 'orange', 'green', 'white'].map((teamId): DemoCommand => ({ role: 'director', type: 'confirm', teamId })),
    { role: 'director', type: 'generate' },
  ];
  return { commands, state: commands.reduce(applyDemoCommand, createDemoState()) };
}
function played() {
  const { state: seeded, commands: initial } = prepared();
  const commands: DemoCommand[] = [
    ...initial,
    { role: 'recorder', type: 'lineup', fixtureId: 'semi-1' },
    { role: 'recorder', type: 'start', fixtureId: 'semi-1' },
    { role: 'recorder', type: 'event', fixtureId: 'semi-1', event: { teamId: 'blue', playerId: 'blue-1', kind: 'goal', minute: 2 } },
    { role: 'recorder', type: 'end', fixtureId: 'semi-1' },
  ];
  return { commands, state: commands.slice(initial.length).reduce(applyDemoCommand, seeded) };
}

describe('독립 운영 체험 모델', () => {
  it('준비→4팀 확정→3경기 생성, 원본 상태를 변경하지 않는다', () => {
    const original = createDemoState(); const { state } = prepared();
    expect(state.fixtures.map((f) => [f.id, f.home, f.away])).toEqual([
      ['semi-1', 'blue', 'orange'], ['semi-2', 'green', 'white'], ['final', null, null],
    ]);
    expect(original).toEqual(createDemoState());
  });
  it('준비·참가 확정·라인업·진출팀 없이 다음 작업을 할 수 없다', () => {
    expect(() => applyDemoCommand(createDemoState(), { role: 'director', type: 'confirm', teamId: 'blue' })).toThrow('먼저');
    expect(() => applyDemoCommand(createDemoState(), { role: 'director', type: 'generate' })).toThrow('4팀');
    expect(() => applyDemoCommand(prepared().state, { role: 'recorder', type: 'start', fixtureId: 'semi-1' })).toThrow('라인업');
    expect(() => applyDemoCommand(prepared().state, { role: 'director', type: 'lineup', fixtureId: 'final' })).toThrow('진출팀');
  });
  it('기록 담당자는 배정 경기만 조작하고 참가자는 상태를 바꿀 수 없다', () => {
    const { state } = prepared();
    expect(() => applyDemoCommand(state, { role: 'recorder', type: 'lineup', fixtureId: 'semi-2' })).toThrow('배정된');
    expect(() => applyDemoCommand(state, { role: 'recorder', type: 'generate' })).toThrow('디렉터');
    expect(() => applyDemoCommand(state, { role: 'participant', type: 'lineup', fixtureId: 'semi-1' })).toThrow('참가자');
    expect(() => applyDemoCommand(played().state, { role: 'recorder', type: 'officialize', fixtureId: 'semi-1' })).toThrow('디렉터');
  });
  it('종료·검토 후 확정한 승리팀만 결승에 반영한다', () => {
    const { state } = played();
    expect(state.fixtures[2].home).toBeNull();
    const official = applyDemoCommand(state, { role: 'director', type: 'officialize', fixtureId: 'semi-1' });
    expect(official.fixtures[0]).toMatchObject({ status: 'official', winner: 'blue' });
    expect(official.fixtures[2].home).toBe('blue');
    expect(demoScore(official.fixtures[0], 'blue')).toBe(1);
    expect(() => applyDemoCommand(official, { role: 'director', type: 'undo', fixtureId: 'semi-1' })).toThrow('진행 중');
    expect(applyDemoCommand(official, { role: 'director', type: 'award', playerId: 'blue-1' }).awardPlayerId).toBe('blue-1');
  });
  it('동점일 때 선택한 승부차기 승리팀만 진출한다', () => {
    let state = prepared().state;
    for (const type of ['lineup', 'start', 'end'] as const) state = applyDemoCommand(state, { role: 'director', type, fixtureId: 'semi-1' });
    expect(() => applyDemoCommand(state, { role: 'director', type: 'officialize', fixtureId: 'semi-1' })).toThrow('승부차기');
    expect(() => applyDemoCommand(state, { role: 'director', type: 'officialize', fixtureId: 'semi-1', winnerTeamId: 'white' })).toThrow('승부차기');
    expect(applyDemoCommand(state, { role: 'director', type: 'officialize', fixtureId: 'semi-1', winnerTeamId: 'orange' }).fixtures[2].home).toBe('orange');
  });
  it('잘못된 선수·시각 기록을 거부하고 취소는 실제 점수를 되돌린다', () => {
    const replay = played();
    const live = replay.commands.slice(0, -1).reduce(applyDemoCommand, createDemoState());
    const event = { teamId: 'blue', playerId: 'white-1', kind: 'goal' as const, minute: 1 };
    expect(() => applyDemoCommand(live, { role: 'recorder', type: 'event', fixtureId: 'semi-1', event })).toThrow('참가 선수');
    expect(() => applyDemoCommand(live, { role: 'recorder', type: 'event', fixtureId: 'semi-1', event: { ...event, playerId: 'blue-1', minute: NaN } })).toThrow('시각');
    expect(demoScore(applyDemoCommand(live, { role: 'recorder', type: 'undo', fixtureId: 'semi-1' }).fixtures[0], 'blue')).toBe(0);
  });
  it('명령 이력을 재생해 동일 상태로 복원하며 별도 세션과 공유하지 않는다', () => {
    const { state, commands } = played();
    expect(replayDemoSession(encodeDemoSession(commands)).state).toEqual(state);
    expect(replayDemoSession(null).state).toEqual(createDemoState());
    const another: DemoState = prepared().state;
    expect(another.fixtures[0].events).toEqual([]);
  });
  it.each(['not json', '{"version":2,"commands":[]}', '{"version":1,"commands":[null]}', '{"version":1,"commands":[{"role":"director","type":"fake"}]}'])(
    '손상된 저장 이력을 성공처럼 초기화하지 않는다: %s', (raw) => expect(() => replayDemoSession(raw)).toThrow(),
  );
  it('200개 초과 작업과 과도한 저장 데이터를 거부한다', () => {
    expect(() => encodeDemoSession(Array(201).fill({ role: 'director', type: 'generate' }))).toThrow('200개');
    expect(() => replayDemoSession(' '.repeat(100_001))).toThrow('너무 커');
  });
});
