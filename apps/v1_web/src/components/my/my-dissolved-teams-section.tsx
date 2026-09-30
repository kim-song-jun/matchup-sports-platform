'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { Card } from '@/components/v1-ui/primitives';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useV1MyDissolvedTeams, useV1RestoreTeam } from '@/hooks/use-v1-api';
import { usePendingIds } from '@/hooks/use-pending-ids';
import { V1ApiError } from '@/lib/api-client';
import { formatTournamentDateMedium, formatTournamentDateTimeShort } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { withFromPath } from '@/lib/session-storage';
import type { V1MyDissolvedTeams } from '@/types/api';

type DissolvedTeam = V1MyDissolvedTeams['items'][number];

/**
 * 마이 > 팀 > 해체한 팀(Task 180 H3). 복구 가능 여부는 서버의 `canRestore`(30일 경계 포함)를
 * 그대로 따르고, 기간이 지난 팀은 운영팀 문의로 안내한다. 해체한 팀이 없으면 아무것도 그리지 않는다.
 */
export function MyDissolvedTeamsSection() {
  const router = useRouter();
  const headingId = useId();
  const query = useV1MyDissolvedTeams();
  const restore = useV1RestoreTeam();
  const restoring = usePendingIds();
  const { confirm, ConfirmModal } = useConfirm();
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (query.isPending) return null;
  if (query.isError) {
    return (
      <Card pad={16} style={{ marginTop: 24 }}>
        <p className="tm-text-caption" role="alert" style={{ margin: 0 }}>해체한 팀을 불러오지 못했어요.</p>
        <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" style={{ marginTop: 8 }} onClick={() => void query.refetch()}>
          다시 불러오기
        </button>
      </Card>
    );
  }
  const { items, restoreWindowDays } = query.data;
  if (items.length === 0) return null;

  const onRestore = async (team: DissolvedTeam) => {
    const ok = await confirm({
      title: '팀 복구',
      message: `${team.name} 팀을 다시 열까요? 취소된 경기·일정은 되살아나지 않고 팀 채팅만 다시 열려요.`,
      confirmLabel: '복구',
    });
    if (!ok) return;
    setErrors((current) => {
      const next = { ...current };
      delete next[team.teamId];
      return next;
    });
    restoring.start(team.teamId);
    restore.mutate(
      { teamId: team.teamId },
      {
        onSuccess: (result) => router.push(withFromPath(result.detailRoute, '/my/teams')),
        onError: (err) => {
          // 목록을 받은 뒤 경계를 넘었을 수 있다 — 다시 받아 "운영팀 문의" 안내로 바꾼다.
          if (err instanceof V1ApiError && err.code === 'TEAM_RESTORE_WINDOW_EXPIRED') void query.refetch();
          setErrors((current) => ({ ...current, [team.teamId]: extractErrorMessage(err, '팀을 복구하지 못했어요. 잠시 후 다시 시도해 주세요.') }));
        },
        onSettled: () => restoring.finish(team.teamId),
      },
    );
  };

  return (
    <section aria-labelledby={headingId} style={{ marginTop: 24 }}>
      {ConfirmModal}
      <h2 id={headingId} className="tm-text-label" style={{ margin: 0 }}>해체한 팀</h2>
      <p className="tm-text-caption" style={{ margin: '3px 0 0' }}>
        해체하고 {restoreWindowDays}일 안에는 직접 복구할 수 있어요. 그 뒤에는 운영팀에 문의해 주세요.
      </p>
      <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 12 }}>
        {items.map((team) => {
          const dissolved = formatTournamentDateMedium(team.dissolvedAt);
          const deadline = formatTournamentDateTimeShort(team.restoreDeadlineAt);
          const pending = restoring.has(team.teamId);
          return (
            <li key={team.teamId}>
              <Card pad={16}>
                <Link className="tm-list-row tm-pressable" href={withFromPath(team.detailRoute, '/my/teams')} style={{ gap: 12 }}>
                  <TeamAvatar seed={team.teamId} name={team.name} logoUrl={team.logoUrl} size="md" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="tm-text-body" style={{ color: 'var(--text-strong)', overflowWrap: 'anywhere' }}>{team.name}</div>
                    <div className="tm-text-caption" style={{ marginTop: 2 }}>
                      {[team.sportName, dissolved ? `${dissolved} 해체` : null, `멤버 ${team.memberCount}명`].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </Link>
                {team.canRestore ? (
                  <>
                    <p className="tm-text-caption" style={{ margin: '8px 0 0' }}>
                      {deadline ? `${deadline}까지 복구할 수 있어요.` : '지금 복구할 수 있어요.'}
                    </p>
                    <button
                      className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"
                      type="button"
                      style={{ marginTop: 8 }}
                      disabled={pending}
                      aria-label={`${team.name} 복구`}
                      onClick={() => void onRestore(team)}
                    >
                      {pending ? '복구하는 중…' : '복구하기'}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="tm-text-caption" style={{ margin: '8px 0 0' }}>
                      복구 기간({restoreWindowDays}일)이 지났어요. 다시 열어야 하면 운영팀에 문의해 주세요.
                    </p>
                    <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href="/my/inquiries/new" style={{ marginTop: 8 }}>
                      운영팀에 문의하기
                    </Link>
                  </>
                )}
                {errors[team.teamId] ? (
                  <p className="tm-text-caption" role="alert" style={{ margin: '8px 0 0', color: 'var(--red700)' }}>{errors[team.teamId]}</p>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
