import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFixture, makeGroup } from '@/test/bracket-canvas-fixtures';
import { BracketPublishControl, isRegistrationClosed, summarizeBracket, type BracketPublishControlProps } from './bracket-publish-control';

const hooks = vi.hoisted(() => ({ publish: vi.fn(), unpublish: vi.fn() }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1PublishTournamentBracket: () => ({ mutate: hooks.publish, isPending: false }),
  useV1UnpublishTournamentBracket: () => ({ mutate: hooks.unpublish, isPending: false }),
}));

const showToast = vi.fn();
beforeEach(() => { hooks.publish.mockReset(); hooks.unpublish.mockReset(); showToast.mockReset(); });
afterEach(() => cleanup());

function show(overrides: Partial<BracketPublishControlProps> = {}) {
  return render(<BracketPublishControl tournamentId="t-1" canWrite layout="inline" bracketPublishedAt={null} bracketPublishScheduledAt={null}
    registrationDeadlineAt="2020-01-01T00:00:00.000Z" hasGroups summary="조별리그 2개 조 · 4강 · 결승, 15경기" showToast={showToast} {...overrides} />);
}
const sheet = () => screen.getByRole('dialog', { name: /대진을 공개할까요|공개 설정/ });

describe('BracketPublishControl', () => {
  it('비공개: 「비공개」 배지 + 「대진 공개」 하나. 누르면 시트에 요약·「지금 공개」·「시각 정해 공개」', () => {
    show();
    expect(screen.getByText('비공개')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '대진 공개' }));
    const dialog = sheet();
    expect(dialog).toHaveAccessibleName('대진을 공개할까요?');
    expect(dialog).toHaveTextContent('조별리그 2개 조 · 4강 · 결승, 15경기');
    expect(within(dialog).getByRole('radio', { name: /지금 공개/ })).toBeChecked();
    expect(within(dialog).getByRole('radio', { name: /시각 정해 공개/ })).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: '지금 공개' })).toBeInTheDocument();
  });

  it('마감 전이면 주황 안내 「신청 마감 전이에요. 그래도 공개할까요?」(warning)와 일반 파란 「지금 공개」(danger 아님)', () => {
    show({ registrationDeadlineAt: '2099-01-01T00:00:00.000Z' });
    fireEvent.click(screen.getByRole('button', { name: '대진 공개' }));
    const dialog = sheet();
    expect(within(dialog).getByRole('status')).toHaveTextContent('신청 마감 전이에요. 그래도 공개할까요?');
    const confirm = within(dialog).getByRole('button', { name: '지금 공개' });
    expect(confirm.className).toContain('tm-btn-primary');
    expect(confirm.className).not.toContain('tm-btn-danger');
  });

  it.each([
    ['마감 시각이 지남', { registrationDeadlineAt: '2020-01-01T00:00:00.000Z' }],
    ['수동 마감(status closed)', { registrationDeadlineAt: '2099-01-01T00:00:00.000Z', tournamentStatus: 'closed' as const }],
  ])('마감 뒤(%s)면 안내가 없다', (_name, props) => {
    show(props);
    fireEvent.click(screen.getByRole('button', { name: '대진 공개' }));
    expect(screen.queryByText(/신청 마감 전이에요/)).not.toBeInTheDocument();
  });

  it('지금 공개 → publish.mutate(undefined), 성공 토스트 「대진표를 공개했어요.」', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: '대진 공개' }));
    fireEvent.click(within(sheet()).getByRole('button', { name: '지금 공개' }));
    expect(hooks.publish).toHaveBeenCalledWith(undefined, expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }));
    hooks.publish.mock.calls[0][1].onSuccess({ tournamentId: 't-1', bracketPublishedAt: '2026-12-01T00:00:00.000Z', bracketPublishScheduledAt: null, alreadyPublished: false });
    expect(showToast).toHaveBeenCalledWith('대진표를 공개했어요.', 'success');
  });

  it('공개 요청이 실패하면 시트를 연 채로 이유를 알린다', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: '대진 공개' }));
    fireEvent.click(within(sheet()).getByRole('button', { name: '지금 공개' }));
    hooks.publish.mock.calls[0][1].onError(new Error('서버가 거절했어요'));
    expect(await within(sheet()).findByRole('alert')).toHaveTextContent('서버가 거절했어요');
  });

  it('시각 정해 공개: 입력 → 「예약하기」 → mutate({scheduledAt: KST 고정 ISO}); 과거 시각은 mutate 없이 오류', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: '대진 공개' }));
    const dialog = sheet();
    fireEvent.click(within(dialog).getByRole('radio', { name: /시각 정해 공개/ }));
    expect(within(dialog).queryByRole('button', { name: '지금 공개' })).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('공개 시각'), { target: { value: '2020-01-01T09:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '예약하기' }));
    expect(hooks.publish).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('공개 예약 시각은 현재 시각 이후여야 해요.');
    expect(within(dialog).getByLabelText('공개 시각')).toHaveValue('2020-01-01T09:00');
    fireEvent.change(within(dialog).getByLabelText('공개 시각'), { target: { value: '2099-08-01T18:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '예약하기' }));
    expect(hooks.publish).toHaveBeenCalledWith({ scheduledAt: new Date('2099-08-01T18:00:00+09:00').toISOString() }, expect.anything());
  });

  it('시각을 비운 채 「예약하기」를 누르면 mutate 하지 않고 시각을 입력하라고 알린다', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: '대진 공개' }));
    const dialog = sheet();
    fireEvent.click(within(dialog).getByRole('radio', { name: /시각 정해 공개/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: '예약하기' }));
    expect(hooks.publish).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('공개 시각을 정해 주세요.');
  });

  it('조가 없으면 「대진 공개」가 비활성이고 이유가 화면에 보인다', () => {
    show({ hasGroups: false });
    expect(screen.getByRole('button', { name: '대진 공개' })).toBeDisabled();
    expect(screen.getByText('조를 먼저 만들어야 공개할 수 있어요.')).toBeInTheDocument();
  });

  it('공개됨: 「공개 중」 + 「공개 설정」, 시트의 「비공개로 되돌리기」→확인 창→unpublish.mutate', async () => {
    show({ bracketPublishedAt: '2026-07-18T00:00:00.000Z' });
    expect(screen.getByText('공개 중')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '대진 공개' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '공개 설정' }));
    expect(sheet()).toHaveAccessibleName('공개 설정');
    fireEvent.click(within(sheet()).getByRole('button', { name: '비공개로 되돌리기' }));
    expect(hooks.unpublish).not.toHaveBeenCalled();
    const confirm = await screen.findByRole('dialog', { name: '대진표 공개 취소' });
    fireEvent.click(within(confirm).getByRole('button', { name: '비공개로 되돌리기' }));
    await waitFor(() => expect(hooks.unpublish).toHaveBeenCalled());
    hooks.unpublish.mock.calls[0][1].onSuccess({ tournamentId: 't-1', bracketPublishedAt: null, bracketPublishScheduledAt: null, alreadyUnpublished: false });
    expect(showToast).toHaveBeenCalledWith('대진표를 비공개로 되돌렸어요.', 'success');
  });

  it('예약 시각이 이미 지났으면 publishedAt 이 null 이어도 공개로 본다', () => {
    show({ bracketPublishScheduledAt: '2020-01-01T00:00:00.000Z' });
    expect(screen.getByText('공개 중')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '대진 공개' })).not.toBeInTheDocument();
  });

  it('예약됨: 「공개 예약됨 · <시각>」, 시트에서 「예약 취소」', async () => {
    show({ bracketPublishScheduledAt: '2099-08-01T09:00:00.000Z' });
    expect(screen.getByText(/공개 예약됨 · 2099\.8\.1 18:00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '공개 설정' }));
    fireEvent.click(within(sheet()).getByRole('button', { name: '예약 취소' }));
    const confirm = await screen.findByRole('dialog', { name: '공개 예약 취소' });
    fireEvent.click(within(confirm).getByRole('button', { name: '예약 취소' }));
    await waitFor(() => expect(hooks.unpublish).toHaveBeenCalled());
  });

  it('canWrite=false: 상태 배지만, 버튼 없음', () => {
    show({ canWrite: false, bracketPublishedAt: '2026-07-18T00:00:00.000Z' });
    expect(screen.getByText('공개 중')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    cleanup();
    show({ canWrite: false });
    expect(screen.getByText('비공개')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('layout=bar(폰): 「참가자에게 아직 대진이 안 보여요」 + 같은 버튼, 공개 뒤에는 「공개 중」 + 「공개 설정」', () => {
    const view = show({ layout: 'bar' });
    expect(screen.getByText(/참가자에게 아직 대진이 안 보여요/)).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '대진 공개' }));
    expect(sheet()).toHaveAccessibleName('대진을 공개할까요?');
    view.unmount();
    show({ layout: 'bar', bracketPublishedAt: '2026-07-18T00:00:00.000Z' });
    expect(screen.getByText('공개 중')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '공개 설정' })).toBeInTheDocument();
  });
});

