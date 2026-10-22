import Link from 'next/link';

/**
 * 요약 줄의 숫자. 숫자는 서버가 센 전체 건수이고, '모집 중 N'은 누르면 지금 신청할 수 있는 매치만 보는 토글이다
 * (2026-10-21). 토글은 종목 칩과 같은 칩·링크 규칙(44px, 켜지면 aria-current)을 쓴다.
 */
export function ListSummaryCounts({ summary }: { summary: { count: number; today: number; urgent: number; recruitingFilter?: { active: boolean; href: string } } }) {
  const toggle = summary.recruitingFilter;
  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="tm-text-caption tab-num">
        {summary.count}개 · 오늘 {summary.today}
        {toggle ? null : <> · 모집 중 <strong style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{summary.urgent}</strong></>}
      </div>
      {toggle ? (
        <Link className={`tm-chip ${toggle.active ? 'tm-chip-active' : ''}`} href={toggle.href} scroll={false} aria-current={toggle.active ? 'page' : undefined}>
          모집 중 <span className="tab-num">{summary.urgent}</span>
        </Link>
      ) : null}
    </div>
  );
}
