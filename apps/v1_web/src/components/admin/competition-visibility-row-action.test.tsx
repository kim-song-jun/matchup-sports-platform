import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminVisibilityBadge } from './competition-visibility-row-action';
import { tournamentVisibilityHiddenReason } from './tournaments/tournament-visibility-control';

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

// Server `adminTournamentVisibilityWhere` (apps/v1_api tournaments-admin.service.ts) encodes the same
// rule: a row counts as 'public' in the list filter only when it is published and not cancelled.
describe('tournament list public/hidden rule', () => {
  it.each([
    [true, 'open', '공개'],
    [true, 'completed', '공개'],
    [false, 'open', '숨김'],
    [true, 'cancelled', '노출 안 됨'],
    [false, 'cancelled', '노출 안 됨'],
  ] as const)('isPublic=%s status=%s shows %s', (isPublic, status, label) => {
    const { getByText } = render(
      <AdminVisibilityBadge isPublic={isPublic} hiddenReason={tournamentVisibilityHiddenReason(status)} />,
    );
    expect(getByText(label)).toBeInTheDocument();
  });
});
