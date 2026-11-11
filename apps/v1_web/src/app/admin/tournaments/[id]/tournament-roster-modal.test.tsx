import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { cleanup, render as renderWithProviders, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactElement, type PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1QueryClient } from '@/lib/query-client';
import type { V1AdminTournamentRegistration } from '@/types/api';
import { RosterModal } from './registrations-tab';

const clients: QueryClient[] = [];

function render(ui: ReactElement) {
  const client = createV1QueryClient();
  clients.push(client);
  return renderWithProviders(ui, {
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

const refetch = vi.fn();
const updateEligibility = vi.fn();
const carryOver = vi.fn();
let queryState: Record<string, unknown>;

const addPlayer = vi.fn();
const removePlayer = vi.fn();

const DEFAULT_ELIGIBLE_MEMBERS = [
  { userId: 'user-42', nickname: '명철', realName: '김명철',
    role: 'member' as const, alreadyOnRoster: false, eligible: true,
    ineligibleReason: null },
  { userId: 'user-99', nickname: '무프로필', realName: null,
    role: 'member' as const, alreadyOnRoster: false, eligible: false,
    ineligibleReason: '실명·생년월일·휴대폰이 모두 필요해요' },
];

let eligibleState: Record<string, unknown>;

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournamentPlayers: () => queryState,
  useV1AdminUpdatePlayerSettings: () => ({ mutate: vi.fn(), isPending: false }),
  useV1UpdatePlayerEligibility: () => ({ mutate: updateEligibility, mutateAsync: updateEligibility, isPending: false }),
  useV1CarryOverPlayerEligibility: () => ({ mutate: carryOver, isPending: false }),
  useV1AdminAddPlayer: () => ({ mutate: addPlayer, isPending: false }),
  useV1AdminRosterEligibleMembers: () => eligibleState,
  useV1AdminRemovePlayer: () => ({ mutate: removePlayer, isPending: false }),
}));

const registration: V1AdminTournamentRegistration = {
  id: 'registration-1',
  tournamentId: 'tournament-1',
  teamId: 'team-1',
  teamName: '번개팀',
  appliedByUserId: 'user-1',
  status: 'confirmed' as const,
  depositorName: '홍길동',
  agreedRules: true,
  agreedPrivacy: true,
  agreedRefund: true,
  agreedMediaConsent: true,
  confirmedAt: '2026-07-14T00:00:00.000Z',
  rosterLockedAt: null,
  rosterDeadlineOverrideAt: null,
  cancelRequestedAt: null,
  cancelReason: null,
  adminCancelReason: null,
  cancelOutcome: null,
  playerCount: 1,
  payment: null,
  confirmedByAdminUserId: 'admin-1',
  createdAt: '2026-07-14T00:00:00.000Z',
  updatedAt: '2026-07-14T00:00:00.000Z',
};

function RosterFocusHarness({ canWrite = true }: { canWrite?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>명단 검토</button>
      <button>경기별 명단</button>
      <RosterModal open={open} onClose={() => setOpen(false)} registration={registration} showToast={() => undefined} canWrite={canWrite} />
    </>
  );
}

