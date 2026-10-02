'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { UsersRound } from 'lucide-react';
import { buildPhoneVerifyHref } from '@/components/auth/phone-verification/phone-verify-route';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { useShellOverride } from '@/components/v1-ui/shell-override';
import { AlertBanner, Card, EmptyState, ErrorState, InfoRow, SectionTitle } from '@/components/v1-ui/primitives';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { getTournamentRosterNextStep } from '@/components/tournaments/tournament-roster-next-step';
import { SponsorLogoStrip } from '@/components/tournaments/tournament-sponsor-logo-strip';
import {
  useV1Tournament,
  useV1MyTeams,
  useV1MyRegistrations,
  useV1Registration,
  useV1CreateRegistration,
  useV1SubmitRegistration,
  useV1AuthMe,
  useV1CurrentTerms,
} from '@/hooks/use-v1-api';
import { trackEvent } from '@/lib/analytics';
import { extractErrorMessage } from '@/lib/error-message';
import { appRoute } from '@/lib/app-route';
import { withFromPath } from '@/lib/session-storage';
import { competitionDetailHref } from '@/lib/fixture-detail-route';
import { competitionKindLabel } from '@/lib/v1-status-labels';
import { formatEntryFee } from '@/lib/date-utils';
import {
  filterTournamentTeamsBySport,
  getTournamentTeamEmptyState,
} from '@/lib/tournament-team-eligibility';
import {
  describeTournamentRegistrationBlock,
  resolveTournamentCapacity,
  resolveTournamentRegistrationBlock,
} from '@/lib/tournament-registration-availability';
import type {
  V1MyTeam,
  V1TournamentDetail,
  V1TournamentPaymentMethod,
  V1TournamentRegistration,
  V1TournamentRegistrationStatus,
  V1TournamentPaymentInstructions,
  V1CurrentTermsItem,
} from '@/types/api';

/* ── Helpers ── */

function normalizeMyTeams(data: ReturnType<typeof useV1MyTeams>['data']): V1MyTeam[] | undefined {
  if (!data) return undefined;
  return 'items' in data ? data.items : (data as V1MyTeam[]);
}

/* ── Step indicator ── */

type ApplyStep = 'team' | 'agreements' | 'payment';

/**
 * 단계 라벨은 **참가비 유무로 갈린다.**
 *
 * 무료 대회는 결제 수단·입금자명을 아예 묻지 않는데(#1017) 라벨만 결제를 전제하고 있었다 —
 * 2026-09-04 alpha 실측: 본문이 "이 대회는 무료로 참가할 수 있어요" 인 화면의 진행 표시가
 * `동의 · 결제 수단` / `다음: 결제 안내` 였다. **없을 결제를 예고하는 잘못된 안내**이고,
 * 완료 화면에서는 제목(`결제 안내`)과 본문(`참가비가 없는 대회예요`)이 서로 모순됐다.
 */
function stepsFor(isFreeEntry: boolean): Array<{ id: ApplyStep; label: string }> {
  return [
    { id: 'team', label: '팀 선택' },
    { id: 'agreements', label: isFreeEntry ? '참가 동의' : '동의 · 결제 수단' },
    { id: 'payment', label: isFreeEntry ? '신청 완료' : '결제 안내' },
  ];
}

/** 위저드로 복원 가능한 단계 (팀 선택은 registration 없이 시작하는 최초 진입점이라 제외). */
type ResumableApplyStep = Extract<ApplyStep, 'agreements' | 'payment'>;

/**
 * P1-5: registration.status → 위저드 재진입 시 복원 동작 일반화.
 * draft → 2단계(동의), awaiting_payment/payment_checking/paid → 3단계(입금 안내) 복원,
 * confirmed/waitlisted/cancel_requested → 위저드 대신 내 신청 현황으로 리다이렉트,
 * cancelled → 복원 대상 아님(새로 신청 가능).
 */
function resolveRegistrationResumeAction(
  status: V1TournamentRegistrationStatus,
): ResumableApplyStep | 'redirect' | null {
  if (status === 'draft') return 'agreements';
  if (status === 'awaiting_payment' || status === 'payment_checking' || status === 'paid') return 'payment';
  if (status === 'confirmed' || status === 'waitlisted' || status === 'cancel_requested') return 'redirect';
  return null;
}

/**
 * 위저드 단계(동의/입금 안내)로 이어받을 수 있는 신청 id만 돌려준다.
 * cancelled(입금 미확인 자동 취소 등)를 이어받으면 submit이 서버에서 409 REGISTRATION_NOT_DRAFT로
 * 막혀 재신청이 불가능해진다 — 이 경우 id를 버리고 새 신청(create)으로 가야 한다.
 * redirect 상태(confirmed/waitlisted/cancel_requested)도 위저드에서 이어갈 단계가 없어 제외한다
 * (이동은 handleTeamNext / 재진입 effect가 selectedRegistration으로 처리한다).
 */
function resolveResumableRegistrationId(
  registration: { id: string; status: V1TournamentRegistrationStatus } | undefined,
): string | null {
  if (!registration) return null;
  const action = resolveRegistrationResumeAction(registration.status);
  return action === 'agreements' || action === 'payment' ? registration.id : null;
}

function StepIndicator({ current, isFreeEntry }: { current: ApplyStep; isFreeEntry: boolean }) {
  const STEPS = stepsFor(isFreeEntry);
  const currentIndex = STEPS.findIndex((s) => s.id === current);
  const currentLabel = STEPS[currentIndex]?.label ?? '';
  const nextStep = STEPS[currentIndex + 1];
  return (
    <div className="tm-create-progress" style={{ padding: '16px 20px 0' }} aria-label="신청 단계">
      {/* a11y: 단계 전환 시 스크린리더에 현재 단계 공지 (aria-live polite) */}
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {`${STEPS.length}단계 중 ${currentIndex + 1}단계: ${currentLabel}`}
      </span>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span className="tm-badge tm-badge-blue">{`${currentIndex + 1}/${STEPS.length} 단계`}</span>
        <span className="tm-text-caption" style={{ marginLeft: 8 }}>{currentLabel}</span>
      </div>
      <div className="tm-create-bars" style={{ gridTemplateColumns: `repeat(${STEPS.length}, 1fr)` }}>
        {STEPS.map((step, index) => (
          <span
            key={step.id}
            data-active={index <= currentIndex || undefined}
            aria-current={index === currentIndex ? 'step' : undefined}
          />
        ))}
      </div>
      {nextStep ? (
        <p
          className="tm-text-micro"
          aria-label={`다음 단계: ${nextStep.label}`}
          style={{ marginTop: 4, color: 'var(--text-caption)' }}
        >
          다음: {nextStep.label}
        </p>
      ) : null}
    </div>
  );
}

/* ── Order Summary (desktop rail 은 rail 껍질이 곧 표면, 모바일 recap 은 Card) ── */

function OrderSummaryCard({
  tournament,
  selectedTeam,
  depositorName,
  step,
  compact = false,
  surface = 'card',
}: {
  tournament: V1TournamentDetail;
  selectedTeam: V1MyTeam | undefined;
  depositorName: string;
  step?: ApplyStep;
  compact?: boolean;
  /** 'rail' 은 Card 를 두르지 않는다 — `.tm-tournament-form-rail` 껍질 안에 또 하나의 표면을 만들면 글자 폭이 줄고 대회명이 꺾인다. */
  surface?: 'card' | 'rail';
}) {
  // Hide payment-related rows on step 'team' (not yet entered).
  // **무료 대회에서는 아예 보여 주지 않는다** — 결제 수단·입금자명을 묻지 않는데 요약만
  // "계좌이체" 라고 말하면, 참가자는 내지도 않을 돈의 결제 수단을 확인하게 된다.
  const showPaymentRows = step !== 'team' && tournament.entryFee > 0;
  const isRail = surface === 'rail';

  const rows = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <InfoRow label="대회명" value={tournament.title} stacked={isRail} />
      <InfoRow
        label="참가 팀"
        value={selectedTeam ? selectedTeam.name : '—'}
      />
      <InfoRow
        label="참가비"
        value={formatEntryFee(tournament.entryFee)}
        isLast={!showPaymentRows}
      />
      {showPaymentRows ? (
        <>
          <InfoRow label="결제 수단" value="계좌이체" />
          <InfoRow
            label="입금자명"
            value={depositorName.trim().length > 0 ? depositorName.trim() : '—'}
            isLast
          />
        </>
      ) : null}
    </div>
  );

  const heading = (
    <div
      className="tm-text-label"
      style={{ color: 'var(--text-strong)', fontWeight: 700, marginBottom: 12 }}
    >
      신청 요약
    </div>
  );

  if (isRail) {
    return (
      <div>
        {heading}
        {rows}
      </div>
    );
  }

  return (
    <Card
      pad={compact ? 12 : 16}
      style={compact ? { background: 'var(--grey50)' } : undefined}
    >
      {!compact && heading}
      {rows}
    </Card>
  );
}

