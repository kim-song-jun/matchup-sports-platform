import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1AdminTermsPolicy } from '@/types/api';
import { TermsView } from './terms-view';

const policy: V1AdminTermsPolicy = {
  policyId: 'policy-1',
  code: 'signup_marketing',
  name: '마케팅 수신 동의',
  isActive: true,
  currentDocumentId: 'doc-1',
  placements: [
    { placementId: 'pl-1', context: 'signup', requirement: 'optional', displayOrder: 3, isActive: true },
    { placementId: 'pl-2', context: 'footer', requirement: 'display_only', displayOrder: 7, isActive: true },
  ],
  documents: [
    {
      documentId: 'doc-1',
      version: 'v1.0',
      title: '마케팅 수신 동의',
      subtitle: null,
      content: '본문',
      contentHash: 'hash-1',
      changeSummary: null,
      effectiveAt: null,
      requiresReconsent: false,
      enforcementAt: null,
      status: 'draft',
      publishedAt: null,
      archivedAt: null,
      supersedesDocumentId: null,
      consentEventCount: 0,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
  ],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const idle = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };

beforeEach(() => vi.clearAllMocks());

vi.mock('@/hooks/use-admin-can-write', () => ({ useAdminCanWrite: () => true }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTerms: () => ({
    data: { items: [policy] },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useV1UpdateAdminTermsPolicy: () => idle,
  useV1CreateAdminTermsPolicy: () => idle,
  useV1CreateAdminTermsVersion: () => idle,
  useV1UpdateAdminTermsDraft: () => idle,
  useV1ChangeAdminTermsStatus: () => idle,
}));

describe('TermsView 노출 위치 행의 접근 가능한 이름', () => {
  it('행마다 노출 위치·동의 유형·노출 순서가 고유한 이름으로 찾힌다', () => {
    render(<TermsView />);

    // 목록 필터 select 도 "노출 위치 필터" 라 정확히 일치하는 이름만 센다.
    const contexts = screen.getAllByRole('combobox', { name: '노출 위치' });
    const requirements = screen.getAllByRole('combobox', { name: '동의 유형' });
    const orders = screen.getAllByRole('spinbutton', { name: '노출 순서' });
    expect(contexts).toHaveLength(2);
    expect(requirements).toHaveLength(2);
    expect(orders.map((el) => (el as HTMLInputElement).value)).toEqual(['3', '7']);
    expect(contexts[1]).toHaveValue('footer');
    expect(requirements[1]).toHaveValue('display_only');
  });
});

describe('TermsView 노출 위치 행의 키보드 포커스', () => {
  // jsdom은 native select Arrow키 선택을 구현하지 않는다. 실제 change는
  // selectOptions로 발생시키고, Tab/ShiftTab과 변경 후 DOM focus를 검증한다.
  it('새 약관에서 Tab으로 진입한 위치 입력이 연속 변경 후에도 포커스와 다음 Tab 순서를 유지한다', async () => {
    const user = userEvent.setup();
    render(<TermsView />);
    await user.click(screen.getByRole('button', { name: '새 약관' }));

    const context = screen.getByRole('combobox', { name: '노출 위치' });
    const requirement = screen.getByRole('combobox', { name: '동의 유형' });
    const order = screen.getByRole('spinbutton', { name: '노출 순서' });
    await user.click(screen.getByRole('textbox', { name: '관리 이름' }));
    await user.tab();
    expect(context).toHaveFocus();

    for (const value of ['tournament_application', 'footer', 'signup', 'tournament_application', 'signup']) {
      await user.selectOptions(context, value);
      expect(context).toHaveFocus();
      expect(screen.getByRole('combobox', { name: '노출 위치' })).toBe(context);
      expect(screen.getByRole('combobox', { name: '동의 유형' })).toBe(requirement);
      expect(screen.getByRole('spinbutton', { name: '노출 순서' })).toBe(order);
      expect(context).toHaveValue(value);
      expect(requirement).toHaveValue(value === 'footer' ? 'display_only' : 'required');
      expect(Array.from((requirement as HTMLSelectElement).options, (option) => option.value))
        .toEqual(value === 'footer' ? ['display_only'] : ['required', 'optional']);
      expect(order).toHaveValue(0);
    }

    await user.keyboard('{Escape}');
    expect(context).toHaveFocus();
    await user.tab();
    expect(requirement).toHaveFocus();
    await user.tab();
    expect(order).toHaveFocus();
    await user.tab({ shift: true });
    expect(requirement).toHaveFocus();
    await user.tab({ shift: true });
    expect(context).toHaveFocus();
    expect(idle.mutate).not.toHaveBeenCalled();
    expect(idle.mutateAsync).not.toHaveBeenCalled();
  });

  it.each([0, 1])('기존 약관의 %i번 위치 변경은 포커스와 다른 행의 값·노드를 유지한다', async (index) => {
    const user = userEvent.setup();
    render(<TermsView />);
    const contexts = screen.getAllByRole('combobox', { name: '노출 위치' });
    const requirements = screen.getAllByRole('combobox', { name: '동의 유형' });
    const orders = screen.getAllByRole('spinbutton', { name: '노출 순서' });
    const otherIndex = 1 - index;
    const other = policy.placements[otherIndex];

    await user.click(contexts[index]);
    for (const value of ['tournament_application', 'footer', 'signup']) {
      await user.selectOptions(contexts[index], value);
      expect(contexts[index]).toHaveFocus();
      for (const rowIndex of [0, 1]) {
        expect(screen.getAllByRole('combobox', { name: '노출 위치' })[rowIndex]).toBe(contexts[rowIndex]);
        expect(screen.getAllByRole('combobox', { name: '동의 유형' })[rowIndex]).toBe(requirements[rowIndex]);
        expect(screen.getAllByRole('spinbutton', { name: '노출 순서' })[rowIndex]).toBe(orders[rowIndex]);
      }
      expect(contexts[index]).toHaveValue(value);
      expect(requirements[index]).toHaveValue(value === 'footer' ? 'display_only' : 'required');
      expect(orders[index]).toHaveValue(policy.placements[index].displayOrder);
      expect(contexts[otherIndex]).toHaveValue(other.context);
      expect(requirements[otherIndex]).toHaveValue(other.requirement);
      expect(orders[otherIndex]).toHaveValue(other.displayOrder);
    }
    expect(idle.mutate).not.toHaveBeenCalled();
    expect(idle.mutateAsync).not.toHaveBeenCalled();
  });

  it('동의 유형 연속 선택·노출 순서 입력은 포커스와 로컬 값만 변경한다', async () => {
    const user = userEvent.setup();
    render(<TermsView />);
    await user.click(screen.getByRole('button', { name: '새 약관' }));
    const context = screen.getByRole('combobox', { name: '노출 위치' });
    const requirement = screen.getByRole('combobox', { name: '동의 유형' });
    const order = screen.getByRole('spinbutton', { name: '노출 순서' });
    for (const value of ['optional', 'required']) {
      await user.selectOptions(requirement, value);
      expect(requirement).toHaveFocus();
      expect(requirement).toHaveValue(value);
      expect(context).toHaveValue('signup');
    }
    await user.tab();
    expect(order).toHaveFocus();
    await user.clear(order);
    await user.type(order, '12');
    expect(order).toHaveValue(12);
    expect(order).toHaveFocus();
    expect(context).toHaveValue('signup');
    expect(requirement).toHaveValue('required');
    expect(idle.mutate).not.toHaveBeenCalled();
    expect(idle.mutateAsync).not.toHaveBeenCalled();
  });
});
