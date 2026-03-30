import Link from 'next/link';

export function LandingFooter() {
  return (
    <footer className="border-t border-white/10 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-[1180px] px-5 py-10 sm:py-12">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/10 backdrop-blur-md">
              <span className="text-sm font-black tracking-[0.22em] text-white">MU</span>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-200/80">MatchUp</p>
              <p className="text-base font-semibold text-white">스포츠 매칭 플랫폼</p>
            </div>
          </Link>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <Link href="/settings/terms" className="min-h-[44px] inline-flex items-center transition-colors hover:text-white">
              이용약관
            </Link>
            <Link href="/settings/privacy" className="min-h-[44px] inline-flex items-center transition-colors hover:text-white">
              개인정보처리방침
            </Link>
          </div>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-slate-500">
          &copy; 2026 MatchUp. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
