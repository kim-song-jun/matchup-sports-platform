'use client';

import Link from 'next/link';
import { useId, useState, type ReactNode } from 'react';
import { Check, ChevronRight, Lock } from 'lucide-react';
import { Card, ErrorState } from '@/components/v1-ui/primitives';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { josa } from '@/lib/korean';
import type { TeamMatchDetailViewModel } from './team-matches.types';

/**
 * 팀매치 상세 맨 위 "지금 할 일" 카드(H6 A안). 같은 자리가 상태마다 바뀐다 —
 * 호스트: 신청 도착(승인·거절) / 신청 없음 / 목록 못 불러옴 · 신청 팀: 승인 대기 · 참가팀: 상대 확정 뒤 진행 체크리스트.
 */
type ApplicantTeam = TeamMatchDetailViewModel['match']['applicantTeams'][number];

/** 신청이 3팀 이상이면 일정·조건을 밀어내지 않게 2팀만 펼친다. */
const VISIBLE_APPLICANTS = 2;

const TONE = {
  blue: { background: 'var(--tint-blue)', border: 'var(--tint-blue-border)', badge: 'tm-badge-blue' },
  orange: { background: 'var(--tint-orange)', border: 'var(--tint-orange-border)', badge: 'tm-badge-orange' },
  green: { background: 'var(--tint-green)', border: 'var(--card-border)', badge: 'tm-badge-green' },
  grey: { background: 'var(--tint-grey)', border: 'var(--card-border)', badge: 'tm-badge-grey' },
} as const;

const INNER_BOX = {
  marginTop: 12,
  borderRadius: 'var(--radius-control)',
  background: 'var(--card-surface)',
  border: '1px solid var(--border)',
} as const;

function NowCard({ tone, badge, title, caption, children }: {
  tone: keyof typeof TONE;
  badge: string;
  title: string;
  caption?: string;
  children?: ReactNode;
}) {
  const titleId = useId();
  const color = TONE[tone];
  return (
    <section
      className="tm-card tm-on-tint"
      aria-labelledby={titleId}
      style={{ marginTop: 12, padding: 16, background: color.background, borderColor: color.border }}
    >
      <span className={`tm-badge ${color.badge}`}>{badge}</span>
      <h2 id={titleId} className="tm-text-body-lg" style={{ marginTop: 8 }}>{title}</h2>
      {caption ? <p className="tm-text-caption" style={{ marginTop: 2 }}>{caption}</p> : null}
      {children}
    </section>
  );
}

