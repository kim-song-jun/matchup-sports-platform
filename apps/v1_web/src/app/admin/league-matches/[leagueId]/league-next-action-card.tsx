'use client';

import Link from 'next/link';
import { ArrowRight, ClipboardCheck, Radio, CalendarClock } from 'lucide-react';
import { formatKstDateShort, formatKstTime } from '@/lib/date-utils';
import type { LeagueNextAction } from '@/lib/league-next-action';

const CARD_COPY = {
  confirm: { icon: ClipboardCheck, cta: '콘솔에서 확정하기' },
  live: { icon: Radio, cta: '콘솔 열기' },
  next: { icon: CalendarClock, cta: '다음 경기 콘솔 열기' },
} as const;

/**
 * 리그 상세 맨 위의 "지금 할 일" 한 장. 운영자는 예전에 리그 상세 → 결과 입력 → 빈 결과 검토 →
 * 운영 보드 → 운영 콘솔로 헛걸음했다. 이 카드가 상태에 따라 하나만 골라 곧장 콘솔로 보낸다.
 * 무엇이 다음인지의 판정은 `pickLeagueNextAction`이 하고, 이 컴포넌트는 그리기만 한다.
 */
export function LeagueNextActionCard({
  action,
  leagueId,
  matchupLabel,
}: {
  action: LeagueNextAction;
  leagueId: string;
  /** "홈팀 vs 원정팀" — 팀 이름은 화면이 참가팀 목록으로 풀어 준다. */
  matchupLabel: string;
}) {
  const { icon: Icon, cta } = CARD_COPY[action.kind];
  const { fixture } = action;
  const when = `${formatKstDateShort(fixture.startAt)} ${formatKstTime(fixture.startAt)}`;
  const headline =
    action.kind === 'confirm'
      ? action.pendingCount > 1
        ? `결과 확정을 기다리는 경기가 ${action.pendingCount}개예요 · ${matchupLabel}부터 확정해 주세요`
        : `${matchupLabel} 경기가 끝났어요 · 결과를 확정해 주세요`
      : action.kind === 'live'
        ? `${matchupLabel} 경기가 진행 중이에요`
        : `다음 경기는 ${matchupLabel}예요`;
  const detail =
    action.kind === 'confirm'
      ? '확정하면 순위표와 전적에 반영돼요.'
      : action.kind === 'live'
        ? '콘솔에서 골·카드를 기록하고 경기를 마칠 수 있어요.'
        : `${fixture.title} · ${when} — 킥오프 전에 콘솔에서 도착 확인을 해 주세요.`;

  return (
    <section
      aria-label="지금 할 일"
      className="tm-card mb-5 flex flex-wrap items-center gap-4"
      style={{ padding: '16px 20px' }}
    >
      <span
        aria-hidden="true"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--blue50)] text-[var(--blue700)]"
      >
        <Icon size={20} />
      </span>
      <div className="min-w-0 flex-1 basis-[240px]">
        <p className="text-[length:var(--font-size-caption)] font-semibold text-[var(--blue700)]">지금 할 일</p>
        <p className="mt-0.5 text-[length:var(--font-size-body-sm)] font-bold text-[var(--text-strong)]">{headline}</p>
        <p className="mt-0.5 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{detail}</p>
      </div>
      <Link
        href={`/admin/live/${encodeURIComponent(leagueId)}/fixtures/${encodeURIComponent(fixture.teamMatchId)}/operate`}
        className="tm-btn tm-btn-md tm-btn-primary whitespace-nowrap"
      >
        {cta}
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </section>
  );
}
