'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Calendar, Clock, MapPin, Users, Shield, ArrowUpRight } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useTeamMatch } from '@/hooks/use-api';
import { sportLabel } from '@/lib/constants';
import { formatAmount, formatDateDot } from '@/lib/utils';

export default function AdminTeamMatchDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data: match, isLoading, isError, refetch } = useTeamMatch(id);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded-lg bg-gray-100 dark:bg-gray-800" />
        <div className="h-40 rounded-2xl bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (isError) {
    return <ErrorState message="팀 매칭 상세를 불러오지 못했어요" onRetry={() => void refetch()} />;
  }

  if (!match) {
    return (
      <EmptyState
        icon={Users}
        title="팀 매칭을 찾을 수 없어요"
        description="삭제되었거나 접근할 수 없는 모집글이에요"
        action={{ label: '목록으로', href: '/admin/team-matches' }}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/admin/team-matches" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">팀 매칭 관리</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-300">{match.title}</span>
      </div>

      <div className="grid grid-cols-1 @3xl:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-4">
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-2xs font-medium text-blue-500">
                    {sportLabel[match.sportType] || match.sportType}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-2xs font-medium text-gray-600">
                    {match.status}
                  </span>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{match.title}</h1>
                <p className="mt-2 text-sm text-gray-500">{match.description || '관리자 메모 없이 등록된 팀 매칭입니다.'}</p>
              </div>
              <Link href={`/team-matches/${match.id}`} className="inline-flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                공개 상세
                <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <Calendar size={14} />
                일정
              </div>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{formatDateDot(match.matchDate)}</p>
              <p className="text-sm text-gray-500 mt-1">{match.startTime} ~ {match.endTime}</p>
            </div>
            <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <MapPin size={14} />
                장소
              </div>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{match.venueName}</p>
              <p className="text-sm text-gray-500 mt-1">{match.venueAddress}</p>
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">운영 확인 포인트</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">호스트 팀</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{match.hostTeam?.name ?? '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">신청 수</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{match.applicationCount ?? 0}건</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">상대 팀 참가비</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatAmount(match.opponentFee ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">총 비용</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatAmount(match.totalFee)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">관리자 셸 유지</h2>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-4 text-sm text-gray-600 dark:text-gray-300">
              공개 상세를 열더라도 이 페이지를 기준으로 다시 운영 컨텍스트로 복귀할 수 있도록 관리자 전용 route를 유지합니다.
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">운영 체크리스트</h2>
            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
              <div className="flex items-start gap-2">
                <Clock size={14} className="mt-0.5 text-gray-400" />
                <span>경기 시간과 장소 정보가 실제 공지와 일치하는지 확인</span>
              </div>
              <div className="flex items-start gap-2">
                <Users size={14} className="mt-0.5 text-gray-400" />
                <span>호스트 팀과 신청 팀의 정보 과장이 없는지 검토</span>
              </div>
              <div className="flex items-start gap-2">
                <Shield size={14} className="mt-0.5 text-gray-400" />
                <span>분쟁/신고가 발생한 경우 관리자 분쟁 화면과 함께 교차 확인</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
