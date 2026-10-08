'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { AdminPageHeader, AdminToasts, useAdminToast } from '@/components/admin';
import { RegistrationsTab } from '@/app/admin/tournaments/[id]/registrations-tab';
import { ConfirmModal } from '@/components/v1-ui/confirm-modal';
import { useV1AdminLeagueMatch, useV1OpenLeagueRegistration, useV1UpdateLeagueEntryFee } from '@/hooks/use-v1-api';
import { formatTournamentDateTimeLong } from '@/lib/date-utils';
import { describeLeagueRegistrationWindow } from '@/lib/league-registration-copy';
import { deriveRegistrationSetupSteps, DEADLINE_PRESET_DAYS, presetDeadlineIso } from '@/lib/league-registration-setup';
import { extractErrorMessage } from '@/lib/error-message';
import { kstDatetimeLocalToIso } from '@/lib/kst-calendar';
import type { V1UpdateLeagueEntryFeePayload } from '@/types/league-match';
import { LeagueFeeCard } from './league-fee-card';

type DeadlinePreset = (typeof DEADLINE_PRESET_DAYS)[number] | 'custom';

/**
 * 리그 참가 신청 관리 — **신청 열기(마감 지정) + 신청 목록**. 사용자 A안(Task 164 FE-3).
 *
 * ## 왜 별도 화면인가
 * 리그 대진 화면(`league-match-fixtures-client.tsx`)은 이미 1,400줄이 넘고 관심사가 대진이다.
 * 목록으로 쓰는 대회 `RegistrationsTab` 은 훅을 여덟 개 넘게 써서, 대진 화면에 인라인으로
 * 넣으면 그 화면의 기존 테스트가 전부 그 훅들을 목킹해야 한다(실제로 30건이 깨졌다).
 *
 * ## 목록을 재사용해도 되는 이유
 * 어드민 신청 API 는 이미 리그를 받는다(`ALL_COMPETITION_KINDS`) — 명단 표면과 달리 여긴
 * 처음부터 막혀 있지 않았다. 그래서 리그 id 를 그대로 넘기면 된다.
 *
 * ## 없던 것은 "신청을 여는 화면" 이었다
 * BE 는 `POST /admin/league-matches/:leagueId/open-registration` 을 갖고 있었는데 그걸 부르는
 * 프론트 코드가 **0건**이라(2026-09-04 실측), 리그 신청을 여는 방법이 API 직접 호출뿐이었다.
 */
