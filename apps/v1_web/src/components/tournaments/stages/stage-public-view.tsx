'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SectionTitle } from '@/components/v1-ui/primitives';
import { TournamentBracket } from '@/components/tournaments/tournament-bracket';
import { TournamentStandingsTable, type TournamentStandingsRow } from '@/components/tournaments/tournament-standings-table';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import type { V1TournamentDetail } from '@/types/api';
import { StageScopedRecords } from './stage-scoped-records';
import { SixTeamBracket } from '@/components/tournaments/six-team-bracket';
export function StagePublicView({ tournament }: { tournament: V1TournamentDetail }) {
  const [key, setKey] = useState('');
  const [poolKey, setPoolKey] = useState('');
  const [team, setTeam] = useState('');
  const [round, setRound] = useState('');
  const [showRecords, setShowRecords] = useState(false);
  const plan = tournament.stagePlan;
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setKey(params.get('stage') ?? ''); setPoolKey(params.get('pool') ?? '');
    setTeam(params.get('team') ?? ''); setRound(params.get('round') ?? '');
  }, []);
  if (!plan) return null;
  const selected = plan.stages.find(s => s.key === key) ?? (tournament.status === 'completed' ? plan.stages.at(-1)! : plan.stages[0]);
  const activePool = selected.pools.some(pool => pool.key === poolKey) ? poolKey : '';
  const control = 'min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3';
  const select = (field: string, value: string) => {
    const params = new URLSearchParams(window.location.search);
    if (value) params.set(field, value); else params.delete(field);
    if (field === 'stage') { params.delete('pool'); setPoolKey(''); }
    if (field === 'stage' || field === 'pool') { params.delete('round'); params.delete('team'); setRound(''); setTeam(''); }
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  };
  const selectedGroups = tournament.groups.filter(g => g.stageKey === selected.key && (!activePool || g.poolKey === activePool));
  const ids = new Set(selectedGroups.map(g => g.id));
  const fixturesInScope = tournament.fixtures.filter(f => f.groupId && ids.has(f.groupId));
  const rounds = [...new Set(fixturesInScope.map(f => f.round))];
  const teams = [...new Map(selectedGroups.flatMap(g => g.groupTeams.filter(t => t.registrationId).map(t => [t.registrationId!, t.teamName] as const))).entries()];
  const activeTeam = teams.some(([id]) => id === team) ? team : '', activeRound = rounds.includes(round) ? round : '';
  return <div className="space-y-6">
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block tm-text-label">진행 단계<select className={control} value={selected.key} onChange={e => { setKey(e.target.value); select('stage', e.target.value); }}>{plan.stages.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}</select></label>
      <label className="block tm-text-label">편성<select className={control} value={activePool} onChange={e => { setPoolKey(e.target.value); select('pool', e.target.value); }}><option value="">전체 편성</option>{selected.pools.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}</select></label>
      <label className="block tm-text-label">참가팀<select className={control} value={activeTeam} onChange={e => { setTeam(e.target.value); select('team', e.target.value); }}><option value="">전체 팀</option>{teams.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="block tm-text-label">경기 라운드<select className={control} value={activeRound} onChange={e => { setRound(e.target.value); select('round', e.target.value); }}><option value="">전체 라운드</option>{rounds.map(r => <option key={r} value={r}>{r}</option>)}</select></label>
    </div>
    <p className="tm-text-caption text-[var(--text-muted)]">각 편성의 순위를 따로 계산해요. 서로 다른 단계·리그의 승점을 합쳐 전체 순위로 표시하지 않아요.</p>
    {tournament.status === 'completed' && <StageOverallRanks tournament={tournament} />}
    {!tournament.groups.length && <p className="tm-text-label">대진 공개를 기다리고 있어요.</p>}
    {selected.pools.filter(p => !activePool || p.key === activePool).map(pool => {
      const groups = tournament.groups.filter(g => g.poolKey === pool.key), groupIds = new Set(groups.map(g => g.id));
      const fixtures = tournament.fixtures.filter(f => f.groupId && groupIds.has(f.groupId) && (!activeRound || f.round === activeRound) && (!activeTeam || f.homeRegistrationId === activeTeam || f.awayRegistrationId === activeTeam));
      const group = groups.find(g => g.phase === 'group');
      const rows: TournamentStandingsRow[] = group?.standings.map(s => ({ key: s.registrationId, teamId: s.teamId, teamName: s.teamName, teamLogoUrl: s.teamLogoUrl, position: s.position ?? 0, sharedRank: s.sharedRank ?? null, points: s.points, wins: s.wins, draws: s.draws, losses: s.losses, goalsFor: s.goalsFor, goalsAgainst: s.goalsAgainst })) ?? [];
      const known = new Set(rows.map(r => r.key));
      group?.groupTeams.forEach(t => { if (t.registrationId && !known.has(t.registrationId)) rows.push({ key: t.registrationId, teamId: t.teamId, teamName: t.teamName, teamLogoUrl: t.teamLogoUrl, position: rows.length + 1, sharedRank: null, points: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 }); });
      const advancingRanks = new Set(plan.stages.flatMap(s => s.pools.flatMap(p => p.sources.filter(source => (source.comparisonPoolKeys ?? [source.poolKey]).includes(pool.key)).map(source => source.rank))));
      const advancingKeys = new Set(rows.filter(r => advancingRanks.has(r.position) && !r.sharedRank).map(r => r.key));
      const progress = tournament.stageProgress?.find(item => item.poolKey === pool.key);
      return <section key={pool.key} className="space-y-4">
        <SectionTitle title={`${pool.name} · ${pool.format === 'league' ? '풀리그' : '토너먼트'}`} />
        {progress && <p className="tm-text-label" role="status">{progress.stale ? '이전 단계 정정 확인 중 · 참가팀 배정 검토 필요' : progress.complete ? '공식 결과 완료' : progress.assigned ? '참가팀 확정' : '참가팀 배정 대기'}</p>}
        <p className="tm-text-caption">{pool.capacity}팀{pool.format === 'league' ? ` · ${pool.legs}회전` : ''}{pool.sources.length ? ` · 진출 출처: ${pool.sources.map(source => `${plan.stages.flatMap(s => s.pools).find(p => p.key === source.poolKey)?.name ?? '이전 편성'} ${source.rank}위`).join(', ')}` : ''}</p>
        {advancingRanks.size > 0 && <p className="tm-text-caption">강조한 순위는 다음 단계 진출 대상이에요. 공식 결과와 참가팀 배정이 확정되면 다음 편성에 반영돼요.</p>}
        {pool.format === 'league' && group && <TournamentStandingsTable advancingKeys={advancingKeys.size ? advancingKeys : null} rows={rows} ariaLabel={`${selected.name} ${pool.name} 순위표`} />}
        {pool.sixTeamFinalBye && progress?.sixTeamBracket ? <SixTeamBracket tournamentId={tournament.id} state={progress.sixTeamBracket} fixtures={fixtures} directFinalOrder={pool.sixTeamDirectFinalOrder} /> : pool.format === 'knockout' && !pool.sixTeamFinalBye && fixtures.length > 0 ? <TournamentBracket fixtures={fixtures} groups={groups} /> : null}
        <ul className="divide-y divide-[var(--border)]">{fixtures.map(f => <li key={f.id}><Link className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-3 tm-text-label" href={`/tournaments/${encodeURIComponent(tournament.id)}/matches/${encodeURIComponent(f.id)}`}><span>{f.fixtureNumber}경기 · {f.homeTeamName} vs {f.awayTeamName}</span><span className="tm-text-caption">{f.result ? `${f.result.homeScore} : ${f.result.awayScore}` : f.scheduledAt ? formatTournamentDateTimeShort(f.scheduledAt) : '일정 미정'}</span></Link></li>)}</ul>
      </section>;
    })}
    <button type="button" className="tm-btn tm-btn-md tm-btn-neutral" aria-expanded={showRecords} onClick={() => setShowRecords(!showRecords)}>선택한 단계·편성 개인 기록{showRecords ? ' 닫기' : ' 보기'}</button>
    {showRecords && <StageScopedRecords tournamentId={tournament.id} stageKey={selected.key} poolKey={activePool || undefined} />}
  </div>;
}

function StageOverallRanks({ tournament }: { tournament: V1TournamentDetail }) {
  const mapped = tournament.stagePlan!.stages.at(-1)!.pools.filter(pool => pool.overallRankStart !== undefined);
  if (!mapped.length) return null;
  return <section className="space-y-3"><SectionTitle title="최종 순위 구간" /><p className="tm-text-caption">대회에 설정된 본선 편성별 순위 구간이에요. 예선 승점은 합산하지 않아요.</p><ol className="space-y-2">{mapped.map(pool => {
    const progress = tournament.stageProgress?.find(row => row.poolKey === pool.key);
    const rows = tournament.groups.filter(group => group.poolKey === pool.key).flatMap(group => group.standings).sort((a, b) => a.position - b.position);
    return <li key={pool.key} className="tm-text-label">{pool.name} · {pool.overallRankStart}~{pool.overallRankStart! + (pool.format === 'league' ? pool.capacity : pool.thirdPlace ? 4 : 2) - 1}위{pool.format === 'league' && progress?.complete && !progress.stale ? <ol>{rows.map(row => <li key={row.registrationId}>{pool.overallRankStart! + (row.sharedRank ?? row.position) - 1}위 · {row.teamName}{row.sharedRank ? ' · 공동 순위' : ''}</li>)}</ol> : <span> · 편성 결과에서 확인해 주세요.</span>}</li>;
  })}</ol></section>;
}
