/**
 * Placeholder values a deleted account keeps in rows that stay behind. Each is derived from the user id, so it is
 * unique and frees the real value (the email, phone, provider key and nickname are all unique columns).
 */
export function buildDeletedEmail(userId: string) {
  return `deleted+${userId}@deleted.teameet.local`;
}

export function buildDeletedPhone(userId: string) {
  return `deleted-${userId}`;
}

export function buildDeletedProviderUserKey(userId: string, identityId: string) {
  return `deleted:${userId}:${identityId}`;
}

export function buildDeletedNickname(userId: string) {
  return `deleted_${userId.slice(0, 8)}`;
}

export function buildDeletedProfileData(userId: string, deletedAt: Date) {
  return {
    nickname: buildDeletedNickname(userId),
    displayName: '탈퇴 회원',
    realName: null,
    gender: null,
    birthDate: null,
    bio: null,
    profileImageUrl: null,
    displayRegion: null,
    visibility: 'private' as const,
    tournamentRealNameVisible: false,
    deletedAt,
  };
}
