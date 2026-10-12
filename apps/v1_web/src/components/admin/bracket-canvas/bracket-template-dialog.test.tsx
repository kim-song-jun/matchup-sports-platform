import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { BracketTemplateDialog } from './bracket-template-dialog';

const mocks = vi.hoisted(() => ({ apply: vi.fn() }));
vi.mock('@/hooks/use-v1-bracket-canvas', () => ({
  useV1ApplyBracketTemplate: () => ({ mutate: mocks.apply, isPending: false }),
}));

function renderDialog(overrides: Partial<React.ComponentProps<typeof BracketTemplateDialog>> = {}) {
  const props = {
    open: true,
    tournamentId: 't-1',
    format: 'knockout' as const,
    hasExistingBracket: false,
    onClose: vi.fn(),
    showToast: vi.fn(),
    ...overrides,
  };
  const view = render(<BracketTemplateDialog {...props} />);
  return {
    ...props,
    rerender: (nextOverrides: Partial<React.ComponentProps<typeof BracketTemplateDialog>>) =>
      view.rerender(<BracketTemplateDialog {...props} {...nextOverrides} />),
  };
}

const create = () => fireEvent.click(screen.getByRole('button', { name: '대진 만들기' }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BracketTemplateDialog — 참가 수 동기화', () => {
  it('닫혀 있는 동안 확정 참가팀이 로드되면 열 때 최신 수를 사용한다', async () => {
    const dialog = renderDialog({ open: false, confirmedTeamCount: 0 });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    dialog.rerender({ open: true, confirmedTeamCount: 12 });

    await waitFor(() => expect(screen.getByLabelText('참가 팀 수')).toHaveValue('12'));
    expect(screen.getByLabelText('12팀 대진 틀')).toBeChecked();
  });

  it('열린 뒤 아직 건드리지 않은 입력은 확정 참가팀 수가 도착하면 갱신한다', async () => {
    const dialog = renderDialog({ open: true, confirmedTeamCount: 0 });
    expect(screen.getByLabelText('참가 팀 수')).toHaveValue('8');

    dialog.rerender({ confirmedTeamCount: 12 });

    await waitFor(() => expect(screen.getByLabelText('참가 팀 수')).toHaveValue('12'));
  });

  it('운영자가 참가 수를 편집하면 늦게 도착한 확정 수로 덮어쓰지 않는다', async () => {
    const dialog = renderDialog({ open: true, confirmedTeamCount: 0 });
    fireEvent.change(screen.getByLabelText('참가 팀 수'), { target: { value: '4' } });

    dialog.rerender({ confirmedTeamCount: 12 });

    await waitFor(() => expect(screen.getByLabelText('참가 팀 수')).toHaveValue('4'));
  });

  it('다시 열 때는 마지막 확정 참가 수를 이전 입력보다 우선한다', async () => {
    const dialog = renderDialog({ open: true, confirmedTeamCount: 4 });
    fireEvent.change(screen.getByLabelText('참가 팀 수'), { target: { value: '8' } });

    dialog.rerender({ open: false, confirmedTeamCount: 12 });
    dialog.rerender({ open: true, confirmedTeamCount: 12 });

    await waitFor(() => expect(screen.getByLabelText('참가 팀 수')).toHaveValue('12'));
    expect(screen.getByLabelText('12팀 대진 틀')).toBeChecked();
  });

  it.each(['pending', 'error'] as const)('참가팀 목록이 %s이면 인원 수를 추측하지 않고 적용을 막는다', (status) => {
    renderDialog({ confirmedTeamCountStatus: status });
    expect(screen.getByLabelText('참가 팀 수')).toHaveValue('');
    if (status === 'pending') {
      expect(screen.getByRole('status')).toHaveTextContent('불러오는 중');
    } else {
      expect(screen.getByText('확정 참가팀 수를 불러오지 못했어요. 참가팀 목록을 다시 불러온 뒤 대진을 만들어 주세요.')).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: '대진 만들기' })).toBeDisabled();
  });
});

