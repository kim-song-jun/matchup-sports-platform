import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_MATCH_VISIBILITY_MSW } from '@/test/msw/admin-match-visibility-handlers';
import { server } from '@/test/msw/server';
import type { V1AdminMatchDetail } from '@/types/api';
import { AdminMatchHiddenBanner, AdminMatchVisibilityCard } from './admin-match-visibility';

const VISIBLE: V1AdminMatchDetail = {
  matchId: 'match-1',
  title: '평일 저녁 테스트',
  sportName: '풋살',
  sportCode: 'futsal',
  hostUserId: 'host-1',
  hostName: '시험 주최자',
  placeName: '시험 구장',
  startAt: '2026-09-11T09:30:00.000Z',
  status: 'recruiting',
  participantCount: 1,
  maxParticipants: 2,
  createdAt: '2026-09-10T00:00:00.000Z',
  description: null,
  regionName: null,
  deadlineAt: null,
  applicationCount: 0,
  hiddenAt: null,
  hiddenBy: null,
  hiddenReason: null,
  hiddenByName: null,
  canUnhide: false,
  hideBlocked: false,
};
const HIDDEN_BY_ADMIN: V1AdminMatchDetail = {
  ...VISIBLE,
  hiddenAt: '2026-11-22T08:05:00.000Z',
  hiddenBy: 'admin',
  hiddenReason: '운영 시험용 경기',
  hiddenByName: '운영자',
  canUnhide: true,
};
const HIDDEN_BY_HOST: V1AdminMatchDetail = { ...VISIBLE, hiddenAt: '2026-10-01T00:00:00.000Z', hiddenBy: 'host' };

let client: QueryClient;
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  server.use(http.post('*/api/v1/logs/client-error', () => HttpResponse.json({ status: 'success', data: {} })));
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});

function renderCard(match: V1AdminMatchDetail, canWrite = true) {
  const onToast = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <AdminMatchVisibilityCard match={match} canWrite={canWrite} onToast={onToast} />
    </QueryClientProvider>,
  );
  return onToast;
}

