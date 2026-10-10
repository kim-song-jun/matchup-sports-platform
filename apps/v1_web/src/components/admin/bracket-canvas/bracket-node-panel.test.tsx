import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { makeFixture, makeGame, makeGroup, makeRegistration, makeSlot } from '@/test/bracket-canvas-fixtures';
import type { V1AdminBracketFixture } from '@/types/api';
import { BracketNodePanel } from './bracket-node-panel';

const mocks = vi.hoisted(() => ({
  assign: vi.fn(),
  quick: vi.fn(),
  updateFixture: vi.fn(),
  deleteFixture: vi.fn(),
}));

vi.mock('@/hooks/use-v1-bracket-canvas', () => ({
  useV1AssignTournamentSlot: () => ({ mutate: mocks.assign, isPending: false }),
  useV1QuickResult: () => ({ mutate: mocks.quick, isPending: false }),
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1PlaceSearch: () => ({ data: undefined, isFetching: false, isError: false, error: null }),
  useV1PublicKakaoMapsKey: () => ({ data: { kakaoMapsJsKey: null }, isLoading: false }),
  useV1UpdateFixture: () => ({ mutate: mocks.updateFixture, isPending: false }),
  useV1DeleteFixture: () => ({ mutate: mocks.deleteFixture, isPending: false }),
}));
// 정정·무효·확정은 Task 11 이 따로 검증한다 — 여기서는 어떤 게임으로 불리는지만 본다.
vi.mock('./bracket-result-actions', () => ({
  BracketResultActions: (props: { game: { id: string } }) => <div data-testid="result-actions">{props.game.id}</div>,
}));

const knockout = makeGroup({ id: 'g-qf', name: '8강', phase: 'quarter' });
const groupStage = makeGroup({ id: 'g-a', name: 'A조', phase: 'group' });
const slots = [
  makeSlot({ id: 's-home', label: '1번 자리', registrationId: 'r1', teamName: '서울FC' }),
  makeSlot({ id: 's-away', label: '2번 자리' }),
  makeSlot({ id: 's-other', label: '3번 자리', registrationId: 'r2', teamName: '부산FC' }),
];
const registrations = [
  makeRegistration({ id: 'r1', teamName: '서울FC' }),
  makeRegistration({ id: 'r2', teamName: '부산FC' }),
  makeRegistration({ id: 'r3', teamName: '대구FC' }),
];

const fixtureOf = (overrides: Partial<V1AdminBracketFixture> = {}) =>
  makeFixture({
    id: 'f1',
    groupId: 'g-qf',
    fixtureNumber: 1,
    round: '8강',
    homeSlotId: 's-home',
    awaySlotId: 's-away',
    homeRegistrationId: 'r1',
    homeTeamName: '서울FC',
    game: makeGame({ id: 'game-1', version: 3 }),
    ...overrides,
  });

