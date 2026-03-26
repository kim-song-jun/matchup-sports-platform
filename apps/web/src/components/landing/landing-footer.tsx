import Link from 'next/link';

const FOOTER_LINKS = [
  { href: '/guide', label: '이용 가이드' },
  { href: '/pricing', label: '요금 안내' },
  { href: '/faq', label: 'FAQ' },
  { href: '/about', label: '소개' },
];

export function LandingFooter() {
  return (
    <footer className="bg-gray-950 dark:bg-black py-10 sm:py-12 border-t border-gray-800">
      <div className="max-w-[1100px] mx-auto px-5">
        {/* Top: Logo + Page Links */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-8">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center">
              <span className="text-white font-bold text-[12px]">M</span>
            </div>
            <span className="font-semibold text-white text-[15px]">TeamMeet</span>
          </Link>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
            {FOOTER_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="text-gray-500 hover:text-gray-200 active:text-white transition-colors">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        {/* Bottom: Legal + Copyright */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-6 border-t border-gray-800">
          <div className="flex items-center gap-4 text-[12px] text-gray-500">
            <a href="#" className="hover:text-gray-300 transition-colors">이용약관</a>
            <a href="#" className="hover:text-gray-300 transition-colors">개인정보처리방침</a>
          </div>
          <p className="text-[12px] text-gray-500">&copy; 2026 TeamMeet. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
