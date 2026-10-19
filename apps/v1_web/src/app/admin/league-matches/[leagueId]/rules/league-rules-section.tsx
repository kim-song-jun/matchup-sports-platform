'use client';

import { AdminToasts, useAdminToast } from '@/components/admin';
import { TournamentPeriodSettingsEditor } from '@/components/admin/tournament-period-settings-editor';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { useV1AdminLeagueMatch } from '@/hooks/use-v1-api';
import { LeagueDisciplineSettings } from '../league-discipline-settings';

/** 경기 규칙 — 피리어드(전·후반 길이)와 출전정지(경고 누적·퇴장) 설정. 리그를 연 뒤 한 번 정해 두는 것들이다. */
export default function LeagueRulesSection({ leagueId }: { leagueId: string }) {
  const { data: series } = useV1AdminLeagueMatch(leagueId);
  const canWrite = useAdminCanWrite();
  const { toasts, showToast } = useAdminToast();
  // 로딩·오류는 셸이 이미 처리한다 — 여기서는 데이터가 올 때까지 비워 둔다.
  if (!series) return null;

  return (
    <div className="tm-content-enter">
      <TournamentPeriodSettingsEditor tournamentId={leagueId} canWrite={canWrite} showToast={showToast} />
      <LeagueDisciplineSettings league={series} canWrite={canWrite} showToast={showToast} />
      <AdminToasts toasts={toasts} />
    </div>
  );
}