function renderPanel(fixture = fixtureOf(), overrides: Partial<React.ComponentProps<typeof BracketNodePanel>> = {}) {
  const props = {
    tournamentId: 't-1',
    fixture,
    groups: [knockout, groupStage],
    slots,
    registrations,
    registrationsLoaded: true,
    sideLabels: {
      HOME: fixture.homeRegistrationId === null ? '1번 자리' : fixture.homeTeamName,
      AWAY: fixture.awayRegistrationId === null ? '2번 자리' : fixture.awayTeamName,
    },
    canWrite: true,
    showToast: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<BracketNodePanel {...props} />);
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BracketNodePanel — 자리 배정', () => {
  it('다른 자리에 이미 들어간 팀은 고르지 못하고, 현재 자리의 팀과 비워 두기는 고를 수 있다', () => {
    renderPanel();
    const homeSelect = screen.getByLabelText('홈 팀 선택');
    expect(within(homeSelect).getAllByRole('option').map((option) => option.textContent)).toEqual(['비워 두기', '서울FC', '대구FC']);
    expect(homeSelect).toHaveValue('r1');
    // 어웨이 자리는 비어 있으니 서울FC(홈)·부산FC(3번 자리)는 빠지고 대구FC 만 남는다.
    expect(within(screen.getByLabelText('어웨이 팀 선택')).getAllByRole('option').map((option) => option.textContent)).toEqual(['비워 두기', '대구FC']);
  });

  it('팀을 고르면 그 자리에 배정하고, 비워 두기는 null 로 보낸다', () => {
    const props = renderPanel();
    fireEvent.change(screen.getByLabelText('어웨이 팀 선택'), { target: { value: 'r3' } });
    expect(mocks.assign).toHaveBeenCalledWith({ slotId: 's-away', registrationId: 'r3' }, expect.any(Object));
    fireEvent.change(screen.getByLabelText('홈 팀 선택'), { target: { value: '' } });
    expect(mocks.assign).toHaveBeenLastCalledWith({ slotId: 's-home', registrationId: null }, expect.any(Object));

    mocks.assign.mock.calls[0][1].onSuccess();
    expect(props.showToast).toHaveBeenCalledWith('팀을 넣었어요.', 'success');
    mocks.assign.mock.calls[1][1].onSuccess();
    expect(props.showToast).toHaveBeenCalledWith('자리를 비웠어요.', 'success');
  });

  it('서버가 거절하면 해요체 안내를 토스트로 보여 준다', () => {
    const props = renderPanel();
    fireEvent.change(screen.getByLabelText('어웨이 팀 선택'), { target: { value: 'r3' } });
    mocks.assign.mock.calls[0][1].onError(
      new V1ApiError({ statusCode: 409, code: 'SLOT_TEAM_ALREADY_PLACED', message: 'x', details: null, requestId: 'r', timestamp: 't' } as unknown as ConstructorParameters<typeof V1ApiError>[0]),
    );
    expect(props.showToast).toHaveBeenCalledWith('이미 다른 자리에 들어간 팀이에요.', 'error');
  });

  it('시작된 칸은 선택창 대신 이유를 보여 준다', () => {
    renderPanel(fixtureOf({ game: makeGame({ state: 'LIVE' }) }));
    expect(screen.queryByLabelText('홈 팀 선택')).not.toBeInTheDocument();
    expect(screen.getAllByText('경기가 시작됐거나 결과가 있어 팀을 바꿀 수 없어요.')).toHaveLength(2);
  });

  it('자리가 없는 줄은 연결 결과로 채워진다고 알린다', () => {
    renderPanel(fixtureOf({ awaySlotId: null, bracketSources: [{ fixtureId: 'f0', outcome: 'WINNER', side: 'AWAY' }] }));
    expect(screen.queryByLabelText('어웨이 팀 선택')).not.toBeInTheDocument();
    expect(screen.getByText('이전 경기 결과로 채워져요.')).toBeInTheDocument();
  });

  it('신청 목록을 아직 못 불러왔으면 슬롯·직접 지정 선택창을 모두 잠근다', () => {
    renderPanel(fixtureOf(), { registrationsLoaded: false });
    expect(screen.getByLabelText('홈 팀 선택')).toBeDisabled();
    expect(screen.getByLabelText('어웨이 팀 선택')).toBeDisabled();
    cleanup();
    renderPanel(fixtureOf({ homeSlotId: null, awaySlotId: null }), { registrationsLoaded: false });
    expect(screen.getByLabelText('홈 팀 선택')).toBeDisabled();
  });

  it('자리 select 도 같은 기준으로 다른 조 팀을 뺀다 - 미편성 팀은 남고 다른 조 팀은 빠진다', () => {
    const memberOfB = { id: 'gt-r3', groupId: 'g-b', registrationId: 'r3', teamName: '대구FC', sortOrder: 0, createdAt: '' };
    const stageA = makeGroup({ id: 'g-a', name: 'A조', phase: 'group' });
    const stageB = makeGroup({ id: 'g-b', name: 'B조', phase: 'group', sortOrder: 1, groupTeams: [memberOfB] });
    renderPanel(fixtureOf({ groupId: 'g-a' }), {
      groups: [stageA, stageB],
      slots: [slots[0], makeSlot({ id: 's-away', label: '2번 자리', groupId: 'g-a' }), slots[2]],
      registrations: [...registrations, makeRegistration({ id: 'r4', teamName: '인천FC' })],
    });
    const options = within(screen.getByLabelText('어웨이 팀 선택')).getAllByRole('option').map((option) => option.textContent);
    expect(options).toContain('인천FC');
    expect(options).not.toContain('대구FC');
    expect(screen.getByText('다른 조에 있는 팀은 목록에서 빠져 있어요.')).toBeInTheDocument();
  });

  it('다른 조 팀이 이미 다른 자리에 있어서 빠진 거라면 "다른 조" 안내는 보이지 않는다', () => {
    // 부산FC(r2)는 B조 편성이면서 3번 자리에도 들어가 있다 — 자리 규칙이 먼저 숨기므로 조 규칙이 숨긴 팀은 없다.
    const memberOfB = { id: 'gt-r2', groupId: 'g-b', registrationId: 'r2', teamName: '부산FC', sortOrder: 0, createdAt: '' };
    renderPanel(fixtureOf({ groupId: 'g-a' }), {
      groups: [makeGroup({ id: 'g-a', name: 'A조', phase: 'group' }), makeGroup({ id: 'g-b', name: 'B조', phase: 'group', sortOrder: 1, groupTeams: [memberOfB] })],
      slots: [slots[0], makeSlot({ id: 's-away', label: '2번 자리', groupId: 'g-a' }), slots[2]],
    });
    expect(within(screen.getByLabelText('어웨이 팀 선택')).getAllByRole('option').map((option) => option.textContent)).toEqual(['비워 두기', '대구FC']);
    expect(screen.queryByText('다른 조에 있는 팀은 목록에서 빠져 있어요.')).not.toBeInTheDocument();
  });

  it('대조군 - 슬롯 조가 결선 조이면 다른 조 편성 팀도 모두 보인다', () => {
    const memberOfB = { id: 'gt-r3', groupId: 'g-b', registrationId: 'r3', teamName: '대구FC', sortOrder: 0, createdAt: '' };
    const stageB = makeGroup({ id: 'g-b', name: 'B조', phase: 'group', sortOrder: 1, groupTeams: [memberOfB] });
    renderPanel(fixtureOf(), {
      groups: [knockout, stageB],
      slots: [slots[0], makeSlot({ id: 's-away', label: '2번 자리', groupId: 'g-qf' }), slots[2]],
    });
    const options = within(screen.getByLabelText('어웨이 팀 선택')).getAllByRole('option').map((option) => option.textContent);
    expect(options).toContain('대구FC');
  });

  describe('자리 없이 팀을 직접 지정한 줄', () => {
    const legacy = (overrides: Partial<V1AdminBracketFixture> = {}) =>
      fixtureOf({ homeSlotId: null, awaySlotId: null, homeRegistrationId: 'r1', homeTeamName: '서울FC', ...overrides });

    it('연결 원천이 없으면 안내 문구 대신 선택창을 보여 주고, 반대편 팀은 목록에서 뺀다', () => {
      renderPanel(legacy({ awayRegistrationId: 'r2', awayTeamName: '부산FC' }));
      expect(screen.queryByText('이전 경기 결과로 채워져요.')).not.toBeInTheDocument();
      const home = screen.getByLabelText('홈 팀 선택');
      expect(home).toHaveValue('r1');
      expect(within(home).getAllByRole('option').map((option) => option.textContent)).toEqual(['비워 두기', '서울FC', '대구FC']);
      expect(within(screen.getByLabelText('어웨이 팀 선택')).getAllByRole('option').map((option) => option.textContent)).toEqual(['비워 두기', '부산FC', '대구FC']);
    });

    it('고른 쪽 한 줄만 PATCH 하고 슬롯 배정은 부르지 않는다', () => {
      const props = renderPanel(legacy());
      fireEvent.change(screen.getByLabelText('어웨이 팀 선택'), { target: { value: 'r3' } });
      expect(mocks.updateFixture).toHaveBeenCalledWith({ fixtureId: 'f1', awayRegistrationId: 'r3' }, expect.any(Object));
      expect(mocks.assign).not.toHaveBeenCalled();
      mocks.updateFixture.mock.calls[0][1].onSuccess({ startedTeamChange: null });
      expect(props.showToast).toHaveBeenCalledWith('팀을 넣었어요.', 'success');

      fireEvent.change(screen.getByLabelText('홈 팀 선택'), { target: { value: '' } });
      expect(mocks.updateFixture).toHaveBeenLastCalledWith({ fixtureId: 'f1', homeRegistrationId: null }, expect.any(Object));
      mocks.updateFixture.mock.calls[1][1].onSuccess({ startedTeamChange: null });
      expect(props.showToast).toHaveBeenLastCalledWith('자리를 비웠어요.', 'success');
    });

    it('서버가 거절하면 해요체 안내를 토스트로 보여 준다', () => {
      const props = renderPanel(legacy());
      fireEvent.change(screen.getByLabelText('어웨이 팀 선택'), { target: { value: 'r3' } });
      mocks.updateFixture.mock.calls[0][1].onError({});
      expect(props.showToast).toHaveBeenCalledWith('팀을 넣지 못했어요.', 'error');
    });

    describe('한 팀 한 조', () => {
      const member = (groupId: string, registrationId: string) => ({ id: `gt-${registrationId}`, groupId, registrationId, teamName: registrationId, sortOrder: 0, createdAt: '' });
      const stageA = makeGroup({ id: 'g-a', name: 'A조', phase: 'group', groupTeams: [member('g-a', 'r1')] });
      const stageB = makeGroup({ id: 'g-b', name: 'B조', phase: 'group', sortOrder: 1, groupTeams: [member('g-b', 'r2')] });
      const quarter = makeGroup({ id: 'g-qf', name: '8강', phase: 'quarter', sortOrder: 2 });
      const empty = (groupId: string) => legacy({ groupId, homeRegistrationId: null, homeTeamName: '홈 팀 미정' });
      const homeOptions = () => within(screen.getByLabelText('홈 팀 선택')).getAllByRole('option').map((option) => option.textContent);

      it('조별 경기의 후보에서 다른 조 팀을 빼고, 이 조 팀과 어느 조에도 없는 팀은 남기며, 빠졌다는 안내를 보여 준다', () => {
        renderPanel(empty('g-a'), { groups: [stageA, stageB, quarter] });
        expect(homeOptions()).toEqual(['비워 두기', '서울FC', '대구FC']);
        expect(screen.getByText('다른 조에 있는 팀은 목록에서 빠져 있어요.')).toBeInTheDocument();
      });

      it('대조군 - B조 경기에서는 반대로 A조 팀이 빠지고, 빠진 팀이 없으면 안내도 없다', () => {
        renderPanel(empty('g-b'), { groups: [stageA, stageB, quarter] });
        expect(homeOptions()).toEqual(['비워 두기', '부산FC', '대구FC']);
        cleanup();
        renderPanel(empty('g-a'), { groups: [stageA, quarter] });
        expect(screen.queryByText('다른 조에 있는 팀은 목록에서 빠져 있어요.')).not.toBeInTheDocument();
      });

      it('대조군 - 결선 단계 경기는 조 편성과 상관없이 모두 보인다', () => {
        renderPanel(empty('g-qf'), { groups: [stageA, stageB, quarter] });
        expect(homeOptions()).toEqual(['비워 두기', '서울FC', '부산FC', '대구FC']);
      });

      it('다른 조 팀이 반대편 사이드라서 빠진 거라면 "다른 조" 안내는 보이지 않는다', () => {
        // 부산FC(r2)는 B조 편성이지만 이 경기의 어웨이 팀이다 — 홈 목록에서는 반대편 규칙이 먼저 뺀다.
        renderPanel(legacy({ groupId: 'g-a', homeRegistrationId: null, homeTeamName: '홈 팀 미정', awayRegistrationId: 'r2', awayTeamName: '부산FC' }), { groups: [stageA, stageB, quarter] });
        expect(homeOptions()).toEqual(['비워 두기', '서울FC', '대구FC']);
        expect(screen.queryByText('다른 조에 있는 팀은 목록에서 빠져 있어요.')).not.toBeInTheDocument();
      });

      it('이미 들어 있는 팀이 다른 조 편성이어도 현재 값은 목록에 남는다', () => {
        renderPanel(legacy({ groupId: 'g-a', homeRegistrationId: 'r2', homeTeamName: '부산FC' }), { groups: [stageA, stageB] });
        expect(screen.getByLabelText('홈 팀 선택')).toHaveValue('r2');
        expect(homeOptions()).toContain('부산FC');
      });
    });

    describe('시작된 경기', () => {
      const started = (overrides: Partial<V1AdminBracketFixture> = {}) =>
        legacy({ awayRegistrationId: 'r2', awayTeamName: '부산FC', game: makeGame({ state: 'LIVE' }), ...overrides });
      const revision = (state: 'OFFICIAL' | 'SUBMITTED' | 'VOID') => ({
        id: 'rev-1', state, score: { home: 1, away: 0 }, entryMethod: 'console' as const,
      });

      it('팀 선택창을 그대로 쓰고, 고르면 요청을 보내기 전에 확인과 사유를 먼저 받는다', async () => {
        renderPanel(started());
        fireEvent.change(screen.getByLabelText('홈 팀 선택'), { target: { value: 'r3' } });
        const dialog = await screen.findByRole('dialog', { name: '시작된 경기의 팀을 바꿀까요?' });
        expect(dialog).toHaveTextContent('서울FC 쪽 명단과 기록');
        expect(mocks.updateFixture).not.toHaveBeenCalled();
        expect(within(dialog).getByRole('button', { name: '팀 바꾸기' })).toBeDisabled();
      });

      it('사유를 적고 확인하면 teamChangeReason 과 함께 보내고, 지운 기록 수를 토스트로 알린다', async () => {
        const props = renderPanel(started());
        fireEvent.change(screen.getByLabelText('홈 팀 선택'), { target: { value: 'r3' } });
        const dialog = await screen.findByRole('dialog', { name: '시작된 경기의 팀을 바꿀까요?' });
        fireEvent.change(within(dialog).getByLabelText('바꾸는 이유'), { target: { value: '  참가 팀 사정  ' } });
        fireEvent.click(within(dialog).getByRole('button', { name: '팀 바꾸기' }));
        await vi.waitFor(() => expect(mocks.updateFixture).toHaveBeenCalledTimes(1));
        expect(mocks.updateFixture).toHaveBeenCalledWith(
          { fixtureId: 'f1', homeRegistrationId: 'r3', teamChangeReason: '참가 팀 사정' },
          expect.any(Object),
        );
        mocks.updateFixture.mock.calls[0][1].onSuccess({ startedTeamChange: { removedEventCount: 4, score: { home: 0, away: 1 } } });
        expect(props.showToast).toHaveBeenCalledWith('팀을 바꿨어요. 옛 팀 기록 4건을 지웠어요.', 'success');
      });

      it('확인 창에서 취소하면 아무것도 보내지 않는다', async () => {
        renderPanel(started());
        fireEvent.change(screen.getByLabelText('홈 팀 선택'), { target: { value: 'r3' } });
        const dialog = await screen.findByRole('dialog', { name: '시작된 경기의 팀을 바꿀까요?' });
        fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
        await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(mocks.updateFixture).not.toHaveBeenCalled();
      });

      it('시작 전 경기는 확인 창 없이 바로 보낸다', () => {
        renderPanel(legacy());
        fireEvent.change(screen.getByLabelText('어웨이 팀 선택'), { target: { value: 'r3' } });
        expect(mocks.updateFixture).toHaveBeenCalledWith({ fixtureId: 'f1', awayRegistrationId: 'r3' }, expect.any(Object));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      it('결과가 무효로 돌려진 종료 경기는 바꿀 수 있다', () => {
        renderPanel(started({ game: makeGame({ state: 'ENDED', latestRevision: revision('VOID') }) }));
        expect(screen.getByLabelText('홈 팀 선택')).toBeEnabled();
      });

      it('공식 결과가 있으면 선택창 대신 무효 안내와 정정 화면 링크를 보여 준다', () => {
        renderPanel(started({ game: makeGame({ state: 'ENDED', hasOfficialResult: true, latestRevision: revision('OFFICIAL') }) }));
        expect(screen.queryByLabelText('홈 팀 선택')).not.toBeInTheDocument();
        expect(screen.getAllByText('공식 결과가 확정된 경기예요. 결과를 먼저 무효로 돌려 주세요.')).toHaveLength(2);
        expect(screen.getAllByRole('link', { name: '결과 정정 화면 열기' })[0]).toHaveAttribute('href', expect.stringContaining('/records/corrections?fixtureId=f1'));
      });

      it('제출만 된 결과는 서버가 교체 때 폐기하므로 바꿀 수 있다', () => {
        renderPanel(started({ game: makeGame({ state: 'ENDED', latestRevision: revision('SUBMITTED') }) }));
        expect(screen.getByLabelText('홈 팀 선택')).toBeEnabled();
      });
    });

    it('읽기 전용이면 선택창이 없다', () => {
      renderPanel(legacy(), { canWrite: false });
      expect(screen.queryByLabelText('홈 팀 선택')).not.toBeInTheDocument();
    });

    it('한쪽만 연결 원천이 있으면 그쪽은 안내 문구, 다른 쪽은 선택창이다', () => {
      renderPanel(legacy({ bracketSources: [{ fixtureId: 'f0', outcome: 'WINNER', side: 'AWAY' }] }));
      expect(screen.getByLabelText('홈 팀 선택')).toBeInTheDocument();
      expect(screen.queryByLabelText('어웨이 팀 선택')).not.toBeInTheDocument();
      expect(screen.getAllByText('이전 경기 결과로 채워져요.')).toHaveLength(1);
    });
  });

  it('읽기 전용이면 선택창·저장·삭제·점수 입력이 모두 없다', () => {
    renderPanel(fixtureOf({ awayRegistrationId: 'r3', awayTeamName: '대구FC' }), { canWrite: false });
    expect(screen.queryByLabelText('홈 팀 선택')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '일정 저장' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '경기 삭제' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '점수 확정' })).not.toBeInTheDocument();
  });
});

