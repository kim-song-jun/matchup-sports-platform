import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContactEmailCopy } from './contact-email-copy';

const EMAIL = 'help@example.com';

afterEach(() => {
  vi.restoreAllMocks();
  window.getSelection()?.removeAllRanges();
});

describe('이메일 주소 복사', () => {
  it('복사하면 클립보드에 주소가 들어가고 알림을 띄운다', async () => {
    const user = userEvent.setup();
    render(<ContactEmailCopy email={EMAIL} />);
    expect(screen.getByRole('link', { name: EMAIL })).toHaveAttribute('href', `mailto:${EMAIL}`);

    await user.click(await screen.findByRole('button', { name: '주소 복사' }));
    await expect(navigator.clipboard.readText()).resolves.toBe(EMAIL);
    expect(screen.getByRole('status')).toHaveTextContent('이메일 주소를 복사했어요.');
    expect(window.getSelection()?.toString()).toBe('');
  });

  it('클립보드가 거절하면 주소 글자를 선택해 두고 직접 복사하라고 알린다', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    render(<ContactEmailCopy email={EMAIL} />);

    await user.click(await screen.findByRole('button', { name: '주소 복사' }));
    expect(await screen.findByText('복사하지 못했어요. 주소를 선택해 두었으니 직접 복사해 주세요.')).toBeInTheDocument();
    expect(window.getSelection()?.toString()).toBe(EMAIL);
  });
});
