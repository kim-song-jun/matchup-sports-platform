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
 *
 * ## 예외: 집계 카운트(활동 요약)는 이 게이트 밖이다
 * `ProfileService.countTournamentAppearances()`(`GET /me/activity-summary`,
 * `GET /users/:id/public-profile`이 쓴다)는 이 동의 판정을 **의도적으로 조회하지
 * 않는다** -- 새는 정보가 "개별 경기 실명/상세"가 아니라 "몇 번 뛰었는지" 총계
 * 숫자 하나뿐이라 여기 게이트와 노출 수준이 다르다고 판단했기 때문이다(사용자
 * 결정). 그래서 `GET /users/:id/records`(이 파일의 규칙 적용, 동의 안 하면
 * items 0건)와 `GET /users/:id/public-profile`(이 게이트 미적용, 대회 출전
 * 횟수가 activitySummary에 그대로 합산됨)은 같은 참가 사실에 대해 서로 다른
 * 노출 기준을 갖는다 -- 의도된 것이지 버그가 아니다.
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
 * 순수 판정: **본인 조회 기준**으로 이 participant 가 노출 대상인가.
 *
 * `isParticipantPubliclyEligible`과 딱 한 가지만 다르다 -- 사용자 단위 동의
 * (`userConsentState`)를 보지 않는다. 본인은 아직 동의를 켜지 않았어도 자기
 * 기록을 볼 수 있어야 하고, 반대로 "이 경기 하나만 숨기겠다"고 명시적으로 끈
 * participant 단위 REVOKED 는 본인 화면에서도 그대로 존중하기 때문이다.
 *
 * 이 함수가 참인 행의 개수가 곧 **"지금 동의를 켜면 공개될 경기 수"**다
 * (`countOwnerVisibleParticipations`). 동의 유도 UI 가 "N경기가 공개돼요"라고
 * 말할 수 있는 근거이자, 켜도 아무 효과가 없는 사용자(연결·공식확정 미완)에게
 * 헛된 유도를 하지 않기 위한 게이트다.
 */
export function isParticipantOwnerVisible(row: ParticipantConsentEligibility): boolean {
  if (row.linkedUserId === null) return false;
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

/**
 * "지금 사용자 단위 동의를 켜면 공개 프로필에 나타날 경기 수"를 센다.
 *
 * 판정 조건은 `PublicUserRecordsService.loadEligibleRows`의 `viewerIsOwner`
 * 분기와 **정확히 같아야 한다** -- 둘이 어긋나면 "N경기가 공개돼요"라고 안내한 뒤
 * 실제로는 다른 수가 보이는 거짓 안내가 된다. 그래서 조건 판정을 그쪽에 복제하지
 * 않고 위 `isParticipantOwnerVisible` 하나를 양쪽이 공유한다.
 *
 * 세는 단위는 `V1GameResultParticipant` 행(= 경기별 출전 기록) 이고,
 * `GET /users/:id/records`의 items 와 같은 모집단이다.
 */
export async function countOwnerVisibleParticipations(
  prisma: PrismaService,
  userId: string,
): Promise<number> {
  const links = await prisma.v1ParticipantIdentityLinkCurrent.findMany({
    where: { userId },
    select: { participantId: true },
  });
  if (links.length === 0) return 0;
  const participantIds = links.map((link) => link.participantId);

  const eligibility = await loadParticipantConsentEligibility(prisma, participantIds);

  const rows = await prisma.v1GameResultParticipant.findMany({
    where: { participantId: { in: participantIds } },
    select: {
      participantId: true,
      resultRevisionId: true,
      resultRevision: {
        select: {
          id: true,
          officialAt: true,
          game: { select: { currentOfficialRevisionId: true } },
        },
      },
    },
  });

  let count = 0;
  for (const row of rows) {
    const revision = row.resultRevision;
    // 공식 확정 전이거나, 이미 다른 리비전으로 대체된 옛 결과는 세지 않는다.
    if (revision.officialAt === null) continue;
    if (revision.game.currentOfficialRevisionId !== revision.id) continue;
    const consent = eligibility.get(row.participantId);
    if (consent === undefined) continue;
    if (!isParticipantOwnerVisible(consent)) continue;
    count += 1;
  }
  return count;
}

/** 공개 프로필의 "최근 활동" 한 줄. 없으면 null. */
export interface LatestPublicParticipation {
  readonly position: string | null;
  readonly jerseyNumber: number | null;
  readonly teamName: string;
  readonly playedAt: Date;
}

/**
 * 공개 프로필에 보여줄 **가장 최근 공개 가능 출전** 한 건.
 *
 * 판정을 새로 쓰지 않고 `isParticipantPubliclyEligible` 을 그대로 쓴다 -- 이 값이
 * `GET /users/:id/records` 의 첫 행과 어긋나면 같은 프로필 안에서 "최근 경기"와
 * "기록 목록 맨 위"가 다른 경기를 가리키게 된다.
 *
 * **새로 공개되는 정보가 아니다.** 포지션·등번호·팀명은 동의가 켜져 있으면 이미 기록
 * 목록에 그대로 나오는 값이고, 여기서도 같은 게이트를 통과한 것만 쓴다 -- 요약을 한 줄
 * 앞으로 당길 뿐이다.
 */
export async function findLatestPublicParticipation(
  prisma: PrismaService,
  userId: string,
): Promise<LatestPublicParticipation | null> {
  const links = await prisma.v1ParticipantIdentityLinkCurrent.findMany({
    where: { userId },
    select: { participantId: true },
  });
  if (links.length === 0) return null;
  const participantIds = links.map((link) => link.participantId);

  const eligibility = await loadParticipantConsentEligibility(prisma, participantIds);
  const publiclyVisible = participantIds.filter((participantId) => {
    const row = eligibility.get(participantId);
    return row !== undefined && isParticipantPubliclyEligible(row);
  });
  if (publiclyVisible.length === 0) return null;

  const rows = await prisma.v1GameResultParticipant.findMany({
    where: { participantId: { in: publiclyVisible } },
    select: {
      participantId: true,
      resultRevision: {
        select: {
          id: true,
          officialAt: true,
          game: { select: { currentOfficialRevisionId: true } },
        },
      },
    },
  });
  // 공식 확정 + 현재 리비전만. 대체된 옛 결과를 최근 활동으로 내세우면 이미 정정된
  // 경기를 프로필 맨 앞에 박아두는 셈이 된다.
  const eligible = rows.filter(
    (row) =>
      row.resultRevision.officialAt !== null &&
      row.resultRevision.game.currentOfficialRevisionId === row.resultRevision.id,
  );
  if (eligible.length === 0) return null;

  let latest = eligible[0];
  for (const row of eligible) {
    if ((row.resultRevision.officialAt as Date) > (latest.resultRevision.officialAt as Date)) {
      latest = row;
    }
  }

  const participant = await prisma.v1GameParticipant.findUnique({
    where: { id: latest.participantId },
    select: { position: true, jerseyNumber: true, sideId: true },
  });
  if (participant === null) return null;
  // V1GameParticipant 에는 side 관계가 없고 sideId 만 있어 한 번 더 조회한다.
  const side = await prisma.v1GameSide.findUnique({
    where: { id: participant.sideId },
    select: { displayNameSnapshot: true },
  });
  if (side === null) return null;
  return {
    position: participant.position,
    jerseyNumber: participant.jerseyNumber,
    teamName: side.displayNameSnapshot,
    playedAt: latest.resultRevision.officialAt as Date,
  };
}
