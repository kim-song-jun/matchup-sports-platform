/* fix32 — M11 종목·실력·안전 풀 grid.
   ID schema: m11-{mb|tb|dt}-{main|detail|flow|state|components|assets|motion}[-{sub}]
   Canonical vocabulary: SportHub, FutsalMatch, BasketballMatch, TennisMatch,
   BadmintonMatch, IceHockeyMatch, SoccerLevelCert, HockeyLevelCert,
   TennisLevelCert, BadmintonLevelCert, BasketLevelCert, Skeleton, SectionTitle.
   Light-only. All raw hex forbidden, spacing 4-multiple only, no inline fontSize. */

const M11_MB_W = 375;
const M11_MB_H = 812;
const M11_TB_W = 768;
const M11_TB_H = 1024;
const M11_DT_W = 1280;
const M11_DT_H = 820;

/* sportCardAccent — 11종목 all values from var(--*) tokens */
const M11_SPORT_ACCENT = {
  futsal:      { color: 'var(--blue500)',   bg: 'var(--blue50)',        label: '풋살',       dot: 'var(--blue500)' },
  basketball:  { color: 'var(--orange500)', bg: 'var(--orange50)',      label: '농구',       dot: 'var(--orange500)' },
  badminton:   { color: 'var(--green500)',  bg: 'var(--green50)',       label: '배드민턴',   dot: 'var(--green500)' },
  tennis:      { color: 'var(--purple500)', bg: 'var(--purple-alpha-10)',label: '테니스',    dot: 'var(--purple500)' },
  icehockey:   { color: 'var(--teal500)',   bg: 'var(--blue-alpha-08)', label: '아이스하키', dot: 'var(--teal500)' },
  soccer:      { color: 'var(--red500)',    bg: 'var(--red50)',         label: '축구',       dot: 'var(--red500)' },
  baseball:    { color: 'var(--grey700)',   bg: 'var(--grey100)',       label: '야구',       dot: 'var(--grey700)' },
  volleyball:  { color: 'var(--orange500)', bg: 'var(--orange50)',      label: '배구',       dot: 'var(--orange500)' },
  tabletennis: { color: 'var(--blue400)',   bg: 'var(--blue50)',        label: '탁구',       dot: 'var(--blue400)' },
  golf:        { color: 'var(--green500)',  bg: 'var(--green50)',       label: '골프',       dot: 'var(--green500)' },
  squash:      { color: 'var(--purple500)', bg: 'var(--purple-alpha-10)',label: '스쿼시',   dot: 'var(--purple500)' },
};

const M11_ALL_SPORTS = Object.entries(M11_SPORT_ACCENT).map(([id, v]) => ({ id, ...v }));

/* Level badge config — all token-only colors */
const M11_LEVELS = [
  { key: 'S', label: 'S급', desc: '준선수 수준', color: 'var(--red500)',    bg: 'var(--red50)' },
  { key: 'A', label: 'A급', desc: '상급자',    color: 'var(--purple500)', bg: 'var(--purple-alpha-10)' },
  { key: 'B', label: 'B급', desc: '중급자',    color: 'var(--blue500)',   bg: 'var(--blue50)' },
  { key: 'C', label: 'C급', desc: '초중급자',  color: 'var(--green500)',  bg: 'var(--green50)' },
  { key: 'D', label: 'D급', desc: '입문자',    color: 'var(--grey600)',   bg: 'var(--grey100)' },
];

/* Safety checklist fixture */
const M11_SAFETY_ITEMS = [
  { id: 's1', label: '준비운동 5분 이상', checked: true },
  { id: 's2', label: '보호대 착용 여부 확인', checked: true },
  { id: 's3', label: '음수 챙기기 (300ml 이상)', checked: false },
  { id: 's4', label: '사전 부상 여부 공유', checked: false },
  { id: 's5', label: '매치 후 스트레칭', checked: false },
];

/* ─────────────────────────────────────────
   M11 Primitives (M11-prefixed to avoid scope collision)
   ───────────────────────────────────────── */

/* M11SportPill — accent pill with sport color + icon char */
const M11SportPill = ({ sportId, active }) => {
  const s = M11_SPORT_ACCENT[sportId] || M11_SPORT_ACCENT.soccer;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: '16px 12px',
        borderRadius: 16,
        background: active ? s.bg : 'var(--bg)',
        border: '1px solid ' + (active ? s.color : 'var(--border)'),
        minWidth: 72,
        cursor: 'pointer',
        transition: 'background-color 120ms, border-color 120ms',
        minHeight: 44,
      }}
      role="button"
      tabIndex={0}
      aria-label={s.label + ' 종목 선택'}
    >
      {/* Accent dot acts as visual sport identifier */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          background: active ? s.color : s.bg,
          border: '1px solid ' + (active ? 'transparent' : s.color + '40'),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Inner dot mark */}
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: active ? 'var(--static-white)' : s.color,
            opacity: active ? 0.9 : 1,
          }}
        />
      </div>
      <span
        className="tm-text-micro"
        style={{ color: active ? s.color : 'var(--text)', fontWeight: 700 }}
      >
        {s.label}
      </span>
    </div>
  );
};

