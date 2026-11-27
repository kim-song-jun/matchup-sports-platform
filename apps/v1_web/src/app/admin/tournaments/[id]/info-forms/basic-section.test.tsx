import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SIDE_SHEET_DISCARD_CONFIRM } from '@/components/v1-ui/side-sheet';
import { createTournamentInfoFixture } from '@/test/msw/tournament-info-handlers';
import { renderInfoSheet, setupTournamentInfoBackend } from '@/test/tournament-info-sheet';
import { InfoSummaryCard } from '../info-summary-card';
import { basicSection } from './basic-section';

const start = setupTournamentInfoBackend();

// API 가 대진·조가 있을 때 돌려주는 사유와, 화면이 그 자리에 보이는 안내.
const SERVER_BRACKET_LOCK = '조나 대진이 만들어져 있어 대회 형식을 변경할 수 없어요. 대진표에서 경기와 조를 모두 삭제한 뒤 변경해 주세요.';
const BRACKET_LOCK_NOTE = '대진이 있어서 진행 방식을 바꿀 수 없어요. 바꾸려면 「대진」에서 경기와 조를 모두 지워 주세요.';

describe('기본 섹션 시트', () => {
  it('채워진 채로 열린다', async () => {
    const backend = start({ genderCategory: 'female' });
    const view = renderInfoSheet(basicSection, backend);

    expect(view.inSheet().getByLabelText(/^대회명/)).toHaveValue('Teameet Futsal Cup');
    expect(view.inSheet().getByLabelText('진행 방식')).toHaveValue('group_knockout');
    expect(view.inSheet().getByRole('radio', { name: '여성부' })).toBeChecked();
    await waitFor(() => expect(view.inSheet().getByLabelText('종목')).toHaveValue('sport-futsal'));
    expect(view.inSheet().getByText('대회를 알아보는 정보예요.')).toBeInTheDocument();
  });

  it('대회명만 바꾸면 PATCH 본문 키는 title 과 expectedVersion 뿐이다', async () => {
    const backend = start();
    const view = renderInfoSheet(basicSection, backend);

    fireEvent.change(view.inSheet().getByLabelText(/^대회명/), { target: { value: '  겨울 풋살컵  ' } });
    view.save();
    await view.saved();

    expect(Object.keys(backend.state.patches[0]).sort()).toEqual(['expectedVersion', 'title']);
    expect(backend.state.patches[0]).toMatchObject({ title: '겨울 풋살컵', expectedVersion: '2026-11-01T00:00:00.000Z' });
    expect(view.onSaved).toHaveBeenCalledWith('기본 설정을 저장했어요.');
  });

  it('종목만 바꾸면 sportId 만 보낸다', async () => {
    const backend = start();
    const view = renderInfoSheet(basicSection, backend);
    await waitFor(() => expect(view.inSheet().getByLabelText('종목')).toHaveValue('sport-futsal'));

    fireEvent.change(view.inSheet().getByLabelText('종목'), { target: { value: 'sport-football' } });
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['sportId']);
    expect(backend.state.patches[0]).toMatchObject({ sportId: 'sport-football' });
  });

  it.each([
    ['남성부 → 혼성', 'male' as const, '혼성', 'mixed'],
    ['남성부 → 구분 없음', 'male' as const, '구분 없음', null],
    ['구분 없음 → 여성부', null, '여성부', 'female'],
  ])('성별 %s 은 genderCategory 만 보낸다', async (_label, saved, pick, sent) => {
    const backend = start({ genderCategory: saved });
    const view = renderInfoSheet(basicSection, backend);

    fireEvent.click(view.inSheet().getByRole('radio', { name: pick }));
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['genderCategory']);
    expect(backend.state.patches[0].genderCategory).toBe(sent);
  });

  it('바꾼 게 없으면 요청 없이 닫고 「변경된 내용이 없어요.」', () => {
    const backend = start();
    const view = renderInfoSheet(basicSection, backend);

    view.save();

    expect(view.onClose).toHaveBeenCalledTimes(1);
    expect(view.onSaved).toHaveBeenCalledWith('변경된 내용이 없어요.');
    expect(backend.state.patches).toEqual([]);
  });

  it('대회명을 비우면 칸 아래에 이유가 나오고, 요청 없이 초점이 그 칸으로 간다', () => {
    const backend = start();
    const view = renderInfoSheet(basicSection, backend);
    const title = view.inSheet().getByLabelText(/^대회명/);

    fireEvent.change(title, { target: { value: '   ' } });
    view.save();

    expect(title).toHaveAccessibleDescription('대회명을 입력해 주세요.');
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveFocus();
    expect(view.inSheet().getByRole('alert')).toHaveTextContent('대회명을 입력해 주세요.');
    expect(backend.state.patches).toEqual([]);
    expect(view.onClose).not.toHaveBeenCalled();
  });

  it('대진이 있어 잠긴 진행 방식은 꺼지고 「진행 방식」·「대진」 말로 쓴 사유가 보이며, 다른 칸 저장은 막지 않는다', async () => {
    const backend = start({ formatChangeBlockedReason: SERVER_BRACKET_LOCK });
    const view = renderInfoSheet(basicSection, backend);

    expect(view.inSheet().getByLabelText('진행 방식')).toBeDisabled();
    expect(view.inSheet().getByLabelText('진행 방식')).toHaveAccessibleDescription(BRACKET_LOCK_NOTE);
    expect(view.inSheet().queryByText(SERVER_BRACKET_LOCK)).not.toBeInTheDocument();
    fireEvent.change(view.inSheet().getByLabelText(/^대회명/), { target: { value: '바꾼 이름' } });
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['title']);
  });

  it.each(['in_progress', 'completed'] as const)('%s 대회는 진행 방식을 잠근다', (status) => {
    const view = renderInfoSheet(basicSection, start({ status }));

    expect(view.inSheet().getByLabelText('진행 방식')).toBeDisabled();
    expect(view.inSheet().getByLabelText('진행 방식')).toHaveAccessibleDescription('대회가 시작된 뒤에는 진행 방식을 바꿀 수 없어요.');
  });

  it('시작된 대회는 서버가 사유를 함께 보내도 「진행 방식」 말로 쓴 안내를 보인다', () => {
    const view = renderInfoSheet(basicSection, start({ status: 'in_progress', formatChangeBlockedReason: '대회가 시작된 뒤에는 대회 형식을 변경할 수 없어요.' }));

    expect(view.inSheet().getByLabelText('진행 방식')).toHaveAccessibleDescription('대회가 시작된 뒤에는 진행 방식을 바꿀 수 없어요.');
  });

  it('여러 단계 대회는 진행 방식을 잠근다', () => {
    const view = renderInfoSheet(basicSection, start({
      format: 'league_knockouts',
      stagePlan: { version: 1, stages: [{ key: 'main', name: '본선', pools: [{ key: 'main-league', name: '본선 리그', format: 'league', capacity: 8, legs: 1, sources: [] }] }] },
    }));

    expect(view.inSheet().getByLabelText('진행 방식')).toBeDisabled();
    expect(view.inSheet().getByLabelText('진행 방식')).toHaveAccessibleDescription('여러 단계 대회는 진행 방식을 바꿀 수 없어요.');
  });

  it('여러 단계는 새 대회를 만들 때만 고를 수 있어서 선택지에 없고 한 줄로 알린다', () => {
    const view = renderInfoSheet(basicSection, start());
    const select = view.inSheet().getByLabelText('진행 방식');

    expect(within(select).queryByRole('option', { name: /여러 단계/ })).toBeNull();
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
      '조별리그 → 토너먼트',
      '토너먼트만',
      '리그전',
    ]);
    expect(select).toHaveAccessibleDescription('조나 대진을 만들기 전까지 바꿀 수 있어요. 여러 단계는 새 대회를 만들 때 고를 수 있어요.');
  });

  it('이미 「여러 단계」인 대회(단계 편성이 없는 옛 대회)는 그 선택지를 그대로 보이고 안내 줄은 없다', () => {
    const view = renderInfoSheet(basicSection, start({ format: 'league_knockouts' }));
    const select = view.inSheet().getByLabelText('진행 방식');

    expect(select).toHaveValue('league_knockouts');
    expect(within(select).getByRole('option', { name: '여러 단계(예선 → 결선 여러 개)' })).toBeInTheDocument();
    expect(select).toHaveAccessibleDescription('조나 대진을 만들기 전까지 바꿀 수 있어요.');
  });

  it('대회명 칸은 서버와 같은 120자까지 받는다', () => {
    const view = renderInfoSheet(basicSection, start());

    expect(view.inSheet().getByLabelText(/^대회명/)).toHaveAttribute('maxlength', '120');
  });

  it('잠기지 않은 진행 방식을 바꾸면 format 만 보낸다', async () => {
    const backend = start();
    const view = renderInfoSheet(basicSection, backend);

    expect(view.inSheet().getByLabelText('진행 방식')).toHaveAccessibleDescription(/^조나 대진을 만들기 전까지 바꿀 수 있어요\./);
    fireEvent.change(view.inSheet().getByLabelText('진행 방식'), { target: { value: 'knockout' } });
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['format']);
    expect(backend.state.patches[0]).toMatchObject({ format: 'knockout' });
  });

  it('다른 곳에서 먼저 저장(409)되면 시트 안에 알리고 입력을 지키며, 다시 저장하면 성공한다', async () => {
    const backend = start();
    const view = renderInfoSheet(basicSection, backend);
    backend.state.failNext('tournament', 409, { code: 'TOURNAMENT_VERSION_CONFLICT' });

    fireEvent.change(view.inSheet().getByLabelText(/^대회명/), { target: { value: '지켜야 할 이름' } });
    view.save();

    expect(await view.inSheet().findByRole('alert')).toHaveTextContent(
      '다른 곳에서 먼저 저장돼서 이번 저장은 반영되지 않았어요. 입력한 내용은 그대로 두었어요. 다시 저장해 주세요.',
    );
    expect(view.inSheet().getByLabelText(/^대회명/)).toHaveValue('지켜야 할 이름');
    expect(view.onClose).not.toHaveBeenCalled();

    view.save();
    await view.saved();
    expect(backend.state.patches).toHaveLength(2);
    expect(backend.state.tournament.title).toBe('지켜야 할 이름');
  });

  it('서버가 거절하면 그 메시지를 시트 안에 보여 주고 닫지 않는다', async () => {
    const backend = start();
    const view = renderInfoSheet(basicSection, backend);
    backend.state.failNext('tournament', 400, { message: '대회명이 너무 길어요.' });

    fireEvent.change(view.inSheet().getByLabelText(/^대회명/), { target: { value: '새 이름' } });
    view.save();

    expect(await view.inSheet().findByRole('alert')).toHaveTextContent('대회명이 너무 길어요.');
    expect(view.onClose).not.toHaveBeenCalled();
    expect(view.onSaved).not.toHaveBeenCalled();
  });

  it('값을 바꾼 뒤 닫으려 하면 버릴지 묻고, 계속 고치면 닫히지 않는다', async () => {
    const view = renderInfoSheet(basicSection, start());
    fireEvent.change(view.inSheet().getByLabelText(/^대회명/), { target: { value: '바꾸는 중' } });

    for (const closeButton of ['닫기', '취소']) {
      fireEvent.click(view.inSheet().getByRole('button', { name: closeButton }));
      const confirm = await screen.findByRole('dialog', { name: SIDE_SHEET_DISCARD_CONFIRM.title });
      fireEvent.click(within(confirm).getByRole('button', { name: SIDE_SHEET_DISCARD_CONFIRM.cancelLabel }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: SIDE_SHEET_DISCARD_CONFIRM.title })).toBeNull());
      expect(view.onClose).not.toHaveBeenCalled();
    }

    fireEvent.click(view.inSheet().getByRole('button', { name: '취소' }));
    const confirm = await screen.findByRole('dialog', { name: SIDE_SHEET_DISCARD_CONFIRM.title });
    fireEvent.click(within(confirm).getByRole('button', { name: SIDE_SHEET_DISCARD_CONFIRM.confirmLabel }));
    await waitFor(() => expect(view.onClose).toHaveBeenCalledTimes(1));
  });

  it.each(['닫기', '취소'])('안 바꾼 채 %s 를 누르면 묻지 않고 닫는다', async (closeButton) => {
    const view = renderInfoSheet(basicSection, start());

    fireEvent.click(view.inSheet().getByRole('button', { name: closeButton }));

    await waitFor(() => expect(view.onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog', { name: SIDE_SHEET_DISCARD_CONFIRM.title })).toBeNull();
  });
});

