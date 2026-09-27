/* fix32 — M16 공개·마케팅 풀 grid.
   ID schema: m16-{mb|tb|dt}-{main|detail|flow|state|components|assets|motion}[-{sub}]
   Routes: /, /landing, /about, /faq, /guide, /pricing, /users/[id] (public)
   Light-only. References tokens.jsx + signatures.jsx.
   Canonical globals: PublicStateEdgeBoard, PublicLoggedOutLimitsBoard,
   PublicFaqPricingEdgeBoard, DesktopLanding, MoneyRow, NumberDisplay,
   KPIStat, Skeleton, EmptyState, SectionTitle. */

const M16_MB_W = 375;
const M16_MB_H = 812;
const M16_TB_W = 768;
const M16_TB_H = 1024;
const M16_DT_W = 1280;
const M16_DT_H = 820;

/* ---------- Local helpers (M16 prefix — Babel single-scope safe) ---------- */

const M16ComponentSwatch = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 12, background: 'var(--grey50)', border: '1px solid var(--grey100)' }}>
    <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</div>
  </div>
);

const M16AssetSwatch = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>{children}</div>
  </div>
);

const M16ColorSwatch = ({ token, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
    <div style={{ width: 36, height: 36, borderRadius: 8, background: value, border: '1px solid var(--grey100)' }} aria-hidden="true"/>
    <div className="tm-text-micro tm-tabular">{token}</div>
  </div>
);

/* Shared fixture data */
const M16_SPORT_ITEMS = [
  { id: 'futsal',     label: '풋살',    color: 'var(--blue500)' },
  { id: 'basketball', label: '농구',    color: 'var(--orange500)' },
  { id: 'badminton',  label: '배드민턴', color: 'var(--green500)' },
  { id: 'tennis',     label: '테니스',  color: 'var(--purple500)' },
  { id: 'icehockey',  label: '하키',    color: 'var(--teal500)' },
  { id: 'soccer',     label: '축구',    color: 'var(--red500)' },
];

const M16_PRICING = [
  {
    tier: 'Free',
    tierKo: '무료',
    price: '0원',
    period: '/월',
    desc: '혼자 시작해보고 싶은 분',
    features: ['매치 탐색 무제한', '월 3회 참가 신청', '기본 프로필'],
    cta: '무료로 시작',
    ctaVariant: 'outline',
    highlight: false,
  },
  {
    tier: 'Pro',
    tierKo: '프로',
    price: '9,900원',
    period: '/월',
    desc: '정기적으로 활동하는 동호인',
    features: ['참가 신청 무제한', 'AI 매칭 우선 추천', '팀 생성 · 관리', '경기 통계 · ELO'],
    cta: 'Pro 시작하기',
    ctaVariant: 'primary',
    highlight: true,
    badge: '인기',
  },
  {
    tier: 'Team',
    tierKo: '팀',
    price: '29,900원',
    period: '/월 · 팀당',
    desc: '클럽·팀 단위 운영자',
    features: ['Pro 모든 기능', '팀원 최대 50명', '팀 대항전 우선 매칭', '어드민 대시보드'],
    cta: '팀 플랜 시작',
    ctaVariant: 'dark',
    highlight: false,
  },
];

const M16_FAQS = [
  { q: 'Teameet는 어떤 서비스인가요?', a: '풋살·농구·배드민턴 등 11개 생활체육 종목의 개인·팀을 AI로 최적 매칭하는 플랫폼입니다. 가입 후 바로 근처 매치를 찾거나 직접 만들 수 있어요.' },
  { q: '매치에 참가하려면 어떻게 하나요?', a: '앱을 설치하고 소셜 로그인 후 종목과 지역을 설정하면 AI가 실력에 맞는 매치를 추천해줍니다. 원하는 매치에 바로 참가 신청하세요.' },
  { q: '결제는 어떻게 이루어지나요?', a: '토스페이먼츠를 통한 안전한 결제가 지원됩니다. 매치 취소 시 환불 정책에 따라 전액 또는 부분 환불이 가능합니다.' },
  { q: '팀을 만들 수 있나요?', a: 'Pro 플랜 이상에서 팀을 생성·관리할 수 있습니다. 팀원 초대, 역할 관리, 팀 대항전 신청까지 지원합니다.' },
];

const M16_GUIDE_STEPS = [
  { step: 1, icon: 'people',    title: '가입하기',       desc: '카카오·네이버·Apple로 3초 가입. 종목과 실력 설정까지 2분이면 완료.' },
  { step: 2, icon: 'search',    title: '매치 찾기',      desc: '위치 기반 AI 추천으로 지금 당장 뛸 수 있는 매치를 발견하세요.' },
  { step: 3, icon: 'check',     title: '참가 신청',      desc: '원하는 매치에 참가 신청 후 결제까지 한 번에. 확정 알림이 바로 도착해요.' },
  { step: 4, icon: 'trophy',    title: '경기 후 평가',   desc: '매치 완료 후 상호 평가로 ELO가 올라가고 뱃지를 획득해요.' },
];

/* ---------- Shared sub-components ---------- */

/* Public header bar — glass on scroll, transparent on hero */
const M16PublicHeader = ({ scrolled }) => (
  <div style={{
    padding: '12px 20px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: scrolled ? 'rgba(255,255,255,0.94)' : 'transparent',
    backdropFilter: scrolled ? 'blur(12px)' : 'none',
    borderBottom: scrolled ? '1px solid var(--grey100)' : 'none',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontWeight: 800, flexShrink: 0 }}>
        <span className="tm-text-sm" style={{ fontWeight: 800 }}>T</span>
      </div>
      <span className="tm-text-body-lg" style={{ fontWeight: 700 }}>Teameet</span>
    </div>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button className="tm-btn tm-btn-ghost tm-btn-sm" style={{ minHeight: 44 }} aria-label="로그인">로그인</button>
      <button className="tm-btn tm-btn-primary tm-btn-sm" style={{ minHeight: 44 }} aria-label="시작하기">시작하기</button>
    </div>
  </div>
);

/* Brand footer (dark surface) */
const M16BrandFooter = () => (
  <div style={{ background: 'var(--grey900)', padding: '24px 20px', color: 'var(--static-white)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--blue500)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>
        <span className="tm-text-xs" style={{ fontWeight: 800, color: 'var(--static-white)' }}>T</span>
      </div>
      <span className="tm-text-label" style={{ color: 'var(--static-white)', fontWeight: 700 }}>Teameet</span>
    </div>
    <p className="tm-text-caption" style={{ color: 'var(--grey400)', marginBottom: 12, lineHeight: 1.6 }}>
      AI 기반 멀티스포츠 소셜 매칭 플랫폼<br/>풋살·농구·배드민턴 등 11개 종목
    </p>
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {['이용약관', '개인정보처리방침', '서비스 소개', '문의하기'].map((t) => (
        <span key={t} className="tm-text-caption" style={{ color: 'var(--grey400)', cursor: 'pointer' }}>{t}</span>
      ))}
    </div>
    <div className="tm-text-micro" style={{ color: 'var(--grey500)', marginTop: 12 }}>© 2026 Teameet Inc.</div>
  </div>
);

/* Sport chip with color dot + text label (not color-only, WCAG) */
const M16SportChip = ({ id, label, color }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'var(--bg)', border: '1px solid var(--grey200)', borderRadius: 999, flexShrink: 0 }}>
    <div style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} aria-hidden="true"/>
    <span className="tm-text-micro" style={{ fontWeight: 600 }}>{label}</span>
  </div>
);

