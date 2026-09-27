/* fix32 — M17 데스크탑 웹 canonical grid.
   ID schema: m17-{tb|dt}-{main|detail|list|flow|state|components|assets|motion}[-{sub}]
   Desktop dominant module — mobile board count: 0 (intentional).
   Viewport: tb=768, dt=1280.
   Canonical: DesktopHome / DesktopMatches / DesktopLanding / DesktopLessonDetail / DesktopMarket */

const M17_TB_W = 768;
const M17_TB_H = 1024;
const M17_DT_W = 1280;
const M17_DT_H = 820;

/* ---------- Shared fixture data ---------- */

const M17_NAV_ITEMS = [
  { id: 'home',        label: '홈',   icon: 'M3 11 L12 3 L21 11 V21 H3 Z' },
  { id: 'matches',     label: '매치',  icon: 'M12 3 L15 9 L21 10 L16 14 L18 21 L12 17 L6 21 L8 14 L3 10 L9 9 Z' },
  { id: 'teams',       label: '팀',   icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
  { id: 'lessons',     label: '레슨',  icon: 'M5 5h14v14H5z M9 5v14 M15 5v14' },
  { id: 'marketplace', label: '장터',  icon: 'M4 7h16l-1 12H5L4 7z M8 7V5a4 4 0 0 1 8 0v2' },
  { id: 'more',        label: '더보기', icon: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-7 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm14 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z' },
];

const M17_SPORT_CHIPS = [
  { id: 'all',         label: '전체',    color: 'var(--blue500)' },
  { id: 'futsal',      label: '풋살',    color: 'var(--blue500)' },
  { id: 'basketball',  label: '농구',    color: 'var(--orange500)' },
  { id: 'badminton',   label: '배드민턴', color: 'var(--green500)' },
  { id: 'tennis',      label: '테니스',  color: 'var(--purple500)' },
  { id: 'icehockey',   label: '아이스하키', color: 'var(--teal500)' },
  { id: 'soccer',      label: '축구',    color: 'var(--red500)' },
];

const M17_MATCHES = [
  { sport: '풋살',     level: 'B',  title: '강남 6vs6 풋살 정기전',        date: '5/3 토', time: '19:00', venue: '잠실 풋살장', cur: 10, max: 12, fee: 17000 },
  { sport: '농구',     level: 'C',  title: '하프코트 3vs3 · 초중급',       date: '5/4 일', time: '14:00', venue: '광교 체육관', cur: 5,  max: 6,  fee: 5000  },
  { sport: '배드민턴', level: 'A',  title: '복식 4인 · 주말 오전 레전드',  date: '5/4 일', time: '10:00', venue: '신논현 코트', cur: 3,  max: 4,  fee: 8000  },
  { sport: '테니스',   level: 'B',  title: '테니스 복식 · 서초 코트',      date: '5/5 월', time: '09:00', venue: '서초 실내 테니스', cur: 2, max: 4, fee: 12000 },
  { sport: '축구',     level: 'C',  title: '11vs11 친선 · 강동',          date: '5/5 월', time: '17:00', venue: '강동 풋살파크', cur: 18, max: 22, fee: 8000 },
];

const M17_CONTEXT_ITEMS = [
  { label: '날씨', value: '22° 맑음', sub: '야외 활동 좋음' },
  { label: '이번 주 매치', value: '3', sub: '회 참가' },
  { label: '매너 점수', value: '4.9', sub: '/ 5.0' },
];

/* ---------- M17 local sub-components (all M17-prefixed) ---------- */

/* M17Sidebar — 240px left nav using canonical token classes */
const M17Sidebar = ({ active = 'matches' }) => (
  <aside style={{
    width: 240,
    flexShrink: 0,
    borderRight: '1px solid var(--grey100)',
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    background: 'var(--bg)',
  }}>
    {/* Wordmark */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 4 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: 'var(--blue500)', color: 'var(--static-white)',
        display: 'grid', placeItems: 'center', fontWeight: 800, flexShrink: 0,
      }}>
        <span className="tm-text-body-lg" style={{ fontWeight: 800 }}>T</span>
      </div>
      <span className="tm-text-body-lg" style={{ fontWeight: 700 }}>Teameet</span>
    </div>

    {/* Primary nav */}
    <nav style={{ display: 'grid', gap: 2 }} aria-label="주 내비게이션">
      {M17_NAV_ITEMS.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            className={`tm-btn tm-btn-md ${isActive ? 'tm-btn-secondary' : 'tm-btn-ghost'}`}
            style={{ justifyContent: 'flex-start', gap: 12, minHeight: 44 }}
            aria-current={isActive ? 'page' : undefined}
          >
            <svg
              width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={isActive ? 2.2 : 1.8}
              strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={item.icon}/>
            </svg>
            {item.label}
          </button>
        );
      })}
    </nav>

    {/* User context footer */}
    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="tm-surface-muted" style={{ padding: 12 }}>
        <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>강남구 · 신논현동</div>
        <div className="tm-text-caption" style={{ marginTop: 2 }}>반경 5km</div>
      </div>
      <button
        className="tm-btn tm-btn-outline tm-btn-sm"
        style={{ justifyContent: 'flex-start', gap: 8 }}
        aria-label="프로필 설정"
      >
        <div style={{
          width: 24, height: 24, borderRadius: 12,
          background: 'var(--blue500)', flexShrink: 0,
        }}/>
        <span className="tm-text-label">김철수</span>
      </button>
    </div>
  </aside>
);

/* M17BreadcrumbNav — desktop breadcrumb */
const M17BreadcrumbNav = ({ items = [] }) => (
  <nav aria-label="브레드크럼" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 0' }}>
    {items.map((item, i) => (
      <React.Fragment key={i}>
        {i > 0 && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--grey400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 6 6 6-6 6"/>
          </svg>
        )}
        <span
          className="tm-text-caption"
          style={{ color: i === items.length - 1 ? 'var(--text-strong)' : 'var(--text-muted)', fontWeight: i === items.length - 1 ? 600 : 400 }}
          aria-current={i === items.length - 1 ? 'page' : undefined}
        >
          {item}
        </span>
      </React.Fragment>
    ))}
  </nav>
);

