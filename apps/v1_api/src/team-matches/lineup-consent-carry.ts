import { Prisma, V1ConsentState } from '@prisma/client';

type Transaction = Prisma.TransactionClient;

export type CarriedConsent = { state: V1ConsentState; policyHash: string; actorUserId: string };

/**
 * 라인업을 새 리비전으로 다시 만들 때 본인이 꺼 둔 **참가자 단위 공개 제외(REVOKED)** 를 새
 * 참가자 행으로 옮기는 규칙. 팀장 재저장·정정 요청 복사·리그 명단 동기화가 같은 규칙을 쓴다 —
 * 한 경로에서만 끊기면 "이 경기만 숨기겠다"는 본인 결정이 조용히 다시 공개된다.
 */

/**
 * 주어진 연결들의 최신 참가자 단위 동의 스냅샷을 linkId 로 색인한다. 최신 선정(`consentVersion`
 * 내림차순 + linkId 당 첫 행)은 공개 자격 판정(`games/public-records/public-consent.ts`)과 같아야 한다.
 */
export async function latestConsentSnapshotByLinkId(
  tx: Transaction,
  linkIds: readonly string[],
): Promise<Map<string, CarriedConsent & { linkId: string }>> {
  const latest = new Map<string, CarriedConsent & { linkId: string }>();
  if (linkIds.length === 0) return latest;
  const snapshots = await tx.v1ParticipantConsentSnapshot.findMany({
    where: { linkId: { in: [...linkIds] } },
    orderBy: { consentVersion: 'desc' },
    select: { linkId: true, state: true, policyHash: true, actorUserId: true },
  });
  for (const snapshot of snapshots) {
    if (!latest.has(snapshot.linkId)) latest.set(snapshot.linkId, snapshot);
  }
  return latest;
}

/**
 * 직전 리비전의 REVOKED 를 **연결의 userId** 기준으로 모은다. 새 리비전은 명단을 다시 만들어
 * 옛 행과 1:1 로 대응하지 않고, 게스트 행을 본인이 신청으로 가져가면 `participant.userId` 는
 * null 인데 연결에는 사람이 있다. 같은 사람이 두 행이면 REVOKED 쪽이 남는다(노출을 줄이는 쪽).
 */
export async function loadRevokedConsentByUserId(
  tx: Transaction,
  previousLineupId: string | null,
): Promise<Map<string, CarriedConsent>> {
  const carried = new Map<string, CarriedConsent>();
  if (previousLineupId === null) return carried;
  const previousParticipants = await tx.v1GameParticipant.findMany({
    where: { lineupId: previousLineupId },
    select: { id: true },
  });
  if (previousParticipants.length === 0) return carried;
  const previousLinks = await tx.v1ParticipantIdentityLinkCurrent.findMany({
    where: { participantId: { in: previousParticipants.map((participant) => participant.id) } },
    select: { userId: true, linkId: true },
  });
  if (previousLinks.length === 0) return carried;
  const latestByLinkId = await latestConsentSnapshotByLinkId(
    tx,
    previousLinks.map((link) => link.linkId),
  );
  for (const link of previousLinks) {
    const snapshot = latestByLinkId.get(link.linkId);
    if (snapshot?.state !== V1ConsentState.REVOKED) continue;
    carried.set(link.userId, snapshot);
  }
  return carried;
}

/**
 * 방금 만든 참가자 행의 **새 연결 아래에** 승계 원본의 REVOKED 를 다시 적는다.
 *
 * 연결을 재사용할 수는 없다: `V1ParticipantIdentityLinkCurrent` 는 participantId 가 PK 이고 linkId 가
 * unique 라 옛 리비전 행이 살아 있는 동안 같은 linkId 를 줄 수 없고, 신원 이벤트의
 * `(linkId, action)` unique 도 두 번째 ROSTER_ASSERTED 를 거부한다.
 */
export async function carryRevokedConsent(
  tx: Transaction,
  participantId: string,
  sourceSnapshot: CarriedConsent | undefined,
): Promise<void> {
  // GRANTED 와 "스냅샷 없음"은 판정 결과가 같다. 없는 동의를 만들면 노출을 늘리는 날조가 된다.
  if (sourceSnapshot?.state !== V1ConsentState.REVOKED) return;
  // 호출 전에 연결이 반드시 만들어져 있다 — 없는데 조용히 넘어가면 숨김이 사라진다.
  const link = await tx.v1ParticipantIdentityLinkCurrent.findUniqueOrThrow({
    where: { participantId },
    select: { linkId: true },
  });
  await tx.v1ParticipantConsentSnapshot.create({
    data: {
      participantId,
      linkId: link.linkId,
      // 새 참가자 행이라 `@@unique([participantId, consentVersion])` 의 1 번이 항상 비어 있다.
      consentVersion: 1,
      state: V1ConsentState.REVOKED,
      // 숨김을 결정한 사람과 그때의 정책 해시를 물려받는다 — 실행한 사람의 이름으로 남기지 않는다.
      policyHash: sourceSnapshot.policyHash,
      actorUserId: sourceSnapshot.actorUserId,
    },
  });
}
