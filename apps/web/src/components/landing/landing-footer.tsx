import Link from 'next/link';

const SERVICE_LINKS = [
  { href: '/guide', label: '이용 가이드' },
  { href: '/pricing', label: '요금 안내' },
  { href: '/faq', label: '자주 묻는 질문' },
] as const;

const COMPANY_LINKS: { href: string; label: string }[] = [
  { href: '/about', label: '서비스 소개' },
  { href: '#', label: '이용약관' },
  { href: '#', label: '개인정보처리방침' },
];

export function LandingFooter() {
  return (
    <footer className="bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
      <div className="max-w-[1100px] mx-auto px-5">

        {/* Main grid */}
        <div className="py-12 sm:py-14 grid grid-cols-2 sm:grid-cols-[2fr_1fr_1fr] gap-10">

          {/* Brand */}
          <div className="col-span-2 sm:col-span-1">
            <Link href="/" className="inline-flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
                <span className="text-white font-black text-sm">T</span>
              </div>
              <span className="font-bold text-lg text-gray-900 dark:text-white tracking-tight">TeamMeet</span>
            </Link>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-[240px]">
              AI 기반 스포츠 매칭 플랫폼.<br />
              같이 운동할 사람, 찾아드려요.
            </p>
            <Link
              href="/login"
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-500 hover:text-blue-600 transition-colors"
            >
              무료로 시작하기
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M3 7H11M8 4L11 7L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>

          {/* Service links */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-4">서비스</h3>
            <ul className="space-y-3">
              {SERVICE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company links */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-4">회사</h3>
            <ul className="space-y-3">
              {COMPANY_LINKS.map((link) => (
                <li key={link.label}>
                  {link.href === '#' ? (
                    <a
                      href={link.href}
                      className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-gray-100 dark:border-gray-800 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <p className="text-xs text-gray-400 dark:text-gray-500">&copy; 2026 TeamMeet. All rights reserved.</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">11개 종목 · AI 스포츠 매칭</p>
        </div>

      </div>
    </footer>
  );
}
