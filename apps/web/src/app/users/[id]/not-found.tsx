import Link from 'next/link';

export default function UserNotFound() {
  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center px-5 py-12 text-center pt-[var(--safe-area-top)]">
      <div
        className="h-20 w-20 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-6 text-3xl"
        aria-hidden="true"
      >
        👤
      </div>
      <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
        존재하지 않는 사용자예요
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        탈퇴했거나 잘못된 링크일 수 있어요
      </p>
      <Link
        href="/home"
        className="inline-flex items-center gap-2 rounded-2xl bg-blue-500 hover:bg-blue-600 min-h-[44px] px-6 py-2.5 text-sm font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        홈으로 가기
      </Link>
    </div>
  );
}