/* M11LevelChip — level grade pill */
const M11LevelChip = ({ levelKey, size = 'md' }) => {
  const lv = M11_LEVELS.find(l => l.key === levelKey) || M11_LEVELS[2];
  return (
    <span
      className={size === 'sm' ? 'tm-badge tm-badge-sm' : 'tm-badge'}
      style={{ background: lv.bg, color: lv.color, fontWeight: 700 }}
    >
      {lv.label}
    </span>
  );
};

/* M11VerifyBadge — inline certification status chip */
const M11VerifyBadge = ({ status }) => {
  const map = {
    verified: { label: '인증 완료', color: 'var(--green500)', bg: 'var(--green50)' },
    pending:  { label: '검토 중',   color: 'var(--orange500)', bg: 'var(--orange50)' },
    rejected: { label: '인증 거부', color: 'var(--red500)',    bg: 'var(--red50)' },
    none:     { label: '미인증',    color: 'var(--grey500)',   bg: 'var(--grey100)' },
  };
  const s = map[status] || map.none;
  return (
    <span className="tm-badge tm-badge-sm" style={{ background: s.bg, color: s.color, fontWeight: 700 }}>
      {s.label}
    </span>
  );
};

/* M11SafetyItem — single safety checklist row */
const M11SafetyItem = ({ item }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 0',
      borderBottom: '1px solid var(--grey100)',
      minHeight: 44,
      cursor: 'pointer',
    }}
    role="checkbox"
    aria-checked={item.checked}
    aria-label={item.label}
  >
    <div
      style={{
        width: 24,
        height: 24,
        borderRadius: 6,
        background: item.checked ? 'var(--blue500)' : 'var(--grey100)',
        border: '1.5px solid ' + (item.checked ? 'var(--blue500)' : 'var(--grey300)'),
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
        transition: 'background-color 120ms',
      }}
    >
      {item.checked && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12l5 5L20 7"/>
        </svg>
      )}
    </div>
    <span className="tm-text-label" style={{ color: item.checked ? 'var(--text)' : 'var(--text-strong)' }}>
      {item.label}
    </span>
  </div>
);

/* M11VerificationRow — sport + cert status row for side panels */
const M11VerificationRow = ({ sportId, status, levelKey }) => {
  const s = M11_SPORT_ACCENT[sportId] || M11_SPORT_ACCENT.futsal;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 12,
        background: 'var(--grey50)',
        border: '1px solid var(--grey100)',
      }}
    >
      {/* Sport accent dot */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: s.bg,
          border: '1px solid ' + s.color + '40',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: s.color }}/>
      </div>
      <div style={{ flex: 1 }}>
        <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{s.label}</div>
        <div style={{ marginTop: 4 }}>
          <M11VerifyBadge status={status}/>
        </div>
      </div>
      {levelKey && status === 'verified' && <M11LevelChip levelKey={levelKey} size="sm"/>}
    </div>
  );
};

/* M11ComponentSwatch — inventory swatch wrapper */
const M11ComponentSwatch = ({ label, children }) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: 12,
      borderRadius: 12,
      background: 'var(--grey50)',
      border: '1px solid var(--grey100)',
    }}
  >
    <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {children}
    </div>
  </div>
);

