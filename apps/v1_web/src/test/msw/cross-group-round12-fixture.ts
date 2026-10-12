import type { CrossGroupPreview } from '@/types/cross-group-round12';

/** 합성 5조·20팀. 실제 alpha 대회의 ID/결과를 포함하지 않는 테스트 전용 데이터. */
export function createCrossGroupRound12Fixture(): CrossGroupPreview {
  const preview: CrossGroupPreview = { version: 'a'.repeat(64), teams: [], ranks: [], targets: [] };
  for (let group = 0; group < 5; group++) for (let rank = 1; rank <= 4; rank++) {
    const registrationId = `a0000000-0000-4000-8000-${String(group * 4 + rank).padStart(12, '0')}`;
    preview.teams.push({ registrationId, teamName: `${String.fromCharCode(65 + group)}팀${rank}`,
      groupId: `group-${group}`, groupName: `${String.fromCharCode(65 + group)}조`,
      points: 12 - rank * 3, goalsFor: 20 - rank * 3 - group, goalsAgainst: group });
    if (rank <= 3) preview.ranks.push({ groupId: `group-${group}`, groupName: `${String.fromCharCode(65 + group)}조`, rank, candidates: [registrationId] });
  }
  for (let seed = 1; seed <= 12; seed++) preview.targets.push({ seed, label: `${seed}번 시드${seed <= 4 ? ' · 부전승' : ' · 12강'}`,
    fixtureId: `fixture-${seed}`, side: 'HOME', slotId: `slot-${seed}`, currentRegistrationId: null,
    byePosition: seed <= 4 ? seed : null, groupId: 'round12' });
  return preview;
}
