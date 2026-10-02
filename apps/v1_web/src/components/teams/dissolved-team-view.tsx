'use client';

import Link from 'next/link';
import { Archive } from 'lucide-react';
import { Card, ListItem } from '@/components/v1-ui/primitives';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { formatTournamentDateMedium, formatTournamentDateTimeShort } from '@/lib/date-utils';
import { withFromPath } from '@/lib/session-storage';
import type { V1TeamDetail } from '@/types/api';

/**
 * 해체(보관)된 팀의 읽기 전용 페이지(Task 180 H3). 지난 경기·알림에서 들어와도 막다른 길이
 * 되지 않게 전적으로 가는 길을 남기고, 운영 입구(가입·컨택·관리)는 두지 않는다.
 */
export function DissolvedTeamView({ team, selfHref }: { team: V1TeamDetail; selfHref: string }) {
  const dissolution = team.dissolution ?? null;
  const dissolvedLabel = formatTournamentDateMedium(dissolution?.dissolvedAt);
  const deadlineLabel = formatTournamentDateTimeShort(dissolution?.restoreDeadlineAt);
  const meta = [team.sport?.name ?? team.sportName, team.region?.name ?? team.regionName].filter(Boolean).join(' · ');

  return (
    <div className="tm-content-enter" style={{ padding: '16px var(--v1-shell-page-x) 32px', display: 'grid', gap: 16 }}>
      <Card pad={20}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <TeamAvatar seed={team.teamId} name={team.name} logoUrl={team.profile.logoUrl} size="lg" />
          <div style={{ minWidth: 0 }}>
            <span className="tm-badge tm-badge-grey" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Archive size={12} aria-hidden="true" />
              해체된 팀
            </span>
            <h1 className="tm-text-heading" style={{ margin: '6px 0 0', overflowWrap: 'anywhere' }}>{team.name}</h1>
            {meta ? <div className="tm-text-caption" style={{ marginTop: 2 }}>{meta}</div> : null}
          </div>
        </div>
        <p className="tm-text-caption" style={{ margin: '16px 0 0', lineHeight: 1.55 }}>
          {dissolvedLabel ? `${dissolvedLabel}에 해체된 팀이에요.` : '해체된 팀이에요.'} 새 활동은 멈췄고, 지난 경기 기록과
          전적·후기는 그대로 남아 있어요.
        </p>
      </Card>
      <Card pad={0} style={{ padding: '4px 16px' }}>
        <ListItem
          title="팀 전적·지난 경기"
          sub="경기 결과와 기록을 볼 수 있어요"
          href={withFromPath(`/teams/${team.teamId}/records`, selfHref)}
          chev
        />
      </Card>
      {dissolution?.canRestore ? (
        <Card pad={16} className="tm-on-tint" style={{ background: 'var(--grey50)' }}>
          <h2 className="tm-text-label" style={{ margin: 0 }}>잘못 해체했나요?</h2>
          <p className="tm-text-caption" style={{ margin: '4px 0 0', lineHeight: 1.55 }}>
            {/* 여러 줄 글에 &gt; 같은 엔티티가 있으면 Next(SWC)가 첫 공백을 지운다 — 공백을 따로 둔다. */}
            {deadlineLabel ? `${deadlineLabel}까지` : '해체하고 30일 안에'}{' '}마이 &gt; 팀 &gt; 해체한 팀에서 복구할 수 있어요.
            취소된 경기·일정은 되살아나지 않고 팀 채팅만 다시 열려요.
          </p>
          <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href="/my/teams" style={{ marginTop: 12 }}>
            해체한 팀에서 복구하기
          </Link>
        </Card>
      ) : null}
    </div>
  );
}
