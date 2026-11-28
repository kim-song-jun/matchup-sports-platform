import { ExternalLink, RefreshCw } from 'lucide-react';
import { ScopedLink as Link } from '@/components/providers/navigation-scope';

/**
 * 폰의 운영 보드 머리말. 상단 바가 이미 「운영 보드」라고 말하므로 제목 자리는 대회명·날짜가 쓰고,
 * 이 화면의 h1 이 된다(데스크톱의 `OpsPageHeader` 는 이 컴포넌트가 그려지지 않을 때만 쓰인다).
 */
export function OperationsBoardPhoneHeader({
  title,
  stats,
  caption,
  publicHref,
  isRefreshing,
  onRefresh,
}: {
  readonly title: string;
  readonly stats: string;
  readonly caption: string;
  readonly publicHref: string;
  readonly isRefreshing: boolean;
  readonly onRefresh: () => void;
}) {
  return (
    <header className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <h1 title={title} className="truncate text-[length:var(--font-size-body)] font-bold text-[var(--text-strong)]">
          {title}
        </h1>
        <p className="mt-0.5 text-[length:var(--font-size-body-sm)] text-[var(--text-body)]">{stats}</p>
        <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{caption}</p>
        <Link
          href={publicHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1 text-[length:var(--font-size-label)] font-semibold text-[var(--blue700)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          참가자 화면 보기
          <ExternalLink size={14} aria-hidden="true" />
          <span className="sr-only">(새 탭에서 열려요)</span>
        </Link>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        aria-label="새로고침"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card-surface)] text-[var(--text-body)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshCw size={18} aria-hidden="true" className={isRefreshing ? 'animate-spin' : ''} />
      </button>
    </header>
  );
}
