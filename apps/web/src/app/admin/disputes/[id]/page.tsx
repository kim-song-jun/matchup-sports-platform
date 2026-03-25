'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronRight, AlertTriangle, CheckCircle, X, Ban,
  Clock, Users, Calendar, MapPin, Camera, MessageSquare,
  Shield, Loader2, FileText, ArrowRight,
} from 'lucide-react';

interface TimelineEvent {
  id: string;
  time: string;
  label: string;
  description: string;
  type: 'info' | 'warning' | 'success' | 'error';
}

const mockDisputes: Record<string, any> = {
  'D-001': {
    id: 'D-001',
    type: 'no_show',
    status: 'pending',
    createdAt: '2026-03-15T14:30:00Z',
    reporterTeam: {
      id: 't1', name: 'FC 강남유나이티드', trustScore: 87,
      captain: '김풋살', memberCount: 8,
    },
    reportedTeam: {
      id: 't2', name: '서초 FC', trustScore: 62,
      captain: '이축구', memberCount: 6,
    },
    match: {
      id: 'm1', date: '2026-03-15', startTime: '19:00', endTime: '21:00',
      venue: '서울 풋살파크', address: '서울시 강남구 테헤란로 123',
      sport: 'futsal',
    },
    arrivalCheck: {
      reporterArrival: '18:45',
      reportedArrival: null,
      reporterCheckedIn: true,
      reportedCheckedIn: false,
    },
    evaluation: {
      reporterRating: 1,
      reporterComment: '상대팀이 아무런 연락 없이 나타나지 않았습니다. 40분을 기다렸으나 연락도 안 됩니다.',
    },
    photos: [
      { id: 'p1', description: '빈 경기장 사진 (19:40)' },
      { id: 'p2', description: '카카오톡 연락 시도 스크린샷' },
    ],
    timeline: [
      { id: 'e1', time: '2026-03-15 18:45', label: '신고팀 도착', description: 'FC 강남유나이티드 체크인 완료', type: 'info' },
      { id: 'e2', time: '2026-03-15 19:00', label: '경기 시작 시간', description: '서초 FC 미도착', type: 'warning' },
      { id: 'e3', time: '2026-03-15 19:20', label: '연락 시도', description: '신고팀이 상대 팀장에게 전화/카카오톡 연락 시도', type: 'info' },
      { id: 'e4', time: '2026-03-15 19:40', label: '노쇼 확정', description: '40분 경과 후 상대팀 미도착 확인', type: 'error' },
      { id: 'e5', time: '2026-03-15 14:30', label: '신고 접수', description: '경기 후 노쇼 신고 제출', type: 'warning' },
    ] as TimelineEvent[],
    adminNotes: '',
  },
  'D-002': {
    id: 'D-002',
    type: 'misconduct',
    status: 'investigating',
    createdAt: '2026-03-12T20:15:00Z',
    reporterTeam: {
      id: 't3', name: '마포 킥커즈', trustScore: 91,
      captain: '박킥', memberCount: 10,
    },
    reportedTeam: {
      id: 't4', name: '용산 스트라이커즈', trustScore: 45,
      captain: '최슈팅', memberCount: 7,
    },
    match: {
      id: 'm2', date: '2026-03-12', startTime: '20:00', endTime: '22:00',
      venue: '마포 실내체육관', address: '서울시 마포구 월드컵로 200',
      sport: 'futsal',
    },
    arrivalCheck: {
      reporterArrival: '19:50',
      reportedArrival: '19:55',
      reporterCheckedIn: true,
      reportedCheckedIn: true,
    },
    evaluation: {
      reporterRating: 1,
      reporterComment: '상대팀 선수 2명이 과격한 태클을 반복했고 욕설까지 했습니다. 우리 팀 선수 1명이 부상을 입었습니다.',
    },
    photos: [
      { id: 'p3', description: '부상 부위 사진' },
      { id: 'p4', description: '경기 영상 캡처' },
      { id: 'p5', description: '병원 진단서' },
    ],
    timeline: [
      { id: 'e1', time: '2026-03-12 19:50', label: '양팀 도착', description: '양팀 모두 체크인 완료', type: 'info' },
      { id: 'e2', time: '2026-03-12 20:00', label: '경기 시작', description: '정상 경기 시작', type: 'info' },
      { id: 'e3', time: '2026-03-12 20:35', label: '비매너 행위', description: '상대팀 과격 태클 및 욕설 발생', type: 'error' },
      { id: 'e4', time: '2026-03-12 20:40', label: '부상 발생', description: '신고팀 선수 발목 부상', type: 'error' },
      { id: 'e5', time: '2026-03-12 20:45', label: '경기 중단', description: '부상으로 경기 중단', type: 'warning' },
      { id: 'e6', time: '2026-03-12 20:15', label: '신고 접수', description: '비매너 행위 신고 제출', type: 'warning' },
    ] as TimelineEvent[],
    adminNotes: '담당자 배정 완료. 양팀 인터뷰 예정.',
  },
};

