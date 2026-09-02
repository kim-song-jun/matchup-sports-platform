'use client';

import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import {
  cropSourceRect,
  cropStateAtZoomFraction,
  initialCropState,
  panCropState,
  zoomCropStateAround,
  zoomFractionOf,
  type CropState,
  type ImageSize,
} from '@/lib/image-crop';
import { encodeCanvasToBlob } from '@/lib/image-compress';

/**
 * 프로필 사진 크롭 (사용자 선택 A안, 2026-09-02).
 *
 * 사진을 고르면 바로 이 모달이 떠서 **얼굴을 원 안에 맞추게** 한다. 저장되는 파일 자체가
 * 얼굴 중심 정사각(768²)이라 선수 카드·마이페이지 아바타·팀원 목록·공유 이미지 어디서나
 * 같은 얼굴이 나온다 — 레퍼런스(GitFut)가 GitHub 아바타를 받아 잘림이 없는 것과 같은 구조다.
 *
 * ## 설계
 * - 기하는 전부 `lib/image-crop.ts` 의 순수 함수다. 이 컴포넌트는 포인터를 그 함수에
 *   먹이고 결과를 CSS 로 그리기만 한다 — 드래그·핀치·휠·슬라이더가 한 상태를 공유한다.
 * - 드래그 중에는 리액트 state 를 갱신하지 않는다(pointermove 마다 리렌더가 나면 저사양
 *   폰에서 손가락을 못 따라간다). ref 에 쌓고 `requestAnimationFrame` 한 번에 DOM 을 만진다.
 * - 원본은 `<img>` 로 읽는다. `createImageBitmap` 과 달리 EXIF 회전을 브라우저가 처리해
 *   주므로, 폰으로 세로 촬영한 사진이 옆으로 누운 채 잘리지 않는다.
 * - 인코딩은 `encodeCanvasToBlob`(WebP → 안 되면 JPEG) 을 재사용한다 — Safari 가 WebP
 *   요청에 PNG 를 돌려주는 문제를 여기서 또 겪지 않기 위해서다.
 */

/** 저장 파일 한 변. 카드 렌더(138px·2x = 276px)와 마이페이지 아바타(최대 96px·3x)에 충분하다. */
export const PROFILE_PHOTO_OUTPUT_SIZE = 768;

export type CropExporter = (
  image: HTMLImageElement,
  state: CropState,
  viewport: number,
) => Promise<File>;

async function exportCropWithCanvas(image: HTMLImageElement, state: CropState, viewport: number): Promise<File> {
  const rect = cropSourceRect(state, viewport);
  const canvas = document.createElement('canvas');
  canvas.width = PROFILE_PHOTO_OUTPUT_SIZE;
  canvas.height = PROFILE_PHOTO_OUTPUT_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('이 브라우저에서는 사진을 자를 수 없어요. 다른 브라우저로 시도해 주세요.');
  context.drawImage(image, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, PROFILE_PHOTO_OUTPUT_SIZE, PROFILE_PHOTO_OUTPUT_SIZE);
  const blob = await encodeCanvasToBlob(canvas, 0.86);
  if (!blob) throw new Error('사진을 저장할 형식으로 바꾸지 못했어요. 다시 시도해 주세요.');
  const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
  return new File([blob], `profile.${extension}`, { type: blob.type });
}

export interface ProfilePhotoCropperProps {
  /** 방금 고른 파일, 또는 이미 올라가 있는 사진의 경로(같은 origin `/uploads/...`). */
  readonly source: File | string;
  readonly onCancel: () => void;
  /** 잘라낸 정사각 파일. 업로드는 호출자가 한다 — 이 컴포넌트는 네트워크를 모른다. */
  readonly onCropped: (file: File) => void | Promise<void>;
  /** 업로드가 진행 중이면 true — 버튼을 잠그고 ESC·배경 닫기도 막는다. */
  readonly pending?: boolean;
  /** 제목. 새 사진이면 "사진 위치 맞추기", 기존 사진 재조정이면 "카드 사진 위치 맞추기". */
  readonly title?: string;
  /** 테스트 주입용 — 실제 canvas 가 없는 환경에서 내보내기 분기를 검증한다. */
  readonly exportCrop?: CropExporter;
}

