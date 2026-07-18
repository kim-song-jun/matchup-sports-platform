import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReviewsSummaryDashboard } from './reviews-summary-dashboard';

const summary = {
  bySport: [
    { sportId: 'futsal', ratingAvg: 4.8, ratingCount: 12, tagRates: [{ tagCode: 'manner', label: '매너가 좋아요', rate: 0.68, count: 8 }] },
  ],
  availableMonths: ['2026-07', '2026-06'],
};

describe('ReviewsSummaryDashboard', () => {
  it('종목별 평균 별점·건수·태그 빈도를 표시하고 개별 작성자 정보는 렌더링하지 않는다', () => {
    render(<ReviewsSummaryDashboard summary={summary} period={null} onPeriodChange={vi.fn()} loading={false} />);

    expect(screen.getByText('4.8')).toBeInTheDocument();
    expect(screen.getByText('12건')).toBeInTheDocument();
    expect(screen.getByText(/매너가 좋아요/)).toBeInTheDocument();
    expect(screen.getByText('68%')).toBeInTheDocument();
    // 개별 리뷰 작성자 관련 텍스트는 이 컴포넌트 어디에도 없어야 한다
    expect(screen.queryByText(/reviewerUser|작성자/)).not.toBeInTheDocument();
  });

  it('월 드롭다운 선택 시 onPeriodChange를 선택한 값으로 호출한다', () => {
    const onPeriodChange = vi.fn();
    render(<ReviewsSummaryDashboard summary={summary} period={null} onPeriodChange={onPeriodChange} loading={false} />);

    fireEvent.change(screen.getByLabelText('기간 선택'), { target: { value: '2026-07' } });

    expect(onPeriodChange).toHaveBeenCalledWith('2026-07');
  });

  it('집계 결과가 비어 있으면 안내 문구를 보여준다', () => {
    render(<ReviewsSummaryDashboard summary={{ bySport: [], availableMonths: [] }} period={null} onPeriodChange={vi.fn()} loading={false} />);
    expect(screen.getByText('아직 집계된 리뷰가 없어요.')).toBeInTheDocument();
  });
});
