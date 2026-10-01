'use client';

import { Users, X } from 'lucide-react';
import { useId, useState } from 'react';
import { AlertBanner, Card } from '@/components/v1-ui/primitives';
import { useV1SendTeamInvitationsBatch } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { teamInvitationBatchStatusLabel } from '@/lib/v1-status-labels';
import type { V1TeamInvitationBatchResult } from '@/types/api';

/** 서버 상한(TEAM_INVITATION_BATCH_MAX)과 같다. */
const BATCH_MAX = 20;
const RETRY_STATUSES = new Set(['not_found', 'ambiguous']);

/** 붙여 넣은 목록을 한 사람씩 나눈다. 닉네임에 공백이 들어갈 수 있어 쉼표·세미콜론·줄바꿈으로만 나눈다. */
export function splitInviteRecipients(raw: string) {
  return raw.split(/[,;\n]/).map((value) => value.trim()).filter((value) => value.length > 0);
}

function batchSummary(result: V1TeamInvitationBatchResult) {
  const skipped = result.results.filter((row) => row.status === 'already_member' || row.status === 'already_invited').length;
  const parts = [
    result.invitedCount > 0 ? `${result.invitedCount}명에게 초대를 보냈어요.` : null,
    skipped > 0 ? `이미 멤버이거나 초대한 ${skipped}명은 건너뛰었어요.` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' ') : '초대를 보내지 못했어요. 아래 이유를 확인해 주세요.';
}

/** 닉네임·이메일을 칩으로 담아 한 번에 초대한다(G12 B-2 F27). 못 찾은 사람만 칩에 남겨 고쳐 다시 보내게 한다. */
export function TeamBatchInviteCard({ teamId, onToast }: { teamId: string; onToast: (text: string) => void }) {
  const inputId = useId();
  const hintId = useId();
  const [draft, setDraft] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [failures, setFailures] = useState<Array<{ recipient: string; label: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const send = useV1SendTeamInvitationsBatch(teamId);

  const withAdded = (current: string[], raw: string) => {
    const next = [...current];
    for (const value of splitInviteRecipients(raw)) {
      if (next.includes(value)) continue;
      if (next.length >= BATCH_MAX) {
        setError(`한 번에 ${BATCH_MAX}명까지 담을 수 있어요.`);
        break;
      }
      next.push(value);
    }
    return next;
  };

  const add = (raw: string) => {
    setError(null);
    setRecipients(withAdded(recipients, raw));
    setDraft('');
  };

  const remove = (recipient: string) => {
    setRecipients((current) => current.filter((value) => value !== recipient));
    setFailures((current) => current.filter((row) => row.recipient !== recipient));
  };

  const submit = () => {
    const list = draft.trim() ? withAdded(recipients, draft) : recipients;
    if (list.length === 0) return;
    setRecipients(list);
    setDraft('');
    setError(null);
    send.mutate(
      { recipients: list },
      {
        onSuccess: (result) => {
          const retry = result.results.filter((row) => RETRY_STATUSES.has(row.status));
          setRecipients(retry.map((row) => row.recipient));
          setFailures(retry.map((row) => ({ recipient: row.recipient, label: teamInvitationBatchStatusLabel(row.status) })));
          onToast(batchSummary(result));
        },
        onError: (err) => setError(extractErrorMessage(err, '초대를 보내지 못했어요. 잠시 후 다시 시도해 주세요.')),
      },
    );
  };

  const count = recipients.length + (draft.trim() && !recipients.includes(draft.trim()) ? 1 : 0);

  return (
    <Card pad={16}>
      <div className="tm-text-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Users size={18} aria-hidden="true" />이름·이메일로 여러 명 초대
      </div>
      <div id={hintId} className="tm-text-caption" style={{ marginTop: 4 }}>
        닉네임이나 이메일을 정확히 적으면 한 번에 담겨요. 쉼표로 여러 명을 붙여 넣어도 돼요.
      </div>
      {recipients.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {recipients.map((recipient) => (
            <button
              key={recipient}
              type="button"
              className="tm-chip"
              aria-label={`${recipient} 빼기`}
              style={{ padding: '0 12px 0 16px', fontWeight: 600, maxWidth: '100%' }}
              onClick={() => remove(recipient)}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{recipient}</span>
              <span aria-hidden="true" style={{ display: 'inline-flex', color: 'var(--text-caption)' }}><X size={14} /></span>
            </button>
          ))}
        </div>
      ) : null}
      {failures.length > 0 ? (
        <ul className="tm-text-caption" role="status" style={{ marginTop: 8, display: 'grid', gap: 4, color: 'var(--red700)' }}>
          {failures.map((row) => (
            <li key={row.recipient}>{row.recipient} — {row.label}</li>
          ))}
        </ul>
      ) : null}
      <label htmlFor={inputId} className="sr-only">초대할 사람 추가</label>
      <div className="tm-create-input" style={{ marginTop: 8 }}>
        <input
          id={inputId}
          className="tm-create-native-input"
          type="text"
          value={draft}
          placeholder="닉네임 또는 이메일 추가"
          autoComplete="off"
          enterKeyHint="done"
          aria-describedby={hintId}
          disabled={send.isPending}
          onChange={(event) => {
            const value = event.target.value;
            if (/[,;]/.test(value)) add(value);
            else setDraft(value);
          }}
          onPaste={(event) => {
            const text = event.clipboardData.getData('text');
            if (!/[,;\n]/.test(text)) return;
            event.preventDefault();
            add(`${draft}${text}`);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (draft.trim()) add(draft);
          }}
        />
      </div>
      <button
        className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"
        type="button"
        style={{ marginTop: 12 }}
        disabled={count === 0 || send.isPending}
        onClick={submit}
      >
        {send.isPending ? '보내는 중' : count > 0 ? `${count}명에게 초대 보내기` : '초대 보내기'}
      </button>
      {error ? <div style={{ marginTop: 12 }}><AlertBanner message={error} /></div> : null}
    </Card>
  );
}