/* M17KbdHint — keyboard shortcut hint */
const M17KbdHint = ({ keys = [], label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
    {keys.map((k, i) => (
      <kbd key={i} style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 22, height: 22, padding: '0 5px',
        background: 'var(--grey100)', border: '1px solid var(--grey200)',
        borderBottom: '2px solid var(--grey300)',
        borderRadius: 4, fontWeight: 600,
        fontFamily: 'var(--font-tab)', color: 'var(--grey700)',
        lineHeight: 1,
      }}
        className="tm-text-micro"
      >{k}</kbd>
    ))}
    {label && <span className="tm-text-micro" style={{ color: 'var(--text-muted)', marginLeft: 4 }}>{label}</span>}
  </div>
);

/* M17TableRow — dense data row */
const M17TableRow = ({ cols = [], isHeader, isEven }) => (
  <div
    role={isHeader ? undefined : 'row'}
    style={{
      display: 'grid',
      gridTemplateColumns: '2fr 1fr 1fr 80px 72px 72px',
      alignItems: 'center',
      padding: '0 20px',
      minHeight: isHeader ? 36 : 52,
      background: isHeader ? 'var(--grey50)' : isEven ? 'var(--bg)' : 'var(--grey50)',
      borderBottom: '1px solid var(--grey100)',
      gap: 12,
    }}
  >
    {cols.map((col, i) => (
      <div
        key={i}
        role={isHeader ? 'columnheader' : 'cell'}
        className={isHeader ? 'tm-text-micro' : 'tm-text-caption'}
        style={{
          color: isHeader ? 'var(--text-muted)' : 'var(--text-strong)',
          fontWeight: isHeader ? 600 : (i === 0 ? 500 : 400),
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >{col}</div>
    ))}
  </div>
);

/* M17ContextPanel — 320px right panel */
const M17ContextPanel = ({ title, children }) => (
  <aside
    style={{
      width: 320,
      flexShrink: 0,
      borderLeft: '1px solid var(--grey100)',
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      overflowY: 'auto',
      background: 'var(--bg)',
    }}
    aria-label={title || '상세 패널'}
  >
    {title && <div className="tm-text-label" style={{ color: 'var(--text-muted)' }}>{title}</div>}
    {children}
  </aside>
);

/* M17FilterRail — left sticky filter rail for search layout */
const M17FilterRail = () => (
  <aside style={{ width: 240, flexShrink: 0, borderRight: '1px solid var(--grey200)', padding: 24, overflowY: 'auto' }} aria-label="필터">
    <div className="tm-text-label" style={{ color: 'var(--grey900)', marginBottom: 12 }}>종목</div>
    <div style={{ marginBottom: 32 }}>
      {[['전체', 124, true], ['축구', 42], ['풋살', 38], ['농구', 18], ['테니스', 14], ['배드민턴', 8], ['하키', 4]].map(([t, n, a], i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: a ? 600 : 400, color: a ? 'var(--blue500)' : 'var(--grey700)' }}>
          <span className="tm-text-body">{t}</span>
          <span className="tm-text-caption tm-tabular" style={{ color: 'var(--grey500)', fontWeight: 400 }}>{n}</span>
        </div>
      ))}
    </div>

    <div className="tm-text-label" style={{ color: 'var(--grey900)', marginBottom: 12 }}>레벨</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 32 }}>
      {['A', 'B', 'C', 'D'].map(g => (
        <Chip key={g} size="sm" active={g === 'B'}>{g}급</Chip>
      ))}
    </div>

    <div className="tm-text-label" style={{ color: 'var(--grey900)', marginBottom: 12 }}>참가비</div>
    <div style={{ marginBottom: 32 }}>
      <div className="tm-text-caption tm-tabular" style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--grey600)', fontWeight: 400, marginBottom: 10 }}>
        <span>0원</span><span>100,000원</span>
      </div>
      <div style={{ height: 4, background: 'var(--grey200)', borderRadius: 2, position: 'relative' }}>
        <div style={{ position: 'absolute', left: '10%', right: '40%', height: '100%', background: 'var(--blue500)', borderRadius: 2 }}/>
      </div>
    </div>

    <div className="tm-text-label" style={{ color: 'var(--grey900)', marginBottom: 12 }}>특징</div>
    {['주차가능', '샤워실', '야간조명', '초보환영'].map(t => {
      const on = t === '초보환영';
      return (
        <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', color: 'var(--grey700)', cursor: 'pointer', fontWeight: 400, minHeight: 44 }}>
          <div style={{ width: 18, height: 18, borderRadius: 4, background: on ? 'var(--blue500)' : 'var(--static-white)', border: '1.5px solid ' + (on ? 'var(--blue500)' : 'var(--grey300)'), display: 'grid', placeItems: 'center' }}>
            {on && <Icon name="check" size={12} color="var(--static-white)" stroke={2.5}/>}
          </div>
          <span className="tm-text-body">{t}</span>
        </label>
      );
    })}
  </aside>
);

