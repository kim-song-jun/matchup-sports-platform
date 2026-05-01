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

Object.assign(window, {
  NumberDisplay, MoneyRow, KPIStat, SectionTitle, EmptyState, ListItem,
  Skeleton, Toast, StackedAvatars, WeatherStrip, PullHint, HapticChip,
  StatBar, AnnouncementBar, SignatureCSS,
});
