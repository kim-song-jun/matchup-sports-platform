/**
 * 사진 없는 매치의 그래픽 배치(2026-09-06 B안). 영상 pCc9GspeYfg 02·03 을 따라
 * 그래픽을 흐름 안 블록으로 위에, 카피를 아래로 쌓는다. 예전 구석 절대배치는
 * 자리를 옮겨도 아이콘 버튼·오버레이 텍스트와 같은 면을 계속 나눠 써야 했다.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { queryImageBySrc } from '@/test/next-image';
import { getMatchDetailViewModel } from './matches.view-model';
import { MatchDetailPageView } from './matches-page';

vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }), usePathname: () => '/matches/m1' }));
vi.mock('@/components/v1-ui/shell-override', () => ({ useShellOverride: () => undefined }));

function detail(image: string | null) {
  const base = getMatchDetailViewModel();
  return { ...base, match: { ...base.match, image } };
}

describe('사진 없는 매치 상세 히어로', () => {
  it('그래픽을 흐름 안 블록으로 위에 두고, 히어로를 세로 스택으로 그린다', () => {
    const { container } = render(<MatchDetailPageView model={detail(null)} />);

    const hero = container.querySelector('.tm-match-detail-hero');
    expect(hero).not.toBeNull();
    expect(hero!.classList.contains('tm-match-detail-hero-stack')).toBe(true);
    // 그래픽이 히어로 자식이기만 하면 구석 절대배치도 통과한다 — 전용 블록 안에 있어야 한다.
    const graphic = hero!.querySelector('.tm-match-hero-graphic');
    expect(graphic).not.toBeNull();
    expect(graphic!.querySelector('img')).not.toBeNull();
  });

  it('이 자리는 176px 이상이라 오브젝트 셋짜리 hero 판을 쓴다', () => {
    // 목록 썸네일(76px)용 둘짜리 판을 여기 쓰면 176/208px 를 오브젝트 둘로 채워 허전하다
    // (agy-3d-graphic 스킬의 삼각 구도 기준). 자리별 파일 분리는 사용자 확정(2026-09-07 B안).
    const { container } = render(<MatchDetailPageView model={detail(null)} />);

    expect(queryImageBySrc(container, '/illustrations/sport-futsal-hero-640.webp')).not.toBeNull();
    expect(queryImageBySrc(container, '/illustrations/sport-futsal-640.webp')).toBeNull();
  });

  it('카피는 인라인 흰 글씨가 아니라 클래스로 색을 받는다 — 밝은 바탕에서 되돌릴 수 있어야 한다', () => {
    const { container } = render(<MatchDetailPageView model={detail(null)} />);

    const meta = container.querySelector('.tm-match-detail-meta') as HTMLElement;
    expect(meta).not.toBeNull();
    expect(meta.style.color).toBe('');
  });
});

describe('사진 있는 매치 상세 히어로', () => {
  it('기존 사진 히어로 구조를 그대로 둔다', () => {
    const { container } = render(<MatchDetailPageView model={detail('/uploads/real.webp')} />);

    const hero = container.querySelector('.tm-match-detail-hero') as HTMLElement;
    expect(hero.classList.contains('tm-match-detail-hero-stack')).toBe(false);
    expect(hero.querySelector('.tm-match-hero-graphic')).toBeNull();
    expect(queryImageBySrc(container, '/illustrations/sport-futsal-640.webp')).toBeNull();
    expect(hero.style.backgroundImage).toContain('/uploads/real.webp');
  });
});

/**
 * 매치 상세 제목 굵기 (2026-09-08 alpha 실측 · ultracode 감사).
 *
 * 데스크톱 페이지 헤드의 `h1`(`.tm-text-heading`, 24/700)과 히어로의 `h2`
 * (`.tm-match-detail-title`)가 **같은 `match.title` 문자열**을 보여주는데, 크기는 같고
 * 굵기만 700 vs 800 으로 갈려 있었다 — 한 화면에서 같은 제목이 두 무게로 보인다.
 */
describe('매치 상세 제목 — 두 헤딩이 같은 무게', () => {
  it('히어로 h2 가 페이지 제목과 같은 크기·굵기를 쓴다', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
    const strip = (v: string) => v.replace(/\/\*[\s\S]*?\*\//g, '');

    const heading = strip(css.match(/^\.tm-text-heading\s*\{([^}]*)\}/m)?.[1] ?? '');
    const detail = strip(css.match(/^\.tm-match-detail-title\s*\{([^}]*)\}/m)?.[1] ?? '');

    expect(heading).toBeTruthy();
    expect(detail).toBeTruthy();

    // 같은 토큰, 같은 굵기.
    expect(detail).toMatch(/font-size:\s*var\(--font-size-heading\)/);
    expect(detail).toMatch(/font-weight:\s*700/);
    expect(heading).toMatch(/font-weight:\s*700/);

    // 히어로 지면 위 흰 글씨는 유지돼야 한다 — 굵기 맞추다 색을 잃지 않았는지.
    expect(detail).toMatch(/color:\s*var\(--static-white\)/);
  });
});
