const px = (value) => `${value}px`;

const spacing = {
  0: '0',
  1: px(4),
  2: px(8),
  3: px(12),
  4: px(16),
  5: px(20),
  6: px(24),
  7: px(28),
  8: px(32),
  10: px(40),
  11: px(44),
  12: px(48),
  14: px(56),
  16: px(64),
  20: px(80),
  24: px(96),
};

module.exports = {
  content: [
    './Teameet Design.html',
    './lib/**/*.{js,jsx}',
    './tailwind.teameet.css',
    '../../../../../apps/web/src/**/*.{ts,tsx}',
  ],
  safelist: [
    { pattern: /^tm-/ },
    { pattern: /^text-(10|11|12|13|14|15|16|17|18|20|24|30|36)$/ },
    { pattern: /^bg-(blue|grey|red|green|orange)-(50|100|150|200|300|400|500|600|700|800|900)$/ },
  ],
  theme: {
    screens: {
      mobile: '375px',
      tablet: '768px',
      desktop: '1024px',
      wide: '1280px',
    },
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#ffffff',
      black: '#000000',
      blue: {
        50: '#e8f3ff',
        100: '#d6e7ff',
        200: '#a8cdff',
        400: '#4792f7',
        500: '#3182f6',
        600: '#2272eb',
        700: '#1b64da',
      },
      grey: {
        50: '#f9fafb',
        100: '#f2f4f6',
        150: '#eaedf0',
        200: '#e5e8eb',
        300: '#d1d6db',
        400: '#b0b8c1',
        500: '#8b95a1',
        600: '#6b7684',
        700: '#4e5968',
        800: '#333d4b',
        900: '#191f28',
      },
      red: {
        50: '#feebec',
        500: '#f04452',
      },
      green: {
        50: '#e3f8ef',
        500: '#03b26c',
      },
      orange: {
        50: '#fff3e0',
        500: '#fe9800',
      },
      yellow: {
        500: '#ffc342',
      },
      teal: {
        500: '#18a5a5',
      },
      purple: {
        500: '#a234c7',
      },
      admin: {
        sidebar: '#111827',
        sidebarHover: '#1f2937',
        sidebarText: '#e5e7eb',
        sidebarMuted: '#94a3b8',
      },
    },
    spacing,
    borderRadius: {
      none: '0',
      sm: px(8),
      md: px(12),
      lg: px(14),
      xl: px(16),
      '2xl': px(20),
      shell: px(28),
      full: '9999px',
    },
    fontFamily: {
      sans: ['Pretendard', '-apple-system', 'BlinkMacSystemFont', 'Apple SD Gothic Neo', 'Noto Sans KR', 'sans-serif'],
      tabular: ['SF Mono', 'ui-monospace', 'Menlo', 'monospace'],
    },
    fontSize: {
      10: [px(10), { lineHeight: px(14) }],
      11: [px(11), { lineHeight: px(15) }],
      12: [px(12), { lineHeight: px(18) }],
      13: [px(13), { lineHeight: px(19) }],
      14: [px(14), { lineHeight: px(20) }],
      15: [px(15), { lineHeight: px(22) }],
      16: [px(16), { lineHeight: px(24) }],
      17: [px(17), { lineHeight: px(26) }],
      18: [px(18), { lineHeight: px(26) }],
      20: [px(20), { lineHeight: px(28) }],
      24: [px(24), { lineHeight: px(32) }],
      30: [px(30), { lineHeight: px(36) }],
      36: [px(36), { lineHeight: px(44) }],
    },
    fontWeight: {
      normal: '400',
      semibold: '600',
      bold: '700',
      extrabold: '800',
    },
    boxShadow: {
      none: 'none',
      sm: '0 1px 3px rgba(0,0,0,.06)',
      md: '0 2px 8px rgba(0,0,0,.08)',
      lg: '0 4px 12px rgba(0,0,0,.10)',
    },
    transitionDuration: {
      fast: '120ms',
      base: '180ms',
      slow: '280ms',
    },
    transitionTimingFunction: {
      'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
      'out-quint': 'cubic-bezier(0.22, 1, 0.36, 1)',
      'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
    },
    keyframes: {
      'tm-enter-up': {
        from: { opacity: '0', transform: 'translateY(8px)' },
        to: { opacity: '1', transform: 'translateY(0)' },
      },
      'tm-sheet-up': {
        from: { opacity: '0', transform: 'translateY(20px)' },
        to: { opacity: '1', transform: 'translateY(0)' },
      },
    },
    animation: {
      'tm-enter': 'tm-enter-up 280ms cubic-bezier(0.22, 1, 0.36, 1) both',
      'tm-sheet': 'tm-sheet-up 280ms cubic-bezier(0.16, 1, 0.3, 1) both',
    },
  },
  plugins: [],
};
