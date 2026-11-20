'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { AdminStatusPill } from './admin-status-pill';
import { SectionTitle } from '@/components/v1-ui/primitives';
import { useAdminOperations, useAdminOperationsContext, type AdminOperationSection } from '@/hooks/use-admin-entity-operations';
import { adminMissingItemLabel, adminOperationStatusLabel } from '@/lib/admin-labels';
import { formatAdminDateTime } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';

function OperationsList({ entity, id, section }: { entity: 'users' | 'teams'; id: string; section: AdminOperationSection }) {
  const [page, setPage] = useState(1);
  const query = useAdminOperations(entity, id, section, page);
  if (query.isPending) return <p role="status" className="py-4 text-[var(--text-muted)]">정보를 불러오는 중이에요.</p>;
  if (query.isError) return <div role="alert" className="py-4"><p>{extractErrorMessage(query.error, '운영 정보를 불러오지 못했어요.')}</p><button type="button" className="min-h-[44px] text-[var(--blue700)]" onClick={() => void query.refetch()}>다시 시도</button></div>;
  const { items, pageInfo } = query.data;
  return <>
    <p className="mt-3 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">전체 {pageInfo.total}건</p>
    {items.length === 0 ? <p className="py-4 text-[var(--text-muted)]">해당 기록이 없어요.</p> : <ul className="divide-y divide-[var(--border)]">
      {items.map((item) => <li key={item.id} className="py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          {item.href ? <Link className="min-h-[44px] min-w-0 break-words py-2 font-semibold text-[var(--blue700)]" href={item.href}>{item.title}</Link> : <span className="py-2 font-semibold">{item.title}</span>}
          <div className="flex flex-wrap items-center gap-2 py-2">
            {item.fromStatus ? <><AdminStatusPill status={item.fromStatus} label={adminOperationStatusLabel(item.fromStatus)} /><span aria-label="변경 후">→</span></> : null}
            <AdminStatusPill status={item.status} label={adminOperationStatusLabel(item.status)} />
          </div>
        </div>
        {item.description ? <p className="text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">{item.description}</p> : null}
        <p className="mt-1 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{formatAdminDateTime(item.at)}{item.actor ? ` · 처리자 ${item.actor}` : ''}</p>
        {item.reason ? <p className="mt-2 whitespace-pre-wrap break-words text-[length:var(--font-size-body-sm)]">사유: {item.reason}</p> : null}
      </li>)}
    </ul>}
    {page > 1 || pageInfo.hasNext ? <div className="mt-3 flex items-center justify-between gap-3">
      <button type="button" disabled={page === 1 || query.isFetching} className="min-h-[44px] px-3 disabled:opacity-50" onClick={() => setPage((value) => value - 1)}>이전</button>
      <span className="text-[length:var(--font-size-caption)]">{page}페이지</span>
      <button type="button" disabled={!pageInfo.hasNext || query.isFetching} className="min-h-[44px] px-3 disabled:opacity-50" onClick={() => setPage((value) => value + 1)}>다음</button>
    </div> : null}
  </>;
}

function OperationsSection({ entity, id, section, title }: { entity: 'users' | 'teams'; id: string; section: AdminOperationSection; title: string }) {
  const [open, setOpen] = useState(section === 'history');
  const panelId = useId();
  return <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4">
    <div className="flex items-center justify-between gap-3">
      <SectionTitle title={title} compact />
      <button type="button" aria-expanded={open} aria-controls={panelId} aria-label={`${title} ${open ? '접기' : '펼치기'}`}
        className="min-h-[44px] shrink-0 px-3 text-[var(--blue700)]" onClick={() => setOpen((value) => !value)}>{open ? '접기' : '펼치기'}</button>
    </div>
    <div id={panelId} hidden={!open}>{open ? <OperationsList entity={entity} id={id} section={section} /> : null}</div>
  </section>;
}

export function AdminEntityOperations({ entity, id }: { entity: 'users' | 'teams'; id: string }) {
  const context = useAdminOperationsContext(entity, id);
  const data = context.data;
  const sections: Array<[AdminOperationSection, string]> = [
    ['history', '상태 변경 이력'], ['inquiries', '관련 문의·신고'], ['upcoming', '예정 경기'],
    ['matches', entity === 'users' ? '개인 매치 참가 이력' : '주최·참가 경기 이력'], ['competitions', '대회·리그 참가 명단'],
    ...(entity === 'users' ? [['appearances', '공식 경기 출전 기록'] as [AdminOperationSection, string]] : []),
  ];
  return <section aria-label="운영 정보와 이력" className="flex min-w-0 flex-col gap-4">
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4">
      <SectionTitle title={entity === 'users' ? '가입·계정 확인' : '팀 운영 확인'} compact />
      {context.isPending ? <p className="mt-3" role="status">운영 요약을 불러오는 중이에요.</p> : null}
      {context.isError ? <div role="alert" className="mt-3"><p>{extractErrorMessage(context.error, '운영 요약을 불러오지 못했어요.')}</p><button type="button" className="min-h-[44px] text-[var(--blue700)]" onClick={() => void context.refetch()}>다시 시도</button></div> : null}
      {data?.kind === 'user' ? <div className="mt-3 flex flex-col gap-2 text-[length:var(--font-size-body-sm)]">
        <p>보완할 항목: {data.missingItems.length ? data.missingItems.map(adminMissingItemLabel).join(' · ') : '없음'}</p>
        <p>삭제 처리: {data.deletionFinalized ? '최종 삭제 완료 · 복구 불가' : '최종 삭제 전'}</p>
        {data.withdrawalScheduledAt ? <p>탈퇴 예정일: {formatAdminDateTime(data.withdrawalScheduledAt)}</p> : null}
      </div> : null}
      {data?.kind === 'team' ? <dl className="mt-3 grid gap-3 text-[length:var(--font-size-body-sm)] sm:grid-cols-2">
        <div><dt className="text-[var(--text-muted)]">팀장 계정 상태</dt><dd className="mt-1"><AdminStatusPill status={data.ownerAccountStatus} /></dd></div>
        <div><dt className="text-[var(--text-muted)]">팀장 최근 로그인</dt><dd className="mt-1">{formatAdminDateTime(data.ownerLastLoginAt)}</dd></div>
        <div><dt className="text-[var(--text-muted)]">가입 신청 대기</dt><dd className="mt-1">{data.pendingJoinCount}명</dd></div>
        <div><dt className="text-[var(--text-muted)]">최근 경기 활동일</dt><dd className="mt-1">{data.lastPlayedAt ? formatAdminDateTime(data.lastPlayedAt) : '완료된 경기 없음'}</dd></div>
      </dl> : null}
    </article>
    {sections.map(([section, title]) => <OperationsSection key={`${id}:${section}`} entity={entity} id={id} section={section} title={title} />)}
  </section>;
}
