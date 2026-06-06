import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  ActionPanel,
  FilterPill,
  FilterRail,
  MetricCard,
  MobileFixedCTA,
  PageHeader,
  TwoColumnLayout,
} from './primitives';

describe('Open Design foundation primitives', () => {
  it('renders page header, filter rail, metrics, action panel, layout, and fixed CTA contracts', () => {
    render(
      <>
        <PageHeader eyebrow="개인 매치" title="오늘 가능한 매치" description="빠르게 비교하고 신청하세요" action={<a href="/matches/new">만들기</a>} />
        <FilterRail title="필터">
          <FilterPill active>풋살</FilterPill>
          <FilterPill count={12}>축구</FilterPill>
        </FilterRail>
        <MetricCard label="참가율" value="82%" delta="+12%" tone="up" />
        <ActionPanel title="다음 액션" description="조건을 확인하고 신청을 완료하세요" action={<button type="button">신청</button>} />
        <TwoColumnLayout main={<div>목록</div>} aside={<div>상세</div>} />
        <MobileFixedCTA>
          <button type="button">신청하기</button>
        </MobileFixedCTA>
      </>,
    );

    expect(screen.getByRole('banner')).toHaveClass('tm-page-header');
    expect(screen.getByRole('button', { name: '풋살' })).toHaveAttribute('data-active', 'true');
    expect(screen.getByRole('button', { name: '축구 12' })).toBeInTheDocument();
    expect(screen.getByText('참가율').closest('.tm-metric-card')).toBeInTheDocument();
    expect(screen.getByText('다음 액션').closest('.tm-action-panel')).toBeInTheDocument();
    expect(screen.getByText('목록').closest('.tm-two-column-layout')).toBeInTheDocument();
    expect(screen.getByText('신청하기').closest('.tm-mobile-fixed-cta')).toBeInTheDocument();
  });
});