const typeLabel: Record<string, string> = {
  no_show: '노쇼', late: '지각', level_mismatch: '실력 차이', misconduct: '비매너',
};
const typeColor: Record<string, string> = {
  no_show: 'bg-red-50 text-red-600',
  late: 'bg-amber-50 text-amber-600',
  level_mismatch: 'bg-gray-100 text-gray-600',
  misconduct: 'bg-red-50 text-red-500',
};
const statusLabel: Record<string, string> = {
  pending: '대기중', investigating: '조사중', resolved: '해결됨', dismissed: '기각됨',
};
const statusColor: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  investigating: 'bg-blue-50 text-blue-500',
  resolved: 'bg-green-50 text-green-500',
  dismissed: 'bg-gray-100 text-gray-500',
};

const timelineIconColor: Record<string, string> = {
  info: 'bg-blue-50 text-blue-500',
  warning: 'bg-amber-50 text-amber-500',
  success: 'bg-green-50 text-green-500',
  error: 'bg-red-50 text-red-500',
};

function getDisputeData(id: string) {
  return mockDisputes[id] || mockDisputes['D-001'];
}

export default function AdminDisputeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const disputeId = params.id as string;
  const dispute = getDisputeData(disputeId);

  const [showResolveModal, setShowResolveModal] = useState(false);
  const [showDismissModal, setShowDismissModal] = useState(false);
  const [showWarnModal, setShowWarnModal] = useState(false);
  const [showSuspendModal, setShowSuspendModal] = useState(false);

  const [processing, setProcessing] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(dispute.status);
  const [adminNotes, setAdminNotes] = useState(dispute.adminNotes);

  const handleAction = async (action: string) => {
    setProcessing(true);
    await new Promise((r) => setTimeout(r, 700));
    setProcessing(false);

    if (action === 'resolve') {
      setCurrentStatus('resolved');
      setShowResolveModal(false);
    } else if (action === 'dismiss') {
      setCurrentStatus('dismissed');
      setShowDismissModal(false);
    } else if (action === 'warn') {
      setShowWarnModal(false);
    } else if (action === 'suspend') {
      setShowSuspendModal(false);
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[13px] text-gray-400 mb-6">
        <Link href="/admin/disputes" className="hover:text-gray-600 transition-colors">신고/분쟁</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">{dispute.id}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Left column */}
        <div className="space-y-4">
          {/* Header card */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-[20px] font-bold text-gray-900">{dispute.id}</h2>
                  <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${typeColor[dispute.type]}`}>
                    {typeLabel[dispute.type]}
                  </span>
                </div>
                <p className="text-[13px] text-gray-400">
                  접수일: {new Date(dispute.createdAt).toLocaleDateString('ko-KR')} {new Date(dispute.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${statusColor[currentStatus]}`}>
                {statusLabel[currentStatus]}
              </span>
            </div>

            {/* Teams involved */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-center">
              <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
                <p className="text-[11px] font-semibold text-blue-500 uppercase mb-1">신고팀</p>
                <p className="text-[16px] font-bold text-gray-900">{dispute.reporterTeam.name}</p>
                <div className="flex items-center gap-2 mt-1.5 text-[12px] text-gray-500">
                  <span>팀장: {dispute.reporterTeam.captain}</span>
                  <span className="text-gray-200">|</span>
                  <span>{dispute.reporterTeam.memberCount}명</span>
                </div>
                <div className="flex items-center gap-1 mt-1.5">
                  <Shield size={12} className="text-blue-500" />
                  <span className="text-[12px] font-semibold text-blue-600">신뢰도 {dispute.reporterTeam.trustScore}</span>
                </div>
              </div>

              <div className="flex items-center justify-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                  <ArrowRight size={14} className="text-gray-400" />
                </div>
              </div>

              <div className="rounded-xl bg-red-50 border border-red-100 p-4">
                <p className="text-[11px] font-semibold text-red-500 uppercase mb-1">피신고팀</p>
                <p className="text-[16px] font-bold text-gray-900">{dispute.reportedTeam.name}</p>
                <div className="flex items-center gap-2 mt-1.5 text-[12px] text-gray-500">
                  <span>팀장: {dispute.reportedTeam.captain}</span>
                  <span className="text-gray-200">|</span>
                  <span>{dispute.reportedTeam.memberCount}명</span>
                </div>
                <div className="flex items-center gap-1 mt-1.5">
                  <Shield size={12} className="text-red-500" />
                  <span className="text-[12px] font-semibold text-red-600">신뢰도 {dispute.reportedTeam.trustScore}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Match info */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <h3 className="text-[14px] font-semibold text-gray-900 mb-3">매치 정보</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-gray-50 p-3.5">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar size={14} className="text-gray-400" />
                  <span className="text-[12px] text-gray-400">날짜/시간</span>
                </div>
                <p className="text-[14px] font-semibold text-gray-900">{dispute.match.date}</p>
                <p className="text-[12px] text-gray-400">{dispute.match.startTime} ~ {dispute.match.endTime}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3.5">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin size={14} className="text-gray-400" />
                  <span className="text-[12px] text-gray-400">장소</span>
                </div>
                <p className="text-[14px] font-semibold text-gray-900">{dispute.match.venue}</p>
                <p className="text-[12px] text-gray-400 truncate">{dispute.match.address}</p>
              </div>
            </div>
          </div>

          {/* Arrival check data */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <h3 className="text-[14px] font-semibold text-gray-900 mb-3">도착 체크 데이터</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className={`rounded-xl p-3.5 ${dispute.arrivalCheck.reporterCheckedIn ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
                <p className="text-[12px] font-semibold text-gray-500 mb-1">신고팀</p>
                <p className="text-[14px] font-semibold text-gray-900">
                  {dispute.arrivalCheck.reporterCheckedIn ? 'O 체크인 완료' : 'X 미체크인'}
                </p>
                {dispute.arrivalCheck.reporterArrival && (
                  <p className="text-[12px] text-gray-500 mt-0.5">도착: {dispute.arrivalCheck.reporterArrival}</p>
                )}
              </div>
              <div className={`rounded-xl p-3.5 ${dispute.arrivalCheck.reportedCheckedIn ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
                <p className="text-[12px] font-semibold text-gray-500 mb-1">피신고팀</p>
                <p className="text-[14px] font-semibold text-gray-900">
                  {dispute.arrivalCheck.reportedCheckedIn ? 'O 체크인 완료' : 'X 미체크인'}
                </p>
                {dispute.arrivalCheck.reportedArrival ? (
                  <p className="text-[12px] text-gray-500 mt-0.5">도착: {dispute.arrivalCheck.reportedArrival}</p>
                ) : (
                  <p className="text-[12px] text-red-500 mt-0.5">미도착</p>
                )}
              </div>
            </div>
          </div>

          {/* Evaluation / Report content */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <h3 className="text-[14px] font-semibold text-gray-900 mb-3">신고 내용</h3>
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare size={14} className="text-gray-400" />
                <span className="text-[12px] font-semibold text-gray-500">신고팀 평가 (평점: {dispute.evaluation.reporterRating}/5)</span>
              </div>
              <p className="text-[14px] text-gray-700 leading-relaxed">{dispute.evaluation.reporterComment}</p>
            </div>
          </div>

          {/* Photos */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <h3 className="text-[14px] font-semibold text-gray-900 mb-3">첨부 자료</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {dispute.photos.map((photo: { id: string; description: string }) => (
                <div key={photo.id} className="rounded-xl bg-gray-100 border border-gray-200 p-4 flex flex-col items-center justify-center min-h-[100px]">
                  <Camera size={24} className="text-gray-400 mb-2" />
                  <p className="text-[11px] text-gray-500 text-center">{photo.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Timeline */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <h3 className="text-[14px] font-semibold text-gray-900 mb-3">타임라인</h3>
            <div className="space-y-0">
              {dispute.timeline.map((event: TimelineEvent, idx: number) => (
                <div key={event.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${timelineIconColor[event.type]}`}>
                      <Clock size={14} />
                    </div>
                    {idx < dispute.timeline.length - 1 && (
                      <div className="w-[2px] flex-1 bg-gray-100 my-1" />
                    )}
                  </div>
                  <div className="pb-4">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-semibold text-gray-900">{event.label}</p>
                      <span className="text-[11px] text-gray-400">{event.time}</span>
                    </div>
                    <p className="text-[13px] text-gray-500 mt-0.5">{event.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Admin notes */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <h3 className="text-[14px] font-semibold text-gray-900 mb-3">관리자 메모</h3>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="조사 내용이나 메모를 입력하세요..."
              rows={4}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 focus:bg-white transition-all resize-none"
            />
          </div>

          {/* Admin actions */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5 sticky top-6">
            <h3 className="text-[14px] font-semibold text-gray-900 mb-3">처리 액션</h3>
            <div className="space-y-2">
              <button
                onClick={() => setShowResolveModal(true)}
                disabled={currentStatus === 'resolved'}
                className="w-full flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-left hover:bg-green-100 transition-colors disabled:opacity-50"
              >
                <CheckCircle size={18} className="text-green-500 shrink-0" />
                <div>
                  <p className="text-[14px] font-medium text-green-700">해결 처리</p>
                  <p className="text-[11px] text-green-500">분쟁을 해결 완료로 처리합니다</p>
                </div>
              </button>

              <button
                onClick={() => setShowDismissModal(true)}
                disabled={currentStatus === 'dismissed'}
                className="w-full flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-left hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                <X size={18} className="text-gray-500 shrink-0" />
                <div>
                  <p className="text-[14px] font-medium text-gray-700">기각 처리</p>
                  <p className="text-[11px] text-gray-500">신고를 기각합니다</p>
                </div>
              </button>

              <button
                onClick={() => setShowWarnModal(true)}
                className="w-full flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left hover:bg-amber-100 transition-colors"
              >
                <AlertTriangle size={18} className="text-amber-500 shrink-0" />
                <div>
                  <p className="text-[14px] font-medium text-amber-700">경고 부여</p>
                  <p className="text-[11px] text-amber-500">피신고팀에 경고를 부여합니다</p>
                </div>
              </button>

              <button
                onClick={() => setShowSuspendModal(true)}
                className="w-full flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left hover:bg-red-100 transition-colors"
              >
                <Ban size={18} className="text-red-500 shrink-0" />
                <div>
                  <p className="text-[14px] font-medium text-red-700">팀 활동 정지</p>
                  <p className="text-[11px] text-red-500">피신고팀의 활동을 정지합니다</p>
                </div>
              </button>
            </div>

            {/* Summary info */}
            <div className="space-y-3 border-t border-gray-100 pt-4 mt-4">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-gray-400">분쟁 ID</span>
                <span className="text-gray-700 font-mono text-[12px]">{dispute.id}</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-gray-400">유형</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${typeColor[dispute.type]}`}>
                  {typeLabel[dispute.type]}
                </span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-gray-400">접수일</span>
                <span className="text-gray-700">{new Date(dispute.createdAt).toLocaleDateString('ko-KR')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Resolve modal */}
      {showResolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 mx-4 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50">
                <CheckCircle size={20} className="text-green-500" />
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-gray-900">해결 처리</h3>
                <p className="text-[13px] text-gray-400">분쟁을 해결 완료로 표시합니다</p>
              </div>
            </div>
            <p className="text-[14px] text-gray-600 mb-6">
              <span className="font-semibold text-gray-900">{dispute.id}</span> 분쟁을 해결 처리하시겠습니까?
              양팀에 결과가 통보됩니다.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowResolveModal(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[14px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => handleAction('resolve')}
                disabled={processing}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-green-500 py-2.5 text-[14px] font-semibold text-white hover:bg-green-600 transition-colors disabled:opacity-50"
              >
                {processing ? <Loader2 size={14} className="animate-spin" /> : null}
                {processing ? '처리 중...' : '해결 처리'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dismiss modal */}
      {showDismissModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 mx-4 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                <FileText size={20} className="text-gray-500" />
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-gray-900">기각 처리</h3>
                <p className="text-[13px] text-gray-400">신고를 기각합니다</p>
              </div>
            </div>
            <p className="text-[14px] text-gray-600 mb-6">
              <span className="font-semibold text-gray-900">{dispute.id}</span> 신고를 기각하시겠습니까?
              증거 불충분 또는 허위 신고 시 기각 처리됩니다.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowDismissModal(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[14px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => handleAction('dismiss')}
                disabled={processing}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gray-700 py-2.5 text-[14px] font-semibold text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {processing ? <Loader2 size={14} className="animate-spin" /> : null}
                {processing ? '처리 중...' : '기각 처리'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Warn modal */}
      {showWarnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 mx-4 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50">
                <AlertTriangle size={20} className="text-amber-500" />
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-gray-900">경고 부여</h3>
                <p className="text-[13px] text-gray-400">피신고팀에 경고를 부여합니다</p>
              </div>
            </div>
            <p className="text-[14px] text-gray-600 mb-6">
              <span className="font-semibold text-gray-900">{dispute.reportedTeam.name}</span> 팀에 경고를 부여하시겠습니까?
              3회 누적 시 자동 활동 정지됩니다.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowWarnModal(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[14px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => handleAction('warn')}
                disabled={processing}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-[14px] font-semibold text-white hover:bg-amber-600 transition-colors disabled:opacity-50"
              >
                {processing ? <Loader2 size={14} className="animate-spin" /> : null}
                {processing ? '처리 중...' : '경고 부여'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suspend modal */}
      {showSuspendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 mx-4 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
                <Ban size={20} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-gray-900">팀 활동 정지</h3>
                <p className="text-[13px] text-gray-400">이 작업은 즉시 적용됩니다</p>
              </div>
            </div>
            <p className="text-[14px] text-gray-600 mb-6">
              <span className="font-semibold text-gray-900">{dispute.reportedTeam.name}</span> 팀의 활동을 정지하시겠습니까?
              예정된 매치가 모두 취소되며, 새로운 매칭 신청이 불가능합니다.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSuspendModal(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[14px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => handleAction('suspend')}
                disabled={processing}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-500 py-2.5 text-[14px] font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {processing ? <Loader2 size={14} className="animate-spin" /> : null}
                {processing ? '처리 중...' : '활동 정지'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
