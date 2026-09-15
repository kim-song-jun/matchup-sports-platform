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
    // 단위가 헤더와 종목 행 **양쪽**에 붙는다 — 예전엔 헤더에만 있었다.
    expect(screen.getAllByText(/개 리뷰/).length).toBeGreaterThan(0);
  });

  /**
   * **팀 요약에서 이 숫자는 리뷰 수가 아니라 리뷰를 남긴 팀 수다**(팀 단위 평균이 의도된
   * 설계). 헤더에는 단위가 붙어 있었는데 **종목별 행만 "3개" 로 끝나** 리뷰 3건으로
   * 읽혔고, 바로 아래 태그 비율(분모는 원시 리뷰 수)과 나란히 서면 서로를 부정하는 것처럼
   * 보였다. 단위를 양쪽에 같게 붙이고, 무엇을 세는지는 카드 아래 한 줄이 말한다.
   */
  it('종목별 행에도 헤더와 같은 단위를 붙인다', () => {
    render(
      <ReviewsSummaryDashboard
        summary={summary}
        period={null}
        onPeriodChange={vi.fn()}
        loading={false}
        title="내 팀이 받은 리뷰 요약"
        countUnit="팀"
        countNote="숫자는 리뷰를 남긴 팀 수예요. 아래 태그 비율은 리뷰 하나하나를 세요."
      />,
    );

    // 헤더와 종목 행 두 자리 — 단위가 빠진 자리가 없어야 한다.
    expect(screen.getAllByText(/개 팀/)).toHaveLength(2);
    expect(screen.getByText('숫자는 리뷰를 남긴 팀 수예요. 아래 태그 비율은 리뷰 하나하나를 세요.')).toBeInTheDocument();
  });

  it('개인 요약도 무엇을 세는지 한 줄로 말한다', () => {
    render(<ReviewsSummaryDashboard summary={summary} period={null} onPeriodChange={vi.fn()} loading={false} title="내가 받은 리뷰 요약" />);

    expect(screen.getAllByText(/개 리뷰/)).toHaveLength(2);
    expect(screen.getByText('숫자는 받은 리뷰 수예요.')).toBeInTheDocument();
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
