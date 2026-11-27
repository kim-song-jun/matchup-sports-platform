'use client';

import { useId, useState } from 'react';
import { Globe } from 'lucide-react';
import { Button } from '@/components/v1-ui/button';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { AlertBanner } from '@/components/v1-ui/primitives';
import { SideSheet } from '@/components/v1-ui/side-sheet';
import { useV1PublishTournamentBracket, useV1UnpublishTournamentBracket } from '@/hooks/use-v1-api';
import { isBracketPublished } from '@/lib/bracket-visibility';
import { formatAdminKstDateTime } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { kstDatetimeLocalToIso } from '@/lib/kst-calendar';
import { KNOCKOUT_PHASES, tournamentRoundLabel } from '@/lib/tournament-round-label';
import type { V1AdminBracketFixture, V1AdminBracketGroup, V1TournamentStatus } from '@/types/api';

/** 접수가 끝났는지 — 마감 시각이 지났거나, 마감 시각 전이라도 접수를 수동으로 닫은 상태. */
export function isRegistrationClosed(status: V1TournamentStatus | undefined, deadlineAt: string | null | undefined, now: number = Date.now()): boolean {
  if (status !== undefined && status !== 'draft' && status !== 'open') return true;
  return deadlineAt ? new Date(deadlineAt).getTime() < now : false;
}

/** 공개 시트 머리의 한 줄 요약 — 예: '조별리그 2개 조 · 4강 · 결승, 15경기'. */
export function summarizeBracket(groups: readonly V1AdminBracketGroup[], fixtures: readonly V1AdminBracketFixture[]): string {
  const groupCount = groups.filter(group => group.phase === 'group').length;
  const stages = KNOCKOUT_PHASES.filter(phase => groups.some(group => group.phase === phase)).map(phase => tournamentRoundLabel(phase));
  const parts = [...(groupCount > 0 ? [`조별리그 ${groupCount}개 조`] : []), ...stages];
  return `${parts.join(' · ')}, ${fixtures.length}경기`;
}

export interface BracketPublishControlProps {
  tournamentId: string;
  canWrite: boolean;
  /** inline = 데스크톱 도구 줄, bar = 폰 아래 고정 막대. */
  layout: 'inline' | 'bar';
  bracketPublishedAt: string | null | undefined;
  bracketPublishScheduledAt: string | null | undefined;
  registrationDeadlineAt: string | null | undefined;
  tournamentStatus?: V1TournamentStatus;
  hasGroups: boolean;
  summary: string;
  showToast: (message: string, variant?: 'success' | 'error') => void;
}

type PublishMode = 'now' | 'scheduled';

