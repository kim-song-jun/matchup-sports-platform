'use client';

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Camera, Image as ImageIcon, X } from 'lucide-react';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { detectNativeShell } from '@/lib/native-bridge';

/** 한 번에 보낼 수 있는 사진 수 — 업로드 API 한도(`FilesInterceptor('files', 5)`)와 같다. */
export const MAX_CHAT_IMAGES = 5;

// iOS 는 accept 에 HEIC 가 없으면 고를 때 JPEG 로 바꿔 준다 — 서버가 받는 세 형식만 연다.
const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';

/**
 * 카메라 칸은 터치 기기에서만 보인다. PC 는 카메라가 없어 `capture` 가 그냥 파일 선택이 되고,
 * 안드로이드 앱은 네이티브 선택기(ACTION_OPEN_DOCUMENT)가 `capture` 를 무시해 앨범과 똑같다.
 * SSR 에선 window 가 없으니 마운트 뒤에 판정한다.
 */
function useCanUseCamera() {
  const [canUseCamera, setCanUseCamera] = useState(false);
  useEffect(() => {
    setCanUseCamera(window.matchMedia?.('(pointer: coarse)').matches === true && detectNativeShell() !== 'android');
  }, []);
  return canUseCamera;
}

/**
 * 카카오톡식 + 패널 — 입력창 아래로 펼쳐지는 기능 칸(Task 181 A안).
 * 열고 닫기(+ ↔ ×)와 ESC 는 부모 입력바가 가진다. 여기는 칸과 파일 선택만 맡는다.
 */
export function ChatPlusPanel({
  id,
  disabled,
  onPickImages,
}: {
  id: string;
  disabled: boolean;
  onPickImages: (files: File[]) => void;
}) {
  const albumRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const canUseCamera = useCanUseCamera();

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // 같은 사진을 다시 골라도 change 가 나게 비운다.
    event.target.value = '';
    if (files.length > 0) onPickImages(files);
  };

  return (
    <div id={id} className="tm-chat-plus-panel" role="group" aria-label="보내기 메뉴">
      <PlusTile label="앨범" disabled={disabled} onClick={() => albumRef.current?.click()}>
        <ImageIcon size={22} strokeWidth={2} />
      </PlusTile>
      {canUseCamera ? (
        <PlusTile label="카메라" disabled={disabled} onClick={() => cameraRef.current?.click()}>
          <Camera size={22} strokeWidth={2} />
        </PlusTile>
      ) : null}
      <input ref={albumRef} type="file" accept={IMAGE_ACCEPT} multiple hidden onChange={handleChange} data-testid="chat-album-input" />
      <input ref={cameraRef} type="file" accept={IMAGE_ACCEPT} capture="environment" hidden onChange={handleChange} data-testid="chat-camera-input" />
    </div>
  );
}

function PlusTile({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="tm-chat-plus-tile" disabled={disabled} onClick={onClick}>
      <span className="tm-chat-plus-tile-icon" aria-hidden="true">{children}</span>
      <span className="tm-text-caption">{label}</span>
    </button>
  );
}

/** 사진 전체 화면 보기 — ESC·뒤로가기·배경·닫기 버튼으로 닫힌다(포커스 가둠·복원은 useModalA11y). */
export function ChatImageViewer({ url, onClose }: { url: string | null; onClose: () => void }) {
  const open = url !== null;
  const { dialogRef, onBackdropClick } = useModalA11y({ open, onClose, exitMs: 0 });
  if (!open) return null;
  return (
    <div className="tm-chat-image-viewer" onClick={onBackdropClick}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="사진 크게 보기" className="tm-chat-image-viewer-panel" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="tm-btn tm-btn-icon tm-chat-image-viewer-close" aria-label="닫기" onClick={onClose}>
          <X size={22} strokeWidth={2.2} />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element -- 사용자 업로드(/uploads)는 next/image 최적화 대상이 아니다. */}
        <img src={url} alt="보낸 사진" className="tm-chat-image-viewer-img" />
      </div>
    </div>
  );
}
