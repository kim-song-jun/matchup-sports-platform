import type { V1TournamentGroupPhase, V1TournamentSlotKind } from '@prisma/client';

export type TournamentSlotLabelInput = {
  kind: V1TournamentSlotKind;
  position: number;
  groupName: string | null;
  groupPhase: V1TournamentGroupPhase | null;
  sourceGroupName: string | null;
};

/**
 * 자리 라벨은 저장하지 않고 읽을 때 계산한다. 조별 그룹의 ENTRY 만 조 이름을 붙이는 이유: 결선 그룹 이름
 * ('8강' 등)은 "8강 3번" 처럼 읽혀 경기 번호와 헷갈리고, 정규 리그에는 그룹이 없다.
 */
export function tournamentSlotLabel(input: TournamentSlotLabelInput): string {
  switch (input.kind) {
    case 'BYE':
      return `부전승 ${input.position}`;
    case 'GROUP_RANK':
      return input.sourceGroupName === null ? `${input.position}위` : `${input.sourceGroupName} ${input.position}위`;
    case 'ENTRY':
      return input.groupPhase === 'group' && input.groupName !== null
        ? `${input.groupName} ${input.position}번`
        : `${input.position}번 자리`;
  }
}

/** Prisma select 조각 — 공개 상세·어드민 응답이 같은 모양으로 읽어 `slotLabelFromRow` 에 넘긴다. */
export const SLOT_LABEL_SELECT = {
  kind: true,
  position: true,
  group: { select: { name: true, phase: true } },
  sourceGroup: { select: { name: true } },
} as const;

export type SlotLabelRow = {
  kind: V1TournamentSlotKind;
  position: number;
  group: { name: string; phase: V1TournamentGroupPhase } | null;
  sourceGroup: { name: string } | null;
};

export function slotLabelFromRow(row: SlotLabelRow): string {
  return tournamentSlotLabel({
    kind: row.kind,
    position: row.position,
    groupName: row.group?.name ?? null,
    groupPhase: row.group?.phase ?? null,
    sourceGroupName: row.sourceGroup?.name ?? null,
  });
}
