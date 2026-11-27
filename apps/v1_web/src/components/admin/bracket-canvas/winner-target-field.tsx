'use client';

import { useId } from 'react';
import { useV1SetBracketSources } from '@/hooks/use-v1-bracket-canvas';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import { isFixtureLinkable } from '@/lib/bracket-fixture-tools';
import type { V1AdminBracketFixture, V1AdminBracketGroup } from '@/types/api';
import { fixtureTitle } from './bracket-canvas';
import { planWinnerTargetLink, winnerTargetOptions, type LinkOutcome } from './winner-target-link';

const FIELD_LABEL: Record<LinkOutcome, string> = { WINNER: '이긴 팀이 갈 경기', LOSER: '진 팀이 갈 경기' };

export function WinnerTargetField({ tournamentId, fixture, groups, fixtures, canWrite, showToast }: {
  tournamentId: string;
  fixture: V1AdminBracketFixture;
  groups: readonly V1AdminBracketGroup[];
  fixtures: readonly V1AdminBracketFixture[];
  canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
}) {
  const id = useId();
  const setSources = useV1SetBracketSources(tournamentId);
  const titleOf = (target: V1AdminBracketFixture) => fixtureTitle(target, groups);
  const fields = (['WINNER', 'LOSER'] as const)
    .map(outcome => ({ outcome, ...winnerTargetOptions({ source: fixture, outcome, groups, fixtures, titleOf }) }))
    .filter(field => field.options.length > 0 || field.current !== '');
  if (fields.length === 0) return null;
  const locked = !canWrite || !isFixtureLinkable(fixture) || setSources.isPending;

  const change = async (outcome: LinkOutcome, nextValue: string) => {
    const steps = planWinnerTargetLink({ source: fixture, outcome, fixtures, nextValue });
    const label = FIELD_LABEL[outcome];
    let saved = 0;
    try {
      for (const step of steps) {
        await setSources.mutateAsync(step);
        saved += 1;
      }
      if (steps.length > 0) showToast(`${label}를 저장했어요.`, 'success');
    } catch (err) {
      const reason = describeBracketCanvasError(err, `${label}를 저장하지 못했어요.`);
      showToast(saved > 0 ? `${label}를 모두 바꾸지 못했어요. 앞선 변경은 저장됐어요: ${reason}` : reason, 'error');
    }
  };

  return <div className="flex flex-col gap-3">
    {fields.map(field => <div key={field.outcome} className="flex flex-col gap-1">
      <label htmlFor={`${id}-${field.outcome}`} className="tm-text-label">{FIELD_LABEL[field.outcome]}</label>
      <select id={`${id}-${field.outcome}`} className="tm-input" style={{ minHeight: 44 }} value={field.current} disabled={locked}
        onChange={event => void change(field.outcome, event.target.value)}>
        <option value="">연결 없음</option>
        {field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>)}
  </div>;
}
