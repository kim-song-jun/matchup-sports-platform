import { describe, expect, it } from 'vitest';
import {
  CROP_MAX_ZOOM_FACTOR,
  clampCropState,
  cropSourceRect,
  cropStateAtZoomFraction,
  initialCropState,
  minCoverScale,
  panCropState,
  zoomCropStateAround,
  zoomFractionOf,
} from './image-crop';

const V = 300;
const PORTRAIT = { width: 900, height: 1200 }; // 3:4 폰 사진
const LANDSCAPE = { width: 1200, height: 900 };
const TALL = { width: 900, height: 1600 }; // 9:16 세로 촬영

/** 불변식: 이미지가 뷰포트를 빈 곳 없이 덮는다. */
function coversViewport(state: { scale: number; x: number; y: number }, image: { width: number; height: number }) {
  expect(state.x).toBeLessThanOrEqual(0);
  expect(state.y).toBeLessThanOrEqual(0);
  expect(state.x + image.width * state.scale).toBeGreaterThanOrEqual(V - 1e-6);
  expect(state.y + image.height * state.scale).toBeGreaterThanOrEqual(V - 1e-6);
}

describe('minCoverScale', () => {
  it('짧은 변이 뷰포트를 채우는 배율이다', () => {
    expect(minCoverScale(PORTRAIT, V)).toBeCloseTo(300 / 900);
    expect(minCoverScale(LANDSCAPE, V)).toBeCloseTo(300 / 900);
  });
});

describe('initialCropState', () => {
  it('긴 세로 사진은 위쪽 32% 지점(얼굴 자리)이 뷰포트 중앙에 온다', () => {
    const s = initialCropState(TALL, V);
    coversViewport(s, TALL);
    const focusYInViewport = s.y + TALL.height * 0.32 * s.scale;
    expect(focusYInViewport).toBeCloseTo(V / 2, 5);
    // 가로는 중앙
    expect(s.x + TALL.width * 0.5 * s.scale).toBeCloseTo(V / 2, 5);
  });

  it('3:4 사진은 1.15배에서 32% 지점이 중앙까지 못 올라와 위 가장자리에 붙는다(덮기 불변식이 이긴다)', () => {
    const s = initialCropState(PORTRAIT, V);
    coversViewport(s, PORTRAIT);
    // 그려진 높이 460px 의 32% = 147px < 150px -- 3px 차이라 화면상 차이는 없다.
    expect(s.y).toBe(0);
    expect(s.x + PORTRAIT.width * 0.5 * s.scale).toBeCloseTo(V / 2, 5);
  });

  it('가로 사진은 초점이 위로 못 올라가면 위 가장자리에 붙는다(덮기 불변식이 이긴다)', () => {
    const s = initialCropState(LANDSCAPE, V);
    coversViewport(s, LANDSCAPE);
    // 1.15 배에서 세로 여유는 300*1.15-300 = 45px 뿐이라 32% 초점을 중앙에 둘 수 없다 → y=0
    expect(s.y).toBe(0);
  });
});

describe('clampCropState', () => {
  it('덮는 최소 배율보다 작게 줄이면 최소로 되돌린다', () => {
    const s = clampCropState({ scale: 0.01, x: 0, y: 0 }, PORTRAIT, V);
    expect(s.scale).toBeCloseTo(minCoverScale(PORTRAIT, V));
    coversViewport(s, PORTRAIT);
  });

  it('최대 배율(최소×4)을 넘지 못한다', () => {
    const s = clampCropState({ scale: 99, x: 0, y: 0 }, PORTRAIT, V);
    expect(s.scale).toBeCloseTo(minCoverScale(PORTRAIT, V) * CROP_MAX_ZOOM_FACTOR);
  });

  it('이미지를 뷰포트 밖으로 밀어내면 가장자리에 붙인다', () => {
    const min = minCoverScale(PORTRAIT, V);
    expect(clampCropState({ scale: min, x: 50, y: 50 }, PORTRAIT, V)).toEqual({ scale: min, x: 0, y: 0 });
    const far = clampCropState({ scale: min, x: -9999, y: -9999 }, PORTRAIT, V);
    coversViewport(far, PORTRAIT);
    expect(far.y).toBeCloseTo(V - PORTRAIT.height * min);
  });
});

