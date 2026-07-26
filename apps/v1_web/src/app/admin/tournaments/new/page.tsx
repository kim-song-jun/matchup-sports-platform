'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, ChevronLeft, Copy } from 'lucide-react';
import { useReducer, useState } from 'react';
import {
  useV1AdminTournaments,
  useV1CreateTournament,
  useV1MasterSports,
  useV1UploadImages,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { formatWithComma, onlyDigits } from '@/lib/number-format';
import type { V1TournamentFormat, V1TournamentGenderCategory } from '@/types/api';
import { AdminPageHeader, AdminToasts, useAdminToast } from '@/components/admin';
import { CoverImageUploader } from '@/components/admin/tournaments/cover-image-uploader';
import {
  PrizeBreakdownEditor,
  type TournamentPrizeRow,
} from '@/components/admin/tournaments/prize-breakdown-editor';
import {
  PromoCardFields,
  type TournamentPromoCardValue,
} from '@/components/admin/tournaments/promo-card-fields';
import { TournamentDatetimeField } from '@/components/admin/tournaments/tournament-datetime-field';
import {
  INITIAL_TOURNAMENT_CREATE_STATE,
  TOURNAMENT_CREATE_STEPS,
  buildTournamentCreatePayload,
  canSubmitTournamentCreate,
  tournamentCreateReducer,
  validateTournamentCreateStep,
  type TournamentCreateAction,
  type TournamentCreateState,
} from './tournament-create-model';

const inputClass =
  'h-[44px] w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-caption)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';
const textareaClass =
  'w-full resize-none rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-caption)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';

export default function AdminTournamentsNewPage() {
  const router = useRouter();
  const { toasts, showToast } = useAdminToast();
  const [state, dispatch] = useReducer(
    tournamentCreateReducer,
    INITIAL_TOURNAMENT_CREATE_STATE,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [promoUploadingSlot, setPromoUploadingSlot] = useState<'promoHome' | 'promoList' | null>(
    null,
  );
  const { data: sports, isPending: sportsPending } = useV1MasterSports();
  const { data: previousTournaments } = useV1AdminTournaments({ limit: 50 });
  const createTournament = useV1CreateTournament();
  const uploadImages = useV1UploadImages();
  const pending = createTournament.isPending;
  const selectedSport = sports?.find((sport) => sport.id === state.sportId);
  const previousWithBank = previousTournaments?.items.find(
    (tournament) => tournament.bankName || tournament.bankAccount || tournament.bankHolder,
  );

  const clearError = (field: string) => {
    setErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const setField = (
    field: Exclude<
      keyof TournamentCreateState,
      'step' | 'prizeRows' | 'promoHome' | 'promoList'
    >,
    value: string | boolean | null,
  ) => {
    dispatch({ type: 'set-field', field, value } as TournamentCreateAction);
    clearError(field);
  };

  const goToStep = (nextStep: number) => {
    if (nextStep < state.step) {
      dispatch({ type: 'set-step', step: nextStep });
      setErrors({});
      return;
    }
    for (let step = 0; step < nextStep; step += 1) {
      const stepErrors = validateTournamentCreateStep(state, step);
      if (Object.keys(stepErrors).length > 0) {
        dispatch({ type: 'set-step', step });
        setErrors(stepErrors);
        return;
      }
    }
    dispatch({ type: 'set-step', step: nextStep });
    setErrors({});
  };

  const goNext = () => {
    const stepErrors = validateTournamentCreateStep(state);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    dispatch({ type: 'set-step', step: state.step + 1 });
    setErrors({});
  };

  const handleCoverUpload = async (file: File) => {
    try {
      const uploaded = await uploadImages.mutateAsync([file]);
      const url = uploaded.urls[0];
      if (!url) throw new Error('이미지 업로드 결과가 비어 있어요.');
      setField('coverImageUrl', url);
    } catch (error) {
      showToast(extractErrorMessage(error, '커버 이미지 업로드에 실패했어요.'), 'error');
    }
  };

  const handlePromoUpload = async (
    slot: 'promoHome' | 'promoList',
    file: File,
  ) => {
    setPromoUploadingSlot(slot);
    try {
      const uploaded = await uploadImages.mutateAsync([file]);
      const url = uploaded.urls[0];
      if (!url) throw new Error('이미지 업로드 결과가 비어 있어요.');
      dispatch({
        type: 'patch-promo',
        slot,
        patch: { imageUrl: url },
      });
    } catch (error) {
      showToast(extractErrorMessage(error, '홍보 이미지 업로드에 실패했어요.'), 'error');
    } finally {
      setPromoUploadingSlot(null);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const allErrors = Object.assign(
      {},
      ...[0, 1, 2, 3].map((step) => validateTournamentCreateStep(state, step)),
    ) as Record<string, string>;
    if (!canSubmitTournamentCreate(state)) {
      setErrors(allErrors);
      const firstInvalidStep = [0, 1, 2, 3].find(
        (step) => Object.keys(validateTournamentCreateStep(state, step)).length > 0,
      );
      if (firstInvalidStep !== undefined) {
        dispatch({ type: 'set-step', step: firstInvalidStep });
      }
      return;
    }

    createTournament.mutate(buildTournamentCreatePayload(state), {
      onSuccess: (tournament) => {
        showToast('대회를 만들었어요.', 'success');
        router.push(`/admin/tournaments/${tournament.id}`);
      },
      onError: (error) => {
        showToast(extractErrorMessage(error, '대회 생성에 실패했어요.'), 'error');
      },
    });
  };

  return (
    <>
      <div className="mb-3">
        <Link
          href="/admin/tournaments"
          className="inline-flex min-h-[44px] items-center gap-1 rounded text-sm text-[var(--text-caption)] hover:text-[var(--text-body)] focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          대회 목록으로
        </Link>
      </div>

      <AdminPageHeader
        eyebrow="대회 관리"
        title="새 대회 만들기"
        description="필요한 내용을 네 단계로 나눠 입력하고, 마지막에 공개 화면을 확인하세요."
      />

      <form onSubmit={handleSubmit} noValidate className="pb-28">
        <WizardStepper currentStep={state.step} onSelect={goToStep} />

        <div className="mx-auto mt-5 max-w-4xl rounded-2xl border border-[var(--border)] bg-white">
          <div className="border-b border-[var(--border)] px-5 py-5 sm:px-7">
            <p className="text-xs font-bold text-blue-600">
              STEP {state.step + 1} / {TOURNAMENT_CREATE_STEPS.length}
            </p>
            <h2 className="mt-1 text-xl font-bold text-[var(--text-strong)]">
              {TOURNAMENT_CREATE_STEPS[state.step].title}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-caption)]">
              {TOURNAMENT_CREATE_STEPS[state.step].description}
            </p>
          </div>

          <div className="px-5 py-6 sm:px-7">
            {state.step === 0 ? (
              <BasicStep
                state={state}
                sports={sports ?? []}
                sportsPending={sportsPending}
                pending={pending}
                errors={errors}
                dispatch={dispatch}
                setField={setField}
              />
            ) : null}
            {state.step === 1 ? (
              <ScheduleStep
                state={state}
                pending={pending}
                errors={errors}
                dispatch={dispatch}
                setField={setField}
                clearError={clearError}
              />
            ) : null}
            {state.step === 2 ? (
              <ParticipationStep
                state={state}
                pending={pending}
                errors={errors}
                setField={setField}
                previousWithBank={previousWithBank}
                dispatch={dispatch}
                showToast={showToast}
              />
            ) : null}
            {state.step === 3 ? (
              <PresentationStep
                state={state}
                pending={pending}
                uploadPending={uploadImages.isPending}
                promoUploadingSlot={promoUploadingSlot}
                errors={errors}
                dispatch={dispatch}
                setField={setField}
                onCoverUpload={handleCoverUpload}
                onPromoUpload={handlePromoUpload}
                fallback={{
                  title: state.title.trim() || '새 대회',
                  venue: state.venue.trim() || null,
                  sportName: selectedSport?.name ?? null,
                }}
              />
            ) : null}
          </div>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-white/95 px-4 py-3 backdrop-blur lg:pl-[var(--admin-sidebar-width,0px)]">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
            {state.step === 0 ? (
              <Link
                href="/admin/tournaments"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[var(--border)] px-5 text-sm font-semibold text-[var(--text-body)]"
              >
                취소
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => goToStep(state.step - 1)}
                disabled={pending}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[var(--border)] px-5 text-sm font-semibold text-[var(--text-body)] disabled:opacity-50"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                이전
              </button>
            )}

            {state.step < TOURNAMENT_CREATE_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={pending}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-500 px-6 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
              >
                다음
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={pending || uploadImages.isPending || promoUploadingSlot !== null}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-500 px-6 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
              >
                <Check size={16} aria-hidden="true" />
                {pending ? '만드는 중…' : '대회 만들기'}
              </button>
            )}
          </div>
        </div>
      </form>

      <AdminToasts toasts={toasts} />
    </>
  );
}

