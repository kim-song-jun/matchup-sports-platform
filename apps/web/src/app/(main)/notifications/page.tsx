'use client';

export default function NotificationsPage() {
  return (
    <div className="px-5 pt-[var(--safe-area-top)]">
      <header className="py-4">
        <h1 className="text-xl font-bold">알림</h1>
      </header>

      <div className="text-center py-20 text-text-secondary">
        <p className="text-lg">🔔</p>
        <p className="mt-2 text-sm">새로운 알림이 없어요</p>
      </div>
    </div>
  );
}
