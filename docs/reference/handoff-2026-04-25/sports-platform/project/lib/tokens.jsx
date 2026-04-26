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

Object.assign(window, { TokensCSS, SBtn, Chip, Badge, Progress, Card, Phone, TabBar, BottomNav, GLOBAL_BOTTOM_TABS, AppBar, TopNav, Icon, StatusBar });
