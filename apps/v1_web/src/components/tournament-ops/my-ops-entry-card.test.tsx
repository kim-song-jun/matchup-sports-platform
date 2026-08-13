import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MyOpsEntryCard } from './my-ops-entry-card';

/**
 * 마이페이지 진입점의 계약: **배정이 있는 사람에게만** 보인다. 운영과 무관한 사용자에게
 * 운영 콘솔 링크가 노출되면 그 자체가 과다 노출이므로 양방향으로 확인한다.
 */

const mocks = vi.hoisted(() => ({ useV1MyStaffAssignments: vi.fn() }));

vi.mock('@/hooks/use-v1-my-staff-assignments', () => ({
  useV1MyStaffAssignments: () => mocks.useV1MyStaffAssignments(),
}));

describe('MyOpsEntryCard', () => {
  beforeEach(() => {
    mocks.useV1MyStaffAssignments.mockReset();
  });

  it('배정이 있으면 내 대회 운영으로 가는 링크를 보여준다', () => {
    mocks.useV1MyStaffAssignments.mockReturnValue({
      data: {
        items: [
          {
            assignmentId: 'a-1',
            role: 'FIELD_OPERATOR',
            fixtures: [{ fixtureId: 'fx-1' }, { fixtureId: 'fx-2' }],
          },
        ],
      },
    });

    render(<MyOpsEntryCard />);

    expect(screen.getByRole('link', { name: '바로가기' })).toHaveAttribute('href', '/tournament-ops');
    expect(screen.getByText('대회 1건 · 담당 경기 2건')).toBeInTheDocument();
  });

  it('배정이 없으면 아무것도 그리지 않는다', () => {
    mocks.useV1MyStaffAssignments.mockReturnValue({ data: { items: [] } });

    const { container } = render(<MyOpsEntryCard />);

    expect(container).toBeEmptyDOMElement();
  });

  it('조회가 끝나기 전/실패했을 때도 링크를 노출하지 않는다', () => {
    mocks.useV1MyStaffAssignments.mockReturnValue({ data: undefined });

    const { container } = render(<MyOpsEntryCard />);

    expect(container).toBeEmptyDOMElement();
  });
});
