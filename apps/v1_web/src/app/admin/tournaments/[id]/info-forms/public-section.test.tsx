import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTournamentInfoFixture } from '@/test/msw/tournament-info-handlers';
import { renderInfoSheet, setupTournamentInfoBackend } from '@/test/tournament-info-sheet';
import type { V1Tournament } from '@/types/api';
import { InfoSummaryCard } from '../info-summary-card';
import { publicSection } from './public-section';

const upload = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  useV1UploadImages: () => ({ mutateAsync: upload.mutateAsync, isPending: false }),
}));

const start = setupTournamentInfoBackend();
// 블록 본문으로 둔다 — mock 을 그대로 돌려주면 vitest 가 그것을 정리 함수로 불러 버린다.
beforeEach(() => {
  upload.mutateAsync.mockReset();
});

const withImages = { listImageUrl: '/uploads/list.webp', coverImageUrl: '/uploads/detail.webp', showDetailImage: true } satisfies Partial<V1Tournament>;
const withPrize = { prizePool: 1000000, prizeSummary: '우승 트로피 + 상금', prizeBreakdown: '우승 600,000원' } satisfies Partial<V1Tournament>;
const png = () => new File(['x'], 'cover.png', { type: 'image/png' });

describe('공개 화면 섹션 시트 — 이미지', () => {
  it('상세 이미지 표시만 끄면 PATCH 키는 showDetailImage 뿐이고 사진을 지우지 않는다', async () => {
    const backend = start(withImages);
    const view = renderInfoSheet(publicSection, backend);

    fireEvent.click(view.inSheet().getByRole('switch', { name: '상세 이미지 표시' }));
    expect(backend.state.patches).toEqual([]);
    view.save();
    await view.saved();

    expect(Object.keys(backend.state.patches[0]).sort()).toEqual(['expectedVersion', 'showDetailImage']);
    expect(backend.state.patches[0].showDetailImage).toBe(false);
    expect(view.onSaved).toHaveBeenCalledWith('공개 화면 설정을 저장했어요.');
  });

  it('목록 이미지를 지우면 listImageUrl 을 null 로 보낸다', async () => {
    const backend = start(withImages);
    const view = renderInfoSheet(publicSection, backend);

    fireEvent.click(view.inSheet().getByRole('button', { name: '목록 이미지 제거' }));
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['listImageUrl']);
    expect(backend.state.patches[0].listImageUrl).toBeNull();
  });

  it('사진은 고를 때 올리고, 저장을 눌러야 대회에 반영한다', async () => {
    const backend = start();
    upload.mutateAsync.mockResolvedValue({ urls: ['/uploads/new-cover.webp'] });
    const view = renderInfoSheet(publicSection, backend);

    fireEvent.change(view.inSheet().getByLabelText('상세 이미지'), { target: { files: [png()] } });
    await view.inSheet().findByRole('button', { name: '상세 이미지 제거' });
    expect(backend.state.patches).toEqual([]);
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['coverImageUrl']);
    expect(backend.state.patches[0].coverImageUrl).toBe('/uploads/new-cover.webp');
  });

  it('올리는 동안에는 저장이 꺼져 있다', async () => {
    let finish: (value: { urls: string[] }) => void = () => {};
    upload.mutateAsync.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const view = renderInfoSheet(publicSection, start());

    fireEvent.change(view.inSheet().getByLabelText('목록 이미지'), { target: { files: [png()] } });
    await waitFor(() => expect(view.inSheet().getByRole('button', { name: '저장' })).toBeDisabled());

    await act(async () => finish({ urls: ['/uploads/list.webp'] }));
    await waitFor(() => expect(view.inSheet().getByRole('button', { name: '저장' })).toBeEnabled());
  });

  it('올리기에 실패하면 그 메시지를 시트 안에 보여 주고, 저장할 것은 생기지 않는다', async () => {
    const backend = start();
    upload.mutateAsync.mockRejectedValue(new Error('파일이 너무 커요.'));
    const view = renderInfoSheet(publicSection, backend);

    fireEvent.change(view.inSheet().getByLabelText('목록 이미지'), { target: { files: [png()] } });

    expect(await view.inSheet().findByRole('alert')).toHaveTextContent('파일이 너무 커요.');
    view.save();
    expect(view.onSaved).toHaveBeenCalledWith('변경된 내용이 없어요.');
    expect(backend.state.patches).toEqual([]);
  });
});

