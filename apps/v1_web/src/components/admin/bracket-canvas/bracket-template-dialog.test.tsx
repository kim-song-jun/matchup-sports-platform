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
  render(<BracketTemplateDialog {...props} />);
  return props;
}

const create = () => fireEvent.click(screen.getByRole('button', { name: '대진 만들기' }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BracketTemplateDialog — 토너먼트', () => {
  it('8팀 + 3·4위전이 기본이고 만들어질 개수를 미리 보여 준다', () => {
    renderDialog();
    expect(screen.getByLabelText('8팀')).toBeChecked();
    expect(screen.getByLabelText('3·4위전도 만들기')).toBeChecked();
    expect(screen.getByText('경기 8개 · 자리 8개 · 연결 8개')).toBeInTheDocument();
  });

  it('팀 수와 3·4위전 선택에 따라 미리보기가 바뀐다', () => {
    renderDialog();
    fireEvent.click(screen.getByLabelText('12팀'));
    expect(screen.getByText('경기 12개 · 자리 12개 · 연결 12개')).toBeInTheDocument();
    expect(screen.getByText(/4팀은 부전승으로 8강에 올라가요/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('3·4위전도 만들기'));
    expect(screen.getByText('경기 11개 · 자리 12개 · 연결 10개')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('4팀'));
    expect(screen.getByText('경기 3개 · 자리 4개 · 연결 2개')).toBeInTheDocument();
  });

  it('16팀은 부전승 안내 없이 경기 16개(3·4위전 없으면 15개)를 미리 보여 준다', () => {
    renderDialog();
    fireEvent.click(screen.getByLabelText('16팀'));
    expect(screen.getByText('경기 16개 · 자리 16개 · 연결 16개')).toBeInTheDocument();
    expect(screen.queryByText(/부전승/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('3·4위전도 만들기'));
    expect(screen.getByText('경기 15개 · 자리 16개 · 연결 14개')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('3·4위전도 만들기'));
    create();
    expect(mocks.apply).toHaveBeenCalledWith({ kind: 'knockout', size: 16, thirdPlace: true }, expect.any(Object));
  });

  it('대진이 비어 있으면 replaceExisting 없이 만들고, 성공하면 개수를 알리고 닫는다', () => {
    const props = renderDialog();
    create();
    expect(mocks.apply).toHaveBeenCalledWith({ kind: 'knockout', size: 8, thirdPlace: true }, expect.any(Object));
    mocks.apply.mock.calls[0][1].onSuccess({ groups: 4, slots: 8, fixtures: 8, edges: 8 });
    expect(props.showToast).toHaveBeenCalledWith('경기 8개와 자리 8개를 만들었어요.', 'success');
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
