'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { AdminInlineError, AdminToasts, useAdminToast } from '@/components/admin';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import {
  useV1AdminReviewPolicySettings,
  useV1UpdateReviewPolicySettings,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';

/** 자주 쓰는 기간을 한 번에 고르는 프리셋. 그 외 값은 직접 입력한다. */
const PRESETS = [
  { hours: 48, label: '2일' },
  { hours: 72, label: '3일' },
  { hours: 168, label: '7일' },
  { hours: 336, label: '14일' },
] as const;

function describe(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '';
  if (hours % 24 === 0) return `${hours / 24}일`;
  if (hours < 24) return `${hours}시간`;
  return `${Math.floor(hours / 24)}일 ${hours % 24}시간`;
}

/**
 * 후기 정책 폼 본문. /admin/settings/reviews 전용 페이지였다가 설정 허브
 * (/admin/settings)의 탭 본문으로 이식됐다(A안, 2026-08-25) — 페이지 헤더는 허브 소유.
 */
export function ReviewPolicyView() {
  const [hoursInput, setHoursInput] = useState('');

  const { toasts, showToast } = useAdminToast();
  const canWrite = useAdminCanWrite();

  const { data: settings, isPending, isError, error, refetch } = useV1AdminReviewPolicySettings();
  const updateSettings = useV1UpdateReviewPolicySettings();

  // 저장된 현재 값을 입력칸의 출발점으로 채운다(연동 설정과 달리 민감값이 아니라 그대로 보여준다).
  useEffect(() => {
    if (settings) setHoursInput(String(settings.reviewWindowHours));
  }, [settings]);

  const parsed = Number(hoursInput);
  const isValid =
    Number.isInteger(parsed) &&
    parsed >= (settings?.minHours ?? 1) &&
    parsed <= (settings?.maxHours ?? 8760);
  const isDirty = settings != null && parsed !== settings.reviewWindowHours;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValid) {
      showToast(`작성 가능 기간은 ${settings?.minHours ?? 1}~${settings?.maxHours ?? 8760}시간 사이의 정수로 입력해주세요.`, 'error');
      return;
    }
    if (!isDirty) {
      showToast('현재 설정과 같은 값이에요.', 'error');
      return;
    }

    updateSettings.mutate(
      { reviewWindowHours: parsed },
      {
        onSuccess: (data) => {
          showToast(`후기 작성 가능 기간을 ${data.reviewWindowLabel}로 저장했어요.`, 'success');
        },
        onError: (err) => {
          showToast(extractErrorMessage(err, '후기 정책 저장에 실패했어요.'), 'error');
        },
      },
    );
  }

  const errorMessage = isError ? extractErrorMessage(error, '후기 정책을 불러오지 못했어요.') : undefined;
  const busy = isPending || updateSettings.isPending;

  return (
    <>
      <div className="max-w-[560px]">
        <section
          className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5"
          aria-label="후기 작성 가능 기간 설정"
        >
          <h2 className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">
            후기 작성 가능 기간
          </h2>
          <p className="mt-1 text-[length:var(--font-size-caption)] text-[var(--text-muted)] leading-relaxed">
            공식 결과가 확정된 시각부터 이 기간 안에만 후기를 쓸 수 있어요. 결과가 정정되면 확정 시각이
            갱신되면서 기간도 함께 밀려요.
          </p>

          {isError && errorMessage ? (
            <AdminInlineError message={errorMessage} onRetry={() => void refetch()} />
          ) : null}

          {settings ? (
            <p
              className="mt-4 rounded-xl bg-[var(--surface-sunk,var(--card-surface))] px-3 py-2 text-[length:var(--font-size-caption)] text-[var(--text-body)]"
              aria-live="polite"
            >
              현재 설정: <strong className="font-bold">{settings.reviewWindowLabel}</strong>
              <span className="text-[var(--text-muted)]"> ({settings.reviewWindowHours}시간)</span>
              {settings.isDefault ? <span className="text-[var(--text-muted)]"> · 기본값</span> : null}
            </p>
          ) : null}

          <form className="mt-4 flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-wrap gap-2" role="group" aria-label="자주 쓰는 기간">
              {PRESETS.map((preset) => {
                const active = parsed === preset.hours;
                return (
                  <button
                    key={preset.hours}
                    type="button"
                    disabled={!canWrite || busy}
                    onClick={() => setHoursInput(String(preset.hours))}
                    aria-pressed={active}
                    className={`min-h-[44px] rounded-xl border px-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-50 ${
                      active
                        ? 'border-blue-500 bg-blue-500 text-white'
                        : 'border-[var(--border)] text-[var(--text-body)] hover:border-blue-500'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="review-window-hours"
                className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]"
              >
                직접 입력 (시간)
              </label>
              <input
                id="review-window-hours"
                type="number"
                inputMode="numeric"
                min={settings?.minHours ?? 1}
                max={settings?.maxHours ?? 8760}
                step={1}
                value={hoursInput}
                onChange={(event) => setHoursInput(event.target.value)}
                disabled={!canWrite || busy}
                placeholder={isPending ? '불러오는 중...' : '168'}
                aria-describedby="review-window-help"
                className="h-[44px] rounded-xl border border-[var(--border)] px-3 text-sm text-[var(--text-strong)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50 disabled:text-gray-400"
              />
              <span id="review-window-help" className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
                {hoursInput && !isValid
                  ? `${settings?.minHours ?? 1}~${settings?.maxHours ?? 8760}시간 사이의 정수로 입력해주세요.`
                  : hoursInput && isValid
                    ? `${describe(parsed)} 동안 후기를 쓸 수 있어요.`
                    : ' '}
              </span>
            </div>

            <p className="rounded-xl bg-[var(--yellow50,var(--card-surface))] px-3 py-2 text-[length:var(--font-size-caption)] text-[var(--text-body)] leading-relaxed">
              마감은 저장해 두지 않고 요청할 때마다 계산해요. 그래서 기간을 <strong>늘리면</strong> 이전
              기준으로 이미 마감됐던 경기도 다시 열리고, <strong>줄이면</strong> 열려 있던 경기가 곧바로
              닫혀요.
            </p>

            {!canWrite ? (
              <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
                이 설정을 바꾸려면 쓰기 권한이 필요해요.
              </p>
            ) : null}

            <button
              type="submit"
              disabled={!canWrite || busy || !isValid || !isDirty}
              className="min-h-[44px] rounded-xl bg-blue-500 px-4 text-sm font-bold text-white transition-colors hover:bg-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:bg-gray-300 disabled:text-gray-500"
            >
              {updateSettings.isPending ? '저장 중...' : '저장'}
            </button>
          </form>
        </section>
      </div>

      <AdminToasts toasts={toasts} />
    </>
  );
}
