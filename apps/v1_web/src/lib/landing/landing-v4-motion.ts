/**
 * 랜딩 v4 스크롤 연출의 순수 계산. DOM 은 호출부가 읽고, 여기서는 숫자만 다룬다.
 */

export const STAGE_SCENE_COUNT = 5;

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** 고정 무대 안에서 얼마나 내려왔는지(0~1). range = 섹션 높이 - 고정 영역 높이. */
export function stageProgress(sectionTop: number, scrollRange: number): number {
  return clamp01(-sectionTop / Math.max(1, scrollRange));
}

export function sceneFromProgress(progress: number, count = STAGE_SCENE_COUNT): number {
  return Math.min(count - 1, Math.floor(clamp01(progress) * count));
}

/** 진행 레일 k 번째 칸이 채워진 정도. */
export function railFill(progress: number, index: number, count = STAGE_SCENE_COUNT): number {
  return clamp01(progress * count - index);
}

/** 장면 탭을 누르면 그 장면 구간의 앞쪽(12%)으로 보낸다 — 경계에 딱 맞추면 반올림으로 앞 장면이 걸린다. */
export function sceneScrollOffset(index: number, scrollRange: number, count = STAGE_SCENE_COUNT): number {
  return ((index + 0.12) / count) * scrollRange;
}


/** 무대 폰 크기(단위 없는 px). 1024+ 는 고정 영역 높이에 맞추고, 그 아래는 높이의 52% 안에 둔다. */
export function stagePhoneSize(viewportWidth: number, stickyHeight: number): { dw: number; dh: number } {
  const dh = Math.floor(
    viewportWidth >= 1024
      ? Math.min(620, Math.max(440, stickyHeight - 96))
      : Math.min(480, Math.max(280, stickyHeight * 0.52)),
  );
  return { dw: Math.round((dh * 300) / 620), dh };
}

type RangeKind = 'cover' | 'entry' | 'contain';

/** CSS animation-range 의 한 끝("cover 20%")이 가리키는, 요소 윗변이 화면 아래에서 올라온 거리. */
function rangeOffset(kind: RangeKind, percent: number, height: number, viewport: number): number {
  const [start, end] =
    kind === 'cover' ? [0, viewport + height]
    : kind === 'entry' ? [0, Math.min(height, viewport)]
    : height <= viewport ? [height, viewport] : [viewport, height];
  return start + ((end - start) * percent) / 100;
}

const parsedRanges = new Map<string, [RangeKind, number, RangeKind, number]>();

function parseRange(range: string): [RangeKind, number, RangeKind, number] {
  const cached = parsedRanges.get(range);
  if (cached) return cached;
  const m = /^(cover|entry|contain) (\d+(?:\.\d+)?)% (cover|entry|contain) (\d+(?:\.\d+)?)%$/.exec(range.trim());
  if (!m) throw new Error(`지원하지 않는 animation-range 예요: ${range}`);
  const parsed: [RangeKind, number, RangeKind, number] = [m[1] as RangeKind, Number(m[2]), m[3] as RangeKind, Number(m[4])];
  parsedRanges.set(range, parsed);
  return parsed;
}

/**
 * view() 타임라인을 지원하지 않는 브라우저용 — CSS 의 `animation-range` 와 같은 문자열을 받아
 * 같은 진행값(0~1)을 만든다. CSS 와 JS 가 같은 범위를 쓰도록 문자열 하나를 공유한다.
 */
export function viewTimelineProgress(top: number, height: number, viewport: number, range: string): number {
  const [kindA, pctA, kindB, pctB] = parseRange(range);
  const travelled = viewport - top;
  const a = rangeOffset(kindA, pctA, height, viewport);
  const b = rangeOffset(kindB, pctB, height, viewport);
  return b === a ? (travelled >= b ? 1 : 0) : clamp01((travelled - a) / (b - a));
}

/** 3단계 연결선: 목록 진행값 p 에서 k 번째 선이 그려진 정도와 k 번째 단계에 닿았는지. */
export function stepState(progress: number, index: number): { line: number; reached: boolean } {
  const p = clamp01(progress);
  return {
    line: clamp01(p * 2 - index),
    reached: index === 0 ? p > 0 : clamp01(p * 2 - (index - 1)) >= 1,
  };
}

/** 카운트업 한 프레임 — easeOutExpo. */
export function countAt(to: number, elapsed: number, duration: number): number {
  const x = clamp01(elapsed / Math.max(1, duration));
  return x === 1 ? to : Math.round(to * (1 - 2 ** (-10 * x)));
}