/* M11AssetSwatch — token row wrapper */
const M11AssetSwatch = ({ label, children }) => (
  <div>
    <div className="tm-text-micro" style={{ color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {children}
    </div>
  </div>
);

/* M11ColorSwatch — single color token chip */
const M11ColorSwatch = ({ token, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        background: value,
        border: '1px solid var(--grey200)',
      }}
    />
    <div className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>{token}</div>
  </div>
);

/* ─────────────────────────────────────────────
   m11-mb-list-hub  →  SportHub canonical 직접 재사용
   ───────────────────────────────────────────── */
const M11MobileMain = () => <SportHub/>;

/* ─────────────────────────────────────────────
   m11-tb-main  →  태블릿 2-col layout
   ───────────────────────────────────────────── */
const M11TabletMain = () => (
  <div
    style={{
      width: M11_TB_W,
      height: M11_TB_H,
      background: 'var(--bg)',
      fontFamily: 'var(--font)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}
  >
    {/* Header */}
    <div
      style={{
        padding: '20px 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--grey100)',
      }}
    >
      <div>
        <div className="tm-text-heading">종목·실력·안전</div>
        <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>
          11개 종목 · 실력 인증 · 안전 가이드
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="tm-btn tm-btn-outline tm-btn-md" style={{ minHeight: 44 }}>
          <Icon name="shield" size={15} aria-hidden="true"/>
          안전 신고
        </button>
        <button className="tm-btn tm-btn-primary tm-btn-md" style={{ minHeight: 44 }}>
          실력 인증하기
        </button>
      </div>
    </div>

    <div style={{ padding: '20px 32px', display: 'flex', gap: 16, flex: 1, overflow: 'hidden' }}>
      {/* Left: 인증 현황 */}
      <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="tm-text-label">내 인증 현황</div>
        {[
          { id: 'futsal',     status: 'verified', lv: 'B' },
          { id: 'basketball', status: 'pending',  lv: undefined },
          { id: 'badminton',  status: 'none',     lv: undefined },
        ].map(v => (
          <M11VerificationRow key={v.id} sportId={v.id} status={v.status} levelKey={v.lv}/>
        ))}
        <button className="tm-btn tm-btn-secondary tm-btn-md tm-btn-block" style={{ marginTop: 4, minHeight: 44 }}>
          + 종목 추가 인증
        </button>
      </div>

      {/* Right: 전체 종목 grid */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div className="tm-text-label" style={{ marginBottom: 12 }}>전체 종목 (11개)</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 12,
            overflowY: 'auto',
            maxHeight: '100%',
          }}
        >
          {M11_ALL_SPORTS.map((s, i) => (
            <M11SportPill key={s.id} sportId={s.id} active={i === 0}/>
          ))}
          {/* Safety guide card */}
          <Card
            pad={16}
            style={{
              gridColumn: 'span 2',
              background: 'var(--grey50)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'var(--blue50)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Icon name="shield" size={20} color="var(--blue500)" aria-hidden="true"/>
              </div>
              <span className="tm-text-label">부상 예방 가이드</span>
            </div>
            <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
              운동 전 준비운동, 보호대 착용, 올바른 자세로 안전하게 즐기세요.
            </div>
            <button
              className="tm-btn tm-btn-ghost tm-btn-sm"
              style={{ marginTop: 8, paddingLeft: 0, color: 'var(--blue500)', minHeight: 44 }}
            >
              자세히 보기
            </button>
          </Card>
        </div>
      </div>
    </div>
  </div>
);

/* ─────────────────────────────────────────────
   m11-dt-main  →  데스크탑 3-col layout
   ───────────────────────────────────────────── */
const M11DesktopMain = () => (
  <div
    style={{
      width: M11_DT_W,
      height: M11_DT_H,
      background: 'var(--bg)',
      fontFamily: 'var(--font)',
      display: 'grid',
      gridTemplateColumns: '240px 1fr 300px',
      overflow: 'hidden',
    }}
  >
    {/* Left sidebar */}
    <aside style={{ borderRight: '1px solid var(--grey100)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'var(--blue500)',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--static-white)',
            fontWeight: 800,
          }}
          aria-hidden="true"
        >
          T
        </div>
        <div className="tm-text-body-lg">Teameet</div>
      </div>

      <nav style={{ display: 'grid', gap: 4 }}>
        {[
          ['홈', false],
          ['종목 허브', true],
          ['실력 인증', false],
          ['안전 가이드', false],
          ['부상 신고', false],
        ].map(([l, a]) => (
          <button
            key={l}
            className={'tm-btn tm-btn-md ' + (a ? 'tm-btn-secondary' : 'tm-btn-ghost')}
            style={{ justifyContent: 'flex-start', minHeight: 44 }}
          >
            {l}
          </button>
        ))}
      </nav>

      <div style={{ marginTop: 'auto' }}>
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginBottom: 8 }}>내 인증 등급</div>
        {[
          { id: 'futsal',     status: 'verified', lv: 'B' },
          { id: 'basketball', status: 'pending',  lv: undefined },
        ].map(v => (
          <div key={v.id} style={{ marginBottom: 8 }}>
            <M11VerificationRow sportId={v.id} status={v.status} levelKey={v.lv}/>
          </div>
        ))}
      </div>
    </aside>

    {/* Main content */}
    <main style={{ padding: 32, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <div className="tm-text-title">11개 종목 허브</div>
          <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
            종목별 가이드 · 실력 단계 · 안전 수칙
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="tm-btn tm-btn-outline tm-btn-md" style={{ minHeight: 44 }}>
            <Icon name="shield" size={15} aria-hidden="true"/>
            부상 신고
          </button>
          <button className="tm-btn tm-btn-primary tm-btn-md" style={{ minHeight: 44 }}>
            실력 인증하기
          </button>
        </div>
      </div>

      {/* 11종목 6-col grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {M11_ALL_SPORTS.map((s, i) => (
          <M11SportPill key={s.id} sportId={s.id} active={i === 0}/>
        ))}
      </div>

      {/* 종목 상세 preview — futsal */}
      <Card pad={20}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: M11_SPORT_ACCENT.futsal.bg,
              border: '1px solid ' + M11_SPORT_ACCENT.futsal.color + '40',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: M11_SPORT_ACCENT.futsal.color,
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div className="tm-text-subhead">풋살</div>
              <M11LevelChip levelKey="B"/>
            </div>
            <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
              5인제 실내/야외 축구. 빠른 전환과 개인기술이 중요합니다.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {M11_LEVELS.map(lv => (
                <M11LevelChip key={lv.key} levelKey={lv.key} size="sm"/>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </main>

    {/* Right panel */}
    <aside style={{ borderLeft: '1px solid var(--grey100)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="tm-text-label">안전 체크리스트</div>
      <Card pad={16}>
        {M11_SAFETY_ITEMS.map(item => (
          <M11SafetyItem key={item.id} item={item}/>
        ))}
        {/* Progress bar */}
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>2/5 완료</span>
          <div
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: 'var(--grey100)',
              margin: '0 12px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: '40%',
                height: '100%',
                background: 'var(--blue500)',
                borderRadius: 2,
                transform: 'scaleX(1)',
                transformOrigin: 'left',
              }}
            />
          </div>
          <span className="tm-text-micro" style={{ color: 'var(--blue500)' }}>40%</span>
        </div>
      </Card>

      <div className="tm-text-label">최근 부상 신고</div>
      <Card pad={16}>
        <EmptyState
          title="신고 내역 없음"
          sub="부상 신고가 없어요"
        />
      </Card>
    </aside>
  </div>
);

/* ─────────────────────────────────────────────
   m11-mb-main (sport playbook variants)
   Canonical: FutsalMatch, BasketballMatch, TennisMatch, BadmintonMatch, IceHockeyMatch
   M11MobileDetail is the per-sport playbook — reuses FutsalMatch canonical directly
   ───────────────────────────────────────────── */
const M11MobileDetail = () => <FutsalMatch/>;

/* ─────────────────────────────────────────────
   m11-mb-flow-verify  →  안전/인증 플로우
   Canonical: SoccerLevelCert (선출 인증 form)
   ───────────────────────────────────────────── */
const M11MobileFlowVerify = () => <SoccerLevelCert/>;

/* ─────────────────────────────────────────────
   m11-mb-state-loading  →  SportHub wireframe + Skeleton
   ───────────────────────────────────────────── */
const M11MobileStateLoading = () => (
  <Phone>
    <TopNav title="종목 허브"/>
    <div
      style={{
        flex: 1,
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        overflow: 'hidden',
      }}
    >
      {/* 인증 상태 행 skeleton */}
      <Skeleton h={64} r={12}/>
      {/* 안전 배너 skeleton */}
      <Skeleton h={44} r={12}/>
      {/* 섹션 제목 skeleton */}
      <Skeleton h={20} r={6} w="40%"/>
      {/* 종목 grid — 11칸 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {Array.from({ length: 11 }).map((_, i) => (
          <Skeleton key={i} h={88} r={16}/>
        ))}
      </div>
      {/* List rows skeleton */}
      {[1, 2, 3].map(n => (
        <Skeleton key={n} h={72} r={12}/>
      ))}
    </div>
    <BottomNav active="home"/>
  </Phone>
);

/* ─────────────────────────────────────────────
   m11-mb-state-empty  →  종목 없음 (서비스 준비 중 edge case)
   ───────────────────────────────────────────── */
const M11MobileStateEmpty = () => (
  <Phone>
    <TopNav title="종목 허브"/>
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '0 20px',
      }}
    >
      {/* Sport grid area with empty indicator */}
      <SectionTitle title="11개 종목" sub="종목을 선택해 가이드와 매치를 확인하세요"/>

      {/* 11 placeholder pills — visually present but labeled as empty */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 10,
          marginBottom: 24,
        }}
      >
        {Array.from({ length: 11 }).map((_, i) => (
          <div
            key={i}
            style={{
              height: 88,
              borderRadius: 16,
              background: 'var(--grey50)',
              border: '1px dashed var(--grey200)',
            }}
          />
        ))}
      </div>

      <EmptyState
        title="종목 정보를 불러올 수 없어요"
        sub="서비스 준비 중이거나 네트워크 상태를 확인해주세요."
        cta="다시 시도"
      />
    </div>
    <BottomNav active="home"/>
  </Phone>
);

/* ─────────────────────────────────────────────
   m11-mb-state-error  →  인증 거부 (HockeyLevelCert rejection variant)
   Canonical: HockeyLevelCert (아이스 등급 form)
   ───────────────────────────────────────────── */
const M11MobileStateError = () => (
  <Phone>
    <TopNav title="실력 인증"/>
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {/* Rejection banner on top of HockeyLevelCert wireframe */}
      <div
        style={{
          padding: '12px 20px',
          background: 'var(--red50)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
        role="alert"
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'var(--red500)',
            color: 'var(--static-white)',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </div>
        <div>
          <div className="tm-text-label" style={{ color: 'var(--red500)' }}>인증이 거부되었어요</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>아래 사유를 확인하고 다시 도전하세요.</div>
        </div>
      </div>

      {/* Rejection reasons */}
      <div style={{ padding: '16px 20px 0' }}>
        <Card pad={16}>
          <div className="tm-text-label" style={{ color: 'var(--red500)', marginBottom: 8 }}>거부 사유</div>
          {[
            '영상 화질이 낮아 동작 판별이 어렵습니다',
            '아이스하키 경력 2년 이상 서류 첨부가 필요합니다',
          ].map((r, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 8,
                padding: '8px 0',
                borderBottom: i === 0 ? '1px solid var(--grey100)' : 'none',
              }}
            >
              <span style={{ color: 'var(--red500)', flexShrink: 0 }}>·</span>
              <span className="tm-text-body" style={{ color: 'var(--text)' }}>{r}</span>
            </div>
          ))}
        </Card>
      </div>

      {/* HockeyLevelCert form embedded (canonical reuse) */}
      <div style={{ padding: '8px 0 0', pointerEvents: 'none', opacity: 0.72 }}>
        <HockeyLevelCert/>
      </div>
    </div>

    <div style={{ padding: '12px 20px 24px', borderTop: '1px solid var(--border)' }}>
      <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" style={{ minHeight: 44 }}>
        다시 제출하기
      </button>
    </div>
  </Phone>
);

/* ─────────────────────────────────────────────
   m11-mb-state-permission  →  카메라 권한 요청
   ───────────────────────────────────────────── */
const M11MobileStatePermission = () => (
  <Phone>
    <TopNav title="실력 인증"/>
    {/* SportHub wireframe as background context */}
    <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
      {/* Dimmed wireframe background */}
      <div style={{ opacity: 0.24, pointerEvents: 'none' }}>
        <SectionTitle title="11개 종목" sub="종목을 선택해 확인하세요"/>
        <div style={{ padding: '0 20px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {M11_ALL_SPORTS.slice(0, 8).map(s => (
            <M11SportPill key={s.id} sportId={s.id}/>
          ))}
        </div>
      </div>

      {/* Permission sheet overlay */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          background: 'var(--bg)',
          borderRadius: '20px 20px 0 0',
          padding: '24px 20px 40px',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.10)',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="카메라 권한 요청"
      >
        {/* Handle */}
        <div
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: 'var(--grey200)',
            margin: '0 auto 20px',
          }}
          aria-hidden="true"
        />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'var(--orange50)',
              display: 'grid',
              placeItems: 'center',
            }}
            aria-hidden="true"
          >
            <Icon name="camera" size={28} color="var(--orange500)"/>
          </div>
          <div className="tm-text-subhead">카메라 권한이 필요해요</div>
          <div className="tm-text-body" style={{ color: 'var(--text-muted)', maxWidth: 280 }}>
            실력 인증 영상을 촬영하려면 카메라 접근 권한을 허용해주세요.
          </div>
          <Card pad={16} style={{ width: '100%', textAlign: 'left', background: 'var(--grey50)' }}>
            <div className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
              수집 목적: 실력 인증 영상 제출 한정 · 서버에 임시 저장 후 검토 완료 시 삭제
            </div>
          </Card>
        </div>

        <div style={{ display: 'grid', gap: 8, marginTop: 24 }}>
          <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" style={{ minHeight: 44 }}>
            설정에서 허용하기
          </button>
          <button className="tm-btn tm-btn-ghost tm-btn-md tm-btn-block" style={{ minHeight: 44 }}>
            파일로 직접 업로드
          </button>
        </div>
      </div>
    </div>
  </Phone>
);

