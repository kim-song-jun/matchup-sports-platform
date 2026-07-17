import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { publicAssetPath } from '@/lib/assets';
import { TeamAvatar } from './team-avatar';

describe('TeamAvatar', () => {
  it.each(['sm', 'md', 'lg', 'xl'] as const)(
    'renders seam-free identicon SVG attributes at the %s size',
    (size) => {
      // Given: a team without an uploaded logo at a supported avatar size.
      const { container } = render(
        <TeamAvatar seed={`team-${size}`} name={`${size} 테스트 팀`} logoUrl={null} size={size} />,
      );

      // When: the generated identicon SVG is rendered.
      const svg = container.querySelector('svg');

      // Then: adjacent cells use pixel-crisp, stroke-free rendering at every size.
      expect(svg).toHaveAttribute('shape-rendering', 'crispEdges');
      expect(svg).toHaveAttribute('stroke', 'none');
    },
  );

  it('shows the uploaded logo image when logoUrl is set', () => {
    const { container } = render(<TeamAvatar seed="team-1" name="성수 러너스" logoUrl="/uploads/logo.png" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
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

  it('uses the white card-surface background (not the identicon pastel palette) when a logo image is present', () => {
    const { container } = render(<TeamAvatar seed="team-1" name="성수 러너스" logoUrl="/uploads/logo.png" />);
    const wrapper = container.firstElementChild as HTMLElement;
    // 로드 성공/실패와 무관하게 logoUrl prop 존재 여부만으로 결정돼야 깜빡임이 없다 —
    // 하드코딩 #fff 대신 --card-surface 토큰(다른 카드 배경과 동일 소스) 재사용.
    expect(wrapper.style.background).toBe('var(--card-surface)');
  });

  it('keeps the identicon pastel palette background when there is no logo', () => {
    const { container } = render(<TeamAvatar seed="team-1" name="성수 러너스" logoUrl={null} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.background).not.toBe('var(--card-surface)');
    expect(wrapper.style.background).toMatch(/^var\(--(green|orange|teal)50\)$/);
  });

  it('hides the identicon svg once the logo image successfully loads', () => {
    const { container } = render(<TeamAvatar seed="team-1" name="성수 러너스" logoUrl="/uploads/logo.png" />);
    const img = container.querySelector('img') as HTMLImageElement;
    const svg = container.querySelector('svg') as SVGSVGElement;
    // 로드 전에는 identicon이 여전히 폴백으로 보여야 한다 (logoUrl이 있다는 사실만으로 숨기지 않음).
    expect(svg.style.display).not.toBe('none');

    fireEvent.load(img);
    expect(svg.style.display).toBe('none');
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
