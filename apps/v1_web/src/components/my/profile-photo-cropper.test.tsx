import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePhotoCropper, type CropExporter } from './profile-photo-cropper';
import { cropSourceRect, minCoverScale } from '@/lib/image-crop';

/**
 * jsdom 은 이미지를 디코드하지 않는다 -- `new Image()` 의 onload 가 영원히 안 온다.
 * 전역 Image 를 "즉시 900×1200 으로 로드되는" 가짜로 바꿔 컴포넌트가 준비 상태까지 가게 한다.
 * canvas 도 없으므로 내보내기는 `exportCrop` 주입으로 검증한다.
 */
class FakeImage {
  naturalWidth = 900;
  naturalHeight = 1200;
  decoding = 'auto';
  onload: null | (() => void) = null;
  onerror: null | (() => void) = null;
  private _src = '';
  set src(value: string) {
    this._src = value;
    queueMicrotask(() => {
      if (value.includes('broken')) this.onerror?.();
      else this.onload?.();
    });
  }
  get src() {
    return this._src;
  }
}

const originalImage = globalThis.Image;

// jsdom 에는 createObjectURL/revokeObjectURL 이 아예 없다. RTL 의 cleanup(언마운트 → revoke)은
// 이 파일의 afterEach 보다 **뒤에** 돌기 때문에 afterEach 에서 되돌리면 revoke 가 undefined 로
// 터진다 -- 파일 수명 동안 고정해 둔다(이 파일 밖으로는 새지 않는다: vitest 는 파일마다 환경을 새로 만든다).
URL.createObjectURL = vi.fn(() => 'blob:fake');
URL.revokeObjectURL = vi.fn();

beforeEach(() => {
  globalThis.Image = FakeImage as unknown as typeof Image;
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  };
});

afterEach(() => {
  globalThis.Image = originalImage;
});

/**
 * jsdom 은 PointerEvent 를 모른다 -- `fireEvent.pointerMove(el, { clientX })` 는 clientX 가
 * 빠진 일반 Event 가 되어 좌표가 NaN 이 된다. MouseEvent 에 pointerId 만 얹어 직접 보낸다.
 */
function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', pointerId: number, clientX: number, clientY: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  el.dispatchEvent(event);
}

function pickedFile() {
  return new File([new Uint8Array(10)], 'me.jpg', { type: 'image/jpeg' });
}

