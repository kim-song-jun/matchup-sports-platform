import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReviewsSummaryDashboard } from './reviews-summary-dashboard';

const summary = {
  bySport: [
    { sportId: 'sport-uuid-1', sportCode: 'futsal', ratingAvg: 4.8, ratingCount: 12, tagRates: [{ tagCode: 'manner', label: '매너가 좋아요', rate: 0.68, count: 8 }] },
  ],
  availableMonths: ['2026-07', '2026-06'],
};

describe('ReviewsSummaryDashboard', () => {
  it('종목별 평균 별점·건수·태그 빈도를 표시하고 개별 작성자 정보는 렌더링하지 않는다', () => {
    render(<ReviewsSummaryDashboard summary={summary} period={null} onPeriodChange={vi.fn()} loading={false} title="내가 받은 리뷰 요약" />);

    expect(screen.getByText('내가 받은 리뷰 요약')).toBeInTheDocument();
    expect(screen.getAllByText('4.8').length).toBeGreaterThan(0);
    expect(screen.getAllByText('12').length).toBeGreaterThan(0);
    expect(screen.getByText(/매너가 좋아요/)).toBeInTheDocument();
    expect(screen.getByText('68%')).toBeInTheDocument();
    // 개별 리뷰 작성자 관련 텍스트는 이 컴포넌트 어디에도 없어야 한다
    expect(screen.queryByText(/reviewerUser|작성자/)).not.toBeInTheDocument();
  });

  // 숫자만 크게 던지면(예전 "5" "1건") 무슨 값인지 읽을 수 없다 — 단위를 붙여 읽히게 한다.
  it('전체 평균과 건수를 단위와 함께 요약한다', () => {
    render(<ReviewsSummaryDashboard summary={summary} period={null} onPeriodChange={vi.fn()} loading={false} title="내가 받은 리뷰 요약" />);

    expect(screen.getByText(/평균/)).toBeInTheDocument();
    expect(screen.getByText(/개 리뷰/)).toBeInTheDocument();
  });

  it('월 드롭다운 선택 시 onPeriodChange를 선택한 값으로 호출한다', () => {
    const onPeriodChange = vi.fn();
    render(<ReviewsSummaryDashboard summary={summary} period={null} onPeriodChange={onPeriodChange} loading={false} title="내가 받은 리뷰 요약" />);

    fireEvent.change(screen.getByLabelText('내가 받은 리뷰 요약 기간 선택'), { target: { value: '2026-07' } });

    expect(onPeriodChange).toHaveBeenCalledWith('2026-07');
  });

  // 예전엔 0건일 때도 제목 + 기간 드롭다운 + 빈 상태 카드가 화면 맨 위를 차지했다.
  // 걸 대상이 없는 필터를 남겨둘 이유가 없으므로 섹션째 사라져야 한다.
  it('집계 결과가 비어 있으면 아무것도 렌더하지 않는다', () => {
    const { container } = render(
      <ReviewsSummaryDashboard summary={{ bySport: [], availableMonths: [] }} period={null} onPeriodChange={vi.fn()} loading={false} title="내가 받은 리뷰 요약" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // 집계가 있어도 선택할 월이 없으면 드롭다운은 의미가 없다.
  it('선택 가능한 기간이 없으면 기간 드롭다운을 숨긴다', () => {
    render(
      <ReviewsSummaryDashboard
        summary={{ ...summary, availableMonths: [] }}
        period={null}
        onPeriodChange={vi.fn()}
        loading={false}
        title="내가 받은 리뷰 요약"
      />,
    );
    expect(screen.queryByLabelText(/기간 선택/)).not.toBeInTheDocument();
  });
});
