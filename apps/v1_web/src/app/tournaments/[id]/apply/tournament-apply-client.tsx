'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AppChrome } from '@/components/v1-ui/shell';
import { AlertBanner, Card, InfoRow, SectionTitle } from '@/components/v1-ui/primitives';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { getTournamentPaymentDeadlineState } from '@/components/tournaments/tournament-payment-deadline';
import { getTournamentRosterNextStep } from '@/components/tournaments/tournament-roster-next-step';
import {
  useV1Tournament,
  useV1MyTeams,
  useV1MyRegistrations,
  useV1Registration,
  useV1CreateRegistration,
  useV1SubmitRegistration,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { appRoute } from '@/lib/app-route';
import { formatEntryFee } from '@/lib/date-utils';
import type {
  V1MyTeam,
  V1TournamentDetail,
  V1TournamentPaymentMethod,
  V1TournamentRegistration,
  V1TournamentRegistrationStatus,
} from '@/types/api';

/* ── Helpers ── */

function normalizeMyTeams(data: ReturnType<typeof useV1MyTeams>['data']): V1MyTeam[] | undefined {
  if (!data) return undefined;
  return 'items' in data ? data.items : (data as V1MyTeam[]);
}

/* ── Step indicator ── */

type ApplyStep = 'team' | 'agreements' | 'payment';

const STEPS: Array<{ id: ApplyStep; label: string }> = [
  { id: 'team', label: '팀 선택' },
  { id: 'agreements', label: '동의 · 결제 수단' },
  { id: 'payment', label: '결제 안내' },
];

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

function StepIndicator({ current }: { current: ApplyStep }) {
  const currentIndex = STEPS.findIndex((s) => s.id === current);
  const currentLabel = STEPS[currentIndex]?.label ?? '';
  const nextStep = STEPS[currentIndex + 1];
  return (
    <div className="tm-create-progress" style={{ padding: '14px 20px 0' }} aria-label="신청 단계">
      {/* a11y: 단계 전환 시 스크린리더에 현재 단계 공지 (aria-live polite) */}
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {`${currentIndex + 1}단계 중 ${STEPS.length}단계: ${currentLabel}`}
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

/* ── Order Summary Card (shared between desktop rail + mobile recap) ── */

function OrderSummaryCard({
  tournament,
  selectedTeam,
  depositorName,
  step,
  compact = false,
}: {
  tournament: V1TournamentDetail;
  selectedTeam: V1MyTeam | undefined;
  depositorName: string;
  step?: ApplyStep;
  compact?: boolean;
}) {
  // Hide payment-related rows on step 'team' (not yet entered)
  const showPaymentRows = step !== 'team';

  return (
    <Card
      pad={compact ? 12 : 16}
      style={compact ? { background: 'var(--grey50)' } : undefined}
      aria-label="신청 요약"
    >
      {!compact && (
        <div
          className="tm-text-label"
          style={{ color: 'var(--text-strong)', fontWeight: 700, marginBottom: 12 }}
        >
          신청 요약
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <InfoRow label="대회명" value={tournament.title} />
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
      />

      {step === 'team' && (
        <button
          type="button"
          className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
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
          className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
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
          className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
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
                style={{ height: 72, borderRadius: 14, background: 'var(--grey100)' }}
              />
            ))}
          </div>
        ) : teams.length === 0 ? (
          <Card pad={16} style={{ background: 'var(--grey50)' }}>
            <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>
              소속 팀이 없어요
            </div>
            <p
              className="tm-text-caption"
              style={{ marginTop: 6, lineHeight: 1.6, color: 'var(--text-muted)' }}
            >
              팀을 먼저 만들고 참가 신청을 해주세요.
            </p>
            <Link
              href="/teams/new"
              className="tm-btn tm-btn-md tm-btn-primary tm-btn-block"
              style={{ marginTop: 14 }}
            >
              팀 만들기
            </Link>
          </Card>
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
                  style={{
                    all: 'unset',
                    display: 'block',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  <Card
                    pad={14}
                    className={isSelected ? 'tm-create-selected' : undefined}
                    style={{
                      opacity: isManager ? 1 : 0.55,
                      cursor: isManager ? 'pointer' : 'default',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <TeamAvatar seed={team.teamId} name={team.name} logoUrl={team.logoUrl} size="md" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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
                            borderRadius: '50%',
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
            className="tm-btn tm-btn-lg tm-btn-primary"
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
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 14px',
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
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
              <span className="tm-text-body" style={{ color: 'var(--text-strong)', lineHeight: 1.35 }}>
                {label}
              </span>
              {consentType ? (
                <span
                  className="tm-text-micro"
                  style={{
                    flexShrink: 0,
                    padding: '2px 6px',
                    borderRadius: 999,
                    background: consentType === 'required' ? 'var(--red50)' : 'var(--grey100)',
                    color: consentType === 'required' ? 'var(--red600)' : 'var(--text-muted)',
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
              padding: '4px 6px',
              cursor: 'pointer',
              color: 'var(--text-caption)',
              minWidth: 44,
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
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

const TOURNAMENT_CONSENT_DOCUMENTS = {
  rules: {
    title: '대회 규정 및 안내사항 동의',
    body: `본인은 팀밋 대회 규정 및 안내사항을 확인하였으며 이에 동의합니다.

1. 참가 신청 및 참가 확정

대회 참가 신청은 신청 완료만으로 확정되지 않습니다.

운영진의 신청 내용 확인과 참가비 입금 확인이 완료되어야 최종 참가가 확정됩니다.

참가자는 팀명, 대표자명, 연락처, 참가자 명단, 생년월일, 성별, 포지션, 선출·비선출 여부 등 대회 운영에 필요한 정보를 정확히 입력해야 합니다.

2. 참가 자격

참가자는 대회별로 정해진 참가 자격을 충족해야 합니다.

참가자는 본인의 이름, 생년월일, 성별, 선출·비선출 여부, 포지션 등 참가 자격 확인에 필요한 정보를 사실대로 제출해야 합니다.

3. 선출·비선출 구분

본 대회는 공정한 경기 운영을 위해 선출·비선출 여부를 구분할 수 있습니다.

참가자는 본인의 선수 경력, 소속 이력, 참가 자격과 관련된 정보를 사실대로 제출해야 합니다.

4. 허위 신분 및 허위 이력 제출 금지

선출·비선출 구분을 피하거나 참가 자격을 충족하는 것처럼 보이기 위해 이름, 생년월일, 소속, 선수 경력, 선출 여부 등 신분 또는 이력을 허위로 제출하거나 숨기는 행위는 금지됩니다.

신분을 속이는 행위, 선출·비선출 여부 허위 기재, 선수 경력 은폐, 대리 참가, 명단 외 선수 출전이 확인되는 경우 해당 선수는 출전 제한될 수 있으며, 해당 팀은 몰수패, 실격 또는 팀 탈락 처리될 수 있습니다.

5. 대회 종료 후 조치

대회 종료 후라도 허위 신분, 허위 이력, 대리 참가, 참가 자격 위반이 확인되는 경우 수상 취소, 기록 삭제, 시상 회수, 향후 팀밋 대회 참가 제한 등의 조치가 이루어질 수 있습니다.

6. 팀원 변경

참가자 명단은 운영진이 정한 기한 내에 제출해야 하며, 명단 제출 이후 선수 변경은 운영진의 사전 승인 하에만 가능합니다.

운영진 승인 없이 명단에 없는 선수가 출전하는 경우 해당 팀은 몰수패 또는 실격 처리될 수 있습니다.

7. 경기 운영

경기 방식, 경기 시간, 휴식 시간, 교체 방식, 조 편성, 토너먼트 방식, 순위 결정 기준은 대회별 안내에 따릅니다.

참가팀은 경기 시작 전 지정된 시간까지 현장에 도착하여 출석 확인 및 경기 준비를 완료해야 합니다.

경기 중 모든 참가자는 심판 및 운영진의 안내에 따라야 합니다.

8. 노쇼 및 지각

참가 확정 후 대회 당일 사전 통보 없이 불참하는 경우 노쇼로 간주합니다.

노쇼가 발생한 팀 또는 참가자는 실격 처리됩니다.

경기 시작 시간까지 운영진이 정한 최소 인원이 도착하지 않은 경우 해당 팀은 몰수패 또는 실격 처리될 수 있습니다.

9. 금지행위

참가자는 대회 중 다음 행위를 해서는 안 됩니다.

- 폭언, 욕설, 비방, 조롱
- 심판, 운영진, 상대팀, 관중에 대한 위협적 언행
- 폭행 또는 물리적 충돌
- 고의적인 위험 플레이
- 경기 지연 행위
- 심판 판정에 대한 과도한 항의
- 음주 후 경기 참가
- 허위 정보 제출
- 대리 참가
- 명단에 없는 선수 출전
- 선출·비선출 여부를 속이는 행위
- 시설물 훼손
- 대회 운영 방해

위 행위가 확인되는 경우 운영진은 경고, 퇴장, 몰수패, 실격, 팀 탈락, 향후 대회 참가 제한 등의 조치를 할 수 있습니다.

10. 안전 및 부상

참가자는 본인의 건강 상태를 확인한 후 대회에 참가해야 합니다.

참가자는 경기 중 부상 위험이 있음을 인지하고, 무리한 플레이나 위험한 행동을 해서는 안 됩니다.

경기 중 발생한 부상, 개인 질환, 참가자 간 충돌, 장비 미착용 등으로 인한 사고에 대해 팀밋은 고의 또는 중대한 과실이 없는 한 책임을 지지 않습니다.

본인은 위 대회 규정 및 안내사항을 확인하였으며 이에 동의합니다.

회사명: 아이위(IWI)
대표자: 김봉목
시행일: 2026년 7월 1일`,
  },
  privacy: {
    title: '대회 참가 개인정보 수집·이용 동의',
    body: `아이위(IWI)(대표 김봉목)는 팀밋 대회 신청 및 운영을 위해 아래 개인정보를 수집·이용합니다.

1. 수집 항목

팀명, 대표자명, 대표자 연락처, 참가자 이름, 생년월일, 성별, 포지션, 선출·비선출 여부, 참가 신청 내역, 입금자명

2. 이용 목적

1. 대회 참가 신청 접수
2. 참가자 확인
3. 참가 자격 검토
4. 선출·비선출 구분
5. 참가비 입금 확인
6. 경기 운영
7. 실격 및 제재 관리
8. 대회 안내
9. 분쟁 대응
10. 부정 참가 및 대리 참가 확인

3. 보유 및 이용 기간

대회 종료 후 최대 3년까지 보관합니다.

단, 분쟁, 사고, 부정 참가, 환불, 정산 대응이 필요한 경우 해당 사유 종료 시까지 보관할 수 있습니다.

4. 동의 거부 안내

이용자는 개인정보 수집 및 이용에 동의하지 않을 권리가 있습니다.

다만 필수 개인정보 수집 및 이용에 동의하지 않을 경우 대회 신청 및 참가가 제한됩니다.

5. 개인정보 보호책임자

성명: 김봉목
직책: 대표
이메일: teameetsports@naver.com

본인은 위 개인정보 수집 및 이용 내용을 확인하였으며 이에 동의합니다.

회사명: 아이위(IWI)
대표자: 김봉목
시행일: 2026년 7월 1일`,
  },
  refund: {
    title: '참가비 입금·취소·환불 정책 동의',
    body: `본인은 팀밋 대회 참가비 입금, 신청 취소 및 환불 정책을 확인하였으며 이에 동의합니다.

1. 참가비 입금

대회 신청 후 팀밋이 안내한 계좌로 참가비를 입금해야 합니다.

2. 입금 기한

대회 신청 후 2시간 이내에 참가비 입금이 확인되지 않는 경우 해당 신청은 자동 취소됩니다.

3. 입금자명

입금자명은 신청자명 또는 팀명과 동일하게 입력해야 합니다.

입금자명 불일치로 인해 입금 확인이 지연되는 경우 신청 취소 또는 참가 제한이 발생할 수 있습니다.

4. 신청 취소

참가비 입금 후 신청자의 단순 변심, 일정 착오, 팀 내부 사정, 선수 구성 실패, 개인 사정 등을 이유로 한 신청 취소는 원칙적으로 불가합니다.

참가자는 신청 전 대회 일정, 장소, 참가비, 경기 방식, 참가 자격, 환불 기준을 충분히 확인해야 합니다.

5. 대회 취소 시 환불

팀밋 또는 주최 측 사정으로 대회가 취소되는 경우 참가비는 100% 환불됩니다.

기상 악화, 천재지변, 시설 문제, 안전 문제, 감염병, 행정명령 등 불가피한 사유로 대회가 취소되는 경우에도 참가비는 100% 환불됩니다.

대회 취소가 결정되는 경우 팀밋은 사전에 서비스 공지, 문자, 알림톡, 이메일, 대표자 연락 등 가능한 방법으로 안내합니다.

6. 대회 연기 시 환불

대회가 연기되는 경우 팀밋은 변경 일정, 장소, 운영 방식을 사전에 안내합니다.

대회가 연기되는 경우 참가자는 기존 대회일 기준 2주 전까지 참가 취소 및 환불을 요청할 수 있습니다.

기존 대회일 기준 2주 전이 지난 이후에는 연기된 일정에 참가하지 않더라도 환불이 제한될 수 있습니다.

7. 환불 제한

노쇼, 허위 신분 제출, 선출·비선출 여부 허위 기재, 대리 참가, 명단 외 선수 출전, 운영 방해 등 참가자 또는 참가팀 귀책 사유로 실격 처리되는 경우 참가비는 환불되지 않습니다.

8. 환불 처리 기간

환불은 환불 대상 확정 및 환불 계좌 확인 후 영업일 기준 3~7일 이내 처리됩니다.

단, 금융기관, 공휴일, 내부 확인 절차에 따라 지연될 수 있습니다.

본인은 위 참가비 입금·취소·환불 정책을 확인하였으며 이에 동의합니다.

회사명: 아이위(IWI)
대표자: 김봉목
이메일: teameetsports@naver.com
시행일: 2026년 7월 1일`,
  },
  media: {
    title: '사진·영상 촬영 및 홍보 활용 동의',
    body: `본인은 팀밋 대회 현장에서 사진, 영상, 음성 등이 촬영될 수 있음을 확인하며, 촬영된 자료가 아래 목적과 범위 내에서 활용되는 것에 동의합니다.

1. 촬영 항목

1. 대회 현장 사진
2. 경기 장면 사진 및 영상
3. 단체 사진
4. 참가자 인터뷰
5. 현장 스케치 영상
6. 음성 또는 발언 내용
7. 시상식, 이벤트, 부스 참여 장면

2. 활용 목적

촬영된 자료는 다음 목적으로 활용될 수 있습니다.

1. 팀밋 서비스 홍보
2. 대회 기록 및 결과 보고
3. 팀밋 홈페이지, 앱, SNS 콘텐츠 게시
4. 보도자료 및 홍보자료 제작
5. 제안서, 소개서, 협찬사 결과 보고 자료 활용
6. 향후 대회 및 이벤트 홍보
7. 현장 스케치, 릴스, 숏폼, 카드뉴스 등 콘텐츠 제작

3. 활용 매체

촬영 자료는 다음 매체에 게시 또는 활용될 수 있습니다.

1. 팀밋 공식 홈페이지
2. 팀밋 앱 또는 웹서비스
3. 팀밋 공식 SNS
4. 블로그, 커뮤니티, 뉴스레터
5. 제휴사 또는 협찬사 결과 보고 자료
6. 대회 소개서, 제안서, 홍보물
7. 온라인 광고 또는 오프라인 홍보물

4. 보유 및 이용 기간

촬영 자료는 활용 목적 달성 시까지 보유 및 이용될 수 있습니다.

단, 이용자가 삭제 또는 사용 중단을 요청하는 경우 회사는 합리적인 범위 내에서 검토 후 조치합니다.

이미 배포된 인쇄물, 제3자에게 전달된 결과 보고 자료, 단체 사진, 경기 전체 영상 등 회수 또는 개별 삭제가 어려운 자료는 삭제 또는 사용 중단이 제한될 수 있습니다.

5. 동의 거부 안내

사진·영상 촬영 및 홍보 활용 동의는 선택 사항입니다.

동의하지 않아도 대회 참가 자체에는 제한이 없습니다.

다만 단체 사진, 경기 장면, 현장 스케치 등 공개된 행사 공간에서 불가피하게 촬영될 수 있는 자료에 일부 노출될 수 있습니다.

촬영을 원하지 않는 참가자는 대회 또는 행사 시작 전 운영진에게 사전에 알려야 하며, 회사는 합리적인 범위 내에서 이를 반영하기 위해 노력합니다.

6. 유의사항

회사는 촬영 자료를 특정 개인을 비방하거나 명예를 훼손하는 방식으로 사용하지 않습니다.

회사는 촬영 자료를 팀밋 서비스, 대회 운영, 홍보, 기록, 결과 보고 목적 범위 내에서 사용합니다.

본인은 위 내용을 확인하였으며 사진·영상 촬영 및 홍보 활용에 동의합니다.

회사명: 아이위(IWI)
대표자: 김봉목
이메일: teameetsports@naver.com
시행일: 2026년 7월 1일`,
  },
} satisfies Record<string, TournamentConsentDocument>;

function AgreementsStep({
  tournament,
  selectedTeam,
  state,
  onChange,
  onBack,
  onSubmit,
  isSubmitting,
  error,
}: {
  tournament: V1TournamentDetail;
  selectedTeam: V1MyTeam | undefined;
  state: AgreementsState;
  onChange: (patch: Partial<AgreementsState>) => void;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  const [activeConsentDocument, setActiveConsentDocument] = useState<TournamentConsentDocument | null>(null);
  const allRequired = state.agreedRules && state.agreedPrivacy && state.agreedRefund;
  const allAgreed = allRequired && state.agreedMediaConsent;
  const bankTransferValid =
    state.paymentMethod !== 'bank_transfer' || state.depositorName.trim().length > 0;
  const canSubmit = allRequired && bankTransferValid;
  const toggleAllAgreements = (checked: boolean) => {
    onChange({
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
          <ExpandableCheckRow
            id="agree-rules"
            label="대회 규정 및 안내사항 동의"
            consentType="required"
            summary="참가 자격, 경기 운영, 노쇼, 실격, 허위 신분 제출 금지에 대한 동의입니다."
            checked={state.agreedRules}
            onChange={(v) => onChange({ agreedRules: v })}
            document={TOURNAMENT_CONSENT_DOCUMENTS.rules}
            onOpenDocument={setActiveConsentDocument}
            divider
          />
          <ExpandableCheckRow
            id="agree-privacy"
            label="대회 참가 개인정보 수집·이용 동의"
            consentType="required"
            summary="대회 참가자 확인 및 참가 자격 검토를 위한 동의입니다."
            checked={state.agreedPrivacy}
            onChange={(v) => onChange({ agreedPrivacy: v })}
            document={TOURNAMENT_CONSENT_DOCUMENTS.privacy}
            onOpenDocument={setActiveConsentDocument}
            divider
          />
          <ExpandableCheckRow
            id="agree-refund"
            label="참가비 입금·취소·환불 정책 동의"
            consentType="required"
            summary="입금 기한, 신청 취소, 환불 기준에 대한 동의입니다."
            checked={state.agreedRefund}
            onChange={(v) => onChange({ agreedRefund: v })}
            document={TOURNAMENT_CONSENT_DOCUMENTS.refund}
            onOpenDocument={setActiveConsentDocument}
            divider
          />
          <ExpandableCheckRow
            id="agree-media"
            label="사진·영상 촬영 및 홍보 활용 동의"
            consentType="optional"
            summary="대회 기록, 홍보 콘텐츠, 협찬사 결과 보고에 활용될 수 있습니다."
            checked={state.agreedMediaConsent}
            onChange={(v) => onChange({ agreedMediaConsent: v })}
            document={TOURNAMENT_CONSENT_DOCUMENTS.media}
            onOpenDocument={setActiveConsentDocument}
            divider
          />
        </Card>
      </section>

      {/* Payment method — bank transfer only */}
      <section aria-labelledby="payment-method-heading" style={{ marginTop: 16 }}>
        <div style={{ marginLeft: -20, marginRight: -20 }}>
          <SectionTitle id="payment-method-heading" title="결제 수단" />
        </div>
        <Card pad={14} style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44 }}>
            <div
              aria-hidden="true"
              style={{
                flexShrink: 0,
                width: 22,
                height: 22,
                borderRadius: '50%',
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
                  borderRadius: '50%',
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
                <br />
                신청 후 2시간 이내 입금 확인이 되지 않으면 신청은 자동 취소됩니다.
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

        <Card pad={14} style={{ marginTop: 10 }}>
          <label htmlFor="depositor-name" className="tm-text-caption" style={{ display: 'block', marginBottom: 6 }}>
            입금자명 <span style={{ color: 'var(--red500)' }}>*</span>
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

      {/* Free tournament notice */}
      {tournament.entryFee === 0 ? (
        <Card pad={12} style={{ marginTop: 16, background: 'var(--grey50)' }}>
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
            이 대회는 무료로 참가할 수 있어요.
          </p>
        </Card>
      ) : null}

      {/* Mobile recap before CTA — shows total before committing */}
      <div style={{ marginTop: 20 }}>
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
            className="tm-btn tm-btn-lg tm-btn-primary"
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
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="presentation"
      onClick={onClose}
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
            padding: '18px 18px 12px',
            borderBottom: '1px solid var(--grey100)',
          }}
        >
          <h2 id="tournament-consent-dialog-title" className="tm-text-subhead" style={{ margin: 0 }}>
            {document.title}
          </h2>
          <button className="tm-btn tm-btn-sm tm-btn-ghost" onClick={onClose} type="button" autoFocus>
            닫기
          </button>
        </header>
        <div style={{ overflowY: 'auto', padding: '18px' }}>
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
  useEffect(() => {
    if (isSubmitting) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitting, onCancel]);

  return (
    <div
      role="presentation"
      onClick={isSubmitting ? undefined : onCancel}
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
        role="dialog"
        aria-modal="true"
        aria-labelledby="tournament-submit-confirm-title"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(100%, 440px)',
          borderRadius: 18,
          background: 'var(--bg)',
          boxShadow: 'var(--shadow-modal)',
          padding: 18,
        }}
      >
        <h2 id="tournament-submit-confirm-title" className="tm-text-subhead" style={{ margin: 0 }}>
          신청 전 확인해 주세요
        </h2>
        <div
          className="tm-text-caption"
          style={{ color: 'var(--text-muted)', lineHeight: 1.7, marginTop: 12 }}
        >
          신청 후 2시간 이내에 입금 확인이 되지 않으면 신청이 자동 취소됩니다.
          <br />
          참가비 입금 후 단순 변심 또는 팀 사정으로 인한 신청 취소는 불가합니다.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 8, marginTop: 18 }}>
          <button
            type="button"
            className="tm-btn tm-btn-lg tm-btn-neutral"
            disabled={isSubmitting}
            onClick={onCancel}
            autoFocus
          >
            취소
          </button>
          <button
            type="button"
            className="tm-btn tm-btn-lg tm-btn-primary"
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
  paymentDueAt,
  onBack,
}: {
  tournament: V1TournamentDetail;
  registrationId: string;
  paymentDueAt: string | null;
  onBack: () => void;
}) {
  // P0: 방금 제출한 입금자명을 모바일에서도 재확인할 수 있게 배선 (입금자명 불일치 = 자동취소 정책)
  const { data: registration } = useV1Registration(tournament.id, registrationId);
  const hasBankInfo =
    Boolean(tournament.bankName) &&
    Boolean(tournament.bankAccount) &&
    Boolean(tournament.bankHolder);

  // aria-live region ref for clipboard confirmation
  const copyLiveRef = useRef<HTMLSpanElement>(null);
  const paymentDeadline = getTournamentPaymentDeadlineState(paymentDueAt);
  const rosterNextStep = getTournamentRosterNextStep({
    tournamentId: tournament.id,
    registrationId,
    minPlayers: tournament.minPlayers,
    maxPlayers: tournament.maxPlayers,
  });

  function handleCopyAccount() {
    if (!tournament.bankAccount) return;
    navigator.clipboard.writeText(tournament.bankAccount).then(() => {
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
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '24px 0 8px' }}
      >
        <div
          className="tm-complete-check"
          aria-hidden="true"
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
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
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>아래 계좌로 참가비를 입금해 주세요</div>
      </div>

      <section aria-labelledby="bank-guide-heading" style={{ marginTop: 12 }}>
        <div style={{ marginLeft: -20, marginRight: -20 }}>
          <SectionTitle id="bank-guide-heading" title="입금 안내" />
        </div>
        <Card pad={0} style={{ marginTop: 8 }}>
          {hasBankInfo ? (
            <div style={{ padding: '0 16px' }}>
              <InfoRow label="은행" value={tournament.bankName!} />
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
                    {tournament.bankAccount}
                  </span>
                  <button
                    type="button"
                    className="tm-btn tm-btn-sm tm-btn-outline"
                    onClick={handleCopyAccount}
                    aria-label={`계좌번호 ${tournament.bankAccount} 복사`}
                    style={{ flexShrink: 0 }}
                  >
                    복사
                  </button>
                </div>
              </div>
              <InfoRow label="예금주" value={tournament.bankHolder!} />
              <InfoRow label="입금액" value={formatEntryFee(tournament.entryFee)} />
              <InfoRow
                label="입금자명"
                value={registration?.depositorName ?? '—'}
                isLast={!paymentDeadline}
              />
              {paymentDeadline ? (
                <InfoRow label="입금 기한" value={paymentDeadline.label} isLast />
              ) : null}
            </div>
          ) : (
            <div style={{ padding: '0 16px 14px' }}>
              <AlertBanner
                tone="info"
                message="신청했어요. 계좌 정보는 확인 후 알림으로 안내드릴게요."
              />
              <div style={{ marginTop: 10 }}>
                <InfoRow
                  label="입금액"
                  value={formatEntryFee(tournament.entryFee)}
                  isLast={!paymentDeadline}
                />
                {paymentDeadline ? (
                  <InfoRow label="입금 기한" value={paymentDeadline.label} isLast />
                ) : null}
              </div>
            </div>
          )}
        </Card>

        <Card pad={14} style={{ marginTop: 12, background: 'var(--grey50)' }}>
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.65 }}>
            {paymentDeadline
              ? `${paymentDeadline.message} 입금자명이 다르면 확인이 늦어질 수 있어요.`
              : '입금이 확인되면 신청이 최종 확정돼요. 입금자명이 다르면 확인이 늦어질 수 있어요.'}
          </p>
        </Card>

        <section aria-labelledby="roster-next-step-heading" style={{ marginTop: 12, scrollMarginBottom: 144 }}>
          <Card pad={14}>
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
          className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
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
          style={{ height: 64, borderRadius: 14, background: 'var(--grey100)', marginBottom: 10 }}
        />
      ))}
    </div>
  );
}

/* ── Main client ── */

export function TournamentApplyPageClient({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTeamId = searchParams.get('team') ?? '';
  const hubHref = `/tournaments/${tournamentId}/my`;
  const detailHref = `/tournaments/${tournamentId}`;
  const applyBackHref = requestedTeamId ? hubHref : detailHref;
  const { data: tournament, isLoading: loadingTournament, isError: tournamentError, error: tournamentErr } = useV1Tournament(tournamentId);
  const { data: myTeamsData, isLoading: loadingTeams } = useV1MyTeams();
  const { data: myRegistrations = [], isLoading: loadingMyRegistrations } = useV1MyRegistrations(tournamentId);

  const myTeams = normalizeMyTeams(myTeamsData) ?? [];
  const managerTeams = myTeams.filter((team) => team.role === 'owner' || team.role === 'manager');

  const [step, setStep] = useState<ApplyStep>('team');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [paymentDueAt, setPaymentDueAt] = useState<string | null>(null);
  const [agreements, setAgreements] = useState<AgreementsState>({
    agreedRules: false,
    agreedPrivacy: false,
    agreedRefund: false,
    agreedMediaConsent: false,
    paymentMethod: 'bank_transfer',
    depositorName: '',
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
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

  // P0: 입금자명 prefill — 정책상 팀명/신청자명 일치 요구. 비어 있을 때만 선택 팀명으로 채움
  useEffect(() => {
    if (step !== 'agreements') return;
    if (agreements.depositorName.trim()) return;
    const team = managerTeams.find((t) => t.teamId === selectedTeamId);
    if (team?.name) {
      setAgreements((prev) => (prev.depositorName.trim() ? prev : { ...prev, depositorName: team.name.slice(0, 20) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedTeamId]);

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

    const needsRedirect = myManagedRegistrations.find(
      (reg) => resolveRegistrationResumeAction(reg.status) === 'redirect',
    );

    if (needsRedirect) {
      setIsRedirectingAway(true);
      router.replace(appRoute(`/tournaments/${tournamentId}/my?reg=${needsRedirect.id}`, pathname));
    }
  }, [
    loadingMyRegistrations,
    loadingTeams,
    managerTeams,
    myRegistrations,
    pathname,
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
        router.replace(appRoute(`/tournaments/${tournamentId}/my?reg=${registration.id}`, pathname));
        return;
      }
      // action === null (cancelled) → 새 신청으로 진행
    }

    setRegistrationId(null);
    setStep('agreements');
  }, [
    loadingMyRegistrations,
    loadingTeams,
    managerTeams,
    myRegistrations,
    pathname,
    requestedTeamId,
    router,
    tournamentId,
  ]);

  const selectedTeam = myTeams.find((t) => t.teamId === selectedTeamId);
  const selectedRegistration = myRegistrations.find((item) => item.teamId === selectedTeamId);

  function handleSelectTeam(teamId: string) {
    const registration = myRegistrations.find((item) => item.teamId === teamId);
    setSelectedTeamId(teamId);
    setRegistrationId(registration?.id ?? null);
    setSubmitError(null);
  }

  const allRequiredAgreed = agreements.agreedRules && agreements.agreedPrivacy && agreements.agreedRefund;
  const bankTransferValid =
    agreements.paymentMethod !== 'bank_transfer' || agreements.depositorName.trim().length > 0;
  const canSubmitAgreements = allRequiredAgreed && bankTransferValid;

  const isCreating = createRegistration.isPending;
  const isSubmittingApplication = createRegistration.isPending || submitRegistration.isPending;

  if (loadingTournament || loadingMyRegistrations || (requestedTeamId && loadingTeams) || isRedirectingAway) {
    return (
      <AppChrome title="참가 신청" backHref={applyBackHref} bottomNav={false} activeTab="tournaments">
        <LoadingSkeleton />
      </AppChrome>
    );
  }

  if (tournamentError || !tournament) {
    const msg = extractErrorMessage(tournamentErr, '대회 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    return (
      <AppChrome title="참가 신청" backHref={applyBackHref} bottomNav={false} activeTab="tournaments">
        <div style={{ padding: '0 20px', marginTop: 24 }}>
          <AlertBanner message={msg} />
          <Link
            href={`/tournaments/${tournamentId}`}
            className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"
            style={{ marginTop: 14 }}
          >
            대회 상세로 돌아가기
          </Link>
        </div>
      </AppChrome>
    );
  }

  // Only allow apply when tournament is open
  if (tournament.status !== 'open') {
    return (
      <AppChrome title="참가 신청" backHref={applyBackHref} bottomNav={false} activeTab="tournaments">
        <div style={{ padding: '0 20px', marginTop: 24 }}>
          <AlertBanner
            message="지금은 참가 신청을 받지 않아요."
            tone="info"
          />
          <Link
            href={`/tournaments/${tournamentId}`}
            className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"
            style={{ marginTop: 14 }}
          >
            대회 상세로 돌아가기
          </Link>
        </div>
      </AppChrome>
    );
  }

  async function handleTeamNext() {
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
        router.replace(appRoute(`/tournaments/${tournamentId}/my?reg=${selectedRegistration.id}`, pathname));
        return;
      }
      // action === null (cancelled) → 새 신청으로 진행
    }
    if (registrationId && selectedRegistration?.id === registrationId) {
      setStep('agreements');
      return;
    }
    setSubmitError(null);
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
        router.replace(appRoute(`/tournaments/${tournamentId}/my?reg=${reg.id}`, pathname));
        return;
      }
      window.location.assign(appRoute(`/tournaments/${tournamentId}/my?reg=${reg.id}`, pathname));
    } catch (err) {
      setSubmitError(extractErrorMessage(err, '신청을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.'));
    }
  }

  async function handleAgreementsSubmit() {
    if (!selectedTeamId) return;
    setSubmitError(null);
    try {
      const targetRegistrationId = registrationId
        ?? (await createRegistration.mutateAsync({ teamId: selectedTeamId })).id;
      setRegistrationId(targetRegistrationId);
      const submittedRegistration = await submitRegistration.mutateAsync({
        registrationIdOverride: targetRegistrationId,
        paymentMethod: agreements.paymentMethod,
        depositorName: agreements.paymentMethod === 'bank_transfer' ? agreements.depositorName : undefined,
        agreedRules: agreements.agreedRules,
        agreedPrivacy: agreements.agreedPrivacy,
        agreedRefund: agreements.agreedRefund,
        agreedMediaConsent: agreements.agreedMediaConsent,
      });
      setPaymentDueAt(submittedRegistration.payment?.paymentDueAt ?? null);
      setStep('payment');
    } catch (err) {
      setSubmitError(extractErrorMessage(err, '신청 제출 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.'));
    }
  }

  function requestAgreementsSubmit() {
    if (!canSubmitAgreements || isSubmittingApplication) return;
    setSubmitConfirmOpen(true);
  }

  function confirmAgreementsSubmit() {
    if (isSubmittingApplication) return;
    void handleAgreementsSubmit().finally(() => setSubmitConfirmOpen(false));
  }

  function handleAgreementsBack() {
    if (requestedTeamId) {
      router.push(appRoute(hubHref, pathname));
      return;
    }
    setStep('team');
  }

  return (
    <AppChrome title="참가 신청" backHref={applyBackHref} bottomNav={false} activeTab="tournaments">
      {/* maxWidth/marginInline 인라인 스타일 제거:
          모바일은 globals.css 기본값이 처리, 데스크톱은 tournaments.css의
          .tm-tournament-apply-body { max-width:unset } + .tm-tournament-form-grid 가 담당 */}
      <div className="tm-tournament-apply-body">
        <StepIndicator current={step} />

        {/* Desktop 2-column layout via .tm-tournament-form-grid */}
        <div className="tm-tournament-form-grid">
          {/* Left column: step content */}
          <div className="tm-tournament-form-main">
            {step === 'team' ? (
              <>
                {submitError ? (
                  <div style={{ padding: '12px 20px 0' }}>
                    <AlertBanner message={submitError} />
                  </div>
                ) : null}
                <TeamSelectStep
                  tournament={tournament}
                  teams={myTeams}
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
                error={submitError}
              />
            ) : registrationId ? (
              <PaymentGuideStep
                tournament={tournament}
                registrationId={registrationId}
                paymentDueAt={paymentDueAt}
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
              hasManagerTeam={myTeams.some((t) => t.role === 'owner' || t.role === 'manager')}
              isCreating={isCreating}
              onNext={handleTeamNext}
            />
          </aside>
        </div>

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
              zIndex: 9999,
            }}
          >
            <div
              className="tm-text-label"
              style={{ color: 'var(--static-white)', background: 'var(--scrim-dark-72)', padding: '12px 20px', borderRadius: 14 }}
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
    </AppChrome>
  );
}
