'use client';

import { useId, useState, type FormEvent } from 'react';
import { AlertBanner, TextField } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { parseJerseyInput } from '@/lib/jersey-number';
import { josa } from '@/lib/korean';

export type LineupJerseyScope = 'match' | 'team';

export interface LineupJerseyTarget {
  displayName: string;
  /** 이 경기 참석명단의 지금 번호. */
  jerseyNumber: number | null;
  /** 팀 번호(멤버 관리). 게스트는 팀 번호가 없다. */
  teamJerseyNumber: number | null;
  /** 팀 번호를 함께 바꿀 수 있는 팀원이면 true(멤버십을 안다). */
  canChangeTeamNumber: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  target: LineupJerseyTarget;
  /** 이 번호를 명단의 다른 선수가 쓰면 그 이름. */
  holderOf: (jerseyNumber: number) => string | null;
  pending: boolean;
  error: string | null;
  /** "이 경기만"이면 명단 초안만, "팀 번호도 함께"면 팀 번호 저장 뒤 초안까지 — 부모가 처리한다. */
  onSave: (jerseyNumber: number | null, scope: LineupJerseyScope) => void;
}

/**
 * 친선 참석명단의 등번호 시트(H5 D-5). 팀 번호가 처음 값이고 이 경기만 덮어쓸 수 있다. "팀 번호도 함께"를 고르면
 * 팀 번호(전술보드·다음 경기·대회 신청의 처음 값)도 바뀐다 — 이미 낸 대회·리그 참가 명단 번호는 그 대회의 원본이라 따라가지 않는다.
 */
export function LineupJerseySheet({ open, onClose, target, holderOf, pending, error, onSave }: Props) {
  const titleId = useId();
  const { dialogRef, onBackdropClick, mounted, closing } = useModalA11y<HTMLElement, HTMLElement>({
    open,
    onClose,
    pending,
    exitMs: 220, // .tm-filter-sheet.is-closing 과 같은 길이.
  });
  if (!mounted) return null;
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
              {target.displayName} 등번호
            </h2>
            <button
              type="button"
              className="tm-btn tm-btn-sm tm-btn-neutral"
              style={{ minHeight: 44 }}
              onClick={onClose}
              disabled={pending}
            >
              닫기
            </button>
          </div>
          <JerseyForm key={target.displayName} target={target} holderOf={holderOf} pending={pending} error={error} onSave={onSave} />
        </section>
      </div>
    </>
  );
}

function JerseyForm({ target, holderOf, pending, error, onSave }: Omit<Props, 'open' | 'onClose'>) {
  const fieldId = useId();
  const scopeName = useId();
  const [text, setText] = useState(target.jerseyNumber === null ? '' : String(target.jerseyNumber));
  // 전술보드는 팀 번호만 읽는다(H7). 팀 번호가 없으면 처음 정한 번호를 팀 번호로도 남기는 게 기본이다(W4-V10).
  const [scope, setScope] = useState<LineupJerseyScope>(
    target.canChangeTeamNumber && target.teamJerseyNumber === null ? 'team' : 'match',
  );
  const parsed = parseJerseyInput(text);
  const value = parsed.ok ? (parsed.value ?? null) : null;
  const holder = value === null ? null : holderOf(value);
  const teamNumberText = target.teamJerseyNumber === null ? '없음' : `${target.teamJerseyNumber}번`;
  // "이 경기만"으로 팀 번호와 달라지는 순간 — 보드·다음 경기에서 놀라지 않게 결과를 바로 말한다.
  const matchOnlyNotice =
    scope === 'match' && parsed.ok && value !== target.teamJerseyNumber
      ? `${value === null ? '이 경기 참석명단에서만 번호를 비워요.' : `이 경기 참석명단에만 ${value}번이 돼요.`} 전술보드와 다음 경기에는 팀 번호(${teamNumberText})가 보여요.`
      : null;
  const changed =
    parsed.ok &&
    (value !== target.jerseyNumber || (scope === 'team' && value !== target.teamJerseyNumber));
  const fieldError = !parsed.ok
    ? '0에서 99 사이 숫자로 입력해 주세요.'
    : holder !== null
      ? `${value}번은 ${josa(holder, ['이', '가'])} 쓰고 있어요. 다른 번호를 넣어 주세요.`
      : null;
  const saveLabel = !changed
    ? '저장할 변경이 없어요'
    : value !== null
      ? `${value}번으로 저장`
      : '번호 지우고 저장';

  function submit(event: FormEvent) {
    event.preventDefault();
    if (changed && fieldError === null) onSave(value, scope);
  }

  return (
    <form onSubmit={submit} noValidate style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
          onChange={(event) => setText(event.target.value)}
        />
        {fieldError === null ? (
          <p className="tm-text-micro" style={{ color: 'var(--text-caption)', margin: '4px 0 0' }}>
            0~99 · 비우면 번호 없는 선수가 돼요.
          </p>
        ) : null}
      </div>
      {target.canChangeTeamNumber ? (
        <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'grid', gap: 4 }}>
          <legend className="sr-only">번호를 어디에 저장할까요</legend>
          <ScopeOption name={scopeName} checked={scope === 'match'} onChange={() => setScope('match')} label="이 경기만 바꿔요" />
          <ScopeOption name={scopeName} checked={scope === 'team'} onChange={() => setScope('team')} label="팀 번호도 함께 바꿔요" />
          {matchOnlyNotice !== null ? (
            <p className="tm-text-caption" style={{ color: 'var(--orange700)', margin: '4px 0 0', lineHeight: 1.5, fontWeight: 600 }}>
              {matchOnlyNotice}
            </p>
          ) : (
            <p className="tm-text-caption" style={{ color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.5 }}>
              팀 번호는 전술보드와 다음 경기·대회 신청의 처음 값이 돼요.{' '}
              {target.teamJerseyNumber === null
                ? '지금 팀 번호가 없어서 함께 저장하는 게 기본이에요.'
                : `지금 팀 번호는 ${target.teamJerseyNumber}번이에요.`}
            </p>
          )}
        </fieldset>
      ) : (
        <p className="tm-text-caption" style={{ color: 'var(--text-muted)', margin: 0 }}>
          팀 번호가 없는 게스트라 이 경기에만 쓰여요.
        </p>
      )}
      {error !== null ? <AlertBanner message={error} /> : null}
      <Button type="submit" variant="primary" size="lg" block loading={pending} disabled={!changed || fieldError !== null}>
        {saveLabel}
      </Button>
    </form>
  );
}

function ScopeOption({ name, checked, onChange, label }: { name: string; checked: boolean; onChange: () => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, cursor: 'pointer' }}>
      <input type="radio" name={name} checked={checked} onChange={onChange} style={{ width: 20, height: 20, margin: 0, accentColor: 'var(--blue500)' }} />
      <span className="tm-text-label">{label}</span>
    </label>
  );
}
