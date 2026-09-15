import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BlockedAction } from './blocked-action';

describe('BlockedAction', () => {
  it('reads the reason out with the button instead of leaving it beside it', () => {
    render(<BlockedAction label="접수 마감" reason="신청이 마감돼서 새로 신청할 수 없어요." />);

    const button = screen.getByRole('button', { name: /접수 마감/ });
    expect(button).toBeDisabled();

    // 이유가 화면 어딘가에 있는 것으로는 부족하다 — 보조기술이 버튼을 읽을 때
    // 함께 읽어야 한다. 연결이 끊기면 터치 기기 사용자는 이유를 얻지 못한다.
    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toBe(
      '신청이 마감돼서 새로 신청할 수 없어요.',
    );
  });

  it('gives each instance its own reason so two blocked actions do not cross-wire', () => {
    render(
      <>
        <BlockedAction label="접수 마감" reason="신청이 마감돼서 새로 신청할 수 없어요." />
        <BlockedAction label="모집 마감" reason="정원이 가득 차서 새로 신청할 수 없어요." />
      </>,
    );

    const [first, second] = screen.getAllByRole('button');
    const firstReason = document.getElementById(first.getAttribute('aria-describedby') as string);
    const secondReason = document.getElementById(second.getAttribute('aria-describedby') as string);

    expect(firstReason?.textContent).toBe('신청이 마감돼서 새로 신청할 수 없어요.');
    expect(secondReason?.textContent).toBe('정원이 가득 차서 새로 신청할 수 없어요.');
  });
});
