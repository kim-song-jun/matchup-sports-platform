'use client';

import { useRouter, usePathname } from 'next/navigation';

export function LocaleSwitcher() {
  const router = useRouter();
  const pathname = usePathname();

  const switchLocale = (locale: string) => {
    const segments = pathname.split('/');
    segments[1] = locale;
    router.push(segments.join('/'));
  };

  const currentLocale = pathname.split('/')[1] || 'ko';

  return (
    <button
      onClick={() => switchLocale(currentLocale === 'ko' ? 'en' : 'ko')}
      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
      aria-label="언어 변경"
    >
      {currentLocale === 'ko' ? 'EN' : '한국어'}
    </button>
  );
}
