'use client';

import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/v1-ui/button';
import { leagueAddableGroups, leagueRoundPlan } from '@/lib/bracket-league-add-fixture';
import type { V1AdminTournamentBracket } from '@/types/api';

export type LeagueAddSubmit = { groupId: string; groupName: string; round: string; roundName: string };

export type BracketLeagueAddFixtureFormProps = {
  bracket: V1AdminTournamentBracket;
  pending: boolean;
  onSubmit: (input: LeagueAddSubmit) => void;
};

const SELECT_CLASS = 'tm-input';

export function BracketLeagueAddFixtureForm({ bracket, pending, onSubmit }: BracketLeagueAddFixtureFormProps) {
  const idPrefix = useId();
  const groups = useMemo(() => leagueAddableGroups(bracket.groups), [bracket.groups]);
  const plan = useMemo(() => leagueRoundPlan({ groups: bracket.groups, fixtures: bracket.fixtures }), [bracket.groups, bracket.fixtures]);
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const [roundValue, setRoundValue] = useState(plan.defaultChoice.value);

  const group = groups.find((candidate) => candidate.id === groupId) ?? groups[0] ?? null;
  // 대진이 새로고침되어 고른 라운드가 사라졌으면 화면에서 기본 선택으로 되돌려 보여 준다.
  const choice = plan.choices.find((candidate) => candidate.value === roundValue) ?? plan.defaultChoice;

  const handleSubmit = () => {
    if (group === null || pending) return;
    onSubmit({ groupId: group.id, groupName: group.name, round: choice.round, roundName: choice.name });
  };

  return (
    <div className="flex flex-col gap-4 px-5 py-5">
      {group === null ? (
        <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
          조별 리그 조가 없어 경기를 추가할 수 없어요. 조 설정을 확인하거나 대진을 템플릿으로 다시 만들어 주세요.
        </p>
      ) : (
        <>
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
            고른 조와 라운드에 대진 미정 경기를 하나 만들어요. 팀은 만든 뒤 칸에서 넣고, 결과가 확정되면 순위표에 바로 반영돼요.
          </p>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${idPrefix}-group`} className="tm-text-label font-semibold" style={{ color: 'var(--text-strong)' }}>조</label>
            <select id={`${idPrefix}-group`} className={SELECT_CLASS} style={{ minHeight: 44 }} value={group.id} onChange={(event) => setGroupId(event.target.value)}>
              {groups.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${idPrefix}-round`} className="tm-text-label font-semibold" style={{ color: 'var(--text-strong)' }}>라운드</label>
            <select id={`${idPrefix}-round`} className={SELECT_CLASS} style={{ minHeight: 44 }} value={choice.value} onChange={(event) => setRoundValue(event.target.value)}>
              {plan.choices.map((candidate) => (
                <option key={candidate.value} value={candidate.value}>{candidate.label}</option>
              ))}
            </select>
          </div>
        </>
      )}
      <Button variant="primary" size="md" disabled={group === null || pending} loading={pending} onClick={handleSubmit}>
        경기 추가
      </Button>
    </div>
  );
}
