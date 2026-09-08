/**
 * 매치 목록 밀도(2026-09-06 B안). 목록 본문은 행 카드로 통일하고, 배너 카드는
 * 사진이 있는 매치만 상단 가로 레일로 올린다. 배너를 목록에 그대로 두면 미디어가
 * 카드의 절반(146/286px)을 써서 390 폭에서 2.95장밖에 안 보였다(browse-density 스킬).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getMatchListViewModel } from './matches.view-model';
import { MatchListPageView } from './matches-page';

vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }), usePathname: () => '/matches' }));
vi.mock('@/components/v1-ui/shell-override', () => ({ useShellOverride: () => undefined }));

const base = getMatchListViewModel();

function listWith(images: (string | null)[]) {
  const matches = images.map((image, i) => ({ ...base.matches[0], id: 'm' + i, image }));
  return render(<MatchListPageView model={{ ...base, matches, isLoading: false }} />);
}

describe('매치 목록 본문', () => {
  it('행 카드로 그린다 — 배너 카드는 본문에 없다', () => {
    const { container } = listWith([null, null, null]);

    const stack = container.querySelector('.tm-match-card-stack') as HTMLElement;
    expect(stack.querySelectorAll('.tm-match-row')).toHaveLength(3);
    expect(stack.querySelector('.tm-match-list-card')).toBeNull();
  });

  it('행 썸네일 안에 종목 그래픽을 넣는다 — 사진 없는 매치도 종목이 보인다', () => {
    const { container } = listWith([null]);

    const thumb = container.querySelector('.tm-match-row-thumb');
    expect(thumb).not.toBeNull();
    expect(thumb!.querySelector('img')).not.toBeNull();
  });
});

describe('상단 이벤트 레일', () => {
  it('사진이 있는 매치만 배너로 올리고, 본문 행 목록은 전부 유지한다', () => {
    const { container } = listWith(['/uploads/a.webp', null, '/uploads/b.webp']);

    const rail = container.querySelector('.tm-match-rail-h') as HTMLElement;
    expect(rail).not.toBeNull();
    expect(within(rail).getAllByRole('link')).toHaveLength(2);
    // 레일은 하이라이트일 뿐 목록을 대체하지 않는다 — 세 건 모두 본문에 남아야 한다.
    expect((container.querySelector('.tm-match-card-stack') as HTMLElement).querySelectorAll('.tm-match-row')).toHaveLength(3);
  });

  it('사진 있는 매치가 없으면 레일 자체를 그리지 않는다', () => {
    const { container } = listWith([null, null]);

    expect(container.querySelector('.tm-match-rail-section')).toBeNull();
  });
});

describe('참가 현황 게이지 (DESIGN.md 11절)', () => {
  it('참가율을 바 너비로 그리고, 정확한 값은 텍스트가 계속 말한다', () => {
    const matches = [{ ...base.matches[0], id: 'm0', image: null, current: 3, capacity: 10 }];
    const { container } = render(<MatchListPageView model={{ ...base, matches, isLoading: false }} />);

    const gauge = container.querySelector('.tm-match-row-gauge') as HTMLElement;
    expect(gauge).not.toBeNull();
    expect(gauge.style.getPropertyValue('--tm-fill')).toBe('30%');
    // 바는 장식이고 값은 텍스트가 지킨다 — 스크린리더가 같은 값을 두 번 읽지 않게.
    expect(gauge.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.tm-match-row-foot')!.textContent).toContain('3/10명');
  });

  it('정원을 넘겨도 100% 를 넘지 않는다', () => {
    const matches = [{ ...base.matches[0], id: 'm0', image: null, current: 12, capacity: 10 }];
    const { container } = render(<MatchListPageView model={{ ...base, matches, isLoading: false }} />);

    expect((container.querySelector('.tm-match-row-gauge') as HTMLElement).style.getPropertyValue('--tm-fill')).toBe('100%');
  });

  it('정원이 없으면 바를 그리지 않는다 — 분모가 없으면 채움을 정할 수 없다', () => {
    const matches = [{ ...base.matches[0], id: 'm0', image: null, current: 3, capacity: 0 }];
    const { container } = render(<MatchListPageView model={{ ...base, matches, isLoading: false }} />);

    expect(container.querySelector('.tm-match-row-gauge')).toBeNull();
    expect(container.querySelector('.tm-match-row-foot')!.textContent).toContain('3/0명');
  });
});

/**
 * 데스크톱 열 수 (2026-09-07 alpha 실측).
 *
 * 행 카드는 96px 썸네일이 폭을 먼저 가져가므로, 열을 늘리면 본문이 그만큼 좁아져 제목이
 * 한 줄에서 잘린다. 실측값:
 *   768  2-up → 카드 272px / 본문 **130px**
 *   1440 3-up → 카드 333px / 본문 **191px** (제목에 남는 폭 111px)
 *   1024 2-up → 카드 480px / 본문 338px  ← 이 정도가 필요하다
 *
 * 그래서 `.tm-match-card-stack` 은 어느 폭에서도 3-up 이 되면 안 되고, 768~1023 은 1-up 이다.
 * (배너 카드 시절엔 3-up 이 맞았다 — 그때는 썸네일이 카드 위에 얹혀 본문이 카드 전폭이었다.)
 */
