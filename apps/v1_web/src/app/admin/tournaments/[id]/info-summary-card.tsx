'use client';

import { Fragment, useId } from 'react';
import { Button } from '@/components/v1-ui/button';
import { InfoBadge } from './info-forms/form-kit';
import type { InfoSectionDefinition, InfoSummaryContext } from './info-forms/types';
import { TOURNAMENT_INFO_SECTION_META, type TournamentInfoSectionKey } from './info-sections';

/** 섹션 하나의 읽기 요약 — 입력칸은 없고, 고치는 길은 「수정」 하나다. */
export function InfoSummaryCard({
  definition,
  context,
  canWrite,
  onEdit,
}: {
  definition: InfoSectionDefinition;
  context: InfoSummaryContext;
  canWrite: boolean;
  onEdit: (key: TournamentInfoSectionKey) => void;
}) {
  const headingId = useId();
  const { title, description } = TOURNAMENT_INFO_SECTION_META[definition.key];

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="text-[length:var(--font-size-body)] font-bold text-[var(--text-strong)]">
            {title}
          </h2>
          <p className="mt-0.5 text-[length:var(--font-size-label)] text-[var(--text-muted)]">{description}</p>
        </div>
        {canWrite ? (
          <Button type="button" variant="neutral" size="sm" aria-label={`${title} 수정`} onClick={() => onEdit(definition.key)}>
            수정
          </Button>
        ) : null}
      </div>
      <dl className="mt-4 grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2.5 border-t border-[var(--border)] pt-3.5 sm:grid-cols-[112px_minmax(0,1fr)]">
        {definition.rows(context).map((row) => (
          <Fragment key={row.key}>
            <dt className="text-[length:var(--font-size-label)] leading-[22px] text-[var(--text-muted)]">{row.label}</dt>
            <dd className="m-0 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[length:var(--font-size-body-sm)] leading-[22px] text-[var(--text-strong)]">
              <span className="min-w-0 break-words">{row.value}</span>
              {row.badge ? <InfoBadge tone={row.badge.tone}>{row.badge.text}</InfoBadge> : null}
              {row.note ? (
                <span className="basis-full text-[length:var(--font-size-caption)] leading-[18px] text-[var(--text-muted)]">{row.note}</span>
              ) : null}
            </dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}
