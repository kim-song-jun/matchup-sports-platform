'use client';

import Link from 'next/link';
import { useId, useState, type FormEvent } from 'react';
import { AlertBanner, TextField } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { InfoCircleIcon } from '@/components/v1-ui/icons';
import { useCurrentHref } from '@/components/v1-ui/use-current-href';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import {
  useV1UpdateGameRosterJersey,
  type V1GameRosterPerson,
  type V1GameRosterView,
} from '@/hooks/use-v1-game-roster';
import { extractErrorCode } from '@/lib/error-message';
import { DUPLICATE_JERSEY_CODE, gameRosterErrorMessage, isStaleGameRosterWrite } from '@/lib/game-roster-errors';
import { parseJerseyInput } from '@/lib/jersey-number';
import { josa } from '@/lib/korean';
import { withFromPath } from '@/lib/session-storage';

/**
 * "저장하고 다음 선수"가 가리킬 사람 — 번호가 없는 다음 선수(현재 선수 뒤부터, 끝이면 앞쪽). 저장하면 명단이
 * 번호순으로 다시 정렬되므로, 저장 전 순서로 골라 사용자 id 로 붙든다.
 */
export function nextPlayerWithoutJersey(
  participants: readonly V1GameRosterPerson[],
  currentUserId: string,
): V1GameRosterPerson | null {
  const candidates = participants.filter(
    (row) => row.userId !== currentUserId && row.jerseyNumber === null && row.participantId !== null,
  );
  const currentIndex = participants.findIndex((row) => row.userId === currentUserId);
  return candidates.find((row) => participants.indexOf(row) > currentIndex) ?? candidates[0] ?? null;
}

type CompetitionKind = V1GameRosterView['competitionKind'];

const competitionNoun = (kind: CompetitionKind) => (kind === 'LEAGUE' ? '리그' : '대회');

interface SheetProps {
  open: boolean;
  onClose: () => void;
  teamId: string;
  competitionId: string;
  competitionKind: CompetitionKind;
  /** 등번호의 원본인 참가 신청. null 이면 저장할 곳이 없다(참가 명단이 없는 팀). */
  registrationId: string | null;
  /** 번호를 넣을 선수 — 닫히는 동안에도 내용이 남도록 부모가 마지막 값을 붙든다. */
  player: V1GameRosterPerson;
  /** 같은 팀 선수 전원 — 번호가 겹칠 때 누가 쓰는지 이름으로 알려 준다. */
  teammates: readonly V1GameRosterPerson[];
  /** "저장하고 다음 선수"가 넘어갈 사람. 없으면 버튼을 그리지 않는다. */
  next: V1GameRosterPerson | null;
  onSelect: (userId: string) => void;
  /** 화면이 낡아 거절됐을 때(마감·권한 변경) — 부모가 명단을 다시 받는다. */
  onStale: () => void;
}

/**
 * 경기 명단의 등번호 입력 시트. 번호의 원본은 리그·대회 참가 명단이라 저장은 그쪽 API 로 가고, 그 번호가
 * 대회·리그 모든 경기에 같이 나간다(시트가 그렇게 밝힌다). 참가 명단이 없는 팀은 입력 대신 이유를 안내한다.
 */
export function GameRosterJerseySheet(props: SheetProps) {
  const { open, onClose, competitionKind, registrationId, player } = props;
  const { participantId } = player;
  const titleId = useId();
  const update = useV1UpdateGameRosterJersey(props.teamId);
  const { dialogRef, onBackdropClick, mounted, closing } = useModalA11y<HTMLElement, HTMLElement>({
    open,
    onClose,
    pending: update.isPending,
    exitMs: 220, // .tm-filter-sheet.is-closing 과 같은 길이.
  });
  if (!mounted) return null;

  const canSave = registrationId !== null && participantId !== null;
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
              {canSave ? `${player.displayName} 등번호` : '등번호를 넣을 수 없어요'}
            </h2>
            <button
              type="button"
              aria-label="닫기"
              onClick={onClose}
              disabled={update.isPending}
              className="tm-btn tm-btn-icon tm-btn-ghost"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          {registrationId !== null && participantId !== null ? (
            <JerseyForm
              key={player.userId}
              {...props}
              registrationId={registrationId}
              participantId={participantId}
              update={update}
            />
          ) : (
            <NoRosterNotice competitionId={props.competitionId} kind={competitionKind} onClose={onClose} />
          )}
        </section>
      </div>
    </>
  );
}

