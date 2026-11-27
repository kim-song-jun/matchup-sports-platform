'use client';

import { Lock, Timer, TimerOff, Unlock } from 'lucide-react';
import { Button } from '@/components/v1-ui/button';
import {
  useV1RosterDeadlineOverrideGrant,
  useV1RosterDeadlineOverrideRevoke,
  useV1RosterLock,
  useV1RosterUnlock,
} from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminTournamentRegistration } from '@/types/api';
import type { ShowToast } from './registrations-model';
import { formatGenderQuotaError } from './tournament-detail-shared';

/**
 * 명단 잠금과 제출 마감 예외 — 「명단 보기」 창 안에서 그 명단을 보며 다룬다.
 * 보여 줄 조작이 없거나 쓰기 권한이 없으면 아무것도 그리지 않는다.
 */
export function RosterLockControls({
  registration,
  canWrite,
  rosterDeadlineAt,
  showToast,
}: {
  registration: V1AdminTournamentRegistration;
  canWrite: boolean;
  /** 명단 제출 마감. 없으면(리그) 마감 예외를 줄 이유가 없어 「마감 예외 허용」을 숨긴다. */
  rosterDeadlineAt: string | null;
  showToast: ShowToast;
}) {
  const rosterLock = useV1RosterLock();
  const rosterUnlock = useV1RosterUnlock();
  const overrideGrant = useV1RosterDeadlineOverrideGrant();
  const overrideRevoke = useV1RosterDeadlineOverrideRevoke();

  const isLocked = Boolean(registration.rosterLockedAt);
  const hasOverride = Boolean(registration.rosterDeadlineOverrideAt);
  const isConfirmed = registration.status === 'confirmed';
  // 잠금이 뜻을 갖는 건 명단이 아직 쓰일 수 있는 확정·취소 요청뿐이다. 서버 잠금 해제는 상태를 보지 않아
  // 종료된 신청에도 버튼을 두면 팀이 빠진 대회의 명단을 다시 열어 주는 것처럼 보인다.
  const canLock = canWrite && isConfirmed && !isLocked;
  const canUnlock = canWrite && isLocked && (isConfirmed || registration.status === 'cancel_requested');
  const canRevoke = canWrite && isConfirmed && hasOverride;
  const canGrant = canWrite && isConfirmed && !hasOverride && rosterDeadlineAt !== null;
  if (!canLock && !canUnlock && !canRevoke && !canGrant) return null;

  const handleLock = () => {
    rosterLock.mutate(
      { registrationId: registration.id },
      {
        onSuccess: () => showToast('명단을 잠갔어요.', 'success'),
        onError: (err) => {
          if (err instanceof V1ApiError && err.code === 'TOURNAMENT_GENDER_QUOTA_NOT_MET') {
            showToast(
              formatGenderQuotaError(err.details) ?? extractErrorMessage(err, '명단 잠금에 실패했어요.'),
              'error',
            );
            return;
          }
          showToast(extractErrorMessage(err, '명단 잠금에 실패했어요.'), 'error');
        },
      },
    );
  };

  const handleUnlock = () => {
    rosterUnlock.mutate(registration.id, {
      onSuccess: () => showToast('명단 잠금을 해제했어요.', 'success'),
      onError: (err) => showToast(extractErrorMessage(err, '명단 잠금 해제에 실패했어요.'), 'error'),
    });
  };

  const handleGrant = () => {
    // 예외 허용은 잠금과 무관하게 성공하지만 잠긴 명단은 여전히 못 고친다 — 서버가 잠금 검사를 마감 검사보다 먼저 본다.
    overrideGrant.mutate(registration.id, {
      onSuccess: () =>
        showToast(
          isLocked
            ? '명단 제출 마감 예외를 허용했어요. 다만 명단이 아직 잠겨 있어 팀이 수정하려면 잠금 해제도 함께 해야 해요.'
            : '명단 제출 마감 예외를 허용했어요.',
          'success',
        ),
      onError: (err) => showToast(extractErrorMessage(err, '마감 예외 허용에 실패했어요.'), 'error'),
    });
  };

  const handleRevoke = () => {
    overrideRevoke.mutate(registration.id, {
      onSuccess: () => showToast('예외를 해제했어요.', 'success'),
      onError: (err) => showToast(extractErrorMessage(err, '예외 해제에 실패했어요.'), 'error'),
    });
  };

  return (
    <div className="mt-4 rounded-xl border border-[var(--border)] p-3">
      <p className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-strong)]">명단 잠금</p>
      <p className="mt-0.5 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
        {isLocked ? '명단이 잠겨 있어요' : '명단이 아직 잠기지 않았어요'}
        {hasOverride ? ' · 제출 마감 예외를 허용했어요' : ''}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {canLock ? (
          <Button variant="outline" size="sm" onClick={handleLock} disabled={rosterLock.isPending}>
            <Lock size={14} aria-hidden="true" />
            명단 잠금
          </Button>
        ) : null}
        {canUnlock ? (
          <Button variant="outline" size="sm" onClick={handleUnlock} disabled={rosterUnlock.isPending}>
            <Unlock size={14} aria-hidden="true" />
            잠금 해제
          </Button>
        ) : null}
        {canRevoke ? (
          <Button variant="outline" size="sm" onClick={handleRevoke} disabled={overrideRevoke.isPending}>
            <TimerOff size={14} aria-hidden="true" />
            예외 해제
          </Button>
        ) : null}
        {canGrant ? (
          <Button variant="outline" size="sm" onClick={handleGrant} disabled={overrideGrant.isPending}>
            <Timer size={14} aria-hidden="true" />
            마감 예외 허용
          </Button>
        ) : null}
      </div>
    </div>
  );
}