describe('기본 섹션 요약 카드', () => {
  const context = (overrides = {}) => ({ tournament: createTournamentInfoFixture(overrides), sportName: '풋살' });

  it('종목·대회명·진행 방식·성별을 읽기 전용으로 보여 준다', () => {
    render(<InfoSummaryCard definition={basicSection} context={context({ genderCategory: null })} canWrite onEdit={vi.fn()} />);
    const card = within(screen.getByRole('region', { name: '기본' }));

    expect(card.getByText('풋살')).toBeInTheDocument();
    expect(card.getByText('Teameet Futsal Cup')).toBeInTheDocument();
    expect(card.getByText('조별리그 → 토너먼트')).toBeInTheDocument();
    expect(card.getByText('구분 없음')).toBeInTheDocument();
    expect(card.queryByRole('textbox')).toBeNull();
  });

  it('잠긴 진행 방식은 요약 줄에도 사유가 붙는다', () => {
    render(<InfoSummaryCard definition={basicSection} context={context({ formatChangeBlockedReason: SERVER_BRACKET_LOCK })} canWrite onEdit={vi.fn()} />);

    expect(screen.getByText(BRACKET_LOCK_NOTE)).toBeInTheDocument();
    expect(screen.queryByText(SERVER_BRACKET_LOCK)).not.toBeInTheDocument();
  });

  it('수정 버튼은 쓸 수 있는 역할에게만 있고, 누르면 그 섹션 키를 알린다', () => {
    const onEdit = vi.fn();
    const { rerender } = render(<InfoSummaryCard definition={basicSection} context={context()} canWrite onEdit={onEdit} />);

    fireEvent.click(screen.getByRole('button', { name: '기본 수정' }));
    expect(onEdit).toHaveBeenCalledWith('basic');

    rerender(<InfoSummaryCard definition={basicSection} context={context()} canWrite={false} onEdit={onEdit} />);
    expect(screen.queryByRole('button', { name: '기본 수정' })).toBeNull();
  });

  it('배지는 색이 아니라 글자로 뜻을 전한다', () => {
    const definition = { ...basicSection, rows: () => [{ key: 'venue', label: '장소', value: '없음', badge: { tone: 'needed' as const, text: '채워야 해요' } }] };
    render(<InfoSummaryCard definition={definition} context={context()} canWrite onEdit={vi.fn()} />);

    expect(screen.getByText('채워야 해요')).toBeInTheDocument();
  });
});
