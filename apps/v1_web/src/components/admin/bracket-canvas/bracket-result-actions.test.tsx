import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { makeGame } from '@/test/bracket-canvas-fixtures';
import { BracketResultActions } from './bracket-result-actions';

const mocks = vi.hoisted(() => ({
  revisions: { data: undefined as unknown, isPending: false, refetch: vi.fn() },
  createCorrection: vi.fn(),
  officialize: vi.fn(),
  voidRevision: vi.fn(),
}));

vi.mock('@/hooks/use-tournament-result-review', () => ({
  useGameResultRevisions: () => mocks.revisions,
  useCreateResultCorrection: () => ({ mutateAsync: mocks.createCorrection, isPending: false }),
  useOfficializeResultRevision: () => ({ mutateAsync: mocks.officialize, isPending: false }),
  useVoidResultRevision: () => ({ mutateAsync: mocks.voidRevision, isPending: false }),
}));

const STAMP = '2026-10-08T00:00:00.000Z';
const revision = (overrides: Record<string, unknown>) => ({
  id: 'rev-1',
  gameId: 'game-1',
  revision: 1,
  state: 'OFFICIAL',
  score: { home: 2, away: 1 },
  goalEvents: null,
  eventsHash: 'hash-empty',
  missingScorer: false,
  mvpParticipantId: null,
  reason: '[quick-result]',
  outcomeReason: 'NORMAL',
  outcomeNote: null,
  createdByActorType: 'USER',
  createdByUserId: 'admin-1',
  createdBySystemActor: null,
  supersedesId: null,
  submittedAt: STAMP,
  officialAt: STAMP,
  createdAt: STAMP,
  updatedAt: STAMP,
  resultParticipants: [
    {
      id: 'row-1',
      resultRevisionId: 'rev-1',
      participantId: 'p-1',
      sideId: 'side-home',
      started: true,
      minutesPlayed: null,
      goals: 0,
      assists: 0,
      fouls: 0,
      cards: { yellow: 0, red: 0 },
      goalkeeper: false,
      displayName: '김선수',
      jerseyNumber: 7,
    },
  ],
  ...overrides,
});

const officialGame = (overrides = {}) =>
  makeGame({
    id: 'game-1',
    state: 'ENDED',
    version: 5,
    latestRevision: { id: 'rev-1', state: 'OFFICIAL', entryMethod: 'quick', score: { home: 2, away: 1 } },
    ...overrides,
  });

function renderActions(overrides: Partial<React.ComponentProps<typeof BracketResultActions>> = {}) {
  const props = {
    tournamentId: 't-1',
    fixtureId: 'f-1',
    game: officialGame(),
    isKnockout: true,
    homeLabel: '서울FC',
    awayLabel: '부산FC',
    canWrite: true,
    showToast: vi.fn(),
    ...overrides,
  };
  render(<BracketResultActions {...props} />);
  return props;
}