/* ---------- m17-tb-main: 태블릿 (768) workspace — DesktopShell 기반 컴팩트 ---------- */
const M17TabletMain = () => (
  <div style={{
    width: M17_TB_W, height: M17_TB_H,
    background: 'var(--bg)', fontFamily: 'var(--font)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  }}>
    {/* Top bar */}
    <header style={{
      height: 60, padding: '0 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderBottom: '1px solid var(--grey100)', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10, background: 'var(--blue500)',
          color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontWeight: 800,
        }}>T</div>
        <span className="tm-text-body-lg" style={{ fontWeight: 700 }}>Teameet</span>
      </div>
      <nav style={{ display: 'flex', gap: 4 }} aria-label="주 내비게이션">
        {M17_NAV_ITEMS.slice(0, 5).map((item, i) => (
          <button
            key={item.id}
            className={`tm-btn tm-btn-sm ${i === 1 ? 'tm-btn-secondary' : 'tm-btn-ghost'}`}
            style={{ minHeight: 44 }}
          >{item.label}</button>
        ))}
      </nav>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="tm-btn tm-btn-outline tm-btn-sm" aria-label="검색" style={{ minWidth: 44, minHeight: 44 }}>
          <Icon name="search" size={16}/>
        </button>
        <button className="tm-btn tm-btn-outline tm-btn-sm" aria-label="알림" style={{ minWidth: 44, minHeight: 44 }}>
          <Icon name="bell" size={16}/>
        </button>
      </div>
    </header>

    {/* Body — 2-col: filter rail + main list */}
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '200px 1fr', overflow: 'hidden' }}>
      {/* Left filter */}
      <div style={{ borderRight: '1px solid var(--grey100)', padding: '20px 16px', overflowY: 'auto' }}>
        <div className="tm-text-label" style={{ marginBottom: 12 }}>종목</div>
        {M17_SPORT_CHIPS.map((c, i) => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: i === 0 ? 600 : 400, color: i === 0 ? 'var(--blue500)' : 'var(--grey700)' }}>
            <span className="tm-text-body">{c.label}</span>
          </div>
        ))}
        <div className="tm-text-label" style={{ marginTop: 20, marginBottom: 12 }}>레벨</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {['A', 'B', 'C', 'D'].map(g => (
            <Chip key={g} size="sm" active={g === 'B'}>{g}급</Chip>
          ))}
        </div>
      </div>

      {/* Main list */}
      <main style={{ padding: '20px 24px', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <M17BreadcrumbNav items={['홈', '매치']}/>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="tm-text-heading" style={{ fontWeight: 700 }}>매치 찾기</div>
          <button className="tm-btn tm-btn-primary tm-btn-sm" style={{ minHeight: 44 }}>매치 만들기</button>
        </div>
        {/* Match rows using DesktopMatches list pattern */}
        <div style={{ border: '1px solid var(--grey200)', borderRadius: 12, overflow: 'hidden' }}>
          {M17_MATCHES.slice(0, 4).map((m, idx) => (
            <div key={idx} style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, borderTop: idx > 0 ? '1px solid var(--grey100)' : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <span className="tm-text-caption" style={{ padding: '2px 8px', background: 'var(--grey100)', color: 'var(--grey700)', fontWeight: 600, borderRadius: 4 }}>{m.sport}</span>
                  <span className="tm-text-caption" style={{ padding: '2px 8px', background: 'var(--blue50)', color: 'var(--blue500)', fontWeight: 600, borderRadius: 4 }}>Lv {m.level}</span>
                </div>
                <div className="tm-text-body-lg" style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</div>
                <div className="tm-text-caption tm-tabular" style={{ color: 'var(--text-muted)', marginTop: 4 }}>{m.date} {m.time} · {m.venue}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="tm-text-body-lg tm-tabular" style={{ fontWeight: 700 }}>{m.fee.toLocaleString()}원</div>
                <div className="tm-text-caption tm-tabular" style={{ color: 'var(--text-muted)', marginTop: 2 }}>{m.cur}/{m.max}명</div>
              </div>
              <Icon name="chevR" size={16} color="var(--grey400)"/>
            </div>
          ))}
        </div>
      </main>
    </div>
  </div>
);

/* ---------- m17-dt-main: full desktop hub — canonical DesktopHome ---------- */
const M17DesktopMain = () => (
  <div style={{
    width: M17_DT_W, height: M17_DT_H,
    overflow: 'hidden', position: 'relative',
  }}>
    <DesktopHome/>
  </div>
);

/* ---------- m17-dt-list: DesktopMatches — left filter rail + full list ---------- */
const M17DesktopList = () => (
  <div style={{
    width: M17_DT_W, height: M17_DT_H,
    overflow: 'hidden', position: 'relative',
  }}>
    <DesktopMatches/>
  </div>
);

/* ---------- m17-dt-detail: DesktopLessonDetail split-view ---------- */
const M17DesktopDetail = () => (
  <div style={{
    width: M17_DT_W, height: M17_DT_H,
    overflow: 'hidden', position: 'relative',
  }}>
    <DesktopLessonDetail/>
  </div>
);

/* ---------- m17-dt-flow-search: DesktopMatches 기반 + 글로벌 검색 오버레이 ---------- */
const M17DesktopFlowSearch = () => (
  <div style={{
    width: M17_DT_W, height: M17_DT_H,
    fontFamily: 'var(--font)',
    overflow: 'hidden', position: 'relative',
  }}>
    {/* Canonical DesktopMatches as background */}
    <div style={{ position: 'absolute', inset: 0 }}>
      <DesktopMatches/>
    </div>

    {/* Search overlay */}
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(0,0,0,0.32)',
      zIndex: 20,
      display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 80,
    }}>
      {/* Search modal */}
      <div style={{
        width: 640, background: 'var(--bg)',
        borderRadius: 16, boxShadow: 'var(--sh-4)',
        overflow: 'hidden',
      }} role="dialog" aria-modal="true" aria-label="글로벌 검색">
        {/* Input row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--grey100)' }}>
          <Icon name="search" size={20} color="var(--grey500)"/>
          <input
            className="tm-input"
            placeholder="종목, 지역, 팀명 검색..."
            style={{ border: 'none', padding: 0, fontWeight: 400, flex: 1 }}
            aria-label="검색어 입력"
          />
          <M17KbdHint keys={['Esc']} label="닫기"/>
        </div>

        {/* Recent / results */}
        <div style={{ padding: '12px 0', maxHeight: 360, overflowY: 'auto' }}>
          <div style={{ padding: '4px 20px 8px' }}>
            <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>최근 검색</div>
          </div>
          {['강남 풋살', '아이스하키 팀', '배드민턴 복식'].map((q) => (
            <div key={q} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 20px', cursor: 'pointer', minHeight: 44,
            }}
              className="tm-pressable"
            >
              <Icon name="clock" size={16} color="var(--grey400)"/>
              <span className="tm-text-body">{q}</span>
              <div style={{ flex: 1 }}/>
              <Icon name="arrow" size={14} color="var(--grey400)"/>
            </div>
          ))}
          <div style={{ padding: '12px 20px 4px', borderTop: '1px solid var(--grey100)' }}>
            <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>추천 매치</div>
          </div>
          {M17_MATCHES.slice(0, 3).map((m, idx) => (
            <div key={idx} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 20px', cursor: 'pointer', minHeight: 44,
            }}
              className="tm-pressable"
            >
              <Badge tone="blue" size="sm">{m.sport}</Badge>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tm-text-body" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</div>
                <div className="tm-text-caption tm-tabular" style={{ color: 'var(--text-muted)' }}>{m.date} {m.time}</div>
              </div>
              <Icon name="chevR" size={14} color="var(--grey400)"/>
            </div>
          ))}
        </div>

        {/* Footer kbd hints */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--grey100)', display: 'flex', gap: 16 }}>
          <M17KbdHint keys={['↵']} label="선택"/>
          <M17KbdHint keys={['↑', '↓']} label="이동"/>
          <M17KbdHint keys={['Esc']} label="닫기"/>
        </div>
      </div>
    </div>
  </div>
);

