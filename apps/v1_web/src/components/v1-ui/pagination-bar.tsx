'use client';

/**
 * 목록 하단 페이지네이션 바.
 *
 * 원래 `components/admin/admin-data-table.tsx` 안에만 있었다 — 어드민 표 전용이라고
 * 봤기 때문이다. 소비자 대회 목록도 같은 게 필요해지면서(오너 지적: "더보기눌러서
 * 다음다음 넘어가는게 그게 좀 어려운것같고 페이지내이션 가능하게 해줘") 여기로 올렸다.
 * 소비자 화면이 `components/admin/*` 을 import 하게 두는 것도, 접근성 규칙(44×44 터치
 * 타겟 · `aria-current` · 생략 구간 비포커스)을 만족하는 100줄을 복사하는 것도 나쁘다.
 * 어드민 쪽은 `AdminTablePaginationBar` 이름으로 이 컴포넌트를 그대로 재수출한다 —
 * 기존 호출부는 한 줄도 바뀌지 않는다.
 */
export interface PaginationBarProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  /** 페이지 이동 요청이 진행 중이면 버튼을 잠근다. */
  loading?: boolean;
  /** 스크린리더용 목록 이름 — 한 화면에 목록이 둘 이상일 때 구분된다. */
  label?: string;
}

export function PaginationBar({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  loading,
  label = '목록 페이지',
}: PaginationBarProps) {
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const pages = visiblePages(page, totalPages);

  // 44×44: 프로젝트 터치 타겟 최솟값. 40px 로 두면 목록 19곳의 페이지네이션이 전부
  // 기준 미달이 된다(실측: 이전/다음 44×40, 숫자 40×40).
  // 크기·굵기는 Tailwind 유틸이 아니라 인라인으로 준다.
  // globals.css 의 `button, input, ... { font: inherit }` 리셋이 **레이어 밖(unlayered)** 이라
  // CSS Cascade Layers 규칙상 Tailwind 의 `@layer utilities` 안 유틸리티를 항상 이긴다 —
  // `text-[length:var(--font-size-label)] font-medium` 이 무효화돼 브라우저 기본 16px/400 으로
  // 렌더되고 있었다(alpha 실측 2026-09-08: 대회 목록 데스크톱 페이지네이션 16/400/24).
  // 인라인 style 은 그 리셋보다 우선하므로 여기서만 확실히 이긴다.
  //
  // 리셋 자체를 `@layer base` 로 옮기는 근본 수정은 **일부러 하지 않았다** — 저장소의
  // `tm-btn-*` 커스텀 버튼들이 지금 정상 렌더되는 것도 그 unlayered 우선순위 덕이라,
  // 전수 영향 조사 없이 옮기면 다른 버튼이 깨진다.
  const btnFont = { fontSize: 'var(--font-size-label)', fontWeight: 500 };
  const btn = [
    'inline-flex items-center justify-center min-w-[44px] min-h-[44px] px-2 rounded-lg',
    'transition-colors',
    'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-40',
  ].join(' ');

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 pt-1" aria-label={label}>
      <p className="text-[length:var(--font-size-label)] text-[var(--text-muted)] tabular-nums">
        전체 {total.toLocaleString('ko-KR')}건 중 {from.toLocaleString('ko-KR')}–
        {to.toLocaleString('ko-KR')}
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || loading}
          className={[btn, 'text-[var(--text-muted)] hover:bg-[var(--surface-soft)]'].join(' ')}
          style={btnFont}
          aria-label="이전 페이지"
        >
          이전
        </button>

        {pages.map((item, index) =>
          item === null ? (
            // 페이지가 많을 때의 생략 구간. 버튼이 아니므로 포커스를 받지 않는다.
            <span
              key={`gap-${index}`}
              className="px-1 text-[var(--text-muted)] select-none"
              aria-hidden="true"
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              disabled={loading}
              aria-current={item === page ? 'page' : undefined}
              aria-label={`${item}페이지`}
              className={[
                btn,
                'tabular-nums',
                item === page
                  ? 'bg-blue-500 text-white'
                  : 'text-[var(--text-muted)] hover:bg-[var(--surface-soft)]',
              ].join(' ')}
              style={btnFont}
            >
              {item}
            </button>
          ),
        )}

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || loading}
          className={[btn, 'text-[var(--text-muted)] hover:bg-[var(--surface-soft)]'].join(' ')}
          style={btnFont}
          aria-label="다음 페이지"
        >
          다음
        </button>
      </div>
    </nav>
  );
}

/**
 * 현재 페이지 주변만 보여주고 나머지는 생략(null)으로 접는다. 페이지가 수백 개가 되어도
 * 버튼 줄이 넘치지 않게 한다.
 */
function visiblePages(page: number, totalPages: number): Array<number | null> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: Array<number | null> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  if (start > 2) pages.push(null);
  for (let current = start; current <= end; current += 1) pages.push(current);
  if (end < totalPages - 1) pages.push(null);

  pages.push(totalPages);
  return pages;
}
