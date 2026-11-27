import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createTournamentInfoFixture } from '@/test/msw/tournament-info-handlers';
import { renderInfoSheet, setupTournamentInfoBackend } from '@/test/tournament-info-sheet';
import type { V1Tournament } from '@/types/api';
import { InfoSummaryCard } from '../info-summary-card';
import { entrySection } from './entry-section';

const start = setupTournamentInfoBackend();

const paid = { entryFee: 50000, bankName: '국민은행', bankAccount: '123-456', bankHolder: '티밋' } satisfies Partial<V1Tournament>;
const staged = {
  format: 'league_knockouts',
  stagePlan: { version: 1, stages: [{ key: 'main', name: '본선', pools: [{ key: 'main-league', name: '본선 리그', format: 'league', capacity: 8, legs: 1, sources: [] }] }] },
} satisfies Partial<V1Tournament>;
const type = (view: ReturnType<typeof renderInfoSheet>, label: string | RegExp, value: string) =>
  fireEvent.change(view.inSheet().getByLabelText(label), { target: { value } });

describe('참가 섹션 시트', () => {
  it('참가비만 바꾸면 PATCH 키는 entryFee 와 expectedVersion 뿐이다', async () => {
    const backend = start(paid);
    const view = renderInfoSheet(entrySection, backend);

    expect(view.inSheet().getByLabelText('참가비')).toHaveValue('50,000');
    type(view, '참가비', '70,000');
    view.save();
    await view.saved();

    expect(Object.keys(backend.state.patches[0]).sort()).toEqual(['entryFee', 'expectedVersion']);
    expect(backend.state.patches[0].entryFee).toBe(70000);
    expect(view.onSaved).toHaveBeenCalledWith('참가 설정을 저장했어요.');
  });

  it.each(['1', '65', ''])('팀 수 %j 는 칸 아래에 알리고 요청하지 않는다', (value) => {
    const backend = start();
    const view = renderInfoSheet(entrySection, backend);

    type(view, '팀 수', value);
    view.save();

    expect(view.inSheet().getByLabelText('팀 수')).toHaveAccessibleDescription('팀 수는 2~64 사이로 입력해 주세요.');
    expect(backend.state.patches).toEqual([]);
  });

  it('대조군: 팀 수 64 는 저장한다', async () => {
    const backend = start();
    const view = renderInfoSheet(entrySection, backend);

    type(view, '팀 수', '64');
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['teamCount']);
    expect(backend.state.patches[0].teamCount).toBe(64);
  });

  it('여러 단계 형식이지만 단계 편성이 없는 대회는 팀 수 100 도 저장한다', async () => {
    const backend = start({ format: 'league_knockouts' });
    const view = renderInfoSheet(entrySection, backend);

    type(view, '팀 수', '100');
    view.save();
    await view.saved();

    expect(backend.state.patches[0].teamCount).toBe(100);
  });

  it('단계 편성이 있는 대회는 팀 수 칸이 꺼지고 이유가 보이며, 다른 칸 저장에 팀 수가 끼지 않는다', async () => {
    const backend = start(staged);
    const view = renderInfoSheet(entrySection, backend);
    const teamCount = view.inSheet().getByLabelText('팀 수');

    expect(teamCount).toBeDisabled();
    expect(teamCount).toHaveAccessibleDescription('단계 편성의 정원 합계라 여기서는 바꿀 수 없어요.');
    type(view, '명단 최소 인원', '5');
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['minPlayers']);
  });

  it('리그전에만 팀당 최소 경기 수 칸이 있고, 비우면 null 을 보낸다', async () => {
    const backend = start({ format: 'league', minMatchesPerTeam: 3 });
    const view = renderInfoSheet(entrySection, backend);

    expect(view.inSheet().getByLabelText('팀당 최소 경기 수')).toHaveValue('3');
    type(view, '팀당 최소 경기 수', '');
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['minMatchesPerTeam']);
    expect(backend.state.patches[0].minMatchesPerTeam).toBeNull();
  });

  it('대조군: 조별리그 → 토너먼트 대회에는 팀당 최소 경기 수 칸이 없다', () => {
    const view = renderInfoSheet(entrySection, start({ format: 'group_knockout' }));

    expect(view.inSheet().queryByLabelText('팀당 최소 경기 수')).toBeNull();
  });

  it('팀당 최소 경기 수 51 은 저장하지 않는다', () => {
    const backend = start({ format: 'league' });
    const view = renderInfoSheet(entrySection, backend);

    type(view, '팀당 최소 경기 수', '51');
    view.save();

    expect(view.inSheet().getByLabelText('팀당 최소 경기 수')).toHaveAccessibleDescription('팀당 최소 경기 수는 1~50 사이로 입력해 주세요.');
    expect(backend.state.patches).toEqual([]);
  });

  it.each([
    ['최소가 최대보다 크면', '11', '10'],
    ['최대가 50 을 넘으면', '6', '51'],
    ['최소가 0 이면', '0', '10'],
  ])('명단 인원: %s 알리고 요청하지 않는다', (_label, min, max) => {
    const backend = start();
    const view = renderInfoSheet(entrySection, backend);

    type(view, '명단 최소 인원', min);
    type(view, '명단 최대 인원', max);
    view.save();

    expect(view.inSheet().getByRole('alert')).toHaveTextContent('명단 인원은 1~50명이고, 최소가 최대보다 클 수 없어요.');
    expect(backend.state.patches).toEqual([]);
  });

  it('무료 대회는 계좌 칸이 꺼져 있고, 참가비를 넣으면 열린다', () => {
    const view = renderInfoSheet(entrySection, start());
    const bankFields = () => ['은행명', '계좌번호', '예금주'].map((label) => view.inSheet().getByLabelText(label));

    for (const field of bankFields()) expect(field).toBeDisabled();
    type(view, '참가비', '30000');
    for (const field of bankFields()) expect(field).toBeEnabled();
  });

  it('유료로 바꾸며 계좌를 적으면 참가비와 계좌를 함께 보낸다', async () => {
    const backend = start();
    const view = renderInfoSheet(entrySection, backend);

    type(view, '참가비', '30000');
    type(view, '은행명', ' 국민은행 ');
    type(view, '계좌번호', '111-222');
    type(view, '예금주', '티밋');
    view.save();
    await view.saved();

    expect(backend.state.patches[0]).toMatchObject({ entryFee: 30000, bankName: '국민은행', bankAccount: '111-222', bankHolder: '티밋' });
    expect(view.patchKeys()).toEqual(['bankAccount', 'bankHolder', 'bankName', 'entryFee']);
  });

  it('무료로 바꿔 저장하면 계좌 키를 보내지 않고, 적혀 있던 계좌는 칸에 남는다', async () => {
    const backend = start(paid);
    const view = renderInfoSheet(entrySection, backend);

    type(view, '계좌번호', '999-000');
    type(view, '참가비', '0');
    expect(view.inSheet().getByLabelText('계좌번호')).toHaveValue('999-000');
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['entryFee']);
    expect(backend.state.patches[0].entryFee).toBe(0);
  });

  it('유료 대회에서 계좌를 비우면 세 칸 모두 null 로 보낸다', async () => {
    const backend = start(paid);
    const view = renderInfoSheet(entrySection, backend);

    for (const label of ['은행명', '계좌번호', '예금주']) type(view, label, '');
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['bankAccount', 'bankHolder', 'bankName']);
    expect(backend.state.patches[0]).toMatchObject({ bankName: null, bankAccount: null, bankHolder: null });
  });

  it('서버가 유료인데 계좌가 없다고 거절하면 그 메시지를 시트에 보여 주고 입력을 지킨다', async () => {
    const backend = start();
    const view = renderInfoSheet(entrySection, backend);
    backend.state.failNext('tournament', 400, { code: 'TOURNAMENT_BANK_ACCOUNT_REQUIRED', message: '참가비가 있는 대회는 정산 계좌가 필요해요.' });

    type(view, '참가비', '30000');
    view.save();

    expect(await view.inSheet().findByRole('alert')).toHaveTextContent('참가비가 있는 대회는 정산 계좌가 필요해요.');
    expect(view.inSheet().getByLabelText('참가비')).toHaveValue('30,000');
    expect(view.onClose).not.toHaveBeenCalled();
  });

  it('혼성이 아닌 대회에는 혼성 쿼터가 없다', () => {
    const view = renderInfoSheet(entrySection, start({ genderCategory: 'male' }));

    expect(view.inSheet().queryByRole('switch', { name: '혼성 쿼터' })).toBeNull();
    expect(view.inSheet().queryByLabelText('남성 최소')).toBeNull();
  });

  it('혼성 대회는 스위치를 켜야 네 칸이 보이고, 적은 칸만 보낸다', async () => {
    const backend = start({ genderCategory: 'mixed' });
    const view = renderInfoSheet(entrySection, backend);
    const toggle = view.inSheet().getByRole('switch', { name: '혼성 쿼터' });

    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(view.inSheet().queryByLabelText('남성 최소')).toBeNull();
    fireEvent.click(toggle);
    type(view, '남성 최소', '2');
    type(view, '여성 최소', '2');
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['genderMinFemale', 'genderMinMale']);
    expect(backend.state.patches[0]).toMatchObject({ genderMinMale: 2, genderMinFemale: 2 });
  });

  it('켜져 있던 혼성 쿼터를 끄면 정해 둔 칸을 null 로 보낸다', async () => {
    const backend = start({ genderCategory: 'mixed', genderMinMale: 2, genderMaxMale: 6, genderMinFemale: 2, genderMaxFemale: 6 });
    const view = renderInfoSheet(entrySection, backend);
    const toggle = view.inSheet().getByRole('switch', { name: '혼성 쿼터' });

    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(view.inSheet().getByLabelText('남성 최대')).toHaveValue('6');
    fireEvent.click(toggle);
    view.save();
    await view.saved();

    expect(backend.state.patches[0]).toMatchObject({ genderMinMale: null, genderMaxMale: null, genderMinFemale: null, genderMaxFemale: null });
    expect(view.patchKeys()).toEqual(['genderMaxFemale', 'genderMaxMale', 'genderMinFemale', 'genderMinMale']);
  });

  it.each([
    ['최소 합이 명단 최대 인원을 넘으면', { '남성 최소': '6', '여성 최소': '5' }],
    ['최소가 최대보다 크면', { '남성 최소': '4', '남성 최대': '3' }],
    ['한쪽 최대가 명단 최대 인원을 넘으면', { '여성 최대': '11' }],
  ])('혼성 쿼터: %s 알리고 요청하지 않는다', (_label, values) => {
    const backend = start({ genderCategory: 'mixed' });
    const view = renderInfoSheet(entrySection, backend);

    fireEvent.click(view.inSheet().getByRole('switch', { name: '혼성 쿼터' }));
    for (const [label, value] of Object.entries(values)) type(view, label, value);
    view.save();

    expect(view.inSheet().getByRole('alert')).toHaveTextContent('혼성 명단의 최소·최대 인원 조건을 다시 확인해 주세요.');
    expect(backend.state.patches).toEqual([]);
  });

  it('딥링크가 가리킨 정산 계좌 칸에 초점을 둔 채 열린다', () => {
    const view = renderInfoSheet(entrySection, start({ entryFee: 30000 }), { focusField: 'bankAccount' });

    expect(view.inSheet().getByLabelText('계좌번호')).toHaveFocus();
  });
});