/* ---------- m17-dt-state-loading: DesktopHome 레이아웃 + Skeleton ---------- */
const M17DesktopStateLoading = () => (
  <div style={{
    width: M17_DT_W, height: M17_DT_H,
    background: 'var(--bg)', fontFamily: 'var(--font)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  }}>
    {/* Top nav skeleton — mirrors DesktopShell nav */}
    <div style={{ height: 64, borderBottom: '1px solid var(--grey200)', display: 'flex', alignItems: 'center', padding: '0 32px', gap: 40, flexShrink: 0 }}>
      <div className="skeleton-shimmer" style={{ height: 24, width: 96, background: 'var(--grey100)', borderRadius: 8 }}/>
      <div style={{ display: 'flex', gap: 28 }}>
        {[56, 40, 56, 48, 48].map((w, i) => (
          <div key={i} className="skeleton-shimmer" style={{ height: 16, width: w, background: 'var(--grey100)', borderRadius: 6 }}/>
        ))}
      </div>
      <div style={{ flex: 1 }}/>
      <div className="skeleton-shimmer" style={{ height: 40, width: 280, background: 'var(--grey100)', borderRadius: 8 }}/>
      <div className="skeleton-shimmer" style={{ height: 36, width: 36, background: 'var(--grey100)', borderRadius: 18 }}/>
    </div>

    {/* Body — left filter + main */}
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Left filter skeleton */}
      <div style={{ width: 240, borderRight: '1px solid var(--grey200)', padding: 24, flexShrink: 0 }}>
        {[60, 80, 64, 72, 56, 68, 48].map((w, i) => (
          <div key={i} className="skeleton-shimmer" style={{ height: 16, width: w, background: 'var(--grey100)', borderRadius: 6, marginBottom: 16 }}/>
        ))}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {[40, 40, 40, 40].map((w, i) => (
            <div key={i} className="skeleton-shimmer" style={{ height: 28, width: w, background: 'var(--grey100)', borderRadius: 999 }}/>
          ))}
        </div>
      </div>
      {/* Main content skeleton */}
      <main style={{ flex: 1, padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="skeleton-shimmer" style={{ height: 32, width: 200, background: 'var(--grey100)', borderRadius: 8 }}/>
          <div style={{ flex: 1 }}/>
          <div className="skeleton-shimmer" style={{ height: 44, width: 80, background: 'var(--grey100)', borderRadius: 12 }}/>
          <div className="skeleton-shimmer" style={{ height: 44, width: 120, background: 'var(--grey150)', borderRadius: 12 }}/>
        </div>
        {/* Match row skeletons */}
        <div style={{ border: '1px solid var(--grey200)', borderRadius: 12, overflow: 'hidden' }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton-shimmer" style={{ padding: 20, display: 'flex', gap: 20, alignItems: 'center', borderTop: i > 0 ? '1px solid var(--grey100)' : 'none' }}>
              <div style={{ width: 96, height: 96, borderRadius: 12, background: 'var(--grey150)' }}/>
              <div style={{ flex: 1 }}>
                <div style={{ height: 16, background: 'var(--grey150)', borderRadius: 6, width: '40%', marginBottom: 10 }}/>
                <div style={{ height: 20, background: 'var(--grey150)', borderRadius: 6, width: '70%', marginBottom: 8 }}/>
                <div style={{ height: 14, background: 'var(--grey150)', borderRadius: 6, width: '55%' }}/>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ height: 20, width: 80, background: 'var(--grey150)', borderRadius: 6, marginBottom: 8, marginLeft: 'auto' }}/>
                <div style={{ height: 14, width: 48, background: 'var(--grey150)', borderRadius: 6, marginLeft: 'auto' }}/>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  </div>
);

/* ---------- m17-dt-state-empty: DesktopMatches 레이아웃 + EmptyState ---------- */
const M17DesktopStateEmpty = () => (
  <div style={{
    width: M17_DT_W, height: M17_DT_H,
    background: 'var(--bg)', fontFamily: 'var(--font)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  }}>
    {/* Top nav — mirrors DesktopShell */}
    <div style={{ height: 64, borderBottom: '1px solid var(--grey200)', display: 'flex', alignItems: 'center', padding: '0 32px', gap: 40, flexShrink: 0 }}>
      <div className="tm-text-body-lg" style={{ fontWeight: 700, color: 'var(--grey900)' }}>Teameet</div>
      <div style={{ display: 'flex', gap: 28 }}>
        {[['매치', true], ['팀'], ['레슨'], ['장터'], ['시설']].map(([t, a], i) => (
          <div key={i} className="tm-text-body" style={{ fontWeight: a ? 600 : 400, color: a ? 'var(--grey900)' : 'var(--grey600)' }}>{t}</div>
        ))}
      </div>
      <div style={{ flex: 1 }}/>
      <div style={{ width: 36, height: 36, borderRadius: 18, background: `url(${IMG.av1}) center/cover` }}/>
    </div>

    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <M17FilterRail/>
      <main style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ maxWidth: 780, margin: '0 auto', padding: '32px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 24 }}>
            <div className="tm-text-heading" style={{ fontWeight: 700, color: 'var(--grey900)', margin: 0 }}>매치 찾기</div>
            <span className="tm-text-body tm-tabular" style={{ color: 'var(--grey600)', marginLeft: 10, fontWeight: 400 }}>아이스하키 · 강남구 · 0건</span>
            <div style={{ flex: 1 }}/>
            <button className="tm-btn tm-btn-primary tm-btn-sm" style={{ minHeight: 44 }}>매치 만들기</button>
          </div>

          {/* Empty state — uses EmptyState pattern */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ textAlign: 'center', maxWidth: 400 }}>
              <div style={{
                width: 80, height: 80, borderRadius: 24,
                background: 'var(--grey100)', display: 'grid', placeItems: 'center',
                margin: '0 auto 20px',
              }}>
                <Icon name="search" size={36} color="var(--grey400)"/>
              </div>
              <div className="tm-text-heading" style={{ fontWeight: 700 }}>근처에 아이스하키 매치가 없어요</div>
              <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.6 }}>
                반경을 넓히거나 종목을 바꿔보세요.<br/>직접 매치를 만들 수도 있어요.
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 24 }}>
                <button className="tm-btn tm-btn-outline tm-btn-md" style={{ minHeight: 44 }}>반경 넓히기 (10km)</button>
                <button className="tm-btn tm-btn-primary tm-btn-md" style={{ minHeight: 44 }}>매치 만들기</button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
);