/** A-1 — 신청이 도착한 호스트. 승인·거절은 이 카드에서 끝난다(확인 창은 부모가 띄운다). */
export function HostApplicationsCard({ teams, error, onApprove, onReject }: {
  teams: ApplicantTeam[];
  error?: string | null;
  onApprove: (team: ApplicantTeam) => void;
  onReject: (team: ApplicantTeam) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? teams : teams.slice(0, VISIBLE_APPLICANTS);
  const hiddenCount = teams.length - visible.length;
  // 서버는 경기 시작 시각이 지나면 승인만 막고 거절은 계속 연다(canApprove·canReject) — 그때는 승인을 약속하지 않는다.
  const approvable = teams.some((team) => team.onApprove);
  return (
    <NowCard
      tone="blue"
      badge="지금 할 일"
      title={approvable ? `신청 ${teams.length}팀이 승인을 기다려요` : `신청 ${teams.length}팀이 대기 중이에요`}
      caption={!approvable
        ? '경기 시작 시각이 지나서 승인할 수 없어요. 거절하면 신청 팀에 알림이 가요.'
        : teams.length > 1 ? '한 팀을 승인하면 나머지 신청은 자동으로 종료돼요.' : '승인하면 이 팀과 경기가 확정돼요.'}
    >
      {error ? <p className="tm-text-micro" role="alert" style={{ marginTop: 8, color: 'var(--red700)' }}>{error}</p> : null}
      {visible.map((team) => (
        <ApplicantRow key={team.applicationId ?? team.name} team={team} onApprove={onApprove} onReject={onReject} />
      ))}
      {hiddenCount > 0 ? (
        <button
          className="tm-btn tm-btn-md tm-btn-ghost"
          type="button"
          style={{ width: '100%', marginTop: 8 }}
          onClick={() => setExpanded(true)}
        >
          신청 {hiddenCount}팀 더 보기
        </button>
      ) : null}
    </NowCard>
  );
}

function ApplicantRow({ team, onApprove, onReject }: {
  team: ApplicantTeam;
  onApprove: (team: ApplicantTeam) => void;
  onReject: (team: ApplicantTeam) => void;
}) {
  const identity = (
    <>
      <TeamAvatar seed={team.teamId ?? team.applicationId ?? team.name} name={team.name} logoUrl={team.logoUrl} size="md" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{team.name}</div>
        {team.meta ? <div className="tm-text-micro" style={{ marginTop: 2, color: 'var(--text-caption)' }}>{team.meta}</div> : null}
      </div>
    </>
  );
  const appliedLine = [team.appliedByName, team.appliedAtLabel ? `${team.appliedAtLabel} 신청` : null].filter(Boolean).join(' · ');
  return (
    <div style={{ ...INNER_BOX, padding: 12 }}>
      {team.href ? (
        <Link className="tm-pressable" href={team.href} aria-label={`${team.name} 팀 보기`} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44 }}>
          {identity}
          <ChevronRight size={18} aria-hidden="true" style={{ color: 'var(--text-caption)', flexShrink: 0 }} />
        </Link>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44 }}>{identity}</div>
      )}
      {appliedLine ? <div className="tm-text-micro" style={{ marginTop: 8, color: 'var(--text-caption)' }}>{appliedLine}</div> : null}
      {team.message ? <p className="tm-text-caption" style={{ marginTop: 6, color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>“{team.message}”</p> : null}
      {team.onApprove || team.onReject ? (
        // 같은 종류의 결정 행은 행마다 승인=주 버튼(DESIGN.md §14 예외). 거절은 글자 버튼으로 낮춘다.
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {team.onReject ? (
            <button
              className="tm-btn tm-btn-md tm-btn-ghost"
              type="button"
              style={{ flex: 'none', padding: '0 20px', color: 'var(--text-muted)' }}
              disabled={team.actionPending}
              aria-label={`${team.name} 신청 거절`}
              onClick={() => onReject(team)}
            >
              거절
            </button>
          ) : null}
          {team.onApprove ? (
            <button
              className="tm-btn tm-btn-md tm-btn-primary"
              type="button"
              style={{ flex: 1 }}
              disabled={team.actionPending}
              aria-label={`${team.name} 신청 승인`}
              onClick={() => onApprove(team)}
            >
              {team.actionPending ? '처리 중' : '승인'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** 신청이 없는 호스트 — 모집 상태만 말한다. `apiStatus` 는 화면 기준 상태(displayState)다. */
export function HostWaitingCard({ apiStatus }: { apiStatus?: string }) {
  if (apiStatus === 'closed') {
    return <NowCard tone="grey" badge="모집 마감" title="모집을 마감했어요" caption="지금은 신청을 받지 않아요." />;
  }
  if (apiStatus === 'expired') {
    return <NowCard tone="grey" badge="모집 종료" title="상대팀 없이 경기 시간이 지났어요" caption="이 팀매치는 더 이상 신청을 받지 않아요." />;
  }
  // 상대가 정해진 뒤는 진행 카드가 이 자리를 쓴다 — 그 데이터가 오기 전에 "신청 없음"을 말하지 않는다.
  if (apiStatus !== 'recruiting') return null;
  return (
    <NowCard
      tone="grey"
      badge="모집 중"
      title="아직 신청한 팀이 없어요"
      caption="신청이 오면 알림으로 알려드리고, 여기서 바로 승인할 수 있어요."
    />
  );
}

/** 신청 목록을 못 받은 호스트 — 0건과 구별한다. 대기 신청이 있을 수 있어 다시 불러오게 한다. */
export function HostApplicationsErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <Card pad={0} style={{ marginTop: 12 }}>
      <ErrorState
        title="신청 목록을 불러오지 못했어요"
        message="대기 중인 신청이 있을 수 있어요. 다시 불러와서 확인해 주세요."
        onRetry={onRetry}
        retryLabel="다시 불러오기"
      />
    </Card>
  );
}

/** A-2 — 신청한 팀(승인 대기). 무엇을 기다리는지와 승인되면 무엇이 열리는지를 말한다. */
export function PendingApplicationCard({ hostTeamName, team }: {
  hostTeamName: string;
  team?: { teamId: string; name: string; logoUrl?: string | null } | null;
}) {
  return (
    <NowCard
      tone="orange"
      badge="승인 대기"
      title="신청을 접수했어요"
      caption={`${josa(hostTeamName, ['이', '가'])} 검토하고 있어요. 결과는 알림으로 알려드려요.`}
    >
      <div style={{ ...INNER_BOX, padding: '4px 12px' }}>
        {team ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56 }}>
            <TeamAvatar seed={team.teamId} name={team.name} logoUrl={team.logoUrl} size="md" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{team.name}</div>
              <div className="tm-text-micro" style={{ marginTop: 2, color: 'var(--text-caption)' }}>우리 팀으로 신청했어요</div>
            </div>
          </div>
        ) : null}
        <p className="tm-text-caption" style={{ padding: '8px 0 10px', borderTop: team ? '1px solid var(--border)' : undefined, color: 'var(--text-muted)' }}>
          홈팀이 승인하면 채팅과 참석명단이 열려요.
        </p>
      </div>
    </NowCard>
  );
}

type ProgressStep = { key: string; label: string; done: boolean; status: string | null; href?: string; detail?: ReactNode };

/**
 * A-3 — 상대가 정해진 뒤 참가팀이 보는 진행 체크리스트. 예전 "매치 관리" 카드(명단·결과·후기 입구)를
 * 합친 자리라 각 단계 행이 그 화면으로 가는 링크다. 결과 행은 경기가 시작되기 전엔 열지 않는다.
 */
export function MatchProgressCard({ model }: { model: TeamMatchDetailViewModel }) {
  const progress = model.progress;
  if (!progress) return null;
  const completed = model.match.apiStatus === 'completed';
  const matchPhase = model.statusLabelKind === 'match';
  const lineup = model.lineupAction;
  const opponent = josa(progress.opponentName, ['과', '와']);
  const steps: ProgressStep[] = [
    { key: 'opponent', label: '상대팀 확정', done: true, status: progress.confirmedAtLabel },
  ];
  if (lineup?.kind === 'attendance') {
    const submitted = progress.lineupSubmitted;
    const ownCount = progress.attendance?.ownCount ?? null;
    steps.push({
      key: 'lineup',
      label: '참석명단 제출',
      done: submitted === true,
      status: submitted === null ? null : submitted ? (ownCount === null ? '제출 완료' : `제출 완료 · ${ownCount}명`) : '제출 전',
      href: lineup.href,
      detail: progress.attendance?.opponent ? <OpponentLineupLine opponent={progress.attendance.opponent} /> : null,
    });
  } else if (lineup) {
    // 리그 경기 명단은 참가 명단에서 계산돼 이미 채워져 있다 — 빠지는 선수만 조정한다(Task 179).
    steps.push({ key: 'lineup', label: '경기 명단', done: true, status: '참가 명단 기준', href: lineup.href });
  }
  const resultOpen = completed || matchPhase;
  steps.push({
    key: 'result',
    label: '경기 결과 기록',
    done: completed,
    status: resultOpen && model.resultAction ? model.resultAction.label : completed ? '경기 종료' : '경기 후에 열려요',
    href: resultOpen ? model.resultAction?.href : undefined,
  });
  if (model.reviewAction) steps.push({ key: 'review', label: '후기', done: false, status: model.reviewAction.label, href: model.reviewAction.href });

  const chatReady = Boolean(model.onChat);
  const caption = completed
    ? (model.reviewAction ? '결과를 확인하고 후기를 남겨요.' : '경기 결과를 확인해요.')
    : lineup?.kind === 'attendance' && chatReady
      ? '경기 전에 참석명단을 내고, 채팅으로 준비 사항을 맞춰요.'
      : lineup && chatReady
        ? '경기 전에 경기 명단을 확인하고, 채팅으로 준비 사항을 맞춰요.'
        : '경기 날짜와 장소를 다시 확인해요.';

  // 두 팀은 히어로가 이미 말한다 — 여기서는 단계 행만 평평하게 둔다(상자 속 상자 없음).
  return (
    <section aria-label={completed ? `${opponent} 경기했어요` : `${opponent} 경기해요`} style={{ marginTop: 12 }}>
      <span className={`tm-badge ${completed ? 'tm-badge-grey' : 'tm-badge-green'}`}>
        {completed ? '경기 종료' : matchPhase ? model.statusLabel ?? '진행 중' : '상대팀 확정'}
      </span>
      <p className="tm-text-caption" style={{ marginTop: 8, color: 'var(--text-muted)' }}>{caption}</p>
      <ol style={{ listStyle: 'none', padding: 0, marginTop: 4 }}>
        {steps.map((step, index) => (
          <li key={step.key} style={index > 0 ? { borderTop: '1px solid var(--border)' } : undefined}>
            {step.href ? (
              <Link className="tm-pressable" href={step.href} style={STEP_ROW}>
                <StepContent step={step} />
                <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--text-caption)', flexShrink: 0 }} />
              </Link>
            ) : (
              <div style={STEP_ROW}><StepContent step={step} /></div>
            )}
            {step.detail}
          </li>
        ))}
      </ol>
      {progress.lockNote && !completed ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12, color: 'var(--text-muted)' }}>
          <Lock size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
          <p className="tm-text-caption">{progress.lockNote}</p>
        </div>
      ) : null}
    </section>
  );
}

