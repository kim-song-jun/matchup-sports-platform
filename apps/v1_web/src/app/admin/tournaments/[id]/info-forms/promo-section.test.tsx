import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTournamentInfoFixture } from '@/test/msw/tournament-info-handlers';
import { renderInfoSheet, setupTournamentInfoBackend } from '@/test/tournament-info-sheet';
import type { V1Tournament } from '@/types/api';
import { InfoSummaryCard } from '../info-summary-card';
import { promoSection } from './promo-section';

const upload = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  useV1UploadImages: () => ({ mutateAsync: upload.mutateAsync, isPending: false }),
}));

const start = setupTournamentInfoBackend();
beforeEach(() => {
  upload.mutateAsync.mockReset();
});

const homeOn = { promoHomeEnabled: true, promoHomeTitle: '겨울 풋살컵 모집', promoHomeBadgeText: '추천 대회', promoHomePriority: 3 } satisfies Partial<V1Tournament>;
type View = ReturnType<typeof renderInfoSheet>;
const card = (view: View, title: '홈 오늘의 추천' | '대회 목록 상단') =>
  within(view.inSheet().getByRole('heading', { name: title }).closest('section') as HTMLElement);
const fileInput = (view: View, title: '홈 오늘의 추천' | '대회 목록 상단') =>
  (view.inSheet().getByRole('heading', { name: title }).closest('section') as HTMLElement).querySelector('input[type="file"]') as HTMLInputElement;