/* ---------- m17-dt-state-error: DesktopMatches 레이아웃 + ErrorState ---------- */
const M17DesktopStateError = () => (
  <div style={{
    width: M17_DT_W, height: M17_DT_H,
    background: 'var(--bg)', fontFamily: 'var(--font)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  }}>
    {/* Top nav */}
    <div style={{ height: 64, borderBottom: '1px solid var(--grey200)', display: 'flex', alignItems: 'center', padding: '0 32px', gap: 40, flexShrink: 0 }}>
      <div className="tm-text-body-lg" style={{ fontWeight: 700, color: 'var(--grey900)' }}>Teameet</div>
      <div style={{ display: 'flex', gap: 28 }}>
        {[['매치', true], ['팀'], ['레슨'], ['장터'], ['시설']].map(([t, a], i) => (
          <div key={i} className="tm-text-body" style={{ fontWeight: a ? 600 : 400, color: a ? 'var(--grey900)' : 'var(--grey600)' }}>{t}</div>
        ))}
      </div>
      <div style={{ flex: 1 }}/>
      <div style={{ width: 36, height: 36, borderRadius: 18, background: `url(${IMG.av1}) center/cover` }}/>
    </div>

    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <M17FilterRail/>
      <main style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ maxWidth: 780, margin: '0 auto', padding: '32px 24px' }}>
          <M17BreadcrumbNav items={['홈', '매치']}/>

          {/* Error state centered */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 64 }}>
            <div style={{ textAlign: 'center', maxWidth: 400 }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'var(--red50)', color: 'var(--red500)',
                display: 'grid', placeItems: 'center',
                margin: '0 auto 20px',
              }}>
                <span className="tm-text-heading" style={{ fontWeight: 700, color: 'var(--red500)' }}>!</span>
              </div>
              <div className="tm-text-heading" style={{ fontWeight: 700 }}>매치를 불러올 수 없어요</div>
              <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.6 }}>
                네트워크가 불안정하거나 서버 응답이 없어요.<br/>잠시 후 다시 시도해주세요.
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 24 }}>
                <button className="tm-btn tm-btn-outline tm-btn-md" style={{ minHeight: 44 }}>이전으로</button>
                <button className="tm-btn tm-btn-primary tm-btn-md" style={{ minHeight: 44 }}>다시 시도</button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
);

/* ---------- M17 local swatch helpers ---------- */
const M17ComponentSwatch = ({ label, children }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', gap: 8,
    padding: 12, borderRadius: 12,
    background: 'var(--grey50)', border: '1px solid var(--grey100)',
  }}>
    <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</div>
  </div>
);

const M17AssetSwatch = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>{children}</div>
  </div>
);

