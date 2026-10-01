'use client';

import Link from 'next/link';
import { Copy, Link2, RefreshCw, Share2, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AlertBanner, Card, ErrorState } from '@/components/v1-ui/primitives';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { useConfirm, type ConfirmOptions } from '@/components/v1-ui/confirm-modal';
import { useToast } from '@/components/v1-ui/toast';
import { useV1TeamDetail, useV1TeamInviteLink, useV1WriteTeamInviteLink } from '@/hooks/use-v1-api';
import { formatKstMeridiemTime, formatTournamentDateMedium } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { isTeamOperatorRole } from '@/lib/team-role';
import { TeamBatchInviteCard } from './team-batch-invite-card';

/** 링크를 담을 웹 주소. 서버는 토큰만 주고 주소는 지금 열린 사이트(alpha·prod)를 따른다. */
export function teamInviteLinkUrl(token: string) {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/invite/${token}`;
}

/** 거부(권한·포커스 없음)와 API 부재(비보안 출처)를 같은 실패로 본다 — 둘 다 링크 글자를 선택해 두는 쪽으로 간다. */
async function writeClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function expiryLabel(expiresAt: string | null) {
  const date = formatTournamentDateMedium(expiresAt);
  const time = formatKstMeridiemTime(expiresAt);
  return date && time ? `${date} ${time}` : null;
}

/** 팀장 첫 5분 "멤버 모으기"(Task 180 G12 B-2) — 초대 링크와 여러 명 초대. */
export function TeamInviteGatherPageClient({ teamId }: { teamId: string }) {
  const teamHref = `/teams/${teamId}`;
  const team = useV1TeamDetail(teamId);
  const canInvite = isTeamOperatorRole(team.data?.viewer.role);
  const { confirm, ConfirmModal } = useConfirm();
  const { showToast, toast } = useToast();

  if (team.isPending) return <PageSkeleton variant="form" />;
  if (team.isError) {
    return <ErrorState message="팀 정보를 불러오지 못했어요." onRetry={() => void team.refetch()} retryLabel="다시 불러오기" />;
  }
  if (!canInvite) {
    return (
      <ErrorState
        title="팀장·매니저만 멤버를 초대할 수 있어요"
        message="초대 링크와 여러 명 초대는 팀장·매니저가 해요."
        back={{ href: teamHref, label: '팀으로 돌아가기' }}
      />
    );
  }

  const goal = team.data.profile.memberGoalCount;
  return (
    <>
      <div style={{ padding: '16px var(--v1-shell-page-x) calc(120px + var(--v1-shell-safe-bottom))' }}>
        <div style={{ padding: '8px 0 4px' }}>
          <span
            aria-hidden="true"
            style={{ width: 48, height: 48, borderRadius: 'var(--radius-circle)', background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center' }}
          >
            <UserPlus size={24} />
          </span>
          <h2 className="tm-text-heading" style={{ marginTop: 16 }}>{team.data.name}에<br />멤버를 모아 볼까요?</h2>
          <div className="tm-text-caption" style={{ marginTop: 8 }}>
            지금 <b>{team.data.memberCount}명</b>{goal !== null ? ` · 정원 ${goal}명` : ''}
          </div>
        </div>
        <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>
          <TeamInviteLinkCard teamId={teamId} teamName={team.data.name} confirm={confirm} onToast={showToast} />
          <TeamBatchInviteCard teamId={teamId} onToast={showToast} />
        </div>
      </div>
      <div className="tm-fixed-cta">
        <Link className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block" href={teamHref}>팀 홈으로</Link>
      </div>
      {ConfirmModal}
      {toast}
    </>
  );
}

function TeamInviteLinkCard({
  teamId,
  teamName,
  confirm,
  onToast,
}: {
  teamId: string;
  teamName: string;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  onToast: (text: string) => void;
}) {
  const link = useV1TeamInviteLink(teamId);
  const write = useV1WriteTeamInviteLink(teamId);
  const issue = write.mutate;
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const autoIssued = useRef(false);
  const status = link.data?.status;

  useEffect(() => setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function'), []);

  // 처음 열었는데 링크가 없으면 바로 만든다 — 살아 있는 링크가 있으면 서버가 그대로 돌려준다(새로 만들지 않는다).
  useEffect(() => {
    if (status !== 'none' || autoIssued.current) return;
    autoIssued.current = true;
    issue({ reissue: false }, { onError: (err) => setError(extractErrorMessage(err, '초대 링크를 만들지 못했어요.')) });
  }, [status, issue]);

  const writeLink = (reissue: boolean, done: string | null) => {
    setError(null);
    issue(
      { reissue },
      {
        onSuccess: () => (done ? onToast(done) : undefined),
        onError: (err) => setError(extractErrorMessage(err, '초대 링크를 만들지 못했어요.')),
      },
    );
  };

  const url = link.data?.status === 'active' && link.data.token ? teamInviteLinkUrl(link.data.token) : null;
  const expiresLabel = expiryLabel(link.data?.expiresAt ?? null);

  const copy = async () => {
    if (!url) return;
    if (await writeClipboard(url)) {
      onToast('초대 링크를 복사했어요.');
      return;
    }
    inputRef.current?.select();
    onToast('복사하지 못했어요. 링크를 선택해 두었으니 직접 복사해 주세요.');
  };

  const share = async () => {
    if (!url) return;
    try {
      await navigator.share({ title: `${teamName} 팀 초대`, text: `${teamName} 팀에 함께해요. 링크를 눌러 가입 신청해 주세요.`, url });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      onToast('공유하지 못했어요. 링크를 복사해서 보내 주세요.');
    }
  };

  const reissue = async () => {
    const ok = await confirm({
      title: '새 링크로 바꿀까요?',
      message: '이전 링크는 더 이상 쓸 수 없어요. 이미 보낸 링크로는 가입 신청을 받지 못해요.',
      confirmLabel: '새 링크 만들기',
    });
    if (ok) writeLink(true, '새 링크를 만들었어요. 이전 링크는 이제 쓸 수 없어요.');
  };

  return (
    <Card pad={16}>
      <div className="tm-text-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Link2 size={18} aria-hidden="true" />초대 링크로 한 번에 부르기
      </div>
      <div className="tm-text-caption" style={{ marginTop: 4 }}>단톡방에 링크를 올리면 눌러서 바로 가입 신청해요.</div>
      {link.isPending || (status === 'none' && !error) ? (
        <div className="tm-text-caption" role="status" style={{ marginTop: 12 }}>링크를 준비하고 있어요…</div>
      ) : link.isError ? (
        <div style={{ marginTop: 12 }}>
          <AlertBanner message={extractErrorMessage(link.error, '초대 링크를 불러오지 못했어요.')} />
          <button className="tm-btn tm-btn-md tm-btn-neutral" type="button" style={{ marginTop: 8 }} onClick={() => void link.refetch()}>다시 불러오기</button>
        </div>
      ) : url ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <div className="tm-create-input" style={{ marginTop: 0, flex: 1, minWidth: 0 }}>
              <input ref={inputRef} className="tm-create-native-input" type="text" readOnly value={url} aria-label="초대 링크" onFocus={(event) => event.currentTarget.select()} />
            </div>
            <button className="tm-btn tm-btn-md tm-btn-primary" type="button" style={{ flex: 'none', gap: 6 }} onClick={() => void copy()}>
              <Copy size={16} aria-hidden="true" />복사
            </button>
          </div>
          <div className="tm-text-caption" style={{ marginTop: 8 }}>
            링크로 온 분은 가입 신청으로 접수돼요 · {expiresLabel ? `${expiresLabel}까지 쓸 수 있어요` : '7일 동안 쓸 수 있어요'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, marginLeft: -8 }}>
            {canShare ? (
              <button className="tm-btn tm-btn-sm tm-btn-ghost" type="button" style={{ padding: '0 8px', gap: 4 }} onClick={() => void share()}>
                <Share2 size={16} aria-hidden="true" />공유
              </button>
            ) : null}
            <button className="tm-btn tm-btn-sm tm-btn-ghost" type="button" style={{ padding: '0 8px', gap: 4 }} disabled={write.isPending} onClick={() => void reissue()}>
              <RefreshCw size={16} aria-hidden="true" />새 링크로 바꾸기
            </button>
          </div>
        </>
      ) : (
        <div style={{ marginTop: 12 }}>
          {status === 'expired' ? (
            <div className="tm-text-caption">{expiresLabel ? `${expiresLabel}에 링크가 만료됐어요.` : '링크가 만료됐어요.'} 새 링크를 만들어 보내 주세요.</div>
          ) : null}
          <button className="tm-btn tm-btn-md tm-btn-primary" type="button" style={{ marginTop: 8 }} disabled={write.isPending} onClick={() => writeLink(false, null)}>
            {write.isPending ? '만드는 중' : '새 링크 만들기'}
          </button>
        </div>
      )}
      {error ? <div style={{ marginTop: 12 }}><AlertBanner message={error} /></div> : null}
    </Card>
  );
}