describe('BracketTemplateDialog — 토너먼트', () => {
  it('조별+결선에서 20팀·5조→12강을 고르면 41경기를 만들고 특수 진출 규칙을 보낸다', () => {
    renderDialog({ format: 'group_knockout' });
    fireEvent.click(screen.getByLabelText('20팀 · 5개 조 → 12강 (3위 상위 2팀 추가)'));
    expect(screen.getByText('경기 41개 · 자리 32개 · 연결 10개')).toBeInTheDocument();
    expect(screen.getByLabelText('조 수')).toBeDisabled();
    create();
    expect(mocks.apply).toHaveBeenCalledWith({
      kind: 'group_knockout', groupCount: 5, teamsPerGroup: 4, advancePerGroup: 2, legs: 1,
      thirdPlace: false, qualificationMode: 'cross_group_round12',
    }, expect.any(Object));
  });
  it('8팀 + 3·4위전이 기본이고 만들어질 개수를 미리 보여 준다', () => {
    renderDialog();
    expect(screen.getByLabelText('8팀 대진 틀')).toBeChecked();
    expect(screen.getByLabelText('3·4위전도 만들기')).toBeChecked();
    expect(screen.getByText('경기 8개 · 자리 8개 · 연결 8개')).toBeInTheDocument();
  });

  it('팀 수와 3·4위전 선택에 따라 미리보기가 바뀐다', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('참가 팀 수'), { target: { value: '12' } });
    expect(screen.getByText('경기 12개 · 자리 12개 · 연결 12개')).toBeInTheDocument();
    expect(screen.getByText(/진행 순서:/)).toHaveTextContent('12강 4경기 → 부전승 4자리 → 8강 4경기');
    expect(screen.getByText(/4팀은 부전승으로 8강에 올라가요/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('3·4위전도 만들기'));
    expect(screen.getByText('경기 11개 · 자리 12개 · 연결 10개')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('참가 팀 수'), { target: { value: '4' } });
    expect(screen.getByText('경기 3개 · 자리 4개 · 연결 2개')).toBeInTheDocument();
  });

  it('16팀은 부전승 안내 없이 경기 16개(3·4위전 없으면 15개)를 미리 보여 준다', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('참가 팀 수'), { target: { value: '16' } });
    expect(screen.getByLabelText('16팀 대진 틀')).toBeChecked();
    expect(screen.getByText('경기 16개 · 자리 16개 · 연결 16개')).toBeInTheDocument();
    expect(screen.queryByText(/부전승/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('3·4위전도 만들기'));
    expect(screen.getByText('경기 15개 · 자리 16개 · 연결 14개')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('3·4위전도 만들기'));
    create();
    expect(mocks.apply).toHaveBeenCalledWith({ kind: 'knockout', size: 16, thirdPlace: true }, expect.any(Object));
  });


  it.each(['3', '5', '6', '7', '9', '10', '11', '13', '14', '15', '17', '20'])(
    '기존 템플릿이 없는 %s팀은 추천 대진을 만들지 않고 지원 수를 설명한다',
    (teamCount) => {
      renderDialog();
      fireEvent.change(screen.getByLabelText('참가 팀 수'), { target: { value: teamCount } });
      expect(screen.getByRole('alert')).toHaveTextContent('정확히 4·8·12·16팀');
      expect(screen.getByRole('button', { name: '대진 만들기' })).toBeDisabled();
      expect(screen.queryByText(/빈 자리/)).not.toBeInTheDocument();
    },
  );

  it('대진이 비어 있으면 replaceExisting 없이 만들고, 성공하면 개수를 알리고 닫는다', () => {
    const applied = vi.fn();
    const props = renderDialog({ onApplied: applied });
    create();
    expect(mocks.apply).toHaveBeenCalledWith({ kind: 'knockout', size: 8, thirdPlace: true }, expect.any(Object));
    mocks.apply.mock.calls[0][1].onSuccess({ groups: 4, slots: 8, fixtures: 8, edges: 8 });
    expect(props.showToast).toHaveBeenCalledWith('경기 8개와 자리 8개를 만들었어요.', 'success');
    expect(applied).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('서버가 거절하면 이유를 토스트로 알리고 대화상자는 닫지 않는다', () => {
    const props = renderDialog();
    create();
    mocks.apply.mock.calls[0][1].onError(
      new V1ApiError({ statusCode: 409, code: 'BRACKET_LOCKED', message: 'x', details: null, requestId: 'r', timestamp: 't' } as unknown as ConstructorParameters<typeof V1ApiError>[0]),
    );
    expect(props.showToast).toHaveBeenCalledWith('시작했거나 결과가 있는 경기가 있어 대진을 교체할 수 없어요.', 'error');
    expect(props.onClose).not.toHaveBeenCalled();
  });
});