const M17ColorSwatch = ({ token, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
    <div style={{ width: 36, height: 36, borderRadius: 8, background: value, border: '1px solid var(--grey100)' }}/>
    <div className="tm-text-micro tm-tabular">{token}</div>
  </div>
);

/* ---------- m17-dt-components: canonical component inventory ---------- */
const M17DesktopComponents = () => (
  <div style={{
    width: M17_DT_W, height: M17_DT_H,
    background: 'var(--bg)', padding: 32,
    fontFamily: 'var(--font)', overflow: 'hidden',
  }}>
    <Badge tone="blue" size="sm">m17-dt-components</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M17 데스크탑 · 사용 컴포넌트</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>데스크탑 워크스페이스가 사용하는 canonical components/ui primitives</div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 20 }}>
      {/* M17Sidebar */}
      <M17ComponentSwatch label="M17Sidebar · 240px · active nav + user context">
        <div style={{ width: 240, border: '1px solid var(--grey100)', borderRadius: 12, overflow: 'hidden' }}>
          <M17Sidebar active="matches"/>
        </div>
      </M17ComponentSwatch>

      {/* M17BreadcrumbNav */}
      <M17ComponentSwatch label="M17BreadcrumbNav · aria-current=page on last">
        <M17BreadcrumbNav items={['홈', '매치', '강남 6vs6 풋살 정기전']}/>
      </M17ComponentSwatch>

      {/* M17KbdHint */}
      <M17ComponentSwatch label="M17KbdHint · ⌘K / Esc / ↑↓ / ↵">
        <M17KbdHint keys={['⌘', 'K']} label="글로벌 검색"/>
        <M17KbdHint keys={['N']} label="매치 만들기"/>
        <M17KbdHint keys={['/']} label="필터"/>
        <M17KbdHint keys={['Esc']} label="닫기"/>
        <M17KbdHint keys={['↑', '↓']} label="이동"/>
        <M17KbdHint keys={['↵']} label="선택"/>
      </M17ComponentSwatch>

      {/* M17TableRow */}
      <M17ComponentSwatch label="M17TableRow · header + 2 data rows (dense)">
        <div style={{ width: '100%', border: '1px solid var(--grey100)', borderRadius: 8, overflow: 'hidden' }}>
          <M17TableRow isHeader cols={['매치명', '종목', '일시', '장소', '인원', '참가비']}/>
          <M17TableRow isEven cols={['강남 6vs6 풋살 정기전', '풋살', '5/3 토 19:00', '잠실 풋살장', '10/12명', '17,000원']}/>
          <M17TableRow cols={['하프코트 3vs3 초중급', '농구', '5/4 일 14:00', '광교 체육관', '5/6명', '5,000원']}/>
        </div>
      </M17ComponentSwatch>

      {/* M17ContextPanel */}
      <M17ComponentSwatch label="M17ContextPanel · 320px · title + card slots">
        <div style={{ width: 320, border: '1px solid var(--grey100)', borderRadius: 12, overflow: 'hidden' }}>
          <M17ContextPanel title="장소 정보">
            <Card pad={14}>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>날씨</div>
              <div className="tm-text-body-lg tm-tabular" style={{ marginTop: 4 }}>22° 맑음</div>
            </Card>
          </M17ContextPanel>
        </div>
      </M17ComponentSwatch>

      {/* Button sizes */}
      <M17ComponentSwatch label="Button · primary / outline / ghost — md lg · 44px min">
        <button className="tm-btn tm-btn-primary tm-btn-md" style={{ minHeight: 44 }}>참가 신청</button>
        <button className="tm-btn tm-btn-outline tm-btn-md" style={{ minHeight: 44 }}>필터</button>
        <button className="tm-btn tm-btn-ghost tm-btn-md" style={{ minHeight: 44 }}>전체 보기</button>
        <button className="tm-btn tm-btn-primary tm-btn-lg" style={{ minHeight: 44 }}>매치 만들기</button>
      </M17ComponentSwatch>

      {/* M17FilterRail preview */}
      <M17ComponentSwatch label="M17FilterRail · 240px · sticky left filter (DesktopMatches pattern)">
        <div style={{ width: 240, border: '1px solid var(--grey100)', borderRadius: 12, overflow: 'hidden', maxHeight: 300 }}>
          <M17FilterRail/>
        </div>
      </M17ComponentSwatch>

      {/* DesktopShell top nav preview */}
      <M17ComponentSwatch label="DesktopShell TopNav · 1280px / 64px · logo + nav + search + avatar">
        <div style={{ width: '100%', height: 64, border: '1px solid var(--grey200)', borderRadius: 8, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 24 }}>
          <div className="tm-text-body-lg" style={{ fontWeight: 700 }}>Teameet</div>
          <div style={{ display: 'flex', gap: 20 }}>
            {['매치', '팀', '레슨', '장터', '시설'].map((t, i) => (
              <span key={t} className="tm-text-body" style={{ fontWeight: i === 0 ? 600 : 400, color: i === 0 ? 'var(--grey900)' : 'var(--grey600)' }}>{t}</span>
            ))}
          </div>
          <div style={{ flex: 1 }}/>
          <div style={{ height: 40, width: 200, background: 'var(--grey100)', borderRadius: 8, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 8 }}>
            <Icon name="search" size={16} color="var(--grey500)"/>
            <span className="tm-text-caption" style={{ color: 'var(--grey400)' }}>종목 · 지역 검색</span>
          </div>
          <div style={{ width: 36, height: 36, borderRadius: 18, background: `url(${IMG.av1}) center/cover` }}/>
        </div>
      </M17ComponentSwatch>
    </div>
  </div>
);

