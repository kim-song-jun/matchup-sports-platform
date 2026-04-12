import Link from 'next/link';

export function LandingFooter() {
  return (
    <footer className="bg-gray-50 dark:bg-gray-900 py-8 sm:py-10 border-t border-gray-100 dark:border-gray-800">
      <div className="max-w-[1100px] mx-auto px-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center">
              <span className="text-white font-bold text-xs">T</span>
            </div>
            <span className="font-semibold text-gray-900 dark:text-white text-md">TeamMeet</span>
          </Link>
          <div className="flex items-center gap-4">
            <a href="#" className="min-h-[44px] inline-flex items-center text-xs text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">이용약관</a>
            <a href="#" className="min-h-[44px] inline-flex items-center text-xs text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">개인정보처리방침</a>
          </div>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">&copy; 2026 TeamMeet. All rights reserved.</p>
      </div>
    </footer>
  );
}
