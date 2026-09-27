'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { V1ApiError, v1Post } from '@/lib/api-client';
import { extractErrorCode } from '@/lib/error-message';
import { validationFieldMessages } from '@/lib/validation-details';
import {
  HOSTING_CATEGORY_LABEL,
  HOSTING_FIELD_ORDER,
  HOSTING_LIMITS,
  HOSTING_SPORT_OPTIONS,
  emptyHostingDraft,
  serverFieldError,
  toHostingPayload,
  validateHostingDraft,
  type HostingCategory,
  type HostingDraft,
  type HostingField,
  type HostingFieldError,
  type HostingSport,
} from './hosting-inquiry-model';
import styles from './contact.module.css';

type FormStatus = 'editing' | 'invalid' | 'submitting' | 'done' | 'failed';

const FIELD_ID: Record<HostingField, string> = {
  name: 'hosting-name',
  email: 'hosting-email',
  organization: 'hosting-organization',
  expectedSchedule: 'hosting-schedule',
  message: 'hosting-message',
  consent: 'hosting-consent',
};

function failureMessage(err: unknown, contactEmail: string): string {
  if (err instanceof V1ApiError && err.statusCode === 429) {
    return '짧은 시간에 여러 번 보내서 잠시 막혔어요. 잠시 뒤에 다시 보내 주세요.';
  }
  if (extractErrorCode(err) === 'INQUIRY_DUPLICATE') {
    return '같은 내용의 문의가 이미 접수됐어요. 답변을 기다려 주세요.';
  }
  return `문의를 보내지 못했어요. 잠시 뒤 다시 보내거나 ${contactEmail} 로 이메일을 보내 주세요.`;
}