describe('참가 섹션 요약 카드', () => {
  const rows = (overrides: Partial<V1Tournament> = {}) => {
    render(<InfoSummaryCard definition={entrySection} context={{ tournament: createTournamentInfoFixture(overrides) }} canWrite onEdit={vi.fn()} />);
    return within(screen.getByRole('region', { name: '참가' }));
  };
  const rowOf = (card: ReturnType<typeof rows>, label: string) => within(card.getByText(label).nextElementSibling as HTMLElement);

  it('무료 대회: 참가비는 「무료」, 정산 계좌는 필요 없다고 말한다', () => {
    const card = rows();

    expect(rowOf(card, '팀 수').getByText('8팀')).toBeInTheDocument();
    expect(rowOf(card, '팀 수').getByText('지금 신청 5팀')).toBeInTheDocument();
    expect(rowOf(card, '명단 인원').getByText('최소 6명 · 최대 10명')).toBeInTheDocument();
    expect(rowOf(card, '참가비').getByText('무료')).toBeInTheDocument();
    expect(rowOf(card, '정산 계좌').getByText('무료 대회라 필요 없어요')).toBeInTheDocument();
    expect(card.queryByText('채워야 해요')).toBeNull();
  });

  it('유료 대회 + 계좌: 금액과 계좌를 보여 준다', () => {
    const card = rows(paid);

    expect(rowOf(card, '참가비').getByText('50,000원')).toBeInTheDocument();
    expect(rowOf(card, '정산 계좌').getByText('국민은행 123-456 (티밋)')).toBeInTheDocument();
    expect(card.queryByText('채워야 해요')).toBeNull();
  });

  it('유료 대회 + 계좌 없음: 「채워야 해요」 가 붙는다', () => {
    const card = rows({ entryFee: 50000 });

    expect(rowOf(card, '정산 계좌').getByText('없음')).toBeInTheDocument();
    expect(rowOf(card, '정산 계좌').getByText('채워야 해요')).toBeInTheDocument();
  });

  it('팀당 최소 경기 수 줄은 리그전에만, 혼성 쿼터 줄은 혼성 대회에만 있다', () => {
    const plain = rows();
    expect(plain.queryByText('팀당 최소 경기 수')).toBeNull();
    expect(plain.queryByText('혼성 쿼터')).toBeNull();
  });

  it('리그전 혼성 대회: 두 줄이 모두 나온다', () => {
    const card = rows({ format: 'league', minMatchesPerTeam: 3, genderCategory: 'mixed', genderMinMale: 2, genderMaxMale: 4, genderMinFemale: 2 });

    expect(rowOf(card, '팀당 최소 경기 수').getByText('3경기')).toBeInTheDocument();
    expect(rowOf(card, '혼성 쿼터').getByText('남성 2~4명 · 여성 2명 이상')).toBeInTheDocument();
  });

  it('혼성 쿼터를 정하지 않은 혼성 대회는 「제한 없음」 + 「기본값」 이다', () => {
    const card = rows({ genderCategory: 'mixed' });

    expect(rowOf(card, '혼성 쿼터').getByText('제한 없음')).toBeInTheDocument();
    expect(rowOf(card, '혼성 쿼터').getByText('기본값')).toBeInTheDocument();
  });
});
