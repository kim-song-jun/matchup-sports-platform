'use client';

import { useAuthStore } from '@/stores/auth-store';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';

export default function NotificationsPage() {
  const { isAuthenticated } = useAuthStore();
  const { toast } = useToast();

  return (
    <div className="pt-[var(--safe-area-top)]">
      <header className="px-5 lg:px-0 pt-4 pb-3 flex items-center justify-between">
        <h1 className="text-[22px] font-bold text-gray-900">알림</h1>
        {isAuthenticated && (
          <button
            onClick={async () => {
              try {
                await api.patch('/notifications/read-all');
                toast('success', '모든 알림을 읽음 처리했습니다');
              } catch {
                toast('info', '읽을 알림이 없습니다');
              }
            }}
            className="text-[13px] text-blue-500 font-medium"
          >
            모두 읽음
          </button>
        )}
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