function JerseyForm({
  onClose,
  competitionId,
  competitionKind,
  registrationId,
  participantId,
  player,
  teammates,
  next,
  onSelect,
  onStale,
  update,
}: SheetProps & {
  registrationId: string;
  participantId: string;
  update: ReturnType<typeof useV1UpdateGameRosterJersey>;
}) {
  const fieldId = useId();
  const [text, setText] = useState(player.jerseyNumber === null ? '' : String(player.jerseyNumber));
  const [duplicateOf, setDuplicateOf] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const noun = competitionNoun(competitionKind);

  const parsed = parseJerseyInput(text);
  const value = parsed.ok ? (parsed.value ?? null) : null;
  const changed = parsed.ok && value !== player.jerseyNumber;
  const holder =
    duplicateOf === null ? null : (teammates.find((row) => row.userId !== player.userId && row.jerseyNumber === duplicateOf) ?? null);
  const fieldError = !parsed.ok
    ? '0에서 99 사이 숫자로 입력해 주세요.'
    : duplicateOf === null
      ? null
      : holder === null
        ? `${duplicateOf}번은 이미 다른 선수가 쓰고 있어요. 다른 번호를 넣어 주세요.`
        : `${duplicateOf}번은 ${josa(holder.displayName, ['이', '가'])} 쓰고 있어요. 다른 번호를 넣어 주세요.`;

  async function save(then: 'close' | 'next') {
    if (!parsed.ok) return;
    setError(null);
    if (changed) {
      try {
        await update.mutateAsync({ competitionId, registrationId, participantId, jerseyNumber: value });
      } catch (caught) {
        if (extractErrorCode(caught) === DUPLICATE_JERSEY_CODE && value !== null) {
          setDuplicateOf(value);
        } else {
          if (isStaleGameRosterWrite(caught)) onStale();
          setError(gameRosterErrorMessage(caught, '등번호를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'));
        }
        return;
      }
    }
    if (then === 'next' && next !== null) onSelect(next.userId);
    else onClose();
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (changed) void save('close');
  }

  const saveLabel = !parsed.ok
    ? '저장'
    : value !== null
      ? `${value}번으로 저장`
      : player.jerseyNumber !== null
        ? '번호 지우고 저장'
        : '번호를 입력해 주세요';

  return (
    <form onSubmit={onSubmit} noValidate style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <TextField
          label="등번호"
          fieldId={fieldId}
          type="text"
          inputMode="numeric"
          maxLength={2}
          autoComplete="off"
          autoFocus
          value={text}
          error={fieldError}
          style={{ fontWeight: 700 }}
          onChange={(event) => {
            setText(event.target.value);
            setDuplicateOf(null);
            setError(null);
          }}
        />
        {fieldError === null ? (
          <p className="tm-text-micro" style={{ color: 'var(--text-caption)', margin: '4px 0 0' }}>
            0~99 · 비우면 번호 없는 선수가 돼요.
          </p>
        ) : null}
      </div>
      <div
        className="tm-on-tint"
        style={{ padding: 12, borderRadius: 'var(--radius-control)', background: 'var(--grey50)', display: 'flex', gap: 8, alignItems: 'flex-start' }}
      >
        <span aria-hidden="true" style={{ flex: 'none', marginTop: 1, color: 'var(--text-muted)' }}>
          <InfoCircleIcon size={16} strokeWidth={2} />
        </span>
        <span className="tm-text-caption">
          이 {noun} 참가 명단에 저장돼요. {noun} 모든 경기 명단·기록에 같은 번호가 나가요.
        </span>
      </div>
      {error !== null ? <AlertBanner message={error} /> : null}
      <Button type="submit" variant="primary" size="lg" block loading={update.isPending} disabled={!changed}>
        {saveLabel}
      </Button>
      {next !== null ? (
        <Button
          type="button"
          variant="outline"
          size="md"
          block
          disabled={update.isPending || !parsed.ok}
          onClick={() => void save('next')}
        >
          {changed ? '저장하고 다음 선수' : '다음 선수'} ({next.displayName})
        </Button>
      ) : null}
      {holder !== null ? (
        <Button type="button" variant="ghost" size="md" block onClick={() => onSelect(holder.userId)}>
          {holder.displayName}의 번호부터 바꾸기
        </Button>
      ) : null}
    </form>
  );
}

/** 참가 명단이 없어 팀원 전체가 기준인 팀 — 번호를 저장할 원본이 없다. 명단을 채우러 가는 길만 열어 준다. */
function NoRosterNotice({
  competitionId,
  kind,
  onClose,
}: {
  competitionId: string;
  kind: CompetitionKind;
  onClose: () => void;
}) {
  const currentHref = useCurrentHref();
  const noun = competitionNoun(kind);
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p className="tm-text-caption" style={{ margin: 0 }}>
        이 팀은 아직 {noun} 참가 명단을 내지 않아서 팀원 전체가 기준이에요. 등번호는 참가 명단에 올린 선수에게만 넣을 수
        있어요.
      </p>
      <Link
        href={withFromPath(`/tournaments/${competitionId}/my`, currentHref)}
        className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block"
      >
        참가 명단 내러 가기
      </Link>
      <Button type="button" variant="ghost" size="md" block onClick={onClose}>
        닫기
      </Button>
    </div>
  );
}
