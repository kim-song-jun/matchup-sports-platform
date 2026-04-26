/* fix32 — M18 관리자·운영 풀 grid — canonical visual vocabulary rewrite.
   ID schema: m18-{tb|dt}-{main|detail|list|flow|state|components|assets|motion}[-{variant}]
   Desktop + Admin sidebar dark exception. Mobile 없음.
   AdminSidebar uses .tm-admin-sidebar (dark bg) per tokens.jsx line 264.
   Sidebar dark palette injected via <M18SidebarStyle/> CSS custom properties. */

const M18_TB_W = 1024;
const M18_TB_H = 768;
const M18_DT_W = 1280;
const M18_DT_H = 800;

/* ── Admin routes covered ──
   /admin/dashboard, /admin/disputes/*, /admin/lesson-tickets,
   /admin/lessons, /admin/matches, /admin/mercenary, /admin/ops,
   /admin/payments, /admin/payouts, /admin/reviews, /admin/settlements,
   /admin/statistics, /admin/team-matches/*, /admin/teams,
   /admin/users, /admin/venues
*/

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   M18 dark-exception sidebar palette — injected as CSS custom properties.
   Uses gray-900/800/blue-300 Tailwind equivalents scoped to .tm-admin-sidebar.
   No raw hex in JSX props: all values consumed via var(--sdr-*)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const M18SidebarStyle = () => (
  <style>{`
    .tm-admin-sidebar {
      --sdr-border:    rgb(31,41,55);
      --sdr-active-bg: rgba(49,130,246,.18);
      --sdr-active-fg: rgb(147,197,253);
      --sdr-nav-fg:    rgb(229,231,235);
      --sdr-sub-fg:    rgb(148,163,184);
    }
  `}</style>
);

const M18_SDR_BORDER    = 'var(--sdr-border)';
const M18_SDR_ACTIVE_BG = 'var(--sdr-active-bg)';
const M18_SDR_ACTIVE_FG = 'var(--sdr-active-fg)';
const M18_SDR_NAV_FG    = 'var(--sdr-nav-fg)';
const M18_SDR_SUB_FG    = 'var(--sdr-sub-fg)';

const M18_NAV_ITEMS = [
  ['dash',        '대시보드'],
  ['matches',     '매치'],
  ['team-matches','팀 매치'],
  ['teams',       '팀'],
  ['mercenary',   '용병'],
  ['lessons',     '레슨'],
  ['tickets',     '수강권'],
  ['venues',      '시설'],
  ['users',       '유저'],
  ['reviews',     '리뷰'],
  ['disputes',    '신고·분쟁'],
  ['payments',    '결제'],
  ['settlements', '정산'],
  ['payouts',     '지급'],
  ['statistics',  '통계'],
  ['ops',         '운영 툴'],
];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Admin Shell Primitives
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/* Admin sidebar — dark exception (.tm-admin-sidebar) — palette from M18SidebarStyle vars */
const M18Sidebar = ({ active }) => (
  <><M18SidebarStyle /><aside
    className="tm-admin-sidebar"
    style={{
      width: 220,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflowY: 'auto',
    }}
  >
    {/* Brand */}
    <div style={{
      padding: '20px 20px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      borderBottom: `1px solid ${M18_SDR_BORDER}`,
    }}>
      <div style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: 'var(--blue500)',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--static-white)',
        fontWeight: 800,
        flexShrink: 0,
      }}>
        <span className="tm-text-caption" style={{ fontWeight: 800 }}>T</span>
      </div>
      <div>
        <div className="tm-text-caption" style={{ fontWeight: 800, color: 'var(--static-white)', letterSpacing: 0 }}>Teameet</div>
        <div className="tm-text-micro" style={{ color: M18_SDR_SUB_FG, fontWeight: 500, marginTop: 2 }}>Admin</div>
      </div>
    </div>
    {/* Nav */}
    <nav style={{ padding: '8px 0', flex: 1 }}>
      {M18_NAV_ITEMS.map(([k, l]) => {
        const isActive = active === k;
        return (
          <div
            key={k}
            style={{
              margin: '1px 10px',
              padding: '9px 12px',
              borderRadius: 8,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? M18_SDR_ACTIVE_FG : M18_SDR_NAV_FG,
              background: isActive ? M18_SDR_ACTIVE_BG : 'transparent',
              cursor: 'pointer',
              letterSpacing: 0,
              transition: 'background var(--dur-fast) var(--ease-out-quart)',
              minHeight: 36,
              display: 'flex',
              alignItems: 'center',
            }}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="tm-text-caption">{l}</span>
          </div>
        );
      })}
    </nav>
    {/* Admin user */}
    <div style={{
      padding: '14px 20px',
      borderTop: `1px solid ${M18_SDR_BORDER}`,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      <div style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        background: 'var(--blue500)',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--static-white)',
        fontWeight: 700,
        flexShrink: 0,
      }}>
        <span className="tm-text-micro" style={{ fontWeight: 700 }}>운</span>
      </div>
      <div>
        <div className="tm-text-micro" style={{ fontWeight: 600, color: M18_SDR_NAV_FG }}>운영자</div>
        <div className="tm-text-micro" style={{ color: M18_SDR_SUB_FG, fontWeight: 400, marginTop: 2 }}>super admin</div>
      </div>
    </div>
  </aside></>
);

/* Admin top bar — light content area header */
const M18TopBar = ({ title, actions }) => (
  <div style={{
    height: 60,
    background: 'var(--static-white)',
    borderBottom: '1px solid var(--grey200)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 28px',
    gap: 12,
    flexShrink: 0,
  }}>
    <h1 className="tm-text-subhead" style={{ margin: 0, fontWeight: 800, color: 'var(--text-strong)', letterSpacing: 0 }}>{title}</h1>
    <div style={{ flex: 1 }} />
    {actions}
  </div>
);

/* Admin shell wrapper */
const M18Shell = ({ active, title, actions, children, width = M18_DT_W, height = M18_DT_H }) => (
  <div style={{ width, height, background: 'var(--grey50)', fontFamily: 'var(--font)', display: 'flex', overflow: 'hidden' }}>
    <M18Sidebar active={active} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <M18TopBar title={title} actions={actions} />
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>{children}</div>
    </div>
  </div>
);

/* KPI stat card — same as components/admin/kpi-card.tsx contract */
const M18KpiCard = ({ label, value, sub, tone = 'neutral', deepLink }) => {
  const tones = {
    up:      { num: 'var(--green500)' },
    down:    { num: 'var(--red500)' },
    warn:    { num: 'var(--orange500)' },
    neutral: { num: 'var(--text-strong)' },
  };
  return (
    <div
      style={{
        background: 'var(--static-white)',
        borderRadius: 12,
        border: '1px solid var(--grey200)',
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        cursor: deepLink ? 'pointer' : 'default',
        minHeight: 44,
        transition: 'border-color var(--dur-fast) var(--ease-out-quart)',
      }}
      aria-label={label}
    >
      <div className="tm-text-micro" style={{ color: 'var(--grey600)', fontWeight: 500 }}>{label}</div>
      <div
        className="tab-num tm-text-3xl"
        style={{ fontWeight: 800, color: tones[tone].num, letterSpacing: 0, lineHeight: 1.1 }}
      >
        {value}
      </div>
      {sub && <div className="tm-text-micro" style={{ color: 'var(--grey500)', fontWeight: 400, marginTop: 4 }}>{sub}</div>}
      {deepLink && (
        <div className="tm-text-micro" style={{ color: 'var(--blue500)', fontWeight: 600, marginTop: 4 }}>{deepLink} →</div>
      )}
    </div>
  );
};

/* Dense table row status badge */
const M18StatusBadge = ({ status }) => {
  const map = {
    pending:    { bg: 'var(--orange50)', fg: 'var(--orange500)', label: '대기' },
    processing: { bg: 'var(--blue50)',   fg: 'var(--blue500)',   label: '처리중' },
    reviewing:  { bg: 'var(--blue50)',   fg: 'var(--blue500)',   label: '검토중' },
    resolved:   { bg: 'var(--green50)',  fg: 'var(--green500)',  label: '해결' },
    active:     { bg: 'var(--green50)',  fg: 'var(--green500)',  label: '운영중' },
    failed:     { bg: 'var(--red50)',    fg: 'var(--red500)',    label: '실패' },
    paid:       { bg: 'var(--green50)',  fg: 'var(--green500)',  label: '지급완료' },
    done:       { bg: 'var(--green50)',  fg: 'var(--green500)',  label: '완료' },
    suspended:  { bg: 'var(--red50)',    fg: 'var(--red500)',    label: '정지' },
  };
  const s = map[status] || { bg: 'var(--grey100)', fg: 'var(--grey600)', label: status };
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 8px',
      borderRadius: 4,
      fontWeight: 700,
      background: s.bg,
      color: s.fg,
      whiteSpace: 'nowrap',
    }} className="tm-text-micro">
      {s.label}
    </span>
  );
};

