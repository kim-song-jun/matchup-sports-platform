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
      <div className="hidden lg:flex lg:flex-col">
        <Sidebar />
        {/* pl matches sidebar width (w-[240px]) exactly */}
        <main className="pl-[240px] min-h-dvh flex flex-col">
          <div className="@container flex-1 max-w-[960px] mx-auto w-full px-8 py-10">
            {children}
          </div>
          <div className="pl-0 max-w-[960px] mx-auto w-full">
            <Footer />
          </div>
        </main>
      </div>

      {/* Mobile + Tablet: bottom nav */}
      <div className="lg:hidden">
        <div className="@container mobile-shell-atmosphere mx-auto min-h-dvh max-w-3xl overflow-x-clip bg-white shadow-[0_0_40px_rgba(15,23,42,0.04)] dark:bg-gray-900">
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