/* ─────────────────────────────────────────────
   m11-mb-state-pending  →  인증 검토 중
   ───────────────────────────────────────────── */
const M11MobileStatePending = () => (
  <Phone>
    <TopNav title="실력 인증"/>
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {/* Pending banner */}
      <div
        style={{
          padding: '12px 20px',
          background: 'var(--orange50)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
        role="status"
        aria-live="polite"
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'var(--orange50)',
            border: '1.5px solid var(--orange500)',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          <Icon name="clock" size={18} color="var(--orange500)"/>
        </div>
        <div>
          <div className="tm-text-label" style={{ color: 'var(--orange500)' }}>검토 중이에요</div>
          <div className="tm-text-caption" style={{ marginTop: 2 }}>보통 1~2일 이내 결과를 안내해드려요.</div>
        </div>
        <Badge tone="orange" size="sm">검토 중</Badge>
      </div>

      {/* Submission details */}
      <div style={{ padding: '20px 20px 0' }}>
        <Card pad={16}>
          <div className="tm-text-label" style={{ marginBottom: 12 }}>제출 정보</div>
          {[
            ['종목', '풋살'],
            ['목표 등급', 'B급'],
            ['제출일', '2026.04.26'],
            ['예상 결과', '1~2일 이내'],
          ].map(([k, v]) => (
            <div
              key={k}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: '1px solid var(--grey100)',
              }}
            >
              <span className="tm-text-caption">{k}</span>
              <span className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{v}</span>
            </div>
          ))}
        </Card>
      </div>

      {/* Sport accent — futsal with pending */}
      <div style={{ padding: '16px 20px 0' }}>
        <M11VerificationRow sportId="futsal" status="pending"/>
      </div>

      <div style={{ padding: '16px 20px 32px', display: 'grid', gap: 8 }}>
        <button className="tm-btn tm-btn-outline tm-btn-md tm-btn-block" style={{ minHeight: 44 }}>
          제출 취소
        </button>
        <button className="tm-btn tm-btn-ghost tm-btn-md tm-btn-block" style={{ minHeight: 44, color: 'var(--text-muted)' }}>
          다른 종목 인증하기
        </button>
      </div>
    </div>
  </Phone>
);

