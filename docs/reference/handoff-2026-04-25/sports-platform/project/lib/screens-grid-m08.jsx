/* fix32 — M08 용병 Mercenary grid. Canonical visual vocabulary rewrite.
   ID schema: m08-{mb|tb|dt}-{main|detail|create|state|components|assets|motion}[-{state}]
   Routes: /mercenary, /mercenary/[id], /mercenary/new, /teams/[id]/mercenary
   Light-only. References tokens.jsx + signatures.jsx. All helpers M08-prefixed. */

const M08_MB_W = 375;
const M08_MB_H = 812;
const M08_TB_W = 768;
const M08_TB_H = 1024;
const M08_DT_W = 1280;
const M08_DT_H = 820;

/* Sport accent map — all values from tokens.jsx var(--*) */
const M08_SPORT_ACCENT = {
  soccer:     { bg: 'var(--red50)',    fg: 'var(--red500)' },
  futsal:     { bg: 'var(--blue50)',   fg: 'var(--blue500)' },
  basketball: { bg: 'var(--orange50)', fg: 'var(--orange500)' },
  badminton:  { bg: 'var(--green50)',  fg: 'var(--green500)' },
  tennis:     { bg: 'var(--purple-alpha-10)', fg: 'var(--purple500)' },
  hockey:     { bg: 'var(--blue-alpha-08)', fg: 'var(--teal500)' },
};

/* Sample mercenary posts — M08-namespaced fixture */
const M08_POSTS = [
  {
    id: 1, sport: 'soccer', sportLabel: '축구', pos: 'GK', urgent: true,
    team: 'FC 발빠른놈들', dt: '오늘 18:00', loc: '상암', pay: 25000,
    dist: '1.2km', filled: 0, total: 1,
    host: { name: '김정민', manner: 4.9, matches: 24, noshow: 0 },
    deadline: '2시간 후 마감',
  },
  {
    id: 2, sport: 'futsal', sportLabel: '풋살', pos: 'MF', urgent: false,
    team: '다이나믹 FS', dt: '내일 20:00', loc: '잠실', pay: 15000,
    dist: '4.5km', filled: 0, total: 2,
    host: { name: '박지훈', manner: 4.8, matches: 11, noshow: 2 },
    deadline: '내일 18:00 마감',
  },
  {
    id: 3, sport: 'basketball', sportLabel: '농구', pos: 'C', urgent: false,
    team: '강남 농구회', dt: '4/26 14:00', loc: '강남', pay: 20000,
    dist: '8.2km', filled: 1, total: 1,
    host: { name: '이수현', manner: 4.7, matches: 8, noshow: 1 },
    deadline: '4/26 12:00 마감',
  },
  {
    id: 4, sport: 'futsal', sportLabel: '풋살', pos: 'FW', urgent: false,
    team: '수요풋살', dt: '4/26 21:00', loc: '신도림', pay: 18000,
    dist: '6.0km', filled: 0, total: 1,
    host: { name: '최소연', manner: 4.9, matches: 37, noshow: 0 },
    deadline: '4/26 20:00 마감',
  },
];

/* Applicants for detail view */
const M08_APPLICANTS = [
  { name: '김태양', manner: 4.9, level: 'B+', sport: 'GK 12회', av: null, status: 'pending' },
  { name: '박동현', manner: 4.7, level: 'A', sport: 'GK 24회', av: null, status: 'accepted' },
  { name: '이준혁', manner: 4.5, level: 'B', sport: 'GK 6회', av: null, status: 'pending' },
];

/* ─── M08 Atoms (all M08-prefixed to avoid Babel single-scope collision) ─── */

/* Sport badge with accent color */
const M08SportBadge = ({ sport, label, pos, size = 'md' }) => {
  const accent = M08_SPORT_ACCENT[sport] || M08_SPORT_ACCENT.futsal;
  const sm = size === 'sm';
  return (
    <span className={sm ? 'tm-text-2xs' : 'tm-text-xs'} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      height: sm ? 20 : 24,
      padding: sm ? '0 8px' : '0 8px',
      borderRadius: 'var(--r-pill)',
      background: accent.bg,
      color: accent.fg,
      fontWeight: 700,
      whiteSpace: 'nowrap',
      letterSpacing: 0,
    }}>
      {label}{pos ? ` · ${pos}` : ''}
    </span>
  );
};

/* Urgent badge */
const M08UrgentBadge = ({ size = 'md' }) => {
  const sm = size === 'sm';
  return (
    <span className={sm ? 'tm-text-2xs' : 'tm-text-2xs'} style={{
      display: 'inline-flex', alignItems: 'center',
      height: sm ? 20 : 24,
      padding: '0 8px',
      borderRadius: 'var(--r-pill)',
      background: 'var(--red50)',
      color: 'var(--red500)',
      fontWeight: 700,
      whiteSpace: 'nowrap',
      letterSpacing: 0,
    }}>긴급</span>
  );
};

/* Reward badge — pay amount with accent (uses tm-text-* classes) */
const M08RewardBadge = ({ pay, size = 'md' }) => {
  const sm = size === 'sm';
  return (
    <div style={{ textAlign: 'right' }}>
      <div className={`tm-tabular ${sm ? 'tm-text-base' : 'tm-text-lg'}`} style={{
        fontWeight: 700,
        color: 'var(--blue500)',
        letterSpacing: 0,
        lineHeight: 1.1,
      }}>+{pay.toLocaleString('ko-KR')}</div>
      <div className="tm-text-2xs" style={{ color: 'var(--text-caption)', fontWeight: 500, marginTop: 2 }}>페이</div>
    </div>
  );
};

/* Position picker — inline chip row, sport-aware */
const M08PositionPicker = ({ sport = 'soccer', active }) => {
  const positions = {
    soccer:     ['GK', 'DF', 'MF', 'FW'],
    futsal:     ['GK', 'DF', 'MF', 'FW'],
    basketball: ['PG', 'SG', 'SF', 'PF', 'C'],
    badminton:  ['단식', '복식', '무관'],
    tennis:     ['단식', '복식', '무관'],
    hockey:     ['GK', 'D', 'W', 'C'],
  }[sport] || ['무관'];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {positions.map((p) => (
        <button
          key={p}
          aria-label={`포지션 ${p} 선택`}
          aria-pressed={active === p}
          className="tm-text-sm"
          style={{
            height: 44,
            minWidth: 44,
            padding: '0 16px',
            borderRadius: 'var(--r-pill)',
            background: active === p ? 'var(--blue500)' : 'var(--grey100)',
            color: active === p ? 'var(--static-white)' : 'var(--grey700)',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            transition: 'background-color var(--dur-fast) var(--ease-out-quart)',
          }}
        >{p}</button>
      ))}
    </div>
  );
};