/* ── Desktop Rail: persistent summary + CTA ── */

function DesktopRailSummary({
  tournament,
  selectedTeam,
  depositorName,
  step,
  canSubmit,
  isSubmitting,
  onSubmitFromRail,
  selectedTeamId,
  hasManagerTeam,
  isCreating,
  onNext,
}: {
  tournament: V1TournamentDetail;
  selectedTeam: V1MyTeam | undefined;
  depositorName: string;
  step: ApplyStep;
  canSubmit: boolean;
  isSubmitting: boolean;
  onSubmitFromRail: () => void;
  selectedTeamId: string;
  hasManagerTeam: boolean;
  isCreating: boolean;
  onNext: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <OrderSummaryCard
        tournament={tournament}
        selectedTeam={selectedTeam}
        depositorName={depositorName}
        step={step}
        surface="rail"
      />

      {step === 'team' && (
        <button
          type="button"
          className="tm-btn tm-btn-lg tm-btn-primary [--button-fill-primary:var(--static-blue)] hover:[--button-fill-primary-hover:color-mix(in_srgb,var(--static-blue)_88%,var(--static-black))] tm-btn-block"
          disabled={!selectedTeamId || !hasManagerTeam || isCreating}
          onClick={onNext}
          aria-label="다음 단계: 동의 및 결제 수단 선택"
        >
          {isCreating ? '잠깐만요…' : '다음'}
        </button>
      )}

      {step === 'agreements' && (
        <button
          type="button"
          className="tm-btn tm-btn-lg tm-btn-primary [--button-fill-primary:var(--static-blue)] hover:[--button-fill-primary-hover:color-mix(in_srgb,var(--static-blue)_88%,var(--static-black))] tm-btn-block"
          disabled={!canSubmit || isSubmitting}
          onClick={onSubmitFromRail}
          aria-label="신청 제출하기"
        >
          {isSubmitting ? '신청 중…' : '신청하기'}
        </button>
      )}

      {step === 'payment' && tournament && (
        <Link
          href={`/tournaments/${tournament.id}/my`}
          className="tm-btn tm-btn-lg tm-btn-primary [--button-fill-primary:var(--static-blue)] hover:[--button-fill-primary-hover:color-mix(in_srgb,var(--static-blue)_88%,var(--static-black))] tm-btn-block"
        >
          내 신청 확인하기
        </Link>
      )}
    </div>
  );
}

/* ── Step 1: Team selection ── */