describe('AdminMatchVisibilityCard — 숨기기', () => {
  it('사유가 비어 있는 동안 확인 버튼이 잠기고, 사유를 쓰면 숨기고 토스트로 알린다', async () => {
    const user = userEvent.setup();
    const onToast = renderCard(VISIBLE);

    await user.click(screen.getByRole('button', { name: '이 매치 숨기기' }));
    const dialog = await screen.findByRole('dialog', { name: '매치 숨기기' });
    const submit = within(dialog).getByRole('button', { name: '숨기기' });
    expect(submit).toBeDisabled();
    expect(within(dialog).getByText('사유를 입력하면 진행할 수 있어요.')).toBeInTheDocument();
    expect(within(dialog).getByText('0/500')).toBeInTheDocument();

    // 공백만 있는 사유도 비어 있는 것으로 본다.
    await user.type(within(dialog).getByLabelText('숨기는 사유'), '   ');
    expect(submit).toBeDisabled();

    // 서버 DTO 는 앞뒤 공백이 남은 사유를 400 으로 거절한다 — 성공하면 trim 해서 보냈다는 뜻이다.
    await user.type(within(dialog).getByLabelText('숨기는 사유'), '운영 시험용 ');
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(onToast).toHaveBeenCalledWith('매치를 숨겼어요.'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('참가자가 있어 서버가 409 로 거절하면 모달을 닫지 않고 서버 문구를 보인다', async () => {
    const user = userEvent.setup();
    const onToast = renderCard({ ...VISIBLE, matchId: ADMIN_MATCH_VISIBILITY_MSW.hasParticipantsMatchId });

    await user.click(screen.getByRole('button', { name: '이 매치 숨기기' }));
    const dialog = await screen.findByRole('dialog', { name: '매치 숨기기' });
    await user.type(within(dialog).getByLabelText('숨기는 사유'), '정리');
    await user.click(within(dialog).getByRole('button', { name: '숨기기' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('신청자나 확정 참가자가 있는 진행 예정 매치는 숨길 수 없어요. 먼저 매치를 취소해 주세요.');
    expect(onToast).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '매치 숨기기' })).toBeInTheDocument();
  });

  it('권한 오류는 영어 서버 문구 대신 화면 문구로 보인다', async () => {
    const user = userEvent.setup();
    renderCard({ ...VISIBLE, matchId: ADMIN_MATCH_VISIBILITY_MSW.forbiddenMatchId });

    await user.click(screen.getByRole('button', { name: '이 매치 숨기기' }));
    const dialog = await screen.findByRole('dialog', { name: '매치 숨기기' });
    await user.type(within(dialog).getByLabelText('숨기는 사유'), '정리');
    await user.click(within(dialog).getByRole('button', { name: '숨기기' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('권한이 없어요.');
  });

  it('참가자·신청이 있는 진행 예정 매치는 버튼을 막고 먼저 취소하라고 안내한다', async () => {
    const user = userEvent.setup();
    renderCard({ ...VISIBLE, hideBlocked: true });

    const button = screen.getByRole('button', { name: '이 매치 숨기기' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/먼저 목록의 「상태 변경」에서 매치를 취소해 주세요/);
    await user.click(button);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('쓰기 권한이 없는 계정(support)은 버튼이 잠기고 이유를 안내받는다', () => {
    renderCard(VISIBLE, false);
    const button = screen.getByRole('button', { name: '이 매치 숨기기' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('현재 계정은 매치 공개 상태를 바꿀 권한이 없어요.');
  });
});

describe('AdminMatchVisibilityCard — 다시 공개하기', () => {
  it('숨긴 매치는 숨기기 대신 다시 공개하기가 보이고, 사유를 받아 공개한다', async () => {
    const user = userEvent.setup();
    const onToast = renderCard(HIDDEN_BY_ADMIN);

    expect(screen.queryByRole('button', { name: '이 매치 숨기기' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다시 공개하기' }));
    const dialog = await screen.findByRole('dialog', { name: '매치 다시 공개하기' });
    expect(within(dialog).getByRole('button', { name: '다시 공개' })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('다시 공개하는 사유'), '실제 경기라 되돌려요');
    await user.click(within(dialog).getByRole('button', { name: '다시 공개' }));

    await waitFor(() => expect(onToast).toHaveBeenCalledWith('매치를 다시 공개했어요.'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('주최자가 직접 삭제한 매치는 다시 공개 버튼 없이 이유만 안내한다', () => {
    renderCard(HIDDEN_BY_HOST);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('주최자가 직접 삭제한 매치는 어드민에서 다시 공개할 수 없어요.')).toBeInTheDocument();
  });

  it('서버가 이미 공개된 매치라고 거절하면 그 문구를 모달에 보인다', async () => {
    const user = userEvent.setup();
    renderCard({ ...HIDDEN_BY_ADMIN, matchId: ADMIN_MATCH_VISIBILITY_MSW.notHiddenMatchId });

    await user.click(screen.getByRole('button', { name: '다시 공개하기' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('다시 공개하는 사유'), '확인');
    await user.click(within(dialog).getByRole('button', { name: '다시 공개' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('숨겨진 매치가 아니에요.');
  });
});

describe('AdminMatchHiddenBanner', () => {
  it('어드민이 숨긴 매치는 시각·처리자·사유를 보인다', () => {
    render(<AdminMatchHiddenBanner match={HIDDEN_BY_ADMIN} />);
    const banner = screen.getByRole('status', { name: '숨김 안내' });
    expect(banner).toHaveTextContent('숨긴 매치예요');
    expect(banner).toHaveTextContent('처리자 운영자');
    expect(banner).toHaveTextContent('사유: 운영 시험용 경기');
  });

  it('주최자가 삭제한 매치는 사유·처리자 없이 삭제 안내만 보인다', () => {
    render(<AdminMatchHiddenBanner match={HIDDEN_BY_HOST} />);
    const banner = screen.getByRole('status', { name: '숨김 안내' });
    expect(banner).toHaveTextContent('주최자가 삭제한 매치예요');
    expect(banner).not.toHaveTextContent('처리자');
  });

  it('숨기지 않은 매치에는 나오지 않는다', () => {
    render(<AdminMatchHiddenBanner match={VISIBLE} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
