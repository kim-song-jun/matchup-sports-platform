/* fix32 — M02 홈·추천 grid boards.
   ID schema: m02-{mb|tb|dt}-{main|state|components|assets|motion}[-{sub}]
   Canonical vocabulary: HomeToss, ActivityToss, Skeleton, NumberDisplay,
   MoneyRow, KPIStat, SectionTitle, StackedAvatars, WeatherStrip.
   Light-only. All raw hex forbidden, spacing 4-multiple only. */

const M02_MB_W = 375;
const M02_MB_H = 812;
const M02_TB_W = 768;
const M02_TB_H = 1024;
const M02_DT_W = 1280;
const M02_DT_H = 820;

/* Sport chips with token-only colors */
const M02_SPORT_CHIPS = [
  { id: 'futsal',     label: '풋살',   color: 'var(--blue500)',   bg: 'var(--blue50)' },
  { id: 'basketball', label: '농구',   color: 'var(--orange500)', bg: 'var(--orange50)' },
  { id: 'badminton',  label: '배드민턴', color: 'var(--green500)',  bg: 'var(--green50)' },
  { id: 'tennis',     label: '테니스', color: 'var(--purple500)', bg: 'var(--blue50)' },
  { id: 'icehockey',  label: '하키',   color: 'var(--teal500)',   bg: 'var(--green50)' },
  { id: 'soccer',     label: '축구',   color: 'var(--red500)',    bg: 'var(--red50)' },
];

/* ─────────────────────────────────────────────
   m02-mb-main  →  HomeToss canonical (직접 재사용)
   ───────────────────────────────────────────── */
const M02MobileMain = () => <HomeToss/>;

/* ─────────────────────────────────────────────
   m02-tb-main  →  태블릿 2-col layout + ActivityToss KPI side panel
   ───────────────────────────────────────────── */
