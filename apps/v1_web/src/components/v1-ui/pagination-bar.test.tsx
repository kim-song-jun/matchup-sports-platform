/**
 * 페이지네이션 버튼의 글자 크기 (2026-09-08 alpha 실측 · ultracode 감사).
 *
 * `text-[length:var(--font-size-label)] font-medium` 으로 13px/500 을 의도했는데
 * 실제로는 **브라우저 기본 16px/400** 으로 렌더되고 있었다.
 *
 * 원인은 CSS Cascade Layers 다. `globals.css` 는 `@import "tailwindcss"` 만 있고 `@layer` 선언이
 * 하나도 없다 — Tailwind 유틸리티는 자기 `@layer utilities` 안에 있는 반면,
 * 같은 파일의 `button, input, textarea, select, option { font: inherit; }` 는 **레이어 밖**이다.
 * 스펙상 레이어 밖 스타일은 특이도·순서와 무관하게 레이어 안 스타일을 항상 이긴다.
 * 그래서 그 리셋이 font-size/weight 를 조상 값으로 되돌려 Tailwind 지정을 무효화했다.
 *
 * 인라인 style 은 그 리셋보다 우선하므로 이 컴포넌트에서만 확실히 이긴다.
 * 리셋 자체를 `@layer base` 로 옮기는 근본 수정은 하지 않았다 — 저장소의 `tm-btn-*` 버튼들이
 * 정상 렌더되는 것도 그 unlayered 우선순위 덕이라, 전수 조사 없이 옮기면 다른 버튼이 깨진다.
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PaginationBar } from './pagination-bar';

function renderBar() {
  return render(
    <PaginationBar page={2} totalPages={5} total={100} limit={20} onPageChange={vi.fn()} />,
  );
}

describe('PaginationBar — 글자 크기', () => {
  it('모든 버튼이 인라인으로 크기·굵기를 지정한다 — Tailwind 유틸만으로는 리셋에 눌린다', () => {
    const { container } = renderBar();
    const buttons = [...container.querySelectorAll('button')];

    expect(buttons.length).toBeGreaterThanOrEqual(3);
    buttons.forEach((b) => {
      expect(b.style.fontSize).toBe('var(--font-size-label)');
      expect(b.style.fontWeight).toBe('500');
    });
  });

  it('크기를 Tailwind 유틸리티에 다시 맡기지 않는다', () => {
    const { container } = renderBar();
    const buttons = [...container.querySelectorAll('button')];

    // 이 유틸이 클래스로 돌아오면 "고쳤다고 생각하지만 실제로는 안 먹는" 상태로 되돌아간다.
    buttons.forEach((b) => {
      expect(b.className).not.toContain('text-[length:var(--font-size-label)]');
      expect(b.className).not.toContain('font-medium');
    });
  });

  it('44px 터치 타깃은 그대로다 — 이 변경이 되돌리지 않았는지', () => {
    const { container } = renderBar();

    [...container.querySelectorAll('button')].forEach((b) => {
      expect(b.className).toContain('min-w-[44px]');
      expect(b.className).toContain('min-h-[44px]');
    });
  });
});
