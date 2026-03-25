'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronRight, Users, Shield, Star, Trophy, Calendar,
  Edit3, Ban, Award, Save, Loader2, AlertTriangle, X, MapPin,
} from 'lucide-react';

const sportLabel: Record<string, string> = {
  futsal: '풋살', basketball: '농구', badminton: '배드민턴', ice_hockey: '아이스하키',
};

const mockTeams: Record<string, any> = {
  '1': {
    id: '1', name: 'FC 강남유나이티드', sportType: 'futsal',
    level: 3, city: '서울', district: '강남구',
    description: '매주 토요일 저녁에 활동하는 풋살 동호회입니다. 즐기면서 실력도 키워요!',
    isRecruiting: true,
    trustScore: 87,
    createdAt: '2025-06-15T09:00:00Z',
    owner: { id: 'u1', nickname: '김풋살', email: 'kim@example.com', mannerScore: 4.5 },
    members: [
      { id: 'u1', nickname: '김풋살', role: 'owner', joinedAt: '2025-06-15', mannerScore: 4.5 },
      { id: 'u2', nickname: '이드리블', role: 'manager', joinedAt: '2025-07-01', mannerScore: 4.2 },
      { id: 'u3', nickname: '박골대', role: 'member', joinedAt: '2025-07-10', mannerScore: 4.8 },
      { id: 'u4', nickname: '최슈팅', role: 'member', joinedAt: '2025-08-05', mannerScore: 3.9 },
      { id: 'u5', nickname: '정패스', role: 'member', joinedAt: '2025-09-12', mannerScore: 4.1 },
      { id: 'u6', nickname: '강수비', role: 'member', joinedAt: '2025-10-20', mannerScore: 4.6 },
    ],
    badges: ['fair_play', 'top_activity', 'verified'],
    recentMatches: [
      { id: 'm1', date: '2026-03-15', opponent: 'FC 서초', result: 'win', score: '5-3' },
      { id: 'm2', date: '2026-03-08', opponent: '마포 킥커즈', result: 'draw', score: '2-2' },
      { id: 'm3', date: '2026-03-01', opponent: '용산 FC', result: 'win', score: '4-1' },
      { id: 'm4', date: '2026-02-22', opponent: '성동 유나이티드', result: 'loss', score: '1-3' },
      { id: 'm5', date: '2026-02-15', opponent: '송파 스타즈', result: 'win', score: '6-2' },
    ],
  },
};

const badgeLabels: Record<string, { label: string; color: string }> = {
  fair_play: { label: '페어플레이', color: 'bg-gray-100 text-gray-600' },
  top_activity: { label: '활발한 활동', color: 'bg-gray-100 text-gray-600' },
  verified: { label: '인증 완료', color: 'bg-blue-50 text-blue-500' },
  mvp: { label: 'MVP', color: 'bg-gray-100 text-gray-600' },
  champion: { label: '챔피언', color: 'bg-gray-100 text-gray-600' },
};

const roleLabel: Record<string, string> = {
  owner: '운영자', manager: '매니저', member: '멤버',
};
const roleColor: Record<string, string> = {
  owner: 'bg-blue-50 text-blue-500', manager: 'bg-gray-100 text-gray-600', member: 'bg-gray-100 text-gray-500',
};

const resultColor: Record<string, string> = {
  win: 'text-green-500 bg-green-50', draw: 'text-gray-600 bg-gray-100', loss: 'text-red-500 bg-red-50',
};
const resultLabel: Record<string, string> = { win: '승', draw: '무', loss: '패' };

function getTeamData(id: string) {
  return mockTeams[id] || mockTeams['1'];
}

const availableBadges = ['fair_play', 'top_activity', 'verified', 'mvp', 'champion'];

