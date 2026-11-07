export type FakeTeamMember = {
  teamId: string;
  status: 'active' | 'left' | 'removed';
  /** `V1UserProfile.gender`. `null` is a profile without gender; `undefined` is a user without a profile row. */
  gender: string | null | undefined;
};

type MembershipCountArgs = {
  where: {
    teamId?: string;
    status?: string;
    user?: { profile?: { gender?: string } };
  };
};

/**
 * `v1TeamMembership.count` backed by in-memory rows. It evaluates the `where` it receives, so a caller that
 * drops the `status: 'active'` or gender filter counts differently and fails the specs. Unknown filter keys
 * throw instead of being ignored (an ignored key would make the count look filtered when it is not).
 */
export function teamMembershipCountFake(members: FakeTeamMember[]) {
  return jest.fn(async ({ where }: MembershipCountArgs) => {
    const unknownKeys = Object.keys(where).filter((key) => !['teamId', 'status', 'user'].includes(key));
    if (unknownKeys.length > 0) throw new Error(`teamMembershipCountFake: unsupported where keys ${unknownKeys.join(',')}`);
    const requiredGender = where.user?.profile?.gender;
    return members.filter(
      (member) =>
        (where.teamId === undefined || member.teamId === where.teamId) &&
        (where.status === undefined || member.status === where.status) &&
        (requiredGender === undefined || member.gender === requiredGender),
    ).length;
  });
}
