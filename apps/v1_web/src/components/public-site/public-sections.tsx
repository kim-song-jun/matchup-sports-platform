import type { ReactNode } from 'react';
import { formatTournamentDateLong } from '@/lib/date-utils';

type HeadingLevel = 'h1' | 'h2' | 'h3';

/** landing-rhythm 모듈: 키워드 → 제목 → 본문 → 그 아래 자유 콘텐츠. */
export function PublicSection({
  id,
  keyword,
  title,
  lead,
  as: Heading = 'h2',
  tone = 'default',
  children,
}: {
  id: string;
  keyword?: string;
  title: ReactNode;
  lead?: ReactNode;
  as?: HeadingLevel;
  /** 페이지당 하나의 강조 섹션만 `muted` 배경을 쓴다. */
  tone?: 'default' | 'muted';
  children?: ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} className="tm-ps-section" data-tone={tone === 'muted' ? 'muted' : undefined} aria-labelledby={headingId}>
      <div className="tm-ps-container">
        <header className="tm-ps-section-header">
          {keyword ? <p className="tm-ps-kw">{keyword}</p> : null}
          <Heading id={headingId} className={Heading === 'h1' ? 'tm-ps-title-page' : 'tm-ps-title'}>{title}</Heading>
          {lead ? <p className="tm-ps-lead">{lead}</p> : null}
        </header>
        {children}
      </div>
    </section>
  );
}

/** 정직 고지 블록. alpha 에 없는 기능을 약속하지 않기 위한 경계를 페이지에 그대로 보여 준다. */
export function PublicHonestNote({
  title = '아직 지원하지 않는 것',
  items,
  as: Heading = 'h3',
}: {
  title?: string;
  items: readonly { readonly title: string; readonly body: string }[];
  as?: 'h2' | 'h3';
}) {
  return (
    <aside className="tm-ps-honest" aria-label={title}>
      <Heading className="tm-ps-honest-title">{title}</Heading>
      <ul className="tm-ps-honest-list">
        {items.map((item) => (
          <li key={item.title}>
            <strong>{item.title}</strong>
            <span>{item.body}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** 필터 결과 개수. 목록 전체가 아니라 이 한 줄만 스크린리더에 알린다. */
export function PublicResultCount({ count, noun = '질문' }: { count: number; noun?: string }) {
  return (
    <p className="tm-ps-count" role="status">
      {count > 0 ? `${noun} ${count}개` : '찾는 결과가 없어요'}
    </p>
  );
}

export function PublicUpdatedAt({ date }: { date: string }) {
  return (
    <p className="tm-ps-updated">
      마지막 업데이트 <time dateTime={date}>{formatTournamentDateLong(date)}</time>
    </p>
  );
}
