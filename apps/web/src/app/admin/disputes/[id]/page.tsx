'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  Ban,
  Calendar,
  MapPin,
  Shield,
  RefreshCw,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useAdminDispute, useUpdateDisputeStatus } from '@/hooks/use-api';
import { extractErrorMessage } from '@/lib/utils';

const typeLabel: Record<string, string> = {
  no_show: '노쇼',
  late: '지각',
  level_mismatch: '실력 차이',
  misconduct: '비매너',
};

const typeColor: Record<string, string> = {
  no_show: 'bg-red-50 text-red-600',
  late: 'bg-amber-50 text-amber-600',
  level_mismatch: 'bg-gray-100 text-gray-600',
  misconduct: 'bg-red-50 text-red-500',
};

const statusLabel: Record<string, string> = {
  pending: '대기중',
  investigating: '조사중',
  resolved: '해결됨',
  dismissed: '기각됨',
};

const statusColor: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  investigating: 'bg-blue-50 text-blue-500',
  resolved: 'bg-green-50 text-green-500',
  dismissed: 'bg-gray-100 text-gray-500',
};

const auditActionLabel: Record<string, string> = {
  reported: '접수됨',
  investigation_started: '조사 시작',
  resolved: '해결됨',
  dismissed: '기각됨',
};

const auditActorLabel: Record<string, string> = {
  system: '시스템 자동',
};

type ActionMode = 'investigating' | 'resolved' | 'dismissed' | null;