const M02TabletMain = () => (
  <div style={{
    width: M02_TB_W, height: M02_TB_H,
    background: 'var(--bg)', fontFamily: 'var(--font)',
    display: 'grid', gridTemplateColumns: '1fr 280px',
    overflow: 'hidden',
  }}>
    {/* Left — HomeToss layout scaled to tb */}
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid var(--border)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px 12px' }}>
        <div style={{ fontSize: 'var(--fs-subhead)', fontWeight: 800, color: 'var(--text-strong)' }}>teameet</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="tm-pressable tm-break-keep" style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--grey100)', border: 'none', display: 'grid', placeItems: 'center', color: 'var(--text-strong)' }} aria-label="검색">
            <Icon name="search" size={20}/>
          </button>
          <button className="tm-pressable tm-break-keep" style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--grey100)', border: 'none', display: 'grid', placeItems: 'center', color: 'var(--text-strong)', position: 'relative' }} aria-label="알림">
            <Icon name="bell" size={20}/>
            <span style={{ position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: '50%', background: 'var(--red500)', border: '2px solid var(--bg)' }}/>
          </button>
        </div>
      </div>

      {/* KPI hero strip */}
      <div style={{ padding: '8px 24px 20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, borderBottom: '1px solid var(--border)' }}>
        <KPIStat label="이번 달 활동" value={12} unit="경기" delta={3} deltaLabel="회"/>
        <KPIStat label="매너 점수" value="4.9" unit=""/>
        <KPIStat label="AI 추천" value={5} unit="개"/>
      </div>

      {/* Sport chips */}
      <div style={{ padding: '16px 24px 8px', display: 'flex', gap: 8, overflowX: 'auto' }}>
        {M02_SPORT_CHIPS.map((c, i) => (
          <Chip key={c.id} active={i === 0}>{c.label}</Chip>
        ))}
      </div>

      {/* Weather */}
      <div style={{ padding: '8px 24px 16px' }}>
        <WeatherStrip city="서울" temp={22} cond="맑음" wind={2}/>
      </div>

      {/* Recommended 2-col grid */}
      <SectionTitle title="추천 매치" sub="실력에 맞는 경기 6개" action="전체보기"/>
      <div style={{ flex: 1, padding: '0 24px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, overflowY: 'auto' }}>
        {(MATCHES || []).slice(0, 6).map((m, idx) => (
          <div key={m?.id ?? idx} className="tm-card tm-card-interactive" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Badge tone="blue" size="sm">{(SPORTS || []).find(s => s.id === m?.sport)?.label ?? '풋살'}</Badge>
              <span className="tm-text-micro tab-num" style={{ color: 'var(--text-muted)' }}>2.1km</span>
            </div>
            <div className="tm-text-body-lg" style={{ marginTop: 8, lineHeight: 1.35 }}>{m?.title ?? '추천 매치'}</div>
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="tm-text-caption tab-num">{m?.cur ?? 8}/{m?.max ?? 12}명</span>
              <span className="tm-text-label tab-num" style={{ color: 'var(--blue500)' }}>{(m?.fee ?? 15000).toLocaleString()}원</span>
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Right — Activity side panel */}
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'auto', padding: 20, gap: 16, background: 'var(--grey50)' }}>
      <div className="tm-text-body-lg">내 활동 요약</div>
      <div style={{ background: 'var(--bg)', borderRadius: 16, padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <KPIStat label="이번 달" value={12} unit="경기" delta={3} deltaLabel="회"/>
        <KPIStat label="누적" value={86} unit="경기"/>
        <KPIStat label="MVP" value={2} unit="회" delta={1} deltaLabel="회"/>
        <KPIStat label="매너" value="4.9" unit=""/>
      </div>
      <div className="tm-text-body-lg">날씨</div>
      <WeatherStrip city="서울" temp={22} cond="맑음" wind={3}/>
      <div className="tm-text-body-lg">결제 현황</div>
      <div style={{ background: 'var(--bg)', borderRadius: 12, padding: 16 }}>
        <MoneyRow label="이번 달 결제" amount={144000}/>
        <MoneyRow label="정산 예정" amount={86000} accent/>
      </div>
    </div>
  </div>
);

/* ─────────────────────────────────────────────
   m02-dt-main  →  데스크탑 3-col (sidebar + feed + activity)
   ───────────────────────────────────────────── */
const M02DesktopMain = () => (
  <div style={{
    width: M02_DT_W, height: M02_DT_H,
    background: 'var(--bg)', fontFamily: 'var(--font)',
    display: 'grid', gridTemplateColumns: '220px 1fr 300px',
    overflow: 'hidden',
  }}>
    {/* Sidebar nav */}
    <aside style={{ borderRight: '1px solid var(--border)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 'var(--fs-subhead)', fontWeight: 800, color: 'var(--text-strong)' }}>teameet</div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[
          { label: '홈', active: true },
          { label: '매치 찾기', active: false },
          { label: '팀 매칭', active: false },
          { label: '레슨', active: false },
          { label: '장터', active: false },
          { label: '마이', active: false },
        ].map((item) => (
          <button key={item.label} className={`tm-btn tm-btn-${item.active ? 'secondary' : 'ghost'} tm-btn-md`} style={{ justifyContent: 'flex-start', width: '100%' }}>
            {item.label}
          </button>
        ))}
      </nav>
      <div style={{ marginTop: 'auto' }}>
        <WeatherStrip city="강남" temp={22} cond="맑음" wind={2}/>
      </div>
    </aside>

    {/* Main feed */}
    <main style={{ overflow: 'auto', padding: 24 }}>
      {/* KPI hero */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24, padding: 20, background: 'var(--grey50)', borderRadius: 16 }}>
        <KPIStat label="이번 달 활동" value={12} unit="경기" delta={3} deltaLabel="회"/>
        <KPIStat label="매너 점수" value="4.9" unit=""/>
        <KPIStat label="AI 추천 매치" value={5} unit="개"/>
      </div>

      {/* Sport filter chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto' }}>
        {M02_SPORT_CHIPS.map((c, i) => (
          <Chip key={c.id} active={i === 0}>{c.label}</Chip>
        ))}
        <button className="tm-btn tm-btn-outline tm-btn-sm" style={{ flexShrink: 0 }}>
          <Icon name="filter" size={14}/>필터
        </button>
      </div>

      <SectionTitle title="오늘의 추천 매치" sub="강남구 5km · AI 매칭 12개" action="전체보기"/>

      {/* 3-col match grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {(MATCHES || []).slice(0, 6).map((m, idx) => (
          <div key={m?.id ?? idx} className="tm-card tm-card-interactive" style={{ overflow: 'hidden' }}>
            <div style={{ height: 100, background: `var(--grey100) url(${m?.img || ''}) center/cover` }}/>
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <Badge tone="blue" size="sm">{(SPORTS || []).find(s => s.id === m?.sport)?.label ?? '풋살'}</Badge>
                <span className="tm-text-micro tab-num" style={{ color: 'var(--text-muted)' }}>2.1km</span>
              </div>
              <div className="tm-text-body-lg" style={{ lineHeight: 1.35, marginBottom: 8 }}>{m?.title ?? '추천 매치'}</div>
              <MoneyRow label={`${m?.cur ?? 8}/${m?.max ?? 12}명`} amount={m?.fee ?? 15000}/>
            </div>
          </div>
        ))}
      </div>
    </main>

    {/* Right panel — activity + announcement */}
    <aside style={{ borderLeft: '1px solid var(--border)', overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="tm-text-body-lg">내 활동</div>
      <div style={{ background: 'var(--grey50)', borderRadius: 16, padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <KPIStat label="이번 달" value={12} unit="경기"/>
        <KPIStat label="MVP" value={2} unit="회"/>
        <KPIStat label="결제" value={144000} unit="원"/>
        <KPIStat label="매너" value="4.9" unit=""/>
      </div>
      <div className="tm-text-body-lg">날씨</div>
      <WeatherStrip city="강남" temp={22} cond="맑음" wind={2}/>
      <div className="tm-text-body-lg">공지</div>
      <AnnouncementBar icon="🔥" text="이번 주말 16개 매치 모집 중" action/>
      <AnnouncementBar icon="⭐" text="매너왕 뱃지 획득 조건 업데이트" action/>
      <div style={{ marginTop: 'auto' }}>
        <button className="tm-btn tm-btn-primary tm-btn-md" style={{ width: '100%' }}>매치 만들기</button>
      </div>
    </aside>
  </div>
);

/* ─────────────────────────────────────────────
   m02-mb-state-loading  →  HomeToss wireframe + Skeleton slots
   ───────────────────────────────────────────── */
const M02MobileStateLoading = () => (
  <div style={{ width: M02_MB_W, height: M02_MB_H, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    {/* Top bar skeleton */}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 8px' }}>
      <Skeleton w={80} h={24} r={6}/>
      <div style={{ display: 'flex', gap: 8 }}>
        <Skeleton w={40} h={40} r={12}/>
        <Skeleton w={40} h={40} r={12}/>
      </div>
    </div>

    {/* KPI hero skeleton */}
    <div style={{ padding: '8px 20px 20px', display: 'flex', gap: 16 }}>
      <div style={{ flex: 1 }}>
        <Skeleton w="50%" h={12} r={4} mb={8}/>
        <Skeleton w="70%" h={36} r={6}/>
      </div>
      <div style={{ flex: 1, textAlign: 'right' }}>
        <Skeleton w="60%" h={12} r={4} mb={8}/>
        <Skeleton w="80%" h={36} r={6}/>
      </div>
    </div>

    {/* Featured card skeleton */}
    <div style={{ margin: '0 20px 24px' }}>
      <Skeleton w="100%" h={140} r={16}/>
    </div>

    {/* Quick action grid skeleton */}
    <div style={{ padding: '0 20px 24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
      {[0,1,2,3].map(i => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <Skeleton w={44} h={44} r={14}/>
          <Skeleton w={36} h={11} r={4}/>
        </div>
      ))}
    </div>

    {/* Weather strip skeleton */}
    <div style={{ padding: '0 20px 20px' }}>
      <Skeleton w="100%" h={52} r={12}/>
    </div>

    {/* Section title skeleton */}
    <div style={{ padding: '0 20px 12px', display: 'flex', justifyContent: 'space-between' }}>
      <Skeleton w={100} h={17} r={4}/>
      <Skeleton w={48} h={13} r={4}/>
    </div>

    {/* Horizontal card list skeleton */}
    <div style={{ paddingLeft: 20, display: 'flex', gap: 12, overflowX: 'hidden' }}>
      {[0,1,2].map(i => (
        <div key={i} style={{ flexShrink: 0, width: 200 }}>
          <Skeleton w={200} h={100} r={12} mb={0}/>
          <div style={{ padding: '12px 0' }}>
            <Skeleton w="50%" h={11} r={3} mb={8}/>
            <Skeleton w="80%" h={14} r={3} mb={8}/>
            <Skeleton w="60%" h={11} r={3}/>
          </div>
        </div>
      ))}
    </div>
  </div>
);

/* ─────────────────────────────────────────────
   m02-mb-state-empty  →  HomeToss wireframe + EmptyState data slot
   ───────────────────────────────────────────── */
const M02MobileStateEmpty = () => (
  <div style={{ width: M02_MB_W, height: M02_MB_H, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    {/* Top bar — same as HomeToss */}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 8px' }}>
      <div style={{ fontSize: 'var(--fs-subhead)', fontWeight: 800, letterSpacing: 0, color: 'var(--text-strong)' }}>teameet</div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="tm-pressable tm-break-keep" style={{ width: 40, height: 40, background: 'transparent', border: 'none', color: 'var(--text-strong)', display: 'grid', placeItems: 'center' }} aria-label="검색">
          <Icon name="search" size={22}/>
        </button>
        <button className="tm-pressable tm-break-keep" style={{ width: 40, height: 40, background: 'transparent', border: 'none', color: 'var(--text-strong)', display: 'grid', placeItems: 'center' }} aria-label="알림">
          <Icon name="bell" size={22}/>
        </button>
      </div>
    </div>

    {/* KPI hero — zero state */}
    <div style={{ padding: '8px 20px 20px' }}>
      <div style={{ color: 'var(--text-muted)', fontWeight: 500 }} className="tm-text-label">안녕하세요, 정민님</div>
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: 'var(--text-muted)', fontWeight: 500 }} className="tm-text-label">이번 달 활동</div>
          <NumberDisplay value={0} unit="경기" size={36} sub="첫 경기를 시작해보세요"/>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: 'var(--text-muted)', fontWeight: 500 }} className="tm-text-label">매너 점수</div>
          <NumberDisplay value="—" unit="" size={36}/>
        </div>
      </div>
    </div>

    {/* Empty state main slot — replaces featured card + match list */}
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <EmptyState
        title="근처에 추천 매치가 없어요"
        sub="반경을 넓히거나 종목을 바꿔보세요"
        cta="반경 넓히기 (10km)"
      />
      {/* Soft recommendation — weather still shown */}
      <div style={{ padding: '0 20px 16px' }}>
        <WeatherStrip city="서울" temp={22} cond="맑음" wind={2}/>
      </div>
      <div style={{ padding: '0 20px' }}>
        <button className="tm-btn tm-btn-outline tm-btn-md" style={{ width: '100%' }}>매치 직접 만들기</button>
      </div>
    </div>
    <TabBar active="home"/>
  </div>
);

/* ─────────────────────────────────────────────
   m02-mb-state-error  →  HomeToss wireframe + error slot + retry CTA
   ───────────────────────────────────────────── */
const M02MobileStateError = () => (
  <div style={{ width: M02_MB_W, height: M02_MB_H, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    {/* Top bar */}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 8px' }}>
      <div style={{ fontSize: 'var(--fs-subhead)', fontWeight: 800, color: 'var(--text-strong)' }}>teameet</div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="tm-pressable tm-break-keep" style={{ width: 40, height: 40, background: 'transparent', border: 'none', color: 'var(--text-strong)', display: 'grid', placeItems: 'center' }} aria-label="검색">
          <Icon name="search" size={22}/>
        </button>
        <button className="tm-pressable tm-break-keep" style={{ width: 40, height: 40, background: 'transparent', border: 'none', color: 'var(--text-strong)', display: 'grid', placeItems: 'center' }} aria-label="알림">
          <Icon name="bell" size={22}/>
        </button>
      </div>
    </div>

    {/* KPI skeleton — content unavailable */}
    <div style={{ padding: '8px 20px 20px' }}>
      <Skeleton w="40%" h={13} r={4} mb={12}/>
      <div style={{ display: 'flex', gap: 32 }}>
        <Skeleton w={80} h={40} r={6}/>
        <Skeleton w={80} h={40} r={6}/>
      </div>
    </div>

    {/* Error main slot */}
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16, textAlign: 'center' }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'var(--red50)', color: 'var(--red500)',
        display: 'grid', placeItems: 'center',
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 9v4M12 17h.01M10.3 3.5L2.3 17a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3L13.7 3.5a2 2 0 0 0-3.4 0z"/>
        </svg>
      </div>
      <div className="tm-text-body-lg">추천을 불러올 수 없어요</div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', maxWidth: 240 }}>
        네트워크가 불안정해요. 잠시 후 다시 시도해주세요.
      </div>
      <button className="tm-btn tm-btn-primary tm-btn-lg" style={{ width: '100%', marginTop: 8 }}>다시 시도</button>
      <button className="tm-btn tm-btn-ghost tm-btn-md" style={{ width: '100%' }}>오프라인 모드로 보기</button>
    </div>

    {/* Toast — error notification */}
    <div style={{ position: 'relative' }}>
      <Toast msg="데이터를 불러오지 못했어요" type="error" visible/>
    </div>
    <TabBar active="home"/>
  </div>
);

/* ─────────────────────────────────────────────
   m02-mb-state-permission  →  HomeToss wireframe + location permission sheet
   ───────────────────────────────────────────── */
const M02MobileStatePermission = () => (
  <div style={{ width: M02_MB_W, height: M02_MB_H, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    {/* Top bar */}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 8px' }}>
      <div style={{ fontSize: 'var(--fs-subhead)', fontWeight: 800, color: 'var(--text-strong)' }}>teameet</div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="tm-pressable tm-break-keep" style={{ width: 40, height: 40, background: 'transparent', border: 'none', color: 'var(--text-strong)', display: 'grid', placeItems: 'center' }} aria-label="검색">
          <Icon name="search" size={22}/>
        </button>
      </div>
    </div>

    {/* Blurred content behind sheet */}
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', opacity: 0.35, pointerEvents: 'none', overflow: 'hidden' }}>
      <div style={{ padding: '8px 20px 20px' }}>
        <div style={{ color: 'var(--text-muted)', fontWeight: 500 }} className="tm-text-label">안녕하세요, 정민님</div>
        <div style={{ marginTop: 12 }}>
          <NumberDisplay value={12} unit="경기" size={36}/>
        </div>
      </div>
      <div style={{ margin: '0 20px', height: 140, borderRadius: 16, background: 'var(--blue500)' }}/>
    </div>

    {/* Permission sheet — bottom drawer style */}
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      background: 'var(--bg)', borderRadius: '20px 20px 0 0',
      boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
      padding: '20px 24px 40px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
    }}>
      {/* Sheet handle */}
      <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--grey200)' }}/>

      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--orange50)', display: 'grid', placeItems: 'center' }}>
        <Icon name="pin" size={28} color="var(--orange500)"/>
      </div>

      <div style={{ textAlign: 'center' }}>
        <div className="tm-text-body-lg">위치 권한이 필요해요</div>
        <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.6 }}>
          가까운 매치를 추천하려면<br/>위치 권한을 허용해주세요.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', marginTop: 8 }}>
        <button className="tm-btn tm-btn-primary tm-btn-lg" style={{ width: '100%' }}>설정에서 허용하기</button>
        <button className="tm-btn tm-btn-ghost tm-btn-md" style={{ width: '100%' }}>강남구로 검색하기</button>
      </div>
    </div>
  </div>
);

/* ─────────────────────────────────────────────
   m02-mb-state-pending  →  HomeToss wireframe + stale badge + cooldown timer
   ───────────────────────────────────────────── */
const M02MobileStatePending = () => (
  <div style={{ width: M02_MB_W, height: M02_MB_H, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    {/* Top bar */}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 8px' }}>
      <div style={{ fontSize: 'var(--fs-subhead)', fontWeight: 800, color: 'var(--text-strong)' }}>teameet</div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="tm-pressable tm-break-keep" style={{ width: 40, height: 40, background: 'transparent', border: 'none', color: 'var(--text-strong)', display: 'grid', placeItems: 'center' }} aria-label="검색">
          <Icon name="search" size={22}/>
        </button>
        <button className="tm-pressable tm-break-keep" style={{ width: 40, height: 40, background: 'transparent', border: 'none', color: 'var(--text-strong)', display: 'grid', placeItems: 'center' }} aria-label="알림">
          <Icon name="bell" size={22}/>
        </button>
      </div>
    </div>

    {/* Stale data banner */}
    <div style={{ margin: '0 20px 12px', padding: '10px 14px', borderRadius: 12, background: 'var(--orange50)', border: '1px solid var(--orange500)', display: 'flex', alignItems: 'center', gap: 10 }}>
      <Icon name="clock" size={16} color="var(--orange500)"/>
      <div style={{ flex: 1 }}>
        <div className="tm-text-label" style={{ color: 'var(--orange500)' }}>10분 전 추천 결과</div>
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2 }}>새로운 매치가 생겼을 수 있어요</div>
      </div>
      <button className="tm-btn tm-btn-sm" style={{ background: 'var(--orange500)', color: 'var(--static-white)', minHeight: 32, padding: '0 12px', borderRadius: 8 }}>새로고침</button>
    </div>

    {/* KPI hero — slightly dimmed */}
    <div style={{ padding: '0 20px 20px', opacity: 0.8 }}>
      <div style={{ color: 'var(--text-muted)', fontWeight: 500 }} className="tm-text-label">안녕하세요, 정민님</div>
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: 'var(--text-muted)', fontWeight: 500 }} className="tm-text-label">이번 달 활동</div>
          <NumberDisplay value={12} unit="경기" size={36} sub="지난달보다 +3"/>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: 'var(--text-muted)', fontWeight: 500 }} className="tm-text-label">매너 점수</div>
          <NumberDisplay value="4.9" unit="" size={36} sub="상위 5%"/>
        </div>
      </div>
    </div>

    {/* Stale match cards (dimmed + badge) */}
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>
      <SectionTitle title="추천 매치" sub="10분 전 기준 · 업데이트 대기 중" action="전체보기"/>
      <div style={{ paddingLeft: 20, display: 'flex', gap: 12, overflowX: 'auto', paddingRight: 20, paddingBottom: 8 }}>
        {(MATCHES || []).slice(0, 4).map((m, idx) => (
          <div key={m?.id ?? idx} style={{
            flexShrink: 0, width: 200, opacity: 0.7,
            background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden',
          }}>
            <div style={{ height: 100, background: `var(--grey100) url(${m?.img || ''}) center/cover` }}/>
            <div style={{ padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Badge tone="grey" size="sm">{(SPORTS || []).find(s => s.id === m?.sport)?.label ?? '풋살'}</Badge>
                <Badge tone="orange" size="sm">이전 결과</Badge>
              </div>
              <div className="tm-text-label" style={{ lineHeight: 1.3 }}>{m?.title ?? '추천 매치'}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
    <TabBar active="home"/>
  </div>
);

/* ─────────────────────────────────────────────
   M02ComponentSwatch helper (M02 prefix to avoid scope collision)
   ───────────────────────────────────────────── */
const M02ComponentSwatch = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, borderRadius: 12, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
    <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</div>
  </div>
);

/* ─────────────────────────────────────────────
   m02-mb-components  →  M02 production primitive inventory
   ───────────────────────────────────────────── */
const M02ComponentsBoard = ({ viewport }) => {
  const w = viewport === 'mb' ? M02_MB_W : viewport === 'tb' ? M02_TB_W : M02_DT_W;
  const h = viewport === 'mb' ? M02_MB_H : viewport === 'tb' ? M02_TB_H : M02_DT_H;
  return (
    <div style={{ width: w, height: h, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflow: 'auto' }}>
      <Badge tone="blue" size="sm">{`m02-${viewport}-components`}</Badge>
      <div className="tm-text-title" style={{ marginTop: 8 }}>M02 컴포넌트 인벤토리</div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>홈·추천에서 실제 사용하는 production primitives</div>

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>

        {/* NumberDisplay — KPI hero */}
        <M02ComponentSwatch label="NumberDisplay · KPI hero (이달 활동 / 매너 점수)">
          <NumberDisplay value={12} unit="경기" size={36} sub="지난달보다 +3"/>
          <NumberDisplay value="4.9" unit="" size={36} sub="상위 5%"/>
        </M02ComponentSwatch>

        {/* KPIStat — 3-col stats grid */}
        <M02ComponentSwatch label="KPIStat · 3-col 통계 그리드">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, width: '100%', background: 'var(--grey50)', borderRadius: 12, padding: 16 }}>
            <KPIStat label="참가" value={12} unit="회" delta={3} deltaLabel="회"/>
            <KPIStat label="MVP" value={2} unit="회" delta={1} deltaLabel="회"/>
            <KPIStat label="결제" value={144000} unit="원"/>
          </div>
        </M02ComponentSwatch>

        {/* MoneyRow — 참가비 내역 */}
        <M02ComponentSwatch label="MoneyRow · 참가비 내역">
          <div style={{ width: '100%' }}>
            <MoneyRow label="기본 참가비" amount={10000}/>
            <MoneyRow label="조끼 대여" amount={2000}/>
            <div style={{ borderTop: '1px solid var(--border)' }}>
              <MoneyRow label="총 참가비" amount={12000} strong accent/>
            </div>
          </div>
        </M02ComponentSwatch>

        {/* SectionTitle */}
        <M02ComponentSwatch label="SectionTitle · 섹션 헤더">
          <div style={{ width: '100%' }}>
            <SectionTitle title="추천 매치" sub="실력에 맞는 경기 5개" action="전체보기"/>
          </div>
        </M02ComponentSwatch>

        {/* WeatherStrip */}
        <M02ComponentSwatch label="WeatherStrip · 오늘 날씨 + 운동 적합도">
          <div style={{ width: '100%' }}>
            <WeatherStrip city="상암" temp={18} cond="맑음" wind={2}/>
          </div>
        </M02ComponentSwatch>

        {/* StackedAvatars */}
        <M02ComponentSwatch label="StackedAvatars · 참가자 프리뷰">
          <StackedAvatars avatars={[]} max={4} size={28}/>
          <StackedAvatars avatars={[]} max={6} size={36}/>
        </M02ComponentSwatch>

        {/* Sport chip filter */}
        <M02ComponentSwatch label="HapticChip · 종목 필터">
          {M02_SPORT_CHIPS.slice(0, 5).map((c, i) => (
            <HapticChip key={c.id} active={i === 0}>{c.label}</HapticChip>
          ))}
        </M02ComponentSwatch>

        {/* sportCardAccent chip — 11종목 */}
        <M02ComponentSwatch label="sportCardAccent · 종목 색상 chip">
          {M02_SPORT_CHIPS.map(c => (
            <span key={c.id} className="tm-text-caption" style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 999,
              background: c.bg, color: c.color,
              fontWeight: 600,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.color, display: 'inline-block' }}/>
              {c.label}
            </span>
          ))}
        </M02ComponentSwatch>

        {/* Skeleton */}
        <M02ComponentSwatch label="Skeleton · 카드 로딩 플레이스홀더">
          <div style={{ width: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton w="100%" h={100} r={12}/>
            <Skeleton w="60%" h={11} r={4}/>
            <Skeleton w="80%" h={14} r={4}/>
          </div>
        </M02ComponentSwatch>

        {/* Toast */}
        <M02ComponentSwatch label="Toast · 피드백 알림 (info / error)">
          <div style={{ position: 'relative', width: '100%', height: 48 }}>
            <Toast msg="추천이 업데이트됐어요" type="info" visible/>
          </div>
        </M02ComponentSwatch>

        {/* TabBar */}
        <M02ComponentSwatch label="TabBar · 하단 글로벌 내비게이션">
          <div style={{ width: M02_MB_W - 48 }}>
            <TabBar active="home"/>
          </div>
        </M02ComponentSwatch>

        {/* AnnouncementBar */}
        <M02ComponentSwatch label="AnnouncementBar · 공지 배너">
          <div style={{ width: '100%' }}>
            <AnnouncementBar icon="🔥" text="이번 주말 16개 매치 모집 중" action/>
          </div>
        </M02ComponentSwatch>

      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   M02AssetSwatch / M02ColorSwatch helpers
   ───────────────────────────────────────────── */
const M02AssetSwatch = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, borderRadius: 12, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
    <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</div>
  </div>
);

const M02ColorSwatch = ({ token, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
    <div style={{ width: 40, height: 40, borderRadius: 8, background: value, border: '1px solid var(--border)' }}/>
    <div className="tm-text-micro tab-num" style={{ color: 'var(--text-muted)' }}>{token}</div>
  </div>
);

/* ─────────────────────────────────────────────
   m02-mb-assets  →  M02에서 실제 사용하는 토큰 인벤토리
   ───────────────────────────────────────────── */
const M02AssetsBoard = ({ viewport }) => {
  const w = viewport === 'mb' ? M02_MB_W : viewport === 'tb' ? M02_TB_W : M02_DT_W;
  const h = viewport === 'mb' ? M02_MB_H : viewport === 'tb' ? M02_TB_H : M02_DT_H;
  return (
    <div style={{ width: w, height: h, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflow: 'auto' }}>
      <Badge tone="blue" size="sm">{`m02-${viewport}-assets`}</Badge>
      <div className="tm-text-title" style={{ marginTop: 8 }}>M02 디자인 토큰 인벤토리</div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>홈·추천이 실제로 사용하는 토큰만 발췌</div>

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>

        <M02AssetSwatch label="Color · Brand">
          <M02ColorSwatch token="blue500" value="var(--blue500)"/>
          <M02ColorSwatch token="blue50" value="var(--blue50)"/>
          <M02ColorSwatch token="blue600" value="var(--blue600)"/>
          <M02ColorSwatch token="red500" value="var(--red500)"/>
          <M02ColorSwatch token="red50" value="var(--red50)"/>
        </M02AssetSwatch>

        <M02AssetSwatch label="Color · sportCardAccent (M02 사용 종목)">
          <M02ColorSwatch token="futsal·blue" value="var(--blue500)"/>
          <M02ColorSwatch token="basketball·orange" value="var(--orange500)"/>
          <M02ColorSwatch token="badminton·green" value="var(--green500)"/>
          <M02ColorSwatch token="tennis·purple" value="var(--purple500)"/>
          <M02ColorSwatch token="hockey·teal" value="var(--teal500)"/>
          <M02ColorSwatch token="soccer·red" value="var(--red500)"/>
        </M02AssetSwatch>

        <M02AssetSwatch label="Color · Neutral hierarchy">
          <M02ColorSwatch token="grey50" value="var(--grey50)"/>
          <M02ColorSwatch token="grey100" value="var(--grey100)"/>
          <M02ColorSwatch token="grey200" value="var(--grey200)"/>
          <M02ColorSwatch token="grey700" value="var(--grey700)"/>
          <M02ColorSwatch token="grey900" value="var(--grey900)"/>
        </M02AssetSwatch>

        <M02AssetSwatch label="Color · Semantic">
          <M02ColorSwatch token="orange500" value="var(--orange500)"/>
          <M02ColorSwatch token="orange50" value="var(--orange50)"/>
          <M02ColorSwatch token="green500" value="var(--green500)"/>
          <M02ColorSwatch token="yellow500" value="var(--yellow500)"/>
        </M02AssetSwatch>

        <M02AssetSwatch label="Typography · 사용 단계 (7)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
            <span className="tm-text-display">display · 홈 KPI 수치</span>
            <span className="tm-text-heading">heading · 섹션 제목</span>
            <span className="tm-text-body-lg">body-lg · 카드 제목</span>
            <span className="tm-text-body">body · 본문 설명</span>
            <span className="tm-text-label">label · 메타 정보</span>
            <span className="tm-text-caption">caption · 거리·인원 정보</span>
            <span className="tm-text-micro">micro · 뱃지·칩 텍스트</span>
          </div>
        </M02AssetSwatch>

        <M02AssetSwatch label="Spacing · 4-multiple 사용값">
          {[8, 12, 16, 20, 24, 32].map(n => (
            <div key={n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: n, height: n, background: 'var(--blue200)', borderRadius: 2 }}/>
              <span className="tm-text-micro tab-num">{n}px</span>
            </div>
          ))}
        </M02AssetSwatch>

        <M02AssetSwatch label="Radius · 사용값">
          {[
            { label: 'r-sm 8px · chip/badge', r: 8 },
            { label: 'r-md 12px · 카드 안쪽', r: 12 },
            { label: 'r-lg 16px · 카드', r: 16 },
            { label: 'r-pill · 칩/배지', r: 999 },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 40, height: 40, background: 'var(--blue100)', borderRadius: item.r }}/>
              <span className="tm-text-micro" style={{ color: 'var(--text-muted)', textAlign: 'center', maxWidth: 64 }}>{item.label}</span>
            </div>
          ))}
        </M02AssetSwatch>

        <M02AssetSwatch label="Motion · 사용 토큰">
          <Badge tone="grey" size="sm">--dur-fast 120ms</Badge>
          <Badge tone="grey" size="sm">--dur-base 180ms</Badge>
          <Badge tone="grey" size="sm">--dur-slow 280ms</Badge>
          <Badge tone="grey" size="sm">--ease-out-quart</Badge>
          <Badge tone="grey" size="sm">sk-shimmer 1.4s</Badge>
        </M02AssetSwatch>

        <M02AssetSwatch label="Shadow · depth hierarchy">
          <div style={{ display: 'flex', gap: 16 }}>
            {[
              { label: 'sh-1', v: '0 1px 3px rgba(0,0,0,.06)' },
              { label: 'sh-2', v: '0 2px 8px rgba(0,0,0,.08)' },
              { label: 'sh-3', v: '0 4px 12px rgba(0,0,0,.10)' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 48, height: 48, background: 'var(--bg)', borderRadius: 12, boxShadow: s.v }}/>
                <span className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{s.label}</span>
              </div>
            ))}
          </div>
        </M02AssetSwatch>

      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   m02-tb-motion  →  M02 micro-interaction 가이드
   ───────────────────────────────────────────── */
const M02MotionBoard = () => (
  <div style={{ width: M02_MB_W, height: M02_MB_H, background: 'var(--bg)', fontFamily: 'var(--font)', overflow: 'auto', padding: 24 }}>
    <Badge tone="blue" size="sm">m02-tb-motion</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M02 · motion contract</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>홈·추천 micro-interaction 계약</div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>

      {/* Pull-to-refresh */}
      <div style={{ padding: 16, borderRadius: 12, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
        <div className="tm-text-label">Pull-to-refresh</div>
        <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>당기기 → PullHint 스피너 + haptic light → 데이터 재요청 → 카드 stagger-in</div>
        <div style={{ marginTop: 12 }}>
          <PullHint/>
        </div>
      </div>

      {/* Badge pulse */}
      <div style={{ padding: 16, borderRadius: 12, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
        <div className="tm-text-label">Badge pulse · 알림 dot</div>
        <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>bell 아이콘 dot → animation: badge-pulse 1.5s infinite. 미읽음 0 시 숨김.</div>
        <div style={{ marginTop: 12, display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ position: 'relative', width: 40, height: 40, background: 'var(--grey100)', borderRadius: 12, display: 'grid', placeItems: 'center' }}>
            <Icon name="bell" size={20}/>
            <span style={{ position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: '50%', background: 'var(--red500)', border: '2px solid var(--bg)' }}/>
          </div>
          <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>미읽음 있음</span>
          <div style={{ position: 'relative', width: 40, height: 40, background: 'var(--grey100)', borderRadius: 12, display: 'grid', placeItems: 'center' }}>
            <Icon name="bell" size={20}/>
          </div>
          <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>미읽음 없음</span>
        </div>
      </div>

      {/* Card tap scale */}
      <div style={{ padding: 16, borderRadius: 12, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
        <div className="tm-text-label">Card tap · scale(.98)</div>
        <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>추천 카드 tap → scale(.98) · 120ms · ease-out-quart. `.tm-pressable` + transform: translateZ(0).</div>
        <div style={{ marginTop: 12 }}>
          <div className="tm-card tm-card-interactive tm-pressable" style={{ padding: 16 }}>
            <Badge tone="blue" size="sm">풋살</Badge>
            <div className="tm-text-body-lg" style={{ marginTop: 8 }}>강남 6vs6 · 토 19:00</div>
            <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>잠실 풋살장 · 12/12명 · 17,000원</div>
          </div>
        </div>
      </div>

      {/* FAB hover */}
      <div style={{ padding: 16, borderRadius: 12, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
        <div className="tm-text-label">FAB hover · 매치 만들기</div>
        <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>hover → box-shadow sh-3 + scale(1.04) · 180ms · ease-out-quart. touch → scale(.96).</div>
        <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
          <button className="tm-btn tm-btn-primary tm-btn-md tm-pressable" style={{ borderRadius: 999, minHeight: 44, padding: '0 20px', boxShadow: '0 4px 12px rgba(49,130,246,0.32)' }}>
            <Icon name="plus" size={16} color="var(--static-white)"/> 매치 만들기
          </button>
        </div>
      </div>

      {/* Sticky CTA reveal */}
      <div style={{ padding: 16, borderRadius: 12, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
        <div className="tm-text-label">Sticky CTA reveal</div>
        <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>스크롤 200px 이상 → CTA 슬라이드업 + 배경 blur. tm-animate-sheet · 280ms · ease-out-expo.</div>
        <div style={{ marginTop: 12, padding: '12px 0', background: 'var(--bg)', borderTop: '1px solid var(--border)', borderRadius: 8 }}>
          <button className="tm-btn tm-btn-primary tm-btn-lg" style={{ width: '100%' }}>17,000원 · 참가하기</button>
        </div>
      </div>

      {/* Skeleton shimmer */}
      <div style={{ padding: 16, borderRadius: 12, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
        <div className="tm-text-label">Skeleton shimmer · 로딩</div>
        <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>sk-shimmer 1.4s ease infinite. background-position 200% → −200% sweep.</div>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton w="100%" h={100} r={12}/>
          <Skeleton w="60%" h={12} r={4}/>
          <Skeleton w="80%" h={16} r={4}/>
        </div>
      </div>

      {/* Stagger-in */}
      <div style={{ padding: 16, borderRadius: 12, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
        <div className="tm-text-label">Card stagger-in</div>
        <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>추천 카드 등장 → animation-delay 0ms, 50ms, 100ms … + tm-animate-enter (fade-in + translateY 8px). prefers-reduced-motion → 0.01ms.</div>
      </div>

      {/* Tab transition */}
      <div style={{ padding: 16, borderRadius: 12, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
        <div className="tm-text-label">TabBar 탭 전환</div>
        <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>색상 transition-colors 200ms + stroke 1.8→2.2 · font-weight 500→700. 활성 탭 = blue500 액센트.</div>
        <div style={{ marginTop: 12 }}>
          <TabBar active="home"/>
        </div>
      </div>

    </div>
  </div>
);

Object.assign(window, {
  M02MobileMain,
  M02TabletMain,
  M02DesktopMain,
  M02MobileStateLoading,
  M02MobileStateEmpty,
  M02MobileStateError,
  M02MobileStatePermission,
  M02MobileStatePending,
  M02ComponentsBoard,
  M02AssetsBoard,
  M02MotionBoard,
});