export default function LeagueRegistrationsClient({ leagueId }: { leagueId: string }) {
  const { toasts, showToast } = useAdminToast();
  const { data: league } = useV1AdminLeagueMatch(leagueId);
  const [deadline, setDeadline] = useState('');
  const [preset, setPreset] = useState<DeadlinePreset | null>(null);
  const [presetIso, setPresetIso] = useState<string | null>(null);
  const [pendingOpenIso, setPendingOpenIso] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const openRegistration = useV1OpenLeagueRegistration(leagueId);
  const updateFee = useV1UpdateLeagueEntryFee(leagueId);

  const state = league?.state ?? 'draft';
  const registrationOpen = league?.registrationOpen ?? false;
  const registrationDeadlineAt = league?.registrationDeadlineAt ?? null;
  const canChangeDeadline = state !== 'completed';
  const inheritedFee = league !== undefined && league.entryFeeConfiguredAt === null && league.entryFee > 0;
  const executeLabel = registrationOpen ? '마감 변경' : registrationDeadlineAt === null ? '신청 열기' : '다시 열기';

  const openWith = (iso: string) => {
    openRegistration.mutate(
      { registrationDeadlineAt: iso },
      {
        onSuccess: () => {
          setPreset(null);
          setPresetIso(null);
          showToast('참가 신청을 열었어요.', 'success');
        },
        onError: (error) => showToast(extractErrorMessage(error, '참가 신청을 열지 못했어요.'), 'error'),
      },
    );
  };

  // 참가비를 확정하지 않은 리그를 여는 순간은 확인을 한 번 받는다 — 서버는 막지 않는다.
  const execute = (iso: string) => {
    if (!registrationOpen && league !== undefined && league.entryFeeConfiguredAt === null) {
      setPendingOpenIso(iso);
      return;
    }
    openWith(iso);
  };

  const cancelOpen = () => {
    setPendingOpenIso(null);
    setFocusRequest((n) => n + 1);
  };

  const confirmOpen = async () => {
    const iso = pendingOpenIso;
    if (iso === null || league === undefined) return;
    setPendingOpenIso(null);
    // 이어받은 금액은 그대로 확정하고, 없던 값은 0원(무료)으로 확정한다. 확정이 실패하면 열지 않는다.
    const payload: V1UpdateLeagueEntryFeePayload = { entryFee: inheritedFee ? league.entryFee : 0 };
    if (inheritedFee) {
      if (league.bankName) payload.bankName = league.bankName;
      if (league.bankAccount) payload.bankAccount = league.bankAccount;
      if (league.bankHolder) payload.bankHolder = league.bankHolder;
    }
    try {
      await updateFee.mutateAsync(payload);
    } catch (error) {
      showToast(extractErrorMessage(error, '참가비를 저장하지 못했어요.'), 'error');
      return;
    }
    openWith(iso);
  };

  const submitCustom = () => {
    if (deadline.trim() === '') {
      showToast('신청 마감 일시를 입력해 주세요.', 'error');
      return;
    }
    // `datetime-local` → ISO 변환은 **공용 헬퍼**를 쓴다. 이 변환은 타임존이 걸린
    // 자리라(입력은 KST 벽시계, 저장은 UTC) 화면마다 따로 구현하면 한 곳만 고쳐진다.
    const iso = kstDatetimeLocalToIso(deadline);
    if (iso === null) {
      showToast('신청 마감 일시를 읽을 수 없어요.', 'error');
      return;
    }
    const at = new Date(iso);
    // 지난 시각으로 열면 **여는 즉시 닫힌 리그**가 된다.
    //
    // **서버와 같은 부등호를 쓴다(`<=`).** 서버는 `deadline <= now` 를 422
    // `LEAGUE_REGISTRATION_DEADLINE_PAST` 로 막는다(`league-match-admin.service.ts`) —
    // 여기서 `<` 를 쓰면 **마감이 지금과 정확히 같은 순간**에만 화면은 통과시키고 서버가
    // 거부해, 운영자는 값을 바꾸지 않았는데 실패를 본다.
    if (at.getTime() <= Date.now()) {
      showToast('신청 마감은 지금 이후여야 해요.', 'error');
      return;
    }
    execute(iso);
  };

  const choosePreset = (next: DeadlinePreset) => {
    setPreset(next);
    setPresetIso(next === 'custom' ? null : presetDeadlineIso(new Date(), next));
  };

  const steps = league
    ? deriveRegistrationSetupSteps({
        entryFeeConfigured: league.entryFeeConfiguredAt !== null,
        registrationOpen,
        activeRegistrationCount: league.activeRegistrationCount,
      })
    : null;

  return (
    <div className="pb-12">
      <AdminPageHeader
        title="참가 신청 관리"
        description={league?.title ?? '리그'}
        action={
          <Link
            href={`/admin/league-matches/${leagueId}`}
            className="tm-btn tm-btn-sm tm-btn-outline"
            style={{ minHeight: 44 }}
          >
            리그로 돌아가기
          </Link>
        }
      />

      {steps ? (
        <ol aria-label="신청 준비 순서" className="mb-4 flex list-none flex-wrap gap-2 p-0">
          {steps.map((step) => (
            <li key={step.label} className={`tm-badge tm-badge-${step.tone}`}>
              {step.label}
            </li>
          ))}
        </ol>
      ) : null}

      {league ? <LeagueFeeCard league={league} leagueId={leagueId} focusRequest={focusRequest} /> : null}

      <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-[var(--text-strong)]">신청 받기</p>
          {registrationOpen ? (
            <span className="tm-badge tm-badge-blue">모집 중</span>
          ) : (
            <span className="tm-badge tm-badge-grey">신청 안 받는 중</span>
          )}
        </div>
        {/* **판정자는 마감 하나이고, 닫힌 이유는 `state` 가 가른다.** 대진 화면의 요약
            카드와 같은 문장이라 판정을 `describeLeagueRegistrationWindow` 한 곳에 뒀다 —
            각자 갖고 있으면 한쪽만 고쳐진다(실제로 그랬다). */}
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          {describeLeagueRegistrationWindow({
            state,
            registrationOpen,
            registrationDeadlineAt,
            noDeadlineHint:
              '마감을 정해야 신청을 받아요. 정하기 전에는 팀장 화면에 신청 입구가 보이지 않아요.',
          })}
        </p>
        {canChangeDeadline ? (
          <>
            <div role="group" aria-label="신청 마감 빠른 선택" className="tm-filter-chip-wrap mb-3">
              {DEADLINE_PRESET_DAYS.map((days) => (
                <button
                  key={days}
                  type="button"
                  aria-pressed={preset === days}
                  onClick={() => choosePreset(days)}
                  className={preset === days ? 'tm-chip tm-chip-active' : 'tm-chip'}
                >
                  {preset === days ? <Check size={14} aria-hidden="true" /> : null}
                  {days}일 뒤까지
                </button>
              ))}
              <button
                type="button"
                aria-pressed={preset === 'custom'}
                onClick={() => choosePreset('custom')}
                className={preset === 'custom' ? 'tm-chip tm-chip-active' : 'tm-chip'}
              >
                {preset === 'custom' ? <Check size={14} aria-hidden="true" /> : null}
                직접 정하기
              </button>
            </div>
            {presetIso !== null ? (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => execute(presetIso)}
                  disabled={openRegistration.isPending}
                  className="tm-btn tm-btn-sm tm-btn-primary"
                  style={{ minHeight: 44 }}
                >
                  {executeLabel}
                </button>
                <p role="status" className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
                  {formatTournamentDateTimeLong(presetIso)}까지 받아요
                </p>
              </div>
            ) : null}
            {preset === 'custom' ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-[var(--text-muted)]" htmlFor="league-registration-deadline">
                  신청 마감 (한국 시간)
                  <input
                    id="league-registration-deadline"
                    type="datetime-local"
                    value={deadline}
                    onChange={(event) => setDeadline(event.target.value)}
                    className="mt-1 block min-h-[44px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-strong)]"
                  />
                </label>
                <button
                  type="button"
                  onClick={submitCustom}
                  disabled={openRegistration.isPending}
                  className="tm-btn tm-btn-sm tm-btn-primary"
                  style={{ minHeight: 44 }}
                >
                  {executeLabel}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <ConfirmModal
        open={pendingOpenIso !== null}
        title={inheritedFee ? '이어받은 참가비로 열려요' : '참가비가 설정되지 않아 무료로 열려요'}
        message={
          inheritedFee
            ? '직전 시즌에서 이어받은 참가비를 아직 확인하지 않았어요. 이 금액 그대로 신청을 열어요. 맞는지 먼저 확인해 주세요.'
            : '참가비를 정하지 않고 신청을 열면 모든 팀이 무료로 신청해요. 유료 리그라면 먼저 참가비를 정해 주세요.'
        }
        confirmLabel={inheritedFee ? '이대로 열기' : '무료로 열기'}
        cancelLabel="참가비 먼저 정할게요"
        busy={updateFee.isPending}
        onConfirm={() => void confirmOpen()}
        onCancel={cancelOpen}
      />

      {/* `requireCancelReason` — 정규 리그는 거부 사유가 필수다(D9). 서버가
          `LEAGUE_CANCEL_REASON_REQUIRED` 로 막는데 화면이 사유를 안 받아서, 그동안
          **어드민이 리그 신청을 거부할 방법이 아예 없었다.** 대회 화면은 이 값을 안 넘겨
          기존 계약(선택)이 그대로 유지된다. */}
      <RegistrationsTab tournamentId={leagueId} showToast={showToast} canWrite requireCancelReason />
      <AdminToasts toasts={toasts} />
    </div>
  );
}
