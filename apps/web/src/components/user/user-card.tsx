'use client';

import { useRouter } from 'next/navigation';
import { User, Star } from 'lucide-react';
import { sportCardAccent, sportLabel, levelLabel } from '@/lib/constants';
import type { SportType } from '@/types/api';

export interface UserCardUser {
  id: string;
  nickname: string;
  profileImageUrl?: string | null;
  sportProfile?: { sportType: SportType; level: number };
  mannerScore?: number;
}

export interface UserCardProps {
  user: UserCardUser;
  onProfileClick?: () => void;
  /** Slot for action buttons (e.g. accept/reject) rendered on the right side */
  rightSlot?: React.ReactNode;
}

/**
 * Reusable card for displaying a user's public identity.
 * Used in: team applicant rows, mercenary applicant rows, team-match opponent views.
 */
export function UserCard({ user, onProfileClick, rightSlot }: UserCardProps) {
  const router = useRouter();

  const handleProfileClick = onProfileClick ?? (() => router.push(`/users/${user.id}`));

  const accent = user.sportProfile?.sportType
    ? sportCardAccent[user.sportProfile.sportType]
    : null;

  const initials = user.nickname.slice(0, 1).toUpperCase();

  return (
    <div className="flex items-center gap-3 min-w-0 flex-1">
      {/* Avatar + text: single focusable button to avoid duplicate screen-reader entries */}
      <button
        type="button"
        onClick={handleProfileClick}
        aria-label={`${user.nickname} 프로필 보기`}
        className="group flex items-center gap-3 min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-xl"
      >
        {/* Avatar */}
        <div className="shrink-0">
          {user.profileImageUrl ? (
            <img
              src={user.profileImageUrl}
              alt={`${user.nickname} 프로필 사진`}
              className="h-11 w-11 rounded-full object-cover"
            />
          ) : (
            <div className="h-11 w-11 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-sm font-semibold text-gray-600 dark:text-gray-300 select-none">
              {initials || <User size={16} aria-hidden="true" />}
            </div>
          )}
        </div>

        {/* Text info */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">
            {user.nickname}
          </span>

          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {/* Sport profile pill */}
            {user.sportProfile && (
              <span
                className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${
                  accent?.badge ?? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                {sportLabel[user.sportProfile.sportType] ?? user.sportProfile.sportType}
                {user.sportProfile.level != null ? ` · ${levelLabel[user.sportProfile.level] ?? `레벨 ${user.sportProfile.level}`}` : ''}
              </span>
            )}

            {/* Manner score */}
            {user.mannerScore != null && (
              <span className="inline-flex items-center gap-0.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                <Star size={11} aria-hidden="true" className="fill-amber-400 text-amber-400" />
                {user.mannerScore.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Right slot — action buttons rendered by parent */}
      {rightSlot && (
        <div className="shrink-0 flex items-center gap-1.5">
          {rightSlot}
        </div>
      )}
    </div>
  );
}
