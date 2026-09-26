/**
 * 프로필 사진 크롭의 기하 — 뷰포트(정사각, 한 변 V) 위에 원본 이미지를 얼마나 키워
 * 어디에 놓았는지를 상태로 들고, 그 상태에서 실제로 잘라낼 원본 픽셀 영역을 계산한다.
 *
 * 왜 업로드 입구에서 자르나: 선수 카드의 렌더 박스(138×140)는 사진의 얼굴 위치를
 * 전혀 모른다. 레퍼런스(GitFut)가 잘림 없이 되는 이유는 카드가 똑똑해서가 아니라
 * 입력(GitHub 아바타)이 이미 정사각·얼굴 중심이기 때문이다. 같은 구조를 만든다 —
 * 저장되는 파일 자체가 얼굴 중심 정사각이면 카드·아바타·공유 이미지가 전부 같은
 * 얼굴을 보여 준다.
 *
 * 좌표계: 뷰포트 좌상단이 (0,0). 이미지는 `(x, y)` 에 놓이고 `naturalWidth × scale`
 * 크기로 그려진다. 불변식은 **이미지가 뷰포트를 항상 덮는다** — 빈 모서리가 생기면
 * 잘라낸 결과에 검은 귀퉁이가 들어간다.
 */

export interface CropState {
  /** 원본 픽셀 1 = 뷰포트 픽셀 `scale` */
  readonly scale: number;
  /** 이미지 좌상단의 뷰포트 좌표 (항상 ≤ 0) */
  readonly x: number;
  readonly y: number;
}

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

/** 덮는 최소 배율에서 얼마나 더 키울 수 있나. 4배면 얼굴 하나를 화면에 채울 만큼이다. */
export const CROP_MAX_ZOOM_FACTOR = 4;

/**
 * 기본 초점 — 사진의 가로 중앙, 세로 위쪽 32%. 폰 사진(전신·상반신)은 얼굴이 위쪽
 * 1/3 에 있는 경우가 압도적이라, 대부분은 손대지 않고 "이 사진으로" 만 누르게 된다.
 */
const DEFAULT_FOCUS_Y = 0.32;

/** 뷰포트를 빈 곳 없이 덮는 최소 배율. */
export function minCoverScale(image: ImageSize, viewport: number): number {
  return Math.max(viewport / image.width, viewport / image.height);
}

/**
 * 이미지가 뷰포트를 덮도록 배율·위치를 보정한다. 배율은 [덮는 최소, 최소×4] 로 자르고,
 * 위치는 이미지 가장자리가 뷰포트 안으로 들어오지 않게 민다.
 */
export function clampCropState(state: CropState, image: ImageSize, viewport: number): CropState {
  const minScale = minCoverScale(image, viewport);
  const scale = Math.min(Math.max(state.scale, minScale), minScale * CROP_MAX_ZOOM_FACTOR);
  const drawnW = image.width * scale;
  const drawnH = image.height * scale;
  const x = Math.min(0, Math.max(state.x, viewport - drawnW));
  const y = Math.min(0, Math.max(state.y, viewport - drawnH));
  return { scale, x, y };
}

/**
 * 처음 열었을 때의 상태 — 덮는 최소 배율에 1.15 를 곱해 약간 당기고(가장자리의 배경이
 * 카드에 남지 않게), 기본 초점이 뷰포트 중앙에 오도록 놓는다.
 */
export function initialCropState(image: ImageSize, viewport: number): CropState {
  const scale = minCoverScale(image, viewport) * 1.15;
  const focusX = image.width * 0.5 * scale;
  const focusY = image.height * DEFAULT_FOCUS_Y * scale;
  return clampCropState({ scale, x: viewport / 2 - focusX, y: viewport / 2 - focusY }, image, viewport);
}

/** 손가락 하나로 끄는 이동. */
export function panCropState(state: CropState, dx: number, dy: number, image: ImageSize, viewport: number): CropState {
  return clampCropState({ ...state, x: state.x + dx, y: state.y + dy }, image, viewport);
}

/**
 * 뷰포트 좌표 `(cx, cy)` 를 고정점으로 배율을 `factor` 배 바꾼다 — 핀치한 자리·휠을
 * 굴린 자리의 사진 내용이 그 자리에 그대로 남아야 "내가 잡은 곳이 커진다"고 느낀다.
 */
export function zoomCropStateAround(
  state: CropState,
  factor: number,
  cx: number,
  cy: number,
  image: ImageSize,
  viewport: number,
): CropState {
  const minScale = minCoverScale(image, viewport);
  const nextScale = Math.min(Math.max(state.scale * factor, minScale), minScale * CROP_MAX_ZOOM_FACTOR);
  const applied = nextScale / state.scale;
  return clampCropState(
    { scale: nextScale, x: cx - (cx - state.x) * applied, y: cy - (cy - state.y) * applied },
    image,
    viewport,
  );
}

/** 슬라이더용: 0(덮는 최소) ~ 1(최대) 사이 값과 배율을 서로 바꾼다. */
export function zoomFractionOf(state: CropState, image: ImageSize, viewport: number): number {
  const minScale = minCoverScale(image, viewport);
  const fraction = (state.scale / minScale - 1) / (CROP_MAX_ZOOM_FACTOR - 1);
  return Math.min(1, Math.max(0, fraction));
}

export function cropStateAtZoomFraction(
  state: CropState,
  fraction: number,
  image: ImageSize,
  viewport: number,
): CropState {
  const minScale = minCoverScale(image, viewport);
  const target = minScale * (1 + Math.min(1, Math.max(0, fraction)) * (CROP_MAX_ZOOM_FACTOR - 1));
  // 슬라이더는 뷰포트 중앙을 고정점으로 삼는다 — 손가락이 사진 위에 없다.
  return zoomCropStateAround(state, target / state.scale, viewport / 2, viewport / 2, image, viewport);
}

export interface SourceRect {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
}

/** 지금 뷰포트에 보이는 영역을 원본 픽셀 좌표로 — canvas.drawImage 의 source 인자. */
export function cropSourceRect(state: CropState, viewport: number): SourceRect {
  const side = viewport / state.scale;
  // `-state.x` 는 x=0 일 때 -0 을 만든다 -- drawImage 엔 무해하지만 값을 비교하는 쪽이 헷갈린다.
  return { sx: (0 - state.x) / state.scale, sy: (0 - state.y) / state.scale, sw: side, sh: side };
}