describe('panCropState', () => {
  it('끌면 그만큼 움직이되 가장자리에서 멈춘다', () => {
    const start = initialCropState(PORTRAIT, V);
    const moved = panCropState(start, -10, -20, PORTRAIT, V);
    expect(moved.x).toBeCloseTo(start.x - 10);
    expect(moved.y).toBeCloseTo(start.y - 20);
    const stuck = panCropState(start, 500, 500, PORTRAIT, V);
    expect(stuck).toEqual({ ...start, x: 0, y: 0 });
  });
});

describe('zoomCropStateAround', () => {
  it('고정점 아래의 사진 내용이 확대 전후 같은 자리에 남는다', () => {
    const start = initialCropState(PORTRAIT, V);
    const cx = 120;
    const cy = 90;
    // 고정점이 가리키는 원본 픽셀
    const srcX = (cx - start.x) / start.scale;
    const srcY = (cy - start.y) / start.scale;
    const zoomed = zoomCropStateAround(start, 1.5, cx, cy, PORTRAIT, V);
    expect(zoomed.scale).toBeCloseTo(start.scale * 1.5);
    expect(zoomed.x + srcX * zoomed.scale).toBeCloseTo(cx, 5);
    expect(zoomed.y + srcY * zoomed.scale).toBeCloseTo(cy, 5);
    coversViewport(zoomed, PORTRAIT);
  });

  it('축소로 최소 배율 아래로 내려가면 최소에서 멈추고 덮기를 유지한다', () => {
    const start = initialCropState(PORTRAIT, V);
    const s = zoomCropStateAround(start, 0.1, 0, 0, PORTRAIT, V);
    expect(s.scale).toBeCloseTo(minCoverScale(PORTRAIT, V));
    coversViewport(s, PORTRAIT);
  });
});

describe('zoom fraction ↔ state', () => {
  it('0 은 덮는 최소, 1 은 최대이며 왕복이 맞는다', () => {
    const start = initialCropState(PORTRAIT, V);
    const atMin = cropStateAtZoomFraction(start, 0, PORTRAIT, V);
    expect(atMin.scale).toBeCloseTo(minCoverScale(PORTRAIT, V));
    expect(zoomFractionOf(atMin, PORTRAIT, V)).toBeCloseTo(0);
    const atMax = cropStateAtZoomFraction(start, 1, PORTRAIT, V);
    expect(zoomFractionOf(atMax, PORTRAIT, V)).toBeCloseTo(1);
    const mid = cropStateAtZoomFraction(start, 0.5, PORTRAIT, V);
    expect(zoomFractionOf(mid, PORTRAIT, V)).toBeCloseTo(0.5);
    coversViewport(mid, PORTRAIT);
  });
});

describe('cropSourceRect', () => {
  it('뷰포트에 보이는 정사각 영역을 원본 픽셀로 돌려준다', () => {
    const min = minCoverScale(PORTRAIT, V); // 1/3
    const rect = cropSourceRect({ scale: min, x: 0, y: -100 }, V);
    expect(rect).toEqual({ sx: 0, sy: 300, sw: 900, sh: 900 });
  });

  it('초기 상태의 영역은 원본 안에 들어가며 정사각이다', () => {
    const s = initialCropState(PORTRAIT, V);
    const r = cropSourceRect(s, V);
    expect(r.sw).toBeCloseTo(r.sh);
    expect(r.sx).toBeGreaterThanOrEqual(0);
    expect(r.sy).toBeGreaterThanOrEqual(0);
    expect(r.sx + r.sw).toBeLessThanOrEqual(PORTRAIT.width + 1e-6);
    expect(r.sy + r.sh).toBeLessThanOrEqual(PORTRAIT.height + 1e-6);
  });
});
