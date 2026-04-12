'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Shield, User, MoreVertical, AlertTriangle, Crown, LogOut } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useRequireAuth } from '@/hooks/use-require-auth';
import {
  useTeamMembers,
  useUpdateTeamMemberRole,
  useRemoveTeamMember,
  useLeaveTeam,
  type TeamMember,
} from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { TransferOwnershipModal } from '@/components/teams/transfer-ownership-modal';

const roleConfig: Record<string, { label: string; style: string }> = {
  owner: { label: '팀장', style: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' },
  manager: { label: '운영자', style: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' },
  member: { label: '멤버', style: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
};

export default function TeamMembersPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const { user } = useAuthStore();
  useRequireAuth();

  const teamId = params.id as string;

  const { data: members = [], isLoading, isError, refetch } = useTeamMembers(teamId);
  const updateRoleMutation = useUpdateTeamMemberRole();
  const removeMemberMutation = useRemoveTeamMember();
  const leaveTeamMutation = useLeaveTeam();

  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const activeMenuId = menuOpen;
    if (!activeMenuId) return;
    const menuId: string = activeMenuId;
    function handleClickOutside(e: MouseEvent) {
      const activeMenu = menuRefs.current[menuId];
      if (activeMenu && !activeMenu.contains(e.target as Node)) {
        setMenuOpen(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const [kickTarget, setKickTarget] = useState<{ userId: string; name: string } | null>(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [transferTarget, setTransferTarget] = useState<{ userId: string; nickname: string } | null>(null);
  // TODO: invite modal pending backend nickname-search support — hidden until ready

  const myMembership = members.find((m) => m.userId === user?.id);
  const isOwner = myMembership?.role === 'owner';
  const membersPageTitle = myMembership?.role === 'member' ? '멤버 목록' : '멤버 관리';

  function setMenuRef(memberId: string, node: HTMLDivElement | null) {
    if (node) {
      menuRefs.current[memberId] = node;
      return;
    }
    delete menuRefs.current[memberId];
  }

  function handleRoleChange(memberUserId: string, newRole: string) {
    updateRoleMutation.mutate(
      { teamId, userId: memberUserId, role: newRole },
      {
        onSuccess: () => {
          toast('success', '역할이 변경되었어요');
          setMenuOpen(null);
        },
        onError: () => toast('error', '역할 변경에 실패했어요'),
      },
    );
  }

  function handleKick(userId: string) {
    removeMemberMutation.mutate(
      { teamId, userId },
      {
        onSuccess: () => {
          toast('success', '멤버가 추방되었어요');
          setKickTarget(null);
        },
        onError: () => toast('error', '추방에 실패했어요'),
      },
    );
  }

  function handleLeave() {
    leaveTeamMutation.mutate(teamId, {
      onSuccess: () => {
        toast('success', '팀에서 탈퇴했어요');
        router.push('/my/teams');
      },
      onError: () => toast('error', '탈퇴에 실패했어요'),
    });
  }

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      <header className="@3xl:hidden flex items-center justify-between px-5 py-3 border-b border-gray-50 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            aria-label="뒤로 가기"
            className="flex items-center justify-center min-h-11 min-w-11 rounded-xl -ml-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
          </button>
          <h1 data-testid="team-members-heading" className="text-lg font-semibold text-gray-900 dark:text-white">{membersPageTitle}</h1>
        </div>
        {/* Invite button hidden — backend nickname-search not yet available */}
      </header>

      <div className="hidden @3xl:flex @3xl:items-center @3xl:justify-between mb-6 px-5 @3xl:px-0 pt-4">
        <div>
          <h2 data-testid="team-members-heading" className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{membersPageTitle}</h2>
          <p className="text-base text-gray-500 mt-1">
            {isLoading ? '불러오는 중...' : `팀 멤버 ${members.length}명`}
          </p>
        </div>
        {/* Invite button hidden — backend nickname-search not yet available */}
      </div>

      <div className="px-5 @3xl:px-0 pb-8 space-y-2">
        {isError ? (
          <ErrorState onRetry={refetch} />
        ) : isLoading ? (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[72px] animate-pulse rounded-xl bg-gray-50 dark:bg-gray-700" />
            ))}
          </>
        ) : members.length === 0 ? (
          <EmptyState
            icon={User}
            title="멤버가 없어요"
            description="팀원을 초대해보세요"
            size="sm"
          />
        ) : (
          members.map((member: TeamMember) => {
            const role = roleConfig[member.role] ?? roleConfig.member;
            const isSelf = member.userId === user?.id;
            const canManage = isOwner && !isSelf && member.role !== 'owner';

            return (
              <div
                key={member.id}
                data-testid={`team-member-row-${member.userId}`}
                className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 flex items-center gap-3"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 shrink-0">
                  {member.role === 'owner' ? (
                    <Crown size={18} className="text-amber-500" aria-hidden="true" />
                  ) : (
                    <User size={18} className="text-gray-500 dark:text-gray-400" aria-hidden="true" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-md font-semibold text-gray-900 dark:text-white">
                      {member.user?.nickname ?? '알 수 없음'}
                    </span>
                    <span
                      data-testid={`team-member-role-${member.userId}`}
                      className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${role.style}`}
                    >
                      {role.label}
                    </span>
                    {isSelf && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">(나)</span>
                    )}
                  </div>
                  {member.user?.mannerScore != null && (
                    <div className="flex items-center gap-1 text-xs text-amber-500 mt-0.5">
                      <span>&#9733;</span>
                      <span className="font-semibold">{member.user.mannerScore.toFixed(1)}</span>
                    </div>
                  )}
                </div>

                {/* Owner: manage other members */}
                {canManage && (
                  <div className="relative" ref={(node) => setMenuRef(member.id, node)}>
                    <button
                      onClick={() => setMenuOpen(menuOpen === member.id ? null : member.id)}
                      aria-label={`${member.user?.nickname ?? '멤버'} 멤버 메뉴`}
                      data-testid={`team-member-menu-${member.userId}`}
                      className="flex items-center justify-center min-h-11 min-w-11 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <MoreVertical size={16} className="text-gray-500 dark:text-gray-400" />
                    </button>
                    {menuOpen === member.id && (
                      <div role="menu" className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 shadow-lg z-10 overflow-hidden min-w-[160px]">
                        {member.role === 'member' ? (
                          <button
                            data-testid={`team-member-set-manager-${member.userId}`}
                            role="menuitem"
                            onClick={() => handleRoleChange(member.userId, 'manager')}
                            disabled={updateRoleMutation.isPending}
                            className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 min-h-[44px] disabled:opacity-40"
                          >
                            <Shield size={14} className="text-blue-500" aria-hidden="true" />
                            운영자로 변경
                          </button>
                        ) : (
                          <button
                            data-testid={`team-member-set-member-${member.userId}`}
                            role="menuitem"
                            onClick={() => handleRoleChange(member.userId, 'member')}
                            disabled={updateRoleMutation.isPending}
                            className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 min-h-[44px] disabled:opacity-40"
                          >
                            <User size={14} className="text-gray-500" aria-hidden="true" />
                            멤버로 변경
                          </button>
                        )}
                        <button
                          data-testid={`team-member-transfer-${member.userId}`}
                          role="menuitem"
                          onClick={() => {
                            setTransferTarget({ userId: member.userId, nickname: member.user?.nickname ?? '이 멤버' });
                            setMenuOpen(null);
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/10 flex items-center gap-2 min-h-[44px]"
                        >
                          <Crown size={14} aria-hidden="true" />
                          소유권 이전
                        </button>
                        <button
                          data-testid={`team-member-kick-${member.userId}`}
                          role="menuitem"
                          onClick={() => {
                            setKickTarget({ userId: member.userId, name: member.user?.nickname ?? '이 멤버' });
                            setMenuOpen(null);
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center gap-2 border-t border-gray-100 dark:border-gray-700 min-h-[44px]"
                        >
                          <AlertTriangle size={14} aria-hidden="true" />
                          강퇴
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Self (non-owner): leave team button */}
                {isSelf && !isOwner && (
                  <button
                    onClick={() => setShowLeaveModal(true)}
                    aria-label={`${member.user?.nickname ?? '내 계정'} 팀 탈퇴`}
                    aria-haspopup="dialog"
                    data-testid="team-member-leave-self"
                    className="flex items-center gap-1.5 rounded-xl bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm font-medium text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors min-h-[44px]"
                  >
                    <LogOut size={14} />
                    탈퇴
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Kick Confirmation Modal */}
      {kickTarget && (
        <Modal isOpen={!!kickTarget} onClose={() => setKickTarget(null)} title="멤버 강퇴">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 mx-auto mb-4">
            <AlertTriangle size={24} className="text-red-500" />
          </div>
          <p className="text-base text-gray-700 dark:text-gray-200 text-center">
            <span className="font-bold">{kickTarget.name}</span>님을 강퇴하시겠어요?
          </p>
          <p className="text-sm text-gray-500 text-center mt-1">강퇴 후에는 멤버 목록에서 즉시 제거됩니다.</p>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setKickTarget(null)}
              className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              돌아가기
            </button>
            <button
              onClick={() => handleKick(kickTarget.userId)}
              disabled={removeMemberMutation.isPending}
              className="flex-1 rounded-xl bg-red-500 py-3 text-base font-semibold text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {removeMemberMutation.isPending ? '처리 중...' : '강퇴하기'}
            </button>
          </div>
        </Modal>
      )}

      {/* Leave Team Confirmation Modal */}
      <Modal isOpen={showLeaveModal} onClose={() => setShowLeaveModal(false)} title="팀 탈퇴">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 mx-auto mb-4">
          <LogOut size={24} className="text-red-500" />
        </div>
        <p className="text-base text-gray-700 dark:text-gray-200 text-center">정말 팀을 탈퇴하시겠어요?</p>
        <p className="text-sm text-gray-500 text-center mt-1">탈퇴 후에는 다시 가입 신청이 필요합니다.</p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => setShowLeaveModal(false)}
            className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            돌아가기
          </button>
          <button
            onClick={handleLeave}
            disabled={leaveTeamMutation.isPending}
            className="flex-1 rounded-xl bg-red-500 py-3 text-base font-semibold text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            {leaveTeamMutation.isPending ? '처리 중...' : '탈퇴하기'}
          </button>
        </div>
      </Modal>

      {/* Transfer Ownership Modal */}
      {transferTarget && (
        <TransferOwnershipModal
          isOpen={!!transferTarget}
          onClose={() => setTransferTarget(null)}
          teamId={teamId}
          targetUser={transferTarget}
        />
      )}
      <div className="h-24" />
    </div>
  );
}
