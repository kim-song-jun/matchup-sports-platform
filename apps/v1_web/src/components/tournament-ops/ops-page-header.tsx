import type { ReactNode } from 'react';

/**
 * 대회 운영 셸(`TournamentOpsShell`) 안의 모든 화면이 공유하는 페이지 머리말.
 *
 * 폭·여백은 셸의 `<main>`(`px-4 md:px-6 lg:px-8` + `max-w-[1200px]`)이 이미 책임지므로
 * 이 컴포넌트는 **머리말만** 그린다. 화면은 컨테이너를 다시 만들지 않고, 자기 `<main>` 을
 * 열지 않는다(문서에 main 랜드마크가 둘이 되지 않게).
 */
export function OpsPageHeader({
  tournamentTitle,
  title,
  description,
  action,
}: {
  /** eyebrow 로 쓰는 대회명. 로딩 중이면 undefined 가 와서 '대회 운영' 으로 대체된다. */
  readonly tournamentTitle?: string | null;
  readonly title: string;
  readonly description?: ReactNode;
  /** 우측 상단 액션(새로고침·스태프 추가 등). 없으면 제목이 전체 폭을 쓴다. */
  readonly action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {/* 소비자용 대회 화면(대회 상세·순위/브래킷)이 이미 쓰는 eyebrow(파란 대회명)+제목
            톤을 그대로 따른다 — 운영 화면만 이질적이라는 지적(2026-08-05)의 결론이다. */}
        <p className="mb-1 text-[length:var(--font-size-caption)] font-semibold tracking-normal text-[var(--blue700)]">
          {tournamentTitle ?? '대회 운영'}
        </p>
        <h1 className="text-[length:var(--font-size-heading)] font-bold text-[var(--text-strong)]">{title}</h1>
        {description ? (
          <p className="mt-1 text-[length:var(--font-size-body-sm)] leading-relaxed text-[var(--text-muted)]">{description}</p>
        ) : null}
      </div>
      {action ?? null}
    </header>
  );
}