function TeamSelectStep({
  tournament,
  teams,
  hasAnyTeam,
  registrations,
  isLoadingTeams,
  selectedTeamId,
  onSelectTeam,
  onNext,
  isCreating,
  cancelHref,
}: {
  tournament: V1TournamentDetail;
  teams: V1MyTeam[];
  hasAnyTeam: boolean;
  registrations: V1TournamentRegistration[];
  isLoadingTeams: boolean;
  selectedTeamId: string;
  onSelectTeam: (teamId: string) => void;
  onNext: () => void;
  isCreating: boolean;
  cancelHref: string;
}) {
  const managerTeams = teams.filter((t) => t.role === 'owner' || t.role === 'manager');
  const hasManagerTeam = managerTeams.length > 0;
  const emptyState = getTournamentTeamEmptyState(hasAnyTeam, tournament.kind === 'regular_league');

  return (
    <div style={{ padding: '0 20px 168px' }}>
      <section aria-labelledby="team-select-heading" style={{ marginTop: 20 }}>
        <div style={{ marginLeft: -20, marginRight: -20 }}>
          <SectionTitle id="team-select-heading" title="참가 팀 선택" />
        </div>
        <p
          className="tm-text-caption"
          style={{ color: 'var(--text-muted)', marginTop: 4, marginBottom: 12, lineHeight: 1.6 }}
        >
          팀장 또는 관리자 권한이 있는 팀으로만 신청할 수 있어요.
        </p>

        {isLoadingTeams ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2].map((i) => (
              <div
                key={i}
                aria-hidden="true"
                style={{ height: 72, borderRadius: 'var(--radius-field)', background: 'var(--grey100)' }}
              />
            ))}
          </div>
        ) : teams.length === 0 ? (
          <div className="tm-tournament-registration-empty">
            <EmptyState
              title={emptyState.title}
              sub={emptyState.description}
              cta="팀 만들기"
              onCta={() => { window.location.href = '/teams/new'; }}
              icon={<UsersRound size={36} strokeWidth={1.5} />}
            />
          </div>
        ) : (
          <div
            role="radiogroup"
            aria-labelledby="team-select-heading"
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            {teams.map((team) => {
              const isManager = team.role === 'owner' || team.role === 'manager';
              const isSelected = team.teamId === selectedTeamId;
              const registration = registrations.find((item) => item.teamId === team.teamId);
              return (
                <button
                  key={team.teamId}
                  role="radio"
                  aria-checked={isSelected}
                  aria-disabled={!isManager}
                  disabled={!isManager}
                  type="button"
                  onClick={() => isManager && onSelectTeam(team.teamId)}
                  className="tm-pressable"
                  style={{
                    // all:'unset' 은 button 기본값을 지우면서 :focus-visible 링까지
                    // 함께 지웠다 — 키보드로 팀을 고를 때 어느 카드에 있는지 알 수
                    // 없었다. 지워야 할 것만 명시하고, 링은 .tm-pressable 로 받는다.
                    display: 'block',
                    width: '100%',
                    boxSizing: 'border-box',
                    margin: 0,
                    padding: 0,
                    border: 0,
                    background: 'transparent',
                    font: 'inherit',
                    color: 'inherit',
                    textAlign: 'left',
                    appearance: 'none',
                    cursor: isManager ? 'pointer' : 'default',
                  }}
                >
                  <Card
                    pad={16}
                    className={isSelected ? 'tm-create-selected' : undefined}
                    style={{
                      opacity: isManager ? 1 : 0.55,
                      cursor: isManager ? 'pointer' : 'default',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <TeamAvatar seed={team.teamId} name={team.name} logoUrl={team.logoUrl} size="md" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span
                            className="tm-text-label"
                            style={{
                              color: 'var(--text-strong)',
                              fontWeight: 600,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {team.name}
                          </span>
                          {!isManager ? (
                            <span className="tm-badge tm-badge-grey" style={{ flexShrink: 0 }}>
                              권한 필요
                            </span>
                          ) : team.role === 'owner' ? (
                            <span className="tm-badge tm-badge-blue" style={{ flexShrink: 0 }}>
                              팀장
                            </span>
                          ) : (
                            <span className="tm-badge tm-badge-blue" style={{ flexShrink: 0 }}>
                              관리자
                            </span>
                          )}
                        </div>
                        <div
                          className="tm-text-micro"
                          style={{ marginTop: 2, color: 'var(--text-caption)' }}
                        >
                          {team.sport.name} · {team.memberCount}명
                          {team.region ? ` · ${team.region.name}` : ''}
                          {isManager && registration?.status === 'draft' ? ' · 임시저장' : ''}
                          {isManager && registration && registration.status !== 'draft' && registration.status !== 'cancelled' ? ' · 신청됨' : ''}
                        </div>
                      </div>
                      {isSelected && (
                        <div
                          aria-hidden="true"
                          style={{
                            flexShrink: 0,
                            width: 20,
                            height: 20,
                            borderRadius: 'var(--radius-circle)',
                            background: 'var(--blue500)',
                            display: 'grid',
                            placeItems: 'center',
                            color: 'var(--static-white)',
                            fontSize: 'var(--font-size-micro)',
                            fontWeight: 800,
                          }}
                        >
                          ✓
                        </div>
                      )}
                    </div>
                  </Card>
                </button>
              );
            })}
          </div>
        )}

        {/* Info card: entry fee */}
        {tournament.entryFee > 0 ? (
          <Card pad={16} style={{ marginTop: 16, background: 'var(--grey50)' }}>
            <InfoRow
              label="참가비"
              value={formatEntryFee(tournament.entryFee)}
              isLast
            />
          </Card>
        ) : null}
      </section>

      {/* Fixed CTA — hidden on desktop (rail takes over) */}
      <div className="tm-fixed-cta tm-hide-desktop">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
          <Link
            href={cancelHref}
            className="tm-btn tm-btn-lg tm-btn-neutral"
          >
            취소
          </Link>
          <button
            type="button"
            className="tm-btn tm-btn-lg tm-btn-primary [--button-fill-primary:var(--static-blue)] hover:[--button-fill-primary-hover:color-mix(in_srgb,var(--static-blue)_88%,var(--static-black))]"
            disabled={!selectedTeamId || !hasManagerTeam || isCreating}
            onClick={onNext}
            aria-label="다음 단계: 동의 및 결제수단 선택"
          >
            {isCreating ? '잠깐만요…' : '다음'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Expandable consent row ── */

function ExpandableCheckRow({
  id,
  label,
  summary,
  consentType,
  checked,
  onChange,
  document,
  onOpenDocument,
  divider = false,
}: {
  id: string;
  label: string;
  summary?: string;
  consentType?: 'required' | 'optional';
  checked: boolean;
  onChange: (v: boolean) => void;
  document?: TournamentConsentDocument | null;
  onOpenDocument?: (document: TournamentConsentDocument) => void;
  divider?: boolean;
}) {
  return (
    <div
      style={{
        borderTop: divider ? '1px solid var(--grey100)' : undefined,
      }}
    >
      {/* Main row: checkbox label + expand toggle */}
      <div
        className="tm-auth-check-row"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          minHeight: 44,
        }}
      >
        {/* sr-only real checkbox for accessibility */}
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        {/* Themed visual indicator */}
        <label
          htmlFor={id}
          style={{ display: 'contents', cursor: 'pointer' }}
          aria-label={consentType ? `${label} ${consentType === 'required' ? '필수' : '선택'}` : label}
        >
          <span
            aria-hidden="true"
            className={`tm-auth-check${checked ? ' tm-auth-check-on' : ''}`}
          >
            ✓
          </span>
          <span style={{ display: 'grid', gap: 3, flex: 1, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
              <span className="tm-text-body" style={{ color: 'var(--text-strong)', lineHeight: 1.35 }}>
                {label}
              </span>
              {consentType ? (
                <span
                  className="tm-text-micro"
                  style={{
                    flexShrink: 0,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-pill)',
                    background: consentType === 'required' ? 'var(--red50)' : 'var(--grey100)',
                    color: consentType === 'required' ? 'var(--red700)' : 'var(--text-muted)',
                    fontWeight: 700,
                    lineHeight: 1.2,
                  }}
                >
                  {consentType === 'required' ? '필수' : '선택'}
                </span>
              ) : null}
            </span>
            {summary ? (
              <span className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                {summary}
              </span>
            ) : null}
          </span>
        </label>
        {document ? (
          <button
            type="button"
            onClick={() => onOpenDocument?.(document)}
            aria-label={`${label} 내용 보기`}
            className="tm-pressable"
            style={{
              flexShrink: 0,
              background: 'none',
              border: 'none',
              padding: '4px 8px',
              cursor: 'pointer',
              color: 'var(--text-caption)',
              minWidth: 44,
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-chip)',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            보기
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ── Step 2: Agreements + payment method ── */

type AgreementsState = {
  acceptedTermsDocumentIds: string[];
  agreedRules: boolean;
  agreedPrivacy: boolean;
  agreedRefund: boolean;
  agreedMediaConsent: boolean;
  paymentMethod: V1TournamentPaymentMethod;
  depositorName: string;
};

type TournamentConsentDocument = {
  title: string;
  body: string;
};

function AgreementsStep({
  tournament,
  selectedTeam,
  state,
  onChange,
  onBack,
  onSubmit,
  isSubmitting,
  error,
  termsError,
  terms,
}: {
  tournament: V1TournamentDetail;
  selectedTeam: V1MyTeam | undefined;
  state: AgreementsState;
  onChange: (patch: Partial<AgreementsState>) => void;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  error: string | null;
  /** 약관 조회 실패 — 제출 에러(error)와 원인이 달라(네트워크/설정 문제) 재시도가
   * 의미 있다. 그래서 AlertBanner 가 아니라 ErrorState + onRetry 로 따로 그린다. */
  termsError: { message: string; onRetry: () => void } | null;
  terms: V1CurrentTermsItem[];
}) {
  const [activeConsentDocument, setActiveConsentDocument] = useState<TournamentConsentDocument | null>(null);
  const stateKeyByCode = {
    tournament_rules: 'agreedRules',
    tournament_privacy: 'agreedPrivacy',
    tournament_refund: 'agreedRefund',
    tournament_media: 'agreedMediaConsent',
  } as const;
  const visibleTerms = terms;
  const isChecked = (term: V1CurrentTermsItem) =>
    (state.acceptedTermsDocumentIds ?? []).includes(term.documentId);
  const allRequired = visibleTerms.length > 0
    && visibleTerms.filter((term) => term.requirement === 'required').every(isChecked);
  const allAgreed = visibleTerms.length > 0 && visibleTerms.every(isChecked);
  // 참가비 0원이면 입금이라는 절차 자체가 없다 — 결제 수단도, 입금자명도 묻지 않는다.
  const isFreeEntry = tournament.entryFee === 0;
  const bankTransferValid =
    isFreeEntry || state.paymentMethod !== 'bank_transfer' || state.depositorName.trim().length > 0;
  const canSubmit = allRequired && bankTransferValid;
  const toggleAllAgreements = (checked: boolean) => {
    onChange({
      acceptedTermsDocumentIds: checked ? visibleTerms.map((term) => term.documentId) : [],
      agreedRules: checked,
      agreedPrivacy: checked,
      agreedRefund: checked,
      agreedMediaConsent: checked,
    });
  };

  return (
    <div style={{ padding: '0 20px 120px' }}>
      {/* Consents */}
      <section aria-labelledby="consent-heading" style={{ marginTop: 20 }}>
        <div style={{ marginLeft: -20, marginRight: -20 }}>
          <SectionTitle id="consent-heading" title="동의" />
        </div>
        <Card pad={0} style={{ marginTop: 8 }}>
          <ExpandableCheckRow
            id="agree-all"
            label="전체 동의"
            summary={'대회 신청에 필요한 필수 동의와 선택 동의 항목을 모두 확인하고 동의합니다.\n선택 동의는 동의하지 않아도 대회 신청이 가능합니다.'}
            checked={allAgreed}
            onChange={toggleAllAgreements}
          />
          {visibleTerms.map((term) => {
            const stateKey = stateKeyByCode[term.code as keyof typeof stateKeyByCode];
            return (
              <ExpandableCheckRow
                key={term.documentId}
                id={`agree-${term.code}`}
                label={term.title}
                consentType={term.requirement === 'required' ? 'required' : 'optional'}
                summary={term.subtitle ?? undefined}
                checked={isChecked(term)}
                onChange={(value) => {
                  const acceptedTermsDocumentIds = value
                    ? [...new Set([...(state.acceptedTermsDocumentIds ?? []), term.documentId])]
                    : (state.acceptedTermsDocumentIds ?? []).filter((id) => id !== term.documentId);
                  onChange({
                    acceptedTermsDocumentIds,
                    ...(stateKey ? { [stateKey]: value } : {}),
                  });
                }}
                document={{ title: term.title, body: term.content }}
                onOpenDocument={setActiveConsentDocument}
                divider
              />
            );
          })}
        </Card>
      </section>

      {/* Payment method — bank transfer only. 무료 대회에서는 통째로 그리지 않는다:
          같은 화면에 "이 대회는 무료로 참가할 수 있어요." 를 띄우면서 결제 수단과 **필수**
          입금자명을 함께 요구하면, 안내와 요구가 서로 모순된다(2026-09-04 alpha 실측). */}
      {!isFreeEntry && (
      <section aria-labelledby="payment-method-heading" style={{ marginTop: 16 }}>
        <div style={{ marginLeft: -20, marginRight: -20 }}>
          <SectionTitle id="payment-method-heading" title="결제 수단" />
        </div>
        <Card pad={16} style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44 }}>
            <div
              aria-hidden="true"
              style={{
                flexShrink: 0,
                width: 22,
                height: 22,
                borderRadius: 'var(--radius-circle)',
                border: '2px solid var(--blue500)',
                background: 'var(--blue500)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 'var(--radius-circle)',
                  background: 'var(--static-white)',
                  display: 'block',
                }}
              />
            </div>
            <div>
              <div className="tm-text-label" style={{ color: 'var(--text-strong)', fontWeight: 600 }}>
                계좌이체
              </div>
              <div
                className="tm-text-micro"
                style={{ color: 'var(--text-caption)', marginTop: 2, lineHeight: 1.6 }}
              >
                신청 완료 후 안내되는 계좌로 참가비를 입금해 주세요.
              </div>
            </div>
          </div>
        </Card>

        {/* D2: PG(카드·간편결제) 미지원 안내 */}
        <p
          className="tm-text-caption"
          style={{ color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.6 }}
        >
          카드 결제는 준비 중이에요. 계좌이체를 이용해 주세요.
        </p>

        <Card pad={16} style={{ marginTop: 12 }}>
          <label htmlFor="depositor-name" className="tm-text-caption" style={{ display: 'block', marginBottom: 8 }}>
            입금자명 <span style={{ color: 'var(--red700)' }}>*</span>
          </label>
          <input
            id="depositor-name"
            type="text"
            value={state.depositorName}
            onChange={(e) => onChange({ depositorName: e.target.value })}
            placeholder="입금자 이름을 입력해 주세요"
            maxLength={20}
            className="tm-input"
            style={{ marginTop: 2 }}
            aria-required="true"
            aria-describedby="depositor-name-hint"
          />
          <p
            id="depositor-name-hint"
            className="tm-text-micro"
            style={{ color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.6 }}
          >
            입금 확인에 사용됩니다. 실제 입금자명과 동일하게 입력해 주세요.
            <br />
            입금자명이 신청 정보와 다를 경우 참가 확정이 지연되거나 신청이 취소될 수 있습니다.
          </p>
        </Card>
      </section>

      )}

      {/* Free tournament notice */}
      {isFreeEntry ? (
        <Card pad={12} style={{ marginTop: 16, background: 'var(--grey50)' }}>
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
            이 대회는 무료로 참가할 수 있어요.
          </p>
        </Card>
      ) : null}

      {/* Mobile recap before CTA — 데스크톱은 오른쪽 rail 이 같은 요약을 상시 보여 준다 */}
      <div className="tm-hide-desktop" style={{ marginTop: 20 }}>
        <p
          className="tm-text-micro"
          style={{ color: 'var(--text-caption)', marginBottom: 8, fontWeight: 600 }}
        >
          신청 내용을 확인해 주세요
        </p>
        <OrderSummaryCard
          tournament={tournament}
          selectedTeam={selectedTeam}
          depositorName={state.depositorName}
          step="agreements"
          compact
        />
      </div>

      {termsError ? (
        <div style={{ marginTop: 12 }}>
          <ErrorState message={termsError.message} onRetry={termsError.onRetry} />
        </div>
      ) : null}

      {error ? (
        <div style={{ marginTop: 12 }}>
          <AlertBanner message={error} />
        </div>
      ) : null}

      {/* Fixed CTA — hidden on desktop (rail takes over) */}
      <div className="tm-fixed-cta tm-hide-desktop">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
          <button type="button" className="tm-btn tm-btn-lg tm-btn-neutral" onClick={onBack}>
            이전
          </button>
          <button
            type="button"
            className="tm-btn tm-btn-lg tm-btn-primary [--button-fill-primary:var(--static-blue)] hover:[--button-fill-primary-hover:color-mix(in_srgb,var(--static-blue)_88%,var(--static-black))]"
            disabled={!canSubmit || isSubmitting}
            onClick={onSubmit}
            aria-label="신청 제출하기"
          >
            {isSubmitting ? '신청 중…' : '신청하기'}
          </button>
        </div>
      </div>
      {activeConsentDocument ? (
        <TournamentConsentDialog
          document={activeConsentDocument}
          onClose={() => setActiveConsentDocument(null)}
        />
      ) : null}
    </div>
  );
}

function TournamentConsentDialog({
  document,
  onClose,
}: {
  document: TournamentConsentDocument;
  onClose: () => void;
}) {
  // a11y: focus trap·스크롤 잠금·포커스 저장/복원·ESC 닫기는 공용 훅에 위임
  // (조건부 마운트형 모달이라 open 은 true 고정)
  const { dialogRef, initialFocusRef, onBackdropClick } = useModalA11y<HTMLButtonElement, HTMLElement>({
    open: true,
    onClose,
  });

  return (
    <div
      role="presentation"
      onClick={onBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'rgba(25, 31, 40, 0.32)',
        padding: '20px',
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tournament-consent-dialog-title"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(100%, 520px)',
          maxHeight: '82dvh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: 18,
          background: 'var(--bg)',
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '20px 20px 12px',
            borderBottom: '1px solid var(--grey100)',
          }}
        >
          <h2 id="tournament-consent-dialog-title" className="tm-text-subhead" style={{ margin: 0 }}>
            {document.title}
          </h2>
          <button ref={initialFocusRef} className="tm-btn tm-btn-sm tm-btn-ghost" onClick={onClose} type="button">
            닫기
          </button>
        </header>
        <div style={{ overflowY: 'auto', padding: '20px' }}>
          <p
            className="tm-text-caption"
            style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.75, whiteSpace: 'pre-line' }}
          >
            {document.body}
          </p>
        </div>
      </section>
    </div>
  );
}

function TournamentSubmitConfirmDialog({
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // a11y: focus trap·스크롤 잠금·포커스 저장/복원·ESC 닫기는 공용 훅에 위임
  // (조건부 마운트형 모달이라 open 은 true 고정). 제출 중에는 pending 으로 ESC·backdrop 닫기 잠금
  const { dialogRef, initialFocusRef, onBackdropClick } = useModalA11y<HTMLButtonElement, HTMLElement>({
    open: true,
    onClose: onCancel,
    pending: isSubmitting,
  });

  return (
    <div
      role="presentation"
      onClick={onBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'rgba(25, 31, 40, 0.32)',
        padding: '20px',
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tournament-submit-confirm-title"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(100%, 440px)',
          borderRadius: 18,
          background: 'var(--bg)',
          boxShadow: 'var(--shadow-modal)',
          padding: 20,
        }}
      >
        <h2 id="tournament-submit-confirm-title" className="tm-text-subhead" style={{ margin: 0 }}>
          신청 전 확인해 주세요
        </h2>
        <div
          className="tm-text-caption"
          style={{ color: 'var(--text-muted)', lineHeight: 1.7, marginTop: 12 }}
        >
          참가비 입금 후 단순 변심 또는 팀 사정으로 인한 신청 취소는 불가합니다.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 8, marginTop: 20 }}>
          <button
            ref={initialFocusRef}
            type="button"
            className="tm-btn tm-btn-lg tm-btn-neutral"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            취소
          </button>
          <button
            type="button"
            className="tm-btn tm-btn-lg tm-btn-primary [--button-fill-primary:var(--static-blue)] hover:[--button-fill-primary-hover:color-mix(in_srgb,var(--static-blue)_88%,var(--static-black))]"
            disabled={isSubmitting}
            onClick={onConfirm}
          >
            {isSubmitting ? '신청 중…' : '확인하고 신청하기'}
          </button>
        </div>
      </section>
    </div>
  );
}

/* ── Step 3: Payment guide ── */

function PaymentGuideStep({
  tournament,
  registrationId,
  initialPaymentInstructions,
  onBack,
}: {
  tournament: V1TournamentDetail;
  registrationId: string;
  initialPaymentInstructions: V1TournamentPaymentInstructions | null;
  onBack: () => void;
}) {
  // P0: 방금 제출한 입금자명을 모바일에서도 재확인할 수 있게 배선
  const { data: registration } = useV1Registration(tournament.id, registrationId);
  const paymentInstructions =
    registration?.paymentInstructions ?? initialPaymentInstructions;
  // 참가비 0원이면 입금 절차 자체가 없다 — 계좌 안내도, 계좌 미설정 경고도 그리지 않는다.
  const isFreeEntry = tournament.entryFee === 0;

  // aria-live region ref for clipboard confirmation
  const copyLiveRef = useRef<HTMLSpanElement>(null);
  const rosterNextStep = getTournamentRosterNextStep({
    tournamentId: tournament.id,
    registrationId,
    minPlayers: tournament.minPlayers,
    maxPlayers: tournament.maxPlayers,
    isFreeEntry,
  });

  function handleCopyAccount() {
    if (!paymentInstructions?.bankAccount) return;
    navigator.clipboard.writeText(paymentInstructions.bankAccount).then(() => {
      if (copyLiveRef.current) {
        copyLiveRef.current.textContent = '계좌번호를 복사했어요.';
        setTimeout(() => {
          if (copyLiveRef.current) copyLiveRef.current.textContent = '';
        }, 3000);
      }
    }).catch(() => {
      if (copyLiveRef.current) {
        copyLiveRef.current.textContent = '복사하지 못했어요. 길게 눌러 직접 복사해 주세요.';
      }
    });
  }

  return (
    <div style={{ padding: '0 20px 120px' }}>
      {/* aria-live region for clipboard confirmation — hidden visually */}
      <span
        ref={copyLiveRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      {/* P2 마이크로인터랙션 — 신청 완료 체크 피드백 (globals.css .tm-complete-check, reduced-motion 안전) */}
      {/* P2 능동형: "신청이 완료됐어요" → "신청했어요" */}
      <div
        role="status"
        aria-label="신청했어요"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '24px 0 8px' }}
      >
        <div
          className="tm-complete-check"
          aria-hidden="true"
          style={{
            width: 56,
            height: 56,
            borderRadius: 'var(--radius-circle)',
            background: 'var(--blue500)',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--static-white)',
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="tm-text-body-lg" style={{ color: 'var(--text-strong)', fontWeight: 700 }}>신청했어요</div>
        {/* **참가비가 없으면 돈 이야기를 하지 않는다.** step 1(요약)·step 2(안내)는 이미
            `entryFee` 를 분기하는데 이 완료 화면만 빠져 있어서, 무료 대회 신청자 전원이
            "계좌로 입금하라" + "입금 계좌가 준비되지 않았어요" 를 봤다(2026-09-04 alpha 실측).
            같은 신청이 `/tournaments/{id}/my` 와 어드민 목록에서는 "결제 완료" 로 뜨는 상태였다. */}
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
          {isFreeEntry ? '참가비가 없는 대회예요. 이제 명단을 등록해 주세요.' : '아래 계좌로 참가비를 입금해 주세요'}
        </div>
      </div>

      {/* 무료 대회에서는 입금 안내 제목·계좌 카드·입금 확인 안내를 모두 건너뛴다.
          **명단 등록 섹션은 이 섹션 안에 중첩돼 있으므로 함께 숨기면 안 된다** — 무료 대회일수록
          다음 할 일(명단 등록)로 이끄는 것이 이 화면의 유일한 역할이 된다. */}
      <section aria-labelledby={isFreeEntry ? undefined : 'bank-guide-heading'} style={{ marginTop: 12 }}>
        {!isFreeEntry && (
          <div style={{ marginLeft: -20, marginRight: -20 }}>
            <SectionTitle id="bank-guide-heading" title="입금 안내" />
          </div>
        )}
        {!isFreeEntry && (
        <Card pad={0} style={{ marginTop: 8 }}>
          {paymentInstructions ? (
            <div style={{ padding: '0 16px' }}>
              {/* 이 블록의 어휘는 '—' 다(입금자명·참가 팀과 같은 말). 공유 InfoRow 의
                  기본 폴백('미정')이 닿으면 바로 아래 행과 말이 갈린다.
                  **판정 기준을 공유본과 같게 맞춘다** — `|| '—'` 만으로는 공백만 있는 값을
                  못 잡고, 그때 공유본이 `trim()` 으로 판정해 '미정' 을 그린다(같은 갈림 재현). */}
              <InfoRow label="은행" value={paymentInstructions.bankName.trim() || '—'} />
              {/* Account number row with copy button */}
              <div
                className="tm-info-row"
                style={{ alignItems: 'center' }}
              >
                <div className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>
                  계좌번호
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    className="tm-text-label"
                    style={{ color: 'var(--text-strong)', textAlign: 'right' }}
                  >
                    {paymentInstructions.bankAccount}
                  </span>
                  <button
                    type="button"
                    className="tm-btn tm-btn-sm tm-btn-outline"
                    onClick={handleCopyAccount}
                    aria-label={`계좌번호 ${paymentInstructions.bankAccount} 복사`}
                    style={{ flexShrink: 0 }}
                  >
                    복사
                  </button>
                </div>
              </div>
              <InfoRow label="예금주" value={paymentInstructions.bankHolder.trim() || '—'} />
              <InfoRow label="입금액" value={formatEntryFee(tournament.entryFee)} />
              <InfoRow
                label="입금자명"
                value={registration?.depositorName ?? '—'}
                isLast
              />
            </div>
          ) : (
            <div style={{ padding: '0 16px 16px' }}>
              <AlertBanner
                tone="error"
                message="입금 계좌가 준비되지 않았어요. 운영팀에 문의해 주세요."
              />
              <div style={{ marginTop: 12 }}>
                <InfoRow
                  label="입금액"
                  value={formatEntryFee(tournament.entryFee)}
                  isLast
                />
              </div>
            </div>
          )}
        </Card>
        )}

        {!isFreeEntry && (
          <Card pad={16} style={{ marginTop: 12, background: 'var(--grey50)' }}>
            <p className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.65 }}>
              입금이 확인되면 신청이 최종 확정돼요. 입금자명이 다르면 확인이 늦어질 수 있어요.
            </p>
          </Card>
        )}

        <section aria-labelledby="roster-next-step-heading" style={{ marginTop: 12, scrollMarginBottom: 144 }}>
          <Card pad={16}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div id="roster-next-step-heading" className="tm-text-label" style={{ color: 'var(--text-strong)', fontWeight: 700 }}>
                  {rosterNextStep.title}
                </div>
                <p className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.6, margin: '4px 0 0' }}>
                  {rosterNextStep.body}
                </p>
              </div>
              <span className="tm-badge tm-badge-grey" style={{ whiteSpace: 'nowrap' }}>
                {rosterNextStep.rosterRangeLabel}
              </span>
            </div>
            <Link
              href={rosterNextStep.href}
              className="tm-btn tm-btn-md tm-btn-neutral"
              style={{ marginTop: 12 }}
            >
              {rosterNextStep.ctaLabel}
            </Link>
          </Card>
        </section>
      </section>

      {/* Fixed CTA — hidden on desktop (rail takes over) */}
      <div className="tm-fixed-cta tm-hide-desktop">
        <Link
          href={`/tournaments/${tournament.id}/my`}
          className="tm-btn tm-btn-lg tm-btn-primary [--button-fill-primary:var(--static-blue)] hover:[--button-fill-primary-hover:color-mix(in_srgb,var(--static-blue)_88%,var(--static-black))] tm-btn-block"
        >
          내 신청 확인하기
        </Link>
      </div>
    </div>
  );
}