describe('공개 화면 섹션 시트 — 상금과 시상', () => {
  it('저장된 값으로 채워져 열린다', () => {
    const view = renderInfoSheet(publicSection, start(withPrize));

    expect(view.inSheet().getByLabelText('총상금')).toHaveValue('1,000,000');
    expect(view.inSheet().getByLabelText('상금과 시상 요약')).toHaveValue('우승 트로피 + 상금');
    expect(view.inSheet().getByDisplayValue('우승')).toBeInTheDocument();
    expect(view.inSheet().getByDisplayValue('600,000원')).toBeInTheDocument();
  });

  it('상금 한 칸만 바꿔도 세 칸을 함께, 정리된 꼴로 보낸다', async () => {
    const backend = start({ ...withPrize, prizeBreakdown: '우승 600,000원 / 상품 우승 트로피' });
    const view = renderInfoSheet(publicSection, backend);

    fireEvent.change(view.inSheet().getByRole('combobox', { name: '상금 항목 1 이름' }), { target: { value: '1위' } });
    fireEvent.change(view.inSheet().getByRole('textbox', { name: '상금 항목 1 내용' }), { target: { value: '650000' } });
    fireEvent.change(view.inSheet().getByLabelText('총상금'), { target: { value: '650000' } });
    fireEvent.change(view.inSheet().getByLabelText('상금과 시상 요약'), { target: { value: '수정된 시상 안내' } });
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['prizeBreakdown', 'prizePool', 'prizeSummary']);
    expect(backend.state.patches[0]).toMatchObject({
      prizePool: 650000,
      prizeSummary: '수정된 시상 안내',
      prizeBreakdown: '@teameet/prizes/v1:' + JSON.stringify([
        { category: '팀 시상', label: '1위', amount: '650,000원' },
        { category: '기타 시상', label: '상품', amount: '우승 트로피' },
      ]),
    });
  });

  it('시상 항목을 모두 지우고 총상금·요약을 비우면 세 칸 모두 null 로 보낸다', async () => {
    const backend = start(withPrize);
    const view = renderInfoSheet(publicSection, backend);

    fireEvent.click(view.inSheet().getByRole('button', { name: '상금 항목 1 삭제' }));
    fireEvent.change(view.inSheet().getByLabelText('총상금'), { target: { value: '' } });
    fireEvent.change(view.inSheet().getByLabelText('상금과 시상 요약'), { target: { value: ' ' } });
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['prizeBreakdown', 'prizePool', 'prizeSummary']);
    expect(backend.state.patches[0]).toMatchObject({ prizePool: null, prizeSummary: null, prizeBreakdown: null });
  });

  it('옛 글 꼴로 저장된 상금을 열기만 하고 저장하면 요청하지 않는다', () => {
    const backend = start(withPrize);
    const view = renderInfoSheet(publicSection, backend);

    view.save();

    expect(view.onSaved).toHaveBeenCalledWith('변경된 내용이 없어요.');
    expect(backend.state.patches).toEqual([]);
  });
});

describe('공개 화면 섹션 시트 — 대회 규정·환불 정책', () => {
  it('대회 규정만 적으면 rulesText 만 보낸다', async () => {
    const backend = start();
    const view = renderInfoSheet(publicSection, backend);

    fireEvent.change(view.inSheet().getByLabelText('대회 규정'), { target: { value: '  풋살화 필수  ' } });
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['rulesText']);
    expect(backend.state.patches[0].rulesText).toBe('풋살화 필수');
  });

  it.each([
    ['대회 규정', 'rulesText'],
    ['환불 정책', 'refundPolicyText'],
  ] as const)('%s 을 비우면 null 을 보내고 다른 키는 없다', async (label, key) => {
    const backend = start({ rulesText: '기존 규정', refundPolicyText: '기존 환불 정책' });
    const view = renderInfoSheet(publicSection, backend);

    fireEvent.change(view.inSheet().getByLabelText(label), { target: { value: '' } });
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual([key]);
    expect(backend.state.patches[0][key]).toBeNull();
  });
});

describe('공개 화면 섹션 요약 카드', () => {
  const rows = (overrides: Partial<V1Tournament> = {}) => {
    render(<InfoSummaryCard definition={publicSection} context={{ tournament: createTournamentInfoFixture(overrides) }} canWrite onEdit={vi.fn()} />);
    return within(screen.getByRole('region', { name: '공개 화면' }));
  };
  const rowOf = (card: ReturnType<typeof rows>, label: string) => within(card.getByText(label).nextElementSibling as HTMLElement);

  it('비어 있는 값은 기본 이미지·「선택」 으로 보여 준다', () => {
    const card = rows();

    expect(rowOf(card, '이미지').getByText('목록·상세 모두 종목 기본 이미지')).toBeInTheDocument();
    expect(rowOf(card, '이미지').getByText('기본값')).toBeInTheDocument();
    for (const label of ['상금과 시상', '대회 규정', '환불 정책']) {
      expect(rowOf(card, label).getByText('비어 있음')).toBeInTheDocument();
      expect(rowOf(card, label).getByText('선택')).toBeInTheDocument();
    }
    expect(card.queryByText('채워야 해요')).toBeNull();
  });

  it('대조군: 채운 값은 내용을 보여 주고 배지가 없다', () => {
    const card = rows({ ...withImages, ...withPrize, rulesText: '풋살화 필수\n정강이 보호대 착용', refundPolicyText: '대회 3일 전까지 전액 환불' });

    expect(rowOf(card, '이미지').getByText('직접 올린 이미지')).toBeInTheDocument();
    expect(rowOf(card, '상금과 시상').getByText('우승 트로피 + 상금')).toBeInTheDocument();
    expect(rowOf(card, '대회 규정').getByText('풋살화 필수')).toBeInTheDocument();
    expect(rowOf(card, '환불 정책').getByText('대회 3일 전까지 전액 환불')).toBeInTheDocument();
    expect(card.queryByText('기본값')).toBeNull();
    expect(card.queryByText('선택')).toBeNull();
  });

  it('상세 이미지를 숨긴 대회는 그렇게 말한다', () => {
    expect(rowOf(rows({ ...withImages, showDetailImage: false }), '이미지').getByText('상세 화면에서는 숨김')).toBeInTheDocument();
  });

  it('요약 문구가 없으면 총상금으로 상금을 요약한다', () => {
    expect(rowOf(rows({ prizePool: 500000 }), '상금과 시상').getByText('총상금 500,000원')).toBeInTheDocument();
  });
});
