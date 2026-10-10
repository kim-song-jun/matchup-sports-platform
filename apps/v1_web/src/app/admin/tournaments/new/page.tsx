'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, ChevronLeft, Copy, Lock } from 'lucide-react';
import { useEffect, useReducer, useRef, useState, type FocusEvent } from 'react';
import {
  useV1AdminTournament,
  useV1AdminTournaments,
  useV1ChangeTournamentStatus,
  useV1CreateTournament,
  useV1LineupSizeOptions,
  useV1MasterSports,
  useV1UpdateTournament,
  useV1UploadImages,
} from '@/hooks/use-v1-api';
import { extractErrorMessage, extractErrorCode } from '@/lib/error-message';
import { formatWithComma, onlyDigits } from '@/lib/number-format';
import type { V1Tournament, V1TournamentFormat, V1TournamentGenderCategory } from '@/types/api';
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
import { resolveTournamentImage } from '@/lib/tournament-promo';
import { TournamentDatetimeField } from '@/components/admin/tournaments/tournament-datetime-field';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import type { PlaceValue } from '@/lib/place';
import { PlacePicker } from '@/components/v1-ui/place-picker';
import { PLACE_NAME_MAX_LENGTH } from '@/lib/place';
import { revealWizardControl, revealWizardStage } from './wizard-stage-viewport';
import { TournamentCard } from '@/app/tournaments/tournament-card';
import {
  CONFIRM_STEP_INDEX,
  INITIAL_TOURNAMENT_CREATE_STATE,
  LAST_INPUT_STEP_INDEX,
  TOURNAMENT_CREATE_STEPS,
  buildTournamentCreatePayload,
  buildTournamentPreviewItem,
  canSubmitTournamentCreate,
  hasPromoFactEdits,
  tournamentCreateReducer,
  isShortLeadTime,
  periodLabels,
  switchPeriodCount,
  validateTournamentCreateStep,
  type TournamentCreateAction,
  type TournamentCreateState,
} from './tournament-create-model';
import { useSaveTournamentPeriodSettings, useTournamentPeriodSettings } from '@/hooks/use-tournament-period-settings';

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

const inputClass =
  'h-[44px] w-full rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-caption)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';
const textareaClass =
  'w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 py-3 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-caption)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';

