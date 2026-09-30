'use client';

import { useId, useState } from 'react';
import { AlertBanner, Card } from '@/components/v1-ui/primitives';
import { PlusIcon } from '@/components/v1-ui/icons';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { GameRosterPlayerRow } from '@/components/game-roster/game-roster-player-row';
import { useV1AddLateTeamMatchLineupParticipant } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { randomUuid } from '@/lib/uuid';
import type { V1TeamMatchLateAdditionPayload } from '@/types/api';

export type LateAdditionCandidate = { userId: string; displayName: string; jerseyNumber: number | null };

interface Props {
  open: boolean;
  onClose: () => void;
  teamMatchId: string;
  /** 아직 명단에 없는 활성 팀원 — 번호순으로 넘긴다. */
  candidates: readonly LateAdditionCandidate[];
  /** 명단이 이미 쓰는 번호 — 겹치는 팀 번호는 싣지 않는다(서버가 422 로 막는다). */
  takenNumbers: ReadonlySet<number>;
}

/**
 * 경기 중 "늦게 온 선수 추가" 시트(H5 결정 A). 첫 기록 뒤에는 현재 제출본에 한 명씩 붙이기만 한다 —
 * 빼기·번호 변경은 없고, 추가한 시각은 공동 기록의 변경 이력에 남는다. 참석명단 화면과 경기 기록 화면이 같이 쓴다.
 */
export function LateLineupAdditionSheet({ open, onClose, teamMatchId, candidates, takenNumbers }: Props) {
  const titleId = useId();
  const guestFieldId = useId();
  const mutation = useV1AddLateTeamMatchLineupParticipant(teamMatchId);
  const [guestName, setGuestName] = useState('');
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const { dialogRef, onBackdropClick, mounted, closing } = useModalA11y<HTMLElement, HTMLElement>({
    open,
    onClose,
    pending: mutation.isPending,
    exitMs: 220, // .tm-filter-sheet.is-closing 과 같은 길이.
  });
  if (!mounted) return null;

  function add(key: string, name: string, payload: V1TeamMatchLateAdditionPayload, then?: () => void) {
    setPendingKey(key);
    setAnnouncement('');
    mutation.mutate(
      { idempotencyKey: randomUuid(), payload },
      {
        onSuccess: () => {
          setAnnouncement(`${name}님을 명단에 추가했어요.`);
          then?.();
        },
        onSettled: () => setPendingKey(null),
      },
    );
  }

  const guest = guestName.trim();
  return (
    <>
      <div aria-hidden="true" className={`tm-filter-scrim${closing ? ' is-closing' : ''}`} onClick={onBackdropClick} />
      <div className="tm-filter-layer">
        <section
          ref={dialogRef}
          className={`tm-filter-sheet${closing ? ' is-closing' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="tm-filter-sheet-handle" />
          <div className="tm-filter-sheet-head">
            <h2 id={titleId} className="tm-text-body-lg" style={{ fontWeight: 700, margin: 0 }}>
              늦게 온 선수 추가
            </h2>
            <button
              type="button"
              className="tm-btn tm-btn-sm tm-btn-neutral"
              style={{ minHeight: 44 }}
              onClick={onClose}
              disabled={mutation.isPending}
            >
              닫기
            </button>
          </div>
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)', margin: '8px 0 12px', lineHeight: 1.6 }}>
            경기 중에는 추가만 할 수 있어요. 이미 기록된 선수는 뺄 수 없고, 추가한 시각이 변경 이력에 남아요.
          </p>
          <p role="status" aria-live="polite" className="tm-text-caption" style={{ color: 'var(--green700)', margin: '0 0 8px' }}>
            {announcement}
          </p>
          {mutation.isError ? (
            <div style={{ marginBottom: 8 }}>
              <AlertBanner message={extractErrorMessage(mutation.error, '선수를 추가하지 못했어요. 잠시 후 다시 시도해 주세요.')} />
            </div>
          ) : null}
          {candidates.length === 0 ? (
            <p className="tm-text-caption" style={{ color: 'var(--text-muted)', margin: '0 0 12px' }}>
              명단에 없는 팀원이 없어요. 게스트는 아래에서 이름으로 넣을 수 있어요.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {candidates.map((member) => {
                const jersey = member.jerseyNumber !== null && !takenNumbers.has(member.jerseyNumber) ? member.jerseyNumber : null;
                return (
                  <Card key={member.userId} pad={12}>
                    <GameRosterPlayerRow
                      jerseyNumber={jersey}
                      displayName={member.displayName}
                      accountLinked
                      trailing={
                        <button
                          type="button"
                          className="tm-btn tm-btn-sm tm-btn-outline"
                          style={{ minHeight: 44 }}
                          aria-label={`${member.displayName} 명단에 추가`}
                          disabled={pendingKey !== null}
                          onClick={() =>
                            add(member.userId, member.displayName, {
                              userId: member.userId,
                              ...(jersey !== null ? { jerseyNumber: jersey } : {}),
                            })
                          }
                        >
                          {pendingKey === member.userId ? '추가 중…' : '추가'}
                        </button>
                      }
                    />
                  </Card>
                );
              })}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <label htmlFor={guestFieldId} className="sr-only">게스트 이름</label>
            <input
              id={guestFieldId}
              type="text"
              className="tm-input"
              style={{ flex: 1 }}
              placeholder="게스트 이름"
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
            />
            <button
              type="button"
              className="tm-btn tm-btn-sm tm-btn-outline"
              style={{ minHeight: 44 }}
              aria-label="게스트 명단에 추가"
              disabled={guest === '' || pendingKey !== null}
              onClick={() => add('guest', guest, { displayName: guest }, () => setGuestName(''))}
            >
              <PlusIcon size={16} aria-hidden="true" /> 추가
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