export default function AdminDisputeDetailPage() {
  const params = useParams();
  const disputeId = params.id as string;
  const { toast } = useToast();
  const { data: dispute, isLoading, isError, refetch } = useAdminDispute(disputeId);
  const updateStatus = useUpdateDisputeStatus();
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [adminNote, setAdminNote] = useState('');

  const handleSubmit = async () => {
    if (!actionMode) return;

    try {
      await updateStatus.mutateAsync({
        id: disputeId,
        data: {
          status: actionMode,
          note: adminNote,
          resolution: actionMode === 'resolved' ? adminNote : undefined,
        },
      });
      toast('success', '분쟁 상태를 업데이트했어요');
      setActionMode(null);
      setAdminNote('');
      await refetch();
    } catch (err) {
      toast('error', extractErrorMessage(err, '분쟁 상태를 업데이트하지 못했어요.'));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded-lg bg-gray-100 dark:bg-gray-800" />
        <div className="h-40 rounded-2xl bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (isError) {
    return <ErrorState message="분쟁 상세를 불러오지 못했어요" onRetry={() => void refetch()} />;
  }

  if (!dispute) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="분쟁을 찾을 수 없어요"
        description="삭제되었거나 접근할 수 없는 분쟁입니다"
        action={{ label: '목록으로', href: '/admin/disputes' }}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      <Modal isOpen={actionMode !== null} onClose={() => setActionMode(null)} title="운영 판단 기록" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            {actionMode === 'investigating'
              ? '조사 시작 메모를 남기면 히스토리에 기록됩니다.'
              : actionMode === 'resolved'
                ? '해결 근거와 조치 내용을 남기면 resolution과 감사 로그에 함께 남습니다.'
                : '기각 사유를 남기면 감사 로그에 기록됩니다.'}
          </p>
          <label htmlFor="admin-dispute-note" className="sr-only">운영 메모</label>
          <textarea
            id="admin-dispute-note"
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            rows={4}
            placeholder="운영 메모를 입력하세요"
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 px-4 py-3 text-base text-gray-900 dark:text-white placeholder:text-gray-400 resize-none focus:outline-none focus:border-blue-500 transition-colors"
          />
          <div className="flex gap-3">
            <button
              onClick={() => setActionMode(null)}
              className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              취소
            </button>
            <button
              onClick={() => void handleSubmit()}
              disabled={updateStatus.isPending}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 py-3 text-base font-semibold text-white hover:bg-gray-800 transition-colors disabled:opacity-60"
            >
              {updateStatus.isPending ? <RefreshCw size={16} className="animate-spin" /> : null}
              저장
            </button>
          </div>
        </div>
      </Modal>

      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/admin/disputes" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">신고/분쟁</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-300">{dispute.id}</span>
      </div>

      <div className="grid grid-cols-1 @3xl:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-4">
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${typeColor[dispute.type] || 'bg-gray-100 text-gray-600'}`}>
                    {typeLabel[dispute.type] || dispute.type}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor[dispute.status] || 'bg-gray-100 text-gray-600'}`}>
                    {statusLabel[dispute.status] || dispute.status}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{dispute.id}</h2>
                <p className="text-sm text-gray-400 mt-1">접수일: {new Date(dispute.createdAt).toLocaleString('ko-KR')}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 p-4">
                <p className="text-xs font-semibold text-blue-500 uppercase mb-1">신고팀</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{dispute.reporterTeam?.name ?? '-'}</p>
                <p className="text-xs text-gray-500 mt-1">팀장: {dispute.reporterTeam?.captain ?? '-'}</p>
                <p className="text-xs text-blue-600 mt-1">신뢰도 {dispute.reporterTeam?.trustScore ?? '-'}</p>
              </div>
              <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 p-4">
                <p className="text-xs font-semibold text-red-500 uppercase mb-1">피신고팀</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{dispute.reportedTeam?.name ?? '-'}</p>
                <p className="text-xs text-gray-500 mt-1">팀장: {dispute.reportedTeam?.captain ?? '-'}</p>
                <p className="text-xs text-red-600 mt-1">신뢰도 {dispute.reportedTeam?.trustScore ?? '-'}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">매치 정보</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-3.5">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar size={14} className="text-gray-400" />
                  <span className="text-xs text-gray-400">날짜/시간</span>
                </div>
                <p className="text-base font-semibold text-gray-900 dark:text-white">{dispute.match?.date ?? '-'}</p>
                <p className="text-xs text-gray-400">{dispute.match?.startTime ?? '-'} ~ {dispute.match?.endTime ?? '-'}</p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-3.5">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin size={14} className="text-gray-400" />
                  <span className="text-xs text-gray-400">장소</span>
                </div>
                <p className="text-base font-semibold text-gray-900 dark:text-white">{dispute.match?.venue ?? '-'}</p>
                <p className="text-xs text-gray-400 truncate">{dispute.match?.address ?? '-'}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">신고 내용</h3>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-4">
              <p className="text-base text-gray-700 dark:text-gray-300 leading-relaxed">{dispute.description}</p>
              {dispute.resolution ? (
                <div className="mt-4 rounded-xl bg-green-50 px-3 py-3 text-sm text-green-700">
                  해결 내용: {dispute.resolution}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">첨부 자료</h3>
            <div className="space-y-2">
              {(dispute.evidence ?? []).map((item) => (
                <div key={item.id} className="rounded-xl bg-gray-50 dark:bg-gray-700/50 px-4 py-3">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.type}</p>
                  <p className="text-sm text-gray-500 mt-1">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">운영 액션</h3>
            <div className="space-y-2">
              <button
                onClick={() => setActionMode('investigating')}
                disabled={dispute.status !== 'pending'}
                className="w-full flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-left hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <AlertTriangle size={18} className="text-blue-500 shrink-0" />
                <div>
                  <p className="text-base font-medium text-blue-700">조사 시작</p>
                  <p className="text-xs text-blue-500">검토 시작 시점을 감사 로그에 남깁니다</p>
                </div>
              </button>
              <button
                onClick={() => setActionMode('resolved')}
                disabled={dispute.status !== 'investigating'}
                className="w-full flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-left hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle size={18} className="text-green-500 shrink-0" />
                <div>
                  <p className="text-base font-medium text-green-700">해결 처리</p>
                  <p className="text-xs text-green-500">조치 내용과 함께 분쟁을 종료합니다</p>
                </div>
              </button>
              <button
                onClick={() => setActionMode('dismissed')}
                disabled={dispute.status !== 'investigating' && dispute.status !== 'pending'}
                className="w-full flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-left hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Ban size={18} className="text-gray-500 shrink-0" />
                <div>
                  <p className="text-base font-medium text-gray-700">기각 처리</p>
                  <p className="text-xs text-gray-500">근거 부족 등으로 종료합니다</p>
                </div>
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">운영 메모</h3>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-4 text-sm text-gray-600 dark:text-gray-300">
              {dispute.adminNotes || '아직 남겨진 운영 메모가 없습니다.'}
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">감사 로그</h3>
            <div className="space-y-3">
              {(dispute.history ?? []).map((entry) => (
                <div key={entry.id} className="rounded-xl bg-gray-50 dark:bg-gray-700/50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{auditActionLabel[entry.action] ?? entry.action}</p>
                    <span className="text-xs text-gray-400">{new Date(entry.createdAt).toLocaleString('ko-KR')}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">처리: {auditActorLabel[entry.actor] ?? entry.actor}</p>
                  {entry.note ? <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{entry.note}</p> : null}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">운영 원칙</h3>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-4 text-sm text-gray-600 dark:text-gray-300">
              <div className="flex items-start gap-2">
                <Shield size={14} className="mt-0.5 text-gray-400 shrink-0" />
                <span>상태 변경은 모두 감사 로그에 남고, 해결/기각 시 메모를 함께 기록해야 합니다.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