describe('summarizeBracket', () => {
  it('2개 조 + 4강 + 결승, 15경기', () => {
    const groups = [
      makeGroup({ id: 'a', name: 'A조', phase: 'group' }),
      makeGroup({ id: 'b', name: 'B조', phase: 'group' }),
      makeGroup({ id: 'semi', name: '4강', phase: 'semi' }),
      makeGroup({ id: 'final', name: '결승', phase: 'final' }),
    ];
    const fixtures = Array.from({ length: 15 }, (_, index) => makeFixture({ id: `f${index}`, groupId: 'a', fixtureNumber: index + 1 }));
    expect(summarizeBracket(groups, fixtures)).toBe('조별리그 2개 조 · 4강 · 결승, 15경기');
  });
  it('결선 단계는 큰 단계부터 나온다(그룹 정렬 순서와 무관)', () => {
    const groups = [makeGroup({ id: 'f', name: '결승', phase: 'final' }), makeGroup({ id: 'q', name: '8강', phase: 'quarter' }), makeGroup({ id: 's', name: '4강', phase: 'semi' })];
    expect(summarizeBracket(groups, [makeFixture({ id: 'x', groupId: 'f', fixtureNumber: 1 })])).toBe('8강 · 4강 · 결승, 1경기');
  });
});

describe('isRegistrationClosed', () => {
  const now = Date.parse('2026-12-01T00:00:00.000Z');
  it.each([
    ['진행 중인 대회', 'in_progress', '2099-01-01T00:00:00.000Z', true],
    ['수동 마감', 'closed', '2099-01-01T00:00:00.000Z', true],
    ['접수 중 + 마감 전', 'open', '2099-01-01T00:00:00.000Z', false],
    ['접수 중 + 마감 지남', 'open', '2020-01-01T00:00:00.000Z', true],
    ['초안 + 마감 없음', 'draft', null, false],
    ['상태 모름 + 마감 전', undefined, '2099-01-01T00:00:00.000Z', false],
  ] as const)('%s', (_name, status, deadline, expected) => {
    expect(isRegistrationClosed(status, deadline, now)).toBe(expected);
  });
});
