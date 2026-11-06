import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { SixTeamTemplateDialog } from './six-team-template-dialog';

const mocks = vi.hoisted(() => ({ apply: vi.fn(), post: vi.fn() }));
vi.mock('@/hooks/use-v1-api', () => ({ useV1AdminTournamentRegistrations: () => ({ data: { items: Array.from({ length: 6 }, (_, index) => ({ id: `r${index}`, teamName: `팀 ${index + 1}`, status: 'confirmed' })) }, isPending: false, isError: false }) }));
vi.mock('@/hooks/use-v1-bracket-canvas', () => ({ useV1ApplyBracketTemplate: () => ({ mutate: mocks.apply, isPending: false }) }));
vi.mock('@/lib/api-client', () => ({ v1Post: mocks.post }));

describe('6강 템플릿 연결 대진 미리보기', () => {
  it('실제 선택한 여섯 팀과 부전승·결승 연결을 미리 보고 기존 5경기 생성 계약으로 저장한다', async () => {
    mocks.post.mockResolvedValue({ counts: { fixtures: 5 }, previewHash: 'preview-hash' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const { unmount } = render(<QueryClientProvider client={client}><SixTeamTemplateDialog open tournamentId="t1" format="knockout" hasExistingBracket={false} onClose={vi.fn()} showToast={vi.fn()} onStandard={vi.fn()} /></QueryClientProvider>);
    screen.getAllByRole('combobox').forEach((select, index) => fireEvent.change(select, { target: { value: `r${index}` } }));
    fireEvent.click(screen.getByRole('button', { name: '6강 방식 미리보기' }));
    const canvas = await screen.findByRole('region', { name: '6강부터 결승까지 대진' });
    const first = within(canvas).getByRole('region', { name: '6강' });
    for (let index = 1; index <= 6; index++) expect(first).toHaveTextContent(`팀 ${index}`);
    expect(within(canvas).getByRole('region', { name: '준결승' })).toHaveTextContent('부전승 · 결승 직행');
    expect(canvas.querySelectorAll('[data-connection]')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '6강 대진 만들기' }));
    expect(mocks.post).toHaveBeenCalledWith('/admin/tournaments/t1/bracket/template/preview', expect.objectContaining({ sixTeamMode: true, size: 6, registrationIds: ['r0', 'r1', 'r2', 'r3', 'r4', 'r5'] }));
    expect(mocks.apply).toHaveBeenCalledWith(expect.objectContaining({ sixTeamMode: true, previewHash: 'preview-hash', registrationIds: ['r0', 'r1', 'r2', 'r3', 'r4', 'r5'], replaceExisting: false }), expect.any(Object));
    unmount();
    client.clear();
  });
});
