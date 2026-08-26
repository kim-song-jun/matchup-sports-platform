/**
 * D1 — "자동 생성"을 되돌리는 흐름의 어드민 쪽 계약.
 *
 * 고치기 전 흐름: 이미 대진이 있는 조에서 자동 생성을 누르면 "이미 대진이 있어요. 교체할까요?"
 * 만 묻고, 예라고 답한 운영자를 곧바로 409 토스트("해당 경기를 먼저 정리해주세요")로
 * 떨어뜨렸다 — 무엇이 사라지는지도 안 알려주고, 정리할 방법도 없었다.
 *
 * 여기서 검증하는 것 세 가지:
 *  ① 교체할 수 있는 조에서는 **몇 개가 삭제되는지** 확인 모달에 나오고, 확인해야만
 *     replaceExisting=true 로 재요청한다.
 *  ② 교체할 수 없는 조에서는 **확인 모달을 아예 띄우지 않고** 이유를 알려준다.
 *  ③ 대진 삭제가 서버에서 막히면 그 이유가 토스트에 그대로 나온다 — 예전에는 같은 클릭이
 *     매핑 없는 500 으로 끝나 운영자가 "서버 오류" 만 봤다.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1AdminBracketFixture, V1AdminTournamentBracket } from '@/types/api';
import { V1ApiError } from '@/lib/api-client';
import { BracketTab, describeLeagueReplace } from './bracket-tab';

const v1Post = vi.fn();

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, v1Post: (...args: unknown[]) => v1Post(...args) };
});

/** 테스트마다 바꿔 끼우는 대진 목록 — 아래 useV1AdminBracket 목이 이 값을 읽는다. */
let bracketFixtures: V1AdminBracketFixture[] = [];

function fixtureRow(overrides: Partial<V1AdminBracketFixture>): V1AdminBracketFixture {
  return {
    id: 'fx-1',
    tournamentId: 't-1',
    groupId: 'group-a',
    round: 'league_r1',
    fixtureNumber: 1,
    legNumber: 1,
    parentFixtureId: null,
    homeRegistrationId: 'r1',
    awayRegistrationId: 'r2',
    homeTeamName: '강남FC',
    awayTeamName: '서초유나이티드',
    scheduledAt: null,
    venue: null,
    status: 'scheduled',
    result: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  } as unknown as V1AdminBracketFixture;
}

const bracket: V1AdminTournamentBracket = {
  groups: [
    {
      id: 'group-a',
      tournamentId: 't-1',
      name: 'A조',
      phase: 'group',
      sortOrder: 0,
      advanceCount: 2,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      groupTeams: [
        { id: 'gt-1', groupId: 'group-a', registrationId: 'r1', teamName: '강남FC', sortOrder: 0 },
        { id: 'gt-2', groupId: 'group-a', registrationId: 'r2', teamName: '서초유나이티드', sortOrder: 1 },
      ],
    },
  ],
  standings: [],
} as unknown as V1AdminTournamentBracket;

/** `deleteFixture.mutate(id, { onSuccess, onError })` 를 테스트마다 다르게 응답시킨다. */
const deleteFixtureMutate = vi.fn();

function noopMutation() {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
}

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminBracket: () => ({
    data: { ...bracket, fixtures: bracketFixtures },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useV1PublishTournamentBracket: noopMutation,
  useV1UnpublishTournamentBracket: noopMutation,
  useV1CreateGroup: noopMutation,
  useV1AssignGroupTeam: noopMutation,
  useV1CreateFixture: noopMutation,
  useV1RecalculateStandings: noopMutation,
  useV1UpdateFixture: noopMutation,
  useV1DeleteFixture: () => ({ mutate: deleteFixtureMutate, mutateAsync: vi.fn(), isPending: false }),
  useV1UpdateGroup: noopMutation,
  useV1DeleteGroup: noopMutation,
  useV1RemoveGroupTeam: noopMutation,
}));

function alreadyExists(details: Record<string, unknown>) {
  return new V1ApiError({
    statusCode: 409,
    code: 'LEAGUE_FIXTURES_ALREADY_EXIST',
    message: '이미 대진이 있어요. 다시 만들려면 기존 대진을 교체해주세요.',
    details,
    requestId: 'req-1',
    timestamp: '2026-08-27T00:00:00.000Z',
  } as unknown as ConstructorParameters<typeof V1ApiError>[0]);
}

function renderTab(showToast = vi.fn()) {
  render(
    <BracketTab
      tournamentId="t-1"
      showToast={showToast}
      registrations={[]}
      registrationDeadlineAt={null}
      bracketPublishedAt={null}
      bracketPublishScheduledAt={null}
      canWrite
    />,
  );
  return showToast;
}

