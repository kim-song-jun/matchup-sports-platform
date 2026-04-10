import { BottomNav } from '@/components/layout/bottom-nav';
import { Footer } from '@/components/layout/footer';
import { Sidebar } from '@/components/layout/sidebar';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div id="main-content" tabIndex={-1} className="min-h-dvh bg-gray-50 dark:bg-gray-900 outline-none">
      {/* Desktop: sidebar + content */}
      <div className="hidden lg:block">
        <Sidebar />
        <main className="pl-[260px] min-h-dvh">
          <div className="@container max-w-[960px] mx-auto px-8 py-10">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile + Tablet: bottom nav */}
      <div className="lg:hidden">
        <div className="@container mx-auto max-w-3xl bg-white dark:bg-gray-900 min-h-dvh shadow-[0_0_40px_rgba(0,0,0,0.04)]">
          <main className="pb-safe">
            {children}
            <Footer />
          </main>
        </div>
        <BottomNav />
      </div>
    </div>
  );
}
