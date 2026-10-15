const deletedAt = new Date('2026-10-13T00:00:00.000Z');

type PlayerUser = {
  readonly accountStatus: 'active' | 'deleted';
  readonly deletedAt: Date | null;
  readonly phone: string | null;
  readonly profile: { readonly nickname: string; readonly deletedAt: Date | null } | null;
};

const activeUser: PlayerUser = {
  accountStatus: 'active',
  deletedAt: null,
  phone: '01012345678',
  profile: { nickname: '현재닉네임', deletedAt: null },
};

export const deletedNicknameCases = [
  {
    label: '삭제 트랜잭션이 사용자와 프로필을 함께 스크럽한 보존 선수',
    user: {
      ...activeUser,
      accountStatus: 'deleted',
      deletedAt,
      phone: 'deleted-player-user-id',
      profile: { nickname: 'deleted_player-u', deletedAt },
    },
    nickname: null,
  },
  {
    label: '사용자 삭제 시각이 기록된 보존 선수',
    user: { ...activeUser, deletedAt },
    nickname: null,
  },
  {
    label: '프로필 삭제 시각이 기록된 보존 선수',
    user: { ...activeUser, profile: { nickname: 'deleted_player-u', deletedAt } },
    nickname: null,
  },
  { label: '활성 사용자와 프로필', user: activeUser, nickname: '현재닉네임' },
  { label: '프로필이 없는 활성 사용자', user: { ...activeUser, profile: null }, nickname: null },
  {
    label: 'deleted_ 접두사를 직접 사용한 활성 닉네임',
    user: { ...activeUser, profile: { nickname: 'deleted_내닉네임', deletedAt: null } },
    nickname: 'deleted_내닉네임',
  },
  {
    label: '개인정보 삭제 없이 상태만 변경한 사용자',
    user: { ...activeUser, accountStatus: 'deleted' },
    nickname: '현재닉네임',
  },
] satisfies readonly { readonly label: string; readonly user: PlayerUser; readonly nickname: string | null }[];

type PlayerQuery = {
  readonly include: {
    readonly user: {
      readonly select: {
        readonly phone?: boolean;
        readonly deletedAt?: boolean;
        readonly profile: { readonly select: { readonly nickname?: boolean; readonly deletedAt?: boolean } };
      };
    };
  };
};

export function makeDeletedNicknamePrisma(user: PlayerUser) {
  return {
    v1AdminUser: { findUnique: jest.fn().mockResolvedValue({
      id: 'ops-admin-id', userId: 'admin-user-id', adminRole: 'ops', status: 'active',
      user: { accountStatus: 'active' },
    }) },
    v1TournamentRegistration: { findUnique: jest.fn().mockResolvedValue({
      id: 'reg-1', teamId: 'team-1', rosterLockedAt: null,
      team: { name: '기록 보존 팀', ownerUserId: 'owner-user-id' },
      tournament: { minPlayers: 1 },
    }) },
    v1TournamentPlayer: { findMany: jest.fn().mockImplementation(async ({ include }: PlayerQuery) => {
      const select = include.user.select;
      return [{
        id: 'player-1', registrationId: 'reg-1', userId: 'player-user-id',
        realName: '등록 당시 실명', birthDateSnapshot: '1995-03-15', genderSnapshot: 'male',
        eligibilityStatus: 'needs_review', eligibilityNote: null, removedAt: null,
        addedAt: new Date('2026-06-14T00:00:00.000Z'),
        user: {
          ...(select.phone ? { phone: user.phone } : {}),
          ...(select.deletedAt ? { deletedAt: user.deletedAt } : {}),
          profile: user.profile === null ? null : {
            ...(select.profile.select.nickname ? { nickname: user.profile.nickname } : {}),
            ...(select.profile.select.deletedAt ? { deletedAt: user.profile.deletedAt } : {}),
          },
        },
      }];
    }) },
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'player-1', jersey_number: 7 }]),
  };
}
