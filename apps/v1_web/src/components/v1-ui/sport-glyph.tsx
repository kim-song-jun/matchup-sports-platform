import type { SVGProps } from 'react';

type SportGlyphProps = Omit<SVGProps<SVGSVGElement>, 'viewBox' | 'fill'> & {
  code?: string | null;
  size?: number;
};

/**
 * v1 종목 글리프 — stroke 기반(currentColor)이라 부모 color 를 따라간다.
 * v1 종목: soccer / futsal / running / swimming. 알 수 없는 code 는 기본 원형.
 */
export function SportGlyph({ code, size = 30, ...props }: SportGlyphProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'aria-hidden': true,
    ...props,
  } as const;

  switch (code) {
    case 'soccer':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9.5" strokeWidth="1.5" />
          <polygon points="12,7.5 15,9.7 14,13 10,13 9,9.7" strokeWidth="1.2" />
          <path d="M12 2.5V7.5" strokeWidth="0.9" strokeLinecap="round" />
          <path d="M21 12L15 9.7" strokeWidth="0.9" strokeLinecap="round" />
          <path d="M18.5 18.5L14 13" strokeWidth="0.9" strokeLinecap="round" />
          <path d="M5.5 18.5L10 13" strokeWidth="0.9" strokeLinecap="round" />
          <path d="M3 12L9 9.7" strokeWidth="0.9" strokeLinecap="round" />
        </svg>
      );
    case 'futsal':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9.5" strokeWidth="1.5" />
          <path d="M12 4.5C12 4.5 14.5 8 14.5 10.5C14.5 13 12 14 12 14C12 14 9.5 13 9.5 10.5C9.5 8 12 4.5 12 4.5Z" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M4 10.5L8.8 12.5" strokeWidth="1.1" strokeLinecap="round" />
          <path d="M20 10.5L15.2 12.5" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      );
    case 'running':
      return (
        <svg {...common} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="14.5" cy="4.5" r="2" strokeWidth="1.6" />
          <path d="M15.5 7.5C13.5 9.5 12 10.5 9.5 10.5" strokeWidth="1.6" />
          <path d="M14 8L11.5 12.5L14 14L12.5 19" strokeWidth="1.6" />
          <path d="M11.5 12.5L7.5 15.5" strokeWidth="1.6" />
          <path d="M14.5 9.5L18 11" strokeWidth="1.6" />
        </svg>
      );
    case 'swimming':
      return (
        <svg {...common} strokeLinecap="round">
          <circle cx="17.5" cy="5.5" r="2.2" strokeWidth="1.5" />
          <path d="M3 15.5C5 13.5 7 13.5 9 15.5C11 17.5 13 17.5 15 15.5C17 13.5 19 13.5 21 15.5" strokeWidth="1.5" />
          <path d="M3 19.5C5 17.5 7 17.5 9 19.5C11 21.5 13 21.5 15 19.5C17 17.5 19 17.5 21 19.5" strokeWidth="1.2" />
          <path d="M6 13.5L14 8" strokeWidth="1.5" />
          <path d="M10 10.5L14 13" strokeWidth="1.5" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9.5" strokeWidth="1.5" />
        </svg>
      );
  }
}
