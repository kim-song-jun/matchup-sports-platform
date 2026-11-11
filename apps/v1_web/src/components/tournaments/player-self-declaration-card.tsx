'use client';

import { useId, useState } from 'react';
import { AlertBanner, Card, SectionTitle } from '@/components/v1-ui/primitives';
import { useV1SelfDeclareEligibility } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { PLAYER_ELIGIBILITY_LABEL } from '@/lib/v1-status-labels';
import type { V1PlayerEligibilityStatus, V1TournamentRosterPlayer } from '@/types/api';
import {
  EligibilityCriteriaHelp,
  EligibilityLockedNote,
  SELF_DECLARATION_CONSENT_TEXT,
  formatEvidenceFullDate,
} from './player-eligibility';

type Declarable = Exclude<V1PlayerEligibilityStatus, 'needs_review'>;

/**
 * 선수 본인 선출 여부 신고(MD-QA #192 ③).
 *
 * 명단 행이 **지금 보는 사용자 본인**일 때만 그린다(서버 `isViewer`). 신고는 판정을 바꾸지 않는
 * 참고 기록이고, 운영진이 판정하면 잠긴다. 허위 신고 고지에 동의해야 보낼 수 있다(서버도 다시 본다).
 */
export function PlayerSelfDeclarationCard({
  tournamentId,
  registrationId,
  player,
}: {
  tournamentId: string;
  registrationId: string;
  player: V1TournamentRosterPlayer;
}) {
  const baseId = useId();
  const declare = useV1SelfDeclareEligibility(tournamentId, registrationId);
  const [choice, setChoice] = useState<Declarable | null>(player.selfDeclaredStatus ?? null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const locked = player.eligibilityAdminReviewed === true;
  const declared = player.selfDeclaredStatus ?? null;

  async function handleSubmit() {
    if (declare.isPending) return;
    if (!choice) {
      setError('아마추어 또는 선출 중에서 골라 주세요.');
      return;
    }
    if (!consent) {
      setError('허위 신고 안내를 확인하고 동의해 주세요.');
      return;
    }
    setError(null);
    try {
      await declare.mutateAsync({ playerId: player.id, body: { selfDeclaredStatus: choice, consent: true } });
      setConsent(false);
      setNotice('선출 여부를 신고했어요. 운영진이 확인하면 결과가 표시돼요.');
    } catch (err) {
      setError(extractErrorMessage(err, '선출 여부를 신고하지 못했어요. 잠시 후 다시 시도해 주세요.'));
    }
  }

  const headingId = `${baseId}-heading`;
  const consentId = `${baseId}-consent`;
  return (
    <section aria-labelledby={headingId} style={{ marginTop: 16 }}>
      <div style={{ marginLeft: -20, marginRight: -20 }}>
        <SectionTitle id={headingId} title="내 선출 여부" />
      </div>
      <Card pad={16} style={{ marginTop: 8 }}>
        {locked ? (
          <div>
            <p className="tm-text-label" style={{ margin: 0, color: 'var(--text-strong)', fontWeight: 600 }}>
              {PLAYER_ELIGIBILITY_LABEL[player.eligibilityStatus]}
            </p>
            <div style={{ marginTop: 4 }}>
              <EligibilityLockedNote method={player.eligibilityVerificationMethod} />
            </div>
            <p className="tm-text-micro" style={{ margin: '4px 0 0', color: 'var(--text-caption)' }}>
              운영진이 확인을 마쳤어요. 바뀐 점이 있으면 운영진에게 문의해 주세요.
            </p>
          </div>
        ) : (
          <div>
            <p className="tm-text-caption" style={{ margin: 0, color: 'var(--text-body)' }}>
              {declared
                ? `${PLAYER_ELIGIBILITY_LABEL[declared]}로 신고했어요${player.selfDeclaredAt ? ` · ${formatEvidenceFullDate(player.selfDeclaredAt)}` : ''}. 운영진 확인 전에는 고칠 수 있어요.`
                : '본인의 선출 여부를 직접 알려 주세요. 운영진이 확인할 때 참고해요.'}
            </p>
            <fieldset style={{ border: 0, padding: 0, margin: '12px 0 0' }}>
              <legend className="tm-text-caption" style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
                선출 여부
              </legend>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['non_pro', 'pro'] as const).map((value) => {
                  const selected = choice === value;
                  const inputId = `${baseId}-${value}`;
                  return (
                    <label
                      key={value}
                      htmlFor={inputId}
                      className={`tm-chip cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--blue500)]${selected ? ' tm-chip-active' : ''}`}
                    >
                      <input
                        id={inputId}
                        type="radio"
                        name={`${baseId}-choice`}
                        value={value}
                        checked={selected}
                        onChange={() => setChoice(value)}
                        className="sr-only"
                      />
                      {PLAYER_ELIGIBILITY_LABEL[value]}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <EligibilityCriteriaHelp />
            <label
              htmlFor={consentId}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12, minHeight: 44, cursor: 'pointer' }}
            >
              <input
                id={consentId}
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0 }}
              />
              <span className="tm-text-caption" style={{ color: 'var(--text-strong)' }}>
                {SELF_DECLARATION_CONSENT_TEXT}
              </span>
            </label>
            {error ? (
              <div style={{ marginTop: 8 }}>
                <AlertBanner message={error} />
              </div>
            ) : null}
            {notice ? (
              <p role="status" className="tm-text-caption" style={{ margin: '8px 0 0', color: 'var(--text-body)' }}>
                {notice}
              </p>
            ) : null}
            <button
              type="button"
              className="tm-btn tm-btn-md tm-btn-neutral"
              style={{ width: '100%', marginTop: 12 }}
              onClick={() => void handleSubmit()}
              disabled={declare.isPending}
            >
              {declare.isPending ? '신고 중…' : declared ? '다시 신고하기' : '선출 여부 신고하기'}
            </button>
          </div>
        )}
      </Card>
    </section>
  );
}
