import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { consumeSignupPhotoNotice, markSignupPhotoNotice } from '@/lib/signup-photo-notice';
import { SignupPhotoNotice, SIGNUP_PHOTO_NOTICE_MESSAGE } from './signup-photo-notice';

afterEach(() => { window.sessionStorage.clear(); });

describe('SignupPhotoNotice', () => {
  it('가입 화면이 사진 실패 표시를 남겼으면 안내를 보이고, 표시는 그 자리에서 지운다', async () => {
    markSignupPhotoNotice();

    render(<SignupPhotoNotice />);

    expect(await screen.findByRole('status')).toHaveTextContent(SIGNUP_PHOTO_NOTICE_MESSAGE);
    expect(consumeSignupPhotoNotice()).toBe(false);
  });

  it('표시가 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<SignupPhotoNotice />);

    expect(container).toBeEmptyDOMElement();
  });

  it('새로고침처럼 다시 그려도 안내는 한 번만 나온다', async () => {
    markSignupPhotoNotice();
    const first = render(<SignupPhotoNotice />);
    await screen.findByRole('status');
    first.unmount();

    const second = render(<SignupPhotoNotice />);

    expect(second.container).toBeEmptyDOMElement();
  });
});
