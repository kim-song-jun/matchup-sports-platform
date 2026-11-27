'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ScopedLink as Link } from '@/components/providers/navigation-scope';
import { AlertTriangle, ArrowRight, CheckCircle2, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { AdminKpiCard, AdminKpiGridSkeleton } from '@/components/admin';
import { tournamentVisibilityHiddenReason } from '@/components/admin/tournaments/tournament-visibility-control';
import { useV1AdminTournament } from '@/hooks/use-v1-api';
import { isBracketPublished } from '@/lib/bracket-visibility';
import { extractErrorMessage } from '@/lib/error-message';
import { withFromPath } from '@/lib/session-storage';
import { formatDate, formatDateRange } from './tournament-admin-shared';
import { useTournamentAdmin } from './tournament-admin-context';
import { INFO_NEED_TIER_LABEL } from './info-sections';
import {
  buildTournamentSetupItems,
  resolveNextMilestone,
  type TournamentSetupItem,
} from './tournament-overview-model';

const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2';

/**
 * 대회 상세의 기본 진입 화면(M4-3). 편집은 하지 않는다 — 지금 상태가 어떤지, 무엇이
 * 비어 있는지, 어디로 가야 고치는지만 보여준다. 편집 진입점은 각 섹션이 갖는다.
 */
export function TournamentOverviewSection() {
  const { tournamentId, basePath: managementBasePath } = useTournamentAdmin();
  const { data: tournament, isPending, isError, error, refetch } = useV1AdminTournament(tournamentId);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // 처음 렌더에서만 잡아 둔다 — 주소에서 created 를 지운 뒤에도 같은 화면에 있는 동안은 안내가 남는다.
  const [justCreated] = useState(() => searchParams.get('created') === '1');
  const clearedCreated = useRef(false);

  useEffect(() => {
    if (!justCreated || clearedCreated.current) return;
    clearedCreated.current = true;
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete('created');
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [justCreated, pathname, router, searchParams]);

  if (isPending) return <AdminKpiGridSkeleton count={3} />;

  if (isError || !tournament) {
    return (
      <div className="p-4 bg-[var(--red50)] border border-[var(--tint-red-border)] rounded-xl flex items-center gap-3">
        <p className="text-sm text-[var(--red700)] flex-1">
          {extractErrorMessage(error, '대회 정보를 불러오지 못했어요.')}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className={`text-sm text-[var(--red700)] font-semibold underline underline-offset-2 min-h-[44px] px-2 rounded ${FOCUS_RING}`}
        >
          다시 시도
        </button>
      </div>
    );
  }

  const now = new Date();
  const milestone = resolveNextMilestone(tournament, now);
  const basePath = managementBasePath ?? `/admin/tournaments/${tournamentId}`;
  const items = buildTournamentSetupItems(tournament, now, basePath);
  const counts = tournament.operationCounts;
  const registrations = counts?.registrations ?? tournament.registrationCount;
  const fixtures = counts?.fixtures ?? 0;
  const announcements = counts?.announcements ?? 0;
  // 막 만든 초안은 세 숫자가 모두 0 이라 보여 줄 사실이 없다 — 줄째 감춘다.
  const showKpi = !(tournament.status === 'draft' && registrations === 0 && fixtures === 0 && announcements === 0);
  const bracketPublished = isBracketPublished(tournament.bracketPublishedAt, tournament.bracketPublishScheduledAt, now);

  return (
    <div className="tm-content-enter flex flex-col gap-6 break-keep">
      {justCreated && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl bg-[var(--blue50)] px-4 py-3 text-[length:var(--font-size-body-sm)] font-medium text-[var(--blue700)]"
        >
          <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />
          초안을 만들었어요. 접수를 시작하기 전까지 참가자에게 보이지 않아요.
        </p>
      )}

      {/* 요약 줄 — 상태는 머리의 칩이 말하므로 여기서는 「지금 무엇을 기다리는가」와 날짜 사실만 둔다 */}
      <section
        aria-label="대회 진행 상태"
        className={[
          'rounded-2xl border p-4 md:p-5 flex flex-col gap-2',
          milestone.overdue
            ? 'bg-[var(--tint-orange)] border-[var(--tint-orange-border)] tm-on-tint'
            : 'bg-[var(--card-surface)] border-[var(--border)]',
        ].join(' ')}
      >
        {milestone.overdue && (
          <span className="inline-flex items-center gap-1 self-start text-[length:var(--font-size-caption)] font-bold text-[var(--orange700)]">
            <AlertTriangle size={13} aria-hidden="true" />
            확인 필요
          </span>
        )}
        <p className="text-[length:var(--font-size-body)] font-bold text-[var(--text-strong)]">
          {milestone.headline}
        </p>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2 mt-1">
          <OverviewFact
            label="경기 일정"
            value={tournament.scheduledAt ? formatDateRange(tournament.scheduledAt, tournament.scheduledEndAt) : null}
          />
          <OverviewFact label="신청 마감" value={tournament.registrationDeadlineAt ? formatDate(tournament.registrationDeadlineAt) : null} />
          <OverviewFact label="명단 제출 마감" value={tournament.rosterDeadlineAt ? formatDate(tournament.rosterDeadlineAt) : null} />
        </dl>
      </section>

      {/* 규모 — 각 숫자에서 그 섹션으로 바로 간다 */}
      {showKpi && (
        <div className="grid grid-cols-3 gap-3">
          <AdminKpiCard
            label="신청 팀"
            value={registrations}
            sub={`정원 ${tournament.teamCount}팀`}
            href={`${basePath}/registrations`}
            ariaLabel={`신청 팀 ${registrations}팀, 신청 관리로 이동`}
          />
          <AdminKpiCard
            label="경기"
            value={fixtures}
            sub={fixtures === 0 ? '아직 없어요' : bracketPublished ? '대진표 공개' : '대진표 아직 비공개'}
            href={`${basePath}/bracket`}
            ariaLabel={`경기 ${fixtures}개, 대진 관리로 이동`}
          />
          <AdminKpiCard
            label="공지"
            value={announcements}
            sub={announcements === 0 ? '아직 없어요' : undefined}
            href={`${basePath}/announcements`}
            ariaLabel={`공지 ${announcements}건, 공지로 이동`}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <SetupCard items={items} isDraft={tournament.status === 'draft'} />
        <ParticipantScreenCard
          tournamentId={tournamentId}
          basePath={basePath}
          isPublic={tournament.isPublic ?? true}
          hiddenReason={tournamentVisibilityHiddenReason(tournament.status)}
        />
      </div>
    </div>
  );
}

function OverviewFact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline gap-2 sm:flex-col sm:gap-0.5">
      {/* 모바일은 라벨과 긴 날짜가 한 줄을 나눠 쓴다. 라벨이 줄어들면 단어 중간에서 접힌다. */}
      <dt className="shrink-0 text-[length:var(--font-size-caption)] text-[var(--text-caption)]">{label}</dt>
      <dd
        className={`text-[length:var(--font-size-body-sm)] ${value ? 'text-[var(--text-strong)]' : 'text-[var(--text-muted)]'}`}
      >
        {value ?? '아직 없어요'}
      </dd>
    </div>
  );
}

function SetupCard({ items, isDraft }: { items: TournamentSetupItem[]; isDraft: boolean }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 p-4 bg-[var(--green50)] border border-green-100 rounded-xl">
        <CheckCircle2 size={18} className="text-green-500 shrink-0" aria-hidden="true" />
        <p className="text-[length:var(--font-size-body-sm)] text-[var(--text-strong)]">
          비어 있는 설정이 없어요.
        </p>
      </div>
    );
  }

  const primaryKey = items.find((item) => item.tier === 'required')?.key;

  return (
    <section
      aria-label="채워야 할 설정"
      className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)]"
    >
      <div className="px-5 py-4 border-b border-[var(--border)]">
        <h2 className="text-[length:var(--font-size-body)] font-bold text-[var(--text-strong)]">
          채워야 할 설정 {items.length}건
        </h2>
        {isDraft && (
          <p className="mt-0.5 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
            접수를 시작하기 전에 확인해 주세요.
          </p>
        )}
      </div>
      <ul>
        {items.map((item) => (
          <li
            key={item.key}
            className="flex flex-col gap-2 px-5 py-3 border-b border-[var(--border)] last:border-b-0 sm:flex-row sm:items-center sm:gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[length:var(--font-size-label)] font-medium text-[var(--text-strong)]">{item.label}</p>
                <span className={`tm-badge tm-badge-sm ${item.tier === 'required' ? 'tm-badge-orange' : 'tm-badge-grey'}`}>
                  {INFO_NEED_TIER_LABEL[item.tier]}
                </span>
              </div>
              <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{item.detail}</p>
            </div>
            {item.key === primaryKey ? (
              <Link href={item.href} className={`tm-btn tm-btn-md tm-btn-primary shrink-0 self-start sm:self-center ${FOCUS_RING}`}>
                {item.actionLabel}
              </Link>
            ) : (
              <Link
                href={item.href}
                className={`shrink-0 inline-flex items-center gap-0.5 self-start sm:self-center min-h-[44px] px-2 text-[length:var(--font-size-label)] font-medium text-[var(--blue700)] hover:underline transition-colors rounded ${FOCUS_RING}`}
              >
                {item.actionLabel}
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ParticipantScreenCard({
  tournamentId,
  basePath,
  isPublic,
  hiddenReason,
}: {
  tournamentId: string;
  basePath: string;
  isPublic: boolean;
  hiddenReason: string | undefined;
}) {
  const badge = hiddenReason
    ? { label: '노출 안 됨', className: 'tm-badge-grey', icon: <EyeOff size={12} aria-hidden="true" /> }
    : isPublic
      ? { label: '공개 중', className: 'tm-badge-blue', icon: <Eye size={12} aria-hidden="true" /> }
      : { label: '비공개', className: 'tm-badge-grey', icon: <EyeOff size={12} aria-hidden="true" /> };

  return (
    <section
      aria-label="참가자 화면"
      className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[length:var(--font-size-body)] font-bold text-[var(--text-strong)]">참가자 화면</h2>
        <span className={`tm-badge tm-badge-sm inline-flex items-center gap-1 ${badge.className}`}>
          {badge.icon}
          {badge.label}
        </span>
      </div>
      <p className="text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">
        {hiddenReason ?? (isPublic ? '공개 대회 목록과 검색, 홈 화면에 보여요.' : '일반 사용자에게 숨겨져요.')}
      </p>
      <Link
        href={withFromPath(`/tournaments/${tournamentId}`, basePath)}
        className={`inline-flex items-center gap-2 self-start min-h-[44px] px-3 rounded-xl text-[length:var(--font-size-label)] font-medium text-[var(--blue700)] bg-[var(--blue50)] hover:bg-[var(--tint-blue)] transition-colors ${FOCUS_RING}`}
      >
        참가자에게 보이는 화면 열기
        <ExternalLink size={13} aria-hidden="true" />
      </Link>
    </section>
  );
}