/** 조 카드의 "대진 자동 생성" → 회전 수 모달의 "자동 생성" 까지 눌러 준다. */
async function startAutoGenerate() {
  fireEvent.click(screen.getByRole('button', { name: '대진 자동 생성' }));
  const submit = await screen.findByRole('button', { name: '자동 생성' });
  // 클릭이 비동기 핸들러를 태우므로 act 로 감싸 그 안의 상태 갱신까지 흘려보낸다.
  await act(async () => {
    fireEvent.click(submit);
  });
}

describe('BracketTab — 조별리그 대진 교체 확인', () => {
  beforeEach(() => {
    bracketFixtures = [];
    // clearAllMocks 는 호출 기록만 지우고 mockRejectedValueOnce 대기열은 남긴다 —
    // 앞 테스트가 다 소비하지 못한 응답이 다음 테스트로 새면 엉뚱한 이유로 통과/실패한다.
    v1Post.mockReset();
    vi.clearAllMocks();
  });

  it('교체 가능한 조에서는 무엇이 몇 개 취소되는지 보여주고, 확인해야 replaceExisting=true 로 재요청한다', async () => {
    v1Post
      .mockRejectedValueOnce(
        alreadyExists({
          existingFixtureCount: 56,
          fixturesWithResultCount: 0,
          blockedFixtureCount: 0,
          deletableFixtureCount: 56,
          blockedFixtures: [],
          replaceable: true,
        }),
      )
      .mockResolvedValueOnce({ created: 1, deleted: 56, perTeamMatches: 1, rounds: 1, warnings: [] });

    renderTab();
    await startAutoGenerate();

    const dialog = await screen.findByRole('dialog', { name: '대진 교체' });
    expect(dialog).toHaveTextContent('기존 대진 56개');
    expect(dialog).toHaveTextContent('모두 삭제되고');
    expect(dialog).toHaveTextContent('되돌릴 수 없어요');

    // 확인 전에는 두 번째 요청이 나가면 안 된다.
    expect(v1Post).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '교체' }));

    await waitFor(() => expect(v1Post).toHaveBeenCalledTimes(2));
    expect(v1Post.mock.calls[0][1]).toMatchObject({ replaceExisting: false });
    expect(v1Post.mock.calls[1][1]).toMatchObject({ replaceExisting: true });
  });

  it('취소를 누르면 교체 요청을 보내지 않는다', async () => {
    v1Post.mockRejectedValueOnce(
      alreadyExists({
        existingFixtureCount: 6,
        fixturesWithResultCount: 0,
        blockedFixtureCount: 0,
        deletableFixtureCount: 6,
        blockedFixtures: [],
        replaceable: true,
      }),
    );

    renderTab();
    await startAutoGenerate();

    // 회전 수 모달도 열려 있어 "취소"가 두 개다 — 확인 대화상자 안의 것만 누른다.
    const dialog = await screen.findByRole('dialog', { name: '대진 교체' });
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '대진 교체' })).not.toBeInTheDocument(),
    );
    expect(v1Post).toHaveBeenCalledTimes(1);
  });

  it('교체할 수 없는 조에서는 확인 모달 대신 이유를 알려준다', async () => {
    v1Post.mockRejectedValueOnce(
      alreadyExists({
        existingFixtureCount: 28,
        fixturesWithResultCount: 2,
        blockedFixtureCount: 28,
        deletableFixtureCount: 0,
        blockedFixtures: [{ round: 'league_r1', fixtureNumber: 1, legNumber: 1, reasons: ['game'] }],
        replaceable: false,
      }),
    );

    const showToast = renderTab();
    await startAutoGenerate();

    await waitFor(() => expect(showToast).toHaveBeenCalled());
    // 생성 플래그가 풀릴 때까지 기다린다(버튼 라벨이 '생성 중…' → '자동 생성' 으로 돌아온다).
    await waitFor(() => expect(screen.getByRole('button', { name: '자동 생성' })).toBeEnabled());
    const [message, tone] = showToast.mock.calls.at(-1)!;
    expect(message).toContain('결과가 확정된 경기 2개');
    expect(message).toContain('지울 수 없는 대진 28개');
    expect(tone).toBe('error');
    // 답이 정해진 질문을 다시 묻지 않는다.
    expect(screen.queryByRole('dialog', { name: '대진 교체' })).not.toBeInTheDocument();
    expect(v1Post).toHaveBeenCalledTimes(1);
  });
});

