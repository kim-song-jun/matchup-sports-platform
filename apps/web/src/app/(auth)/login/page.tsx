'use client';

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-6">
      {/* Logo */}
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-black text-primary">MatchUp</h1>
        <p className="mt-2 text-text-secondary">
          AI 기반 스포츠 매칭 플랫폼
        </p>
      </div>

      {/* 소셜 로그인 */}
      <div className="w-full max-w-sm space-y-3">
        <button
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#FEE500] px-6 py-4 text-sm font-semibold text-[#191919] transition-transform active:scale-[0.98]"
          onClick={() => {
            // TODO: 카카오 OAuth
          }}
        >
          <KakaoIcon />
          카카오로 시작하기
        </button>

        <button
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#03C75A] px-6 py-4 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
          onClick={() => {
            // TODO: 네이버 OAuth
          }}
        >
          <NaverIcon />
          네이버로 시작하기
        </button>

        <button
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-black px-6 py-4 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
          onClick={() => {
            // TODO: 애플 Sign In
          }}
        >
          <AppleIcon />
          Apple로 시작하기
        </button>
      </div>

      <p className="mt-8 text-center text-xs text-text-secondary">
        계속 진행하면{' '}
        <span className="underline">이용약관</span> 및{' '}
        <span className="underline">개인정보처리방침</span>에 동의합니다.
      </p>
    </div>
  );
}

function KakaoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 3C5.58 3 2 5.82 2 9.28c0 2.23 1.49 4.19 3.72 5.3l-.95 3.5c-.08.29.25.52.5.35l4.14-2.74c.19.01.39.02.59.02 4.42 0 8-2.82 8-6.28S14.42 3 10 3z"
        fill="#191919"
      />
    </svg>
  );
}

function NaverIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M13.5 10.56L6.2 3H3v14h3.5V9.44L13.8 17H17V3h-3.5v7.56z" fill="white" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="white">
      <path d="M14.94 10.42c-.02-2.15 1.76-3.19 1.84-3.24-1-1.47-2.56-1.67-3.12-1.69-1.32-.14-2.59.78-3.26.78-.68 0-1.72-.77-2.83-.75-1.45.02-2.79.85-3.54 2.15-1.51 2.63-.39 6.52 1.09 8.65.72 1.04 1.58 2.21 2.71 2.17 1.09-.04 1.5-.7 2.81-.7 1.31 0 1.69.7 2.83.68 1.17-.02 1.91-1.06 2.62-2.11.83-1.21 1.17-2.38 1.19-2.44-.03-.01-2.28-.87-2.3-3.46l-.04-.04zM12.77 4.05c.6-.72.99-1.73.89-2.73-.86.03-1.9.57-2.52 1.29-.55.64-1.03 1.66-.9 2.64.96.07 1.93-.49 2.53-1.2z" />
    </svg>
  );
}
