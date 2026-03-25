import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-5 text-center">
      <div className="text-[64px] font-black text-gray-200 mb-2">404</div>
      <h2 className="text-[20px] font-bold text-gray-900 mb-2">페이지를 찾을 수 없어요</h2>
      <p className="text-[14px] text-gray-500 mb-6">
        요청하신 페이지가 존재하지 않거나 이동되었어요.
      </p>
      <Link
        href="/home"
        className="rounded-xl bg-blue-500 px-6 py-3 text-[14px] font-bold text-white hover:bg-blue-600 transition-colors"
      >
        홈으로 돌아가기
      </Link>
    </div>
  );
}
