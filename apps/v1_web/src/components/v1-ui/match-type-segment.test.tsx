import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MatchTypeSegment } from './match-type-segment';

/**
 * 개인/팀 매치 목록을 오가는 유일한 경로다 — 링크 목적지가 갈리면 한쪽 목록에 갇힌다.
 * `SegmentedTabs` 로 이관(2026-09-02)한 뒤에도 목적지·aria-current 계약이 그대로인지
 * 여기서 못박는다(구현 되읊기가 아니라 실제 네비게이션 계약 검증).
 */
describe('MatchTypeSegment', () => {
  it('팀 매치를 첫 번째 선택지로 보여준다', () => {
    render(<MatchTypeSegment active="team" />);
    const nav = screen.getByRole('navigation', { name: '매치 유형' });
    const links = within(nav).getAllByRole('link');

    expect(links[0]).toHaveTextContent('팀');
    expect(links[0]).toHaveAttribute('href', '/team-matches');
    expect(links[1]).toHaveTextContent('개인');
    expect(links[1]).toHaveAttribute('href', '/matches');
  });

  it('개인 매치를 보다가 팀 매치로 건너갈 수 있다', () => {
    render(<MatchTypeSegment active="personal" />);
    const nav = screen.getByRole('navigation', { name: '매치 유형' });
    expect(within(nav).getByRole('link', { name: '팀' })).toHaveAttribute('href', '/team-matches');
  });

  it('팀 매치를 보다가 개인 매치로 돌아갈 수 있다', () => {
    render(<MatchTypeSegment active="team" />);
    const nav = screen.getByRole('navigation', { name: '매치 유형' });
    expect(within(nav).getByRole('link', { name: '개인' })).toHaveAttribute('href', '/matches');
  });

  it('현재 위치를 색이 아니라 aria-current 로도 알린다', () => {
    render(<MatchTypeSegment active="team" />);
    const nav = screen.getByRole('navigation', { name: '매치 유형' });
    expect(within(nav).getByRole('link', { name: '팀' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: '개인' })).not.toHaveAttribute('aria-current');
  });

  it('좌우 여백을 담당하던 tm-match-type-segment 클래스가 트랙에 그대로 붙어 있다', () => {
    // 옮기기 전엔 <nav> 자신이 이 클래스를 가졌다 — SegmentedTabs 의 className 이
    // track 요소(같은 <nav>)에 병합되지 않으면 검색바·카드와의 좌우 정렬이 깨진다.
    const { container } = render(<MatchTypeSegment active="personal" />);
    expect(container.querySelector('nav.tm-match-type-segment')).toBeInTheDocument();
  });
});