describe('홍보 섹션 시트', () => {
  it('홈 카드를 켜기만 하면 PATCH 키는 promoHomeEnabled 와 expectedVersion 뿐이다', async () => {
    const backend = start();
    const view = renderInfoSheet(promoSection, backend);

    fireEvent.click(view.inSheet().getByRole('switch', { name: '홈 오늘의 추천 노출' }));
    view.save();
    await view.saved();

    expect(Object.keys(backend.state.patches[0]).sort()).toEqual(['expectedVersion', 'promoHomeEnabled']);
    expect(backend.state.patches[0].promoHomeEnabled).toBe(true);
    expect(view.onSaved).toHaveBeenCalledWith('홍보 설정을 저장했어요.');
  });

  it('켜기만 해서는 날짜·장소·상금 문구를 채우지 않고, 시트가 그렇게 말한다', () => {
    const view = renderInfoSheet(promoSection, start({ venue: '성수 풋살장', prizeSummary: '우승 상금 100만원' }));

    fireEvent.click(view.inSheet().getByRole('switch', { name: '홈 오늘의 추천 노출' }));

    const home = card(view, '홈 오늘의 추천');
    expect(home.getByLabelText('날짜 문구')).toHaveValue('');
    expect(home.getByLabelText('장소 문구')).toHaveValue('');
    expect(home.getByLabelText('상금 문구')).toHaveValue('');
    expect(view.inSheet().getByText('켜면 홈과 대회 목록 위쪽에 이 대회가 카드로 보여요.')).toBeInTheDocument();
    expect(view.inSheet().getByText('비운 제목은 대회명이 대신 나와요. 날짜·장소·상금은 「다시 채우기」 로 넣어요.')).toBeInTheDocument();
    expect(view.sheet().textContent).not.toContain('켜면 대회 정보로 카드 문구를 채워요');
  });

  it('대회 목록 상단 카드를 켜면 그 카드의 키만 보낸다', async () => {
    const backend = start(homeOn);
    const view = renderInfoSheet(promoSection, backend);

    fireEvent.click(view.inSheet().getByRole('switch', { name: '대회 목록 상단 노출' }));
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['promoListEnabled']);
  });

  it('제목을 바꾸면 그 키만, 앞뒤 공백을 뗀 값으로 보낸다', async () => {
    const backend = start(homeOn);
    const view = renderInfoSheet(promoSection, backend);

    expect(card(view, '홈 오늘의 추천').getByLabelText('카드 제목')).toHaveValue('겨울 풋살컵 모집');
    fireEvent.change(card(view, '홈 오늘의 추천').getByLabelText('카드 제목'), { target: { value: ' 마감 임박 ' } });
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['promoHomeTitle']);
    expect(backend.state.patches[0].promoHomeTitle).toBe('마감 임박');
  });

  it('글을 비우면 빈 문자열로 보낸다', async () => {
    const backend = start(homeOn);
    const view = renderInfoSheet(promoSection, backend);

    fireEvent.change(card(view, '홈 오늘의 추천').getByLabelText('배지'), { target: { value: '' } });
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['promoHomeBadgeText']);
    expect(backend.state.patches[0].promoHomeBadgeText).toBe('');
  });

  it('바꾼 게 없으면 요청하지 않는다', () => {
    const backend = start(homeOn);
    const view = renderInfoSheet(promoSection, backend);

    view.save();

    expect(view.onSaved).toHaveBeenCalledWith('변경된 내용이 없어요.');
    expect(backend.state.patches).toEqual([]);
  });

  it('우선순위를 바꾸면 숫자로 보내고, 숫자가 아니면 칸 아래에 알리고 요청하지 않는다', async () => {
    const backend = start(homeOn);
    const view = renderInfoSheet(promoSection, backend);
    const priority = () => card(view, '홈 오늘의 추천').getByLabelText('노출 우선순위');

    expect(priority()).toHaveValue(3);
    fireEvent.change(priority(), { target: { value: '' } });
    view.save();
    expect(card(view, '홈 오늘의 추천').getByText('우선순위는 숫자로 입력해 주세요.')).toBeInTheDocument();
    expect(backend.state.patches).toEqual([]);

    fireEvent.change(priority(), { target: { value: '7' } });
    view.save();
    await view.saved();
    expect(view.patchKeys()).toEqual(['promoHomePriority']);
    expect(backend.state.patches[0].promoHomePriority).toBe(7);
  });

  it.each([
    ['6MB 이미지', new File([new Uint8Array(6 * 1024 * 1024)], 'big.png', { type: 'image/png' }), '이미지는 5MB 이하로 첨부해 주세요.'],
    ['이미지가 아닌 파일', new File(['x'], 'memo.pdf', { type: 'application/pdf' }), '이미지 파일만 첨부할 수 있어요.'],
  ])('%s 은 메시지만 보여 주고 올리지 않는다', async (_label, file, message) => {
    const view = renderInfoSheet(promoSection, start(homeOn));

    fireEvent.change(fileInput(view, '홈 오늘의 추천'), { target: { files: [file] } });

    expect(await view.inSheet().findByRole('alert')).toHaveTextContent(message);
    expect(upload.mutateAsync).not.toHaveBeenCalled();
  });

  it('이미지는 고를 때 올리고, 저장을 눌러야 대회에 반영한다', async () => {
    const backend = start(homeOn);
    upload.mutateAsync.mockResolvedValue({ urls: ['/uploads/promo-home.webp'] });
    const view = renderInfoSheet(promoSection, backend);

    fireEvent.change(fileInput(view, '홈 오늘의 추천'), { target: { files: [new File(['x'], 'promo.png', { type: 'image/png' })] } });
    expect(await card(view, '홈 오늘의 추천').findByDisplayValue('/uploads/promo-home.webp')).toBeInTheDocument();
    expect(backend.state.patches).toEqual([]);
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['promoHomeImageUrl']);
    expect(backend.state.patches[0].promoHomeImageUrl).toBe('/uploads/promo-home.webp');
  });

  it.each([
    ['주소 없이 끝나면', () => upload.mutateAsync.mockResolvedValue({ urls: [] }), '업로드된 이미지 URL을 받지 못했어요.'],
    ['실패하면', () => upload.mutateAsync.mockRejectedValue(new Error('서버가 바빠요.')), '서버가 바빠요.'],
  ])('올리기가 %s 그 이유를 시트 안에 보여 준다', async (_label, arrange, message) => {
    arrange();
    const view = renderInfoSheet(promoSection, start(homeOn));

    fireEvent.change(fileInput(view, '홈 오늘의 추천'), { target: { files: [new File(['x'], 'promo.png', { type: 'image/png' })] } });

    expect(await view.inSheet().findByRole('alert')).toHaveTextContent(message);
  });

  it('「다시 채우기」 는 날짜·장소·상금 문구를 대회 정보로 채우고, 그 세 칸만 보낸다', async () => {
    const backend = start({ ...homeOn, venue: '성수 풋살장', prizeSummary: '우승 상금 100만원' });
    const view = renderInfoSheet(promoSection, backend);
    const home = card(view, '홈 오늘의 추천');

    fireEvent.click(home.getByRole('button', { name: '날짜·장소·상금 문구를 대회 정보로 다시 채우기' }));
    expect(home.getByLabelText('날짜 문구')).toHaveValue('12월 20일 (일)');
    expect(home.getByLabelText('장소 문구')).toHaveValue('성수 풋살장');
    expect(home.getByLabelText('상금 문구')).toHaveValue('우승 상금 100만원');
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['promoHomeDateText', 'promoHomeLocationText', 'promoHomePrizeText']);
  });

  it('문구가 이미 대회 정보와 같으면 「다시 채우기」 가 꺼져 있다', () => {
    const view = renderInfoSheet(promoSection, start({ ...homeOn, venue: '성수 풋살장', promoHomeDateText: '12월 20일 (일)', promoHomeLocationText: '성수 풋살장' }));

    expect(card(view, '홈 오늘의 추천').getByRole('button', { name: '날짜·장소·상금 문구를 대회 정보로 다시 채우기' })).toBeDisabled();
  });
});

describe('홍보 섹션 요약 카드', () => {
  const rows = (overrides: Partial<V1Tournament> = {}) => {
    render(<InfoSummaryCard definition={promoSection} context={{ tournament: createTournamentInfoFixture(overrides) }} canWrite onEdit={vi.fn()} />);
    return within(screen.getByRole('region', { name: '홍보' }));
  };
  const rowOf = (view: ReturnType<typeof rows>, label: string) => within(view.getByText(label).nextElementSibling as HTMLElement);

  it('꺼진 카드는 「꺼짐」 으로 보여 준다', () => {
    const view = rows();

    expect(rowOf(view, '홈 오늘의 추천').getByText('꺼짐')).toBeInTheDocument();
    expect(rowOf(view, '대회 목록 상단').getByText('꺼짐')).toBeInTheDocument();
  });

  it('켜진 카드는 제목을, 제목이 없으면 대회명을 쓴다고 보여 준다', () => {
    const view = rows({ ...homeOn, promoListEnabled: true });

    expect(rowOf(view, '홈 오늘의 추천').getByText('켜짐 · 겨울 풋살컵 모집')).toBeInTheDocument();
    expect(rowOf(view, '대회 목록 상단').getByText('켜짐 · 대회명 사용')).toBeInTheDocument();
    expect(view.queryByText('꺼짐')).toBeNull();
  });
});
