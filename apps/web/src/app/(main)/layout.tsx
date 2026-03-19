'use client';

import { BottomNav } from '@/components/layout/bottom-nav';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-white">
      <main className="pb-safe">{children}</main>
      <BottomNav />
    </div>
  );
}