/* Dense admin table shell */
const M18Table = ({ heads, rows, renderRow }) => (
  <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', overflow: 'hidden' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: 'var(--grey50)' }}>
          {heads.map((h, i) => (
            <th key={i} style={{
              padding: '10px 16px',
              textAlign: 'left',
              fontWeight: 600,
              color: 'var(--grey500)',
              borderBottom: '1px solid var(--grey200)',
              whiteSpace: 'nowrap',
            }} className="tm-text-micro">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{
            borderBottom: i < rows.length - 1 ? '1px solid var(--grey100)' : 'none',
            transition: 'background var(--dur-fast) var(--ease-out-quart)',
          }}>
            {renderRow(r, i)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/* Table filter bar */
const M18FilterBar = ({ tabs, active, search }) => (
  <div style={{
    background: 'var(--static-white)',
    borderRadius: '12px 12px 0 0',
    borderTop: '1px solid var(--grey200)',
    borderLeft: '1px solid var(--grey200)',
    borderRight: '1px solid var(--grey200)',
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  }}>
    {tabs.map((t, i) => (
      <div
        key={i}
        style={{
          padding: '5px 12px',
          borderRadius: 999,
          fontWeight: 600,
          background: i === (active ?? 0) ? 'var(--grey900)' : 'var(--grey100)',
          color: i === (active ?? 0) ? 'var(--static-white)' : 'var(--grey700)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          minHeight: 28,
          display: 'flex',
          alignItems: 'center',
        }}
        className="tm-text-caption"
      >
        {t}
      </div>
    ))}
    <div style={{ flex: 1 }} />
    {search && (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        height: 36,
        padding: '0 12px',
        borderRadius: 8,
        background: 'var(--grey100)',
        color: 'var(--grey500)',
      }} className="tm-text-caption">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        {search}
      </div>
    )}
  </div>
);

/* ComponentSwatch / AssetSwatch / ColorSwatch — M18 prefixed (scope-safe) */
const M18ComponentSwatch = ({ label, children }) => (
  <div style={{ marginBottom: 16 }}>
    <div className="tm-text-micro" style={{ color: 'var(--grey500)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    <div style={{ padding: 16, background: 'var(--grey50)', borderRadius: 10, border: '1px solid var(--grey200)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>{children}</div>
  </div>
);

const M18AssetSwatch = ({ label, children }) => (
  <div style={{ marginBottom: 12 }}>
    <div className="tm-text-micro" style={{ color: 'var(--grey500)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>
  </div>
);

const M18ColorSwatch = ({ token, value }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 6, background: 'var(--grey50)', border: '1px solid var(--grey100)' }}>
    <div style={{ width: 24, height: 24, borderRadius: 6, background: value, border: '1px solid var(--grey200)', flexShrink: 0 }} />
    <span className="tm-text-micro" style={{ color: 'var(--grey700)', fontWeight: 500 }}>{token}</span>
  </div>
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   m18-tb-main — 태블릿 admin (낮은 우선순위, narrow sidebar)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const M18TabletMain = () => (
  <div style={{ width: M18_TB_W, height: M18_TB_H, background: 'var(--grey50)', fontFamily: 'var(--font)', display: 'flex', overflow: 'hidden' }}>
    {/* Narrow icon sidebar */}
    <aside
      className="tm-admin-sidebar"
      style={{ width: 56, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', gap: 4, height: '100%' }}
    >
      <div style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: 'var(--blue500)',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--static-white)',
        fontWeight: 800,
        marginBottom: 12,
      }}>
        <span className="tm-text-label">T</span>
      </div>
      {M18_NAV_ITEMS.slice(0, 10).map(([k, l]) => {
        const isActive = k === 'dash';
        return (
          <div
            key={k}
            title={l}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              display: 'grid',
              placeItems: 'center',
              background: isActive ? M18_SDR_ACTIVE_BG : 'transparent',
              color: isActive ? M18_SDR_ACTIVE_FG : M18_SDR_SUB_FG,
              fontWeight: 600,
              cursor: 'pointer',
            }}
            aria-label={l}
          >
            <span className="tm-text-micro">{l.slice(0, 1)}</span>
          </div>
        );
      })}
    </aside>
    {/* Content */}
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ height: 56, background: 'var(--static-white)', borderBottom: '1px solid var(--grey200)', display: 'flex', alignItems: 'center', padding: '0 20px' }}>
        <h1 className="tm-text-body-lg" style={{ margin: 0, fontWeight: 800, color: 'var(--text-strong)' }}>운영 대시보드</h1>
        <div style={{ flex: 1 }} />
        <span className="tm-text-caption" style={{ color: 'var(--grey500)' }}>04/26 09:41</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
          <M18KpiCard label="진행중 매치" value="42" sub="실시간" deepLink="/admin/matches" tone="neutral"/>
          <M18KpiCard label="열린 분쟁" value="3" sub="대기중" deepLink="/admin/disputes" tone="warn"/>
          <M18KpiCard label="실패 지급" value="1" sub="재시도 필요" deepLink="/admin/payouts" tone="down"/>
        </div>
        <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', padding: 16 }}>
          <div className="tm-text-label" style={{ fontWeight: 700, marginBottom: 12 }}>최근 신고</div>
          {[
            ['D-2845', '장터', 'pending',   '배송 미이행 신고'],
            ['D-2844', '매너', 'processing','경기 중 욕설'],
            ['D-2843', '결제', 'resolved',  '이중 결제'],
          ].map(([id, type, status, desc], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < 2 ? '1px solid var(--grey100)' : 'none' }}>
              <span className="tab-num tm-text-caption" style={{ color: 'var(--grey500)', width: 56 }}>{id}</span>
              <Badge tone="grey" size="sm">{type}</Badge>
              <div className="tm-text-caption" style={{ flex: 1, color: 'var(--text-strong)' }}>{desc}</div>
              <M18StatusBadge status={status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   m18-dt-main — Admin dashboard (dark sidebar + light content)
   Reuses canonical AdminShell wireframe + 6-KPI ops summary
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const M18DesktopMain = () => (
  <M18Shell active="dash" title="운영 대시보드" actions={
    <span className="tm-text-caption" style={{ color: 'var(--grey500)' }}>최종 업데이트: 방금 전</span>
  }>
    {/* 6-KPI ops summary grid — components/admin/kpi-card.tsx */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
      <M18KpiCard label="진행중 매치" value="42" sub="현재 경기 중" tone="neutral" deepLink="/admin/matches"/>
      <M18KpiCard label="결제 대기" value="8" sub="확인 필요" tone="warn" deepLink="/admin/payments"/>
      <M18KpiCard label="열린 분쟁" value="3" sub="대기·검토 포함" tone="warn" deepLink="/admin/disputes"/>
      <M18KpiCard label="정산 대기" value="28,420,000원" sub="처리 대기 건" tone="neutral" deepLink="/admin/settlements"/>
      <M18KpiCard label="실패 지급" value="2" sub="재시도 필요" tone="down" deepLink="/admin/payouts"/>
      <M18KpiCard label="푸시 실패 5m" value="0" sub="최근 5분" tone="neutral" deepLink="/admin/ops"/>
    </div>
    {/* 2-col lower: recent disputes + payout summary */}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* Recent disputes */}
      <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <div className="tm-text-label" style={{ fontWeight: 700, color: 'var(--text-strong)' }}>최근 신고·분쟁</div>
          <div style={{ flex: 1 }} />
          <button className="tm-pressable tm-break-keep tm-text-caption" style={{ color: 'var(--blue500)', fontWeight: 600 }}>전체보기</button>
        </div>
        {[
          ['D-2845', '장터', 'pending',    '배송 미이행 · 환불 요청', '5분 전'],
          ['D-2844', '매너', 'processing', '경기 중 욕설 신고',        '12분 전'],
          ['D-2843', '결제', 'resolved',   '이중 결제 처리 완료',       '1시간 전'],
          ['D-2842', '노쇼', 'resolved',   '매치 5분 전 취소',         '3시간 전'],
        ].map(([id, type, status, desc, time], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < 3 ? '1px solid var(--grey100)' : 'none' }}>
            <span className="tab-num tm-text-caption" style={{ color: 'var(--grey500)', width: 52, flexShrink: 0 }}>{id}</span>
            <Badge tone="grey" size="sm">{type}</Badge>
            <div className="tm-text-caption" style={{ flex: 1, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{desc}</div>
            <M18StatusBadge status={status} />
            <span className="tab-num tm-text-micro" style={{ color: 'var(--grey400)', flexShrink: 0 }}>{time}</span>
          </div>
        ))}
      </div>
      {/* Payout summary with weekly bars — components/admin/weekly-payout-bars.tsx */}
      <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', padding: 20 }}>
        <div className="tm-text-label" style={{ fontWeight: 700, color: 'var(--text-strong)', marginBottom: 16 }}>주간 지급 현황 (최근 4주)</div>
        {/* CSS bar chart — no chart library */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', height: 80, marginBottom: 12 }}>
          {[
            { label: '4주 전', amount: 48200000, max: 92000000 },
            { label: '3주 전', amount: 62400000, max: 92000000 },
            { label: '2주 전', amount: 78000000, max: 92000000 },
            { label: '이번 주', amount: 92000000, max: 92000000 },
          ].map((w, i) => {
            const barH = Math.max(2, Math.round((w.amount / w.max) * 64));
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span className="tab-num tm-text-micro" style={{ color: 'var(--grey500)', fontWeight: 600 }}>
                  {(w.amount / 1000000).toFixed(0)}M
                </span>
                <div style={{
                  width: '100%',
                  height: barH,
                  background: i === 3 ? 'var(--blue500)' : 'var(--blue200)',
                  borderRadius: '4px 4px 0 0',
                  transition: 'height var(--dur-base) var(--ease-out-quart)',
                }} />
                <span className="tm-text-micro" style={{ color: 'var(--grey500)', fontWeight: 500 }}>{w.label}</span>
              </div>
            );
          })}
        </div>
        <div style={{ paddingTop: 12, borderTop: '1px solid var(--grey100)' }}>
          {[
            ['이번 주 지급액', '92,000,000원', true],
            ['실패 건수', '2건', false],
            ['수수료 수익', '9,200,000원', false],
          ].map(([l, v, strong], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 2 ? '1px solid var(--grey100)' : 'none' }}>
              <span className="tm-text-caption" style={{ color: 'var(--grey600)', fontWeight: 500 }}>{l}</span>
              <span className="tab-num tm-text-caption" style={{ color: strong ? 'var(--blue500)' : 'var(--text-strong)', fontWeight: strong ? 700 : 600 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </M18Shell>
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   m18-dt-detail — Dispute detail with resolve modal overlay
   Reuses components/dispute/dispute-resolve-modal.tsx pattern
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const M18DesktopDetail = () => (
  <div style={{ position: 'relative', width: M18_DT_W, height: M18_DT_H }}>
    {/* Base shell */}
    <M18Shell active="disputes" title="신고 상세 — D-2845">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        {/* Left: dispute info + message thread */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span className="tab-num tm-text-label" style={{ fontWeight: 700, color: 'var(--text-strong)' }}>D-2845</span>
              <Badge tone="orange" size="sm">장터</Badge>
              <M18StatusBadge status="reviewing" />
              <div style={{ flex: 1 }} />
              <span className="tab-num tm-text-caption" style={{ color: 'var(--grey500)' }}>2026-04-26 09:15</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {[
                ['신고 유형', '배송 미이행 (환불 요청)'],
                ['신청자', '구매자 김민준'],
                ['대상', '판매자 이도현'],
                ['관련 주문', 'ORD-8821 · 나이키 AG 축구화'],
              ].map(([l, v], i) => (
                <div key={i}>
                  <div className="tm-text-micro" style={{ color: 'var(--grey500)', fontWeight: 600, marginBottom: 4 }}>{l}</div>
                  <div className="tm-text-label" style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: 14, borderRadius: 10, background: 'var(--grey50)', border: '1px solid var(--grey100)' }}>
              <div className="tm-text-micro" style={{ color: 'var(--grey500)', fontWeight: 600, marginBottom: 6 }}>신고 내용</div>
              <div className="tm-text-label" style={{ color: 'var(--text-strong)', lineHeight: 1.6 }}>결제 후 7일이 지났는데 배송이 시작되지 않았어요. 여러 번 연락해봤지만 판매자가 응답하지 않습니다. 환불을 요청드립니다.</div>
            </div>
          </div>
          {/* Message thread — components/dispute/dispute-message-thread.tsx pattern */}
          <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', padding: 20 }}>
            <div className="tm-text-label" style={{ fontWeight: 700, marginBottom: 14 }}>분쟁 메시지 스레드</div>
            {[
              { role: 'buyer',  name: '김민준', msg: '배송이 7일째 안 오고 있어요. 답장도 없어요.', time: '09:15' },
              { role: 'seller', name: '이도현', msg: '죄송합니다. 재고 문제로 지연됐습니다. 내일 발송 예정이에요.', time: '10:02' },
              { role: 'buyer',  name: '김민준', msg: '내일도 지나면 환불 진행해주세요.', time: '10:15' },
              { role: 'admin',  name: '운영자', msg: '양쪽 주장을 검토 중입니다. 24시간 내 결정 알려드릴게요.', time: '11:00' },
            ].map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 14, flexDirection: m.role === 'buyer' ? 'row' : 'row-reverse' }}>
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  background: m.role === 'admin' ? 'var(--grey900)' : m.role === 'buyer' ? 'var(--blue500)' : 'var(--green500)',
                  color: 'var(--static-white)',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 700,
                  flexShrink: 0,
                }}>
                  <span className="tm-text-micro" style={{ fontWeight: 700 }}>{m.name[0]}</span>
                </div>
                <div style={{ maxWidth: 360 }}>
                  <div className="tm-text-micro" style={{
                    color: 'var(--grey500)',
                    fontWeight: 600,
                    marginBottom: 4,
                    textAlign: m.role === 'buyer' ? 'left' : 'right',
                  }}>
                    {m.name} · {m.time}
                  </div>
                  <div style={{
                    padding: '10px 14px',
                    borderRadius: m.role === 'buyer' ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
                    background: m.role === 'admin' ? 'var(--grey900)' : 'var(--grey100)',
                    color: m.role === 'admin' ? 'var(--static-white)' : 'var(--text-strong)',
                    lineHeight: 1.5,
                  }} className="tm-text-label">
                    {m.msg}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Right: action panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', padding: 20 }}>
            <div className="tm-text-label" style={{ fontWeight: 700, marginBottom: 14 }}>관련 주문 스냅샷</div>
            {[
              ['주문 번호', 'ORD-8821'],
              ['상품', '나이키 AG 축구화 270'],
              ['금액', '89,000원'],
              ['상태', '에스크로 보류'],
              ['결제일', '04/19 14:32'],
            ].map(([l, v], i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 4 ? '1px solid var(--grey100)' : 'none' }}>
                <span className="tm-text-caption" style={{ color: 'var(--grey500)', fontWeight: 500 }}>{l}</span>
                <span className="tab-num tm-text-caption" style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
          <button className="tm-btn tm-btn-primary tm-btn-md tm-btn-block" style={{ borderRadius: 10, fontWeight: 700 }}>
            분쟁 해결 처리
          </button>
          <button className="tm-pressable tm-break-keep tm-text-label" style={{ padding: '12px', borderRadius: 10, background: 'var(--grey100)', color: 'var(--grey700)', fontWeight: 600 }}>
            검토 시작 (→ admin_reviewing)
          </button>
        </div>
      </div>
    </M18Shell>

    {/* ResolveDisputeModal overlay — components/dispute/dispute-resolve-modal.tsx */}
    <div style={{
      position: 'absolute',
      inset: 0,
      background: 'rgba(0,0,0,0.48)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 200,
    }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="분쟁 해결 처리"
        style={{
          width: 480,
          background: 'var(--static-white)',
          borderRadius: 16,
          padding: 28,
          boxShadow: 'var(--sh-4)',
        }}
      >
        <div className="tm-text-subhead" style={{ fontWeight: 800, marginBottom: 4, color: 'var(--text-strong)' }}>분쟁 해결 처리</div>
        <div className="tm-text-caption" style={{ color: 'var(--grey500)', marginBottom: 20 }}>D-2845 · 결정은 양 당사자에게 알림이 발송됩니다</div>
        {/* Action select */}
        <div style={{ marginBottom: 16 }}>
          <div className="tm-text-caption" style={{ fontWeight: 600, color: 'var(--grey600)', marginBottom: 8 }}>처리 유형 *</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { key: 'refund',  label: '환불', sub: 'Toss 취소 연동', selected: true },
              { key: 'release', label: '지급', sub: '판매자에게 해제' },
              { key: 'dismiss', label: '기각', sub: '신고 종료' },
            ].map((a) => (
              <div
                key={a.key}
                style={{
                  padding: '12px 10px',
                  borderRadius: 10,
                  border: `2px solid ${a.selected ? 'var(--blue500)' : 'var(--grey200)'}`,
                  background: a.selected ? 'var(--blue50)' : 'var(--static-white)',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <div className="tm-text-label" style={{ fontWeight: 700, color: a.selected ? 'var(--blue500)' : 'var(--text-strong)' }}>{a.label}</div>
                <div className="tm-text-micro" style={{ color: 'var(--grey500)', marginTop: 4 }}>{a.sub}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Note input */}
        <div style={{ marginBottom: 20 }}>
          <div className="tm-text-caption" style={{ fontWeight: 600, color: 'var(--grey600)', marginBottom: 8 }}>처리 노트 *</div>
          <textarea
            style={{
              width: '100%',
              minHeight: 80,
              borderRadius: 10,
              border: '1px solid var(--grey200)',
              padding: '10px 12px',
              color: 'var(--text-strong)',
              fontFamily: 'var(--font)',
              resize: 'none',
              boxSizing: 'border-box',
            }}
            className="tm-text-label"
            defaultValue="판매자 응답 없음 확인. 7일 경과로 구매자 환불 처리."
          />
        </div>
        {/* CTA */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="tm-btn tm-btn-outline tm-btn-md" style={{ flex: 1, borderRadius: 10 }}>취소</button>
          <button className="tm-btn tm-btn-danger tm-btn-md" style={{ flex: 2, borderRadius: 10, fontWeight: 700 }}>환불 처리 확정</button>
        </div>
      </div>
    </div>
  </div>
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   m18-dt-list — Users table dense (AdminMatches/AdminLessons table pattern)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const M18DesktopList = () => (
  <M18Shell active="users" title="유저 관리" actions={
    <button className="tm-pressable tm-break-keep tm-text-label" style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--grey100)', color: 'var(--grey700)', fontWeight: 600 }}>CSV 내보내기</button>
  }>
    <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
      <M18KpiCard label="전체 유저" value="48,291" sub="누적" tone="neutral"/>
      <M18KpiCard label="DAU" value="24,812" sub="+4.2% WoW" tone="up"/>
      <M18KpiCard label="이번달 신규" value="1,428" sub="4월 기준" tone="up"/>
      <M18KpiCard label="정지 계정" value="14" sub="AdminGuard 차단" tone="warn"/>
    </div>
    <M18FilterBar tabs={['전체 48,291', '활성 48,277', '정지 14', 'Admin 3']} search="이름 · 이메일 · ID 검색" />
    <M18Table
      heads={['ID', '닉네임', '이메일', '가입일', '최근 로그인', '종목', '매너 점수', '상태', '']}
      rows={[
        ['U-00142', '정민준', 'jungminjun@…', '24/03/12', '방금 전', '풋살·농구', 4.92, 'active'],
        ['U-00141', '박소희', 'sohee.park@…', '24/03/11', '1시간 전', '배드민턴', 4.88, 'active'],
        ['U-00140', '이도현', 'dohyun.lee@…', '24/03/10', '2일 전', '축구', 4.75, 'active'],
        ['U-00139', '김민아', 'mina.k@…',     '24/03/09', '3일 전', '테니스', 4.60, 'active'],
        ['U-00138', '최현우', 'chw@…',         '24/02/28', '일주일 전', '농구', 4.50, 'suspended'],
      ]}
      renderRow={(r) => [
        <td className="tab-num tm-text-caption" key="id" style={{ padding: '12px 16px', color: 'var(--grey500)', whiteSpace: 'nowrap' }}>{r[0]}</td>,
        <td key="name" className="tm-text-label" style={{ padding: '12px 16px', fontWeight: 700 }}>{r[1]}</td>,
        <td key="email" className="tm-text-caption" style={{ padding: '12px 16px', color: 'var(--grey600)' }}>{r[2]}</td>,
        <td className="tab-num tm-text-caption" key="join" style={{ padding: '12px 16px', color: 'var(--grey500)', whiteSpace: 'nowrap' }}>{r[3]}</td>,
        <td className="tab-num tm-text-caption" key="login" style={{ padding: '12px 16px', color: 'var(--grey500)', whiteSpace: 'nowrap' }}>{r[4]}</td>,
        <td key="sport" className="tm-text-caption" style={{ padding: '12px 16px', color: 'var(--grey700)' }}>{r[5]}</td>,
        <td className="tab-num tm-text-caption" key="manner" style={{ padding: '12px 16px', color: 'var(--orange500)', fontWeight: 700 }}>★ {r[6]}</td>,
        <td key="status" style={{ padding: '12px 16px' }}><M18StatusBadge status={r[7]} /></td>,
        <td key="action" style={{ padding: '12px 16px' }}>
          <button className="tm-pressable tm-break-keep tm-text-caption" style={{ color: 'var(--blue500)', fontWeight: 600 }} aria-label={`${r[1]} 상세`}>상세</button>
        </td>,
      ]}
    />
  </M18Shell>
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   m18-dt-flow-payout — Payout batch builder
   components/admin/payout-batch-builder.tsx
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const M18DesktopFlowPayout = () => (
  <M18Shell active="payouts" title="지급 배치 처리" actions={
    <button className="tm-pressable tm-break-keep tm-text-label" style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--blue500)', color: 'var(--static-white)', fontWeight: 600 }}>배치 생성</button>
  }>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16 }}>
      {/* Left: eligible settlements */}
      <div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <M18KpiCard label="지급 가능 정산" value="24건" sub="total 24,820,000원" tone="neutral"/>
          <M18KpiCard label="실패 지급" value="2건" sub="재시도 필요" tone="down"/>
          <M18KpiCard label="이번달 누적" value="92,000,000원" sub="지급 완료" tone="up"/>
        </div>
        <M18FilterBar tabs={['전체 24', '장터 18', '레슨 6']} search="수령인 검색" />
        <M18Table
          heads={['', '수령인', '유형', '건수', '금액', '상태', '마지막 정산일']}
          rows={[
            [true,  '박준수 코치', '레슨', 3, 2256000, 'pending', '04/25'],
            [true,  '이민정 코치', '레슨', 2, 1692000, 'pending', '04/24'],
            [true,  '상암월드컵경기장', '시설', 5, 3948000, 'pending', '04/23'],
            [false, 'FC 발빠른놈들', '팀매치', 2, 560000, 'failed', '04/20'],
            [true,  '김진우 코치', '레슨', 1, 846000, 'pending', '04/22'],
          ]}
          renderRow={(r) => [
            <td key="sel" style={{ padding: '12px 16px', width: 44 }}>
              <div style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                border: `2px solid ${r[0] ? 'var(--blue500)' : 'var(--grey300)'}`,
                background: r[0] ? 'var(--blue500)' : 'transparent',
                display: 'grid',
                placeItems: 'center',
              }}>
                {r[0] && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--static-white)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>}
              </div>
            </td>,
            <td key="name" className="tm-text-label" style={{ padding: '12px 16px', fontWeight: 700 }}>{r[1]}</td>,
            <td key="type" className="tm-text-caption" style={{ padding: '12px 16px', color: 'var(--grey600)' }}>{r[2]}</td>,
            <td className="tab-num tm-text-caption" key="count" style={{ padding: '12px 16px', color: 'var(--grey600)' }}>{r[3]}건</td>,
            <td className="tab-num tm-text-caption" key="amount" style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--blue500)' }}>{r[4].toLocaleString()}원</td>,
            <td key="status" style={{ padding: '12px 16px' }}><M18StatusBadge status={r[5]} /></td>,
            <td className="tab-num tm-text-caption" key="date" style={{ padding: '12px 16px', color: 'var(--grey500)' }}>{r[6]}</td>,
          ]}
        />
      </div>
      {/* Right: batch summary + controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', padding: 20 }}>
          <div className="tm-text-label" style={{ fontWeight: 700, marginBottom: 16, color: 'var(--text-strong)' }}>배치 요약</div>
          {[
            ['선택 건수', '5건'],
            ['총 지급액', '9,302,000원'],
            ['예정 수령인', '5명'],
          ].map(([l, v], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < 2 ? '1px solid var(--grey100)' : 'none' }}>
              <span className="tm-text-label" style={{ color: 'var(--grey600)', fontWeight: 500 }}>{l}</span>
              <span className="tab-num tm-text-label" style={{ color: 'var(--text-strong)', fontWeight: 700 }}>{v}</span>
            </div>
          ))}
          <div style={{ marginTop: 16 }}>
            <div className="tm-text-caption" style={{ fontWeight: 600, color: 'var(--grey600)', marginBottom: 8 }}>마감일 (선택)</div>
            <div style={{ height: 40, borderRadius: 8, border: '1px solid var(--grey200)', display: 'flex', alignItems: 'center', padding: '0 12px', color: 'var(--grey500)' }} className="tm-text-label">2026-04-30</div>
          </div>
          <button className="tm-btn tm-btn-primary tm-btn-md tm-btn-block" style={{ marginTop: 16, borderRadius: 10, fontWeight: 700 }}>배치 생성 (5건)</button>
        </div>
        {/* Failed payouts — retry panel */}
        <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
            <div className="tm-text-label" style={{ fontWeight: 700, color: 'var(--text-strong)' }}>실패 지급 재시도</div>
            <div style={{ flex: 1 }} />
            <Badge tone="red" size="sm">2건</Badge>
          </div>
          {[
            { id: 'P-0421', name: 'FC 발빠른놈들', amount: 560000, reason: '계좌 불일치' },
            { id: 'P-0418', name: '장터판매자 A', amount: 118000, reason: '이체 한도 초과' },
          ].map((p, i) => (
            <div key={i} style={{ padding: '12px 0', borderBottom: i === 0 ? '1px solid var(--grey100)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span className="tab-num tm-text-caption" style={{ color: 'var(--grey500)' }}>{p.id}</span>
                <span className="tm-text-label" style={{ fontWeight: 600, flex: 1 }}>{p.name}</span>
                <span className="tab-num tm-text-caption" style={{ color: 'var(--blue500)', fontWeight: 700 }}>{p.amount.toLocaleString()}원</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="tm-text-micro" style={{ color: 'var(--red500)', fontWeight: 500 }}>{p.reason}</span>
                <div style={{ flex: 1 }} />
                <button
                  className="tm-pressable tm-break-keep tm-text-caption"
                  style={{ padding: '5px 12px', borderRadius: 6, background: 'var(--grey100)', color: 'var(--grey700)', fontWeight: 600, minHeight: 28 }}
                  aria-label={`${p.id} 재시도`}
                >
                  재시도
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </M18Shell>
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   m18-dt-flow-ops — Ops summary KPI grid (6개 카드) + push failure log
   components/admin/kpi-card.tsx + components/admin/push-failure-table.tsx
   Extends canonical AdminOps with useAdminOpsSummary KPIs + push failure table
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const M18DesktopFlowOps = () => (
  <M18Shell active="ops" title="운영 대시보드 (Ops Summary)" actions={
    <button className="tm-pressable tm-break-keep tm-text-label" style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--grey100)', color: 'var(--grey700)', fontWeight: 600 }}>새로고침</button>
  }>
    {/* 6-KPI grid — refetchInterval 30s contract */}
    <div style={{ marginBottom: 8 }}>
      <div className="tm-text-caption" style={{ color: 'var(--grey500)', fontWeight: 500, marginBottom: 12 }}>
        GET /admin/ops/summary · 30초 자동 갱신
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <M18KpiCard label="진행중 매치" value="42" tone="neutral" deepLink="매치 관리 →" sub="실시간 집계"/>
        <M18KpiCard label="결제 대기" value="8" tone="warn" deepLink="결제 관리 →" sub="확인 필요"/>
        <M18KpiCard label="열린 분쟁" value="3" tone="warn" deepLink="분쟁 관리 →" sub="대기·검토 포함"/>
        <M18KpiCard label="정산 대기" value="28,420,000원" tone="neutral" deepLink="정산 관리 →" sub="처리 대기"/>
        <M18KpiCard label="실패 지급" value="2" tone="down" deepLink="지급 관리 →" sub="재시도 필요"/>
        <M18KpiCard label="푸시 실패 5m" value="0" tone="neutral" deepLink="실패 로그 →" sub="최근 5분"/>
      </div>
    </div>
    {/* Push failure log — components/admin/push-failure-table.tsx */}
    <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--grey200)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="tm-text-label" style={{ fontWeight: 700, color: 'var(--text-strong)' }}>최근 웹 푸시 실패 로그</div>
        <Badge tone="grey" size="sm">최근 20건</Badge>
        <div style={{ flex: 1 }} />
        <div className="tm-text-micro" style={{ color: 'var(--grey500)', fontWeight: 500 }}>
          PII 마스킹: endpoint 마지막 6자 + userId sha256 8자
        </div>
        <button className="tm-pressable tm-break-keep tm-text-caption" style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--grey900)', color: 'var(--static-white)', fontWeight: 600 }}>알람 확인 (Ack)</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--grey50)' }}>
            {['발생 시각', '엔드포인트 (마스킹)', 'userId 해시', '오류 코드', '응답 상태', 'Ack'].map((h, i) => (
              <th key={i} className="tm-text-micro" style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--grey500)', borderBottom: '1px solid var(--grey200)', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            ['09:24:11', '…Xk4p2Q', 'a1b2c3d4', '410 Gone',        'endpoint expired',  false],
            ['09:18:44', '…mQ9vRw', '9f8e7d6c', '400 Bad Request', 'invalid vapid keys', true],
            ['08:55:02', '…nL3zPs', '5a4b3c2d', '410 Gone',        'endpoint expired',  true],
          ].map((r, i) => (
            <tr key={i} style={{ borderBottom: i < 2 ? '1px solid var(--grey100)' : 'none' }}>
              <td className="tab-num tm-text-caption" style={{ padding: '12px 16px', color: 'var(--grey500)', whiteSpace: 'nowrap' }}>{r[0]}</td>
              <td className="tab-num tm-text-micro" style={{ padding: '12px 16px', fontFamily: 'var(--font-tab)', color: 'var(--grey700)' }}>…{r[1]}</td>
              <td className="tab-num tm-text-micro" style={{ padding: '12px 16px', fontFamily: 'var(--font-tab)', color: 'var(--grey700)' }}>{r[2]}</td>
              <td className="tab-num tm-text-caption" style={{ padding: '12px 16px', color: r[3].startsWith('410') ? 'var(--orange500)' : 'var(--red500)', fontWeight: 600 }}>{r[3]}</td>
              <td className="tm-text-micro" style={{ padding: '12px 16px', color: 'var(--grey600)' }}>{r[4]}</td>
              <td style={{ padding: '12px 16px' }}>
                {r[5]
                  ? <span className="tm-text-micro" style={{ color: 'var(--green500)', fontWeight: 600 }}>✓ 확인됨</span>
                  : <button className="tm-pressable tm-break-keep tm-text-micro" style={{ color: 'var(--blue500)', fontWeight: 600 }} aria-label="알람 확인">확인</button>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {/* Ops action tools grid — canonical AdminOps pattern */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {[
        { t: '공지사항 발송', d: '전체/종목별 푸시 · 인앱 배너', c: 'var(--blue500)', btn: '작성' },
        { t: '피처 플래그', d: 'AB 테스트 · 기능 롤아웃 관리', c: 'var(--purple500)', btn: '열기' },
        { t: '백오피스 로그', d: '운영자 활동 감사 내역', c: 'var(--grey600)', btn: '보기' },
      ].map((o, i) => (
        <div key={i} style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', padding: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: o.c + '18', color: o.c, display: 'grid', placeItems: 'center', marginBottom: 12 }} aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6z"/></svg>
          </div>
          <div className="tm-text-label" style={{ fontWeight: 700, marginBottom: 4 }}>{o.t}</div>
          <div className="tm-text-caption" style={{ color: 'var(--grey600)', lineHeight: 1.5, marginBottom: 14 }}>{o.d}</div>
          <button
            className="tm-pressable tm-break-keep tm-text-caption"
            style={{ padding: '7px 14px', borderRadius: 8, background: o.c, color: 'var(--static-white)', fontWeight: 600, minHeight: 32 }}
          >{o.btn}</button>
        </div>
      ))}
    </div>
  </M18Shell>
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   m18-dt-flow-stats — Statistics + weekly bars chart
   Extends canonical AdminStats with weekly bars (components/admin/weekly-payout-bars.tsx)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const M18DesktopFlowStats = () => (
  <M18Shell active="statistics" title="통계 · 리포트">
    <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
      <M18KpiCard label="DAU" value="24,812" sub="+4.2% WoW" tone="up"/>
      <M18KpiCard label="WAU" value="98,420" sub="+2.1% WoW" tone="up"/>
      <M18KpiCard label="MAU" value="384,219" sub="+8.3% MoM" tone="up"/>
      <M18KpiCard label="매치 완료율" value="87.4%" sub="+1.2%p" tone="up"/>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
      {/* Weekly match trend line */}
      <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', padding: 20 }}>
        <div className="tm-text-label" style={{ fontWeight: 700, marginBottom: 4 }}>주간 매치 개설 추이</div>
        <div className="tm-text-caption" style={{ color: 'var(--grey500)', marginBottom: 16 }}>최근 12주</div>
        <svg viewBox="0 0 400 120" style={{ width: '100%', height: 120 }} aria-hidden="true">
          <defs>
            <linearGradient id="m18g1" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--blue500)" stopOpacity=".25"/>
              <stop offset="1" stopColor="var(--blue500)" stopOpacity="0"/>
            </linearGradient>
          </defs>
          <path d="M0 90 L33 76 L66 82 L100 60 L133 68 L166 52 L200 44 L233 40 L266 28 L300 34 L333 18 L366 10 L400 14 L400 120 L0 120 Z" fill="url(#m18g1)"/>
          <path d="M0 90 L33 76 L66 82 L100 60 L133 68 L166 52 L200 44 L233 40 L266 28 L300 34 L333 18 L366 10 L400 14" stroke="var(--blue500)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      {/* Sport breakdown horizontal bars */}
      <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', padding: 20 }}>
        <div className="tm-text-label" style={{ fontWeight: 700, marginBottom: 16 }}>종목별 매치 비율</div>
        {[
          ['축구',     34, 'var(--blue500)'],
          ['풋살',     28, 'var(--red500)'],
          ['농구',     14, 'var(--orange500)'],
          ['배드민턴', 12, 'var(--green500)'],
          ['테니스',    8, 'var(--purple500)'],
          ['기타',      4, 'var(--grey400)'],
        ].map(([sport, pct, color], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div className="tm-text-caption" style={{ width: 56, fontWeight: 600, color: 'var(--text-strong)' }}>{sport}</div>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--grey100)', overflow: 'hidden' }}>
              <div style={{ width: pct + '%', height: '100%', background: color, borderRadius: 4 }} />
            </div>
            <div className="tab-num tm-text-caption" style={{ width: 32, textAlign: 'right', fontWeight: 700 }}>{pct}%</div>
          </div>
        ))}
      </div>
    </div>
    {/* Weekly payout bars — components/admin/weekly-payout-bars.tsx */}
    <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', padding: 20 }}>
      <div className="tm-text-label" style={{ fontWeight: 700, marginBottom: 4 }}>최근 4주 지급 합계</div>
      <div className="tm-text-caption" style={{ color: 'var(--grey500)', marginBottom: 20 }}>Tailwind CSS bar · 외부 라이브러리 없음</div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', height: 80 }}>
        {[
          { label: '04/05', amount: 48200000, max: 92000000 },
          { label: '04/12', amount: 62400000, max: 92000000 },
          { label: '04/19', amount: 78000000, max: 92000000 },
          { label: '04/26', amount: 92000000, max: 92000000 },
        ].map((w, i) => {
          const barH = Math.max(2, Math.round((w.amount / w.max) * 64));
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span className="tab-num tm-text-micro" style={{ color: 'var(--grey600)', fontWeight: 600 }}>
                {(w.amount / 1000000).toFixed(0)}M원
              </span>
              <div style={{ width: '100%', height: barH, background: i === 3 ? 'var(--blue500)' : 'var(--blue200)', borderRadius: '4px 4px 0 0', transition: 'height var(--dur-base) var(--ease-out-quart)' }} />
              <span className="tm-text-micro" style={{ color: 'var(--grey500)', fontWeight: 500 }}>{w.label}</span>
            </div>
          );
        })}
      </div>
      {/* 0-week minimum height example note */}
      <div className="tm-text-micro" style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--grey50)', color: 'var(--grey500)' }}>
        0건 주에는 h-[2px] 최솟값 처리 — 빈 주가 존재할 경우 bar 높이 2px 유지
      </div>
    </div>
  </M18Shell>
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   State screens — admin shell wireframe + skeleton/empty/error/permission
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const M18DesktopStateLoading = () => (
  <M18Shell active="dash" title="운영 대시보드" data-board-id="m18-dt-state-loading">
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
      {[0,1,2,3,4,5].map((i) => (
        <div key={i} style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', padding: 20, minHeight: 90 }}>
          <Skeleton h={12} w="40%" r={4} mb={10}/>
          <Skeleton h={28} w="60%" r={6} mb={8}/>
          <Skeleton h={10} w="50%" r={4}/>
        </div>
      ))}
    </div>
    <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', padding: 20 }}>
      <Skeleton h={14} w="30%" r={4} mb={16}/>
      {[0,1,2,3].map((i) => (
        <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: i < 3 ? '1px solid var(--grey100)' : 'none' }}>
          <Skeleton h={12} w={56} r={4}/>
          <Skeleton h={20} w={48} r={999}/>
          <Skeleton h={12} w="40%" r={4}/>
          <Skeleton h={20} w={48} r={4}/>
        </div>
      ))}
    </div>
  </M18Shell>
);

const M18DesktopStateEmpty = () => (
  <M18Shell active="disputes" title="신고·분쟁 처리" data-board-id="m18-dt-state-empty">
    <M18FilterBar tabs={['전체 0', '매너 0', '노쇼 0', '장터 0']} search="신고번호 · 유저 검색" />
    <div style={{
      background: 'var(--static-white)',
      borderRadius: '0 0 12px 12px',
      border: '1px solid var(--grey200)',
      borderTop: 'none',
      padding: '80px 0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
    }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--grey100)', display: 'grid', placeItems: 'center', color: 'var(--grey400)' }} aria-hidden="true">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      </div>
      <div className="tm-text-body-lg" style={{ fontWeight: 700, color: 'var(--text-strong)' }}>검색 결과가 없어요</div>
      <div className="tm-text-label" style={{ color: 'var(--grey500)', textAlign: 'center', lineHeight: 1.5 }}>
        조건에 맞는 신고 건이 없어요.<br/>필터를 변경하거나 검색어를 확인해주세요.
      </div>
      <button className="tm-pressable tm-break-keep tm-text-label" style={{ padding: '10px 24px', borderRadius: 10, background: 'var(--grey100)', color: 'var(--grey700)', fontWeight: 600, marginTop: 8, minHeight: 44 }}>필터 초기화</button>
    </div>
  </M18Shell>
);

const M18DesktopStateError = () => (
  <M18Shell active="dash" title="운영 대시보드" data-board-id="m18-dt-state-error">
    <div style={{
      background: 'var(--static-white)',
      borderRadius: 12,
      border: '1px solid var(--grey200)',
      padding: '80px 0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
    }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--red50)', color: 'var(--red500)', display: 'grid', placeItems: 'center' }} aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
      </div>
      <div className="tm-text-body-lg" style={{ fontWeight: 700, color: 'var(--text-strong)' }}>데이터를 불러올 수 없어요</div>
      <div className="tm-text-label" style={{ color: 'var(--grey500)', textAlign: 'center', lineHeight: 1.5 }}>
        GET /admin/ops/summary 응답 없음.<br/>네트워크를 확인하거나 잠시 후 다시 시도해주세요.
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="tm-pressable tm-break-keep tm-text-label" style={{ padding: '10px 24px', borderRadius: 10, background: 'var(--blue500)', color: 'var(--static-white)', fontWeight: 600, minHeight: 44 }}>다시 시도</button>
        <button className="tm-pressable tm-break-keep tm-text-label" style={{ padding: '10px 24px', borderRadius: 10, background: 'var(--grey100)', color: 'var(--grey700)', fontWeight: 600, minHeight: 44 }}>홈으로</button>
      </div>
    </div>
  </M18Shell>
);

/* m18-dt-state-permission — AdminGuard 권한 부족 */
const M18DesktopStatePermission = () => (
  <div style={{ width: M18_DT_W, height: M18_DT_H, background: 'var(--grey50)', fontFamily: 'var(--font)', display: 'flex', overflow: 'hidden' }}>
    <M18Sidebar active="dash" />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 16, textAlign: 'center' }}>
      <div style={{ width: 72, height: 72, borderRadius: 24, background: 'var(--orange50)', display: 'grid', placeItems: 'center', color: 'var(--orange500)' }} aria-hidden="true">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6z"/></svg>
      </div>
      <div className="tm-text-2xl" style={{ fontWeight: 800, color: 'var(--text-strong)' }}>접근 권한이 없어요</div>
      <div className="tm-text-body" style={{ color: 'var(--grey600)', lineHeight: 1.6, maxWidth: 400 }}>
        이 페이지는 관리자 전용이에요.<br/>
        AdminGuard를 통과한 계정만 접근할 수 있어요.
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button className="tm-pressable tm-break-keep tm-text-body" style={{ padding: '12px 28px', borderRadius: 12, background: 'var(--blue500)', color: 'var(--static-white)', fontWeight: 700, minHeight: 44 }}>홈으로 가기</button>
        <button className="tm-pressable tm-break-keep tm-text-body" style={{ padding: '12px 28px', borderRadius: 12, background: 'var(--grey100)', color: 'var(--grey700)', fontWeight: 600, minHeight: 44 }}>로그아웃</button>
      </div>
      <div className="tm-text-caption" style={{ marginTop: 16, padding: '12px 20px', borderRadius: 10, background: 'var(--grey100)', color: 'var(--grey500)' }}>
        HTTP 403 · role: user · required: admin
      </div>
    </div>
  </div>
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   m18-dt-components — Component showcase board
   Admin Sidebar(dark) + KpiCard + Table + ResolveDispute
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const M18DesktopComponents = () => (
  <div style={{ width: M18_DT_W, height: M18_DT_H, background: 'var(--bg)', padding: 28, fontFamily: 'var(--font)', overflow: 'hidden' }}>
    <Badge tone="blue" size="sm">m18-dt-components</Badge>
    <div className="tm-text-title" style={{ marginTop: 8, marginBottom: 4 }}>M18 데스크탑 · Admin 컴포넌트</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginBottom: 20 }}>관리자·운영 화면이 사용하는 UI primitives</div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, height: 'calc(100% - 80px)' }}>
      {/* Left column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
        {/* Admin sidebar dark swatch */}
        <M18ComponentSwatch label="AdminSidebar — .tm-admin-sidebar (dark exception)">
          <div
            className="tm-admin-sidebar"
            style={{ width: 160, borderRadius: 10, padding: '12px 0', overflow: 'hidden' }}
          >
            {M18_NAV_ITEMS.slice(0, 5).map(([k, l], i) => (
              <div key={k} style={{
                margin: '1px 8px',
                padding: '8px 10px',
                borderRadius: 6,
                fontWeight: i === 0 ? 700 : 500,
                color: i === 0 ? M18_SDR_ACTIVE_FG : M18_SDR_NAV_FG,
                background: i === 0 ? M18_SDR_ACTIVE_BG : 'transparent',
              }} className="tm-text-caption">{l}</div>
            ))}
          </div>
        </M18ComponentSwatch>
        {/* KPI cards */}
        <M18ComponentSwatch label="KpiCard — 6 KPI tones">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, width: '100%' }}>
            <M18KpiCard label="진행중 매치" value="42" tone="neutral" deepLink="→"/>
            <M18KpiCard label="열린 분쟁" value="3" tone="warn" deepLink="→"/>
            <M18KpiCard label="실패 지급" value="2" tone="down" deepLink="→"/>
          </div>
        </M18ComponentSwatch>
        {/* Status badges */}
        <M18ComponentSwatch label="StatusBadge — 9 상태">
          {['pending', 'processing', 'reviewing', 'resolved', 'active', 'failed', 'paid', 'done', 'suspended'].map((s) => (
            <M18StatusBadge key={s} status={s} />
          ))}
        </M18ComponentSwatch>
        {/* Filter bar */}
        <M18ComponentSwatch label="FilterBar — tab chips + search">
          <div style={{ width: '100%' }}>
            <M18FilterBar tabs={['전체 49', '대기 17', '처리중 8', '해결 24']} search="신고번호 검색" />
          </div>
        </M18ComponentSwatch>
      </div>
      {/* Right column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
        {/* Dense table */}
        <M18ComponentSwatch label="DenseTable — admin table pattern">
          <M18Table
            heads={['#', '유형', '신고자', '상태', '']}
            rows={[
              ['D-2845', '장터', '김민준', 'pending'],
              ['D-2844', '매너', '박소희', 'processing'],
              ['D-2843', '결제', '이도현', 'resolved'],
            ]}
            renderRow={(r) => [
              <td className="tab-num tm-text-caption" key="id" style={{ padding: '10px 14px', color: 'var(--grey500)' }}>{r[0]}</td>,
              <td key="type" className="tm-text-caption" style={{ padding: '10px 14px', fontWeight: 600 }}>{r[1]}</td>,
              <td key="name" className="tm-text-caption" style={{ padding: '10px 14px' }}>{r[2]}</td>,
              <td key="status" style={{ padding: '10px 14px' }}><M18StatusBadge status={r[3]} /></td>,
              <td key="action" style={{ padding: '10px 14px' }}><button className="tm-pressable tm-break-keep tm-text-micro" style={{ color: 'var(--blue500)', fontWeight: 600 }}>처리</button></td>,
            ]}
          />
        </M18ComponentSwatch>
        {/* Weekly payout bars mini */}
        <M18ComponentSwatch label="WeeklyPayoutBars — CSS-only bar chart (no lib)">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', height: 60, width: '100%' }}>
            {[48200000, 62400000, 78000000, 92000000].map((v, i) => {
              const barH = Math.max(2, Math.round((v / 92000000) * 48));
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span className="tab-num tm-text-micro" style={{ color: 'var(--grey500)', fontWeight: 600 }}>{(v/1000000).toFixed(0)}M</span>
                  <div style={{ width: '100%', height: barH, background: i === 3 ? 'var(--blue500)' : 'var(--blue200)', borderRadius: '3px 3px 0 0' }} />
                </div>
              );
            })}
          </div>
        </M18ComponentSwatch>
        {/* ResolveDisputeModal mini */}
        <M18ComponentSwatch label="ResolveDisputeModal — role=dialog + action select">
          <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', padding: 16, width: '100%' }}>
            <div className="tm-text-label" style={{ fontWeight: 700, marginBottom: 12 }}>처리 유형 선택</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['환불', true], ['지급', false], ['기각', false]].map(([l, sel], i) => (
                <div key={i} style={{
                  flex: 1,
                  padding: '8px 6px',
                  borderRadius: 8,
                  border: `2px solid ${sel ? 'var(--blue500)' : 'var(--grey200)'}`,
                  background: sel ? 'var(--blue50)' : 'transparent',
                  textAlign: 'center',
                  fontWeight: 700,
                  color: sel ? 'var(--blue500)' : 'var(--grey700)',
                }} className="tm-text-caption">{l}</div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="tm-btn tm-btn-outline tm-btn-sm" style={{ flex: 1, borderRadius: 8 }}>취소</button>
              <button className="tm-btn tm-btn-danger tm-btn-sm" style={{ flex: 2, borderRadius: 8 }}>환불 확정</button>
            </div>
          </div>
        </M18ComponentSwatch>
      </div>
    </div>
  </div>
);

/* m18-tb-components — tablet component board */
const M18TabletComponents = () => (
  <div style={{ width: M18_TB_W, height: M18_TB_H, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflow: 'hidden' }}>
    <Badge tone="blue" size="sm">m18-tb-components</Badge>
    <div className="tm-text-title" style={{ marginTop: 8, marginBottom: 4 }}>M18 태블릿 · Admin 컴포넌트</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginBottom: 20 }}>태블릿 narrow sidebar + 컴포넌트 목록</div>
    <div style={{ display: 'grid', gap: 12 }}>
      <M18ComponentSwatch label="Narrow sidebar (56px icon) — .tm-admin-sidebar">
        <div className="tm-admin-sidebar" style={{ width: 56, borderRadius: 8, padding: '12px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          {['대', '매', '팀', '레', '유'].map((c, i) => (
            <div key={i} style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              display: 'grid',
              placeItems: 'center',
              background: i === 0 ? M18_SDR_ACTIVE_BG : 'transparent',
              color: i === 0 ? M18_SDR_ACTIVE_FG : M18_SDR_SUB_FG,
              fontWeight: 600,
            }} className="tm-text-caption">{c}</div>
          ))}
        </div>
      </M18ComponentSwatch>
      <M18ComponentSwatch label="KpiCard — compact (3 col)">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, width: '100%' }}>
          <M18KpiCard label="진행중 매치" value="42" tone="neutral"/>
          <M18KpiCard label="열린 분쟁" value="3" tone="warn"/>
          <M18KpiCard label="실패 지급" value="2" tone="down"/>
        </div>
      </M18ComponentSwatch>
      <M18ComponentSwatch label="StatusBadge palette">
        {['pending', 'reviewing', 'resolved', 'failed', 'paid'].map((s) => (
          <M18StatusBadge key={s} status={s} />
        ))}
      </M18ComponentSwatch>
    </div>
  </div>
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   m18-dt-assets — Admin design token inventory
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const M18DesktopAssets = () => (
  <div style={{ width: M18_DT_W, height: M18_DT_H, background: 'var(--bg)', padding: 28, fontFamily: 'var(--font)', overflow: 'hidden' }}>
    <Badge tone="blue" size="sm">m18-dt-assets</Badge>
    <div className="tm-text-title" style={{ marginTop: 8, marginBottom: 4 }}>M18 데스크탑 · 토큰 인벤토리</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginBottom: 20 }}>관리자·운영 화면이 사용하는 디자인 토큰</div>
    <div style={{ display: 'grid', gap: 14, overflow: 'hidden' }}>
      <M18AssetSwatch label="Color · admin sidebar (dark exception — .tm-admin-sidebar)">
        <M18ColorSwatch token="sdr-border (gray-800)" value={M18_SDR_BORDER}/>
        <M18ColorSwatch token="sdr-active-bg (blue alpha)" value={M18_SDR_ACTIVE_BG}/>
        <M18ColorSwatch token="sdr-active-fg (blue-300)" value={M18_SDR_ACTIVE_FG}/>
        <M18ColorSwatch token="sdr-nav-fg (gray-200)" value={M18_SDR_NAV_FG}/>
        <M18ColorSwatch token="sdr-sub-fg (slate-400)" value={M18_SDR_SUB_FG}/>
      </M18AssetSwatch>
      <M18AssetSwatch label="Color · KPI tone semantic">
        <M18ColorSwatch token="up: green500" value="var(--green500)"/>
        <M18ColorSwatch token="warn: orange500" value="var(--orange500)"/>
        <M18ColorSwatch token="down: red500" value="var(--red500)"/>
        <M18ColorSwatch token="neutral: text-strong" value="var(--grey900)"/>
      </M18AssetSwatch>
      <M18AssetSwatch label="Color · table &amp; card (light content)">
        <M18ColorSwatch token="bg: white" value="var(--bg)"/>
        <M18ColorSwatch token="surface: grey50" value="var(--grey50)"/>
        <M18ColorSwatch token="border: grey200" value="var(--grey200)"/>
        <M18ColorSwatch token="row-hover: grey50" value="var(--grey50)"/>
        <M18ColorSwatch token="blue50 row-accent" value="var(--blue50)"/>
      </M18AssetSwatch>
      <M18AssetSwatch label="Color · status badge palette">
        <M18ColorSwatch token="pending: orange" value="var(--orange50)"/>
        <M18ColorSwatch token="processing: blue" value="var(--blue50)"/>
        <M18ColorSwatch token="resolved: green" value="var(--green50)"/>
        <M18ColorSwatch token="failed: red" value="var(--red50)"/>
      </M18AssetSwatch>
      <M18AssetSwatch label="Type · admin dense scale">
        <span className="tm-text-subhead">subhead (20)</span>
        <span className="tm-text-body-lg">body-lg (17)</span>
        <span className="tm-text-body">body (15)</span>
        <span className="tm-text-label">label (13)</span>
        <span className="tm-text-caption">caption (12)</span>
        <span className="tm-text-micro">micro (11)</span>
      </M18AssetSwatch>
      <M18AssetSwatch label="Spacing · 4-multiple (admin dense)">
        {[4, 8, 12, 16, 20, 24, 28].map((n) => (
          <Badge key={n} tone="grey" size="sm">{n}px</Badge>
        ))}
      </M18AssetSwatch>
      <M18AssetSwatch label="Shell dimensions">
        <Badge tone="grey" size="sm">sidebar 220px</Badge>
        <Badge tone="grey" size="sm">topbar 60px</Badge>
        <Badge tone="grey" size="sm">content padding 24px</Badge>
        <Badge tone="grey" size="sm">table row 44px min (touch target)</Badge>
        <Badge tone="grey" size="sm">DT 1280×800</Badge>
        <Badge tone="grey" size="sm">TB 1024×768</Badge>
      </M18AssetSwatch>
      <M18AssetSwatch label="Monospace · PII masked log">
        <span style={{ fontFamily: 'var(--font-tab)', color: 'var(--grey700)' }} className="tm-text-caption">SF Mono · endpoint …Xk4p2Q · hash a1b2c3d4</span>
      </M18AssetSwatch>
    </div>
  </div>
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   m18-dt-motion — Admin motion contract
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const M18DesktopMotion = () => (
  <div style={{ width: M18_DT_W, height: M18_DT_H, background: 'var(--bg)', padding: 28, fontFamily: 'var(--font)' }}>
    <Badge tone="blue" size="sm">m18-dt-motion</Badge>
    <div className="tm-text-title" style={{ marginTop: 8, marginBottom: 4 }}>M18 데스크탑 · motion contract</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginBottom: 20 }}>관리자·운영 화면이 사용하는 motion 토큰</div>
    <div style={{ display: 'grid', gap: 12 }}>
      <ListItem title="Sidebar nav active" sub="hover/active → background-color 120ms ease-out-quart · no translate"/>
      <ListItem title="Sidebar collapse (tablet)" sub="width 220px → 56px 200ms ease-out-quart · label fade out"/>
      <ListItem title="KpiCard hover" sub="border-color → var(--border-strong) 120ms · box-shadow +1px"/>
      <ListItem title="KPI counter animate" sub="30초 refetch → 숫자 변경 시 color flash 200ms (up: green500, down: red500)"/>
      <ListItem title="Table row hover" sub="background → var(--grey50) 120ms ease-out-quart · cursor pointer"/>
      <ListItem title="Button press" sub="scale(.98) 120ms ease-out-quart · 모든 .tm-btn · 44px min target"/>
      <ListItem title="Modal open" sub="overlay opacity 0→1 180ms · dialog translateY(8px)→0 + opacity 280ms ease-out-quint"/>
      <ListItem title="Modal ESC / backdrop" sub="opacity 1→0 180ms → unmount · focus restored to trigger"/>
      <ListItem title="Toast" sub="translateY(20px)→0 + opacity 280ms ease-out-expo · bottom 90px · duration 4s"/>
      <ListItem title="Skeleton shimmer" sub="1.4s linear infinite · admin table/card loading state"/>
      <ListItem title="Reduced motion" sub="prefers-reduced-motion → 모든 transition 0.01ms · 모달 즉시 표시"/>
    </div>
  </div>
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Object.assign export (global window registry)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
Object.assign(window, {
  /* Primitives */
  M18Sidebar,
  M18TopBar,
  M18Shell,
  M18KpiCard,
  M18StatusBadge,
  M18Table,
  M18FilterBar,
  /* Tablet */
  M18TabletMain,
  M18TabletComponents,
  /* Desktop main screens */
  M18DesktopMain,
  M18DesktopDetail,
  M18DesktopList,
  /* Desktop flows */
  M18DesktopFlowPayout,
  M18DesktopFlowOps,
  M18DesktopFlowStats,
  /* Desktop states */
  M18DesktopStateLoading,
  M18DesktopStateEmpty,
  M18DesktopStateError,
  M18DesktopStatePermission,
  /* Desktop meta */
  M18DesktopComponents,
  M18TabletComponents,
  M18DesktopAssets,
  M18DesktopMotion,
});