function WizardStepper({
  currentStep,
  onSelect,
}: {
  currentStep: number;
  onSelect: (step: number) => void;
}) {
  return (
    <nav aria-label="대회 생성 단계" className="mx-auto max-w-4xl">
      <ol className="grid grid-cols-4 gap-1 rounded-2xl border border-[var(--border)] bg-white p-2 sm:gap-2">
        {TOURNAMENT_CREATE_STEPS.map((step, index) => {
          const active = index === currentStep;
          const complete = index < currentStep;
          return (
            <li key={step.title}>
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-current={active ? 'step' : undefined}
                className={[
                  'flex min-h-[64px] w-full items-center gap-2 rounded-xl px-2 text-left transition-colors sm:px-3',
                  active ? 'bg-blue-50 text-blue-700' : 'text-[var(--text-caption)] hover:bg-[var(--grey50)]',
                ].join(' ')}
              >
                <span
                  className={[
                    'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold',
                    active
                      ? 'bg-blue-500 text-white'
                      : complete
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-[var(--grey100)] text-[var(--text-caption)]',
                  ].join(' ')}
                >
                  {complete ? <Check size={14} aria-hidden="true" /> : index + 1}
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block truncate text-xs font-bold">{step.title}</span>
                  <span className="mt-0.5 block truncate text-[11px]">{step.description}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

type SetField = (
  field: Exclude<
    keyof TournamentCreateState,
    'step' | 'prizeRows' | 'promoHome' | 'promoList'
  >,
  value: string | boolean | null,
) => void;

type SportOption = {
  id: string;
  name: string;
};

function BasicStep({
  state,
  sports,
  sportsPending,
  pending,
  errors,
  dispatch,
  setField,
}: {
  state: TournamentCreateState;
  sports: SportOption[];
  sportsPending: boolean;
  pending: boolean;
  errors: Record<string, string>;
  dispatch: React.Dispatch<TournamentCreateAction>;
  setField: SetField;
}) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field id="sport-id" label="종목" required error={errors.sportId}>
          <select
            id="sport-id"
            value={state.sportId}
            onChange={(event) => setField('sportId', event.target.value)}
            disabled={pending || sportsPending}
            className={inputClass}
          >
            <option value="">종목 선택</option>
            {sports.map((sport) => (
              <option key={sport.id} value={sport.id}>
                {sport.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="title" label="대회명" required error={errors.title}>
          <input
            id="title"
            value={state.title}
            onChange={(event) => setField('title', event.target.value)}
            disabled={pending}
            maxLength={120}
            placeholder="예: 2026 서울 풋살 오픈"
            className={inputClass}
          />
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold text-[var(--text-body)]">대회 형식</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {([
            ['group_knockout', '조별리그 + 토너먼트', '예선 순위 후 결선'],
            ['knockout', '토너먼트', '패하면 탈락'],
            ['league', '리그', '모든 팀이 순위 경쟁'],
          ] as const).map(([value, label, description]) => (
            <label
              key={value}
              className={[
                'cursor-pointer rounded-xl border p-3 transition-colors',
                state.format === value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-[var(--border)] hover:border-[var(--border-strong)]',
              ].join(' ')}
            >
              <input
                type="radio"
                name="format"
                value={value}
                checked={state.format === value}
                onChange={() => setField('format', value as V1TournamentFormat)}
                className="sr-only"
              />
              <span className="block text-sm font-bold text-[var(--text-strong)]">{label}</span>
              <span className="mt-1 block text-xs text-[var(--text-caption)]">{description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-[var(--text-body)]">성별 카테고리</legend>
        <p className="mt-1 text-xs text-[var(--text-caption)]">
          혼성 대회는 3단계에서 남녀 최소·최대 인원을 설정할 수 있어요.
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {([
            ['mixed', '혼성'],
            ['male', '남성부'],
            ['female', '여성부'],
          ] as const).map(([value, label]) => (
            <label
              key={value}
              className={[
                'grid min-h-[52px] cursor-pointer place-items-center rounded-xl border text-sm font-bold transition-colors',
                state.genderCategory === value
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-[var(--border)] text-[var(--text-body)]',
              ].join(' ')}
            >
              <input
                type="radio"
                name="gender-category"
                checked={state.genderCategory === value}
                onChange={() => {
                  dispatch({
                    type: 'set-field',
                    field: 'genderCategory',
                    value: value as V1TournamentGenderCategory,
                  });
                }}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function ScheduleStep({
  state,
  pending,
  errors,
  dispatch,
  setField,
  clearError,
}: {
  state: TournamentCreateState;
  pending: boolean;
  errors: Record<string, string>;
  dispatch: React.Dispatch<TournamentCreateAction>;
  setField: SetField;
  clearError: (field: string) => void;
}) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        <TournamentDatetimeField
          id="scheduled-at"
          label="대회 시작"
          value={state.scheduledAt}
          onChange={(value) => {
            dispatch({ type: 'set-scheduled-at', value });
            clearError('scheduledAt');
          }}
          required
          disabled={pending}
          error={errors.scheduledAt}
        />
        <TournamentDatetimeField
          id="scheduled-end-at"
          label="대회 종료"
          value={state.scheduledEndAt}
          onChange={(value) => setField('scheduledEndAt', value)}
          disabled={pending}
          min={state.scheduledAt || undefined}
          error={errors.scheduledEndAt}
          hint="하루 대회라면 비워 둘 수 있어요."
        />
        <TournamentDatetimeField
          id="registration-deadline-at"
          label="신청 마감"
          value={state.registrationDeadlineAt}
          onChange={(value) => {
            dispatch({ type: 'set-registration-deadline', value });
            clearError('registrationDeadlineAt');
          }}
          required
          disabled={pending}
          error={errors.registrationDeadlineAt}
          hint="대회 시작 D-3 23:59를 자동 제안해요. 직접 바꾸면 이후에는 덮어쓰지 않아요."
        />
        <TournamentDatetimeField
          id="roster-deadline-at"
          label="명단 제출 마감"
          value={state.rosterDeadlineAt}
          onChange={(value) => {
            dispatch({ type: 'set-roster-deadline', value });
            clearError('rosterDeadlineAt');
          }}
          required
          disabled={pending}
          error={errors.rosterDeadlineAt}
          hint="대회 시작 D-7 23:59를 자동 제안해요."
        />
      </div>
      <Field id="venue" label="장소" hint="입력한 장소는 서버에서 지도 좌표를 찾아 저장해요.">
        <input
          id="venue"
          value={state.venue}
          onChange={(event) => setField('venue', event.target.value)}
          disabled={pending}
          maxLength={200}
          placeholder="예: 서울월드컵경기장 보조구장"
          className={inputClass}
        />
      </Field>
    </div>
  );
}

function ParticipationStep({
  state,
  pending,
  errors,
  setField,
  previousWithBank,
  dispatch,
  showToast,
}: {
  state: TournamentCreateState;
  pending: boolean;
  errors: Record<string, string>;
  setField: SetField;
  previousWithBank:
    | {
        bankName: string | null;
        bankAccount: string | null;
        bankHolder: string | null;
      }
    | undefined;
  dispatch: React.Dispatch<TournamentCreateAction>;
  showToast: (message: string, variant?: 'success' | 'error') => void;
}) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField
          id="team-count"
          label="참가 팀 수"
          value={state.teamCount}
          onChange={(value) => setField('teamCount', value)}
          min={2}
          max={64}
          disabled={pending}
          error={errors.teamCount}
          required
        />
        <NumberField
          id="min-players"
          label="최소 선수 수"
          value={state.minPlayers}
          onChange={(value) => setField('minPlayers', value)}
          min={1}
          max={50}
          disabled={pending}
          error={errors.minPlayers}
          required
        />
        <NumberField
          id="max-players"
          label="최대 선수 수"
          value={state.maxPlayers}
          onChange={(value) => setField('maxPlayers', value)}
          min={1}
          max={50}
          disabled={pending}
          error={errors.maxPlayers}
          required
        />
      </div>

      {state.genderCategory === 'mixed' ? (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--grey50)] p-4">
          <h3 className="text-sm font-bold text-[var(--text-strong)]">혼성 명단 쿼터</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--text-caption)]">
            선수 추가는 막지 않고, 운영자가 명단을 확정할 때 이 조건을 검사해요.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <NumberField
              id="gender-min-male"
              label="남성 최소"
              value={state.genderMinMale}
              onChange={(value) => setField('genderMinMale', value)}
              min={0}
              max={50}
              disabled={pending}
              error={errors.genderMinMale}
            />
            <NumberField
              id="gender-max-male"
              label="남성 최대"
              value={state.genderMaxMale}
              onChange={(value) => setField('genderMaxMale', value)}
              min={0}
              max={50}
              disabled={pending}
              error={errors.genderMaxMale}
            />
            <NumberField
              id="gender-min-female"
              label="여성 최소"
              value={state.genderMinFemale}
              onChange={(value) => setField('genderMinFemale', value)}
              min={0}
              max={50}
              disabled={pending}
              error={errors.genderMinFemale}
            />
            <NumberField
              id="gender-max-female"
              label="여성 최대"
              value={state.genderMaxFemale}
              onChange={(value) => setField('genderMaxFemale', value)}
              min={0}
              max={50}
              disabled={pending}
              error={errors.genderMaxFemale}
            />
          </div>
          {errors.genderQuota ? (
            <p role="alert" className="mt-3 text-xs font-semibold text-[var(--red500)]">
              {errors.genderQuota}
            </p>
          ) : null}
        </section>
      ) : (
        <div className="rounded-xl bg-[var(--grey50)] p-4 text-sm text-[var(--text-caption)]">
          {state.genderCategory === 'male' ? '남성부' : '여성부'}는 별도 쿼터 없이 카테고리만
          표시해요.
        </div>
      )}

      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-[var(--text-strong)]">참가비·정산 계좌</h3>
            <p className="mt-1 text-xs text-[var(--text-caption)]">
              참가비가 0원이면 무료 대회로 표시돼요.
            </p>
          </div>
          <button
            type="button"
            disabled={!previousWithBank || pending}
            onClick={() => {
              if (!previousWithBank) return;
              dispatch({
                type: 'copy-bank',
                bankName: previousWithBank.bankName ?? '',
                bankAccount: previousWithBank.bankAccount ?? '',
                bankHolder: previousWithBank.bankHolder ?? '',
              });
              showToast('직전 대회의 계좌 정보를 불러왔어요.', 'success');
            }}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--text-body)] disabled:opacity-45"
          >
            <Copy size={15} aria-hidden="true" />
            직전 대회 불러오기
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="entry-fee" label="참가비" error={errors.entryFee}>
            <input
              id="entry-fee"
              inputMode="numeric"
              value={formatWithComma(state.entryFee)}
              onChange={(event) => setField('entryFee', onlyDigits(event.target.value))}
              disabled={pending}
              aria-invalid={Boolean(errors.entryFee)}
              className={inputClass}
            />
          </Field>
          <Field id="bank-name" label="은행명" error={errors.bankName}>
            <input
              id="bank-name"
              value={state.bankName}
              onChange={(event) => setField('bankName', event.target.value)}
              disabled={pending}
              maxLength={60}
              aria-invalid={Boolean(errors.bankName)}
              className={inputClass}
            />
          </Field>
          <Field id="bank-account" label="계좌번호" error={errors.bankAccount}>
            <input
              id="bank-account"
              value={state.bankAccount}
              onChange={(event) => setField('bankAccount', event.target.value)}
              disabled={pending}
              maxLength={60}
              aria-invalid={Boolean(errors.bankAccount)}
              className={inputClass}
            />
          </Field>
          <Field id="bank-holder" label="예금주" error={errors.bankHolder}>
            <input
              id="bank-holder"
              value={state.bankHolder}
              onChange={(event) => setField('bankHolder', event.target.value)}
              disabled={pending}
              maxLength={60}
              aria-invalid={Boolean(errors.bankHolder)}
              className={inputClass}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

function PresentationStep({
  state,
  pending,
  uploadPending,
  promoUploadingSlot,
  errors,
  dispatch,
  setField,
  onCoverUpload,
  onPromoUpload,
  fallback,
}: {
  state: TournamentCreateState;
  pending: boolean;
  uploadPending: boolean;
  promoUploadingSlot: 'promoHome' | 'promoList' | null;
  errors: Record<string, string>;
  dispatch: React.Dispatch<TournamentCreateAction>;
  setField: SetField;
  onCoverUpload: (file: File) => Promise<void>;
  onPromoUpload: (slot: 'promoHome' | 'promoList', file: File) => Promise<void>;
  fallback: { title: string; venue: string | null; sportName: string | null };
}) {
  return (
    <div className="grid gap-6">
      <CoverImageUploader
        value={state.coverImageUrl}
        onSelectFile={(file) => void onCoverUpload(file)}
        onClear={() => setField('coverImageUrl', null)}
        uploading={uploadPending && promoUploadingSlot === null}
        disabled={pending}
        eager
      />

      <section className="grid gap-4">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-strong)]">상금·시상</h3>
          <p className="mt-1 text-xs text-[var(--text-caption)]">
            배분 합계를 확인하면서 실제 공개 카드 형태로 미리 볼 수 있어요.
          </p>
        </div>
        <PrizeBreakdownEditor
          rows={state.prizeRows}
          onChange={(rows: TournamentPrizeRow[]) => dispatch({ type: 'set-prize-rows', rows })}
          prizePool={state.prizePool}
          onPrizePoolChange={(value) => setField('prizePool', value)}
          disabled={pending}
        />
        <Field id="prize-summary" label="상품 및 상금 요약">
          <textarea
            id="prize-summary"
            value={state.prizeSummary}
            onChange={(event) => setField('prizeSummary', event.target.value)}
            disabled={pending}
            maxLength={500}
            rows={2}
            placeholder="예: 우승팀 현금 100만원 + 트로피"
            className={textareaClass}
          />
        </Field>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Field id="rules-text" label="대회 규정">
          <textarea
            id="rules-text"
            value={state.rulesText}
            onChange={(event) => setField('rulesText', event.target.value)}
            disabled={pending}
            maxLength={10_000}
            rows={5}
            className={textareaClass}
          />
        </Field>
        <Field id="refund-policy-text" label="환불 정책">
          <textarea
            id="refund-policy-text"
            value={state.refundPolicyText}
            onChange={(event) => setField('refundPolicyText', event.target.value)}
            disabled={pending}
            maxLength={2_000}
            rows={5}
            className={textareaClass}
          />
        </Field>
      </section>

      <section className="grid gap-4">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-strong)]">홍보 카드</h3>
          <p className="mt-1 text-xs text-[var(--text-caption)]">
            생성과 동시에 홈·대회 목록 홍보를 준비할 수 있어요. 노출은 각 카드에서 켜세요.
          </p>
        </div>
        <PromoCardFields
          variant="home"
          value={state.promoHome}
          onChange={(value: TournamentPromoCardValue) =>
            dispatch({ type: 'set-promo', slot: 'promoHome', value })
          }
          fallback={fallback}
          onSelectImage={(file) => void onPromoUpload('promoHome', file)}
          uploading={promoUploadingSlot === 'promoHome'}
          disabled={pending}
          priorityError={errors.promoHomePriority}
        />
        <PromoCardFields
          variant="list"
          value={state.promoList}
          onChange={(value: TournamentPromoCardValue) =>
            dispatch({ type: 'set-promo', slot: 'promoList', value })
          }
          fallback={fallback}
          onSelectImage={(file) => void onPromoUpload('promoList', file)}
          uploading={promoUploadingSlot === 'promoList'}
          disabled={pending}
          priorityError={errors.promoListPriority}
        />
      </section>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  disabled,
  error,
  required = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  disabled: boolean;
  error?: string;
  required?: boolean;
}) {
  return (
    <Field id={id} label={label} required={required} error={error}>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        className={inputClass}
      />
    </Field>
  );
}

function Field({
  id,
  label,
  required = false,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-[var(--text-body)]">
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="ml-0.5 text-[var(--red500)]">*</span>
            <span className="sr-only"> (필수)</span>
          </>
        ) : null}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs font-medium text-[var(--red500)]">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-5 text-[var(--text-caption)]">{hint}</p>
      ) : null}
    </div>
  );
}
