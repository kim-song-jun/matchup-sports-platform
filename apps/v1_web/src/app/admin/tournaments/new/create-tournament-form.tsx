'use client';

import { useEffect, useId, useReducer, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check, Info } from 'lucide-react';
import { AdminPageHeader, AdminToasts, useAdminToast } from '@/components/admin';
import { TournamentDatetimeField } from '@/components/admin/tournaments/tournament-datetime-field';
import { TournamentGenderChoiceField } from '@/components/admin/tournaments/tournament-gender-choice-field';
import { useV1CreateTournament, useV1MasterSports } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { CreateBottomBar } from './create-bottom-bar';
import {
  CREATE_FORMAT_OPTIONS,
  DEFAULT_GENDER_CATEGORY,
  buildCreatePayload,
  createFormReducer,
  initialCreateFormState,
  registrationDeadlineHint,
  summarizeBarStatus,
  validateCreateForm,
  type CreateErrorField,
  type CreateFormErrors,
  type CreateFormState,
  type CreateFormatChoice,
} from './create-form-model';
import { CreateTeamCountField } from './create-team-count-field';

const LABEL_CLASS = 'text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]';
const CHIP_BASE =
  'relative flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-4 text-[length:var(--font-size-body-sm)] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue-500';
const CHIP_SELECTED = 'border-blue-500 bg-[var(--blue50)] font-bold text-[var(--blue700)]';
const CHIP_IDLE = 'border-[var(--border)] font-medium text-[var(--text-body)]';

const GENDER_QUOTA_ROWS = [
  { label: '남성', min: 'genderMinMale', max: 'genderMaxMale', minId: 'create-gender-min-male', maxId: 'create-gender-max-male' },
  { label: '여성', min: 'genderMinFemale', max: 'genderMaxFemale', minId: 'create-gender-min-female', maxId: 'create-gender-max-female' },
] as const;

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="ml-0.5 text-[var(--red700)]">*</span>
      <span className="sr-only"> (필수)</span>
    </>
  );
}

function FieldError({ id, focusId, message }: { id: string; focusId: string; message?: string }) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      data-error-focus={focusId}
      className="flex items-center gap-1 text-[length:var(--font-size-caption)] text-[var(--red700)]"
    >
      <AlertCircle size={14} aria-hidden="true" className="shrink-0" />
      {message}
    </p>
  );
}

function ChoiceChip({
  id,
  name,
  label,
  checked,
  disabled,
  onSelect,
}: {
  id?: string;
  name: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <label className={[CHIP_BASE, checked ? CHIP_SELECTED : CHIP_IDLE, disabled ? 'cursor-not-allowed opacity-60' : ''].join(' ')}>
      <input
        id={id}
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="sr-only"
      />
      {checked ? <Check size={14} aria-hidden="true" /> : null}
      {label}
    </label>
  );
}