export default function AdminTournamentsNewPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const draftIdParam = searchParams.get('draftId');
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
  const updateTournament = useV1UpdateTournament(state.draftId ?? '');
  const changeStatus = useV1ChangeTournamentStatus(state.draftId ?? '');
  const uploadImages = useV1UploadImages();
  const savePeriods = useSaveTournamentPeriodSettings();
  const pending = createTournament.isPending || updateTournament.isPending || savePeriods.isPending;
  const selectedSport = sports?.find((sport) => sport.id === state.sportId);
  const previousWithBank = previousTournaments?.items.find(
    (tournament) => tournament.bankName || tournament.bankAccount || tournament.bankHolder,
  );
  const { confirm, ConfirmModal: startRegistrationConfirmModal } = useConfirm();

  // 새로고침·직접 URL 진입(?draftId=…)으로 돌아온 경우 — 메모리 상태는 비어 있지만 이미
  // 서버에 초안이 있으므로, 그 값을 폼에 채우고 확인 단계로 보낸다. state.draftId가 이미
  // 있으면(같은 세션에서 방금 생성) 다시 덮어쓰지 않는다 — 지금 입력 중인 값을 잃으면 안 된다.
  const hydratedRef = useRef(false);
  const draftQuery = useV1AdminTournament(draftIdParam ?? '');
  useEffect(() => {
    if (hydratedRef.current || !draftIdParam || state.draftId || !draftQuery.data) return;
    hydratedRef.current = true;
    if (draftQuery.data.status !== 'draft') {
      // 이미 접수가 시작됐거나 그 이후 상태 — 이 위저드로는 더 이상 이어갈 수 없다.
      showToast('이미 접수를 시작한 대회예요. 관리 화면으로 이동할게요.', 'success');
      router.replace(`/admin/tournaments/${draftQuery.data.id}`);
      return;
    }
    dispatch({ type: 'hydrate-from-draft', tournament: draftQuery.data });
  }, [draftIdParam, state.draftId, draftQuery.data, router, showToast]);

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
    value: string | boolean | PlaceValue | null,
  ) => {
    dispatch({ type: 'set-field', field, value } as TournamentCreateAction);
    clearError(field);
  };

  // 검증 실패로 띄운 오류만 첫 오류 필드로 포커스한다 — 입력하며 오류가 지워지는 갱신은 제외.
  const focusFirstErrorRef = useRef(false);
  const showErrors = (next: Record<string, string>) => {
    focusFirstErrorRef.current = true;
    setErrors(next);
  };

  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const stepFieldsRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const focusRevealFrameRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (focusRevealFrameRef.current !== null) cancelAnimationFrame(focusRevealFrameRef.current);
  }, []);
  const revealFocusedControl = (event: FocusEvent<HTMLDivElement>) => {
    if (focusRevealFrameRef.current !== null) cancelAnimationFrame(focusRevealFrameRef.current);
    focusRevealFrameRef.current = null;
    const control = event.target;
    // First-error scrolling owns its existing smooth animation; portals are not wizard fields.
    if (focusFirstErrorRef.current || !(control instanceof HTMLElement) || !stepFieldsRef.current?.contains(control)) return;
    focusRevealFrameRef.current = requestAnimationFrame(() => {
      focusRevealFrameRef.current = null;
      if (document.activeElement !== control || !control.isConnected || !stepFieldsRef.current?.contains(control)) return;
      revealWizardControl(control, footerRef.current);
    });
  };
  const renderedStepRef = useRef(state.step);
  useEffect(() => {
    if (renderedStepRef.current === state.step) return;
    renderedStepRef.current = state.step;
    // Invalid forward navigation belongs to the error field, without an intermediate heading jump.
    if (focusFirstErrorRef.current) return;
    const heading = stepHeadingRef.current;
    if (!heading) return;
    revealWizardStage(heading, stepFieldsRef.current, footerRef.current, scrollBehavior());
    heading.focus({ preventScroll: true });
  }, [state.step]);

  useEffect(() => {
    if (!focusFirstErrorRef.current) return;
    try {
      // 오류 문구가 `data-error-focus` 로 가리키는 입력에 포커스한다. 그룹 오류는 그룹의 첫 입력을 가리킨다.
      const alert = formRef.current?.querySelector<HTMLElement>('[role="alert"][data-error-focus]');
      if (!alert) return;
      const control = document.getElementById(alert.dataset.errorFocus ?? '');
      (control ?? alert).scrollIntoView({ block: 'center', behavior: scrollBehavior() });
      control?.focus({ preventScroll: true });
    } finally {
      focusFirstErrorRef.current = false;
    }
  }, [errors]);

  const goToStep = (nextStep: number) => {
    // "공개 확인" 단계는 초안이 실제로 만들어진 뒤에만 들어갈 수 있다 — 검증만 통과했다고
    // 스텝 버튼을 직접 눌러 건너뛸 수 있으면, 대회가 없는 채로 "접수 시작하기"를 누르는
    // 상황이 생긴다(잠김 상태, 스테퍼 버튼도 이 조건으로 disabled 처리).
    if (nextStep === CONFIRM_STEP_INDEX && (!state.draftId || state.periodMinutesDirty || pending)) return;
    if (nextStep < state.step) {
      dispatch({ type: 'set-step', step: nextStep });
      setErrors({});
      return;
    }
    for (let step = 0; step < nextStep; step += 1) {
      const stepErrors = validateTournamentCreateStep(state, step);
      if (Object.keys(stepErrors).length > 0) {
        dispatch({ type: 'set-step', step });
        showErrors(stepErrors);
        return;
      }
    }
    dispatch({ type: 'set-step', step: nextStep });
    setErrors({});
  };

  const goNext = () => {
    const stepErrors = validateTournamentCreateStep(state);
    if (Object.keys(stepErrors).length > 0) {
      showErrors(stepErrors);
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

  /**
   * "참가 조건" 다음 단계(상금·홍보)의 주 CTA — 여기서 실제로 대회가 생성(또는, 이미
   * 만든 초안을 수정하러 돌아온 경우 수정)된다. draftId 유무로 POST/PATCH를 가른다 —
   * 이 분기 하나가 "3단계→4단계를 여러 번 오가도 중복 생성되지 않는다"는 계약의 핵심이다.
   */
  const handleCreateOrUpdateDraft = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const allErrors = Object.assign(
      {},
      ...[0, 1, 2, 3].map((step) => validateTournamentCreateStep(state, step)),
    ) as Record<string, string>;
    if (!canSubmitTournamentCreate(state)) {
      showErrors(allErrors);
      const firstInvalidStep = [0, 1, 2, 3].find(
        (step) => Object.keys(validateTournamentCreateStep(state, step)).length > 0,
      );
      if (firstInvalidStep !== undefined) {
        dispatch({ type: 'set-step', step: firstInvalidStep });
      }
      return;
    }

    const payload = buildTournamentCreatePayload(state);

    // 운영자가 경기 시간을 고쳤으면 대회 저장 직후 피리어드 설정으로 저장한다 — 생성 API 는 종목
    // 기본 피리어드로 만들고, 피리어드는 감사·버전 검사를 갖춘 전용 API 가 소유한다.
    const persistPeriods = (tournament: V1Tournament) => {
      // 생성 ID는 즉시 유지하되 두 저장이 모두 끝나야 공개 확인을 허용한다.
      dispatch({ type: 'draft-saved', tournament });
      if (!state.periodMinutesDirty) {
        dispatch({ type: 'draft-created', tournament });
        return;
      }
      savePeriods.mutate(
        {
          tournamentId: tournament.id,
          expectedVersion: tournament.updatedAt,
          periods: state.periodMinutes.map((value) => ({ durationMinutes: Number(value) })),
        },
        {
          onSuccess: (result) => {
            if (!result.expectedVersion) {
              showToast('경기 시간 저장 버전을 확인하지 못했어요. 초안을 다시 불러와 주세요.', 'error');
              return;
            }
            dispatch({ type: 'periods-saved', updatedAt: result.expectedVersion });
            dispatch({ type: 'draft-created', tournament: { ...tournament, updatedAt: result.expectedVersion } });
          },
          onError: (error) => {
            showToast(extractErrorMessage(error, '대회는 초안으로 저장했지만 경기 시간을 저장하지 못했어요. 저장하고 계속하기로 다시 시도해 주세요.'), 'error');
          },
        },
      );
    };

    if (state.draftId) {
      if (!state.draftUpdatedAt) {
        showToast('초안 정보를 다시 불러온 뒤 시도해 주세요.', 'error');
        return;
      }
      updateTournament.mutate({ ...payload, expectedVersion: state.draftUpdatedAt }, {
        onSuccess: (tournament) => {
          persistPeriods(tournament);
        },
        onError: (error) => {
          if (extractErrorCode(error) === 'TOURNAMENT_VERSION_CONFLICT') {
            showToast('다른 곳에서 이미 수정된 초안이에요. 페이지를 새로고침해 최신 내용을 불러와 주세요.', 'error');
            return;
          }
          showToast(extractErrorMessage(error, '대회 수정에 실패했어요.'), 'error');
        },
      });
      return;
    }

    createTournament.mutate(payload, {
      onSuccess: (tournament) => {
        persistPeriods(tournament);
        // draftId를 URL에 남겨 새로고침해도 같은 초안을 이어가고, 다시 만들지 않게 한다.
        router.replace(`${pathname}?draftId=${tournament.id}`);
      },
      onError: (error) => {
        showToast(extractErrorMessage(error, '대회 생성에 실패했어요.'), 'error');
      },
    });
  };

  /** "확인" 단계의 보조 동작 — 초안 상태 그대로 두고 관리 화면으로 이동한다(접수는 나중에). */
  const handleLater = () => {
    if (!state.draftId) return;
    router.push(`/admin/tournaments/${state.draftId}`);
  };

  /** "확인" 단계의 주 CTA — 되돌리기 어려운 전환(초안 → 접수 중)이라 확인 모달을 거친다. */
  const handleStartRegistration = async () => {
    if (!state.draftId || state.periodMinutesDirty || pending) return;
    const ok = await confirm({
      title: '접수를 시작할까요?',
      message:
        '접수를 시작하면 방금 확인한 화면 그대로 참가자에게 공개되고, 바로 신청을 받을 수 있어요. 시작한 뒤에는 초안으로 되돌릴 수 없어요.',
      confirmLabel: '접수 시작하기',
      cancelLabel: '취소',
    });
    if (!ok) return;

    changeStatus.mutate(
      { status: 'open' },
      {
        onSuccess: () => {
          showToast('접수를 시작했어요.', 'success');
          router.push(`/admin/tournaments/${state.draftId}`);
        },
        onError: (error) => {
          showToast(extractErrorMessage(error, '접수 시작에 실패했어요.'), 'error');
        },
      },
    );
  };

  return (
    <>
      <div className="tm-content-enter mb-3">
        <Link
          href="/admin/tournaments"
          className="inline-flex min-h-[44px] items-center gap-1 rounded text-sm text-[var(--text-caption)] hover:text-[var(--text-body)] focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          대회 목록으로
        </Link>
      </div>

      <AdminPageHeader
        eyebrow="플랫폼 · 대회"
        title="새 대회 만들기"
        description="기본 정보부터 참가 조건까지 입력하면 대회가 초안으로 만들어져요. 마지막 확인 화면에서 참가자에게 보일 모습을 확인한 뒤 접수를 시작하세요."
      />

      <form ref={formRef} onSubmit={handleCreateOrUpdateDraft} noValidate className="pb-28">
        <WizardStepper currentStep={state.step} hasDraft={state.draftId !== null && !state.periodMinutesDirty} onSelect={goToStep} />

        <div className="mx-auto mt-5 max-w-4xl rounded-2xl border border-[var(--border)] bg-[var(--card-surface)]">
          <div className="border-b border-[var(--border)] px-5 py-5 sm:px-7">
            <p className="text-xs font-bold text-[var(--blue700)]">
              STEP {state.step + 1} / {TOURNAMENT_CREATE_STEPS.length}
            </p>
            <h2
              ref={stepHeadingRef}
              tabIndex={-1}
              className="mt-1 text-xl font-bold text-[var(--text-strong)] focus:outline-none"
            >
              {TOURNAMENT_CREATE_STEPS[state.step].title}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-caption)]">
              {TOURNAMENT_CREATE_STEPS[state.step].description}
            </p>
          </div>

          <div ref={stepFieldsRef} onFocusCapture={revealFocusedControl} className="px-5 py-6 sm:px-7">
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
                  venue: state.venue?.name ?? null,
                  sportName: selectedSport?.name ?? null,
                }}
              />
            ) : null}
            {state.step === CONFIRM_STEP_INDEX ? (
              <ConfirmStep state={state} sport={selectedSport} />
            ) : null}
          </div>
        </div>

        <div ref={footerRef} className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--card-surface)]/95 px-4 py-3 backdrop-blur lg:pl-[var(--admin-sidebar-width,0px)]">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
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

            {state.step < LAST_INPUT_STEP_INDEX ? (
              <button
                key="wizard-cta-next"
                type="button"
                onClick={goNext}
                disabled={pending}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-500 px-6 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
              >
                다음
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            ) : state.step === LAST_INPUT_STEP_INDEX ? (
              // 여기서 실제로 대회가 생성/수정된다 — "다음"이 아니라 지금 일어날 일을 그대로
              // 말한다(요구사항 #3). 이미 초안이 있으면(이전으로 돌아와 고친 경우) 저장 문구로
              // 바뀐다 — 라벨만 봐도 생성인지 수정인지 알 수 있게.
              //
              // key가 반드시 위 "다음" 버튼과 달라야 한다 — 같으면 React가 같은 <button> DOM
              // 노드를 재사용해 type 속성만 "button"→"submit"으로 그 자리에서 바꿔치기한다.
              // 그러면 "다음"을 누른 그 클릭이, type이 바뀐 그 프레임에 브라우저의 기본
              // submit 처리까지 얹혀서 같은 클릭 한 번으로 즉시 폼이 제출돼 버린다 — 사용자가
              // "다음"을 눌렀을 뿐인데 대회가 생성되는, 이번 작업의 발단이 된 그 버그의 실제
              // 원인이었다(3단계에서 "다음"을 누르면 대회가 생성된다던 신고와 정확히 일치).
              <button
                key="wizard-cta-submit"
                type="submit"
                disabled={pending || uploadImages.isPending || promoUploadingSlot !== null}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-500 px-6 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
              >
                <Check size={16} aria-hidden="true" />
                {pending
                  ? '저장하는 중…'
                  : state.draftId
                    ? '저장하고 계속하기'
                    : '대회 만들기'}
              </button>
            ) : (
              <div key="wizard-cta-confirm" className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleLater}
                  disabled={changeStatus.isPending}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[var(--border)] px-4 text-sm font-semibold text-[var(--text-body)] disabled:opacity-50"
                >
                  나중에 하기
                </button>
                <button
                  type="button"
                  onClick={() => void handleStartRegistration()}
                  disabled={changeStatus.isPending}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-500 px-6 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
                >
                  <Check size={16} aria-hidden="true" />
                  {changeStatus.isPending ? '시작하는 중…' : '접수 시작하기'}
                </button>
              </div>
            )}
          </div>
        </div>
      </form>

      {startRegistrationConfirmModal}
      <AdminToasts toasts={toasts} />
    </>
  );
}

