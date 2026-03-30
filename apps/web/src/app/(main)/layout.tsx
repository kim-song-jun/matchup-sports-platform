import { BottomNav } from '@/components/layout/bottom-nav';
import { Footer } from '@/components/layout/footer';
import { NotificationSync } from '@/components/layout/notification-sync';
import { Sidebar } from '@/components/layout/sidebar';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="app-main-frame">
      <NotificationSync />
      {/* Desktop: sidebar + content */}
      <div className="hidden lg:block">
        <Sidebar />
        <main className="min-h-dvh pl-[292px] pr-6 py-6">
          <div className="@container shell-container">
            <div className="solid-panel section-shell min-h-[calc(100dvh-3rem)] px-8 py-8">
              {children}
              <Footer />
            </div>
          </div>
        </main>
      </div>

      {/* Mobile + Tablet: bottom nav */}
      <div className="lg:hidden">
        <div className="@container mx-auto min-h-dvh max-w-3xl px-3 pt-3 pb-safe">
          <main className="solid-panel section-shell min-h-[calc(100dvh-0.75rem)] px-4 py-4 sm:px-5 sm:py-5">
            {children}
            <Footer />
          </main>
        </div>
        <BottomNav />
      </div>
    </div>
  );
}
