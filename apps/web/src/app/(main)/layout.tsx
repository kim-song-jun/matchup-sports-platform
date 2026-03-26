import { BottomNav } from '@/components/layout/bottom-nav';
import { Footer } from '@/components/layout/footer';
import { Sidebar } from '@/components/layout/sidebar';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-gray-50">
      {/* Desktop: sidebar + content */}
      <div className="hidden lg:block">
        <Sidebar />
        <main className="pl-[260px] min-h-dvh">
          <div className="max-w-[960px] mx-auto px-8 py-10">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile: bottom nav */}
      <div className="lg:hidden">
        <div className="mx-auto max-w-lg bg-white min-h-dvh shadow-[0_0_40px_rgba(0,0,0,0.04)]">
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