/* Host trust indicator */
const M08TrustIndicator = ({ manner, matches, noshow, size = 'md' }) => {
  const dot = noshow === 0
    ? { bg: 'var(--green50)',  fg: 'var(--green500)',  label: '노쇼 0%' }
    : noshow <= 2
    ? { bg: 'var(--orange50)', fg: 'var(--orange500)', label: `노쇼 ${noshow}회` }
    :   { bg: 'var(--red50)',   fg: 'var(--red500)',   label: `노쇼 ${noshow}회` };
  const sm = size === 'sm';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className={`tm-tabular ${sm ? 'tm-text-2xs' : 'tm-text-xs'}`} style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
        ★ {manner}
      </span>
      <span className={sm ? 'tm-text-2xs' : 'tm-text-xs'} style={{ color: 'var(--text-muted)', fontWeight: 500 }}>· 용병 {matches}회</span>
      <span className="tm-text-2xs" style={{
        height: sm ? 16 : 18, padding: '0 6px', borderRadius: 999,
        background: dot.bg, color: dot.fg,
        fontWeight: 700,
        display: 'inline-flex', alignItems: 'center',
      }}>{dot.label}</span>
    </div>
  );
};

/* Position filled indicator */
const M08FilledBar = ({ filled, total }) => {
  const full = filled >= total;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--grey150)', overflow: 'hidden' }}>
        <div style={{
          width: `${Math.min(100, (filled / total) * 100)}%`,
          height: '100%',
          background: full ? 'var(--red500)' : 'var(--blue500)',
          borderRadius: 2,
          transition: 'width 0.3s var(--ease-out-quart)',
        }}/>
      </div>
      <span className="tm-tabular tm-text-xs" style={{
        fontWeight: 600,
        color: full ? 'var(--red500)' : 'var(--text-muted)',
        whiteSpace: 'nowrap',
      }}>
        {filled}/{total}명
      </span>
    </div>
  );
};

/* MercenaryCard — list row card using canonical M08 primitives */
const M08MercenaryCard = ({ post }) => (
  <div className="tm-pressable" style={{
    background: 'var(--bg)',
    padding: 16,
    borderTop: '1px solid var(--grey100)',
    borderBottom: '1px solid var(--grey100)',
    cursor: 'pointer',
  }}>
    {/* badges row */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      {post.urgent && <M08UrgentBadge size="sm"/>}
      <M08SportBadge sport={post.sport} label={post.sportLabel} pos={post.pos} size="sm"/>
      <span className="tm-tabular tm-text-xs" style={{ color: 'var(--text-caption)', fontWeight: 500, marginLeft: 'auto' }}>{post.dist}</span>
    </div>
    {/* team + pay */}
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tm-text-body-lg" style={{ lineHeight: 1.35 }}>{post.team}</div>
        <div className="tm-tabular tm-text-xs" style={{ color: 'var(--text-muted)', fontWeight: 500, marginTop: 4 }}>{post.dt} · {post.loc}</div>
        <div style={{ marginTop: 8 }}>
          <M08FilledBar filled={post.filled} total={post.total}/>
        </div>
      </div>
      <M08RewardBadge pay={post.pay}/>
    </div>
    {/* host row */}
    <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--grey200)', flexShrink: 0 }} aria-hidden="true"/>
      <span className="tm-text-label">{post.host.name} 호스트</span>
      <M08TrustIndicator manner={post.host.manner} matches={post.host.matches} noshow={post.host.noshow} size="sm"/>
      <button
        aria-label={`${post.team} 용병 지원하기`}
        className="tm-text-xs"
        style={{
          marginLeft: 'auto',
          height: 44,
          minWidth: 44,
          padding: '0 16px',
          borderRadius: 8,
          background: 'var(--blue500)', color: 'var(--static-white)',
          border: 'none', fontWeight: 700,
          cursor: 'pointer',
          transition: 'background-color var(--dur-fast)',
        }}
      >지원</button>
    </div>
  </div>
);

/* Applicant row — host review UI */
const M08ApplicantRow = ({ applicant }) => {
  const accepted = applicant.status === 'accepted';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 20px',
      background: 'var(--bg)',
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--grey200)', flexShrink: 0 }} aria-hidden="true"/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="tm-text-label">{applicant.name}</div>
          {accepted && (
            <span className="tm-text-2xs" style={{ height: 18, padding: '0 6px', borderRadius: 999, background: 'var(--green50)', color: 'var(--green500)', fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>확정</span>
          )}
        </div>
        <div className="tm-tabular tm-text-xs" style={{ color: 'var(--text-muted)', fontWeight: 500, marginTop: 2 }}>
          ★ {applicant.manner} · {applicant.level}급 · {applicant.sport}
        </div>
      </div>
      {!accepted && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button aria-label={`${applicant.name} 수락`} className="tm-text-xs" style={{ height: 44, minWidth: 44, padding: '0 12px', borderRadius: 8, background: 'var(--blue500)', color: 'var(--static-white)', border: 'none', fontWeight: 700, cursor: 'pointer' }}>수락</button>
          <button aria-label={`${applicant.name} 거절`} className="tm-text-xs" style={{ height: 44, minWidth: 44, padding: '0 12px', borderRadius: 8, background: 'var(--grey100)', color: 'var(--text-muted)', border: 'none', fontWeight: 600, cursor: 'pointer' }}>거절</button>
        </div>
      )}
    </div>
  );
};

/* ─── Components board helpers (M08-prefixed) ─── */

