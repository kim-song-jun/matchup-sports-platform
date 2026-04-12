interface AppErrorScreenProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function AppErrorScreen({
  title,
  message,
  actionLabel = '다시 시도하기',
  onAction,
}: AppErrorScreenProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-5 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-500 dark:bg-red-900/20">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h2 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
      <p className="mb-6 max-w-sm text-base text-gray-500 dark:text-gray-400">{message}</p>
      {onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="rounded-xl bg-blue-500 px-6 py-3 text-base font-bold text-white transition-[background-color,transform] duration-200 hover:bg-blue-600 active:scale-[0.98]"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