/* ---------- m17-tb-components ---------- */
const M17TabletComponents = () => (
  <div style={{
    width: M17_TB_W, height: M17_TB_H,
    background: 'var(--bg)', padding: 24,
    fontFamily: 'var(--font)', overflow: 'hidden',
  }}>
    <Badge tone="blue" size="sm">m17-tb-components</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M17 태블릿 · 사용 컴포넌트</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>태블릿 워크스페이스가 사용하는 components/ui primitives</div>

    <div style={{ display: 'grid', gap: 12, marginTop: 20 }}>
      <M17ComponentSwatch label="TopNav (tablet) · 768px · logo + nav tabs + icons">
        <div style={{ width: '100%', height: 60, border: '1px solid var(--grey100)', borderRadius: 8, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--blue500)', display: 'grid', placeItems: 'center', color: 'var(--static-white)', fontWeight: 800 }}>T</div>
          <span className="tm-text-body-lg" style={{ fontWeight: 700 }}>Teameet</span>
          <div style={{ display: 'flex', gap: 4, marginLeft: 16 }}>
            {['홈', '매치', '팀', '레슨', '장터'].map((l, i) => (
              <button key={l} className={`tm-btn tm-btn-sm ${i === 1 ? 'tm-btn-secondary' : 'tm-btn-ghost'}`} style={{ minHeight: 44 }}>{l}</button>
            ))}
          </div>
        </div>
      </M17ComponentSwatch>

      <M17ComponentSwatch label="M17BreadcrumbNav · tablet context">
        <M17BreadcrumbNav items={['홈', '매치']}/>
      </M17ComponentSwatch>

      <M17ComponentSwatch label="Sport filter chips (tablet width)">
        {M17_SPORT_CHIPS.slice(0, 5).map((c, i) => (
          <Chip key={c.id} active={i === 0} size="sm">{c.label}</Chip>
        ))}
      </M17ComponentSwatch>

      <M17ComponentSwatch label="Match row card (tablet — DesktopMatches list pattern)">
        <div style={{ border: '1px solid var(--grey200)', borderRadius: 12, overflow: 'hidden', width: '100%' }}>
          {M17_MATCHES.slice(0, 2).map((m, idx) => (
            <div key={idx} style={{ padding: '16px 20px', display: 'flex', gap: 20, alignItems: 'center', borderTop: idx > 0 ? '1px solid var(--grey100)' : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <span style={{ padding: '2px 8px', background: 'var(--grey100)', color: 'var(--grey700)', fontWeight: 600, borderRadius: 4 }} className="tm-text-caption">{m.sport}</span>
                  <span style={{ padding: '2px 8px', background: 'var(--blue50)', color: 'var(--blue500)', fontWeight: 600, borderRadius: 4 }} className="tm-text-caption">Lv {m.level}</span>
                </div>
                <div className="tm-text-body-lg" style={{ fontWeight: 600 }}>{m.title}</div>
                <div className="tm-text-caption tm-tabular" style={{ color: 'var(--grey600)', fontWeight: 400 }}>{m.date} {m.time} · {m.venue}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="tm-text-body-lg tm-tabular" style={{ fontWeight: 700 }}>{m.fee.toLocaleString()}원</div>
                <div className="tm-text-caption tm-tabular" style={{ color: 'var(--grey600)', fontWeight: 400, marginTop: 4 }}>{m.cur}/{m.max}명</div>
              </div>
            </div>
          ))}
        </div>
      </M17ComponentSwatch>

      <M17ComponentSwatch label="M17KbdHint · tablet (hover device only)">
        <M17KbdHint keys={['⌘', 'K']} label="검색"/>
        <M17KbdHint keys={['Esc']} label="닫기"/>
      </M17ComponentSwatch>
    </div>
  </div>
);

/* ---------- m17-dt-assets ---------- */
const M17DesktopAssets = () => (
  <div style={{
    width: M17_DT_W, height: M17_DT_H,
    background: 'var(--bg)', padding: 32,
    fontFamily: 'var(--font)', overflow: 'hidden',
  }}>
    <Badge tone="blue" size="sm">m17-dt-assets</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M17 데스크탑 · 사용 토큰/에셋</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>데스크탑 워크스페이스가 사용하는 디자인 토큰 인벤토리</div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 20 }}>
      <M17AssetSwatch label="Color · brand + interaction">
        <M17ColorSwatch token="blue500" value="var(--blue500)"/>
        <M17ColorSwatch token="blue50" value="var(--blue50)"/>
        <M17ColorSwatch token="blue100" value="var(--blue100)"/>
        <M17ColorSwatch token="blue600" value="var(--blue600)"/>
      </M17AssetSwatch>

      <M17AssetSwatch label="Color · sportCardAccent (종목별 토큰)">
        <M17ColorSwatch token="futsal / blue500" value="var(--blue500)"/>
        <M17ColorSwatch token="basketball / orange500" value="var(--orange500)"/>
        <M17ColorSwatch token="badminton / green500" value="var(--green500)"/>
        <M17ColorSwatch token="tennis / purple500" value="var(--purple500)"/>
        <M17ColorSwatch token="icehockey / teal500" value="var(--teal500)"/>
        <M17ColorSwatch token="soccer / red500" value="var(--red500)"/>
      </M17AssetSwatch>

      <M17AssetSwatch label="Color · neutral (surface / border / text hierarchy)">
        <M17ColorSwatch token="grey50" value="var(--grey50)"/>
        <M17ColorSwatch token="grey100" value="var(--grey100)"/>
        <M17ColorSwatch token="grey200" value="var(--grey200)"/>
        <M17ColorSwatch token="grey400" value="var(--grey400)"/>
        <M17ColorSwatch token="grey600" value="var(--grey600)"/>
        <M17ColorSwatch token="grey900" value="var(--grey900)"/>
      </M17AssetSwatch>

      <M17AssetSwatch label="Color · semantic (error / warning / success)">
        <M17ColorSwatch token="red500" value="var(--red500)"/>
        <M17ColorSwatch token="red50" value="var(--red50)"/>
        <M17ColorSwatch token="green500" value="var(--green500)"/>
        <M17ColorSwatch token="orange500" value="var(--orange500)"/>
      </M17AssetSwatch>

      <M17AssetSwatch label="Typography · 사용 단계 (tm-text-* class)">
        <span className="tm-text-display">display</span>
        <span className="tm-text-heading">heading</span>
        <span className="tm-text-body-lg">body-lg</span>
        <span className="tm-text-body">body</span>
        <span className="tm-text-label">label</span>
        <span className="tm-text-caption">caption</span>
        <span className="tm-text-micro">micro</span>
      </M17AssetSwatch>

      <M17AssetSwatch label="Spacing · 4-multiple (사용 값)">
        {[8, 12, 16, 20, 24, 28, 32].map((n) => (
          <Badge key={n} tone="grey" size="sm">{`${n}px`}</Badge>
        ))}
      </M17AssetSwatch>

      <M17AssetSwatch label="Layout · DesktopShell grid">
        <Badge tone="blue" size="sm">top nav 64px</Badge>
        <Badge tone="blue" size="sm">filter rail 240px</Badge>
        <Badge tone="blue" size="sm">main 1fr (max 780)</Badge>
        <Badge tone="blue" size="sm">context / sticky booking 360-380px</Badge>
      </M17AssetSwatch>

      <M17AssetSwatch label="Radius · card / control / pill">
        <Badge tone="grey" size="sm">r-sm 8 · kbd/tag</Badge>
        <Badge tone="grey" size="sm">r-md 12 · card</Badge>
        <Badge tone="grey" size="sm">r-lg 16 · modal/panel</Badge>
        <Badge tone="grey" size="sm">r-pill · chip/badge</Badge>
      </M17AssetSwatch>

      <M17AssetSwatch label="Shadow · hairline-depth (sh-1~sh-3)">
        {['sh-1 0 1px 3px / .06', 'sh-2 0 2px 8px / .08', 'sh-3 0 4px 12px / .10'].map((s) => (
          <Badge key={s} tone="grey" size="sm">{s}</Badge>
        ))}
      </M17AssetSwatch>

      <M17AssetSwatch label="Control height · 44px minimum (touch targets)">
        {['sm 40', 'md 48', 'lg 52-56', 'icon 44 (min)'].map((t) => (
          <Badge key={t} tone="grey" size="sm">{t}</Badge>
        ))}
      </M17AssetSwatch>

      <M17AssetSwatch label="Motion tokens">
        <Badge tone="grey" size="sm">dur-fast 120ms</Badge>
        <Badge tone="grey" size="sm">dur-base 180ms</Badge>
        <Badge tone="grey" size="sm">ease-out-quart</Badge>
        <Badge tone="grey" size="sm">scale(.98) pressable</Badge>
      </M17AssetSwatch>

      <M17AssetSwatch label="Icon · lucide (사용 아이콘)">
        <span className="tm-text-caption">search, bell, chevR, chevD, close, plus, clock, people, filter, calendar, share, check, star, heart, arrow, menu</span>
      </M17AssetSwatch>
    </div>
  </div>
);

/* ---------- m17-dt-motion ---------- */
const M17DesktopMotion = () => (
  <div style={{
    width: M17_DT_W, height: M17_DT_H,
    background: 'var(--bg)', padding: 32,
    fontFamily: 'var(--font)', overflow: 'hidden',
  }}>
    <Badge tone="blue" size="sm">m17-dt-motion</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M17 데스크탑 · motion contract</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>데스크탑 워크스페이스에서 사용하는 motion 토큰 및 keyboard focus 명세</div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
      {/* Hover + press */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="tm-text-label" style={{ marginBottom: 4 }}>Hover / Press</div>
        <ListItem title="Card hover" sub="border-color var(--border-strong) + box-shadow var(--sh-2) · 180ms ease-out-quart" trailing="hover"/>
        <ListItem title="Button press" sub="scale(.98) · 120ms ease-out-quart. disabled → opacity .42 + no scale" trailing="press"/>
        <ListItem title="Chip press" sub="scale(.97) · 120ms. tm-pressable pattern" trailing="chip"/>
        <ListItem title="TableRow hover" sub="background var(--grey50) · no scale (table rows skip scale)" trailing="row"/>
        <ListItem title="FilterRail item hover" sub="background var(--grey100) · 120ms · ghost button pattern" trailing="rail"/>
        <ListItem title="Sidebar collapse" sub="sidebar width 240→60px · translateX(-180) · 200ms ease-out-quart. icon-only mode. 재확장 시 fade-in label 120ms" trailing="sidebar"/>
      </div>

      {/* Keyboard focus */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="tm-text-label" style={{ marginBottom: 4 }}>Keyboard Focus (a11y)</div>
        <ListItem title="Focus ring" sub="outline: 2px solid var(--blue500); outline-offset: 2px — 모든 interactive element" trailing="focus"/>
        <ListItem title="Tab order" sub="TopNav → FilterRail → Main list rows → Pagination · 논리적 DOM 순서" trailing="tab"/>
        <ListItem title="Search overlay focus trap" sub="⌘K → modal 내부 Tab cycle → Esc 닫기 + 이전 focus 복원" trailing="trap"/>
        <ListItem title="Keyboard shortcut hints" sub="hover 시 kbd 힌트 노출. prefers-reduced-motion 시 즉시 노출" trailing="kbd"/>
        <ListItem title="Arrow key navigation" sub="search results → ↑↓ + ↵ 선택" trailing="arrow"/>
      </div>

      {/* Panel & overlay transitions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="tm-text-label" style={{ marginBottom: 4 }}>Panel / Overlay</div>
        <ListItem title="Search overlay open" sub="backdrop opacity 0→.32 · 180ms · modal scale-in 1.02→1 + fade-in · 200ms" trailing="overlay"/>
        <ListItem title="Sticky booking panel" sub="position:sticky top:24. scroll 시 shadow sh-1 appear · 120ms" trailing="sticky"/>
        <ListItem title="Hover preview card" sub="DesktopMarket 카드 hover → scale(1.02) + sh-2 · 180ms. thumbnail 확대 없음" trailing="preview"/>
        <ListItem title="Toast enter" sub="tm-enter-up 280ms ease-out-quint — translateY(8)+opacity" trailing="toast"/>
        <ListItem title="Breadcrumb update" sub="새 segment fade-in 0→1 · 120ms" trailing="bread"/>
      </div>

      {/* Accessibility */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="tm-text-label" style={{ marginBottom: 4 }}>Accessibility</div>
        <ListItem title="prefers-reduced-motion" sub="모든 transition/animation 0.01ms. scale 제거. opacity 유지." trailing="a11y"/>
        <ListItem title="Skeleton shimmer" sub="loading state → 1.4s ease infinite (skeleton-shimmer class)" trailing="skel"/>
        <ListItem title="Table overflow" sub="clip + ellipsis (min-width:0 + overflow:hidden + text-overflow:ellipsis). 가로 스크롤 없음" trailing="tbl"/>
        <ListItem title="Focus-visible only" sub=":focus-visible만 outline. 마우스 클릭 시 ring 미노출" trailing="vis"/>
        <ListItem title="Color + label parity" sub="종목 chip = color token + label 텍스트 병기. 색맹 대응" trailing="color"/>
      </div>
    </div>
  </div>
);

/* ---------- Object.assign export ---------- */
Object.assign(window, {
  M17TabletMain,
  M17DesktopMain,
  M17DesktopDetail,
  M17DesktopList,
  M17DesktopFlowSearch,
  M17DesktopStateLoading,
  M17DesktopStateEmpty,
  M17DesktopStateError,
  M17DesktopComponents,
  M17TabletComponents,
  M17DesktopAssets,
  M17DesktopMotion,
});
