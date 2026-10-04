'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Lock } from 'lucide-react';
import { BottomSheet } from '@/components/v1-ui/bottom-sheet';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { extractErrorMessage } from '@/lib/error-message';
import { josa } from '@/lib/korean';
import { overlayLinkClick } from '@/lib/overlay-history';
import { summarizeApplicationHistory } from './team-match-next-step';
import type { TeamMatchDetailViewModel } from './team-matches.types';

type HostAction = NonNullable<TeamMatchDetailViewModel['hostActions']>[number];

const MENU_ROW = { display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 64, padding: '10px 0', textAlign: 'left' } as const;

/**
 * 히어로 ⋯ 메뉴(H6 결정 manage-menu A) — 정보 수정(잠겼으면 이유)·신청 기록·모집 마감/재개·취소.
 * 부모 상태로 연다: 마감·취소 확인 창을 이 시트 위에 겹쳐 띄우고, 확정한 뒤에 시트를 닫는다.
 */
export function TeamMatchManageMenuSheet({ menu, actions, onClose, onRunAction }: {
  menu: NonNullable<TeamMatchDetailViewModel['manageMenu']>;
  actions: HostAction[];
  onClose: () => void;
  onRunAction: (action: HostAction) => void;
}) {
  const pathname = usePathname();
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyId = useId();
  const summary = summarizeApplicationHistory(menu.history);
  return (
    <BottomSheet open onClose={onClose} title="매치 관리">
      <div style={{ marginTop: 4 }}>
        {menu.edit.href !== undefined ? (
          <Link className="tm-pressable" href={menu.edit.href} onClick={overlayLinkClick(menu.edit.href, pathname, onClose)} style={MENU_ROW}>
            <MenuText label="정보 수정" description="시간·장소·경기 조건을 바꿔요." />
            <ChevronRight size={18} aria-hidden="true" style={{ color: 'var(--text-caption)' }} />
          </Link>
        ) : (
          <div style={MENU_ROW}>
            <MenuText label="정보 수정" description={menu.edit.lockedReason} muted />
            <Lock size={18} aria-hidden="true" style={{ color: 'var(--text-caption)' }} />
          </div>
        )}
        {summary ? (
          <div style={{ borderTop: '1px solid var(--border)' }}>
            <button
              className="tm-pressable"
              type="button"
              aria-expanded={historyOpen}
              aria-controls={historyId}
              onClick={() => setHistoryOpen((open) => !open)}
              style={{ ...MENU_ROW, background: 'none', border: 0, cursor: 'pointer' }}
            >
              <MenuText label="신청 기록" description={summary} />
              <ChevronDown size={18} aria-hidden="true" style={{ color: 'var(--text-caption)', transform: historyOpen ? 'rotate(180deg)' : undefined }} />
            </button>
            {historyOpen ? (
              <ul id={historyId} style={{ listStyle: 'none', padding: '0 0 8px', display: 'grid', gap: 8 }}>
                {menu.history.map((item) => (
                  <li key={item.key} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span className="tm-text-label" style={{ flex: 1, minWidth: 0, color: 'var(--text-strong)' }}>{item.name}</span>
                    <span className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>
                      {[item.statusLabel, item.timeLabel].filter(Boolean).join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {actions.map((action) => (
          <button
            key={action.label}
            className="tm-pressable"
            type="button"
            disabled={action.pending}
            onClick={() => onRunAction(action)}
            style={{ ...MENU_ROW, background: 'none', border: 0, borderTop: '1px solid var(--border)', cursor: 'pointer' }}
          >
            <MenuText label={action.pending ? '처리 중' : action.label} description={action.description} danger={action.tone === 'danger'} />
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

function MenuText({ label, description, muted, danger }: { label: string; description?: string; muted?: boolean; danger?: boolean }) {
  return (
    <span style={{ flex: 1, minWidth: 0 }}>
      <span className="tm-text-label" style={{ display: 'block', color: danger ? 'var(--red700)' : muted ? 'var(--text-caption)' : 'var(--text-strong)' }}>{label}</span>
      {description ? <span className="tm-text-caption" style={{ display: 'block', marginTop: 2, color: 'var(--text-muted)' }}>{description}</span> : null}
    </span>
  );
}

/** 한마디 길이 — 서버는 500자까지 받지만 호스트 카드 한 줄에 읽히는 길이로 줄인다(H6 결정). */
const APPLY_MESSAGE_MAX = 100;

/**
 * 신청 가능한 팀이 2개 이상인 팀장의 신청 시트(N-1). 한 사람이 한 팀매치에 두 팀으로 동시에
 * 신청할 수는 없어서(ALREADY_REQUESTED_WITH_ANOTHER_TEAM) 신청 전에 팀을 고르는 순간을 만든다.
 * 신청할 수 없는 팀은 이유와 함께 잠가 보여 준다.
 */
export function TeamMatchApplyTeamSheet({ picker, onClose, onApplied }: {
  picker: NonNullable<TeamMatchDetailViewModel['applyTeamPicker']>;
  onClose: () => void;
  onApplied: (result: unknown) => void;
}) {
  const [teamId, setTeamId] = useState(picker.defaultTeamId);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groupName = useId();
  const messageId = useId();
  const selected = picker.teams.find((team) => team.teamId === teamId && team.eligible) ?? null;

  const submit = async () => {
    if (!selected || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await picker.submit(selected.teamId, message.trim() || null);
      onApplied(result);
    } catch (err) {
      setError(extractErrorMessage(err, '신청하지 못했어요. 잠시 후 다시 시도해 주세요.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <BottomSheet open onClose={onClose} title="어느 팀으로 신청할까요?">
      <fieldset style={{ border: 0, padding: 0, margin: '16px 0 0', minWidth: 0 }}>
        <legend className="sr-only">신청할 팀</legend>
        <div style={{ display: 'grid', gap: 8 }}>
          {picker.teams.map((team) => {
            const checked = team.teamId === teamId;
            return (
              <label
                key={team.teamId}
                className="tm-list-row tm-pressable tm-apply-team-option tm-on-tint"
                style={{
                  minHeight: 64,
                  border: checked ? '2px solid var(--blue500)' : '1px solid var(--border)',
                  background: checked ? 'var(--blue50)' : 'var(--card-surface)',
                  cursor: team.eligible ? 'pointer' : 'default',
                }}
              >
                <input
                  className="sr-only"
                  type="radio"
                  name={groupName}
                  value={team.teamId}
                  checked={checked}
                  disabled={!team.eligible}
                  onChange={() => setTeamId(team.teamId)}
                />
                <TeamAvatar seed={team.teamId} name={team.name} logoUrl={team.logoUrl} size="md" />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="tm-text-label" style={{ display: 'block', color: team.eligible ? 'var(--text-strong)' : 'var(--text-caption)' }}>{team.name}</span>
                  <span className="tm-text-micro" style={{ display: 'block', marginTop: 2, color: 'var(--text-muted)' }}>
                    {team.eligible ? team.roleLabel : team.reason ?? '이 경기에는 신청할 수 없어요'}
                  </span>
                </span>
                {!team.eligible ? (
                  <Lock size={18} aria-hidden="true" style={{ color: 'var(--text-caption)', flexShrink: 0 }} />
                ) : checked ? (
                  <span aria-hidden="true" style={{ display: 'inline-flex', width: 24, height: 24, flexShrink: 0, borderRadius: 'var(--radius-pill)', background: 'var(--blue500)', color: 'var(--static-white)', alignItems: 'center', justifyContent: 'center' }}>
                    <Check size={14} strokeWidth={3} />
                  </span>
                ) : (
                  <span aria-hidden="true" style={{ display: 'inline-block', width: 24, height: 24, flexShrink: 0, borderRadius: 'var(--radius-pill)', border: '2px solid var(--grey300)' }} />
                )}
              </label>
            );
          })}
        </div>
      </fieldset>
      <label htmlFor={messageId} className="tm-text-label" style={{ display: 'block', marginTop: 16, color: 'var(--text-strong)' }}>
        홈팀에 한마디 <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(선택)</span>
      </label>
      <input
        id={messageId}
        className="tm-input"
        type="text"
        maxLength={APPLY_MESSAGE_MAX}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="예: 저녁 경기 좋아요. 5:5로 뛰어요."
        style={{ marginTop: 8 }}
      />
      {error ? <p className="tm-text-micro" role="alert" style={{ marginTop: 8, color: 'var(--red700)' }}>{error}</p> : null}
      <button
        className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
        type="button"
        style={{ marginTop: 16 }}
        disabled={!selected || pending}
        onClick={() => { void submit(); }}
      >
        {pending ? '처리 중' : selected ? `${josa(selected.name, ['으로', '로'])} 신청하기` : '신청할 팀을 골라 주세요'}
      </button>
      <p className="tm-text-caption" style={{ marginTop: 8, textAlign: 'center', color: 'var(--text-muted)' }}>
        승인 전에는 언제든 신청을 취소할 수 있어요.
      </p>
    </BottomSheet>
  );
}
