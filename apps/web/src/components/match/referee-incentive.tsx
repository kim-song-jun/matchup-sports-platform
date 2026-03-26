'use client';

import { useState } from 'react';
import { Shield, Star, Ticket, Gift, ChevronRight, Check } from 'lucide-react';

interface RefereeIncentiveProps {
  currentProgress?: number;
  totalRequired?: number;
}

export function RefereeIncentive({
  currentProgress = 3,
  totalRequired = 5,
}: RefereeIncentiveProps) {
  const [applied, setApplied] = useState(false);

  const progressPercent = (currentProgress / totalRequired) * 100;

  return (
    <div className="rounded-2xl bg-white border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-gray-50 px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100">
            <Shield size={14} className="text-blue-500" />
          </div>
          <h3 className="text-[14px] font-bold text-gray-900">이번 경기 심판을 맡으면</h3>
        </div>
      </div>

      {/* Rewards */}
      <div className="px-4 py-3 space-y-3">
        {/* Manner points */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100">
            <Star size={14} className="text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-medium text-gray-800">매너 포인트</p>
            <p className="text-[12px] text-gray-500">심판 활동 보상</p>
          </div>
          <span className="text-[14px] font-bold text-blue-500">+50</span>
        </div>

        {/* Badge progress */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100">
            <Gift size={14} className="text-gray-500" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-medium text-gray-800">심판 영웅 뱃지 진행도</p>
            <div className="flex items-center gap-2 mt-1">
              <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-[11px] font-semibold text-blue-500 shrink-0">
                {currentProgress}/{totalRequired}
              </span>
            </div>
          </div>
        </div>

        {/* Coupon */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50">
            <Ticket size={14} className="text-blue-500" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-medium text-gray-800">다음 경기 할인 쿠폰</p>
            <p className="text-[12px] text-gray-500">바로 사용 가능</p>
          </div>
          <span className="text-[13px] font-bold text-blue-500">500원</span>
        </div>
      </div>

      {/* CTA */}
      <div className="px-4 pb-4 pt-1">
        <button
          onClick={() => setApplied(true)}
          disabled={applied}
          className={`w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold transition-colors ${
            applied
              ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
              : 'bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700'
          }`}
        >
          {applied ? (
            <>
              <Check size={16} />
              지원 완료
            </>
          ) : (
            <>
              <Shield size={16} />
              심판 지원하기
              <ChevronRight size={14} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