export function BracketPublishControl({
  tournamentId, canWrite, layout, bracketPublishedAt, bracketPublishScheduledAt, registrationDeadlineAt, tournamentStatus, hasGroups, summary, showToast,
}: BracketPublishControlProps) {
  const publish = useV1PublishTournamentBracket(tournamentId);
  const unpublish = useV1UnpublishTournamentBracket(tournamentId);
  const { confirm, ConfirmModal } = useConfirm();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PublishMode>('now');
  const [scheduleInput, setScheduleInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  // 예약 시각이 지나면 서버는 공개로 판정하지만 bracketPublishedAt 은 null 로 남는다.
  const published = isBracketPublished(bracketPublishedAt, bracketPublishScheduledAt);
  const scheduled = !!bracketPublishScheduledAt && !published;
  const settings = published || scheduled;
  const blockedReason = hasGroups ? null : '조를 먼저 만들어야 공개할 수 있어요.';
  const closedRegistration = isRegistrationClosed(tournamentStatus, registrationDeadlineAt);
  const pending = publish.isPending || unpublish.isPending;
  const publishedWhen = formatAdminKstDateTime(bracketPublishedAt ?? bracketPublishScheduledAt ?? null);
  const scheduledWhen = formatAdminKstDateTime(bracketPublishScheduledAt ?? null);
  const statusText = published ? '공개 중' : scheduled ? `공개 예약됨 · ${scheduledWhen}` : '비공개';

  const close = () => { if (!pending) { setOpen(false); setError(null); } };
  const openSheet = () => { setMode('now'); setScheduleInput(''); setError(null); setOpen(true); };

  const runPublish = (scheduledAt?: string) => {
    setError(null);
    publish.mutate(scheduledAt ? { scheduledAt } : undefined, {
      onSuccess: (result) => {
        showToast(result.alreadyPublished ? '이미 공개된 대진표예요.'
          : result.bracketPublishScheduledAt ? `${formatAdminKstDateTime(result.bracketPublishScheduledAt)}에 공개되도록 예약했어요.` : '대진표를 공개했어요.', 'success');
        setOpen(false);
      },
      onError: (err) => setError(extractErrorMessage(err, '대진표 공개에 실패했어요.')),
    });
  };

  const submit = () => {
    if (blockedReason) return;
    if (mode === 'now') { runPublish(); return; }
    if (!scheduleInput) { setError('공개 시각을 정해 주세요.'); return; }
    // datetime-local 은 시간대 없는 KST 벽시계 문자열이다 — 기기 시간대로 읽지 않고 +09:00 을 고정한다.
    const iso = kstDatetimeLocalToIso(scheduleInput);
    if (!iso) { setError('공개 시각을 다시 확인해 주세요.'); return; }
    if (new Date(iso).getTime() <= Date.now()) { setError('공개 예약 시각은 현재 시각 이후여야 해요.'); return; }
    runPublish(iso);
  };

  const revert = async () => {
    const ok = await confirm({
      title: published ? '대진표 공개 취소' : '공개 예약 취소',
      message: published
        ? '대진표를 다시 비공개로 되돌려요. 공개 페이지에서는 대진표가 보이지 않고 준비 중 안내만 남아요. 이미 대진표를 본 참가자의 기억까지 되돌릴 수는 없어요.'
        : '예약된 공개를 취소해요. 대진표는 계속 비공개로 남아요.',
      confirmLabel: published ? '비공개로 되돌리기' : '예약 취소',
      tone: 'danger',
    });
    if (!ok) return;
    setError(null);
    unpublish.mutate(undefined, {
      onSuccess: (result) => {
        showToast(result.alreadyUnpublished ? '이미 비공개 상태예요.' : '대진표를 비공개로 되돌렸어요.', 'success');
        setOpen(false);
      },
      onError: (err) => setError(extractErrorMessage(err, '공개 취소에 실패했어요.')),
    });
  };

  const trigger = canWrite ? (
    <Button variant={settings ? 'outline' : 'primary'} size="md" disabled={!settings && blockedReason !== null} onClick={openSheet}>
      {settings ? '공개 설정' : '대진 공개'}
    </Button>
  ) : null;
  const badge = (
    <span className={`tm-badge tm-badge-sm ${published ? 'tm-badge-green' : scheduled ? 'tm-badge-blue' : 'tm-badge-grey'}`} style={{ gap: 4 }}>
      <Globe size={12} strokeWidth={2.2} aria-hidden="true" />
      {statusText}
    </span>
  );
  const reason = canWrite && !settings && blockedReason ? <p className="tm-text-caption text-[var(--text-muted)]">{blockedReason}</p> : null;

  const sheetBody = settings ? (
    <div className="flex flex-col gap-4">
      <p className="tm-text-body">
        {published
          ? `${publishedWhen}에 공개됨 — 참가팀·방문자가 조·일정·대진표를 볼 수 있어요.`
          : `${scheduledWhen}에 자동 공개돼요. 그 전까지는 계속 고칠 수 있어요.`}
      </p>
      {error ? <p role="alert" className="tm-text-caption text-[var(--red700)]">{error}</p> : null}
    </div>
  ) : (
    <div className="flex flex-col gap-4">
      <p className="tm-text-label text-[var(--text-muted)]">{summary}</p>
      {!closedRegistration ? <AlertBanner tone="warning" message="접수 마감 전이에요. 그래도 공개할까요?" /> : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">공개 방법</legend>
        {([
          ['now', '지금 공개', '참가팀·방문자가 조·일정·대진을 바로 볼 수 있어요.'],
          ['scheduled', '시각 정해 공개', '정한 시각에 자동으로 공개돼요. 그 전까지는 계속 고칠 수 있어요.'],
        ] as const).map(([value, title, description]) => (
          <label key={value} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] p-3 has-[:checked]:border-[var(--blue500)] has-[:checked]:bg-[var(--blue50)]">
            <input type="radio" name={`${id}-mode`} className="mt-1" checked={mode === value} disabled={pending} onChange={() => { setMode(value); setError(null); }} />
            <span className="tm-text-label"><strong>{title}</strong> — {description}</span>
          </label>
        ))}
      </fieldset>
      {mode === 'scheduled' ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-at`} className="tm-text-label">공개 시각</label>
          <input id={`${id}-at`} type="datetime-local" className="tm-input" value={scheduleInput} disabled={pending}
            onChange={event => { setScheduleInput(event.target.value); setError(null); }} />
        </div>
      ) : null}
      <p className="tm-text-caption text-[var(--text-muted)]">공개를 되돌릴 수는 있지만, 이미 본 참가자에게서 되돌릴 수는 없어요.</p>
      {error ? <p role="alert" className="tm-text-caption text-[var(--red700)]">{error}</p> : null}
    </div>
  );
  const sheetFooter = settings ? (
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={close} disabled={pending}>닫기</Button>
      <Button variant="danger" onClick={() => void revert()} loading={unpublish.isPending} disabled={pending}>{published ? '비공개로 되돌리기' : '예약 취소'}</Button>
    </div>
  ) : (
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={close} disabled={pending}>닫기</Button>
      <Button variant="primary" onClick={submit} loading={publish.isPending} disabled={pending}>{mode === 'now' ? '지금 공개' : '예약하기'}</Button>
    </div>
  );

  const sheet = canWrite ? (
    <SideSheet open={open} title={settings ? '공개 설정' : '대진을 공개할까요?'} onClose={close} footer={sheetFooter}>{sheetBody}</SideSheet>
  ) : null;

  if (layout === 'bar') {
    return (
      <div className="sticky z-10 flex flex-col gap-1 border-t border-[var(--border)] bg-[var(--card-surface)] px-4 py-3"
        style={{ bottom: 'var(--v1-shell-safe-bottom, 0px)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            {badge}
            {!settings ? <span className="tm-text-caption text-[var(--text-muted)]">참가자에게 아직 대진이 안 보여요</span> : null}
          </div>
          {trigger}
        </div>
        {reason}
        {sheet}
        {ConfirmModal}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {badge}
      {trigger}
      {reason}
      {sheet}
      {ConfirmModal}
    </div>
  );
}