/* ── Loading / Error states ── */

function LoadingSkeleton() {
  return (
    <div aria-busy="true" aria-label="대회 정보 불러오는 중" style={{ padding: '0 20px', marginTop: 24 }}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          style={{ height: 64, borderRadius: 'var(--radius-field)', background: 'var(--grey100)', marginBottom: 12 }}
        />
      ))}
    </div>
  );
}

/* ── Main client ── */

export function TournamentApplyPageClient({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTeamId = searchParams.get('team') ?? '';
  const hubHref = `/tournaments/${tournamentId}/my`;
  const detailHref = `/tournaments/${tournamentId}`;
  const applyBackHref = requestedTeamId ? hubHref : detailHref;
  // 셸 뒤로가기(위 applyBackHref)와 달리, 화면 안의 '대회 상세로 돌아가기' CTA 는
  // 받은 from 을 그대로 이어 붙인다.
  const detailHrefWithFrom = withFromPath(detailHref, searchParams.get('from'));
  // route-chrome 테이블(fragments/tournaments-extra.ts)의 backHref는 항상 detailHref로
  // 고정돼 있다 — `?team=` 딥링크(내 신청 페이지에서 팀을 골라 들어온 경우, my-registration-
  // client.tsx의 apply?team= 링크 참조)로 들어온 경우엔 셸 topbar 뒤로가기도 hubHref로
  // 가야 한다. 이미 콘텐츠 영역의 cancelHref가 쓰는 것과 같은 값을 override로 셸에 밀어넣는다.
  useShellOverride({ backHref: applyBackHref });
  const {
    data: tournament,
    isLoading: loadingTournament,
    isError: tournamentError,
    error: tournamentErr,
    refetch: refetchTournament,
  } = useV1Tournament(tournamentId);
  const { data: myTeamsData, isLoading: loadingTeams } = useV1MyTeams();
  const { data: myRegistrations = [], isLoading: loadingMyRegistrations } = useV1MyRegistrations(tournamentId);
  const tournamentTerms = useV1CurrentTerms('tournament_application');
  const authMe = useV1AuthMe();
  // undefined = 아직 모름(로딩 중이라 막지 않는다), false = 미인증으로 확인됨.
  const phoneVerified = authMe.data?.verification?.phoneVerified;

  const myTeams = normalizeMyTeams(myTeamsData) ?? [];
  const eligibleTeams = tournament
    ? filterTournamentTeamsBySport(myTeams, tournament.sportId)
    : [];
  const managerTeams = eligibleTeams.filter((team) => team.role === 'owner' || team.role === 'manager');
  // 위저드는 정원·마감을 보지 않아서, 취소된 신청을 다시 넣는 사용자가 약관을 다 채운 뒤
  // 제출 순간에야 서버 409(TOURNAMENT_CAPACITY_FULL / REGISTRATION_DEADLINE_PASSED)를 만났다.
  // 입금대기 팀이 정원을 쥐고 있어도 목록엔 "확정 5 / 8"로 보이니 이유를 짐작할 수도 없었다.
  const newRegistrationBlockReason = tournament
    ? resolveTournamentRegistrationBlock(tournament)
    : null;
  const newRegistrationBlockMessage = tournament && newRegistrationBlockReason
    ? describeTournamentRegistrationBlock(
        newRegistrationBlockReason,
        resolveTournamentCapacity(tournament),
        tournament.entryFee === 0,
      )
    : null;

  const [step, setStep] = useState<ApplyStep>('team');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [agreements, setAgreements] = useState<AgreementsState>({
    acceptedTermsDocumentIds: [],
    agreedRules: false,
    agreedPrivacy: false,
    agreedRefund: false,
    agreedMediaConsent: false,
    paymentMethod: 'bank_transfer',
    depositorName: '',
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submittedPaymentInstructions, setSubmittedPaymentInstructions] =
    useState<V1TournamentPaymentInstructions | null>(null);
  // P1-5: 위저드로 되돌릴 수 없는 상태(confirmed 등)를 감지해 /my 로 리다이렉트하는 동안 1단계가 잠깐 보이는 깜빡임 방지
  const [isRedirectingAway, setIsRedirectingAway] = useState(false);

  // P0: 동의·입금자명 입력을 registration 단위로 보존 — 새로고침/이탈 후 재진입 시 복원
  const agreementsDraftKey = registrationId ? `teameet.v1.applyDraft.${registrationId}` : null;
  useEffect(() => {
    if (!agreementsDraftKey) return;
    try {
      const raw = window.sessionStorage.getItem(agreementsDraftKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<AgreementsState>;
      setAgreements((prev) => ({ ...prev, ...saved }));
    } catch {
      // 저장값 손상 시 조용히 무시 — 새 입력으로 진행
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreementsDraftKey]);
  useEffect(() => {
    if (!agreementsDraftKey) return;
    const timer = setTimeout(() => {
      try {
        window.sessionStorage.setItem(agreementsDraftKey, JSON.stringify(agreements));
      } catch {
        // 스토리지 실패는 UX에 치명적이지 않음
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [agreements, agreementsDraftKey]);

  const createRegistration = useV1CreateRegistration(tournamentId);
  const submitRegistration = useV1SubmitRegistration(tournamentId, registrationId ?? '');
  const createBusyRef = useRef(false);
  const submitBusyRef = useRef(false);

  // 입금자명은 자동으로 채우지 않는다. 예전에는 선택한 팀명을 미리 넣어줬는데(정책상 팀명도
  // 허용되므로) 사용자가 아무것도 입력하지 않아도 제출 버튼이 활성화됐다 — 신청자는 "입금자명을
  // 안 넣었는데 신청이 됐다"고 느끼고, 실제 입금은 개인 이름으로 들어와 입금 확인이 지연된다.
  // 실제로 입금할 이름을 직접 적게 한다.

  // Auto-select first manager team
  useEffect(() => {
    if (requestedTeamId) return;
    if (selectedTeamId) return;
    const first = managerTeams[0];
    if (first) setSelectedTeamId(first.teamId);
  }, [managerTeams, requestedTeamId, selectedTeamId]);

  // P1-5: 위저드 재진입 자동 스킵 일반화 — 매니저 팀이 여럿이어도 진행 중 registration을 우선 복원한다.
  // 여러 팀에 진행 중 registration이 있으면 가장 최근에 갱신된 것을 복원 대상으로 삼는다.
  useEffect(() => {
    if (requestedTeamId) return;
    if (registrationId) return;
    if (loadingTeams || loadingMyRegistrations) return;

    const managerTeamIds = new Set(managerTeams.map((team) => team.teamId));
    const myManagedRegistrations = myRegistrations
      .filter((reg) => managerTeamIds.has(reg.teamId))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const inProgress = myManagedRegistrations.find((reg) => {
      const action = resolveRegistrationResumeAction(reg.status);
      return action === 'agreements' || action === 'payment';
    });

    if (inProgress) {
      const action = resolveRegistrationResumeAction(inProgress.status) as ResumableApplyStep;
      setSelectedTeamId(inProgress.teamId);
      setRegistrationId(inProgress.id);
      setStep(action);
      setSubmitError(null);
      return;
    }

    // **신청할 팀이 아직 남아 있으면 되돌리지 않는다.**
    //
    // 예전엔 `confirmed`/`waitlisted`/`cancel_requested` 신청이 **하나라도** 있으면 무조건
    // `/my` 로 보냈다. 그래서 **두 팀을 가진 팀장이 다른 팀으로 신청할 수 없었다** — 1군을
    // 넣은 클럽이 2군을 넣으려 하면 1군 신청 화면으로 튕겼다(2026-09-05 alpha 실측:
    // 팀장B 가 B팀 확정 상태에서 C팀으로 신청할 경로가 없었다).
    //
    // 되돌리는 것이 옳은 경우는 하나다 — **더 넣을 팀이 없을 때.** 그때 이 화면은 빈 팀
    // 선택지만 보여 주므로, 자기 신청을 보여 주는 편이 낫다.
    const registeredTeamIds = new Set(
      myManagedRegistrations
        .filter((reg) => resolveRegistrationResumeAction(reg.status) === 'redirect')
        .map((reg) => reg.teamId),
    );
    const hasTeamLeftToApply = managerTeams.some((team) => !registeredTeamIds.has(team.teamId));
    const needsRedirect = hasTeamLeftToApply
      ? undefined
      : myManagedRegistrations.find(
          (reg) => resolveRegistrationResumeAction(reg.status) === 'redirect',
        );

    if (needsRedirect) {
      setIsRedirectingAway(true);
      router.replace(appRoute(`/tournaments/${tournamentId}/my?reg=${needsRedirect.id}`));
    }
  }, [
    loadingMyRegistrations,
    loadingTeams,
    managerTeams,
    myRegistrations,
    registrationId,
    requestedTeamId,
    router,
    tournamentId,
  ]);

  useEffect(() => {
    if (!requestedTeamId || loadingTeams || loadingMyRegistrations) return;

    const requestedTeam = managerTeams.find((team) => team.teamId === requestedTeamId);
    if (!requestedTeam) {
      setSelectedTeamId('');
      setRegistrationId(null);
      setStep('team');
      setSubmitError('이 팀으로 대회를 신청할 권한이 없어요.');
      return;
    }

    const registration = myRegistrations.find((item) => item.teamId === requestedTeamId);
    setSelectedTeamId(requestedTeamId);
    setSubmitError(null);

    if (registration) {
      const action = resolveRegistrationResumeAction(registration.status);
      if (action === 'agreements' || action === 'payment') {
        setRegistrationId(registration.id);
        setStep(action);
        return;
      }
      if (action === 'redirect') {
        setRegistrationId(registration.id);
        setIsRedirectingAway(true);
        router.replace(appRoute(`/tournaments/${tournamentId}/my?reg=${registration.id}`));
        return;
      }
      // action === null (cancelled) → 새 신청으로 진행
    }

    setRegistrationId(null);
    // 재신청이 애초에 불가능하면 약관 단계로 보내지 않는다 — 다 채우고 나서 거절되는 게 최악이다.
    if (newRegistrationBlockMessage) {
      setStep('team');
      setSubmitError(newRegistrationBlockMessage);
      return;
    }
    setStep('agreements');
  }, [
    newRegistrationBlockMessage,
    loadingMyRegistrations,
    loadingTeams,
    managerTeams,
    myRegistrations,
    requestedTeamId,
    router,
    tournamentId,
  ]);

  const selectedTeam = eligibleTeams.find((t) => t.teamId === selectedTeamId);
  const selectedRegistration = myRegistrations.find((item) => item.teamId === selectedTeamId);

  function handleSelectTeam(teamId: string) {
    const registration = myRegistrations.find((item) => item.teamId === teamId);
    setSelectedTeamId(teamId);
    setRegistrationId(resolveResumableRegistrationId(registration));
    setSubmitError(null);
  }

  const allRequiredAgreed = (tournamentTerms.data?.items ?? [])
    .filter((term) => term.requirement === 'required')
    .every((term) => (agreements.acceptedTermsDocumentIds ?? []).includes(term.documentId));
  const bankTransferValid =
    // 무료 대회는 입금자명을 묻지 않으므로 제출 조건에서도 빼야 한다. **여기가 페이지 레벨
    // 게이트다** — `AgreementsStep` 안쪽 조건만 고치면 화면에는 필드가 없는데 제출 버튼은
    // 계속 잠긴 채로 남는다(그 상태를 테스트가 잡았다).
    tournament?.entryFee === 0
    || agreements.paymentMethod !== 'bank_transfer'
    || agreements.depositorName.trim().length > 0;
  const requiredTournamentTerms = tournamentTerms.data?.items.filter(
    (term) => term.requirement === 'required',
  ) ?? [];
  const canSubmitAgreements = allRequiredAgreed
    && bankTransferValid
    && tournamentTerms.data?.ready === true
    && requiredTournamentTerms.length > 0;

  const isCreating = createRegistration.isPending;
  const isSubmittingApplication = createRegistration.isPending || submitRegistration.isPending;

  if (loadingTournament || loadingMyRegistrations || (requestedTeamId && loadingTeams) || isRedirectingAway) {
    return (
              <LoadingSkeleton />
      );
  }

  if (tournamentError || !tournament) {
    const msg = extractErrorMessage(tournamentErr, '대회 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    return (
              <div style={{ padding: '0 20px', marginTop: 24 }}>
          <ErrorState message={msg} onRetry={() => void refetchTournament()} />
          <Link
            href={detailHrefWithFrom}
            className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"
            style={{ marginTop: 16 }}
          >
            대회 상세로 돌아가기
          </Link>
        </div>
      );
  }

  // 여기부터는 대회·리그를 안다 — 돌아가기 CTA 도 종류에 맞는 이름과 상세 경로를 쓴다.
  const isRegularLeague = tournament.kind === 'regular_league';
  const competitionNoun = competitionKindLabel(isRegularLeague ? 'LEAGUE' : 'TOURNAMENT');
  const loadedDetailHref = competitionDetailHref({ isRegularLeague, competitionId: tournamentId, fromHref: searchParams.get('from') });

  // 대회 신청은 본인확인이 전제다(서버도 submit에서 403 PHONE_NOT_VERIFIED로 막는다).
  // 이미 인증한 사용자는 이 화면을 보지 않고 그대로 통과하고, 미인증이면 인증 화면으로 보낸 뒤
  // 인증이 끝나면 이 신청 화면으로 정확히 되돌아오게 한다.
  if (phoneVerified === false) {
    return (
              <div style={{ padding: '0 20px', marginTop: 24 }}>
          <AlertBanner
            message={`${competitionNoun} 신청은 휴대폰 본인인증을 마친 계정만 할 수 있어요. 인증 후 이 화면으로 돌아옵니다.`}
            tone="info"
          />
          <Link
            href={buildPhoneVerifyHref(`/tournaments/${tournamentId}/apply`)}
            className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
            style={{ marginTop: 16 }}
          >
            본인인증 하러 가기
          </Link>
          <Link
            href={loadedDetailHref}
            className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"
            style={{ marginTop: 12 }}
          >
            {competitionNoun} 상세로 돌아가기
          </Link>
        </div>
      );
  }

  // Only allow apply when tournament is open
  const applicationSurfaceOpen = tournament.kind === 'regular_league'
    ? tournament.status !== 'completed' && tournament.status !== 'cancelled'
    : tournament.status === 'open';
  if (!applicationSurfaceOpen) {
    return (
              <div style={{ padding: '0 20px', marginTop: 24 }}>
          <AlertBanner
            message="지금은 참가 신청을 받지 않아요."
            tone="info"
          />
          <Link
            href={loadedDetailHref}
            className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"
            style={{ marginTop: 16 }}
          >
            {competitionNoun} 상세로 돌아가기
          </Link>
        </div>
      );
  }

  async function handleTeamNext() {
    if (createBusyRef.current || isCreating) return;
    if (!selectedTeamId) return;
    if (selectedRegistration) {
      const action = resolveRegistrationResumeAction(selectedRegistration.status);
      if (action === 'agreements' || action === 'payment') {
        setRegistrationId(selectedRegistration.id);
        setStep(action);
        setSubmitError(null);
        return;
      }
      if (action === 'redirect') {
        setRegistrationId(selectedRegistration.id);
        setIsRedirectingAway(true);
        router.replace(appRoute(`/tournaments/${tournamentId}/my?reg=${selectedRegistration.id}`));
        return;
      }
      // action === null (cancelled) → 이어받지 않고 아래에서 새 신청을 만든다.
      // (서버는 취소된 신청을 draft로 되살리므로 create가 재신청 경로다)
    }
    if (newRegistrationBlockMessage) {
      setSubmitError(newRegistrationBlockMessage);
      return;
    }
    setSubmitError(null);
    createBusyRef.current = true;
    try {
      const reg = await createRegistration.mutateAsync({ teamId: selectedTeamId });
      setRegistrationId(reg.id);
      const action = resolveRegistrationResumeAction(reg.status);
      if (action === 'agreements' || action === 'payment') {
        setStep(action);
        return;
      }
      if (action === 'redirect') {
        setIsRedirectingAway(true);
        router.replace(appRoute(`/tournaments/${tournamentId}/my?reg=${reg.id}`));
        return;
      }
      window.location.assign(appRoute(`/tournaments/${tournamentId}/my?reg=${reg.id}`));
    } catch (err) {
      setSubmitError(extractErrorMessage(err, '신청을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.'));
    } finally {
      createBusyRef.current = false;
    }
  }

  async function handleAgreementsSubmit() {
    if (submitBusyRef.current || !selectedTeamId) return;
    // registrationId가 없으면 여기서 새 신청을 만든다 — 그 경로도 같은 기준으로 막는다.
    if (!registrationId && newRegistrationBlockMessage) {
      setSubmitError(newRegistrationBlockMessage);
      setStep('team');
      return;
    }
    submitBusyRef.current = true;
    setSubmitError(null);
    try {
      const targetRegistrationId = registrationId
        ?? (await createRegistration.mutateAsync({ teamId: selectedTeamId })).id;
      setRegistrationId(targetRegistrationId);
      const submittedRegistration = await submitRegistration.mutateAsync({
        registrationIdOverride: targetRegistrationId,
        termsDocumentIds: agreements.acceptedTermsDocumentIds ?? [],
        paymentMethod: agreements.paymentMethod,
        depositorName: agreements.paymentMethod === 'bank_transfer' ? agreements.depositorName : undefined,
        agreedRules: agreements.agreedRules,
        agreedPrivacy: agreements.agreedPrivacy,
        agreedRefund: agreements.agreedRefund,
        agreedMediaConsent: agreements.agreedMediaConsent,
      });
      setSubmittedPaymentInstructions(submittedRegistration.paymentInstructions);
      trackEvent('tournament_apply_complete', { tournamentId });
      setStep('payment');
    } catch (err) {
      setSubmitError(extractErrorMessage(err, '신청 제출 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.'));
    } finally {
      submitBusyRef.current = false;
    }
  }

  function requestAgreementsSubmit() {
    if (!canSubmitAgreements || isSubmittingApplication) return;
    setSubmitConfirmOpen(true);
  }

  function confirmAgreementsSubmit() {
    if (submitBusyRef.current || isSubmittingApplication) return;
    void handleAgreementsSubmit().finally(() => setSubmitConfirmOpen(false));
  }

  function handleAgreementsBack() {
    if (requestedTeamId) {
      router.push(appRoute(hubHref));
      return;
    }
    setStep('team');
  }

  return (
    <>
      {/* maxWidth/marginInline 인라인 스타일 제거:
          모바일은 globals.css 기본값이 처리, 데스크톱은 tournaments.css의
          .tm-tournament-apply-body { max-width:unset } + .tm-tournament-form-grid 가 담당 */}
      <div className="tm-tournament-apply-body">
        <StepIndicator current={step} isFreeEntry={tournament.entryFee === 0} />

        {/* Desktop 2-column layout via .tm-tournament-form-grid */}
        <div className="tm-tournament-form-grid">
          {/* Left column: step content */}
          <div className="tm-tournament-form-main">
            {step === 'team' ? (
              <>
                {submitError ?? newRegistrationBlockMessage ? (
                  <div style={{ padding: '12px 20px 0' }}>
                    <AlertBanner message={submitError ?? newRegistrationBlockMessage!} />
                  </div>
                ) : null}
                <TeamSelectStep
                  tournament={tournament}
                  teams={eligibleTeams}
                  hasAnyTeam={myTeams.length > 0}
                  registrations={myRegistrations}
                  isLoadingTeams={loadingTeams}
                  selectedTeamId={selectedTeamId}
                  onSelectTeam={handleSelectTeam}
                  onNext={handleTeamNext}
                  isCreating={isCreating}
                  cancelHref={applyBackHref}
                />
              </>
            ) : step === 'agreements' ? (
              <AgreementsStep
                tournament={tournament}
                selectedTeam={selectedTeam}
                state={agreements}
                onChange={(patch) => setAgreements((prev) => ({ ...prev, ...patch }))}
                onBack={handleAgreementsBack}
                onSubmit={requestAgreementsSubmit}
                isSubmitting={isSubmittingApplication}
                error={submitError ?? newRegistrationBlockMessage}
                termsError={
                  tournamentTerms.isError
                    ? { message: '현재 대회 약관을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.', onRetry: () => void tournamentTerms.refetch() }
                    : tournamentTerms.data && !tournamentTerms.data.ready
                      ? { message: '현재 대회 필수 약관이 준비되지 않아 신청할 수 없어요.', onRetry: () => void tournamentTerms.refetch() }
                      : null
                }
                terms={tournamentTerms.data?.items ?? []}
              />
            ) : registrationId ? (
              <PaymentGuideStep
                tournament={tournament}
                registrationId={registrationId}
                initialPaymentInstructions={
                  submittedPaymentInstructions ??
                  selectedRegistration?.paymentInstructions ??
                  null
                }
                onBack={() => setStep('agreements')}
              />
            ) : null}
          </div>

          {/* Right rail: order summary + CTA — desktop only */}
          <aside
            className="tm-tournament-form-rail tm-show-desktop"
            role="complementary"
            aria-label="신청 요약"
          >
            <DesktopRailSummary
              tournament={tournament}
              selectedTeam={selectedTeam}
              depositorName={agreements.depositorName}
              step={step}
              canSubmit={canSubmitAgreements}
              isSubmitting={isSubmittingApplication}
              onSubmitFromRail={requestAgreementsSubmit}
              selectedTeamId={selectedTeamId}
              hasManagerTeam={managerTeams.length > 0}
              isCreating={isCreating}
              onNext={handleTeamNext}
            />
          </aside>
        </div>

        <SponsorLogoStrip sponsors={tournament.sponsors} />

        {/* Full-screen creating overlay */}
        {isCreating ? (
          <div
            role="status"
            aria-live="polite"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'var(--scrim-dark-32)',
              display: 'grid',
              placeItems: 'center',
              zIndex: 'var(--z-top)',
            }}
          >
            <div
              className="tm-text-label"
              style={{ color: 'var(--static-white)', background: 'var(--scrim-dark-72)', padding: '12px 20px', borderRadius: 'var(--radius-field)' }}
            >
              잠깐만요…
            </div>
          </div>
        ) : null}
        {submitConfirmOpen ? (
          <TournamentSubmitConfirmDialog
            isSubmitting={isSubmittingApplication}
            onCancel={() => setSubmitConfirmOpen(false)}
            onConfirm={confirmAgreementsSubmit}
          />
        ) : null}
      </div>
    </>
  );
}