/* Stat cell: big tabular number + muted label */
const M16StatCell = ({ num, label }) => (
  <div style={{ padding: '16px 8px', textAlign: 'center', borderRight: '1px solid var(--grey100)' }}>
    <div className="tm-text-2xl tm-tabular" style={{ color: 'var(--blue500)', marginBottom: 2 }}>{num}</div>
    <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{label}</div>
  </div>
);

/* Guide step row: icon circle + optional vertical connector + text */
const M16GuideRow = ({ step, icon, title, desc, active, last }) => (
  <div style={{ display: 'flex', gap: 16 }}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{
        width: 44, height: 44, borderRadius: 22, flexShrink: 0,
        background: active ? 'var(--blue500)' : 'var(--grey100)',
        display: 'grid', placeItems: 'center', minHeight: 44,
      }}
        aria-label={`${step}단계 ${title}`}
      >
        <Icon name={icon} size={20} color={active ? 'var(--static-white)' : 'var(--grey500)'}/>
      </div>
      {!last && <div style={{ width: 2, flex: 1, minHeight: 24, background: 'var(--grey100)', margin: '6px 0' }}/>}
    </div>
    <div style={{ flex: 1, paddingBottom: last ? 0 : 16 }}>
      <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>STEP {step}</div>
      <div className="tm-text-body-lg" style={{ fontWeight: 700, marginBottom: 4, marginTop: 2 }}>{title}</div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>{desc}</div>
    </div>
  </div>
);

/* ---------- m16-mb-main: 랜딩 hero (모바일 · 비로그인)
   canonical: public landing — shrunken DesktopLanding hero vocabulary ---------- */
