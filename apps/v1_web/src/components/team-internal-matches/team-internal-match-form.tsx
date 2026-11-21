'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AlertBanner, Card, EmptyState, ErrorState, TextField } from '@/components/v1-ui/primitives';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { useV1TeamDetail, useV1TeamMembers } from '@/hooks/use-v1-api';
import { internalMatchErrorMessage, useCreateInternalMatch, usePreviewInternalMatch, type InternalMatchPreview } from '@/hooks/use-team-internal-matches';
import { isoToKstDatetimeLocal, kstDatetimeLocalToIso } from '@/lib/kst-calendar';
import { isTeamOperatorRole } from '@/lib/team-role';

const TEAM_COUNTS = [2, 3, 4] as const;

type Side = InternalMatchPreview['sides'][number];

/** 팀 내 경기 만들기 — 팀원을 고르고 → 자동 편성 미리보기(다시 뽑기·직접 옮기기) → 확정. 팀장·매니저만. */
export function TeamInternalMatchFormPageClient({ teamId }: { teamId: string }) {
  const router = useRouter();
  const team = useV1TeamDetail(teamId);
  const members = useV1TeamMembers(teamId, { limit: 50 });
  const preview = usePreviewInternalMatch(teamId);
  const create = useCreateInternalMatch(teamId);

  const [playedAt, setPlayedAt] = useState(() => isoToKstDatetimeLocal(new Date().toISOString()));
  const [teamCount, setTeamCount] = useState<number>(2);
  const [selected, setSelected] = useState<string[]>([]);
  const [seed, setSeed] = useState(0);
  const [sides, setSides] = useState<Side[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const teamPending = team.data === undefined && !team.isError;
  const canManage = isTeamOperatorRole(team.data?.viewer.role);
  const memberList = useMemo(() => (members.data?.items ?? []).filter((member) => member.status === 'active'), [members.data]);

  // 팀 수나 선수를 바꾸면 이전 편성은 더 이상 맞지 않는다.
  useEffect(() => setSides(null), [teamCount, selected]);

  if (teamPending || members.isLoading) return <PageSkeleton variant="detail" />;
  if (team.isError || members.isError) return <ErrorState message="정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." onRetry={() => { void team.refetch(); void members.refetch(); }} />;
  if (!canManage) return <EmptyState title="팀 내 경기를 만들 권한이 없어요" sub="팀장·매니저만 만들 수 있어요." />;

  const toggle = (userId: string) => setSelected((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]));
  const allSelected = memberList.length > 0 && selected.length === memberList.length;

  function runPreview(nextSeed: number) {
    setError(null);
    preview.mutate(
      { userIds: selected, teamCount, seed: nextSeed },
      {
        onSuccess: (result) => { setSides(result.sides); setSeed(nextSeed); },
        onError: (err) => setError(internalMatchErrorMessage(err, '편성하지 못했어요.')),
      },
    );
  }

  function move(userId: string, toSideNumber: number) {
    setSides((current) => {
      if (!current) return current;
      const player = current.flatMap((side) => side.players).find((p) => p.userId === userId);
      if (!player) return current;
      return current.map((side) => ({
        ...side,
        players: side.sideNumber === toSideNumber
          ? [...side.players.filter((p) => p.userId !== userId), player]
          : side.players.filter((p) => p.userId !== userId),
      }));
    });
  }

  function save() {
    const iso = kstDatetimeLocalToIso(playedAt);
    if (!iso) { setError('경기 일시를 입력해 주세요.'); return; }
    if (!sides || sides.some((side) => side.players.length === 0)) { setError('모든 팀에 선수가 1명 이상 있어야 해요.'); return; }
    setError(null);
    create.mutate(
      { playedAt: iso, sides: sides.map((side) => ({ userIds: side.players.map((p) => p.userId) })) },
      {
        onSuccess: (match) => router.replace(`/teams/${teamId}/internal-matches/${match.id}`),
        onError: (err) => setError(internalMatchErrorMessage(err, '저장하지 못했어요.')),
      },
    );
  }

  return (
    <div style={{ padding: '16px 20px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div className="tm-text-label" style={{ marginBottom: 16, color: 'var(--text-muted)' }}>경기 정보</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <TextField label="경기 일시" type="datetime-local" value={playedAt} onChange={(e) => setPlayedAt(e.target.value)} />
          <div>
            <div className="tm-text-label" style={{ marginBottom: 8 }}>몇 팀으로 나눌까요?</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {TEAM_COUNTS.map((count) => (
                <button key={count} type="button" aria-pressed={teamCount === count} className={`tm-chip ${teamCount === count ? 'tm-chip-active' : ''}`} onClick={() => setTeamCount(count)}>
                  {count}팀
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="tm-text-label" style={{ color: 'var(--text-muted)' }}>참여 팀원 <span className="tab-num">{selected.length}</span>명</div>
          <button type="button" className="tm-btn tm-btn-sm tm-btn-neutral" onClick={() => setSelected(allSelected ? [] : memberList.map((member) => member.userId))}>
            {allSelected ? '전체 해제' : '전체 선택'}
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="group" aria-label="참여 팀원">
          {memberList.map((member) => (
            <button key={member.userId} type="button" aria-pressed={selected.includes(member.userId)} className={`tm-chip ${selected.includes(member.userId) ? 'tm-chip-active' : ''}`} onClick={() => toggle(member.userId)}>
              {member.displayName}
            </button>
          ))}
        </div>
        {members.data?.pageInfo.hasNext ? <p className="tm-text-caption" style={{ marginTop: 8 }}>팀원이 많아 앞의 50명만 보여요.</p> : null}
      </Card>

      {error ? <AlertBanner tone="error" message={error} /> : null}

      <button type="button" className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" disabled={selected.length < teamCount || preview.isPending} onClick={() => runPreview(0)}>
        {preview.isPending ? '편성 중…' : '자동 편성하기'}
      </button>
      {selected.length < teamCount ? <p className="tm-text-caption">팀 수({teamCount}팀)보다 많은 팀원을 골라 주세요.</p> : null}

      {sides ? (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="tm-text-label" style={{ color: 'var(--text-muted)' }}>편성 결과</div>
            <button type="button" className="tm-btn tm-btn-sm tm-btn-neutral" disabled={preview.isPending} onClick={() => runPreview(seed + 1)}>다시 뽑기</button>
          </div>
          <p className="tm-text-caption" style={{ marginBottom: 12 }}>선수 옆 선택칸으로 다른 팀에 옮길 수 있어요. 다시 뽑으면 직접 옮긴 내용은 사라져요.</p>
          {sides.map((side) => (
            <div key={side.sideNumber} style={{ paddingTop: 12, marginTop: 12, borderTop: side.sideNumber === 1 ? 'none' : '1px solid var(--border)' }}>
              <div className="tm-text-body-lg">{side.name} <span className="tm-text-caption tab-num">{side.players.length}명</span></div>
              <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 6 }}>
                {side.players.map((player) => (
                  <li key={player.userId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span className="tm-text-body">{player.name}</span>
                    <select className="tm-input" style={{ width: 'auto' }} aria-label={`${player.name} 팀 옮기기`} value={side.sideNumber} onChange={(e) => move(player.userId, Number(e.target.value))}>
                      {sides.map((target) => <option key={target.sideNumber} value={target.sideNumber}>{target.name}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <button type="button" className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" style={{ marginTop: 16 }} disabled={create.isPending} onClick={save}>
            {create.isPending ? '저장 중…' : '확정하고 저장'}
          </button>
        </Card>
      ) : null}
    </div>
  );
}
