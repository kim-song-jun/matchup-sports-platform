'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, MapPin, Calendar, Clock, CheckCircle2, Camera,
  Loader2, Navigation, AlertTriangle, Radio,
} from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';

type GpsStatus = 'searching' | 'in_range' | 'out_of_range';
type ArrivalStatus = 'pending' | 'arrived' | 'late';
type OpponentArrival = 'normal' | 'late' | 'absent' | '';

// Mock match data
const mockMatch = {
  id: 'tm-001',
  title: '서울 FC vs 강남 유나이티드',
  matchDate: '2026-03-22',
  startTime: '14:00',
  endTime: '16:00',
  venueName: '서울숲 풋살파크 A구장',
  venueAddress: '서울특별시 성동구 뚝섬로 273',
  hostTeam: { name: '서울 FC', logo: null },
  awayTeam: { name: '강남 유나이티드', logo: null },
};

const timelineData = [
  { team: '서울 FC', status: 'arrived' as ArrivalStatus, time: '13:35', note: '' },
  { team: '강남 유나이티드', status: 'pending' as ArrivalStatus, time: null, note: '' },
];

export default function ArrivalCheckPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const id = params.id as string;

  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('searching');
  const [myArrival, setMyArrival] = useState<ArrivalStatus>('pending');
  const [opponentStatus, setOpponentStatus] = useState<OpponentArrival>('');
  const [opponentNote, setOpponentNote] = useState('');
  const [photoTaken, setPhotoTaken] = useState(false);
  const [timeUntilMatch, setTimeUntilMatch] = useState('');
  const [timeline, setTimeline] = useState(timelineData);

  // Simulate GPS detection
  useEffect(() => {
    const timer = setTimeout(() => {
      setGpsStatus('in_range');
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // Countdown timer
  useEffect(() => {
    function updateTimer() {
      const matchStart = new Date(`${mockMatch.matchDate}T${mockMatch.startTime}:00`);
      const now = new Date();
      const diff = matchStart.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeUntilMatch('경기 시작!');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (hours > 0) {
        setTimeUntilMatch(`${hours}시간 ${minutes}분 ${seconds}초`);
      } else {
        setTimeUntilMatch(`${minutes}분 ${seconds}초`);
      }
    }

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, []);

  async function handleArrivalConfirm() {
    try {
      await api.post(`/team-matches/${id}/check-in`);
      setMyArrival('arrived');
      setTimeline((prev) =>
        prev.map((item) =>
          item.team === mockMatch.awayTeam.name
            ? {
                ...item,
                status: 'arrived' as ArrivalStatus,
                time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
              }
            : item,
        ),
      );
      toast('success', '도착 인증 완료!');
    } catch {
      toast('error', '도착 인증에 실패했어요. 다시 시도해주세요');
    }
  }

  function handlePhotoCapture() {
    setPhotoTaken(true);
  }

  const gpsConfig: Record<GpsStatus, { icon: React.ReactNode; text: string; className: string }> = {
    searching: {
      icon: <Loader2 size={18} className="animate-spin" />,
      text: '현재 위치 확인 중...',
      className: 'bg-amber-50 border-amber-100 text-amber-700',
    },
    in_range: {
      icon: <Navigation size={18} />,
      text: '구장 반경 500m 이내',
      className: 'bg-green-50 border-green-100 text-green-700',
    },
    out_of_range: {
      icon: <AlertTriangle size={18} />,
      text: '구장 반경 밖입니다',
      className: 'bg-red-50 border-red-100 text-red-600',
    },
  };

  const gps = gpsConfig[gpsStatus];

  return (
    <div className="pt-[var(--safe-area-top)] animate-fade-in">
      {/* Header */}
      <header className="px-5 @3xl:px-0 pt-4 pb-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          aria-label="뒤로 가기"
          className="flex items-center justify-center min-h-11 min-w-11 rounded-lg text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">도착 인증</h1>
      </header>

      <div className="px-5 @3xl:px-0 @3xl:max-w-2xl @3xl:mx-auto">
        {/* Match info header card */}
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 mb-4">
          <h2 className="text-md font-semibold text-gray-900 dark:text-white mb-3">{mockMatch.title}</h2>
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 text-sm text-gray-600">
              <Calendar size={14} className="text-gray-500 shrink-0" />
              <span>{mockMatch.matchDate}</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-gray-600">
              <Clock size={14} className="text-gray-500 shrink-0" />
              <span>{mockMatch.startTime} ~ {mockMatch.endTime}</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-gray-600">
              <MapPin size={14} className="text-gray-500 shrink-0" />
              <span>{mockMatch.venueName}</span>
            </div>
          </div>
        </div>

        {/* Timer */}
        <div className="rounded-2xl bg-gray-900 p-5 mb-4 text-center">
          <p className="text-xs text-gray-500 mb-1">경기 시작까지</p>
          <p className="text-3xl font-bold text-white tracking-wide">{timeUntilMatch || '--:--'}</p>
        </div>

        {/* GPS Status */}
        <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 mb-4 ${gps.className}`}>
          {gps.icon}
          <span className="text-base font-medium">{gps.text}</span>
        </div>

        {/* Arrival Confirm Button */}
        {myArrival === 'pending' ? (
          <button
            onClick={handleArrivalConfirm}
            disabled={gpsStatus !== 'in_range'}
            className="w-full rounded-2xl bg-blue-500 py-5 text-xl font-bold text-white hover:bg-blue-600 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors mb-4 flex items-center justify-center gap-3 "
          >
            <CheckCircle2 size={24} />
            도착 완료
          </button>
        ) : (
          <div className="rounded-2xl bg-green-50 border border-green-100 p-5 mb-4 text-center">
            <CheckCircle2 size={32} className="mx-auto text-green-500 mb-2" />
            <p className="text-lg font-bold text-green-700">도착 인증 완료</p>
            <p className="text-sm text-green-500 mt-0.5">
              {new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 인증됨
            </p>
          </div>
        )}

        {/* Photo upload */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 mb-4">
          <h3 className="text-md font-semibold text-gray-900 dark:text-white mb-3">현장 사진</h3>
          {!photoTaken ? (
            <button
              type="button"
              onClick={handlePhotoCapture}
              className="w-full flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-200 py-8 text-gray-500 hover:border-blue-300 hover:text-blue-400 transition-colors"
            >
              <Camera size={32} />
              <span className="text-sm font-medium">사진 촬영 또는 선택</span>
            </button>
          ) : (
            <div className="flex items-center gap-3 rounded-xl bg-green-50 px-4 py-3">
              <CheckCircle2 size={18} className="text-green-500" />
              <span className="text-base text-green-700 font-medium">사진이 첨부되었습니다</span>
            </div>
          )}
        </div>

        {/* Opponent Status */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 mb-4">
          <h3 className="text-md font-semibold text-gray-900 dark:text-white mb-3">상대팀 도착 확인</h3>
          <div className="space-y-2.5">
            {[
              { value: 'normal' as const, label: '정상도착', color: 'text-green-600' },
              { value: 'late' as const, label: '지각', color: 'text-amber-600' },
              { value: 'absent' as const, label: '미도착', color: 'text-red-500' },
            ].map((option) => (
              <label
                key={option.value}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer transition-colors ${
                  opponentStatus === option.value
                    ? 'bg-blue-50 border border-blue-200'
                    : 'bg-gray-50 dark:bg-gray-700 border border-transparent hover:bg-gray-100'
                }`}
              >
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                    opponentStatus === option.value
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-gray-300'
                  }`}
                >
                  {opponentStatus === option.value && (
                    <div className="h-2 w-2 rounded-full bg-white dark:bg-gray-800" />
                  )}
                </div>
                <input
                  type="radio"
                  name="opponentStatus"
                  value={option.value}
                  checked={opponentStatus === option.value}
                  onChange={(e) => setOpponentStatus(e.target.value as OpponentArrival)}
                  className="sr-only"
                />
                <span className={`text-base font-medium ${option.color}`}>{option.label}</span>
              </label>
            ))}
          </div>

          {/* Note for issues */}
          {(opponentStatus === 'late' || opponentStatus === 'absent') && (
            <div className="mt-4">
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                특이사항
              </label>
              <input
                type="text"
                value={opponentNote}
                onChange={(e) => setOpponentNote(e.target.value)}
                placeholder="지각/미도착 사유를 입력해주세요"
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base text-gray-900 dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-colors"
              />
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 mb-8">
          <h3 className="text-md font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Radio size={16} className="text-blue-500" />
            도착 현황
          </h3>
          <div className="space-y-0">
            {timeline.map((item, idx) => (
              <div key={item.team} className="flex gap-3">
                {/* Timeline dot + line */}
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full shrink-0 ${
                      item.status === 'arrived'
                        ? 'bg-green-500'
                        : item.status === 'late'
                          ? 'bg-amber-500'
                          : 'bg-gray-200'
                    }`}
                  >
                    {item.status === 'arrived' ? (
                      <CheckCircle2 size={16} className="text-white" />
                    ) : (
                      <Clock size={14} className="text-gray-500" />
                    )}
                  </div>
                  {idx < timeline.length - 1 && (
                    <div className="w-0.5 h-8 bg-gray-100" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 pb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-semibold text-gray-900 dark:text-white">{item.team}</span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                        item.status === 'arrived'
                          ? 'bg-green-50 text-green-600'
                          : item.status === 'late'
                            ? 'bg-amber-50 text-amber-600'
                            : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {item.status === 'arrived'
                        ? '도착 완료'
                        : item.status === 'late'
                          ? '지각'
                          : '대기중'}
                    </span>
                  </div>
                  {item.time && (
                    <p className="text-xs text-gray-500 mt-0.5">{item.time} 도착</p>
                  )}
                  {item.note && (
                    <p className="text-xs text-gray-500 mt-0.5">{item.note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
