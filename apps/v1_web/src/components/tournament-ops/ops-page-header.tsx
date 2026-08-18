import type { ReactNode } from 'react';

/**
 * 대회 운영 셸(`TournamentOpsShell`) 안의 모든 화면이 공유하는 페이지 머리말.
 *
 * 왜 필요한가 — 셸 하나 안에 5개 화면이 있는데 머리말이 전부 제각각이었다
 * (2026-08-18 실측):
 *
 * | 화면 | 컨테이너 | 제목 크기 | 뒤로가기 | eyebrow |
 * |---|---|---|---|---|
 * | 운영 보드 | 셸에 위임 | 22~24px | 없음 | 있음 |
 * | 결과 검토 | 인라인 style `maxWidth:960` | `tm-text-heading` | `← 대회로` | 있음 |
 * | 결과 정정 | 인라인 style `maxWidth:960` | `tm-text-heading` | `← 대회로` | 있음 |
 * | 경기 영상 | `max-w-[860px]` | 18px | 없음 | 없음 |
 * | 스태프 | 셸에 위임 | 22~24px | 없음 | 있음 |
 *
 * 제목 크기 3종·최대 폭 3종이 한 셸 안에 섞여 있었고, 결과 검토·정정은 셸이 이미
 * 그린 `<main>` 안에 자기 `<main>`을 한 번 더 열어 **문서에 main 랜드마크가 둘**
 * 있었다(스크린리더 탐색이 깨지고, padding 과 최대 폭도 이중으로 걸렸다).
 *
 * 폭·여백은 셸의 `<main>`(`px-4 md:px-6 lg:px-8` + `max-w-[1200px]`)이 이미 책임지므로
 * 이 컴포넌트는 **머리말만** 그린다. 화면은 컨테이너를 다시 만들지 않는다.
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