const STEP_ROW = { display: 'flex', alignItems: 'center', gap: 12, minHeight: 44 } as const;

function StepContent({ step }: { step: ProgressStep }) {
  return (
    <>
      {step.done ? (
        <span aria-hidden="true" style={{ display: 'inline-flex', width: 20, height: 20, flexShrink: 0, borderRadius: 'var(--radius-pill)', background: 'var(--green500)', color: 'var(--static-white)', alignItems: 'center', justifyContent: 'center' }}>
          <Check size={12} strokeWidth={3} />
        </span>
      ) : (
        <span aria-hidden="true" style={{ display: 'inline-block', width: 20, height: 20, flexShrink: 0, borderRadius: 'var(--radius-pill)', border: '2px solid var(--grey300)' }} />
      )}
      <span className="tm-text-label" style={{ flex: 1, minWidth: 0, color: 'var(--text-strong)' }}>
        {step.done ? <span className="sr-only">완료: </span> : null}
        {step.label}
      </span>
      {step.status ? <span className="tm-text-micro" style={{ color: 'var(--text-caption)', textAlign: 'right' }}>{step.status}</span> : null}
    </>
  );
}

type OpponentLineup = NonNullable<NonNullable<NonNullable<TeamMatchDetailViewModel['progress']>['attendance']>['opponent']>;

/** 참석명단 칸 아래 상대 명단 줄 — 우리 제출 여부는 위 칸이 말하므로 여기선 상대만(H5 D-1). */
function OpponentLineupLine({ opponent }: { opponent: OpponentLineup }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 32, paddingBottom: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>상대</span>
          <span className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{opponent.name}</span>
          <span className={`tm-badge tm-badge-sm tm-badge-${opponent.badge.tone}`}>{opponent.badge.label}</span>
        </div>
        <p className="tm-text-caption" style={{ marginTop: 2, color: 'var(--text-muted)', lineHeight: 1.5 }}>{opponent.note}</p>
      </div>
      {opponent.viewHref ? (
        <Link
          className="tm-btn tm-btn-sm tm-btn-outline"
          href={opponent.viewHref}
          aria-label="상대 참석명단 보기"
          style={{ flexShrink: 0, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
        >
          보기
        </Link>
      ) : null}
    </div>
  );
}
