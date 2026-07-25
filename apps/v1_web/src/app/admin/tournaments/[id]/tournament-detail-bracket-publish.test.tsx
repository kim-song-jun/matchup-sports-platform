/**
 * Task 109 Track 6 — 대진표 전체 공개 버튼 + 확인 모달 계약 테스트.
 * 실제로 검증하는 것: (1) canWrite && 미공개일 때만 버튼 노출, (2) 접수마감 전에는
 * 확인 모달에 경고 문구가 포함, (3) 확인 시 publishBracket mutate 호출, (4) 이미 공개된
 * 경우 버튼이 사라지고 공개 시각 안내로 대체된다.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1AdminTournamentBracket } from '@/types/api';
import {
  useV1AdminBracket,
  useV1AdminTournamentPlayers,
  useV1AssignGroupTeam,
  useV1CreateFixture,
  useV1CreateGroup,
  useV1DeleteFixture,
  useV1DeleteFixtureResult,
  useV1DeleteGroup,
  useV1PublishTournamentBracket,
  useV1UnpublishTournamentBracket,
  useV1RecalculateStandings,
  useV1RecordResult,
  useV1RemoveGroupTeam,
  useV1UpdateFixture,
  useV1UpdateGroup,
  useV1UploadVideo,
} from '@/hooks/use-v1-api';
import { BracketTab } from './tournament-detail-client';

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminBracket: vi.fn(),
  useV1AdminTournamentPlayers: vi.fn(),
  useV1CreateGroup: vi.fn(),
  useV1AssignGroupTeam: vi.fn(),
  useV1CreateFixture: vi.fn(),
  useV1RecordResult: vi.fn(),
  useV1RecalculateStandings: vi.fn(),
  useV1UpdateFixture: vi.fn(),
  useV1DeleteFixture: vi.fn(),
  useV1DeleteFixtureResult: vi.fn(),
  useV1UpdateGroup: vi.fn(),
  useV1DeleteGroup: vi.fn(),
  useV1PublishTournamentBracket: vi.fn(),
  useV1UnpublishTournamentBracket: vi.fn(),
  useV1RemoveGroupTeam: vi.fn(),
  useV1UploadVideo: vi.fn(),
}));

function noopMutationHook<T>(): T {
  return { mutate: vi.fn(), isPending: false } as unknown as T;
}

const emptyBracket: V1AdminTournamentBracket = { groups: [], fixtures: [], standings: [] };

// 공개·예약은 조가 하나라도 있어야 열린다(빈 대진표 공개 사고 방지). 공개 흐름을 검증하는
// 케이스는 조가 있는 대진표를 기본으로 쓴다.
const bracketWithGroup = {
  groups: [
    {
      id: 'group-1',
      tournamentId: 'tournament-1',
      name: 'A조',
      phase: 'group',
      sortOrder: 0,
      advanceCount: 2,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      groupTeams: [],
    },
  ],
  fixtures: [],
  standings: [],
} as unknown as V1AdminTournamentBracket;

describe('BracketTab — 대진표 전체 공개', () => {
  const showToast = vi.fn();

  beforeEach(() => {
    vi.mocked(useV1AdminBracket).mockReturnValue({
      data: bracketWithGroup,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useV1AdminBracket>);
    vi.mocked(useV1AdminTournamentPlayers).mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useV1AdminTournamentPlayers>);
    vi.mocked(useV1CreateGroup).mockReturnValue(noopMutationHook());
    vi.mocked(useV1AssignGroupTeam).mockReturnValue(noopMutationHook());
    vi.mocked(useV1CreateFixture).mockReturnValue(noopMutationHook());
    vi.mocked(useV1RecordResult).mockReturnValue(noopMutationHook());
    vi.mocked(useV1RecalculateStandings).mockReturnValue(noopMutationHook());
    vi.mocked(useV1UpdateFixture).mockReturnValue(noopMutationHook());
    vi.mocked(useV1DeleteFixture).mockReturnValue(noopMutationHook());
    vi.mocked(useV1DeleteFixtureResult).mockReturnValue(noopMutationHook());
    vi.mocked(useV1UpdateGroup).mockReturnValue(noopMutationHook());
    vi.mocked(useV1DeleteGroup).mockReturnValue(noopMutationHook());
    vi.mocked(useV1RemoveGroupTeam).mockReturnValue(noopMutationHook());
    vi.mocked(useV1UploadVideo).mockReturnValue(noopMutationHook());
    vi.mocked(useV1UnpublishTournamentBracket).mockReturnValue(noopMutationHook());
  });

  afterEach(() => vi.clearAllMocks());

  it('canWrite=false → 공개 버튼이 렌더링되지 않는다', () => {
    vi.mocked(useV1PublishTournamentBracket).mockReturnValue(noopMutationHook());
    render(
      <BracketTab
        tournamentId="tournament-1"
        showToast={showToast}
        registrations={[]}
        registrationDeadlineAt={null}
        bracketPublishedAt={null}
        bracketPublishScheduledAt={null}
        canWrite={false}
      />,
    );
    expect(screen.queryByRole('button', { name: '지금 전체 공개' })).not.toBeInTheDocument();
  });

  it('접수마감 전(registrationDeadlineAt이 미래) → 확인 모달에 마감 전 경고 문구가 포함된다', async () => {
    const mutate = vi.fn();
    vi.mocked(useV1PublishTournamentBracket).mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useV1PublishTournamentBracket>);

    render(
      <BracketTab
        tournamentId="tournament-1"
        showToast={showToast}
        registrations={[]}
        registrationDeadlineAt="2099-01-01T00:00:00.000Z"
        bracketPublishedAt={null}
        bracketPublishScheduledAt={null}
        canWrite
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '지금 전체 공개' }));

    await waitFor(() => {
      expect(screen.getByText(/접수 마감 전이에요. 그래도 공개할까요\?/)).toBeInTheDocument();
    });

    // 확인(전체 공개) 클릭 → publishBracket.mutate 호출 (confirm()이 Promise를 resolve하므로 비동기 대기)
    fireEvent.click(screen.getByRole('button', { name: '전체 공개' }));
    await waitFor(() => {
      expect(mutate).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      );
    });

    const { onSuccess } = mutate.mock.calls[0][1];
    onSuccess({ tournamentId: 'tournament-1', bracketPublishedAt: '2026-07-18T00:00:00.000Z', alreadyPublished: false });
    expect(showToast).toHaveBeenCalledWith('대진표를 공개했어요.', 'success');
  });

  it('접수마감 지남 → 확인 모달에 마감 전 경고 문구가 없다', async () => {
    vi.mocked(useV1PublishTournamentBracket).mockReturnValue(noopMutationHook());

    render(
      <BracketTab
        tournamentId="tournament-1"
        showToast={showToast}
        registrations={[]}
        registrationDeadlineAt="2020-01-01T00:00:00.000Z"
        bracketPublishedAt={null}
        bracketPublishScheduledAt={null}
        canWrite
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '지금 전체 공개' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(screen.queryByText(/접수 마감 전이에요/)).not.toBeInTheDocument();
  });

  it('bracketPublishedAt이 이미 있으면 버튼 대신 공개 시각 안내만 노출한다', () => {
    vi.mocked(useV1PublishTournamentBracket).mockReturnValue(noopMutationHook());
    render(
      <BracketTab
        tournamentId="tournament-1"
        showToast={showToast}
        registrations={[]}
        registrationDeadlineAt="2020-01-01T00:00:00.000Z"
        bracketPublishedAt="2026-07-18T00:00:00.000Z"
        bracketPublishScheduledAt={null}
        canWrite
      />,
    );
    expect(screen.queryByRole('button', { name: '지금 전체 공개' })).not.toBeInTheDocument();
    expect(screen.getByText(/공개됨/)).toBeInTheDocument();
  });

  it('조가 하나도 없으면 공개·예약이 모두 잠기고 사유가 보인다', () => {
    vi.mocked(useV1PublishTournamentBracket).mockReturnValue(noopMutationHook());
    vi.mocked(useV1AdminBracket).mockReturnValue({
      data: emptyBracket,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useV1AdminBracket>);

    render(
      <BracketTab
        tournamentId="tournament-1"
        showToast={showToast}
        registrations={[]}
        registrationDeadlineAt="2020-01-01T00:00:00.000Z"
        bracketPublishedAt={null}
        bracketPublishScheduledAt={null}
        canWrite
      />,
    );

    expect(screen.getByRole('button', { name: '지금 전체 공개' })).toBeDisabled();
    expect(screen.getByText('조를 먼저 만들어야 공개할 수 있어요.')).toBeInTheDocument();
  });

  it('예약 시각을 넣고 확인하면 scheduledAt(ISO)으로 mutate 한다', async () => {
    const mutate = vi.fn();
    vi.mocked(useV1PublishTournamentBracket).mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useV1PublishTournamentBracket>);

    render(
      <BracketTab
        tournamentId="tournament-1"
        showToast={showToast}
        registrations={[]}
        registrationDeadlineAt="2020-01-01T00:00:00.000Z"
        bracketPublishedAt={null}
        bracketPublishScheduledAt={null}
        canWrite
      />,
    );

    const input = screen.getByLabelText('공개 예약 시각');
    fireEvent.change(input, { target: { value: '2099-08-01T18:00' } });
    fireEvent.click(screen.getByRole('button', { name: '이 시각에 공개 예약' }));

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '예약하기' }));

    await waitFor(() => {
      expect(mutate).toHaveBeenCalledWith(
        { scheduledAt: new Date('2099-08-01T18:00').toISOString() },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });
  });

  it('과거 시각으로 예약하면 mutate 하지 않고 에러 토스트를 띄운다', async () => {
    const mutate = vi.fn();
    vi.mocked(useV1PublishTournamentBracket).mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useV1PublishTournamentBracket>);

    render(
      <BracketTab
        tournamentId="tournament-1"
        showToast={showToast}
        registrations={[]}
        registrationDeadlineAt="2020-01-01T00:00:00.000Z"
        bracketPublishedAt={null}
        bracketPublishScheduledAt={null}
        canWrite
      />,
    );

    fireEvent.change(screen.getByLabelText('공개 예약 시각'), { target: { value: '2020-01-01T09:00' } });
    fireEvent.click(screen.getByRole('button', { name: '이 시각에 공개 예약' }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('공개 예약 시각은 현재 시각 이후여야 해요.', 'error');
    });
    expect(mutate).not.toHaveBeenCalled();
  });

  it('예약된 상태에서는 예약 시각 안내와 예약 취소 버튼이 보인다', async () => {
    const unpublishMutate = vi.fn();
    vi.mocked(useV1PublishTournamentBracket).mockReturnValue(noopMutationHook());
    vi.mocked(useV1UnpublishTournamentBracket).mockReturnValue({
      mutate: unpublishMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useV1UnpublishTournamentBracket>);

    render(
      <BracketTab
        tournamentId="tournament-1"
        showToast={showToast}
        registrations={[]}
        registrationDeadlineAt="2020-01-01T00:00:00.000Z"
        bracketPublishedAt={null}
        bracketPublishScheduledAt="2099-08-01T09:00:00.000Z"
        canWrite
      />,
    );

    expect(screen.getByText(/자동 공개돼요/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '예약 취소' }));
    const dialog = await screen.findByRole('dialog');
    // 트리거와 모달 확인 버튼의 이름이 같으므로 모달 안으로 범위를 좁힌다.
    fireEvent.click(within(dialog).getByRole('button', { name: '예약 취소' }));

    await waitFor(() => expect(unpublishMutate).toHaveBeenCalled());
  });

  it('공개된 상태에서 공개 취소를 확인하면 unpublish mutate 한다', async () => {
    const unpublishMutate = vi.fn();
    vi.mocked(useV1PublishTournamentBracket).mockReturnValue(noopMutationHook());
    vi.mocked(useV1UnpublishTournamentBracket).mockReturnValue({
      mutate: unpublishMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useV1UnpublishTournamentBracket>);

    render(
      <BracketTab
        tournamentId="tournament-1"
        showToast={showToast}
        registrations={[]}
        registrationDeadlineAt="2020-01-01T00:00:00.000Z"
        bracketPublishedAt="2026-07-18T00:00:00.000Z"
        bracketPublishScheduledAt={null}
        canWrite
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '공개 취소' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '비공개로 되돌리기' }));

    await waitFor(() => expect(unpublishMutate).toHaveBeenCalled());

    const onSuccess = unpublishMutate.mock.calls[0][1].onSuccess;
    onSuccess({ tournamentId: 'tournament-1', bracketPublishedAt: null, bracketPublishScheduledAt: null, alreadyUnpublished: false });
    expect(showToast).toHaveBeenCalledWith('대진표를 비공개로 되돌렸어요.', 'success');
  });
});
