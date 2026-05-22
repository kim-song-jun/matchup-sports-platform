'use client';
import React from 'react';


/* Source: docs\reference\handoff-sm-new-direction\sports-platform\project\lib\tokens.jsx */

/* Teameet design tokens — Toss-based */
const TokensCSS = () => (
  <style>{`
    :root {
      /* Static foregrounds for text/icons on brand or media surfaces */
      --static-white: #ffffff;
      --static-black: #000000;

      /* Brand — UI blue */
      --blue50:  #e8f3ff;
      --blue100: #d6e7ff;
      --blue200: #a8cdff;
      --blue400: #4792f7;
      --blue500: #3182f6;
      --blue600: #2272eb;
      --blue700: #1b64da;

      /* Greys (warm) */
      --grey50:  #f9fafb;
      --grey100: #f2f4f6;
      --grey150: #eaedf0;
      --grey200: #e5e8eb;
      --grey300: #d1d6db;
      --grey400: #b0b8c1;
      --grey500: #8b95a1;
      --grey600: #6b7684;
      --grey700: #4e5968;
      --grey800: #333d4b;
      --grey900: #191f28;

      /* Semantic */
      --red500:   #f04452;
      --red50:    #feebec;
      --green500: #03b26c;
      --green50:  #e3f8ef;
      --orange500:#fe9800;
      --orange50: #fff3e0;
      --yellow500:#ffc342;
      --teal500:  #18a5a5;
      --purple500:#a234c7;
      --blue-alpha-08: rgba(49,130,246,.08);
      --blue-alpha-10: rgba(49,130,246,.10);
      --red-alpha-08: rgba(240,68,82,.08);
      --purple-alpha-10: rgba(162,52,199,.10);

      /* Surfaces */
      --bg: #ffffff;
      --bg-surface: #f2f4f6;
      --border: #e5e8eb;
      --border-strong: #d1d6db;

      /* Text */
      --text-strong: #191f28;
      --text: #4e5968;
      --text-muted: #6b7684;
      --text-caption: #8b95a1;
      --text-placeholder: #b0b8c1;

      /* Radii */
      --r-sm: 8px;
      --r-md: 12px;
      --r-lg: 16px;
      --r-pill: 9999px;

      /* Type scale */
      --fs-display: 36px;
      --fs-title: 30px;
      --fs-heading: 24px;
      --fs-subhead: 20px;
      --fs-body-lg: 17px;
      --fs-body: 15px;
      --fs-label: 13px;
      --fs-caption: 12px;
      --fs-micro: 11px;
      --lh-display: 44px;
      --lh-title: 36px;
      --lh-heading: 32px;
      --lh-subhead: 28px;
      --lh-body-lg: 26px;
      --lh-body: 22px;
      --lh-label: 19px;
      --lh-caption: 18px;
      --lh-micro: 15px;

      /* Spacing */
      --space-1: 4px;
      --space-2: 8px;
      --space-3: 12px;
      --space-4: 16px;
      --space-5: 20px;
      --space-6: 24px;
      --space-8: 32px;
      --space-10: 40px;

      /* Controls */
      --control-sm: 40px;
      --control-md: 48px;
      --control-lg: 56px;
      --control-xl: 64px;
      --control-icon: 44px;
      --control-radius: 12px;
      --control-gap: 8px;

      /* Motion */
      --dur-fast: 120ms;
      --dur-base: 180ms;
      --dur-slow: 280ms;

      /* Shadows */
      --sh-1: 0 1px 3px rgba(0,0,0,.06);
      --sh-2: 0 2px 8px rgba(0,0,0,.08);
      --sh-3: 0 4px 12px rgba(0,0,0,.10);
      --sh-4: 0 8px 24px rgba(0,0,0,.12);

      --font: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
      --font-tab: 'SF Mono', ui-monospace, Menlo, monospace;
      --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
      --ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);
      --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
    }

    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; font-family: var(--font); color: var(--text-strong); background: var(--bg); -webkit-font-smoothing: antialiased; }
    #root, .dc-stage, .dc-section, .dc-board, .dc-card { min-width: 0; }
    .dc-card, .dc-card * { min-width: 0; }
    .dc-card { word-break: keep-all; overflow-wrap: break-word; }
    button { font-family: inherit; cursor: pointer; border: none; background: none; padding: 0; color: inherit; }
    button, [role="button"] { white-space: normal; line-height: 1.2; }
    button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible {
      outline: 2px solid var(--blue500);
      outline-offset: 2px;
    }
    button:disabled { cursor: not-allowed; }
    input, textarea, select { font-family: inherit; }
    .tm-text-display { font-size: var(--fs-display); line-height: var(--lh-display); font-weight: 700; letter-spacing: 0; color: var(--text-strong); }
    .tm-text-title { font-size: var(--fs-title); line-height: var(--lh-title); font-weight: 700; letter-spacing: 0; color: var(--text-strong); }
    .tm-text-heading { font-size: var(--fs-heading); line-height: var(--lh-heading); font-weight: 700; letter-spacing: 0; color: var(--text-strong); }
    .tm-text-subhead { font-size: var(--fs-subhead); line-height: var(--lh-subhead); font-weight: 700; letter-spacing: 0; color: var(--text-strong); }
    .tm-text-body-lg { font-size: var(--fs-body-lg); line-height: var(--lh-body-lg); font-weight: 600; letter-spacing: 0; color: var(--text-strong); }
    .tm-text-body { font-size: var(--fs-body); line-height: var(--lh-body); font-weight: 400; letter-spacing: 0; color: var(--text); }
    .tm-text-label { font-size: var(--fs-label); line-height: var(--lh-label); font-weight: 600; letter-spacing: 0; color: var(--text); }
    .tm-text-caption { font-size: var(--fs-caption); line-height: var(--lh-caption); font-weight: 400; letter-spacing: 0; color: var(--text-caption); }
    .tm-text-micro { font-size: var(--fs-micro); line-height: var(--lh-micro); font-weight: 600; letter-spacing: 0; color: var(--text-caption); }
    .tab-num { font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }
    .tm-tabular { font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }
    .tm-min-0 { min-width: 0; }
    .tm-break-keep { word-break: keep-all; overflow-wrap: break-word; }
    .line-clamp-2 {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .wrap-safe { overflow-wrap: anywhere; word-break: keep-all; }
    .tm-pressable {
      transition-property: transform, background-color, border-color, color, opacity, box-shadow;
      transition-duration: var(--dur-fast);
      transition-timing-function: var(--ease-out-quart);
      transform: translateZ(0);
    }
    .tm-pressable:active { transform: scale(.98); }
    .tm-btn {
      min-width: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--control-gap);
      border-radius: var(--control-radius);
      font-weight: 600;
      letter-spacing: 0;
      white-space: normal;
      text-align: center;
      user-select: none;
      touch-action: manipulation;
      transition-property: transform, background-color, border-color, color, opacity, box-shadow;
      transition-duration: var(--dur-fast);
      transition-timing-function: var(--ease-out-quart);
      transform: translateZ(0);
    }
    .tm-btn:active { transform: scale(.98); }
    .tm-btn:disabled, .tm-btn[aria-disabled="true"] { opacity: .42; cursor: not-allowed; transform: none; }
    .tm-btn-sm { min-height: var(--control-sm); padding: 0 16px; font-size: 14px; line-height: 18px; }
    .tm-btn-md { min-height: var(--control-md); padding: 0 20px; font-size: 15px; line-height: 20px; }
    .tm-btn-lg { min-height: var(--control-lg); padding: 0 22px; font-size: 16px; line-height: 22px; }
    .tm-btn-xl { min-height: var(--control-xl); padding: 0 24px; font-size: 17px; line-height: 24px; }
    .tm-btn-block { width: 100%; }
    .tm-btn-icon { width: var(--control-icon); min-width: var(--control-icon); height: var(--control-icon); padding: 0; border-radius: 14px; }
    .tm-btn-primary { background: var(--blue500); color: var(--static-white); }
    .tm-btn-secondary { background: var(--blue50); color: var(--blue600); }
    .tm-btn-neutral { background: var(--grey100); color: var(--grey900); }
    .tm-btn-dark { background: var(--grey900); color: var(--static-white); }
    .tm-btn-danger { background: var(--red500); color: var(--static-white); }
    .tm-btn-ghost { background: transparent; color: var(--grey900); }
    .tm-btn-outline { background: var(--bg); color: var(--grey900); border: 1px solid var(--border); }
    .tm-chip {
      min-width: 0;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 36px;
      padding: 0 14px;
      border-radius: var(--r-pill);
      background: var(--grey100);
      color: var(--grey700);
      font-size: 13px;
      line-height: 18px;
      font-weight: 600;
      letter-spacing: 0;
      white-space: nowrap;
      transition: transform var(--dur-fast) var(--ease-out-quart), background-color var(--dur-fast) var(--ease-out-quart), color var(--dur-fast) var(--ease-out-quart);
    }
    .tm-chip:active { transform: scale(.97); }
    .tm-chip-sm { min-height: 30px; padding: 0 12px; font-size: 13px; }
    .tm-chip-active { background: var(--blue500); color: var(--static-white); }
    .tm-badge {
      min-width: 0;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      height: 24px;
      padding: 0 9px;
      border-radius: var(--r-pill);
      font-size: 12px;
      line-height: 1;
      font-weight: 600;
      white-space: nowrap;
      letter-spacing: 0;
    }
    .tm-badge-sm { height: 20px; padding: 0 7px; font-size: 11px; }
    .tm-card {
      min-width: 0;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      transition: transform var(--dur-base) var(--ease-out-quart), border-color var(--dur-base) var(--ease-out-quart), box-shadow var(--dur-base) var(--ease-out-quart);
      word-break: keep-all;
      overflow-wrap: break-word;
    }
    .tm-card-interactive { cursor: pointer; }
    .tm-list-row {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 20px;
      background: var(--bg);
    }
    .tm-input {
      width: 100%;
      min-height: var(--control-md);
      border-radius: var(--control-radius);
      border: 1px solid var(--border);
      background: var(--bg);
      padding: 0 14px;
      font-size: var(--fs-body);
      line-height: var(--lh-body);
      color: var(--text-strong);
    }
    .tm-input::placeholder { color: var(--text-placeholder); }
    .tm-surface-muted { background: var(--grey50); border: 1px solid var(--grey100); border-radius: var(--r-lg); }
    .tm-admin-sidebar { background: #111827; color: #e5e7eb; }
    @media (hover: hover) {
      .tm-btn-primary:hover { background: var(--blue600); }
      .tm-btn-secondary:hover { background: var(--blue100); }
      .tm-btn-neutral:hover { background: var(--grey150); }
      .tm-btn-dark:hover { background: var(--grey800); }
      .tm-btn-danger:hover { background: #dc3545; }
      .tm-btn-outline:hover { border-color: var(--border-strong); background: var(--grey50); }
      .tm-card-interactive:hover { border-color: var(--border-strong); box-shadow: var(--sh-2); }
    }
    @keyframes tm-enter-up {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes tm-sheet-up {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .tm-animate-enter { animation: tm-enter-up var(--dur-slow) var(--ease-out-quint) both; }
    .tm-animate-sheet { animation: tm-sheet-up var(--dur-slow) var(--ease-out-expo) both; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }
  `}</style>
);

/* ---------- Reusable atoms ---------- */
const tmButtonVariant = (variant) => ({
  primary: 'primary',
  dark: 'dark',
  danger: 'danger',
  weak: 'secondary',
  secondary: 'secondary',
  ghost: 'ghost',
  neutral: 'neutral',
  outline: 'outline',
}[variant] || 'primary');

const tmButtonSize = (size) => ({
  tiny: 'sm',
  sm: 'sm',
  md: 'md',
  lg: 'lg',
  xl: 'xl',
}[size] || 'md');

const SBtn = ({ variant = 'primary', size = 'md', full, icon, iconRight, children, onClick, disabled, style, className = '', ...rest }) => {
  const variantClass = tmButtonVariant(variant);
  const sizeClass = tmButtonSize(size);
  return (
    <button
      className={`tm-btn tm-btn-${variantClass} tm-btn-${sizeClass}${full ? ' tm-btn-block' : ''} ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      style={style}
      {...rest}
    >
      {icon}
      <span style={{ minWidth: 0 }}>{children}</span>
      {iconRight}
    </button>
  );
};

const Chip = ({ active, onClick, children, size = 'md', className = '', style }) => (
  <button
    className={`tm-chip${size === 'sm' ? ' tm-chip-sm' : ''}${active ? ' tm-chip-active' : ''} ${className}`.trim()}
    onClick={onClick}
    style={style}
  >{children}</button>
);

const Badge = ({ tone = 'blue', children, size = 'md' }) => {
  const tones = {
    blue:   { bg: 'var(--blue50)',   fg: 'var(--blue500)' },
    red:    { bg: 'var(--red50)',    fg: 'var(--red500)' },
    green:  { bg: 'var(--green50)',  fg: 'var(--green500)' },
    orange: { bg: 'var(--orange50)', fg: 'var(--orange500)' },
    grey:   { bg: 'var(--grey100)',  fg: 'var(--grey700)' },
    dark:   { bg: 'var(--grey900)',  fg: 'var(--static-white)' },
  }[tone] || { bg: 'var(--grey100)', fg: 'var(--grey700)' };
  return (
    <span className={`tm-badge${size === 'sm' ? ' tm-badge-sm' : ''}`} style={{ background: tones.bg, color: tones.fg }}>{children}</span>
  );
};

const Progress = ({ value, max = 100, urgent }) => {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ height: 6, background: 'var(--grey150)', borderRadius: 999, overflow: 'hidden' }}>
      <div style={{
        width: pct + '%', height: '100%',
        background: urgent ? 'var(--red500)' : 'var(--blue500)',
        borderRadius: 999, transition: 'width .3s',
      }} />
    </div>
  );
};

const Card = ({ children, pad = 20, style, onClick, interactive, className = '' }) => (
  <div
    className={`tm-card${interactive || onClick ? ' tm-card-interactive' : ''} ${className}`.trim()}
    onClick={onClick}
    style={{
      padding: pad,
      ...style,
    }}
  >{children}</div>
);

/* status bar for phone frames */
const StatusBar = ({ dark }) => (
  <div style={{
    height: 44, padding: '0 24px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    fontSize: 15, fontWeight: 600,
    color: dark ? 'var(--static-white)' : 'var(--grey900)',
    background: 'transparent',
  }}>
    <span>9:41</span>
    <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
      <svg width="18" height="10" viewBox="0 0 18 10" fill="currentColor"><path d="M1 8 L1 9 M5 6 L5 9 M9 4 L9 9 M13 2 L13 9 M17 0 L17 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
      <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor"><path d="M7.5 3.5 A 5 5 0 0 1 11 5 M7.5 1 A 7.5 7.5 0 0 1 13 3 M7.5 6 A 2.5 2.5 0 0 1 9 6.5 M7.5 8.5 L 7.5 8.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/></svg>
      <svg width="25" height="12" viewBox="0 0 25 12"><rect x="0.5" y="0.5" width="21" height="11" rx="2.5" stroke="currentColor" fill="none" strokeWidth="1"/><rect x="22.5" y="3.5" width="1.5" height="5" rx="0.5" fill="currentColor"/><rect x="2" y="2" width="15" height="8" rx="1" fill="currentColor"/></svg>
    </span>
  </div>
);

/* Phone frame wrapper — 375x812 iPhone-ish */
const Phone = ({ children, title, bg = 'var(--bg)', statusDark }) => (
  <div style={{
    width: 375, height: 812,
    background: bg,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 40,
    border: '1px solid var(--border)',
    boxShadow: '0 18px 36px -22px rgba(0,0,0,.22), 0 10px 16px -14px rgba(0,0,0,.14)',
    display: 'flex', flexDirection: 'column',
  }}>
    <StatusBar dark={statusDark} />
    <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>
  </div>
);

const GLOBAL_BOTTOM_TABS = [
  { id: 'home',        label: '홈',    icon: 'M3 11 L12 3 L21 11 V21 H3 Z' },
  { id: 'matches',     label: '매치',  icon: 'M12 3 L15 9 L21 10 L16 14 L18 21 L12 17 L6 21 L8 14 L3 10 L9 9 Z' },
  { id: 'lessons',     label: '레슨',  icon: 'M5 5h14v14H5z M9 5v14 M15 5v14' },
  { id: 'marketplace', label: '장터',  icon: 'M4 7h16l-1 12H5L4 7z M8 7V5a4 4 0 0 1 8 0v2' },
  { id: 'my',          label: '마이',  icon: 'M12 12 A 4 4 0 1 0 12 4 A 4 4 0 0 0 12 12 M4 21 A 8 8 0 0 1 20 21' },
];

const normalizeNavId = (active) => ({
  match: 'matches',
  venue: 'matches',
  venues: 'matches',
  lesson: 'lessons',
  market: 'marketplace',
  chat: 'my',
}[active] ?? active);

/* tab bar */
const TabBar = ({ active = 'home', onChange }) => {
  const current = normalizeNavId(active);
  return (
    <div style={{
      borderTop: '1px solid var(--border)',
      background: 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(18px)',
      padding: '6px 0 18px',
      display: 'flex', justifyContent: 'space-around',
    }}>
      {GLOBAL_BOTTOM_TABS.map(t => (
        <button key={t.id} onClick={() => onChange?.(t.id)} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          flex: 1, padding: '6px 0',
          color: current === t.id ? 'var(--blue500)' : 'var(--grey400)',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={current === t.id ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d={t.icon}/>
          </svg>
          <span style={{ fontSize: 11, fontWeight: current === t.id ? 700 : 500,
            color: current === t.id ? 'var(--blue500)' : 'var(--grey500)'}}>{t.label}</span>
        </button>
      ))}
    </div>
  );
};

/* Compatibility bar for historical route ids used by earlier refresh boards. */
const BottomNav = ({ active = 'home', onChange }) => {
  const current = normalizeNavId(active);

  return (
    <div style={{
      borderTop: '1px solid var(--border)',
      background: 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(18px)',
      padding: '6px 0 18px',
      display: 'flex',
      justifyContent: 'space-around',
    }}>
      {GLOBAL_BOTTOM_TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange?.(tab.id)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            flex: 1,
            padding: '6px 0',
            color: current === tab.id ? 'var(--blue500)' : 'var(--grey400)',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={current === tab.id ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d={tab.icon}/>
          </svg>
          <span style={{
            fontSize: 11,
            fontWeight: current === tab.id ? 700 : 500,
            color: current === tab.id ? 'var(--blue500)' : 'var(--grey500)',
          }}>{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

/* AppBar */
const AppBar = ({ title, leading, trailing, sub }) => (
  <div style={{
    padding: '8px 20px', height: 56,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: 'var(--bg)', borderBottom: sub ? 'none' : '1px solid transparent',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {leading}
      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)' }}>{title}</div>
    </div>
    <div style={{ display: 'flex', gap: 8 }}>{trailing}</div>
  </div>
);

/* TopNav — back button + title, with optional transparent mode */
const TopNav = ({ title, transparent, trailing, onBack }) => (
  <div style={{
    height: 48, padding: '0 8px',
    display: 'flex', alignItems: 'center',
    background: transparent ? 'transparent' : 'var(--bg)',
    borderBottom: transparent ? 'none' : '1px solid var(--border)',
    position: transparent ? 'absolute' : 'relative',
    top: transparent ? 44 : 'auto',
    left: 0, right: 0, zIndex: 10,
  }}>
    <button onClick={onBack} style={{
      width: 40, height: 40, display: 'grid', placeItems: 'center',
      background: 'transparent', border: 'none', cursor: 'pointer',
      color: transparent ? 'var(--static-white)' : 'var(--text-strong)',
    }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m15 6-6 6 6 6"/>
      </svg>
    </button>
    <div style={{
      flex: 1, fontSize: 16, fontWeight: 700,
      color: transparent ? 'var(--static-white)' : 'var(--text-strong)',
      textAlign: 'center', letterSpacing: 0,
      marginRight: 40,
    }}>{title}</div>
    {trailing && <div style={{ display: 'flex', gap: 4 }}>{trailing}</div>}
  </div>
);

/* Icon helper (inline stroke icons) */
const Icon = ({ name, size = 20, color = 'currentColor', stroke = 1.8 }) => {
  const paths = {
    search:    <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    bell:      <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 21a2 2 0 0 0 4 0"/></>,
    chevR:     <path d="m9 6 6 6-6 6"/>,
    chevL:     <path d="m15 6-6 6 6 6"/>,
    chevD:     <path d="m6 9 6 6 6-6"/>,
    close:     <><path d="M6 6l12 12"/><path d="M18 6 6 18"/></>,
    plus:      <><path d="M12 5v14"/><path d="M5 12h14"/></>,
    pin:       <><path d="M20 10c0 7-8 12-8 12s-8-5-8-12a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></>,
    clock:     <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    people:    <><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><circle cx="17" cy="9" r="3"/><path d="M22 19a5 5 0 0 0-4-4"/></>,
    filter:    <path d="M3 5h18M6 12h12M10 19h4"/>,
    heart:     <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>,
    share:     <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></>,
    check:     <path d="M5 12l5 5L20 7"/>,
    money:     <><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></>,
    shield:    <path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6z"/>,
    calendar:  <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></>,
    menu:      <><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></>,
    soccer:    <><circle cx="12" cy="12" r="9"/><path d="m12 7-4 3 1.5 5h5L16 10z"/><path d="M12 7V3M8 10 4.5 8M16 10l3.5-2M9.5 15 7 19M14.5 15l2.5 4"/></>,
    trophy:    <><path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3M10 13h4v4h-4zM8 21h8"/></>,
    swords:    <><path d="M14 3h7v7M21 3l-9 9"/><path d="m9.5 9.5 5 5"/><path d="M8 21H3v-5"/><path d="m3 21 9-9"/></>,
    ticket:    <><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/><path d="M13 7v10"/></>,
    store:     <><path d="M3 7 5 3h14l2 4v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M5 10v10h14V10"/></>,
    send:      <path d="M21 3 11 13M21 3l-7 18-3-9-9-3z"/>,
    arrow:     <path d="M5 12h14m-6-6 6 6-6 6"/>,
    edit:      <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></>,
    chat:      <path d="M21 12a8 8 0 0 1-12 7l-5 2 2-5A8 8 0 1 1 21 12z"/>,
    star:      <path d="m12 3 3 6 6 1-4.5 4 1 6L12 17l-5.5 3 1-6L3 10l6-1z"/>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }}>
      {paths[name]}
    </svg>
  );
};

Object.assign(globalThis, { TokensCSS, SBtn, Chip, Badge, Progress, Card, Phone, TabBar, BottomNav, GLOBAL_BOTTOM_TABS, AppBar, TopNav, Icon, StatusBar });


/* Source: docs\reference\handoff-sm-new-direction\sports-platform\project\lib\data.jsx */

/* Shared data + images for all Teameet screens */

const IMG = {
  soccer:   'assets/mock/generated/team-huddle.webp',
  futsal:   'assets/mock/generated/futsal-rooftop.webp',
  running:  'assets/mock/sports/soccer-sunrise.svg',
  swimRef:  'assets/mock/sports/swimming-lanes.svg',
  swim:     'assets/mock/sports/swimming-lanes.svg',
  venue1:   'assets/mock/generated/venue-clubhouse.webp',
  venue2:   'assets/mock/generated/venue-lights.webp',
  venue3:   'assets/mock/sports/soccer-sunrise.svg',
  coach1:   'assets/mock/profile/profile-01.svg',
  coach2:   'assets/mock/profile/profile-02.svg',
  coach3:   'assets/mock/profile/profile-03.svg',
  coach4:   'assets/mock/profile/profile-04.svg',
  gear1:    'assets/mock/generated/shoes-display.webp',
  gear2:    'assets/mock/generated/racket-stack.webp',
  gear3:    'assets/mock/generated/gear-flatlay.webp',
  gear4:    'assets/mock/marketplace/gear-flatlay.svg',
  av1: 'assets/mock/profile/profile-05.svg',
  av2: 'assets/mock/profile/profile-06.svg',
  av3: 'assets/mock/profile/profile-07.svg',
  av4: 'assets/mock/profile/profile-08.svg',
  av5: 'assets/mock/profile/profile-09.svg',
  av6: 'assets/mock/profile/profile-10.svg',
  av7: 'assets/mock/profile/profile-11.svg',
  av8: 'assets/mock/profile/profile-12.svg',
  av9: 'assets/mock/profile/profile-01.svg',
};

const SPORTS = [
  { id: 'all',        label: '전체',    emoji: '전' },
  { id: 'soccer',     label: '축구',    emoji: '축', img: IMG.soccer },
  { id: 'futsal',     label: '풋살',    emoji: '풋', img: IMG.futsal },
  { id: 'running',    label: '러닝',    emoji: '런', img: IMG.venue3 },
  { id: 'swim',       label: '수영',    emoji: '수', img: IMG.swim },
];

const MATCHES = [
  { id: 1,  sport: 'soccer',  title: '주말 축구 한 판, 같이 뛰어요', venue: '상암월드컵경기장 보조구장', date: '5월 3일 (토)', time: '14:00', cur: 18, max: 22, fee: 12000, level: '중수', img: IMG.soccer, host: '정민', lvl: '중수' },
  { id: 2,  sport: 'futsal',  title: '수요일 저녁 풋살 매치',       venue: '이태원 풋살파크 A코트', date: '5월 7일 (수)', time: '20:30', cur: 9,  max: 10, fee: 8000,  level: '초보', img: IMG.futsal, host: '지훈', lvl: '초보', urgent: true },
  { id: 3,  sport: 'running', title: '잠실 아침 러닝 크루',         venue: '잠실한강공원', date: '5월 4일 (일)', time: '07:00', cur: 11, max: 15, fee: 5000, level: '입문', img: IMG.venue3, host: '수아', lvl: '입문' },
  { id: 4,  sport: 'swim',    title: '마포 자유수영 레인',          venue: '마포 스포츠센터 수영장', date: '5월 6일 (화)', time: '19:00', cur: 14, max: 20, fee: 6000, level: '중수', img: IMG.swim, host: '소희', lvl: '중수', urgent: true },
];

const TEAM_MATCHES = [
  { id: 1, title: 'FC 발빠른놈들 vs 상대팀 구합니다', sport: '축구', venue: '상암 월드컵 A구장', date: '5월 11일 (일)', time: '09:00', format: '11:11', grade: 'A', pro: 2, cost: 280000, free: false, uniform: '빨강', host: 'FC 발빠른놈들' },
  { id: 2, title: '주말 친선 풋살 상대 찾습니다',      sport: '풋살', venue: '신도림 풋살파크',    date: '5월 12일 (월)', time: '20:00', format: '5:5',   grade: 'B', pro: 0, cost: 80000,  free: true,  uniform: '파랑', host: '다이나믹 FS' },
  { id: 3, title: '평일 저녁 6:6 풋살 교환매치',      sport: '풋살', venue: '잠실종합운동장 풋살장', date: '5월 14일 (수)', time: '19:30', format: '6:6',   grade: 'C', pro: 1, cost: 60000,  free: false, uniform: '검정', host: '퇴근후풋살' },
];

const TEAMS = [
  { id: 1, name: 'FC 발빠른놈들',    sport: '축구',   members: 24, level: 'B', manner: 4.8, logo: '⚽', color: 'var(--blue500)' },
  { id: 2, name: '다이나믹 FS',      sport: '풋살',   members: 14, level: 'B', manner: 4.6, logo: '🔥', color: 'var(--red500)' },
  { id: 3, name: '강남 러너스',      sport: '러닝',   members: 12, level: '중수', manner: 4.9, logo: 'R', color: 'var(--orange500)' },
  { id: 4, name: '마포 스윔',        sport: '수영',   members: 18, level: '초보', manner: 4.7, logo: 'S', color: 'var(--green500)' },
];

const LESSONS = [
  { id: 1, title: '1:1 맞춤 축구 개인레슨', coach: '박준수 코치', img: IMG.coach1, avatar: IMG.av1, price: 60000, unit: '회', venue: '상암 풋볼파크', rating: 4.9, reviews: 128, tags: ['초보', '1:1'] },
  { id: 2, title: '주니어 축구 그룹레슨',    coach: '김지훈 코치', img: IMG.coach2, avatar: IMG.av2, price: 35000, unit: '회', venue: '반포 체육공원', rating: 4.8, reviews: 76,  tags: ['초등', '그룹'] },
  { id: 3, title: '성인 풋살 기초반',        coach: '이민정 코치', img: IMG.coach3, avatar: IMG.av3, price: 45000, unit: '회', venue: '이태원 풋살파크', rating: 4.7, reviews: 54,  tags: ['기초', '그룹'] },
  { id: 4, title: '러닝 자세 집중 원데이',   coach: '최현우 코치', img: IMG.coach4, avatar: IMG.av4, price: 55000, unit: '회', venue: '강남 러닝트랙', rating: 4.9, reviews: 42,  tags: ['원데이'] },
];

const LISTINGS = [
  { id: 1, title: '나이키 머큐리얼 슈퍼플라이 9 (275mm)', price: 180000, img: IMG.gear1, venue: '강남구', cond: '상태 최상', category: '축구화' },
  { id: 2, title: '수영 트레이닝 풀부이 세트', price: 120000, img: IMG.gear2, venue: '서초구', cond: '거의 새것', category: '수영용품' },
  { id: 3, title: '아디다스 프레데터 엣지+ 풋살화',           price: 95000,  img: IMG.gear3, venue: '마포구', cond: '사용감 있음', category: '풋살화' },
  { id: 4, title: '러닝 폼롤러 세트',                       price: 65000,  img: IMG.gear4, venue: '송파구', cond: '새상품', category: '러닝용품' },
];

const VENUES = [
  { id: 1, name: '상암 월드컵경기장 보조구장', type: '축구장',   img: IMG.venue1, address: '서울 마포구 상암동 1-1',  region: '마포', district: '서울', price: 180000, unit: '시간', rating: 4.7, reviews: 234, dist: '2.1km', indoor: false, facilities: ['샤워실', '주차', '라커', '야간조명'], openNow: true, nextSlot: '오늘 18:00' },
  { id: 2, name: '이태원 풋살파크',            type: '풋살장',   img: IMG.venue2, address: '서울 용산구 이태원동 22',  region: '용산', district: '서울', price: 60000,  unit: '시간', rating: 4.5, reviews: 189, dist: '4.8km', indoor: true,  facilities: ['실내', '주차', '샤워실'],              openNow: true, nextSlot: '오늘 20:30' },
  { id: 3, name: '강남 러닝트랙',             type: '러닝장', img: IMG.venue3, address: '서울 강남구 역삼동 723',   region: '강남', district: '서울', price: 25000,  unit: '시간', rating: 4.6, reviews: 92,  dist: '1.3km', indoor: false, facilities: ['야외', '야간조명', '트랙'],            openNow: false, nextSlot: '내일 07:00' },
  { id: 4, name: '잠실종합운동장 수영장',       type: '수영장', img: IMG.swim, address: '서울 송파구 올림픽로 25',   region: '송파', district: '서울', price: 45000,  unit: '시간', rating: 4.8, reviews: 312, dist: '6.2km', indoor: true, facilities: ['레인', '주차', '샤워실', '라커'],   openNow: true, nextSlot: '오늘 16:00' },
  { id: 5, name: '목동 러닝파크',             type: '러닝장', img: IMG.venue3, address: '서울 양천구 목동서로 161', region: '양천', district: '서울', price: 120000, unit: '시간', rating: 4.6, reviews: 78,  dist: '9.4km', indoor: false,  facilities: ['트랙', '라커', '장비대여'],         openNow: false, nextSlot: '내일 21:00' },
  { id: 6, name: '서초체육관 수영장',          type: '수영장', img: IMG.swim, address: '서울 서초구 반포대로 58',  region: '서초', district: '서울', price: 18000,  unit: '시간', rating: 4.4, reviews: 156, dist: '3.5km', indoor: true,  facilities: ['실내', '주차', '샤워실'],               openNow: true, nextSlot: '오늘 19:00' },
];

const REGIONS = [
  { id: 'all',  label: '전체',    count: 48 },
  { id: 'gn',   label: '강남',    count: 12 },
  { id: 'sc',   label: '서초',    count: 8 },
  { id: 'mp',   label: '마포',    count: 6 },
  { id: 'sp',   label: '송파',    count: 7 },
  { id: 'yt',   label: '양천',    count: 3 },
  { id: 'yd',   label: '영등포', count: 5 },
  { id: 'ys',   label: '용산',    count: 4 },
  { id: 'gr',   label: '구로',    count: 3 },
];

const CHATS = [
  { id: 1, name: 'FC 발빠른놈들',      last: '내일 몇 시에 모여요?',          time: '2분 전',  unread: 3, group: true, avatar: IMG.av1, members: 14 },
  { id: 2, name: '박준수 코치',         last: '레슨 장소 공유드렸어요',         time: '15분 전', unread: 0, group: false, avatar: IMG.av1 },
  { id: 3, name: '주말 축구 매치',      last: '수아님이 참가하셨어요',          time: '1시간 전', unread: 1, group: true, avatar: IMG.av3, members: 18 },
  { id: 4, name: '지훈',                last: '라켓 거래 가능하실까요?',        last2: true, time: '어제',  unread: 0, group: false, avatar: IMG.av2 },
  { id: 5, name: '다이나믹 FS',         last: '이번주 연습 공지',              time: '2일 전', unread: 0, group: true, avatar: IMG.av4, members: 12 },
];

const NOTIFS = [
  { id: 1, type: 'match',   title: '매치 참가 확정', body: '주말 축구 한 판 매치 참가가 확정되었어요.', time: '방금 전', unread: true },
  { id: 2, type: 'team',    title: '팀 초대',       body: 'FC 발빠른놈들에서 초대장이 도착했어요.', time: '10분 전', unread: true },
  { id: 3, type: 'pay',     title: '결제 완료',      body: '8,000원이 결제되었어요.', time: '1시간 전', unread: false },
  { id: 4, type: 'chat',    title: '새 메시지',      time: '3시간 전', body: '박준수 코치님이 메시지를 보냈어요.', unread: false },
  { id: 5, type: 'review',  title: '리뷰 받기',      body: '지난 매치 후기를 남겨주세요.', time: '어제', unread: false },
];

Object.assign(globalThis, { IMG, SPORTS, MATCHES, TEAM_MATCHES, TEAMS, LESSONS, LISTINGS, VENUES, REGIONS, CHATS, NOTIFS });


/* Source: docs\reference\handoff-sm-new-direction\sports-platform\project\lib\signatures.jsx */

/* Teameet — Toss-style Signature Components
   The 'Toss DNA' atoms that distinguish this design system:
   - NumberDisplay: large tabular number for hero KPIs
   - MoneyRow: label + amount (right-aligned, tab-num)
   - KPIStat: stacked stat with label
   - SectionTitle: h2 with optional action
   - EmptyState: illustration + message + CTA
   - ListItem: standard row with chev / arrow
   - SwipeRow: dismissible row
   - PullHint: pull-to-refresh visual hint
   - Skeleton: loading shimmer
   - Toast: floating message
   - HapticChip: chip with press-state animation
   - StackedAvatars: overlapping avatars +N
   - WeatherStrip: today's weather inline strip */

const NumberDisplay = ({ value, unit = '원', size = 32, color = 'var(--text-strong)', sub }) => (
  <div>
    <div className="tab-num" style={{
      fontSize: size,
      fontWeight: 700,
      letterSpacing: 0,
      color,
      lineHeight: 1.1,
      display: 'flex',
      alignItems: 'baseline',
      gap: 4,
    }}>
      {typeof value === 'number' ? value.toLocaleString('ko-KR') : value}
      <span style={{ fontSize: size * 0.5, fontWeight: 600, color: 'var(--text-muted)' }}>{unit}</span>
    </div>
    {sub && <div style={{ fontSize: 12, color: 'var(--text-caption)', fontWeight: 500, marginTop: 4 }}>{sub}</div>}
  </div>
);

const MoneyRow = ({ label, amount, unit = '원', strong, accent, sub }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    padding: '12px 0',
  }}>
    <div>
      <div style={{
        fontSize: strong ? 15 : 13,
        fontWeight: strong ? 700 : 500,
        color: strong ? 'var(--text-strong)' : 'var(--text-muted)',
      }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 400, marginTop: 2 }}>{sub}</div>}
    </div>
    <div className="tab-num" style={{
      fontSize: strong ? 17 : 14,
      fontWeight: strong ? 700 : 600,
      color: accent ? 'var(--blue500)' : 'var(--text-strong)',
      letterSpacing: 0,
    }}>
      {typeof amount === 'number' ? amount.toLocaleString('ko-KR') : amount}
      <span style={{ fontSize: strong ? 13 : 12, fontWeight: 500, marginLeft: 2, color: 'var(--text-muted)' }}>{unit}</span>
    </div>
  </div>
);

const KPIStat = ({ label, value, unit, delta, deltaLabel }) => {
  const positive = delta && delta > 0;
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
      <div className="tab-num" style={{
        fontSize: 22,
        fontWeight: 700,
        color: 'var(--text-strong)',
        marginTop: 4,
        letterSpacing: 0,
      }}>
        {typeof value === 'number' ? value.toLocaleString('ko-KR') : value}
        {unit && <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 2 }}>{unit}</span>}
      </div>
      {delta !== undefined && (
        <div className="tab-num" style={{
          fontSize: 11,
          fontWeight: 600,
          color: positive ? 'var(--green500)' : 'var(--red500)',
          marginTop: 4,
        }}>
          {positive ? '↑' : '↓'} {Math.abs(delta)}{deltaLabel}
        </div>
      )}
    </div>
  );
};

const SectionTitle = ({ title, action, onAction, sub }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: sub ? 'flex-start' : 'center',
    padding: '0 20px 12px',
  }}>
    <div>
      <div style={{
        fontSize: 17,
        fontWeight: 700,
        color: 'var(--text-strong)',
        letterSpacing: 0,
      }}>{title}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-caption)', fontWeight: 400, marginTop: 4 }}>{sub}</div>}
    </div>
    {action && (
      <button onClick={onAction} style={{
        background: 'transparent',
        border: 'none',
        fontSize: 13,
        color: 'var(--text-muted)',
        fontWeight: 500,
        cursor: 'pointer',
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
      }}>
        {action}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 6 6 6-6 6"/>
        </svg>
      </button>
    )}
  </div>
);

const EmptyState = ({ icon, title, sub, cta, onCta }) => (
  <div style={{
    padding: '60px 32px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  }}>
    <div style={{
      width: 80,
      height: 80,
      borderRadius: 24,
      background: 'var(--grey100)',
      display: 'grid',
      placeItems: 'center',
      marginBottom: 20,
      color: 'var(--text-caption)',
    }}>
      {icon || (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <path d="M9 9h.01M15 9h.01M9 15c.83-1 2.17-1.5 3-1.5s2.17.5 3 1.5"/>
        </svg>
      )}
    </div>
    <div style={{
      fontSize: 17,
      fontWeight: 700,
      color: 'var(--text-strong)',
      letterSpacing: 0,
    }}>{title}</div>
    {sub && (
      <div style={{
        fontSize: 13,
        color: 'var(--text-muted)',
        marginTop: 8,
        lineHeight: 1.5,
        maxWidth: 240,
      }}>{sub}</div>
    )}
    {cta && (
      <SBtn onClick={onCta} size="sm" style={{ marginTop: 24 }}>{cta}</SBtn>
    )}
  </div>
);

const ListItem = ({ leading, title, sub, trailing, chev, onClick, danger }) => (
  <div className={onClick ? 'tm-list-row tm-pressable' : 'tm-list-row'} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
    {leading && <div style={{ flexShrink: 0 }}>{leading}</div>}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        fontSize: 15,
        fontWeight: 500,
        color: danger ? 'var(--red500)' : 'var(--text-strong)',
        whiteSpace: 'normal',
        overflow: 'visible',
        textOverflow: 'clip',
        lineHeight: 1.35,
        wordBreak: 'keep-all',
      }}>{title}</div>
      {sub && (
        <div style={{
          fontSize: 12,
          color: 'var(--text-caption)',
          marginTop: 2,
          fontWeight: 400,
          lineHeight: 1.35,
          wordBreak: 'keep-all',
        }}>{sub}</div>
      )}
    </div>
    {trailing && <div style={{ flexShrink: 0, fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>{trailing}</div>}
    {chev && (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-caption)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m9 6 6 6-6 6"/>
      </svg>
    )}
  </div>
);

const Skeleton = ({ w = '100%', h = 16, r = 6, mb = 0 }) => (
  <div style={{
    width: w,
    height: h,
    borderRadius: r,
    marginBottom: mb,
    background: 'linear-gradient(90deg, var(--grey100) 0%, var(--grey150) 50%, var(--grey100) 100%)',
    backgroundSize: '200% 100%',
    animation: 'sk-shimmer 1.4s ease infinite',
  }}/>
);

const Toast = ({ msg, type = 'info', visible = true }) => {
  if (!visible) return null;
  const palette = {
    info:    { bg: 'var(--grey900)', fg: 'var(--static-white)' },
    success: { bg: 'var(--green500)', fg: 'var(--static-white)' },
    error:   { bg: 'var(--red500)', fg: 'var(--static-white)' },
  }[type];
  return (
    <div style={{
      position: 'absolute',
      bottom: 90,
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '12px 20px',
      borderRadius: 16,
      background: palette.bg,
      color: palette.fg,
      fontSize: 13,
      fontWeight: 600,
      boxShadow: '0 8px 24px rgba(0,0,0,.18)',
      whiteSpace: 'normal',
      lineHeight: 1.35,
      maxWidth: 'calc(100% - 40px)',
      minHeight: 44,
      display: 'flex',
      alignItems: 'center',
      zIndex: 100,
    }}>{msg}</div>
  );
};

const StackedAvatars = ({ avatars = [], size = 28, max = 4 }) => {
  const shown = avatars.slice(0, max);
  const more = avatars.length - shown.length;
  return (
    <div style={{ display: 'flex' }}>
      {shown.map((a, i) => (
        <div key={i} style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: a ? `url(${a}) center/cover` : 'var(--grey200)',
          border: '2px solid var(--bg)',
          marginLeft: i === 0 ? 0 : -8,
          flexShrink: 0,
        }}/>
      ))}
      {more > 0 && (
        <div className="tab-num" style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'var(--grey100)',
          border: '2px solid var(--bg)',
          marginLeft: -8,
          display: 'grid',
          placeItems: 'center',
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--text-muted)',
        }}>+{more}</div>
      )}
    </div>
  );
};

const WeatherStrip = ({ city = '서울', temp = 18, cond = '맑음', wind = 2 }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    background: 'var(--blue50)',
    borderRadius: 12,
    border: '1px solid var(--blue100)',
  }}>
    <div style={{
      width: 32,
      height: 32,
      borderRadius: '50%',
      background: 'var(--yellow500)',
      flexShrink: 0,
    }}/>
    <div style={{ flex: 1 }}>
      <div className="tab-num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>
        {city} {temp}° · {cond}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginTop: 1 }}>
        체감 17° · 바람 {wind}m/s · 운동하기 좋아요
      </div>
    </div>
  </div>
);

const PullHint = () => (
  <div style={{
    padding: '20px 0 8px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    color: 'var(--text-caption)',
    fontSize: 11,
    fontWeight: 500,
  }}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3-6.7"/>
      <path d="M21 4v5h-5"/>
    </svg>
    당겨서 새로고침
  </div>
);

const HapticChip = ({ active, onClick, children, count }) => (
  <button
    className={active ? 'tm-chip tm-chip-active' : 'tm-chip'}
    onClick={onClick}
    style={{ padding: count !== undefined ? '0 8px 0 14px' : undefined, gap: 6 }}
  >
    {children}
    {count !== undefined && (
      <span className="tab-num" style={{
        height: 22,
        minWidth: 22,
        padding: '0 6px',
        borderRadius: 999,
        background: active ? 'rgba(255,255,255,0.18)' : 'var(--bg)',
        color: active ? 'var(--static-white)' : 'var(--text-muted)',
        fontSize: 11,
        fontWeight: 700,
        display: 'grid',
        placeItems: 'center',
      }}>{count}</span>
    )}
  </button>
);

/* StatBar — horizontal bar with comparison (e.g. 출석률 vs 평균) */
const StatBar = ({ label, value, total = 100, sub, color = 'var(--blue500)' }) => {
  const pct = (value / total) * 100;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: 'var(--text-strong)', fontWeight: 500 }}>{label}</span>
        <span className="tab-num" style={{ fontSize: 13, color: 'var(--text-strong)', fontWeight: 700 }}>
          {value}<span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> / {total}</span>
        </span>
      </div>
      <div style={{
        height: 6,
        borderRadius: 3,
        background: 'var(--grey100)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          borderRadius: 3,
        }}/>
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 400, marginTop: 4 }}>{sub}</div>}
    </div>
  );
};

/* AnnouncementBar — compact info banner */
const AnnouncementBar = ({ icon, text, action }) => (
  <div style={{
    margin: '0 20px 16px',
    padding: '12px 14px',
    borderRadius: 12,
    background: 'var(--grey100)',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  }}>
    <div style={{
      width: 24,
      height: 24,
      borderRadius: '50%',
      background: 'var(--blue500)',
      color: 'var(--static-white)',
      display: 'grid',
      placeItems: 'center',
      fontSize: 13,
      fontWeight: 700,
      flexShrink: 0,
    }}>{icon || '!'}</div>
    <div style={{ flex: 1, fontSize: 13, color: 'var(--text-strong)', fontWeight: 500 }}>{text}</div>
    {action && (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m9 6 6 6-6 6"/>
      </svg>
    )}
  </div>
);

/* Animations needed for skeleton */
const SignatureCSS = () => (
  <style>{`
    @keyframes sk-shimmer {
      0%   { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    @keyframes toast-up {
      from { transform: translate(-50%, 20px); opacity: 0; }
      to   { transform: translate(-50%, 0); opacity: 1; }
    }
  `}</style>
);

Object.assign(globalThis, {
  NumberDisplay, MoneyRow, KPIStat, SectionTitle, EmptyState, ListItem,
  Skeleton, Toast, StackedAvatars, WeatherStrip, PullHint, HapticChip,
  StatBar, AnnouncementBar, SignatureCSS,
});


/* Source: docs\reference\handoff-sm-new-direction\sports-platform\project\lib\screens-sm-revision.jsx */

/* Teameet — SM design-freeze comparison boards
   Mobile-first additions based on the SM revision brief.
   These boards intentionally do not replace the existing sections. */

const SM_BOTTOM_TABS = [
  { id: 'home', label: '홈', icon: 'M3 11 L12 3 L21 11 V21 H3 Z' },
  { id: 'matches', label: '매치', icon: 'M12 3 L15 9 L21 10 L16 14 L18 21 L12 17 L6 21 L8 14 L3 10 L9 9 Z' },
  { id: 'teamMatches', label: '팀매치', icon: 'M4 8h16v10H4z M8 8V6h8v2 M8 18v2h8v-2 M8 12h8' },
  { id: 'teams', label: '팀', icon: 'M9 11 A4 4 0 1 0 9 3 A4 4 0 0 0 9 11 M2 21 A7 7 0 0 1 16 21 M17 11 A3 3 0 1 0 17 5 A3 3 0 0 0 17 11 M17 15 A5 5 0 0 1 22 20' },
  { id: 'my', label: '마이', icon: 'M12 12 A4 4 0 1 0 12 4 A4 4 0 0 0 12 12 M4 21 A8 8 0 0 1 20 21' },
];

const SMBottomNav = ({ active = 'home' }) => (
  <div style={{
    minHeight: 74,
    borderTop: '1px solid var(--grey100)',
    background: 'rgba(255,255,255,.94)',
    backdropFilter: 'blur(18px)',
    padding: '6px 0 16px',
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    flexShrink: 0,
  }}>
    {SM_BOTTOM_TABS.map((tab) => {
      const current = active === tab.id;
      return (
        <button key={tab.id} className="tm-pressable tm-break-keep" aria-current={current ? 'page' : undefined} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 0, color: current ? 'var(--blue500)' : 'var(--grey400)' }}>
          <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={current ? 2.2 : 1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d={tab.icon}/>
          </svg>
          <span className="tm-text-micro" style={{ color: current ? 'var(--blue500)' : 'var(--grey500)', fontWeight: current ? 700 : 500, whiteSpace: 'nowrap' }}>{tab.label}</span>
        </button>
      );
    })}
  </div>
);

const SMRevisionShell = ({ title = 'teameet', search = false, notificationNew = true, back = false, children, bottom = true, navActive = 'home' }) => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <div style={{ minHeight: 56, padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--grey100)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {back && (
          <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="뒤로가기">
            <Icon name="chevL" size={22}/>
          </button>
        )}
        <div className="tm-text-body-lg" style={{ color: 'var(--text-strong)' }}>{title}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {search && (
          <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="검색">
            <Icon name="search" size={21}/>
          </button>
        )}
        <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="알림" style={{ position: 'relative' }}>
          <Icon name="bell" size={21}/>
          {notificationNew && <span style={{ position: 'absolute', top: 11, right: 11, width: 7, height: 7, borderRadius: 999, background: 'var(--red500)', border: '2px solid var(--bg)' }}/>}
        </button>
      </div>
    </div>
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: bottom ? 12 : 0 }}>
      {children}
    </div>
    {bottom && <SMBottomNav active={navActive}/>}
  </div>
);

const SMRevisionInfoRow = ({ label, value, sub }) => (
  <div style={{ padding: '14px 0', borderBottom: '1px solid var(--grey100)' }}>
    <div className="tm-text-caption">{label}</div>
    <div className="tm-text-body-lg" style={{ marginTop: 4 }}>{value}</div>
    {sub && <div className="tm-text-caption" style={{ marginTop: 2 }}>{sub}</div>}
  </div>
);

const SMRevisionRuleBoard = ({ title, items }) => (
  <div style={{ width: '100%', height: '100%', background: 'var(--grey50)', fontFamily: 'var(--font)', padding: 24, overflow: 'hidden' }}>
    <div className="tm-text-heading">{title}</div>
    <div className="tm-text-body" style={{ marginTop: 8 }}>SM design freeze 문서의 mobile-first contract를 grid 전환 전에 고정한다.</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 20 }}>
      {items.map((item, index) => (
        <Card key={index} pad={18} style={{ minHeight: 124 }}>
          <div className="tm-text-micro tab-num" style={{ color: 'var(--blue500)' }}>{String(index + 1).padStart(2, '0')}</div>
          <div className="tm-text-body-lg" style={{ marginTop: 8 }}>{item.title}</div>
          <div className="tm-text-caption" style={{ marginTop: 6, lineHeight: 1.45 }}>{item.body}</div>
        </Card>
      ))}
    </div>
  </div>
);

const SMRevisionHomeMobile = ({ signedOut = false, network = false }) => {
  const featured = MATCHES[1];
  const dash = signedOut || network;
  return (
    <SMRevisionShell title="teameet" search notificationNew>
      <div style={{ padding: '20px 20px 0' }}>
        <div className="tm-text-heading">{signedOut || network ? '안녕하세요' : '안녕하세요, 정민님'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 18 }}>
          <Card pad={16}>
            <div className="tm-text-caption">이번달 활동</div>
            <NumberDisplay value={dash ? '-' : 12} unit={dash ? '' : '경기'} size={30} sub={dash ? '지난달 비교 -' : '지난달보다 3경기 많아요'}/>
          </Card>
          <Card pad={16}>
            <div className="tm-text-caption">매너점수</div>
            <NumberDisplay value={dash ? '-' : '4.9'} unit={dash ? '' : '점'} size={30} sub={dash ? '상위 -' : '상위 8%'}/>
          </Card>
        </div>
      </div>

      <div style={{ margin: '18px 20px 0' }}>
        <div className="tm-text-label" style={{ marginBottom: 8 }}>오늘의 추천</div>
        <Card pad={0} style={{ overflow: 'hidden' }}>
          <div style={{ height: 146, background: network ? 'var(--grey100)' : `url(${featured.img}) center/cover`, position: 'relative' }}>
            {!network && (
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(25,31,40,.08), rgba(25,31,40,.58))' }}>
                <div style={{ position: 'absolute', left: 16, right: 16, bottom: 14, color: 'var(--static-white)' }}>
                  <div className="tm-text-micro" style={{ color: 'var(--static-white)' }}>관심 종목 중 충원률 가장 높은 경기</div>
                  <div className="tm-text-subhead" style={{ color: 'var(--static-white)', marginTop: 4 }}>{featured.title}</div>
                </div>
              </div>
            )}
          </div>
          <div style={{ padding: 16 }}>
            {network ? (
              <div className="tm-text-body-lg">새로고침이 필요합니다</div>
            ) : (
              <>
                <div className="tm-text-body-lg">{featured.venue}</div>
                <div className="tm-text-caption" style={{ marginTop: 4 }}>{featured.date} {featured.time} · {featured.cur}/{featured.max}명</div>
              </>
            )}
          </div>
        </Card>
      </div>

      <div style={{ padding: '18px 20px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {['match', 'team match', 'team', 'my team'].map((label, index) => (
          <button key={label} className="tm-pressable" style={{ minHeight: 64, borderRadius: 14, background: index === 0 ? 'var(--blue500)' : 'var(--grey100)', color: index === 0 ? 'var(--static-white)' : 'var(--text-strong)', textAlign: 'left', padding: '12px 14px' }}>
            <div className="tm-text-label" style={{ color: 'inherit' }}>{label}</div>
            <div className="tm-text-micro" style={{ color: index === 0 ? 'rgba(255,255,255,.78)' : 'var(--text-caption)', marginTop: 4 }}>{['03 개인매치', '04 팀매치', '05 팀전체조회', '추후 결정'][index]}</div>
          </button>
        ))}
      </div>

      <div style={{ padding: '18px 20px 0' }}>
        <WeatherStrip city={signedOut ? '서울' : network ? '-' : '마포'} temp={network ? '-' : 18} cond={network ? '-' : '맑음'} wind={network ? '-' : 2}/>
      </div>

      <SectionTitle title="추천 매치" action="전체보기"/>
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {network ? (
          <EmptyState title="새로고침이 필요합니다" sub="이전 추천을 보존하고 다시 시도할 수 있어야 합니다." cta="다시 불러오기"/>
        ) : MATCHES.slice(0, 5).map((match) => (
          <ListItem key={match.id} title={match.title} sub={`${match.venue} · ${match.date} ${match.time}`} trailing={`${match.cur}/${match.max}`}/>
        ))}
      </div>

      <div style={{ padding: '18px 20px 24px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {['참가', 'MVP', '결제'].map((label, index) => (
          <Card key={label} pad={14}>
            <div className="tm-text-caption">{label}</div>
            <div className="tm-text-subhead tab-num" style={{ marginTop: 4 }}>{dash ? '-' : [8, 2, '86,000'][index]}</div>
          </Card>
        ))}
      </div>
    </SMRevisionShell>
  );
};

const SMRevisionHomeStates = () => (
  <SMRevisionShell title="홈 상태 기준" search notificationNew={false}>
    <div style={{ padding: 20 }}>
      {[
        ['비로그인', '인사는 닉네임 없이 표시하고 활동/매너/통계 값은 모두 - 처리한다. 추천은 랜덤 매치로 대체한다.'],
        ['네트워크 이슈', '인사는 유지하되 추천/공지/날씨는 새로고침 필요 또는 - 값으로 표시한다.'],
        ['알림 new', '상단 알림 액션은 new 여부를 점으로 구분한다.'],
        ['검색 노출', '상단 검색 버튼은 홈과 마이에서만 유지한다.']
      ].map(([title, body]) => (
        <Card key={title} pad={16} style={{ marginBottom: 10 }}>
          <div className="tm-text-body-lg">{title}</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>{body}</div>
        </Card>
      ))}
    </div>
  </SMRevisionShell>
);

const SMRevisionHomeNoticeRowV2 = ({ network = false }) => (
  <button className="tm-pressable tm-break-keep" type="button" style={{
    width: '100%',
    minHeight: 58,
    padding: '12px 14px',
    borderRadius: 14,
    background: 'var(--grey50)',
    border: '1px solid var(--grey100)',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    textAlign: 'left',
  }}>
    <span style={{ width: 34, height: 34, borderRadius: 12, background: network ? 'var(--orange50)' : 'var(--blue50)', color: network ? 'var(--orange500)' : 'var(--blue500)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
      <Icon name={network ? 'clock' : 'bell'} size={17}/>
    </span>
    <span style={{ flex: 1, minWidth: 0 }}>
      <span className="tm-text-label" style={{ display: 'block', color: 'var(--text-strong)' }}>
        {network ? '새로고침이 필요합니다' : '이번 주 고정 공지'}
      </span>
      <span className="tm-text-caption line-clamp-2" style={{ display: 'block', marginTop: 2 }}>
        {network ? '공지와 추천 데이터를 다시 불러올 수 있어야 합니다.' : '주말 경기장 혼잡 시간과 체크인 안내를 확인하세요.'}
      </span>
    </span>
    <Icon name="chevR" size={17} color="var(--grey400)"/>
  </button>
);

const SMRevisionHomeNoticeListV2 = ({ network = false }) => (
  <div style={{ display: 'grid', gap: 8 }}>
    {(network ? [
      ['새로고침이 필요합니다', '공지 데이터를 다시 불러와야 합니다.', '재시도'],
    ] : [
      ['이번 주 고정 공지', '주말 경기장 혼잡 시간과 체크인 안내', '오늘'],
      ['매너 점수 업데이트', '경기 후 리뷰 반영 기준 안내', '어제'],
      ['비 예보 경기 안내', '우천 시 취소/환불 기준 확인', '5월 2일'],
    ]).map(([title, sub, trailing]) => (
      <ListItem key={title} title={title} sub={sub} trailing={trailing} chev/>
    ))}
  </div>
);

const SMRevisionHomeShortcutV2 = ({ label, sub, active = false, disabled = false }) => (
  <button className="tm-pressable tm-break-keep" type="button" disabled={disabled} style={{
    minHeight: 68,
    borderRadius: 16,
    background: active ? 'var(--blue500)' : disabled ? 'var(--grey50)' : 'var(--grey100)',
    color: active ? 'var(--static-white)' : disabled ? 'var(--text-caption)' : 'var(--text-strong)',
    padding: '12px 14px',
    textAlign: 'left',
    opacity: disabled ? .72 : 1,
  }}>
    <span className="tm-text-label" style={{ color: 'inherit', display: 'block' }}>{label}</span>
    <span className="tm-text-micro" style={{ color: active ? 'rgba(255,255,255,.78)' : 'var(--text-caption)', display: 'block', marginTop: 5 }}>{sub}</span>
  </button>
);

const SMRevisionHomeMobileV2 = ({ signedOut = false, network = false }) => {
  const ranked = [...MATCHES].sort((a, b) => (b.cur / b.max) - (a.cur / a.max));
  const featured = signedOut ? MATCHES[0] : ranked[0];
  const dash = signedOut || network;
  return (
    <SMRevisionShell title="teameet" search notificationNew={!network}>
      <div style={{ padding: '8px 20px 24px' }}>
        <div className="tm-text-label" style={{ color: 'var(--text-muted)' }}>{dash ? '안녕하세요' : '안녕하세요, 정민님'}</div>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="tm-text-label" style={{ color: 'var(--text-muted)' }}>이번 달 활동</div>
            <NumberDisplay value={dash ? '-' : 12} unit={dash ? '' : '경기'} size={36} sub={dash ? '지난달 비교 -' : '지난달보다 +3'}/>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="tm-text-label" style={{ color: 'var(--text-muted)' }}>매너 점수</div>
            <NumberDisplay value={dash ? '-' : '4.9'} unit={dash ? '' : '점'} size={36} sub={dash ? '상위 -' : '상위 8%'}/>
          </div>
        </div>
      </div>

      <div style={{ margin: '0 20px 28px' }}>
        <div className="tm-text-label" style={{ marginBottom: 8 }}>오늘의 추천</div>
        <Card pad={0} style={{ overflow: 'hidden' }}>
          <div style={{ height: 146, background: network ? 'var(--grey100)' : `url(${featured.img}) center/cover`, position: 'relative' }}>
            {!network && (
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(25,31,40,.08), rgba(25,31,40,.58))' }}>
                <div style={{ position: 'absolute', left: 16, right: 16, bottom: 14, color: 'var(--static-white)' }}>
                  <div className="tm-text-micro" style={{ color: 'var(--static-white)' }}>{signedOut ? '랜덤 추천 매치' : '관심 종목 중 충원률 가장 높은 경기'}</div>
                  <div className="tm-text-subhead" style={{ color: 'var(--static-white)', marginTop: 4 }}>{featured.title}</div>
                </div>
              </div>
            )}
          </div>
          <div style={{ padding: 16 }}>
            {network ? (
              <>
                <div className="tm-text-body-lg">새로고침이 필요합니다</div>
                <button className="tm-btn tm-btn-sm tm-btn-primary" style={{ marginTop: 10 }}>다시 불러오기</button>
              </>
            ) : (
              <>
                <div className="tm-text-body-lg">{featured.venue}</div>
                <div className="tm-text-caption" style={{ marginTop: 4 }}>{featured.date} {featured.time} · {featured.cur}/{featured.max}명</div>
              </>
            )}
          </div>
        </Card>
      </div>

      <div style={{ padding: '0 20px 28px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '20px 12px', background: 'var(--grey50)', borderRadius: 16 }}>
          {[
            { label: '매치', sub: '03', color: 'var(--blue500)', bg: 'var(--blue50)', disabled: false },
            { label: '팀매치', sub: '04', color: 'var(--orange500)', bg: 'var(--orange50)', disabled: false },
            { label: '팀', sub: '05', color: 'var(--green500)', bg: 'var(--green50)', disabled: false },
            { label: '나의 팀', sub: '미정', color: 'var(--grey500)', bg: 'var(--grey100)', disabled: true },
          ].map((item) => (
            <button key={item.label} className="tm-pressable tm-break-keep" disabled={item.disabled} style={{ background: 'transparent', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: item.disabled ? .58 : 1 }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: item.bg, color: item.color, display: 'grid', placeItems: 'center', fontWeight: 800 }}>
                {item.label[0].toUpperCase()}
              </div>
              <span className="tm-text-micro" style={{ color: 'var(--text-strong)', textAlign: 'center', lineHeight: 1.2 }}>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '0 20px 24px' }}>
        <WeatherStrip city={signedOut ? '서울' : network ? '-' : '마포'} temp={network ? '-' : 18} cond={network ? '-' : '맑음'} wind={network ? '-' : 2}/>
      </div>

      <SectionTitle title="추천 매치" sub={network ? '다시 불러오기가 필요합니다' : '실력에 맞는 경기 5개'} action="전체보기"/>
      {network ? (
        <div style={{ padding: '0 20px 8px' }}>
          <EmptyState title="새로고침이 필요합니다" sub="추천 목록과 대표 매치를 다시 불러올 수 있어야 합니다." cta="다시 불러오기"/>
        </div>
      ) : (
        <div style={{ paddingLeft: 20, display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, paddingRight: 20 }}>
          {MATCHES.slice(0, 5).map((match) => (
            <button key={match.id} className="tm-pressable tm-break-keep" type="button" style={{ flexShrink: 0, width: 220, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', padding: 0, textAlign: 'left' }}>
              <div style={{ height: 110, background: `url(${match.img}) center/cover` }}/>
              <div style={{ padding: 12 }}>
                <div className="tm-text-micro" style={{ color: 'var(--blue500)' }}>{SPORTS.find(s => s.id === match.sport)?.label ?? match.sport}</div>
                <div className="tm-text-label line-clamp-2" style={{ color: 'var(--text-strong)', marginTop: 4, minHeight: 36 }}>{match.title}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                  <span className="tm-text-micro tab-num" style={{ color: 'var(--text-muted)' }}>{match.cur}/{match.max}명</span>
                  <span className="tm-text-label tab-num" style={{ color: 'var(--text-strong)' }}>{match.fee.toLocaleString()}원</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: '24px 20px 20px' }}>
        <SectionTitle title="이번 달 통계"/>
        <div style={{ background: 'var(--grey50)', borderRadius: 16, padding: '20px 16px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {['참가', 'MVP', '결제'].map((label, index) => (
            <KPIStat key={label} label={label} value={dash ? '-' : [8, 2, '86,000'][index]} unit={index === 2 || dash ? '' : index === 0 ? '회' : '개'}/>
          ))}
        </div>
      </div>

      <div style={{ padding: '0 20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '0 0 12px' }}>
          <div className="tm-text-body-lg">공지사항</div>
          <button className="tm-btn tm-btn-sm tm-btn-ghost" style={{ alignSelf: 'flex-end', minHeight: 30, padding: '0 4px' }}>전체보기</button>
        </div>
        <SMRevisionHomeNoticeListV2 network={network}/>
      </div>
    </SMRevisionShell>
  );
};

const SMRevisionHomeStatesV2 = () => (
  <SMRevisionShell title="홈 SM2 상태 기준" search notificationNew={false}>
    <div style={{ padding: 20, display: 'grid', gap: 10 }}>
      {[
        ['비로그인', '인사는 안녕하세요만 표시한다. 활동, 지난달 비교, 매너점수, 상위, 통계는 -로 처리하고 대표/추천 매치는 랜덤 조회로 대체한다.'],
        ['네트워크 이슈', '개인화 값을 모두 -로 유지하고 대표 추천, 추천 목록, 공지에는 새로고침이 필요합니다와 재시도 CTA를 둔다.'],
        ['대표 추천', '로그인 상태는 관심 종목 중 충원률이 가장 높은 경기 1개, 비로그인은 랜덤 경기 1개를 표시한다.'],
        ['공지', '고정 핀 공지사항만 노출하며 클릭 시 상세로 진입한다. 네트워크 이슈에서는 같은 슬롯에 복구 CTA를 둔다.'],
        ['미정 shortcut', 'my team 이동 위치는 아직 미정이므로 disabled/보류 상태로 표기하고 false affordance를 만들지 않는다.'],
      ].map(([title, body]) => (
        <Card key={title} pad={16}>
          <div className="tm-text-body-lg">{title}</div>
          <div className="tm-text-caption" style={{ marginTop: 6, lineHeight: 1.45 }}>{body}</div>
        </Card>
      ))}
    </div>
  </SMRevisionShell>
);

const SMRevisionHomeMobileGridV2 = () => (
  <SMRevisionRuleBoard title="02 홈 · SM 수정안 2 mobile grid" items={[
    { title: '보존 기준', body: '원본 02, Toss canonical, 기존 SM 수정안은 유지하고 같은 번호의 새 비교 섹션에서만 수정한다.' },
    { title: '모바일 main', body: '인사, 활동/매너, 대표 추천, shortcut, 날씨, 추천 5개, 통계, pinned 공지를 한 흐름으로 둔다.' },
    { title: '상태', body: '비로그인과 네트워크 이슈는 개인 수치 - 처리, 랜덤 추천/새로고침 필요, 공지 복구 CTA를 분리한다.' },
    { title: '인터랙션', body: '추천 항목은 상세 진입 chevron을 갖고, 전체보기는 03 개인 매치, team은 05 팀전체조회로 연결한다.' },
    { title: '미정 범위', body: 'my team 이동 위치는 결정 전까지 disabled 상태로 남겨 false affordance를 막는다.' },
    { title: '다음 단계', body: 'mobile 승인 후 M02 grid의 main/state/components/assets/motion을 SM2 기준으로 재작성한다.' },
  ]}/>
);

const SMRevisionHomeUIRulesV2 = () => (
  <div style={{ width: 840, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', padding: 24, overflow: 'hidden' }}>
    <Badge tone="blue" size="sm">02 HOME SM2 · UI RULES</Badge>
    <div className="tm-text-heading" style={{ marginTop: 10 }}>UI 규약</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 6 }}>
      상단바는 SM2 shell을 유지하고, 본문은 원본 HomeToss의 시각 리듬을 따른다.
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 20 }}>
      {[
        ['상단바', 'teameet 워드마크, 검색, 알림으로 구성한다. 검색은 홈에서 유지하고 알림은 new dot으로 상태를 구분한다.'],
        ['인사/숫자', '인사 아래 이번 달 활동과 매너 점수를 좌우 배치한다. 수치/점수는 NumberDisplay와 tabular number를 사용한다.'],
        ['오늘의 추천', 'SM 홈 모바일의 이미지 카드 패턴을 채택한다. 로그인은 충원률 기준, 비로그인은 랜덤 추천, 네트워크는 새로고침 상태를 보여준다.'],
        ['이동 버튼', '4개 이동은 아이콘형 quick action으로 구성한다. 라벨은 매치, 팀매치, 팀, 나의 팀이며 나의 팀은 목적지 확정 전 disabled다.'],
        ['추천 목록', '가로 스크롤 카드 리스트를 사용한다. 각 카드는 이미지, 종목, 제목, 인원, 가격을 포함하고 탭하면 상세로 이동한다.'],
        ['통계/공지', '통계는 원본의 grey block + KPIStat 리듬을 따른다. 공지사항은 설명 문구 없이 목록만 노출하고 우측 하단에 전체보기를 둔다.'],
        ['색/강조', 'blue는 CTA/선택/주요 추천에만 사용한다. deep shadow, content-wide glass, decorative hero text는 쓰지 않는다.'],
        ['상태 표현', '비로그인/네트워크 상태에서도 레이아웃 shape를 유지한다. 값이 없으면 -로 표시하고, 실패는 재시도 CTA를 같이 제공한다.'],
      ].map(([title, body], index) => (
        <Card key={title} pad={18} style={{ minHeight: 132 }}>
          <div className="tm-text-micro tab-num" style={{ color: 'var(--blue500)' }}>{String(index + 1).padStart(2, '0')}</div>
          <div className="tm-text-body-lg" style={{ marginTop: 8 }}>{title}</div>
          <div className="tm-text-caption" style={{ marginTop: 6, lineHeight: 1.45 }}>{body}</div>
        </Card>
      ))}
    </div>
  </div>
);

const SMRevisionHomeFlowCardV2 = ({ index, title, trigger, feedback, next, state }) => (
  <Card pad={16} style={{ minHeight: 142 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
      <div className="tm-text-micro tab-num" style={{ color: 'var(--blue500)' }}>{String(index).padStart(2, '0')}</div>
      <Badge tone={state === 'blocked' ? 'orange' : state === 'error' ? 'red' : 'blue'} size="sm">{state}</Badge>
    </div>
    <div className="tm-text-body-lg" style={{ marginTop: 8 }}>{title}</div>
    <div style={{ display: 'grid', gap: 5, marginTop: 8 }}>
      <div className="tm-text-caption"><b>Trigger</b> · {trigger}</div>
      <div className="tm-text-caption"><b>Feedback</b> · {feedback}</div>
      <div className="tm-text-caption"><b>Next</b> · {next}</div>
    </div>
  </Card>
);

const SMRevisionHomeInteractionFlowV2 = () => (
  <div style={{ width: 840, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 24, overflow: 'hidden' }}>
    <Badge tone="blue" size="sm">02 HOME SM2 · INTERACTION FLOW</Badge>
    <div className="tm-text-heading" style={{ marginTop: 10 }}>버튼별 동작/상태 흐름</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 6 }}>
      모든 탭 액션은 즉시 press feedback을 주고, 이동/상태 변경/복구 CTA 중 하나로 끝난다.
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginTop: 20 }}>
      <SMRevisionHomeFlowCardV2
        index={1}
        title="검색"
        trigger="상단 검색 버튼 탭"
        feedback="버튼 scale(.98), SM2 홈 검색 페이지 진입"
        next="최근 검색/빠른 조건을 먼저 보여주고, 제출 후 매치·팀매치·팀 결과로 분기"
        state="route"
      />
      <SMRevisionHomeFlowCardV2
        index={2}
        title="알림"
        trigger="상단 알림 버튼 탭"
        feedback="new dot 유지/해제는 알림 목록 backfill 이후 결정"
        next="06 알림 목록으로 이동. 읽음 처리는 알림 화면에서 수행"
        state="route"
      />
      <SMRevisionHomeFlowCardV2
        index={3}
        title="오늘의 추천 카드"
        trigger="대표 추천 카드 또는 상세보기 탭"
        feedback="카드 press 후 selected match context 유지"
        next="로그인/비로그인 모두 개인 매치 상세로 이동. 네트워크 상태면 재시도 CTA만 동작"
        state="route"
      />
      <SMRevisionHomeFlowCardV2
        index={4}
        title="매치"
        trigger="quick action 매치 탭"
        feedback="active blue action press"
        next="03 개인 매치 목록으로 이동"
        state="route"
      />
      <SMRevisionHomeFlowCardV2
        index={5}
        title="팀매치"
        trigger="quick action 팀매치 탭"
        feedback="orange icon action press"
        next="04 팀매치 목록으로 이동"
        state="route"
      />
      <SMRevisionHomeFlowCardV2
        index={6}
        title="팀"
        trigger="quick action 팀 탭"
        feedback="green icon action press"
        next="05 팀 전체조회/팀 둘러보기로 이동"
        state="route"
      />
      <SMRevisionHomeFlowCardV2
        index={7}
        title="나의 팀"
        trigger="quick action 나의 팀 탭"
        feedback="disabled 상태 유지. 목적지 미정 문구를 노출"
        next="이동하지 않는다. 목적지 확정 후 route 연결"
        state="blocked"
      />
      <SMRevisionHomeFlowCardV2
        index={8}
        title="추천 매치 전체보기"
        trigger="추천 매치 섹션 전체보기 탭"
        feedback="텍스트 버튼 press"
        next="03 개인 매치 목록으로 이동하고 추천/개인화 필터를 유지"
        state="route"
      />
      <SMRevisionHomeFlowCardV2
        index={9}
        title="추천 카드"
        trigger="가로 추천 카드 탭"
        feedback="카드 press, title/context 유지"
        next="선택한 개인 매치 상세로 이동"
        state="route"
      />
      <SMRevisionHomeFlowCardV2
        index={10}
        title="공지사항 전체보기"
        trigger="공지사항 우측 하단 전체보기 탭"
        feedback="ghost button press"
        next="공지 목록으로 이동. 현재는 pinned notice만 표시"
        state="route"
      />
      <SMRevisionHomeFlowCardV2
        index={11}
        title="공지 항목"
        trigger="공지 row 탭"
        feedback="ListItem press + chevron"
        next="공지 상세로 이동. 네트워크 상태면 재시도 상태 row만 노출"
        state="route"
      />
      <SMRevisionHomeFlowCardV2
        index={12}
        title="다시 불러오기"
        trigger="네트워크 이슈 상태의 재시도 CTA 탭"
        feedback="pending/loading state로 전환하고 기존 layout shape 유지"
        next="성공하면 SM2 main, 실패하면 network state 유지"
        state="error"
      />
    </div>
  </div>
);

const SMRevisionHomeSearchResultRowV2 = ({ type, title, meta, badge, tone = 'blue', compact = false }) => (
  <Card pad={compact ? 12 : 14} interactive>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: compact ? 36 : 42, height: compact ? 36 : 42, borderRadius: compact ? 12 : 14, background: tone === 'orange' ? 'rgba(254,152,0,.12)' : tone === 'green' ? 'rgba(3,178,108,.10)' : 'var(--blue50)', color: tone === 'orange' ? 'var(--orange500)' : tone === 'green' ? 'var(--green500)' : 'var(--blue500)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon name={type === 'team' ? 'people' : 'calendar'} size={compact ? 18 : 20}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <Badge tone={tone} size="sm">{badge}</Badge>
          <div className="tm-text-body-lg line-clamp-1">{title}</div>
        </div>
        <div className="tm-text-caption line-clamp-1" style={{ marginTop: 4 }}>{meta}</div>
      </div>
      <div className="tm-text-caption" style={{ color: 'var(--grey400)' }}>이동</div>
    </div>
  </Card>
);

const SMRevisionHomeSearchResultsV2 = ({ variant = 'grouped' }) => {
  const match = MATCHES[1];
  const teamMatch = TEAM_MATCHES[1];
  const team = TEAMS[1];
  const groups = [
    { key: 'match', label: '매치', count: 12, tone: 'blue', rows: [
      { type: 'match', badge: '매치', title: match.title, meta: `${match.venue} · ${match.date} ${match.time} · ${match.cur}/${match.max}명`, tone: 'blue' },
    ] },
    { key: 'teamMatch', label: '팀매치', count: 4, tone: 'orange', rows: [
      { type: 'teamMatch', badge: '팀매치', title: teamMatch.title, meta: `${teamMatch.venue} · ${teamMatch.format} · ${teamMatch.cost.toLocaleString()}원`, tone: 'orange' },
    ] },
    { key: 'team', label: '팀', count: 7, tone: 'green', rows: [
      { type: 'team', badge: '팀', title: team.name, meta: `${team.sport} · ${team.members}명 · 매너 ${team.manner}`, tone: 'green' },
    ] },
  ];

  if (variant === 'segmented') {
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {groups.map((group, index) => (
            <button key={group.key} className={`tm-chip ${index === 0 ? 'tm-chip-active' : ''}`} style={{ minHeight: 42, justifyContent: 'center' }}>
              {group.label} <span className="tab-num">{group.count}</span>
            </button>
          ))}
        </div>
        <Card pad={14} style={{ marginTop: 12, background: 'var(--blue50)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <div>
              <div className="tm-text-label" style={{ color: 'var(--blue500)' }}>매치 결과 먼저 보기</div>
              <div className="tm-text-caption" style={{ marginTop: 3 }}>선택한 탭 안에서만 상세 조건을 이어갑니다.</div>
            </div>
            <button className="tm-btn tm-btn-sm tm-btn-primary">12개</button>
          </div>
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
          <SMRevisionHomeSearchResultRowV2 type="match" badge="매치" title={match.title} meta={`${match.venue} · ${match.date} ${match.time} · ${match.cur}/${match.max}명`} tone="blue" compact/>
          <SMRevisionHomeSearchResultRowV2 type="match" badge="매치" title={MATCHES[0].title} meta={`${MATCHES[0].venue} · ${MATCHES[0].date} ${MATCHES[0].time} · ${MATCHES[0].cur}/${MATCHES[0].max}명`} tone="blue" compact/>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
          {groups.slice(1).map((group) => (
            <Card key={group.key} pad={13} interactive>
              <Badge tone={group.tone} size="sm">{group.label}</Badge>
              <div className="tm-text-body-lg tab-num" style={{ marginTop: 8 }}>{group.count}개</div>
              <div className="tm-text-caption" style={{ marginTop: 4 }}>탭하면 해당 결과만 보기</div>
            </Card>
          ))}
        </div>
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {groups.map((group) => (
        <div key={group.key}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Badge tone={group.tone} size="sm">{group.label}</Badge>
              <div className="tm-text-label"><span className="tab-num">{group.count}</span>개</div>
            </div>
            <button className="tm-btn tm-btn-sm tm-btn-ghost">더보기</button>
          </div>
          {group.rows.map((row) => <SMRevisionHomeSearchResultRowV2 key={row.type} {...row}/>)}
        </div>
      ))}
    </div>
  );
};

const SMRevisionHomeSearchMobileV2 = ({ variant = 'grouped' }) => {
  const totalCount = 23;
  return (
    <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <StatusBar/>
      <div style={{ minHeight: 58, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--grey100)' }}>
        <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="뒤로가기">
          <Icon name="chevL" size={22}/>
        </button>
        <div style={{ flex: 1, minHeight: 44, borderRadius: 12, background: 'var(--grey100)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 13px', boxShadow: '0 0 0 2px var(--blue50)' }}>
          <Icon name="search" size={18}/>
          <span className="tm-text-body" style={{ color: 'var(--text-strong)' }}>풋살</span>
          <span style={{ width: 1, height: 18, background: 'var(--blue500)' }}/>
          <button className="tm-btn tm-btn-icon tm-btn-primary" aria-label="검색 실행" style={{ width: 32, height: 32, minHeight: 32, marginLeft: 'auto', borderRadius: 10 }}>
            <Icon name="search" size={17}/>
          </button>
        </div>
        <button className="tm-btn tm-btn-sm tm-btn-ghost">취소</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px 22px' }}>
        <div>
          <div className="tm-text-label">최근 검색</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {['풋살', '강남', '오늘 저녁', '마감임박'].map((label, index) => (
              <button key={label} className={`tm-chip ${index === 0 ? 'tm-chip-active' : ''}`}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <div className="tm-text-label">빠른 조건</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            {[
              ['오늘 참여 가능', '오늘매치수 기준'],
              ['내 주변 5km', '위치 권한 확인'],
              ['마감임박', '24시간 이내'],
              ['초보 환영', '레벨 필터 적용'],
            ].map(([title, sub], index) => (
              <Card key={title} pad={14} interactive style={{ background: index === 0 ? 'var(--blue50)' : 'var(--bg)' }}>
                <div className="tm-text-label" style={{ color: index === 0 ? 'var(--blue500)' : 'var(--text-strong)' }}>{title}</div>
                <div className="tm-text-micro" style={{ marginTop: 4, color: 'var(--text-caption)' }}>{sub}</div>
              </Card>
            ))}
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--grey100)', margin: '20px 0 18px' }}/>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="tm-text-label">검색 결과</div>
            <div className="tm-text-caption" style={{ marginTop: 2 }}><span className="tab-num">{totalCount}</span>개 결과 · 매치/팀매치/팀 통합 조회</div>
          </div>
          <button className="tm-btn tm-btn-sm tm-btn-neutral">전체보기</button>
        </div>
        <div style={{ marginTop: 12 }}>
          <SMRevisionHomeSearchResultsV2 variant={variant}/>
        </div>

        <Card pad={14} style={{ marginTop: 14, background: 'var(--grey50)' }}>
          <div className="tm-text-label">상태 기준</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>결과 없음은 검색어 유지 + 전체 보기/조건 초기화, 오류는 검색어와 빠른 조건을 보존한 재시도 CTA로 복구합니다.</div>
        </Card>
      </div>
    </div>
  );
};

const SMRevisionHomeSearchRulesV2 = () => (
  <div style={{ width: 840, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', padding: 24, overflow: 'hidden' }}>
    <Badge tone="blue" size="sm">02 HOME SM2 · SEARCH CONTRACT</Badge>
    <div className="tm-text-heading" style={{ marginTop: 10 }}>검색 페이지 동작/상태 규약</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 6 }}>
      상단 검색 버튼은 홈과 마이에서만 유지한다. 홈 검색은 하단 탭 없이 집중 검색 페이지로 진입한다.
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginTop: 20 }}>
      {[
        ['진입', '홈 상단 검색 버튼을 누르면 press feedback 후 검색 페이지로 전환한다. 뒤로가기와 취소는 모두 홈 main으로 복귀한다.'],
        ['입력 전', '최근 검색과 빠른 조건을 먼저 보여준다. 최근 검색 chip은 즉시 해당 검색어를 입력하고 결과 영역을 갱신한다.'],
        ['입력 중', '검색어, 커서, 검색 실행 아이콘, 취소 버튼을 노출한다. 빠른 조건 chip은 active blue와 count/설명을 함께 보여준다.'],
        ['결과', '매치, 팀매치, 팀을 한 페이지에 묶되 각 row에는 목적지 타입을 badge로 표시한다. row tap은 해당 상세/목록으로 이동한다.'],
        ['결과 없음', '빈 화면은 단순 없음이 아니라 전체 보기, 조건 초기화, 검색어 수정 중 하나를 제공한다. 검색어는 지우지 않는다.'],
        ['오류', '네트워크 오류는 query/context를 보존하고 재시도 CTA를 제공한다. toast만으로 오류를 대체하지 않는다.'],
        ['stale query', '빠른 연속 입력/조건 선택 시 마지막 입력값을 source로 삼고 이전 결과가 덮어쓰지 않게 한다.'],
        ['권한', '내 주변 조건은 위치 권한이 없으면 권한 안내 상태를 먼저 보여주고 임의 위치로 성공 처리하지 않는다.'],
        ['범위', '홈 검색은 discovery entry다. 상세 필터와 카드/콤팩트 전환은 03/04 목록 화면에서 이어받는다.'],
      ].map(([title, body], index) => (
        <Card key={title} pad={16} style={{ minHeight: 146 }}>
          <div className="tm-text-micro tab-num" style={{ color: 'var(--blue500)' }}>{String(index + 1).padStart(2, '0')}</div>
          <div className="tm-text-body-lg" style={{ marginTop: 8 }}>{title}</div>
          <div className="tm-text-caption" style={{ marginTop: 6, lineHeight: 1.45 }}>{body}</div>
        </Card>
      ))}
    </div>
  </div>
);

const SMRevisionMatchListMobile = ({ team = false, compact = false }) => {
  const list = team ? TEAM_MATCHES : MATCHES;
  return (
    <SMRevisionShell title={team ? '팀매치' : '매치'} notificationNew bottom navActive={team ? 'teamMatches' : 'matches'}>
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, minHeight: 48, borderRadius: 12, background: 'var(--grey100)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', color: 'var(--text-caption)' }}>
            <Icon name="search" size={18}/>
            <span className="tm-text-body">지역, 시간, 팀명 검색</span>
          </div>
          <button className="tm-btn tm-btn-icon tm-btn-neutral" aria-label="콤팩트 보기">ㅁ|ㅁ</button>
          <button className="tm-btn tm-btn-icon tm-btn-primary" aria-label="카드 보기">ㅁ</button>
        </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '16px 0' }}>
          {SPORTS.slice(0, 7).map((sport, index) => (
            <HapticChip key={sport.id} active={index === 0} count={index === 0 ? list.length : index + 2}>{sport.label}</HapticChip>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          {['매치수', '오늘매치수', '마감임박'].map((label, index) => (
            <Card key={label} pad={12}>
              <div className="tm-text-caption">{label}</div>
              <div className="tm-text-subhead tab-num" style={{ marginTop: 4 }}>{[list.length, 3, 2][index]}</div>
            </Card>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.slice(0, 4).map((item, index) => compact ? (
            <Card key={item.id} pad={12}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 58, height: 58, borderRadius: 12, background: team ? 'var(--blue50)' : `url(${item.img}) center/cover`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  {team && <div className="tm-text-label" style={{ color: 'var(--blue500)' }}>{item.grade}</div>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="tm-text-body-lg line-clamp-2">{item.title}</div>
                  <div className="tm-text-caption" style={{ marginTop: 4 }}>{item.venue} · {item.time}</div>
                  <div className="tm-text-caption tab-num" style={{ marginTop: 4 }}>{team ? `${item.format} · ${item.cost.toLocaleString()}원 · ${item.grade}등급` : `${item.cur}/${item.max}명 · ${item.fee.toLocaleString()}원`}</div>
                </div>
              </div>
            </Card>
          ) : (
            <Card key={item.id} pad={0} style={{ overflow: 'hidden' }}>
              <div style={{ height: 140, background: team ? 'var(--grey900)' : `url(${item.img}) center/cover`, position: 'relative' }}>
                <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6 }}>
                  <Badge tone="blue">{team ? item.sport : item.level}</Badge>
                  <Badge tone={index === 1 ? 'red' : 'grey'}>{index === 1 ? '마감임박' : item.date}</Badge>
                </div>
                <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12, color: 'var(--static-white)' }}>
                  <div className="tm-text-label" style={{ color: 'var(--static-white)' }}>{item.date} {item.time}</div>
                </div>
              </div>
              <div style={{ padding: 16 }}>
                <div className="tm-text-body-lg">{team ? item.host : item.title}</div>
                <div className="tm-text-caption" style={{ marginTop: 4 }}>{item.venue}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                  <span className="tm-text-caption tab-num">{team ? `${item.format} · ${item.grade}등급` : `${item.cur}/${item.max}명`}</span>
                  <span className="tm-text-label tab-num">{team ? `${item.cost.toLocaleString()}원` : `${item.fee.toLocaleString()}원`}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </SMRevisionShell>
  );
};

const SMRevisionMatchDetailMobile = ({ team = false, mine = false }) => {
  const match = team ? TEAM_MATCHES[0] : MATCHES[0];
  return (
    <SMRevisionShell title="" back notificationNew={false} bottom={false}>
      <div style={{ height: 208, background: team ? 'var(--grey900)' : `url(${match.img}) center/cover`, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(25,31,40,.04), rgba(25,31,40,.66))' }}/>
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 18, color: 'var(--static-white)' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <Badge tone="blue">{team ? match.sport : match.level}</Badge>
            <Badge tone="orange">승인중/승인완료 상태 지원</Badge>
          </div>
          <div className="tm-text-heading" style={{ color: 'var(--static-white)' }}>{team ? `${match.host} vs 상대팀` : match.title}</div>
        </div>
      </div>
      <div style={{ padding: '6px 20px 110px' }}>
        <SMRevisionInfoRow label="일시" value={`${match.date} ${match.time}`}/>
        <SMRevisionInfoRow label="장소" value={match.venue}/>
        <SMRevisionInfoRow label={team ? '경기 정보' : '인원'} value={team ? `${match.format} · 전후반 · ${match.grade}등급` : `${match.cur}/${match.max}명 모집`}/>
        <SMRevisionInfoRow label={team ? '참가비' : '참가비'} value={`${(team ? match.cost : match.fee).toLocaleString()}원`} sub={team ? '팀 단위 정산' : '승인 후 결제 단계로 이동'}/>
        <Card pad={16} style={{ marginTop: 14 }}>
          <div className="tm-text-body-lg">{team ? '팀 정보 보러가기' : '호스트 정보'}</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>{team ? '팀 상세조회로 이동해 매너, 전적, 멤버 구성을 확인합니다.' : '주최 횟수 18회 · 매너 4.9 · 프로필 바로가기 가능'}</div>
        </Card>
        <Card pad={16} style={{ marginTop: 10 }}>
          <div className="tm-text-body-lg">{team ? '채팅 및 신청 흐름' : '참가자 리스트'}</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>{team ? '채팅 후 신청하기. 신청 CTA는 bottom sheet에서 결제하고 신청하기로 확정합니다.' : '참가자 프로필 조회 가능. 더보기는 참가자 리스트 페이지로 이동합니다.'}</div>
        </Card>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="tm-text-caption">{mine ? '내가 만든 매치' : '결제 전 요약 확인'}</span>
          <span className="tm-text-label tab-num">{(team ? match.cost : match.fee).toLocaleString()}원</span>
        </div>
        <SBtn full size="lg">{mine ? '매치 관리' : team ? '결제하고 신청하기' : '결제하고 참가하기'}</SBtn>
      </div>
    </SMRevisionShell>
  );
};

const SM3_MATCH_STATS = [
  ['매치수', '42', '선택 종목 기준'],
  ['오늘매치수', '7', '서울 전체'],
  ['마감임박', '4', '24시간 이내'],
];

const SMRevisionMatchSM3Header = ({ mode = 'card', query = '' }) => (
  <div style={{ padding: '18px 20px 0' }}>
    <div style={{ display: 'flex', gap: 8 }}>
      <div style={{ flex: 1, minHeight: 48, borderRadius: 12, background: 'var(--grey100)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', color: 'var(--text-caption)' }}>
        <Icon name="search" size={18}/>
        <span className="tm-text-body" style={{ color: query ? 'var(--text-strong)' : 'var(--text-caption)' }}>{query || '지역, 시간, 매치명 검색'}</span>
      </div>
      <button className="tm-btn tm-btn-icon tm-btn-neutral" aria-label={mode === 'card' ? '콤팩트 보기로 전환' : '카드 보기로 전환'}>
        {mode === 'card' ? 'ㅁ|ㅁ' : 'ㅁ'}
      </button>
    </div>
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '16px 0 14px' }}>
      {SPORTS.slice(0, 7).map((sport, index) => (
        <HapticChip key={sport.id} active={index === 0} count={index === 0 ? MATCHES.length : index + 2}>{sport.label}</HapticChip>
      ))}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, padding: '2px 0 4px' }}>
      {SM3_MATCH_STATS.map(([label, value, sub]) => (
        <div key={label} style={{ minWidth: 0 }}>
          <div className="tm-text-caption">{label}</div>
          <div className="tm-text-subhead tab-num" style={{ marginTop: 4 }}>{value}</div>
          <div className="tm-text-micro" style={{ marginTop: 2, color: 'var(--text-caption)' }}>{sub}</div>
        </div>
      ))}
    </div>
  </div>
);

const SMRevisionMatchSM3CardItem = ({ item, index, showCountBadge = false }) => (
  <Card pad={0} style={{ overflow: 'hidden' }}>
    <div style={{ height: 148, background: `url(${item.img}) center/cover`, position: 'relative' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(25,31,40,.02), rgba(25,31,40,.58))' }}/>
      <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Badge tone="blue">{SPORTS.find((sport) => sport.id === item.sport)?.label || item.sport}</Badge>
          <Badge tone="grey">{item.level}</Badge>
          {showCountBadge && <Badge tone="grey"><span className="tab-num">{item.cur}/{item.max}명</span></Badge>}
        </div>
        <Badge tone={item.urgent || index === 1 ? 'orange' : 'grey'}>{item.urgent || index === 1 ? '마감임박' : '모집중'}</Badge>
      </div>
      <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12, color: 'var(--static-white)' }}>
        <div className="tm-text-label" style={{ color: 'var(--static-white)' }}>{item.date} · {item.time}</div>
      </div>
    </div>
    <div style={{ padding: 16 }}>
      <div className="tm-text-body-lg" style={{ color: 'var(--text-strong)' }}>{item.title}</div>
      <div className="tm-text-caption" style={{ marginTop: 5 }}>{item.venue}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end', marginTop: 12 }}>
        <div className="tm-text-caption tab-num">{item.cur}/{item.max}명 · 주최 {item.host}</div>
        <div className="tm-text-label tab-num">{item.fee.toLocaleString()}원</div>
      </div>
    </div>
  </Card>
);

const SMRevisionMatchSM3CompactItem = ({ item }) => (
  <Card pad={12}>
    <div style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) auto', gap: 12, alignItems: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: 12, background: `url(${item.img}) center/cover`, position: 'relative', overflow: 'hidden' }}>
        {item.urgent && <span style={{ position: 'absolute', left: 6, bottom: 6, borderRadius: 999, padding: '3px 6px', background: 'var(--orange500)', color: 'var(--static-white)' }} className="tm-text-micro">마감</span>}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="tm-text-body-lg" style={{ color: 'var(--text-strong)' }}>{item.title}</div>
        <div className="tm-text-caption" style={{ marginTop: 4 }}>{item.venue}</div>
        <div className="tm-text-caption tab-num" style={{ marginTop: 3 }}>{item.cur}/{item.max}명 · {item.date} {item.time}</div>
      </div>
      <div className="tm-text-label tab-num" style={{ color: 'var(--text-strong)', textAlign: 'right' }}>{item.fee.toLocaleString()}원</div>
    </div>
  </Card>
);

const SMRevisionMatchListMobileSM3 = ({ mode = 'card' }) => (
  <SMRevisionShell title="teameet" notificationNew bottom navActive="matches">
    <SMRevisionMatchSM3Header mode={mode}/>
    <div style={{ padding: '16px 20px 24px' }}>
      <div style={{ marginBottom: 10 }}>
        <div>
          <div className="tm-text-label">개인 매치</div>
          <div className="tm-text-caption" style={{ marginTop: 2 }}>카드형과 콤팩트형 중 하나만 선택해 비교합니다.</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {MATCHES.slice(0, mode === 'card' ? 3 : 5).map((item, index) => (
          mode === 'card'
            ? <SMRevisionMatchSM3CardItem key={item.id} item={item} index={index}/>
            : <SMRevisionMatchSM3CompactItem key={item.id} item={item}/>
        ))}
      </div>
    </div>
  </SMRevisionShell>
);

const SMRevisionMatchSearchMobileSM3 = () => {
  const results = MATCHES.filter((item) => item.title.includes('풋살') || item.venue.includes('풋살'));
  return (
    <SMRevisionShell title="teameet" notificationNew bottom navActive="matches">
      <SMRevisionMatchSM3Header mode="compact" query="풋살"/>
      <div style={{ padding: '16px 20px 24px' }}>
        <div style={{ marginBottom: 12 }}>
          <div className="tm-text-label">검색 결과</div>
          <div className="tm-text-caption" style={{ marginTop: 2 }}><span className="tab-num">{results.length}</span>개 매치 · 검색 조건은 유지한 채 보기 모드만 전환합니다.</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {results.map((item) => <SMRevisionMatchSM3CompactItem key={item.id} item={item}/>)}
        </div>
        <Card pad={14} style={{ marginTop: 14, background: 'var(--grey50)' }}>
          <div className="tm-text-label">검색 화면 규칙</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>검색어가 들어오면 카운터와 종목 selector는 그대로 유지하고, 목록 영역만 검색 결과로 바꾼다. 결과가 없으면 조회 없음 상태 보드로 연결한다.</div>
        </Card>
      </div>
    </SMRevisionShell>
  );
};

const SMRevisionMatchSearchFocusMobileSM3 = () => (
  <SMRevisionShell title="teameet" notificationNew={false} bottom navActive="matches">
    <div style={{ padding: '18px 20px 0' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1, minHeight: 48, borderRadius: 12, background: 'var(--grey100)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', color: 'var(--text-strong)', boxShadow: '0 0 0 2px var(--blue50)' }}>
          <Icon name="search" size={18}/>
          <span className="tm-text-body">풋살</span>
          <span style={{ width: 1, height: 20, background: 'var(--blue500)', marginLeft: 2 }}/>
        </div>
        <button className="tm-btn tm-btn-sm tm-btn-ghost">취소</button>
      </div>
    </div>
    <div style={{ padding: '18px 20px 24px' }}>
      <div className="tm-text-label">최근 검색</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {['풋살', '강남', '오늘 저녁', '마감임박'].map((label, index) => (
          <button key={label} className={`tm-chip ${index === 0 ? 'tm-chip-active' : ''}`}>{label}</button>
        ))}
      </div>
      <div style={{ height: 1, background: 'var(--grey100)', margin: '20px 0' }}/>
      <div className="tm-text-label">빠른 조건</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
        {[
          ['오늘 참여 가능', '오늘매치수 기준'],
          ['내 주변 5km', '위치 권한 필요 시 안내'],
          ['마감임박', '24시간 이내'],
          ['초보 환영', '레벨 필터 적용'],
        ].map(([title, sub]) => (
          <Card key={title} pad={14} interactive>
            <div className="tm-text-label">{title}</div>
            <div className="tm-text-micro" style={{ marginTop: 4, color: 'var(--text-caption)' }}>{sub}</div>
          </Card>
        ))}
      </div>
      <Card pad={14} style={{ marginTop: 18, background: 'var(--grey50)' }}>
        <div className="tm-text-label">검색 진입 규칙</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>검색바를 누르면 목록은 즉시 검색 모드로 전환한다. 하단 탭은 유지하고, 입력 중에는 취소 버튼과 최근 검색/빠른 조건을 먼저 보여준다.</div>
      </Card>
    </div>
  </SMRevisionShell>
);

const SMRevisionMatchStateMobileSM3 = ({ state = 'empty', noTop = false }) => {
  const isError = state === 'error';
  const Shell = noTop ? SMRevisionMatchSM4Shell : SMRevisionShell;
  return (
    <Shell title="teameet" notificationNew={false} bottom navActive="matches">
      {noTop ? <SMRevisionMatchSM4SearchHeader mode="card"/> : <SMRevisionMatchSM3Header mode="card"/>}
      <div style={{ padding: 20 }}>
        <Card pad={22} style={{ textAlign: 'center', minHeight: 246, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, background: isError ? 'rgba(254,152,0,.12)' : 'var(--grey100)', color: isError ? 'var(--orange500)' : 'var(--grey500)', display: 'grid', placeItems: 'center', marginBottom: 14 }}>
            <Icon name={isError ? 'bell' : 'calendar'} size={25}/>
          </div>
          <div className="tm-text-subhead">{isError ? '새로고침 필요합니다 필요' : '매치가 없습니다'}</div>
          <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text)' }}>{isError ? '네트워크 이슈 상태는 원문 문구를 보존하고, 사용자가 잃은 검색 조건 없이 다시 시도하게 합니다.' : '선택한 종목과 지역에 맞는 매치가 없을 때는 다른 종목 또는 전체 목록으로 복구합니다.'}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <button className="tm-btn tm-btn-md tm-btn-primary">{isError ? '새로고침' : '전체 보기'}</button>
            <button className="tm-btn tm-btn-md tm-btn-neutral">필터 초기화</button>
          </div>
        </Card>
      </div>
    </Shell>
  );
};

const SMRevisionMatchDetailMobileSM3 = ({ mine = false, status = 'default', sheet = false, noTop = false }) => {
  const match = MATCHES[0];
  const joined = status !== 'default';
  const locked = status === 'pending' || status === 'approved';
  const actionLabel = mine ? '매치 관리' : status === 'pending' ? '승인중' : status === 'approved' ? '승인완료' : '참가하기';
  const lockedActionStyle = status === 'pending'
    ? { background: 'var(--orange500)', color: 'var(--static-white)', opacity: 1, cursor: 'not-allowed' }
    : status === 'approved'
      ? { background: 'var(--green500)', color: 'var(--static-white)', opacity: 1, cursor: 'not-allowed' }
      : undefined;
  const Shell = noTop ? SMRevisionMatchSM4Shell : SMRevisionShell;
  return (
    <Shell title="" back notificationNew={false} bottom={false}>
      <div style={{ height: 216, background: `url(${match.img}) center/cover`, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(25,31,40,.04), rgba(25,31,40,.66))' }}/>
        <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="뒤로가기" style={{ position: 'absolute', top: 12, left: 12, color: 'var(--static-white)' }}><Icon name="chevL" size={22}/></button>
        <div style={{ position: 'absolute', top: 12, right: 18, display: 'flex', gap: 4 }}>
          <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="공유" style={{ color: 'var(--static-white)' }}><Icon name="share" size={21}/></button>
          <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="알림" style={{ color: 'var(--static-white)' }}><Icon name="bell" size={21}/></button>
        </div>
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 18, color: 'var(--static-white)' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <Badge tone="blue">{SPORTS.find((sport) => sport.id === match.sport)?.label || match.sport}</Badge>
            <Badge tone="grey">{match.level}</Badge>
            <Badge tone={match.urgent ? 'orange' : 'grey'}>{match.urgent ? '마감임박' : '모집중'}</Badge>
          </div>
          <div className="tm-text-heading" style={{ color: 'var(--static-white)' }}>{match.title}</div>
        </div>
      </div>
      <div style={{ padding: '6px 20px 118px' }}>
        <SMRevisionInfoRow label="일시" value={`${match.date} ${match.time}`}/>
        <SMRevisionInfoRow label="장소" value={match.venue}/>
        <SMRevisionInfoRow label="인원" value={`${match.cur}/${match.max}명 모집`} sub="모집 완료 시 참가 CTA를 막고 이유를 표시한다."/>
        <SMRevisionInfoRow label="참가비" value={`${match.fee.toLocaleString()}원`} sub="승인 후 결제 단계로 이동"/>
        {joined && (
          <Card pad={14} style={{ marginTop: 14, background: status === 'approved' ? 'rgba(3,178,108,.08)' : 'rgba(254,152,0,.10)' }}>
            <div className="tm-text-label" style={{ color: status === 'approved' ? 'var(--green500)' : 'var(--orange500)' }}>{status === 'approved' ? '승인완료' : '승인중'}</div>
            <div className="tm-text-caption" style={{ marginTop: 5 }}>{status === 'approved' ? '참가가 확정되었습니다. 결제 내역과 매치 상세를 계속 확인할 수 있습니다.' : '호스트 승인 대기 중입니다. 처리 주체와 다음 상태를 계속 노출합니다.'}</div>
          </Card>
        )}
        <Card pad={16} style={{ marginTop: 14 }}>
          <div className="tm-text-body-lg">호스트 정보</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>주최 횟수 18회 · 매너 4.9 · 프로필 바로가기 가능</div>
        </Card>
        <Card pad={16} style={{ marginTop: 10 }}>
          <div className="tm-text-body-lg">경기 소개글</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>시간 맞춰 도착할 수 있는 분만 신청해주세요. 초보도 편하게 참여할 수 있습니다.</div>
        </Card>
        <Card pad={16} style={{ marginTop: 10 }}>
          <div className="tm-text-body-lg">참가자 리스트</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>참가자 프로필 조회 가능. 더보기는 참가자 리스트 페이지로 이동합니다.</div>
        </Card>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="tm-text-caption">{mine ? '내가 만든 매치' : joined ? '참가 상태' : '결제 전 요약 확인'}</span>
          <span className="tm-text-label tab-num">{match.fee.toLocaleString()}원</span>
        </div>
        <SBtn full size="lg" variant={locked ? 'neutral' : 'primary'} disabled={locked} style={lockedActionStyle}>{actionLabel}</SBtn>
      </div>
      {sheet && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(25,31,40,.36)', display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', background: 'var(--bg)', borderRadius: '22px 22px 0 0', padding: '18px 20px 24px' }} role="dialog" aria-modal="true">
            <div style={{ width: 36, height: 4, borderRadius: 999, background: 'var(--grey200)', margin: '0 auto 18px' }}/>
            <div className="tm-text-subhead">참가 요약</div>
            <div className="tm-text-caption" style={{ marginTop: 6 }}>결제 전 매치, 일시, 장소, 인원, 금액을 다시 확인합니다.</div>
            <SMRevisionInfoRow label="매치" value={match.title}/>
            <SMRevisionInfoRow label="일시와 장소" value={`${match.date} ${match.time} · ${match.venue}`}/>
            <SMRevisionInfoRow label="참가비" value={`${match.fee.toLocaleString()}원`} sub="테스트 결제 흐름에서는 실제 청구 없음"/>
            <SBtn full size="lg">결제하고 참가하기</SBtn>
          </div>
        </div>
      )}
    </Shell>
  );
};

const SMRevisionMatchJoinFeedbackMobileSM3 = () => (
  <SMRevisionMatchDetailMobileSM3 sheet/>
);

const SMRevisionMatchJoinFeedbackOverlaySM3 = ({ noTop = false }) => {
  const match = MATCHES[0];
  const Shell = noTop ? SMRevisionMatchSM4Shell : SMRevisionShell;
  return (
    <Shell title="" back notificationNew={false} bottom={false}>
      <div style={{ height: 216, background: `url(${match.img}) center/cover`, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(25,31,40,.04), rgba(25,31,40,.66))' }}/>
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 18, color: 'var(--static-white)' }}>
          <Badge tone="blue">축구</Badge>
          <div className="tm-text-heading" style={{ color: 'var(--static-white)', marginTop: 8 }}>{match.title}</div>
        </div>
      </div>
      <div style={{ padding: '16px 20px 118px' }}>
        <SMRevisionInfoRow label="일시" value={`${match.date} ${match.time}`}/>
        <SMRevisionInfoRow label="장소" value={match.venue}/>
        <Card pad={16} style={{ marginTop: 14, background: 'rgba(254,152,0,.10)' }}>
          <div className="tm-text-label" style={{ color: 'var(--orange500)' }}>승인 요청 완료</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>호스트 승인 대기 중입니다. 승인 전까지 하단 CTA는 승인중으로 잠깁니다.</div>
        </Card>
      </div>
      <div style={{ position: 'absolute', left: 20, right: 20, bottom: 94, borderRadius: 16, background: 'var(--grey900)', color: 'var(--static-white)', padding: '14px 16px', boxShadow: 'var(--sh-2)' }}>
        <div className="tm-text-label" style={{ color: 'var(--static-white)' }}>승인 요청을 보냈습니다</div>
        <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.72)', marginTop: 3 }}>승인되면 알림으로 알려드릴게요.</div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="tm-text-caption">참가 상태</span>
          <span className="tm-text-label tab-num">{match.fee.toLocaleString()}원</span>
        </div>
        <SBtn full size="lg" variant="neutral" disabled style={{ background: 'var(--orange500)', color: 'var(--static-white)', opacity: 1, cursor: 'not-allowed' }}>승인중</SBtn>
      </div>
    </Shell>
  );
};

const SMRevisionMatchPaymentCompleteToastSMFinal = ({ noTop = false }) => {
  const match = MATCHES[0];
  const Shell = noTop ? SMRevisionMatchSM4Shell : SMRevisionShell;
  return (
    <Shell title="" back notificationNew={false} bottom={false}>
      <div style={{ height: 216, background: `url(${match.img}) center/cover`, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(25,31,40,.04), rgba(25,31,40,.66))' }}/>
        <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="뒤로가기" style={{ position: 'absolute', top: 12, left: 12, color: 'var(--static-white)' }}><Icon name="chevL" size={22}/></button>
        <div style={{ position: 'absolute', top: 12, right: 18, display: 'flex', gap: 4 }}>
          <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="공유" style={{ color: 'var(--static-white)' }}><Icon name="share" size={21}/></button>
          <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="알림" style={{ color: 'var(--static-white)' }}><Icon name="bell" size={21}/></button>
        </div>
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 18, color: 'var(--static-white)' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <Badge tone="blue">{SPORTS.find((sport) => sport.id === match.sport)?.label || match.sport}</Badge>
            <Badge tone="grey">{match.level}</Badge>
            <Badge tone="orange">승인 대기</Badge>
          </div>
          <div className="tm-text-heading" style={{ color: 'var(--static-white)' }}>{match.title}</div>
        </div>
      </div>
      <div style={{ padding: '6px 20px 118px' }}>
        <SMRevisionInfoRow label="일시" value={`${match.date} ${match.time}`}/>
        <SMRevisionInfoRow label="장소" value={match.venue}/>
        <SMRevisionInfoRow label="인원" value={`${match.cur}/${match.max}명 모집`} sub="신청 완료 후에도 모집 정보는 유지한다."/>
        <SMRevisionInfoRow label="참가비" value={`${match.fee.toLocaleString()}원`} sub="테스트 결제 흐름에서는 실제 청구 없음"/>
        <Card pad={14} style={{ marginTop: 14, background: 'rgba(254,152,0,.10)' }}>
          <div className="tm-text-label" style={{ color: 'var(--orange500)' }}>승인중</div>
          <div className="tm-text-caption" style={{ marginTop: 5 }}>신청이 접수되었습니다. 호스트가 승인하기 전까지 하단 버튼은 승인중으로 잠깁니다.</div>
        </Card>
        <Card pad={16} style={{ marginTop: 14 }}>
          <div className="tm-text-body-lg">호스트 정보</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>주최 횟수 18회 · 매너 4.9 · 프로필 바로가기 가능</div>
        </Card>
        <Card pad={16} style={{ marginTop: 10 }}>
          <div className="tm-text-body-lg">참가자 리스트</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>참가자 프로필 조회 가능. 더보기는 참가자 리스트 페이지로 이동합니다.</div>
        </Card>
      </div>
      <div style={{ position: 'absolute', left: 20, right: 20, bottom: 132, zIndex: 5, borderRadius: 16, background: 'var(--grey900)', color: 'var(--static-white)', padding: '14px 16px', boxShadow: 'var(--sh-2)' }}>
        <div className="tm-text-label" style={{ color: 'var(--static-white)' }}>신청이 완료되었습니다</div>
        <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.72)', marginTop: 3 }}>승인되면 알림으로 알려드릴게요.</div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="tm-text-caption">참가 상태</span>
          <span className="tm-text-label tab-num">{match.fee.toLocaleString()}원</span>
        </div>
        <SBtn full size="lg" variant="neutral" disabled style={{ background: 'var(--orange500)', color: 'var(--static-white)', opacity: 1, cursor: 'not-allowed' }}>승인중</SBtn>
      </div>
    </Shell>
  );
};

const SMRevisionMatchMobileGridSM3 = () => (
  <SMRevisionRuleBoard title="03 개인 매치 · SM 수정안 3 mobile grid" items={[
    { title: '보존 기준', body: '원본 03, 기존 수정안 1/2, 기존 SM 수정안은 유지한다. SM3는 같은 번호 아래 새 비교 섹션으로만 추가한다.' },
    { title: '목록 구조', body: '상단바 title은 홈과 동일하게 teameet으로 유지하고 상단 검색 액션은 제외한다. 본문 검색바, 단일 보기 전환 버튼, 종목 count selector, 3개 요약 counter를 mobile 첫 화면에 둔다.' },
    { title: '보기 모드', body: '카드형과 콤팩트형은 동시에 노출하지 않는다. ㅁ|ㅁ 또는 ㅁ 단일 버튼 하나만 두고, 클릭할 때마다 다음 보기 모드로 전환한다.' },
    { title: '검색 진입', body: '검색바를 누르면 focused search 화면으로 전환한다. 입력창, 취소, 최근 검색, 빠른 조건을 먼저 보여주고 하단 탭은 유지한다.' },
    { title: '검색 결과', body: '검색어 확정 후에는 검색어를 검색바에 유지하고, 전체보기 버튼 없이 결과 목록만 보여준다. 결과 없음은 조회 없음 상태로 연결한다.' },
    { title: '요약 카운터', body: '매치수, 오늘매치수, 마감임박은 카드 박스 없이 텍스트 통계로만 표시해 목록보다 무겁게 보이지 않게 한다.' },
    { title: '상태 보드', body: '조회 없음과 네트워크 오류를 별도 보드로 둔다. 오류 문구는 0502 원문 그대로 보존하고 복구 CTA를 함께 둔다.' },
    { title: '상세/참가', body: '상세는 하단바를 제외하고 back/share/notification, 정보 블록, sticky CTA, 참가 요약 bottom sheet, 결제하고 참가하기를 분리한다.' },
    { title: '참가 직후 feedback', body: '결제하고 참가하기 후에는 승인 요청을 보냈다는 toast 또는 간단 팝업을 즉시 보여주고, 하단 CTA는 승인중으로 잠근다.' },
    { title: '참여 후 상태', body: '승인중과 승인완료는 하단 버튼 자체가 승인중/승인완료로 바뀌며 클릭되지 않는다. 별도 상태보기 CTA로 보내지 않는다.' },
    { title: '내 매치', body: '내가 만든 매치일 때 참가 CTA 대신 매치 관리 CTA를 보여주며, 관리 화면 이동 책임을 명시한다.' },
    { title: '미정 범위', body: '0502 문서에 개인 매치 만들기 상세 요구사항은 없다. SM3 mobile에서는 새로 설계하지 않고 grid에 미정으로 남긴다.' },
    { title: '다음 단계', body: 'mobile 확정 후 m03 grid 세부 동작과 tablet/desktop workspace를 별도 pass에서 정리한다.' },
  ]}/>
);

const SMRevisionTeamBrowseMobile = () => (
  <SMRevisionShell title="팀" notificationNew bottom navActive="teams">
    <div style={{ padding: 20 }}>
      <div className="tm-text-heading">팀 전체조회</div>
      <div className="tm-text-body" style={{ marginTop: 6 }}>SM 문서에는 body 요구사항이 아직 없으므로 shell, 비교, 선택 CTA를 먼저 고정한다.</div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '18px 0' }}>
        {['전체', '축구', '풋살', '러닝', '수영'].map((label, index) => <HapticChip key={label} active={index === 0}>{label}</HapticChip>)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {TEAMS.map((team) => (
          <Card key={team.id} pad={16}>
            <div style={{ display: 'flex', gap: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: 16, background: 'var(--blue50)', display: 'grid', placeItems: 'center', color: 'var(--blue500)' }}>
                <Icon name="people" size={24}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tm-text-body-lg">{team.name}</div>
                <div className="tm-text-caption" style={{ marginTop: 3 }}>{team.sport} · {team.members}명 · 매너 {team.manner}</div>
                <StatBar label="신뢰 신호" value={Math.round(team.manner * 20)} sub="sample signal · production에서는 verified/estimated 구분 필요"/>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  </SMRevisionShell>
);

const SMRevisionChatListMobile = () => (
  <SMRevisionShell title="채팅" back search notificationNew bottom navActive="my">
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 16 }}>
        {['전체', '개인매치', '팀매치', '팀'].map((label, index) => <HapticChip key={label} active={index === 0}>{label}</HapticChip>)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 72 }}>
        {CHATS.map((chat, index) => (
          <Card key={chat.id} pad={14}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: 16, background: `url(${chat.avatar}) center/cover`, flexShrink: 0 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div className="tm-text-body-lg line-clamp-2">{chat.name}</div>
                  {index === 0 && <Badge tone="blue">고정</Badge>}
                </div>
                <div className="tm-text-caption line-clamp-2">{chat.group ? '팀' : '개인매치'} · {chat.last}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="tm-text-micro">{chat.time}</div>
                {chat.unread > 0 && <div style={{ marginTop: 6, minWidth: 20, height: 20, borderRadius: 999, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{chat.unread}</div>}
              </div>
            </div>
          </Card>
        ))}
      </div>
      <button className="tm-btn tm-btn-primary" aria-label="open chat" style={{ position: 'absolute', right: 20, bottom: 90, width: 54, height: 54, borderRadius: 999, padding: 0, display: 'grid', placeItems: 'center', boxShadow: '0 10px 24px rgba(49,130,246,.28)' }}>
        <Icon name="chat" size={22}/>
      </button>
    </div>
  </SMRevisionShell>
);

const SMRevisionChatRoomMobile = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <TopNav title="주말 축구 매치" onBack={() => {}} trailing={<button className="tm-btn tm-btn-icon tm-btn-ghost"><Icon name="plus" size={20}/></button>}/>
    <div style={{ padding: 16, borderBottom: '1px solid var(--grey100)' }}>
      <Card pad={14}>
        <div className="tm-text-label">개인매치 상세조회 바로가기</div>
        <div className="tm-text-caption" style={{ marginTop: 4 }}>카테고리에 따른 주제를 상단에 노출하고 관련 상세로 이동합니다.</div>
      </Card>
    </div>
    <div style={{ flex: 1, padding: 20, overflow: 'auto', background: 'var(--grey50)' }}>
      {['오늘 14:00 경기 인원 확인 부탁드려요.', '네. 저는 20분 전에 도착할게요.', '시스템: 수아님이 참가 승인되었습니다.'].map((msg, index) => (
        <div key={index} style={{ maxWidth: index === 1 ? 246 : 280, marginLeft: index === 1 ? 'auto' : 0, marginBottom: 10, padding: '10px 12px', borderRadius: 14, background: index === 1 ? 'var(--blue500)' : 'var(--bg)', color: index === 1 ? 'var(--static-white)' : 'var(--text-strong)', boxShadow: 'var(--sh-1)' }}>
          <div className="tm-text-body" style={{ color: 'inherit' }}>{msg}</div>
        </div>
      ))}
    </div>
    <div style={{ padding: '12px 16px 22px', display: 'flex', gap: 8, borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-btn tm-btn-icon tm-btn-neutral" aria-label="이미지 추가"><Icon name="plus" size={20}/></button>
      <div style={{ flex: 1, minHeight: 44, borderRadius: 999, background: 'var(--grey100)', display: 'flex', alignItems: 'center', padding: '0 14px' }} className="tm-text-caption">메시지 입력</div>
      <button className="tm-btn tm-btn-icon tm-btn-primary" aria-label="전송"><Icon name="send" size={20}/></button>
    </div>
  </div>
);

const SMRevisionNotificationsMobile = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ height: 56, padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--grey100)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="tm-btn tm-btn-icon tm-btn-ghost"><Icon name="chevL" size={22}/></button>
        <div className="tm-text-body-lg">알림 <span className="tab-num" style={{ color: 'var(--blue500)' }}>2</span></div>
      </div>
      <button className="tm-btn tm-btn-sm tm-btn-ghost">모두읽음</button>
    </div>
    <div style={{ height: 756, overflow: 'auto', padding: 20 }}>
      {['오늘', '어제'].map((group, groupIndex) => (
        <div key={group} style={{ marginBottom: 20 }}>
          <div className="tm-text-label" style={{ marginBottom: 8 }}>{group}</div>
          {NOTIFS.slice(groupIndex * 2, groupIndex * 2 + 3).map((notif) => (
            <Card key={notif.id} pad={14} style={{ marginBottom: 8, background: notif.unread ? 'var(--blue50)' : 'var(--bg)' }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 14, background: notif.unread ? 'var(--blue500)' : 'var(--grey100)', color: notif.unread ? 'var(--static-white)' : 'var(--text-muted)', display: 'grid', placeItems: 'center' }}>
                  <Icon name="bell" size={18}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="tm-text-body-lg">{notif.title}</div>
                  <div className="tm-text-caption line-clamp-2" style={{ marginTop: 3 }}>{notif.body}</div>
                  <div className="tm-text-micro" style={{ marginTop: 6 }}>{notif.time}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ))}
    </div>
  </div>
);

const SMRevisionLoginMobile = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ flex: 1, padding: '72px 24px 24px', display: 'flex', flexDirection: 'column' }}>
      <div className="tm-text-heading">teameet에 로그인하고<br/>내 운동 기록을 이어가세요</div>
      <div className="tm-text-body" style={{ marginTop: 10 }}>SM design freeze의 로그인 대상은 기존 인증 흐름을 유지하되, 홈 비로그인 상태와 연결해 비교한다.</div>
      <div style={{ marginTop: 36, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">휴대폰 번호로 계속하기</button>
        <button className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block">카카오로 계속하기</button>
        <button className="tm-btn tm-btn-lg tm-btn-outline tm-btn-block">이메일로 로그인</button>
      </div>
      <Card pad={16} style={{ marginTop: 24 }}>
        <div className="tm-text-body-lg">비로그인 fallback</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>홈은 닉네임 없이 “안녕하세요”만 표시하고 모든 개인 수치를 -로 처리한다.</div>
      </Card>
      <div style={{ flex: 1 }}/>
      <div className="tm-text-caption">약관과 개인정보 처리방침에 동의하고 계속합니다.</div>
    </div>
  </div>
);

const SMRevisionAuthV2Option = ({ title, sub, tone = 'neutral', selected = false, disabled = false }) => (
  <button className="tm-pressable tm-break-keep" type="button" disabled={disabled} style={{
    width: '100%',
    minHeight: 62,
    borderRadius: 16,
    border: selected ? '1px solid var(--blue500)' : '1px solid var(--grey100)',
    background: disabled ? 'var(--grey50)' : selected ? 'var(--blue50)' : 'var(--bg)',
    color: disabled ? 'var(--text-caption)' : 'var(--text-strong)',
    padding: '12px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    textAlign: 'left',
    opacity: disabled ? .64 : 1,
  }}>
    <span style={{
      width: 38,
      height: 38,
      borderRadius: 13,
      display: 'grid',
      placeItems: 'center',
      background: tone === 'blue' ? 'var(--blue500)' : tone === 'warning' ? 'var(--orange50)' : 'var(--grey100)',
      color: tone === 'blue' ? 'var(--static-white)' : tone === 'warning' ? 'var(--orange500)' : 'var(--grey700)',
      flexShrink: 0,
    }}>
      {selected ? <Icon name="check" size={18}/> : <Icon name={tone === 'warning' ? 'bell' : 'shield'} size={18}/>}
    </span>
    <span style={{ flex: 1, minWidth: 0 }}>
      <span className="tm-text-body-lg" style={{ display: 'block' }}>{title}</span>
      <span className="tm-text-caption" style={{ display: 'block', marginTop: 2 }}>{sub}</span>
    </span>
  </button>
);

const SMRevisionLoginMobileV2 = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ height: 56, padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div className="tm-text-body-lg">teameet</div>
      <button className="tm-btn tm-btn-sm tm-btn-ghost">둘러보기</button>
    </div>
    <div style={{ flex: 1, overflow: 'auto', padding: '28px 24px 26px', display: 'flex', flexDirection: 'column' }}>
      <Badge tone="blue" size="sm">01 AUTH</Badge>
      <div className="tm-text-heading" style={{ marginTop: 14 }}>운동 기록과 팀 활동을<br/>계속 이어가세요</div>
      <div className="tm-text-body" style={{ marginTop: 10, color: 'var(--text-muted)' }}>
        0502 기준 login surface는 홈 비로그인 fallback과 분리해, 인증 전후의 상태 차이를 명확하게 보여준다.
      </div>

      <div style={{ marginTop: 28, display: 'grid', gap: 10 }}>
        <SMRevisionAuthV2Option title="휴대폰 번호로 계속하기" sub="가장 안정적인 계정 복구 경로" tone="blue" selected/>
        <SMRevisionAuthV2Option title="카카오로 계속하기" sub="프로필 동의 후 온보딩으로 이동"/>
        <SMRevisionAuthV2Option title="이메일로 로그인" sub="기존 계정이 있으면 바로 이어서 시작"/>
      </div>

      <Card pad={16} style={{ marginTop: 18, background: 'var(--grey50)' }}>
        <div className="tm-text-body-lg">로그인하지 않고 홈 보기</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>홈은 "안녕하세요"만 표시하고 활동, 매너, 통계는 모두 - 값으로 유지한다.</div>
      </Card>

      <div style={{ flex: 1, minHeight: 18 }}/>
      <div className="tm-text-caption" style={{ lineHeight: 1.55 }}>
        계속하면 서비스 약관과 개인정보 처리방침에 동의합니다. 필수 동의가 없으면 CTA는 비활성화된다.
      </div>
    </div>
  </div>
);

const SMRevisionAuthTermsV2 = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <TopNav title="약관 확인" onBack={() => {}}/>
    <div style={{ flex: 1, padding: '20px 20px 112px', overflow: 'auto' }}>
      <div className="tm-text-heading">시작하기 전에<br/>필수 동의를 확인해요</div>
      <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)' }}>동의 상태가 CTA 활성 조건이라는 점을 별도 보드로 고정한다.</div>
      <div style={{ display: 'grid', gap: 10, marginTop: 24 }}>
        <SMRevisionAuthV2Option title="서비스 이용약관" sub="필수 · 최신 버전 2026.05" selected/>
        <SMRevisionAuthV2Option title="개인정보 처리방침" sub="필수 · 인증/매치 참여에 필요" selected/>
        <SMRevisionAuthV2Option title="마케팅 알림 수신" sub="선택 · 홈 알림 new 상태와 연동"/>
        <SMRevisionAuthV2Option title="위치 권한" sub="선택 · 거부해도 수동 지역 선택 가능" tone="warning"/>
      </div>
      <Card pad={16} style={{ marginTop: 18 }}>
        <div className="tm-text-body-lg">Disabled state</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>필수 약관을 해제하면 하단 CTA는 비활성화하고, 어떤 항목이 필요한지 inline reason을 보여준다.</div>
      </Card>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">동의하고 계속하기</button>
    </div>
  </div>
);

const SMRevisionAuthCallbackV2 = ({ state = 'loading' }) => {
  const config = {
    loading: {
      badge: 'PROVIDER LOADING',
      title: '계정 정보를 확인하고 있어요',
      sub: '카카오에서 돌아오는 중입니다. 3초 이상 지연되면 취소 CTA를 함께 노출합니다.',
      tone: 'blue',
      action: '로그인 취소',
    },
    error: {
      badge: 'NETWORK ERROR',
      title: '로그인을 완료하지 못했어요',
      sub: '네트워크 오류가 발생했습니다. 입력한 선택값은 잃지 않고 다시 시도할 수 있어야 합니다.',
      tone: 'red',
      action: '다시 시도',
    },
    conflict: {
      badge: 'ACCOUNT CONFLICT',
      title: '이미 연결된 계정이 있어요',
      sub: '다른 provider로 가입한 계정이 있으면 기존 계정으로 이어서 시작하는 경로를 제공한다.',
      tone: 'orange',
      action: '기존 계정으로 계속',
    },
  }[state];
  const isLoading = state === 'loading';

  return (
    <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <StatusBar/>
      <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Card pad={20}>
          <Badge tone={config.tone} size="sm">{config.badge}</Badge>
          <div className="tm-text-heading" style={{ marginTop: 16 }}>{config.title}</div>
          <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)', lineHeight: 1.55 }}>{config.sub}</div>
          <div style={{ display: 'grid', gap: 10, marginTop: 22 }}>
            {isLoading ? (
              <>
                <Skeleton w="100%" h={52} r={14}/>
                <Skeleton w="72%" h={18} r={8}/>
                <button className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block">{config.action}</button>
              </>
            ) : (
              <>
                <button className={`tm-btn tm-btn-lg ${state === 'error' ? 'tm-btn-danger' : 'tm-btn-primary'} tm-btn-block`}>{config.action}</button>
                <button className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block">다른 방법 선택</button>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

const SMRevisionAuthFallbackV2 = () => (
  <SMRevisionShell title="teameet" search notificationNew={false}>
    <div style={{ padding: 20 }}>
      <div className="tm-text-heading">안녕하세요</div>
      <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)' }}>로그인하지 않은 사용자의 홈 연결 상태를 인증 섹션에서 함께 고정한다.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 18 }}>
        <Card pad={16}>
          <div className="tm-text-caption">이번달 활동</div>
          <NumberDisplay value="-" size={30} sub="지난달 비교 -"/>
        </Card>
        <Card pad={16}>
          <div className="tm-text-caption">매너점수</div>
          <NumberDisplay value="-" size={30} sub="상위 -"/>
        </Card>
      </div>
      <Card pad={16} style={{ marginTop: 14 }}>
        <div className="tm-text-body-lg">랜덤 추천으로 대체</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>대표 추천 매치와 추천 매치 5개는 개인화 추천 대신 랜덤 조회 결과로 표시한다.</div>
      </Card>
      <Card pad={16} style={{ marginTop: 10 }}>
        <div className="tm-text-body-lg">로그인 유도는 보조 액션</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>탐색을 막지 않고, 개인 수치가 필요한 영역에서만 로그인 CTA를 제공한다.</div>
      </Card>
    </div>
  </SMRevisionShell>
);

const SMRevisionAuthMobileGridV2 = () => (
  <SMRevisionRuleBoard title="01 인증/로그인 · SM 수정안 2 mobile grid" items={[
    { title: '보존 기준', body: '원본 01과 기존 SM 수정안은 그대로 두고, 같은 번호의 새 비교 섹션에서만 수정한다.' },
    { title: '모바일 우선', body: '로그인 main, 약관 disabled, callback loading/error/conflict, 비로그인 홈 fallback을 먼저 고정한다.' },
    { title: '상태 분리', body: 'provider loading, denied/network/account conflict는 toast가 아니라 persistent card와 복구 CTA로 보여준다.' },
    { title: '홈 연결', body: '비로그인 홈은 안녕하세요만 표시하고 개인 수치와 날씨/통계 값은 - 또는 랜덤 추천으로 대체한다.' },
    { title: '컴포넌트', body: 'tm-btn, tm-card, Badge, Skeleton, NumberDisplay, tab-num을 쓰고 임의 장식/깊은 shadow를 금지한다.' },
    { title: '다음 단계', body: 'mobile 확정 후 M01 grid의 m01-mb-main/state/components/motion을 이 기준으로 재작성한다.' },
  ]}/>
);

const SMRevisionAuthStepProgress = ({ step = 1 }) => (
  <div style={{ display: 'flex', gap: 6 }}>
    {[1, 2, 3, 4].map((item) => (
      <div key={item} style={{ flex: 1, height: 5, borderRadius: 999, background: item <= step ? 'var(--blue500)' : 'var(--grey150)' }}/>
    ))}
  </div>
);

const SMRevisionAuthStepShell = ({ step = 1, title, sub, children, cta = '다음', disabled = false, helper, back = true }) => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <TopNav title="시작 설정" onBack={back ? () => {} : undefined}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px 112px' }}>
      <SMRevisionAuthStepProgress step={step}/>
      <div className="tm-text-micro tab-num" style={{ marginTop: 18, color: 'var(--blue500)' }}>STEP {step} / 4</div>
      <div className="tm-text-heading" style={{ marginTop: 8 }}>{title}</div>
      <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)' }}>{sub}</div>
      <div style={{ marginTop: 22 }}>
        {children}
      </div>
      {helper && (
        <Card pad={16} style={{ marginTop: 18, background: 'var(--grey50)' }}>
          <div className="tm-text-body-lg">{helper.title}</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>{helper.body}</div>
        </Card>
      )}
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <button className={`tm-btn tm-btn-lg ${disabled ? 'tm-btn-neutral' : 'tm-btn-primary'} tm-btn-block`} disabled={disabled}>{cta}</button>
      {disabled && <div className="tm-text-micro" style={{ marginTop: 8, textAlign: 'center' }}>필수 선택을 완료하면 계속할 수 있어요.</div>}
    </div>
  </div>
);

const SMRevisionAuthSM3Login = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <div style={{ flex: 1, padding: '40px 24px 24px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: 20, background: 'var(--blue500)', display: 'grid', placeItems: 'center', color: 'var(--static-white)', marginBottom: 28 }}>
          <span className="tm-text-title" style={{ color: 'var(--static-white)' }}>T</span>
        </div>
        <div className="tm-text-heading">
          같이 뛸 사람을<br/>한 번에 찾아요
        </div>
        <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 10, marginBottom: 34 }}>
          Teameet에 오신 걸 환영합니다
        </div>

        <button className="tm-btn tm-btn-lg tm-btn-outline tm-btn-block">이메일로 로그인</button>
        <div className="tm-text-caption" style={{ marginTop: 10 }}>
          기존 계정이 있으면 이메일 로그인 후 종목·레벨·지역 확인으로 이어집니다.
        </div>
      </div>
      <div>
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">로그인 없이 시작하기</button>
        <div className="tm-text-body" style={{ marginTop: 12, textAlign: 'center' }}>
          아직 계정이 없나요? <span style={{ color: 'var(--blue500)', fontWeight: 600 }}>회원가입</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }}/>
          <span className="tm-text-caption">또는</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }}/>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { label: '카카오', bg: '#FEE500', color: 'var(--static-black)' },
            { label: '네이버', bg: 'var(--green500)', color: 'var(--static-white)' },
            { label: 'Apple', bg: 'var(--static-black)', color: 'var(--static-white)' },
          ].map((item) => (
            <button key={item.label} className="tm-btn tm-btn-md tm-pressable" style={{ flex: 1, background: item.bg, color: item.color }}>{item.label}</button>
          ))}
        </div>
        <div className="tm-text-caption" style={{ marginTop: 16, textAlign: 'center', lineHeight: 1.6 }}>
          계속하면 서비스 약관과 개인정보 처리방침에 동의합니다.
        </div>
      </div>
    </div>
  </div>
);

const SMRevisionAuthField = ({ label, placeholder, type = 'text', helper, state }) => (
  <div>
    <div className="tm-text-label" style={{ marginBottom: 8 }}>{label}</div>
    <div style={{ display: 'flex', gap: 8 }}>
      <input
        type={type}
        placeholder={placeholder}
        className="tm-input"
        style={{ flex: 1, minWidth: 0, borderColor: state === 'error' ? 'var(--red500)' : state === 'success' ? 'var(--green500)' : 'var(--border)' }}
      />
    </div>
    {helper && (
      <div className="tm-text-caption" style={{ marginTop: 6, color: state === 'error' ? 'var(--red500)' : state === 'success' ? 'var(--green500)' : 'var(--text-caption)' }}>
        {helper}
      </div>
    )}
  </div>
);

const SMRevisionAuthEmailLoginSM3 = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <TopNav title="이메일 로그인" onBack={() => {}}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '28px 24px 112px' }}>
      <Badge tone="blue" size="sm">EMAIL LOGIN</Badge>
      <div className="tm-text-heading" style={{ marginTop: 14 }}>이메일로<br/>로그인하세요</div>
      <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)' }}>입력은 이메일과 비밀번호만 받는다. 성공하면 기존 계정 상태에 따라 확인 화면 또는 홈으로 이동한다.</div>
      <div style={{ display: 'grid', gap: 18, marginTop: 30 }}>
        <SMRevisionAuthField label="이메일" placeholder="you@example.com" type="email"/>
        <SMRevisionAuthField label="비밀번호" placeholder="비밀번호" type="password"/>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
        <button className="tm-btn tm-btn-sm tm-btn-ghost">비밀번호 찾기</button>
        <button className="tm-btn tm-btn-sm tm-btn-ghost">회원가입</button>
      </div>
      <Card pad={16} style={{ marginTop: 22, background: 'var(--grey50)' }}>
        <div className="tm-text-body-lg">오류 처리</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>이메일 형식 오류, 비밀번호 불일치, 네트워크 실패는 field helper와 persistent error card로 표시한다.</div>
      </Card>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">로그인</button>
    </div>
  </div>
);

const SMRevisionAuthSignupSM3 = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <TopNav title="회원가입" onBack={() => {}}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 20px 118px' }}>
      <Badge tone="blue" size="sm">SIGN UP</Badge>
      <div className="tm-text-heading" style={{ marginTop: 14 }}>계정을 만들고<br/>운동 설정을 이어가요</div>
      <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)' }}>회원가입 후 원본 01의 종목, 레벨, 지역 선택 화면으로 이어진다.</div>
      <div style={{ display: 'grid', gap: 16, marginTop: 24 }}>
        <div>
          <div className="tm-text-label" style={{ marginBottom: 8 }}>닉네임</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 92px', gap: 8 }}>
            <input className="tm-input" placeholder="사용할 닉네임"/>
            <button className="tm-btn tm-btn-md tm-btn-neutral">중복체크</button>
          </div>
          <div className="tm-text-caption" style={{ marginTop: 6, color: 'var(--green500)' }}>사용 가능한 닉네임이에요.</div>
        </div>
        <SMRevisionAuthField label="이메일" placeholder="you@example.com" type="email"/>
        <SMRevisionAuthField label="비밀번호" placeholder="8자 이상" type="password"/>
        <SMRevisionAuthField label="비밀번호 확인" placeholder="비밀번호 다시 입력" type="password" helper="일치하지 않으면 가입 CTA는 비활성화한다."/>
      </div>
      <Card pad={16} style={{ marginTop: 18, background: 'var(--grey50)' }}>
        <div className="tm-text-body-lg">가입 후 행동</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>가입 성공 시 로그인 상태로 종목 선택 step에 진입한다. 닉네임 중복 실패와 비밀번호 불일치는 현재 화면에 남겨 복구한다.</div>
      </Card>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">회원가입하고 계속</button>
    </div>
  </div>
);

const SMRevisionAuthSM3TermsStep = () => (
  <SMRevisionAuthStepShell
    step={1}
    title={<>시작하기 전에<br/>약관을 확인해요</>}
    sub="SM2의 약관 확인 화면을 SM3 온보딩 첫 단계로 편입한다. 필수 동의가 없으면 다음 CTA는 비활성화한다."
    cta="동의하고 종목 선택"
    helper={{ title: 'Step 1 행동', body: '필수 약관 동의 후 원본 온보딩 종목 선택 디자인으로 이동한다. 선택 약관은 홈 알림 new 상태와 연결한다.' }}
  >
    <div style={{ display: 'grid', gap: 10 }}>
      <SMRevisionAuthV2Option title="서비스 이용약관" sub="필수 · 최신 버전 2026.05" selected tone="blue"/>
      <SMRevisionAuthV2Option title="개인정보 처리방침" sub="필수 · 인증/매치 참여에 필요" selected tone="blue"/>
      <SMRevisionAuthV2Option title="마케팅 알림 수신" sub="선택 · 추천/공지 알림에 사용"/>
      <SMRevisionAuthV2Option title="위치 권한 안내" sub="선택 · 거부해도 지역은 직접 선택 가능" tone="warning"/>
    </div>
  </SMRevisionAuthStepShell>
);

const SMRevisionAuthSM3SportStep = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ padding: '8px 20px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
      <button className="tm-pressable tm-break-keep" style={{ width: 40, height: 40, background: 'transparent', border: 'none', color: 'var(--text-strong)' }}>
        <Icon name="chevL" size={22}/>
      </button>
      <div style={{ flex: 1, display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= 2 ? 'var(--blue500)' : 'var(--grey150)' }}/>
        ))}
      </div>
      <button className="tm-pressable tm-break-keep" style={{ background: 'transparent', border: 'none', fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>건너뛰기</button>
    </div>

    <div style={{ flex: 1, padding: '40px 20px 20px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, color: 'var(--blue500)', fontWeight: 700, letterSpacing: 0 }}>STEP 2 / 4</div>
      <div className="tm-text-heading" style={{ marginTop: 8 }}>
        관심 종목을<br/>알려주세요
      </div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8, marginBottom: 24 }}>여러 개 선택할 수 있어요</div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {SPORTS.filter(s => s.id !== 'all').map((sport) => {
            const selected = ['soccer', 'futsal', 'running', 'swim'].includes(sport.id);
            return (
              <button key={sport.id} className="tm-card tm-pressable" style={{
                aspectRatio: '1/1',
                padding: 16,
                textAlign: 'left',
                background: selected ? 'var(--blue50)' : 'var(--bg)',
                border: `2px solid ${selected ? 'var(--blue500)' : 'var(--border)'}`,
                position: 'relative',
                overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', inset: 0, background: `url(${sport.img}) center/cover`, opacity: selected ? .2 : .12 }}/>
                <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                  <div className="tm-text-body-lg">{sport.label}</div>
                  <div className="tm-text-micro" style={{ marginTop: 4 }}>{selected ? '선택됨' : '선택 가능'}</div>
                </div>
                {selected && <div style={{ position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: 11, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center' }}><Icon name="check" size={14} stroke={3}/></div>}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ paddingTop: 16 }}>
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">4개 선택 · 다음</button>
      </div>
    </div>
  </div>
);

const SMRevisionAuthLevelSportCard = ({ sport, badge, options, note, selected = 1, needsInput = false }) => (
  <Card pad={16}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Badge tone={needsInput ? 'orange' : 'blue'} size="sm">{badge}</Badge>
      <div className="tm-text-body-lg">{sport}</div>
    </div>
    <div className="tm-text-caption" style={{ marginTop: 6 }}>{note}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
      {options.map((option, index) => (
        <button key={option} className={`tm-chip ${index === selected ? 'tm-chip-active' : ''}`} style={{ justifyContent: 'center' }}>{option}</button>
      ))}
    </div>
    {needsInput && (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
        <div className="tm-input" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-caption)' }}>스케이트 3년</div>
        <div className="tm-input" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-caption)' }}>장비 보유</div>
      </div>
    )}
  </Card>
);

const SMRevisionAuthSM3LevelStep = ({ disabled = false }) => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ padding: '8px 20px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
      <button className="tm-pressable tm-break-keep" style={{ width: 40, height: 40, background: 'transparent', border: 'none', color: 'var(--text-strong)' }}>
        <Icon name="chevL" size={22}/>
      </button>
      <div style={{ flex: 1, display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= 3 ? 'var(--blue500)' : 'var(--grey150)' }}/>
        ))}
      </div>
    </div>

    <div style={{ flex: 1, padding: '32px 20px 20px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ fontSize: 12, color: 'var(--blue500)', fontWeight: 700, letterSpacing: 0 }}>STEP 3 / 4</div>
      <div className="tm-text-heading" style={{ marginTop: 8 }}>
        종목별 실력은<br/>어느 정도세요?
      </div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8, marginBottom: 18 }}>선택한 종목마다 원본 레벨 선택 리스트로 입력해요</div>
      <div style={{ flex: 1, overflow: 'auto', paddingRight: 2 }}>
        {[
          { sport: '축구', selected: 'B', rows: [['S', '선수 출신', '전/현직 선수'], ['A', '고수', '동호회 선수급'], ['B', '중수', '주 2-3회 규칙적 참여'], ['C', '초보', '취미로 시작한 정도'], ['D', '입문', '처음 시작해요']] },
          { sport: '풋살', selected: 'C', rows: [['A', '고수', '팀 전술 이해'], ['B', '중수', '주 1회 이상'], ['C', '초보-중수', '5:5 경험 1년 이상']] },
          { sport: '수영', selected: 'D', rows: [['B', '리그 경험', '경기 규칙과 포지션 이해'], ['C', '동호회', '스케이트 경력 1년 이상'], ['D', '입문', '스케이트 경력 입력 필요']] },
        ].map((group) => (
          <div key={group.sport} style={{ marginBottom: 18 }}>
            <div className="tm-text-body-lg" style={{ marginBottom: 10 }}>{group.sport}</div>
            {group.rows.map(([grade, title, sub]) => {
              const selected = grade === group.selected;
              return (
                <button key={grade} className="tm-list-row tm-pressable" style={{
                  width: '100%',
                  marginBottom: 8,
                  borderRadius: 12,
                  border: selected ? '2px solid var(--blue500)' : '1px solid var(--border)',
                  background: selected ? 'var(--blue50)' : 'var(--bg)',
                  textAlign: 'left',
                }}>
                  <GradeBadge grade={grade}/>
                  <div style={{ flex: 1 }}>
                    <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{title}</div>
                    <div className="tm-text-caption" style={{ marginTop: 2 }}>{sub}</div>
                  </div>
                  {selected ? <Icon name="check" size={18} color="var(--blue500)" stroke={2.4}/> : <Icon name="chevR" size={20} color="var(--grey400)"/>}
                </button>
              );
            })}
            {group.sport === '수영' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                <div className="tm-input" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-caption)' }}>스케이트 3년</div>
                <div className="tm-input" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-caption)' }}>장비 보유</div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ paddingTop: 12 }}>
        <button className={`tm-btn tm-btn-lg ${disabled ? 'tm-btn-neutral' : 'tm-btn-primary'} tm-btn-block`} disabled={disabled}>{disabled ? '필수 레벨 입력 필요' : '레벨 선택 완료'}</button>
      </div>
    </div>
  </div>
);

const SMRevisionAuthSM3RegionStep = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ padding: '8px 20px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
      <button className="tm-pressable tm-break-keep" style={{ width: 40, height: 40, background: 'transparent', border: 'none', color: 'var(--text-strong)' }}>
        <Icon name="chevL" size={22}/>
      </button>
      <div style={{ flex: 1, display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--blue500)' }}/>
        ))}
      </div>
    </div>

    <div style={{ flex: 1, padding: '40px 24px 0', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, color: 'var(--blue500)', fontWeight: 700, letterSpacing: 0 }}>STEP 4 / 4</div>
      <div className="tm-text-heading" style={{ marginTop: 8 }}>
        주로 어디서<br/>운동하세요?
      </div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>근처 매치를 우선 추천해드려요</div>

      <div style={{ marginTop: 24, padding: '14px 16px', borderRadius: 12, background: 'var(--grey50)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="search" size={18} color="var(--text-muted)"/>
        <input placeholder="동·구 검색" style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 14, color: 'var(--text-strong)' }}/>
      </div>

      <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>인기 지역</div>
      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {['강남구', '마포구 (선택됨)', '송파구', '성동구', '용산구', '서초구', '영등포구', '관악구', '서대문구'].map((r, i) => (
          <button key={r} className="tm-pressable tm-break-keep" style={{
            height: 36,
            padding: '0 14px',
            borderRadius: 999,
            border: 0,
            background: i === 1 ? 'var(--grey900)' : 'var(--grey100)',
            color: i === 1 ? 'var(--static-white)' : 'var(--text-strong)',
            fontSize: 13,
            fontWeight: 600,
          }}>{r.replace(' (선택됨)', '')}</button>
        ))}
      </div>

      <div style={{ marginTop: 32, padding: 16, borderRadius: 12, background: 'var(--blue50)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>i</div>
        <div style={{ fontSize: 13, color: 'var(--blue700)', fontWeight: 500, lineHeight: 1.5 }}>
          마포구 근처에 <span style={{ fontWeight: 700 }}>이번 주 12개 매치</span>가 모집 중이에요!
        </div>
      </div>

      <div style={{ flex: 1 }}/>
      <div style={{ paddingBottom: 24 }}>
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">지역 선택 완료</button>
      </div>
    </div>
  </div>
);

const SMRevisionAuthSM3Welcome = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <div style={{ flex: 1, padding: '56px 24px 112px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ width: 72, height: 72, borderRadius: 24, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', marginBottom: 24 }}>
        <Icon name="check" size={30}/>
      </div>
      <div className="tm-text-heading">준비가 끝났어요</div>
      <div className="tm-text-body" style={{ marginTop: 10, color: 'var(--text-muted)' }}>선택한 종목, 레벨, 지역을 기준으로 홈 추천과 매치 필터가 시작됩니다.</div>
      <div style={{ display: 'grid', gap: 10, marginTop: 26 }}>
        <Card pad={16}>
          <div className="tm-text-caption">종목</div>
          <div className="tm-text-body-lg" style={{ marginTop: 4 }}>축구, 풋살, 수영, 수영</div>
        </Card>
        <Card pad={16}>
          <div className="tm-text-caption">지역</div>
          <div className="tm-text-body-lg" style={{ marginTop: 4 }}>서울 강남구 · 현재 위치 허용</div>
        </Card>
      </div>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">홈으로 시작하기</button>
    </div>
  </div>
);

const SMRevisionAuthSM3ExceptionBoard = () => (
  <div style={{ width: 840, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', padding: 24, overflow: 'hidden' }}>
    <div className="tm-text-heading">01 인증 SM3 · 예외/처리 상태</div>
    <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)' }}>원본 01의 상태 보드와 SM2 callback/fallback을 하나의 처리 기준으로 합친다.</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginTop: 20 }}>
      {[
        ['Provider loading', '로그인 버튼 클릭 후 skeleton + 취소 CTA. 3초 이상 지연되면 도움말 노출.', 'blue'],
        ['Provider denied', '필수 정보 동의 취소. 다시 로그인과 다른 방법 선택을 제공.', 'red'],
        ['Network error', '입력/선택값은 보존하고 재시도 CTA를 제공.', 'red'],
        ['Account conflict', '이미 연결된 계정. 기존 계정으로 계속 또는 다른 방법 선택.', 'orange'],
        ['Required missing', '종목/레벨/지역 필수값 누락. CTA disabled + reason row.', 'orange'],
        ['Location denied', '위치 권한 거부. 수동 지역 선택과 나중에 설정하기 제공.', 'orange'],
        ['Signed out home', '안녕하세요만 표시, 개인 수치 - 처리, 랜덤 추천으로 대체.', 'grey'],
        ['Confirm edit', '확인 화면의 수정 버튼은 해당 step으로 복귀하고 선택값 보존.', 'blue'],
        ['Welcome complete', '홈 push transition. reduced motion에서는 fade만 사용.', 'green'],
      ].map(([title, body, tone], index) => (
        <Card key={title} pad={16} style={{ minHeight: 148 }}>
          <Badge tone={tone} size="sm">{String(index + 1).padStart(2, '0')}</Badge>
          <div className="tm-text-body-lg" style={{ marginTop: 10 }}>{title}</div>
          <div className="tm-text-caption" style={{ marginTop: 6, lineHeight: 1.45 }}>{body}</div>
        </Card>
      ))}
    </div>
  </div>
);

const SMRevisionAuthSM3ActionMap = () => (
  <div style={{ width: 840, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 24, overflow: 'hidden' }}>
    <div className="tm-text-heading">01 인증 SM3 · 버튼 행동표</div>
    <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)' }}>각 버튼은 trigger, feedback, final state를 분리한다.</div>
    <div style={{ display: 'grid', gap: 8, marginTop: 20 }}>
      {[
        ['로그인 없이 시작하기', '비로그인 홈 fallback', '홈: 안녕하세요, 수치 -, 랜덤 추천'],
        ['이메일로 로그인', '이메일 로그인 form 또는 magic link', '기존 계정이면 확인 화면, 실패 시 network error'],
        ['카카오/네이버/Apple', 'provider callback loading', '성공 시 기존 계정 여부에 따라 확인/홈 분기'],
        ['동의하고 계속하기', '필수 약관 확인', '누락 시 disabled reason, 완료 시 종목 선택'],
        ['선택 완료/레벨 저장/지역 저장', 'progress advance', '필수값 누락 시 현재 step 유지'],
        ['나중에 설정하기', '권한/지역 선택 skip', '홈은 서울 기본 또는 랜덤 추천으로 시작'],
        ['수정', '해당 step으로 복귀', '이전 선택값 보존 후 확인 화면으로 돌아오기'],
        ['홈으로 시작하기', 'welcome completion', '홈 02로 push transition'],
        ['다시 시도/다른 방법 선택', 'error recovery', 'callback 재시도 또는 로그인 main 복귀'],
      ].map(([button, feedback, result], index) => (
        <div key={button} className="tm-list-row" style={{ borderRadius: 14, border: '1px solid var(--grey100)', background: index % 2 ? 'var(--grey50)' : 'var(--bg)' }}>
          <div className="tm-text-micro tab-num" style={{ width: 34, color: 'var(--blue500)' }}>{String(index + 1).padStart(2, '0')}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tm-text-body-lg">{button}</div>
            <div className="tm-text-caption" style={{ marginTop: 2 }}>{feedback}</div>
          </div>
          <div className="tm-text-caption" style={{ width: 220 }}>{result}</div>
        </div>
      ))}
    </div>
  </div>
);

const SMRevisionAuthSM4Checklist = () => (
  <div style={{ width: 840, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', padding: 24, overflow: 'hidden' }}>
    <Badge tone="blue" size="sm">SM4 COMPLETE CHECK</Badge>
    <div className="tm-text-heading" style={{ marginTop: 12 }}>01 인증 SM4 · 추가 완료 체크리스트</div>
    <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)' }}>SM3를 복사한 뒤 기존 01/SM2/M01에서 빠진 화면을 실제 아트보드로 추가한 버전.</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 22 }}>
      {[
        ['선택 확인 화면', '종목, 종목별 레벨, 지역 요약과 항목별 수정 버튼을 추가.'],
        ['OAuth callback loading', 'provider 버튼 이후 skeleton, 취소 CTA, 중복 submit 차단.'],
        ['OAuth callback error/conflict', '네트워크 오류와 계정 충돌을 persistent card로 복구.'],
        ['약관 미동의 disabled', '필수 약관 누락 이유와 disabled CTA를 실제 화면화.'],
        ['이메일 로그인 오류', '이메일 형식, 비밀번호, 네트워크 오류 상태를 field helper로 표시.'],
        ['회원가입 입력 오류', '닉네임 중복, 비밀번호 불일치, 가입 CTA disabled를 추가.'],
        ['위치 권한 거부', '권한 거부 후 수동 지역 선택과 나중에 설정하기 복구 경로.'],
        ['온보딩 이어하기', '앱 종료/뒤로가기 후 저장된 값으로 이어서 진행.'],
        ['원본 비교 보강', '종목/레벨/지역/환영 원본 비교 아트보드 분리.'],
        ['버튼 행동 확장', '확인 화면 수정 버튼과 오류 복구 버튼까지 행동표에 포함.'],
      ].map(([title, body]) => (
        <Card key={title} pad={16} style={{ minHeight: 112 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <input type="checkbox" checked readOnly aria-label={title} style={{ width: 20, height: 20, accentColor: 'var(--blue500)', flexShrink: 0, marginTop: 2 }}/>
            <div>
              <div className="tm-text-body-lg">{title}</div>
              <div className="tm-text-caption" style={{ marginTop: 5, lineHeight: 1.45 }}>{body}</div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  </div>
);

const SMRevisionAuthSM4TermsDisabled = () => (
  <SMRevisionAuthStepShell
    step={1}
    title={<>필수 약관에<br/>동의해주세요</>}
    sub="SM4는 필수 약관 미체크 상태와 하단 CTA disabled reason을 실제 화면으로 분리한다."
    cta="필수 약관 동의 후 가능"
    disabled
    helper={{ title: '필수 누락', body: '서비스 이용약관과 개인정보 처리방침을 모두 선택해야 종목 선택으로 이동한다.' }}
  >
    <div style={{ display: 'grid', gap: 10 }}>
      <SMRevisionAuthV2Option title="서비스 이용약관" sub="필수 · 아직 동의하지 않음" tone="warning"/>
      <SMRevisionAuthV2Option title="개인정보 처리방침" sub="필수 · 아직 동의하지 않음" tone="warning"/>
      <SMRevisionAuthV2Option title="마케팅 알림 수신" sub="선택 · 나중에 설정 가능"/>
      <SMRevisionAuthV2Option title="위치 권한 안내" sub="선택 · 거부해도 지역 직접 선택 가능"/>
    </div>
  </SMRevisionAuthStepShell>
);

const SMRevisionAuthSM4Confirm = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <TopNav title="선택 확인" onBack={() => {}}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 20px 118px' }}>
      <Badge tone="blue" size="sm">CONFIRM</Badge>
      <div className="tm-text-heading" style={{ marginTop: 14 }}>이 설정으로<br/>시작할까요?</div>
      <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)' }}>각 항목의 수정 버튼은 해당 온보딩 step으로 돌아가고, 저장된 선택값을 유지한다.</div>
      <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
        {[
          ['관심 종목', '축구 · 풋살 · 수영 · 수영', 'Step 2로 이동'],
          ['종목별 레벨', '축구 B · 풋살 C · 수영 D · 수영 B', 'Step 3으로 이동'],
          ['주 활동 지역', '마포구 · 강남구', 'Step 4로 이동'],
        ].map(([title, value, action]) => (
          <Card key={title} pad={16}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tm-text-label">{title}</div>
                <div className="tm-text-body-lg" style={{ marginTop: 5 }}>{value}</div>
                <div className="tm-text-caption" style={{ marginTop: 4 }}>{action}</div>
              </div>
              <button className="tm-btn tm-btn-sm tm-btn-neutral">수정</button>
            </div>
          </Card>
        ))}
      </div>
      <Card pad={16} style={{ marginTop: 14, background: 'var(--blue50)' }}>
        <div className="tm-text-body-lg">추천 준비 완료</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>마포구 기준 이번 주 개인 매치 5개와 팀 매치 3개를 먼저 보여준다.</div>
      </Card>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">Teameet 시작하기</button>
    </div>
  </div>
);

const SMRevisionAuthSM4EmailLoginError = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <TopNav title="이메일 로그인" onBack={() => {}}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '28px 24px 112px' }}>
      <Badge tone="red" size="sm">LOGIN ERROR</Badge>
      <div className="tm-text-heading" style={{ marginTop: 14 }}>입력 정보를<br/>다시 확인해주세요</div>
      <div style={{ display: 'grid', gap: 18, marginTop: 30 }}>
        <SMRevisionAuthField label="이메일" placeholder="wrong-email" type="email" state="error" helper="이메일 형식이 올바르지 않아요."/>
        <SMRevisionAuthField label="비밀번호" placeholder="비밀번호" type="password" state="error" helper="이메일 또는 비밀번호가 일치하지 않아요."/>
      </div>
      <Card pad={16} style={{ marginTop: 22, background: 'var(--red50)', borderColor: 'var(--red-alpha-08)' }}>
        <div className="tm-text-body-lg" style={{ color: 'var(--red500)' }}>로그인을 완료하지 못했어요</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>네트워크 실패는 입력값을 유지한 채 재시도 CTA를 보여주고, 계정 없음은 회원가입으로 연결한다.</div>
      </Card>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-btn tm-btn-lg tm-btn-danger tm-btn-block">다시 로그인</button>
    </div>
  </div>
);

const SMRevisionAuthSM4SignupError = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <TopNav title="회원가입" onBack={() => {}}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 20px 118px' }}>
      <Badge tone="orange" size="sm">SIGN UP CHECK</Badge>
      <div className="tm-text-heading" style={{ marginTop: 14 }}>가입 전<br/>확인이 필요해요</div>
      <div style={{ display: 'grid', gap: 16, marginTop: 24 }}>
        <div>
          <div className="tm-text-label" style={{ marginBottom: 8 }}>닉네임</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 92px', gap: 8 }}>
            <input className="tm-input" placeholder="정민" style={{ borderColor: 'var(--red500)' }}/>
            <button className="tm-btn tm-btn-md tm-btn-neutral">중복체크</button>
          </div>
          <div className="tm-text-caption" style={{ marginTop: 6, color: 'var(--red500)' }}>이미 사용 중인 닉네임이에요.</div>
        </div>
        <SMRevisionAuthField label="이메일" placeholder="you@example.com" type="email" state="success" helper="사용 가능한 이메일이에요."/>
        <SMRevisionAuthField label="비밀번호" placeholder="8자 이상" type="password"/>
        <SMRevisionAuthField label="비밀번호 확인" placeholder="비밀번호 다시 입력" type="password" state="error" helper="비밀번호가 일치하지 않아요."/>
      </div>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block" disabled>오류 수정 후 가입 가능</button>
      <div className="tm-text-micro" style={{ marginTop: 8, textAlign: 'center' }}>닉네임 중복과 비밀번호 확인을 먼저 해결해주세요.</div>
    </div>
  </div>
);

const SMRevisionAuthSM4LocationDenied = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <TopNav title="지역 선택" onBack={() => {}}/>
    <div style={{ flex: 1, padding: '28px 20px 118px' }}>
      <Badge tone="orange" size="sm">LOCATION DENIED</Badge>
      <div className="tm-text-heading" style={{ marginTop: 14 }}>위치 권한 없이도<br/>시작할 수 있어요</div>
      <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)', lineHeight: 1.55 }}>권한을 거부해도 수동 지역 선택으로 복구한다. 닫으면 기존 선택값은 유지한다.</div>
      <Card pad={18} style={{ marginTop: 24, background: 'var(--orange50)' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <Icon name="pin" size={22} color="var(--orange500)"/>
          <div>
            <div className="tm-text-body-lg">현재 위치를 가져오지 못했어요</div>
            <div className="tm-text-caption" style={{ marginTop: 6 }}>설정에서 권한을 다시 켜거나, 직접 지역을 검색해 선택할 수 있어요.</div>
          </div>
        </div>
      </Card>
      <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">수동으로 지역 선택</button>
        <button className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block">나중에 설정하기</button>
      </div>
    </div>
  </div>
);

const SMRevisionAuthSM4Resume = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <TopNav title="온보딩 이어하기" onBack={() => {}}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '28px 20px 118px' }}>
      <Badge tone="blue" size="sm">RESUME</Badge>
      <div className="tm-text-heading" style={{ marginTop: 14 }}>이어서<br/>설정할까요?</div>
      <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)' }}>앱 종료나 뒤로가기 후 재진입하면 마지막 저장 지점과 누락 항목을 먼저 보여준다.</div>
      <div style={{ display: 'grid', gap: 10, marginTop: 24 }}>
        {[
          ['완료', '관심 종목', '축구 · 풋살 · 수영'],
          ['진행 중', '레벨 선택', '수영 레벨 입력 필요'],
          ['대기', '지역 선택', '레벨 완료 후 진행'],
        ].map(([status, title, sub]) => (
          <Card key={title} pad={15}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Badge tone={status === '완료' ? 'green' : status === '진행 중' ? 'orange' : 'grey'} size="sm">{status}</Badge>
              <div>
                <div className="tm-text-body-lg">{title}</div>
                <div className="tm-text-caption" style={{ marginTop: 4 }}>{sub}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">이어서 진행하기</button>
      <button className="tm-btn tm-btn-lg tm-btn-ghost tm-btn-block" style={{ marginTop: 8 }}>처음부터 다시 설정</button>
    </div>
  </div>
);

const SMRevisionProfileReviewMobile = () => (
  <SMRevisionShell title="마이" search notificationNew bottom navActive="my">
    <div style={{ padding: 20 }}>
      <Card pad={18}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ width: 58, height: 58, borderRadius: 20, background: `url(${IMG.av1}) center/cover` }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tm-text-subhead">정민</div>
            <div className="tm-text-caption">축구 · 풋살 · 매너 4.9</div>
          </div>
          <Badge tone="blue">verified</Badge>
        </div>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
        {[
          ['참가', 24],
          ['MVP', 5],
          ['리뷰', 18],
        ].map(([label, value]) => (
          <Card key={label} pad={14}>
            <div className="tm-text-caption">{label}</div>
            <div className="tm-text-subhead tab-num" style={{ marginTop: 4 }}>{value}</div>
          </Card>
        ))}
      </div>
      <SectionTitle title="받은 리뷰" sub="리뷰와 평판 신호는 verified/sample을 구분한다."/>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {['시간 약속을 잘 지켜요', '팀 플레이가 좋아요', '다시 같이 뛰고 싶어요'].map((text, index) => (
          <Card key={text} pad={14}>
            <div className="tm-text-body-lg">{text}</div>
            <div className="tm-text-caption" style={{ marginTop: 4 }}>매치 후 작성 · {index + 1}일 전</div>
          </Card>
        ))}
      </div>
      <SectionTitle title="리뷰 작성 흐름"/>
      <Card pad={16}>
        <div className="tm-text-body-lg">별점 + 태그 + 본문</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>SM 원문은 review를 대상 surface로 지정했지만 상세 body는 없다. 결제/매치 완료 후 companion flow로 둔다.</div>
      </Card>
    </div>
  </SMRevisionShell>
);

const SMRevisionPaymentMobile = ({ refund = false }) => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <TopNav title={refund ? '환불 요청' : '결제'} onBack={() => {}}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px 110px' }}>
      <Card pad={18}>
        <div className="tm-text-caption">테스트 결제</div>
        <NumberDisplay value={refund ? 8000 : 12000} unit="원" size={34} sub={refund ? '실환불 없음 · mock mode' : '실제 청구 없음 · mock mode'}/>
      </Card>
      <Card pad={16} style={{ marginTop: 12 }}>
        <MoneyRow label="매치 참가비" amount={refund ? 12000 : 12000}/>
        <MoneyRow label={refund ? '환불 가능 금액' : '플랫폼 할인'} amount={refund ? 8000 : -4000} accent/>
        <MoneyRow label={refund ? '환불 예정' : '결제 금액'} amount={refund ? 8000 : 8000} strong/>
      </Card>
      <Card pad={16} style={{ marginTop: 12 }}>
        <div className="tm-text-body-lg">{refund ? '환불 사유' : '결제 상태'}</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>{refund ? '처리 주체, 예상 다음 상태, 거절 가능성을 persistent UI로 표시한다.' : '성공/실패/pending은 toast가 아니라 내역과 상세 화면으로 이어진다.'}</div>
      </Card>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <SBtn full size="lg">{refund ? '환불 요청하기' : '결제하고 참가하기'}</SBtn>
    </div>
  </div>
);

const SMRevisionLandingMobile = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ height: 56, padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div className="tm-text-body-lg">teameet</div>
      <button className="tm-btn tm-btn-sm tm-btn-primary">시작하기</button>
    </div>
    <div style={{ padding: '28px 24px 0' }}>
      <div className="tm-text-heading">오늘 같이 뛸 사람을<br/>가장 빠르게 찾는 방법</div>
      <div className="tm-text-body" style={{ marginTop: 10 }}>SM 대상 surface인 landing은 badge/title만으로 첫 화면을 비우지 않고, CTA와 next-step summary를 바로 보여준다.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 28 }}>
        {[
          ['개인 매치', '03으로 이동'],
          ['팀매치', '04로 이동'],
          ['팀 찾기', '05로 이동'],
          ['채팅/알림', '06 activity'],
        ].map(([title, sub]) => (
          <Card key={title} pad={16}>
            <div className="tm-text-body-lg">{title}</div>
            <div className="tm-text-caption" style={{ marginTop: 4 }}>{sub}</div>
          </Card>
        ))}
      </div>
      <Card pad={18} style={{ marginTop: 18, background: 'var(--grey900)', color: 'var(--static-white)' }}>
        <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.66)' }}>오늘 열린 매치</div>
        <div className="tm-text-title tab-num" style={{ color: 'var(--static-white)', marginTop: 4 }}>124</div>
        <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.66)' }}>서울 기준 · sample data</div>
      </Card>
    </div>
  </div>
);

const SMRevisionAdminMobile = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', overflow: 'hidden' }}>
    <StatusBar/>
    <TopNav title="Admin" trailing={<button className="tm-btn tm-btn-sm tm-btn-neutral">필터</button>}/>
    <div style={{ height: 756, overflow: 'auto', padding: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          ['신고 대기', 12],
          ['정산 보류', 7],
          ['분쟁', 3],
          ['리뷰 검토', 18],
        ].map(([label, value]) => (
          <Card key={label} pad={14}>
            <div className="tm-text-caption">{label}</div>
            <div className="tm-text-subhead tab-num" style={{ marginTop: 4 }}>{value}</div>
          </Card>
        ))}
      </div>
      <SectionTitle title="운영 큐" sub="SM 대상 surface인 admin은 상세 body가 없으므로 기존 admin shell 아래 판단/처리 추적성을 먼저 고정한다."/>
      {['분쟁 환불 판단 필요', '팀매치 신고 접수', '시설 등록 검수'].map((title, index) => (
        <Card key={title} pad={16} style={{ marginBottom: 10 }}>
          <div className="tm-text-body-lg">{title}</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>담당자 · 사유 · 부분 실패 · audit log를 남긴다.</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="tm-btn tm-btn-sm tm-btn-primary">처리</button>
            <button className="tm-btn tm-btn-sm tm-btn-neutral">보류</button>
          </div>
        </Card>
      ))}
    </div>
  </div>
);

const SM2_TEAM_SUMMARY = {
  home: { name: 'FC 발빠른놈들', grade: 'A', manner: '4.8', wins: 23, color: 'var(--blue500)' },
  away: { name: '상대팀 모집중', grade: '-', manner: '-', wins: '-', color: 'var(--grey500)' },
};

const SMRevisionTeamLogoSM2 = ({ name, color = 'var(--blue500)' }) => (
  <div style={{ width: 46, height: 46, borderRadius: 14, background: 'var(--grey50)', border: '1px solid var(--grey100)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
    <div className="tm-text-label" style={{ color }}>{name.slice(0, 2)}</div>
  </div>
);

const SMRevisionTeamMatchShellSM2 = ({ children, bottom = true }) => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: bottom ? 12 : 0 }}>
      {children}
    </div>
    {bottom && <SMBottomNav active="teamMatches"/>}
  </div>
);

const SMRevisionTeamMatchSM2Header = ({ mode = 'card', query = '' }) => (
  <div style={{ padding: '18px 20px 0' }}>
    <div style={{ display: 'flex', gap: 8 }}>
      <div style={{ flex: 1, minHeight: 48, borderRadius: 12, background: 'var(--grey100)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', color: 'var(--text-caption)' }}>
        <Icon name="search" size={18}/>
        <span className="tm-text-body" style={{ color: query ? 'var(--text-strong)' : 'var(--text-caption)' }}>{query || '지역, 시간, 팀명 검색'}</span>
      </div>
      <button className="tm-btn tm-btn-icon tm-btn-neutral" aria-label={mode === 'card' ? '콤팩트 보기로 전환' : '카드 보기로 전환'}>
        {mode === 'card' ? 'ㅁ|ㅁ' : 'ㅁ'}
      </button>
    </div>
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '16px 0 14px' }}>
      {SPORTS.slice(0, 7).map((sport, index) => (
        <HapticChip key={sport.id} active={index === 0} count={index === 0 ? TEAM_MATCHES.length : index + 1}>{sport.label}</HapticChip>
      ))}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, padding: '2px 0 4px' }}>
      {[
        ['매치수', '28', '선택 종목 기준'],
        ['오늘매치수', '5', '서울 전체'],
        ['마감임박', '3', '24시간 이내'],
      ].map(([label, value, sub]) => (
        <div key={label} style={{ minWidth: 0 }}>
          <div className="tm-text-caption">{label}</div>
          <div className="tm-text-subhead tab-num" style={{ marginTop: 4 }}>{value}</div>
          <div className="tm-text-micro" style={{ marginTop: 2, color: 'var(--text-caption)' }}>{sub}</div>
        </div>
      ))}
    </div>
  </div>
);

const SMRevisionTeamMatchSearchFocusMobileSM2 = () => (
  <SMRevisionTeamMatchShellSM2>
    <div style={{ padding: '18px 20px 0' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1, minHeight: 48, borderRadius: 12, background: 'var(--grey100)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', color: 'var(--text-strong)', boxShadow: '0 0 0 2px var(--blue50)' }}>
          <Icon name="search" size={18}/>
          <input value="풋살" readOnly aria-label="팀매치 검색어" style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-strong)' }} className="tm-text-body"/>
        </div>
        <button className="tm-btn tm-btn-icon tm-btn-primary" aria-label="검색 실행">
          <Icon name="search" size={19}/>
        </button>
        <button className="tm-btn tm-btn-md tm-btn-ghost">취소</button>
      </div>
      <div style={{ marginTop: 20 }}>
        <div className="tm-text-label">최근 검색</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {['풋살', '강남 FC', 'A등급', '오늘 저녁'].map((label) => <HapticChip key={label}>{label}</HapticChip>)}
        </div>
      </div>
      <div style={{ marginTop: 22 }}>
        <div className="tm-text-label">빠른 조건</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
          {[
            ['마감임박', '24시간 이내'],
            ['오늘매치', '오늘 진행'],
            ['매너 4.7+', '팀 신뢰도'],
            ['가격 낮은순', '참가비 기준'],
          ].map(([title, sub], index) => (
            <Card key={title} pad={14} style={{ background: index === 0 ? 'var(--blue50)' : 'var(--bg)' }}>
              <div className="tm-text-label" style={{ color: index === 0 ? 'var(--blue500)' : 'var(--text-strong)' }}>{title}</div>
              <div className="tm-text-caption" style={{ marginTop: 4 }}>{sub}</div>
            </Card>
          ))}
        </div>
      </div>
      <Card pad={14} style={{ marginTop: 18, background: 'var(--grey50)' }}>
        <div className="tm-text-label">검색 진입 규칙</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>개인매치와 같은 focused search 화면을 사용한다. 검색어를 입력하고 오른쪽 검색 아이콘으로 결과 화면에 진입한다.</div>
      </Card>
    </div>
  </SMRevisionTeamMatchShellSM2>
);

const SMRevisionTeamMatchCardSM2 = ({ item, index }) => (
  <Card pad={0} style={{ overflow: 'hidden' }}>
    <div style={{ height: 146, background: 'var(--grey900)', position: 'relative', color: 'var(--static-white)', padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Badge tone="blue">{item.sport}</Badge>
          <Badge tone="grey">{item.grade}등급</Badge>
          <Badge tone={index === 0 ? 'orange' : 'grey'}>{index === 0 ? '마감임박' : '모집중'}</Badge>
        </div>
        <div className="tm-text-micro tab-num" style={{ color: 'rgba(255,255,255,.74)' }}>{item.format}</div>
      </div>
      <div>
        <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.72)' }}>{item.date} · {item.time}</div>
        <div className="tm-text-subhead" style={{ color: 'var(--static-white)', marginTop: 4 }}>{item.host} vs 상대팀</div>
      </div>
    </div>
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <SMRevisionTeamLogoSM2 name={item.host}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tm-text-body-lg" style={{ color: 'var(--text-strong)' }}>{item.host}</div>
          <div className="tm-text-caption" style={{ marginTop: 3 }}>{item.venue}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="tm-text-label tab-num">{item.cost.toLocaleString()}원</div>
          <div className="tm-text-micro" style={{ color: 'var(--text-caption)', marginTop: 2 }}>승리 {index === 0 ? 23 : 15}회</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
        {[
          ['매너', index === 0 ? '4.8' : '4.6'],
          ['인원', item.format],
          ['유니폼', item.uniform],
        ].map(([label, value]) => (
          <div key={label} style={{ minWidth: 0 }}>
            <div className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>{label}</div>
            <div className="tm-text-label tab-num" style={{ marginTop: 3 }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  </Card>
);

const SMRevisionTeamMatchCompactSM2 = ({ item, index }) => (
  <Card pad={12}>
    <div style={{ display: 'grid', gridTemplateColumns: '46px minmax(0, 1fr) auto', gap: 12, alignItems: 'center' }}>
      <SMRevisionTeamLogoSM2 name={item.host} color={index === 0 ? 'var(--blue500)' : 'var(--orange500)'}/>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
          <Badge tone="blue">{item.grade}</Badge>
          <div className="tm-text-body-lg" style={{ color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.host}</div>
        </div>
        <div className="tm-text-caption" style={{ marginTop: 4 }}>{item.venue}</div>
        <div className="tm-text-caption tab-num" style={{ marginTop: 3 }}>매너 {index === 0 ? '4.8' : '4.6'} · {item.format} · {item.time}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="tm-text-label tab-num">{item.cost.toLocaleString()}원</div>
        <div className="tm-text-micro" style={{ color: 'var(--text-caption)', marginTop: 4 }}>승 {index === 0 ? 23 : 15}</div>
      </div>
    </div>
  </Card>
);

const SMRevisionTeamMatchListMobileSM2 = ({ mode = 'card' }) => (
  <SMRevisionTeamMatchShellSM2>
    <SMRevisionTeamMatchSM2Header mode={mode}/>
    <div style={{ padding: '16px 20px 24px' }}>
      <div style={{ marginBottom: 10 }}>
        <div className="tm-text-label">팀매치</div>
        <div className="tm-text-caption" style={{ marginTop: 2 }}>카드형과 콤팩트형은 동시에 노출하지 않고 하나의 보기 모드만 렌더합니다.</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {TEAM_MATCHES.map((item, index) => (
          mode === 'card'
            ? <SMRevisionTeamMatchCardSM2 key={item.id} item={item} index={index}/>
            : <SMRevisionTeamMatchCompactSM2 key={item.id} item={item} index={index}/>
        ))}
      </div>
    </div>
  </SMRevisionTeamMatchShellSM2>
);

const SMRevisionTeamMatchSearchMobileSM2 = ({ mode = 'card' }) => (
  <SMRevisionTeamMatchShellSM2>
    <SMRevisionTeamMatchSM2Header mode={mode} query="풋살"/>
    <div style={{ padding: '16px 20px 24px' }}>
      <div className="tm-text-label">검색 결과</div>
      <div className="tm-text-caption" style={{ marginTop: 2, marginBottom: 12 }}><span className="tab-num">2</span>개 팀매치 · 검색어와 종목은 유지하고 보기 모드에 맞춰 결과를 보여줍니다.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {TEAM_MATCHES.filter((item) => item.sport === '풋살').map((item, index) => (
          mode === 'card'
            ? <SMRevisionTeamMatchCardSM2 key={item.id} item={item} index={index + 1}/>
            : <SMRevisionTeamMatchCompactSM2 key={item.id} item={item} index={index + 1}/>
        ))}
      </div>
    </div>
  </SMRevisionTeamMatchShellSM2>
);

const SMRevisionTeamMatchStateMobileSM2 = ({ state = 'empty' }) => {
  const isError = state === 'error';
  return (
    <SMRevisionTeamMatchShellSM2>
      <SMRevisionTeamMatchSM2Header mode="card"/>
      <div style={{ padding: 20 }}>
        <Card pad={22} style={{ minHeight: 246, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, background: isError ? 'rgba(254,152,0,.12)' : 'var(--grey100)', color: isError ? 'var(--orange500)' : 'var(--grey500)', display: 'grid', placeItems: 'center', marginBottom: 14 }}>
            <Icon name={isError ? 'bell' : 'calendar'} size={25}/>
          </div>
          <div className="tm-text-subhead">{isError ? '새로고침 필요합니다 필요' : '매치가 없습니다'}</div>
          <div className="tm-text-body" style={{ color: 'var(--text)', marginTop: 8 }}>
            {isError ? '0502 원문 오류 문구를 보존하고, 검색 조건과 종목 선택을 잃지 않은 상태에서 재시도합니다.' : '선택한 종목과 지역에 맞는 팀매치가 없을 때는 전체 보기와 필터 초기화를 제공합니다.'}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <button className="tm-btn tm-btn-md tm-btn-primary">{isError ? '새로고침' : '전체 보기'}</button>
            <button className="tm-btn tm-btn-md tm-btn-neutral">필터 초기화</button>
          </div>
        </Card>
      </div>
    </SMRevisionTeamMatchShellSM2>
  );
};

const SMRevisionTeamMatchDetailMobileSM2 = ({ mine = false, status = 'default', sheet = false }) => {
  const match = TEAM_MATCHES[0];
  const requested = status !== 'default';
  const requestedActionStyle = status === 'pending'
    ? { background: 'var(--orange500)', color: 'var(--static-white)', opacity: 1, cursor: 'not-allowed' }
    : status === 'approved'
      ? { background: 'var(--green500)', color: 'var(--static-white)', opacity: 1, cursor: 'not-allowed' }
      : undefined;
  return (
    <SMRevisionTeamMatchShellSM2 bottom={false}>
      <div style={{ height: 220, background: 'var(--grey900)', color: 'var(--static-white)', position: 'relative', padding: '22px 20px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="뒤로가기" style={{ position: 'absolute', top: 12, left: 12, color: 'var(--static-white)' }}><Icon name="chevL" size={22}/></button>
        <div style={{ position: 'absolute', top: 12, right: 18, display: 'flex', gap: 4 }}>
          <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="공유" style={{ color: 'var(--static-white)' }}><Icon name="share" size={21}/></button>
          <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="알림" style={{ color: 'var(--static-white)' }}><Icon name="bell" size={21}/></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 44px 1fr', gap: 12, alignItems: 'center' }}>
          <div style={{ minWidth: 0 }}>
            <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.68)' }}>홈팀</div>
            <div className="tm-text-subhead" style={{ color: 'var(--static-white)', marginTop: 4 }}>{SM2_TEAM_SUMMARY.home.name}</div>
            <div className="tm-text-micro tab-num" style={{ color: 'rgba(255,255,255,.72)', marginTop: 4 }}>매너 {SM2_TEAM_SUMMARY.home.manner} · 승 {SM2_TEAM_SUMMARY.home.wins}</div>
          </div>
          <div className="tm-text-label" style={{ color: 'rgba(255,255,255,.76)', textAlign: 'center' }}>VS</div>
          <div style={{ minWidth: 0, textAlign: 'right' }}>
            <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.68)' }}>상대팀</div>
            <div className="tm-text-subhead" style={{ color: 'var(--static-white)', marginTop: 4 }}>모집중</div>
            <div className="tm-text-micro" style={{ color: 'rgba(255,255,255,.72)', marginTop: 4 }}>신청 후 승인</div>
          </div>
        </div>
      </div>
      <div style={{ padding: '6px 20px 118px' }}>
        <SMRevisionInfoRow label="날짜와 시간" value={`${match.date} ${match.time}`}/>
        <SMRevisionInfoRow label="장소" value={match.venue}/>
        <SMRevisionInfoRow label="경기정보" value={`${match.sport} · ${match.format} · 전후반 30분`} sub={`${match.grade}등급 · 유니폼 ${match.uniform}`}/>
        <SMRevisionInfoRow label="참가비" value={`${match.cost.toLocaleString()}원`} sub="팀 단위 정산 · 테스트 결제 흐름에서는 실제 청구 없음"/>
        {requested && (
          <Card pad={14} style={{ marginTop: 14, background: status === 'approved' ? 'rgba(3,178,108,.08)' : 'rgba(254,152,0,.10)' }}>
            <div className="tm-text-label" style={{ color: status === 'approved' ? 'var(--green500)' : 'var(--orange500)' }}>{status === 'approved' ? '승인완료' : '승인중'}</div>
            <div className="tm-text-caption" style={{ marginTop: 5 }}>{status === 'approved' ? '신청이 확정되었습니다. 팀매치 상세와 결제 내역을 계속 확인할 수 있습니다.' : '신청 확인을 마쳤고 상대팀 검토 대기 중입니다. 처리 주체와 다음 상태를 화면에 남깁니다.'}</div>
          </Card>
        )}
        <Card pad={16} style={{ marginTop: 14 }}>
          <div className="tm-text-body-lg">팀 정보 보러가기</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>팀 상세조회로 이동해 매너, 전적, 멤버 구성을 확인합니다.</div>
        </Card>
        <Card pad={16} style={{ marginTop: 10 }}>
          <div className="tm-text-body-lg">채팅 및 신청</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>채팅은 신청 전 문의용 보조 CTA입니다. 신청은 bottom sheet에서 경기 요약과 결제 문구를 다시 확인합니다.</div>
        </Card>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="tm-text-caption">{mine ? '내가 만든 팀매치' : requested ? '신청 상태' : '채팅 후 신청 가능'}</span>
          <span className="tm-text-label tab-num">{match.cost.toLocaleString()}원</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: mine ? '1fr' : '104px 1fr', gap: 8 }}>
          {!mine && <button className="tm-btn tm-btn-lg tm-btn-neutral">채팅</button>}
          <button className={`tm-btn tm-btn-lg ${requested && !mine ? 'tm-btn-neutral' : 'tm-btn-primary'}`} disabled={requested && !mine} style={requested && !mine ? requestedActionStyle : undefined}>{mine ? '매치 관리' : requested ? (status === 'approved' ? '승인완료' : '승인중') : '신청하기'}</button>
        </div>
      </div>
      {status === 'pending' && (
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 104, borderRadius: 16, background: 'var(--grey900)', color: 'var(--static-white)', padding: '14px 16px', boxShadow: 'var(--sh-2)' }}>
          <div className="tm-text-label" style={{ color: 'var(--static-white)' }}>신청 확인을 완료했어요</div>
          <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.72)', marginTop: 3 }}>상대팀이 승인하면 알림으로 알려드릴게요.</div>
        </div>
      )}
      {sheet && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(25,31,40,.36)', display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', background: 'var(--bg)', borderRadius: '22px 22px 0 0', padding: '18px 20px 24px' }} role="dialog" aria-modal="true">
            <div style={{ width: 36, height: 4, borderRadius: 999, background: 'var(--grey200)', margin: '0 auto 18px' }}/>
            <div className="tm-text-subhead">신청 요약</div>
            <div className="tm-text-caption" style={{ marginTop: 6 }}>신청 전 팀, 일시, 장소, 금액을 다시 확인합니다.</div>
            <SMRevisionInfoRow label="팀매치" value={`${match.host} vs 상대팀`}/>
            <SMRevisionInfoRow label="일시와 장소" value={`${match.date} ${match.time} · ${match.venue}`}/>
            <SMRevisionInfoRow label="신청 금액" value={`${match.cost.toLocaleString()}원`} sub="테스트 결제 흐름에서는 실제 청구 없음"/>
            <Card pad={14} style={{ margin: '12px 0 14px', background: 'var(--grey50)' }}>
              {[
                ['팀 정보 확인', `${match.host} · ${match.grade}등급`],
                ['경기 조건 확인', `${match.format} · ${match.uniform} 유니폼`],
                ['결제 전 확인', '승인 후 상태와 내역을 계속 표시'],
              ].map(([title, sub]) => (
                <div key={title} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0' }}>
                  <div style={{ width: 22, height: 22, borderRadius: 999, background: 'var(--blue50)', color: 'var(--blue500)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Icon name="check" size={14}/>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="tm-text-label">{title}</div>
                    <div className="tm-text-caption" style={{ marginTop: 1 }}>{sub}</div>
                  </div>
                </div>
              ))}
            </Card>
            <SBtn full size="lg">결제하고 신청하기</SBtn>
          </div>
        </div>
      )}
    </SMRevisionTeamMatchShellSM2>
  );
};

const SMRevisionTeamMatchMobileGridSM2 = () => (
  <SMRevisionRuleBoard title="04 팀매치 · SM 수정안 2 mobile grid" items={[
    { title: '보존 기준', body: '원본 04와 기존 04 SM 수정안은 유지한다. SM2는 같은 번호 아래 새 비교 섹션으로만 추가한다.' },
    { title: '목록 셸', body: '팀매치 SM3에서는 상단바를 제거한다. 본문 검색바, 단일 보기 전환 버튼, 종목 count selector, 3개 요약 counter를 둔다.' },
    { title: '정렬 기준', body: '정렬기준 박스는 이번 pass에서 제외한다. 매치수, 오늘매치수, 마감임박 카운터까지만 유지한다.' },
    { title: '카드형', body: '이미지 대신 팀매치 전용 VS 히어로를 사용한다. 종목, 등급, 기간/마감, 일정, 팀명, 위치, 인원 포맷, 가격, 승리수를 분리한다.' },
    { title: '콤팩트형', body: '로고, 레벨, 매너정보, 팀 이름, 위치, 인원 포맷, 시간, 가격, 승리수를 한 행 안에서 빠르게 비교하게 한다.' },
    { title: '검색/상태', body: '검색 진입은 focused search 화면을 쓰고 오른쪽 검색 아이콘으로 실행한다. ㅁ 카드형과 ㅁ|ㅁ 콤팩트형 모두 검색 결과 보드를 둔다.' },
    { title: '상세 구조', body: '상세는 하단바를 제외하고 back/share/notification, 팀 정보 vs 히어로, 날짜/시간/장소, 경기정보, 팀 정보 보러가기를 분리한다.' },
    { title: '신청 흐름', body: '채팅은 보조 CTA, 신청은 primary CTA다. 신청하기 클릭 시 bottom sheet에서 팀/조건/결제 전 확인을 한 번 더 체크한 뒤 결제하고 신청하기로 확정한다.' },
    { title: '신청 후 상태', body: '신청 직후에는 확인 완료 피드백을 보여주고 CTA는 승인중으로 잠근다. 승인완료 상태도 버튼 자체가 승인완료로 잠긴다.' },
    { title: '내 팀매치', body: '내 팀매치에서는 채팅/신청 CTA를 제거하고 매치 관리 CTA만 남긴다. 관리 상세 이동 책임을 명시한다.' },
    { title: '미정 범위', body: '0502 문서에는 팀매치 만들기 상세 요구사항이 없다. SM2에서는 새 만들기 flow를 설계하지 않고 미정으로 남긴다.' },
  ]}/>
);

const SM2_TEAM_BROWSE_TEAMS = [
  { name: '성수 러너스 FC', sport: '풋살', region: '성동', members: 18, fit: 94, manner: 4.9, status: '모집중', tone: 'blue', logo: 'SR', trust: 'verified', next: '수 20:00 정기전', tags: ['주 1회', '초보-중수', '빠른 응답'] },
  { name: '마포 위클리 수영', sport: '수영', region: '마포', members: 24, fit: 88, manner: 4.8, status: '검토중', tone: 'orange', logo: 'MW', trust: 'estimated', next: '토 09:00 복식', tags: ['신입 환영', '여성 멤버', '대관 보유'] },
  { name: '강남 하프코트', sport: '러닝', region: '강남', members: 12, fit: 76, manner: 4.7, status: '마감', tone: 'grey', logo: 'GH', trust: 'sample', next: '다음 모집 알림', tags: ['3on3', '경험자 선호', '월 2회'] },
];

const SM2InlineStat = ({ label, value, sub }) => (
  <Card pad={12} style={{ background: 'var(--grey50)' }}>
    <div className="tm-text-caption">{label}</div>
    <div className="tm-text-subhead tab-num" style={{ marginTop: 3 }}>{value}</div>
    {sub && <div className="tm-text-micro" style={{ marginTop: 2 }}>{sub}</div>}
  </Card>
);

const SM2TeamBrowseCard = ({ team, selected = false }) => (
  <Card pad={16} interactive style={{ borderColor: selected ? 'var(--blue500)' : 'var(--border)', background: selected ? 'var(--blue50)' : 'var(--bg)' }}>
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ width: 54, height: 54, borderRadius: 16, background: selected ? 'var(--blue500)' : 'var(--grey900)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{team.logo}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <div className="tm-text-body-lg line-clamp-2">{team.name}</div>
          <Badge tone={team.tone} size="sm">{team.status}</Badge>
        </div>
        <div className="tm-text-caption" style={{ marginTop: 4 }}>{team.sport} · {team.region} · {team.members}명</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {team.tags.map((tag) => <Badge key={tag} tone="grey" size="sm">{tag}</Badge>)}
        </div>
      </div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
      <SM2InlineStat label="추천 적합도" value={`${team.fit}%`}/>
      <SM2InlineStat label="매너" value={team.manner}/>
      <SM2InlineStat label="신뢰" value={team.trust}/>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--grey100)' }}>
      <div className="tm-text-caption">{team.next}</div>
      <SBtn size="sm" variant={team.status === '마감' ? 'neutral' : 'primary'} disabled={team.status === '마감'}>{team.status === '마감' ? '알림받기' : '팀 보기'}</SBtn>
    </div>
  </Card>
);

const SMRevisionTeamBrowseMobileSM2 = () => (
  <SMRevisionShell title="팀" notificationNew bottom navActive="teams">
    <div style={{ padding: '18px 20px 96px' }}>
      <div className="tm-text-heading">나와 맞는 팀을 먼저 비교해요</div>
      <div className="tm-text-body" style={{ marginTop: 6 }}>0502 문서에는 05의 상하단바 유지까지만 확정되어 있어, 기존 온보딩의 선택 카드와 02 홈의 조용한 추천 문법을 합쳐 팀 탐색 기준을 고정합니다.</div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '18px 0 12px' }}>
        {['전체 42', '풋살 12', '축구 8', '수영 9', '러닝 6', '수영 7'].map((label, index) => <HapticChip key={label} active={index === 0}>{label}</HapticChip>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <SM2InlineStat label="모집중" value="18팀" sub="서울 기준"/>
        <SM2InlineStat label="내 프로필 매칭" value="7팀" sub="sample"/>
      </div>
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {SM2_TEAM_BROWSE_TEAMS.map((team, index) => <SM2TeamBrowseCard key={team.name} team={team} selected={index === 0}/>)}
      </div>
    </div>
  </SMRevisionShell>
);

const SMRevisionTeamBrowseDetailSM2 = () => {
  const team = SM2_TEAM_BROWSE_TEAMS[0];
  return (
    <SMRevisionShell title="" back notificationNew={false} bottom={false}>
      <div style={{ padding: '18px 20px 118px' }}>
        <Card pad={18} style={{ background: 'var(--grey900)', color: 'var(--static-white)' }}>
          <div style={{ width: 60, height: 60, borderRadius: 18, background: 'var(--blue500)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{team.logo}</div>
          <div className="tm-text-heading" style={{ color: 'var(--static-white)', marginTop: 14 }}>{team.name}</div>
          <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.72)', marginTop: 4 }}>{team.sport} · {team.region} · 매너 {team.manner}</div>
        </Card>
        <SectionTitle title="결정 정보" sub="팀 선택 전에 비교해야 하는 사실만 먼저 보여줍니다."/>
        <Card pad={16}>
          {[
            ['활동 방식', '주 1회 정기전 · 신규 멤버 3명 모집'],
            ['신뢰 신호', 'verified · 최근 경기 12회 · 신고 0건'],
            ['가입 조건', '풋살 초보-중수 · 성동/광진권 활동 가능'],
          ].map(([label, value]) => <SMRevisionInfoRow key={label} label={label} value={value}/>)}
        </Card>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
        <div className="tm-text-caption" style={{ marginBottom: 8 }}>신청 전 팀 정보와 내 프로필 공개 범위를 확인합니다.</div>
        <SBtn full size="lg">가입 가능 여부 확인</SBtn>
      </div>
    </SMRevisionShell>
  );
};

const SMRevisionTeamBrowseStateSM2 = ({ state = 'empty' }) => {
  const isError = state === 'error';
  return (
    <SMRevisionShell title="팀" notificationNew={false} bottom navActive="teams">
      <div style={{ padding: '18px 20px' }}>
        <div className="tm-text-heading">팀 둘러보기</div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '18px 0' }}>
          {['전체 0', '풋살 0', '축구 0', '수영 0'].map((label, index) => <HapticChip key={label} active={index === 0}>{label}</HapticChip>)}
        </div>
        <EmptyState
          title={isError ? '새로고침이 필요합니다' : '조건에 맞는 팀이 없습니다'}
          sub={isError ? '팀 목록을 불러오지 못했습니다. 선택한 종목과 지역 조건은 유지한 채 다시 시도합니다.' : '필터를 초기화하거나 내 프로필을 보완하면 추천 후보를 넓힐 수 있습니다.'}
          cta={isError ? '다시 시도' : '필터 초기화'}
        />
      </div>
    </SMRevisionShell>
  );
};

const SMRevisionTeamBrowseMobileGridSM2 = () => (
  <SMRevisionRuleBoard title="05 팀 둘러보기 · SM2 mobile grid" items={[
    { title: '복사 기준', body: '기존 05와 기존 05 SM 수정안은 유지한다. SM2는 같은 번호 아래에 붙는 새 비교 섹션이다.' },
    { title: '확정 범위', body: '0502에서 확정된 상단바와 하단바 유지, 홈 team shortcut의 05 연결을 그대로 반영한다.' },
    { title: '본문 보완', body: '문서에 없는 본문은 온보딩 선택 카드, 02 홈 추천, 04 팀매치 신뢰 정보를 참고해 팀 비교 목록으로 설계한다.' },
    { title: '신뢰 신호', body: '매너, 추천 적합도, 활동 횟수는 verified/estimated/sample 상태를 분리한다.' },
    { title: '주요 상태', body: '모집중, 검토중, 마감, empty, network error를 목록 카드와 CTA 상태로 분리한다.' },
    { title: '다음 단계', body: '팀 보기에서 팀 상세로 진입하고, 가입 가능 여부 확인은 별도 bottom sheet 또는 상세 CTA로 확장한다.' },
  ]}/>
);

const SMRevisionPlusBoard = ({ eyebrow, title, sub, columns = 3, children }) => (
  <div style={{ width: '100%', height: '100%', background: 'var(--grey50)', fontFamily: 'var(--font)', padding: 24, overflow: 'hidden' }}>
    <Badge tone="blue" size="sm">{eyebrow}</Badge>
    <div className="tm-text-heading" style={{ marginTop: 10 }}>{title}</div>
    {sub && <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 6, maxWidth: 760 }}>{sub}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 12, marginTop: 20 }}>
      {children}
    </div>
  </div>
);

const SMRevisionPlusCard = ({ index, title, trigger, feedback, next, state, tone = 'blue' }) => (
  <Card pad={16} style={{ minHeight: 170, borderColor: tone === 'red' ? 'rgba(240,68,82,.22)' : tone === 'orange' ? 'rgba(254,152,0,.28)' : 'var(--grey100)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
      <Badge tone={tone === 'red' ? 'red' : tone === 'orange' ? 'orange' : 'blue'} size="sm">{String(index).padStart(2, '0')}</Badge>
      <div className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>{state}</div>
    </div>
    <div className="tm-text-body-lg" style={{ marginTop: 12 }}>{title}</div>
    <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.55 }}>
      <b>Trigger</b> {trigger}
    </div>
    <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.55 }}>
      <b>Feedback</b> {feedback}
    </div>
    <div className="tm-text-caption" style={{ color: 'var(--text-caption)', marginTop: 6, lineHeight: 1.55 }}>
      <b>Next</b> {next}
    </div>
  </Card>
);

const SMRevisionPlusStateCard = ({ title, body, action, tone = 'neutral' }) => (
  <Card pad={16} style={{ minHeight: 152, background: tone === 'blue' ? 'var(--blue50)' : tone === 'orange' ? 'rgba(254,152,0,.10)' : tone === 'green' ? 'rgba(3,178,108,.08)' : tone === 'red' ? 'rgba(240,68,82,.08)' : 'var(--bg)' }}>
    <div className="tm-text-body-lg">{title}</div>
    <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.55 }}>{body}</div>
    <div className="tm-text-micro" style={{ color: tone === 'red' ? 'var(--red500)' : tone === 'orange' ? 'var(--orange500)' : tone === 'green' ? 'var(--green500)' : 'var(--blue500)', marginTop: 12 }}>{action}</div>
  </Card>
);

const SMRevisionAuthSM5ActionMatrix = () => (
  <SMRevisionPlusBoard
    eyebrow="01 AUTH SM5 · ACTIONS"
    title="버튼/입력 동작 매트릭스"
    sub="SM4의 로그인·회원가입·약관·온보딩 flow를 복사한 뒤, 각 버튼이 어떤 화면으로 이동하고 어떤 피드백을 남기는지 고정한다."
  >
    <SMRevisionPlusCard index={1} title="카카오/네이버 로그인" trigger="provider 버튼 tap" feedback="pressed scale, callback loading 화면" next="성공은 약관/온보딩 resume, 실패는 provider denied" state="auth"/>
    <SMRevisionPlusCard index={2} title="이메일 로그인" trigger="이메일/비밀번호 입력 후 로그인" feedback="필드 검증, 중복 submit lock" next="홈 fallback 또는 온보딩 이어하기" state="form"/>
    <SMRevisionPlusCard index={3} title="회원가입" trigger="계정 생성 CTA" feedback="필수 입력 오류를 inline으로 표시" next="약관 확인 step" state="form"/>
    <SMRevisionPlusCard index={4} title="약관 전체 동의" trigger="전체 동의/개별 checkbox" feedback="CTA disabled 해제" next="종목 선택" state="step"/>
    <SMRevisionPlusCard index={5} title="종목 선택" trigger="종목 card tap" feedback="선택 card blue outline, helper 갱신" next="레벨 선택" state="step"/>
    <SMRevisionPlusCard index={6} title="지역 선택/권한" trigger="지역 chip 또는 현재 위치" feedback="권한 요청/거부 sheet" next="선택 확인" state="permission" tone="orange"/>
  </SMRevisionPlusBoard>
);

const SMRevisionAuthSM5StateMatrix = () => (
  <SMRevisionPlusBoard eyebrow="01 AUTH SM5 · STATES" title="인증/온보딩 모든 상황 처리" columns={4}>
    <SMRevisionPlusStateCard title="callback loading" body="OAuth redirect 직후 skeleton과 처리 문구. 뒤로가기 대신 취소 CTA만 둔다." action="persistent loading"/>
    <SMRevisionPlusStateCard title="provider denied" body="사용자가 provider 권한을 거부. 다른 로그인 수단과 재시도 제공." action="retry" tone="orange"/>
    <SMRevisionPlusStateCard title="account conflict" body="이미 연결된 이메일/휴대폰이 있을 때 계정 선택 또는 고객지원 안내." action="resolve" tone="red"/>
    <SMRevisionPlusStateCard title="network error" body="입력값은 유지하고 재시도 CTA를 제공. toast만 사용하지 않는다." action="retry" tone="red"/>
    <SMRevisionPlusStateCard title="required missing" body="필수 약관/종목/지역 미선택. CTA disabled와 이유 row를 함께 노출." action="disabled reason"/>
    <SMRevisionPlusStateCard title="permission denied" body="위치 권한 거부. 수동 지역 선택으로 복구 가능해야 한다." action="manual fallback" tone="orange"/>
    <SMRevisionPlusStateCard title="resume onboarding" body="중단된 step을 복원하고 이미 선택한 값은 유지한다." action="resume" tone="blue"/>
    <SMRevisionPlusStateCard title="completed" body="환영 화면에서 홈으로 이동. 비로그인 홈 fallback과 구분한다." action="home" tone="green"/>
  </SMRevisionPlusBoard>
);

const SMRevisionAuthSM5Flow = () => (
  <SMRevisionPlusBoard eyebrow="01 AUTH SM5 · FLOW" title="화면 전환 흐름" columns={4}>
    {[
      ['로그인 진입', 'social/email/signup 선택', 'OAuth 또는 form으로 분기'],
      ['callback', 'provider 처리', 'loading/success/error/conflict'],
      ['약관', '필수 동의 확인', 'disabled/active CTA'],
      ['종목', '지원 종목 선택', '축구/풋살/수영/수영/러닝/수영/수영'],
      ['레벨', '종목별 입력', '선출/NTRP/스케이트 연차 등'],
      ['지역', '권한 또는 수동 선택', '권한 거부 fallback'],
      ['확인', '선택 요약', '수정/완료'],
      ['환영', '다음 행동', '홈/매치 추천 진입'],
    ].map(([title, body, action], index) => (
      <SMRevisionPlusStateCard key={title} title={`${index + 1}. ${title}`} body={body} action={action} tone={index === 7 ? 'green' : 'blue'}/>
    ))}
  </SMRevisionPlusBoard>
);

const SMRevisionHomeSM3ActionMatrix = () => (
  <SMRevisionPlusBoard eyebrow="02 HOME SM3 · ACTIONS" title="홈 버튼/카드 동작 매트릭스">
    <SMRevisionPlusCard index={1} title="검색" trigger="상단 검색 icon" feedback="검색 전용 화면, 최근 검색/추천 검색어" next="결과 선택 시 해당 list/detail" state="home"/>
    <SMRevisionPlusCard index={2} title="알림" trigger="new dot 알림 icon" feedback="pressed scale, unread count 유지" next="06 알림 목록" state="notification"/>
    <SMRevisionPlusCard index={3} title="대표 추천 매치" trigger="featured card tap" feedback="card press, 충원률/추천 이유 유지" next="03 개인 매치 상세" state="detail"/>
    <SMRevisionPlusCard index={4} title="match shortcut" trigger="match shortcut tap" feedback="blue active" next="03 개인 매치 목록" state="shortcut"/>
    <SMRevisionPlusCard index={5} title="team match shortcut" trigger="team match shortcut tap" feedback="neutral press" next="04 팀매치 목록" state="shortcut"/>
    <SMRevisionPlusCard index={6} title="my team shortcut" trigger="미정 shortcut tap" feedback="disabled reason sheet" next="destination 확정 전 이동 없음" state="blocked" tone="orange"/>
  </SMRevisionPlusBoard>
);

const SMRevisionHomeSM3StateMatrix = () => (
  <SMRevisionPlusBoard eyebrow="02 HOME SM3 · STATES" title="홈 데이터/권한/네트워크 상황 처리" columns={4}>
    <SMRevisionPlusStateCard title="비로그인" body="인사만 표시. 활동/매너/통계는 '-'로, 추천은 랜덤 match 1+5개." action="login CTA optional"/>
    <SMRevisionPlusStateCard title="네트워크 이슈" body="인사만 표시. 숫자는 '-', 대표/추천/공지 제목은 새로고침 필요." action="refresh" tone="red"/>
    <SMRevisionPlusStateCard title="날씨 권한 없음" body="서울 날씨 fallback 또는 '-' 상태를 명시." action="manual region" tone="orange"/>
    <SMRevisionPlusStateCard title="추천 0건" body="관심 종목 기반 추천이 없으면 랜덤/인기 매치로 대체하고 이유를 표기." action="browse matches"/>
    <SMRevisionPlusStateCard title="공지 없음" body="pinned 공지가 없으면 영역을 과하게 비우지 않고 축소." action="hidden/compact"/>
    <SMRevisionPlusStateCard title="unread 알림" body="new dot과 count. 읽음 처리는 알림 화면에서 수행." action="notification list" tone="blue"/>
    <SMRevisionPlusStateCard title="통계 pending" body="집계 중이면 '-'가 아니라 pending label을 쓴다." action="processing" tone="orange"/>
    <SMRevisionPlusStateCard title="정상" body="인사/활동/추천/shortcut/weather/list/stat/notice 순서 유지." action="browse" tone="green"/>
  </SMRevisionPlusBoard>
);

const SMRevisionHomeSM3Flow = () => (
  <SMRevisionPlusBoard eyebrow="02 HOME SM3 · FLOW" title="홈 화면 전환과 후속 처리" columns={4}>
    {[
      ['홈 진입', 'auth 상태와 네트워크 상태를 먼저 판별', 'signed-in/signed-out/network'],
      ['활동 요약', '월간 활동/매너/통계 fetch', 'dash or value'],
      ['대표 추천', '관심 종목 중 충원률 최고 match', 'detail route'],
      ['shortcut', '4개 category action', '03/04/05/my-team'],
      ['날씨', '위치/온도/날씨', '서울 fallback'],
      ['추천 목록', '약 5개 match', '전체보기는 03'],
      ['통계/공지', '참가/MVP/결제 + pinned notice', 'detail route'],
      ['late update', '알림/통계 late fetch', 'layout shift 없이 row 갱신'],
    ].map(([title, body, action], index) => (
      <SMRevisionPlusStateCard key={title} title={`${index + 1}. ${title}`} body={body} action={action} tone={index === 7 ? 'orange' : 'blue'}/>
    ))}
  </SMRevisionPlusBoard>
);

const SMRevisionMatchSM4ActionMatrix = () => (
  <SMRevisionPlusBoard eyebrow="03 MATCH SM4 · ACTIONS" title="개인 매치 버튼/화면 동작 매트릭스">
    <SMRevisionPlusCard index={1} title="상단바 제거" trigger="03 SM4 매치 화면 진입" feedback="StatusBar만 남기고 app top bar 제거" next="본문 검색/필터가 최상단" state="shell"/>
    <SMRevisionPlusCard index={2} title="검색 입력" trigger="검색바 tap/type" feedback="focused search, query 유지" next="검색 아이콘으로 실행" state="search"/>
    <SMRevisionPlusCard index={3} title="검색 실행" trigger="blue search icon tap" feedback="현재 보기 모드 유지" next="카드형 또는 콤팩트형 검색 결과" state="submit"/>
    <SMRevisionPlusCard index={4} title="보기 전환" trigger="ㅁ|ㅁ / ㅁ 단일 icon tap" feedback="list shape 전환" next="같은 query/sport 유지" state="view"/>
    <SMRevisionPlusCard index={5} title="종목 선택" trigger="sport count chip tap" feedback="chip active, counter 갱신" next="선택 종목 기준 list" state="filter"/>
    <SMRevisionPlusCard index={6} title="카드 선택" trigger="match row/card tap" feedback="push transition" next="매치 상세" state="detail"/>
  </SMRevisionPlusBoard>
);

const SMRevisionMatchSM4Shell = ({ children, bottom = true }) => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: bottom ? 12 : 0 }}>
      {children}
    </div>
    {bottom && <SMBottomNav active="matches"/>}
  </div>
);

const SMRevisionMatchSM4SearchHeader = ({ mode = 'card', query = '', focused = false }) => (
  <div style={{ padding: '18px 20px 0' }}>
    <div style={{ display: 'grid', gridTemplateColumns: focused ? 'minmax(0, 1fr) 44px 44px auto' : 'minmax(0, 1fr) 44px 44px', gap: 8, alignItems: 'center' }}>
      <div style={{ minHeight: 48, borderRadius: 12, background: 'var(--grey100)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', color: query ? 'var(--text-strong)' : 'var(--text-caption)', boxShadow: focused ? '0 0 0 2px var(--blue50)' : 'none', minWidth: 0 }}>
        <Icon name="search" size={18}/>
        <span className="tm-text-body" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{query || '지역, 시간, 매치명 검색'}</span>
        {focused && <span style={{ width: 1, height: 20, background: 'var(--blue500)', marginLeft: 2, flexShrink: 0 }}/>}
      </div>
      <button className="tm-btn tm-btn-icon tm-btn-primary" aria-label="검색 실행">
        <Icon name="search" size={19}/>
      </button>
      <button className="tm-btn tm-btn-icon tm-btn-neutral" aria-label={mode === 'card' ? '콤팩트 보기로 전환' : '카드 보기로 전환'}>
        {mode === 'card' ? 'ㅁ|ㅁ' : 'ㅁ'}
      </button>
      {focused && <button className="tm-btn tm-btn-sm tm-btn-ghost">취소</button>}
    </div>
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '16px 0 14px' }}>
      {SPORTS.slice(0, 7).map((sport, index) => (
        <HapticChip key={sport.id} active={index === 0} count={index === 0 ? MATCHES.length : index + 2}>{sport.label}</HapticChip>
      ))}
    </div>
    {!focused && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, padding: '2px 0 4px' }}>
        {SM3_MATCH_STATS.map(([label, value, sub]) => (
          <div key={label} style={{ minWidth: 0 }}>
            <div className="tm-text-caption">{label}</div>
            <div className="tm-text-subhead tab-num" style={{ marginTop: 4 }}>{value}</div>
            <div className="tm-text-micro" style={{ marginTop: 2, color: 'var(--text-caption)' }}>{sub}</div>
          </div>
        ))}
      </div>
    )}
  </div>
);

const SMRevisionMatchListMobileSM4 = ({ mode = 'card' }) => (
  <SMRevisionMatchSM4Shell>
    <SMRevisionMatchSM4SearchHeader mode={mode}/>
    <div style={{ padding: '16px 20px 24px' }}>
      <div style={{ marginBottom: 10 }}>
        <div className="tm-text-label">개인 매치</div>
        <div className="tm-text-caption" style={{ marginTop: 2 }}>상단바 없이 검색, 실행, 보기 전환을 본문 상단에서 처리합니다.</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {MATCHES.slice(0, mode === 'card' ? 3 : 5).map((item, index) => (
          mode === 'card'
            ? <SMRevisionMatchSM3CardItem key={item.id} item={item} index={index}/>
            : <SMRevisionMatchSM3CompactItem key={item.id} item={item}/>
        ))}
      </div>
    </div>
  </SMRevisionMatchSM4Shell>
);

const SMRevisionMatchSearchFocusMobileSM4 = () => (
  <SMRevisionMatchSM4Shell>
    <SMRevisionMatchSM4SearchHeader mode="card" query="풋살" focused/>
    <div style={{ padding: '18px 20px 24px' }}>
      <div className="tm-text-label">최근 검색</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {['풋살', '강남', '오늘 저녁', '마감임박'].map((label, index) => (
          <button key={label} className={`tm-chip ${index === 0 ? 'tm-chip-active' : ''}`}>{label}</button>
        ))}
      </div>
      <div style={{ height: 1, background: 'var(--grey100)', margin: '20px 0' }}/>
      <div className="tm-text-label">빠른 조건</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
        {[
          ['오늘 참여 가능', '오늘매치수 기준'],
          ['내 주변 5km', '위치 권한 필요 시 안내'],
          ['마감임박', '24시간 이내'],
          ['초보 환영', '레벨 필터 적용'],
        ].map(([title, sub]) => (
          <Card key={title} pad={14} interactive>
            <div className="tm-text-label">{title}</div>
            <div className="tm-text-micro" style={{ marginTop: 4, color: 'var(--text-caption)' }}>{sub}</div>
          </Card>
        ))}
      </div>
      <Card pad={14} style={{ marginTop: 18, background: 'var(--grey50)' }}>
        <div className="tm-text-label">검색 실행</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>검색어 입력 후 blue 검색 아이콘을 누르면 현재 보기 모드에 맞는 검색 결과로 이동합니다.</div>
      </Card>
    </div>
  </SMRevisionMatchSM4Shell>
);

const SMRevisionMatchSearchMobileSM4 = ({ mode = 'compact' }) => {
  const results = MATCHES.filter((item) => item.title.includes('풋살') || item.venue.includes('풋살'));
  return (
    <SMRevisionMatchSM4Shell>
      <SMRevisionMatchSM4SearchHeader mode={mode} query="풋살"/>
      <div style={{ padding: '16px 20px 24px' }}>
        <div style={{ marginBottom: 12 }}>
          <div className="tm-text-label">검색 결과 · {mode === 'card' ? '카드형' : '콤팩트형'}</div>
          <div className="tm-text-caption" style={{ marginTop: 2 }}><span className="tab-num">{results.length}</span>개 매치 · 같은 검색어에서 보기 버튼만 전환합니다.</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {results.map((item, index) => (
            mode === 'card'
              ? <SMRevisionMatchSM3CardItem key={item.id} item={item} index={index}/>
              : <SMRevisionMatchSM3CompactItem key={item.id} item={item}/>
          ))}
        </div>
      </div>
    </SMRevisionMatchSM4Shell>
  );
};

const SMRevisionMatchSM4StateMatrix = () => (
  <SMRevisionPlusBoard eyebrow="03 MATCH SM4 · STATES" title="개인 매치 전체 상황 처리" columns={4}>
    <SMRevisionPlusStateCard title="loading" body="검색/목록 skeleton은 카드형과 콤팩트형 shape를 각각 유지." action="skeleton"/>
    <SMRevisionPlusStateCard title="조회 없음" body="'매치가 없습니다'와 필터 초기화 CTA를 함께 둔다." action="reset filter"/>
    <SMRevisionPlusStateCard title="네트워크 오류" body="'새로고침 필요합니다 필요' 원문 보존 + 재시도 CTA." action="retry" tone="red"/>
    <SMRevisionPlusStateCard title="마감 임박" body="deadline badge와 남은 시간. CTA 가능 여부는 별도 표기." action="deadline" tone="orange"/>
    <SMRevisionPlusStateCard title="모집 완료" body="sold out이면 참가 CTA 비활성, 대기 신청 가능 여부 분리." action="waitlist" tone="orange"/>
    <SMRevisionPlusStateCard title="승인중" body="참가 신청 후 CTA 잠금. 처리 주체와 다음 상태를 표시." action="pending" tone="orange"/>
    <SMRevisionPlusStateCard title="승인완료" body="승인완료 CTA는 disabled success. 결제/상세 진입 구분." action="approved" tone="green"/>
    <SMRevisionPlusStateCard title="내 매치" body="참가 흐름 제거. 관리 CTA와 참가자/상태 관리 진입." action="manage" tone="blue"/>
  </SMRevisionPlusBoard>
);

const SMRevisionMatchSM4Flow = () => (
  <SMRevisionPlusBoard eyebrow="03 MATCH SM4 · FLOW" title="목록 → 상세 → 참가 → 승인 흐름" columns={4}>
    {[
      ['목록 진입', '상단바 없이 검색바/보기전환/종목 selector/counter', 'list'],
      ['필터 변경', '종목별 카운터와 목록 동시 갱신', 'filtered list'],
      ['검색 입력', '검색어 입력 중 추천/최근 검색 표시, 검색 icon으로 실행', 'search focus'],
      ['검색 결과', 'ㅁ|ㅁ 카드형과 ㅁ 콤팩트형 결과를 모두 제공', 'search result'],
      ['상세', '이미지/일시/장소/인원/참가비/호스트/소개/참가자', 'detail'],
      ['참가 sheet', '요약과 결제 전 확인', 'bottom sheet'],
      ['결제하고 참가', 'mock/test 결제 문구 필요', 'pending'],
      ['승인 결과', '승인중/승인완료/거절', 'state locked'],
    ].map(([title, body, action], index) => (
      <SMRevisionPlusStateCard key={title} title={`${index + 1}. ${title}`} body={body} action={action} tone={index >= 5 ? 'orange' : 'blue'}/>
    ))}
  </SMRevisionPlusBoard>
);

const SMRevisionTeamMatchSM3ActionMatrix = () => (
  <SMRevisionPlusBoard eyebrow="04 TEAM MATCH SM3 · ACTIONS" title="팀매치 버튼/화면 동작 매트릭스">
    <SMRevisionPlusCard index={1} title="검색/보기 전환" trigger="검색바 또는 카드/콤팩트 icon" feedback="query와 view mode 유지" next="팀매치 목록 갱신" state="list"/>
    <SMRevisionPlusCard index={2} title="종목 선택" trigger="sport count chip tap" feedback="counter와 정렬 기준 갱신" next="선택 종목 팀매치" state="filter"/>
    <SMRevisionPlusCard index={3} title="팀 정보 보러가기" trigger="상세의 team info row tap" feedback="push transition" next="팀 세부조회" state="team"/>
    <SMRevisionPlusCard index={4} title="채팅" trigger="채팅 보조 CTA tap" feedback="context card 포함 chat room" next="06 채팅방" state="chat"/>
    <SMRevisionPlusCard index={5} title="신청하기" trigger="primary CTA tap" feedback="신청 요약 bottom sheet" next="결제하고 신청하기" state="apply"/>
    <SMRevisionPlusCard index={6} title="매치 관리" trigger="내 팀매치 CTA tap" feedback="owner manage route" next="내 팀매치 상세/관리" state="owner"/>
  </SMRevisionPlusBoard>
);

const SMRevisionTeamMatchSM3StateMatrix = () => (
  <SMRevisionPlusBoard eyebrow="04 TEAM MATCH SM3 · STATES" title="팀매치 전체 상황 처리" columns={4}>
    <SMRevisionPlusStateCard title="loading" body="VS 히어로/로고/카운터 skeleton shape 유지." action="skeleton"/>
    <SMRevisionPlusStateCard title="조회 없음" body="'매치가 없습니다'와 조건 초기화 CTA." action="reset"/>
    <SMRevisionPlusStateCard title="네트워크 오류" body="'새로고침 필요합니다 필요' 원문 보존 + 재시도." action="retry" tone="red"/>
    <SMRevisionPlusStateCard title="팀 권한 없음" body="팀 소속/주장 권한이 없으면 신청 CTA 이유 표시." action="permission" tone="orange"/>
    <SMRevisionPlusStateCard title="신청중" body="신청 후 승인중 CTA lock. 상대 팀/운영자 처리 주체 표시." action="pending" tone="orange"/>
    <SMRevisionPlusStateCard title="승인완료" body="승인완료 상태에서 결제/채팅/일정 확인 후속 행동 제공." action="approved" tone="green"/>
    <SMRevisionPlusStateCard title="충원/마감" body="마감/정원 완료면 신청 CTA 차단, 채팅 가능 여부 별도." action="closed" tone="orange"/>
    <SMRevisionPlusStateCard title="내 팀매치" body="신청/채팅 CTA 제거. 관리 CTA와 스코어/출석 후속 진입." action="manage" tone="blue"/>
  </SMRevisionPlusBoard>
);

const SMRevisionTeamMatchSM3Flow = () => (
  <SMRevisionPlusBoard eyebrow="04 TEAM MATCH SM3 · FLOW" title="팀매치 목록 → 상세 → 신청/관리 흐름" columns={4}>
    {[
      ['목록 진입', '검색/보기전환/종목 selector/counter', 'list'],
      ['팀매치 카드', 'VS 히어로, 팀명, 위치, 인원, 가격, 승리수', 'card'],
      ['콤팩트 행', '로고/레벨/매너/시간/가격/승리수', 'compact'],
      ['상세', 'back/share/notification, 팀 정보 vs, 날짜/장소/경기정보', 'detail'],
      ['팀 정보', '팀 세부조회로 이동', 'team detail'],
      ['신청 sheet', '요약과 결제 전 확인', 'bottom sheet'],
      ['승인 상태', '승인중/승인완료/거절', 'state'],
      ['내 팀매치', '관리/출석/스코어/평가 flow로 연결', 'ops'],
    ].map(([title, body, action], index) => (
      <SMRevisionPlusStateCard key={title} title={`${index + 1}. ${title}`} body={body} action={action} tone={index >= 5 ? 'orange' : 'blue'}/>
    ))}
  </SMRevisionPlusBoard>
);

const SMRevisionTeamMatchSM4SportSelector = () => (
  <div style={{ padding: '12px 20px 0' }}>
    <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 8, overflowX: 'auto', paddingBottom: 10 }}>
      {SPORTS.slice(0, 7).map((sport, index) => <HapticChip key={sport.id} active={index === 0} count={index === 0 ? TEAM_MATCHES.length : index + 1}>{sport.label}</HapticChip>)}
    </div>
  </div>
);

const SMRevisionTeamMatchSM4Summary = () => (
  <div style={{ padding: '12px 20px 0' }}>
    <div style={{ minHeight: 44, borderRadius: 12, background: 'var(--grey50)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 12px' }}>
      <div className="tm-text-label">서울 전체 · 팀매치</div>
      <div className="tm-text-caption tab-num">28개 · 오늘 5 · 마감 3</div>
    </div>
  </div>
);

const SMRevisionTeamMatchListMobileSM4 = ({ mode = 'card', query = '' }) => (
  <SMRevisionTeamMatchShellSM2>
    <SMRevisionMatchSM7TopSearchBarRestored query={query} filterCount={2}/>
    <SMRevisionTeamMatchSM4SportSelector/>
    <SMRevisionTeamMatchSM4Summary/>
    <div style={{ padding: '14px 20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="tm-text-label">팀매치</div>
          <div className="tm-text-caption" style={{ marginTop: 2 }}>03 최종본처럼 종목은 상단에 유지하고 정렬/보기 방식은 필터에서 조정합니다.</div>
        </div>
        {query && <Badge tone="blue" size="sm">검색 결과</Badge>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: mode === 'card' ? 12 : 10 }}>
        {TEAM_MATCHES.slice(0, mode === 'card' ? 3 : 5).map((item, index) => (
          mode === 'card'
            ? <SMRevisionTeamMatchCardSM2 key={item.id} item={item} index={index}/>
            : <SMRevisionTeamMatchCompactSM2 key={item.id} item={item} index={index}/>
        ))}
      </div>
    </div>
  </SMRevisionTeamMatchShellSM2>
);

const SMRevisionTeamMatchSM4FilterSheetOption = ({ mode = 'card' }) => (
  <SMRevisionTeamMatchShellSM2>
    <SMRevisionMatchSM7TopSearchBarRestored query="" filterCount={2}/>
    <SMRevisionTeamMatchSM4SportSelector/>
    <SMRevisionTeamMatchSM4Summary/>
    <div style={{ padding: '14px 20px 150px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="tm-text-label">팀매치</div>
          <div className="tm-text-caption" style={{ marginTop: 2 }}>종목은 상단에 유지하고 정렬과 보기 방식만 필터 sheet에서 조정합니다.</div>
        </div>
        <Badge tone="blue" size="sm">필터 2</Badge>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: mode === 'card' ? 12 : 10 }}>
        {TEAM_MATCHES.slice(0, mode === 'card' ? 3 : 5).map((item, index) => (
          mode === 'card'
            ? <SMRevisionTeamMatchCardSM2 key={item.id} item={item} index={index}/>
            : <SMRevisionTeamMatchCompactSM2 key={item.id} item={item} index={index}/>
        ))}
      </div>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 74, background: 'rgba(25,31,40,.18)', pointerEvents: 'none' }}/>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 74, borderRadius: '24px 24px 0 0', background: 'var(--bg)', borderTop: '1px solid var(--grey100)', boxShadow: '0 -16px 32px rgba(25,31,40,.14)', padding: '10px 20px 20px' }}>
      <div style={{ width: 42, height: 4, borderRadius: 999, background: 'var(--grey300)', margin: '0 auto 16px' }}/>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="tm-text-subhead">필터</div>
          <div className="tm-text-caption" style={{ marginTop: 2 }}>정렬과 보기 방식만 조정</div>
        </div>
        <button className="tm-btn tm-btn-sm tm-btn-ghost" style={{ color: 'var(--text-caption)' }}>초기화</button>
      </div>
      <div style={{ marginTop: 18 }}>
        <div className="tm-text-label">정렬</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {['추천순', '마감임박', '등급높은순', '가격낮은순'].map((label, index) => <button key={label} className={`tm-chip ${index === 0 ? 'tm-chip-active' : ''}`}>{label}</button>)}
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        <div className="tm-text-label">보기 방식</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
          {[['card', '카드형', 'VS 히어로와 팀 정보'], ['compact', '콤팩트형', '더 많은 팀매치 비교']].map(([id, label, sub]) => {
            const active = mode === id;
            return (
              <button key={id} className="tm-pressable" style={{ minHeight: 58, borderRadius: 14, border: active ? '1px solid var(--blue500)' : '1px solid var(--grey100)', background: active ? 'var(--blue50)' : 'var(--bg)', textAlign: 'left', padding: '10px 12px' }}>
                <div className="tm-text-label" style={{ color: active ? 'var(--blue500)' : 'var(--text-strong)' }}>{label}</div>
                <div className="tm-text-micro" style={{ marginTop: 3, color: 'var(--text-caption)' }}>{sub}</div>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 8, marginTop: 18 }}>
        <button className="tm-btn tm-btn-lg tm-btn-neutral">닫기</button>
        <button className="tm-btn tm-btn-lg tm-btn-primary">적용하기</button>
      </div>
    </div>
  </SMRevisionTeamMatchShellSM2>
);

const SMRevisionTeamMatchSM4EmptyTextState = () => (
  <SMRevisionTeamMatchShellSM2>
    <SMRevisionMatchSM7TopSearchBarRestored query="" filterCount={2}/>
    <SMRevisionTeamMatchSM4SportSelector/>
    <SMRevisionTeamMatchSM4Summary/>
    <div style={{ padding: '14px 20px 24px' }}>
      <div style={{ marginBottom: 10 }}>
        <div className="tm-text-label">팀매치</div>
        <div className="tm-text-caption" style={{ marginTop: 2 }}>선택한 종목과 기준에 맞는 결과가 없습니다.</div>
      </div>
      <div style={{ padding: '56px 8px 0', textAlign: 'center' }}>
        <div className="tm-text-body-lg" style={{ color: 'var(--text-strong)' }}>매치가 없습니다</div>
        <div className="tm-text-caption" style={{ marginTop: 8, lineHeight: 1.55 }}>다른 종목을 선택하거나 필터 조건을 바꾸면 다시 확인할 수 있습니다.</div>
      </div>
    </div>
  </SMRevisionTeamMatchShellSM2>
);

const SMRevisionTeamMatchSM4SearchErrorToastState = () => (
  <SMRevisionTeamMatchShellSM2>
    <SMRevisionMatchSM7TopSearchBarRestored query="풋살 강남" filterCount={2} error/>
    <SMRevisionTeamMatchSM4SportSelector/>
    <SMRevisionTeamMatchSM4Summary/>
    <div style={{ padding: '14px 20px 24px' }}>
      <div style={{ marginBottom: 10 }}>
        <div className="tm-text-label">팀매치</div>
        <div className="tm-text-caption" style={{ marginTop: 2 }}>검색 조건은 유지하고 예외 상태만 명확히 표시합니다.</div>
      </div>
      <div style={{ padding: '54px 8px 0', textAlign: 'center' }}>
        <div className="tm-text-body-lg" style={{ color: 'var(--red500)' }}>새로고침이 필요합니다</div>
        <div className="tm-text-caption" style={{ marginTop: 8, lineHeight: 1.55 }}>잠시 후 다시 검색해 주세요. 입력한 검색어와 필터는 유지됩니다.</div>
      </div>
    </div>
    <div style={{ position: 'absolute', left: 20, right: 20, bottom: 92, minHeight: 48, borderRadius: 14, background: 'rgba(25,31,40,.94)', color: 'var(--static-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 14px', fontSize: 13, fontWeight: 700, zIndex: 5 }}>
      새로고침이 필요합니다. 잠시 후 다시 검색해 주세요.
    </div>
  </SMRevisionTeamMatchShellSM2>
);

const SMRevisionTeamMatchSM4TopSearchRules = () => (
  <SMRevisionPlusBoard eyebrow="04 TEAM MATCH SM4 · TOP SEARCH" title="03 최종본 목록 구조 적용 기준" columns={4}>
    {[
      ['상단 검색바', '뒤로가기, 검색 필드, 검색 실행, 필터 버튼을 56px 상단바 안에 둔다.', '03 final'],
      ['종목 유지', '종목 선택은 필터 sheet로 숨기지 않고 검색바 아래 chip row로 유지한다.', 'sport top'],
      ['매치수 요약', '매치수, 오늘매치수, 마감임박은 3박스 대신 1줄 요약으로 표시한다.', 'count row'],
      ['필터 sheet', '필터에는 정렬과 카드/콤팩트 보기 방식만 넣고 하단바는 가리지 않는다.', 'sheet'],
      ['검색 결과', '검색어, 종목, 필터 조건을 유지한 채 카드형/콤팩트형 결과를 모두 제공한다.', 'result'],
      ['예외 처리', '매치 없음은 텍스트 상태, 검색 오류는 red input + toast로 처리한다.', 'states'],
    ].map(([title, body, action], index) => <SMRevisionPlusStateCard key={title} title={`${index + 1}. ${title}`} body={body} action={action} tone={index >= 5 ? 'orange' : 'blue'}/>)}
  </SMRevisionPlusBoard>
);

const SM2_CHAT_ROOMS = [
  { title: '성수 러너스 FC', type: '팀', last: '이번 주 정기전 참석 가능하신가요?', time: '2분 전', unread: 3, pinned: true, avatar: IMG.av1 },
  { title: '주말 풋살 매치', type: '개인매치', last: '참가 승인 완료됐습니다.', time: '18분 전', unread: 1, pinned: false, avatar: IMG.av3 },
  { title: '마포 수영 팀매치', type: '팀매치', last: '상대팀 유니폼은 흰색입니다.', time: '어제', unread: 0, pinned: false, avatar: IMG.av4 },
];

const SMRevisionChatListMobileSM2 = () => (
  <SMRevisionShell title="채팅" back search notificationNew bottom navActive="my">
    <div style={{ padding: '18px 20px 96px' }}>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 14 }}>
        {['전체', '개인매치', '팀매치', '팀'].map((label, index) => <HapticChip key={label} active={index === 0}>{label}</HapticChip>)}
      </div>
      <div className="tm-text-caption" style={{ marginBottom: 8 }}>고정 채팅방은 상단, 나머지는 최근순입니다.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SM2_CHAT_ROOMS.map((room) => (
          <Card key={room.title} pad={14} interactive style={{ background: room.unread ? 'var(--blue50)' : 'var(--bg)' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: 16, background: `url(${room.avatar}) center/cover`, flexShrink: 0 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div className="tm-text-body-lg line-clamp-2">{room.title}</div>
                  {room.pinned && <Badge tone="blue" size="sm">고정</Badge>}
                </div>
                <div className="tm-text-caption line-clamp-2" style={{ marginTop: 3 }}>{room.type} · {room.last}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="tm-text-micro">{room.time}</div>
                {room.unread > 0 && <div style={{ marginTop: 6, minWidth: 20, height: 20, borderRadius: 999, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{room.unread}</div>}
              </div>
            </div>
          </Card>
        ))}
      </div>
      <button className="tm-btn tm-btn-primary" aria-label="open chat" style={{ position: 'absolute', right: 20, bottom: 90, width: 54, height: 54, borderRadius: 999, padding: 0, display: 'grid', placeItems: 'center', boxShadow: '0 10px 24px rgba(49,130,246,.28)' }}>
        <Icon name="chat" size={22}/>
      </button>
    </div>
  </SMRevisionShell>
);

const SMRevisionChatRoomMobileSM2 = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <TopNav title="주말 풋살 매치" onBack={() => {}}/>
    <div style={{ padding: 16, borderBottom: '1px solid var(--grey100)' }}>
      <Card pad={14} interactive>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="calendar" size={20} color="var(--blue500)"/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tm-text-body-lg">개인매치 상세조회</div>
            <div className="tm-text-caption">카테고리에 맞는 맥락 바로가기 박스를 상단에 고정합니다.</div>
          </div>
          <Icon name="chevR" size={18} color="var(--grey400)"/>
        </div>
      </Card>
    </div>
    <div style={{ flex: 1, padding: 20, overflow: 'auto', background: 'var(--grey50)' }}>
      {[
        ['상대', '오늘 14:00 경기 인원 확인 부탁드려요.'],
        ['나', '네. 20분 전에 도착하겠습니다.'],
        ['상대', '참가 승인 완료했습니다. 결제 내역도 확인됐어요.'],
      ].map(([who, msg], index) => (
        <div key={msg} style={{ maxWidth: index === 1 ? 250 : 286, marginLeft: index === 1 ? 'auto' : 0, marginBottom: 10, padding: '10px 12px', borderRadius: 14, background: index === 1 ? 'var(--blue500)' : 'var(--bg)', color: index === 1 ? 'var(--static-white)' : 'var(--text-strong)', boxShadow: 'var(--sh-1)' }}>
          <div className="tm-text-micro" style={{ color: index === 1 ? 'rgba(255,255,255,.72)' : 'var(--text-caption)', marginBottom: 3 }}>{who}</div>
          <div className="tm-text-body" style={{ color: 'inherit' }}>{msg}</div>
        </div>
      ))}
    </div>
    <div style={{ padding: '12px 16px 22px', display: 'flex', gap: 8, borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-btn tm-btn-icon tm-btn-neutral" aria-label="이미지 추가"><Icon name="plus" size={20}/></button>
      <div style={{ flex: 1, minHeight: 44, borderRadius: 999, background: 'var(--grey100)', display: 'flex', alignItems: 'center', padding: '0 14px' }} className="tm-text-caption">메시지 입력</div>
      <button className="tm-btn tm-btn-icon tm-btn-primary" aria-label="전송"><Icon name="send" size={20}/></button>
    </div>
  </div>
);

const SMRevisionNotificationsMobileSM2 = ({ readAll = false }) => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <div style={{ height: 56, padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--grey100)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="뒤로가기"><Icon name="chevL" size={22}/></button>
        <div className="tm-text-body-lg">알림 <span className="tab-num" style={{ color: readAll ? 'var(--grey500)' : 'var(--blue500)' }}>{readAll ? 0 : 2}</span></div>
      </div>
      <button className="tm-btn tm-btn-sm tm-btn-ghost">모두읽음</button>
    </div>
    <div style={{ height: 756, overflow: 'auto', padding: 20 }}>
      {['오늘', '어제'].map((group, groupIndex) => (
        <div key={group} style={{ marginBottom: 20 }}>
          <div className="tm-text-label" style={{ marginBottom: 8 }}>{group}</div>
          {[
            ['매치 참가 확정', '성수 풋살파크 · 10명 · 8,000원', '방금 전'],
            ['팀 초대', '성수 러너스 FC · 풋살 · 신입 환영', '10분 전'],
            ['리뷰 요청', '지난 경기 후기를 남겨주세요', '어제'],
          ].slice(groupIndex, groupIndex + 2).map(([title, body, time], index) => {
            const unread = !readAll && groupIndex === 0 && index < 2;
            return (
              <Card key={title} pad={14} interactive style={{ marginBottom: 8, background: unread ? 'var(--blue50)' : 'var(--bg)' }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 14, background: unread ? 'var(--blue500)' : 'var(--grey100)', color: unread ? 'var(--static-white)' : 'var(--text-muted)', display: 'grid', placeItems: 'center' }}>
                    <Icon name="bell" size={18}/>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="tm-text-body-lg">{title}</div>
                    <div className="tm-text-caption line-clamp-2" style={{ marginTop: 3 }}>{body}</div>
                    <div className="tm-text-micro" style={{ marginTop: 6 }}>{time}</div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ))}
    </div>
    {readAll && <Toast msg="모든 알림을 읽음 처리했습니다" type="success"/>}
  </div>
);

const SMRevisionCommunityMobileGridSM2 = () => (
  <SMRevisionRuleBoard title="06 커뮤니티/채팅/알림 · SM2 mobile grid" items={[
    { title: '복사 기준', body: '기존 06과 기존 06 SM 수정안을 유지하고, SM2는 채팅 목록/방/알림 상태를 더 세분화한 비교 섹션이다.' },
    { title: '채팅 목록', body: '뒤로가기, 채팅 제목, 검색, 알림, 필터 4개, 고정방 우선, 최근순 정렬, unread badge를 고정한다.' },
    { title: '플로팅 진입', body: '채팅 floating button은 하단바 바로 위 우측 하단에 놓고 최소 54px 터치 영역을 유지한다.' },
    { title: '채팅방', body: '상하단바를 제외하고 맥락 바로가기 박스, 메시지 내역, + 이미지 첨부, 입력, 전송을 분리한다.' },
    { title: '알림', body: '상하단바 제거, 뒤로가기, unread count, 모두읽음, 날짜 그룹, read/unread 배경 상태를 분리한다.' },
    { title: '경합 방지', body: '읽음 처리와 딥링크 이동은 같은 기본 Link 동작에 맡기지 않고 명시적 순서를 둔다.' },
  ]}/>
);

const SM2_PROFILE_STATS = [
  ['참가', 24],
  ['MVP', 5],
  ['리뷰', 18],
];

const SMRevisionProfileReviewMobileSM2 = () => (
  <SMRevisionShell title="마이" search notificationNew bottom navActive="my">
    <div style={{ padding: '18px 20px 96px' }}>
      <Card pad={18}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ width: 62, height: 62, borderRadius: 22, background: `url(${IMG.av1}) center/cover` }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tm-text-subhead">정민</div>
            <div className="tm-text-caption">풋살 · 성동 · 매너 4.9</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
              <Badge tone="blue" size="sm">verified</Badge>
              <Badge tone="grey" size="sm">공개 프로필</Badge>
            </div>
          </div>
          <SBtn size="sm" variant="neutral">수정</SBtn>
        </div>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
        {SM2_PROFILE_STATS.map(([label, value]) => <SM2InlineStat key={label} label={label} value={value}/>)}
      </div>
      <SectionTitle title="평판 신호" sub="사용자 의사결정에 쓰이는 값은 상태를 분리합니다."/>
      <Card pad={16}>
        <StatBar label="시간 약속" value={94} sub="verified · 최근 12경기"/>
        <StatBar label="팀워크" value={88} sub="estimated · 리뷰 기반"/>
        <StatBar label="응답률" value={76} sub="sample · 프로토타입 데이터"/>
      </Card>
      <SectionTitle title="받은 리뷰" sub="리뷰는 작성자, 맥락, 상태를 함께 노출합니다."/>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          ['시간 약속을 잘 지켜요', '개인매치 완료 · verified'],
          ['팀 플레이가 좋아요', '팀매치 후 작성 · estimated'],
        ].map(([title, sub]) => (
          <Card key={title} pad={14}>
            <div className="tm-text-body-lg">{title}</div>
            <div className="tm-text-caption" style={{ marginTop: 4 }}>{sub}</div>
          </Card>
        ))}
      </div>
    </div>
  </SMRevisionShell>
);

const SMRevisionReviewWriteMobileSM2 = () => (
  <SMRevisionShell title="" back notificationNew={false} bottom={false}>
    <div style={{ padding: '18px 20px 118px' }}>
      <div className="tm-text-heading">리뷰 작성</div>
      <div className="tm-text-body" style={{ marginTop: 6 }}>매치나 팀매치가 끝난 뒤 연결되는 companion flow입니다. 0502 문서에 상세 본문은 없으므로 입력 가능 항목만 명시합니다.</div>
      <Card pad={16} style={{ marginTop: 18 }}>
        <div className="tm-text-body-lg">성수 풋살 매치</div>
        <div className="tm-text-caption" style={{ marginTop: 4 }}>완료된 경기 · 참가자 10명</div>
      </Card>
      <Card pad={16} style={{ marginTop: 12 }}>
        <div className="tm-text-label">별점</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {[1,2,3,4,5].map((n) => <Icon key={n} name="star" size={28} color="var(--blue500)" stroke={2}/>)}
        </div>
      </Card>
      <Card pad={16} style={{ marginTop: 12 }}>
        <div className="tm-text-label">태그</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {['시간 약속', '팀워크', '매너 좋음', '다시 함께'].map((label, index) => <HapticChip key={label} active={index < 2}>{label}</HapticChip>)}
        </div>
      </Card>
      <Card pad={16} style={{ marginTop: 12 }}>
        <div className="tm-text-label">본문</div>
        <div style={{ minHeight: 104, borderRadius: 14, background: 'var(--grey100)', padding: 14, marginTop: 10 }} className="tm-text-caption">경험을 구체적으로 적어주세요.</div>
      </Card>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <SBtn full size="lg">리뷰 등록</SBtn>
    </div>
  </SMRevisionShell>
);

const SMRevisionProfileStateMobileSM2 = ({ state = 'private' }) => (
  <SMRevisionShell title="마이" search={state !== 'network'} notificationNew={false} bottom navActive="my">
    <div style={{ padding: '18px 20px' }}>
      <div className="tm-text-heading">{state === 'network' ? '프로필을 불러오지 못했습니다' : '비공개 프로필'}</div>
      <EmptyState
        title={state === 'network' ? '새로고침이 필요합니다' : '공개되지 않은 정보입니다'}
        sub={state === 'network' ? '내 활동과 리뷰 신호는 유지된 상태에서 다시 불러옵니다.' : '상대에게 보이는 평판 신호와 내 설정 화면의 정보를 분리합니다.'}
        cta={state === 'network' ? '다시 시도' : '공개 설정 보기'}
      />
    </div>
  </SMRevisionShell>
);

const SMRevisionProfileReviewMobileGridSM2 = () => (
  <SMRevisionRuleBoard title="07 마이/프로필/리뷰 · SM2 mobile grid" items={[
    { title: '복사 기준', body: '기존 07과 기존 07 SM 수정안을 유지한다. SM2는 같은 번호 아래 새 비교 섹션으로만 추가한다.' },
    { title: '상단 검색', body: '전역 규칙대로 검색은 홈과 마이에서만 유지한다. 마이에서는 프로필, 리뷰, 내 활동 검색 진입을 담당한다.' },
    { title: '프로필', body: '매너, 활동, 리뷰, 배지는 verified/estimated/sample 상태를 분리해 신뢰 신호로 보여준다.' },
    { title: '리뷰', body: '0502 문서가 review target만 지정했으므로 받은 리뷰와 작성 companion flow를 함께 둔다.' },
    { title: '상태', body: '비공개, 네트워크 오류, 업로드 오류, 권한 부족 상태는 CTA와 이유를 남긴다.' },
    { title: '다음 단계', body: '리뷰 작성은 매치/팀매치 완료 후 진입하고, 프로필 공개 범위는 설정/legal 상태와 연결한다.' },
  ]}/>
);

const SM3_TEAM_BROWSE_ACTIONS_RESTORED = [
  ['검색 입력', '상단 검색바 focus/type', '검색 실행 버튼 활성화, query 유지', '검색 결과 목록. 빠른 입력은 마지막 query만 반영', 'search'],
  ['검색 실행', 'blue search icon tap', 'loading row 후 결과 갱신', 'empty/error/permission이면 복구 CTA와 context 유지', 'submit'],
  ['종목 chip', '가로 chip tap', 'active chip과 count 갱신', '목록 재조회. 0건이면 조건 초기화 제공', 'filter'],
  ['팀 카드', '카드 또는 팀 보기 tap', 'pressed scale + selected border', '팀 상세/가입 CTA 화면 진입', 'detail'],
  ['팀 비교 저장', '비교 담기 tap', 'toast + 카드 compare badge', '비교 drawer. 3개 초과 시 교체 확인', 'compare'],
  ['가입 가능 확인', '상세 sticky CTA tap', '가입 조건 sheet open', '신청 가능/권한 없음/마감/중복 신청으로 분기', 'join'],
  ['가입 신청', 'sheet primary CTA tap', '중복 submit lock + pending', '승인 대기 상태. 처리 주체와 예상 다음 상태 표시', 'apply'],
  ['알림 받기', '마감/검토중 카드 CTA tap', 'notification permission 확인', '권한 거부 시 수동 확인 안내와 설정 CTA', 'notify'],
  ['공유', '상세 공유 icon tap', 'native share 또는 링크 복사 toast', '실패 시 링크 복사 fallback', 'share'],
  ['뒤로가기', 'detail back tap', 'pressed feedback', '목록 scroll/query/filter/selected 상태 복원', 'nav'],
  ['하단 팀 탭', 'bottom nav 팀 tap', 'active 유지', '05 main으로 복귀, 이미 main이면 scroll top optional', 'nav'],
  ['my team shortcut', '홈 my team shortcut 진입', '목적지 미정 reason sheet', 'false affordance 차단. 결정 전 route 이동 금지', 'blocked'],
];

const SMRevisionTeamBrowseShellSM3Restored = ({ children }) => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 12 }}>
      {children}
    </div>
    <SMBottomNav active="teams"/>
  </div>
);

const SMRevisionTeamBrowseSearchBlockSM3Restored = ({ state = 'results' }) => {
  const isEmpty = state === 'empty';
  const isError = state === 'error';
  return (
    <div style={{ padding: '12px 20px 96px' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1, minHeight: 48, borderRadius: 14, border: '1px solid var(--border)', padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)' }}>
          <Icon name="search" size={18} color="var(--grey500)"/>
          <div className="tm-text-body" style={{ color: state === 'idle' ? 'var(--text-placeholder)' : 'var(--text-strong)', flex: 1 }}>풋살 강동</div>
          <button className="tm-btn tm-btn-icon tm-btn-primary" aria-label="팀 검색 실행" style={{ width: 38, minWidth: 38, height: 38, borderRadius: 12 }}>
            <Icon name="arrow" size={17} color="var(--static-white)"/>
          </button>
        </div>
        <SBtn variant="ghost" size="sm">취소</SBtn>
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '14px 0 10px' }}>
        {['전체 42', '모집중 18', '내 주변', '초보-중수', '주 1회'].map((label, index) => <HapticChip key={label} active={index === 0}>{label}</HapticChip>)}
      </div>
      {isEmpty || isError ? (
        <EmptyState
          title={isError ? '팀 목록을 불러오지 못했습니다' : '조건에 맞는 팀이 없습니다'}
          sub={isError ? '검색어와 필터는 유지합니다. 다시 시도하거나 지역 조건을 넓혀볼 수 있습니다.' : '선택한 종목과 지역 조건을 유지한 채 필터를 초기화하거나 추천 팀을 볼 수 있습니다.'}
          cta={isError ? '다시 시도' : '필터 초기화'}
        />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 2 }}>
            <SM2InlineStat label="모집중" value="18팀" sub="서울 기준"/>
            <SM2InlineStat label="내 프로필 매칭" value="7팀" sub="sample"/>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
            {SM2_TEAM_BROWSE_TEAMS.map((team, index) => <SM2TeamBrowseCard key={team.name} team={team} selected={index === 0}/>)}
          </div>
        </>
      )}
    </div>
  );
};

const SMRevisionTeamBrowseMobileSM3Restored = () => (
  <SMRevisionTeamBrowseShellSM3Restored>
    <SMRevisionTeamBrowseSearchBlockSM3Restored/>
  </SMRevisionTeamBrowseShellSM3Restored>
);

const SMRevisionTeamBrowseSearchMobileSM3Restored = ({ state = 'results' }) => (
  <SMRevisionTeamBrowseShellSM3Restored>
    <SMRevisionTeamBrowseSearchBlockSM3Restored state={state}/>
  </SMRevisionTeamBrowseShellSM3Restored>
);

const SMRevisionTeamBrowseListSearchBarSM4Restored = ({ state = 'results' }) => {
  const isError = state === 'error';
  const isTyping = state === 'typing' || state === 'results';
  const value = state === 'empty' ? '수영 강남' : isTyping ? '풋살 강동' : '';
  return (
    <div style={{ minHeight: 56, padding: '8px 10px 8px 20px', borderBottom: '1px solid var(--grey100)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', flexShrink: 0 }}>
      <div style={{ flex: 1, minHeight: 44, borderRadius: 14, background: 'var(--grey100)', border: isError ? '1px solid var(--red500)' : isTyping ? '1px solid var(--blue500)' : '1px solid transparent', display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px 0 14px' }}>
        <div className="tm-text-body" style={{ flex: 1, color: value ? 'var(--text-strong)' : 'var(--text-placeholder)' }}>{value || '팀명, 지역, 종목 검색'}</div>
        {value && (
          <button aria-label="검색어 지우기" style={{ width: 30, minWidth: 30, height: 30, border: 0, background: 'transparent', display: 'grid', placeItems: 'center', padding: 0 }}>
            <span style={{ width: 20, height: 20, borderRadius: 999, background: 'var(--grey400)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 14, lineHeight: '20px', fontWeight: 800 }}>×</span>
          </button>
        )}
        <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="팀 검색 실행" style={{ width: 34, minWidth: 34, height: 34, borderRadius: 11, color: isError ? 'var(--red500)' : 'var(--blue500)' }}>
          <Icon name="search" size={19}/>
        </button>
      </div>
      <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="팀 목록 필터" style={{ width: 40, minWidth: 40, height: 40, padding: 0 }}>
        <Icon name="filter" size={21}/>
      </button>
    </div>
  );
};

const SMRevisionTeamBrowseShellSM4Restored = ({ children, state = 'results' }) => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <SMRevisionTeamBrowseListSearchBarSM4Restored state={state}/>
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 12 }}>
      {children}
    </div>
    <SMBottomNav active="teams"/>
  </div>
);

const SMRevisionTeamBrowseListBodySM4Restored = ({ state = 'results' }) => {
  const isEmpty = state === 'empty';
  const isError = state === 'error';
  return (
    <div style={{ padding: '14px 20px 96px' }}>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 10 }}>
        {['전체 42', '모집중 18', '내 주변', '초보-중수', '주 1회'].map((label, index) => <HapticChip key={label} active={index === 0}>{label}</HapticChip>)}
      </div>
      {isEmpty || isError ? (
        <EmptyState
          title={isError ? '팀 목록을 불러오지 못했습니다' : '조건에 맞는 팀이 없습니다'}
          sub={isError ? '00 최종본의 목록 상단바처럼 검색어와 필터는 상단에 유지하고, 재시도는 본문 CTA로 둡니다.' : '검색어는 상단바에 남긴 채 필터 초기화, 추천 팀 보기, 지역 넓히기로 복구합니다.'}
          cta={isError ? '검색 재시도' : '필터 초기화'}
        />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <SM2InlineStat label="모집중" value="18팀" sub="서울 기준"/>
            <SM2InlineStat label="내 프로필 매칭" value="7팀" sub="sample"/>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
            {SM2_TEAM_BROWSE_TEAMS.map((team, index) => <SM2TeamBrowseCard key={team.name} team={team} selected={index === 0}/>)}
          </div>
        </>
      )}
    </div>
  );
};

const SMRevisionTeamBrowseMobileSM4Restored = ({ state = 'results' }) => (
  <SMRevisionTeamBrowseShellSM4Restored state={state}>
    <SMRevisionTeamBrowseListBodySM4Restored state={state}/>
  </SMRevisionTeamBrowseShellSM4Restored>
);

const SMRevisionTeamBrowseJoinSheetSM3Restored = ({ state = 'ready' }) => {
  const team = SM2_TEAM_BROWSE_TEAMS[0];
  const content = {
    ready: ['가입 신청 전 확인', '팀 공개 범위와 활동 조건을 확인했습니다.', '가입 신청하기', 'primary'],
    pending: ['이미 신청 검토 중', '팀장이 검토 중입니다. 중복 신청은 막고 상태 확인으로 이동합니다.', '신청 상태 보기', 'neutral'],
    permission: ['가입 조건이 부족합니다', '프로필 공개 범위 또는 레벨 정보가 부족합니다. 필요한 항목을 먼저 보완해야 합니다.', '프로필 보완하기', 'secondary'],
    closed: ['현재 모집이 마감되었습니다', '정원이 찼습니다. 다음 모집 알림을 받을 수 있습니다.', '모집 알림 받기', 'neutral'],
    rejected: ['최근 거절 이력이 있습니다', '거절 사유를 확인한 뒤 재신청 가능 시점에 다시 시도합니다.', '사유 확인하기', 'secondary'],
  }[state];
  return (
    <SMRevisionShell title="" back notificationNew={false} bottom={false}>
      <div style={{ padding: '18px 20px 118px' }}>
        <Card pad={18} style={{ background: 'var(--grey900)', color: 'var(--static-white)' }}>
          <div style={{ width: 60, height: 60, borderRadius: 18, background: 'var(--blue500)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{team.logo}</div>
          <div className="tm-text-heading" style={{ color: 'var(--static-white)', marginTop: 14 }}>{team.name}</div>
          <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.72)', marginTop: 4 }}>{team.sport} · {team.region} · 매너 {team.manner}</div>
        </Card>
      </div>
      <div className="tm-animate-sheet" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '18px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)', borderRadius: '20px 20px 0 0', boxShadow: 'var(--sh-2)' }}>
        <div className="tm-text-subhead">{content[0]}</div>
        <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>{content[1]}</div>
        <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
          <SMRevisionInfoRow label="팀" value={team.name}/>
          <SMRevisionInfoRow label="활동 조건" value="주 1회 · 초보-중수 · 강동/광진권"/>
          <SMRevisionInfoRow label="신뢰 상태" value={`${team.trust} · sample/estimated/verified 구분 유지`}/>
        </div>
        <SBtn full size="lg" variant={content[3]} style={{ marginTop: 14 }}>{content[2]}</SBtn>
      </div>
    </SMRevisionShell>
  );
};

const SMRevisionTeamBrowseMembershipStateSM3Restored = ({ state = 'pending' }) => {
  const rows = {
    pending: ['가입 신청 검토 중', '성수 러너스 FC 팀장이 신청서를 확인하고 있습니다.', '처리 주체: 팀장 · 예상 다음 상태: 승인 또는 거절', 'orange'],
    approved: ['가입이 승인되었습니다', '팀 일정과 채팅방에 입장할 수 있습니다.', '다음 행동: 팀 채팅 입장 / 팀 프로필 보기', 'green'],
    rejected: ['가입 신청이 거절되었습니다', '사유를 확인하고 프로필을 보완한 뒤 재신청할 수 있습니다.', '복구 행동: 사유 확인 / 다른 팀 보기', 'red'],
    duplicate: ['이미 신청한 팀입니다', '중복 제출은 막고 기존 신청 상태로 이동합니다.', '다음 행동: 신청 상태 보기', 'orange'],
    private: ['프로필 공개가 필요합니다', '팀 가입 판단에 필요한 레벨/지역/매너 정보가 비공개입니다.', '복구 행동: 공개 범위 설정', 'orange'],
  }[state];
  return (
    <SMRevisionShell title="" back notificationNew={false} bottom={false}>
      <div style={{ padding: '20px 20px 118px' }}>
        <Badge tone={rows[3]}>{state}</Badge>
        <div className="tm-text-heading" style={{ marginTop: 14 }}>{rows[0]}</div>
        <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)' }}>{rows[1]}</div>
        <Card pad={16} style={{ marginTop: 18, background: rows[3] === 'green' ? 'var(--green50)' : rows[3] === 'red' ? 'var(--red50)' : 'var(--orange50)' }}>
          <div className="tm-text-body-lg">{rows[2]}</div>
          <div className="tm-text-caption" style={{ marginTop: 8 }}>toast 단독 처리 금지. 상태는 이 화면 또는 팀 상세 CTA에 지속 표시한다.</div>
        </Card>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
        <SBtn full size="lg" variant={rows[3] === 'red' ? 'secondary' : 'primary'}>{rows[3] === 'green' ? '팀 채팅 입장' : rows[3] === 'red' ? '다른 팀 보기' : '상태 확인하기'}</SBtn>
      </div>
    </SMRevisionShell>
  );
};

const SMRevisionTeamBrowseSM3ActionMatrixRestored = () => (
  <SMRevisionPlusBoard eyebrow="05 TEAM BROWSE SM3 · ACTIONS" title="팀 둘러보기 모든 버튼 동작/예외 매트릭스" columns={4}>
    {SM3_TEAM_BROWSE_ACTIONS_RESTORED.map(([title, trigger, feedback, next, state], index) => (
      <SMRevisionPlusCard key={title} index={index + 1} title={title} trigger={trigger} feedback={feedback} next={next} state={state} tone={state === 'blocked' || state === 'notify' ? 'orange' : 'blue'}/>
    ))}
  </SMRevisionPlusBoard>
);

const SMRevisionTeamBrowseSM3StateMatrixRestored = () => (
  <SMRevisionPlusBoard eyebrow="05 TEAM BROWSE SM3 · STATES" title="팀 둘러보기 상태/예외 처리 완성본" columns={4}>
    {[
      ['loading', '팀 카드 skeleton은 로고, 제목 2줄, 신뢰 지표 3칸, CTA row shape를 유지한다.', 'skeleton', 'blue'],
      ['empty', '검색어와 필터를 유지하고 필터 초기화, 추천 팀 보기, 지역 넓히기를 제공한다.', 'recover', 'blue'],
      ['network error', '마지막 query/filter context를 유지하고 재시도 CTA를 제공한다. toast 단독 금지.', 'retry', 'red'],
      ['permission', '내 주변/프로필 기반 추천에 필요한 위치 또는 프로필 공개 권한이 없으면 이유와 설정 CTA를 둔다.', 'permission', 'orange'],
      ['pending', '가입 신청 후 CTA를 잠그고 처리 주체와 예상 다음 상태를 표시한다.', 'pending', 'orange'],
      ['approved', '승인 완료는 팀 채팅/팀 프로필/일정 확인 후속 행동으로 연결한다.', 'next action', 'green'],
      ['rejected', '거절 사유와 재신청 가능 조건을 지속 UI로 표시한다.', 'reason', 'red'],
      ['closed', '모집 마감 팀은 가입 CTA를 알림 받기로 바꾸고, 대체 추천을 제공한다.', 'notify', 'orange'],
      ['duplicate', '중복 신청은 새 submit 대신 기존 신청 상태 화면으로 이동한다.', 'status', 'orange'],
      ['stale result', '빠른 필터 전환에서 이전 응답이 최신 목록을 덮지 못하게 마지막 요청 기준으로 표시한다.', 'last-write wins', 'orange'],
      ['trust sample', 'sample/estimated/verified 신뢰 신호를 명확히 구분하고 실제 검증처럼 보이지 않게 한다.', 'truth gate', 'blue'],
      ['my team undecided', '목적지 미정 shortcut은 disabled reason sheet로 막고 임의 route 이동을 하지 않는다.', 'blocked', 'orange'],
    ].map(([title, body, action, tone]) => <SMRevisionPlusStateCard key={title} title={title} body={body} action={action} tone={tone}/>)}
  </SMRevisionPlusBoard>
);

const SMRevisionTeamBrowseSM3FlowRestored = () => (
  <SMRevisionPlusBoard eyebrow="05 TEAM BROWSE SM3 · FLOW" title="홈/탭 → 팀 탐색 → 상세 → 가입 상태 흐름" columns={4}>
    {[
      ['진입', '홈 team shortcut 또는 하단 팀 탭에서 05 main으로 진입한다. query/filter 초기값은 지역/관심 종목 기반.', 'main'],
      ['탐색', '검색, 종목 chip, 모집중/내 주변 조건으로 팀 목록을 좁힌다. stale query race를 막는다.', 'filter'],
      ['비교', '팀 카드의 적합도/매너/신뢰 상태를 비교하고 최대 3개까지 비교 drawer에 담는다.', 'compare'],
      ['상세 판단', '팀 상세에서 활동 방식, 신뢰 신호, 가입 조건, 공개 범위를 확인한다.', 'detail'],
      ['신청 전 확인', 'sticky CTA는 가입 조건 sheet를 열고 프로필/권한/정원/중복 신청을 먼저 검사한다.', 'guard'],
      ['신청', '가능 상태에서만 신청 submit. 중복 submit lock과 pending 상태를 지속 표시한다.', 'apply'],
      ['결과', '승인/거절/마감/중복/권한 부족을 각각 별도 화면 또는 상세 CTA 상태로 표시한다.', 'state'],
      ['후속', '승인 완료는 팀 채팅, 팀 프로필, 팀 일정으로 연결한다. 거절/마감은 대체 팀 추천으로 복구한다.', 'next'],
    ].map(([title, body, action], index) => <SMRevisionPlusStateCard key={title} title={`${index + 1}. ${title}`} body={body} action={action} tone={index >= 4 ? 'orange' : 'blue'}/>)}
  </SMRevisionPlusBoard>
);

const SMRevisionTeamBrowseSM4TopbarRuleRestored = () => (
  <SMRevisionPlusBoard eyebrow="05 TEAM BROWSE SM4 · 00 LIST TOPBAR" title="00 최종본 목록 상단바 검색 적용" columns={4}>
    <SMRevisionPlusStateCard title="검색 위치" body="SM3의 본문 첫 요소 검색바를 00 최종본 기준의 목록 상단바로 올린다. 팀 목록 본문은 chip과 결과부터 시작한다." action="topbar search" tone="blue"/>
    <SMRevisionPlusStateCard title="필터 노출" body="목록에서는 검색창과 필터 버튼을 동시에 노출한다. 별도 검색 아이콘 진입이나 숨은 필터 entry를 만들지 않는다." action="filter visible" tone="blue"/>
    <SMRevisionPlusStateCard title="상태 유지" body="empty/error에서도 검색어와 필터 버튼은 상단바에 남기고, 복구 CTA만 본문으로 내려 검색 context를 잃지 않는다." action="persistent context" tone="orange"/>
    <SMRevisionPlusStateCard title="하단 탭" body="05는 팀 둘러보기 루트이므로 하단 5탭은 유지하고 팀 탭을 active로 둔다. 상세/신청 상태 화면은 기존 SM3 규칙을 따른다." action="teams active" tone="green"/>
  </SMRevisionPlusBoard>
);

Object.assign(globalThis, {
  SMBottomNav,
  SM_BOTTOM_TABS,
  SMRevisionRuleBoard,
  SMRevisionHomeMobile,
  SMRevisionHomeStates,
  SMRevisionHomeMobileV2,
  SMRevisionHomeStatesV2,
  SMRevisionHomeUIRulesV2,
  SMRevisionHomeInteractionFlowV2,
  SMRevisionHomeSearchMobileV2,
  SMRevisionHomeSearchRulesV2,
  SMRevisionHomeMobileGridV2,
  SMRevisionMatchListMobile,
  SMRevisionMatchDetailMobile,
  SMRevisionMatchListMobileSM3,
  SMRevisionMatchSearchFocusMobileSM3,
  SMRevisionMatchSearchMobileSM3,
  SMRevisionMatchStateMobileSM3,
  SMRevisionMatchDetailMobileSM3,
  SMRevisionMatchJoinFeedbackOverlaySM3,
  SMRevisionMatchPaymentCompleteToastSMFinal,
  SMRevisionMatchMobileGridSM3,
  SMRevisionMatchListMobileSM4,
  SMRevisionMatchSearchFocusMobileSM4,
  SMRevisionMatchSearchMobileSM4,
  SMRevisionTeamMatchListMobileSM2,
  SMRevisionTeamMatchSearchFocusMobileSM2,
  SMRevisionTeamMatchSearchMobileSM2,
  SMRevisionTeamMatchStateMobileSM2,
  SMRevisionTeamMatchDetailMobileSM2,
  SMRevisionTeamMatchMobileGridSM2,
  SMRevisionTeamMatchListMobileSM4,
  SMRevisionTeamMatchSM4FilterSheetOption,
  SMRevisionTeamMatchSM4EmptyTextState,
  SMRevisionTeamMatchSM4SearchErrorToastState,
  SMRevisionTeamMatchSM4TopSearchRules,
  SMRevisionTeamBrowseMobile,
  SMRevisionTeamBrowseMobileSM2,
  SMRevisionTeamBrowseDetailSM2,
  SMRevisionTeamBrowseStateSM2,
  SMRevisionTeamBrowseMobileGridSM2,
  SMRevisionChatListMobile,
  SMRevisionChatRoomMobile,
  SMRevisionNotificationsMobile,
  SMRevisionChatListMobileSM2,
  SMRevisionChatRoomMobileSM2,
  SMRevisionNotificationsMobileSM2,
  SMRevisionCommunityMobileGridSM2,
  SMRevisionLoginMobile,
  SMRevisionLoginMobileV2,
  SMRevisionAuthTermsV2,
  SMRevisionAuthCallbackV2,
  SMRevisionAuthFallbackV2,
  SMRevisionAuthMobileGridV2,
  SMRevisionAuthSM3Login,
  SMRevisionAuthEmailLoginSM3,
  SMRevisionAuthSignupSM3,
  SMRevisionAuthSM3TermsStep,
  SMRevisionAuthSM3SportStep,
  SMRevisionAuthSM3LevelStep,
  SMRevisionAuthSM3RegionStep,
  SMRevisionAuthSM3Welcome,
  SMRevisionAuthSM3ExceptionBoard,
  SMRevisionAuthSM3ActionMap,
  SMRevisionAuthSM4Checklist,
  SMRevisionAuthSM4TermsDisabled,
  SMRevisionAuthSM4Confirm,
  SMRevisionAuthSM4EmailLoginError,
  SMRevisionAuthSM4SignupError,
  SMRevisionAuthSM4LocationDenied,
  SMRevisionAuthSM4Resume,
  SMRevisionAuthSM5ActionMatrix,
  SMRevisionAuthSM5StateMatrix,
  SMRevisionAuthSM5Flow,
  SMRevisionHomeSM3ActionMatrix,
  SMRevisionHomeSM3StateMatrix,
  SMRevisionHomeSM3Flow,
  SMRevisionMatchSM4ActionMatrix,
  SMRevisionMatchSM4StateMatrix,
  SMRevisionMatchSM4Flow,
  SMRevisionTeamMatchSM3ActionMatrix,
  SMRevisionTeamMatchSM3StateMatrix,
  SMRevisionTeamMatchSM3Flow,
  SMRevisionProfileReviewMobile,
  SMRevisionProfileReviewMobileSM2,
  SMRevisionReviewWriteMobileSM2,
  SMRevisionProfileStateMobileSM2,
  SMRevisionProfileReviewMobileGridSM2,
  SMRevisionPaymentMobile,
  SMRevisionLandingMobile,
  SMRevisionAdminMobile,
});

const SMCoreIconButton = ({ label, icon, active = false, children }) => (
  <button aria-label={label} style={{ width: 34, minWidth: 34, height: 34, border: 0, background: active ? 'var(--blue500)' : 'transparent', borderRadius: 11, display: 'grid', placeItems: 'center', color: active ? 'var(--static-white)' : 'var(--text-strong)', padding: 0, position: 'relative' }}>
    <Icon name={icon} size={icon === 'chevL' ? 20 : 21}/>
    {children}
  </button>
);

const SMCoreBackButton = () => (
  <button aria-label="뒤로가기" style={{ width: 30, minWidth: 30, height: 40, border: 0, background: 'transparent', borderRadius: 12, display: 'grid', placeItems: 'center', color: 'var(--text-strong)', padding: 0 }}>
    <Icon name="chevL" size={20}/>
  </button>
);

const SMCorePreviewSearchBox = ({ text = '검색어를 입력하세요' }) => (
  <div style={{ flex: 1, minHeight: 40, borderRadius: 13, background: 'var(--grey100)', display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px 0 14px', minWidth: 0 }}>
    <div className="tm-text-body" style={{ flex: 1, color: 'var(--text-placeholder)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</div>
    <SMCoreIconButton label="검색 실행" icon="search"/>
  </div>
);

const SMCoreShellPreviewBar = ({ mode }) => {
  if (mode === 'home') {
    return (
      <div style={{ minHeight: 56, padding: '8px 10px 8px 16px', borderBottom: '1px solid var(--grey100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="tm-text-body-lg" style={{ color: 'var(--text-strong)' }}>teameet</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <SMCoreIconButton label="검색" icon="search"/>
          <SMCoreIconButton label="알림" icon="bell">
            <span style={{ position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: 999, background: 'var(--red500)', border: '2px solid var(--bg)' }}/>
          </SMCoreIconButton>
        </div>
      </div>
    );
  }

  if (mode === 'list') {
    return (
      <div style={{ minHeight: 56, padding: '8px 10px 8px 20px', borderBottom: '1px solid var(--grey100)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <SMCorePreviewSearchBox text="매치, 팀, 지역 검색"/>
        <button aria-label="필터" style={{ width: 40, minWidth: 40, height: 40, border: 0, background: 'transparent', borderRadius: 12, display: 'grid', placeItems: 'center', color: 'var(--text-strong)', padding: 0 }}>
          <Icon name="filter" size={21}/>
        </button>
      </div>
    );
  }

  if (mode === 'detail') {
    return (
      <div style={{ minHeight: 56, padding: '8px 10px 8px 8px', borderBottom: '1px solid var(--grey100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <SMCoreBackButton/>
          <div className="tm-text-body-lg" style={{ color: 'var(--text-strong)', whiteSpace: 'nowrap' }}>상세보기</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <SMCoreIconButton label="공유" icon="share"/>
          <SMCoreIconButton label="알림" icon="bell"/>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: 56, padding: '8px 10px 8px 8px', borderBottom: '1px solid var(--grey100)', display: 'flex', alignItems: 'center', gap: 1 }}>
      <SMCoreBackButton/>
      <SMCorePreviewSearchBox text="검색어를 입력하세요"/>
    </div>
  );
};

const SMCoreShellRuleCard = ({ index, title, body, mode, meta }) => (
  <Card pad={0} style={{ overflow: 'visible' }}>
    <SMCoreShellPreviewBar mode={mode}/>
    <div style={{ padding: '12px 13px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 24 }}>
        <span style={{ minWidth: 30, height: 22, padding: '0 8px', borderRadius: 999, background: 'var(--blue50)', color: 'var(--blue500)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, lineHeight: '22px', fontWeight: 800, flexShrink: 0 }}>{String(index).padStart(2, '0')}</span>
        <div className="tm-text-body-lg" style={{ minWidth: 0 }}>{title}</div>
      </div>
      <div className="tm-text-caption" style={{ marginTop: 5 }}>{body}</div>
      <div className="tm-text-micro" style={{ marginTop: 6, color: 'var(--text-muted)' }}>{meta}</div>
    </div>
  </Card>
);

const SMCoreTopBackCompactOptionsMobile = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar/>
    <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid var(--grey100)', flexShrink: 0 }}>
      <div className="tm-text-caption">00 SM 고정안 · 상단바 디자인</div>
      <div className="tm-text-subhead" style={{ marginTop: 3 }}>상단바와 검색 진입</div>
      <div className="tm-text-caption" style={{ marginTop: 6 }}>모든 모바일 디자인은 이 상단바 기준을 먼저 적용한다. 화면별 필요한 요소만 남긴다.</div>
    </div>
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 18px 28px', display: 'grid', gap: 8, alignContent: 'start', WebkitOverflowScrolling: 'touch' }}>
      <SMCoreShellRuleCard index={1} title="홈 상단바" body="홈에서는 로고, 검색 아이콘, 알림 아이콘만 사용한다. 검색은 홈 전체 검색으로 진입하고, 알림 점은 새 알림이 있을 때만 표시한다." meta="적용: 홈, 마이처럼 전역 검색 진입이 필요한 루트 화면" mode="home"/>
      <SMCoreShellRuleCard index={2} title="목록 상단바" body="매치, 팀매치, 팀 목록에서는 검색창과 필터를 바로 노출하고 뒤로가기는 두지 않는다. 검색 아이콘은 입력창 내부 오른쪽에 둔다." meta="적용: 매치 목록, 팀매치 목록, 팀 둘러보기" mode="list"/>
      <SMCoreShellRuleCard index={3} title="상세 상단바" body="상세보기에서는 뒤로가기, 공유, 알림만 둔다. 검색창과 필터는 상세 화면에서 제외한다." meta="뒤로가기 수치: 2안 고정, 30px 버튼 / 20px 아이콘 / 제목 gap 1" mode="detail"/>
      <SMCoreShellRuleCard index={4} title="홈 검색 진입" body="홈에서 검색을 누르면 뒤로가기와 검색창만 남긴다. 검색어 입력, 지우기, 결과 없음, 오류 상태는 검색바 계열 보드에서 처리한다." meta="적용: 홈 검색 결과, 전체 검색, 검색 포커스 화면" mode="homeSearch"/>
    </div>
  </div>
);

const SMCoreFixedBottomNavMobile = ({ active = 'matches' }) => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar/>
    <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid var(--grey100)', flexShrink: 0 }}>
      <div className="tm-text-caption">00 SM 고정안 · 하단바 기준</div>
      <div className="tm-text-heading" style={{ marginTop: 4 }}>고정 5탭</div>
      <div className="tm-text-body" style={{ marginTop: 8 }}>하단바는 홈 / 매치 / 팀매치 / 팀 / 마이 순서로 고정한다. 이 보드는 상단바 없이 하단바 규약과 선택 상태만 확인한다.</div>
    </div>
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px 24px', display: 'grid', gap: 12, WebkitOverflowScrolling: 'touch' }}>
      <Card pad={16}>
        <div className="tm-text-label">동작 규약</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>탭하면 눌림 피드백 뒤 기준 루트로 이동한다. 현재 탭을 다시 누르면 해당 목록의 맨 위로 이동한다. 상세, 로그인, 채팅방, 알림, 결제 같은 몰입 화면에서는 숨길 수 있다.</div>
      </Card>
      {SM_BOTTOM_TABS.map((tab) => (
        <Card key={tab.id} pad={12}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div className="tm-text-body-lg">{tab.label}</div>
            <span className="tm-badge tm-badge-sm" style={{ background: active === tab.id ? 'var(--blue50)' : 'var(--grey50)', color: active === tab.id ? 'var(--blue500)' : 'var(--grey500)' }}>{active === tab.id ? '현재 탭' : '이동 탭'}</span>
          </div>
          <div className="tm-text-caption">기본 상태와 선택 상태를 같은 크기로 유지한다. 탭 순서와 라벨은 화면마다 바꾸지 않는다.</div>
        </Card>
      ))}
    </div>
    <SMBottomNav active={active}/>
  </div>
);

const SMNotificationStateSample = ({ state }) => {
  const isNew = state === 'new';
  const isCount = state === 'count';
  return (
    <div style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
      <button aria-label={isCount ? '알림 3개' : isNew ? '새 알림 있음' : '알림 없음'} style={{ width: 44, height: 44, border: 0, background: 'var(--bg)', borderRadius: 14, display: 'grid', placeItems: 'center', position: 'relative', color: isNew || isCount ? 'var(--text-strong)' : 'var(--grey500)' }}>
        <Icon name="bell" size={21}/>
        {isNew && <span style={{ position: 'absolute', top: 10, right: 10, width: 7, height: 7, borderRadius: 999, background: 'var(--red500)', border: '2px solid var(--bg)' }}/>}
        {isCount && <span style={{ position: 'absolute', top: 5, right: 3, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: 'var(--red500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 800, lineHeight: '18px', border: '2px solid var(--bg)' }}>3</span>}
      </button>
      <div className="tm-text-micro" style={{ color: 'var(--text-muted)', textAlign: 'center' }}>{isCount ? '개수 표시' : isNew ? '새 알림' : '알림 없음'}</div>
    </div>
  );
};

const SMCoreNotificationMobile = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar/>
    <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid var(--grey100)', flexShrink: 0 }}>
      <div className="tm-text-caption">00 SM 고정안 · 알림</div>
      <div className="tm-text-heading" style={{ marginTop: 4 }}>알림 버튼 표시 기준</div>
      <div className="tm-text-body" style={{ marginTop: 8 }}>알림은 상단바 안의 버튼 상태로만 표시한다. 새 알림 여부와 읽지 않은 개수는 서로 다른 상태로 분리한다.</div>
    </div>
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px 24px', display: 'grid', gap: 12, WebkitOverflowScrolling: 'touch' }}>
      <Card pad={14}>
        <div className="tm-text-body-lg">알림 버튼 상태</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>알림 버튼은 세 가지 상태로만 쓴다. 알림이 없으면 배지를 숨기고, 새 알림 존재만 알릴 때는 점, 개수를 알려야 할 때만 숫자 배지를 쓴다.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12, padding: 12, borderRadius: 14, background: 'var(--grey50)' }}>
          <SMNotificationStateSample state="none"/>
          <SMNotificationStateSample state="new"/>
          <SMNotificationStateSample state="count"/>
        </div>
      </Card>
      <Card pad={16} style={{ background: 'var(--grey50)' }}>
        <div className="tm-text-label">동작 규약</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>알림 버튼을 누르면 알림 화면으로 이동한다. 새 알림 점이나 숫자 배지는 읽음 처리 API 성공 후에만 사라진다. 실패하면 기존 미읽음 상태를 유지한다.</div>
      </Card>
    </div>
  </div>
);

const SM_CORE_SEARCH_ROWS = {
  back: [
    ['default', '검색어 없음', 'placeholder만 표시하고 입력 focus는 가능하게 둔다.', 'focus'],
    ['typing', '입력 중', '지우기 버튼과 검색 실행 버튼을 노출한다.', 'results'],
    ['empty', '결과 없음', '검색어는 유지하고 추천 키워드와 복구 CTA를 보여준다.', 'recover'],
    ['error', '네트워크 오류', '오류 원인, 재시도, 마지막 검색어를 같은 화면에 남긴다.', 'retry'],
    ['permission', '위치 권한 없음', '현재 위치 검색이 불가함을 설명하고 수동 지역 검색으로 우회한다.', 'manual'],
    ['disabled', '라우트 준비 중', '검색창은 흐리게 표시하고 준비 중 이유를 표시한다.', 'wait'],
  ],
  filter: [
    ['default', '검색 + 필터 기본', '목록 상단에서 검색창과 필터 버튼을 같이 두고 뒤로가기는 제외한다.', 'open filter'],
    ['filter-open', '필터 열림', '필터는 sheet로 열고 검색창 값은 유지한다.', 'sheet'],
    ['typing', '검색어 입력 중', '필터 적용값과 검색어를 동시에 유지한다.', 'sync'],
    ['empty', '필터 결과 없음', '검색어와 필터 중 무엇 때문에 비었는지 구분한다.', 'reduce'],
    ['error', '필터 조회 오류', '재시도와 필터 유지 여부를 보여준다.', 'retry'],
    ['permission', '위치 필터 권한 없음', '위치 기반 필터만 막고 다른 필터는 유지한다.', 'manual'],
  ],
};

const SMCoreSearchExceptionCard = ({ row, index, type }) => {
  const [state, title, body, action] = row;
  const isFilter = type === 'filter';
  const isError = state === 'error';
  const isOpen = state === 'filter-open';
  const value = state === 'typing' ? (isFilter ? '풋살 · 오늘' : '강남 풋살') : state === 'empty' ? (isFilter ? '강동 · 수영' : '새벽 수영') : '';
  return (
    <div style={{ padding: 12, borderRadius: 16, background: 'var(--bg)', border: '1px solid var(--grey100)', display: 'grid', gap: 10 }}>
      <div style={{ minHeight: 46, display: 'flex', alignItems: 'center', gap: 1, opacity: state === 'disabled' ? .62 : 1 }}>
        <SMCoreBackButton/>
        <div style={{ flex: 1, minHeight: 44, borderRadius: 14, border: isError ? '1px solid var(--red500)' : value || isOpen ? '1px solid var(--blue500)' : '1px solid transparent', background: state === 'disabled' ? 'var(--grey50)' : isError ? 'rgba(240,68,82,.08)' : 'var(--grey100)', display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px 0 14px', minWidth: 0 }}>
          <div className="tm-text-body" style={{ flex: 1, minWidth: 0, color: value ? 'var(--text-strong)' : 'var(--text-placeholder)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value || '검색어를 입력하세요'}</div>
          {value && <span style={{ width: 20, height: 20, borderRadius: 999, background: 'var(--grey400)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800 }}>x</span>}
          <SMCoreIconButton label="검색 실행" icon={isError ? 'alert' : 'search'}/>
        </div>
        {isFilter && (
          <button aria-label="필터" style={{ width: 40, minWidth: 40, height: 40, border: 0, background: isOpen ? 'var(--blue500)' : 'transparent', borderRadius: 12, display: 'grid', placeItems: 'center', color: isOpen ? 'var(--static-white)' : 'var(--text-strong)', padding: 0 }}>
            <Icon name="filter" size={20}/>
          </button>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ minWidth: 30, height: 22, padding: '0 8px', borderRadius: 999, background: 'var(--grey50)', color: isError ? 'var(--red500)' : 'var(--blue500)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{String(index + 1).padStart(2, '0')}</span>
        <div className="tm-text-label" style={{ flex: 1, minWidth: 0 }}>{title}</div>
        <span className="tm-badge tm-badge-sm" style={{ background: isFilter ? 'var(--grey50)' : 'var(--blue50)', color: isFilter ? 'var(--text-muted)' : 'var(--blue500)' }}>{state}</span>
      </div>
      <div className="tm-text-caption">{body}</div>
      <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>다음 동작: {action}</div>
    </div>
  );
};

const SMCoreFixedSearchBarMobile = ({ state = 'default', type = 'back' }) => (
  <SMCoreSearchTypeExceptionMobile type={type === 'filter' ? 'filter' : 'back'}/>
);

const SMCoreSearchTypeExceptionMobile = ({ type = 'back' }) => {
  const isBack = type === 'back';
  const rows = SM_CORE_SEARCH_ROWS[type] || SM_CORE_SEARCH_ROWS.back;
  return (
    <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <StatusBar/>
      <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid var(--grey100)', flexShrink: 0 }}>
        <div className="tm-text-caption">00 SM 고정안 · 검색바 유형</div>
        <div className="tm-text-heading" style={{ marginTop: 4 }}>{isBack ? '뒤로가기형 검색바' : '필터형 검색바'}</div>
        <div className="tm-text-body" style={{ marginTop: 8 }}>{isBack ? '뒤로가기는 입력창 바깥 왼쪽, 돋보기는 입력창 내부 오른쪽에 둔다.' : '목록형 검색바는 뒤로가기를 제거하고 필터만 입력창 바깥 오른쪽에 둔다.'}</div>
      </div>
      <SMCoreShellPreviewBar mode={isBack ? 'homeSearch' : 'list'}/>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px 24px', display: 'grid', gap: 10, WebkitOverflowScrolling: 'touch' }}>
        {rows.map((row, index) => <SMCoreSearchExceptionCard key={row[0]} row={row} index={index} type={type}/>)}
      </div>
    </div>
  );
};

const SMCoreFixedShellActionMatrix = () => (
  <SMRevisionPlusBoard eyebrow="00 CORE SHELL · ACTIONS" title="공통 셸 버튼 동작/예외" columns={4}>
    {[
      ['뒤로가기', 'back tap', 'press feedback', '이전 화면 또는 fallback route'],
      ['검색', 'search tap', 'focused search', '모듈 검색 화면'],
      ['알림', 'bell tap', 'unread 유지', '06 알림 목록'],
      ['더보기', 'more tap', 'menu sheet', '공유/신고/관리'],
      ['하단 탭', 'tab tap', 'active 이동', '모듈 root'],
      ['필터', 'filter tap', 'sheet open', '조건 적용/초기화'],
      ['clear', 'x tap', 'query 제거', '검색 미입력 상태'],
      ['retry', '오류 CTA tap', 'same context retry', '실패 반복 안내'],
    ].map(([title, trigger, feedback, next], index) => <SMRevisionPlusCard key={title} index={index + 1} title={title} trigger={trigger} feedback={feedback} next={next} state="shell"/>)}
  </SMRevisionPlusBoard>
);

const SMCoreFixedShellResponsiveBoard = () => (
  <SMRevisionPlusBoard eyebrow="00 CORE SHELL · RESPONSIVE" title="반응형 기준" columns={3}>
    <SMRevisionPlusStateCard title="mobile 375" body="상단바와 하단바를 고정하고 본문은 단일 column으로 구성한다." action="mobile" tone="blue"/>
    <SMRevisionPlusStateCard title="tablet 768" body="상단 구조는 유지하되 목록/보조 정보만 2열로 확장한다." action="tablet" tone="blue"/>
    <SMRevisionPlusStateCard title="desktop 1280" body="하단 탭은 좌측/상단 navigation으로 승격하고 검색/상태 계약은 유지한다." action="desktop" tone="orange"/>
  </SMRevisionPlusBoard>
);

const SM_FINAL_CORE_ORDER = ['00', '01', '02'];
const SM_FINAL_CORE_MODULES = {
  '00': { no: '00', name: 'SM shell', basis: '00 SM 최종본', component: SMCoreTopBackCompactOptionsMobile },
  '01': { no: '01', name: 'Auth', basis: '01 SM 최종본', component: null },
  '02': { no: '02', name: 'Home', basis: '02 SM5 검색 기준', component: null },
};
const SMFinalCoreOverviewBoard = ({ moduleId }) => {
  if (moduleId === '01') return <SMRevisionAuthSM5TermsBeforeSignup/>;
  if (moduleId === '02') return <SMRevisionHomeSearchMobileSM5Final/>;
  return <SMCoreTopBackCompactOptionsMobile/>;
};
const SMFinalCoreFlowBoard = ({ moduleId }) => (
  <SMRevisionPlusBoard eyebrow={`${moduleId} FINAL · FLOW`} title={`${SM_FINAL_CORE_MODULES[moduleId]?.name || 'Core'} 최종 흐름`} columns={3}>
    <SMRevisionPlusStateCard title="mobile" body="모바일 최종 화면과 버튼/상태 계약을 먼저 고정한다." action="fixed" tone="green"/>
    <SMRevisionPlusStateCard title="grid" body="main/state/components/assets/motion 그리드로 세부 동작을 정리한다." action="next" tone="blue"/>
    <SMRevisionPlusStateCard title="desktop" body="모바일과 grid 확인 후 데스크톱 확장으로 이동한다." action="defer" tone="orange"/>
  </SMRevisionPlusBoard>
);
const SMFinalCoreChecklistBoard = ({ moduleId }) => (
  <SMRevisionPlusBoard eyebrow={`${moduleId} FINAL · CHECKLIST`} title={`${SM_FINAL_CORE_MODULES[moduleId]?.name || 'Core'} 완료 기준`} columns={3}>
    <SMRevisionPlusStateCard title="원본 유지" body="기존 원본/수정안 섹션은 삭제하지 않고 비교 가능하게 둔다." action="preserve" tone="blue"/>
    <SMRevisionPlusStateCard title="fallback 금지" body="최종본은 placeholder가 아니라 실제 화면 또는 실제 계약 보드로 렌더한다." action="real UI" tone="green"/>
    <SMRevisionPlusStateCard title="예외 포함" body="버튼, 상황, 오류, 권한, 로딩, 비활성 상태를 함께 정리한다." action="states" tone="orange"/>
  </SMRevisionPlusBoard>
);


const SMRevisionSearchBarFinal = ({ value = '', error = false, disabled = false }) => (
  <div style={{ minHeight: 56, padding: '8px 10px 8px 8px', borderBottom: '1px solid var(--grey100)', display: 'flex', alignItems: 'center', gap: 1, background: 'var(--bg)', flexShrink: 0 }}>
    <button aria-label="back" style={{ width: 30, minWidth: 30, height: 40, border: 0, background: 'transparent', borderRadius: 12, display: 'grid', placeItems: 'center', color: 'var(--text-strong)', padding: 0 }}>
      <Icon name="chevL" size={20}/>
    </button>
    <div style={{ flex: 1, minHeight: 44, borderRadius: 14, background: disabled ? 'var(--grey50)' : 'var(--grey100)', border: error ? '1px solid var(--red500)' : value ? '1px solid var(--blue500)' : '1px solid transparent', display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px 0 14px', minWidth: 0, opacity: disabled ? .58 : 1 }}>
      <div className="tm-text-body" style={{ flex: 1, minWidth: 0, color: value ? 'var(--text-strong)' : 'var(--text-placeholder)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value || '검색어를 입력해 주세요'}</div>
      {value && !disabled && (
        <button aria-label="clear search" style={{ width: 30, minWidth: 30, height: 30, border: 0, background: 'transparent', display: 'grid', placeItems: 'center', padding: 0 }}>
          <span style={{ width: 20, height: 20, borderRadius: 999, background: 'var(--grey400)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 14, lineHeight: '20px', fontWeight: 800 }}>x</span>
        </button>
      )}
      <button aria-label="submit search" disabled={disabled} style={{ width: 34, minWidth: 34, height: 34, border: 0, background: 'transparent', borderRadius: 11, display: 'grid', placeItems: 'center', color: error ? 'var(--red500)' : 'var(--blue500)', padding: 0 }}>
        <Icon name="search" size={19}/>
      </button>
    </div>
  </div>
);

const SMRevisionHomeSearchMobileSM5Final = ({ query = '동네', noInput = false }) => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <SMRevisionSearchBarFinal value={query}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px 22px' }}>
      <div className="tm-text-label">최근 검색</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {['동네', '강남', '오늘 대기', '마감임박'].map((label, index) => <button key={label} className={`tm-chip ${index === 0 ? 'tm-chip-active' : ''}`}>{label}</button>)}
      </div>
      <div className="tm-text-label" style={{ marginTop: 20 }}>빠른 조건</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
        {[
          ['오늘 참여 가능', '오늘 매치만 기준'],
          ['마감임박', '24시간 이내'],
          ['초보 환영', '레벨 필터 적용'],
          ['팀 매치 포함', '팀매치 결과 함께 보기'],
        ].map(([title, sub], index) => (
          <Card key={title} pad={14} interactive style={{ background: index === 0 ? 'var(--blue50)' : 'var(--bg)' }}>
            <div className="tm-text-label" style={{ color: index === 0 ? 'var(--blue500)' : 'var(--text-strong)' }}>{title}</div>
            <div className="tm-text-micro" style={{ marginTop: 4, color: 'var(--text-caption)' }}>{sub}</div>
          </Card>
        ))}
      </div>
      {noInput ? (
        <Card pad={18} style={{ marginTop: 20, background: 'var(--grey50)' }}>
          <Badge tone="grey" size="sm">입력 전</Badge>
          <div className="tm-text-subhead" style={{ marginTop: 10 }}>검색어를 입력하거나 조건을 선택해 주세요</div>
          <div className="tm-text-caption" style={{ marginTop: 7, lineHeight: 1.55 }}>검색 진입 직후에는 결과 리스트를 비우고 최근 검색과 빠른 조건을 먼저 보여준다.</div>
        </Card>
      ) : (
        <>
          <div style={{ height: 1, background: 'var(--grey100)', margin: '20px 0 18px' }}/>
          <div>
            <div className="tm-text-label">검색 결과</div>
            <div className="tm-text-caption" style={{ marginTop: 2 }}><span className="tab-num">23</span>개 결과 · 매치/팀매치/팀 통합 조회</div>
          </div>
          <div style={{ marginTop: 12 }}><SMRevisionHomeSearchResultsV2 variant="grouped"/></div>
          <Card pad={14} style={{ marginTop: 14, background: 'var(--grey50)' }}>
            <div className="tm-text-label">00 최종본 적용 기준</div>
            <div className="tm-text-caption" style={{ marginTop: 6 }}>좌측 back, 값 있을 때만 회색 원형 X, 우측 blue ghost 검색 아이콘을 사용한다. 검색 결과 전체보기 CTA는 제거한다.</div>
          </Card>
        </>
      )}
    </div>
  </div>
);

const SMRevisionHomeSearchStateMobileSM5Final = ({ state = 'empty' }) => {
  const isError = state === 'error';
  const isStale = state === 'stale';
  return (
    <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <StatusBar/>
      <SMRevisionSearchBarFinal value="동네 강남" error={isError}/>
      <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px 24px' }}>
        <div>
          <div className="tm-text-label">검색 결과</div>
          <div className="tm-text-caption" style={{ marginTop: 2 }}>동네 강남 · 매치/팀매치/팀 통합 조회</div>
        </div>
        <div style={{ marginTop: 42, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ width: 48, height: 48, borderRadius: 16, background: 'var(--grey50)', display: 'grid', placeItems: 'center', margin: '0 auto 14px', color: 'var(--grey500)' }}>
            <Icon name={isStale ? 'clock' : 'search'} size={22}/>
          </div>
          <div className="tm-text-body-lg">{isStale ? '최신 검색 결과를 확인 중입니다.' : '검색 결과가 없습니다.'}</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>{isError ? '입력창 상태는 유지하고 하단 안내만 보여줍니다.' : '검색어를 수정하거나 다른 조건을 선택해 주세요.'}</div>
        </div>
      </div>
      {isError && (
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 22, minHeight: 48, borderRadius: 14, background: 'rgba(25,31,40,.94)', color: 'var(--static-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 14px', fontSize: 13, fontWeight: 700 }}>
          새로고침이 필요합니다. 잠시 후 다시 검색해 주세요.
        </div>
      )}
    </div>
  );
};

const SMRevisionHomeSearchRulesSM5Final = () => (
  <SMRevisionPlusBoard eyebrow="02 HOME SM5 · SEARCH CONTRACT" title="00 최종본 검색 진입 적용" sub="검색 결과 없음은 결과 영역 안에서 문구만 보여주고, 새로고침 필요 상황은 빨간 입력창 + 하단 toast로 처리한다. 위치 기반 예외는 제거한다." columns={3}>
    <SMRevisionPlusStateCard title="진입" body="좌측 back + 검색바 조합으로 전환한다. 검색바 내부 leading search icon은 두지 않는다." action="route"/>
    <SMRevisionPlusStateCard title="입력 전" body="placeholder는 '검색어를 입력해 주세요'. 결과 리스트는 비우고 최근 검색/빠른 조건만 보여준다." action="no input"/>
    <SMRevisionPlusStateCard title="입력 중" body="값이 생기면 blue border와 회색 원형 X를 노출한다." action="typing"/>
    <SMRevisionPlusStateCard title="지우기" body="X는 query만 지우고 빠른 조건은 유지한다. 빈 상태에서는 X를 노출하지 않는다." action="clear"/>
    <SMRevisionPlusStateCard title="검색 실행" body="우측 blue ghost 검색 아이콘 또는 Enter로 실행한다. 채움형 파란 버튼은 사용하지 않는다." action="submit"/>
    <SMRevisionPlusStateCard title="결과 없음" body="검색 결과 헤더를 유지하고 그 아래에 '검색 결과가 없습니다.' 문구만 보여준다. 조건 초기화 CTA는 두지 않는다." action="empty text"/>
    <SMRevisionPlusStateCard title="새로고침 필요" body="입력창 red border는 유지하고 하단 toast로만 안내한다. 별도 오류 카드나 CTA는 두지 않는다." action="toast"/>
    <SMRevisionPlusStateCard title="위치 기반 제거" body="내 주변/위치 권한 보드와 버튼 예외는 SM5 검색 결과에서 제거한다." action="removed"/>
  </SMRevisionPlusBoard>
);

const SMRevisionHomeSM5SearchActionMatrixFinal = () => (
  <SMRevisionPlusBoard eyebrow="02 HOME SM5 · SEARCH ACTIONS" title="00 최종 검색바 기준 버튼/예외" sub="텍스트 취소와 전체보기 CTA를 제거하고, back/X/search/chip/card/row 중심으로 동작을 정리한다." columns={4}>
    <SMRevisionPlusCard index={1} title="뒤로가기" trigger="좌측 back tap" feedback="ghost press" next="홈 main 복귀" state="nav"/>
    <SMRevisionPlusCard index={2} title="검색 입력" trigger="input focus/type" feedback="blue border, cursor" next="X 노출 + 검색 실행 대기" state="input"/>
    <SMRevisionPlusCard index={3} title="X 지우기" trigger="회색 원형 X tap" feedback="query만 제거" next="미입력 페이지" state="clear"/>
    <SMRevisionPlusCard index={4} title="검색 실행" trigger="우측 ghost search tap" feedback="pending skeleton" next="결과/empty/error/permission" state="submit"/>
    <SMRevisionPlusCard index={5} title="빈 query" trigger="빈 상태 search/Enter" feedback="submit 차단" next="미입력 페이지 유지" state="guard" tone="orange"/>
    <SMRevisionPlusCard index={6} title="최근 검색" trigger="recent chip tap" feedback="chip active" next="query 대체 + 결과 갱신" state="chip"/>
    <SMRevisionPlusCard index={7} title="빠른 조건" trigger="condition card tap" feedback="selected surface" next="조건 적용 + 결과 갱신" state="filter"/>
    <SMRevisionPlusCard index={8} title="그룹 더보기" trigger="매치/팀매치/팀 더보기 tap" feedback="group context 보존" next="해당 타입 list" state="route"/>
    <SMRevisionPlusCard index={9} title="결과 row" trigger="row tap" feedback="row press" next="타입별 상세/목록" state="detail"/>
    <SMRevisionPlusCard index={10} title="결과 없음" trigger="0 results" feedback="결과 헤더 + 문구만 표시" next="사용자 입력 수정 대기" state="empty"/>
    <SMRevisionPlusCard index={11} title="새로고침 필요" trigger="network refresh required" feedback="red input + bottom toast" next="query 유지" state="toast" tone="red"/>
    <SMRevisionPlusCard index={12} title="전체보기 제거" trigger="검색 결과 전체보기" feedback="not rendered" next="그룹 더보기 또는 row 사용" state="removed"/>
  </SMRevisionPlusBoard>
);

const SMRevisionAuthSM5SetupHeader = ({ step, title, sub }) => (
  <>
    <StatusBar/>
    <div style={{ padding: '8px 20px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
      <button className="tm-icon-btn"><Icon name="chevL" size={20}/></button>
      <div style={{ flex: 1, height: 4, borderRadius: 999, background: 'var(--grey100)', overflow: 'hidden' }}>
        <div style={{ width: `${(step / 3) * 100}%`, height: '100%', background: 'var(--blue500)' }}/>
      </div>
      <div className="tm-text-caption" style={{ width: 34, textAlign: 'right' }}>{step}/3</div>
    </div>
    <div style={{ padding: '28px 24px 0' }}>
      <div className="tm-text-heading">{title}</div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>{sub}</div>
    </div>
  </>
);

const SMRevisionAuthSM5TermsBeforeSignup = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <TopNav title="약관 동의" onBack={() => {}}/>
    <div style={{ flex: 1, padding: '24px 20px 112px', overflow: 'auto' }}>
      <Badge tone="blue" size="sm">회원가입 전 필수</Badge>
      <div className="tm-text-heading" style={{ marginTop: 12 }}>가입 전에 약관을 먼저 확인합니다</div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>필수 약관을 모두 동의해야 회원가입 입력 화면으로 이동할 수 있습니다.</div>
      <Card pad={16} style={{ marginTop: 22, background: 'var(--blue50)', borderColor: 'rgba(49,130,246,.18)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 26, height: 26, borderRadius: 13, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center' }}><Icon name="check" size={15}/></span>
          <span className="tm-text-body-lg">필수 약관 전체 동의</span>
        </label>
      </Card>
      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {[
          ['서비스 이용약관', '필수 · 보기'],
          ['개인정보 처리방침', '필수 · 보기'],
          ['위치 기반 서비스', '선택 · 나중에 설정 가능'],
          ['마케팅 알림', '선택 · 설정에서 변경 가능'],
        ].map(([title, meta], index) => (
          <Card key={title} pad={15} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 24, height: 24, borderRadius: 12, border: index < 2 ? 'none' : '1px solid var(--grey200)', background: index < 2 ? 'var(--blue500)' : 'var(--bg)', color: index < 2 ? 'var(--static-white)' : 'var(--grey400)', display: 'grid', placeItems: 'center' }}>
              <Icon name="check" size={14}/>
            </span>
            <div style={{ flex: 1 }}>
              <div className="tm-text-body-lg">{title}</div>
              <div className="tm-text-caption" style={{ marginTop: 2 }}>{meta}</div>
            </div>
            <Icon name="chevR" size={16} color="var(--grey400)"/>
          </Card>
        ))}
      </div>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">동의하고 회원가입하기</button>
    </div>
  </div>
);

const SMRevisionAuthSM5SignupCompleteGuide = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <div style={{ flex: 1, padding: '72px 24px 132px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ width: 72, height: 72, borderRadius: 24, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', marginBottom: 24 }}>
        <Icon name="check" size={30}/>
      </div>
      <div className="tm-text-heading">회원가입이 완료됐어요</div>
      <div className="tm-text-body" style={{ marginTop: 10, color: 'var(--text-muted)' }}>이제 운동 설정을 하면 더 정확한 매치 추천을 받을 수 있습니다.</div>
      <div style={{ display: 'grid', gap: 10, marginTop: 26 }}>
        {[
          ['약관 동의 완료', '필수 약관 동의가 저장되었습니다.'],
          ['회원가입 완료', '계정 생성이 완료되었습니다. 뒤로가도 계정은 유지됩니다.'],
        ].map(([title, body]) => (
          <Card key={title} pad={15} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 14, background: 'var(--blue50)', color: 'var(--blue500)', display: 'grid', placeItems: 'center' }}><Icon name="check" size={15}/></div>
            <div>
              <div className="tm-text-body-lg">{title}</div>
              <div className="tm-text-caption" style={{ marginTop: 2 }}>{body}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">운동 설정 시작하기</button>
      <button className="tm-btn tm-btn-md tm-btn-ghost tm-btn-block" style={{ marginTop: 8 }}>나중에 설정하기</button>
    </div>
  </div>
);

const SMRevisionAuthSM5SportStep = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <SMRevisionAuthSM5SetupHeader step={1} title="관심 종목을 선택해 주세요" sub="선택한 종목을 기준으로 다음 실력 입력 단계가 구성됩니다."/>
    <div style={{ flex: 1, padding: '22px 20px 112px', overflow: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {['축구', '풋살', '수영', '수영', '러닝', '수영'].map((label, index) => (
          <Card key={label} pad={16} style={{ minHeight: 88, borderColor: index < 4 ? 'rgba(49,130,246,.32)' : 'var(--grey100)', background: index < 4 ? 'var(--blue50)' : 'var(--bg)' }}>
            <div className="tm-text-body-lg" style={{ color: index < 4 ? 'var(--blue500)' : 'var(--text-strong)' }}>{label}</div>
            <div className="tm-text-caption" style={{ marginTop: 6 }}>{index < 4 ? '선택됨' : '선택 가능'}</div>
          </Card>
        ))}
      </div>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">실력 입력하기</button>
    </div>
  </div>
);

const SMRevisionAuthSM5LevelStep = ({ disabled = false }) => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <SMRevisionAuthSM5SetupHeader step={2} title="종목별 실력을 입력해 주세요" sub="무리 없는 매칭을 위해 종목마다 현재 실력을 선택합니다."/>
    <div style={{ flex: 1, padding: '22px 20px 112px', overflow: 'auto' }}>
      {['축구', '풋살', '수영', '수영'].map((label, index) => (
        <Card key={label} pad={16} style={{ marginBottom: 10, opacity: disabled && index > 0 ? .48 : 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <div className="tm-text-body-lg">{label}</div>
              <div className="tm-text-caption" style={{ marginTop: 3 }}>{disabled && index > 0 ? '입력 필요' : `${['B', 'C', 'D', 'B'][index]} 레벨 선택됨`}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>{['A', 'B', 'C', 'D'].map((level) => <span key={level} className={`tm-chip ${level === ['B', 'C', 'D', 'B'][index] && !(disabled && index > 0) ? 'tm-chip-active' : ''}`}>{level}</span>)}</div>
          </div>
        </Card>
      ))}
      {disabled && <Card pad={14} style={{ background: 'rgba(254,152,0,.10)' }}><div className="tm-text-label" style={{ color: 'var(--orange500)' }}>모든 선택 종목의 실력을 입력해야 다음으로 이동할 수 있습니다.</div></Card>}
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <button className={`tm-btn tm-btn-lg ${disabled ? 'tm-btn-neutral' : 'tm-btn-primary'} tm-btn-block`} disabled={disabled}>지역 선택하기</button>
    </div>
  </div>
);

const SMRevisionAuthSM5RegionStep = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <SMRevisionAuthSM5SetupHeader step={3} title="주 활동 지역을 선택해 주세요" sub="현재 위치는 선택 사항이며, 거부해도 수동 지역 선택으로 계속할 수 있습니다."/>
    <div style={{ flex: 1, padding: '22px 20px 112px', overflow: 'auto' }}>
      <button className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"><Icon name="mapPin" size={17}/> 현재 위치로 찾기</button>
      <div className="tm-text-label" style={{ marginTop: 22 }}>선택 지역</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {['마포구', '강남구', '성동구', '송파구', '서초구', '용산구'].map((label, index) => <span key={label} className={`tm-chip ${index < 2 ? 'tm-chip-active' : ''}`}>{label}</span>)}
      </div>
      <Card pad={14} style={{ marginTop: 20, background: 'var(--grey50)' }}>
        <div className="tm-text-label">위치 권한 예외</div>
        <div className="tm-text-caption" style={{ marginTop: 5 }}>권한 거부 시 선택한 종목과 실력은 유지하고 수동 지역 선택으로 복구합니다.</div>
      </Card>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">선택 확인하기</button>
    </div>
  </div>
);

const SMRevisionAuthSM6GapAudit = () => (
  <SMRevisionPlusBoard eyebrow="01 AUTH SM6 · GAP" title="SM5 최신본 갭 점검" sub="원본 비교 보드는 최종본에서 제외하고, 실제 필요한 예외 화면과 계약만 남긴다." columns={3}>
    {[
      ['회원가입 전 약관', '가입 입력 전 필수 동의 gate 필요', 'SM5 반영'],
      ['가입 완료 안내', '운동 설정 전 가입 완료 상태를 확인', 'SM5 반영'],
      ['소셜 권한 거부', 'provider 취소/거부 복구 화면 필요', 'SM6 추가'],
      ['소셜 이메일 누락', '직접 이메일 인증 fallback 필요', 'SM6 추가'],
      ['차단 계정', '홈/계속하기 차단과 고객센터 경로 필요', 'SM6 추가'],
      ['계정 충돌', '기존 계정 확인/병합 전환 필요', 'SM6 추가'],
    ].map(([title, body, action]) => <SMRevisionPlusStateCard key={title} title={title} body={body} action={action} tone={action.includes('SM6') ? 'orange' : 'blue'}/>)}
  </SMRevisionPlusBoard>
);

const SMRevisionAuthSM6SimpleException = ({ badge, title, body, primary, secondary, tone = 'orange' }) => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <TopNav title="로그인 확인" onBack={() => {}}/>
    <div style={{ flex: 1, padding: '72px 24px 132px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <Badge tone={tone} size="sm">{badge}</Badge>
      <div className="tm-text-heading" style={{ marginTop: 16 }}>{title}</div>
      <div className="tm-text-body" style={{ marginTop: 10, color: 'var(--text-muted)', lineHeight: 1.55 }}>{body}</div>
      <Card pad={16} style={{ marginTop: 22, background: tone === 'red' ? 'rgba(240,68,82,.08)' : 'rgba(254,152,0,.10)' }}>
        <div className="tm-text-label">처리 기준</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>입력값과 온보딩 임시 선택값은 보존하고, 계정 상태를 성공처럼 처리하지 않습니다.</div>
      </Card>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <button className={`tm-btn tm-btn-lg ${tone === 'red' ? 'tm-btn-danger' : 'tm-btn-primary'} tm-btn-block`}>{primary}</button>
      {secondary && <button className="tm-btn tm-btn-md tm-btn-ghost tm-btn-block" style={{ marginTop: 8 }}>{secondary}</button>}
    </div>
  </div>
);

const SMRevisionAuthSM6ProviderDenied = () => <SMRevisionAuthSM6SimpleException badge="소셜 권한 거부" title="로그인을 완료하지 못했어요" body="필수 정보 제공 동의가 취소되었습니다. 계정은 생성되지 않았고, 같은 제공자 또는 다른 로그인 방법으로 다시 시도할 수 있습니다." primary="다시 로그인하기" secondary="다른 방법 선택"/>;
const SMRevisionAuthSM6MissingEmail = () => <SMRevisionAuthSM6SimpleException badge="이메일 누락" title="확인 가능한 이메일이 필요해요" body="소셜 계정에서 검증된 이메일을 받을 수 없습니다. 이메일을 직접 입력하고 인증한 뒤 같은 온보딩 흐름을 이어갑니다." primary="이메일 직접 인증" secondary="소셜 계정 바꾸기"/>;
const SMRevisionAuthSM6BlockedAccount = () => <SMRevisionAuthSM6SimpleException badge="계정 제한" title="현재 계정은 이용할 수 없어요" body="정지, 탈퇴 대기, 운영 제한 상태에서는 계속하기와 홈 이동을 모두 막고 고객센터 요청 경로만 제공합니다." primary="고객센터 문의" secondary="로그인으로 돌아가기" tone="red"/>;
const SMRevisionAuthSM6AccountResolve = () => <SMRevisionAuthSM6SimpleException badge="계정 충돌" title="이미 가입된 정보가 있어요" body="같은 이메일 또는 휴대폰이 다른 인증 수단과 연결되어 있습니다. 기존 계정을 확인한 뒤 연결 또는 병합을 진행합니다." primary="기존 계정 확인" secondary="다른 방법 선택"/>;
const SMRevisionAuthSM6LocationPermission = () => <SMRevisionAuthSM6SimpleException badge="위치 권한" title="현재 위치를 사용할 수 없어요" body="위치 권한을 거부해도 종목과 실력 입력값은 유지됩니다. 수동 지역 선택으로 온보딩을 마칠 수 있습니다." primary="수동으로 지역 선택" secondary="설정에서 권한 열기"/>;

const SMRevisionAuthSM6ButtonExceptionMatrix = () => (
  <SMRevisionPlusBoard eyebrow="01 AUTH SM6 · BUTTONS" title="모든 버튼 동작과 예외 경로" sub="각 버튼은 trigger, feedback, next, exception을 가진다. 실패를 toast만으로 끝내지 않는다." columns={4}>
    {[
      ['소셜 로그인', 'provider tap', 'callback loading', '성공/거부/이메일 누락/충돌/차단'],
      ['이메일 로그인', 'submit', 'field validation', '실패 시 입력값 유지 + 재시도'],
      ['약관 동의', 'checkbox tap', 'CTA 활성화', '필수 미동의 시 회원가입 차단'],
      ['회원가입', 'form submit', '중복 submit lock', '성공 시 완료 안내, 실패 시 inline'],
      ['운동 설정 시작', 'complete CTA', 'step 1/3 이동', '나중에 설정은 홈 제한 추천'],
      ['종목 선택', 'card tap', 'selected outline', '0개면 CTA disabled'],
      ['실력 입력', 'level chip tap', 'row selected', '누락 종목 reason row'],
      ['현재 위치', 'permission tap', 'loading lock', '거부 시 수동 지역 선택'],
      ['선택 확인 수정', 'edit tap', '해당 step 복귀', '선택값 보존'],
      ['홈으로 시작', 'final CTA', 'home push', 'reduced motion fade'],
      ['다시 시도', 'error CTA', 'same context retry', '반복 실패 시 도움말'],
      ['뒤로가기', 'back tap', '이전 화면', 'pending 중 확인 sheet'],
    ].map(([title, trigger, feedback, next], index) => <SMRevisionPlusCard key={title} index={index + 1} title={title} trigger={trigger} feedback={feedback} next={next} state={index > 8 ? 'recover' : 'auth'} tone={index > 8 ? 'orange' : 'blue'}/>)}
  </SMRevisionPlusBoard>
);

const SMRevisionAuthSM6AccessibilityMatrix = () => (
  <SMRevisionPlusBoard eyebrow="01 AUTH SM6 · STATES" title="포커스/로딩/비활성 상태 계약" columns={4}>
    <SMRevisionPlusStateCard title="focus" body="입력 필드와 선택 chip은 blue border, cursor, helper text를 함께 보여준다." action="visible focus" tone="blue"/>
    <SMRevisionPlusStateCard title="loading" body="provider callback, 위치 확인, 가입 제출 중에는 CTA 중복 탭을 잠근다." action="submit lock" tone="orange"/>
    <SMRevisionPlusStateCard title="disabled" body="필수 약관, 종목 0개, 실력 누락, 지역 누락은 버튼 위 reason row와 함께 비활성화한다." action="reason" tone="orange"/>
    <SMRevisionPlusStateCard title="error" body="입력값과 선택값을 보존하고, 오류 위치와 재시도 CTA를 같은 화면에 둔다." action="retry" tone="red"/>
    <SMRevisionPlusStateCard title="reduced motion" body="화면 전환은 push 대신 fade만 사용하고 완료/오류 피드백은 텍스트로도 제공한다." action="motion" tone="blue"/>
    <SMRevisionPlusStateCard title="screen reader" body="checkbox, step, 선택 개수, CTA 상태는 라벨로 읽을 수 있어야 한다." action="a11y" tone="blue"/>
    <SMRevisionPlusStateCard title="resume" body="앱 종료 후 복귀 시 완료된 단계는 체크, 진행 단계는 이어하기로 표시한다." action="restore" tone="green"/>
    <SMRevisionPlusStateCard title="blocked" body="차단/정지 계정은 계속하기와 홈 이동을 모두 막고 문의 경로만 제공한다." action="hard stop" tone="red"/>
  </SMRevisionPlusBoard>
);

const SMRevisionAuthFinalChecklist = () => (
  <SMRevisionPlusBoard eyebrow="01 AUTH SM 최종본 · 체크리스트" title="SM5 + SM6 통합 완료 기준" sub="원본 비교 보드는 제외하고 최종 화면, 동작, 상황, 예외, 접근성, 흐름만 남긴다." columns={3}>
    {[
      ['약관 선행', '회원가입 입력 전에 필수 약관 동의를 먼저 받는다.', 'done'],
      ['가입 완료 안내', '운동 설정 전 약관/회원가입 완료 체크 화면을 둔다.', 'done'],
      ['3단계 운동 설정', '종목, 실력, 지역만 1/3~3/3 스텝바로 표시한다.', 'done'],
      ['최종 환영 체크', '약관, 회원가입, 종목, 실력, 지역을 모두 체크한다.', 'done'],
      ['소셜 예외', '권한 거부, 이메일 누락, 차단, 충돌을 화면으로 처리한다.', 'done'],
      ['버튼 예외', '모든 CTA의 trigger, feedback, next, exception을 정리한다.', 'done'],
      ['상황 처리', 'loading, disabled, error, resume, blocked를 정의한다.', 'done'],
      ['비교 제외', 'SM5/SM6의 원본 비교 복사본은 최종본에 포함하지 않는다.', 'done'],
      ['다음 단계', 'mobile 확정 후 grid와 desktop으로 확장한다.', 'next'],
    ].map(([title, body, action]) => <SMRevisionPlusStateCard key={title} title={title} body={body} action={action} tone={action === 'next' ? 'orange' : 'green'}/>)}
  </SMRevisionPlusBoard>
);

const SMRevisionAuthFinalStateMatrix = () => (
  <SMRevisionPlusBoard eyebrow="01 AUTH SM 최종본 · 상황/예외" title="상황 처리와 복구 기준" columns={4}>
    {[
      ['회원가입 입력 오류', '필드별 inline 오류와 입력값 보존', 'fix field', 'red'],
      ['가입 완료', '약관/회원가입 체크 후 운동 설정 시작', 'next setup', 'green'],
      ['종목 미선택', '종목 0개면 실력 단계 이동 차단', 'select sport', 'orange'],
      ['실력 누락', '누락 종목 row 표시, 입력값 유지', 'complete level', 'orange'],
      ['위치 거부', '수동 지역 선택으로 복구', 'manual region', 'orange'],
      ['소셜 거부', '계정 생성 없음, 재시도/다른 방법', 'retry auth', 'red'],
      ['이메일 누락', '직접 이메일 인증 fallback', 'verify email', 'orange'],
      ['계정 충돌', '기존 계정 확인 후 병합/연결', 'resolve', 'orange'],
      ['차단 계정', '계속하기/홈 이동 차단, 문의만 제공', 'support', 'red'],
      ['중단 복귀', '완료 단계 체크, 진행 단계 이어하기', 'resume', 'blue'],
      ['완료', '홈 추천과 매치 필터 시작', 'home', 'green'],
    ].map(([title, body, action, tone]) => <SMRevisionPlusStateCard key={title} title={title} body={body} action={action} tone={tone}/>)}
  </SMRevisionPlusBoard>
);

const SMRevisionAuthFinalFlow = () => (
  <SMRevisionPlusBoard eyebrow="01 AUTH SM 최종본 · 흐름" title="최종 화면 전환 흐름" columns={4}>
    {[
      ['로그인 진입', '소셜, 이메일, 회원가입, 둘러보기 선택', 'auth entry'],
      ['소셜 처리', '콜백 로딩 후 성공/거부/이메일 누락/충돌/차단 분기', 'SM6 exceptions'],
      ['회원가입 전 약관', '필수 약관 동의 후 회원가입 입력 가능', 'terms gate'],
      ['회원가입 입력', '닉네임, 이메일, 비밀번호 입력과 오류 복구', 'signup form'],
      ['회원가입 완료 안내', '약관 동의 완료와 회원가입 완료 체크', 'complete guide'],
      ['운동 설정 1/3', '관심 종목 선택', 'sport'],
      ['운동 설정 2/3', '선택 종목별 실력 입력', 'level'],
      ['운동 설정 3/3', '활동 지역 선택과 위치 권한 fallback', 'region'],
      ['선택 확인/수정', '종목, 실력, 지역 요약과 단계별 수정', 'confirm'],
      ['최종 환영', '약관, 회원가입, 종목, 실력, 지역 전체 체크', 'welcome'],
      ['홈 시작', '선택 기준으로 추천과 필터 시작', 'home'],
      ['나중에 설정', '제한 추천 홈으로 진입하고 신청 전 누락 설정 재요청', 'deferred'],
    ].map(([title, body, action], index) => <SMRevisionPlusStateCard key={title} title={`${index + 1}. ${title}`} body={body} action={action} tone={index >= 9 ? 'green' : 'blue'}/>)}
  </SMRevisionPlusBoard>
);

const SMRevisionAuthFinalWelcome = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <div style={{ flex: 1, padding: '42px 24px 112px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ width: 72, height: 72, borderRadius: 24, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', marginBottom: 24 }}>
        <Icon name="check" size={30}/>
      </div>
      <div className="tm-text-heading">준비가 끝났어요</div>
      <div className="tm-text-body" style={{ marginTop: 10, color: 'var(--text-muted)' }}>약관, 회원가입, 운동 설정까지 모두 완료되었습니다.</div>
      <div style={{ display: 'grid', gap: 10, marginTop: 24 }}>
        {[
          ['약관 동의 완료', '서비스 이용약관과 개인정보 처리방침 동의가 완료되었습니다.'],
          ['회원가입 완료', '계정 생성이 완료되었습니다.'],
          ['관심 종목 완료', '축구 · 풋살 · 수영 · 수영'],
          ['실력 입력 완료', '축구 B · 풋살 C · 수영 D · 수영 B'],
          ['활동 지역 완료', '마포구 · 강남구 · 위치 권한 선택'],
        ].map(([title, body]) => (
          <Card key={title} pad={14} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 28, height: 28, borderRadius: 14, background: 'var(--blue50)', color: 'var(--blue500)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon name="check" size={15}/>
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="tm-text-body-lg">{title}</div>
              <div className="tm-text-caption" style={{ marginTop: 2 }}>{body}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">홈으로 시작하기</button>
    </div>
  </div>
);

const SM9_CHAT_ROOMS = [
  { title: '주말 풋살 매치', type: '개인매치', category: '개인매치', last: '오늘 14:00 경기 인원 확인 부탁드려요.', time: '방금', unread: 2, pinned: true, avatar: 'assets/mock/profile/profile-01.svg' },
  { title: '성수 러너스 FC', type: '팀', category: '팀', last: '이번 주 훈련 장소가 변경됐어요.', time: '9분', unread: 0, pinned: true, avatar: 'assets/mock/profile/profile-02.svg' },
  { title: '마포 수영 친선전', type: '팀매치', category: '팀매치', last: '라인업 확인 후 확정 부탁드립니다.', time: '23분', unread: 4, pinned: false, avatar: 'assets/mock/profile/profile-03.svg' },
  { title: '강남 수영 싱글 매치', type: '개인매치', category: '개인매치', last: '코트 예약 링크 공유드렸습니다.', time: '1시간', unread: 0, pinned: false, avatar: 'assets/mock/profile/profile-04.svg' },
  { title: '수영 입문 팀', type: '팀', category: '팀', last: '장비 대여 가능 인원을 확인 중입니다.', time: '어제', unread: 1, pinned: false, avatar: 'assets/mock/profile/profile-05.svg' },
];

const SM9_CHAT_CATEGORIES = [
  { label: '전체', count: SM9_CHAT_ROOMS.length },
  { label: '개인매치', count: SM9_CHAT_ROOMS.filter((room) => room.category === '개인매치').length },
  { label: '팀매치', count: SM9_CHAT_ROOMS.filter((room) => room.category === '팀매치').length },
  { label: '팀', count: SM9_CHAT_ROOMS.filter((room) => room.category === '팀').length },
];

const SMRevisionChatFullRowSM9 = ({ room, swiped = false }) => (
  <div style={{ position: 'relative', minHeight: 74, overflow: 'hidden', background: 'var(--bg)' }}>
    {swiped && (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'flex-end', background: 'var(--grey50)' }}>
        <button className="tm-btn tm-btn-neutral" style={{ width: 74, height: '100%', borderRadius: 0, display: 'grid', placeItems: 'center', gap: 3 }}>
          <Icon name="pin" size={18}/>
          <span className="tm-text-micro">고정</span>
        </button>
        <button className="tm-btn tm-btn-danger" style={{ width: 74, height: '100%', borderRadius: 0, display: 'grid', placeItems: 'center', gap: 3 }}>
          <Icon name="close" size={18}/>
          <span className="tm-text-micro" style={{ color: 'var(--static-white)' }}>나가기</span>
        </button>
      </div>
    )}
    <div className="tm-list-row" style={{ position: 'relative', transform: swiped ? 'translateX(-148px)' : 'none', transition: 'transform .18s ease', minHeight: 74, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--grey100)', background: room.unread ? 'var(--blue50)' : 'var(--bg)' }}>
      <div style={{ width: 46, height: 46, borderRadius: 16, background: `url(${room.avatar}) center/cover, var(--grey100)`, flexShrink: 0 }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <div className="tm-text-body-lg" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.title}</div>
          {room.pinned && <Badge tone="blue" size="sm">고정</Badge>}
        </div>
        <div className="tm-text-caption" style={{ marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.type} · {room.last}</div>
      </div>
      <div style={{ minWidth: 34, textAlign: 'right', flexShrink: 0 }}>
        <div className="tm-text-micro">{room.time}</div>
        {room.unread > 0 && <div style={{ marginTop: 6, minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, background: 'var(--blue500)', color: 'var(--static-white)', display: 'inline-grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{room.unread}</div>}
      </div>
    </div>
  </div>
);

const SMRevisionChatListMobileSM9 = ({ leaveConfirm = false }) => {
  const pinnedRooms = SM9_CHAT_ROOMS.filter((room) => room.pinned);
  const normalRooms = SM9_CHAT_ROOMS.filter((room) => !room.pinned);
  return (
    <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <StatusBar/>
      <div style={{ height: 56, padding: '8px 10px 8px 8px', display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid var(--grey100)', flexShrink: 0 }}>
        <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="뒤로가기"><Icon name="chevL" size={22}/></button>
        <div className="tm-text-body-lg">채팅</div>
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '14px 20px 10px', flexShrink: 0 }}>
        {SM9_CHAT_CATEGORIES.map((category, index) => (
          <HapticChip key={category.label} active={index === 0}>{category.label} {category.count}</HapticChip>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div className="tm-text-label" style={{ padding: '8px 20px 6px', color: 'var(--text-muted)' }}>고정 {pinnedRooms.length}</div>
        {pinnedRooms.map((room, index) => <SMRevisionChatFullRowSM9 key={room.title} room={room} swiped={index === 0}/>)}
        <div className="tm-text-label" style={{ padding: '18px 20px 6px', color: 'var(--text-muted)' }}>채팅방 {normalRooms.length}</div>
        {normalRooms.map((room, index) => <SMRevisionChatFullRowSM9 key={room.title} room={room} swiped={index === 0}/>)}
      </div>
      {leaveConfirm && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.28)', display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', padding: '18px 20px 24px', background: 'var(--bg)', borderRadius: '20px 20px 0 0', boxShadow: '0 -12px 32px rgba(15,23,42,.14)' }}>
            <div className="tm-text-body-lg">채팅방을 나갈까요?</div>
            <div className="tm-text-caption" style={{ marginTop: 6 }}>나가면 목록에서 사라지고, 새 메시지는 다시 초대되기 전까지 받을 수 없습니다.</div>
            <button className="tm-btn tm-btn-lg tm-btn-danger tm-btn-block" style={{ marginTop: 16 }}>나가기</button>
            <button className="tm-btn tm-btn-lg tm-btn-ghost tm-btn-block" style={{ marginTop: 8 }}>취소</button>
          </div>
        </div>
      )}
    </div>
  );
};

const SMRevisionCommunitySM9ActionMatrix = () => (
  <SMRevisionRuleBoard title="06 커뮤니티/채팅 · SM9 동작/예외" items={[
    { title: '홈 플로팅 진입', body: '홈의 채팅 floating button을 누르면 채팅 목록으로 진입한다. 채팅 화면은 뒤로가기와 채팅 타이틀만 가진다.' },
    { title: '하단바 제외', body: '채팅 목록과 채팅방 상세에는 bottom nav를 렌더하지 않는다. 입력 바가 있는 상세 화면과 충돌하지 않게 한다.' },
    { title: '카테고리 count', body: '전체, 개인매치, 팀매치, 팀 chip에는 현재 목록 기준 채팅방 수를 함께 표시한다.' },
    { title: '한 줄 전체 폭 row', body: '각 채팅방은 카드가 아니라 화면 전체 폭의 list row를 차지하고, 구분은 얇은 divider로 처리한다.' },
    { title: '왼쪽 슬라이드', body: 'row를 왼쪽으로 밀면 고정과 나가기 두 액션만 노출한다. 고정된 방은 고정 해제로 같은 위치를 재사용한다.' },
    { title: '나가기 확인', body: '나가기는 즉시 삭제하지 않고 확인 sheet를 띄운다. 실패 시 목록 위치와 unread 상태를 유지한다.' },
  ]}/>
);

const SMRevisionCommunityMobileGridSM9 = () => (
  <SMRevisionRuleBoard title="06 커뮤니티/채팅 · SM9 mobile grid" items={[
    { title: '상단바', body: '뒤로가기 + 채팅 문구만 노출한다. 검색, 알림, 더보기, 하단바는 제외한다.' },
    { title: '카테고리', body: '전체 5, 개인매치 2, 팀매치 1, 팀 2처럼 06 원본 목록 기반 수량을 표시한다.' },
    { title: '섹션', body: '고정 2개와 일반 3개를 분리해 목록 스캔을 명확히 한다.' },
    { title: 'row interaction', body: 'tap은 채팅방 상세, swipe는 고정/나가기, unread badge tap은 별도 동작 없이 row 진입으로 통일한다.' },
    { title: 'empty/error', body: '카테고리 필터 결과가 없으면 빈 상태 CTA는 홈 추천 매치 보기로 보낸다. 네트워크 실패는 재시도 row를 같은 위치에 둔다.' },
    { title: 'desktop 확장 전제', body: 'mobile 확정 후 desktop에서는 좌측 채팅 목록 + 우측 상세 split view로 확장한다.' },
  ]}/>
);

const SMRevisionCommunityFinalHomeChatEntry = () => (
  <div style={{ width: 375, height: 812, position: 'relative', overflow: 'hidden', background: 'var(--bg)' }}>
    <SMRevisionHomeMobileV2/>
    <button className="tm-btn tm-btn-primary" aria-label="채팅 열기" style={{ position: 'absolute', right: 20, bottom: 92, width: 56, height: 56, borderRadius: 999, padding: 0, display: 'grid', placeItems: 'center', boxShadow: '0 12px 26px rgba(49,130,246,.28)' }}>
      <Icon name="chat" size={22}/>
    </button>
  </div>
);

const SM6_SORT_OPTIONS_RESTORED = ['추천순', '마감임박', '거리순', '가격낮은순'];

const SMRevisionMatchSM6TopControlsRestored = ({ mode = 'card', selected = '추천순', variant = 'A' }) => (
  <div style={{ padding: '18px 20px 0' }}>
    <div style={{ display: 'grid', gridTemplateColumns: variant === 'A' ? 'minmax(0, 1fr) 44px' : '44px minmax(0, 1fr) 44px', gap: 8, alignItems: 'center' }}>
      {variant === 'B' && <button className="tm-btn tm-btn-icon tm-btn-neutral" aria-label="필터 열기"><Icon name="filter" size={18}/></button>}
      <div style={{ minHeight: 48, borderRadius: 12, background: 'var(--grey100)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', minWidth: 0, color: 'var(--text-caption)' }}>
        <Icon name="search" size={18}/>
        <span className="tm-text-body" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>지역, 시간, 매치명 검색</span>
      </div>
      <button className="tm-btn tm-btn-icon tm-btn-primary" aria-label="검색 실행"><Icon name="search" size={19}/></button>
    </div>
    {variant === 'A' ? (
      <Card pad={10} style={{ marginTop: 12, background: 'var(--grey50)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[['카드형', 'ㅁ', mode === 'card'], ['콤팩트', 'ㅁ|ㅁ', mode !== 'card']].map(([label, icon, active]) => (
            <button key={label} className="tm-pressable" style={{ minHeight: 40, borderRadius: 10, background: active ? 'var(--blue500)' : 'var(--bg)', color: active ? 'var(--static-white)' : 'var(--text)', border: active ? '1px solid var(--blue500)' : '1px solid var(--grey100)', fontWeight: 700 }}>
              <span className="tm-text-label">{icon} {label}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 10, paddingBottom: 2 }}>
          {SM6_SORT_OPTIONS_RESTORED.map((label) => <button key={label} className={`tm-chip ${label === selected ? 'tm-chip-active' : ''}`}>{label}</button>)}
        </div>
      </Card>
    ) : (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12 }}>
        <button className="tm-btn tm-btn-md tm-btn-neutral" style={{ flex: 1, justifyContent: 'space-between', padding: '0 14px' }}><span>{selected}</span><span className="tm-text-caption">정렬</span></button>
        <button className="tm-btn tm-btn-md tm-btn-neutral" aria-label={mode === 'card' ? '콤팩트 보기로 전환' : '카드 보기로 전환'} style={{ width: 104 }}>{mode === 'card' ? 'ㅁ 카드' : 'ㅁ|ㅁ 콤팩트'}</button>
      </div>
    )}
  </div>
);

const SMRevisionMatchSM6SummaryRestored = ({ variant = 'A', showSports = true }) => (
  <div style={{ padding: variant === 'A' ? '14px 20px 0' : '12px 20px 0' }}>
    {showSports && (
      <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 8, overflowX: 'auto', paddingBottom: 12 }}>
        {SPORTS.slice(0, 7).map((sport, index) => <HapticChip key={sport.id} active={index === 0} count={index === 0 ? MATCHES.length : index + 2}>{sport.label}</HapticChip>)}
      </div>
    )}
    {variant === 'A' ? (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {SM3_MATCH_STATS.map(([label, value, sub]) => <Card key={label} pad={12} style={{ background: 'var(--bg)' }}><div className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>{label}</div><div className="tm-text-subhead tab-num" style={{ marginTop: 4 }}>{value}</div><div className="tm-text-micro" style={{ marginTop: 2, color: 'var(--text-caption)' }}>{sub}</div></Card>)}
      </div>
    ) : (
      <div style={{ minHeight: 44, borderRadius: 12, background: 'var(--grey50)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 12px' }}>
        <div className="tm-text-label">서울 전체 · 마감임박</div>
        <div className="tm-text-caption tab-num">42개 · 오늘 7 · 마감 4</div>
      </div>
    )}
  </div>
);

const SMRevisionMatchListMobileSM6A = ({ mode = 'card' }) => (
  <SMRevisionMatchSM4Shell>
    <SMRevisionMatchSM6TopControlsRestored mode={mode} selected="추천순" variant="A"/>
    <SMRevisionMatchSM6SummaryRestored variant="A"/>
    <div style={{ padding: '16px 20px 24px' }}>
      <div style={{ marginBottom: 10 }}><div className="tm-text-label">개인 매치</div><div className="tm-text-caption" style={{ marginTop: 2 }}>대안 A: 보기 선택과 정렬 chip을 같은 control panel 안에 묶어 현재 선택 상태를 명확히 보여줍니다.</div></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{MATCHES.slice(0, mode === 'card' ? 3 : 5).map((item, index) => mode === 'card' ? <SMRevisionMatchSM3CardItem key={item.id} item={item} index={index}/> : <SMRevisionMatchSM3CompactItem key={item.id} item={item}/>)}</div>
    </div>
  </SMRevisionMatchSM4Shell>
);

const SMRevisionMatchListMobileSM6B = ({ mode = 'compact' }) => (
  <SMRevisionMatchSM4Shell>
    <SMRevisionMatchSM6TopControlsRestored mode={mode} selected="마감임박" variant="B"/>
    <SMRevisionMatchSM6SummaryRestored variant="B"/>
    <div style={{ padding: '14px 20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}><div><div className="tm-text-label">개인 매치</div><div className="tm-text-caption" style={{ marginTop: 2 }}>대안 B: 필터 버튼, 정렬 dropdown, 보기 버튼을 도구막대처럼 분리합니다.</div></div><Badge tone="orange" size="sm">마감 우선</Badge></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{MATCHES.slice(0, mode === 'card' ? 3 : 5).map((item, index) => mode === 'card' ? <SMRevisionMatchSM3CardItem key={item.id} item={item} index={index}/> : <SMRevisionMatchSM3CompactItem key={item.id} item={item}/>)}</div>
    </div>
  </SMRevisionMatchSM4Shell>
);

const SMRevisionMatchSM6ListRuleMatrix = () => (
  <SMRevisionPlusBoard eyebrow="03 MATCH SM6 · LIST OPTIONS" title="전체 조회 리스트 선택/정렬 디자인 대안" columns={4}>
    {[
      ['대안 A 구조', '검색 아래 control panel 안에 카드/콤팩트 segmented 버튼과 정렬 chip을 같이 둔다.', '선택 상태 명확'],
      ['대안 B 구조', '필터 icon, 정렬 dropdown, 보기 버튼을 도구막대처럼 분리한다.', 'compact toolbar'],
      ['공통 유지', '검색, sport count selector, 요약 counter, 카드/콤팩트 목록, SM5 예외 flow는 그대로 유지한다.', 'preserve'],
      ['다음 결정', 'mobile에서 A/B 중 하나를 고른 뒤 m03 grid main/list/components/motion으로 확장한다.', 'decision'],
    ].map(([title, body, action], index) => <SMRevisionPlusStateCard key={title} title={`${index + 1}. ${title}`} body={body} action={action} tone={index === 3 ? 'orange' : 'blue'}/>)}
  </SMRevisionPlusBoard>
);

const SMRevisionMatchSM7TopSearchBarRestored = ({ query = '', filterCount = 1, error = false }) => (
  <div style={{ minHeight: 56, padding: '8px 10px 8px 20px', borderBottom: '1px solid var(--grey100)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', flexShrink: 0 }}>
    <div style={{ flex: 1, minHeight: 44, borderRadius: 14, background: error ? 'var(--red50)' : 'var(--grey100)', display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px 0 14px', minWidth: 0, border: error ? '1px solid var(--red500)' : query ? '1px solid var(--blue500)' : '1px solid transparent' }}>
      <div className="tm-text-body" style={{ flex: 1, color: query ? 'var(--text-strong)' : 'var(--text-placeholder)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{query || '검색어를 입력해 주세요'}</div>
      {query && <button aria-label="검색어 지우기" style={{ width: 30, minWidth: 30, height: 30, border: 0, background: 'transparent', display: 'grid', placeItems: 'center', padding: 0 }}><span style={{ width: 20, height: 20, borderRadius: 999, background: 'var(--grey400)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 14, lineHeight: '20px', fontWeight: 800 }}>x</span></button>}
      <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="검색 실행" style={{ width: 34, minWidth: 34, height: 34, borderRadius: 11, color: error ? 'var(--red500)' : 'var(--blue500)' }}><Icon name="search" size={19}/></button>
    </div>
    <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="검색 필터" style={{ width: 40, minWidth: 40, height: 40, padding: 0, position: 'relative' }}><Icon name="filter" size={21}/>{filterCount > 0 && <span className="tab-num" style={{ position: 'absolute', top: 4, right: 2, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999, background: 'var(--blue500)', color: 'var(--static-white)', border: '2px solid var(--bg)', fontSize: 9, fontWeight: 800, lineHeight: '12px', display: 'grid', placeItems: 'center' }}>{filterCount}</span>}</button>
  </div>
);

const SMRevisionMatchSM7ControlRowRestored = ({ mode = 'card', selected = '추천순' }) => (
  <div style={{ padding: '14px 20px 0' }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 108px', gap: 8, alignItems: 'center' }}>
      <button className="tm-btn tm-btn-md tm-btn-neutral" style={{ justifyContent: 'space-between', padding: '0 14px', minWidth: 0 }}><span className="tm-text-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected}</span><Icon name="chevD" size={16}/></button>
      <button className="tm-btn tm-btn-md tm-btn-neutral" aria-label={mode === 'card' ? '콤팩트 보기로 전환' : '카드 보기로 전환'} style={{ padding: '0 12px' }}><span className="tm-text-label">{mode === 'card' ? '카드형' : '콤팩트'}</span></button>
    </div>
    <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 8, overflowX: 'auto', padding: '12px 0 10px' }}>{SPORTS.slice(0, 7).map((sport, index) => <HapticChip key={sport.id} active={index === 0} count={index === 0 ? MATCHES.length : index + 2}>{sport.label}</HapticChip>)}</div>
  </div>
);

const SMRevisionMatchSM7SportSelector = () => (
  <div style={{ padding: '12px 20px 0' }}>
    <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 8, overflowX: 'auto', paddingBottom: 10 }}>
      {SPORTS.slice(0, 7).map((sport, index) => <HapticChip key={sport.id} active={index === 0} count={index === 0 ? MATCHES.length : index + 2}>{sport.label}</HapticChip>)}
    </div>
  </div>
);

const SMRevisionMatchListMobileSM7 = ({ mode = 'card', query = '' }) => (
  <SMRevisionMatchSM4Shell>
    <SMRevisionMatchSM7TopSearchBarRestored query={query} filterCount={2}/>
    <SMRevisionMatchSM7SportSelector/>
    <SMRevisionMatchSM6SummaryRestored variant="B" showSports={false}/>
    <div style={{ padding: '14px 20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}><div style={{ minWidth: 0 }}><div className="tm-text-label">개인 매치</div><div className="tm-text-caption" style={{ marginTop: 2 }}>종목은 상단에서 고르고 정렬/보기 방식은 필터에서 조정합니다.</div></div>{query && <Badge tone="blue" size="sm">검색 결과</Badge>}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: mode === 'card' ? 12 : 10 }}>{MATCHES.slice(0, mode === 'card' ? 3 : 5).map((item, index) => mode === 'card' ? <SMRevisionMatchSM3CardItem key={item.id} item={item} index={index} showCountBadge/> : <SMRevisionMatchSM3CompactItem key={item.id} item={item}/>)}</div>
    </div>
  </SMRevisionMatchSM4Shell>
);

const SMRevisionMatchSM7FilterSheetOption = ({ mode = 'card' }) => (
  <SMRevisionMatchSM4Shell>
    <SMRevisionMatchSM7TopSearchBarRestored query="" filterCount={2}/>
    <SMRevisionMatchSM7SportSelector/>
    <SMRevisionMatchSM6SummaryRestored variant="B" showSports={false}/>
    <div style={{ padding: '14px 20px 150px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="tm-text-label">개인 매치</div>
          <div className="tm-text-caption" style={{ marginTop: 2 }}>종목은 상단에 유지하고 정렬과 보기 방식만 필터 sheet에서 조정합니다.</div>
        </div>
        <Badge tone="blue" size="sm">필터 2</Badge>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: mode === 'card' ? 12 : 10 }}>{MATCHES.slice(0, mode === 'card' ? 3 : 5).map((item, index) => mode === 'card' ? <SMRevisionMatchSM3CardItem key={item.id} item={item} index={index} showCountBadge/> : <SMRevisionMatchSM3CompactItem key={item.id} item={item}/>)}</div>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 74, background: 'rgba(25,31,40,.18)', pointerEvents: 'none' }}/>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 74, borderRadius: '24px 24px 0 0', background: 'var(--bg)', borderTop: '1px solid var(--grey100)', boxShadow: '0 -16px 32px rgba(25,31,40,.14)', padding: '10px 20px 20px' }}>
      <div style={{ width: 42, height: 4, borderRadius: 999, background: 'var(--grey300)', margin: '0 auto 16px' }}/>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="tm-text-subhead">필터</div>
          <div className="tm-text-caption" style={{ marginTop: 2 }}>정렬과 보기 방식만 조정</div>
        </div>
        <button className="tm-btn tm-btn-sm tm-btn-ghost" style={{ color: 'var(--text-caption)' }}>초기화</button>
      </div>
      <div style={{ marginTop: 18 }}>
        <div className="tm-text-label">정렬</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {SM6_SORT_OPTIONS_RESTORED.map((label, index) => <button key={label} className={`tm-chip ${index === 0 ? 'tm-chip-active' : ''}`}>{label}</button>)}
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        <div className="tm-text-label">보기 방식</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
          {[['card', '카드형', '이미지와 핵심 정보를 크게'], ['compact', '콤팩트형', '더 많은 매치를 빠르게']].map(([id, label, sub]) => {
            const active = mode === id;
            return (
              <button key={id} className="tm-pressable" style={{ minHeight: 58, borderRadius: 14, border: active ? '1px solid var(--blue500)' : '1px solid var(--grey100)', background: active ? 'var(--blue50)' : 'var(--bg)', textAlign: 'left', padding: '10px 12px' }}>
                <div className="tm-text-label" style={{ color: active ? 'var(--blue500)' : 'var(--text-strong)' }}>{label}</div>
                <div className="tm-text-micro" style={{ marginTop: 3, color: 'var(--text-caption)' }}>{sub}</div>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 8, marginTop: 18 }}>
        <button className="tm-btn tm-btn-lg tm-btn-neutral">닫기</button>
        <button className="tm-btn tm-btn-lg tm-btn-primary">적용하기</button>
      </div>
    </div>
  </SMRevisionMatchSM4Shell>
);

const SMRevisionMatchSM7EmptyTextState = () => (
  <SMRevisionMatchSM4Shell>
    <SMRevisionMatchSM7TopSearchBarRestored query="" filterCount={2}/>
    <SMRevisionMatchSM7SportSelector/>
    <SMRevisionMatchSM6SummaryRestored variant="B" showSports={false}/>
    <div style={{ padding: '14px 20px 24px' }}>
      <div style={{ marginBottom: 10 }}>
        <div className="tm-text-label">개인 매치</div>
        <div className="tm-text-caption" style={{ marginTop: 2 }}>선택한 종목과 기준에 맞는 결과가 없습니다.</div>
      </div>
      <div style={{ padding: '56px 8px 0', textAlign: 'center' }}>
        <div className="tm-text-body-lg" style={{ color: 'var(--text-strong)' }}>매치가 없습니다</div>
        <div className="tm-text-caption" style={{ marginTop: 8, lineHeight: 1.55 }}>다른 종목을 선택하거나 필터 조건을 바꾸면 다시 확인할 수 있습니다.</div>
      </div>
    </div>
  </SMRevisionMatchSM4Shell>
);

const SMRevisionMatchSM7SearchErrorToastState = () => (
  <SMRevisionMatchSM4Shell>
    <SMRevisionMatchSM7TopSearchBarRestored query="풋살 강남" filterCount={2} error/>
    <SMRevisionMatchSM7SportSelector/>
    <SMRevisionMatchSM6SummaryRestored variant="B" showSports={false}/>
    <div style={{ padding: '14px 20px 24px' }}>
      <div style={{ marginBottom: 10 }}>
        <div className="tm-text-label">개인 매치</div>
        <div className="tm-text-caption" style={{ marginTop: 2 }}>검색 조건은 유지하고 예외 상태만 명확히 표시합니다.</div>
      </div>
      <div style={{ padding: '54px 8px 0', textAlign: 'center' }}>
        <div className="tm-text-body-lg" style={{ color: 'var(--red500)' }}>새로고침이 필요합니다</div>
        <div className="tm-text-caption" style={{ marginTop: 8, lineHeight: 1.55 }}>잠시 후 다시 검색해 주세요. 입력한 검색어와 필터는 유지됩니다.</div>
      </div>
    </div>
    <div style={{ position: 'absolute', left: 20, right: 20, bottom: 92, minHeight: 48, borderRadius: 14, background: 'rgba(25,31,40,.94)', color: 'var(--static-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 14px', fontSize: 13, fontWeight: 700 }}>
      새로고침이 필요합니다. 잠시 후 다시 검색해 주세요.
    </div>
  </SMRevisionMatchSM4Shell>
);

const SMRevisionMatchSM7SportTopFilterSheetOption = ({ mode = 'card' }) => (
  <SMRevisionMatchSM4Shell>
    <SMRevisionMatchSM7TopSearchBarRestored query="" filterCount={2}/>
    <div style={{ padding: '12px 20px 0' }}>
      <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 8, overflowX: 'auto', paddingBottom: 10 }}>
        {SPORTS.slice(0, 7).map((sport, index) => <HapticChip key={sport.id} active={index === 0} count={index === 0 ? MATCHES.length : index + 2}>{sport.label}</HapticChip>)}
      </div>
    </div>
    <SMRevisionMatchSM6SummaryRestored variant="B" showSports={false}/>
    <div style={{ padding: '14px 20px 150px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="tm-text-label">개인 매치</div>
          <div className="tm-text-caption" style={{ marginTop: 2 }}>종목은 상단에 유지하고 정렬과 보기 방식만 필터 sheet에서 조정합니다.</div>
        </div>
        <Badge tone="blue" size="sm">필터 2</Badge>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{MATCHES.slice(0, 3).map((item, index) => <SMRevisionMatchSM3CardItem key={item.id} item={item} index={index} showCountBadge/>)}</div>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 74, background: 'rgba(25,31,40,.16)', pointerEvents: 'none' }}/>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 74, borderRadius: '24px 24px 0 0', background: 'var(--bg)', borderTop: '1px solid var(--grey100)', boxShadow: '0 -16px 32px rgba(25,31,40,.14)', padding: '10px 20px 20px' }}>
      <div style={{ width: 42, height: 4, borderRadius: 999, background: 'var(--grey300)', margin: '0 auto 16px' }}/>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="tm-text-subhead">필터</div>
          <div className="tm-text-caption" style={{ marginTop: 2 }}>정렬과 보기 방식만 조정</div>
        </div>
        <button className="tm-btn tm-btn-sm tm-btn-ghost" style={{ color: 'var(--text-caption)' }}>초기화</button>
      </div>
      <div style={{ marginTop: 18 }}>
        <div className="tm-text-label">정렬</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {SM6_SORT_OPTIONS_RESTORED.map((label, index) => <button key={label} className={`tm-chip ${index === 0 ? 'tm-chip-active' : ''}`}>{label}</button>)}
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        <div className="tm-text-label">보기 방식</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
          {[['card', '카드형', '이미지 중심'], ['compact', '콤팩트형', '목록 밀도 중심']].map(([id, label, sub]) => {
            const active = mode === id;
            return (
              <button key={id} className="tm-pressable" style={{ minHeight: 58, borderRadius: 14, border: active ? '1px solid var(--blue500)' : '1px solid var(--grey100)', background: active ? 'var(--blue50)' : 'var(--bg)', textAlign: 'left', padding: '10px 12px' }}>
                <div className="tm-text-label" style={{ color: active ? 'var(--blue500)' : 'var(--text-strong)' }}>{label}</div>
                <div className="tm-text-micro" style={{ marginTop: 3, color: 'var(--text-caption)' }}>{sub}</div>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 8, marginTop: 18 }}>
        <button className="tm-btn tm-btn-lg tm-btn-neutral">닫기</button>
        <button className="tm-btn tm-btn-lg tm-btn-primary">적용하기</button>
      </div>
    </div>
  </SMRevisionMatchSM4Shell>
);

const SMRevisionMatchSM7TopSearchRules = () => (
  <SMRevisionPlusBoard eyebrow="03 MATCH SM7 · TOP SEARCH" title="00 최종본 목록 상단바 검색 적용 기준" columns={4}>
    {[
      ['상단바 검색', '00 최종본의 목록 상단바처럼 뒤로가기는 제거하고 검색 필드, 검색 실행, 필터를 56px 상단바 안에 둔다.', 'adopt'],
      ['검색 필드', '검색 영역 tap은 검색 집중 화면으로 진입한다. 입력값이 있으면 지우기 버튼을 노출한다.', 'focus search'],
      ['필터 버튼', '필터는 검색과 같은 상단바에 남기고 active 조건 수를 badge로 표시한다.', 'filter sheet'],
      ['정렬 조건', '추천순/마감임박/거리순/가격낮은순은 상단바 아래 첫 컨트롤 row의 dropdown으로 내린다.', 'sort row'],
      ['보기 선택', '카드형/콤팩트 전환은 정렬 옆 보조 버튼으로 둔다.', 'view row'],
      ['예외 유지', 'empty/error/permission/payment/pending 같은 SM5 예외 흐름은 변경하지 않는다.', 'keep states'],
    ].map(([title, body, action], index) => <SMRevisionPlusStateCard key={title} title={`${index + 1}. ${title}`} body={body} action={action} tone={index >= 5 ? 'orange' : 'blue'}/>)}
  </SMRevisionPlusBoard>
);

const SMRevisionMatchFinalOperationProcess = () => (
  <SMRevisionPlusBoard eyebrow="03 MATCH FINAL · PROCESS" title="개인 매치 최종 동작 과정" sub="SM7 목록 구조를 기준으로 목록 탐색부터 상세, 참가, 승인 상태까지 사용자가 실제로 지나가는 과정을 고정한다." columns={4}>
    {[
      ['목록 진입', '상단바 검색, 필터, 종목 selector, 매치 수 요약을 첫 화면에 노출한다.', 'list ready'],
      ['종목 선택', '상단 chip을 누르면 종목 active와 매치 수 요약, 목록이 같은 기준으로 갱신된다.', 'sport sync'],
      ['필터 열기', '필터 버튼은 하단바 위 sheet를 열고 정렬/보기 방식만 조정한다.', 'bottom sheet'],
      ['보기 전환', '카드형과 콤팩트형은 같은 데이터, 같은 검색어, 같은 필터 조건을 유지한다.', 'view persist'],
      ['검색 입력', '검색 필드 focus/type 후 search icon 또는 Enter로 실행한다.', 'submit'],
      ['검색 결과', '결과 수와 현재 조건을 유지하고 empty/error도 검색 context를 잃지 않는다.', 'result state'],
      ['상세 진입', '카드/row tap은 상세로 이동하며 상세에는 검색/필터를 노출하지 않는다.', 'detail'],
      ['참가 진행', '참가 CTA는 확인 sheet, 테스트 결제 문구, 승인 요청 피드백으로 이어진다.', 'join flow'],
    ].map(([title, body, action], index) => (
      <SMRevisionPlusStateCard key={title} title={`${index + 1}. ${title}`} body={body} action={action} tone={index >= 6 ? 'orange' : 'blue'}/>
    ))}
  </SMRevisionPlusBoard>
);

const SMRevisionMatchFinalSituationExceptionMatrix = () => (
  <SMRevisionPlusBoard eyebrow="03 MATCH FINAL · STATES" title="상황/예외 처리 전체 기준" sub="목록, 검색, 필터, 상세, 참가 과정에서 발생하는 정상/비정상 상태를 모두 화면 상태로 분리한다." columns={4}>
    {[
      ['loading', '카드형/콤팩트형 skeleton은 현재 보기 형태를 유지한다.', 'skeleton', 'blue'],
      ['매치 없음', '본문에는 텍스트로 매치가 없음을 보여주고 검색/필터/종목 context는 유지한다.', 'empty text', 'orange'],
      ['검색 예외', '입력창 red border와 하단 toast를 함께 표시한다. 입력값과 필터값은 보존한다.', 'red + toast', 'red'],
      ['stale query', '빠른 연속 입력은 마지막 query만 반영하고 이전 응답으로 덮지 않는다.', 'latest wins', 'orange'],
      ['모집 완료', '참가 CTA는 차단하고 대기 신청 가능 여부를 별도로 표시한다.', 'sold out', 'orange'],
      ['마감 임박', '마감 badge와 남은 시간을 표시하되 참가 가능 여부와 분리한다.', 'deadline', 'orange'],
      ['권한 필요', '로그인, 알림, 위치 권한은 성공처럼 처리하지 않고 복구 경로를 보여준다.', 'permission', 'red'],
      ['결제 실패', '테스트 결제/실청구 없음 문구와 실패 원인, 재시도/닫기를 분리한다.', 'payment retry', 'red'],
      ['중복 제출', 'pending guard로 버튼을 잠그고 이미 접수된 상태를 안내한다.', 'locked', 'orange'],
      ['매치 취소', '취소/삭제된 매치는 참가 CTA를 제거하고 목록 복귀를 제공한다.', 'cancelled', 'red'],
      ['승인중', '승인 주체와 다음 상태를 표시하고 CTA는 disabled 상태로 유지한다.', 'pending', 'orange'],
      ['승인완료', '성공 상태는 locked success로 표시하고 후속 안내만 제공한다.', 'approved', 'green'],
    ].map(([title, body, action, tone]) => (
      <SMRevisionPlusStateCard key={title} title={title} body={body} action={action} tone={tone}/>
    ))}
  </SMRevisionPlusBoard>
);

const SMRevisionMatchFinalButtonInputMatrix = () => (
  <SMRevisionPlusBoard eyebrow="03 MATCH FINAL · INPUTS" title="버튼/입력 동작 매트릭스" sub="각 입력과 버튼은 trigger, 즉시 피드백, 다음 화면 또는 상태를 가진다. 필터와 검색은 서로 값을 덮어쓰지 않는다." columns={4}>
    <SMRevisionPlusCard index={1} title="검색 필드" trigger="field tap/type" feedback="focus border, cursor, query 유지" next="검색 실행 대기" state="input"/>
    <SMRevisionPlusCard index={2} title="검색 실행" trigger="search icon 또는 Enter" feedback="submit lock, 마지막 query 기준" next="검색 결과/empty/error" state="submit"/>
    <SMRevisionPlusCard index={3} title="검색 지우기" trigger="X tap" feedback="query만 제거, 필터/종목 유지" next="미입력 목록" state="clear"/>
    <SMRevisionPlusCard index={4} title="필터 버튼" trigger="filter tap" feedback="bottom nav 위 sheet open" next="정렬/보기 선택" state="filter"/>
    <SMRevisionPlusCard index={5} title="정렬 선택" trigger="sort option tap" feedback="selected mark, count 유지" next="정렬된 목록" state="sort"/>
    <SMRevisionPlusCard index={6} title="보기 선택" trigger="카드형/콤팩트형 tap" feedback="active style 전환" next="동일 조건의 다른 보기" state="view"/>
    <SMRevisionPlusCard index={7} title="종목 chip" trigger="sport chip tap" feedback="active chip, 숫자 요약 갱신" next="종목 기준 목록" state="sport"/>
    <SMRevisionPlusCard index={8} title="매치 카드/row" trigger="card 또는 row tap" feedback="pressed + push transition" next="매치 상세" state="detail"/>
    <SMRevisionPlusCard index={9} title="공유/알림" trigger="상세 아이콘 tap" feedback="sheet 또는 permission 안내" next="공유 완료/알림 설정" state="detail action"/>
    <SMRevisionPlusCard index={10} title="참가 CTA" trigger="참가하기 tap" feedback="CTA press, sheet open" next="참가 요약 확인" state="join"/>
    <SMRevisionPlusCard index={11} title="결제하고 참가" trigger="sheet primary tap" feedback="중복 submit lock" next="승인 요청 피드백" state="payment" tone="orange"/>
    <SMRevisionPlusCard index={12} title="관리 CTA" trigger="내 매치 관리 tap" feedback="참가 흐름 제거" next="참가자/상태 관리" state="owner"/>
  </SMRevisionPlusBoard>
);

const SMRevisionMatchFinalButtonExceptionMatrix = () => (
  <SMRevisionPlusBoard eyebrow="03 MATCH FINAL · BUTTON EXCEPTIONS" title="모든 버튼 예외 처리" sub="버튼 실패는 toast만으로 끝내지 않고 입력값, 선택값, 현재 화면 맥락을 유지한 채 복구 경로를 둔다." columns={4}>
    {[
      ['빈 검색 실행', '검색어가 없으면 submit하지 않고 미입력 상태를 유지한다.', 'guard', 'orange'],
      ['검색 실패', 'red input과 toast를 표시하고 마지막 query와 필터를 유지한다.', 'retry later', 'red'],
      ['필터 적용 실패', 'sheet 선택값은 draft로 보존하고 목록은 기존 결과를 유지한다.', 'draft keep', 'red'],
      ['보기 전환 실패', '데이터 재요청 실패 시 기존 view를 유지하고 오류 toast만 표시한다.', 'view keep', 'orange'],
      ['종목 0개', '종목 전체 해제는 허용하지 않고 최소 1개 active를 유지한다.', 'min one', 'orange'],
      ['상세 로드 실패', '목록 조건을 잃지 않고 상세 재시도와 뒤로가기를 제공한다.', 'retry detail', 'red'],
      ['참가 조건 불가', '모집완료, 마감, 레벨/권한 불일치는 CTA disabled reason을 보여준다.', 'disabled reason', 'orange'],
      ['결제 실패', '실패 원인, 재시도, 닫기를 분리하고 승인 상태로 넘기지 않는다.', 'no fake success', 'red'],
      ['중복 참가', '이미 승인중/승인완료면 버튼을 locked 상태로 보여준다.', 'locked', 'orange'],
      ['공유 실패', '공유 sheet 실패는 링크 복사 fallback으로 복구한다.', 'copy link', 'orange'],
      ['알림 권한 거부', '권한 안내와 설정 이동을 제공하고 버튼 상태를 성공 처리하지 않는다.', 'permission', 'red'],
      ['소유자 액션 실패', '내 매치 관리 실패는 참가자/상태 변경을 낙관 확정하지 않는다.', 'rollback', 'red'],
    ].map(([title, body, action, tone]) => (
      <SMRevisionPlusStateCard key={title} title={title} body={body} action={action} tone={tone}/>
    ))}
  </SMRevisionPlusBoard>
);

const SMRevisionMatchFinalFullFlow = () => (
  <SMRevisionPlusBoard eyebrow="03 MATCH FINAL · FULL FLOW" title="전체 흐름" sub="목록의 카드형/콤팩트형, 검색/필터 예외, 상세/참가/승인 상태를 하나의 최종 흐름으로 연결한다." columns={4}>
    {[
      ['1. 기본 목록', '종목 선택과 현재 기준 매치 수 요약이 보이고 기본 보기로 진입한다.', 'card or compact', 'blue'],
      ['2. 조건 조정', '종목은 상단 chip, 정렬/보기는 필터 sheet에서 변경한다.', 'filter draft', 'blue'],
      ['3. 검색 실행', '검색어 입력 후 실행하고 결과 없음/오류는 별도 상태로 분기한다.', 'search branch', 'blue'],
      ['4. 결과 탐색', '카드형과 콤팩트형은 동일 조건을 유지하며 매치 수를 즉시 보여준다.', 'browse', 'blue'],
      ['5. 상세 판단', '상세에서 일시, 장소, 인원, 비용, 호스트, 참가자를 확인한다.', 'detail', 'blue'],
      ['6. 참가 확인', '참가 CTA 후 bottom sheet에서 결제 전 요약과 테스트 결제 문구를 확인한다.', 'sheet', 'orange'],
      ['7. 승인 요청', '결제하고 참가 후 승인 요청 피드백, 승인중 locked 상태로 이동한다.', 'pending', 'orange'],
      ['8. 최종 상태', '승인완료, 모집완료, 취소, 결제 실패, 권한 예외 중 하나로 수렴한다.', 'resolved', 'green'],
    ].map(([title, body, action, tone]) => (
      <SMRevisionPlusStateCard key={title} title={title} body={body} action={action} tone={tone}/>
    ))}
  </SMRevisionPlusBoard>
);

const SM_MATCH_CREATE_SPORTS = ['풋살', '축구', '러닝', '수영', '수영', '러닝'];
const SM_MATCH_CREATE_LEVELS = ['입문', '초보', '중수', '고수'];

const SMRevisionMatchCreateProgress = ({ step = 1, edit = false }) => (
  <div style={{ padding: '14px 20px 10px' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <Badge tone={edit ? 'orange' : 'blue'} size="sm">{edit ? '수정' : `Step ${step}/4`}</Badge>
      <div className="tm-text-caption">{edit ? '기존 값 유지 · 변경사항만 저장' : ['종목 선택', '매치 정보', '장소와 시간', '작성 내용 확인'][step - 1]}</div>
    </div>
    {!edit && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 12 }}>
        {[1, 2, 3, 4].map((item) => (
          <div key={item} style={{ height: 4, borderRadius: 999, background: item <= step ? 'var(--blue500)' : 'var(--grey100)' }}/>
        ))}
      </div>
    )}
  </div>
);

const SMRevisionMatchCreateShell = ({ step = 1, title = '매치 만들기', edit = false, children, primary = '다음', secondary = '이전', primaryDisabled = false }) => (
  <SMRevisionMatchSM4Shell bottom={false}>
    <div style={{ minHeight: 56, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--grey100)', background: 'var(--bg)', flexShrink: 0 }}>
      <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="뒤로가기"><Icon name="chevL" size={22}/></button>
      <div className="tm-text-body-lg" style={{ flex: 1 }}>{title}</div>
      <button className="tm-btn tm-btn-sm tm-btn-ghost">닫기</button>
    </div>
    <SMRevisionMatchCreateProgress step={step} edit={edit}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px 120px' }}>{children}</div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="tm-btn tm-btn-lg tm-btn-neutral" style={{ flex: 1 }}>{secondary}</button>
        <button className={`tm-btn tm-btn-lg ${primaryDisabled ? 'tm-btn-neutral' : 'tm-btn-primary'}`} disabled={primaryDisabled} style={{ flex: 2 }}>{primary}</button>
      </div>
    </div>
  </SMRevisionMatchSM4Shell>
);

const SMRevisionMatchCreateField = ({ label, value, placeholder, helper, error, suffix, multiline = false }) => (
  <div style={{ marginTop: 14 }}>
    <div className="tm-text-label">{label}</div>
    <div style={{ marginTop: 8, minHeight: multiline ? 104 : 48, borderRadius: 12, background: 'var(--grey50)', border: `1px solid ${error ? 'var(--red500)' : 'var(--grey100)'}`, padding: multiline ? '12px 14px' : '0 14px', display: 'flex', alignItems: multiline ? 'flex-start' : 'center', gap: 8 }}>
      <div className="tm-text-body" style={{ flex: 1, color: value ? 'var(--text-strong)' : 'var(--text-placeholder)', lineHeight: multiline ? 1.5 : undefined }}>{value || placeholder}</div>
      {suffix && <div className="tm-text-caption">{suffix}</div>}
    </div>
    {helper && <div className="tm-text-caption" style={{ marginTop: 6, color: error ? 'var(--red500)' : 'var(--text-caption)', lineHeight: 1.45 }}>{helper}</div>}
  </div>
);

const SMRevisionMatchCreateListEntrySMFinal = () => (
  <div style={{ width: 375, height: 812, position: 'relative' }}>
    <SMRevisionMatchListMobileSM7 mode="card"/>
    <button className="tm-btn tm-btn-primary" aria-label="매치 만들기" style={{ position: 'absolute', right: 20, bottom: 92, width: 56, height: 56, borderRadius: 999, padding: 0, display: 'grid', placeItems: 'center', boxShadow: '0 12px 26px rgba(49,130,246,.32)', zIndex: 6 }}>
      <Icon name="plus" size={25}/>
    </button>
  </div>
);

const SMRevisionMatchCreateSportStepSMFinal = () => (
  <SMRevisionMatchCreateShell step={1} secondary="취소">
    <div className="tm-text-heading">어떤 종목인가요?</div>
    <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)' }}>매치 목록의 종목 chip과 같은 기준으로 생성 후 필터에 반영됩니다.</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 20 }}>
      {SM_MATCH_CREATE_SPORTS.map((sport, index) => (
        <Card key={sport} pad={16} interactive style={{ minHeight: 92, borderColor: index === 0 ? 'var(--blue500)' : 'var(--grey100)', background: index === 0 ? 'var(--blue50)' : 'var(--bg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div>
              <div className="tm-text-body-lg">{sport}</div>
              <div className="tm-text-caption" style={{ marginTop: 5 }}>{index === 0 ? '선택됨' : '선택 가능'}</div>
            </div>
            {index === 0 && <Icon name="check" size={20}/>}
          </div>
        </Card>
      ))}
    </div>
  </SMRevisionMatchCreateShell>
);

const SMRevisionMatchCreateInfoStepSMFinal = ({ edit = false }) => (
  <SMRevisionMatchCreateShell step={2} edit={edit} title={edit ? '매치 수정' : '매치 만들기'} primary={edit ? '변경사항 저장' : '다음'} secondary={edit ? '변경 취소' : '이전'}>
    <div className="tm-text-heading">매치 정보</div>
    <SMRevisionMatchCreateField label="매치 제목" value="주말 풋살 한판!" placeholder="예: 주말 풋살 한판!"/>
    <SMRevisionMatchCreateField label="설명" value="초보도 편하게 참여할 수 있는 주말 풋살 매치입니다." placeholder="매치에 대한 설명을 적어주세요" multiline/>
    <div style={{ marginTop: 14 }}>
      <div className="tm-text-label">이미지 (선택)</div>
      <Card pad={0} style={{ marginTop: 8, overflow: 'hidden' }}>
        <div style={{ height: 132, background: `url(${MATCHES[0].img}) center/cover`, position: 'relative' }}>
          <div style={{ position: 'absolute', left: 12, top: 12 }}><Badge tone="grey" size="sm">예시 이미지</Badge></div>
        </div>
        <div style={{ padding: 14 }}>
          <button className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"><Icon name="plus" size={17}/> 이미지 업로드</button>
          <div className="tm-text-caption" style={{ marginTop: 8, lineHeight: 1.45 }}>최대 1장, 10MB 이하. 업로드한 이미지만 저장되며, 예시 이미지는 제출 데이터에 포함되지 않아요.</div>
          <div className="tm-text-micro" style={{ marginTop: 8, color: 'var(--text-caption)' }}>선택된 파일 없음 · 대표 이미지가 비어 있으면 위 예시처럼 노출됩니다.</div>
        </div>
      </Card>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <SMRevisionMatchCreateField label="최대 인원" value="10" placeholder="10"/>
      <SMRevisionMatchCreateField label="참가비" value="15000" placeholder="15000" suffix="원"/>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <SMRevisionMatchCreateField label="최소 레벨" value="초보" placeholder="선택"/>
      <SMRevisionMatchCreateField label="최대 레벨" value="중수" placeholder="선택"/>
    </div>
    <div style={{ marginTop: 14 }}>
      <div className="tm-text-label">성별 제한</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
        {['무관', '남성', '여성'].map((item, index) => <button key={item} className={`tm-chip ${index === 0 ? 'tm-chip-active' : ''}`}>{item}</button>)}
      </div>
    </div>
    <SMRevisionMatchCreateField label="추가 규칙 (선택)" placeholder="예: 풋살화 착용, 지각 시 미리 연락" multiline/>
  </SMRevisionMatchCreateShell>
);

const SMRevisionMatchCreatePlaceTimeStepSMFinal = () => (
  <SMRevisionMatchCreateShell step={3}>
    <div className="tm-text-heading">장소와 시간</div>
    <div style={{ marginTop: 16 }}>
      <div className="tm-text-label">시설 선택</div>
      <Card pad={16} interactive style={{ marginTop: 8, borderColor: 'var(--blue500)', background: 'var(--blue50)' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Icon name="mapPin" size={20}/>
          <div style={{ minWidth: 0 }}>
            <div className="tm-text-body-lg">안양천 풋살장</div>
            <div className="tm-text-caption" style={{ marginTop: 4 }}>서울 양천구 안양천로 939</div>
          </div>
        </div>
      </Card>
    </div>
    <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ height: 1, background: 'var(--grey100)', flex: 1 }}/>
      <div className="tm-text-caption">또는 직접 입력</div>
      <div style={{ height: 1, background: 'var(--grey100)', flex: 1 }}/>
    </div>
    <SMRevisionMatchCreateField label="장소 직접 입력" placeholder="예: 한강공원 축구장, 동네 체육관 등"/>
    <SMRevisionMatchCreateField label="날짜" value="2026-05-16" placeholder="연도-월-일"/>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <SMRevisionMatchCreateField label="시작 시간" value="18:00" placeholder="--:--"/>
      <SMRevisionMatchCreateField label="종료 시간" value="20:00" placeholder="--:--"/>
    </div>
  </SMRevisionMatchCreateShell>
);

const SMRevisionMatchCreateConfirmStepSMFinal = () => (
  <SMRevisionMatchCreateShell step={4} primary="매치 만들기">
    <div className="tm-text-heading">작성된 내용을 확인해주세요</div>
    <Card pad={0} style={{ marginTop: 16, overflow: 'hidden' }}>
      <div style={{ height: 126, background: `url(${MATCHES[0].img}) center/cover` }}/>
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}><Badge tone="blue">풋살</Badge><Badge tone="grey">초보-중수</Badge><Badge tone="grey">성별 무관</Badge></div>
        <div className="tm-text-subhead">주말 풋살 한판!</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>초보도 편하게 참여할 수 있는 주말 풋살 매치입니다.</div>
      </div>
    </Card>
    <Card pad={16} style={{ marginTop: 12 }}>
      {[
        ['일시', '2026-05-16 18:00-20:00'],
        ['장소', '안양천 풋살장 · 서울 양천구 안양천로 939'],
        ['인원/참가비', '최대 10명 · 15,000원'],
        ['이미지', '선택된 파일 없음 · 예시 이미지는 저장되지 않음'],
      ].map(([label, value]) => <SMRevisionInfoRow key={label} label={label} value={value}/>)}
    </Card>
  </SMRevisionMatchCreateShell>
);

const SMRevisionMatchCreateShareCompleteSMFinal = () => (
  <SMRevisionMatchCreateShell step={4} title="매치 만들기 완료" primary="내 팀에 공유" secondary="상세 보기">
    <div style={{ textAlign: 'center', paddingTop: 12 }}>
      <div style={{ width: 64, height: 64, borderRadius: 22, background: 'rgba(3,178,108,.10)', color: 'var(--green500)', display: 'grid', placeItems: 'center', margin: '0 auto' }}>
        <Icon name="check" size={30}/>
      </div>
      <div className="tm-text-heading" style={{ marginTop: 16 }}>매치가 만들어졌어요</div>
      <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)', lineHeight: 1.55 }}>개인매치도 먼저 내 팀에게 공유해서 팀원 참여 가능 여부를 확인할 수 있습니다.</div>
    </div>
    <Card pad={16} style={{ marginTop: 22, background: 'var(--blue50)', borderColor: 'rgba(49,130,246,.24)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '48px minmax(0, 1fr)', gap: 12, alignItems: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 22 }}>⚽</div>
        <div style={{ minWidth: 0 }}>
          <div className="tm-text-body-lg">FC 발빠른놈들 팀 채팅</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>24명에게 개인매치 링크와 일정 정보를 공유</div>
        </div>
      </div>
    </Card>
    <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
      {[
        ['내 팀에 공유', '팀 채팅에 매치 링크, 일정, 장소를 먼저 보냅니다.', 'blue'],
        ['초대 링크 복사', '외부 메신저로 보낼 개인매치 초대 링크를 복사합니다.', 'grey'],
        ['관심 멤버에게 보내기', '최근 함께 경기한 멤버에게 초대 메시지를 보냅니다.', 'grey'],
      ].map(([title, sub, tone], index) => (
        <Card key={title} pad={14} interactive style={{ borderColor: index === 0 ? 'var(--blue500)' : 'var(--grey100)', background: index === 0 ? 'var(--blue50)' : 'var(--bg)' }}>
          <div className="tm-text-label" style={{ color: tone === 'blue' ? 'var(--blue500)' : 'var(--text-strong)' }}>{title}</div>
          <div className="tm-text-caption" style={{ marginTop: 5 }}>{sub}</div>
        </Card>
      ))}
    </div>
    <div style={{ position: 'absolute', left: 20, right: 20, bottom: 132, zIndex: 5, borderRadius: 16, background: 'var(--grey900)', color: 'var(--static-white)', padding: '14px 16px', boxShadow: 'var(--sh-2)' }}>
      <div className="tm-text-label" style={{ color: 'var(--static-white)' }}>매치가 생성되었습니다</div>
      <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.72)', marginTop: 3 }}>내 팀에게 먼저 공유할 수 있어요.</div>
    </div>
  </SMRevisionMatchCreateShell>
);

const SMRevisionMatchEditSMFinal = () => (
  <SMRevisionMatchCreateInfoStepSMFinal edit/>
);

const SMRevisionMatchCreateActionRulesSMFinal = () => (
  <SMRevisionPlusBoard eyebrow="03-1 MATCH CREATE · ACTIONS" title="매치 만들기/수정 버튼·입력 동작" sub="조회 화면 FAB에서 생성으로 진입하고, 수정은 같은 폼 구조를 prefill 상태로 사용한다." columns={4}>
    <SMRevisionPlusCard index={1} title="FAB" trigger="목록 우측 하단 + tap" feedback="pressed scale, /matches/new 진입" next="종목 선택 step" state="entry"/>
    <SMRevisionPlusCard index={2} title="종목 선택" trigger="sport card tap" feedback="blue selected + check" next="매치 정보" state="step 1"/>
    <SMRevisionPlusCard index={3} title="이미지 업로드" trigger="upload tap" feedback="file picker, 1장/10MB 검증" next="업로드 이미지 preview" state="optional"/>
    <SMRevisionPlusCard index={4} title="장소 선택" trigger="시설 card 또는 직접 입력" feedback="한쪽 선택 시 다른 값은 draft 유지" next="날짜/시간 입력" state="place"/>
    <SMRevisionPlusCard index={5} title="확인 수정" trigger="확인 화면 항목 수정 tap" feedback="해당 step 복귀, 입력값 유지" next="확인 화면으로 복귀" state="edit step"/>
    <SMRevisionPlusCard index={6} title="매치 만들기" trigger="최종 CTA tap" feedback="중복 submit lock + toast" next="생성된 상세 또는 목록" state="submit"/>
    <SMRevisionPlusCard index={7} title="매치 수정" trigger="내 매치 상세 관리 CTA" feedback="기존 값 prefill notice" next="변경사항 저장" state="edit"/>
    <SMRevisionPlusCard index={8} title="변경 취소" trigger="수정 화면 취소/뒤로가기" feedback="변경사항 있으면 확인 sheet" next="상세 유지" state="guard"/>
  </SMRevisionPlusBoard>
);

const SMRevisionMatchCreateExceptionRulesSMFinal = () => (
  <SMRevisionPlusBoard eyebrow="03-1 MATCH CREATE · STATES" title="매치 만들기/수정 상황·예외" columns={4}>
    {[
      ['필수값 누락', '종목, 제목, 최대 인원, 참가비, 레벨, 장소, 날짜/시간 누락은 다음/제출 disabled reason을 표시한다.', 'disabled reason', 'orange'],
      ['이미지 없음', '선택된 파일 없음 상태를 정상으로 보고 예시 이미지는 제출 데이터에 포함하지 않는다.', 'fallback only', 'blue'],
      ['이미지 오류', '1장 초과, 10MB 초과, 지원하지 않는 파일은 inline 오류와 다시 선택 CTA를 제공한다.', 'file error', 'red'],
      ['시간 오류', '종료 시간이 시작 시간보다 빠르거나 같은 경우 시간 필드에 오류를 표시한다.', 'time invalid', 'red'],
      ['장소 충돌', '시설 선택과 직접 입력이 모두 있으면 마지막 선택을 대표 장소로 저장한다.', 'last choice', 'orange'],
      ['가격 오류', '참가비는 원 단위 숫자만 허용하고 음수/문자는 입력 즉시 정리한다.', 'numeric', 'orange'],
      ['수정 권한 없음', '내 매치가 아니거나 이미 취소/종료된 매치는 저장 CTA를 차단한다.', 'permission', 'red'],
      ['저장 실패', '입력값은 보존하고 실패 원인, 재시도, 임시저장 선택지를 제공한다.', 'retry', 'red'],
    ].map(([title, body, action, tone]) => <SMRevisionPlusStateCard key={title} title={title} body={body} action={action} tone={tone}/>)}
  </SMRevisionPlusBoard>
);

const SMRevisionMatchCreateFullFlowSMFinal = () => (
  <SMRevisionPlusBoard eyebrow="03-1 MATCH CREATE · FLOW" title="목록 FAB → 만들기 → 수정 전체 흐름" columns={4}>
    {[
      ['1. 조회 화면', '개인 매치 목록 우측 하단 + FAB 노출', 'FAB'],
      ['2. 종목', '어떤 종목인지 먼저 선택', 'sport'],
      ['3. 정보', '제목, 설명, 이미지, 인원, 참가비, 레벨, 성별, 추가 규칙 입력', 'info'],
      ['4. 장소/시간', '시설 선택 또는 직접 입력, 날짜와 시작/종료 시간 입력', 'schedule'],
      ['5. 확인', '작성된 내용을 카드 형태로 검토하고 각 step 수정 가능', 'confirm'],
      ['6. 생성 완료', 'toast 후 내 팀 공유, 링크 복사, 관심 멤버 초대 액션을 우선 제공', 'share'],
      ['7. 수정 진입', '내 매치 상세의 관리/수정에서 prefill 폼 진입', 'edit'],
      ['8. 저장/취소', '저장은 toast + 상세 반영, 취소는 변경사항 guard', 'done'],
    ].map(([title, body, action], index) => <SMRevisionPlusStateCard key={title} title={title} body={body} action={action} tone={index >= 5 ? 'green' : 'blue'}/>)}
  </SMRevisionPlusBoard>
);

const SM_TEAM_MATCH_LEVELS = [
  ['S', 'all 선출 팀 또는 현역모임'],
  ['A+', '아마추어 + 선출팀, 기본기 상, 팀플 완벽, 선출 3~4명'],
  ['A', '아마추어 + 선출팀, 기본기 상, 선출 1~2명'],
  ['B+', '아마추어 팀, 전원 기본기 중, 팀플 상'],
  ['B', '아마추어 팀, 전원 기본기 중, 팀플 중'],
  ['B-', '아마추어 팀, 전원 기본기 중, 팀플 하'],
  ['C+', '아마추어 팀, 팀원 50% 기본기 하, 팀플 상'],
  ['C', '아마추어 팀, 팀원 50% 기본기 하, 팀플 중'],
  ['C-', '아마추어 팀, 팀원 50% 기본기 하, 팀플 하'],
  ['D', '아마추어 팀, 팀원 기본기 하'],
];

const SMRevisionTeamMatchCreateProgressSMFinal = ({ step = 1, edit = false }) => {
  const labels = ['팀 선택', '종목 선택', '매치 정보', '경기조건', '장소와 시간', '작성 내용 확인'];
  return (
    <div style={{ padding: '14px 20px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <Badge tone={edit ? 'orange' : 'blue'} size="sm">{edit ? '수정' : `Step ${step}/6`}</Badge>
        <div className="tm-text-caption">{edit ? '기존 값 유지 · 변경사항만 저장' : labels[step - 1]}</div>
      </div>
      {!edit && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginTop: 12 }}>
          {[1, 2, 3, 4, 5, 6].map((item) => <div key={item} style={{ height: 4, borderRadius: 999, background: item <= step ? 'var(--blue500)' : 'var(--grey100)' }}/>)}
        </div>
      )}
    </div>
  );
};

const SMRevisionTeamMatchCreateShellSMFinal = ({ step = 1, title = '팀매치 만들기', edit = false, children, primary = '다음', secondary = '이전', primaryDisabled = false }) => (
  <SMRevisionTeamMatchShellSM2 bottom={false}>
    <div style={{ minHeight: 56, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--grey100)', background: 'var(--bg)', flexShrink: 0 }}>
      <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="뒤로가기"><Icon name="chevL" size={22}/></button>
      <div className="tm-text-body-lg" style={{ flex: 1 }}>{title}</div>
      <button className="tm-btn tm-btn-sm tm-btn-ghost">닫기</button>
    </div>
    <SMRevisionTeamMatchCreateProgressSMFinal step={step} edit={edit}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px 120px' }}>{children}</div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="tm-btn tm-btn-lg tm-btn-neutral" style={{ flex: 1 }}>{secondary}</button>
        <button className={`tm-btn tm-btn-lg ${primaryDisabled ? 'tm-btn-neutral' : 'tm-btn-primary'}`} disabled={primaryDisabled} style={{ flex: 2 }}>{primary}</button>
      </div>
    </div>
  </SMRevisionTeamMatchShellSM2>
);

const SMRevisionTeamMatchCreateListEntrySMFinal = () => (
  <div style={{ width: 375, height: 812, position: 'relative' }}>
    <SMRevisionTeamMatchListMobileSM4 mode="card"/>
    <button className="tm-btn tm-btn-primary" aria-label="팀매치 만들기" style={{ position: 'absolute', right: 20, bottom: 92, width: 56, height: 56, borderRadius: 999, padding: 0, display: 'grid', placeItems: 'center', boxShadow: '0 12px 26px rgba(49,130,246,.32)', zIndex: 6 }}>
      <Icon name="plus" size={25}/>
    </button>
  </div>
);

const SMRevisionTeamMatchCreateTeamStepSMFinal = () => (
  <SMRevisionTeamMatchCreateShellSMFinal step={1} secondary="취소">
    <div className="tm-text-heading">어떤 팀의 매치인가요?</div>
    <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)' }}>팀매치는 선택한 내 팀의 권한, 종목, 팀 정보로 생성됩니다.</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
      {TEAMS.slice(0, 3).map((team, index) => (
        <Card key={team.id} pad={16} interactive style={{ borderColor: index === 1 ? 'var(--blue500)' : 'var(--grey100)', background: index === 1 ? 'var(--blue50)' : 'var(--bg)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '48px minmax(0, 1fr) auto', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: team.color, color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 22 }}>{team.logo}</div>
            <div style={{ minWidth: 0 }}>
              <div className="tm-text-body-lg" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team.name}</div>
              <div className="tm-text-caption" style={{ marginTop: 4 }}>{team.sport} · {team.members}명 · {team.level}등급 · 매너 {team.manner}</div>
              <div className="tm-text-micro" style={{ marginTop: 3, color: index === 1 ? 'var(--blue500)' : 'var(--text-caption)' }}>{index === 1 ? '주장 권한 · 선택됨' : index === 0 ? '주장 권한' : '멤버 · 생성 권한 확인 필요'}</div>
            </div>
            {index === 1 && <Icon name="check" size={20}/>}
          </div>
        </Card>
      ))}
    </div>
    <Card pad={14} style={{ marginTop: 14, background: 'var(--grey50)' }}>
      <div className="tm-text-label">권한 기준</div>
      <div className="tm-text-caption" style={{ marginTop: 6, lineHeight: 1.45 }}>팀장 또는 매치 생성 권한이 있는 관리자만 다음 단계로 이동할 수 있습니다.</div>
    </Card>
  </SMRevisionTeamMatchCreateShellSMFinal>
);

const SMRevisionTeamMatchCreateSportStepSMFinal = () => (
  <SMRevisionTeamMatchCreateShellSMFinal step={2}>
    <div className="tm-text-heading">어떤 종목인가요?</div>
    <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)' }}>팀매치 목록의 종목 chip과 같은 기준으로 생성 후 필터에 반영됩니다.</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 20 }}>
      {SM_MATCH_CREATE_SPORTS.map((sport, index) => (
        <Card key={sport} pad={16} interactive style={{ minHeight: 92, borderColor: index === 0 ? 'var(--blue500)' : 'var(--grey100)', background: index === 0 ? 'var(--blue50)' : 'var(--bg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div><div className="tm-text-body-lg">{sport}</div><div className="tm-text-caption" style={{ marginTop: 5 }}>{index === 0 ? '선택됨' : '선택 가능'}</div></div>
            {index === 0 && <Icon name="check" size={20}/>}
          </div>
        </Card>
      ))}
    </div>
  </SMRevisionTeamMatchCreateShellSMFinal>
);

const SMRevisionTeamMatchCreateInfoStepSMFinal = ({ edit = false }) => (
  <SMRevisionTeamMatchCreateShellSMFinal step={3} edit={edit} title={edit ? '팀매치 수정' : '팀매치 만들기'} primary={edit ? '변경사항 저장' : '다음'} secondary={edit ? '변경 취소' : '이전'}>
    <div className="tm-text-heading">매치 정보</div>
    <SMRevisionMatchCreateField label="매치 제목" value="주말 풋살 한판!" placeholder="예: 주말 풋살 한판!"/>
    <SMRevisionMatchCreateField label="설명" value="상대팀을 초대해 즐겁게 경기할 팀매치입니다." placeholder="매치에 대한 설명을 적어주세요" multiline/>
    <div style={{ marginTop: 14 }}>
      <div className="tm-text-label">이미지 (선택)</div>
      <Card pad={0} style={{ marginTop: 8, overflow: 'hidden' }}>
        <div style={{ height: 132, background: 'var(--grey900)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', position: 'relative' }}>
          <div className="tm-text-subhead" style={{ color: 'var(--static-white)' }}>우리 팀 VS 상대팀</div>
          <div style={{ position: 'absolute', left: 12, top: 12 }}><Badge tone="grey" size="sm">예시 이미지</Badge></div>
        </div>
        <div style={{ padding: 14 }}>
          <button className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"><Icon name="plus" size={17}/> 이미지 업로드</button>
          <div className="tm-text-caption" style={{ marginTop: 8, lineHeight: 1.45 }}>최대 1장, 10MB 이하. 업로드한 이미지만 저장되며, 예시 이미지는 제출 데이터에 포함되지 않아요.</div>
          <div className="tm-text-micro" style={{ marginTop: 8, color: 'var(--text-caption)' }}>선택된 파일 없음 · 대표 이미지가 비어 있으면 위 예시처럼 노출됩니다.</div>
        </div>
      </Card>
    </div>
  </SMRevisionTeamMatchCreateShellSMFinal>
);

const SMRevisionTeamMatchCreateConditionStepSMFinal = () => (
  <SMRevisionTeamMatchCreateShellSMFinal step={4}>
    <div className="tm-text-heading">경기조건</div>
    <div style={{ marginTop: 14 }}>
      <div className="tm-text-label">실력등급</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        {SM_TEAM_MATCH_LEVELS.slice(0, 6).map(([grade, desc], index) => (
          <Card key={grade} pad={12} interactive style={{ borderColor: index === 1 ? 'var(--blue500)' : 'var(--grey100)', background: index === 1 ? 'var(--blue50)' : 'var(--bg)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '42px 1fr', gap: 10, alignItems: 'center' }}>
              <div className="tm-text-body-lg tab-num" style={{ color: index === 1 ? 'var(--blue500)' : 'var(--text-strong)' }}>{grade}</div>
              <div className="tm-text-caption" style={{ lineHeight: 1.4 }}>{desc}</div>
            </div>
          </Card>
        ))}
      </div>
      <div className="tm-text-caption" style={{ marginTop: 8 }}>나머지 등급 C+ · C · C- · D는 같은 목록에서 스크롤로 선택합니다.</div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <SMRevisionMatchCreateField label="선출선수" value="0" placeholder="0" suffix="명" helper="팀 내 축구/풋살 선출 출신 선수 수 (0~10명)"/>
      <SMRevisionMatchCreateField label="최대 인원" value="10" placeholder="10"/>
    </div>
    <div style={{ marginTop: 14 }}>
      <div className="tm-text-label">경기방식</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 8 }}>
        {['11:11', '8:8', '6:6', '5:5'].map((item, index) => <button key={item} className={`tm-chip ${index === 3 ? 'tm-chip-active' : ''}`}>{item}</button>)}
      </div>
    </div>
    <div style={{ marginTop: 14 }}>
      <div className="tm-text-label">매치 유형</div>
      <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
        {['초청 · 우리 구장으로 상대를 초대', '교환 · 서로 번갈아가며 경기', '원정 · 상대 구장에서 경기'].map((item, index) => <button key={item} className={`tm-chip ${index === 0 ? 'tm-chip-active' : ''}`} style={{ justifyContent: 'flex-start' }}>{item}</button>)}
      </div>
    </div>
    <div style={{ marginTop: 14 }}>
      <div className="tm-text-label">경기 스타일</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {['친선', '즐겁게 경기', '경쟁', '승부 중심', '매너 중시', '매너 우선'].map((item, index) => <button key={item} className={`tm-chip ${index === 0 || index === 4 ? 'tm-chip-active' : ''}`}>{item}</button>)}
      </div>
    </div>
    <SMRevisionMatchCreateField label="유니폼 색상" value="빨강 상의 + 검정 하의" placeholder="예: 빨강 상의 + 검정 하의"/>
    <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
      {['무료초청 · 상대팀 비용 0원', '용병 허용', '심판 배정'].map((item, index) => (
        <Card key={item} pad={13} interactive style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 22, height: 22, borderRadius: 7, border: '1px solid var(--blue500)', background: index === 0 ? 'var(--blue500)' : 'var(--bg)', color: 'var(--static-white)', display: 'grid', placeItems: 'center' }}>{index === 0 && <Icon name="check" size={14}/>}</div>
          <div className="tm-text-label">{item}</div>
        </Card>
      ))}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <SMRevisionMatchCreateField label="총비용" value="200000" placeholder="예: 200000" suffix="원"/>
      <SMRevisionMatchCreateField label="상대팀 부담금" placeholder="비워두면 총 비용의 절반" suffix="원"/>
    </div>
    <div style={{ marginTop: 14 }}>
      <div className="tm-text-label">성별 제한</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
        {['무관', '남성', '여성'].map((item, index) => <button key={item} className={`tm-chip ${index === 0 ? 'tm-chip-active' : ''}`}>{item}</button>)}
      </div>
    </div>
    <SMRevisionMatchCreateField label="추가 규칙 (선택)" placeholder="예: 유니폼 필수, 경기 10분 전 도착" multiline/>
  </SMRevisionTeamMatchCreateShellSMFinal>
);

const SMRevisionTeamMatchCreatePlaceTimeStepSMFinal = () => (
  <SMRevisionTeamMatchCreateShellSMFinal step={5}>
    <div className="tm-text-heading">장소와 시간</div>
    <div style={{ marginTop: 16 }}>
      <div className="tm-text-label">시설 선택</div>
      <Card pad={16} interactive style={{ marginTop: 8, borderColor: 'var(--blue500)', background: 'var(--blue50)' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Icon name="mapPin" size={20}/>
          <div style={{ minWidth: 0 }}><div className="tm-text-body-lg">안양천 풋살장</div><div className="tm-text-caption" style={{ marginTop: 4 }}>서울 양천구 안양천로 939</div></div>
        </div>
      </Card>
    </div>
    <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ height: 1, background: 'var(--grey100)', flex: 1 }}/><div className="tm-text-caption">또는 직접 입력</div><div style={{ height: 1, background: 'var(--grey100)', flex: 1 }}/>
    </div>
    <SMRevisionMatchCreateField label="장소 직접 입력" placeholder="예: 한강공원 축구장, 동네 체육관 등"/>
    <SMRevisionMatchCreateField label="날짜" value="2026-05-16" placeholder="연도-월-일"/>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <SMRevisionMatchCreateField label="시작 시간" value="18:00" placeholder="--:--"/>
      <SMRevisionMatchCreateField label="종료 시간" value="20:00" placeholder="--:--"/>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <SMRevisionMatchCreateField label="총 경기시간" value="120" placeholder="분" suffix="분"/>
      <SMRevisionMatchCreateField label="쿼터수" value="4" placeholder="2, 4, 6, 8, 10"/>
    </div>
  </SMRevisionTeamMatchCreateShellSMFinal>
);

const SMRevisionTeamMatchCreateConfirmStepSMFinal = () => (
  <SMRevisionTeamMatchCreateShellSMFinal step={6} primary="팀매치 만들기">
    <div className="tm-text-heading">작성된 내용을 확인해주세요</div>
    <Card pad={0} style={{ marginTop: 16, overflow: 'hidden' }}>
      <div style={{ height: 126, background: 'var(--grey900)', color: 'var(--static-white)', display: 'grid', placeItems: 'center' }}><div className="tm-text-subhead" style={{ color: 'var(--static-white)' }}>강남 FC VS 상대팀</div></div>
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}><Badge tone="blue">풋살</Badge><Badge tone="grey">A+</Badge><Badge tone="grey">5:5</Badge><Badge tone="blue">무료초청</Badge></div>
        <div className="tm-text-subhead">주말 풋살 한판!</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>상대팀을 초대해 즐겁게 경기할 팀매치입니다.</div>
      </div>
    </Card>
    <Card pad={16} style={{ marginTop: 12 }}>
      {[
        ['경기조건', 'A+ · 선출 0명 · 친선/매너 중시 · 빨강 상의 + 검정 하의'],
        ['비용', '총 200,000원 · 상대팀 부담금 0원'],
        ['일시', '2026-05-16 18:00-20:00 · 4쿼터'],
        ['장소', '안양천 풋살장 · 서울 양천구 안양천로 939'],
        ['이미지', '선택된 파일 없음 · 예시 이미지는 저장되지 않음'],
      ].map(([label, value]) => <SMRevisionInfoRow key={label} label={label} value={value}/>)}
    </Card>
  </SMRevisionTeamMatchCreateShellSMFinal>
);

const SMRevisionTeamMatchCreateShareCompleteSMFinal = () => (
  <SMRevisionTeamMatchCreateShellSMFinal step={6} title="팀매치 만들기 완료" primary="팀 채팅에 공유" secondary="상세 보기">
    <div style={{ textAlign: 'center', paddingTop: 12 }}>
      <div style={{ width: 64, height: 64, borderRadius: 22, background: 'rgba(3,178,108,.10)', color: 'var(--green500)', display: 'grid', placeItems: 'center', margin: '0 auto' }}>
        <Icon name="check" size={30}/>
      </div>
      <div className="tm-text-heading" style={{ marginTop: 16 }}>팀매치가 만들어졌어요</div>
      <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)', lineHeight: 1.55 }}>먼저 우리 팀에게 공유해서 참가 가능 여부와 운영 준비를 확인할 수 있습니다.</div>
    </div>
    <Card pad={16} style={{ marginTop: 22, background: 'var(--blue50)', borderColor: 'rgba(49,130,246,.24)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '48px minmax(0, 1fr)', gap: 12, alignItems: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--red500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 22 }}>🔥</div>
        <div style={{ minWidth: 0 }}>
          <div className="tm-text-body-lg">다이나믹 FS 팀 채팅</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>14명에게 팀매치 링크와 경기조건을 공유</div>
        </div>
      </div>
    </Card>
    <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
      {[
        ['팀 채팅에 공유', '팀원에게 링크, 일정, 경기조건을 먼저 보냅니다.', 'blue'],
        ['초대 링크 복사', '외부 메신저나 상대팀에게 전달할 링크를 복사합니다.', 'grey'],
        ['상대팀 후보에게 보내기', '최근 경기한 팀 또는 관심 팀에게 초대 메시지를 보냅니다.', 'grey'],
      ].map(([title, sub, tone], index) => (
        <Card key={title} pad={14} interactive style={{ borderColor: index === 0 ? 'var(--blue500)' : 'var(--grey100)', background: index === 0 ? 'var(--blue50)' : 'var(--bg)' }}>
          <div className="tm-text-label" style={{ color: tone === 'blue' ? 'var(--blue500)' : 'var(--text-strong)' }}>{title}</div>
          <div className="tm-text-caption" style={{ marginTop: 5 }}>{sub}</div>
        </Card>
      ))}
    </div>
    <div style={{ position: 'absolute', left: 20, right: 20, bottom: 132, zIndex: 5, borderRadius: 16, background: 'var(--grey900)', color: 'var(--static-white)', padding: '14px 16px', boxShadow: 'var(--sh-2)' }}>
      <div className="tm-text-label" style={{ color: 'var(--static-white)' }}>팀매치가 생성되었습니다</div>
      <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.72)', marginTop: 3 }}>팀 채팅에 먼저 공유할 수 있어요.</div>
    </div>
  </SMRevisionTeamMatchCreateShellSMFinal>
);

const SMRevisionTeamMatchEditSMFinal = () => (
  <SMRevisionTeamMatchCreateInfoStepSMFinal edit/>
);

const SMRevisionTeamMatchCreateActionRulesSMFinal = () => (
  <SMRevisionPlusBoard eyebrow="04-1 TEAM MATCH CREATE · ACTIONS" title="팀매치 만들기/수정 버튼·입력 동작" sub="04 SM4 팀매치 목록 FAB에서 생성으로 진입하고, 수정은 같은 폼 구조를 prefill 상태로 사용한다." columns={4}>
    <SMRevisionPlusCard index={1} title="FAB" trigger="팀매치 목록 우측 하단 + tap" feedback="pressed scale, /team-matches/new 진입" next="종목 선택 step" state="entry"/>
    <SMRevisionPlusCard index={2} title="경기조건" trigger="등급/방식/유형/style/check tap" feedback="selected chip, checkbox 표시" next="장소와 시간" state="condition"/>
    <SMRevisionPlusCard index={3} title="비용 입력" trigger="총비용/상대 부담금 type" feedback="숫자만 유지, 무료초청이면 부담금 0원" next="확인 화면 반영" state="cost"/>
    <SMRevisionPlusCard index={4} title="수정 저장" trigger="내 팀매치 관리에서 저장 tap" feedback="기존 값 prefill, 변경사항 lock" next="상세 반영 + toast" state="edit"/>
  </SMRevisionPlusBoard>
);

const SMRevisionTeamMatchCreateExceptionRulesSMFinal = () => (
  <SMRevisionPlusBoard eyebrow="04-1 TEAM MATCH CREATE · STATES" title="팀매치 만들기/수정 상황·예외" columns={4}>
    {[
      ['필수값 누락', '종목, 제목, 등급, 경기방식, 장소, 날짜/시간 누락은 다음/제출 disabled reason을 표시한다.', 'disabled reason', 'orange'],
      ['이미지 없음', '선택된 파일 없음은 정상 상태이며 예시 이미지는 제출 데이터에 포함하지 않는다.', 'fallback only', 'blue'],
      ['등급 설명', '긴 등급 설명은 선택 row 안에서 줄바꿈하고 선택값은 확인 화면에서 요약한다.', 'level summary', 'blue'],
      ['무료초청', '무료초청 체크 시 상대팀 부담금은 0원으로 고정하고 비용 충돌을 막는다.', 'cost lock', 'orange'],
      ['시간 오류', '종료 시간이 시작 시간보다 빠르거나 같은 경우 시간 필드에 오류를 표시한다.', 'time invalid', 'red'],
      ['수정 권한 없음', '팀 주장/관리자가 아니거나 이미 종료된 팀매치는 저장 CTA를 차단한다.', 'permission', 'red'],
      ['저장 실패', '입력값은 보존하고 실패 원인, 재시도, 임시저장 선택지를 제공한다.', 'retry', 'red'],
      ['중복 제출', '생성/수정 submit 중에는 CTA를 잠그고 같은 요청을 다시 보내지 않는다.', 'submit lock', 'orange'],
    ].map(([title, body, action, tone]) => <SMRevisionPlusStateCard key={title} title={title} body={body} action={action} tone={tone}/>)}
  </SMRevisionPlusBoard>
);

const SMRevisionTeamMatchCreateFullFlowSMFinal = () => (
  <SMRevisionPlusBoard eyebrow="04-1 TEAM MATCH CREATE · FLOW" title="팀매치 목록 FAB → 만들기 → 수정 전체 흐름" columns={4}>
    {[
      ['1. 조회 화면', '팀매치 목록 우측 하단 + FAB 노출', 'FAB'],
      ['2. 종목', '어떤 종목인지 먼저 선택', 'sport'],
      ['3. 정보', '제목, 설명, 이미지 입력', 'info'],
      ['4. 경기조건', '등급, 선출, 방식, 유형, 스타일, 유니폼, 비용, 성별, 규칙 입력', 'condition'],
      ['5. 장소/시간', '시설 선택 또는 직접 입력, 날짜와 시작/종료, 총 시간, 쿼터수 입력', 'schedule'],
      ['6. 확인', '작성 내용을 카드 형태로 검토하고 각 step 수정 가능', 'confirm'],
      ['7. 생성 완료', 'toast 후 팀 채팅 공유, 링크 복사, 상대팀 후보 공유를 우선 제공', 'share'],
      ['8. 수정', '내 팀매치 관리에서 prefill 폼 진입 후 저장/취소 guard', 'edit'],
    ].map(([title, body, action], index) => <SMRevisionPlusStateCard key={title} title={title} body={body} action={action} tone={index >= 6 ? 'green' : 'blue'}/>)}
  </SMRevisionPlusBoard>
);

Object.assign(globalThis, {
  SMCoreTopBackCompactOptionsMobile,
  SMCoreFixedBottomNavMobile,
  SMCoreNotificationMobile,
  SMCoreSearchTypeExceptionMobile,
  SMCoreFixedSearchBarMobile,
  SMCoreFixedShellActionMatrix,
  SMCoreFixedShellResponsiveBoard,
  SM_FINAL_CORE_ORDER,
  SM_FINAL_CORE_MODULES,
  SMFinalCoreOverviewBoard,
  SMFinalCoreFlowBoard,
  SMFinalCoreChecklistBoard,
  SMRevisionAuthSM5TermsBeforeSignup,
  SMRevisionAuthSM5SignupCompleteGuide,
  SMRevisionAuthSM5SportStep,
  SMRevisionAuthSM5LevelStep,
  SMRevisionAuthSM5RegionStep,
  SMRevisionAuthSM6GapAudit,
  SMRevisionAuthSM6ProviderDenied,
  SMRevisionAuthSM6MissingEmail,
  SMRevisionAuthSM6BlockedAccount,
  SMRevisionAuthSM6AccountResolve,
  SMRevisionAuthSM6LocationPermission,
  SMRevisionAuthSM6ButtonExceptionMatrix,
  SMRevisionAuthSM6AccessibilityMatrix,
  SMRevisionAuthFinalChecklist,
  SMRevisionAuthFinalStateMatrix,
  SMRevisionAuthFinalFlow,
  SMRevisionAuthFinalWelcome,
  SMRevisionMatchDetailEdgeMobileSM5: SMRevisionMatchDetailMobileSM3,
  SMRevisionMatchParticipantsMobileSM5: SMRevisionMatchDetailMobileSM3,
  SMRevisionMatchCreateGapMobileSM5: SMRevisionMatchSM4Flow,
  SMRevisionMatchSM5ActionMatrix: SMRevisionMatchSM4ActionMatrix,
  SMRevisionMatchSM5StateMatrix: SMRevisionMatchSM4StateMatrix,
  SMRevisionMatchSM5Flow: SMRevisionMatchSM4Flow,
  SMRevisionMatchListMobileSM6A,
  SMRevisionMatchListMobileSM6B,
  SMRevisionMatchSM6ListRuleMatrix,
  SMRevisionMatchListMobileSM7,
  SMRevisionMatchSM7FilterSheetOption,
  SMRevisionMatchSM7EmptyTextState,
  SMRevisionMatchSM7SearchErrorToastState,
  SMRevisionMatchSM7SportTopFilterSheetOption,
  SMRevisionMatchSM7TopSearchRules,
  SMRevisionMatchFinalOperationProcess,
  SMRevisionMatchFinalSituationExceptionMatrix,
  SMRevisionMatchFinalButtonInputMatrix,
  SMRevisionMatchFinalButtonExceptionMatrix,
  SMRevisionMatchFinalFullFlow,
  SMRevisionMatchCreateListEntrySMFinal,
  SMRevisionMatchCreateSportStepSMFinal,
  SMRevisionMatchCreateInfoStepSMFinal,
  SMRevisionMatchCreatePlaceTimeStepSMFinal,
  SMRevisionMatchCreateConfirmStepSMFinal,
  SMRevisionMatchCreateShareCompleteSMFinal,
  SMRevisionMatchEditSMFinal,
  SMRevisionMatchCreateActionRulesSMFinal,
  SMRevisionMatchCreateExceptionRulesSMFinal,
  SMRevisionMatchCreateFullFlowSMFinal,
  SMRevisionTeamMatchCreateListEntrySMFinal,
  SMRevisionTeamMatchCreateTeamStepSMFinal,
  SMRevisionTeamMatchCreateSportStepSMFinal,
  SMRevisionTeamMatchCreateInfoStepSMFinal,
  SMRevisionTeamMatchCreateConditionStepSMFinal,
  SMRevisionTeamMatchCreatePlaceTimeStepSMFinal,
  SMRevisionTeamMatchCreateConfirmStepSMFinal,
  SMRevisionTeamMatchCreateShareCompleteSMFinal,
  SMRevisionTeamMatchEditSMFinal,
  SMRevisionTeamMatchCreateActionRulesSMFinal,
  SMRevisionTeamMatchCreateExceptionRulesSMFinal,
  SMRevisionTeamMatchCreateFullFlowSMFinal,
  SMRevisionTeamBrowseMobileSM3: SMRevisionTeamBrowseMobileSM3Restored,
  SMRevisionTeamBrowseSearchMobileSM3: SMRevisionTeamBrowseSearchMobileSM3Restored,
  SMRevisionTeamBrowseJoinSheetSM3: SMRevisionTeamBrowseJoinSheetSM3Restored,
  SMRevisionTeamBrowseMembershipStateSM3: SMRevisionTeamBrowseMembershipStateSM3Restored,
  SMRevisionTeamBrowseSM3ActionMatrix: SMRevisionTeamBrowseSM3ActionMatrixRestored,
  SMRevisionTeamBrowseSM3StateMatrix: SMRevisionTeamBrowseSM3StateMatrixRestored,
  SMRevisionTeamBrowseSM3Flow: SMRevisionTeamBrowseSM3FlowRestored,
  SMRevisionTeamBrowseMobileSM4: SMRevisionTeamBrowseMobileSM4Restored,
  SMRevisionTeamBrowseSM4TopbarRule: SMRevisionTeamBrowseSM4TopbarRuleRestored,
  SMRevisionCommunitySM3GapAudit: SMRevisionCommunityMobileGridSM2,
  SMRevisionCommunitySM3ActionMatrix: SMRevisionCommunityMobileGridSM2,
  SMRevisionCommunitySM3StateMatrix: SMRevisionCommunityMobileGridSM2,
  SMRevisionCommunitySM3FailureMobile: SMRevisionNotificationsMobileSM2,
  SMRevisionNotificationsRaceMobileSM3: SMRevisionNotificationsMobileSM2,
  SMRevisionCommunityMobileGridSM3: SMRevisionCommunityMobileGridSM2,
  SMRevisionHomeChatEntryMobileSM4: SMRevisionChatListMobileSM2,
  SMRevisionChatListMobileSM4: SMRevisionChatListMobileSM2,
  SMRevisionCommunitySM4ActionMatrix: SMRevisionCommunityMobileGridSM2,
  SMRevisionCommunityMobileGridSM4: SMRevisionCommunityMobileGridSM2,
  SMRevisionChatListMobileSM5: SMRevisionChatListMobileSM2,
  SMRevisionCommunitySM5ActionMatrix: SMRevisionCommunityMobileGridSM2,
  SMRevisionCommunityMobileGridSM5: SMRevisionCommunityMobileGridSM2,
  SMRevisionCommunityMobileGridSM6: SMRevisionCommunityMobileGridSM2,
  SMRevisionCommunityMobileGridSM7: SMRevisionCommunityMobileGridSM2,
  SMRevisionChatListMobileSM8: SMRevisionChatListMobileSM2,
  SMRevisionCommunitySM8ActionMatrix: SMRevisionCommunityMobileGridSM2,
  SMRevisionCommunityMobileGridSM8: SMRevisionCommunityMobileGridSM2,
  SMRevisionCommunityFinalHomeChatEntry,
  SMRevisionChatFullRowSM9,
  SMRevisionChatListMobileSM9,
  SMRevisionCommunitySM9ActionMatrix,
  SMRevisionCommunityMobileGridSM9,
  SMRevisionProfileActivityHubMobileSM3: SMRevisionProfileReviewMobileSM2,
  SMRevisionProfileEditMobileSM3: SMRevisionProfileReviewMobileSM2,
  SMRevisionProfilePrivacyTrustMobileSM3: SMRevisionProfileStateMobileSM2,
  SMRevisionReviewWriteStateMobileSM3: SMRevisionReviewWriteMobileSM2,
  SMRevisionProfileSM3ActionMatrix: SMRevisionProfileReviewMobileGridSM2,
  SMRevisionProfileSM3StateMatrix: SMRevisionProfileStateMobileSM2,
  SMRevisionProfileSM3Flow: SMRevisionProfileReviewMobileGridSM2,
  SMRevisionHomeSearchMobileSM4: SMRevisionHomeSearchMobileSM5Final,
  SMRevisionHomeSearchNoInputMobileSM4: () => <SMRevisionHomeSearchMobileSM5Final query="" noInput/>,
  SMRevisionHomeSearchStateMobileSM4B: SMRevisionHomeSearchStateMobileSM5Final,
  SMRevisionHomeSearchRulesSM4: SMRevisionHomeSearchRulesSM5Final,
  SMRevisionHomeSM4ActionMatrix: SMRevisionHomeSM3ActionMatrix,
  SMRevisionHomeSM4SearchActionMatrixB: SMRevisionHomeSM5SearchActionMatrixFinal,
  SMRevisionHomeSM4StateMatrix: SMRevisionHomeSM3StateMatrix,
  SMRevisionHomeSM4Flow: SMRevisionHomeSM3Flow,
  SMRevisionHomeSearchMobileSM5: SMRevisionHomeSearchMobileSM5Final,
  SMRevisionHomeSearchNoInputMobileSM5: () => <SMRevisionHomeSearchMobileSM5Final query="" noInput/>,
  SMRevisionHomeSearchStateMobileSM5: SMRevisionHomeSearchStateMobileSM5Final,
  SMRevisionHomeSearchRulesSM5: SMRevisionHomeSearchRulesSM5Final,
  SMRevisionHomeSM5SearchActionMatrix: SMRevisionHomeSM5SearchActionMatrixFinal,
});

const SMRevisionHomeSearchAssistBlockFinal = () => (
  <>
    <div className="tm-text-label">최근 검색</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
      {['동네', '강남', '오늘 대기', '마감임박'].map((label, index) => (
        <button key={label} className={`tm-chip ${index === 0 ? 'tm-chip-active' : ''}`}>{label}</button>
      ))}
    </div>
    <div className="tm-text-label" style={{ marginTop: 20 }}>빠른 조건</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
      {[
        ['오늘 참여 가능', '오늘 매치만 기준'],
        ['마감임박', '24시간 이내'],
        ['초보 환영', '레벨 필터 적용'],
        ['팀 매치 포함', '팀매치 결과 함께 보기'],
      ].map(([title, sub], index) => (
        <Card key={title} pad={14} interactive style={{ background: index === 0 ? 'var(--blue50)' : 'var(--bg)' }}>
          <div className="tm-text-label" style={{ color: index === 0 ? 'var(--blue500)' : 'var(--text-strong)' }}>{title}</div>
          <div className="tm-text-micro" style={{ marginTop: 4, color: 'var(--text-caption)' }}>{sub}</div>
        </Card>
      ))}
    </div>
  </>
);

const SMRevisionHomeSearchFinalMobile = ({ query = '동네', noInput = false }) => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <SMRevisionSearchBarFinal value={query}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px 22px' }}>
      <SMRevisionHomeSearchAssistBlockFinal/>
      {noInput ? (
        <Card pad={18} style={{ marginTop: 20, background: 'var(--grey50)' }}>
          <Badge tone="grey" size="sm">입력 전</Badge>
          <div className="tm-text-subhead" style={{ marginTop: 10 }}>검색어를 입력하거나 조건을 선택해 주세요</div>
          <div className="tm-text-caption" style={{ marginTop: 7, lineHeight: 1.55 }}>검색 진입 직후에는 결과 리스트를 비우고 최근 검색과 빠른 조건을 먼저 보여준다.</div>
        </Card>
      ) : (
        <>
          <div style={{ height: 1, background: 'var(--grey100)', margin: '20px 0 18px' }}/>
          <div>
            <div className="tm-text-label">검색 결과</div>
            <div className="tm-text-caption" style={{ marginTop: 2 }}><span className="tab-num">23</span>개 결과 · 매치/팀매치/팀 통합 조회</div>
          </div>
          <div style={{ marginTop: 12 }}><SMRevisionHomeSearchResultsV2 variant="grouped"/></div>
        </>
      )}
    </div>
  </div>
);

const SMRevisionHomeSearchFinalNoInputMobile = () => (
  <SMRevisionHomeSearchFinalMobile query="" noInput/>
);

const SMRevisionHomeSearchFinalStateMobile = ({ state = 'empty' }) => {
  const isError = state === 'error';
  const isStale = state === 'stale';
  return (
    <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <StatusBar/>
      <SMRevisionSearchBarFinal value="동네 강남" error={isError}/>
      <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px 24px' }}>
        <SMRevisionHomeSearchAssistBlockFinal/>
        <div style={{ height: 1, background: 'var(--grey100)', margin: '20px 0 18px' }}/>
        <div>
          <div className="tm-text-label">검색 결과</div>
          <div className="tm-text-caption" style={{ marginTop: 2 }}>동네 강남 · 매치/팀매치/팀 통합 조회</div>
        </div>
        <div style={{ marginTop: 42, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ width: 48, height: 48, borderRadius: 16, background: 'var(--grey50)', display: 'grid', placeItems: 'center', margin: '0 auto 14px', color: 'var(--grey500)' }}>
            <Icon name={isStale ? 'clock' : 'search'} size={22}/>
          </div>
          <div className="tm-text-body-lg">{isStale ? '최신 검색 결과를 확인 중입니다.' : '검색 결과가 없습니다.'}</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>{isError ? '입력창 상태는 유지하고 하단 안내만 보여줍니다.' : '검색어를 수정하거나 다른 조건을 선택해 주세요.'}</div>
        </div>
      </div>
      {isError && (
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 22, minHeight: 48, borderRadius: 14, background: 'rgba(25,31,40,.94)', color: 'var(--static-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 14px', fontSize: 13, fontWeight: 700 }}>
          새로고침이 필요합니다. 잠시 후 다시 검색해 주세요.
        </div>
      )}
    </div>
  );
};

const SMRevisionHomeSearchFinalRules = () => (
  <SMRevisionPlusBoard eyebrow="02 HOME FINAL · SEARCH CONTRACT" title="홈 검색 최종 규약" sub="SM5 결정을 통합한 최종본. 검색 결과, 결과 없음, 오류, stale 상태 모두 최근 검색과 빠른 조건을 유지한다." columns={3}>
    <SMRevisionPlusStateCard title="검색바" body="00 SM 최종의 back형 검색바를 사용한다. 값이 있을 때 회색 원형 X, 우측 blue ghost 검색 아이콘을 노출한다." action="fixed"/>
    <SMRevisionPlusStateCard title="최근 검색/빠른 조건" body="정상 결과, 미입력, 결과 없음, 오류, stale 모든 상태에서 검색 보조 영역을 유지한다." action="persistent"/>
    <SMRevisionPlusStateCard title="결과 없음" body="검색 결과 헤더 아래에 '검색 결과가 없습니다.' 문구만 보여준다. 조건 초기화 CTA와 전체보기 CTA는 없다." action="empty text"/>
    <SMRevisionPlusStateCard title="오류" body="입력창 red border는 유지하고 하단 toast만 띄운다. 오류 카드나 재시도 CTA는 두지 않는다." action="toast"/>
    <SMRevisionPlusStateCard title="위치 기반" body="위치 권한/내 주변 5km 예외는 홈 검색 최종본에서 제거한다." action="removed"/>
    <SMRevisionPlusStateCard title="전환" body="결과 row와 그룹 더보기가 route entry다. 검색 결과 전체보기는 사용하지 않는다." action="route"/>
  </SMRevisionPlusBoard>
);

const SMRevisionHomeFinalSearchActionMatrix = () => (
  <SMRevisionPlusBoard eyebrow="02 HOME FINAL · SEARCH ACTIONS" title="홈 검색 최종 버튼/예외" sub="SM5의 버튼 결정을 최종본으로 정리한다. 최근 검색/빠른 조건은 모든 예외 상태에서 유지한다." columns={4}>
    <SMRevisionPlusCard index={1} title="뒤로가기" trigger="좌측 back tap" feedback="ghost press" next="홈 main 복귀" state="nav"/>
    <SMRevisionPlusCard index={2} title="검색 입력" trigger="input focus/type" feedback="blue border, cursor" next="X 노출 + 검색 실행 대기" state="input"/>
    <SMRevisionPlusCard index={3} title="X 지우기" trigger="회색 원형 X tap" feedback="query만 제거" next="미입력 페이지, 보조 영역 유지" state="clear"/>
    <SMRevisionPlusCard index={4} title="검색 실행" trigger="우측 ghost search tap / Enter" feedback="pending" next="결과/empty/error/stale" state="submit"/>
    <SMRevisionPlusCard index={5} title="최근 검색" trigger="recent chip tap" feedback="chip active" next="query 대체 + 결과 갱신" state="chip"/>
    <SMRevisionPlusCard index={6} title="빠른 조건" trigger="condition card tap" feedback="selected surface" next="조건 적용 + 결과 갱신" state="filter"/>
    <SMRevisionPlusCard index={7} title="결과 없음" trigger="0 results" feedback="결과 헤더 + 문구만 표시" next="보조 영역에서 재선택 대기" state="empty"/>
    <SMRevisionPlusCard index={8} title="오류 toast" trigger="refresh required" feedback="red input + bottom toast" next="query/보조 영역 유지" state="toast" tone="red"/>
    <SMRevisionPlusCard index={9} title="stale" trigger="late response" feedback="최신 검색 확인 문구" next="마지막 query 기준 유지" state="race"/>
    <SMRevisionPlusCard index={10} title="그룹 더보기" trigger="매치/팀매치/팀 더보기 tap" feedback="group context 보존" next="해당 타입 list" state="route"/>
    <SMRevisionPlusCard index={11} title="결과 row" trigger="row tap" feedback="row press" next="타입별 상세/목록" state="detail"/>
    <SMRevisionPlusCard index={12} title="제거 항목" trigger="전체보기/위치권한" feedback="not rendered" next="사용하지 않음" state="removed"/>
  </SMRevisionPlusBoard>
);

const SM_NOTICE_ITEMS = [
  {
    tag: '고정',
    title: '이번 주 고정 공지',
    sub: '주말 경기장 입장 시간과 체크인 안내',
    date: '오늘',
    body: [
      '이번 주말 참여자는 경기 시작 20분 전까지 도착해 주세요.',
      '현장 체크인은 호스트가 공지한 위치에서 진행되며, 늦게 도착하면 참여 승인이 지연될 수 있습니다.',
      '우천 또는 시설 사정으로 일정이 바뀌면 알림과 채팅방 공지로 다시 안내합니다.',
    ],
  },
  {
    tag: '업데이트',
    title: '매너 점수 업데이트',
    sub: '경기 후 리뷰 반영 기준 안내',
    date: '어제',
    body: [
      '경기 종료 후 남긴 리뷰와 노쇼 신고는 매너 점수에 순차 반영됩니다.',
      '확인 중인 신고는 바로 점수에 반영하지 않고, 운영 검토가 끝난 뒤 상태를 표시합니다.',
    ],
  },
  {
    tag: '안내',
    title: '비 예보 경기 안내',
    sub: '우천 시 취소와 환불 기준 확인',
    date: '5월 2일',
    body: [
      '비 예보가 있는 경기는 호스트와 시설 상태를 확인한 뒤 취소 여부를 결정합니다.',
      '결제가 포함된 경기는 취소 사유와 환불 상태를 결제 내역에서 함께 확인할 수 있습니다.',
    ],
  },
];

const SMNoticeTopBar = ({ title = '공지사항', back = false }) => (
  <div style={{ minHeight: 56, padding: '8px 12px', borderBottom: '1px solid var(--grey100)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', flexShrink: 0 }}>
    {back && (
      <button aria-label="뒤로가기" className="tm-btn tm-btn-icon tm-btn-ghost" style={{ width: 40, height: 40, borderRadius: 12 }}>
        <Icon name="chevL" size={20}/>
      </button>
    )}
    <div className="tm-text-body-lg" style={{ flex: 1, color: 'var(--text-strong)' }}>{title}</div>
    <button aria-label="알림" className="tm-btn tm-btn-icon tm-btn-ghost" style={{ width: 40, height: 40, borderRadius: 12, color: 'var(--blue500)' }}>
      <Icon name="bell" size={19}/>
    </button>
  </div>
);

const SMNoticeRow = ({ item, active = false }) => (
  <button className="tm-pressable tm-break-keep" type="button" style={{
    width: '100%',
    minHeight: 82,
    padding: '14px 16px',
    borderRadius: 16,
    background: active ? 'var(--blue50)' : 'var(--bg)',
    border: active ? '1px solid var(--blue200)' : '1px solid var(--grey100)',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    textAlign: 'left',
  }}>
    <span style={{ width: 38, height: 38, borderRadius: 14, background: active ? 'var(--blue500)' : 'var(--grey100)', color: active ? 'var(--static-white)' : 'var(--blue500)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
      <Icon name="bell" size={18}/>
    </span>
    <span style={{ flex: 1, minWidth: 0 }}>
      <span className="tm-text-micro" style={{ display: 'block', color: active ? 'var(--blue500)' : 'var(--text-caption)' }}>{item.tag} · {item.date}</span>
      <span className="tm-text-label" style={{ display: 'block', marginTop: 4, color: 'var(--text-strong)' }}>{item.title}</span>
      <span className="tm-text-caption line-clamp-2" style={{ display: 'block', marginTop: 3, color: 'var(--text-muted)' }}>{item.sub}</span>
    </span>
    <Icon name="chevR" size={17} color="var(--grey400)"/>
  </button>
);

const SMRevisionHomeNoticeListFinal = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <SMNoticeTopBar/>
    <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px 24px' }}>
      <div className="tm-text-heading">공지사항</div>
      <div className="tm-text-caption" style={{ marginTop: 6, color: 'var(--text-muted)', lineHeight: 1.55 }}>
        홈에 노출되는 고정 공지와 운영 안내를 한곳에서 확인합니다.
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 18, overflowX: 'auto', paddingBottom: 2 }}>
        {['전체', '고정', '업데이트', '안내'].map((label, index) => (
          <button key={label} className={`tm-chip ${index === 0 ? 'tm-chip-active' : ''}`}>{label}</button>
        ))}
      </div>
      <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
        {SM_NOTICE_ITEMS.map((item, index) => <SMNoticeRow key={item.title} item={item} active={index === 0}/>)}
      </div>
    </div>
    <SMBottomNav active="home"/>
  </div>
);

const SMRevisionHomeNoticeDetailFinal = () => {
  const item = SM_NOTICE_ITEMS[0];
  return (
    <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <StatusBar/>
      <SMNoticeTopBar title="공지 상세" back/>
      <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px 28px' }}>
        <Badge tone="blue" size="sm">{item.tag}</Badge>
        <div className="tm-text-heading" style={{ marginTop: 12 }}>{item.title}</div>
        <div className="tm-text-caption" style={{ marginTop: 6, color: 'var(--text-muted)' }}>{item.date} · teameet 운영팀</div>
        <Card pad={18} style={{ marginTop: 18, background: 'var(--grey50)' }}>
          <div className="tm-text-label">요약</div>
          <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-strong)', lineHeight: 1.6 }}>{item.sub}</div>
        </Card>
        <div style={{ marginTop: 22, display: 'grid', gap: 14 }}>
          {item.body.map((paragraph) => (
            <p key={paragraph} className="tm-text-body" style={{ margin: 0, color: 'var(--text-strong)', lineHeight: 1.75 }}>{paragraph}</p>
          ))}
        </div>
        <Card pad={16} interactive style={{ marginTop: 24, borderColor: 'var(--blue200)', background: 'var(--blue50)' }}>
          <div className="tm-text-label" style={{ color: 'var(--blue500)' }}>관련 매치 확인</div>
          <div className="tm-text-caption" style={{ marginTop: 6, color: 'var(--text-muted)', lineHeight: 1.55 }}>
            체크인 시간이 바뀐 경기는 매치 상세와 채팅방 공지에 같은 내용을 표시합니다.
          </div>
        </Card>
      </div>
    </div>
  );
};

Object.assign(globalThis, {
  SMRevisionHomeSearchFinalMobile,
  SMRevisionHomeSearchFinalNoInputMobile,
  SMRevisionHomeSearchFinalStateMobile,
  SMRevisionHomeSearchFinalRules,
  SMRevisionHomeFinalSearchActionMatrix,
  SMRevisionHomeNoticeListFinal,
  SMRevisionHomeNoticeDetailFinal,
});

const SMRevisionTeamBrowseSearchBarSM5 = ({ query = '', error = false, filterCount = 3 }) => (
  <div style={{ minHeight: 56, padding: '8px 10px 8px 20px', borderBottom: '1px solid var(--grey100)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', flexShrink: 0 }}>
    <div style={{ flex: 1, minHeight: 44, borderRadius: 14, background: 'var(--grey100)', border: error ? '1px solid var(--red500)' : query ? '1px solid var(--blue500)' : '1px solid transparent', display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px 0 14px', minWidth: 0 }}>
      <div className="tm-text-body" style={{ flex: 1, minWidth: 0, color: query ? 'var(--text-strong)' : 'var(--text-placeholder)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {query || '팀명, 지역, 종목 검색'}
      </div>
      {query && (
        <button aria-label="검색어 지우기" style={{ width: 30, minWidth: 30, height: 30, border: 0, background: 'transparent', display: 'grid', placeItems: 'center', padding: 0 }}>
          <span style={{ width: 20, height: 20, borderRadius: 999, background: 'var(--grey400)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 14, lineHeight: '20px', fontWeight: 800 }}>x</span>
        </button>
      )}
      <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="팀 검색 실행" style={{ width: 34, minWidth: 34, height: 34, borderRadius: 11, color: error ? 'var(--red500)' : 'var(--blue500)' }}>
        <Icon name="search" size={19}/>
      </button>
    </div>
    <button aria-label={`필터 ${filterCount}개 적용`} style={{ width: 40, minWidth: 40, height: 40, border: 0, background: 'transparent', borderRadius: 12, display: 'grid', placeItems: 'center', color: 'var(--text-strong)', padding: 0, position: 'relative' }}>
      <Icon name="filter" size={21}/>
      {filterCount > 0 && (
        <span className="tab-num" style={{ position: 'absolute', top: 4, right: 3, minWidth: 17, height: 17, padding: '0 4px', borderRadius: 999, background: 'var(--blue500)', color: 'var(--static-white)', fontSize: 10, fontWeight: 800, display: 'grid', placeItems: 'center' }}>{filterCount}</span>
      )}
    </button>
  </div>
);

const SMRevisionMyPageSM1 = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
      <div style={{ padding: '20px 20px 0', background: 'var(--grey50)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'linear-gradient(135deg,var(--blue500),var(--purple500))', display: 'grid', placeItems: 'center', fontSize: 28, color: 'var(--static-white)', flexShrink: 0 }}>김</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-strong)', letterSpacing: 0 }}>김정민</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, fontWeight: 500 }}>@jungmin · 서울 강남구</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
              {['축구', '러닝'].map((t) => <span key={t} style={{ padding: '3px 10px', borderRadius: 999, background: 'var(--blue50)', color: 'var(--blue500)', fontSize: 11, fontWeight: 700 }}>{t}</span>)}
            </div>
          </div>
          <button className="tm-pressable tm-break-keep" style={{ height: 34, padding: '0 14px', borderRadius: 999, background: 'var(--grey200)', border: 'none', fontSize: 12, fontWeight: 700, color: 'var(--text-strong)', cursor: 'pointer' }}>편집</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderTop: '1px solid var(--border)', paddingTop: 16, paddingBottom: 16, gap: 0 }}>
          {[{ l: '매치', v: 87 }, { l: '팀', v: 3 }, { l: '매너', v: '4.9' }, { l: '뱃지', v: 12 }].map((k, i) => (
            <div key={k.l} style={{ textAlign: 'center', borderRight: i < 3 ? '1px solid var(--border)' : undefined }}>
              <div className="tab-num" style={{ fontSize: 22, fontWeight: 800, color: i === 2 ? 'var(--orange500)' : 'var(--text-strong)' }}>{k.v}</div>
              <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 500, marginTop: 2 }}>{k.l}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ margin: '16px 20px', padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>이번 달 활동</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          <KPIStat label="경기" value={12} unit="회" delta={3} deltaLabel="회"/>
          <KPIStat label="이동 거리" value={34} unit="km" delta={8} deltaLabel="km"/>
          <KPIStat label="승률" value="68" unit="%"/>
        </div>
      </div>
      {[
        { section: '내 활동', items: [{ icon: 'M', t: '내 매치' }, { icon: 'T', t: '팀 매칭' }] },
        { section: '커뮤니티', items: [{ icon: '팀', t: '내 팀' }, { icon: '리', t: '받은 리뷰' }, { icon: '배', t: '뱃지' }] },
        { section: '설정', items: [{ icon: '알', t: '알림 설정' }, { icon: '계', t: '계정 설정' }, { icon: '?', t: '고객센터' }] },
      ].map((sec) => (
        <div key={sec.section} style={{ marginBottom: 8 }}>
          <div style={{ padding: '12px 20px 4px', fontSize: 12, color: 'var(--text-caption)', fontWeight: 700, letterSpacing: .3 }}>{sec.section}</div>
          {sec.items.map((item) => (
            <ListItem key={item.t} leading={<div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--grey100)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, color: 'var(--text-muted)' }}>{item.icon}</div>} title={item.t} chev onClick={() => {}}/>
          ))}
        </div>
      ))}
      <div style={{ padding: '20px 20px 0' }}>
        <button className="tm-pressable tm-break-keep" style={{ width: '100%', height: 48, borderRadius: 12, background: 'var(--red50)', border: 'none', color: 'var(--red500)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>로그아웃</button>
      </div>
    </div>
    <SMBottomNav active="my"/>
  </div>
);

const SMRevisionMyActivitySM1 = () => {
  const history = [
    { sport: '축', title: '상암 주말 축구', date: '2024.12.14', venue: '상암 보조구장', result: 'win' },
    { sport: '농', title: '이태원 3on3 러닝', date: '2024.12.07', venue: '이태원 러닝장', result: 'lose' },
    { sport: '테', title: '강남 수영 복식', date: '2024.11.30', venue: '강남구민체육관', result: 'win' },
    { sport: '배', title: '마포 수영', date: '2024.11.23', venue: '마포스포츠센터', result: 'draw' },
  ];
  return (
    <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <StatusBar/>
      <div style={{ padding: '12px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="tm-pressable tm-break-keep" style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none' }}><Icon name="chevL" size={22}/></button>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>내 활동</div>
        <div style={{ width: 40 }}/>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--grey100)' }}>
        <KPIStat label="총 매치" value={87} unit="회" delta={3} deltaLabel="회"/>
        <KPIStat label="승률" value="68" unit="%"/>
        <KPIStat label="매너" value="4.9" unit="점"/>
      </div>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--grey100)' }}>
        {[{ id: 'matches', label: '내 매치' }, { id: 'teams', label: '팀' }].map((t, i) => (
          <button className="tm-pressable tm-break-keep" key={t.id} style={{ flex: 1, height: 44, background: 'transparent', border: 'none', fontSize: 14, fontWeight: i === 0 ? 700 : 500, color: i === 0 ? 'var(--text-strong)' : 'var(--text-caption)', borderBottom: i === 0 ? '2px solid var(--grey900)' : 'none', cursor: 'pointer' }}>{t.label}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
        {history.map((h) => (
          <div key={`${h.title}-${h.date}`} style={{ display: 'flex', gap: 14, padding: '14px 20px', borderBottom: '1px solid var(--grey100)', cursor: 'pointer', alignItems: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--grey100)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0, color: 'var(--text-muted)' }}>{h.sport}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{h.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{h.date} · {h.venue}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ padding: '3px 10px', borderRadius: 999, background: h.result === 'win' ? 'var(--green50)' : h.result === 'lose' ? 'var(--red50)' : 'var(--grey100)', color: h.result === 'win' ? 'var(--green500)' : h.result === 'lose' ? 'var(--red500)' : 'var(--text-muted)', fontSize: 11, fontWeight: 700 }}>{h.result === 'win' ? '승' : h.result === 'lose' ? '패' : '무'}</div>
            </div>
          </div>
        ))}
      </div>
      <SMBottomNav active="my"/>
    </div>
  );
};

const SM1RoleBadge = ({ role }) => {
  const map = {
    owner: ['팀장', 'blue'],
    admin: ['관리자', 'green'],
    member: ['일반 멤버', 'grey'],
  };
  const [label, tone] = map[role] || map.member;
  return <Badge tone={tone} size="sm">{label}</Badge>;
};

const SM1StatusPill = ({ status }) => {
  const map = {
    pending: ['승인중', 'orange'],
    approved: ['승인완료', 'green'],
    ended: ['종료', 'grey'],
    recruiting: ['모집중', 'blue'],
    cancelled: ['취소', 'red'],
  };
  const [label, tone] = map[status] || map.ended;
  return <Badge tone={tone} size="sm">{label}</Badge>;
};

const SM1MyScreen = ({ title, children, bottom = true }) => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <div style={{ height: 52, padding: '6px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--grey100)', flexShrink: 0 }}>
      <button className="tm-pressable tm-break-keep" aria-label="뒤로가기" style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', background: 'transparent', border: 0 }}><Icon name="chevL" size={22}/></button>
      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-strong)' }}>{title}</div>
      <div style={{ width: 40 }}/>
    </div>
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: bottom ? 88 : 18 }}>
      {children}
    </div>
    {bottom && <SMBottomNav active="my"/>}
  </div>
);

const SMRevisionMyMatchesSM1 = ({ category = 'joined' }) => {
  const joined = [
    { title: '상암 주말 축구', meta: '12.14 토 · 상암 보조구장', status: 'pending' },
    { title: '강남 수영 복식', meta: '12.21 토 · 강남구민체육관', status: 'approved' },
    { title: '마포 수영', meta: '11.23 토 · 마포스포츠센터', status: 'ended' },
  ];
  const created = [
    { title: '잠실 러닝 크루 매치', meta: '승인 대기 3명 · 승인완료 8명', status: 'recruiting' },
    { title: '목동 풋살 친선전', meta: '취소 요청 1명 · 종료 예정', status: 'approved' },
  ];
  const isJoined = category === 'joined';
  const list = isJoined ? joined : created;
  return (
    <SM1MyScreen title="내 매치">
      <div style={{ padding: '14px 20px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button className={`tm-btn tm-btn-md ${isJoined ? 'tm-btn-primary' : 'tm-btn-neutral'}`}>참여한 매치</button>
          <button className={`tm-btn tm-btn-md ${!isJoined ? 'tm-btn-primary' : 'tm-btn-neutral'}`}>생성한 매치</button>
        </div>
        <div style={{ marginTop: 18 }}>
          <div className="tm-text-label">{isJoined ? '참여한 매치' : '생성한 매치'}</div>
          <div className="tm-text-caption" style={{ marginTop: 3 }}>
            {isJoined ? '내가 신청한 승인중, 승인완료, 종료된 매치만 이 카테고리에서 보여준다.' : '내가 생성한 매치만 보여주고 참여자 관리와 매치 수정으로 진입한다.'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {list.map((item) => (
              <Card key={item.title} pad={14}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="tm-text-body-lg">{item.title}</div>
                    <div className="tm-text-caption" style={{ marginTop: 4 }}>{item.meta}</div>
                  </div>
                  <SM1StatusPill status={item.status}/>
                </div>
                {!isJoined && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                    <button className="tm-btn tm-btn-sm tm-btn-primary">참여자 관리</button>
                    <button className="tm-btn tm-btn-sm tm-btn-neutral">매치 수정</button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      </div>
    </SM1MyScreen>
  );
};

const SMRevisionMyMatchesJoinedSM1 = () => <SMRevisionMyMatchesSM1 category="joined"/>;
const SMRevisionMyMatchesCreatedSM1 = () => <SMRevisionMyMatchesSM1 category="created"/>;

const SM1ActionDisclosure = ({ children, summary, defaultOpen = false }) => {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <>
      <button
        type="button"
        className="tm-pressable"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{
          width: '100%',
          padding: 0,
          border: 'none',
          background: 'transparent',
          color: 'inherit',
          textAlign: 'left',
        }}
      >
        {summary}
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          {children}
        </div>
      )}
    </>
  );
};

const SM1ConfirmButton = ({ children, className, message, confirmLabel = '확인', style }) => {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  return (
    <div style={{ minWidth: 0, gridColumn: confirmOpen ? '1 / -1' : undefined, ...style }}>
      <button type="button" className={className} onClick={() => setConfirmOpen(true)} style={{ width: '100%' }}>
        {children}
      </button>
      {confirmOpen && (
        <div style={{
          marginTop: 10,
          padding: 14,
          borderRadius: 18,
          border: '1px solid var(--blue200)',
          background: 'linear-gradient(180deg, var(--bg) 0%, var(--blue50) 100%)',
          boxShadow: '0 12px 28px rgba(49,130,246,.14)',
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{
              width: 34,
              height: 34,
              borderRadius: 13,
              background: 'var(--blue500)',
              color: 'var(--static-white)',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}>
              <Icon name="check" size={17}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>한 번 더 확인</div>
              <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)', lineHeight: 1.5 }}>{message}</div>
              <div className="tm-text-micro" style={{ marginTop: 7, color: 'var(--blue500)' }}>확인 후 상태가 바로 반영되는 액션입니다.</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
            <button type="button" className="tm-btn tm-btn-sm tm-btn-neutral" onClick={() => setConfirmOpen(false)}>취소</button>
            <button type="button" className="tm-btn tm-btn-sm tm-btn-primary" onClick={() => setConfirmOpen(false)}>{confirmLabel}</button>
          </div>
        </div>
      )}
    </div>
  );
};

const SM1MemberActionPanel = ({ member }) => {
  const [roleOpen, setRoleOpen] = React.useState(false);
  const isAdmin = member.role === 'admin';
  const options = [
    { id: 'admin', label: '관리자' },
    { id: 'member', label: '일반' },
  ];
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <SM1ConfirmButton
          className="tm-btn tm-btn-sm tm-btn-primary"
          message={`${member.name}님의 공개 유저 정보를 확인할까요?`}
          confirmLabel="보기"
        >
          유저 정보 보기
        </SM1ConfirmButton>
        <button type="button" className="tm-btn tm-btn-sm tm-btn-neutral" onClick={() => setRoleOpen(!roleOpen)}>
          권한 변경
        </button>
      </div>
      {roleOpen && (
        <div style={{ marginTop: 8, padding: 10, borderRadius: 14, background: 'var(--grey50)', border: '1px solid var(--grey100)' }}>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginBottom: 8 }}>변경할 권한을 선택합니다.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {options.map((option) => {
              const current = option.id === 'admin' ? isAdmin : !isAdmin;
              return (
                <SM1ConfirmButton
                  key={option.id}
                  className={`tm-btn tm-btn-sm ${current ? 'tm-btn-primary' : 'tm-btn-neutral'}`}
                  message={`${member.name}님의 권한을 ${option.label}${current ? ' 상태로 유지' : '(으)로 변경'}할까요?`}
                  confirmLabel="적용"
                >
                  {option.label}{current ? ' · 현재' : ''}
                </SM1ConfirmButton>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const SMRevisionMyCreatedMatchManageSM1 = () => {
  const participants = [
    { name: '이도윤', meta: '승인완료 · 출석 예정', status: 'approved' },
    { name: '최민아', meta: '취소 요청 · 사유 확인 필요', status: 'cancelled' },
  ];
  const applicants = [
    { name: '박서준', meta: '신청 8분 전 · 매너 4.8', status: 'pending' },
    { name: '정하늘', meta: '신청 14분 전 · 매너 4.6', status: 'pending' },
  ];
  const [tab, setTab] = React.useState('participants');
  const isParticipants = tab === 'participants';
  const activeUsers = isParticipants ? participants : applicants;
  const activeMode = isParticipants ? 'participant' : 'applicant';
  const activeCopy = isParticipants
    ? '이미 승인되어 참여 중인 신청자와 취소 요청을 관리합니다.'
    : '새로 들어온 신청자는 신청 대기 그룹에서만 승인/거절합니다.';
  const renderUser = (user, mode, index = 0) => (
    <Card key={user.name} pad={14}>
      <SM1ActionDisclosure
        defaultOpen={index === 0}
        summary={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 14, background: 'var(--grey100)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{user.name.slice(0, 1)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tm-text-label">{user.name}</div>
              <div className="tm-text-caption" style={{ marginTop: 3 }}>{user.meta}</div>
            </div>
            <SM1StatusPill status={user.status}/>
          </div>
        )}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {mode === 'applicant' ? (
            <>
              <SM1ConfirmButton className="tm-btn tm-btn-sm tm-btn-primary" message={`${user.name}님의 참가 신청을 승인할까요?`} confirmLabel="승인">
                승인
              </SM1ConfirmButton>
              <SM1ConfirmButton className="tm-btn tm-btn-sm tm-btn-neutral" message={`${user.name}님의 참가 신청을 거절할까요?`} confirmLabel="거절">
                거절
              </SM1ConfirmButton>
            </>
          ) : (
            <>
              <SM1ConfirmButton className="tm-btn tm-btn-sm tm-btn-primary" message={`${user.name}님의 공개 유저 정보를 확인할까요?`} confirmLabel="보기">
                유저 정보 보기
              </SM1ConfirmButton>
              <SM1ConfirmButton className="tm-btn tm-btn-sm tm-btn-neutral" message={`${user.name}님의 ${user.status === 'cancelled' ? '취소 요청을 처리' : '참가 승인을 취소'}할까요?`} confirmLabel="확인">
                {user.status === 'cancelled' ? '취소 처리' : '승인 취소'}
              </SM1ConfirmButton>
            </>
          )}
        </div>
        {mode === 'applicant' && (
          <SM1ConfirmButton
            className="tm-btn tm-btn-sm tm-btn-ghost tm-btn-block"
            style={{ marginTop: 8 }}
            message={`${user.name}님의 공개 유저 정보를 확인할까요?`}
            confirmLabel="보기"
          >
            유저 정보 보기
          </SM1ConfirmButton>
        )}
      </SM1ActionDisclosure>
    </Card>
  );
  return (
    <SM1MyScreen title="참여자 관리" bottom={false}>
      <div style={{ padding: 20 }}>
        <Card pad={16}>
          <div className="tm-text-body-lg">잠실 러닝 크루 매치</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>참여중 8명 · 신청 대기 2명 · 취소 요청 1명</div>
        </Card>
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 4, borderRadius: 14, background: 'var(--grey100)' }}>
          {[
            ['participants', '참여중', participants.length],
            ['applicants', '신청대기', applicants.length],
          ].map(([id, label, count]) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                className="tm-pressable"
                onClick={() => setTab(id)}
                style={{
                  minHeight: 44,
                  borderRadius: 12,
                  border: '1px solid',
                  borderColor: active ? 'var(--blue500)' : 'transparent',
                  background: active ? 'var(--bg)' : 'transparent',
                  color: active ? 'var(--blue500)' : 'var(--text-muted)',
                  fontWeight: 800,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <span className="tm-text-label">{label} {count}</span>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 14 }}>
          <div className="tm-text-label">{isParticipants ? '참여중' : '신청대기'}</div>
          <div className="tm-text-caption" style={{ marginTop: 3 }}>{activeCopy}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            {activeUsers.map((user, index) => renderUser(user, activeMode, index))}
          </div>
        </div>
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" style={{ marginTop: 16 }}>매치 수정으로 이동</button>
      </div>
    </SM1MyScreen>
  );
};

const SMRevisionMyMatchEditSM1 = () => <SMRevisionMatchEditSMFinal/>;

const SMRevisionApplicantUserProfileSM1 = () => (
  <SM1MyScreen title="유저 정보" bottom={false}>
    <div style={{ padding: 20 }}>
      <Card pad={16}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'linear-gradient(135deg,var(--blue500),var(--purple500))', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 26, fontWeight: 900 }}>박</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tm-text-heading">박서준</div>
            <div className="tm-text-caption" style={{ marginTop: 5 }}>@seojoon · 서울 송파 · 풋살/러닝</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
              <Badge tone="green" size="sm">verified</Badge>
              <Badge tone="blue" size="sm">신청자</Badge>
            </div>
          </div>
        </div>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 12 }}>
        {[
          ['매치', '42'],
          ['팀', '3'],
          ['매너', '4.8'],
          ['뱃지', '9'],
        ].map(([label, value]) => (
          <Card key={label} pad={10}>
            <div className="tab-num" style={{ fontSize: 20, fontWeight: 900, color: label === '매너' ? 'var(--orange500)' : 'var(--text-strong)', textAlign: 'center' }}>{value}</div>
            <div className="tm-text-caption" style={{ textAlign: 'center', marginTop: 3 }}>{label}</div>
          </Card>
        ))}
      </div>
      <Card pad={16} style={{ marginTop: 12 }}>
        <div className="tm-text-label">이번 달 활동</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 12 }}>
          <KPIStat label="경기" value={8} unit="회" delta={2} deltaLabel="회"/>
          <KPIStat label="출석률" value="96" unit="%"/>
          <KPIStat label="응답" value="12" unit="분"/>
        </div>
      </Card>
      <div style={{ marginTop: 12 }}>
        <ListItem title="최근 참여 매치" sub="강남 수영 복식 · 승인완료" trailing="4.9" chev/>
        <ListItem title="소속 팀" sub="FC 발빠른놈들 · 강남 러너스 · 마포 수영" trailing="3팀" chev/>
        <ListItem title="받은 뱃지" sub="시간약속 · 매너플레이 · 팀워크" trailing="9개" chev/>
      </div>
      <Card pad={14} style={{ marginTop: 12, background: 'var(--grey50)' }}>
        <div className="tm-text-label">승인 판단 정보</div>
        <div className="tm-text-caption" style={{ marginTop: 5 }}>신청자 정보는 마이페이지가 아니라 공개 유저 정보 페이지로 분리한다. 매치, 팀, 매너, 뱃지, 이번 달 활동을 한 화면에서 검토한다.</div>
      </Card>
    </div>
  </SM1MyScreen>
);

const SMRevisionApplicantTeamProfileSM1 = () => (
  <SM1MyScreen title="신청팀 정보" bottom={false}>
    <div style={{ padding: 20 }}>
      <Card pad={16}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--blue50)', color: 'var(--blue500)', display: 'grid', placeItems: 'center', fontWeight: 900 }}>강동</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tm-text-heading">강동 FC</div>
            <div className="tm-text-caption" style={{ marginTop: 5 }}>풋살 · 서울 강동 · 31명</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
              <Badge tone="green" size="sm">verified</Badge>
              <Badge tone="orange" size="sm">팀매치 신청</Badge>
            </div>
          </div>
        </div>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 12 }}>
        {[
          ['팀매치', '18'],
          ['승률', '64%'],
          ['매너', '4.7'],
          ['뱃지', '6'],
        ].map(([label, value]) => (
          <Card key={label} pad={10}>
            <div className="tab-num" style={{ fontSize: 20, fontWeight: 900, color: label === '매너' ? 'var(--orange500)' : 'var(--text-strong)', textAlign: 'center' }}>{value}</div>
            <div className="tm-text-caption" style={{ textAlign: 'center', marginTop: 3 }}>{label}</div>
          </Card>
        ))}
      </div>
      <Card pad={16} style={{ marginTop: 12 }}>
        <div className="tm-text-label">대표 정보</div>
        <div style={{ marginTop: 10 }}>
          <ListItem title="팀장" sub="한도윤 · 매너 4.9 · 응답 9분" trailing="보기" chev/>
          <ListItem title="예상 라인업" sub="A-B 등급 · 선출 없음 · 6:6 가능" trailing="12명" chev/>
        </div>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
        <SM1ConfirmButton className="tm-btn tm-btn-md tm-btn-primary" message="팀 신청을 승인할까요?" confirmLabel="승인">
          팀 신청 승인
        </SM1ConfirmButton>
        <SM1ConfirmButton className="tm-btn tm-btn-md tm-btn-neutral" message="팀 신청을 거절할까요?" confirmLabel="거절">
          거절
        </SM1ConfirmButton>
      </div>
      <Card pad={14} style={{ marginTop: 12, background: 'var(--grey50)' }}>
        <div className="tm-text-label">팀 정보 연결</div>
        <div className="tm-text-caption" style={{ marginTop: 5 }}>팀이 신청한 경우 신청 row에서 이 팀 정보 페이지로 이동한다. 팀 신뢰 신호와 대표자 정보를 같이 확인한 뒤 승인/거절한다.</div>
      </Card>
    </div>
  </SM1MyScreen>
);

const SMRevisionMyTeamMatchesSM1 = () => (
  <SM1MyScreen title="내 팀매치">
    <div style={{ padding: 20 }}>
      <div className="tm-text-label">내가 생성한 팀매치</div>
      <div className="tm-text-caption" style={{ marginTop: 3 }}>팀매치는 내가 생성한 항목만 보여주고 수정 진입을 제공한다.</div>
      {[
        ['FC 발빠른놈들 vs 강동 FC', '12.29 일 · 상대팀 조율중', 'recruiting'],
        ['목동 풋살 팀매치', '01.04 토 · 조건 확정', 'approved'],
      ].map(([title, meta, status]) => (
        <Card key={title} pad={14} style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div className="tm-text-body-lg">{title}</div>
              <div className="tm-text-caption" style={{ marginTop: 4 }}>{meta}</div>
            </div>
            <SM1StatusPill status={status}/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
            <button className="tm-btn tm-btn-sm tm-btn-primary">신청팀 정보</button>
            <button className="tm-btn tm-btn-sm tm-btn-neutral">팀매치 수정</button>
          </div>
        </Card>
      ))}
    </div>
  </SM1MyScreen>
);

const SMRevisionMyTeamMatchEditSM1 = () => <SMRevisionTeamMatchEditSMFinal/>;

const SMRevisionMyTeamsSM1 = () => (
  <SM1MyScreen title="내 팀">
    <div style={{ padding: 20 }}>
      {[
        ['FC 발빠른놈들', '팀장 · 풋살 · 24명', 'owner'],
        ['강남 러너스', '관리자 · 러닝 · 48명', 'admin'],
        ['마포 수영', '일반 멤버 · 수영 · 18명', 'member'],
      ].map(([name, meta, role]) => (
        <Card key={name} pad={14} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: 'var(--grey100)', display: 'grid', placeItems: 'center', fontWeight: 900 }}>{name.slice(0, 2)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tm-text-body-lg">{name}</div>
              <div className="tm-text-caption" style={{ marginTop: 4 }}>{meta}</div>
            </div>
            <SM1RoleBadge role={role}/>
          </div>
        </Card>
      ))}
    </div>
  </SM1MyScreen>
);

const SMRevisionMyTeamDetailSM1 = () => (
  <SM1MyScreen title="팀 정보">
    <div style={{ padding: 20 }}>
      <Card pad={16}>
        <div className="tm-text-heading">FC 발빠른놈들</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>풋살 · 서울 강남 · 24명 · 내 역할 팀장</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
          <button className="tm-btn tm-btn-md tm-btn-primary">팀 채팅으로 가기</button>
          <button className="tm-btn tm-btn-md tm-btn-neutral">팀 정보</button>
        </div>
      </Card>
      <div style={{ marginTop: 14 }}>
        <ListItem title="멤버 관리" sub="팀장/관리자만 권한 부여와 회수가 가능" trailing="24명" chev/>
        <ListItem title="팀매치 기록" sub="생성한 팀매치와 결과" trailing="8건" chev/>
        <ListItem title="팀 설정" sub="소개, 활동 지역, 모집 상태" trailing="관리" chev/>
      </div>
    </div>
  </SM1MyScreen>
);

const SMRevisionMyTeamMembersSM1 = () => {
  const members = [
    { name: '김정민', meta: '팀 생성자 · 모든 권한', role: 'owner' },
    { name: '박서준', meta: '가입 승인/공지 관리 가능', role: 'admin' },
    { name: '이도윤', meta: '일반 참여 권한', role: 'member' },
  ];
  const requests = [
    { name: '정하늘', meta: '가입 신청 10분 전 · 풋살 · 매너 4.7', role: 'member' },
    { name: '문태오', meta: '초대 링크 신청 · 러닝 병행', role: 'member' },
  ];
  const renderMember = (member, index = 0) => (
    <Card key={member.name} pad={14}>
      {member.role === 'owner' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 14, background: 'var(--grey100)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{member.name.slice(0, 1)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tm-text-label">{member.name}</div>
            <div className="tm-text-caption" style={{ marginTop: 3 }}>{member.meta}</div>
          </div>
          <SM1RoleBadge role={member.role}/>
        </div>
      ) : (
        <SM1ActionDisclosure
          defaultOpen={index === 1}
          summary={(
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 14, background: 'var(--grey100)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{member.name.slice(0, 1)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tm-text-label">{member.name}</div>
                <div className="tm-text-caption" style={{ marginTop: 3 }}>{member.meta}</div>
              </div>
              <SM1RoleBadge role={member.role}/>
            </div>
          )}
        >
          <SM1MemberActionPanel member={member}/>
        </SM1ActionDisclosure>
      )}
    </Card>
  );
  const renderRequest = (member, index = 0) => (
    <Card key={member.name} pad={14}>
      <SM1ActionDisclosure
        defaultOpen={index === 0}
        summary={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 14, background: 'var(--grey100)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{member.name.slice(0, 1)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tm-text-label">{member.name}</div>
              <div className="tm-text-caption" style={{ marginTop: 3 }}>{member.meta}</div>
            </div>
            <SM1StatusPill status="pending"/>
          </div>
        )}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <SM1ConfirmButton className="tm-btn tm-btn-sm tm-btn-primary" message={`${member.name}님의 가입 신청을 승인할까요?`} confirmLabel="승인">
            가입 승인
          </SM1ConfirmButton>
          <SM1ConfirmButton className="tm-btn tm-btn-sm tm-btn-neutral" message={`${member.name}님의 가입 신청을 거절할까요?`} confirmLabel="거절">
            거절
          </SM1ConfirmButton>
        </div>
      </SM1ActionDisclosure>
    </Card>
  );
  return (
    <SM1MyScreen title="멤버 관리" bottom={false}>
      <div style={{ padding: 20 }}>
        <Card pad={16}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: 'var(--blue50)', color: 'var(--blue500)', display: 'grid', placeItems: 'center', fontWeight: 900 }}>FC</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tm-text-body-lg">FC 발빠른놈들</div>
              <div className="tm-text-caption" style={{ marginTop: 4 }}>풋살 · 서울 강남 · 24명</div>
            </div>
            <SM1RoleBadge role="owner"/>
          </div>
        </Card>
        <Card pad={14} style={{ background: 'var(--grey50)', marginTop: 12 }}>
          <div className="tm-text-label">권한 규칙</div>
          <div className="tm-text-caption" style={{ marginTop: 5 }}>팀장과 관리자는 팀원의 권한을 관리자 또는 일반으로 변경할 수 있다. 팀장 권한은 별도 위임 flow가 필요하다.</div>
        </Card>
        <div style={{ marginTop: 14 }}>
          <div className="tm-text-label">팀 멤버</div>
          <div className="tm-text-caption" style={{ marginTop: 3 }}>이미 팀에 속한 멤버의 역할과 권한을 관리한다.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            {members.map(renderMember)}
          </div>
        </div>
        <div style={{ marginTop: 18 }}>
          <div className="tm-text-label">가입 신청</div>
          <div className="tm-text-caption" style={{ marginTop: 3 }}>아직 팀원이 아닌 신청자는 별도 그룹에서 승인/거절한다.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            {requests.map(renderRequest)}
          </div>
        </div>
      </div>
    </SM1MyScreen>
  );
};

const SMRevisionMyManagementGridSM1 = () => (
  <SMRevisionRuleBoard title="07 마이 · SM1 내 활동/팀 관리 grid" items={[
    { title: '내 매치', body: '참여한 매치와 생성한 매치는 같은 화면에 섞지 않는다. 각 카테고리 선택 상태에서 해당 목록만 보여준다.' },
    { title: '생성 매치 관리', body: '참여자별 승인, 거절, 승인 취소, 취소 처리 액션을 같은 화면에서 제공한다.' },
    { title: '신청자 정보', body: '신청자 row를 누르면 마이페이지가 아닌 타 유저 정보 페이지로 이동한다. 매치, 팀, 매너, 뱃지, 이번 달 활동을 모두 보여준다.' },
    { title: '매치 수정', body: '03의 매치 만들기/수정 최종 폼을 재사용한다. 기존 값 prefill, 변경사항 저장, 변경 취소 guard 기준을 따른다.' },
    { title: '팀매치', body: '내가 생성한 팀매치만 보여준다. 신청팀은 팀 정보 페이지로, 수정은 4-1 SM 최종 수정 폼으로 이동한다.' },
    { title: '내 팀', body: '가입한 팀 리스트를 먼저 보여주고 팀 선택 후 팀 채팅, 팀 정보, 멤버 관리로 진입한다.' },
    { title: '관리 그룹 분리', body: '참여자 관리는 참여중/신청 대기, 멤버 관리는 팀 멤버/가입 신청으로 분리해 각 그룹에 맞는 액션만 노출한다.' },
    { title: '팀 권한', body: '팀장은 최상위 권한, 관리자는 운영 권한, 일반 멤버는 참여 권한이다. 팀장/관리자는 관리자 권한 부여와 회수를 처리한다.' },
  ]}/>
);

Object.assign(globalThis, {
  SMRevisionMyPageSM1,
  SMRevisionMyActivitySM1,
  SMRevisionMyMatchesSM1,
  SMRevisionMyMatchesJoinedSM1,
  SMRevisionMyMatchesCreatedSM1,
  SMRevisionMyCreatedMatchManageSM1,
  SMRevisionMyMatchEditSM1,
  SMRevisionApplicantUserProfileSM1,
  SMRevisionApplicantTeamProfileSM1,
  SMRevisionMyTeamMatchesSM1,
  SMRevisionMyTeamMatchEditSM1,
  SMRevisionMyTeamsSM1,
  SMRevisionMyTeamDetailSM1,
  SMRevisionMyTeamMembersSM1,
  SMRevisionMyManagementGridSM1,
});

const SMRevisionTeamBrowseShellSM5 = ({ children, query = '', error = false, filterCount = 3, toast }) => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <SMRevisionTeamBrowseSearchBarSM5 query={query} error={error} filterCount={filterCount}/>
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 12 }}>
      {children}
    </div>
    <SMBottomNav active="teams"/>
    {toast && (
      <div style={{ position: 'absolute', left: 20, right: 20, bottom: 92, minHeight: 48, borderRadius: 14, background: 'rgba(25,31,40,.94)', color: 'var(--static-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 14px', fontSize: 13, fontWeight: 700, zIndex: 5 }}>
        {toast}
      </div>
    )}
  </div>
);

const SMRevisionTeamBrowseChipRowSM5 = () => (
  <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 10 }}>
    {['전체 42', '모집중 18', '내 주변', '초보-중수', '주 1회', '풋살'].map((label, index) => (
      <HapticChip key={label} active={index === 0} count={index === 0 ? 42 : undefined}>{label}</HapticChip>
    ))}
  </div>
);


const SMRevisionTeamBrowseSummarySM5 = () => (
  <div style={{ minHeight: 44, borderRadius: 12, background: 'var(--grey50)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 12px' }}>
    <div className="tm-text-label">서울 전체 · 팀 둘러보기</div>
    <div className="tm-text-caption tab-num">42팀 · 모집중 18 · 내 주변 7</div>
  </div>
);

const SM5_TEAM_INTROS = [
  '주 1회 정기적으로 풋살을 즐기는 동네 팀입니다. 초보-중수 멤버와 빠른 응답을 중요하게 봅니다.',
  '주말 오전 복식 위주로 운영하는 수영 팀입니다. 신입과 여성 멤버가 함께 뛰기 편한 분위기입니다.',
  '3on3 하프코트 러닝를 꾸준히 하는 팀입니다. 경험자 중심이지만 다음 모집 알림을 받을 수 있습니다.',
];

const SM5TeamBrowseCard = ({ team, selected = false, index = 0 }) => (
  <Card pad={16} interactive style={{ borderColor: selected ? 'var(--blue500)' : 'var(--border)', background: selected ? 'var(--blue50)' : 'var(--bg)' }}>
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ width: 54, height: 54, borderRadius: 16, background: selected ? 'var(--blue500)' : 'var(--grey900)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{team.logo}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <div className="tm-text-body-lg line-clamp-2">{team.name}</div>
          <Badge tone={team.tone} size="sm">{team.status}</Badge>
        </div>
        <div className="tm-text-caption" style={{ marginTop: 4 }}>{team.sport} · {team.region} · {team.members}명</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {team.tags.map((tag) => <Badge key={tag} tone="grey" size="sm">{tag}</Badge>)}
        </div>
      </div>
    </div>
    <div style={{ marginTop: 14, borderRadius: 14, background: selected ? 'var(--bg)' : 'var(--grey50)', border: '1px solid var(--grey100)', padding: 12 }}>
      <div className="tm-text-label">팀소개</div>
      <div className="tm-text-body" style={{ marginTop: 6, color: 'var(--text-muted)', lineHeight: 1.5 }}>{SM5_TEAM_INTROS[index] || SM5_TEAM_INTROS[0]}</div>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--grey100)' }}>
      <div className="tm-text-caption">{team.next}</div>
      <SBtn size="sm" variant={team.status === '마감' || team.status === '留덇컧' ? 'neutral' : 'primary'} disabled={team.status === '마감' || team.status === '留덇컧'}>{team.status === '마감' || team.status === '留덇컧' ? '알림받기' : '팀 보기'}</SBtn>
    </div>
  </Card>
);
const SM5TeamInfoRow = ({ label, value, required = false, muted = false }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '92px 1fr', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--grey100)' }}>
    <div className="tm-text-caption" style={{ color: required ? 'var(--text-strong)' : 'var(--text-caption)', fontWeight: required ? 800 : 600 }}>{label}{required ? '*' : ''}</div>
    <div className="tm-text-body" style={{ color: muted ? 'var(--text-muted)' : 'var(--text-strong)', lineHeight: 1.45 }}>{value}</div>
  </div>
);

const SM5TeamInfoChips = ({ items, activeCount = items.length }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
    {items.map((item, index) => (
      <span key={item} className={`tm-chip ${index < activeCount ? 'tm-chip-active' : ''}`} style={{ minHeight: 30, padding: '0 10px' }}>{item}</span>
    ))}
  </div>
);

const SM5TeamImageSlot = ({ title, count = 1, max, example = false }) => (
  <div style={{ borderRadius: 14, border: '1px solid var(--grey100)', background: 'var(--bg)', padding: 12 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <div className="tm-text-label">{title}</div>
      <Badge tone={example ? 'orange' : 'blue'} size="sm">{example ? '예시 이미지' : '기존 이미지'}</Badge>
    </div>
    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} style={{ minWidth: 78, height: 52, borderRadius: 14, background: example ? 'var(--orange50)' : 'var(--blue50)', border: `1px solid ${example ? 'var(--orange100)' : 'var(--blue100)'}`, display: 'grid', placeItems: 'center', textAlign: 'center', color: example ? 'var(--orange500)' : 'var(--blue500)', fontSize: 11, fontWeight: 800, padding: '0 8px' }}>
          {example ? `예시 이미지 ${index + 1}` : `업로드된 이미지 ${index + 1}`}
        </div>
      ))}
      <button className="tm-btn tm-btn-sm tm-btn-neutral">추가</button>
    </div>
    <div className="tm-text-micro" style={{ marginTop: 8, color: 'var(--text-caption)' }}>
      {max ? `${count}/${max} · ` : ''}선택된 파일 없음
    </div>
    <div className="tm-text-micro" style={{ marginTop: 4, color: 'var(--text-caption)' }}>
      {example ? '예시 이미지는 제출 데이터에 포함되지 않아요.' : '업로드한 이미지만 저장되며, 예시 이미지는 제출 데이터에 포함되지 않아요.'}
    </div>
  </div>
);

const SMRevisionTeamBrowseDetailSM5 = () => (
  <SMRevisionShell title="" back notificationNew={false} bottom={false}>
    <div style={{ padding: '18px 20px 118px' }}>
      <Card pad={18} style={{ background: 'var(--grey900)', color: 'var(--static-white)' }}>
        <div style={{ width: 60, height: 60, borderRadius: 18, background: 'var(--blue500)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>TT</div>
        <div className="tm-text-heading" style={{ color: 'var(--static-white)', marginTop: 14 }}>04221553 test</div>
        <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.72)', marginTop: 4 }}>축구 · 풋살 · 러닝 · 인천 연수구 · 모집중</div>
      </Card>

      <SectionTitle title="팀 기본 정보" sub="조회 화면에서도 등록 필수값과 선택값을 빠짐없이 구분합니다."/>
      <Card pad={16}>
        <SM5TeamInfoRow label="팀명" value="04221553 test" required/>
        <div style={{ padding: '10px 0', borderBottom: '1px solid var(--grey100)' }}>
          <div className="tm-text-caption" style={{ color: 'var(--text-strong)', fontWeight: 800, marginBottom: 8 }}>종목 (복수 선택 가능)*</div>
          <SM5TeamInfoChips items={['축구', '풋살', '러닝', '수영', '수영', '수영', '수영', '축구', '배구', '피겨', '쇼트트랙']} activeCount={3}/>
          <div className="tm-text-micro" style={{ color: 'var(--blue500)', marginTop: 8 }}>3개 종목 선택됨</div>
        </div>
        <SM5TeamInfoRow label="팀 소개" value="04221553 test"/>
        <SM5TeamInfoRow label="시/도" value="인천" required/>
        <SM5TeamInfoRow label="구/군" value="연수구"/>
        <SM5TeamInfoRow label="레벨" value="초보"/>
        <SM5TeamInfoRow label="모집 여부" value="모집중 · 모집마감 상태 분리"/>
      </Card>

      <SectionTitle title="SNS 및 링크" sub="비공개 연락처와 외부 링크를 저장값으로 표시합니다."/>
      <Card pad={16}>
        <SM5TeamInfoRow label="연락처" value="비밀"/>
        <SM5TeamInfoRow label="Instagram" value="https://instagram.com/..."/>
        <SM5TeamInfoRow label="YouTube" value="https://youtube.com/..."/>
        <SM5TeamInfoRow label="Kakao" value="https://open.kakao.com/..."/>
        <SM5TeamInfoRow label="Website" value="https://example.com"/>
        <SM5TeamInfoRow label="Shorts" value="YouTube Shorts 또는 Instagram Reels URL · 짧은 영상으로 팀 분위기를 보여줍니다."/>
      </Card>

      <SectionTitle title="이미지" sub="업로드 이미지와 예시 이미지를 시각적으로 구분합니다."/>
      <div style={{ display: 'grid', gap: 10 }}>
        <SM5TeamImageSlot title="로고 이미지" count={1}/>
        <SM5TeamImageSlot title="커버 이미지" count={1}/>
        <SM5TeamImageSlot title="추가 사진" count={3} max={10}/>
        <SM5TeamImageSlot title="예시 이미지" count={2} example/>
      </div>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <div className="tm-text-caption" style={{ marginBottom: 8 }}>예시 이미지는 제출 데이터에 포함되지 않고, 업로드한 이미지만 저장됩니다.</div>
      <SBtn full size="lg">가입 가능 여부 확인</SBtn>
    </div>
  </SMRevisionShell>
);
const SMRevisionTeamBrowseBodySM5 = ({ state = 'results' }) => {
  const isEmpty = state === 'empty';
  const isError = state === 'error';
  const teams = state === 'results' ? SM2_TEAM_BROWSE_TEAMS : SM2_TEAM_BROWSE_TEAMS.slice(0, 2);
  return (
    <div style={{ padding: '14px 20px 96px' }}>
      <SMRevisionTeamBrowseChipRowSM5/>
      {isEmpty || isError ? (
        <EmptyState
          title={isError ? '팀 목록을 불러오지 못했습니다.' : '조건에 맞는 팀이 없습니다.'}
          sub={isError ? '검색어와 필터는 유지하고 다시 시도할 수 있게 합니다. 오류는 red input과 toast로도 알려줍니다.' : '검색어와 필터를 유지한 채 조건 초기화, 추천 팀 보기, 지역 넓히기를 제공합니다.'}
          cta={isError ? '다시 시도' : '필터 초기화'}
        />
      ) : (
        <>
          <SMRevisionTeamBrowseSummarySM5/>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div className="tm-text-label">팀 둘러보기</div>
              <div className="tm-text-caption" style={{ marginTop: 2 }}>00 검색바 + 03/04 필터 구조를 적용한 팀 목록입니다.</div>
            </div>
            <Badge tone="blue" size="sm">검색/필터</Badge>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            {teams.map((team, index) => <SM5TeamBrowseCard key={team.name} team={team} selected={index === 0} index={index}/>)}
          </div>
        </>
      )}
    </div>
  );
};

const SMRevisionTeamBrowseMobileSM5 = () => (
  <SMRevisionTeamBrowseShellSM5 query="" filterCount={3}>
    <SMRevisionTeamBrowseBodySM5/>
  </SMRevisionTeamBrowseShellSM5>
);

const SMRevisionTeamBrowseSearchMobileSM5 = ({ state = 'results' }) => (
  <SMRevisionTeamBrowseShellSM5
    query="강동 풋살"
    error={state === 'error'}
    filterCount={3}
    toast={state === 'error' ? '새로고침이 필요합니다. 잠시 뒤 다시 검색해주세요.' : undefined}
  >
    <SMRevisionTeamBrowseBodySM5 state={state}/>
  </SMRevisionTeamBrowseShellSM5>
);

const SMRevisionTeamBrowseFilterSheetSM5 = () => (
  <SMRevisionTeamBrowseShellSM5 query="강동 동네" filterCount={3}>
    <SMRevisionTeamBrowseBodySM5/>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 74, background: 'rgba(25,31,40,.18)', pointerEvents: 'none' }}/>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 74, borderRadius: '24px 24px 0 0', background: 'var(--bg)', borderTop: '1px solid var(--grey100)', boxShadow: '0 -16px 32px rgba(25,31,40,.14)', padding: '10px 20px 20px' }}>
      <div style={{ width: 42, height: 4, borderRadius: 999, background: 'var(--grey300)', margin: '0 auto 16px' }}/>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="tm-text-subhead">필터</div>
          <div className="tm-text-caption" style={{ marginTop: 2 }}>정렬과 팀 조건을 sheet에서 조정합니다.</div>
        </div>
        <button className="tm-btn tm-btn-sm tm-btn-ghost" style={{ color: 'var(--text-caption)' }}>초기화</button>
      </div>
      {[
        ['정렬', ['추천순', '모집중', '매너 높은순', '최근 활동']],
        ['팀 조건', ['초보-중수', '주 1회 이상', '가입 가능', '여성 환영']],
        ['신뢰 신호', ['verified', 'estimated', 'sample 구분']],
      ].map(([title, options], groupIndex) => (
        <div key={title} style={{ marginTop: 18 }}>
          <div className="tm-text-label">{title}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {options.map((label, index) => <button key={label} className={`tm-chip ${index === 0 && groupIndex < 3 ? 'tm-chip-active' : ''}`}>{label}</button>)}
          </div>
        </div>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 8, marginTop: 18 }}>
        <button className="tm-btn tm-btn-lg tm-btn-neutral">닫기</button>
        <button className="tm-btn tm-btn-lg tm-btn-primary">적용하기</button>
      </div>
    </div>
  </SMRevisionTeamBrowseShellSM5>
);
const SMRevisionTeamBrowseSearchFilterRulesSM5 = () => (
  <SMRevisionPlusBoard eyebrow="05 TEAM BROWSE SM5 - SEARCH/FILTER" title="00 + 03/04 search/filter 적용 기준" columns={4}>
    {[
      ['00 list topbar', '05 목록은 00 최종본의 목록 상단바 기준으로 뒤로가기 없이 검색바와 필터 버튼을 상단에 유지한다.', 'topbar', 'blue'],
      ['03 search pattern', '검색어 입력, X 지우기, 검색 실행, 결과 없음, 오류 toast, stale context 유지 규칙을 개인 매치와 동일하게 적용한다.', '03 search', 'blue'],
      ['04 count summary', '전체팀, 모집중, 내 주변처럼 팀수를 보여주는 3개 요약 박스는 하나의 요약 박스로 합쳐 시각 밀도를 낮춘다.', 'one summary', 'blue'],
      ['filter sheet', 'sheet에는 정렬, 팀 조건, 신뢰 신호를 넣고 적용/닫기 CTA를 분리한다.', 'sheet', 'orange'],
      ['empty/error', 'empty와 error에서도 검색어, chip row, filter count를 유지하고 복구 CTA만 본문에 둔다.', 'state', 'orange'],
      ['team intro', '팀 전체조회 카드에서는 추천 적합도, 매너, 신뢰 지표 3칸을 제거하고 팀소개 요약을 같은 위치에 둔다.', 'intro', 'green'],
      ['navigation', '카드 tap은 팀 상세로 push하고 가입 CTA는 detail 또는 sheet에서만 확정한다.', 'route', 'blue'],
      ['my team', 'my team shortcut destination은 아직 미정이므로 검색 필터 UI 안에 이동 affordance를 만들지 않는다.', 'blocked', 'orange'],
    ].map(([title, body, action, tone], index) => (
      <SMRevisionPlusStateCard key={title} title={`${index + 1}. ${title}`} body={body} action={action} tone={tone}/>
    ))}
  </SMRevisionPlusBoard>
);
Object.assign(globalThis, {
  SMRevisionTeamBrowseMobileSM5,
  SMRevisionTeamBrowseSearchMobileSM5,
  SMRevisionTeamBrowseFilterSheetSM5,
  SMRevisionTeamBrowseDetailSM5,
  SMRevisionTeamBrowseSearchFilterRulesSM5,
});


const SMRevisionHomeSM4ActionMatrixExport = SMRevisionHomeSM3ActionMatrix;
const SMRevisionHomeSM4StateMatrixExport = SMRevisionHomeSM3StateMatrix;
const SMRevisionHomeSM4FlowExport = SMRevisionHomeSM3Flow;
const SMRevisionMatchParticipantsMobileSM5Export = SMRevisionMatchDetailMobileSM3;

export { TokensCSS, SMCoreTopBackCompactOptionsMobile, SMCoreFixedBottomNavMobile, SMCoreNotificationMobile, SMCoreSearchTypeExceptionMobile, SMRevisionHomeMobileV2, SMRevisionHomeSearchFinalMobile, SMRevisionHomeSearchFinalNoInputMobile, SMRevisionHomeSearchFinalStateMobile, SMRevisionHomeStatesV2, SMRevisionHomeUIRulesV2, SMRevisionHomeSearchFinalRules, SMRevisionHomeSM4ActionMatrixExport as SMRevisionHomeSM4ActionMatrix, SMRevisionHomeFinalSearchActionMatrix, SMRevisionHomeSM4StateMatrixExport as SMRevisionHomeSM4StateMatrix, SMRevisionHomeSM4FlowExport as SMRevisionHomeSM4Flow, SMRevisionHomeNoticeListFinal, SMRevisionHomeNoticeDetailFinal, SMRevisionMatchListMobileSM7, SMRevisionMatchSM7FilterSheetOption, SMRevisionMatchSM7EmptyTextState, SMRevisionMatchSM7SearchErrorToastState, SMRevisionMatchDetailMobileSM3, SMRevisionMatchPaymentCompleteToastSMFinal, SMRevisionMatchJoinFeedbackOverlaySM3, SMRevisionMatchParticipantsMobileSM5Export as SMRevisionMatchParticipantsMobileSM5, SMRevisionMatchCreateListEntrySMFinal, SMRevisionMatchCreateSportStepSMFinal, SMRevisionMatchCreateInfoStepSMFinal, SMRevisionMatchCreatePlaceTimeStepSMFinal, SMRevisionMatchCreateConfirmStepSMFinal, SMRevisionMatchCreateShareCompleteSMFinal, SMRevisionMatchEditSMFinal, SMRevisionTeamMatchListMobileSM4, SMRevisionTeamMatchSM4FilterSheetOption, SMRevisionTeamMatchSM4EmptyTextState, SMRevisionTeamMatchSM4SearchErrorToastState, SMRevisionTeamMatchDetailMobileSM2, SMRevisionTeamMatchCreateListEntrySMFinal, SMRevisionTeamMatchCreateTeamStepSMFinal, SMRevisionTeamMatchCreateSportStepSMFinal, SMRevisionTeamMatchCreateInfoStepSMFinal, SMRevisionTeamMatchCreateConditionStepSMFinal, SMRevisionTeamMatchCreatePlaceTimeStepSMFinal, SMRevisionTeamMatchCreateConfirmStepSMFinal, SMRevisionTeamMatchCreateShareCompleteSMFinal, SMRevisionTeamMatchEditSMFinal, SMRevisionTeamBrowseMobileSM5, SMRevisionTeamBrowseSearchMobileSM5, SMRevisionTeamBrowseFilterSheetSM5, SMRevisionTeamBrowseDetailSM5, SMRevisionTeamBrowseSearchFilterRulesSM5, SMRevisionMyPageSM1, SMRevisionMyMatchesJoinedSM1, SMRevisionMyMatchesCreatedSM1, SMRevisionMyCreatedMatchManageSM1, SMRevisionMyMatchEditSM1, SMRevisionApplicantUserProfileSM1, SMRevisionApplicantTeamProfileSM1, SMRevisionMyTeamMatchesSM1, SMRevisionMyTeamMatchEditSM1, SMRevisionMyTeamsSM1, SMRevisionMyTeamDetailSM1, SMRevisionMyTeamMembersSM1, SMRevisionChatListMobileSM2, SMRevisionChatRoomMobileSM2, SMRevisionNotificationsMobileSM2, SMRevisionAuthSM3Login, SMRevisionAuthEmailLoginSM3, SMRevisionAuthSignupSM3, SMRevisionAuthSM3TermsStep, SMRevisionAuthSM5TermsBeforeSignup, SMRevisionAuthSM5SignupCompleteGuide, SMRevisionAuthSM5SportStep, SMRevisionAuthSM5LevelStep, SMRevisionAuthSM5RegionStep, SMRevisionAuthSM4Confirm, SMRevisionAuthSM4Resume, SMRevisionAuthFinalWelcome, SMRevisionAuthSM6ProviderDenied, SMRevisionAuthSM6MissingEmail, SMRevisionAuthSM6BlockedAccount, SMRevisionAuthSM6AccountResolve, SMRevisionAuthSM6LocationPermission, SMRevisionProfileReviewMobileSM2, SMRevisionProfileStateMobileSM2, SMRevisionPaymentMobile, SMRevisionLandingMobile, SMRevisionAdminMobile };

