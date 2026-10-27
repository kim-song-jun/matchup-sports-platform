import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CompetitionVisibilityControl } from './competition-visibility-control';

vi.mock('@/hooks/use-admin-can-write', () => ({ useAdminCanWrite: () => true }));

describe('CompetitionVisibilityControl', () => {
  it('공개 안내는 한글 어절을 유지하고 긴 끊김 없는 문장도 감쌀 수 있다', () => {
    const note = `접수를 시작하면 공개돼요. ${'A'.repeat(200)}`;
    function Control() {
      const mutation = useMutation({ mutationFn: async (_input: { isPublic: boolean }) => undefined });
      return <CompetitionVisibilityControl isPublic publicDescription="공개 중이에요." privateDescription="비공개예요." exposureNote={note} mutation={mutation} />;
    }
    render(<QueryClientProvider client={new QueryClient()}><Control /></QueryClientProvider>);
    expect(screen.getByText(note)).toHaveStyle({ wordBreak: 'keep-all', overflowWrap: 'anywhere' });
    expect(screen.getByRole('button', { name: '비공개로 전환' })).toBeEnabled();
  });
});
