'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Shield, User, UserPlus, MoreVertical, AlertTriangle, Crown } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

const mockMembers = [
  { id: 'u-1', nickname: '김민수', role: 'owner', joinedAt: '2025-06-01', matchCount: 28, mannerScore: 4.8, position: '공격수' },
  { id: 'u-2', nickname: '이영희', role: 'admin', joinedAt: '2025-07-15', matchCount: 22, mannerScore: 4.6, position: '미드필더' },
  { id: 'u-3', nickname: '박지훈', role: 'member', joinedAt: '2025-08-20', matchCount: 18, mannerScore: 4.5, position: '수비수' },
  { id: 'u-4', nickname: '최서연', role: 'member', joinedAt: '2025-09-10', matchCount: 14, mannerScore: 4.7, position: '골키퍼' },
  { id: 'u-5', nickname: '정태욱', role: 'member', joinedAt: '2025-10-05', matchCount: 10, mannerScore: 4.3, position: '공격수' },
  { id: 'u-6', nickname: '한소희', role: 'member', joinedAt: '2026-01-20', matchCount: 5, mannerScore: 4.9, position: '미드필더' },
];

const roleConfig: Record<string, { label: string; style: string }> = {
  owner: { label: '팀장', style: 'bg-amber-50 text-amber-600' },
  admin: { label: '운영자', style: 'bg-gray-100 text-gray-600' },
  member: { label: '멤버', style: 'bg-gray-100 text-gray-600' },
};

export default function TeamMembersPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const teamId = params.id as string;

  const [members, setMembers] = useState(mockMembers);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [kickTarget, setKickTarget] = useState<{ id: string; name: string } | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteNickname, setInviteNickname] = useState('');

  const handleRoleChange = (memberId: string, newRole: string) => {
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));
    setMenuOpen(null);
    toast('success', '역할이 변경되었어요');
  };

  const handleKick = (id: string) => {
    setMembers(prev => prev.filter(m => m.id !== id));
    setKickTarget(null);
    toast('success', '멤버가 추방되었어요');
  };

  const handleInvite = () => {
    if (!inviteNickname.trim()) return toast('error', '닉네임을 입력해주세요');
    toast('success', `${inviteNickname}님에게 초대를 보냈어요`);
    setInviteNickname('');
    setShowInviteModal(false);
  };

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      <header className="lg:hidden flex items-center justify-between px-5 py-3 border-b border-gray-50 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} aria-label="뒤로 가기" className="flex items-center justify-center min-h-11 min-w-11 rounded-xl -ml-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">멤버 관리</h1>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="flex items-center gap-1.5 rounded-xl bg-blue-500 px-3 py-2.5 text-sm font-bold text-white hover:bg-blue-600 transition-colors"
        >
          <UserPlus size={14} />
          초대
        </button>
      </header>
      <div className="hidden lg:flex lg:items-center lg:justify-between mb-6 px-5 lg:px-0 pt-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">멤버 관리</h2>
          <p className="text-base text-gray-500 mt-1">팀 멤버 {members.length}명</p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2.5 text-base font-bold text-white hover:bg-blue-600 transition-colors"
        >
          <UserPlus size={16} />
          초대하기
        </button>
      </div>

      <div className="px-5 lg:px-0 pb-8 space-y-2">
        {members.map((member) => {
          const role = roleConfig[member.role] || roleConfig.member;
          return (
            <div key={member.id} className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 shrink-0">
                {member.role === 'owner' ? (
                  <Crown size={18} className="text-amber-500" />
                ) : (
                  <User size={18} className="text-gray-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-md font-semibold text-gray-900 dark:text-white">{member.nickname}</span>
                  <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${role.style}`}>{role.label}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                  <span>{member.position}</span>
                  <span className="text-gray-200">|</span>
                  <span>{member.matchCount}경기</span>
                  <span className="text-gray-200">|</span>
                  <span className="text-amber-500">&#9733; {member.mannerScore}</span>
                </div>
              </div>
              {member.role !== 'owner' && (
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(menuOpen === member.id ? null : member.id)}
                    aria-label="멤버 메뉴"
                    className="flex items-center justify-center min-h-11 min-w-11 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <MoreVertical size={16} className="text-gray-500" />
                  </button>
                  {menuOpen === member.id && (
                    <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 shadow-lg z-10 overflow-hidden min-w-[140px]">
                      {member.role === 'member' ? (
                        <button
                          onClick={() => handleRoleChange(member.id, 'admin')}
                          className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
                        >
                          <Shield size={14} className="text-blue-500" />
                          운영자로 변경
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRoleChange(member.id, 'member')}
                          className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
                        >
                          <User size={14} className="text-gray-500" />
                          멤버로 변경
                        </button>
                      )}
                      <button
                        onClick={() => { setKickTarget({ id: member.id, name: member.nickname }); setMenuOpen(null); }}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center gap-2 border-t border-gray-100 dark:border-gray-700"
                      >
                        <AlertTriangle size={14} />
                        추방
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Kick Confirmation Modal */}
      {kickTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 p-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mx-auto mb-4">
              <AlertTriangle size={24} className="text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center">{kickTarget.name}님을 추방하시겠어요?</h3>
            <p className="text-base text-gray-500 text-center mt-2">추방된 멤버에게 알림이 발송됩니다.</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setKickTarget(null)} className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">돌아가기</button>
              <button onClick={() => handleKick(kickTarget.id)} className="flex-1 rounded-xl bg-red-500 py-3 text-base font-semibold text-white hover:bg-red-600 transition-colors">추방하기</button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center mb-3">멤버 초대</h3>
            <input
              type="text"
              value={inviteNickname}
              onChange={(e) => setInviteNickname(e.target.value)}
              placeholder="닉네임을 입력하세요"
              className="w-full rounded-xl border border-gray-200 dark:border-gray-600 px-4 py-3 text-base text-gray-900 dark:text-white dark:bg-gray-800/50 focus:border-blue-500 focus:outline-none transition-colors mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => { setShowInviteModal(false); setInviteNickname(''); }} className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">돌아가기</button>
              <button onClick={handleInvite} className="flex-1 rounded-xl bg-blue-500 py-3 text-base font-bold text-white hover:bg-blue-600 transition-colors">초대하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
