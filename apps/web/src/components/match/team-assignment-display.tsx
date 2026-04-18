'use client';

import { Users } from 'lucide-react';
import { TEAM_COLORS } from './auto-balance-modal';
import type { Team, MatchParticipant } from '@/types/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface TeamAssignmentDisplayProps {
  teams: Team[];
  participants: MatchParticipant[];
}

// ── Read-only member row (no ELO — persistent Team has no eloRating) ──────────

function AssignedMemberRow({ participant }: { participant: MatchParticipant }) {
  const nickname = participant.user?.nickname ?? participant.nickname ?? '알 수 없음';
  const initial = nickname.slice(0, 1).toUpperCase();

  return (
    <div className="flex items-center gap-2.5 py-1.5">
      {/* 32x32 avatar */}
      <div className="shrink-0 h-8 w-8">
        {participant.user?.profileImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={participant.user.profileImageUrl}
            alt={`${nickname} 프로필`}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-semibold text-gray-600 dark:text-gray-300 select-none">
            {initial}
          </div>
        )}
      </div>

      <span className="flex-1 min-w-0 text-sm text-gray-800 dark:text-gray-200 truncate">
        {nickname}
      </span>
    </div>
  );
}

// ── Per-team read-only card ────────────────────────────────────────────────────

interface AssignedTeamCardProps {
  team: Team;
  members: MatchParticipant[];
  colorIndex: number;
}

function AssignedTeamCard({ team, members, colorIndex }: AssignedTeamCardProps) {
  const colors = TEAM_COLORS[colorIndex] ?? TEAM_COLORS[0];

  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800">
      {/* Card header */}
      <div className={`flex items-center justify-between px-4 py-2.5 ${colors.header}`}>
        <span className="text-sm font-bold text-white">{team.name}</span>
        <span className="text-xs font-medium text-white/90">{members.length}명</span>
      </div>

      {/* Member count sub-header */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-gray-100 dark:border-gray-700/60">
        <Users size={16} aria-hidden="true" className={colors.text} />
        <span className={`text-xs font-medium ${colors.text}`}>{members.length}명</span>
      </div>

      {/* Member list */}
      <div className="px-4 pb-2 divide-y divide-gray-50 dark:divide-gray-700/50">
        {members.length === 0 ? (
          <p className="py-2 text-xs text-gray-400 dark:text-gray-500">배정된 참가자 없음</p>
        ) : (
          members.map((p) => <AssignedMemberRow key={p.id} participant={p} />)
        )}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Read-only display of confirmed team assignments on the match detail page.
 * Derives team members from participants by teamId (persistent Team has no members field).
 * Returns null when teams array is empty.
 */
export function TeamAssignmentDisplay({ teams, participants }: TeamAssignmentDisplayProps) {
  if (!teams || teams.length === 0) return null;

  const gridClass =
    teams.length === 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3';

  return (
    <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">팀 구성</h3>
      <div className={`grid gap-3 ${gridClass}`}>
        {teams.map((team, i) => {
          const members = participants.filter((p) => p.teamId === team.id);
          return (
            <AssignedTeamCard
              key={team.id}
              team={team}
              members={members}
              colorIndex={i}
            />
          );
        })}
      </div>
    </div>
  );
}