const M08ComponentSwatch = ({ label, children }) => (
  <div style={{ marginBottom: 16 }}>
    <div className="tm-text-xs" style={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</div>
  </div>
);

const M08AssetSwatch = ({ label, children }) => (
  <div style={{ marginBottom: 12 }}>
    <div className="tm-text-xs" style={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</div>
  </div>
);

const M08ColorSwatch = ({ token, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
    <div style={{ width: 36, height: 36, borderRadius: 8, background: value, border: '1px solid var(--border)' }}/>
    <div className="tm-text-2xs" style={{ color: 'var(--text-caption)' }}>{token}</div>
  </div>
);

/* ───────────────────── m08-mb-main ───────────────────── */
const M08MobileMain = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* header */}
      <div style={{ padding: '12px 20px', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
        <div className="tm-text-subhead">용병</div>
        <button
          aria-label="용병 구인 등록"
          className="tm-btn tm-btn-dark tm-btn-sm"
          style={{ minHeight: 44, padding: '0 16px' }}
        >+ 구인 등록</button>
      </div>

      {/* KPI strip — canonical KPIStat */}
      <div style={{ background: 'var(--bg)', padding: '16px 20px 20px', borderBottom: '8px solid var(--grey50)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <KPIStat label="오늘 모집" value={42} unit="건"/>
          <KPIStat label="평균 매칭" value={18} unit="분"/>
          <KPIStat label="평균 페이" value={20000} unit="원"/>
        </div>
      </div>

      {/* sport filter chips — canonical HapticChip */}
      <div style={{ background: 'var(--bg)', padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
          <HapticChip active>전체 42</HapticChip>
          <HapticChip count={18}>축구</HapticChip>
          <HapticChip count={12}>풋살</HapticChip>
          <HapticChip count={6}>농구</HapticChip>
          <HapticChip count={4}>테니스</HapticChip>
        </div>
      </div>

      {/* post list — canonical M08MercenaryCard */}
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 16 }}>
        {M08_POSTS.map((post) => (
          <M08MercenaryCard key={post.id} post={post}/>
        ))}
      </div>

      <BottomNav active="matches"/>
    </div>
  </Phone>
);

/* ───────────────────── m08-tb-main ───────────────────── */
const M08TabletMain = () => (
  <div style={{ width: M08_TB_W, height: M08_TB_H, background: 'var(--bg)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font)' }}>
    {/* header */}
    <div style={{ padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
      <div className="tm-text-heading">용병</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="tm-btn tm-btn-outline tm-btn-md" aria-label="필터">필터</button>
        <button className="tm-btn tm-btn-dark tm-btn-md" aria-label="구인 등록">+ 구인 등록</button>
      </div>
    </div>

    {/* KPI strip — canonical KPIStat in Card */}
    <div style={{ padding: '20px 32px', background: 'var(--grey50)', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
      <Card pad={16}><KPIStat label="오늘 모집" value={42} unit="건"/></Card>
      <Card pad={16}><KPIStat label="평균 매칭" value={18} unit="분"/></Card>
      <Card pad={16}><KPIStat label="평균 페이" value={20000} unit="원"/></Card>
    </div>

    {/* filter chips */}
    <div style={{ padding: '16px 32px', display: 'flex', gap: 8, borderBottom: '1px solid var(--border)' }}>
      {['전체 42', '축구 18', '풋살 12', '농구 6', '테니스 4', '배드민턴 2'].map((c, i) => (
        <Chip key={c} active={i === 0} size="sm">{c}</Chip>
      ))}
    </div>

    {/* 2-col grid */}
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {M08_POSTS.map((post) => (
        <Card key={post.id} interactive onClick={() => {}}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {post.urgent && <M08UrgentBadge size="sm"/>}
            <M08SportBadge sport={post.sport} label={post.sportLabel} pos={post.pos} size="sm"/>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div className="tm-text-body-lg">{post.team}</div>
            <M08RewardBadge pay={post.pay} size="sm"/>
          </div>
          <div className="tm-tabular tm-text-xs" style={{ marginTop: 4, color: 'var(--text-muted)' }}>{post.dt} · {post.loc}</div>
          <div style={{ marginTop: 8 }}><M08FilledBar filled={post.filled} total={post.total}/></div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--grey200)' }} aria-hidden="true"/>
            <M08TrustIndicator manner={post.host.manner} matches={post.host.matches} noshow={post.host.noshow} size="sm"/>
          </div>
        </Card>
      ))}
    </div>
  </div>
);

/* ───────────────────── m08-dt-main ───────────────────── */
const M08DesktopMain = () => (
  <div style={{ width: M08_DT_W, height: M08_DT_H, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'grid', gridTemplateColumns: '240px 1fr 300px' }}>
    {/* left sidebar */}
    <aside style={{ borderRight: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>T</div>
        <div className="tm-text-body-lg">Teameet</div>
      </div>
      <nav style={{ display: 'grid', gap: 4 }}>
        {[['홈', false], ['매치', false], ['팀', false], ['용병', true], ['장터', false]].map(([l, a]) => (
          <button key={l} className={`tm-btn tm-btn-md ${a ? 'tm-btn-secondary' : 'tm-btn-ghost'}`} style={{ justifyContent: 'flex-start' }} aria-current={a ? 'page' : undefined}>{l}</button>
        ))}
      </nav>
      <div style={{ marginTop: 'auto' }}>
        <div className="tm-text-label" style={{ marginBottom: 8 }}>종목 필터</div>
        <div style={{ display: 'grid', gap: 4 }}>
          {[['전체', 42], ['축구', 18], ['풋살', 12], ['농구', 6], ['테니스', 4]].map(([l, c], i) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
              <span className="tm-text-label" style={{ color: i === 0 ? 'var(--blue500)' : 'var(--text)' }}>{l}</span>
              <span className="tm-tabular tm-text-xs" style={{ color: 'var(--text-caption)' }}>{c}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>

    {/* center main */}
    <main style={{ padding: 32, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
        <div>
          <div className="tm-text-heading">용병 모집</div>
          <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>오늘 42개 포지션 · AI 실력 매칭</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="tm-btn tm-btn-outline tm-btn-md" aria-label="필터">필터</button>
          <button className="tm-btn tm-btn-dark tm-btn-md" aria-label="구인 등록">+ 구인 등록</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, overflow: 'auto' }}>
        {M08_POSTS.map((post) => (
          <Card key={post.id} interactive onClick={() => {}}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {post.urgent && <M08UrgentBadge size="sm"/>}
              <M08SportBadge sport={post.sport} label={post.sportLabel} pos={post.pos} size="sm"/>
              <span className="tm-tabular tm-text-xs" style={{ marginLeft: 'auto', color: 'var(--text-caption)' }}>{post.dist}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div className="tm-text-body-lg">{post.team}</div>
              <M08RewardBadge pay={post.pay}/>
            </div>
            <div className="tm-tabular tm-text-xs" style={{ marginTop: 4, color: 'var(--text-muted)' }}>{post.dt} · {post.loc}</div>
            <div style={{ marginTop: 8 }}><M08FilledBar filled={post.filled} total={post.total}/></div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--grey200)' }} aria-hidden="true"/>
              <M08TrustIndicator manner={post.host.manner} matches={post.host.matches} noshow={post.host.noshow} size="sm"/>
            </div>
          </Card>
        ))}
      </div>
    </main>

    {/* right panel */}
    <aside style={{ borderLeft: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="tm-text-label">빠른 통계</div>
      <Card pad={16}>
        <KPIStat label="오늘 모집" value={42} unit="건"/>
        <div style={{ marginTop: 12 }}><KPIStat label="평균 매칭" value={18} unit="분"/></div>
        <div style={{ marginTop: 12 }}><KPIStat label="평균 페이" value={20000} unit="원"/></div>
      </Card>
      <div className="tm-text-label">마감 임박</div>
      <Card pad={16}>
        <div className="tm-text-xs" style={{ color: 'var(--red500)' }}>오늘 18:00 마감</div>
        <div className="tm-text-label" style={{ marginTop: 4 }}>FC 발빠른놈들 · GK 1명</div>
        <div className="tm-tabular tm-text-xs" style={{ marginTop: 4, color: 'var(--text-muted)' }}>+25,000원 페이</div>
      </Card>
    </aside>
  </div>
);

/* ───────────────────── m08-mb-detail ───────────────────── */
const M08MobileDetail = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TopNav title="용병 구인 상세" trailing={
        <button aria-label="공유" style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer' }}>
          <Icon name="share" size={18}/>
        </button>
      }/>

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100 }}>
        {/* hero section */}
        <div style={{ background: 'var(--bg)', padding: 20, borderBottom: '8px solid var(--grey50)' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <M08UrgentBadge/>
            <M08SportBadge sport="soccer" label="축구" pos="GK"/>
          </div>
          <div className="tm-text-heading">오늘 18:00 골키퍼 1명 급구</div>
          <div className="tm-text-xs" style={{ marginTop: 8, color: 'var(--red500)', fontWeight: 600 }}>2시간 후 마감</div>
        </div>

        {/* pay section — canonical NumberDisplay + MoneyRow */}
        <div style={{ background: 'var(--bg)', padding: 20, borderBottom: '8px solid var(--grey50)' }}>
          <NumberDisplay value={25000} unit="원" size={36} sub="평균보다 +5,000원"/>
          <div style={{ marginTop: 16, padding: 16, borderRadius: 12, background: 'var(--grey50)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              ['일시', '오늘 18:00 ~ 20:00 (2시간)'],
              ['장소', '상암월드컵 보조구장'],
              ['거리', '내 위치에서 1.2km'],
              ['팀명', 'FC 발빠른놈들'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="tm-text-xs" style={{ color: 'var(--text-muted)' }}>{k}</span>
                <span className="tm-text-label">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* position filled status */}
        <div style={{ background: 'var(--bg)', padding: 20, borderBottom: '8px solid var(--grey50)' }}>
          <SectionTitle title="모집 현황"/>
          <div style={{ padding: '0 4px' }}>
            <M08FilledBar filled={0} total={1}/>
            <div className="tm-text-xs" style={{ marginTop: 8, color: 'var(--text-muted)' }}>0/1명 확정 · 3명 지원 중</div>
          </div>
        </div>

        {/* requirements */}
        <div style={{ background: 'var(--bg)', padding: 20, borderBottom: '8px solid var(--grey50)' }}>
          <SectionTitle title="요청 조건"/>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {['B급 이상', '20~40대', '장갑 지참', '5분 전 도착'].map((r) => (
              <div key={r} className="tm-text-xs" style={{ height: 32, padding: '0 12px', borderRadius: 999, background: 'var(--grey100)', fontWeight: 600, color: 'var(--text-strong)', display: 'grid', placeItems: 'center' }}>{r}</div>
            ))}
          </div>
        </div>

        {/* pay breakdown — canonical MoneyRow */}
        <div style={{ background: 'var(--bg)', padding: 20, borderBottom: '8px solid var(--grey50)' }}>
          <SectionTitle title="페이 구성"/>
          <MoneyRow label="기본 출전료" amount={20000}/>
          <MoneyRow label="긴급 모집 가산" amount={5000}/>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 4 }}>
            <MoneyRow label="총 페이" amount={25000} strong accent/>
          </div>
        </div>

        {/* host info — M08TrustIndicator */}
        <div style={{ background: 'var(--bg)', padding: 20 }}>
          <SectionTitle title="호스트 정보"/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--grey200)', flexShrink: 0 }} aria-hidden="true"/>
            <div style={{ flex: 1 }}>
              <div className="tm-text-body-lg">김정민</div>
              <div style={{ marginTop: 4 }}><M08TrustIndicator manner={4.9} matches={24} noshow={0}/></div>
            </div>
          </div>
        </div>
      </div>

      {/* sticky CTA */}
      <div style={{ padding: '12px 20px 24px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
        <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" aria-label="지원하기 25000원 받기">지원하기 · 25,000원 받기</button>
      </div>
    </div>
  </Phone>
);

/* ───────────────────── m08-mb-create ───────────────────── */
/* Uses canonical MercCreate from screens-forms.jsx where available;
   wraps in Phone for grid context. */
const M08MobileCreate = () => {
  /* M08-prefixed local field wrapper */
  const M08Field = ({ label, required, children }) => (
    <div style={{ marginBottom: 20 }}>
      <label className="tm-text-sm" style={{ display: 'block', fontWeight: 600, color: 'var(--text-strong)', marginBottom: 8 }}>
        {label}{required && <span style={{ color: 'var(--red500)', marginLeft: 2 }} aria-hidden="true">*</span>}
      </label>
      {children}
    </div>
  );
  const M08Input = ({ id, value, suffix, readOnly }) => (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <input
        id={id}
        readOnly={readOnly}
        defaultValue={value}
        className="tm-input"
        style={{ paddingRight: suffix ? 40 : 14 }}
      />
      {suffix && <span className="tm-text-sm" style={{ position: 'absolute', right: 14, color: 'var(--text-muted)', fontWeight: 500 }}>{suffix}</span>}
    </div>
  );

  return (
    <Phone>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopNav title="용병 구하기"/>
        <div style={{ flex: 1, overflow: 'auto', padding: 20, paddingBottom: 100 }}>
          {/* sport picker */}
          <M08Field label="종목" required>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['축구', '풋살', '농구', '배드민턴'].map((s, i) => (
                <button
                  key={s}
                  aria-pressed={i === 0}
                  className="tm-text-sm"
                  style={{
                    height: 44, minWidth: 44, padding: '0 16px', borderRadius: 999,
                    background: i === 0 ? 'var(--blue500)' : 'var(--grey100)',
                    color: i === 0 ? 'var(--static-white)' : 'var(--grey700)',
                    fontWeight: 600, border: 'none', cursor: 'pointer',
                    transition: 'background-color var(--dur-fast) var(--ease-out-quart)',
                  }}
                >{s}</button>
              ))}
            </div>
          </M08Field>

          <M08Field label="경기 일시" required>
            <M08Input id="merc-dt" value="5월 3일 (토) 14:00" readOnly/>
          </M08Field>

          <M08Field label="장소" required>
            <M08Input id="merc-loc" value="상암 월드컵경기장 보조구장" readOnly/>
          </M08Field>

          {/* position picker — M08PositionPicker */}
          <M08Field label="원하는 포지션">
            <M08PositionPicker sport="soccer" active="MF"/>
          </M08Field>

          <M08Field label="구하는 인원" required>
            <M08Input id="merc-count" value="1" suffix="명"/>
          </M08Field>

          {/* level picker */}
          <M08Field label="최소 레벨">
            <div style={{ display: 'flex', gap: 8 }}>
              {['D', 'C', 'B', 'A', 'S'].map((l, i) => (
                <button
                  key={l}
                  aria-pressed={i === 2}
                  aria-label={`레벨 ${l}`}
                  className="tm-text-sm"
                  style={{
                    width: 44, height: 44, borderRadius: 8,
                    background: i === 2 ? 'var(--blue500)' : 'var(--grey100)',
                    color: i === 2 ? 'var(--static-white)' : 'var(--grey700)',
                    fontWeight: 700, border: 'none', cursor: 'pointer',
                    transition: 'background-color var(--dur-fast) var(--ease-out-quart)',
                  }}
                >{l}</button>
              ))}
            </div>
          </M08Field>

          {/* pay — canonical NumberDisplay for context */}
          <M08Field label="참가비 (페이)" required>
            <M08Input id="merc-pay" value="25,000" suffix="원"/>
          </M08Field>

          {/* description */}
          <M08Field label="추가 설명">
            <div className="tm-text-sm" style={{ minHeight: 100, background: 'var(--grey100)', borderRadius: 12, padding: 16, color: 'var(--grey700)', fontWeight: 400, lineHeight: 1.6 }}>
              빠른 스피드와 중원 장악 가능한 분 구해요. 유니폼 지급.
            </div>
          </M08Field>

          {/* urgent toggle */}
          <div style={{ padding: 16, background: 'var(--orange50)', borderRadius: 12, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Icon name="zap" size={20} color="var(--orange500)" aria-hidden="true"/>
            <div style={{ flex: 1 }}>
              <div className="tm-text-label">긴급 표시 (+1,000원)</div>
              <div className="tm-text-xs" style={{ marginTop: 4, color: 'var(--text-muted)' }}>상단 고정 + 푸시 알림 발송</div>
            </div>
            {/* toggle — 44x44 touch target */}
            <button
              role="switch"
              aria-checked="true"
              aria-label="긴급 표시"
              style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}
            >
              <div style={{ width: 44, height: 26, background: 'var(--blue500)', borderRadius: 13, position: 'relative' }}>
                <div style={{ width: 22, height: 22, background: 'var(--static-white)', borderRadius: 11, position: 'absolute', right: 2, top: 2, transition: 'right var(--dur-fast) var(--ease-out-quart)' }}/>
              </div>
            </button>
          </div>
        </div>

        {/* CTA */}
        <div style={{ padding: '12px 20px 24px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
          <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" aria-label="용병 공고 등록">용병 공고 등록</button>
        </div>
      </div>
    </Phone>
  );
};

/* ───────────────────── m08-mb-state-loading ───────────────────── */
/* Mercenary list wireframe + Skeleton placeholders (canonical Skeleton) */
const M08MobileStateLoading = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* header skeleton */}
      <div style={{ padding: '12px 20px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
        <Skeleton w={60} h={24} r={8}/>
      </div>
      {/* KPI skeleton */}
      <div style={{ background: 'var(--bg)', padding: '16px 20px', borderBottom: '8px solid var(--grey50)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[0,1,2].map((i) => <Skeleton key={i} w="100%" h={52} r={8}/>)}
      </div>
      {/* chip skeleton */}
      <div style={{ background: 'var(--bg)', padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        {[60, 44, 52, 44].map((w, i) => <Skeleton key={i} w={w} h={32} r={999}/>)}
      </div>
      {/* card skeletons */}
      <div style={{ flex: 1, padding: '4px 0' }}>
        {[0,1,2,3].map((i) => (
          <div key={i} className="skeleton-shimmer" style={{ background: 'var(--bg)', padding: 16, borderTop: '1px solid var(--grey100)', borderBottom: '1px solid var(--grey100)', marginBottom: 1 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <Skeleton w={48} h={20} r={999}/>
              <Skeleton w={72} h={20} r={999}/>
            </div>
            <Skeleton w="70%" h={18} mb={8}/>
            <Skeleton w="50%" h={12} mb={8}/>
            <Skeleton w="100%" h={4} r={2}/>
          </div>
        ))}
      </div>
    </div>
  </Phone>
);

/* ───────────────────── m08-mb-state-empty ───────────────────── */
const M08MobileStateEmpty = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
        <div className="tm-text-subhead">용병</div>
        <button aria-label="구인 등록" className="tm-btn tm-btn-dark tm-btn-sm" style={{ minHeight: 44, padding: '0 16px' }}>+ 구인 등록</button>
      </div>
      {/* KPI strip */}
      <div style={{ background: 'var(--bg)', padding: '16px 20px 20px', borderBottom: '8px solid var(--grey50)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <KPIStat label="오늘 모집" value={0} unit="건"/>
          <KPIStat label="평균 매칭" value={0} unit="분"/>
          <KPIStat label="평균 페이" value={0} unit="원"/>
        </div>
      </div>
      <div style={{ padding: '12px 20px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <HapticChip active>축구 0</HapticChip>
          <HapticChip count={0}>풋살</HapticChip>
        </div>
      </div>
      {/* canonical EmptyState */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <EmptyState
          icon="swords"
          title="모집글 없음"
          sub="다른 종목을 선택하거나 직접 구인글을 올려보세요"
          cta="구인 등록하기"
          onCta={() => {}}
        />
        <button className="tm-btn tm-btn-outline tm-btn-md tm-btn-block" style={{ marginTop: 12 }}>다른 종목 보기</button>
      </div>
      <BottomNav active="matches"/>
    </div>
  </Phone>
);

/* ───────────────────── m08-mb-state-pending ───────────────────── */
/* Applicant's view: 지원 심사중 (mercenary-list wireframe + pending badge) */
const M08MobileStatePending = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TopNav title="용병 구인 상세"/>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100 }}>
        {/* pending banner */}
        <div style={{ padding: '12px 20px', background: 'var(--orange50)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icon name="clock" size={18} color="var(--orange500)" aria-hidden="true"/>
          <div>
            <div className="tm-text-label" style={{ color: 'var(--orange500)' }}>지원 심사 중</div>
            <div className="tm-text-xs" style={{ color: 'var(--text-muted)', marginTop: 2 }}>호스트가 검토 후 승인·거절 알림을 보내요</div>
          </div>
        </div>
        {/* hero */}
        <div style={{ background: 'var(--bg)', padding: 20, borderBottom: '8px solid var(--grey50)' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <Badge tone="orange" size="sm">심사중</Badge>
            <M08SportBadge sport="soccer" label="축구" pos="GK"/>
          </div>
          <div className="tm-text-heading">오늘 18:00 골키퍼 1명 급구</div>
        </div>
        {/* pay — canonical NumberDisplay */}
        <div style={{ background: 'var(--bg)', padding: 20, borderBottom: '8px solid var(--grey50)' }}>
          <NumberDisplay value={25000} unit="원" size={36}/>
          <div style={{ marginTop: 16, padding: 16, borderRadius: 12, background: 'var(--orange50)', display: 'flex', gap: 12 }}>
            <Icon name="clock" size={16} color="var(--orange500)" aria-hidden="true"/>
            <div className="tm-text-xs" style={{ color: 'var(--orange500)', fontWeight: 600 }}>평균 20분 이내 응답해요</div>
          </div>
        </div>
        {/* my application status */}
        <div style={{ background: 'var(--bg)', padding: 20 }}>
          <SectionTitle title="내 지원 현황"/>
          <div style={{ padding: 16, borderRadius: 12, background: 'var(--grey50)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--grey200)', flexShrink: 0 }} aria-hidden="true"/>
            <div style={{ flex: 1 }}>
              <div className="tm-text-label">나의 지원서</div>
              <div className="tm-text-xs" style={{ marginTop: 2, color: 'var(--text-muted)' }}>B+급 · GK 12회 · 매너 4.9</div>
            </div>
            <Badge tone="orange" size="sm">심사중</Badge>
          </div>
        </div>
      </div>
      {/* CTA — cancel pending */}
      <div style={{ padding: '12px 20px 24px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
        <button className="tm-btn tm-btn-outline tm-btn-md tm-btn-block" style={{ color: 'var(--red500)', borderColor: 'var(--red500)' }} aria-label="지원 취소">지원 취소하기</button>
      </div>
    </div>
  </Phone>
);

/* ───────────────────── m08-mb-state-deadline ───────────────────── */
const M08MobileStateDeadline = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TopNav title="용병 구인 상세"/>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100 }}>
        {/* deadline banner */}
        <div style={{ padding: '12px 20px', background: 'var(--red50)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icon name="clock" size={18} color="var(--red500)" aria-hidden="true"/>
          <div>
            <div className="tm-text-label" style={{ color: 'var(--red500)' }}>마감 30분 전</div>
            <div className="tm-text-xs" style={{ color: 'var(--text-muted)', marginTop: 2 }}>지금 지원하지 않으면 기회를 놓쳐요</div>
          </div>
        </div>
        {/* hero */}
        <div style={{ background: 'var(--bg)', padding: 20, borderBottom: '8px solid var(--grey50)' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <M08UrgentBadge/>
            <M08SportBadge sport="soccer" label="축구" pos="GK"/>
          </div>
          <div className="tm-text-heading">오늘 18:00 골키퍼 1명 급구</div>
        </div>
        {/* pay — canonical NumberDisplay */}
        <div style={{ background: 'var(--bg)', padding: 20, borderBottom: '8px solid var(--grey50)' }}>
          <NumberDisplay value={25000} unit="원" size={36} sub="마감 후 지원 불가"/>
        </div>
        {/* filled */}
        <div style={{ background: 'var(--bg)', padding: 20 }}>
          <SectionTitle title="모집 현황"/>
          <M08FilledBar filled={0} total={1}/>
          <div className="tm-text-xs" style={{ marginTop: 8, color: 'var(--text-muted)' }}>0/1명 확정</div>
        </div>
      </div>
      {/* CTA with countdown */}
      <div style={{ padding: '12px 20px 24px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
        <div className="tm-tabular tm-text-xs" style={{ color: 'var(--red500)', textAlign: 'center', marginBottom: 8, fontWeight: 700 }} aria-live="polite">00:29:42 후 마감</div>
        <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" aria-label="지원하기 25000원 받기">지원하기 · 25,000원 받기</button>
      </div>
    </div>
  </Phone>
);

/* ───────────────────── m08-mb-state-sold-out ───────────────────── */
const M08MobileStateSoldOut = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TopNav title="용병 구인 상세"/>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100 }}>
        {/* sold-out banner */}
        <div style={{ padding: '12px 20px', background: 'var(--grey100)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icon name="check-circle" size={18} color="var(--text-muted)" aria-hidden="true"/>
          <div className="tm-text-label" style={{ color: 'var(--text-muted)' }}>정원이 모두 찼어요</div>
        </div>
        {/* hero — dimmed */}
        <div style={{ background: 'var(--bg)', padding: 20, borderBottom: '8px solid var(--grey50)', opacity: 0.6 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <Badge tone="grey" size="sm">마감</Badge>
            <M08SportBadge sport="soccer" label="축구" pos="GK"/>
          </div>
          <div className="tm-text-heading">오늘 18:00 골키퍼 1명 급구</div>
        </div>
        {/* pay — canonical NumberDisplay */}
        <div style={{ background: 'var(--bg)', padding: 20, borderBottom: '8px solid var(--grey50)' }}>
          <NumberDisplay value={25000} unit="원" size={36} sub="정원 마감 완료"/>
          <div style={{ marginTop: 12 }}><M08FilledBar filled={1} total={1}/></div>
        </div>
        {/* waitlist */}
        <div style={{ background: 'var(--bg)', padding: 20 }}>
          <SectionTitle title="대기 신청" sub="정원 취소 시 순서대로 확정"/>
          <div className="tm-text-xs" style={{ marginBottom: 12, color: 'var(--text-muted)' }}>현재 대기 2명</div>
          <button className="tm-btn tm-btn-outline tm-btn-md tm-btn-block" aria-label="대기 신청">대기 신청하기</button>
        </div>
      </div>
      {/* CTA — disabled */}
      <div style={{ padding: '12px 20px 24px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
        <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" aria-disabled="true" style={{ opacity: 0.42 }}>마감된 공고입니다</button>
      </div>
    </div>
  </Phone>
);

/* ───────────────────── m08-mb-components ───────────────────── */
const M08ComponentsBoard = ({ viewport = 'mb' }) => {
  const w = viewport === 'mb' ? M08_MB_W : viewport === 'tb' ? M08_TB_W : M08_DT_W;
  const h = viewport === 'mb' ? M08_MB_H : viewport === 'tb' ? M08_TB_H : M08_DT_H;
  return (
    <div style={{ width: w, height: h, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflow: 'hidden' }}>
      <Badge tone="blue" size="sm">{`m08-${viewport}-components`}</Badge>
      <div className="tm-text-title" style={{ marginTop: 8 }}>M08 {viewport === 'mb' ? '모바일' : viewport === 'tb' ? '태블릿' : '데스크탑'} · 사용 컴포넌트</div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>용병 화면이 사용하는 components/ui primitives</div>
      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        <M08ComponentSwatch label="M08MercenaryCard · list row (urgent + filled)">
          <div style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <M08MercenaryCard post={M08_POSTS[0]}/>
          </div>
        </M08ComponentSwatch>
        <M08ComponentSwatch label="M08RewardBadge · pay amount (uses tm-text-lg / tm-text-base)">
          <M08RewardBadge pay={25000}/>
          <M08RewardBadge pay={15000} size="sm"/>
        </M08ComponentSwatch>
        <M08ComponentSwatch label="M08SportBadge · sport + position (tm-text-xs / tm-text-2xs)">
          <M08SportBadge sport="soccer" label="축구" pos="GK"/>
          <M08SportBadge sport="futsal" label="풋살" pos="MF" size="sm"/>
          <M08SportBadge sport="basketball" label="농구" pos="C"/>
        </M08ComponentSwatch>
        <M08ComponentSwatch label="M08UrgentBadge · deadline indicator">
          <M08UrgentBadge/>
          <M08UrgentBadge size="sm"/>
        </M08ComponentSwatch>
        <M08ComponentSwatch label="M08PositionPicker · sport-aware chip row (44px touch)">
          <M08PositionPicker sport="soccer" active="MF"/>
        </M08ComponentSwatch>
        <M08ComponentSwatch label="M08TrustIndicator · host trust score">
          <M08TrustIndicator manner={4.9} matches={24} noshow={0}/>
          <M08TrustIndicator manner={4.5} matches={8} noshow={2}/>
        </M08ComponentSwatch>
        <M08ComponentSwatch label="M08FilledBar · position capacity progress">
          <div style={{ width: 200 }}><M08FilledBar filled={0} total={1}/></div>
          <div style={{ width: 200 }}><M08FilledBar filled={1} total={1}/></div>
        </M08ComponentSwatch>
        <M08ComponentSwatch label="NumberDisplay (canonical) · pay hero">
          <NumberDisplay value={25000} unit="원" size={36} sub="평균보다 +5,000원"/>
        </M08ComponentSwatch>
        <M08ComponentSwatch label="MoneyRow (canonical) · pay breakdown">
          <div style={{ width: '100%' }}>
            <MoneyRow label="기본 출전료" amount={20000}/>
            <MoneyRow label="긴급 가산" amount={5000}/>
            <MoneyRow label="총 페이" amount={25000} strong accent/>
          </div>
        </M08ComponentSwatch>
        <M08ComponentSwatch label="KPIStat (canonical) · KPI strip">
          <KPIStat label="오늘 모집" value={42} unit="건"/>
          <KPIStat label="평균 페이" value={20000} unit="원"/>
        </M08ComponentSwatch>
        <M08ComponentSwatch label="M08ApplicantRow · host applicant review">
          <div style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {M08_APPLICANTS.slice(0, 2).map((a, i) => <M08ApplicantRow key={i} applicant={a}/>)}
          </div>
        </M08ComponentSwatch>
        <M08ComponentSwatch label="HapticChip (canonical) · sport filter">
          <HapticChip active>전체 42</HapticChip>
          <HapticChip count={18}>축구</HapticChip>
          <HapticChip count={12}>풋살</HapticChip>
        </M08ComponentSwatch>
      </div>
    </div>
  );
};

/* ───────────────────── m08-mb-assets ───────────────────── */
const M08AssetsBoard = ({ viewport = 'mb' }) => {
  const w = viewport === 'mb' ? M08_MB_W : viewport === 'tb' ? M08_TB_W : M08_DT_W;
  const h = viewport === 'mb' ? M08_MB_H : viewport === 'tb' ? M08_TB_H : M08_DT_H;
  return (
    <div style={{ width: w, height: h, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflow: 'hidden' }}>
      <Badge tone="blue" size="sm">{`m08-${viewport}-assets`}</Badge>
      <div className="tm-text-title" style={{ marginTop: 8 }}>M08 {viewport === 'mb' ? '모바일' : viewport === 'tb' ? '태블릿' : '데스크탑'} · 사용 토큰/에셋</div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>용병 화면이 사용하는 디자인 토큰 인벤토리</div>
      <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
        <M08AssetSwatch label="Color · brand + semantic">
          <M08ColorSwatch token="blue500" value="var(--blue500)"/>
          <M08ColorSwatch token="blue50" value="var(--blue50)"/>
          <M08ColorSwatch token="red500" value="var(--red500)"/>
          <M08ColorSwatch token="red50" value="var(--red50)"/>
          <M08ColorSwatch token="orange500" value="var(--orange500)"/>
          <M08ColorSwatch token="green500" value="var(--green500)"/>
        </M08AssetSwatch>
        <M08AssetSwatch label="Color · sport card accents (6 종목)">
          {Object.entries(M08_SPORT_ACCENT).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: v.bg, outline: `2px solid ${v.fg}` }}/>
              <div className="tm-text-2xs" style={{ color: 'var(--text-caption)' }}>{k}</div>
            </div>
          ))}
        </M08AssetSwatch>
        <M08AssetSwatch label="Color · neutral hierarchy">
          <M08ColorSwatch token="grey50" value="var(--grey50)"/>
          <M08ColorSwatch token="grey100" value="var(--grey100)"/>
          <M08ColorSwatch token="grey150" value="var(--grey150)"/>
          <M08ColorSwatch token="grey200" value="var(--grey200)"/>
          <M08ColorSwatch token="grey700" value="var(--grey700)"/>
          <M08ColorSwatch token="grey900" value="var(--grey900)"/>
        </M08AssetSwatch>
        <M08AssetSwatch label="Type · tm-text-* classes used">
          <span className="tm-text-subhead">subhead</span>
          <span className="tm-text-heading">heading</span>
          <span className="tm-text-body-lg">body-lg</span>
          <span className="tm-text-body">body</span>
          <span className="tm-text-label">label</span>
          <span className="tm-text-sm">sm</span>
          <span className="tm-text-xs">xs</span>
          <span className="tm-text-2xs">2xs</span>
        </M08AssetSwatch>
        <M08AssetSwatch label="Spacing · used (4-multiple)">
          {[8, 12, 16, 20, 24, 32].map((n) => (
            <Badge key={n} tone="grey" size="sm">{`${n}px`}</Badge>
          ))}
        </M08AssetSwatch>
        <M08AssetSwatch label="Radius">
          <Badge tone="grey" size="sm">r-md (12) · card</Badge>
          <Badge tone="grey" size="sm">r-lg (16) · section</Badge>
          <Badge tone="grey" size="sm">r-pill · badge/chip</Badge>
        </M08AssetSwatch>
        <M08AssetSwatch label="Icon · lucide subset">
          <span className="tm-text-xs">share, clock, zap, check-circle, swords, star, send, search, filter, people</span>
        </M08AssetSwatch>
        <M08AssetSwatch label="Motion token · 사용">
          <Badge tone="grey" size="sm">dur-fast 120ms</Badge>
          <Badge tone="grey" size="sm">ease-out-quart</Badge>
          <Badge tone="grey" size="sm">scale(.98) card tap</Badge>
          <Badge tone="grey" size="sm">bar width 300ms</Badge>
          <Badge tone="grey" size="sm">reduced-motion: 0.01ms</Badge>
        </M08AssetSwatch>
        <M08AssetSwatch label="Touch target">
          {['44×44 · PositionPicker chip', '44×44 · 지원 버튼', '44×44 · share icon'].map((t) => <Badge key={t} tone="grey" size="sm">{t}</Badge>)}
        </M08AssetSwatch>
      </div>
    </div>
  );
};

/* ───────────────────── m08-mb-motion ───────────────────── */
const M08MotionBoard = () => (
  <div style={{ width: M08_TB_W, height: M08_MB_H, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)' }}>
    <Badge tone="blue" size="sm">m08-tb-motion</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M08 용병 · motion contract</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>용병 화면이 사용하는 motion 토큰 — 840×812 tablet 캔버스</div>
    <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
      <ListItem title="Card tap" sub="M08MercenaryCard → scale(.98) · 120ms · ease-out-quart" trailing="tap"/>
      <ListItem title="Position chip toggle" sub="M08PositionPicker chip → background-color · 120ms · ease-out-quart + aria-pressed update" trailing="chip"/>
      <ListItem title="FilledBar fill" sub="M08FilledBar → width · 300ms · ease-out-quart (scaleX() on transform)" trailing="bar"/>
      <ListItem title="Pay reveal" sub="M08RewardBadge → fade-in-up 160ms on load" trailing="pay"/>
      <ListItem title="Host trust pulse" sub="M08TrustIndicator 노쇼 0% dot → badge-pulse 1.2s infinite (keyframes in globals.css)" trailing="trust"/>
      <ListItem title="Stagger in" sub="용병 리스트 카드 등장 → stagger 50ms + fade-in-up per card" trailing="stagger"/>
      <ListItem title="Deadline pulse" sub="마감 임박 배너 → subtle-pulse 1.2s infinite" trailing="pulse"/>
      <ListItem title="Skeleton shimmer" sub="Loading → skeleton-shimmer 1.4s linear infinite (globals.css @keyframes)" trailing="load"/>
      <ListItem title="Sheet up" sub="지원 확인 bottom sheet → translateY(20px)→0 · 280ms · ease-out-expo" trailing="sheet"/>
      <ListItem title="Toast" sub="지원 성공 → toast fade-in-up · 280ms" trailing="toast"/>
      <ListItem title="Toggle switch" sub="긴급 표시 toggle → right · 120ms · ease-out-quart" trailing="toggle"/>
      <ListItem title="Reduced motion" sub="prefers-reduced-motion: reduce → 모든 duration 0.01ms" trailing="a11y"/>
    </div>
  </div>
);

/* Export all boards — preserve every name */
Object.assign(window, {
  /* main viewports */
  M08MobileMain,
  M08TabletMain,
  M08DesktopMain,
  /* detail + create */
  M08MobileDetail,
  M08MobileCreate,
  /* states */
  M08MobileStateLoading,
  M08MobileStateEmpty,
  M08MobileStateDeadline,
  M08MobileStateSoldOut,
  M08MobileStatePending,
  /* components + assets + motion */
  M08ComponentsBoard,
  M08AssetsBoard,
  M08MotionBoard,
  /* M08 atoms (re-exported for cross-module use) */
  M08MercenaryCard,
  M08RewardBadge,
  M08SportBadge,
  M08UrgentBadge,
  M08PositionPicker,
  M08TrustIndicator,
  M08FilledBar,
  M08ApplicantRow,
});