describe('데스크톱 열 수 — 행 카드가 눌리지 않는 폭', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/app/desktop/matches.css'), 'utf8');
  const stackRules = [...css.matchAll(/\.tm-match-card-stack\s*\{([^}]*)\}/g)].map((m) => m[1]);

  it('선언이 실제로 잡힌다 — 파일 구조가 바뀌면 아래 단언이 조용히 통과하지 않도록', () => {
    expect(stackRules.length).toBeGreaterThanOrEqual(3);
  });

  it('어느 브레이크포인트에서도 3-up 이 되지 않는다', () => {
    stackRules.forEach((rule) => {
      const cols = rule.match(/grid-template-columns:\s*repeat\((\d+)/)?.[1];
      if (cols) expect(Number(cols)).toBeLessThanOrEqual(2);
    });
  });

  it('768~1023 구간은 한 줄에 한 장이다', () => {
    const block = css.match(/@media \(min-width: 768px\) and \(max-width: 1023px\) \{[\s\S]*?\n\}/)?.[0];

    expect(block).toBeDefined();
    expect(block).toContain('.tm-match-card-stack');
    expect(block).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(block).not.toMatch(/repeat\(2/);
  });
});

/**
 * 페이지 제목 토큰 정합 (2026-09-08 alpha 실측 · ultracode 감사).
 *
 * DESIGN.md 는 페이지 제목을 `--font-size-heading` / `.tm-text-heading`(24px/700)으로 규정한다.
 * 그런데 matches·team-matches·teams 세 화면은 각자 desktop CSS 에 **26px/800 을 복붙**해
 * 두고 있었다(실측 px=26/weight=800, 세 파일 각 1건). 8단계 스케일(11/12/13/14/15/17/20/24)에
 * 26 은 없다. 형제 화면 tournaments 는 같은 역할에 공유 셸의 `tm-text-heading` 을 그대로 써서
 * 24/700 을 얻고 있었다 — 세 화면만 빠진 것이다.
 *
 * 이 계약은 **jsdom 이 미디어 쿼리를 계산하지 않아** 렌더 테스트로는 못 잡는다.
 */
describe('페이지 제목 — 공유 토큰', () => {
  const files = [
    ['matches', 'src/app/desktop/matches.css', '.tm-match-desktop-header-title'],
    ['team-matches', 'src/app/desktop/team-matches.css', '.tm-team-match-desktop-header-title'],
    ['teams', 'src/app/desktop/teams.css', '.tm-team-desktop-header-title'],
  ];

  it('세 화면 모두 desktop CSS 에서 크기·굵기를 직접 정하지 않는다', () => {
    files.forEach(([name, path, selector]) => {
      const css = readFileSync(resolve(process.cwd(), path), 'utf8');
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rule = css.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'))?.[1]
        ?.replace(/\/\*[\s\S]*?\*\//g, '');

      expect(rule, name).toBeDefined();
      expect(rule, name).not.toMatch(/font-size:/);
      expect(rule, name).not.toMatch(/font-weight:/);
    });
  });

  it('세 h1 이 공유 클래스를 실제로 달고 있다 — CSS 만 지우면 크기가 사라진다', () => {
    [
      'src/components/matches/matches-page.tsx',
      'src/components/team-matches/team-matches-page.tsx',
      'src/components/teams/teams-page.tsx',
    ].forEach((path) => {
      const tsx = readFileSync(resolve(process.cwd(), path), 'utf8');
      const h1 = tsx.match(/<h1 className="([^"]*desktop-header-title[^"]*)"/)?.[1];

      expect(h1, path).toBeDefined();
      expect(h1, path).toContain('tm-text-heading');
    });
  });
});
