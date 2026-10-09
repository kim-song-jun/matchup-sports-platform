import type { LeagueStandingsGroup } from '@/lib/bracket-league-standings-model';

const HEADERS = ['순위', '팀', '경기', '승', '무', '패', '득실', '승점'] as const;
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function BracketLeagueStandings({ groups }: { groups: LeagueStandingsGroup[] }) {
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <section
          key={group.groupId}
          aria-label={`${group.name} 순위`}
          className="overflow-hidden"
          style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-container)', background: 'var(--card-surface)' }}
        >
          <h3 className="tm-text-caption-strong px-3 pt-3">{group.name} 순위</h3>
          <table className="w-full table-fixed">
            <caption className="sr-only">{group.name} 순위표</caption>
            <thead>
              <tr style={{ color: 'var(--text-muted)' }}>
                {HEADERS.map((header, index) => (
                  <th key={header} scope="col" className={`tm-text-caption px-1 py-2 font-medium ${index === 1 ? 'text-left' : 'text-center'}`} style={{ width: index === 1 ? undefined : index === 0 ? 36 : 32 }}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => (
                <tr key={row.registrationId} className="border-t border-[var(--border)]">
                  <td className="tab-num tm-text-caption px-1 py-2 text-center">{row.rank}</td>
                  <td className="tm-text-label truncate px-1 py-2 font-semibold" title={row.teamName}>{row.teamName}</td>
                  {[row.played, row.wins, row.draws, row.losses].map((value, index) => (
                    <td key={index} className="tab-num tm-text-caption px-1 py-2 text-center">{value}</td>
                  ))}
                  <td className="tab-num tm-text-caption px-1 py-2 text-center">{signed(row.goalDifference)}</td>
                  <td className="tab-num tm-text-label px-1 py-2 text-center font-bold">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
