import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1SlotStandingsPreview, V1SlotStandingsPreviewRow } from '@/types/bracket-standings-fill';

const { v1Get, v1Post } = vi.hoisted(() => ({ v1Get: vi.fn(), v1Post: vi.fn() }));
vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, v1Get, v1Post };
});

import { V1ApiError } from '@/lib/api-client';
import { BracketStandingsFillDialog } from './bracket-standings-fill-dialog';

const row = (slotId: string, label: string, state: V1SlotStandingsPreviewRow['state'], extra: Partial<V1SlotStandingsPreviewRow> = {}): V1SlotStandingsPreviewRow => ({
  slotId, label, state, candidateRegistrationId: null, candidateTeamName: null, tiedRegistrationIds: [], currentRegistrationId: null, ...extra,
});
const ready = (slotId: string, label: string, regId: string, name: string, extra: Partial<V1SlotStandingsPreviewRow> = {}) =>
  row(slotId, label, 'ready', { candidateRegistrationId: regId, candidateTeamName: name, ...extra });
const tied = (slotId: string, label: string, ids: string[], extra: Partial<V1SlotStandingsPreviewRow> = {}) =>
  row(slotId, label, 'tied', { tiedRegistrationIds: ids, ...extra });

const TEAM_NAMES = new Map([['r-a', '가FC'], ['r-b', '나FC'], ['r-c', '다FC'], ['r-d', '라FC']]);
const MIXED: V1SlotStandingsPreview = {
  slots: [
    ready('s-a1', 'A조 1위', 'r-a', '가FC'),
    tied('s-a2', 'A조 2위', ['r-b', 'r-c']),
    row('s-b1', 'B조 1위', 'group_incomplete'),
  ],
};

function renderDialog(preview: V1SlotStandingsPreview | Error, props: { onClose?: () => void; onFilled?: () => void; onError?: (m: string) => void; open?: boolean } = {}) {
  if (preview instanceof Error) v1Get.mockRejectedValue(preview);
  else v1Get.mockResolvedValue(preview);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = props.onClose ?? vi.fn();
  render(
    <QueryClientProvider client={client}>
      <BracketStandingsFillDialog open={props.open ?? true} tournamentId="t1" teamNames={TEAM_NAMES} onClose={onClose} onFilled={props.onFilled} onError={props.onError} />
    </QueryClientProvider>,
  );
  return { onClose };
}
const submit = () => screen.getByRole('button', { name: '순위대로 채우기' });

