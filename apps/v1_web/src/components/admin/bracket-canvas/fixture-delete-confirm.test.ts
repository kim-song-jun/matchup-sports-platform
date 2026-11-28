import { describe, expect, it } from 'vitest';
import { makeFixture, makeGame } from '@/test/bracket-canvas-fixtures';
import { fixtureDeleteBlockedReason, fixtureDeleteConfirm } from './fixture-delete-confirm';

const fixture = makeFixture({ id: 'f1', groupId: 'g', fixtureNumber: 1, game: makeGame() });
const confirm = (target = fixture, fixtures = [target]) => fixtureDeleteConfirm({ title: '8강 1번 경기', fixture: target, fixtures });

describe('fixtureDeleteConfirm', () => {
  it('기본 문구는 되돌릴 수 없다는 것만 알린다', () => {
    expect(confirm()).toEqual({ title: '경기 삭제', message: '8강 1번 경기를 삭제할까요? 되돌릴 수 없어요.', confirmLabel: '삭제', tone: 'danger' });
  });

  it('후속 경기가 이 경기를 출처로 쓰면 그 수를 알린다(이 경기를 쓰지 않는 경기는 세지 않는다)', () => {
    const downstream = makeFixture({ id: 'f2', groupId: 'g', fixtureNumber: 2, bracketSources: [{ fixtureId: 'f1', side: 'HOME', outcome: 'WINNER' }] });
    const unrelated = makeFixture({ id: 'f3', groupId: 'g', fixtureNumber: 3, bracketSources: [{ fixtureId: 'other', side: 'HOME', outcome: 'WINNER' }] });
    expect(confirm(fixture, [fixture, downstream, unrelated]).message).toContain('후속 경기 1개도 영향을 받아요.');
  });

});

describe('fixtureDeleteBlockedReason', () => {
  it('결과도 진행도 없으면 지울 수 있다', () => {
    expect(fixtureDeleteBlockedReason(fixture)).toBeNull();
  });

  it.each([
    ['공식 결과', makeGame({ hasOfficialResult: true }), '결과가 있는 경기는 삭제할 수 없어요.'],
    ['진행 중', makeGame({ state: 'LIVE' }), '진행 중인 경기는 삭제할 수 없어요.'],
    ['일시 정지', makeGame({ state: 'PAUSED' }), '진행 중인 경기는 삭제할 수 없어요.'],
  ])('%s 경기는 서버가 거절하므로 이유를 돌려준다', (_name, game, reason) => {
    expect(fixtureDeleteBlockedReason(makeFixture({ id: 'f1', groupId: 'g', fixtureNumber: 1, game }))).toBe(reason);
  });
});
