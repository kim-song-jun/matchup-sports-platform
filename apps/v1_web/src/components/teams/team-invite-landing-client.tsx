'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { AlertBanner, Card, ErrorState } from '@/components/v1-ui/primitives';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { useV1JoinTeamByInviteLink, useV1TeamInviteLinkPreview } from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import { getLoginPathForRedirect } from '@/lib/session-storage';
import type { V1TeamInviteLinkPreview } from '@/types/api';

/** 링크가 더는 쓰이지 않는 이유별 제목. 본문은 서버 문구(해요체)를 그대로 쓴다. */
const DEAD_LINK_TITLES: Record<string, string> = {
  TEAM_INVITE_LINK_EXPIRED: '초대 링크가 만료됐어요',
  TEAM_INVITE_LINK_REVOKED: '더 이상 쓸 수 없는 링크예요',
  TEAM_INVITE_LINK_NOT_FOUND: '초대 링크를 찾을 수 없어요',
  TEAM_NOT_ACTIVE: '지금은 가입할 수 없는 팀이에요',
};

/** 초대 링크 착지(Task 180 G12). 링크로는 가입 신청만 보낸다 — 승인은 팀장·매니저가 한다. */
export function TeamInviteLandingClient({ token }: { token: string }) {
  const preview = useV1TeamInviteLinkPreview(token);
  const join = useV1JoinTeamByInviteLink(token);

  if (preview.isPending) return <PageSkeleton variant="detail" />;
  if (preview.isError) {
    const code = preview.error instanceof V1ApiError ? preview.error.code : null;
    const title = code ? DEAD_LINK_TITLES[code] : undefined;
    if (title) {
      return (
        <ErrorState
          title={title}
          message={extractErrorMessage(preview.error, '팀장·매니저에게 새 링크를 받아 주세요.')}
          back={{ href: '/teams', label: '다른 팀 둘러보기' }}
        />
      );
    }
    return <ErrorState message="초대 링크를 확인하지 못했어요. 잠시 후 다시 시도해 주세요." onRetry={() => void preview.refetch()} retryLabel="다시 확인하기" />;
  }

  const { team, viewer } = preview.data;
  const teamHref = `/teams/${team.id}`;
  return (
    <>
      <div style={{ padding: '24px var(--v1-shell-page-x) calc(120px + var(--v1-shell-safe-bottom))' }}>
        <div className="tm-text-caption">팀 초대</div>
        <h2 className="tm-text-heading" style={{ marginTop: 4 }}>{team.name} 팀에서<br />함께 뛰자고 초대했어요</h2>
        <Card pad={16} style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <TeamAvatar seed={team.id} name={team.name} logoUrl={team.logoUrl} size="lg" />
          <div style={{ minWidth: 0 }}>
            <div className="tm-text-body-lg" style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{team.name}</div>
            <div className="tm-text-caption" style={{ marginTop: 4 }}>{[team.sportName, team.regionName].filter(Boolean).join(' · ')}</div>
          </div>
        </Card>
        <div className="tm-text-caption" style={{ marginTop: 12 }}>
          가입 신청을 보내면 팀장·매니저가 확인하고 승인해요. 승인되면 알림으로 알려 드려요.
        </div>
        <ViewerStatus viewer={viewer} justJoined={join.isSuccess} />
        {join.isError ? (
          <div style={{ marginTop: 12 }}>
            <AlertBanner message={extractErrorMessage(join.error, '가입 신청을 보내지 못했어요. 잠시 후 다시 시도해 주세요.')} />
          </div>
        ) : null}
      </div>
      <div className="tm-fixed-cta">
        {viewer === null ? (
          <Link className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" href={getLoginPathForRedirect(`/invite/${token}`)}>
            로그인하고 가입 신청하기
          </Link>
        ) : viewer.eligible && !join.isSuccess ? (
          <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" type="button" disabled={join.isPending} onClick={() => join.mutate()}>
            {join.isPending ? '신청 보내는 중' : '가입 신청하기'}
          </button>
        ) : (
          <Link className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block" href={teamHref}>
            {viewer.joinState === 'member' ? '팀으로 가기' : '팀 보기'}
          </Link>
        )}
      </div>
    </>
  );
}

function ViewerStatus({ viewer, justJoined }: { viewer: V1TeamInviteLinkPreview['viewer']; justJoined: boolean }) {
  if (viewer === null) return null;
  const requested = justJoined || viewer.joinState === 'requested';
  if (viewer.joinState === 'member' || requested) {
    return (
      <div className="tm-card tm-on-tint tm-team-created-card" role="status" style={{ marginTop: 16 }}>
        <span aria-hidden="true" className="tm-team-created-icon"><Check size={18} strokeWidth={3} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>
            {viewer.joinState === 'member' ? '이미 이 팀 멤버예요' : '가입 신청을 보냈어요'}
          </div>
          <div className="tm-text-caption" style={{ marginTop: 2 }}>
            {viewer.joinState === 'member' ? '팀 일정과 채팅은 팀 화면에서 볼 수 있어요.' : '팀장·매니저가 승인하면 멤버가 돼요.'}
          </div>
        </div>
      </div>
    );
  }
  if (viewer.eligible) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <AlertBanner tone="info" message={viewer.message} />
    </div>
  );
}
