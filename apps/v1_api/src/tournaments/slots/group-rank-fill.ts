import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { GroupRankPreview } from './load-group-rank-preview';

export type FillOverride = { slotId: string; registrationId: string };
export type FillPlan = {
  assignments: Array<{ slotId: string; registrationId: string }>;
  writes: Array<{ slotId: string; from: string | null; to: string }>;
  skipped: Array<{ slotId: string; reason: 'tied' | 'group_incomplete' }>;
};

const invalidOverride = (message: string) =>
  new UnprocessableEntityException({ code: 'SLOT_REGISTRATION_INVALID', message });

export function planFillFromStandings(preview: GroupRankPreview, overrides: readonly FillOverride[]): FillPlan {
  const rowBySlot = new Map(preview.rows.map((row) => [row.slotId, row]));
  const overrideBySlot = new Map<string, string>();
  for (const override of overrides) {
    const row = rowBySlot.get(override.slotId);
    if (row === undefined) {
      throw new NotFoundException({ code: 'SLOT_NOT_FOUND', message: '순위로 채우는 자리를 찾을 수 없어요.' });
    }
    if (overrideBySlot.has(override.slotId)) throw invalidOverride('같은 자리를 두 번 고를 수 없어요.');
    if (row.state === 'group_incomplete') {
      throw invalidOverride(`${row.label}은 조별 경기가 아직 끝나지 않아 팀을 고를 수 없어요.`);
    }
    const allowed =
      row.state === 'tied' ? new Set(row.tiedRegistrationIds) : preview.groupMembers.get(override.slotId);
    if (allowed === undefined || !allowed.has(override.registrationId)) {
      throw invalidOverride(`${row.label}에 넣을 수 없는 팀이에요.`);
    }
    overrideBySlot.set(override.slotId, override.registrationId);
  }

  const assignments: FillPlan['assignments'] = [];
  const skipped: FillPlan['skipped'] = [];
  for (const row of preview.rows) {
    const picked = overrideBySlot.get(row.slotId) ?? (row.state === 'ready' ? row.candidateRegistrationId : null);
    if (picked !== null) {
      assignments.push({ slotId: row.slotId, registrationId: picked });
    } else {
      skipped.push({ slotId: row.slotId, reason: row.state === 'tied' ? 'tied' : 'group_incomplete' });
    }
  }

  const placed = new Set<string>();
  for (const assignment of assignments) {
    if (placed.has(assignment.registrationId)) {
      throw new ConflictException({ code: 'SLOT_TEAM_ALREADY_PLACED', message: '같은 팀을 두 자리에 넣을 수 없어요.' });
    }
    placed.add(assignment.registrationId);
  }

  const writes = assignments.flatMap((assignment) => {
    const from = rowBySlot.get(assignment.slotId)!.currentRegistrationId;
    return from === assignment.registrationId ? [] : [{ slotId: assignment.slotId, from, to: assignment.registrationId }];
  });
  return { assignments, writes, skipped };
}
