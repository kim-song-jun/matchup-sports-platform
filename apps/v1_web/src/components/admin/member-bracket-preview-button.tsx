'use client';
import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { v1Post } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';

export function MemberBracketPreviewButton({ userId, enabled }: { userId: string; enabled: boolean }) {
  const canWrite = useAdminCanWrite();
  const router = useRouter();
  const inputId = useId();
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [reason, setReason] = useState('');
  const [validation, setValidation] = useState('');

  if (!canWrite || !enabled) return null;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    try {
      const parsed = new URL(url, window.location.origin);
      if (!['https:', 'http:'].includes(parsed.protocol) ||
        ![window.location.host, 'teameet.co.kr', 'alpha.teameet.co.kr'].includes(parsed.host)) throw new Error();
      const match = parsed.pathname.match(/^\/tournaments\/([0-9a-f-]{36})\/bracket\/?$/i);
      if (!match) throw new Error();
      if (reason.trim().length < 5) { setValidation('확인 사유를 5자 이상 입력해 주세요.'); return; }
      const allowed = new URLSearchParams();
      for (const key of ['tab', 'schedulePhase', 'scheduleGroup', 'scheduleFinal', 'teamScope', 'schedule']) {
        const value = parsed.searchParams.get(key); if (value) allowed.set(key, value);
      }
      const filters = allowed.size ? '?' + allowed.toString() : '';
      setValidation('');
      setPending(true);
      setError(null);
      try {
        const { previewId } = await v1Post<{ previewId: string }>(
          `/admin/users/${userId}/bracket-preview`, { tournamentId: match[1], reason: reason.trim() });
        router.push(`/admin/users/${userId}/bracket-preview/${previewId}${filters}`);
      } catch (requestError) { setError(requestError); } finally { setPending(false); }
    } catch { setValidation('확인할 대회의 대진표 링크를 입력해 주세요.'); }
  }
  return <div className="mt-6 border-t border-[var(--border)] pt-3">
    <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost" disabled={pending} aria-expanded={open}
      onClick={() => setOpen(!open)}>회원 화면으로 보기</button>
    {open ? <form onSubmit={submit} className="mt-3 flex max-w-xl flex-col gap-3">
      <p className="tm-text-caption">선택한 회원의 팀 정보로 대진표를 10분간 조회해요. 확인 사유와 열람 기록이 남아요. 회원의 기기 상태는 재현하지 않아요.</p>
      <label htmlFor={inputId} className="tm-text-label">대진표 링크</label>
      <input id={inputId} className="tm-input" required value={url} onChange={e => setUrl(e.target.value)} placeholder="확인할 대진표 주소를 붙여 넣어 주세요" />
      <label htmlFor={reasonId} className="tm-text-label">확인 사유</label>
      <textarea id={reasonId} className="tm-input" required minLength={5} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
      {validation || error !== null ? <p role="alert" className="tm-text-caption" style={{ color: 'var(--red700)' }}>{validation || extractErrorMessage(error, '조회 화면을 열지 못했어요.')}</p> : null}
      <button type="submit" className="tm-btn tm-btn-sm tm-btn-neutral" disabled={pending}>{pending ? '여는 중…' : '대진표 조회'}</button>
    </form> : null}
  </div>;
}