/* ─────────────────────────────────────────────
   M11ComponentsBoard — component inventory
   ───────────────────────────────────────────── */
const M11ComponentsBoard = ({ viewport = 'mb' }) => {
  const w = viewport === 'mb' ? M11_MB_W : viewport === 'tb' ? M11_TB_W : M11_DT_W;
  const h = viewport === 'mb' ? M11_MB_H : viewport === 'tb' ? M11_TB_H : M11_DT_H;
  return (
    <div
      style={{
        width: w,
        height: h,
        background: 'var(--bg)',
        padding: 24,
        fontFamily: 'var(--font)',
        overflow: 'hidden',
      }}
    >
      <Badge tone="blue" size="sm">{`m11-${viewport}-components`}</Badge>
      <div className="tm-text-title" style={{ marginTop: 8 }}>
        M11 {viewport === 'mb' ? '모바일' : viewport === 'tb' ? '태블릿' : '데스크탑'} · 사용 컴포넌트
      </div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>
        종목·실력·안전 화면이 사용하는 components/ui primitives
      </div>

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        {/* SportPill — 4 sport accents (active/default) */}
        <M11ComponentSwatch label="M11SportPill · 11종목 각 accent (active / default)">
          {['futsal', 'basketball', 'badminton', 'icehockey'].map((id, i) => (
            <M11SportPill key={id} sportId={id} active={i === 0}/>
          ))}
          {['soccer', 'tennis', 'baseball', 'volleyball'].map(id => (
            <M11SportPill key={id} sportId={id}/>
          ))}
        </M11ComponentSwatch>

        {/* LevelChip — S/A/B/C/D both sizes */}
        <M11ComponentSwatch label="M11LevelChip · S/A/B/C/D — md / sm">
          {M11_LEVELS.map(lv => <M11LevelChip key={lv.key} levelKey={lv.key}/>)}
          {M11_LEVELS.map(lv => <M11LevelChip key={lv.key + 'sm'} levelKey={lv.key} size="sm"/>)}
        </M11ComponentSwatch>

        {/* VerifyBadge — 4 states */}
        <M11ComponentSwatch label="M11VerifyBadge · verified / pending / rejected / none">
          <M11VerifyBadge status="verified"/>
          <M11VerifyBadge status="pending"/>
          <M11VerifyBadge status="rejected"/>
          <M11VerifyBadge status="none"/>
        </M11ComponentSwatch>

        {/* VerificationRow — 4 sport variants */}
        <M11ComponentSwatch label="M11VerificationRow · sport + cert status">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            <M11VerificationRow sportId="futsal"     status="verified" levelKey="B"/>
            <M11VerificationRow sportId="basketball" status="pending"/>
            <M11VerificationRow sportId="tennis"     status="rejected"/>
            <M11VerificationRow sportId="badminton"  status="none"/>
          </div>
        </M11ComponentSwatch>

        {/* SafetyItem — checked/unchecked */}
        <M11ComponentSwatch label="M11SafetyItem · checked / unchecked">
          <div style={{ width: '100%' }}>
            <M11SafetyItem item={{ id: 'a', label: '준비운동 5분 이상', checked: true }}/>
            <M11SafetyItem item={{ id: 'b', label: '음수 챙기기 (300ml 이상)', checked: false }}/>
          </div>
        </M11ComponentSwatch>

        {/* Canonical sport screens */}
        <M11ComponentSwatch label="Canonical: FutsalMatch · time slot selector">
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
            FutsalMatch — 시간대 2x2 grid + 구성 포지션 bar
          </div>
        </M11ComponentSwatch>

        <M11ComponentSwatch label="Canonical: SoccerLevelCert · 선출 인증 form">
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
            SoccerLevelCert — 선출 여부 2x2 + 구력 range + 포지션 picker
          </div>
        </M11ComponentSwatch>

        {/* Video upload zone */}
        <M11ComponentSwatch label="Upload zone · dashed border + icon">
          <div
            style={{
              border: '2px dashed var(--grey300)',
              borderRadius: 12,
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              width: 240,
              background: 'var(--grey50)',
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'var(--blue50)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name="plus" size={16} color="var(--blue500)" aria-hidden="true"/>
            </div>
            <span className="tm-text-caption">영상 업로드</span>
          </div>
        </M11ComponentSwatch>

        {/* Button CTAs */}
        <M11ComponentSwatch label="Button · primary / danger outline / ghost">
          <button className="tm-btn tm-btn-primary tm-btn-md" style={{ minHeight: 44 }}>
            인증 제출하기
          </button>
          <button
            className="tm-btn tm-btn-outline tm-btn-md"
            style={{ minHeight: 44, color: 'var(--red500)', borderColor: 'var(--red50)' }}
          >
            부상 신고하기
          </button>
          <button className="tm-btn tm-btn-ghost tm-btn-sm" style={{ minHeight: 44, color: 'var(--blue500)' }}>
            자세히 보기
          </button>
        </M11ComponentSwatch>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   M11AssetsBoard — design token inventory
   ───────────────────────────────────────────── */
const M11AssetsBoard = ({ viewport = 'mb' }) => {
  const w = viewport === 'mb' ? M11_MB_W : viewport === 'tb' ? M11_TB_W : M11_DT_W;
  const h = viewport === 'mb' ? M11_MB_H : viewport === 'tb' ? M11_TB_H : M11_DT_H;
  return (
    <div
      style={{
        width: w,
        height: h,
        background: 'var(--bg)',
        padding: 24,
        fontFamily: 'var(--font)',
        overflow: 'hidden',
      }}
    >
      <Badge tone="blue" size="sm">{`m11-${viewport}-assets`}</Badge>
      <div className="tm-text-title" style={{ marginTop: 8 }}>
        M11 {viewport === 'mb' ? '모바일' : viewport === 'tb' ? '태블릿' : '데스크탑'} · 사용 토큰/에셋
      </div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>
        종목·실력·안전 화면이 사용하는 디자인 토큰 인벤토리
      </div>

      <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
        {/* sportCardAccent — 11종목 전체 dot color */}
        <M11AssetSwatch label="Color · sportCardAccent 11종목 accent">
          {M11_ALL_SPORTS.map(s => (
            <div key={s.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: s.color,
                  border: '1px solid var(--grey150)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--static-white)', opacity: 0.8 }}/>
              </div>
              <div className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>{s.label.slice(0, 2)}</div>
            </div>
          ))}
        </M11AssetSwatch>

        {/* sportCardAccent bg tints */}
        <M11AssetSwatch label="Color · sportCardAccent bg tints">
          {M11_ALL_SPORTS.map(s => (
            <div key={s.id + 'bg'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: s.bg,
                  border: '1px solid ' + s.color + '40',
                }}
              />
              <div className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>{s.label.slice(0, 2)}</div>
            </div>
          ))}
        </M11AssetSwatch>

        {/* Level tier colors */}
        <M11AssetSwatch label="Color · level tier S/A/B/C/D">
          {M11_LEVELS.map(lv => (
            <div key={lv.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: lv.bg,
                  border: '1px solid ' + lv.color + '40',
                  display: 'grid',
                  placeItems: 'center',
                  color: lv.color,
                  fontWeight: 800,
                }}
              >
                {lv.key}
              </div>
              <div className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>{lv.key}급</div>
            </div>
          ))}
        </M11AssetSwatch>

        {/* Semantic status colors */}
        <M11AssetSwatch label="Color · semantic (verified / pending / rejected / none)">
          <M11ColorSwatch token="green500" value="var(--green500)"/>
          <M11ColorSwatch token="orange500" value="var(--orange500)"/>
          <M11ColorSwatch token="red500" value="var(--red500)"/>
          <M11ColorSwatch token="grey500" value="var(--grey500)"/>
          <M11ColorSwatch token="blue500" value="var(--blue500)"/>
        </M11AssetSwatch>

        {/* Typography scale */}
        <M11AssetSwatch label="Type · 사용 단계">
          <span className="tm-text-subhead">subhead</span>
          <span className="tm-text-body-lg">body-lg</span>
          <span className="tm-text-body">body</span>
          <span className="tm-text-label">label</span>
          <span className="tm-text-caption">caption</span>
          <span className="tm-text-micro">micro</span>
        </M11AssetSwatch>

        {/* 4-multiple spacing */}
        <M11AssetSwatch label="Spacing · used (4-multiple only)">
          {[8, 12, 16, 20, 24, 32, 40, 48].map(n => (
            <Badge key={n} tone="grey" size="sm">{`${n}px`}</Badge>
          ))}
        </M11AssetSwatch>

        {/* Border radius */}
        <M11AssetSwatch label="Border radius · card 16 / input 12 / badge pill / dot 50%">
          <Badge tone="grey" size="sm">r-sm 8 · btn-sm</Badge>
          <Badge tone="grey" size="sm">r-md 12 · card/input</Badge>
          <Badge tone="grey" size="sm">r-lg 16 · sport card</Badge>
          <Badge tone="grey" size="sm">r-pill · badge/chip</Badge>
          <Badge tone="grey" size="sm">50% · avatar/dot</Badge>
        </M11AssetSwatch>

        {/* Control heights */}
        <M11AssetSwatch label="Control height (min 44px touch)">
          {['sm 40', 'md 48 (min 44)', 'lg 56', 'icon 44'].map(t => (
            <Badge key={t} tone="grey" size="sm">{t}</Badge>
          ))}
        </M11AssetSwatch>

        {/* Icons used */}
        <M11AssetSwatch label="Icon · m11 전용">
          <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
            shield, check, plus, share, chevR, chevL, clock, camera, bell
          </span>
        </M11AssetSwatch>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   M11MotionBoard — motion contract (840×812 tb)
   ───────────────────────────────────────────── */
const M11MotionBoard = () => (
  <div
    style={{
      width: M11_TB_W,
      height: M11_MB_H,
      background: 'var(--bg)',
      padding: 24,
      fontFamily: 'var(--font)',
    }}
  >
    <Badge tone="blue" size="sm">m11-tb-motion</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M11 모바일 · motion contract</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>
      종목·실력·안전 화면에서 사용하는 motion 토큰 및 micro-interaction 계약
    </div>

    <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
      <ListItem
        title="SportPill tap"
        sub="종목 카드 탭 → scale(0.97) 120ms ease-out-quart + bg/border transition-colors 120ms"
        trailing="tap"
      />
      <ListItem
        title="Sport switch transition"
        sub="허브 → 종목 상세 → FutsalMatch/TennisMatch 전환 → slide-up 180ms ease-out-quint"
        trailing="switch"
      />
      <ListItem
        title="Level chip reveal"
        sub="실력 등급 뱃지 등장 → fade-in-up 180ms, stagger delay 0.04s × index"
        trailing="reveal"
      />
      <ListItem
        title="Safety check"
        sub="체크박스 fill → background-color 120ms + stroke-dasharray draw 200ms"
        trailing="check"
      />
      <ListItem
        title="Step progress bar"
        sub="인증 스텝 1→2 → scaleX(0→1) 280ms ease-out-quint, transform-origin: left"
        trailing="step"
      />
      <ListItem
        title="Verify confirm"
        sub="제출 버튼 → scale(0.98)→(1) 120ms + green50 flash 320ms → 완료 상태 확정"
        trailing="confirm"
      />
      <ListItem
        title="Pending pulse"
        sub="검토 중 clock icon → opacity 0.6↔1 1.2s ease-in-out infinite"
        trailing="pulse"
      />
      <ListItem
        title="Rejection shake"
        sub="인증 거부 배너 등장 → translateX ±4px 200ms × 2 ease-in-out"
        trailing="shake"
      />
      <ListItem
        title="Sport grid stagger"
        sub="종목 grid 11칸 → fade-in-up, delay: 0.04s × i (i=0..10)"
        trailing="stagger"
      />
      <ListItem
        title="prefers-reduced-motion"
        sub="@media (prefers-reduced-motion: reduce) → 모든 transition: 0.01ms"
        trailing="a11y"
      />
    </div>
  </div>
);

Object.assign(window, {
  /* fix32 obligation grid — 13 boards */
  M11MobileMain,
  M11TabletMain,
  M11DesktopMain,
  M11MobileDetail,
  M11MobileFlowVerify,
  M11MobileStateLoading,
  M11MobileStateEmpty,
  M11MobileStateError,
  M11MobileStatePermission,
  M11MobileStatePending,
  M11ComponentsBoard,
  M11AssetsBoard,
  M11MotionBoard,
  /* M11 primitives (M11-prefixed) for canvas reuse */
  M11SportPill,
  M11LevelChip,
  M11VerifyBadge,
  M11SafetyItem,
  M11VerificationRow,
  M11_SPORT_ACCENT,
  M11_ALL_SPORTS,
  M11_LEVELS,
  M11_SAFETY_ITEMS,
});
