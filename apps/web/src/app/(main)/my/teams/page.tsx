'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Users, MapPin, Pencil, Trash2, AlertTriangle, UserCog, Star, Trophy } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';

const mockMyTeams = [
  {
    id: 'team-1',
    name: 'FC 서울라이트',
    sportType: 'futsal',
    description: '서울 강남 지역 풋살 팀입니다. 주말마다 활동합니다.',
    memberCount: 12,
    maxMembers: 15,
    region: '서울 강남구',
    level: 3,
    mannerScore: 4.5,
    matchCount: 28,
    winCount: 18,
  },
  {
    id: 'team-2',
    name: '강남 슬래머즈',
    sportType: 'basketball',
    description: '농구 좋아하는 직장인 모임. 평일 저녁 위주로 활동.',
    memberCount: 8,
    maxMembers: 12,
    region: '서울 강남구',
    level: 2,
    mannerScore: 4.7,
    matchCount: 15,
    winCount: 10,
  },
];

const sportLabel: Record<string, string> = {
  futsal: '풋살', basketball: '농구', badminton: '배드민턴', ice_hockey: '아이스하키',
};
const levelLabel: Record<number, string> = { 1: '입문', 2: '초급', 3: '중급', 4: '상급', 5: '고수' };

export default function MyTeamsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [teams, setTeams] = useState(mockMyTeams);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/teams/${id}`);
      setTeams(prev => prev.filter(t => t.id !== id));
      toast('success', '팀이 삭제되었습니다');
    } catch {
      toast('error', '삭제에 실패했습니다');
    }
    setDeleteTarget(null);
  };

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50">
        <button onClick={() => router.back()} className="rounded-lg p-1.5 -ml-1.5">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-[16px] font-semibold text-gray-900">내 팀</h1>
      </header>
      <div className="hidden lg:block mb-6 px-5 lg:px-0 pt-4">
        <h2 className="text-[24px] font-bold text-gray-900">내 팀</h2>
        <p className="text-[14px] text-gray-400 mt-1">내가 운영하는 팀을 관리하세요</p>
      </div>

      <div className="px-5 lg:px-0 space-y-3 pb-8">
        {teams.length === 0 ? (
          <div className="rounded-2xl bg-gray-50 p-16 text-center">
            <Users size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-[15px] font-medium text-gray-600">운영 중인 팀이 없어요</p>
            <Link href="/teams/new" className="mt-4 inline-block rounded-lg bg-gray-900 px-6 py-2.5 text-[14px] font-semibold text-white">
              팀 만들기
            </Link>
          </div>
        ) : (
          teams.map((team) => (
            <div key={team.id} className="rounded-2xl bg-white border border-gray-100 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-500">
                      {sportLabel[team.sportType]}
                    </span>
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                      Lv.{team.level} {levelLabel[team.level]}
                    </span>
                  </div>
                  <Link href={`/teams/${team.id}`}>
                    <h3 className="text-[16px] font-bold text-gray-900 hover:text-blue-500 transition-colors">{team.name}</h3>
                  </Link>
                </div>
                <div className="flex items-center gap-0.5 text-amber-500">
                  <Star size={14} fill="currentColor" />
                  <span className="text-[13px] font-semibold">{team.mannerScore}</span>
                </div>
              </div>

              <p className="text-[13px] text-gray-500 mt-1 line-clamp-1">{team.description}</p>

              <div className="mt-3 flex items-center gap-4 text-[13px] text-gray-500">
                <div className="flex items-center gap-1">
                  <Users size={13} />
                  <span>{team.memberCount}/{team.maxMembers}명</span>
                </div>
                <div className="flex items-center gap-1">
                  <MapPin size={13} />
                  <span>{team.region}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Trophy size={13} />
                  <span>{team.matchCount}전 {team.winCount}승</span>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <Link
                  href={`/teams/${team.id}/edit`}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-gray-50 py-2.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <Pencil size={14} />
                  수정
                </Link>
                <Link
                  href={`/teams/${team.id}/members`}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 py-2.5 text-[13px] font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
                >
                  <UserCog size={14} />
                  멤버관리
                </Link>
                <button
                  onClick={() => setDeleteTarget(team.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-red-50 py-2.5 text-[13px] font-semibold text-red-500 hover:bg-red-100 transition-colors"
                >
                  <Trash2 size={14} />
                  삭제
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mx-auto mb-4">
              <AlertTriangle size={24} className="text-red-500" />
            </div>
            <h3 className="text-[17px] font-bold text-gray-900 text-center">팀을 삭제하시겠어요?</h3>
            <p className="text-[14px] text-gray-500 text-center mt-2">팀을 삭제하면 모든 멤버에게 알림이 발송됩니다. 이 작업은 되돌릴 수 없습니다.</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 rounded-xl bg-gray-100 py-3 text-[14px] font-semibold text-gray-700">돌아가기</button>
              <button onClick={() => handleDelete(deleteTarget)} className="flex-1 rounded-xl bg-red-500 py-3 text-[14px] font-semibold text-white">삭제하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
