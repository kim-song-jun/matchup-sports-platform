// apps/v1_web/src/types/bracket-standings-fill.ts
export type V1SlotStandingState = 'ready' | 'tied' | 'group_incomplete';

export type V1SlotStandingsPreviewRow = {
  slotId: string;
  label: string;
  state: V1SlotStandingState;
  candidateRegistrationId: string | null;
  candidateTeamName: string | null;
  /** 동률(tied)일 때 그 구간의 팀 전부. 아니면 빈 배열. */
  tiedRegistrationIds: string[];
  currentRegistrationId: string | null;
};

export type V1SlotStandingsPreview = { slots: V1SlotStandingsPreviewRow[] };

export type V1FillSlotsFromStandingsInput = {
  overrides?: Array<{ slotId: string; registrationId: string }>;
};

export type V1FillSlotsFromStandingsResult = {
  assignments: Array<{ slotId: string; registrationId: string }>;
  skipped: Array<{ slotId: string; reason: 'tied' | 'group_incomplete' }>;
};
