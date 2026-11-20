import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  team: vi.fn(),
  members: vi.fn(),
  preview: vi.fn(),
  create: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace, push: vi.fn(), back: vi.fn() }) }));
vi.mock('@/hooks/use-v1-api', () => ({ useV1TeamDetail: mocks.team, useV1TeamMembers: mocks.members }));
vi.mock('@/hooks/use-team-internal-matches', () => ({
  internalMatchErrorMessage: (_err: unknown, fallback: string) => fallback,
  usePreviewInternalMatch: () => ({ mutate: mocks.preview, isPending: false }),
  useCreateInternalMatch: () => ({ mutate: mocks.create, isPending: false }),
}));

import { TeamInternalMatchFormPageClient } from './team-internal-match-form';

const members = ['가', '나', '다', '라'].map((name, i) => ({ userId: `u${i}`, displayName: name, status: 'active' }));
const previewResult = {
  seed: 0,
  sides: [
    { sideNumber: 1, name: '1팀', players: [{ userId: 'u0', name: '가' }, { userId: 'u1', name: '나' }] },
    { sideNumber: 2, name: '2팀', players: [{ userId: 'u2', name: '다' }, { userId: 'u3', name: '라' }] },
  ],
};

describe('TeamInternalMatchFormPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.team.mockReturnValue({ data: { viewer: { role: 'manager' } }, isError: false });
    mocks.members.mockReturnValue({ data: { items: members, pageInfo: { hasNext: false } }, isLoading: false, isError: false });
  });

  it('일반 팀원에게는 만들 권한이 없다고 안내한다', () => {
    mocks.team.mockReturnValue({ data: { viewer: { role: 'member' } }, isError: false });
    render(<TeamInternalMatchFormPageClient teamId="t1" />);
    expect(screen.getByText('팀 내 경기를 만들 권한이 없어요')).toBeTruthy();
    expect(screen.queryByText('자동 편성하기')).toBeNull();
  });

  it('팀 수보다 적게 고르면 편성 버튼이 막히고, 전체 선택 뒤 편성 → 옮기기 → 저장 순서로 간다', () => {
    mocks.preview.mockImplementation((_body, options) => options.onSuccess(previewResult));
    render(<TeamInternalMatchFormPageClient teamId="t1" />);
    const run = screen.getByRole('button', { name: '자동 편성하기' }) as HTMLButtonElement;
    expect(run.disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '전체 선택' }));
    expect(run.disabled).toBe(false);
    fireEvent.click(run);
    expect(mocks.preview).toHaveBeenCalledWith({ userIds: ['u0', 'u1', 'u2', 'u3'], teamCount: 2, seed: 0 }, expect.anything());

    fireEvent.change(screen.getByLabelText('나 팀 옮기기'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: '확정하고 저장' }));
    const [body] = mocks.create.mock.calls[0];
    expect(body.sides).toEqual([{ userIds: ['u0'] }, { userIds: ['u2', 'u3', 'u1'] }]);
  });

  it('한 팀을 비워 두면 저장하지 않고 안내한다', () => {
    mocks.preview.mockImplementation((_body, options) => options.onSuccess(previewResult));
    render(<TeamInternalMatchFormPageClient teamId="t1" />);
    fireEvent.click(screen.getByRole('button', { name: '전체 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '자동 편성하기' }));
    fireEvent.change(screen.getByLabelText('다 팀 옮기기'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('라 팀 옮기기'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '확정하고 저장' }));
    expect(mocks.create).not.toHaveBeenCalled();
    expect(screen.getByText('모든 팀에 선수가 1명 이상 있어야 해요.')).toBeTruthy();
  });
});