/** 뷰포트 한 변(CSS px). 모바일 폭 390 에서 좌우 여백을 빼면 이 값이 자연스럽다. */
const VIEWPORT = 300;

export function ProfilePhotoCropper({
  source,
  onCancel,
  onCropped,
  pending = false,
  title = '사진 위치 맞추기',
  exportCrop = exportCropWithCanvas,
}: ProfilePhotoCropperProps) {
  const titleId = useId();
  const hintId = useId();
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  /** 슬라이더 표시용 — 드래그로는 안 바뀌고 확대(핀치·휠·슬라이더)에서만 갱신된다. */
  const [zoomFraction, setZoomFraction] = useState(0);

  const busy = pending || exporting;
  const { dialogRef, initialFocusRef, onBackdropClick } = useModalA11y<HTMLButtonElement, HTMLDivElement>({
    open: true,
    onClose: onCancel,
    pending: busy,
  });

  // ── 원본 로드 ──
  useEffect(() => {
    let cancelled = false;
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    if (typeof source !== 'string') setObjectUrl(url);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (cancelled) return;
      if (img.naturalWidth === 0 || img.naturalHeight === 0) {
        setLoadError('사진을 읽지 못했어요. 다른 사진을 골라 주세요.');
        return;
      }
      setImageEl(img);
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      if (!cancelled) setLoadError('사진을 읽지 못했어요. 다른 사진을 골라 주세요.');
    };
    img.src = url;
    return () => {
      cancelled = true;
      if (typeof source !== 'string') URL.revokeObjectURL(url);
    };
  }, [source]);

  // ── 기하 상태: ref 가 진실, DOM 은 rAF 로 따라간다 ──
  const stateRef = useRef<CropState | null>(null);
  const photoRef = useRef<HTMLImageElement>(null);
  const frameRef = useRef<number | null>(null);

  function paint() {
    const el = photoRef.current;
    const s = stateRef.current;
    if (!el || !s || !imageSize) return;
    el.style.width = `${imageSize.width * s.scale}px`;
    el.style.height = `${imageSize.height * s.scale}px`;
    el.style.transform = `translate(${s.x}px, ${s.y}px)`;
  }

  function schedulePaint() {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      paint();
    });
  }

  function commit(next: CropState, zoomChanged: boolean) {
    stateRef.current = next;
    schedulePaint();
    if (zoomChanged && imageSize) setZoomFraction(zoomFractionOf(next, imageSize, VIEWPORT));
  }

  useEffect(() => {
    if (!imageSize) return;
    const initial = initialCropState(imageSize, VIEWPORT);
    stateRef.current = initial;
    setZoomFraction(zoomFractionOf(initial, imageSize, VIEWPORT));
    paint();
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
    // paint 는 렌더마다 새 함수지만 imageSize 가 바뀔 때만 초기화하면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSize]);

  // ── 포인터: 손가락 하나 = 이동, 둘 = 핀치 ──
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef<number | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  function localPoint(e: ReactPointerEvent | ReactWheelEvent) {
    const r = viewportRef.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 0, y: 0 };
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!imageSize) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, localPoint(e));
    pinchDistance.current = null;
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const s = stateRef.current;
    if (!s || !imageSize || !pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId)!;
    const now = localPoint(e);
    pointers.current.set(e.pointerId, now);

    if (pointers.current.size >= 2) {
      const [a, b] = Array.from(pointers.current.values());
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (pinchDistance.current !== null && pinchDistance.current > 0) {
        commit(zoomCropStateAround(s, distance / pinchDistance.current, center.x, center.y, imageSize, VIEWPORT), true);
      }
      pinchDistance.current = distance;
      return;
    }
    commit(panCropState(s, now.x - prev.x, now.y - prev.y, imageSize, VIEWPORT), false);
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    pinchDistance.current = null;
  }

  function onWheel(e: ReactWheelEvent<HTMLDivElement>) {
    const s = stateRef.current;
    if (!s || !imageSize) return;
    e.preventDefault();
    const p = localPoint(e);
    commit(zoomCropStateAround(s, e.deltaY < 0 ? 1.08 : 1 / 1.08, p.x, p.y, imageSize, VIEWPORT), true);
  }

  function onSlider(fraction: number) {
    const s = stateRef.current;
    if (!s || !imageSize) return;
    commit(cropStateAtZoomFraction(s, fraction, imageSize, VIEWPORT), true);
  }

  async function confirm() {
    const s = stateRef.current;
    if (!imageEl || !s || busy) return;
    setExportError(null);
    setExporting(true);
    try {
      const file = await exportCrop(imageEl, s, VIEWPORT);
      await onCropped(file);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '사진을 저장하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setExporting(false);
    }
  }

  const ready = imageSize !== null && loadError === null;

  return (
    <div className="tm-modal-scrim tm-photo-crop-scrim" onClick={onBackdropClick}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={hintId}
        tabIndex={-1}
        className="tm-modal-panel tm-photo-crop-panel"
      >
        <div className="tm-photo-crop-head">
          <div id={titleId} className="tm-text-body-lg" style={{ fontWeight: 700 }}>{title}</div>
          <button
            ref={initialFocusRef}
            type="button"
            className="tm-btn tm-btn-sm tm-btn-ghost"
            onClick={onCancel}
            disabled={busy}
          >
            취소
          </button>
        </div>

        <div
          ref={viewportRef}
          className="tm-photo-crop-viewport"
          data-ready={ready ? 'true' : undefined}
          style={{ width: VIEWPORT, height: VIEWPORT }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onWheel={onWheel}
        >
          {/* 원본은 CSS 만으로 놓는다 — 드래그 중 리렌더가 없어야 손가락을 따라간다. */}
          {ready ? (
            <img
              ref={photoRef}
              className="tm-photo-crop-photo"
              src={typeof source === 'string' ? source : objectUrl ?? undefined}
              alt=""
              draggable={false}
            />
          ) : null}
          {/* 원형 가이드. 저장은 정사각이지만 얼굴을 맞추는 기준은 원이 직관적이다. */}
          <div className="tm-photo-crop-guide" aria-hidden="true" />
          {loadError ? (
            <div className="tm-photo-crop-error" role="alert">{loadError}</div>
          ) : null}
        </div>

        <div id={hintId} className="tm-text-caption tm-photo-crop-hint">
          얼굴이 원 안에 오도록 움직여 주세요
        </div>

        <label className="tm-photo-crop-zoom">
          <span className="tm-text-caption">축소</span>
          <input
            type="range"
            min={0}
            max={1000}
            step={1}
            value={Math.round(zoomFraction * 1000)}
            onChange={(e) => onSlider(Number(e.target.value) / 1000)}
            disabled={!ready || busy}
            aria-label="사진 확대"
          />
          <span className="tm-text-caption">확대</span>
        </label>

        {exportError ? (
          <div className="tm-text-caption tm-auth-field-helper-error tm-photo-crop-error-line" role="alert">
            {exportError}
          </div>
        ) : null}

        <button
          type="button"
          className="tm-btn tm-btn-lg tm-btn-primary tm-photo-crop-confirm"
          onClick={() => void confirm()}
          disabled={!ready || busy}
        >
          {pending ? '올리는 중' : exporting ? '자르는 중' : '이 사진으로 할게요'}
        </button>
      </div>
    </div>
  );
}