describe('BracketNodePanel — 일정·삭제', () => {
  it('KST 로 입력한 시각을 UTC ISO 로 바꿔 저장하고, 장소를 안 건드렸으면 장소 필드는 보내지 않는다', () => {
    renderPanel(fixtureOf({ venue: '탄천 보조구장' }));
    fireEvent.change(screen.getByLabelText('경기 시각'), { target: { value: '2026-10-10T14:00' } });
    fireEvent.click(screen.getByRole('button', { name: '일정 저장' }));
    expect(mocks.updateFixture).toHaveBeenCalledWith(
      { fixtureId: 'f1', scheduledAt: '2026-10-10T05:00:00.000Z' },
      expect.any(Object),
    );
  });

  it('장소 이름을 바꾸면 venue 를 함께 보낸다', () => {
    renderPanel(fixtureOf({ venue: '탄천 보조구장' }));
    fireEvent.change(screen.getByLabelText('장소'), { target: { value: '상암 보조구장' } });
    fireEvent.click(screen.getByRole('button', { name: '일정 저장' }));
    expect(mocks.updateFixture.mock.calls.at(-1)?.[0]).toMatchObject({ fixtureId: 'f1', venue: '상암 보조구장' });
  });

  it('삭제는 확인을 거치고, 성공하면 패널을 닫는다', async () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '경기 삭제' }));
    const dialog = await screen.findByRole('dialog');
    expect(mocks.deleteFixture).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
    await vi.waitFor(() => expect(mocks.deleteFixture).toHaveBeenCalledWith('f1', expect.any(Object)));
    mocks.deleteFixture.mock.calls[0][1].onSuccess();
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('닫기 버튼은 onClose 를 부른다', () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('BracketNodePanel — 결과 구역', () => {
  const readyFixture = (overrides: Partial<V1AdminBracketFixture> = {}) =>
    fixtureOf({ awayRegistrationId: 'r3', awayTeamName: '대구FC', ...overrides });

  it('양쪽 팀이 정해진 예정 경기는 점수 입력 폼을 보여 주고 빠른 결과로 보낸다', () => {
    renderPanel(readyFixture());
    fireEvent.change(screen.getByLabelText('서울FC 점수'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('대구FC 점수'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '점수 확정' }));
    expect(mocks.quick).toHaveBeenCalledWith({ gameId: 'game-1', expectedVersion: 3, score: { home: 2, away: 1 } }, expect.any(Object));
  });

  it('서버가 명단 동기화 중이라고 하면 입력을 둔 채 안내를 폼 안에 보여 준다', () => {
    renderPanel(readyFixture());
    fireEvent.change(screen.getByLabelText('서울FC 점수'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('대구FC 점수'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '점수 확정' }));
    act(() => {
      mocks.quick.mock.calls[0][1].onError(
        new V1ApiError({ statusCode: 409, code: 'QUICK_RESULT_ROSTER_SYNCING', message: 'x', details: null, requestId: 'r', timestamp: 't' } as unknown as ConstructorParameters<typeof V1ApiError>[0]),
      );
    });
    expect(screen.getByRole('alert')).toHaveTextContent('명단을 맞추는 중이에요. 잠시 뒤 다시 눌러 주세요.');
    expect(screen.getByLabelText('서울FC 점수')).toHaveValue('2');
  });

  it('결선 경기 무승부에는 승부차기 입력란이 나온다', () => {
    renderPanel(readyFixture());
    fireEvent.change(screen.getByLabelText('서울FC 점수'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('대구FC 점수'), { target: { value: '1' } });
    expect(screen.getByLabelText('서울FC 승부차기')).toBeInTheDocument();
  });

  it('조별 경기는 무승부여도 승부차기 입력란이 없다', () => {
    renderPanel(readyFixture({ groupId: 'g-a' }));
    fireEvent.change(screen.getByLabelText('서울FC 점수'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('대구FC 점수'), { target: { value: '1' } });
    expect(screen.queryByLabelText('서울FC 승부차기')).not.toBeInTheDocument();
  });

  it('한쪽 팀이 비어 있으면 폼 대신 이유를 보여 준다', () => {
    renderPanel(fixtureOf());
    expect(screen.getByText('양쪽 팀이 정해지면 점수를 넣을 수 있어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '점수 확정' })).not.toBeInTheDocument();
  });

  it('진행 중인 경기는 라이브 콘솔에서 입력하라고 안내한다', () => {
    renderPanel(readyFixture({ game: makeGame({ state: 'LIVE' }) }));
    expect(screen.getByText('진행 중인 경기는 라이브 콘솔에서 입력해요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '점수 확정' })).not.toBeInTheDocument();
  });

  it('라이브 득점 기록이 있고 결과가 없으면 정정 화면 링크를 준다', () => {
    renderPanel(readyFixture({ game: makeGame({ id: 'game-1', state: 'ENDED', hasLiveRecords: true }) }));
    expect(screen.getByRole('link', { name: '결과 정정 화면 열기' })).toHaveAttribute('href', '/admin/live/t-1/records/corrections?fixtureId=f1');
    expect(screen.queryByRole('button', { name: '점수 확정' })).not.toBeInTheDocument();
  });

  it('결과가 있으면 폼 대신 확정·정정·무효 동작을 보여 준다', () => {
    renderPanel(
      readyFixture({
        game: makeGame({ id: 'game-1', state: 'ENDED', hasOfficialResult: true, latestRevision: { id: 'rev', state: 'OFFICIAL', entryMethod: 'quick', score: { home: 1, away: 0 } } }),
      }),
    );
    expect(screen.getByTestId('result-actions')).toHaveTextContent('game-1');
    expect(screen.queryByRole('button', { name: '점수 확정' })).not.toBeInTheDocument();
  });

  it('무효 처리된 결과는 다시 입력할 수 있게 폼을 연다', () => {
    renderPanel(
      readyFixture({
        game: makeGame({ id: 'game-1', state: 'ENDED', latestRevision: { id: 'rev', state: 'VOID', entryMethod: 'quick', score: { home: 1, away: 0 } } }),
      }),
    );
    expect(screen.getByText('무효 처리된 결과예요. 점수를 다시 넣을 수 있어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '점수 확정' })).toBeInTheDocument();
  });
});
