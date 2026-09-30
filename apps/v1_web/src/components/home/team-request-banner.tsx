import Link from 'next/link';
import { MailOpen, UserPlus } from 'lucide-react';
import { Card } from '@/components/v1-ui/primitives';
import { withFromPath } from '@/lib/session-storage';
import type { V1HomeTeamActivity } from '@/types/api';

type TeamRequestBannerProps =
  | { kind: 'teamInvitation'; invitations: NonNullable<V1HomeTeamActivity['pendingInvitations']> }
  | { kind: 'joinRequests'; joinRequests: NonNullable<V1HomeTeamActivity['pendingJoinRequests']> };

/**
 * 홈 유도 배너 중 "남이 내 응답을 기다리는" 두 종류 — 받은 팀 초대, 내가 운영하는 팀에 온 가입 신청.
 * 착지 화면은 같은 이벤트의 알림 딥링크와 같다(초대함 · 팀 멤버 관리).
 */
export function TeamRequestBanner(props: TeamRequestBannerProps) {
  const copy =
    props.kind === 'teamInvitation'
      ? {
          icon: <MailOpen size={18} strokeWidth={2} />,
          title: `팀 초대 ${props.invitations.count}건이 와 있어요`,
          sub: `${withOthers(props.invitations.latestTeamName, props.invitations.count - 1)}에서 초대했어요`,
          href: withFromPath('/my/invitations', '/home'),
        }
      : {
          icon: <UserPlus size={18} strokeWidth={2} />,
          title: `가입 신청 ${props.joinRequests.count}건이 기다려요`,
          sub: `${withOthers(props.joinRequests.teamName, props.joinRequests.otherTeamCount)} · 응답을 기다려요`,
          href: withFromPath(`/teams/${encodeURIComponent(props.joinRequests.teamId)}/members`, '/home'),
        };

  return (
    <Card pad={16} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: 36,
          height: 36,
          borderRadius: 'var(--radius-control)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--blue-soft)',
          color: 'var(--blue700)',
        }}
      >
        {copy.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tm-text-label">{copy.title}</div>
        <div className="tm-text-caption" style={{ marginTop: 2, overflowWrap: 'anywhere' }}>{copy.sub}</div>
      </div>
      <Link
        className="tm-btn tm-btn-sm tm-btn-primary"
        href={copy.href}
        aria-label={`${copy.title} — 확인하기`}
        style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
      >
        확인하기
      </Link>
    </Card>
  );
}

function withOthers(name: string, others: number): string {
  return others > 0 ? `${name} 외 ${others}팀` : name;
}
