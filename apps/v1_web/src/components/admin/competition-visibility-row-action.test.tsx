import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminVisibilityBadge } from './competition-visibility-row-action';

// lucide icons carry a distinguishing class: Eye -> lucide-eye, EyeOff -> lucide-eye-off.
function iconClass(container: HTMLElement) {
  return container.querySelector('svg')?.getAttribute('class') ?? '';
}

describe('AdminVisibilityBadge', () => {
  it('공개 행만 열린 눈 아이콘을 쓴다', () => {
    const { container, getByText } = render(<AdminVisibilityBadge isPublic />);
    expect(getByText('공개')).toBeInTheDocument();
    expect(iconClass(container)).toMatch(/lucide-eye(?!-off)/);
  });

  it('숨김 행은 눈 감은 아이콘을 쓴다', () => {
    const { container, getByText } = render(<AdminVisibilityBadge isPublic={false} />);
    expect(getByText('숨김')).toBeInTheDocument();
    expect(iconClass(container)).toContain('lucide-eye-off');
  });

  it('취소된 대회처럼 노출 안 됨이면 공개 플래그가 켜져 있어도 눈 감은 아이콘을 쓴다', () => {
    const { container, getByText } = render(<AdminVisibilityBadge isPublic hiddenReason="취소된 대회예요" />);
    expect(getByText('노출 안 됨')).toBeInTheDocument();
    expect(iconClass(container)).toContain('lucide-eye-off');
  });
});