export default function AdminTeamDetailPage() {
  const params = useParams();
  const teamId = params.id as string;
  const team = getTeamData(teamId);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(team.name);
  const [editDescription, setEditDescription] = useState(team.description);
  const [saving, setSaving] = useState(false);

  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [suspended, setSuspended] = useState(false);

  const [showBadgeModal, setShowBadgeModal] = useState(false);
  const [teamBadges, setTeamBadges] = useState<string[]>(team.badges);

  const handleSaveEdit = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    setEditing(false);
  };

  const handleSuspend = async () => {
    setSuspending(true);
    await new Promise((r) => setTimeout(r, 600));
    setSuspending(false);
    setSuspended(true);
    setShowSuspendModal(false);
  };

  const toggleBadge = (badge: string) => {
    setTeamBadges((prev) =>
      prev.includes(badge) ? prev.filter((b) => b !== badge) : [...prev, badge]
    );
  };

  const wins = team.recentMatches.filter((m: { result: string }) => m.result === 'win').length;
  const draws = team.recentMatches.filter((m: { result: string }) => m.result === 'draw').length;
  const losses = team.recentMatches.filter((m: { result: string }) => m.result === 'loss').length;

  const inputClass =
    'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 focus:bg-white transition-all';

  return (
    <div className="animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[13px] text-gray-400 mb-6">
        <Link href="/admin/teams" className="hover:text-gray-600 transition-colors">팀 관리</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">{team.name}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Left column */}
        <div className="space-y-4">
          {/* Team header card */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white text-[20px] font-black">
                  {team.name.charAt(0)}
                </div>
                <div>
                  {editing ? (
                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className={`${inputClass} text-[18px] font-bold`} />
                  ) : (
                    <h2 className="text-[20px] font-bold text-gray-900">{team.name}</h2>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[13px] text-gray-500">{sportLabel[team.sportType]}</span>
                    <span className="text-gray-200">|</span>
                    <span className="flex items-center gap-1 text-[13px] text-gray-500">
                      <MapPin size={12} />
                      {team.city} {team.district}
                    </span>
                    <span className="text-gray-200">|</span>
                    <span className="text-[13px] text-gray-500">Lv.{team.level}</span>
                  </div>
                </div>
              </div>
              {suspended ? (
                <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-[12px] font-semibold text-red-500">정지됨</span>
              ) : team.isRecruiting ? (
                <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[12px] font-semibold text-blue-500">모집중</span>
              ) : (
                <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[12px] font-semibold text-gray-500">마감</span>
              )}
            </div>

            {editing ? (
              <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
            ) : (
              <p className="text-[14px] text-gray-600 leading-relaxed">{team.description}</p>
            )}

            {/* Badges */}
            <div className="flex flex-wrap gap-2 mt-4">
              {teamBadges.map((badge) => {
                const b = badgeLabels[badge];
                return b ? (
                  <span key={badge} className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${b.color}`}>
                    <Award size={12} />
                    {b.label}
                  </span>
                ) : null;
              })}
            </div>
          </div>

          {/* Stats */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <h3 className="text-[14px] font-semibold text-gray-900 mb-3">팀 통계</h3>
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-xl bg-gray-50 p-3.5 text-center">
                <p className="text-[24px] font-bold text-gray-900">{team.trustScore}</p>
                <p className="text-[12px] text-gray-400 mt-0.5">신뢰도</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3.5 text-center">
                <p className="text-[24px] font-bold text-green-500">{wins}</p>
                <p className="text-[12px] text-gray-400 mt-0.5">승</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3.5 text-center">
                <p className="text-[24px] font-bold text-gray-500">{draws}</p>
                <p className="text-[12px] text-gray-400 mt-0.5">무</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3.5 text-center">
                <p className="text-[24px] font-bold text-red-500">{losses}</p>
                <p className="text-[12px] text-gray-400 mt-0.5">패</p>
              </div>
            </div>
          </div>

          {/* Members */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <h3 className="text-[14px] font-semibold text-gray-900 mb-3">
              멤버 ({team.members.length}명)
            </h3>
            <div className="space-y-2">
              {team.members.map((m: { id: string; nickname: string; role: string; mannerScore: number; joinedAt?: string }) => (
                <div key={m.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-[12px] font-bold text-blue-500">
                      {m.nickname.charAt(0)}
                    </div>
                    <div>
                      <p className="text-[14px] font-medium text-gray-900">{m.nickname}</p>
                      <p className="text-[11px] text-gray-400">가입 {m.joinedAt}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-[12px] text-amber-500">
                      <Star size={12} fill="currentColor" />
                      <span>{m.mannerScore.toFixed(1)}</span>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${roleColor[m.role]}`}>
                      {roleLabel[m.role]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent matches */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <h3 className="text-[14px] font-semibold text-gray-900 mb-3">최근 매치</h3>
            <div className="space-y-2">
              {team.recentMatches.map((m: { id: string; date: string; opponent: string; result: string; score: string }) => (
                <div key={m.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-[12px] text-gray-400">
                      <Calendar size={12} />
                      {m.date}
                    </div>
                    <span className="text-[14px] text-gray-700">vs {m.opponent}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-gray-900">{m.score}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${resultColor[m.result]}`}>
                      {resultLabel[m.result]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Owner info */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <h3 className="text-[14px] font-semibold text-gray-900 mb-3">운영자 정보</h3>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-[14px] font-bold text-blue-500">
                {team.owner.nickname.charAt(0)}
              </div>
              <div>
                <p className="text-[14px] font-semibold text-gray-900">{team.owner.nickname}</p>
                <p className="text-[12px] text-gray-400">{team.owner.email}</p>
              </div>
            </div>
            <div className="space-y-2 border-t border-gray-100 pt-3">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-gray-400">매너점수</span>
                <div className="flex items-center gap-1 text-amber-500">
                  <Star size={12} fill="currentColor" />
                  <span className="text-gray-700">{team.owner.mannerScore.toFixed(1)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-gray-400">팀 생성일</span>
                <span className="text-gray-700">{new Date(team.createdAt).toLocaleDateString('ko-KR')}</span>
              </div>
            </div>
          </div>

          {/* Admin actions */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <h3 className="text-[14px] font-semibold text-gray-900 mb-3">관리 액션</h3>
            <div className="space-y-2">
              <button
                onClick={() => { setEditing(!editing); }}
                className="w-full flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-left hover:bg-blue-100 transition-colors"
              >
                <Edit3 size={18} className="text-blue-500 shrink-0" />
                <div>
                  <p className="text-[14px] font-medium text-blue-700">{editing ? '수정 취소' : '팀 정보 수정'}</p>
                  <p className="text-[11px] text-blue-500">팀명, 설명을 수정합니다</p>
                </div>
              </button>

              {editing && (
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-3 text-[14px] font-bold text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {saving ? '저장 중...' : '변경사항 저장'}
                </button>
              )}

              <button
                onClick={() => setShowBadgeModal(true)}
                className="w-full flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-left hover:bg-blue-100 transition-colors"
              >
                <Award size={18} className="text-blue-500 shrink-0" />
                <div>
                  <p className="text-[14px] font-medium text-blue-700">배지 관리</p>
                  <p className="text-[11px] text-blue-500">팀 배지를 추가/제거합니다</p>
                </div>
              </button>

              <button
                onClick={() => setShowSuspendModal(true)}
                disabled={suspended}
                className="w-full flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                <Ban size={18} className="text-red-500 shrink-0" />
                <div>
                  <p className="text-[14px] font-medium text-red-700">{suspended ? '이미 정지됨' : '팀 활동 정지'}</p>
                  <p className="text-[11px] text-red-500">팀의 매칭 활동을 정지합니다</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Suspend confirmation modal */}
      {showSuspendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 mx-4 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
                <AlertTriangle size={20} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-gray-900">팀 활동 정지</h3>
                <p className="text-[13px] text-gray-400">매칭 활동이 중단됩니다</p>
              </div>
            </div>
            <p className="text-[14px] text-gray-600 mb-6">
              <span className="font-semibold text-gray-900">{team.name}</span> 팀의 활동을 정지하시겠습니까?
              정지되면 새로운 매칭 신청이 불가능합니다.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSuspendModal(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[14px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSuspend}
                disabled={suspending}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-500 py-2.5 text-[14px] font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {suspending ? <Loader2 size={14} className="animate-spin" /> : null}
                {suspending ? '처리 중...' : '활동 정지'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Badge management modal */}
      {showBadgeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 mx-4 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold text-gray-900">배지 관리</h3>
              <button onClick={() => setShowBadgeModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <p className="text-[13px] text-gray-500 mb-4">배지를 클릭하여 추가하거나 제거하세요</p>
            <div className="space-y-2">
              {availableBadges.map((badge) => {
                const b = badgeLabels[badge];
                const active = teamBadges.includes(badge);
                return (
                  <button
                    key={badge}
                    onClick={() => toggleBadge(badge)}
                    className={`w-full flex items-center justify-between rounded-xl px-4 py-3 text-left transition-all ${
                      active ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 border border-gray-100 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Award size={16} className={active ? 'text-blue-500' : 'text-gray-400'} />
                      <span className={`text-[14px] font-medium ${active ? 'text-blue-700' : 'text-gray-600'}`}>{b.label}</span>
                    </div>
                    {active && (
                      <span className="text-[12px] font-semibold text-blue-500">활성</span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setShowBadgeModal(false)}
              className="w-full mt-4 rounded-xl bg-blue-500 py-2.5 text-[14px] font-bold text-white hover:bg-blue-600 transition-colors"
            >
              완료
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
