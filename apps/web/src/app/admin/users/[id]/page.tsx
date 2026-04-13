'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { ChevronRight, Star, Trophy, MapPin, AlertTriangle, Ban, User, Shield, RefreshCw } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Modal } from '@/components/ui/modal';
import { SportIconMap } from '@/components/icons/sport-icons';
import { useAdminUser } from '@/hooks/use-api';
import type { SportProfile } from '@/types/api';
import { sportLabel, levelLabel } from '@/lib/constants';

type ModerationAction = 'warn' | 'suspend' | 'reactivate' | null;

export default function AdminUserDetailPage() {
  const params = useParams();
  const userId = params.id as string;
  const { toast } = useToast();
  const { data: user, isLoading, isError, refetch } = useAdminUser(userId);
  const [actionType, setActionType] = useState<ModerationAction>(null);
  const [actionNote, setActionNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const requiresActionNote = actionType === 'suspend';

  const handleModerationAction = async () => {
    if (!user || !actionType) {
      return;
    }

    if (requiresActionNote && !actionNote.trim()) {
      toast('error', '계정 정지 사유를 입력해주세요.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (actionType === 'warn') {
        await api.post(`/admin/users/${userId}/warn`, { note: actionNote });
        toast('success', '사용자에게 경고를 기록했어요');
      } else {
        await api.patch(`/admin/users/${userId}/status`, {
          status: actionType === 'suspend' ? 'suspended' : 'active',
          note: actionNote,
        });
        toast('success', actionType === 'suspend' ? '사용자 계정을 정지했어요' : '사용자 계정을 활성화했어요');
      }

      setActionType(null);
      setActionNote('');
      await refetch();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast('error', axiosErr?.response?.data?.message || '관리 액션을 적용하지 못했어요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="animate-fade-in">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-48 bg-gray-100 dark:bg-gray-800 rounded-lg" />
          <div className="h-48 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
          <div className="h-32 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="animate-fade-in">
        <ErrorState message="사용자 상세를 불러오지 못했어요" onRetry={() => void refetch()} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="animate-fade-in">
        <EmptyState
          icon={User}
          title="사용자를 찾을 수 없어요"
          description="삭제되었거나 존재하지 않는 사용자예요"
          action={{ label: '목록으로', href: '/admin/users' }}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Modal
        isOpen={actionType !== null}
        onClose={() => {
          if (isSubmitting) return;
          setActionType(null);
          setActionNote('');
        }}
        title={
          actionType === 'warn'
            ? '경고 기록'
            : actionType === 'suspend'
              ? '계정 정지'
              : '계정 활성화'
        }
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            {actionType === 'warn'
              ? '경고 사유를 남기면 사용자 감사 로그에 기록됩니다.'
              : actionType === 'suspend'
                ? '정지 사유를 남기면 사용자 상세의 운영 로그와 상태 배지에 반영됩니다.'
                : '활성화 사유를 남기면 복구 이력으로 저장됩니다.'}
          </p>
          {requiresActionNote ? (
            <p className="text-xs font-medium text-red-500">계정 정지 사유는 필수입니다.</p>
          ) : null}
          <label htmlFor="admin-user-action-note" className="sr-only">운영 메모</label>
          <textarea
            id="admin-user-action-note"
            value={actionNote}
            onChange={(e) => setActionNote(e.target.value)}
            rows={4}
            placeholder="운영 메모를 입력하세요"
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 px-4 py-3 text-base text-gray-900 dark:text-white placeholder:text-gray-400 resize-none focus:outline-none focus:border-blue-500 transition-colors"
          />
          <div className="flex gap-3">
            <button
              onClick={() => {
                setActionType(null);
                setActionNote('');
              }}
              disabled={isSubmitting}
              className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              취소
            </button>
            <button
              onClick={() => void handleModerationAction()}
              disabled={isSubmitting || (requiresActionNote && !actionNote.trim())}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 py-3 text-base font-semibold text-white hover:bg-gray-800 transition-colors disabled:opacity-60"
            >
              {isSubmitting ? <RefreshCw size={16} className="animate-spin" /> : null}
              저장
            </button>
          </div>
        </div>
      </Modal>

      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/admin/users" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">사용자 관리</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-300">{user.nickname}</span>
      </div>

      <div className="grid grid-cols-1 @3xl:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-4">
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/30 text-xl font-bold text-blue-500">
                {user.nickname?.charAt(0)}
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">{user.nickname}</h2>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    user.adminStatus === 'suspended'
                      ? 'bg-red-50 text-red-600'
                      : 'bg-green-50 text-green-600'
                  }`}>
                    {user.adminStatus === 'suspended' ? '정지' : '활성'}
                  </span>
                </div>
                {user.email ? <p className="text-sm text-gray-400 mt-0.5">{user.email}</p> : null}
                {user.bio ? <p className="text-base text-gray-600 dark:text-gray-300 mt-2">{user.bio}</p> : null}
                <div className="flex items-center gap-3 mt-3 flex-wrap">
                  <div className="flex items-center gap-1 text-amber-500">
                    <Star size={14} fill="currentColor" />
                    <span className="text-base font-semibold">{user.mannerScore?.toFixed(1)}</span>
                  </div>
                  <span className="text-gray-200 dark:text-gray-600">|</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">{user.totalMatches}경기</span>
                  <span className="text-gray-200 dark:text-gray-600">|</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">경고 {user.warningCount ?? 0}회</span>
                  {user.locationCity ? (
                    <>
                      <span className="text-gray-200 dark:text-gray-600">|</span>
                      <span className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                        <MapPin size={12} />
                        {user.locationCity} {user.locationDistrict}
                      </span>
                    </>
                  ) : null}
                </div>
                {user.suspensionReason ? (
                  <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
                    정지 사유: {user.suspensionReason}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">종목별 프로필</h3>
            {user.sportProfiles && user.sportProfiles.length > 0 ? (
              <div className="space-y-2">
                {user.sportProfiles.map((sp: SportProfile) => {
                  const SportIcon = SportIconMap[sp.sportType];
                  return (
                    <div key={sp.id} className="flex items-center justify-between rounded-xl bg-gray-50 dark:bg-gray-700/50 px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {SportIcon ? <SportIcon size={16} className="text-gray-400" /> : null}
                        <span className="text-base font-medium text-gray-800 dark:text-gray-200">{sportLabel[sp.sportType]}</span>
                        <span className="rounded-md bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-xs font-semibold text-blue-500">
                          {levelLabel[sp.level]}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400">
                        {sp.matchCount}전 {sp.winCount}승 · ELO {sp.eloRating}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={Trophy}
                title="등록된 종목이 없어요"
                description="종목을 등록하면 여기에 표시돼요"
                size="sm"
              />
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">운영 상태</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">현재 상태</span>
                <span className="text-gray-700 dark:text-gray-300">{user.adminStatus === 'suspended' ? '정지' : '활성'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">경고 누적</span>
                <span className="text-gray-700 dark:text-gray-300">{user.warningCount ?? 0}회</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">가입일</span>
                <span className="text-gray-700 dark:text-gray-300">{user.createdAt ? new Date(user.createdAt).toLocaleDateString('ko-KR') : '-'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">인증 방식</span>
                <span className="text-gray-700 dark:text-gray-300">{user.provider || '-'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">사용자 ID</span>
                <span className="text-gray-700 dark:text-gray-300 font-mono text-xs">{user.id?.slice(0, 12)}...</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">관리 액션</h3>
            <div className="space-y-2">
              <button
                onClick={() => setActionType('warn')}
                className="w-full flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 px-4 py-3 text-left hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
              >
                <AlertTriangle size={18} className="text-amber-500 shrink-0" />
                <div>
                  <p className="text-base font-medium text-amber-700 dark:text-amber-400">경고 기록</p>
                  <p className="text-xs text-amber-500">사용자 경고를 감사 로그에 남깁니다</p>
                </div>
              </button>

              {user.adminStatus === 'suspended' ? (
                <button
                  onClick={() => setActionType('reactivate')}
                  className="w-full flex items-center gap-3 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/30 px-4 py-3 text-left hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
                >
                  <Shield size={18} className="text-green-500 shrink-0" />
                  <div>
                    <p className="text-base font-medium text-green-700 dark:text-green-400">계정 활성화</p>
                    <p className="text-xs text-green-500">정지 상태를 해제하고 복구 이력을 남깁니다</p>
                  </div>
                </button>
              ) : (
                <button
                  onClick={() => setActionType('suspend')}
                  className="w-full flex items-center gap-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-left hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                >
                  <Ban size={18} className="text-red-500 shrink-0" />
                  <div>
                    <p className="text-base font-medium text-red-700 dark:text-red-400">계정 정지</p>
                    <p className="text-xs text-red-500">정지 사유를 남기고 운영 로그에 기록합니다</p>
                  </div>
                </button>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">감사 로그</h3>
            {user.adminAuditLog && user.adminAuditLog.length > 0 ? (
              <div className="space-y-3">
                {user.adminAuditLog.map((entry) => (
                  <div key={entry.id} className="rounded-xl bg-gray-50 dark:bg-gray-700/50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{entry.action}</p>
                      <span className="text-xs text-gray-400">{new Date(entry.createdAt).toLocaleString('ko-KR')}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">actor: {entry.actor}</p>
                    {entry.note ? <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{entry.note}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Shield}
                title="아직 기록된 운영 액션이 없어요"
                description="경고/정지/복구 이력이 여기에 누적됩니다"
                size="sm"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