describe('ProfilePhotoCropper', () => {
  it('사진이 읽히면 확인 버튼이 열리고, 확인하면 잘라낸 파일을 onCropped 로 넘긴다', async () => {
    const cropped = new File([new Uint8Array(5)], 'profile.webp', { type: 'image/webp' });
    const exportCrop = vi.fn<CropExporter>(async () => cropped);
    const onCropped = vi.fn();
    render(<ProfilePhotoCropper source={pickedFile()} onCancel={() => {}} onCropped={onCropped} exportCrop={exportCrop} />);

    const confirm = screen.getByRole('button', { name: '이 사진으로 할게요' });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);

    // File 을 toHaveBeenCalledWith 로 딥 비교하면 CI(다른 Node/jsdom)에서 같은 객체인데도
    // 불일치로 판정돼 1초 타임아웃으로 죽었다 -- 참조가 같은지만 본다(같은 객체를 넘기는 게 계약이다).
    await waitFor(() => expect(onCropped).toHaveBeenCalled());
    expect(onCropped.mock.calls[0][0]).toBe(cropped);
    // 내보내기는 컴포넌트가 계산한 기하로 호출된다 -- 초기 상태는 덮는 최소 배율의 1.15배
    const [, state, viewport] = exportCrop.mock.calls[0];
    expect(viewport).toBe(300);
    expect(state.scale).toBeCloseTo(minCoverScale({ width: 900, height: 1200 }, 300) * 1.15);
    const rect = cropSourceRect(state, viewport);
    expect(rect.sw).toBeCloseTo(rect.sh);
  });

  it('드래그하면 잘라내는 영역이 그만큼 옮겨진다 (이동은 리렌더 없이 ref 로 쌓인다)', async () => {
    const exportCrop = vi.fn<CropExporter>(async () => pickedFile());
    const { container } = render(
      <ProfilePhotoCropper source={pickedFile()} onCancel={() => {}} onCropped={() => {}} exportCrop={exportCrop} />,
    );
    const confirm = screen.getByRole('button', { name: '이 사진으로 할게요' });
    await waitFor(() => expect(confirm).toBeEnabled());

    const viewport = container.querySelector('.tm-photo-crop-viewport') as HTMLElement;
    viewport.setPointerCapture = vi.fn();
    viewport.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 300, right: 300, bottom: 300, x: 0, y: 0, toJSON: () => ({}) });
    pointer(viewport, 'pointerdown', 1, 150, 150);
    pointer(viewport, 'pointermove', 1, 150, 110); // 위로 40px 끌기
    pointer(viewport, 'pointerup', 1, 150, 110);
    fireEvent.click(confirm);

    await waitFor(() => expect(exportCrop).toHaveBeenCalled());
    const [, state] = exportCrop.mock.calls[0];
    // 초기 y 는 0(3:4 사진은 위 가장자리에 붙는다) -> 40px 위로 끌었으니 -40
    expect(state.y).toBeCloseTo(-40);
  });

  it('확대 슬라이더를 끝까지 올리면 최대 배율(최소×4)이 된다', async () => {
    const exportCrop = vi.fn<CropExporter>(async () => pickedFile());
    render(<ProfilePhotoCropper source={pickedFile()} onCancel={() => {}} onCropped={() => {}} exportCrop={exportCrop} />);
    const confirm = screen.getByRole('button', { name: '이 사진으로 할게요' });
    await waitFor(() => expect(confirm).toBeEnabled());

    fireEvent.change(screen.getByRole('slider', { name: '사진 확대' }), { target: { value: '1000' } });
    fireEvent.click(confirm);

    await waitFor(() => expect(exportCrop).toHaveBeenCalled());
    const [, state] = exportCrop.mock.calls[0];
    expect(state.scale).toBeCloseTo(minCoverScale({ width: 900, height: 1200 }, 300) * 4);
  });

  it('내보내기가 실패하면 이유를 보여 주고 onCropped 는 부르지 않는다', async () => {
    const exportCrop = vi.fn<CropExporter>(async () => {
      throw new Error('사진을 저장할 형식으로 바꾸지 못했어요. 다시 시도해 주세요.');
    });
    const onCropped = vi.fn();
    render(<ProfilePhotoCropper source={pickedFile()} onCancel={() => {}} onCropped={onCropped} exportCrop={exportCrop} />);
    const confirm = screen.getByRole('button', { name: '이 사진으로 할게요' });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);

    expect(await screen.findByRole('alert')).toHaveTextContent('사진을 저장할 형식으로 바꾸지 못했어요');
    expect(onCropped).not.toHaveBeenCalled();
    expect(confirm).toBeEnabled();
  });

  it('사진을 읽지 못하면 안내가 뜨고 확인 버튼은 잠긴 채다', async () => {
    render(<ProfilePhotoCropper source="/uploads/broken.jpg" onCancel={() => {}} onCropped={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('사진을 읽지 못했어요');
    expect(screen.getByRole('button', { name: '이 사진으로 할게요' })).toBeDisabled();
  });

  it('업로드 중(pending)에는 버튼이 잠기고 문구가 바뀐다', async () => {
    render(<ProfilePhotoCropper source={pickedFile()} onCancel={() => {}} onCropped={() => {}} pending />);
    await waitFor(() => expect(screen.getByRole('button', { name: '올리는 중' })).toBeDisabled());
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();
  });

  it('취소를 누르면 onCancel', async () => {
    const onCancel = vi.fn();
    render(<ProfilePhotoCropper source={pickedFile()} onCancel={onCancel} onCropped={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
