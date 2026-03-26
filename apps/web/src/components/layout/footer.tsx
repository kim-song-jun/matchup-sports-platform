'use client';

export function Footer() {
  return (
    <footer className="border-t border-gray-100 dark:border-gray-800 py-6 mt-4">
      <div className="px-5 text-center">
        <p className="text-[11px] text-gray-500">© 2026 TeamMeet. All rights reserved.</p>
        <div className="flex items-center justify-center gap-3 mt-2 text-[11px] text-gray-500">
          <a href="/settings/terms" className="hover:text-gray-600">이용약관</a>
          <span>·</span>
          <a href="/settings/privacy" className="hover:text-gray-600">개인정보처리방침</a>
        </div>
      </div>
    </footer>
  );
}
