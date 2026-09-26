'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { AdminInlineError, AdminToasts, useAdminToast } from '@/components/admin';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { useV1AdminSiteInfo, useV1UpdateSiteInfo } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { SITE_INFO_DEFAULTS } from '@/lib/public-site/site-info';
import { validationFieldMessages } from '@/lib/validation-details';
import type { V1AdminSiteInfo, V1SiteInfoField, V1UpdateSiteInfoPayload } from '@/types/api';

type Draft = Record<V1SiteInfoField, string>;
type FieldErrors = Partial<Record<V1SiteInfoField, string>>;

type FieldSpec = {
  key: V1SiteInfoField;
  label: string;
  maxLength: number;
  type?: 'text' | 'email';
  placeholder?: string;
  hint?: string;
};

/** 서버 DTO(apps/v1_api/src/site-info/dto/site-info.dto.ts)와 같은 상한·형식. */
const FIELDS: readonly FieldSpec[] = [
  { key: 'companyName', label: '상호', maxLength: 100, hint: `비워 두면 공개 페이지에는 기본값(${SITE_INFO_DEFAULTS.companyName})을 보여 줘요.` },
  { key: 'representativeName', label: '대표자', maxLength: 50 },
  { key: 'businessRegistrationNumber', label: '사업자등록번호', maxLength: 12, placeholder: '000-00-00000' },
  { key: 'address', label: '사업장 주소', maxLength: 200 },
  { key: 'mailOrderSalesNumber', label: '통신판매업 신고번호', maxLength: 50 },
  {
    key: 'contactEmail',
    label: '문의 이메일',
    maxLength: 254,
    type: 'email',
    hint: `문의 페이지·푸터에 보이는 주소예요. 비워 두면 기본값(${SITE_INFO_DEFAULTS.contactEmail})을 보여 줘요.`,
  },
  {
    key: 'guestInquiryRetention',
    label: '비회원 문의 보관 기간',
    maxLength: 100,
    hint: '문의 페이지 폼의 개인정보 수집·이용 동의에 그대로 보여요. 비워서 저장하면 기본 문구로 돌아가요. 기간이 지난 문의를 자동으로 지우는 기능은 아직 없어요.',
  },
];

const BUSINESS_NUMBER_PATTERN = /^\d{3}-\d{2}-\d{5}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toDraft(settings: V1AdminSiteInfo | undefined): Draft {
  return {
    companyName: settings?.companyName ?? '',
    representativeName: settings?.representativeName ?? '',
    businessRegistrationNumber: settings?.businessRegistrationNumber ?? '',
    address: settings?.address ?? '',
    mailOrderSalesNumber: settings?.mailOrderSalesNumber ?? '',
    contactEmail: settings?.contactEmail ?? '',
    // 기본 문구로 읽는 중이면 칸을 비워 둔다 — 채워 두면 저장할 때 기본 문구가 저장값으로 굳는다.
    guestInquiryRetention: settings && !settings.guestInquiryRetentionIsDefault ? settings.guestInquiryRetention : '',
  };
}

function validate(draft: Draft): FieldErrors {
  const errors: FieldErrors = {};
  const businessNumber = draft.businessRegistrationNumber.trim();
  if (businessNumber && !BUSINESS_NUMBER_PATTERN.test(businessNumber)) {
    errors.businessRegistrationNumber = '사업자등록번호는 000-00-00000 형식으로 입력해 주세요.';
  }
  const email = draft.contactEmail.trim();
  if (email && !EMAIL_PATTERN.test(email)) errors.contactEmail = '이메일 형식이 올바르지 않아요.';
  return errors;
}

const fieldId = (key: V1SiteInfoField) => `site-info-${key}`;

/**
 * 사업자 정보 설정. 연동 설정 탭과 같은 카드·저장 흐름이고, 공개 정보라 입력칸에 현재 값을 채워 둔다.
 * 저장은 바뀐 칸만 보낸다(빈 문자열 = 지우기).
 */
