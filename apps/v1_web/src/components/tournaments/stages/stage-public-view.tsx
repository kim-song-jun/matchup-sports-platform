'use client';
import Link from 'next/link';
import { useState } from 'react';
import { SectionTitle } from '@/components/v1-ui/primitives';
import { TournamentBracket } from '@/components/tournaments/tournament-bracket';
import { TournamentStandingsTable, type TournamentStandingsRow } from '@/components/tournaments/tournament-standings-table';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import type { V1TournamentDetail } from '@/types/api';
export function StagePublicView({ tournament }: { tournament: V1TournamentDetail }) {
  const [key, setKey] = useState('');
  const plan = tournament.stagePlan;
  if (!plan) return null;
  const selected = plan.stages.find(s => s.key === key) ?? plan.stages[0];
  return <div className="space-y-6">
    <label className="block tm-text-label">진행 단계<select className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3" value={selected.key} onChange={e => setKey(e.target.value)}>{plan.stages.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}</select></label>
    <p className="tm-text-caption text-[var(--text-muted)]">각 편성의 순위를 따로 계산해요. 서로 다른 단계·리그의 승점을 합쳐 전체 순위로 표시하지 않아요.</p>
    {!tournament.groups.length && <p className="tm-text-label">대진 공개를 기다리고 있어요.</p>}
    {selected.pools.map(pool => {
      const groups = tournament.groups.filter(g => g.poolKey === pool.key), groupIds = new Set(groups.map(g => g.id));
      const fixtures = tournament.fixtures.filter(f => f.groupId && groupIds.has(f.groupId));
      const group = groups.find(g => g.phase === 'group');
      const rows: TournamentStandingsRow[] = group?.standings.map(s => ({ key: s.registrationId, teamId: s.teamId, teamName: s.teamName, teamLogoUrl: s.teamLogoUrl, position: s.position ?? 0, sharedRank: s.sharedRank ?? null, points: s.points, wins: s.wins, draws: s.draws, losses: s.losses, goalsFor: s.goalsFor, goalsAgainst: s.goalsAgainst })) ?? [];
      const known = new Set(rows.map(r => r.key));
      group?.groupTeams.forEach(t => { if (t.registrationId && !known.has(t.registrationId)) rows.push({ key: t.registrationId, teamId: t.teamId, teamName: t.teamName, teamLogoUrl: t.teamLogoUrl, position: rows.length + 1, sharedRank: null, points: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 }); });
      return <section key={pool.key} className="space-y-4">
        <SectionTitle title={`${pool.name} · ${pool.format === 'league' ? '풀리그' : '토너먼트'}`} />
        <p className="tm-text-caption">{pool.capacity}팀{pool.format === 'league' ? ` · ${pool.legs}회전` : ''}{pool.sources.length ? ` · 진출 출처: ${pool.sources.map(source => `${plan.stages.flatMap(s => s.pools).find(p => p.key === source.poolKey)?.name ?? '이전 편성'} ${source.rank}위`).join(', ')}` : ''}</p>
        {pool.format === 'league' && group && <TournamentStandingsTable advancingKeys={null} rows={rows} ariaLabel={`${selected.name} ${pool.name} 순위표`} />}
        {pool.format === 'knockout' && fixtures.length > 0 && <TournamentBracket fixtures={fixtures} groups={groups} />}
        <ul className="divide-y divide-[var(--border)]">{fixtures.map(f => <li key={f.id}><Link className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-3 tm-text-label" href={`/tournaments/${encodeURIComponent(tournament.id)}/matches/${encodeURIComponent(f.id)}`}><span>{f.fixtureNumber}경기 · {f.homeTeamName} vs {f.awayTeamName}</span><span className="tm-text-caption">{f.result ? `${f.result.homeScore} : ${f.result.awayScore}` : f.scheduledAt ? formatTournamentDateTimeShort(f.scheduledAt) : '일정 미정'}</span></Link></li>)}</ul>
      </section>;
    })}
  </div>;
}