const M16MobileMain = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <M16PublicHeader scrolled={false}/>

      {/* Hero gradient section */}
      <div style={{ padding: '32px 20px 28px', background: 'linear-gradient(180deg, var(--blue50) 0%, var(--bg) 100%)' }}>
        <div style={{ marginBottom: 12 }}>
          <Badge tone="blue" size="sm">
            <Icon name="star" size={11} aria-hidden="true"/>
            <span style={{ marginLeft: 4 }}>12,000+ 동호인 활동 중</span>
          </Badge>
        </div>
        <h1 className="tm-text-4xl" style={{ lineHeight: 1.25, marginTop: 8, marginBottom: 12 }}>
          가까운 팀원을<br/>AI가 찾아줘요
        </h1>
        <p className="tm-text-body" style={{ color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.6 }}>
          풋살·농구·하키 등 11종목<br/>실력별 AI 매칭으로 즉시 참가
        </p>
        <div style={{ display: 'grid', gap: 8 }}>
          <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" style={{ minHeight: 44 }}>무료로 시작하기</button>
          <button className="tm-btn tm-btn-outline tm-btn-md tm-btn-block" style={{ minHeight: 44 }}>서비스 둘러보기</button>
        </div>

        {/* Sport chips — color dot + text (not color-only) */}
        <div style={{ display: 'flex', gap: 6, marginTop: 20, flexWrap: 'wrap' }}>
          {M16_SPORT_ITEMS.map((s) => <M16SportChip key={s.id} {...s}/>)}
        </div>
      </div>

      {/* Social proof stat strip — NumberDisplay vocabulary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: '1px solid var(--grey100)', borderBottom: '1px solid var(--grey100)' }}>
        <M16StatCell num="12,000+" label="활성 멤버"/>
        <M16StatCell num="800+" label="월간 매치"/>
        <M16StatCell num="11종목" label="스포츠"/>
      </div>

      {/* How-it-works teaser — guide step vocabulary */}
      <div style={{ padding: '24px 20px' }}>
        <SectionTitle title="어떻게 사용하나요?" sub="4단계로 첫 매치를 시작하세요"/>
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          {M16_GUIDE_STEPS.slice(0, 2).map((s, i) => (
            <div key={s.step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 32, height: 32, borderRadius: 16, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontWeight: 700, flexShrink: 0 }}>
                <span className="tm-text-sm" style={{ fontWeight: 700, color: 'var(--static-white)' }}>{s.step}</span>
              </div>
              <div>
                <div className="tm-text-label" style={{ fontWeight: 700 }}>{s.title}</div>
                <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.5 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <button className="tm-btn tm-btn-outline tm-btn-md tm-btn-block" style={{ marginTop: 16, minHeight: 44 }}>전체 가이드 보기 →</button>
      </div>

      {/* CTA banner — brand blue */}
      <div style={{ margin: '0 20px 24px', padding: '20px', background: 'var(--blue500)', borderRadius: 16, color: 'var(--static-white)' }}>
        <div className="tm-text-body-lg" style={{ color: 'var(--static-white)', marginBottom: 6 }}>지금 바로 시작하세요</div>
        <div className="tm-text-caption" style={{ color: 'var(--grey200)', marginBottom: 14 }}>앱 설치 없이 웹에서 바로 이용 가능</div>
        <button className="tm-btn tm-btn-md tm-btn-block" style={{ background: 'var(--static-white)', color: 'var(--blue500)', fontWeight: 700, minHeight: 44 }}>무료 계정 만들기</button>
      </div>

      <M16BrandFooter/>
    </div>
  </Phone>
);

/* ---------- m16-tb-main: 태블릿 랜딩 ---------- */
const M16TabletMain = () => (
  <div style={{ width: M16_TB_W, height: M16_TB_H, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    {/* Header */}
    <div style={{ padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--grey100)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>
          <span className="tm-text-base" style={{ fontWeight: 800, color: 'var(--static-white)' }}>T</span>
        </div>
        <span className="tm-text-body-lg" style={{ fontWeight: 700 }}>Teameet</span>
      </div>
      <nav style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {['서비스 소개', '가이드', '가격'].map((t) => (
          <button key={t} className="tm-btn tm-btn-ghost tm-btn-sm" style={{ minHeight: 44 }}>{t}</button>
        ))}
        <button className="tm-btn tm-btn-outline tm-btn-sm" style={{ minHeight: 44, marginLeft: 4 }}>로그인</button>
        <button className="tm-btn tm-btn-primary tm-btn-sm" style={{ minHeight: 44 }}>시작하기</button>
      </nav>
    </div>

    {/* Hero 2-col — mirrors DesktopLanding vocabulary at tablet width */}
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, padding: '40px 32px', background: 'linear-gradient(180deg, var(--blue50) 0%, var(--bg) 80%)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingRight: 32 }}>
        <div style={{ marginBottom: 16 }}>
          <Badge tone="blue" size="sm">AI 기반 스포츠 매칭</Badge>
        </div>
        <h1 className="tm-text-5xl" style={{ lineHeight: 1.2, marginBottom: 16 }}>가까운 팀원을<br/>AI가 찾아줘요</h1>
        <p className="tm-text-body" style={{ color: 'var(--text-muted)', marginBottom: 28, lineHeight: 1.7 }}>
          풋살·농구·하키 등 11개 종목에서<br/>실력별 AI 매칭으로 즉시 팀을 구성하세요.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="tm-btn tm-btn-primary tm-btn-lg" style={{ minWidth: 140, minHeight: 44 }}>무료로 시작</button>
          <button className="tm-btn tm-btn-outline tm-btn-lg" style={{ minHeight: 44 }}>더 알아보기</button>
        </div>
        {/* Stats — NumberDisplay vocabulary */}
        <div style={{ display: 'flex', gap: 20, marginTop: 28 }}>
          {[['12,000+', '활성 멤버'], ['800+', '월간 매치'], ['11', '스포츠 종목']].map(([n, l]) => (
            <div key={l}>
              <div className="tm-text-3xl tm-tabular" style={{ color: 'var(--blue500)' }}>{n}</div>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: feature card stack */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center' }}>
        {[
          { icon: 'people',   title: 'AI 매칭',    desc: '실력·위치·일정 기반 최적 멤버 추천' },
          { icon: 'calendar', title: '즉시 참가',   desc: '원하는 매치에 바로 참가 신청 가능' },
          { icon: 'trophy',   title: 'ELO 랭킹',   desc: '경기마다 실력이 측정되고 기록돼요' },
        ].map(({ icon, title, desc }) => (
          <div key={title} style={{ display: 'flex', gap: 14, padding: '14px 16px', background: 'var(--bg)', border: '1px solid var(--grey200)', borderRadius: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--blue50)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon name={icon} size={20} color="var(--blue500)"/>
            </div>
            <div>
              <div className="tm-text-label" style={{ fontWeight: 700 }}>{title}</div>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.5 }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* ---------- m16-dt-main: 데스크탑 — wraps canonical DesktopLanding ---------- */
const M16DesktopMain = () => (
  <div style={{ width: M16_DT_W, height: M16_DT_H, background: 'var(--bg)', fontFamily: 'var(--font)', overflow: 'auto' }}>
    <DesktopLanding/>
  </div>
);

/* ---------- m16-mb-detail: about / 회사 소개 (public-facing) ---------- */
const M16MobileDetail = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <M16PublicHeader scrolled={true}/>

      {/* Hero — brand blue gradient */}
      <div style={{ padding: '28px 20px 24px', background: 'linear-gradient(180deg, var(--blue500) 0%, var(--blue700) 100%)', color: 'var(--static-white)' }}>
        <div className="tm-text-micro" style={{ color: 'var(--grey200)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>회사 소개</div>
        <h1 className="tm-text-3xl" style={{ color: 'var(--static-white)', marginBottom: 12, lineHeight: 1.25 }}>
          스포츠로 연결되는 사람들
        </h1>
        <p className="tm-text-body" style={{ color: 'var(--grey100)', lineHeight: 1.65 }}>
          Teameet은 AI 기반 생활체육 매칭 플랫폼으로, 취미 스포츠를 즐기는 모든 사람들이 부담 없이 팀을 구성하고 경기할 수 있는 세상을 만들어갑니다.
        </p>
      </div>

      {/* Mission card */}
      <div style={{ padding: '24px 20px' }}>
        <SectionTitle title="미션"/>
        <Card pad={16} style={{ background: 'var(--blue50)', border: '1px solid var(--blue100)', marginTop: 12 }}>
          <p className="tm-text-body-lg" style={{ color: 'var(--blue600)', lineHeight: 1.6 }}>
            "모든 사람이 원할 때 원하는 스포츠를 즐길 수 있도록"
          </p>
        </Card>
      </div>

      {/* Core values */}
      <div style={{ padding: '0 20px 24px' }}>
        <SectionTitle title="핵심 가치"/>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {[
            { icon: 'people',  title: '연결',   desc: '혼자 못 뛰는 스포츠를 함께할 팀원을 AI로 연결합니다.' },
            { icon: 'shield',  title: '신뢰',   desc: '매너 점수·ELO·리뷰로 믿을 수 있는 매칭 환경을 만듭니다.' },
            { icon: 'trophy',  title: '성장',   desc: '경기마다 기록되는 데이터로 내 실력 향상을 눈으로 확인하세요.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} style={{ display: 'flex', gap: 14, padding: '14px 16px', background: 'var(--grey50)', border: '1px solid var(--grey100)', borderRadius: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--grey200)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Icon name={icon} size={20} color="var(--blue500)"/>
              </div>
              <div>
                <div className="tm-text-label" style={{ fontWeight: 700 }}>{title}</div>
                <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.5 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* KPI strip — KPIStat vocabulary */}
      <div style={{ padding: '0 20px 24px' }}>
        <SectionTitle title="현황"/>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
          <KPIStat label="서비스 런칭" value="2024.03"/>
          <KPIStat label="누적 멤버" value="12,000+"/>
          <KPIStat label="누적 매치" value="9,600+"/>
          <KPIStat label="지원 종목" value="11종목"/>
        </div>
      </div>

      <M16BrandFooter/>
    </div>
  </Phone>
);

/* ---------- m16-mb-flow-pricing: 가격표 (grouped MoneyRow) ---------- */
const M16MobileFlowPricing = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <M16PublicHeader scrolled={true}/>

      <div style={{ padding: '24px 20px 16px' }}>
        <SectionTitle title="요금제" sub="모든 플랜은 언제든 변경 가능해요"/>
      </div>

      {/* Billing cycle toggle — color + label (not color-only) */}
      <div style={{ padding: '0 20px 16px' }}>
        <div role="group" aria-label="결제 주기 선택" style={{ display: 'inline-flex', background: 'var(--grey100)', borderRadius: 10, padding: 3 }}>
          {['월간', '연간'].map((t, i) => (
            <button key={t} aria-pressed={i === 1}
              style={{
                padding: '7px 20px', borderRadius: 8, fontWeight: 600,
                background: i === 1 ? 'var(--bg)' : 'transparent',
                color: i === 1 ? 'var(--text-strong)' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', gap: 4,
                boxShadow: i === 1 ? 'var(--sh-1)' : 'none',
                border: 'none', cursor: 'pointer', minHeight: 44,
              }}
            >
              {t}
              {i === 1 && <span className="tm-text-micro" style={{ color: 'var(--green500)', fontWeight: 700 }}>20% 할인</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Pricing cards — MoneyRow grammar per feature */}
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {M16_PRICING.map((p) => (
          <div key={p.tier} style={{
            padding: 20, borderRadius: 18,
            border: p.highlight ? '2px solid var(--blue500)' : '1px solid var(--grey200)',
            background: p.highlight ? 'var(--blue50)' : 'var(--bg)',
            position: 'relative',
          }}>
            {p.badge && (
              <div style={{ position: 'absolute', top: -10, right: 16 }}>
                <span className="tm-badge tm-badge-sm" style={{ background: 'var(--blue500)', color: 'var(--static-white)', height: 22, padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="star" size={10} aria-hidden="true"/>
                  {p.badge}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div className="tm-text-label" style={{ fontWeight: 700, color: p.highlight ? 'var(--blue600)' : 'var(--text-strong)' }}>{p.tierKo}</div>
                <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2 }}>{p.desc}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="tm-text-3xl tm-tabular" style={{ fontWeight: 800 }}>{p.price}</div>
                <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{p.period}</div>
              </div>
            </div>
            {/* Features via MoneyRow grammar */}
            <ul style={{ margin: '0 0 14px', padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
              {p.features.map((f) => (
                <li key={f} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                  <Icon name="check" size={15} color="var(--green500)" aria-hidden="true"/>
                  <span className="tm-text-caption" style={{ color: 'var(--text-strong)', lineHeight: 1.45 }}>{f}</span>
                </li>
              ))}
            </ul>
            <button
              className={`tm-btn tm-btn-${p.ctaVariant} tm-btn-md tm-btn-block`}
              style={{ minHeight: 44 }}
              aria-label={`${p.tierKo} 플랜 ${p.cta}`}
            >{p.cta}</button>
          </div>
        ))}
      </div>

      {/* FAQ teaser link */}
      <div style={{ padding: '20px 20px 24px', textAlign: 'center' }}>
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
          요금제 관련 궁금한 점이 있으신가요?{' '}
          <span role="button" tabIndex={0} style={{ color: 'var(--blue500)', fontWeight: 600, cursor: 'pointer' }} aria-label="FAQ 보기">FAQ 보기 →</span>
        </div>
      </div>

      <M16BrandFooter/>
    </div>
  </Phone>
);

/* ---------- m16-mb-flow-faq: FAQ accordion ---------- */
const M16MobileFlowFaq = () => {
  const openIdx = 0; // static open state for prototype

  return (
    <Phone>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <M16PublicHeader scrolled={true}/>

        <div style={{ padding: '24px 20px 16px' }}>
          <SectionTitle title="자주 묻는 질문" sub="궁금한 점을 해결해드려요"/>
        </div>

        {/* Search field */}
        <div style={{ padding: '0 20px 16px' }}>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex', alignItems: 'center' }} aria-hidden="true">
              <Icon name="search" size={16} color="var(--text-muted)"/>
            </div>
            <input
              className="tm-input"
              placeholder="질문 검색"
              aria-label="FAQ 검색"
              style={{ paddingLeft: 40, background: 'var(--grey50)' }}
            />
          </div>
        </div>

        {/* Category chips — HapticChip vocabulary */}
        <div role="group" aria-label="FAQ 카테고리" style={{ padding: '0 20px 16px', display: 'flex', gap: 6, overflowX: 'auto' }}>
          {['전체', '서비스', '결제', '팀', '매치', '계정'].map((c, i) => (
            <HapticChip key={c} active={i === 0}>{c}</HapticChip>
          ))}
        </div>

        {/* Accordion list */}
        <div role="list" style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {M16_FAQS.map((faq, idx) => (
            <div key={idx} role="listitem" style={{
              border: idx === openIdx ? '1px solid var(--blue200)' : '1px solid var(--grey200)',
              borderRadius: 14,
              background: idx === openIdx ? 'var(--blue50)' : 'var(--bg)',
              overflow: 'hidden',
            }}>
              <button
                aria-expanded={idx === openIdx}
                aria-controls={`m16-faq-answer-${idx}`}
                id={`m16-faq-btn-${idx}`}
                style={{
                  width: '100%', padding: '14px 16px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                  background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                  minHeight: 44,
                }}
              >
                <span className="tm-text-label" style={{ fontWeight: 600, flex: 1, lineHeight: 1.4 }}>{faq.q}</span>
                <Icon
                  name={idx === openIdx ? 'chevD' : 'chevR'}
                  size={16}
                  color={idx === openIdx ? 'var(--blue500)' : 'var(--grey400)'}
                  aria-hidden="true"
                />
              </button>
              {idx === openIdx && (
                <div id={`m16-faq-answer-${idx}`} role="region" aria-labelledby={`m16-faq-btn-${idx}`} style={{ padding: '0 16px 14px' }}>
                  <p className="tm-text-body" style={{ color: 'var(--text-muted)', lineHeight: 1.65, margin: 0 }}>{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Contact CTA */}
        <div style={{ padding: '20px 20px 24px' }}>
          <Card pad={16} style={{ textAlign: 'center' }}>
            <div className="tm-text-label" style={{ fontWeight: 700, marginBottom: 4 }}>원하는 답변을 찾지 못했나요?</div>
            <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginBottom: 12 }}>고객 지원팀이 도와드릴게요</div>
            <button className="tm-btn tm-btn-outline tm-btn-sm" style={{ minHeight: 44 }}>문의하기</button>
          </Card>
        </div>

        <M16BrandFooter/>
      </div>
    </Phone>
  );
};

/* ---------- m16-mb-flow-guide: 온보딩 guide step ---------- */
const M16MobileFlowGuide = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <M16PublicHeader scrolled={true}/>

      <div style={{ padding: '24px 20px 20px' }}>
        <SectionTitle title="시작 가이드" sub="4단계로 첫 매치를 완성하세요"/>
      </div>

      {/* Step progress indicator — color + number + label (not color-only) */}
      <div style={{ padding: '0 20px 20px', display: 'flex', alignItems: 'center' }}>
        {M16_GUIDE_STEPS.map((s, i) => (
          <div key={s.step} style={{ display: 'flex', alignItems: 'center', flex: i < 3 ? 1 : 'none' }}>
            <div
              style={{
                width: 28, height: 28, borderRadius: 14, flexShrink: 0,
                background: i === 0 ? 'var(--blue500)' : 'var(--grey200)',
                color: i === 0 ? 'var(--static-white)' : 'var(--grey500)',
                display: 'grid', placeItems: 'center', fontWeight: 700,
              }}
              aria-label={`${s.step}단계 ${s.title}${i === 0 ? ' (현재)' : ''}`}
            >
              <span className="tm-text-xs" style={{ fontWeight: 700 }}>{s.step}</span>
            </div>
            {i < 3 && <div style={{ flex: 1, height: 2, background: 'var(--grey200)', margin: '0 4px' }} aria-hidden="true"/>}
          </div>
        ))}
      </div>

      {/* Guide step rows — timeline connector */}
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 0 }}>
        {M16_GUIDE_STEPS.map((s, i) => (
          <M16GuideRow
            key={s.step}
            step={s.step}
            icon={s.icon}
            title={s.title}
            desc={s.desc}
            active={i === 0}
            last={i === M16_GUIDE_STEPS.length - 1}
          />
        ))}
      </div>

      {/* CTA */}
      <div style={{ padding: '20px 20px 24px', display: 'grid', gap: 8 }}>
        <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" style={{ minHeight: 44 }}>지금 바로 시작하기</button>
        <button className="tm-btn tm-btn-ghost tm-btn-md tm-btn-block" style={{ minHeight: 44 }}>앱 다운로드 (iOS / Android)</button>
      </div>

      <M16BrandFooter/>
    </div>
  </Phone>
);

/* ---------- m16-mb-state-loading: Skeleton over landing wireframe ---------- */
const M16MobileStateLoading = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'hidden' }}>
      <M16PublicHeader scrolled={false}/>

      {/* Hero skeleton */}
      <div style={{ padding: '32px 20px 24px', background: 'var(--grey50)' }}>
        <Skeleton w="40%" h={20} r={10} mb={12}/>
        <Skeleton w="80%" h={36} r={10} mb={8}/>
        <Skeleton w="60%" h={36} r={10} mb={16}/>
        <Skeleton w="90%" h={16} r={8} mb={6}/>
        <Skeleton w="70%" h={16} r={8} mb={24}/>
        <Skeleton h={52} r={12} mb={8}/>
        <Skeleton h={48} r={12}/>
      </div>

      {/* Stat strip skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid var(--grey100)' }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ padding: '16px 8px', textAlign: 'center', borderRight: '1px solid var(--grey100)' }}>
            <Skeleton w="60%" h={22} r={6} mb={6}/>
            <Skeleton w="70%" h={12} r={4}/>
          </div>
        ))}
      </div>

      {/* Content skeleton */}
      <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Skeleton h={68} r={14}/>
        <Skeleton h={68} r={14}/>
        <Skeleton h={68} r={14}/>
      </div>
    </div>
  </Phone>
);

/* ---------- m16-mb-state-empty: 검색 결과 없음 (EmptyState canonical) ---------- */
const M16MobileStateEmpty = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <M16PublicHeader scrolled={true}/>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <EmptyState
          icon={<Icon name="search" size={28} color="var(--grey400)"/>}
          title="검색 결과가 없어요"
          sub="다른 키워드로 검색하거나 전체 FAQ를 둘러보세요"
          cta="전체 FAQ 보기"
        />
        <div style={{ padding: '0 20px 24px' }}>
          <button className="tm-btn tm-btn-outline tm-btn-md tm-btn-block" style={{ minHeight: 44 }}>문의하기</button>
        </div>
      </div>
    </div>
  </Phone>
);

/* ---------- m16-mb-state-error: 공개 오류
   canonical: PublicStateEdgeBoard (service-error case preselected) ---------- */
const M16MobileStateError = () => (
  <div style={{ width: M16_MB_W, height: M16_MB_H, overflow: 'hidden' }}>
    <PublicStateEdgeBoard/>
  </div>
);

/* ---------- m16-mb-components: 컴포넌트 인벤토리 ---------- */
const M16MobileComponents = () => (
  <div style={{ width: M16_MB_W, height: M16_MB_H, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflow: 'hidden' }}>
    <Badge tone="blue" size="sm">m16-mb-components</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M16 모바일 · 사용 컴포넌트</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 6 }}>공개·마케팅 화면이 사용하는 primitives</div>
    <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>

      <M16ComponentSwatch label="HeroBanner · primary CTA block">
        <button className="tm-btn tm-btn-primary tm-btn-lg" style={{ minWidth: 140, minHeight: 44 }}>무료로 시작하기</button>
        <button className="tm-btn tm-btn-outline tm-btn-lg" style={{ minHeight: 44 }}>더 알아보기</button>
      </M16ComponentSwatch>

      <M16ComponentSwatch label="PricingTier · highlight (blue border + blue bg) — price via tm-text-3xl tabular">
        <div style={{ padding: '12px 16px', borderRadius: 14, border: '2px solid var(--blue500)', background: 'var(--blue50)', minWidth: 160 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="tm-text-label" style={{ color: 'var(--blue600)', fontWeight: 700 }}>Pro</span>
            <span className="tm-badge tm-badge-sm" style={{ background: 'var(--blue500)', color: 'var(--static-white)' }}>인기</span>
          </div>
          <div className="tm-text-3xl tm-tabular" style={{ fontWeight: 800, marginTop: 4 }}>9,900원</div>
        </div>
      </M16ComponentSwatch>

      <M16ComponentSwatch label="FAQAccordion · open (blue) / closed (grey) — aria-expanded">
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ padding: '10px 14px', border: '1px solid var(--blue200)', borderRadius: 12, background: 'var(--blue50)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="tm-text-caption" style={{ fontWeight: 600, color: 'var(--blue600)' }}>Q. 서비스가 무엇인가요?</span>
              <Icon name="chevD" size={14} color="var(--blue500)" aria-hidden="true"/>
            </div>
          </div>
          <div style={{ padding: '10px 14px', border: '1px solid var(--grey200)', borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="tm-text-caption" style={{ fontWeight: 600 }}>Q. 결제는 어떻게 하나요?</span>
              <Icon name="chevR" size={14} color="var(--grey400)" aria-hidden="true"/>
            </div>
          </div>
        </div>
      </M16ComponentSwatch>

      <M16ComponentSwatch label="GuideStep · numbered timeline connector · 44px touch target">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: 22, background: 'var(--blue500)', display: 'grid', placeItems: 'center', minHeight: 44 }}>
              <span className="tm-text-sm" style={{ fontWeight: 700, color: 'var(--static-white)' }}>1</span>
            </div>
            <div style={{ width: 2, height: 20, background: 'var(--grey200)', marginTop: 4 }} aria-hidden="true"/>
          </div>
          <div style={{ paddingTop: 6 }}>
            <div className="tm-text-label" style={{ fontWeight: 700 }}>가입하기</div>
            <div className="tm-text-micro" style={{ color: 'var(--text-muted)', marginTop: 2 }}>카카오·네이버·Apple로 3초</div>
          </div>
        </div>
      </M16ComponentSwatch>

      <M16ComponentSwatch label="SportChip · color dot + label (not color-only, WCAG)">
        {M16_SPORT_ITEMS.slice(0, 4).map((s) => (
          <M16SportChip key={s.id} {...s}/>
        ))}
      </M16ComponentSwatch>

      <M16ComponentSwatch label="StatNumber · NumberDisplay grammar · tabular blue">
        <div style={{ display: 'flex', gap: 16 }}>
          <NumberDisplay value="12,000+" unit="명" size={22} sub="활성 멤버"/>
          <NumberDisplay value="800+" unit="건" size={22} sub="월간 매치"/>
        </div>
      </M16ComponentSwatch>

      <M16ComponentSwatch label="BrandFooter · dark bg">
        <div style={{ padding: '10px 14px', background: 'var(--grey900)', borderRadius: 10, width: 240 }}>
          <div className="tm-text-micro" style={{ color: 'var(--grey400)' }}>© 2026 Teameet Inc.</div>
        </div>
      </M16ComponentSwatch>

      <M16ComponentSwatch label="PublicStateEdgeBoard · canonical (비로그인/비공개/오류)">
        <Badge tone="blue" size="sm">PublicStateEdgeBoard</Badge>
        <Badge tone="orange" size="sm">PublicLoggedOutLimitsBoard</Badge>
        <Badge tone="red" size="sm">PublicFaqPricingEdgeBoard</Badge>
      </M16ComponentSwatch>
    </div>
  </div>
);

/* ---------- m16-tb-components: 태블릿 컴포넌트 인벤토리 ---------- */
const M16TabletComponents = () => (
  <div style={{ width: M16_TB_W, height: M16_TB_H, background: 'var(--bg)', padding: 32, fontFamily: 'var(--font)', overflow: 'hidden' }}>
    <Badge tone="blue" size="sm">m16-tb-components</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M16 태블릿 · 사용 컴포넌트</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>768px 공개·마케팅 화면이 사용하는 primitives</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 16 }}>

      <M16ComponentSwatch label="Top nav · public (3 links + 2 CTAs · 44px)">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {['서비스 소개', '가이드', '가격'].map((t) => (
            <button key={t} className="tm-btn tm-btn-ghost tm-btn-sm" style={{ minHeight: 44 }}>{t}</button>
          ))}
          <button className="tm-btn tm-btn-outline tm-btn-sm" style={{ minHeight: 44 }}>로그인</button>
          <button className="tm-btn tm-btn-primary tm-btn-sm" style={{ minHeight: 44 }}>시작하기</button>
        </div>
      </M16ComponentSwatch>

      <M16ComponentSwatch label="FeatureCard · icon + title + desc (2-col grid)">
        <div style={{ padding: '14px 16px', border: '1px solid var(--grey200)', borderRadius: 14, display: 'flex', gap: 12, width: '100%' }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--blue50)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Icon name="people" size={20} color="var(--blue500)"/>
          </div>
          <div>
            <div className="tm-text-label" style={{ fontWeight: 700 }}>AI 매칭</div>
            <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2 }}>실력·위치·일정 최적 추천</div>
          </div>
        </div>
      </M16ComponentSwatch>

      <M16ComponentSwatch label="PricingTier grid · 3-col on tablet">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, width: '100%' }}>
          {[['무료', false], ['Pro', true], ['팀', false]].map(([t, hi]) => (
            <div key={t} style={{ padding: '10px 12px', border: hi ? '2px solid var(--blue500)' : '1px solid var(--grey200)', borderRadius: 12, background: hi ? 'var(--blue50)' : 'var(--bg)', textAlign: 'center' }}>
              <div className="tm-text-caption" style={{ fontWeight: 700, color: hi ? 'var(--blue600)' : 'var(--text-strong)' }}>{t}</div>
            </div>
          ))}
        </div>
      </M16ComponentSwatch>

      <M16ComponentSwatch label="StatRow · 3 KPIs inline (KPIStat grammar)">
        <div style={{ display: 'flex', gap: 24, padding: '12px 0' }}>
          <KPIStat label="멤버" value="12K+"/>
          <KPIStat label="매치" value="800+"/>
          <KPIStat label="종목" value="11"/>
        </div>
      </M16ComponentSwatch>

      <M16ComponentSwatch label="SportChip grid · all 6 sports · wrap">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {M16_SPORT_ITEMS.map((s) => <M16SportChip key={s.id} {...s}/>)}
        </div>
      </M16ComponentSwatch>

      <M16ComponentSwatch label="BrandFooter · dark surface">
        <div style={{ padding: '12px 16px', background: 'var(--grey900)', borderRadius: 10, width: '100%' }}>
          <div className="tm-text-caption" style={{ color: 'var(--grey400)' }}>© 2026 Teameet Inc.</div>
        </div>
      </M16ComponentSwatch>
    </div>
  </div>
);

/* ---------- m16-mb-assets: 디자인 토큰 발췌 ---------- */
const M16MobileAssets = () => (
  <div style={{ width: M16_MB_W, height: M16_MB_H, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflow: 'hidden' }}>
    <Badge tone="blue" size="sm">m16-mb-assets</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M16 모바일 · 토큰/에셋</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 6 }}>공개·마케팅 화면이 사용하는 디자인 토큰</div>
    <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>

      <M16AssetSwatch label="Color · brand hero gradient">
        <M16ColorSwatch token="blue500" value="var(--blue500)"/>
        <M16ColorSwatch token="blue700" value="var(--blue700)"/>
        <M16ColorSwatch token="blue50" value="var(--blue50)"/>
        <M16ColorSwatch token="blue100" value="var(--blue100)"/>
      </M16AssetSwatch>

      <M16AssetSwatch label="Color · sportCardAccent (M16 사용 6종)">
        {M16_SPORT_ITEMS.map((s) => (
          <M16ColorSwatch key={s.id} token={s.label} value={s.color}/>
        ))}
      </M16AssetSwatch>

      <M16AssetSwatch label="Color · neutral surface">
        <M16ColorSwatch token="grey50" value="var(--grey50)"/>
        <M16ColorSwatch token="grey100" value="var(--grey100)"/>
        <M16ColorSwatch token="grey200" value="var(--grey200)"/>
        <M16ColorSwatch token="grey900" value="var(--grey900)"/>
      </M16AssetSwatch>

      <M16AssetSwatch label="Color · semantic">
        <M16ColorSwatch token="green500" value="var(--green500)"/>
        <M16ColorSwatch token="red500" value="var(--red500)"/>
        <M16ColorSwatch token="orange500" value="var(--orange500)"/>
      </M16AssetSwatch>

      <M16AssetSwatch label="Type scale (tm-text-* tokens — no raw fontSize)">
        <span className="tm-text-4xl">4xl</span>
        <span className="tm-text-3xl">3xl</span>
        <span className="tm-text-2xl">2xl</span>
        <span className="tm-text-body-lg">body-lg</span>
        <span className="tm-text-body">body</span>
        <span className="tm-text-caption">caption</span>
        <span className="tm-text-micro">micro</span>
      </M16AssetSwatch>

      <M16AssetSwatch label="Spacing 4-multiple">
        {[8, 12, 16, 20, 24, 32, 40, 56].map((n) => (
          <Badge key={n} tone="grey" size="sm">{n}px</Badge>
        ))}
      </M16AssetSwatch>

      <M16AssetSwatch label="Icons · lucide (M16 용)">
        <span className="tm-text-caption">people, search, check, trophy, star, calendar, chat, shield, close, chevD, chevR, bell</span>
      </M16AssetSwatch>

      <M16AssetSwatch label="Motion tokens">
        <Badge tone="grey" size="sm">dur-fast 120ms</Badge>
        <Badge tone="grey" size="sm">dur-slow 280ms</Badge>
        <Badge tone="grey" size="sm">ease-out-quint</Badge>
        <Badge tone="grey" size="sm">scale(.98) tap</Badge>
      </M16AssetSwatch>
    </div>
  </div>
);

/* ---------- m16-mb-motion: 모션 계약 ---------- */
const M16MobileMotion = () => (
  <div style={{ width: M16_MB_W, height: M16_MB_H, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)' }}>
    <Badge tone="blue" size="sm">m16-mb-motion</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M16 모바일 · motion contract</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>공개·마케팅 화면이 사용하는 motion 토큰</div>
    <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
      {[
        { title: 'Hero enter',        sub: 'h1 + p → translateY 8px + opacity 0→1 · 280ms · ease-out-quint · stagger 80ms',  tag: 'enter' },
        { title: 'CTA tap',           sub: '모든 button → scale(.98) · 120ms · ease-out-quart · haptic feedback',             tag: 'tap' },
        { title: 'FAQ accordion',     sub: '펼치기 → max-height auto + opacity · 180ms · ease-out-quart · aria-expanded sync',tag: 'faq' },
        { title: 'Pricing scroll',    sub: '카드 scroll-enter → stagger 60ms + fade-in-up 200ms per card',                   tag: 'stagger' },
        { title: 'Stat counter',      sub: '숫자 enter → count-up 600ms tabular · 랜딩 뷰포트 진입 시 1회',                  tag: 'count' },
        { title: 'Skeleton shimmer',  sub: 'bg 200% shimmer gradient · 1.4s ease infinite · sk-shimmer keyframes',            tag: 'load' },
        { title: 'NavHeader scroll',  sub: 'scrollY > 40 → bg transparent→0.94 + blur 0→12px · 240ms transition-colors',      tag: 'nav' },
        { title: 'Reduced motion',    sub: 'prefers-reduced-motion → 모든 transition 0.01ms · count-up 즉시',                 tag: 'a11y' },
      ].map(({ title, sub, tag }) => (
        <div key={title} className="tm-list-row" style={{ padding: '10px 14px', background: 'var(--grey50)', borderRadius: 12, gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div className="tm-text-label" style={{ fontWeight: 600 }}>{title}</div>
            <div className="tm-text-micro" style={{ color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>{sub}</div>
          </div>
          <span className="tm-text-micro" style={{ color: 'var(--text-muted)', fontWeight: 500, flexShrink: 0, paddingTop: 2 }}>{tag}</span>
        </div>
      ))}
    </div>
  </div>
);

Object.assign(window, {
  M16MobileMain,
  M16TabletMain,
  M16DesktopMain,
  M16MobileDetail,
  M16MobileFlowPricing,
  M16MobileFlowFaq,
  M16MobileFlowGuide,
  M16MobileStateLoading,
  M16MobileStateEmpty,
  M16MobileStateError,
  M16MobileComponents,
  M16MobileAssets,
  M16TabletComponents,
  M16MobileMotion,
});
