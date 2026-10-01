import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RootTemplate from './template';

// view-transition-name 이 붙은 요소는 전환 중이 아니어도 스태킹 컨텍스트가 된다 — 래퍼에 상시로
// 두면 페이지 안 시트·모달이 z-index 와 무관하게 상단바·탭바·FAB 아래에 깔린다(W5 alpha 실측).
describe('RootTemplate', () => {
  it('전환 래퍼에 view-transition-name 을 인라인으로 박아 두지 않는다', () => {
    const { container } = render(<RootTemplate><p>본문</p></RootTemplate>);
    const wrapper = container.firstElementChild as HTMLElement;

    expect(wrapper).toHaveClass('tm-page-transition-enter');
    expect(wrapper.getAttribute('style')).toBeNull();
    expect((wrapper.style as unknown as Record<string, string | undefined>).viewTransitionName ?? '').toBe('');
  });
});
