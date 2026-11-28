'use client';

import { useV1UpdateFixture } from '@/hooks/use-v1-api';
import { useV1AssignTournamentSlot } from '@/hooks/use-v1-bracket-canvas';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import { TEAM_IN_OTHER_GROUP_MESSAGE, finalStageConflictMessage, registrationIdsBlockedForGroup } from '@/lib/bracket-group-enrollment';
import type { SideKey } from '@/lib/bracket-canvas-layout';
import type { V1AdminTournamentBracket } from '@/types/api';

/** 팀을 자리(슬롯)나 경기에 넣는 두 경로 — 한 팀 한 조·결선 충돌을 요청 전에 막는다. 성공하면 `onPlaced`. */
export function useTeamPlacement(
  tournamentId: string,
  bracket: V1AdminTournamentBracket,
  showToast: (message: string, variant?: 'success' | 'error') => void,
  onPlaced?: () => void,
) {
  const assignSlot = useV1AssignTournamentSlot(tournamentId, 'tournament');
  const updateFixture = useV1UpdateFixture(tournamentId);
  const options = {
    onSuccess: () => {
      onPlaced?.();
      showToast('팀을 넣었어요.', 'success');
    },
    onError: (err: unknown) => showToast(describeBracketCanvasError(err, '팀을 넣지 못했어요.'), 'error'),
  };

  const placeIntoSlot = (slotId: string, registrationId: string) => {
    const slotGroupId = bracket.slots.find((slot) => slot.id === slotId)?.groupId ?? null;
    if (registrationIdsBlockedForGroup(bracket.groups, slotGroupId).has(registrationId)) {
      showToast(TEAM_IN_OTHER_GROUP_MESSAGE, 'error');
      return;
    }
    assignSlot.mutate({ slotId, registrationId }, options);
  };

  const placeDirect = (fixtureId: string, side: SideKey, registrationId: string) => {
    const target = bracket.fixtures.find((fixture) => fixture.id === fixtureId);
    if (registrationIdsBlockedForGroup(bracket.groups, target?.groupId ?? null).has(registrationId)) {
      showToast(TEAM_IN_OTHER_GROUP_MESSAGE, 'error');
      return;
    }
    const finalStageConflict = finalStageConflictMessage(bracket.groups, bracket.fixtures, target, registrationId);
    if (finalStageConflict !== null) {
      showToast(finalStageConflict, 'error');
      return;
    }
    updateFixture.mutate({ fixtureId, ...(side === 'HOME' ? { homeRegistrationId: registrationId } : { awayRegistrationId: registrationId }) }, options);
  };

  return { placeIntoSlot, placeDirect, pending: assignSlot.isPending || updateFixture.isPending };
}
