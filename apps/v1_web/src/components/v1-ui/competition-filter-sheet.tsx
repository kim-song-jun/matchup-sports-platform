'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BottomSheet } from '@/components/v1-ui/bottom-sheet';
import { FilterIcon } from '@/components/v1-ui/icons';

/**
 * 대회·리그 목록의 **접는 필터**(2026-09-01 사용자 확정 B안).
 *
 * ## 왜 새로 만들지 않고 이 모양인가
 * 이 저장소엔 이미 같은 필터 UX 가 세 곳에 있다(`matches` · `team-matches` · `teams`).
 * 규약도 같다 — **열림·닫힘의 권위는 URL** 이고 옵션은 전부 `<Link href>` 다. 그래서 여기서는
 * 그 규약을 그대로 따르고, **대회 목록에만 없던 것을 채운다.**
 *
 * URL 이 권위라는 게 이 화면에서 특히 중요하다: `/league-matches` 리다이렉트가 **고른 상태를
 * 함께 넘겨야** 하는데(사용자 확정), 넘길 수 있는 건 URL 뿐이다.
 *
 * ## 세로 높이
 * 사용자가 *"지금보다 늘리지 않는 것이 이 안의 핵심"* 이라고 명시했다. 그래서 종목 칩 **줄
 * 자체를 시트로 옮기고** 그 자리에 요약 한 줄만 남긴다 — 줄 수가 늘지 않으므로 높이가
 * 늘어날 수 없다. (픽셀 판정은 alpha 실측이 한다.)
 */

export type CompetitionFilterOption = {
  readonly label: string;
  readonly value: string;
  readonly href: string;
  readonly active: boolean;
};

export type CompetitionFilterSheetModel = {
  /** 시트를 여는 링크(`?filter=1`). 요약 줄 전체가 이 링크다. */
  readonly openHref: string;
  /** 닫기·스크림·ESC·드래그가 모두 향하는 곳. **컴포넌트가 아니라 URL 이 닫는다.** */
  readonly closeHref: string;
  /** 전부 해제. */
  readonly resetHref: string;
  readonly statusOptions: readonly CompetitionFilterOption[];
  readonly sportOptions: readonly CompetitionFilterOption[];
  /** 요약 줄에 보일 문구. 고른 게 없으면 '전체'. */
  readonly summary: string;
  /** 뱃지 숫자 — 기본값이 아닌 필터 개수. */
  readonly activeCount: number;
};

/**
 * 요약 한 줄. **종목 칩 줄을 대신한다** — 새 줄을 얹는 게 아니다.
 * 줄 전체가 시트를 여는 링크라 44px 터치 타깃이 그대로 확보된다.
 */
export function CompetitionFilterSummary({ model }: { model: CompetitionFilterSheetModel }) {
  return (
    <Link
      className="tm-competition-filter-summary"
      href={model.openHref}
      aria-label={`필터 열기 — 현재 ${model.summary}`}
    >
      <FilterIcon size={18} strokeWidth={2} aria-hidden="true" />
      <span className="tm-competition-filter-summary-text">{model.summary}</span>
      {model.activeCount > 0 ? (
        <span className="tm-list-filter-count tab-num">{model.activeCount}</span>
      ) : null}
    </Link>
  );
}

export function CompetitionFilterSheet({ model }: { model: CompetitionFilterSheetModel }) {
  const router = useRouter();

  // 호출부가 열림 여부를 이미 가르고 렌더하므로 `open` 은 고정 true 다 — 세 선례와 같다.
  // 닫힘은 상태가 아니라 **URL 이동**으로 처리해야 뒤로가기가 통하고 링크 공유가 유지된다.
  return (
    <>
      <Link className="tm-filter-scrim" href={model.closeHref} aria-label="필터 닫기" />
      <BottomSheet open ariaLabel="대회 필터" onRequestClose={() => router.push(model.closeHref)}>
        <div className="tm-filter-sheet-handle" />
        <div className="tm-filter-sheet-head">
          <div>
            <div className="tm-text-subhead">필터</div>
            <div className="tm-text-caption" style={{ marginTop: 2 }}>
              상태와 종목으로 걸러볼 수 있어요.
            </div>
          </div>
          <Link
            className="tm-btn tm-btn-sm tm-btn-ghost"
            href={model.resetHref}
            style={{ color: 'var(--text-caption)' }}
          >
            초기화
          </Link>
        </div>
        {[
          ['상태', model.statusOptions],
          ['종목', model.sportOptions],
        ].map(([title, options]) => (
          <div key={title as string} className="tm-filter-section">
            <div className="tm-text-label">{title as string}</div>
            <div className="tm-filter-chip-wrap">
              {(options as readonly CompetitionFilterOption[]).map((option) => (
                <Link
                  key={option.value}
                  className={`tm-chip ${option.active ? 'tm-chip-active' : ''}`}
                  href={option.href}
                  aria-current={option.active ? 'page' : undefined}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
        <div className="tm-filter-actions">
          <Link className="tm-btn tm-btn-lg tm-btn-neutral" href={model.closeHref}>
            닫기
          </Link>
        </div>
      </BottomSheet>
    </>
  );
}
