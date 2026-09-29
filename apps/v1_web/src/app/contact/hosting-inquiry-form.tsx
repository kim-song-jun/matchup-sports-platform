'use client';

import type { FormEvent, ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { V1ApiError, v1Post } from '@/lib/api-client';
import { extractErrorCode } from '@/lib/error-message';
import { validationFieldMessages } from '@/lib/validation-details';
import {
  HOSTING_CATEGORY_LABEL,
  HOSTING_FIELD_ORDER,
  HOSTING_LIMITS,
  HOSTING_SPORT_OPTIONS,
  HOSTING_STEPS,
  emptyHostingDraft,
  hostingStepOf,
  serverFieldError,
  toHostingPayload,
  validateHostingDraft,
  validateHostingStep,
  type HostingCategory,
  type HostingDraft,
  type HostingField,
  type HostingFieldError,
  type HostingSport,
} from './hosting-inquiry-model';
import styles from './contact.module.css';

type FormStatus = 'editing' | 'invalid' | 'submitting' | 'done' | 'failed';

const LAST_STEP = HOSTING_STEPS.length - 1;

function failureMessage(err: unknown, contactEmail: string): string {
  if (err instanceof V1ApiError && err.statusCode === 429) {
    return '짧은 시간에 여러 번 보내서 잠시 막혔어요. 잠시 뒤에 다시 보내 주세요.';
  }
  if (extractErrorCode(err) === 'INQUIRY_DUPLICATE') {
    return '같은 내용의 문의가 이미 접수됐어요. 답변을 기다려 주세요.';
  }
  return `문의를 보내지 못했어요. 잠시 뒤 다시 보내거나 ${contactEmail} 로 이메일을 보내 주세요.`;
}

/**
 * 대회 개설·제휴 문의 폼(3단계). 다음 단계로 넘길 때는 지금 단계 칸만 검사하고, 보내기 직전에 전체를 다시 검사한다.
 * 서버가 앞 단계 칸을 거절하면 그 단계로 돌아가 칸에 초점을 둔다. 응답에는 접수 여부만 오므로 완료 화면은 입력값으로 그린다.
 */
export function HostingInquiryForm({ retention, contactEmail }: { retention: string; contactEmail: string }) {
  const uid = useId();
  const fieldId = (field: HostingField) => `${uid}-${field}`;
  const stepTitleId = (index: number) => `${uid}-step-${index}`;

  const [draft, setDraft] = useState<HostingDraft>(emptyHostingDraft);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<FormStatus>('editing');
  const [errors, setErrors] = useState<HostingFieldError[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ email: string; category: HostingCategory } | null>(null);
  // 새 객체를 넣을 때마다 한 번 초점을 옮긴다(단계가 바뀐 뒤 그려진 요소를 잡으려고 커밋 뒤에 한다)
  const [focusRequest, setFocusRequest] = useState<{ id: string } | null>(null);
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

  useEffect(() => {
    if (focusRequest) document.getElementById(focusRequest.id)?.focus();
  }, [focusRequest]);

  function update<K extends keyof HostingDraft>(key: K, value: HostingDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    if (errors.some((error) => error.field === key)) {
      setErrors((prev) => prev.filter((error) => error.field !== key));
    }
  }

  /** 오류 요약은 role=alert 로 읽히고, 초점은 고칠 첫 칸으로(그 칸이 앞 단계면 그 단계로 돌아가서) 간다. */
  function showErrors(next: HostingFieldError[]) {
    const ordered = HOSTING_FIELD_ORDER.flatMap((field) => next.filter((error) => error.field === field));
    setErrors(ordered);
    setStatus('invalid');
    setStep(hostingStepOf(ordered[0].field));
    setFocusRequest({ id: fieldId(ordered[0].field) });
  }

  function goTo(next: number) {
    setErrors([]);
    setFailure(null);
    setStatus('editing');
    setStep(next);
    setFocusRequest({ id: stepTitleId(next) });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'submitting') return;
    if (step < LAST_STEP) {
      const invalid = validateHostingStep(draft, step);
      if (invalid.length) showErrors(invalid);
      else goTo(step + 1);
      return;
    }
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
    setStep(0);
    startedAtRef.current = Date.now();
    setStatus('editing');
  }

  if (status === 'done' && submitted) {
    const doneTitleId = `${uid}-done-title`;
    return (
      <div ref={doneRef} className={styles.done} tabIndex={-1} role="status" aria-labelledby={doneTitleId}>
        <h3 id={doneTitleId} className={styles.doneTitle}>
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
  const formTitleId = `${uid}-title`;

  return (
    <form className={styles.form} noValidate onSubmit={handleSubmit} aria-busy={submitting} aria-labelledby={formTitleId}>
      <h3 id={formTitleId} className={styles.formTitle}>대회 개설·제휴 문의 보내기</h3>
      <p className={styles.hint}>
        별표(*)가 붙은 칸은 꼭 입력해 주세요. 회원가입 없이 보낼 수 있어요.
      </p>
      <ol className={styles.stepper} aria-label="문의 단계">
        {HOSTING_STEPS.map((item, index) => (
          <li
            key={item.title}
            data-state={index < step ? 'done' : index === step ? 'current' : 'todo'}
            aria-current={index === step ? 'step' : undefined}
          >
            <span className={styles.stepperNum} aria-hidden="true">
              {index < step ? <Check size={14} strokeWidth={3} /> : index + 1}
            </span>
            <span className="sr-only">{index + 1}단계{index < step ? '(완료)' : ''} </span>
            {item.title}
          </li>
        ))}
      </ol>

      {errors.length ? (
        <div className={styles.errorSummary} role="alert">
          <p className={styles.errorSummaryTitle}>입력한 내용을 {errors.length}군데 확인해 주세요</p>
          <ul>
            {errors.map((error) => (
              <li key={error.field}>
                <a
                  href={`#${fieldId(error.field)}`}
                  onClick={(event) => {
                    event.preventDefault();
                    document.getElementById(fieldId(error.field))?.focus();
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

      <Pane index={0} step={step} titleId={stepTitleId(0)}>
        <fieldset className={styles.choiceGroup}>
          <legend className={styles.label}>
            문의 유형<span className={styles.req} aria-hidden="true">*</span>
          </legend>
          {(Object.keys(HOSTING_CATEGORY_LABEL) as HostingCategory[]).map((category) => (
            <label key={category} className={styles.choice}>
              <input
                type="radio"
                name={`${uid}-category`}
                value={category}
                checked={draft.category === category}
                onChange={() => update('category', category)}
                disabled={submitting}
              />
              <span>{HOSTING_CATEGORY_LABEL[category]} 문의</span>
            </label>
          ))}
        </fieldset>
        <TextField id={fieldId('name')} label="담당자 이름" required value={draft.name} maxLength={HOSTING_LIMITS.name}
          autoComplete="name" error={errorOf('name')} disabled={submitting} onChange={(v) => update('name', v)} />
        <TextField id={fieldId('email')} label="답변 받을 이메일" required type="email" inputMode="email" value={draft.email}
          maxLength={HOSTING_LIMITS.email} autoComplete="email" error={errorOf('email')} disabled={submitting}
          onChange={(v) => update('email', v)} />
      </Pane>

      <Pane index={1} step={step} titleId={stepTitleId(1)}>
        <TextField id={fieldId('organization')} label="단체·대회 이름" value={draft.organization} maxLength={HOSTING_LIMITS.organization}
          autoComplete="organization" error={errorOf('organization')} disabled={submitting}
          onChange={(v) => update('organization', v)} />
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${uid}-sport`}>
            종목<span className={styles.opt}>선택</span>
          </label>
          <select id={`${uid}-sport`} className="tm-input tm-input-select" value={draft.sportType} disabled={submitting}
            aria-describedby={`${uid}-sport-hint`} onChange={(event) => update('sportType', event.target.value as HostingSport)}>
            {HOSTING_SPORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <p id={`${uid}-sport-hint`} className={styles.hint}>대회 경기 설정은 축구·풋살을 지원해요.</p>
        </div>
        <TextField id={fieldId('expectedSchedule')} label="희망 시기" value={draft.expectedSchedule}
          maxLength={HOSTING_LIMITS.expectedSchedule} placeholder="예: 가을 주말" error={errorOf('expectedSchedule')}
          disabled={submitting} onChange={(v) => update('expectedSchedule', v)} />
      </Pane>

      <Pane index={2} step={step} titleId={stepTitleId(2)}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={fieldId('message')}>
            문의 내용<span className={styles.req} aria-hidden="true">*</span>
          </label>
          <textarea
            id={fieldId('message')}
            className={`tm-input ${styles.textarea}`}
            value={draft.message}
            maxLength={HOSTING_LIMITS.message}
            required
            disabled={submitting}
            aria-invalid={errorOf('message') ? true : undefined}
            aria-describedby={[`${uid}-message-hint`, errorOf('message') ? `${fieldId('message')}-error` : ''].filter(Boolean).join(' ')}
            onChange={(event) => update('message', event.target.value)}
          />
          <p id={`${uid}-message-hint`} className={styles.hint}>
            진행 방식, 예상 참가 팀 수, 경기장 사정처럼 미리 알려 주시면 좋은 내용을 적어 주세요.
            ({draft.message.length.toLocaleString('ko-KR')} / {HOSTING_LIMITS.message.toLocaleString('ko-KR')}자)
          </p>
          <FieldError id={`${fieldId('message')}-error`} message={errorOf('message')} />
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
            <input id={fieldId('consent')} type="checkbox" checked={draft.consent} disabled={submitting}
              aria-invalid={errorOf('consent') ? true : undefined}
              aria-describedby={errorOf('consent') ? `${fieldId('consent')}-error` : undefined}
              onChange={(event) => update('consent', event.target.checked)} />
            <span>[필수] 개인정보 수집·이용에 동의해요</span>
          </label>
          <FieldError id={`${fieldId('consent')}-error`} message={errorOf('consent')} />
        </div>
      </Pane>

      {/* 사람에게도 보조기기에도 보이지 않는 칸. 채워져 오면 서버가 저장하지 않고 성공처럼 응답한다. */}
      <div className={styles.trap} aria-hidden="true">
        <label htmlFor={`${uid}-trap`}>웹사이트(비워 두세요)</label>
        <input id={`${uid}-trap`} name="tm_hp_homepage" type="text" tabIndex={-1} autoComplete="off"
          value={draft.website} onChange={(event) => update('website', event.target.value)} />
      </div>

      <div className={styles.paneNav}>
        {step > 0 ? (
          <button type="button" className="tm-btn tm-btn-lg tm-btn-neutral" disabled={submitting} onClick={() => goTo(step - 1)}>
            이전
          </button>
        ) : null}
        <button type="submit" className="tm-btn tm-btn-lg tm-btn-primary" disabled={submitting}>
          {step < LAST_STEP ? '다음' : submitting ? '보내는 중이에요' : status === 'failed' ? '다시 보내기' : '문의 보내기'}
        </button>
      </div>
      {step === LAST_STEP ? <p className={styles.hint}>답변은 입력한 이메일로 보내 드려요.</p> : null}
    </form>
  );
}

/** 한 단계의 칸 묶음. 지금 단계가 아니면 hidden 으로 가리되 입력값은 그대로 둔다. 제목은 단계를 옮길 때 초점을 받는다. */
function Pane({ index, step, titleId, children }: { index: number; step: number; titleId: string; children: ReactNode }) {
  return (
    <div className={styles.pane} role="group" aria-labelledby={titleId} hidden={index !== step}>
      <h4 id={titleId} className={styles.paneTitle} tabIndex={-1}>
        {index + 1}단계 · {HOSTING_STEPS[index].title}
      </h4>
      {children}
    </div>
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
