'use client';

/**
 * 폼/카드를 유지한 채 위에 끼워 넣는 한 줄 에러 배너 — 설정 2화면(연동·후기 정책)이
 * 바이트 단위로 복붙하던 것의 단일 소스. 화면 전체를 대체하는 AdminEmpty(빈/에러
 * 상태)와 용도가 다르다: 조회 실패여도 폼 골격은 계속 보여야 하는 설정형 화면용.
 */
export function AdminInlineError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="mt-4 rounded-xl bg-[var(--red50)] px-3 py-2 text-[length:var(--font-size-caption)] text-[var(--red700)]">
      {message}
      <button
        type="button"
        onClick={onRetry}
        className="ml-2 font-semibold underline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
      >
        다시 시도
      </button>
    </div>
  );
}