export function SiteInfoView() {
  const { toasts, showToast } = useAdminToast();
  const canWrite = useAdminCanWrite();
  const { data: settings, isPending, isError, error, refetch } = useV1AdminSiteInfo();
  const updateSettings = useV1UpdateSiteInfo();
  const [draft, setDraft] = useState<Draft>(() => toDraft(undefined));
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (settings) setDraft(toDraft(settings));
  }, [settings]);

  // 저장 중에는 입력칸이 잠겨 있어 초점을 줄 수 없다 — 잠금이 풀린 뒤 옮긴다.
  const [focusTarget, setFocusTarget] = useState<V1SiteInfoField | null>(null);
  useEffect(() => {
    if (!focusTarget || updateSettings.isPending) return;
    document.getElementById(fieldId(focusTarget))?.focus();
    setFocusTarget(null);
  }, [focusTarget, updateSettings.isPending]);

  function focusFirst(next: FieldErrors) {
    setFocusTarget(FIELDS.find((field) => next[field.key])?.key ?? null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = validate(draft);
    if (Object.keys(invalid).length) {
      setErrors(invalid);
      focusFirst(invalid);
      return;
    }
    const baseline = toDraft(settings);
    const payload: V1UpdateSiteInfoPayload = {};
    for (const { key } of FIELDS) {
      if (draft[key].trim() !== baseline[key].trim()) payload[key] = draft[key].trim();
    }
    if (!Object.keys(payload).length) {
      showToast('바뀐 항목이 없어요.', 'error');
      return;
    }
    setErrors({});
    updateSettings.mutate(payload, {
      onSuccess: () => showToast('사업자 정보를 저장했어요.', 'success'),
      onError: (err) => {
        const serverErrors: FieldErrors = {};
        for (const [field, messages] of Object.entries(validationFieldMessages(err))) {
          if (FIELDS.some((spec) => spec.key === field)) {
            serverErrors[field as V1SiteInfoField] = messages[0] ?? '입력값을 확인해 주세요.';
          }
        }
        setErrors(serverErrors);
        focusFirst(serverErrors);
        showToast(extractErrorMessage(err, '사업자 정보 저장에 실패했어요.'), 'error');
      },
    });
  }

  const locked = isPending || updateSettings.isPending;
  const disabled = !canWrite || locked;
  const errorMessage = isError ? extractErrorMessage(error, '사업자 정보를 불러오지 못했어요.') : undefined;

  return (
    <>
      <div className="max-w-[560px]">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5" aria-label="사업자 정보 설정">
          <h2 className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">사업자 정보</h2>
          <p className="mt-1 text-[length:var(--font-size-caption)] text-[var(--text-muted)] leading-relaxed">
            공개 페이지 푸터와 문의 페이지에 보이는 값이에요. 비운 항목은 화면에서 줄째 빠지고, 저장한 값은 최대
            5분 뒤 공개 페이지에 반영돼요.
          </p>

          {isError && errorMessage ? <AdminInlineError message={errorMessage} onRetry={() => void refetch()} /> : null}

          <form className="mt-4 flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            {FIELDS.map((field) => {
              const id = fieldId(field.key);
              const fieldError = errors[field.key];
              const describedBy = [field.hint ? `${id}-hint` : '', fieldError ? `${id}-error` : ''].filter(Boolean).join(' ');
              const placeholder = field.key === 'guestInquiryRetention' && settings?.guestInquiryRetentionIsDefault
                ? `기본값: ${settings.guestInquiryRetention}`
                : field.placeholder;
              return (
                <div key={field.key} className="flex flex-col gap-2">
                  <label htmlFor={id} className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">
                    {field.label}
                  </label>
                  <input
                    id={id}
                    type={field.type ?? 'text'}
                    value={draft[field.key]}
                    onChange={(event) => {
                      const value = event.target.value;
                      setDraft((prev) => ({ ...prev, [field.key]: value }));
                      if (errors[field.key]) setErrors((prev) => ({ ...prev, [field.key]: undefined }));
                    }}
                    maxLength={field.maxLength}
                    // 지원 역할은 이 칸으로만 값을 읽는다 — disabled 의 저대비 대신 읽기 전용으로 둔다.
                    readOnly={!canWrite}
                    disabled={locked}
                    placeholder={isPending ? '불러오는 중...' : placeholder}
                    aria-invalid={fieldError ? true : undefined}
                    aria-describedby={describedBy || undefined}
                    className="h-[44px] rounded-xl border border-[var(--border)] px-3 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 aria-[invalid=true]:border-[var(--red500)] read-only:bg-[var(--surface-soft)] disabled:bg-[var(--surface-soft)] disabled:text-[var(--text-muted)]"
                  />
                  {field.hint ? (
                    <span id={`${id}-hint`} className="text-[length:var(--font-size-micro)] text-[var(--text-muted)]">{field.hint}</span>
                  ) : null}
                  {fieldError ? (
                    <span id={`${id}-error`} className="text-[length:var(--font-size-micro)] font-semibold text-[var(--red700)]">
                      {fieldError}
                    </span>
                  ) : null}
                </div>
              );
            })}

            {!canWrite ? (
              <p className="tm-on-tint rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
                지원 역할은 사업자 정보를 조회할 수 있지만 저장할 수 없어요.
              </p>
            ) : null}

            <button
              type="submit"
              disabled={disabled}
              className="inline-flex h-[44px] items-center justify-center rounded-xl bg-blue-500 px-4 text-[length:var(--font-size-body-sm)] font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
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
