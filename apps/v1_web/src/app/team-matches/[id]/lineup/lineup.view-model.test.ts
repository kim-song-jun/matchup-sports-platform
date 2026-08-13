import { describe, expect, it } from 'vitest';
import { createEmptyLineupEditorState, replaceEntries } from './lineup.view-model';

function loaded(overrides: Partial<{
  userId: string | null;
  displayName: string;
  jerseyNumber: number | null;
  position: string | null;
  positionX: number | null;
  positionY: number | null;
  started: boolean;
  goalkeeper: boolean;
}> = {}) {
  return {
    userId: 'u1',
    displayName: '홍길동',
    jerseyNumber: null,
    position: null,
    positionX: null,
    positionY: null,
    started: true,
    goalkeeper: false,
    ...overrides,
  };
}

/**
 * replaceEntries는 명단을 통째로 갈아끼우는 유일한 함수다 — 잘못 동작하면 팀장이 짜 놓은
 * 명단이 소리 없이 어긋난 상태로 저장된다.
 */
describe('replaceEntries', () => {
  it('선발과 후보를 started 플래그대로 나눠 담는다', () => {
    const next = replaceEntries(
      createEmptyLineupEditorState(3),
      [loaded({ userId: 'u1', started: true }), loaded({ userId: 'u2', displayName: '김철수', started: false })],
      { formation: null, keepPlacement: true },
    );

    expect(next.starters.map((entry) => entry.userId)).toEqual(['u1']);
    expect(next.bench.map((entry) => entry.userId)).toEqual(['u2']);
  });

  it('기존 명단은 남기지 않고 통째로 교체한다', () => {
    const before = replaceEntries(
      createEmptyLineupEditorState(3),
      [loaded({ userId: 'old', displayName: '예전선수' })],
      { formation: null, keepPlacement: true },
    );
    const after = replaceEntries(before, [loaded({ userId: 'u1' })], { formation: null, keepPlacement: true });

    expect([...after.starters, ...after.bench].map((entry) => entry.userId)).toEqual(['u1']);
  });

  it('CAS 토큰(baseRevision)은 건드리지 않는다 — 불러오기는 서버 상태와 무관하다', () => {
    const next = replaceEntries(createEmptyLineupEditorState(7), [loaded()], {
      formation: null,
      keepPlacement: true,
    });

    expect(next.baseRevision).toBe(7);
  });

  it('배치를 유지하면 좌표·포지션·포메이션이 그대로 살아난다', () => {
    const next = replaceEntries(
      createEmptyLineupEditorState(0),
      [loaded({ position: 'MF', positionX: 40, positionY: 70, jerseyNumber: 7 })],
      { formation: '4-4-2', keepPlacement: true },
    );

    expect(next.starters[0]).toMatchObject({ position: 'MF', positionX: 40, positionY: 70, jerseyNumber: 7 });
    expect(next.formation).toBe('4-4-2');
  });

  it('종목이 다르면 배치를 버리고 명단 구성만 가져온다', () => {
    const next = replaceEntries(
      createEmptyLineupEditorState(0),
      [loaded({ position: 'PIVO', positionX: 40, positionY: 70, jerseyNumber: 7 })],
      { formation: '1-2-1', keepPlacement: false },
    );

    expect(next.starters[0]).toMatchObject({ position: null, positionX: null, positionY: null });
    expect(next.formation).toBeNull();
    // 명단과 등번호는 살아 있다.
    expect(next.starters[0].jerseyNumber).toBe(7);
  });

  it('후보에게는 골키퍼 표시도 좌표도 남지 않는다', () => {
    const next = replaceEntries(
      createEmptyLineupEditorState(0),
      [loaded({ started: false, goalkeeper: true, positionX: 50, positionY: 6 })],
      { formation: null, keepPlacement: true },
    );

    expect(next.bench[0]).toMatchObject({ goalkeeper: false, positionX: null, positionY: null });
  });

  it('불러오면 저장해야 할 변경으로 표시된다', () => {
    const next = replaceEntries(createEmptyLineupEditorState(0), [loaded()], {
      formation: null,
      keepPlacement: true,
    });

    expect(next.dirty).toBe(true);
  });

  it('게스트(userId 없음)도 이름을 지닌 채 명단에 들어간다', () => {
    const next = replaceEntries(
      createEmptyLineupEditorState(0),
      [loaded({ userId: null, displayName: '용병친구' })],
      { formation: null, keepPlacement: true },
    );

    expect(next.starters[0]).toMatchObject({ userId: null, displayName: '용병친구' });
  });
});
