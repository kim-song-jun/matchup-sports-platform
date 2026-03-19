'use client';

import { useAuthStore } from '@/stores/auth-store';
import Link from 'next/link';
import { Bell } from 'lucide-react';

export default function NotificationsPage() {
  const { isAuthenticated } = useAuthStore();

  return (
    <div className="pt-[var(--safe-area-top)]">
      <header className="px-5 lg:px-0 pt-4 pb-3">
        <h1 className="text-[22px] font-bold text-gray-900">알림</h1>
      </header>

      <div className="px-5 lg:px-0">
        {!isAuthenticated ? (
          <div className="rounded-2xl bg-gray-50 p-16 text-center">
            <Bell size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-[15px] font-medium text-gray-700">로그인 후 알림을 받아보세요</p>
            <p className="text-[13px] text-gray-400 mt-1">매치 소식과 채팅을 놓치지 마세요</p>
            <Link href="/login" className="mt-4 inline-block rounded-lg bg-blue-500 px-6 py-2.5 text-[14px] font-semibold text-white">
              로그인
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl bg-gray-50 p-16 text-center">
            <Bell size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-[15px] font-medium text-gray-700">새로운 알림이 없어요</p>
            <p className="text-[13px] text-gray-400 mt-1">매치에 참가하면 알림이 도착해요</p>
          </div>
        )}
      </div>
    </div>
  );
}