/** 대회 개설·제휴 문의 폼. 응답에는 접수 여부만 오므로 완료 화면은 입력값으로 그린다. */
export function HostingInquiryForm({ retention, contactEmail }: { retention: string; contactEmail: string }) {
  const [draft, setDraft] = useState<HostingDraft>(emptyHostingDraft);
  const [status, setStatus] = useState<FormStatus>('editing');
  const [errors, setErrors] = useState<HostingFieldError[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ email: string; category: HostingCategory } | null>(null);
  const startedAtRef = useRef(0);
  const doneRef = useRef<HTMLDivElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    startedAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (status === 'done') doneRef.current?.focus();
    if (status === 'failed') failureRef.current?.focus();
  }, [status]);

  function update<K extends keyof HostingDraft>(key: K, value: HostingDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    if (errors.some((error) => error.field === key)) {
      setErrors((prev) => prev.filter((error) => error.field !== key));
    }
  }

  function showErrors(next: HostingFieldError[]) {
    const ordered = HOSTING_FIELD_ORDER.flatMap((field) => next.filter((error) => error.field === field));
    setErrors(ordered);
    setStatus('invalid');
    // 오류 요약은 role=alert 로 읽히고, 초점은 고칠 첫 칸으로 간다.
    requestAnimationFrame(() => document.getElementById(FIELD_ID[ordered[0].field])?.focus());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'submitting') return;
    const invalid = validateHostingDraft(draft);
    if (invalid.length) {
      showErrors(invalid);
      return;
    }
    setErrors([]);
    setFailure(null);
    setStatus('submitting');
    try {
      await v1Post<{ received: boolean }>('/public/inquiries', toHostingPayload(draft, startedAtRef.current));
      setSubmitted({ email: draft.email.trim(), category: draft.category });
      setStatus('done');
    } catch (err) {
      const serverErrors = Object.keys(validationFieldMessages(err))
        .map(serverFieldError)
        .filter((error): error is HostingFieldError => error !== null);
      if (serverErrors.length) {
        showErrors(serverErrors);
        return;
      }
      setFailure(failureMessage(err, contactEmail));
      setStatus('failed');
    }
  }

  function startOver() {
    setDraft(emptyHostingDraft());
    setErrors([]);
    setFailure(null);
    setSubmitted(null);
    startedAtRef.current = Date.now();
    setStatus('editing');
  }

  if (status === 'done' && submitted) {
    return (
      <div ref={doneRef} className={styles.done} tabIndex={-1} role="status" aria-labelledby="hosting-done-title">
        <h3 id="hosting-done-title" className={styles.doneTitle}>
          {HOSTING_CATEGORY_LABEL[submitted.category]} 문의가 접수됐어요
        </h3>
        <p className={styles.doneBody}>
          운영팀이 내용을 확인한 뒤 <strong>{submitted.email}</strong> 로 답변을 보내 드려요.
        </p>
        <button type="button" className="tm-btn tm-btn-md tm-btn-neutral" onClick={startOver}>
          다른 문의 보내기
        </button>
      </div>
    );
  }

  const errorOf = (field: HostingField) => errors.find((error) => error.field === field)?.message;
  const submitting = status === 'submitting';

  return (
    <form className={styles.form} noValidate onSubmit={handleSubmit} aria-busy={submitting} aria-labelledby="hosting-form-title">
      <h3 id="hosting-form-title" className={styles.formTitle}>대회 개설·제휴 문의 보내기</h3>
      <p className={styles.hint}>
        별표(*)가 붙은 칸은 꼭 입력해 주세요. 회원가입 없이 보낼 수 있어요.
      </p>

      {errors.length ? (
        <div className={styles.errorSummary} role="alert" aria-labelledby="hosting-error-summary-title">
          <p id="hosting-error-summary-title" className={styles.errorSummaryTitle}>
            입력한 내용을 {errors.length}군데 확인해 주세요
          </p>
          <ul>
            {errors.map((error) => (
              <li key={error.field}>
                <a
                  href={`#${FIELD_ID[error.field]}`}
                  onClick={(event) => {
                    event.preventDefault();
                    document.getElementById(FIELD_ID[error.field])?.focus();
                  }}
                >
                  {error.message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {status === 'failed' && failure ? (
        <div ref={failureRef} className={styles.failure} role="alert" tabIndex={-1}>
          {failure}
        </div>
      ) : null}

      <fieldset className={styles.choiceGroup}>
        <legend className={styles.label}>
          문의 유형<span className={styles.req} aria-hidden="true">*</span>
        </legend>
        {(Object.keys(HOSTING_CATEGORY_LABEL) as HostingCategory[]).map((category) => (
          <label key={category} className={styles.choice}>
            <input
              type="radio"
              name="hosting-category"
              value={category}
              checked={draft.category === category}
              onChange={() => update('category', category)}
              disabled={submitting}
            />
            <span>{HOSTING_CATEGORY_LABEL[category]} 문의</span>
          </label>
        ))}
      </fieldset>

      <div className={styles.row}>
        <TextField id={FIELD_ID.name} label="담당자 이름" required value={draft.name} maxLength={HOSTING_LIMITS.name}
          autoComplete="name" error={errorOf('name')} disabled={submitting} onChange={(v) => update('name', v)} />
        <TextField id={FIELD_ID.email} label="답변 받을 이메일" required type="email" inputMode="email" value={draft.email}
          maxLength={HOSTING_LIMITS.email} autoComplete="email" error={errorOf('email')} disabled={submitting}
          onChange={(v) => update('email', v)} />
      </div>

      <TextField id={FIELD_ID.organization} label="단체·대회 이름" value={draft.organization} maxLength={HOSTING_LIMITS.organization}
        autoComplete="organization" error={errorOf('organization')} disabled={submitting}
        onChange={(v) => update('organization', v)} />

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="hosting-sport">
            종목<span className={styles.opt}>선택</span>
          </label>
          <select id="hosting-sport" className="tm-input tm-input-select" value={draft.sportType} disabled={submitting}
            aria-describedby="hosting-sport-hint" onChange={(event) => update('sportType', event.target.value as HostingSport)}>
            {HOSTING_SPORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <p id="hosting-sport-hint" className={styles.hint}>대회 경기 설정은 축구·풋살을 지원해요.</p>
        </div>
        <TextField id={FIELD_ID.expectedSchedule} label="희망 시기" value={draft.expectedSchedule}
          maxLength={HOSTING_LIMITS.expectedSchedule} placeholder="예: 가을 주말" error={errorOf('expectedSchedule')}
          disabled={submitting} onChange={(v) => update('expectedSchedule', v)} />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={FIELD_ID.message}>
          문의 내용<span className={styles.req} aria-hidden="true">*</span>
        </label>
        <textarea
          id={FIELD_ID.message}
          className={`tm-input ${styles.textarea}`}
          value={draft.message}
          maxLength={HOSTING_LIMITS.message}
          required
          disabled={submitting}
          aria-invalid={errorOf('message') ? true : undefined}
          aria-describedby={['hosting-message-hint', errorOf('message') ? `${FIELD_ID.message}-error` : ''].filter(Boolean).join(' ')}
          onChange={(event) => update('message', event.target.value)}
        />
        <p id="hosting-message-hint" className={styles.hint}>
          진행 방식, 예상 참가 팀 수, 경기장 사정처럼 미리 알려 주시면 좋은 내용을 적어 주세요.
          ({draft.message.length.toLocaleString('ko-KR')} / {HOSTING_LIMITS.message.toLocaleString('ko-KR')}자)
        </p>
        <FieldError id={`${FIELD_ID.message}-error`} message={errorOf('message')} />
      </div>

      {/* 사람에게도 보조기기에도 보이지 않는 칸. 채워져 오면 서버가 저장하지 않고 성공처럼 응답한다. */}
      <div className={styles.trap} aria-hidden="true">
        <label htmlFor="hosting-trap">웹사이트(비워 두세요)</label>
        <input id="hosting-trap" name="tm_hp_homepage" type="text" tabIndex={-1} autoComplete="off"
          value={draft.website} onChange={(event) => update('website', event.target.value)} />
      </div>

      <div className={styles.consent}>
        <p className={styles.consentTitle}>개인정보 수집·이용 안내</p>
        <dl className={styles.consentList}>
          <div><dt>수집 항목</dt><dd>담당자 이름, 이메일, 문의 내용, 단체·대회 이름·종목·희망 시기(선택)</dd></div>
          <div><dt>이용 목적</dt><dd>대회 개설·제휴 문의 확인과 답변</dd></div>
          <div><dt>보관 기간</dt><dd>{retention}</dd></div>
        </dl>
        <p className={styles.hint}>
          동의하지 않으면 문의를 보낼 수 없어요. 비회원 문의의 수집·보관은 이 안내를 따라요. 회원의 개인정보
          처리 기준은 <a className={styles.inlineLink} href="/terms?document=privacy">개인정보처리방침</a>에서 볼 수 있어요.
        </p>
        <label className={styles.check}>
          <input id={FIELD_ID.consent} type="checkbox" checked={draft.consent} disabled={submitting}
            aria-invalid={errorOf('consent') ? true : undefined}
            aria-describedby={errorOf('consent') ? `${FIELD_ID.consent}-error` : undefined}
            onChange={(event) => update('consent', event.target.checked)} />
          <span>[필수] 개인정보 수집·이용에 동의해요</span>
        </label>
        <FieldError id={`${FIELD_ID.consent}-error`} message={errorOf('consent')} />
      </div>

      <div className={styles.submitRow}>
        <button type="submit" className="tm-btn tm-btn-lg tm-btn-primary" disabled={submitting}>
          {submitting ? '보내는 중이에요' : status === 'failed' ? '다시 보내기' : '문의 보내기'}
        </button>
        <p className={styles.hint}>답변은 입력한 이메일로 보내 드려요.</p>
      </div>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} className={styles.error}>{message}</p>;
}

function TextField({
  id, label, value, onChange, required = false, error, disabled, maxLength, type = 'text', inputMode, autoComplete, placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
  disabled: boolean;
  maxLength: number;
  type?: 'text' | 'email';
  inputMode?: 'email';
  autoComplete?: string;
  placeholder?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {required ? <span className={styles.req} aria-hidden="true">*</span> : <span className={styles.opt}>선택</span>}
      </label>
      <input id={id} className="tm-input" type={type} inputMode={inputMode} value={value} maxLength={maxLength}
        required={required} autoComplete={autoComplete} placeholder={placeholder} disabled={disabled}
        aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)} />
      <FieldError id={errorId} message={error} />
    </div>
  );
}