describe('BracketTab — 대진 삭제 거절 안내', () => {
  beforeEach(() => {
    bracketFixtures = [];
    v1Post.mockReset();
    vi.clearAllMocks();
    deleteFixtureMutate.mockReset();
  });

  // 대회 경기는 만들어질 때 항상 게임과 감사 기록을 동반하므로 실제로는 대부분 지울 수 없다.
  // 목록 응답에는 그 사실이 없어 버튼을 미리 감출 수 없다 — 대신 서버가 무엇이 막는지 알려
  // 주면 그 문구가 그대로 운영자에게 도달해야 한다. 예전에는 "서버 오류" 로 끝났다.
  it('서버가 막는 이유를 알려주면 그 문구를 그대로 보여준다', async () => {
    bracketFixtures = [fixtureRow({ id: 'fx-1', fixtureNumber: 1 })];
    deleteFixtureMutate.mockImplementation((_id: string, opts: { onError: (err: unknown) => void }) => {
      opts.onError(
        new V1ApiError({
          statusCode: 409,
          code: 'FIXTURE_NOT_DELETABLE',
          message: '경기 기록·운영 감사 기록이 남아 있어 이 경기를 지울 수 없어요. 팀이나 일시를 바꾸려면 "수정" 을 이용해주세요.',
          details: { reasons: ['game', 'operation_audit'] },
          requestId: 'req-1',
          timestamp: '2026-08-27T00:00:00.000Z',
        } as unknown as ConstructorParameters<typeof V1ApiError>[0]),
      );
    });
    const showToast = renderTab();

    // AdminDataTable 은 데스크톱 <table> 과 모바일 카드 스택을 둘 다 렌더하므로 같은 버튼이
    // 여러 번 나온다 — 첫 번째만 누른다.
    const buttons = screen.getAllByRole('button', { name: 'league_r1 1번 경기 삭제' });
    expect(buttons.length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.click(buttons[0]);
    });
    const dialog = await screen.findByRole('dialog', { name: '경기 삭제' });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
    });

    await waitFor(() => expect(showToast).toHaveBeenCalled());
    const [message, tone] = showToast.mock.calls.at(-1)!;
    expect(message).toContain('경기 기록');
    expect(message).not.toContain('실패했어요');
    expect(tone).toBe('error');
  });

  // 결과가 이미 기록된 경기는 예전부터 삭제 버튼 자체를 내보내지 않는다.
  it('결과가 기록된 경기에는 삭제 버튼을 내보내지 않는다', () => {
    bracketFixtures = [
      fixtureRow({
        id: 'fx-done',
        fixtureNumber: 1,
        result: {
          id: 'r-1',
          fixtureId: 'fx-done',
          homeScore: 2,
          awayScore: 1,
          hasPenalty: false,
          homePenaltyScore: null,
          awayPenaltyScore: null,
          note: null,
          recordedAt: '2026-08-01T00:00:00.000Z',
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
          goals: [],
        },
      }),
    ];
    renderTab();

    expect(screen.queryAllByRole('button', { name: 'league_r1 1번 경기 삭제' })).toHaveLength(0);
  });
});

describe('describeLeagueReplace', () => {
  it('details 가 없으면 숫자를 지어내지 않는다', () => {
    const prompt = describeLeagueReplace(undefined);
    expect(prompt.replaceable).toBe(true);
    expect(prompt.message).not.toMatch(/\d/);
  });

  it('숫자가 아닌 값이 섞여 있어도 0으로 읽고 문구를 만든다', () => {
    const prompt = describeLeagueReplace({
      existingFixtureCount: '28',
      blockedFixtureCount: null,
      replaceable: true,
    });
    expect(prompt.replaceable).toBe(true);
    expect(prompt.message).toContain('기존 대진 0개');
  });

  // 막힌 이유가 결과 확정 하나뿐이면 "지울 수 없는 대진 N개" 를 덧붙이지 않는다 — 0개라고
  // 말하거나 없는 사유를 지어내면 운영자가 엉뚱한 곳을 찾는다.
  it('막힌 사유가 하나면 그 하나만 말한다', () => {
    const prompt = describeLeagueReplace({
      existingFixtureCount: 6,
      fixturesWithResultCount: 3,
      blockedFixtureCount: 0,
      replaceable: false,
    });
    expect(prompt.replaceable).toBe(false);
    expect(prompt.message).toContain('결과가 확정된 경기 3개');
    expect(prompt.message).not.toContain('지울 수 없는 대진');
  });
});
