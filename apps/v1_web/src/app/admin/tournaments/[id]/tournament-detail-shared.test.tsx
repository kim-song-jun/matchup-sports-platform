import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SimpleModal } from './tournament-detail-shared';

describe('SimpleModal 높이 제한', () => {
  it('패널은 뷰포트 높이로 제한되고, 제목 줄은 고정되며 본문만 스크롤돼요', () => {
    render(
      <SimpleModal open title="명단 검토" onClose={vi.fn()}>
        <p>본문</p>
      </SimpleModal>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('max-h-[calc(var(--teameet-visual-viewport-height,100dvh)-2rem)]');
    expect(dialog.className).toContain('flex-col');

    const header = screen.getByRole('heading', { name: '명단 검토' }).parentElement!;
    expect(header.className).toContain('shrink-0');

    const body = screen.getByText('본문').parentElement!;
    expect(body.className).toContain('overflow-y-auto');
    expect(body.className).toContain('min-h-0');
  });
});
