'use client';

import { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useV1DataSource } from '@/components/providers/v1-data-source';
import { Button } from '@/components/v1-ui/button';
import { extractErrorMessage } from '@/lib/error-message';
import { v1Keys } from '@/lib/query-keys';
import type { V1AdminBracketFixture, V1AdminBracketGroup } from '@/types/api';

type Fixture = V1AdminBracketFixture;

function available(f: Fixture) {
  return f.game?.state === 'SCHEDULED' && !f.game.latestRevision && !f.game.hasLiveRecords && !f.result &&
    !['completed', 'archived', 'cancelled'].includes(f.status);
}

function assignment(f: Fixture) {
  return [f.homeRegistrationId, f.awayRegistrationId, f.homeSlotId, f.awaySlotId].join('|');
}

export function GroupFixtureTeamSwap({ tournamentId, groups, fixtures, teamNames, showToast }: {
  tournamentId: string; groups: V1AdminBracketGroup[]; fixtures: Fixture[]; teamNames: (fixture: Fixture) => string;
  showToast: (message: string, variant: 'success' | 'error') => void;
}) {
  const { v1Post } = useV1DataSource();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState<Fixture | null>(null);
  const [saving, setSaving] = useState(false);
  const eligibleGroups = groups.filter(g => g.phase === 'group' && fixtures.filter(f => f.groupId === g.id && available(f)).length >= 2);
  if (!eligibleGroups.length) return null;

  async function choose(second: Fixture) {
    if (!first) { setFirst(second); return; }
    if (first.id === second.id) { setFirst(null); return; }
    if (saving || first.groupId !== second.groupId) return;
    const preview = (target: Fixture, source: Fixture) =>
      target.fixtureNumber + '번 경기: ' + teamNames(target) + ' → ' + teamNames(source);
    if (!window.confirm(['두 경기의 팀 조합을 교환할까요?', preview(first, second), preview(second, first),
      '경기 번호, 시간, 구장은 유지돼요.'].join('\n'))) return;
    setSaving(true);
    try {
      await v1Post('/admin/tournaments/' + tournamentId + '/group-fixture-team-swap', {
        firstFixtureId: first.id, secondFixtureId: second.id,
        firstAssignment: assignment(first), secondAssignment: assignment(second),
      });
      showToast('두 경기의 팀 조합을 교환했어요.', 'success');
    } catch (error) {
      showToast(extractErrorMessage(error, '팀 조합을 교환하지 못했어요.'), 'error');
    } finally {
      setFirst(null);
      try {
        await Promise.all([v1Keys.adminTournamentBracket(tournamentId), v1Keys.tournament(tournamentId),
          v1Keys.adminTournament(tournamentId)].map(queryKey => client.invalidateQueries({ queryKey })));
      } finally { setSaving(false); }
    }
  }

  return <section>
    <Button variant={open ? 'primary' : 'outline'} aria-expanded={open} disabled={saving}
      onClick={() => { setOpen(!open); setFirst(null); }}>팀 조합 교환</Button>
    {open && <div className="mt-3 grid gap-3">
      <p role="status">{first ? '화살표를 눌러 팀 조합을 교환할 경기를 선택해 주세요.' : '팀 조합을 옮길 경기를 선택해 주세요.'}</p>
      {eligibleGroups.filter(group => !first || first.groupId === group.id).map(group =>
        <fieldset key={group.id} className="grid gap-2 sm:grid-cols-2">
          <legend className="tm-text-label">{group.name}</legend>
          {fixtures.filter(f => f.groupId === group.id && available(f)).map(f =>
            <button type="button" key={f.id} aria-pressed={first?.id === f.id} disabled={saving}
              className="tm-btn tm-btn-outline justify-between" onClick={() => void choose(f)}>
              <span>{f.fixtureNumber}번 경기 · {teamNames(f)}</span>
              {first && first.id !== f.id && <ArrowLeftRight size={16} aria-label="교환" />}
            </button>)}
        </fieldset>)}
    </div>}
  </section>;
}
