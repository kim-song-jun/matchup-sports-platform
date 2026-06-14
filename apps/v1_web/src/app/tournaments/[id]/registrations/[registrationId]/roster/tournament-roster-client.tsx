'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { AlertBanner, Card } from '@/components/v1-ui/primitives';
import {
  useV1TournamentPlayers,
  useV1Tournament,
  useV1Registration,
  useV1AddPlayer,
  useV1RemovePlayer,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1TournamentPlayer, V1PlayerEligibilityStatus } from '@/types/api';

/* ── Helpers ── */

function eligibilityLabel(status: V1PlayerEligibilityStatus): string {
  switch (status) {
    case 'non_pro': return '아마추어';
    case 'pro': return '선출';
    case 'needs_review': return '검토 필요';
    default: return status;
  }
}

function eligibilityBadgeClass(status: V1PlayerEligibilityStatus): string {
  switch (status) {
    case 'non_pro': return 'tm-badge-grey';
    case 'pro': return 'tm-badge-blue';
    case 'needs_review': return 'tm-badge-orange';
    default: return 'tm-badge-grey';
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '미입력';
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

/* ── Add player form ── */

type AddPlayerFormState = {
  userId: string;
  realName: string;
  birthDate: string;
  eligibilityStatus: V1PlayerEligibilityStatus;
};

const EMPTY_FORM: AddPlayerFormState = {
  userId: '',
  realName: '',
  birthDate: '',
  eligibilityStatus: 'non_pro',
};

function AddPlayerForm({
  onSubmit,
  onCancel,
  isSubmitting,
  error,
}: {
  onSubmit: (data: AddPlayerFormState) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<AddPlayerFormState>(EMPTY_FORM);

  function patch(partial: Partial<AddPlayerFormState>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  const canSubmit = form.realName.trim().length > 0 && form.userId.trim().length > 0;

  return (
    <Card pad={16} style={{ border: '1px solid var(--blue100)', background: 'var(--blue50)' }}>
      <div className="tm-text-label" style={{ color: 'var(--text-strong)', fontWeight: 700, marginBottom: 14 }}>
        선수 추가
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* userId input — team member hook not available here, so userId is entered directly.
            TODO: When a team-member search hook is available, replace this text field with
            a dropdown of team members keyed by teamId from the registration. */}
        <FormField
          id="player-userid"
          label="사용자 ID"
          required
          hint="팀원의 사용자 ID를 입력해 주세요."
        >
          <input
            id="player-userid"
            type="text"
            value={form.userId}
            onChange={(e) => patch({ userId: e.target.value.trim() })}
            placeholder="userId 입력"
            className="tm-input"
            aria-required="true"
          />
        </FormField>

        <FormField id="player-realname" label="실명" required>
          <input
            id="player-realname"
            type="text"
            value={form.realName}
            onChange={(e) => patch({ realName: e.target.value })}
            placeholder="실명 입력"
            maxLength={30}
            className="tm-input"
            aria-required="true"
          />
        </FormField>

        <FormField id="player-birthdate" label="생년월일" hint="선택 사항 · YYYY-MM-DD">
          <input
            id="player-birthdate"
            type="date"
            value={form.birthDate}
            onChange={(e) => patch({ birthDate: e.target.value })}
            className="tm-input"
          />
        </FormField>

        <FormField id="player-eligibility" label="선출 여부" labelId="eligibility-label">
          <div role="radiogroup" aria-labelledby="eligibility-label" style={{ display: 'flex', gap: 10 }}>
            {(['non_pro', 'pro'] as const).map((val) => {
              const selected = form.eligibilityStatus === val;
              return (
                <label
                  key={val}
                  htmlFor={`eligibility-${val}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', minHeight: 44 }}
                >
                  {/* sr-only native radio — keyboard + screen reader accessible */}
                  <input
                    id={`eligibility-${val}`}
                    type="radio"
                    name="eligibility-status"
                    value={val}
                    checked={selected}
                    onChange={() => patch({ eligibilityStatus: val })}
                    className="sr-only"
                  />
                  {/* Themed circular indicator — matches PaymentMethodRadio pattern */}
                  <span
                    aria-hidden="true"
                    style={{
                      flexShrink: 0,
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      border: selected ? '2px solid var(--blue500)' : '1px solid var(--grey200)',
                      background: selected ? 'var(--blue500)' : 'var(--bg)',
                      display: 'grid',
                      placeItems: 'center',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                  >
                    {selected && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: 'var(--static-white)',
                          display: 'block',
                        }}
                      />
                    )}
                  </span>
                  <span className="tm-text-body" style={{ color: 'var(--text-strong)' }}>
                    {eligibilityLabel(val)}
                  </span>
                </label>
              );
            })}
          </div>
        </FormField>
      </div>

      {error ? (
        <div style={{ marginTop: 12 }}>
          <AlertBanner message={error} />
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          type="button"
          className="tm-btn tm-btn-md tm-btn-neutral"
          style={{ flex: 1, minHeight: 44 }}
          onClick={onCancel}
          disabled={isSubmitting}
        >
          취소
        </button>
        <button
          type="button"
          className="tm-btn tm-btn-md tm-btn-primary"
          style={{ flex: 2, minHeight: 44 }}
          disabled={!canSubmit || isSubmitting}
          onClick={() => onSubmit(form)}
        >
          {isSubmitting ? '추가 중…' : '추가'}
        </button>
      </div>
    </Card>
  );
}


function FormField({
  id,
  label,
  required,
  hint,
  children,
  labelId,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  /** Optional id for the label element, used when the child is a radiogroup that needs aria-labelledby. */
  labelId?: string;
}) {
  return (
    <div>
      <label
        id={labelId}
        htmlFor={id}
        className="tm-text-caption"
        style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}
      >
        {label}
        {required ? (
          <span style={{ color: 'var(--red500)', marginLeft: 2 }}>*</span>
        ) : null}
      </label>
      {children}
      {hint ? (
        <p className="tm-text-micro" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* ── Player row ── */

function PlayerRow({
  player,
  onRemove,
  isRemoving,
  isLocked,
}: {
  player: V1TournamentPlayer;
  onRemove: (playerId: string) => void;
  isRemoving: boolean;
  isLocked: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '11px 14px',
        borderTop: '1px solid var(--grey100)',
      }}
    >
      {/* Avatar placeholder — inline styles avoid coupling to tm-review-avatar (review domain) */}
      <div
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: 36,
          height: 36,
          borderRadius: 12,
          background: 'var(--grey100)',
          color: 'var(--text-strong)',
          display: 'grid',
          placeItems: 'center',
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        {player.realName.charAt(0)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="tm-text-label" style={{ color: 'var(--text-strong)', fontWeight: 600 }}>
            {player.realName}
          </span>
          <span className={`tm-badge ${eligibilityBadgeClass(player.eligibilityStatus)}`}>
            {eligibilityLabel(player.eligibilityStatus)}
          </span>
        </div>
        {player.birthDateSnapshot ? (
          <div className="tm-text-micro" style={{ color: 'var(--text-caption)', marginTop: 2 }}>
            {formatDate(player.birthDateSnapshot)}
          </div>
        ) : null}
      </div>
      {!isLocked ? (
        <button
          type="button"
          className="tm-btn tm-btn-sm tm-btn-danger"
          style={{ flexShrink: 0, minWidth: 44, padding: '0 10px' }}
          onClick={() => onRemove(player.id)}
          disabled={isRemoving}
          aria-label={`${player.realName} 삭제`}
        >
          삭제
        </button>
      ) : null}
    </div>
  );
}

/* ── Main client ── */

export function TournamentRosterPageClient({
  tournamentId,
  registrationId,
}: {
  tournamentId: string;
  registrationId: string;
}) {
  const { data: tournament } = useV1Tournament(tournamentId);
  const { data: registration } = useV1Registration(tournamentId, registrationId);
  const {
    data: rosterData,
    isLoading,
    isError,
    error: rosterErr,
  } = useV1TournamentPlayers(tournamentId, registrationId);

  const addPlayer = useV1AddPlayer(tournamentId, registrationId);
  const removePlayer = useV1RemovePlayer(tournamentId, registrationId);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const players = rosterData?.players ?? [];
  const belowMinimum = rosterData?.belowMinimum ?? false;
  const isRosterLocked = Boolean(registration?.rosterLockedAt);
  const minPlayers = tournament?.minPlayers ?? 0;
  const maxPlayers = tournament?.maxPlayers ?? 999;

  const backHref = `/tournaments/${tournamentId}/my`;

  if (isLoading) {
    return (
      <AppChrome title="선수 명단" backHref={backHref} bottomNav={false}>
        <div
          aria-busy="true"
          aria-label="명단 불러오는 중"
          style={{ padding: '0 20px', marginTop: 24 }}
        >
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              aria-hidden="true"
              style={{ height: 56, borderRadius: 12, background: 'var(--grey100)', marginBottom: 8 }}
            />
          ))}
        </div>
      </AppChrome>
    );
  }

  if (isError) {
    const msg = extractErrorMessage(rosterErr, '명단을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    return (
      <AppChrome title="선수 명단" backHref={backHref} bottomNav={false}>
        <div style={{ padding: '0 20px', marginTop: 24 }}>
          <AlertBanner message={msg} />
        </div>
      </AppChrome>
    );
  }

  async function handleAddPlayer(formData: {
    userId: string;
    realName: string;
    birthDate: string;
    eligibilityStatus: V1PlayerEligibilityStatus;
  }) {
    setAddError(null);
    try {
      await addPlayer.mutateAsync({
        userId: formData.userId,
        realName: formData.realName,
        birthDate: formData.birthDate || undefined,
        eligibilityStatus: formData.eligibilityStatus,
      });
      setShowAddForm(false);
    } catch (err) {
      setAddError(extractErrorMessage(err, '선수 추가에 실패했어요. 잠시 후 다시 시도해 주세요.'));
    }
  }

  async function handleRemovePlayer(playerId: string) {
    setRemoveError(null);
    try {
      await removePlayer.mutateAsync(playerId);
    } catch (err) {
      setRemoveError(extractErrorMessage(err, '선수 삭제에 실패했어요. 잠시 후 다시 시도해 주세요.'));
    }
  }

  const atMax = players.length >= maxPlayers;

  return (
    <AppChrome title="선수 명단" backHref={backHref} bottomNav={false} activeTab="tournaments">
      <div style={{ padding: '0 20px 48px', marginTop: 12 }}>

        {/* Locked banner */}
        {isRosterLocked ? (
          <div style={{ marginBottom: 14 }}>
            <AlertBanner
              message="명단이 잠겼어요. 대회 운영진에게 문의해 주세요."
              tone="info"
            />
          </div>
        ) : null}

        {/* Below minimum warning */}
        {!isRosterLocked && belowMinimum ? (
          <div style={{ marginBottom: 14 }}>
            <AlertBanner
              message={`최소 ${minPlayers}명 이상 등록해야 해요. 현재 ${players.length}명 등록됐어요.`}
              tone="warning"
            />
          </div>
        ) : null}

        {/* Remove error */}
        {removeError ? (
          <div style={{ marginBottom: 14 }}>
            <AlertBanner message={removeError} />
          </div>
        ) : null}

        {/* Roster header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div className="tm-text-body-lg" style={{ color: 'var(--text-strong)' }}>
              {`선수 명단 (${players.length}명)`}
            </div>
            <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>
              {`최소 ${minPlayers}명 · 최대 ${maxPlayers}명`}
            </div>
          </div>
          {!isRosterLocked && !showAddForm && !atMax ? (
            <button
              type="button"
              className="tm-btn tm-btn-sm tm-btn-primary"
              style={{ flexShrink: 0, minWidth: 64 }}
              onClick={() => { setAddError(null); setShowAddForm(true); }}
              aria-label="선수 추가하기"
            >
              + 추가
            </button>
          ) : null}
          {atMax && !isRosterLocked ? (
            <span className="tm-badge tm-badge-grey" style={{ flexShrink: 0 }}>
              최대 인원 도달
            </span>
          ) : null}
        </div>

        {/* Add player form */}
        {showAddForm && !isRosterLocked ? (
          <div style={{ marginBottom: 14 }}>
            <AddPlayerForm
              onSubmit={handleAddPlayer}
              onCancel={() => { setShowAddForm(false); setAddError(null); }}
              isSubmitting={addPlayer.isPending}
              error={addError}
            />
          </div>
        ) : null}

        {/* Player list */}
        {players.length === 0 ? (
          <Card pad={20} style={{ background: 'var(--grey50)', textAlign: 'center' }}>
            <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>
              등록된 선수가 없어요
            </div>
            <p className="tm-text-caption" style={{ marginTop: 6, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {isRosterLocked
                ? '명단이 잠겨 있어요.'
                : `최소 ${minPlayers}명 이상 등록해 주세요.`}
            </p>
          </Card>
        ) : (
          <Card pad={0}>
            <div style={{ padding: '8px 14px' }}>
              <div className="tm-text-micro" style={{ color: 'var(--text-caption)', fontWeight: 600 }}>
                총 {players.length}명 · {isRosterLocked ? '명단 잠김' : '명단 수정 가능'}
              </div>
            </div>
            {players.map((player) => (
              <PlayerRow
                key={player.id}
                player={player}
                onRemove={handleRemovePlayer}
                isRemoving={removePlayer.isPending}
                isLocked={isRosterLocked}
              />
            ))}
          </Card>
        )}

        {/* Back to my registration */}
        <div style={{ marginTop: 20 }}>
          <Link
            href={`/tournaments/${tournamentId}/my`}
            className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"
          >
            내 신청 상태로 돌아가기
          </Link>
        </div>
      </div>
    </AppChrome>
  );
}
