import { describe, expect, it } from 'vitest';
import {
  countAt,
  railFill,
  sceneFromProgress,
  sceneScrollOffset,
  stagePhoneSize,
  stageProgress,
  stepState,
  viewTimelineProgress,
} from './landing-v4-motion';

describe('고정 무대 진행도', () => {
  it('섹션 윗변이 화면 위로 올라간 만큼을 스크롤 범위로 나누고 0~1 로 자른다', () => {
    expect(stageProgress(100, 1000)).toBe(0);
    expect(stageProgress(-250, 1000)).toBe(0.25);
    expect(stageProgress(-5000, 1000)).toBe(1);
  });

  it('진행도를 장면 5개로 나누고, 끝(1)은 마지막 장면에 머문다', () => {
    expect([0, 0.19, 0.2, 0.59, 0.61, 0.99, 1].map((p) => sceneFromProgress(p))).toEqual([0, 0, 1, 2, 3, 4, 4]);
  });

  it('레일은 앞 칸부터 차례로 찬다', () => {
    expect([0, 1, 2].map((k) => railFill(0.3, k))).toEqual([1, expect.closeTo(0.5, 5), 0]);
  });

  it('장면 탭은 그 장면 구간 안쪽으로 보내 반올림 오차로 앞 장면이 걸리지 않는다', () => {
    const range = 4000;
    for (let k = 0; k < 5; k += 1) {
      expect(sceneFromProgress(sceneScrollOffset(k, range) / range)).toBe(k);
    }
  });

  it('폰은 1024+ 에서 고정 영역 높이를, 그 아래에서는 높이의 52% 를 따른다', () => {
    expect(stagePhoneSize(1440, 900)).toEqual({ dw: 300, dh: 620 });
    expect(stagePhoneSize(1440, 640)).toEqual({ dw: 263, dh: 544 });
    const mobile = stagePhoneSize(390, 784);
    expect(mobile.dh).toBe(407);
    expect(mobile.dh).toBeLessThanOrEqual(784 * 0.52);
  });
});

describe('viewTimelineProgress — CSS animation-range 와 같은 값', () => {
  const vh = 800;

  it('entry 0%~100%: 윗변이 화면 아래에 닿을 때 0, 요소가 다 들어오면 1', () => {
    expect(viewTimelineProgress(800, 400, vh, 'entry 0% entry 100%')).toBe(0);
    expect(viewTimelineProgress(600, 400, vh, 'entry 0% entry 100%')).toBe(0.5);
    expect(viewTimelineProgress(400, 400, vh, 'entry 0% entry 100%')).toBe(1);
  });

  it('화면보다 큰 요소의 entry 끝은 윗변이 화면 위에 닿을 때다', () => {
    expect(viewTimelineProgress(0, 1200, vh, 'entry 0% entry 100%')).toBe(1);
    expect(viewTimelineProgress(400, 1200, vh, 'entry 0% entry 100%')).toBe(0.5);
  });

  it('cover 는 화면에 들어올 때부터 완전히 나갈 때까지다', () => {
    expect(viewTimelineProgress(800, 400, vh, 'cover 0% cover 100%')).toBe(0);
    expect(viewTimelineProgress(200, 400, vh, 'cover 0% cover 100%')).toBe(0.5);
    expect(viewTimelineProgress(-400, 400, vh, 'cover 0% cover 100%')).toBe(1);
  });

  it('모르는 범위 문자열은 조용히 0 으로 두지 않고 던진다', () => {
    expect(() => viewTimelineProgress(0, 100, vh, 'exit 0% exit 100%')).toThrow();
  });
});

describe('3단계 연결선', () => {
  it('첫 선은 앞 절반, 둘째 선은 뒤 절반에 그려지고 단계는 선이 다 닿아야 켜진다', () => {
    expect(stepState(0, 0)).toEqual({ line: 0, reached: false });
    expect(stepState(0.25, 0)).toEqual({ line: 0.5, reached: true });
    expect(stepState(0.25, 1)).toEqual({ line: 0, reached: false });
    expect(stepState(0.5, 1).reached).toBe(true);
    expect(stepState(0.9, 2).reached).toBe(false);
    expect(stepState(1, 1)).toEqual({ line: 1, reached: true });
    expect(stepState(1, 2).reached).toBe(true);
  });
});

describe('카운트업', () => {
  it('0 에서 시작해 끝에서 정확히 목표값이 된다', () => {
    expect(countAt(43, 0, 1500)).toBe(0);
    expect(countAt(43, 750, 1500)).toBeGreaterThan(30);
    expect(countAt(43, 1500, 1500)).toBe(43);
    expect(countAt(43, 9999, 1500)).toBe(43);
  });
});
