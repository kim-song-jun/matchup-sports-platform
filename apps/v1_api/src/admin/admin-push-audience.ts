import type { Prisma } from '@prisma/client';

/**
 * 관리자 수동 푸시의 **수신 대상 계산 단일 소스**.
 *
 * 실제 발송(`AdminOpsService.sendManualPush`)과 확인창의 예상 인원(`previewPushAudience`)이 같은 `where` 를
 * 써야 "확인창에는 670명인데 실제로는 다른 수가 나가는" 일이 없다. 대상을 바꿀 때는 이 파일만 고친다.
 */
export const PUSH_AUDIENCE_GENDERS = ['male', 'female'] as const;
export type PushAudienceGender = (typeof PUSH_AUDIENCE_GENDERS)[number];

/** 발송 대상 종류 — `user` 는 한 명, 나머지는 여러 명에게 나가는 대량 발송이다. */
export type PushSendTarget = 'user' | 'broadcast' | 'competition';

/**
 * 성별 조건. 성별을 고르면 그 성별의 회원 **그리고 성별을 입력하지 않은 회원**이 받는다.
 * 성별을 모르는 사람을 어느 쪽에서도 빼면 공지를 아예 못 받는 사람이 생기므로(운영 회원의 약 7%),
 * 남성 발송과 여성 발송 모두에 포함한다(사용자 확정, 2026-11-25).
 * 성별이 없다는 것은 프로필이 없거나, 값이 비었거나, `male`·`female` 이 아닌 경우다.
 */
export function pushAudienceGenderWhere(gender?: PushAudienceGender): Prisma.V1UserWhereInput {
  if (!gender) return {};
  // "male·female 이 아니다" 를 `NOT (gender IN (...))` 으로 쓰면 안 된다 — SQL 은 NULL 을 모르는 값으로 다뤄
  // `NOT (NULL IN ...)` 이 참이 아니라 NULL 이 되고, 프로필은 있으나 성별 칸이 NULL 인 회원이 통째로 빠진다
  // (실제 DB 로 돌려서 발견). NULL·프로필 없음을 따로 명시한다.
  return {
    OR: [
      { profile: { is: { gender } } },
      { profile: { is: null } },
      { profile: { is: { gender: null } } },
      { profile: { is: { gender: { notIn: [...PUSH_AUDIENCE_GENDERS] } } } },
    ],
  };
}

/** 대회·리그 참가팀의 활성 팀원 — 참가 **확정**(confirmed) 신청이 있는 팀만 센다. 대회와 리그는 같은 신청 테이블을 쓴다. */
export function competitionMembersWhere(competitionId: string): Prisma.V1UserWhereInput {
  return {
    teamMemberships: {
      some: {
        status: 'active',
        team: {
          deletedAt: null,
          tournamentRegistrations: { some: { tournamentId: competitionId, status: 'confirmed' } },
        },
      },
    },
  };
}

export type PushAudienceInput = {
  target: Exclude<PushSendTarget, 'user'>;
  competitionId?: string;
  gender?: PushAudienceGender;
};

/** 대량 발송의 수신 후보 — 활성 계정 + (대회·리그면) 참가팀 팀원 + (성별을 골랐으면) 성별 조건. 공지 알림을 끈 회원은 발송 단계에서 건너뛴다. */
export function buildPushAudienceWhere(input: PushAudienceInput): Prisma.V1UserWhereInput {
  const parts: Prisma.V1UserWhereInput[] = [{ accountStatus: 'active' }];
  if (input.target === 'competition') {
    if (!input.competitionId) throw new Error('competitionId is required for the competition push target');
    parts.push(competitionMembersWhere(input.competitionId));
  }
  if (input.gender) parts.push(pushAudienceGenderWhere(input.gender));
  return parts.length === 1 ? parts[0] : { AND: parts };
}
