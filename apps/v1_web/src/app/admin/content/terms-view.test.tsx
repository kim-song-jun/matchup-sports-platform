import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