/**
 * done/current/locked 3상태 + 진행률 표시 — components/admin/operation-flag-gate-stepper.tsx의
 * 패턴을 그대로 따른다. "locked"는 오직 확인 단계(CONFIRM_STEP_INDEX)에만 적용된다: 초안이
 * 아직 없으면 버튼 자체를 disabled로 막아 "대회 없이 확인 화면으로 건너뛰기"를 원천 차단한다
 * (goToStep의 방어 로직과 이중화). 나머지 단계는 기존처럼 검증만 통과하면 앞으로 건너뛸 수 있다.
 */
function WizardStepper({
  currentStep,
  hasDraft,
  onSelect,
}: {
  currentStep: number;
  hasDraft: boolean;
  onSelect: (step: number) => void;
}) {
  const doneCount = TOURNAMENT_CREATE_STEPS.filter((_, index) => index < currentStep).length;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-[var(--text-body)]">
          {TOURNAMENT_CREATE_STEPS.length}단계 중 {doneCount}단계 완료
        </p>
      </div>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--grey100)]">
        <div
          className="h-full rounded-full bg-blue-500 transition-[width] duration-150"
          style={{ width: `${(doneCount / TOURNAMENT_CREATE_STEPS.length) * 100}%` }}
        />
      </div>
      <nav aria-label="대회 생성 단계">
        <ol className="grid grid-cols-5 gap-1 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-2 sm:gap-2">
          {TOURNAMENT_CREATE_STEPS.map((step, index) => {
            const active = index === currentStep;
            const done = index < currentStep;
            const locked = index === CONFIRM_STEP_INDEX && !hasDraft && !active;
            const statusLabel = done ? '완료' : active ? '진행 중' : locked ? '잠김' : '';
            return (
              <li key={step.title}>
                <button
                  type="button"
                  onClick={() => onSelect(index)}
                  disabled={locked}
                  aria-current={active ? 'step' : undefined}
                  aria-label={`${index + 1}단계 ${step.title}${statusLabel ? ` — ${statusLabel}` : ''}`}
                  title={step.description}
                  className={[
                    'flex min-h-[64px] w-full items-center gap-2 rounded-xl px-2 text-left transition-colors sm:px-3',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                    active ? 'bg-[var(--blue50)] text-[var(--blue700)]' : 'text-[var(--text-caption)] hover:bg-[var(--grey50)] disabled:hover:bg-transparent',
                  ].join(' ')}
                >
                  <span
                    aria-hidden="true"
                    className={[
                      'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold',
                      // locked는 색상으로는 upcoming(아직 안 온 단계)과 구분하지 않는다 —
                      // 자물쇠 아이콘 자체가 신호이고, 바깥 버튼의 disabled 스타일이 이미
                      // "지금 누를 수 없음"을 전달한다.
                      active
                        ? 'bg-blue-500 text-white'
                        : done
                          ? 'bg-[var(--blue50)] text-[var(--blue700)]'
                          : 'tm-on-tint bg-[var(--grey150)] text-[var(--text-caption)]',
                    ].join(' ')}
                  >
                    {done ? <Check size={14} /> : locked ? <Lock size={12} /> : index + 1}
                  </span>
                  <span className="hidden min-w-0 sm:block" aria-hidden="true">
                    <span className="block truncate text-xs font-bold">{step.title}</span>
                    <span className="mt-0.5 block truncate text-[length:var(--font-size-caption)]">{step.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}

type SetField = (
  field: Exclude<
    keyof TournamentCreateState,
    'step' | 'prizeRows' | 'promoHome' | 'promoList'
  >,
  value: string | boolean | PlaceValue | null,
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

      <fieldset className="min-w-0">
        <legend className="text-sm font-semibold text-[var(--text-body)]">대회 형식</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {([
            ['group_knockout', '조별리그 + 토너먼트', '예선 순위 후 결선'],
            ['knockout', '토너먼트', '패하면 탈락'],
            ['league', '리그 방식', '모든 팀이 순위 경쟁'],
          ] as const).map(([value, label, description]) => (
            <label
              key={value}
              className={[
                'cursor-pointer rounded-xl border p-3 transition-colors',
                state.format === value
                  ? 'tm-on-tint border-blue-500 bg-[var(--blue50)]'
                  : 'border-[var(--border)] hover:border-[var(--border-strong)]',
              ].join(' ')}
            >
              <input
                type="radio"
                name="format"
                value={value}
                checked={state.format === value}
                onChange={() => setField('format', value as V1TournamentFormat)}
                // 접근성 이름을 라디오 자체에 명시적으로 고정한다 — enum 원시값(value=
                // "group_knockout" 등)이 아니라 화면에 보이는 한국어 라벨이 스크린 리더에
                // 그대로 읽혀야 한다.
                aria-label={label}
                className="sr-only"
              />
              <span className="block text-sm font-bold text-[var(--text-strong)]">{label}</span>
              <span className="mt-1 block text-xs text-[var(--text-caption)]">{description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="min-w-0">
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
                  ? 'border-blue-500 bg-[var(--blue50)] text-[var(--blue700)]'
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
  // 대회 시작이 3일 이내면 신청 마감 D-3 자동 제안이 **지난 시각이 될 수 있다**.
  // 그때 모델이 자동 채움을 비우므로, 여기서는 왜 비었는지·무엇을 해야 하는지 알려 준다.
  // 이 경고가 없으면 운영자는 필수 항목이 이유 없이 빈 것으로 본다.
  const shortLeadTime = isShortLeadTime(state.scheduledAt);
  return (
    <div className="grid gap-5">
      {shortLeadTime && (
        <p
          role="status"
          className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3 text-sm text-[var(--orange700)]"
        >
          대회 시작이 3일 이내예요. 신청 마감을 직접 정해 주세요 — 자동 제안(시작 D-3)이 이미 지난
          시각이 될 수 있고, 그러면 팀이 신청할 수 없어요.
        </p>
      )}
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
          hint={
            shortLeadTime
              ? '대회 시작이 가까워 자동 제안이 지난 시각이 될 수 있어요. 마감을 직접 정해 주세요.'
              : '대회 시작 D-3 23:59를 자동 제안해요. 직접 바꾸면 이후에는 덮어쓰지 않아요.'
          }
        />
        <TournamentDatetimeField
          id="roster-deadline-at"
          label="명단 제출 마감"
          value={state.rosterDeadlineAt}
          onChange={(value) => {
            dispatch({ type: 'set-roster-deadline', value });
            clearError('rosterDeadlineAt');
          }}
          disabled={pending}
          error={errors.rosterDeadlineAt}
          hint="비워 두면 따로 마감하지 않아요. 정하면 신청 마감과 같거나 그 뒤여야 해요."
        />
      </div>
      <PlacePicker
        maxLength={PLACE_NAME_MAX_LENGTH.tournament}
        id="venue"
        label="장소"
        value={state.venue}
        onChange={(place) => setField('venue', place)}
        disabled={pending}
        placeholder="예: 서울월드컵경기장 보조구장"
      />
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
  const {
    data: lineupSizeOptions,
    isPending: lineupSizeOptionsPending,
    isError: lineupSizeOptionsFailed,
  } = useV1LineupSizeOptions(state.sportId || null);
  // '허용 교체 횟수' 입력칸을 그리는 조건 — 입력칸 렌더와 바깥 항목의 오류 표시가 이 값 하나를 같이 쓴다.
  const substitutionCountInputShown =
    !lineupSizeOptionsPending &&
    !lineupSizeOptionsFailed &&
    Boolean(lineupSizeOptions?.supported) &&
    state.substitutionMode === 'limited';

  // 종목의 선택지가 로드되면, 관리자가 아직 아무것도 고르지 않았을 때만 canonical
  // 기본값을 자동으로 채워 넣는다 — 값을 이미 골랐거나 다시 비운(종목 변경) 상태를
  // 덮어쓰지 않는다. dispatch는 useReducer가 주는 안정적인 참조라 매 렌더 재실행을
  // 걱정할 필요가 없다(setField는 매 렌더 새로 만들어져 effect 의존성으로 쓰기 부적절).
  useEffect(() => {
    if (state.lineupMaxPlayers !== '') return;
    if (!lineupSizeOptions?.supported || lineupSizeOptions.defaultMaxPlayers === null) return;
    dispatch({
      type: 'set-field',
      field: 'lineupMaxPlayers',
      value: String(lineupSizeOptions.defaultMaxPlayers),
    });
  }, [state.lineupMaxPlayers, lineupSizeOptions, dispatch]);

  // 교체 방식/횟수도 같은 원칙으로 canonical 기본값을 자동 채운다.
  useEffect(() => {
    if (state.substitutionMode !== '') return;
    if (!lineupSizeOptions?.supported || lineupSizeOptions.defaultSubstitutionMode === null) return;
    dispatch({
      type: 'set-field',
      field: 'substitutionMode',
      value: lineupSizeOptions.defaultSubstitutionMode,
    });
    if (lineupSizeOptions.defaultSubstitutionMode === 'limited' && lineupSizeOptions.defaultMaxSubstitutions !== null) {
      dispatch({
        type: 'set-field',
        field: 'maxSubstitutions',
        value: String(lineupSizeOptions.defaultMaxSubstitutions),
      });
    }
  }, [state.substitutionMode, lineupSizeOptions, dispatch]);

  // 경기 시간 기본값 — 초안이 있으면 그 대회의 저장된 피리어드, 없으면 종목 기본값(축구 45·45,
  // 풋살 20·20). 운영자가 고친 값은 reducer 가 덮어쓰지 않는다.
  const draftPeriodSettings = useTournamentPeriodSettings(state.draftId ?? '');
  const periodSource = state.draftId
    ? draftPeriodSettings.data?.periods?.map((period) => period.durationMinutes)
    : lineupSizeOptions?.supported ? lineupSizeOptions.defaultPeriods?.map((period) => period.durationMinutes) : undefined;
  const periodSourceKey = periodSource?.join(',') ?? '';
  useEffect(() => {
    if (periodSourceKey === '') return;
    dispatch({ type: 'prefill-period-minutes', value: periodSourceKey.split(',') });
  }, [periodSourceKey, dispatch]);
  const periodNames = periodLabels(state.periodMinutes.length);
  const periodTotal = state.periodMinutes.reduce((sum, value) => sum + (Number(value) || 0), 0);

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
          label="최소 선수 수 (등록 명단)"
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
          label="최대 선수 수 (등록 명단)"
          value={state.maxPlayers}
          onChange={(value) => setField('maxPlayers', value)}
          min={1}
          max={50}
          disabled={pending}
          error={errors.maxPlayers}
          required
        />
      </div>

      <Field
        id="lineup-max-players"
        label="출전 인원"
        hint="경기장에 실제로 서는 라인업 인원(골키퍼 포함)이에요. 위 선수 수(등록 명단)와는 달라요 — 등록 명단 중 이 인원만 한 경기에 출전할 수 있어요."
      >
        {lineupSizeOptionsPending ? (
          <p className="text-xs text-[var(--text-caption)]">선택지를 불러오는 중이에요…</p>
        ) : lineupSizeOptionsFailed || !lineupSizeOptions ? (
          // 조회 실패를 "미지원 종목"으로 뭉뚱그리면 실제 오류가 숨겨진다(Copilot 리뷰
          // 지적). 이 경우 서버 canonical 기본값이 그대로 적용되긴 하지만, 관리자가
          // 선택하지 못한 이유가 "종목이 원래 안 되는 것"인지 "지금 못 불러온 것"인지
          // 구분되어야 한다.
          <p className="text-xs text-[var(--red700)]">
            출전 인원 선택지를 불러오지 못했어요. 잠시 후 다시 시도해 주세요. 그대로 저장하면 종목 기본값이 적용돼요.
          </p>
        ) : !lineupSizeOptions.supported ? (
          <p className="text-xs text-[var(--text-caption)]">
            이 종목은 아직 출전 인원을 선택할 수 없어요. 기본 규칙을 그대로 적용해요.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2" role="group" aria-label="출전 인원 선택">
            {lineupSizeOptions.options.map((option) => {
              const selected = state.lineupMaxPlayers === String(option);
              return (
                <button
                  key={option}
                  type="button"
                  disabled={pending}
                  onClick={() => setField('lineupMaxPlayers', String(option))}
                  aria-pressed={selected}
                  className={`inline-flex min-h-[44px] items-center rounded-xl border px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 ${
                    selected
                      ? 'border-blue-500 bg-blue-500 text-white'
                      : 'border-[var(--border)] bg-[var(--card-surface)] text-[var(--text-body)] hover:border-blue-500'
                  }`}
                >
                  {option}명
                </button>
              );
            })}
          </div>
        )}
      </Field>

      {state.periodMinutes.length > 0 ? (
        <Field
          id="period-minutes"
          label="경기 시간"
          hint="경기 한 판의 정규 시간이에요(연장 제외). 대진의 끝나는 시간은 시작 + 이 시간 합계로 자동으로 채워요. 대회를 만든 뒤에도 대회 정보의 '피리어드 설정'에서 바꿀 수 있어요."
          error={errors.periodMinutes}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="경기 방식 선택">
              {([
                { count: 2, label: '전·후반' },
                { count: 1, label: '단판' },
              ] as const).map((option) => {
                const selected = state.periodMinutes.length === option.count;
                return (
                  <button
                    key={option.count}
                    type="button"
                    disabled={pending}
                    aria-pressed={selected}
                    onClick={() => {
                      if (!selected) dispatch({ type: 'set-period-minutes', value: switchPeriodCount(state.periodMinutes, option.count) });
                    }}
                    className={`inline-flex min-h-[44px] items-center rounded-xl border px-4 text-[length:var(--font-size-body-sm)] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 ${
                      selected
                        ? 'border-blue-500 bg-blue-500 text-white'
                        : 'border-[var(--border)] bg-[var(--card-surface)] text-[var(--text-body)] hover:border-blue-500'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {state.periodMinutes.map((value, index) => (
                <label key={periodNames[index]} className="grid gap-1 text-[length:var(--font-size-caption)] font-medium text-[var(--text-muted)]">
                  {periodNames[index]} (분)
                  <input
                    id={index === 0 ? 'period-minutes' : undefined}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={240}
                    value={value}
                    disabled={pending}
                    aria-label={`${periodNames[index]} 시간(분)`}
                    aria-invalid={errors.periodMinutes ? true : undefined}
                    onChange={(event) => {
                      const next = [...state.periodMinutes];
                      next[index] = event.target.value;
                      dispatch({ type: 'set-period-minutes', value: next });
                    }}
                    className="h-[44px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                  />
                </label>
              ))}
            </div>
            <p className="text-[length:var(--font-size-caption)] text-[var(--text-caption)]">한 경기 총 {periodTotal}분</p>
          </div>
        </Field>
      ) : null}

      {/* 허용 횟수 오류는 입력칸이 있으면 그 아래(NumberField)에서만 보여요. 입력칸이 안 그려지는 동안에는 바깥 항목이 대신 보여 줘요. */}
      <Field
        id="substitution-mode"
        label="교체 방식"
        hint="경기 중 후보 선수를 주전과 몇 번까지 바꿀 수 있는지예요. 무제한(롤링)은 이미 나갔던 선수도 다시 투입할 수 있어요."
        error={substitutionCountInputShown ? undefined : errors.maxSubstitutions}
      >
        {lineupSizeOptionsPending ? (
          <p className="text-xs text-[var(--text-caption)]">선택지를 불러오는 중이에요…</p>
        ) : lineupSizeOptionsFailed || !lineupSizeOptions ? (
          <p className="text-xs text-[var(--red700)]">
            교체 방식 선택지를 불러오지 못했어요. 잠시 후 다시 시도해 주세요. 그대로 저장하면 종목 기본값이 적용돼요.
          </p>
        ) : !lineupSizeOptions.supported ? (
          <p className="text-xs text-[var(--text-caption)]">
            이 종목은 아직 교체 방식을 선택할 수 없어요. 기본 규칙을 그대로 적용해요.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="교체 방식 선택">
              {lineupSizeOptions.substitutionModes.map((mode) => {
                const selected = state.substitutionMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={pending}
                    onClick={() => setField('substitutionMode', mode)}
                    aria-pressed={selected}
                    className={`inline-flex min-h-[44px] items-center rounded-xl border px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 ${
                      selected
                        ? 'border-blue-500 bg-blue-500 text-white'
                        : 'border-[var(--border)] bg-[var(--card-surface)] text-[var(--text-body)] hover:border-blue-500'
                    }`}
                  >
                    {mode === 'limited' ? '제한' : '무제한(롤링)'}
                  </button>
                );
              })}
            </div>
            {substitutionCountInputShown ? (
              <NumberField
                id="max-substitutions"
                label="허용 교체 횟수"
                value={state.maxSubstitutions}
                onChange={(value) => setField('maxSubstitutions', value)}
                min={0}
                max={50}
                disabled={pending}
                error={errors.maxSubstitutions}
              />
            ) : null}
          </div>
        )}
      </Field>

      {state.format === 'league' ? (
        <Field
          id="minMatchesPerTeam"
          label="최소 경기 수"
          hint="각 팀이 최소 몇 경기를 보장받을지 정해요. 비워두면 검증하지 않아요."
          error={errors.minMatchesPerTeam}
        >
          <input
            id="minMatchesPerTeam"
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            value={state.minMatchesPerTeam}
            onChange={(event) => setField('minMatchesPerTeam', event.target.value)}
            disabled={pending}
            aria-invalid={Boolean(errors.minMatchesPerTeam)}
            className={inputClass}
          />
        </Field>
      ) : null}

      {state.genderCategory === 'mixed' ? (
        <section className="tm-on-tint rounded-2xl border border-[var(--border)] bg-[var(--grey50)] p-4">
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
            <p role="alert" data-error-focus="gender-min-male" className="mt-3 text-xs font-semibold text-[var(--red700)]">
              {errors.genderQuota}
            </p>
          ) : null}
        </section>
      ) : (
        <div className="tm-on-tint rounded-xl bg-[var(--grey50)] p-4 text-sm text-[var(--text-caption)]">
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
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-4 text-sm font-semibold text-[var(--text-body)] disabled:opacity-45"
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

      {/* 카드 정지 규정 — 비워 두면 이 대회에는 적용되지 않는다. 기본값을 채워 두지
          않는 것이 의도다: 운영자가 의식하지 못한 채 정지 규정이 켜진 대회가 만들어지면,
          이미 카드를 받은 선수가 갑자기 못 뛰게 된다. */}
      <section className="grid gap-4 sm:grid-cols-2">
        <Field id="yellow-accumulation-limit" label="경고 누적 출전정지 (장)">
          <input
            id="yellow-accumulation-limit"
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            value={state.yellowAccumulationLimit}
            onChange={(event) => setField('yellowAccumulationLimit', event.target.value)}
            disabled={pending}
            placeholder="비우면 적용 안 함"
            className={inputClass}
          />
          <p className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>
            옐로카드가 이 장수만큼 쌓일 때마다 다음 1경기 출전이 막혀요. 비워 두면 적용하지 않아요.
          </p>
        </Field>
        <Field id="red-card-suspension-matches" label="퇴장 시 출전정지 (경기)">
          <input
            id="red-card-suspension-matches"
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            value={state.redCardSuspensionMatches}
            onChange={(event) => setField('redCardSuspensionMatches', event.target.value)}
            disabled={pending}
            placeholder="비우면 적용 안 함"
            className={inputClass}
          />
          <p className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>
            레드카드 1장당 막히는 경기 수예요. 비워 두면 적용하지 않아요.
          </p>
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
            날짜·장소·상금 문구는 앞 단계에 입력한 대회 정보로 미리 채워 두었고, 직접 고치면
            그 문구는 그대로 유지돼요. 홍보 이미지를 비워두면 위에서 올린 대표 이미지를 함께 사용해요.
          </p>
        </div>
        <PromoCardFields
          collapsible
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
          onResetFacts={() => dispatch({ type: 'reset-promo-facts', slot: 'promoHome' })}
          canResetFacts={hasPromoFactEdits(state, 'promoHome')}
          // 이 자리를 비웠을 때 실제로 노출될 이미지 — 자기 자리를 뺀 폴백 결과를 그대로 넘겨
          // 미리보기가 공개 화면과 어긋나지 않게 한다.
          defaultImageUrl={resolveTournamentImage(
            {
              coverImageUrl: state.coverImageUrl,
              promoHomeImageUrl: null,
              promoListImageUrl: state.promoList.imageUrl,
            },
            'home',
          )}
        />
        <PromoCardFields
          collapsible
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
          onResetFacts={() => dispatch({ type: 'reset-promo-facts', slot: 'promoList' })}
          canResetFacts={hasPromoFactEdits(state, 'promoList')}
          defaultImageUrl={resolveTournamentImage(
            {
              coverImageUrl: state.coverImageUrl,
              promoHomeImageUrl: state.promoHome.imageUrl,
              promoListImageUrl: null,
            },
            'list',
          )}
        />
      </section>
    </div>
  );
}

/**
 * "공개 확인" 단계 — 이미 초안으로 만들어진 대회를 실제 <TournamentCard/>(대회 목록에서
 * 참가자가 보는 그 컴포넌트)로 미리 보여준다. 가짜 목업 마크업을 새로 그리지 않고 실제
 * 컴포넌트를 재사용하는 게 요구사항의 핵심이라, 카드 자체는 목록 페이지와 완전히 동일하다.
 */
function ConfirmStep({
  state,
  sport,
}: {
  state: TournamentCreateState;
  sport: { code?: string; name: string } | undefined;
}) {
  const previewItem = buildTournamentPreviewItem(state, sport);
  return (
    <div className="grid gap-5">
      <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--grey50)] p-4 sm:p-5">
        <p className="tm-on-tint mb-3 text-xs font-bold text-[var(--text-caption)]">참가자에게 이렇게 보여요</p>
        <div className="mx-auto max-w-sm">
          <TournamentCard item={previewItem} interactive={false} />
        </div>
      </div>
      <div className="rounded-xl bg-[var(--blue50)] p-4 text-sm leading-6 text-[var(--blue700)]">
        지금은 초안이라 참가자에게 보이지 않아요. <strong>접수 시작하기</strong>를 누르면 이
        화면 그대로 대회 목록·상세에 공개되고 바로 신청을 받을 수 있어요. 아직 준비가 덜
        됐다면 <strong>나중에 하기</strong>로 초안을 남겨 두고 나갈 수 있어요.
      </div>
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
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-semibold text-[var(--text-body)]">
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="ml-0.5 text-[var(--red700)]">*</span>
            <span className="sr-only"> (필수)</span>
          </>
        ) : null}
      </label>
      {children}
      {error ? (
        <p role="alert" data-error-focus={id} className="text-xs font-medium text-[var(--red700)]">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-5 text-[var(--text-caption)]">{hint}</p>
      ) : null}
    </div>
  );
}
