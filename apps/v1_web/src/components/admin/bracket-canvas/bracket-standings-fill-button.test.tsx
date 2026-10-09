import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { v1Get, v1Post } = vi.hoisted(() => ({ v1Get: vi.fn(), v1Post: vi.fn() }));
vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, v1Get, v1Post };
});

import { BracketStandingsFillButton } from './bracket-standings-fill-button';

function renderButton(props: { canWrite?: boolean; slots?: Array<{ kind: string }> }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <BracketStandingsFillButton
        tournamentId="t1"
        slots={props.slots ?? [{ kind: 'ENTRY' }, { kind: 'GROUP_RANK' }]}
        teamNames={new Map()}
        canWrite={props.canWrite ?? true}
      />
    </QueryClientProvider>,
  );
}

describe('BracketStandingsFillButton', () => {
  beforeEach(() => {
    v1Get.mockReset();
    v1Post.mockReset();
    v1Get.mockResolvedValue({ slots: [] });
  });

  it('GROUP_RANK 자리가 있으면 보이고, 누르기 전에는 순위를 읽지 않는다', () => {
    renderButton({});
    expect(screen.getByRole('button', { name: '순위대로 채우기' })).toBeInTheDocument();
    expect(v1Get).not.toHaveBeenCalled();
  });

  it.each([
    ['GROUP_RANK 자리가 없는 대진(토너먼트·리그)', { slots: [{ kind: 'ENTRY' }, { kind: 'BYE' }] }],
    ['쓰기 권한이 없는 어드민', { canWrite: false }],
  ])('%s 에서는 그리지 않는다', (_name, props) => {
    renderButton(props);
    expect(screen.queryByRole('button', { name: '순위대로 채우기' })).not.toBeInTheDocument();
  });

  it('누르면 창이 열려 순위를 읽고, 취소하면 닫힌다', async () => {
    renderButton({});
    fireEvent.click(screen.getByRole('button', { name: '순위대로 채우기' }));
    expect(await screen.findByRole('dialog', { name: '순위대로 채우기' })).toBeInTheDocument();
    await waitFor(() => expect(v1Get).toHaveBeenCalledWith('/admin/tournaments/t1/slots/standings-preview'));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