function apiError(code: string) {
  return new V1ApiError({
    statusCode: 409,
    code,
    message: '서버 원문이에요.',
    details: null,
    requestId: 'req',
    timestamp: STAMP,
  } as unknown as ConstructorParameters<typeof V1ApiError>[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.revisions.data = [revision({})];
  mocks.revisions.isPending = false;
  mocks.revisions.refetch.mockResolvedValue({ data: [revision({})] });
  mocks.createCorrection.mockResolvedValue({ revisionId: 'rev-2', version: 6 });
  mocks.officialize.mockResolvedValue({});
  mocks.voidRevision.mockResolvedValue({});
});

describe('BracketResultActions — 분기', () => {
  it('확정된 결과: 현재 상태·점수와 "점수 고치기"·"결과 무효"를 보여 준다', () => {
    renderActions();
    expect(screen.getByText(/공식 확정 · 2:1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '점수 고치기' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '결과 무효' })).toBeEnabled();
  });

  it('읽기 전용 화면에는 쓰기 버튼이 없다', () => {
    renderActions({ canWrite: false });
    expect(screen.getByText(/공식 확정 · 2:1/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '점수 고치기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '결과 무효' })).not.toBeInTheDocument();
  });

  it('라이브 득점 기록이 있는 경기는 고치기·무효 대신 정정 화면 링크만 준다', () => {
    renderActions({ game: officialGame({ hasLiveRecords: true }) });
    expect(screen.getByRole('link', { name: '결과 정정 화면 열기' })).toHaveAttribute(
      'href',
      '/admin/live/t-1/records/corrections?fixtureId=f-1',
    );
    expect(screen.queryByRole('button', { name: '점수 고치기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '결과 무효' })).not.toBeInTheDocument();
  });

  it('결과를 아직 못 불러왔으면 고치기 버튼을 잠근다', () => {
    mocks.revisions.isPending = true;
    mocks.revisions.data = undefined;
    renderActions();
    expect(screen.getByRole('button', { name: '점수 고치기' })).toBeDisabled();
  });
});

describe('BracketResultActions — 점수 고치기(정정 → 확정)', () => {
  async function startCorrection(home = '3', away = '1') {
    fireEvent.click(screen.getByRole('button', { name: '점수 고치기' }));
    fireEvent.change(screen.getByLabelText('서울FC 점수'), { target: { value: home } });
    fireEvent.change(screen.getByLabelText('부산FC 점수'), { target: { value: away } });
    fireEvent.click(screen.getByRole('button', { name: '고칠 점수 확인' }));
    return screen.findByRole('dialog');
  }

  it('사유를 입력하면 정정을 만들고, 그 초안을 서버가 준 값 그대로 이어서 확정한다', async () => {
    mocks.revisions.refetch.mockResolvedValue({
      data: [revision({}), revision({ id: 'rev-2', revision: 2, state: 'DRAFT', score: { home: 3, away: 1 }, supersedesId: 'rev-1' })],
    });
    const props = renderActions();
    const dialog = await startCorrection();
    fireEvent.change(within(dialog).getByLabelText('정정 사유'), { target: { value: '점수를 잘못 넣었어요' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '정정 확정' }));

    await waitFor(() => expect(mocks.officialize).toHaveBeenCalledTimes(1));
    expect(mocks.createCorrection).toHaveBeenCalledWith({
      expectedVersion: 5,
      baseRevisionId: 'rev-1',
      reason: '점수를 잘못 넣었어요',
      changes: {
        score: { home: 3, away: 1 },
        actualParticipants: [
          { participantId: 'p-1', sideId: 'side-home', started: true, goals: 0, assists: 0, fouls: 0, cards: { yellow: 0, red: 0 }, goalkeeper: false },
        ],
        eventsHash: 'hash-empty',
      },
    });
    // 확정 요청은 정정 응답의 새 version 과, 다시 읽은 초안의 점수·해시를 쓴다.
    expect(mocks.officialize).toHaveBeenCalledWith({
      revisionId: 'rev-2',
      expectedVersion: 6,
      score: { home: 3, away: 1 },
      goalEvents: null,
      eventsHash: 'hash-empty',
      mvpParticipantId: null,
    });
    expect(mocks.createCorrection.mock.invocationCallOrder[0]).toBeLessThan(mocks.officialize.mock.invocationCallOrder[0]);
    await waitFor(() => expect(props.showToast).toHaveBeenCalledWith('점수를 고쳤어요.', 'success'));
  });

  it('사유가 비어 있으면 정정 확정 버튼이 눌리지 않는다', async () => {
    renderActions();
    const dialog = await startCorrection();
    expect(within(dialog).getByRole('button', { name: '정정 확정' })).toBeDisabled();
    expect(mocks.createCorrection).not.toHaveBeenCalled();
  });

  it('다음 경기가 이미 시작돼 확정이 막히면 이유와 "정정 초안이 남아 있어요"를 모달 안에 보여 주고 닫지 않는다', async () => {
    mocks.revisions.refetch.mockResolvedValue({
      data: [revision({}), revision({ id: 'rev-2', revision: 2, state: 'DRAFT', score: { home: 3, away: 1 } })],
    });
    mocks.officialize.mockRejectedValue(apiError('NEXT_FIXTURE_CONFLICT'));
    const props = renderActions();
    const dialog = await startCorrection();
    fireEvent.change(within(dialog).getByLabelText('정정 사유'), { target: { value: '오입력' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '정정 확정' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('다음 경기가 이미 시작돼서 바꿀 수 없어요.');
    expect(alert).toHaveTextContent('정정 초안은 남아 있어요');
    expect(props.showToast).not.toHaveBeenCalledWith('점수를 고쳤어요.', 'success');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('정정 생성 단계에서 막히면 초안 안내 없이 서버 이유만 보여 준다', async () => {
    mocks.createCorrection.mockRejectedValue(apiError('VERSION_CONFLICT'));
    renderActions();
    const dialog = await startCorrection();
    fireEvent.change(within(dialog).getByLabelText('정정 사유'), { target: { value: '오입력' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '정정 확정' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('경기 정보가 그 사이 바뀌었어요. 화면을 새로고침해 주세요.');
    expect(alert).not.toHaveTextContent('정정 초안');
    expect(mocks.officialize).not.toHaveBeenCalled();
  });
});

describe('BracketResultActions — 결과 무효', () => {
  it('사유를 받아 현재 확정 리비전을 무효로 처리한다', async () => {
    const props = renderActions();
    fireEvent.click(screen.getByRole('button', { name: '결과 무효' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('무효 사유'), { target: { value: '다른 경기 결과였어요' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '무효로 처리' }));
    await waitFor(() =>
      expect(mocks.voidRevision).toHaveBeenCalledWith({ revisionId: 'rev-1', expectedVersion: 5, reason: '다른 경기 결과였어요' }),
    );
    await waitFor(() => expect(props.showToast).toHaveBeenCalledWith('결과를 무효로 처리했어요.', 'success'));
  });

  it('다음 경기가 이미 시작됐으면 무효가 거절되고 이유를 모달에 보여 준다', async () => {
    mocks.voidRevision.mockRejectedValue(apiError('NEXT_FIXTURE_CONFLICT'));
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: '결과 무효' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('무효 사유'), { target: { value: '사유' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '무효로 처리' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('다음 경기가 이미 시작돼서 바꿀 수 없어요.');
  });
});

describe('BracketResultActions — 확정 전 결과 확정', () => {
  const pendingGame = () =>
    makeGame({
      id: 'game-1',
      state: 'ENDED',
      version: 5,
      latestRevision: { id: 'rev-3', state: 'DRAFT', entryMethod: 'correction', score: { home: 0, away: 0 } },
    });

  it('최신 값을 다시 읽어 확인 문구와 확정 요청에 같은 값을 쓴다', async () => {
    // 화면 캐시는 0:0 이지만 서버의 최신은 4:2 — 되돌릴 수 없는 확정에서 낡은 값을 보여 주면 안 된다.
    mocks.revisions.data = [revision({ id: 'rev-3', state: 'DRAFT', score: { home: 0, away: 0 } })];
    mocks.revisions.refetch.mockResolvedValue({ data: [revision({ id: 'rev-3', state: 'DRAFT', score: { home: 4, away: 2 } })] });
    renderActions({ game: pendingGame() });
    expect(screen.queryByRole('button', { name: '점수 고치기' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '결과 확정' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('4:2 결과를 공식 결과로 확정해요');
    fireEvent.click(within(dialog).getByRole('button', { name: '확정' }));

    await waitFor(() => expect(mocks.officialize).toHaveBeenCalledTimes(1));
    expect(mocks.officialize).toHaveBeenCalledWith({
      revisionId: 'rev-3',
      expectedVersion: 5,
      score: { home: 4, away: 2 },
      goalEvents: null,
      eventsHash: 'hash-empty',
      mvpParticipantId: null,
    });
  });

  it('확인 모달에서 취소하면 확정 요청을 보내지 않는다', async () => {
    mocks.revisions.refetch.mockResolvedValue({ data: [revision({ id: 'rev-3', state: 'DRAFT' })] });
    renderActions({ game: pendingGame() });
    fireEvent.click(screen.getByRole('button', { name: '결과 확정' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.officialize).not.toHaveBeenCalled();
  });
});
