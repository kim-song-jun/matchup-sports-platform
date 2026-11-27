import {
  classifyFixtureSide,
  isFixtureLocked,
  isSlotAssignable,
  type SideKey,
} from '@/lib/bracket-canvas-layout';
import { finalStageConflictMessage, registrationIdsBlockedForGroup } from '@/lib/bracket-group-enrollment';
import { placedRegistrationIdsForSlot } from '@/lib/bracket-slot-candidates';
import type { V1AdminBracketFixture, V1AdminBracketGroup, V1AdminBracketSlot } from '@/types/api';
import { fixtureTitle } from './bracket-canvas';

export interface TeamFillTarget {
  key: string;
  /** 예: 'A조 · 조별리그 1라운드 1번 경기 · 홈' */
  label: string;
  fixtureId: string;
  side: SideKey;
  /** 자리(슬롯)에 넣는 칸이면 그 자리, 경기에 직접 넣는 칸이면 null. */
  slotId: string | null;
}

const SIDE_NAME: Record<SideKey, string> = { HOME: '홈', AWAY: '원정' };

/** 한 팀을 넣을 수 있는 빈 칸 — 시작된 경기·단계 관리 경기·한 팀 한 조·결선 충돌 규칙을 데스크톱 배정과 똑같이 지킨다. */
export function teamFillTargets(input: {
  fixtures: readonly V1AdminBracketFixture[];
  slots: readonly V1AdminBracketSlot[];
  groups: readonly V1AdminBracketGroup[];
  registrationId: string;
}): TeamFillTarget[] {
  const { fixtures, slots, groups, registrationId } = input;
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));
  // 같은 자리를 쓰는 경기 중 하나라도 시작됐으면 그 자리는 잠긴다(서버 SLOT_LOCKED 와 같은 기준).
  const lockedSlotIds = new Set(fixtures.filter(isFixtureLocked).flatMap((fixture) => [fixture.homeSlotId, fixture.awaySlotId].filter((id): id is string => id !== null)));
  const managedGroupIds = new Set(groups.filter((group) => group.bracketTrack && !['overall', 'upper', 'lower'].includes(group.bracketTrack)).map((group) => group.id));
  const seenSlotIds = new Set<string>();
  const targets: TeamFillTarget[] = [];

  for (const fixture of [...fixtures].sort((a, b) => a.fixtureNumber - b.fixtureNumber || a.legNumber - b.legNumber)) {
    if (isFixtureLocked(fixture) || fixture.status === 'cancelled' || (fixture.groupId !== null && managedGroupIds.has(fixture.groupId))) continue;
    for (const side of ['HOME', 'AWAY'] as const) {
      const kind = classifyFixtureSide(fixture, side, slotsById);
      const label = `${fixtureTitle(fixture, groups)} · ${SIDE_NAME[side]}`;
      if (kind === 'slot') {
        const slot = slotsById.get((side === 'HOME' ? fixture.homeSlotId : fixture.awaySlotId) ?? '');
        if (slot === undefined || !isSlotAssignable(slot) || slot.registrationId !== null || lockedSlotIds.has(slot.id) || seenSlotIds.has(slot.id)) continue;
        if (registrationIdsBlockedForGroup(groups, slot.groupId).has(registrationId) || placedRegistrationIdsForSlot(slots, slot, groups).has(registrationId)) continue;
        seenSlotIds.add(slot.id);
        targets.push({ key: `slot:${slot.id}`, label, fixtureId: fixture.id, side, slotId: slot.id });
      } else if (kind === 'direct') {
        const current = side === 'HOME' ? fixture.homeRegistrationId : fixture.awayRegistrationId;
        if (current !== null || fixture.homeRegistrationId === registrationId || fixture.awayRegistrationId === registrationId) continue;
        if (registrationIdsBlockedForGroup(groups, fixture.groupId).has(registrationId)) continue;
        if (finalStageConflictMessage(groups, fixtures, fixture, registrationId) !== null) continue;
        targets.push({ key: `direct:${fixture.id}:${side}`, label, fixtureId: fixture.id, side, slotId: null });
      }
    }
  }
  return targets;
}
