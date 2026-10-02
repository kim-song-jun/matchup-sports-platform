/**
 * `illustration` prop 은 아이콘 원을 **대체**한다 — 둘이 함께 나오면 그래픽 위에 파란 원이
 * 겹쳐 보인다(agy-3d-graphic 스킬 integration.md). 양방향을 다 못박는다: 그래픽이 있으면
 * 원이 없고 원본 경로가 맞는 webp 가 있어야 하며, 없으면 예전 아이콘 경로가 그대로여야 한다.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { queryImageBySrc } from '@/test/next-image';
import { EmptyState } from './primitives';

describe('EmptyState illustration', () => {
  it('그래픽이 있으면 아이콘 원 대신 illustrations webp 를 그린다', () => {
    const { container } = render(
      <EmptyState illustration={{ name: 'matches-empty' }} title="조건에 맞는 매치가 없어요" sub="다른 종목을 선택해 보세요." />,
    );

    const img = queryImageBySrc(container, '/illustrations/matches-empty-640.webp');
    expect(img).not.toBeNull();
    expect(img).toHaveClass('tm-empty-illustration');
    expect(img).toHaveAttribute('aria-hidden', 'true');
    expect(img).toHaveAttribute('alt', '');
    expect(container.querySelector('.tm-empty-icon')).toBeNull();
    expect(screen.getByText('조건에 맞는 매치가 없어요')).toBeInTheDocument();
  });

  it('그래픽이 없으면 예전대로 아이콘 원만 그린다', () => {
    const { container } = render(<EmptyState title="아직 후기가 없어요" sub="경기 후 후기를 남겨 보세요." />);

    expect(container.querySelector('.tm-empty-icon')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });
});
