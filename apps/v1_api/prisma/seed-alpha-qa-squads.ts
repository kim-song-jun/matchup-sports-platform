import { Prisma, V1AuthProvider } from '@prisma/client';

/**
 * alpha QA 스쿼드 — 팀 10개 × 선수 10명(= 계정 100개).
 *
 * 왜 시드인가: alpha 는 휴대폰 본인인증이 켜져 있고(`V1_PHONE_VERIFICATION_DISABLED` 미설정)
 * SMS 발송은 설정돼 있지 않다(`/auth/phone/issue` → `SMS_NOT_CONFIGURED`). 그래서 API 회원가입
 * (`POST /auth/register`)은 `PHONE_NOT_VERIFIED` 로 막히고, 관리자용 계정 생성 엔드포인트도
 * 없다 — QA 계정을 늘릴 수 있는 경로는 배포 때 도는 이 시드뿐이다.
 *
 * 비밀번호는 **평문을 이 저장소에 넣지 않는다**(레포는 public). 이미 있는 alpha QA 계정의
 * `passwordHash` 를 그대로 복사해 쓰므로, 운영자가 이미 아는 그 비밀번호로 100개 계정 전부
 * 로그인된다. 기준 계정이 없으면 계정을 만들지 않고 건너뛴다 — 로그인 안 되는 계정 100개는
 * 테스트에 쓸모가 없고, 임의 비밀번호를 지어내면 아무도 그 값을 모른다.
 *
 * 전부 결정적 UUID 로 upsert 한다. 배포마다 다시 돌아도 같은 행을 갱신할 뿐 중복이 생기지 않고,
 * 사람이 화면에서 만든 팀·계정은 건드리지 않는다.
 */

/** 이 시드가 만드는 계정의 비밀번호 출처. 이 계정의 해시를 그대로 복사한다. */
const PASSWORD_SOURCE_EMAIL = process.env.ALPHA_QA_PASSWORD_SOURCE_EMAIL ?? 'alpha.e2e.captain.a@teameet.test';

export const ALPHA_QA_SQUAD_TEAM_COUNT = 10;
export const ALPHA_QA_SQUAD_MEMBERS_PER_TEAM = 10;

/** `ab200000-…-00000000000T` — 팀 슬롯 1..10. */
function teamId(teamNo: number): string {
  return `ab200000-0000-4000-8000-${String(teamNo).padStart(12, '0')}`;
}

/** `ac200000-…-00000000TTPP` — 팀 TT 의 PP 번 선수. */
function userId(teamNo: number, playerNo: number): string {
  return `ac200000-0000-4000-8000-${`${String(teamNo).padStart(2, '0')}${String(playerNo).padStart(2, '0')}`.padStart(12, '0')}`;
}

function email(teamNo: number, playerNo: number): string {
  return `alpha.qa.t${String(teamNo).padStart(2, '0')}.p${String(playerNo).padStart(2, '0')}@teameet.test`;
}

/**
 * `010` + 8자리 = 11자리. 앱의 휴대폰 형식(`/^\d{11}$/`)과 같은 길이로 맞춘다 — 자리수가
 * 어긋나면 화면·검증 경로에서 실제 번호처럼 다뤄지지 않는다. `2` 로 시작하는 대역을 써서
 * 기존 QA 번호(01090…)와도 겹치지 않는다.
 */
function phone(teamNo: number, playerNo: number): string {
  return `0102${String(teamNo).padStart(2, '0')}${String(playerNo).padStart(2, '0')}000`;
}

function nickname(teamNo: number, playerNo: number): string {
  return `QA${String(teamNo).padStart(2, '0')}팀선수${String(playerNo).padStart(2, '0')}`;
}

export interface AlphaQaSquadSummary {
  readonly teams: number;
  readonly users: number;
  readonly skippedReason?: string;
}

/**
 * @param sportId  팀 종목(풋살) — 호출부가 이미 조회해 둔 것을 그대로 쓴다.
 * @param regionId 팀 지역 — 위와 동일.
 */
