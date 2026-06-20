'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { AlertBanner, Card, InfoRow, SectionTitle } from '@/components/v1-ui/primitives';
import {
  useV1Tournament,
  useV1MyTeams,
  useV1CreateRegistration,
  useV1SubmitRegistration,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { formatEntryFee } from '@/lib/date-utils';
import type { V1MyTeam, V1TournamentDetail, V1TournamentPaymentMethod } from '@/types/api';

/* ── Helpers ── */

function normalizeMyTeams(data: ReturnType<typeof useV1MyTeams>['data']): V1MyTeam[] | undefined {
  if (!data) return undefined;
  return 'items' in data ? data.items : (data as V1MyTeam[]);
}

function formatPrizePool(prize: number): string {
  return `${prize.toLocaleString('ko-KR')}원`;
}

/* ── Step indicator ── */

type ApplyStep = 'team' | 'agreements' | 'payment';

const STEPS: Array<{ id: ApplyStep; label: string }> = [
  { id: 'team', label: '팀 선택' },
  { id: 'agreements', label: '동의 · 결제 수단' },
  { id: 'payment', label: '결제 안내' },
];

function StepIndicator({ current }: { current: ApplyStep }) {
  const currentIndex = STEPS.findIndex((s) => s.id === current);
  const nextStep = STEPS[currentIndex + 1];
  return (
    <div className="tm-create-progress" style={{ padding: '14px 20px 0' }} aria-label="신청 단계">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span className="tm-badge tm-badge-blue">{`${currentIndex + 1}/${STEPS.length} 단계`}</span>
        <span className="tm-text-caption" style={{ marginLeft: 8 }}>{STEPS[currentIndex]?.label}</span>
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
          isLast={!showPaymentRows && !(tournament.prizePool != null && tournament.prizePool > 0)}
        />
        {tournament.prizePool != null && tournament.prizePool > 0 ? (
          <InfoRow
            label="상금"
            value={formatPrizePool(tournament.prizePool)}
            isLast={!showPaymentRows}
          />
        ) : null}
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
  isLoadingTeams,
  selectedTeamId,
  onSelectTeam,
  onNext,
  isCreating,
}: {
  tournament: V1TournamentDetail;
  teams: V1MyTeam[];
  isLoadingTeams: boolean;
  selectedTeamId: string;
  onSelectTeam: (teamId: string) => void;
  onNext: () => void;
  isCreating: boolean;
}) {
  const managerTeams = teams.filter((t) => t.role === 'owner' || t.role === 'manager');
  const hasManagerTeam = managerTeams.length > 0;

  return (
    <div style={{ padding: '0 20px 120px' }}>
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
                      {/* Team logo placeholder */}
                      <div
                        aria-hidden="true"
                        style={{
                          flexShrink: 0,
                          width: 40,
                          height: 40,
                          borderRadius: 14,
                          background: 'var(--grey100)',
                          overflow: 'hidden',
                          display: 'grid',
                          placeItems: 'center',
                          color: 'var(--text-caption)',
                          fontSize: 17,
                        }}
                      >
                        {team.logoUrl ? (
                          <img src={team.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-caption)' }}>
                            {team.name?.charAt(0)}
                          </span>
                        )}
                      </div>
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
                            fontSize: 11,
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
          <Card pad={0} style={{ marginTop: 16, background: 'var(--grey50)' }}>
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
            href={`/tournaments/${tournament.id}`}
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
  checked,
  onChange,
  bodyText,
  divider = false,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  bodyText: string | null | undefined;
  divider?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const bodyId = `${id}-body`;

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
          aria-label={label}
        >
          <span
            aria-hidden="true"
            className={`tm-auth-check${checked ? ' tm-auth-check-on' : ''}`}
          >
            ✓
          </span>
          <span className="tm-text-body" style={{ color: 'var(--text-strong)', flex: 1 }}>
            {label}
          </span>
        </label>
        {/* Expand toggle — only shown when there is body text */}
        {bodyText ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={bodyId}
            aria-label={expanded ? '내용 접기' : '내용 보기'}
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
              outline: 'none',
            }}
            onFocus={(e) => (e.currentTarget.style.outline = '2px solid var(--blue500)')}
            onBlur={(e) => (e.currentTarget.style.outline = 'none')}
          >
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              style={{
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
                display: 'block',
              }}
            >
              <path
                d="M4 6l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : null}
      </div>

      {/* Expandable body */}
      {bodyText && expanded ? (
        <div
          id={bodyId}
          role="region"
          aria-label={`${label} 전문`}
          style={{
            padding: '0 14px 14px',
            background: 'var(--grey50)',
            borderTop: '1px solid var(--grey100)',
          }}
        >
          <p
            className="tm-text-caption"
            style={{
              color: 'var(--text-muted)',
              lineHeight: 1.7,
              marginTop: 12,
              whiteSpace: 'pre-wrap',
            }}
          >
            {bodyText}
          </p>
        </div>
      ) : null}
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
  const allRequired = state.agreedRules && state.agreedPrivacy && state.agreedRefund;
  const bankTransferValid =
    state.paymentMethod !== 'bank_transfer' || state.depositorName.trim().length > 0;
  const canSubmit = allRequired && bankTransferValid;

  return (
    <div style={{ padding: '0 20px 120px' }}>
      {/* Required consents */}
      <section aria-labelledby="consent-heading" style={{ marginTop: 20 }}>
        <div style={{ marginLeft: -20, marginRight: -20 }}>
          <SectionTitle id="consent-heading" title="필수 동의" />
        </div>
        <Card pad={0} style={{ marginTop: 8 }}>
          <ExpandableCheckRow
            id="agree-rules"
            label="대회 규정 동의 (필수)"
            checked={state.agreedRules}
            onChange={(v) => onChange({ agreedRules: v })}
            bodyText={tournament.rulesText}
          />
          <ExpandableCheckRow
            id="agree-privacy"
            label="개인정보 수집·이용 동의 (필수)"
            checked={state.agreedPrivacy}
            onChange={(v) => onChange({ agreedPrivacy: v })}
            bodyText={null}
            divider
          />
          <ExpandableCheckRow
            id="agree-refund"
            label="환불 정책 동의 (필수)"
            checked={state.agreedRefund}
            onChange={(v) => onChange({ agreedRefund: v })}
            bodyText={tournament.refundPolicyText}
            divider
          />
        </Card>
      </section>

      {/* Optional consents */}
      <section aria-labelledby="optional-consent-heading" style={{ marginTop: 16 }}>
        <div style={{ marginLeft: -20, marginRight: -20 }}>
          <SectionTitle id="optional-consent-heading" title="선택 동의" />
        </div>
        <Card pad={0} style={{ marginTop: 8 }}>
          <ExpandableCheckRow
            id="agree-media"
            label="사진·영상 촬영 및 활용 동의 (선택)"
            checked={state.agreedMediaConsent}
            onChange={(v) => onChange({ agreedMediaConsent: v })}
            bodyText={null}
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
              <div className="tm-text-micro" style={{ color: 'var(--text-caption)', marginTop: 2 }}>
                신청하면 안내해 드리는 계좌로 입금하면 돼요.
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
          <p id="depositor-name-hint" className="tm-text-micro" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
            입금 확인에 사용돼요. 실제 입금자명과 동일하게 입력해 주세요.
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
    </div>
  );
}

/* ── Step 3: Payment guide ── */

function PaymentGuideStep({
  tournament,
  registrationId,
  onBack,
}: {
  tournament: V1TournamentDetail;
  registrationId: string;
  onBack: () => void;
}) {
  const hasBankInfo =
    Boolean(tournament.bankName) &&
    Boolean(tournament.bankAccount) &&
    Boolean(tournament.bankHolder);

  // aria-live region ref for clipboard confirmation
  const copyLiveRef = useRef<HTMLSpanElement>(null);

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

      <section aria-labelledby="bank-guide-heading" style={{ marginTop: 20 }}>
        <div style={{ marginLeft: -20, marginRight: -20 }}>
          <SectionTitle title="입금 안내" />
        </div>
        <Card pad={0} style={{ marginTop: 8 }}>
          <div
            id="bank-guide-heading"
            className="tm-text-label"
            style={{ color: 'var(--text-strong)', fontWeight: 700, padding: '14px 16px 10px' }}
          >
            아래 계좌로 참가비를 입금해 주세요
          </div>

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
              <InfoRow
                label="입금액"
                value={formatEntryFee(tournament.entryFee)}
                isLast
              />
            </div>
          ) : (
            <div style={{ padding: '0 16px 14px' }}>
              <AlertBanner
                tone="info"
                message="신청이 완료됐어요. 계좌 정보는 확인 후 알림으로 안내드릴게요."
              />
              <div style={{ marginTop: 10 }}>
                <InfoRow
                  label="입금액"
                  value={formatEntryFee(tournament.entryFee)}
                  isLast
                />
              </div>
            </div>
          )}
        </Card>

        <Card pad={14} style={{ marginTop: 12, background: 'var(--grey50)' }}>
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.65 }}>
            입금이 확인되면 신청이 최종 확정돼요. 입금자명이 다르면 확인이 늦어질 수 있어요.
          </p>
        </Card>
      </section>

      {/* Fixed CTA — hidden on desktop (rail takes over) */}
      <div className="tm-fixed-cta tm-hide-desktop">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
          <button type="button" className="tm-btn tm-btn-lg tm-btn-neutral" onClick={onBack}>
            이전
          </button>
          <Link
            href={`/tournaments/${tournament.id}/my?reg=${registrationId}`}
            className="tm-btn tm-btn-lg tm-btn-primary"
          >
            내 신청 확인하기
          </Link>
        </div>
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
  const { data: tournament, isLoading: loadingTournament, isError: tournamentError, error: tournamentErr } = useV1Tournament(tournamentId);
  const { data: myTeamsData, isLoading: loadingTeams } = useV1MyTeams();

  const myTeams = normalizeMyTeams(myTeamsData) ?? [];

  const [step, setStep] = useState<ApplyStep>('team');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [agreements, setAgreements] = useState<AgreementsState>({
    agreedRules: false,
    agreedPrivacy: false,
    agreedRefund: false,
    agreedMediaConsent: false,
    paymentMethod: 'bank_transfer',
    depositorName: '',
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createRegistration = useV1CreateRegistration(tournamentId);
  const submitRegistration = useV1SubmitRegistration(tournamentId, registrationId ?? '');

  // Auto-select first manager team
  useEffect(() => {
    if (selectedTeamId) return;
    const first = myTeams.find((t) => t.role === 'owner' || t.role === 'manager');
    if (first) setSelectedTeamId(first.teamId);
  }, [myTeams, selectedTeamId]);

  const selectedTeam = myTeams.find((t) => t.teamId === selectedTeamId);

  const allRequiredAgreed = agreements.agreedRules && agreements.agreedPrivacy && agreements.agreedRefund;
  const bankTransferValid =
    agreements.paymentMethod !== 'bank_transfer' || agreements.depositorName.trim().length > 0;
  const canSubmitAgreements = allRequiredAgreed && bankTransferValid;

  const isCreating = createRegistration.isPending;

  if (loadingTournament) {
    return (
      <AppChrome title="참가 신청" backHref={`/tournaments/${tournamentId}`} bottomNav={false}>
        <LoadingSkeleton />
      </AppChrome>
    );
  }

  if (tournamentError || !tournament) {
    const msg = extractErrorMessage(tournamentErr, '대회 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    return (
      <AppChrome title="참가 신청" backHref={`/tournaments/${tournamentId}`} bottomNav={false}>
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
      <AppChrome title="참가 신청" backHref={`/tournaments/${tournamentId}`} bottomNav={false}>
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
    // REG-02: 이미 registrationId가 있으면 create를 재호출하지 않고 바로 다음 단계로 진행
    if (registrationId) {
      setStep('agreements');
      return;
    }
    setSubmitError(null);
    try {
      const reg = await createRegistration.mutateAsync({ teamId: selectedTeamId });
      setRegistrationId(reg.id);
      setStep('agreements');
    } catch (err) {
      setSubmitError(extractErrorMessage(err, '신청을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.'));
    }
  }

  async function handleAgreementsSubmit() {
    if (!registrationId) return;
    setSubmitError(null);
    try {
      await submitRegistration.mutateAsync({
        paymentMethod: agreements.paymentMethod,
        depositorName: agreements.paymentMethod === 'bank_transfer' ? agreements.depositorName : undefined,
        agreedRules: agreements.agreedRules,
        agreedPrivacy: agreements.agreedPrivacy,
        agreedRefund: agreements.agreedRefund,
        agreedMediaConsent: agreements.agreedMediaConsent,
      });
      setStep('payment');
    } catch (err) {
      setSubmitError(extractErrorMessage(err, '신청 제출 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.'));
    }
  }

  return (
    <AppChrome title="참가 신청" backHref={`/tournaments/${tournamentId}`} bottomNav={false}>
      <div
        className="tm-tournament-apply-body"
        style={{ maxWidth: 'var(--v1-app-chrome-frame-width)', marginInline: 'auto', width: '100%' }}
      >
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
                  isLoadingTeams={loadingTeams}
                  selectedTeamId={selectedTeamId}
                  onSelectTeam={setSelectedTeamId}
                  onNext={handleTeamNext}
                  isCreating={isCreating}
                />
              </>
            ) : step === 'agreements' ? (
              <AgreementsStep
                tournament={tournament}
                selectedTeam={selectedTeam}
                state={agreements}
                onChange={(patch) => setAgreements((prev) => ({ ...prev, ...patch }))}
                onBack={() => setStep('team')}
                onSubmit={handleAgreementsSubmit}
                isSubmitting={submitRegistration.isPending}
                error={submitError}
              />
            ) : registrationId ? (
              <PaymentGuideStep
                tournament={tournament}
                registrationId={registrationId}
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
              isSubmitting={submitRegistration.isPending}
              onSubmitFromRail={handleAgreementsSubmit}
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
              background: 'rgba(25,31,40,0.32)',
              display: 'grid',
              placeItems: 'center',
              zIndex: 9999,
            }}
          >
            <div
              className="tm-text-label"
              style={{ color: 'var(--static-white)', background: 'rgba(25,31,40,0.72)', padding: '12px 20px', borderRadius: 14 }}
            >
              잠깐만요…
            </div>
          </div>
        ) : null}
      </div>
    </AppChrome>
  );
}
