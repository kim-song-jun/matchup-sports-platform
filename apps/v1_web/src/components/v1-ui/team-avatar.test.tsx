import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { publicAssetPath } from '@/lib/assets';
import { TeamAvatar } from './team-avatar';

describe('TeamAvatar', () => {
  it('shows the uploaded logo image when logoUrl is set', () => {
    const { container } = render(<TeamAvatar seed="team-1" name="성수 러너스" logoUrl="/uploads/logo.png" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    // publicAssetPath()를 거쳐 렌더링되므로 원본 문자열을 그대로 하드코딩하지 않고
    // 같은 함수로 기대값을 계산한다(NEXT_PUBLIC_BASE_PATH가 설정된 환경에서도 안전).
    expect(img).toHaveAttribute('src', publicAssetPath('/uploads/logo.png'));
  });

  it('falls back to a generated identicon pattern when logoUrl is absent', () => {
    const { container } = render(<TeamAvatar seed="team-1" name="성수 러너스" logoUrl={null} />);
    expect(container.querySelector('img')).toBeNull();
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.querySelectorAll('rect').length).toBeGreaterThan(0);
  });

  it('picks a deterministic palette color and identicon pattern from the seed, independent of name', () => {
    const { container: first } = render(<TeamAvatar seed="team-42" name="A팀" logoUrl={null} />);
    const { container: second } = render(<TeamAvatar seed="team-42" name="완전히 다른 팀 이름" logoUrl={null} />);
    const firstBg = (first.firstElementChild as HTMLElement).style.background;
    const secondBg = (second.firstElementChild as HTMLElement).style.background;
    expect(firstBg).toBe(secondBg);
    expect(first.querySelector('svg')?.innerHTML).toBe(second.querySelector('svg')?.innerHTML);
  });

  it('recovers visibility when logoUrl changes from a broken URL to a valid one', () => {
    const { container, rerender } = render(<TeamAvatar seed="team-1" name="성수 러너스" logoUrl="/uploads/broken.png" />);
    const img = container.querySelector('img') as HTMLImageElement;
    fireEvent.error(img); // 첫 로고가 깨져서 onError가 display:none을 건다
    expect(img.style.display).toBe('none');

    // 재업로드 등으로 유효한 로고로 교체됨 — 같은 <img> 엘리먼트가 재사용된다.
    rerender(<TeamAvatar seed="team-1" name="성수 러너스" logoUrl="/uploads/fixed.png" />);
    fireEvent.load(img);
    expect(img.style.display).not.toBe('none');
    expect(img.style.opacity).toBe('1');
  });

  it('renders a different pattern/color for a different seed (visual distinctiveness)', () => {
    const { container: teamA } = render(<TeamAvatar seed="team-a" name="팀A" logoUrl={null} />);
    const { container: teamB } = render(<TeamAvatar seed="team-b" name="팀B" logoUrl={null} />);
    const aSignature = (teamA.firstElementChild as HTMLElement).style.background + teamA.querySelector('svg')?.innerHTML;
    const bSignature = (teamB.firstElementChild as HTMLElement).style.background + teamB.querySelector('svg')?.innerHTML;
    expect(aSignature).not.toBe(bSignature);
  });
});