describe('BracketStandingsFillDialog', () => {
  beforeEach(() => {
    v1Get.mockReset();
    v1Post.mockReset();
  });

  it('role=dialog 에 제목이 연결되고, 열릴 때 계약 경로로 순위를 읽는다', async () => {
    renderDialog(MIXED);
    const dialog = await screen.findByRole('dialog', { name: '순위대로 채우기' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await screen.findByText('A조 1위');
    expect(v1Get).toHaveBeenCalledWith('/admin/tournaments/t1/slots/standings-preview');
  });

  it('닫혀 있으면 아무것도 그리지 않고 순위도 읽지 않는다', () => {
    renderDialog(MIXED, { open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(v1Get).not.toHaveBeenCalled();
  });

  it('상태마다 다른 행: ready 는 후보, tied 는 직접 고르기, group_incomplete 는 안내 — 배지는 텍스트를 가진다', async () => {
    renderDialog(MIXED);
    const readyRow = (await screen.findByText('A조 1위')).closest('li')!;
    expect(within(readyRow).getByText('가FC')).toBeInTheDocument();
    expect(within(readyRow).getByText('순위 확정')).toBeInTheDocument();
    const tiedRow = screen.getByText('A조 2위').closest('li')!;
    expect(within(tiedRow).getByText('동률')).toBeInTheDocument();
    const select = within(tiedRow).getByLabelText('A조 2위 직접 고르기');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['팀 선택', '나FC', '다FC']);
    const pendingRow = screen.getByText('B조 1위').closest('li')!;
    expect(within(pendingRow).getByText('경기 진행 중')).toBeInTheDocument();
    expect(within(pendingRow).getByText(/조별 경기가 아직 안 끝났어요/)).toBeInTheDocument();
  });

  it('동률 자리를 고르기 전엔 채우기가 막히고 이유를 보여 준다 — 고르면 풀린다', async () => {
    renderDialog(MIXED);
    await screen.findByText('A조 1위');
    expect(submit()).toBeDisabled();
    expect(screen.getByText('동률인 자리는 팀을 골라야 채울 수 있어요.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('A조 2위 직접 고르기'), { target: { value: 'r-c' } });
    expect(submit()).toBeEnabled();
    expect(screen.queryByText('동률인 자리는 팀을 골라야 채울 수 있어요.')).not.toBeInTheDocument();
  });

  it('동률 행의 선택만 overrides 로 보내고, 성공하면 결과를 알리고 창을 닫는다', async () => {
    const result = { assignments: [{ slotId: 's-a1', registrationId: 'r-a' }, { slotId: 's-a2', registrationId: 'r-c' }], skipped: [{ slotId: 's-b1', reason: 'group_incomplete' }] };
    v1Post.mockResolvedValue(result);
    const onFilled = vi.fn();
    const { onClose } = renderDialog(MIXED, { onFilled });
    await screen.findByText('A조 1위');
    fireEvent.change(screen.getByLabelText('A조 2위 직접 고르기'), { target: { value: 'r-c' } });
    fireEvent.click(submit());
    await waitFor(() => expect(onFilled).toHaveBeenCalledWith(result));
    expect(v1Post).toHaveBeenCalledWith('/admin/tournaments/t1/slots/fill-from-standings', {
      overrides: [{ slotId: 's-a2', registrationId: 'r-c' }],
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('동률이 없으면 빈 본문으로 보낸다 (ready 는 서버가 순위로 채운다)', async () => {
    v1Post.mockResolvedValue({ assignments: [], skipped: [] });
    renderDialog({ slots: [ready('s-a1', 'A조 1위', 'r-a', '가FC'), ready('s-b1', 'B조 1위', 'r-d', '라FC')] });
    await screen.findByText('A조 1위');
    fireEvent.click(submit());
    await waitFor(() => expect(v1Post).toHaveBeenCalled());
    expect(v1Post).toHaveBeenCalledWith('/admin/tournaments/t1/slots/fill-from-standings', {});
  });

  it('1·2위가 같은 동률이면 한 자리에서 고른 팀은 다른 자리에서 고를 수 없다 (맞바꾸기)', async () => {
    v1Post.mockResolvedValue({ assignments: [], skipped: [] });
    renderDialog({
      slots: [
        tied('s-a1', 'A조 1위', ['r-a', 'r-b'], { currentRegistrationId: 'r-a' }),
        tied('s-a2', 'A조 2위', ['r-a', 'r-b'], { currentRegistrationId: 'r-b' }),
      ],
    });
    await screen.findByText('A조 1위');
    const first = screen.getByLabelText('A조 1위 직접 고르기');
    const second = screen.getByLabelText('A조 2위 직접 고르기');
    fireEvent.change(first, { target: { value: 'r-b' } });
    expect(within(second).getByRole('option', { name: '나FC' })).toBeDisabled();
    expect(within(second).getByRole('option', { name: '가FC' })).toBeEnabled();
    fireEvent.change(second, { target: { value: 'r-a' } });
    fireEvent.click(submit());
    await waitFor(() => expect(v1Post).toHaveBeenCalled());
    expect(v1Post).toHaveBeenCalledWith('/admin/tournaments/t1/slots/fill-from-standings', {
      overrides: [{ slotId: 's-a1', registrationId: 'r-b' }, { slotId: 's-a2', registrationId: 'r-a' }],
    });
  });

  it('서버가 거절하면 해요체 안내를 창 안과 onError 로 알리고 창을 닫지 않으며 선택을 유지한다', async () => {
    v1Post.mockRejectedValue(new V1ApiError({ status: 'error', timestamp: '2026-10-09T00:00:00.000Z', statusCode: 409, code: 'SLOT_LOCKED', message: '서버 원문이에요.' }));
    const onError = vi.fn();
    const { onClose } = renderDialog(MIXED, { onError });
    await screen.findByText('A조 1위');
    const select = screen.getByLabelText('A조 2위 직접 고르기');
    fireEvent.change(select, { target: { value: 'r-b' } });
    fireEvent.click(submit());
    expect(await screen.findByRole('alert')).toHaveTextContent('이미 시작했거나 결과가 있는 경기라 팀을 바꿀 수 없어요.');
    expect(onError).toHaveBeenCalledWith('이미 시작했거나 결과가 있는 경기라 팀을 바꿀 수 없어요.');
    expect(onClose).not.toHaveBeenCalled();
    expect(select).toHaveValue('r-b');
    expect(submit()).toBeEnabled();
  });

  it('이미 순위대로 들어 있으면 채우기를 막는다 — 후보가 현재와 다르면 "채우면 바뀌어요"', async () => {
    renderDialog({ slots: [ready('s-a1', 'A조 1위', 'r-a', '가FC', { currentRegistrationId: 'r-a' })] });
    await screen.findByText('A조 1위');
    expect(screen.getByText('이미 들어 있어요')).toBeInTheDocument();
    expect(submit()).toBeDisabled();
    expect(screen.getByText('바꿀 자리가 없어요. 이미 순위대로 채워져 있어요.')).toBeInTheDocument();
  });

  it('후보가 현재 팀과 다르면 바뀐다는 안내와 함께 채울 수 있다', async () => {
    renderDialog({ slots: [ready('s-a1', 'A조 1위', 'r-a', '가FC', { currentRegistrationId: 'r-d' })] });
    await screen.findByText('A조 1위');
    expect(screen.getByText(/지금은 라FC.*채우면 바뀌어요/)).toBeInTheDocument();
    expect(submit()).toBeEnabled();
  });

  it('조별 경기가 하나도 안 끝났으면 채울 수 있는 자리가 없다고 알리고 막는다', async () => {
    renderDialog({ slots: [row('s-a1', 'A조 1위', 'group_incomplete'), row('s-b1', 'B조 1위', 'group_incomplete')] });
    await screen.findByText('A조 1위');
    expect(submit()).toBeDisabled();
    expect(screen.getByText('아직 채울 수 있는 자리가 없어요. 조별 경기가 모두 끝나야 해요.')).toBeInTheDocument();
  });

  it('순위를 못 읽으면 다시 시도 버튼이 있는 오류를 보이고, 다시 시도하면 행이 나타난다', async () => {
    renderDialog(new Error('network'));
    expect(await screen.findByText('순위를 불러오지 못했어요.')).toBeInTheDocument();
    expect(submit()).toBeDisabled();
    v1Get.mockResolvedValue(MIXED);
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(await screen.findByText('A조 1위')).toBeInTheDocument();
  });
});
