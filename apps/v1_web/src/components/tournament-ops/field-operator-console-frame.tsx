'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { staffRoleLabel } from './badges';

/**
 * 필드 담당자(FIELD_OPERATOR)가 딥링크로 들어온 경기 콘솔의 최소 크롬.
 *
 * `TournamentOpsShell`을 쓰지 않는다: 셸의 내비게이션(운영 보드·결과 검토·스태프)은 전부
 * 대회 전역 화면이라 이 역할이 열면 403이 난다 — 누르면 막히는 링크를 만들지 않는 것이
 * 이 저장소의 원칙(D-16)이다. 대신 지금 어느 대회에 있는지와 돌아갈 곳(내 대회 운영)만
 * 남긴다.
 */
export function FieldOperatorConsoleFrame({
  children,
  tournamentTitle,
}: {
  children: ReactNode;
  tournamentTitle?: string;
}) {
  return (
    <div className="min-h-screen bg-[var(--surface-soft)] flex flex-col">
      <header className="sticky top-0 z-20 bg-[var(--card-surface)] border-b border-[var(--border)] min-h-[52px] flex items-center gap-2 px-2">
        <Link
          href="/tournament-ops"
          aria-label="내 대회 운영으로 돌아가기"
          className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-body)] hover:bg-[var(--surface-soft)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </Link>
        <div className="flex-1 min-w-0 flex flex-col">
          <span className="text-[var(--font-size-body-sm)] font-bold text-[var(--text-strong)] truncate">
            {tournamentTitle ?? '대회 운영'}
          </span>
          <span className="text-[var(--font-size-caption)] font-semibold text-[var(--blue700)] bg-[var(--blue50)] rounded-full px-1.5 py-0.5 w-fit">
            {staffRoleLabel('FIELD_OPERATOR')}
          </span>
        </div>
      </header>
      <main className="flex-1 px-4 md:px-6 lg:px-8 py-5 md:py-6">
        <div className="max-w-[1200px] mx-auto w-full">{children}</div>
      </main>
    </div>
  );
}