describe('admin tournament roster modal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eligibleState = {
      data: { members: DEFAULT_ELIGIBLE_MEMBERS },
      isPending: false,
      isError: false,
      error: null,
    };
    queryState = {
      data: {
        registrationId: 'registration-1',
        teamId: 'team-1',
        teamName: '번개팀',
        rosterLockedAt: null,
        belowMinimum: false,
        players: [
          {
            id: 'player-1',
            userId: 'user-1',
            realName: '홍길동',
            nickname: '길동이',
            birthDateSnapshot: '19950315',
            genderSnapshot: 'male',
            phone: '01012345678',
            isTeamCaptain: false,
            eligibilityStatus: 'needs_review',
            eligibilityNote: null,
            addedAt: '2026-07-14T00:00:00.000Z',
            removedAt: null,
          },
        ],
      },
      isPending: false,
      isError: false,
      error: null,
      refetch,
    };
  });

  it.each(['ready', 'loading', 'error', 'empty', 'read-only'])('실제 명단 modal의 %s 상태도 trigger에서 바로 내부 focus를 받아요', async (state) => {
    if (state === 'loading') queryState = { ...queryState, data: undefined, isPending: true };
    if (state === 'error') queryState = { ...queryState, data: undefined, isError: true, error: new Error('명단 조회 실패') };
    if (state === 'empty') queryState = { ...queryState, data: { ...(queryState.data as object), players: [] } };
    const user = userEvent.setup();
    render(<RosterFocusHarness canWrite={state !== 'read-only'} />);
    const trigger = screen.getByRole('button', { name: '명단 검토' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: '명단 검토 — 번개팀' });
    expect(within(dialog).getByRole('button', { name: '모달 닫기' })).toHaveFocus();
    for (const shift of [false, true, true, false]) {
      await user.tab({ shift });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(addPlayer).not.toHaveBeenCalled();
    expect(removePlayer).not.toHaveBeenCalled();
    expect(updateEligibility).not.toHaveBeenCalled();
  });

  it('renders the roster gender snapshot for an admin', () => {
    render(
      <RosterModal
        open
        onClose={() => undefined}
        registration={registration}
        showToast={() => undefined}
        canWrite
      />,
    );

    expect(screen.getByRole('dialog', { name: '명단 검토 — 번개팀' })).toBeInTheDocument();
    expect(screen.getByText('1995.03.15 · 남성')).toBeInTheDocument();
    expect(screen.getByText('휴대폰 010-1234-5678')).toBeInTheDocument();
  });

  it('moves the team captain to the top and shows a captain badge', () => {
    const roster = queryState.data as {
      players: Array<Record<string, unknown>>;
    };
    roster.players = [
      { ...roster.players[0], id: 'member-player', realName: '일반 선수', isTeamCaptain: false },
      { ...roster.players[0], id: 'captain-player', realName: '팀장 선수', isTeamCaptain: true },
    ];

    render(
      <RosterModal
        open
        onClose={() => undefined}
        registration={registration}
        showToast={() => undefined}
        canWrite
      />,
    );

    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('팀장 선수');
    expect(rows[0]).toHaveTextContent('팀장');
    expect(rows[1]).toHaveTextContent('일반 선수');
  });
  it('renders a missing gender without blocking support read access or enabling mutation', () => {
    const roster = queryState.data as {
      players: Array<{ genderSnapshot: 'male' | 'female' | null; phone: string | null }>;
    };
    roster.players[0].genderSnapshot = null;
    roster.players[0].phone = null;

    render(
      <RosterModal
        open
        onClose={() => undefined}
        registration={registration}
        showToast={() => undefined}
        canWrite={false}
      />,
    );

    expect(screen.getByText('1995.03.15 · 성별 미등록')).toBeInTheDocument();
    expect(screen.getByText('휴대폰 미등록')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '홍길동 선출 판정' })).toBeDisabled();
  });

  // 팀 화면(명단 편집)의 자격 라벨은 아마추어 / 선출 / 확인 중이다 — 어드민 판정 패널이 같은 말을 써야 한다.
  // MD-QA #192: needs_review 는 어디서나 '확인 중' 하나다(예전 어드민만 '검토 필요').
  it('판정 패널의 판정 선택지는 팀 화면과 같은 "아마추어 / 선출 / 확인 중" 이름을 쓴다', async () => {
    const user = userEvent.setup();
    render(<RosterModal open onClose={() => undefined} registration={registration} showToast={() => undefined} canWrite />);

    await user.click(screen.getByRole('button', { name: '홍길동 선출 판정' }));
    const panel = screen.getByRole('region', { name: '홍길동 선출 판정' });
    const statusGroup = within(panel).getByRole('group', { name: '판정' });
    expect(within(statusGroup).getAllByRole('radio').map((radio) => radio.closest('label')?.textContent)).toEqual([
      '아마추어',
      '선출',
      '확인 중',
    ]);
    expect(screen.queryByText('검토 필요')).not.toBeInTheDocument();
  });

  // ─── MD-QA #192 ① 판정 + 확인 방법 + 메모 ───────────────────────────────────

  it('판정·확인 방법·메모를 한 번에 저장하고, 확인 방법 없이는 보내지 않는다', async () => {
    updateEligibility.mockResolvedValue({});
    const user = userEvent.setup();
    render(<RosterModal open onClose={() => undefined} registration={registration} showToast={() => undefined} canWrite />);

    await user.click(screen.getByRole('button', { name: '홍길동 선출 판정' }));
    const panel = screen.getByRole('region', { name: '홍길동 선출 판정' });
    await user.click(within(panel).getByRole('radio', { name: '아마추어' }));
    await user.click(within(panel).getByRole('button', { name: '판정 저장' }));
    expect(within(panel).getByRole('alert')).toHaveTextContent('무엇으로 확인했는지 골라 주세요.');
    expect(updateEligibility).not.toHaveBeenCalled();

    await user.click(within(panel).getByRole('radio', { name: 'JoinKFA' }));
    await user.type(within(panel).getByRole('textbox', { name: /메모/ }), '소속내역 동호인 팀만 있음');
    await user.click(within(panel).getByRole('button', { name: '판정 저장' }));

    expect(updateEligibility).toHaveBeenCalledWith({
      playerId: 'player-1',
      eligibilityStatus: 'non_pro',
      verificationMethod: 'joinkfa',
      note: '소속내역 동호인 팀만 있음',
    });
  });

  it('메모를 건드리지 않으면 note 를 보내지 않는다 — 서버가 기존 메모를 지우지 않게', async () => {
    updateEligibility.mockResolvedValue({});
    const roster = queryState.data as { players: Array<Record<string, unknown>> };
    roster.players[0] = { ...roster.players[0], eligibilityStatus: 'pro', eligibilityNote: '고교 등록 이력',
      eligibilityVerificationMethod: 'certificate', eligibilityVerifiedAt: '2026-11-09T01:00:00.000Z',
      eligibilityAdminReviewed: true, eligibilityVerifiedByName: '운영김' };
    const user = userEvent.setup();
    render(<RosterModal open onClose={() => undefined} registration={registration} showToast={() => undefined} canWrite />);

    expect(screen.getByText('경력·실적 증명서 확인 · 11.09 · 확인자 운영김')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '홍길동 선출 판정' }));
    const panel = screen.getByRole('region', { name: '홍길동 선출 판정' });
    await user.click(within(panel).getByRole('radio', { name: 'JoinKFA' }));
    await user.click(within(panel).getByRole('button', { name: '판정 저장' }));

    expect(updateEligibility).toHaveBeenCalledWith({ playerId: 'player-1', eligibilityStatus: 'pro', verificationMethod: 'joinkfa' });
  });

  it('JoinKFA 링크는 새 탭·noopener 로 루트만 열고, 선수 정보를 보내지 않는다고 알린다', () => {
    render(<RosterModal open onClose={() => undefined} registration={registration} showToast={() => undefined} canWrite />);

    const links = screen.getAllByRole('link', { name: /JoinKFA 열기/ });
    for (const link of links) {
      expect(link).toHaveAttribute('href', 'https://www.joinkfa.com');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link).toHaveTextContent('(새 탭에서 열려요)');
    }
    expect(screen.getByText(/Teameet은 JoinKFA에 선수 정보를 보내지 않아요\./)).toBeInTheDocument();
  });

  // MD-QA #192 후속: 증명서가 JoinKFA 어디 있는지(2026-11-11 실측 메뉴 경로) 모달 하단과 판정 패널이 같은 문구로 알려 준다.
  it('JoinKFA 증명서 위치 안내를 모달 하단과 판정 패널에 보여 준다', async () => {
    const user = userEvent.setup();
    render(<RosterModal open onClose={() => undefined} registration={registration} showToast={() => undefined} canWrite />);

    const guide = "선수 본인이 JoinKFA에 로그인한 뒤 상단 '증명서 → 증명서 신청'에서 경력·실적 증명서를 받을 수 있어요.";
    expect(screen.getByText(guide)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '홍길동 선출 판정' }));
    const panel = screen.getByRole('region', { name: '홍길동 선출 판정' });
    expect(within(panel).getByText(guide)).toBeInTheDocument();
  });

  it('필터: 확인 전 / 선출 / 본인 신고만 으로 좁힌다', async () => {
    const roster = queryState.data as { players: Array<Record<string, unknown>> };
    const base = roster.players[0];
    roster.players = [
      base,
      { ...base, id: 'player-2', userId: 'user-2', realName: '강별', eligibilityStatus: 'pro',
        eligibilityVerificationMethod: 'joinkfa', eligibilityVerifiedAt: '2026-11-10T00:00:00.000Z', eligibilityAdminReviewed: true },
      { ...base, id: 'player-3', userId: 'user-3', realName: '정우진', eligibilityStatus: 'non_pro',
        eligibilityVerificationMethod: 'self_declared', eligibilityVerifiedAt: '2026-11-08T00:00:00.000Z', eligibilityAdminReviewed: true },
    ];
    const user = userEvent.setup();
    render(<RosterModal open onClose={() => undefined} registration={registration} showToast={() => undefined} canWrite />);
    const names = () => within(screen.getByRole('list')).getAllByRole('listitem').map((row) =>
      ['홍길동', '강별', '정우진'].find((name) => row.textContent?.includes(name)));

    expect(screen.getByText('선출 확인 2/3명')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /확인 전/ }));
    expect(names()).toEqual(['홍길동']);
    await user.click(screen.getByRole('button', { name: /^선출/ }));
    expect(names()).toEqual(['강별']);
    await user.click(screen.getByRole('button', { name: /본인 신고만/ }));
    expect(names()).toEqual(['정우진']);
    expect(screen.getByRole('button', { name: /본인 신고만/ })).toHaveAttribute('aria-pressed', 'true');
  });

  // ─── MD-QA #192 ② 이전 판정 · ③ 본인 신고 ───────────────────────────────────

  it('이전 대회 판정은 제안만 하고, "이전 판정 유지" 를 눌러야 그 원본으로 요청한다', async () => {
    const roster = queryState.data as { players: Array<Record<string, unknown>> };
    roster.players[0] = { ...roster.players[0], eligibilityAdminReviewed: false, previousEligibilityRuling: {
      sourcePlayerId: 'old-player', eligibilityStatus: 'non_pro', verificationMethod: 'joinkfa',
      verifiedAt: '2026-10-20T03:00:00.000Z', competitionId: 't-old', competitionTitle: '가을 컵',
    } };
    const user = userEvent.setup();
    render(<RosterModal open onClose={() => undefined} registration={registration} showToast={() => undefined} canWrite />);

    expect(screen.getByText('이전 판정: 아마추어 · JoinKFA 확인 · 2026.10.20 · 가을 컵')).toBeInTheDocument();
    expect(carryOver).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '홍길동 이전 판정 유지' }));
    expect(carryOver).toHaveBeenCalledWith({ playerId: 'player-1', sourcePlayerId: 'old-player' }, expect.anything());
  });

  it('팀장 선택과 본인 신고를 함께 보여 주고, 다르면 표시한다', () => {
    const roster = queryState.data as { players: Array<Record<string, unknown>> };
    roster.players[0] = { ...roster.players[0], eligibilityStatus: 'non_pro', selfDeclaredStatus: 'pro', eligibilityAdminReviewed: false };
    render(<RosterModal open onClose={() => undefined} registration={registration} showToast={() => undefined} canWrite />);

    expect(screen.getByText('팀장 선택 아마추어 · 본인 신고 선출')).toBeInTheDocument();
    expect(screen.getByText('팀장 선택과 본인 신고가 달라요')).toBeInTheDocument();
  });

  it('읽기 전용 어드민은 판정·이전 판정 유지를 누를 수 없다', () => {
    const roster = queryState.data as { players: Array<Record<string, unknown>> };
    roster.players[0] = { ...roster.players[0], previousEligibilityRuling: {
      sourcePlayerId: 'old-player', eligibilityStatus: 'pro', verificationMethod: null,
      verifiedAt: '2026-10-20T03:00:00.000Z', competitionId: 't-old', competitionTitle: '가을 컵',
    } };
    render(<RosterModal open onClose={() => undefined} registration={registration} showToast={() => undefined} canWrite={false} />);

    expect(screen.getByRole('button', { name: '홍길동 선출 판정' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '홍길동 이전 판정 유지' })).toBeDisabled();
  });

  it('shows a retryable error instead of an empty roster when the request fails', async () => {
    queryState = {
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('관리자 명단 조회 실패'),
      refetch,
    };

    render(
      <RosterModal
        open
        onClose={() => undefined}
        registration={registration}
        showToast={() => undefined}
        canWrite
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('관리자 명단 조회 실패');
    expect(screen.queryByText('등록된 선수가 없어요.')).not.toBeInTheDocument();
    expect(refetch).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  // 2026-08-03 사고: 어드민 콘솔에 명단 추가·제거가 아예 없어서, 운영자가 무엇을 눌러도
  // 서버로 요청이 가지 않았다(24시간 로그에 POST 0건·4xx 0건). 아래 두 테스트는 "버튼이
  // 있는가"가 아니라 **실제로 요청이 나가는가**를 확인한다.
  it('제외 버튼이 해당 선수 id 로 제거를 요청한다', async () => {
    render(
      <RosterModal
        open
        onClose={() => undefined}
        registration={registration}
        showToast={() => undefined}
        canWrite
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '홍길동 선수를 명단에서 제외' }));

    expect(removePlayer).toHaveBeenCalledTimes(1);
    expect(removePlayer.mock.calls[0][0]).toBe('player-1');
  });

  // UUID 를 직접 입력받던 폼은 운영자가 그 값을 얻을 방법이 없어 사실상 쓸 수 없었다
  // (2026-08-04 alpha UI 검수). 팀원 목록에서 고르는 방식으로 바뀌었다.
  it('팀원을 골라 추가하면 그 userId 와 실명이 전송된다', async () => {
    render(
      <RosterModal
        open
        onClose={() => undefined}
        registration={registration}
        showToast={() => undefined}
        canWrite
      />,
    );

    // 아무도 안 고른 상태에서는 버튼이 비활성이라 요청이 나가지 않는다.
    expect(screen.getByRole('button', { name: '추가' })).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText('추가할 팀원'), 'user-42');
    await userEvent.click(screen.getByRole('button', { name: '추가' }));

    expect(addPlayer).toHaveBeenCalledTimes(1);
    expect(addPlayer.mock.calls[0][0]).toEqual({ userId: 'user-42', realName: '김명철' });
  });

  it('자격이 없는 팀원은 이유와 함께 보이되 고를 수 없다', () => {
    render(
      <RosterModal
        open
        onClose={() => undefined}
        registration={registration}
        showToast={() => undefined}
        canWrite
      />,
    );

    const options = screen.getAllByRole('option');
    const ineligible = options.find((o) =>
      o.textContent?.includes('실명·생년월일·휴대폰이 모두 필요해요'),
    );
    // 목록에서 지우지 않고 이유를 붙여 보여 준다 — 지우면 "왜 없지?" 를 화면 밖에서 찾게 된다.
    expect(ineligible).toBeTruthy();
    expect(ineligible).toBeDisabled();

    const selectable = options.find((o) => o.textContent?.includes('김명철'));
    expect(selectable).not.toBeDisabled();
  });

  it('읽기 전용 어드민에게는 추가 폼과 제외 버튼이 보이지 않는다', () => {
    render(
      <RosterModal
        open
        onClose={() => undefined}
        registration={registration}
        showToast={() => undefined}
        canWrite={false}
      />,
    );

    expect(screen.queryByRole('button', { name: '추가' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '홍길동 선수를 명단에서 제외' })).toBeDisabled();
  });

  // 목록이 비어 보이는 이유는 셋인데(조회 실패 / 멤버 0명 / 전원 자격 미달) 화면이 하나로
  // 뭉뚱그리면 운영자가 엉뚱한 데를 고치러 간다. 각 상태를 구분해 말하는지 본다.
  it('팀원 목록 조회에 실패하면 "멤버가 없다" 고 말하지 않는다', () => {
    eligibleState = {
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('boom'),
    };

    render(
      <RosterModal
        open
        onClose={() => undefined}
        registration={registration}
        showToast={() => undefined}
        canWrite
      />,
    );

    const placeholder = screen.getByRole('option', { name: '팀원 목록을 불러오지 못했어요' });
    expect(placeholder).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '팀에 활성 멤버가 없어요' })).not.toBeInTheDocument();
  });

  it('멤버는 있지만 전원 자격 미달이면 "활성 멤버가 없다" 고 말하지 않는다', () => {
    eligibleState = {
      data: {
        members: [
          {
            ...DEFAULT_ELIGIBLE_MEMBERS[0],
            eligible: false,
            ineligibleReason: '정원이 찼어요 (10/10명)',
          },
        ],
      },
      isPending: false,
      isError: false,
      error: null,
    };

    render(
      <RosterModal
        open
        onClose={() => undefined}
        registration={registration}
        showToast={() => undefined}
        canWrite
      />,
    );

    expect(
      screen.getByRole('option', { name: '추가할 수 있는 팀원이 없어요' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '팀에 활성 멤버가 없어요' })).not.toBeInTheDocument();
    // 사유는 여전히 읽을 수 있어야 한다 — 왜 못 고르는지가 화면에 남아야 조치할 수 있다.
    expect(
      screen.getByRole('option', { name: /정원이 찼어요 \(10\/10명\)/ }),
    ).toBeDisabled();
  });
});