describe('BracketTemplateDialog — 기존 대진 교체', () => {
  it('확인에서 교체를 누르면 replaceExisting: true 로 만든다', async () => {
    renderDialog({ hasExistingBracket: true });
    expect(screen.getByText(/기존 대진이 모두 지워지고 새로 만들어져요/)).toBeInTheDocument();
    create();
    const confirmDialog = await screen.findByRole('dialog', { name: '기존 대진 교체' });
    expect(mocks.apply).not.toHaveBeenCalled();
    fireEvent.click(within(confirmDialog).getByRole('button', { name: '교체' }));
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(1));
    expect(mocks.apply).toHaveBeenCalledWith({ kind: 'knockout', size: 8, thirdPlace: true, replaceExisting: true }, expect.any(Object));
  });

  it('확인에서 취소하면 아무것도 보내지 않는다', async () => {
    renderDialog({ hasExistingBracket: true });
    create();
    const confirmDialog = await screen.findByRole('dialog', { name: '기존 대진 교체' });
    fireEvent.click(within(confirmDialog).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '기존 대진 교체' })).not.toBeInTheDocument());
    expect(mocks.apply).not.toHaveBeenCalled();
  });
});

describe('BracketTemplateDialog — 리그 방식 대회', () => {
  const typeTeams = (value: string) => fireEvent.change(screen.getByLabelText('팀 수'), { target: { value } });

  it('팀 수와 회전 수로 경기 수를 미리 보여 주고 league 본문으로 보낸다', () => {
    renderDialog({ format: 'league' });
    typeTeams('6');
    fireEvent.click(screen.getByLabelText('2회전'));
    expect(screen.getByText('경기 30개 · 자리 6개')).toBeInTheDocument();
    create();
    expect(mocks.apply).toHaveBeenCalledWith({ kind: 'league', teamCount: 6, legs: 2 }, expect.any(Object));
  });

  it.each([['2'], ['21'], [''], ['4.5']])('팀 수 %s 는 3~20 범위 밖이라 만들 수 없다', (value) => {
    renderDialog({ format: 'league' });
    typeTeams(value);
    expect(screen.getByRole('button', { name: '대진 만들기' })).toBeDisabled();
    expect(screen.getByText('팀 수는 3팀부터 20팀까지 정할 수 있어요.')).toBeInTheDocument();
  });

  it('경기가 240개를 넘으면 만들 수 없다(경계: 16팀 2회전 240개는 가능, 17팀은 불가)', () => {
    renderDialog({ format: 'league' });
    fireEvent.click(screen.getByLabelText('2회전'));
    typeTeams('16');
    expect(screen.getByRole('button', { name: '대진 만들기' })).toBeEnabled();
    typeTeams('17');
    expect(screen.getByRole('button', { name: '대진 만들기' })).toBeDisabled();
    expect(screen.getByText('경기가 240개를 넘어서 만들 수 없어요. 팀 수나 회전 수를 줄여 주세요.')).toBeInTheDocument();
  });
});