export async function seedAlphaQaSquads(
  tx: Prisma.TransactionClient,
  sportId: string,
  regionId: string,
): Promise<AlphaQaSquadSummary> {
  const source = await tx.v1AuthIdentity.findFirst({
    where: { provider: V1AuthProvider.email, providerUserKey: PASSWORD_SOURCE_EMAIL, status: 'active' },
    select: { passwordHash: true },
  });
  if (!source?.passwordHash) {
    // 조용히 넘어가지 않는다 — 왜 안 만들어졌는지가 배포 로그에 남아야 한다.
    return {
      teams: 0,
      users: 0,
      skippedReason: `password source account (${PASSWORD_SOURCE_EMAIL}) not found — QA squads skipped`,
    };
  }
  const passwordHash = source.passwordHash;
  const now = new Date();

  let teams = 0;
  let users = 0;

  for (let teamNo = 1; teamNo <= ALPHA_QA_SQUAD_TEAM_COUNT; teamNo += 1) {
    const memberIds: string[] = [];

    for (let playerNo = 1; playerNo <= ALPHA_QA_SQUAD_MEMBERS_PER_TEAM; playerNo += 1) {
      const id = userId(teamNo, playerNo);
      const userEmail = email(teamNo, playerNo);
      const user = await tx.v1User.upsert({
        where: { id },
        update: {
          email: userEmail,
          phone: phone(teamNo, playerNo),
          // 휴대폰 인증은 쓰기 전역 게이트(V1AuthGuard)의 조건이다 — 미인증이면 로그인만 되고
          // 대회 신청·라인업 제출 같은 검증 동작을 아무것도 못 한다.
          phoneVerifiedAt: now,
          emailVerifiedAt: now,
          accountStatus: 'active',
          onboardingStatus: 'completed',
          deletedAt: null,
        },
        create: {
          id,
          email: userEmail,
          phone: phone(teamNo, playerNo),
          phoneVerifiedAt: now,
          emailVerifiedAt: now,
          accountStatus: 'active',
          onboardingStatus: 'completed',
        },
      });
      await tx.v1UserProfile.upsert({
        where: { userId: user.id },
        update: {
          nickname: nickname(teamNo, playerNo),
          displayName: nickname(teamNo, playerNo),
          realName: `큐에이${String(playerNo).padStart(2, '0')}`,
          gender: playerNo % 2 === 0 ? 'female' : 'male',
          birthDate: '1995-05-15',
          bio: 'ALPHA QA 스쿼드 — 라인업·실시간 운영 검증용 가상 선수입니다.',
          deletedAt: null,
        },
        create: {
          userId: user.id,
          nickname: nickname(teamNo, playerNo),
          displayName: nickname(teamNo, playerNo),
          realName: `큐에이${String(playerNo).padStart(2, '0')}`,
          gender: playerNo % 2 === 0 ? 'female' : 'male',
          birthDate: '1995-05-15',
          bio: 'ALPHA QA 스쿼드 — 라인업·실시간 운영 검증용 가상 선수입니다.',
        },
      });
      await tx.v1AuthIdentity.upsert({
        where: {
          provider_providerUserKey: { provider: V1AuthProvider.email, providerUserKey: userEmail },
        },
        update: { userId: user.id, email: userEmail, passwordHash, status: 'active' },
        create: {
          userId: user.id,
          provider: V1AuthProvider.email,
          providerUserKey: userEmail,
          email: userEmail,
          passwordHash,
          status: 'active',
        },
      });
      memberIds.push(user.id);
      users += 1;
    }

    const [ownerId] = memberIds;
    const id = teamId(teamNo);
    const team = await tx.v1Team.upsert({
      where: { id },
      update: {
        ownerUserId: ownerId,
        sportId,
        regionId,
        name: `(테스트) QA 스쿼드 ${String(teamNo).padStart(2, '0')}팀`,
        status: 'active',
        // 스키마상 가입 정책은 approval_required | closed 둘뿐이다(공개 가입 값은 없다).
        // 어차피 이 시드가 멤버 10명을 직접 넣으므로 신청 왕복은 필요 없다.
        joinPolicy: 'approval_required',
        membersVisible: true,
        memberCount: memberIds.length,
        deletedAt: null,
      },
      create: {
        id,
        ownerUserId: ownerId,
        sportId,
        regionId,
        name: `(테스트) QA 스쿼드 ${String(teamNo).padStart(2, '0')}팀`,
        status: 'active',
        joinPolicy: 'approval_required',
        membersVisible: true,
        memberCount: memberIds.length,
      },
    });
    await tx.v1TeamProfile.upsert({
      where: { teamId: team.id },
      update: {
        description: 'ALPHA QA 스쿼드 — 대회 라인업·실시간 운영 검증용 가상 팀입니다.',
        deletedAt: null,
      },
      create: {
        teamId: team.id,
        description: 'ALPHA QA 스쿼드 — 대회 라인업·실시간 운영 검증용 가상 팀입니다.',
      },
    });

    for (const [index, memberId] of memberIds.entries()) {
      // 1번은 팀장(owner), 2번은 매니저(manager 권한 경로 검증용), 나머지는 일반 팀원.
      const role = index === 0 ? 'owner' : index === 1 ? 'manager' : 'member';
      const existing = await tx.v1TeamMembership.findFirst({
        where: { teamId: team.id, userId: memberId },
        select: { id: true },
      });
      if (existing) {
        await tx.v1TeamMembership.update({
          where: { id: existing.id },
          data: { role, status: 'active', joinedAt: now, leftAt: null },
        });
      } else {
        await tx.v1TeamMembership.create({
          data: { teamId: team.id, userId: memberId, role, status: 'active', joinedAt: now },
        });
      }
    }
    await tx.v1Team.update({
      where: { id: team.id },
      data: { memberCount: memberIds.length, managerCount: 1 },
    });
    teams += 1;
  }

  return { teams, users };
}
