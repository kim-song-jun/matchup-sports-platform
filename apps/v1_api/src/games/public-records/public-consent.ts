import type { PrismaService } from '../../prisma/prisma.service';

/**
 * 사용자 단위 공개 기록 동의 (2026-08-13, 사용자 결정으로 Task 24 규칙 재정의).
 *
 * ## 옛 규칙(Task 24)이 왜 바뀌었나
 * `GET /users/:id/records`가 alpha 실사용자 47명 전원에게 항상 0건이었다 --
 * `V1ParticipantIdentityLinkCurrent`(참가자→계정 연결) 행을 만드는 제품 경로 자체가
 * 없었기 때문이다(기존 5개 연결 API는 '선수 본인 요청 → 제3자 승인' 2자 방식이고
 * 프론트 호출부가 0건이었다). 이 worktree가 그 공백을 메운다: 라인업 저장 시
 * 매니저가 로스터에 지정한 계정으로 연결을 자동 생성한다(`games.service.ts`
 * `saveLineup`, action `ROSTER_ASSERTED`). 연결이 비로소 자동으로 생기게 되면서,
 * 공개 동의도 옛 규칙("참가자 스냅샷 단위 + 시간 비교")이 아니라 **사용자 단위 1회
 * 동의**로 단순화한다 -- 동의하면 과거 경기까지 전부 공개 후보가 된다(사용자
 * 명시 결정: "모두 그냥 다 보이게").
 *
 * ## 새 규칙
 * eligible =
 *   1) 이 participant 에 현재 신원 연결(`V1ParticipantIdentityLinkCurrent`)이
 *      있고,
 *   2) 그 연결의 `userId`에 대한 `V1UserRecordConsent.state`가 `GRANTED`이며,
 *   3) 그 participant 의 최신 `V1ParticipantConsentSnapshot`이(있다면)
 *      `REVOKED`가 **아닐 것** -- 사용자 단위로는 동의했더라도 이 특정 참가
 *      기록 하나만 숨기고 싶을 때 쓰는 개별 override. 스냅샷이 아예 없으면
 *      "숨기지 않음"이 기본값이라 조건을 통과한다.
 *
 * **시간 비교(예전의 "effectiveAt <= factOfficialAt", "no pre-T2 backfill")는
 * 완전히 제거됐다.** 동의가 유효한 시점의 사실관계와 무관하게, 사용자가 GRANTED
 * 상태이기만 하면 그 사용자에 연결된 모든 과거 경기가 즉시 공개 후보가 된다.
 * `isParticipantPubliclyEligible`은 그래서 시간 인자를 받지 않는다 -- 호출부가
 * `officialAt`/`identityAsOf` 같은 사실 시각을 이 판정에 넘길 이유 자체가 없다.
 */
export type PublicConsentState = 'GRANTED' | 'REVOKED';

export interface ParticipantConsentEligibility {
  readonly participantId: string;
  /** 이 participant 가 현재 연결된 사용자, 연결이 없으면 null. */
  readonly linkedUserId: string | null;
  /** `linkedUserId`에 대한 `V1UserRecordConsent.state`. 연결이 있어도 사용자
   *  단위 동의 행 자체가 없으면 null(=아직 동의한 적 없음, GRANTED와 다름). */
  readonly userConsentState: PublicConsentState | null;
  /** 이 participant의 최신 `V1ParticipantConsentSnapshot.state`. 스냅샷이
   *  하나도 없으면 null(=개별 숨김 override 없음, REVOKED와 다름). */
  readonly latestParticipantSnapshotState: PublicConsentState | null;
}

/**
 * 순수 판정: 이 participant의 신원이 공개 개인 프로젝션(경력 기록, 라인업 실명
 * 슬롯, 이벤트/MVP 실명 귀속)에 노출돼도 되는가.
 */
export function isParticipantPubliclyEligible(row: ParticipantConsentEligibility): boolean {
  if (row.linkedUserId === null) return false;
  if (row.userConsentState !== 'GRANTED') return false;
  if (row.latestParticipantSnapshotState === 'REVOKED') return false;
  return true;
}

/**
 * 주어진 `V1GameParticipant` id 집합에 대해 현재-연결 + 사용자 단위 동의 +
 * participant 단위 최신 스냅샷 상태를 배치로 읽어 온다. 반환 Map에 없는 키는
 * "연결 자체가 없음"(미연동 게스트)을 뜻하며, 호출부는 이를 항상 non-eligible로
 * 취급해야 한다.
 */
export async function loadParticipantConsentEligibility(
  prisma: PrismaService,
  participantIds: readonly string[],
): Promise<Map<string, ParticipantConsentEligibility>> {
  const result = new Map<string, ParticipantConsentEligibility>();
  const uniqueIds = Array.from(new Set(participantIds));
  if (uniqueIds.length === 0) return result;

  const links = await prisma.v1ParticipantIdentityLinkCurrent.findMany({
    where: { participantId: { in: uniqueIds } },
    select: { participantId: true, linkId: true, userId: true },
  });
  if (links.length === 0) return result;

  const userIds = Array.from(new Set(links.map((link) => link.userId)));
  const userConsents = await prisma.v1UserRecordConsent.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, state: true },
  });
  const userConsentByUserId = new Map(userConsents.map((consent) => [consent.userId, consent.state] as const));

  const linkIds = links.map((link) => link.linkId);
  // consentVersion desc 로 정렬해서 아래 루프에서 linkId 당 처음 보는 스냅샷이
  // 곧 최신 스냅샷이 되게 한다 -- 별도 groupBy/aggregate 없이.
  const snapshots = await prisma.v1ParticipantConsentSnapshot.findMany({
    where: { linkId: { in: linkIds } },
    orderBy: { consentVersion: 'desc' },
    select: { linkId: true, state: true },
  });
  const latestSnapshotByLinkId = new Map<string, PublicConsentState>();
  for (const snapshot of snapshots) {
    if (!latestSnapshotByLinkId.has(snapshot.linkId)) {
      latestSnapshotByLinkId.set(snapshot.linkId, snapshot.state);
    }
  }

  for (const link of links) {
    result.set(link.participantId, {
      participantId: link.participantId,
      linkedUserId: link.userId,
      userConsentState: userConsentByUserId.get(link.userId) ?? null,
      latestParticipantSnapshotState: latestSnapshotByLinkId.get(link.linkId) ?? null,
    });
  }
  return result;
}