describe('BracketTemplateDialog — 열림', () => {
  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    renderDialog({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('BracketTemplateDialog — 조별+결선', () => {
  const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it('대회 종류 확인 전에는 split 선택을 숨기고 lowerBracket 요청을 보내지 않는다', () => {
    renderDialog({ format: 'group_knockout' });
    expect(screen.queryByLabelText('상위·하위 결선도 만들기')).not.toBeInTheDocument();
    create();
    expect(mocks.apply).toHaveBeenCalledWith(
      { kind: 'group_knockout', groupCount: 2, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: false },
      expect.any(Object),
    );
  });

  it('2조 x 4팀 2팀 진출이 기본이고 만들어질 개수를 미리 보여 준다', () => {
    renderDialog({ format: 'group_knockout', allowSplitBracket: true });
    expect(screen.getByLabelText('조 수')).toHaveValue('2');
    expect(screen.getByText('경기 15개 · 자리 12개 · 연결 2개')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('3·4위전도 만들기'));
    expect(screen.getByText('경기 16개 · 자리 12개 · 연결 4개')).toBeInTheDocument();
  });

  it('만들기는 계약 본문(group_knockout 평탄화)으로 보낸다', () => {
    renderDialog({ format: 'group_knockout', allowSplitBracket: true });
    change('참가 팀 수', '12');
    change('가능한 조 편성', '2:6:2');
    change('조별 회전', '2');
    create();
    expect(mocks.apply).toHaveBeenCalledWith(
      { kind: 'group_knockout', groupCount: 2, teamsPerGroup: 6, advancePerGroup: 2, legs: 2, thirdPlace: false },
      expect.any(Object),
    );
  });

  it('상위·하위 결선을 선택하면 두 결선 경기 수를 합산하고 lowerBracket 계약을 보낸다', () => {
    renderDialog({ format: 'group_knockout', allowSplitBracket: true });
    fireEvent.click(screen.getByLabelText('상위·하위 결선도 만들기'));

    // 2조 × 4팀 조별 12경기 + 4강/결승 각 3경기 × 두 결선.
    expect(screen.getByText('경기 18개 · 자리 16개 · 연결 4개')).toBeInTheDocument();
    create();
    expect(mocks.apply).toHaveBeenCalledWith(
      { kind: 'group_knockout', groupCount: 2, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: false, lowerBracket: true },
      expect.any(Object),
    );
  });

  it('분리 결선은 4팀 이상이 있는 조에서만 만들 수 있다', () => {
    renderDialog({ format: 'group_knockout', allowSplitBracket: true });
    change('참가 팀 수', '6');
    change('가능한 조 편성', '2:3:2');
    fireEvent.click(screen.getByLabelText('상위·하위 결선도 만들기'));
    expect(screen.getByRole('button', { name: '대진 만들기' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('4팀');
  });

  it('현재 참가 수와 맞는 지원 구성이 없으면 만들 수 없고 이유를 보여 준다', () => {
    renderDialog({ format: 'group_knockout' });
    change('참가 팀 수', '11');
    expect(screen.getByRole('button', { name: '대진 만들기' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('지원 범위');
    expect(screen.queryByText(/^경기 \d+개/)).not.toBeInTheDocument();
    change('참가 팀 수', '12');
    expect(screen.getByRole('button', { name: '대진 만들기' })).toBeEnabled();
  });

  it('경기가 240개를 넘으면 만들 수 없다 (8조 x 6팀 x 2회전 = 247개, 5팀이면 167개로 가능)', () => {
    renderDialog({ format: 'group_knockout' });
    change('참가 팀 수', '40');
    change('가능한 조 편성', '8:5:1');
    change('조별 회전', '2');
    expect(screen.getByRole('button', { name: '대진 만들기' })).toBeEnabled();
    change('참가 팀 수', '48');
    change('가능한 조 편성', '8:6:1');
    expect(screen.getByRole('button', { name: '대진 만들기' })).toBeDisabled();
    expect(screen.getByText('경기가 240개를 넘어서 만들 수 없어요. 팀 수나 회전 수를 줄여 주세요.')).toBeInTheDocument();
  });

  it('8조 x 4팀 2팀 진출은 16강을 만든다 — 개수 미리보기 63개(3·4위전 64개), 본문은 groupCount 8 · advancePerGroup 2', () => {
    renderDialog({ format: 'group_knockout' });
    change('참가 팀 수', '32');
    change('가능한 조 편성', '8:4:2');
    expect(screen.getByRole('button', { name: '대진 만들기' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('경기 63개 · 자리 48개 · 연결 14개')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('3·4위전도 만들기'));
    expect(screen.getByText('경기 64개 · 자리 48개 · 연결 16개')).toBeInTheDocument();
    create();
    expect(mocks.apply).toHaveBeenCalledWith(
      { kind: 'group_knockout', groupCount: 8, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: true },
      expect.any(Object),
    );
  });

  it('16강 조합도 경기가 240개를 넘으면 막는다 (8조 x 6팀 x 2회전 + 16강 = 256개, 5팀이면 176개로 가능)', () => {
    renderDialog({ format: 'group_knockout' });
    change('참가 팀 수', '40');
    change('가능한 조 편성', '8:5:2');
    change('조별 회전', '2');
    expect(screen.getByRole('button', { name: '대진 만들기' })).toBeEnabled();
    change('참가 팀 수', '48');
    change('가능한 조 편성', '8:6:2');
    expect(screen.getByRole('button', { name: '대진 만들기' })).toBeDisabled();
    expect(screen.getByText('경기가 240개를 넘어서 만들 수 없어요. 팀 수나 회전 수를 줄여 주세요.')).toBeInTheDocument();
    change('조별 회전', '1');
    expect(screen.getByRole('button', { name: '대진 만들기' })).toBeEnabled();
  });

  it('기존 대진이 있으면 확인을 거쳐 replaceExisting: true 로 보낸다', async () => {
    renderDialog({ format: 'group_knockout', hasExistingBracket: true });
    create();
    const confirmDialog = await screen.findByRole('dialog', { name: '기존 대진 교체' });
    fireEvent.click(within(confirmDialog).getByRole('button', { name: '교체' }));
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(1));
    expect(mocks.apply).toHaveBeenCalledWith(
      { kind: 'group_knockout', groupCount: 2, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: false, replaceExisting: true },
      expect.any(Object),
    );
  });

  it('토너먼트·리그 대회의 화면은 그대로다 — 조별 입력 칸이 없다 (대조군)', () => {
    renderDialog({ format: 'knockout' });
    expect(screen.queryByLabelText('조 수')).not.toBeInTheDocument();
  });
});