function ProgressSteps() {
  const steps = ['필수 정보', '초안에서 나머지 채우기', '접수 시작'];
  return (
    <ol aria-label="대회 만들기 진행" className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {steps.map((step, index) => {
        const current = index === 0;
        return (
          <li
            key={step}
            aria-current={current ? 'step' : undefined}
            className={[
              'flex items-center gap-1.5 text-[length:var(--font-size-caption)]',
              current ? 'font-bold text-[var(--blue700)]' : 'text-[var(--text-caption)]',
            ].join(' ')}
          >
            <span
              aria-hidden="true"
              className={[
                'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[length:var(--font-size-micro)] font-bold',
                current ? 'bg-blue-500 text-white' : 'bg-[var(--grey100)] text-[var(--text-caption)]',
              ].join(' ')}
            >
              {index + 1}
            </span>
            {step}
            {index < steps.length - 1 ? <span aria-hidden="true" className="ml-1 text-[var(--text-caption)]">›</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function CreateTournamentForm({ initialFormat }: { initialFormat: CreateFormatChoice }) {
  const router = useRouter();
  const { toasts, showToast } = useAdminToast();
  const [state, dispatch] = useReducer(createFormReducer, initialFormat, initialCreateFormState);
  const [errors, setErrors] = useState<CreateFormErrors>({});
  // 요청을 보낸 뒤 오류가 나기 전까지, 성공해 이동하는 동안도 true — 같은 대회를 두 번 만들지 않는다.
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const focusFirstErrorRef = useRef(false);
  const sportGroupName = useId();
  const formatGroupName = useId();
  const sports = useV1MasterSports();
  const createTournament = useV1CreateTournament();
  const deadlineHint = registrationDeadlineHint(state);

  useEffect(() => {
    if (!focusFirstErrorRef.current) return;
    focusFirstErrorRef.current = false;
    // 오류 문구가 data-error-focus 로 가리키는 입력으로 간다 — DOM 순서상 첫 오류가 가장 위 칸이다.
    const alert = formRef.current?.querySelector<HTMLElement>('[role="alert"][data-error-focus]');
    if (!alert) return;
    const control = document.getElementById(alert.dataset.errorFocus ?? '');
    (control ?? alert).scrollIntoView({ block: 'center', behavior: scrollBehavior() });
    control?.focus({ preventScroll: true });
  }, [errors]);

  const clearErrors = (...fields: CreateErrorField[]) => {
    setErrors((current) => {
      if (!fields.some((field) => field in current)) return current;
      const next = { ...current };
      for (const field of fields) delete next[field];
      return next;
    });
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const found = validateCreateForm(state);
    if (Object.keys(found).length > 0) {
      focusFirstErrorRef.current = true;
      setErrors(found);
      return;
    }
    setPending(true);
    createTournament.mutate(buildCreatePayload(state), {
      onSuccess: (tournament) => {
        router.push(`/admin/tournaments/${tournament.id}/overview?created=1`);
      },
      onError: (error) => {
        setPending(false);
        showToast(extractErrorMessage(error, '대회를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.'), 'error');
      },
    });
  };

  const setQuota = (field: 'genderMinMale' | 'genderMaxMale' | 'genderMinFemale' | 'genderMaxFemale', value: string) => {
    dispatch({ type: 'set-field', field, value });
    clearErrors(field, 'genderQuota');
  };

  return (
    <div className="mx-auto max-w-3xl">
      <AdminPageHeader
        title="새 대회 만들기"
        description="꼭 필요한 6가지만 정하면 초안이 만들어져요. 나머지는 초안에서 채워요."
        back={{ fallbackHref: '/admin/tournaments', label: '대회 목록으로' }}
      />
      <ProgressSteps />

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        aria-label="대회 필수 정보"
        className="mt-5 pb-28 [&_button]:scroll-mb-28 [&_input]:scroll-mb-28"
      >
        <div className="tm-card grid gap-6 px-4 py-5 sm:px-7 sm:py-7">
          <div className="grid gap-2">
            <p id="create-sport-label" className={LABEL_CLASS}>
              종목
              <RequiredMark />
            </p>
            {sports.data ? (
              <div
                role="radiogroup"
                aria-labelledby="create-sport-label"
                aria-required="true"
                aria-invalid={Boolean(errors.sportId)}
                aria-describedby={errors.sportId ? 'create-sport-error' : undefined}
                className="flex flex-wrap gap-2"
              >
                {sports.data.map((sport, index) => (
                  <ChoiceChip
                    key={sport.id}
                    id={index === 0 ? 'create-sport' : undefined}
                    name={sportGroupName}
                    label={sport.name}
                    checked={state.sportId === sport.id}
                    disabled={pending}
                    onSelect={() => {
                      dispatch({ type: 'set-field', field: 'sportId', value: sport.id });
                      clearErrors('sportId');
                    }}
                  />
                ))}
              </div>
            ) : sports.isError ? (
              <div role="alert" className="flex flex-wrap items-center gap-3 text-[length:var(--font-size-label)] text-[var(--red700)]">
                종목을 불러오지 못했어요.
                <button type="button" className="tm-btn tm-btn-sm tm-btn-outline" onClick={() => void sports.refetch()}>
                  다시 불러오기
                </button>
              </div>
            ) : (
              <p role="status" className="text-[length:var(--font-size-label)] text-[var(--text-caption)]">종목을 불러오고 있어요.</p>
            )}
            <FieldError id="create-sport-error" focusId="create-sport" message={errors.sportId} />
          </div>

          <div className="grid gap-2">
            <label htmlFor="create-title" className={LABEL_CLASS}>
              대회명
              <RequiredMark />
            </label>
            <input
              id="create-title"
              value={state.title}
              onChange={(event) => {
                dispatch({ type: 'set-field', field: 'title', value: event.target.value });
                clearErrors('title');
              }}
              disabled={pending}
              maxLength={120}
              autoComplete="off"
              placeholder="예: 2026 서울 풋살 오픈"
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? 'create-title-error' : undefined}
              className="tm-input"
            />
            <FieldError id="create-title-error" focusId="create-title" message={errors.title} />
          </div>

          <div className="grid gap-2">
            <p id="create-format-label" className={LABEL_CLASS}>
              진행 방식
              <RequiredMark />
            </p>
            <div role="radiogroup" aria-labelledby="create-format-label" className="grid gap-2 sm:grid-cols-2">
              {CREATE_FORMAT_OPTIONS.map((option) => {
                const checked = state.format === option.value;
                const titleId = `create-format-${option.value}-title`;
                const descriptionId = `create-format-${option.value}-description`;
                return (
                  <label
                    key={option.value}
                    className={[
                      'relative flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue-500',
                      checked ? 'border-blue-500 bg-[var(--blue50)]' : 'border-[var(--border)]',
                      pending ? 'cursor-not-allowed opacity-60' : '',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name={formatGroupName}
                      checked={checked}
                      disabled={pending}
                      onChange={() => dispatch({ type: 'set-format', value: option.value })}
                      aria-labelledby={titleId}
                      aria-describedby={descriptionId}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={[
                        'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border',
                        checked ? 'border-blue-500' : 'border-[var(--border-strong)]',
                      ].join(' ')}
                    >
                      {checked ? <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span id={titleId} className="block text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">
                        {option.label}
                      </span>
                      <span id={descriptionId} className="mt-0.5 block text-[length:var(--font-size-caption)] text-[var(--text-caption)]">
                        {option.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TournamentDatetimeField
              id="create-scheduled-at"
              label="대회 시작"
              value={state.scheduledAt}
              onChange={(value) => {
                dispatch({ type: 'set-scheduled-at', value });
                clearErrors('scheduledAt', 'registrationDeadlineAt');
              }}
              required
              disabled={pending}
              error={errors.scheduledAt}
            />
            <TournamentDatetimeField
              id="create-registration-deadline-at"
              label="신청 마감"
              value={state.registrationDeadlineAt}
              onChange={(value) => {
                dispatch({ type: 'set-registration-deadline', value });
                clearErrors('registrationDeadlineAt');
              }}
              required
              disabled={pending}
              hint={deadlineHint?.text}
              hintTone={deadlineHint?.tone === 'warning' ? 'warning' : 'default'}
              error={errors.registrationDeadlineAt}
            />
          </div>

          <CreateTeamCountField
            value={state.teamCount}
            format={state.format}
            error={errors.teamCount}
            disabled={pending}
            onStep={(delta) => {
              dispatch({ type: 'step-team-count', delta });
              clearErrors('teamCount');
            }}
            onChange={(value) => {
              dispatch({ type: 'set-field', field: 'teamCount', value });
              clearErrors('teamCount');
            }}
          />

          <TournamentGenderChoiceField
            value={state.genderCategory}
            defaultValue={DEFAULT_GENDER_CATEGORY}
            disabled={pending}
            hint={state.genderCategory === 'mixed' ? undefined : '혼성을 고르면 남녀 인원 조건을 함께 정할 수 있어요.'}
            onChange={(value) => {
              dispatch({ type: 'set-gender', value });
              clearErrors('genderMinMale', 'genderMaxMale', 'genderMinFemale', 'genderMaxFemale', 'genderQuota');
            }}
          >
            {state.genderCategory === 'mixed' ? (
              <GenderQuotaGroup state={state} errors={errors} onChange={setQuota} />
            ) : null}
          </TournamentGenderChoiceField>
        </div>

        <p className="mt-3 flex items-start gap-2 text-[length:var(--font-size-label)] text-[var(--text-caption)]">
          <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          장소·참가비·경기 규칙·이미지는 초안을 만든 뒤 「대회 정보」에서 채워요.
        </p>

        <CreateBottomBar status={summarizeBarStatus(state, errors)} pending={pending} cancelHref="/admin/tournaments" />
      </form>
      <AdminToasts toasts={toasts} />
    </div>
  );
}

function GenderQuotaGroup({
  state,
  errors,
  onChange,
}: {
  state: CreateFormState;
  errors: CreateFormErrors;
  onChange: (field: 'genderMinMale' | 'genderMaxMale' | 'genderMinFemale' | 'genderMaxFemale', value: string) => void;
}) {
  return (
    <div
      role="group"
      aria-labelledby="create-gender-quota-label"
      className="mt-3 grid gap-3 rounded-xl bg-[var(--surface-soft)] p-4"
    >
      <div>
        <p id="create-gender-quota-label" className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-strong)]">
          팀당 남녀 인원
        </p>
        <p className="mt-0.5 text-[length:var(--font-size-caption)] text-[var(--text-caption)]">
          선택, 비워 두면 조건 없이 받아요
        </p>
      </div>
      {GENDER_QUOTA_ROWS.map((row) => (
        <QuotaRow key={row.label} row={row} state={state} errors={errors} onChange={onChange} />
      ))}
      <FieldError id="create-gender-quota-error" focusId="create-gender-min-male" message={errors.genderQuota} />
    </div>
  );
}

function QuotaRow({
  row,
  state,
  errors,
  onChange,
}: {
  row: (typeof GENDER_QUOTA_ROWS)[number];
  state: CreateFormState;
  errors: CreateFormErrors;
  onChange: (field: 'genderMinMale' | 'genderMaxMale' | 'genderMinFemale' | 'genderMaxFemale', value: string) => void;
}) {
  const minError = errors[row.min];
  const maxError = errors[row.max];
  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-2">
        <span className="w-10 shrink-0 text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">{row.label}</span>
        <input
          id={row.minId}
          type="number"
          inputMode="numeric"
          min={0}
          max={50}
          placeholder="최소"
          aria-label={`${row.label} 최소`}
          value={state[row.min]}
          onChange={(event) => onChange(row.min, event.target.value)}
          aria-invalid={Boolean(minError)}
          aria-describedby={minError ? `${row.minId}-error` : undefined}
          className="tm-input max-w-[96px]"
        />
        <span aria-hidden="true" className="text-[var(--text-caption)]">~</span>
        <input
          id={row.maxId}
          type="number"
          inputMode="numeric"
          min={0}
          max={50}
          placeholder="최대"
          aria-label={`${row.label} 최대`}
          value={state[row.max]}
          onChange={(event) => onChange(row.max, event.target.value)}
          aria-invalid={Boolean(maxError)}
          aria-describedby={maxError ? `${row.maxId}-error` : undefined}
          className="tm-input max-w-[96px]"
        />
        <span className="text-[length:var(--font-size-body-sm)] text-[var(--text-body)]">명</span>
      </div>
      <FieldError id={`${row.minId}-error`} focusId={row.minId} message={minError} />
      <FieldError id={`${row.maxId}-error`} focusId={row.maxId} message={maxError} />
    </div>
  );
}
