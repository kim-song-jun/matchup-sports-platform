/* fix32 — M01 인증·온보딩 grid rewrite.
   Uses canonical Login, Onboarding, MiniAuthLayout, AuthStateEdgeBoard,
   AuthValidationAndPermissionBoard, AuthControlStatesBoard, AuthMotionContractBoard.
   ID schema: m01-{mb|tb|dt}-{main|state|components|assets|motion}[-{sub}]
   Light-only. All tokens via var(--*). No raw hex (except brand #FEE500/#03C75A/#191919). */

const M01_MB_W = 375;
const M01_MB_H = 812;
const M01_TB_W = 768;
const M01_TB_H = 1024;
const M01_DT_W = 1280;
const M01_DT_H = 820;

/* ---------- m01-mb-main: 모바일 로그인 → canonical Login component ---------- */
const M01MobileMain = () => (
  <div style={{ width: M01_MB_W, height: M01_MB_H, fontFamily: 'var(--font)', position: 'relative', overflow: 'hidden' }}>
    <Login />
  </div>
);

/* ---------- m01-tb-main: 태블릿 인증 → MiniAuthLayout tablet mode ---------- */
const M01TabletMain = () => (
  <div style={{
    width: M01_TB_W,
    height: M01_TB_H,
    background: 'var(--bg)',
    fontFamily: 'var(--font)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
    gap: 32,
  }}>
    <Badge tone="blue" size="sm">m01-tb-main · 태블릿</Badge>
    <MiniAuthLayout mode="tablet" />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, width: 480, marginTop: 16 }}>
      {[
        ['Mobile', '단일 열 · 44px 터치 타겟'],
        ['Tablet', '좌측 가치 · 우측 입력'],
        ['Desktop', '중앙 max-width · split panel'],
      ].map(([title, sub]) => (
        <Card key={title} pad={12}>
          <div className="tm-text-label" style={{ fontWeight: 700 }}>{title}</div>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>{sub}</div>
        </Card>
      ))}
    </div>
  </div>
);

/* ---------- m01-dt-main: 데스크탑 split → MiniAuthLayout desktop mode ---------- */
const M01DesktopMain = () => (
  <div style={{
    width: M01_DT_W,
    height: M01_DT_H,
    background: 'var(--bg)',
    fontFamily: 'var(--font)',
    display: 'grid',
    gridTemplateColumns: '1fr 560px',
  }}>
    {/* Left: hero panel */}
    <div style={{
      background: 'linear-gradient(160deg, var(--blue500) 0%, var(--blue700) 100%)',
      padding: 64,
      color: 'var(--static-white)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}>
      <div className="tm-text-heading" style={{ color: 'var(--static-white)', fontWeight: 800 }}>Teameet</div>
      <div>
        <div className="tm-text-4xl" style={{ color: 'var(--static-white)', fontWeight: 800, lineHeight: 1.2, marginBottom: 16 }}>
          스포츠로 만나는<br />새로운 친구
        </div>
        <div className="tm-text-base" style={{ color: 'rgba(255,255,255,0.8)' }}>
          풋살, 농구, 아이스하키, 배드민턴 — 11개 종목
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {['12,000+ 멤버', '월 800+ 매치', '11종목'].map((t) => (
          <div key={t} className="tm-text-label" style={{
            background: 'rgba(255,255,255,0.16)',
            color: 'var(--static-white)',
            padding: '8px 12px',
            borderRadius: 'var(--r-pill)',
          }}>{t}</div>
        ))}
      </div>
    </div>

    {/* Right: auth panel — MiniAuthLayout desktop */}
    <div style={{
      padding: 64,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      justifyContent: 'center',
      gap: 32,
    }}>
      <div>
        <Badge tone="blue" size="sm">m01-dt-main · 데스크탑</Badge>
        <div className="tm-text-heading" style={{ marginTop: 16, marginBottom: 8, fontWeight: 800 }}>로그인</div>
        <div className="tm-text-base" style={{ color: 'var(--text-muted)' }}>3초만에 시작해요</div>
      </div>
      <MiniAuthLayout mode="desktop" />
      <div className="tm-text-caption" style={{ color: 'var(--text-muted)', textAlign: 'center', width: '100%' }}>
        회원가입 시{' '}
        <span style={{ color: 'var(--blue500)', textDecoration: 'underline' }}>이용약관</span>
        {' · '}
        <span style={{ color: 'var(--blue500)', textDecoration: 'underline' }}>개인정보처리방침</span>
        {' '}동의
      </div>
    </div>
  </div>
);

/* ---------- m01-mb-state-loading: OAuth callback 로딩 상태
   Login wireframe 위에 loading state 오버레이 — AuthStateEdgeBoard 'loading' 케이스 ---------- */
const M01MobileStateLoading = () => (
  <div style={{ width: M01_MB_W, height: M01_MB_H, fontFamily: 'var(--font)', position: 'relative', overflow: 'hidden' }}>
    <Phone>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--grey50)' }}>
        {/* Header bar (mirrors Login wireframe header) */}
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="blue" size="sm">LOADING</Badge>
          <div className="tm-text-2xl" style={{ fontWeight: 700, marginTop: 8 }}>계정 정보를 확인하고 있어요</div>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>
            카카오에서 돌아오는 중입니다. 3초 이상 지연되면 취소할 수 있어야 합니다.
          </div>
        </div>

        {/* Skeleton body — canonical Login layout replaced with skeletons */}
        <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Logo skeleton */}
          <Skeleton w={72} h={72} r={20} />
          {/* Headline skeleton */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton w="80%" h={28} r={6} />
            <Skeleton w="55%" h={20} r={6} />
          </div>
          {/* Input skeleton (닉네임 필드) */}
          <Skeleton w="100%" h={52} r={12} />
          {/* CTA button skeleton */}
          <Skeleton w="100%" h={52} r={12} />
          {/* Divider + social buttons skeleton */}
          <div style={{ display: 'flex', gap: 10 }}>
            <Skeleton w="33%" h={44} r={12} />
            <Skeleton w="33%" h={44} r={12} />
            <Skeleton w="33%" h={44} r={12} />
          </div>
        </div>

        {/* Recovery CTA area */}
        <div style={{ padding: '12px 20px 32px', borderTop: '1px solid var(--grey100)', background: 'var(--bg)' }}>
          <button
            className="tm-btn tm-btn-lg tm-btn-block"
            style={{
              background: 'var(--grey100)',
              color: 'var(--text-muted)',
              minHeight: 44,
              borderRadius: 'var(--r-md)',
              cursor: 'not-allowed',
            }}
            disabled
            aria-label="카카오 인증 확인 중"
          >
            잠시만 기다려주세요
          </button>
        </div>
      </div>
    </Phone>
  </div>
);

/* ---------- m01-mb-state-error: OAuth 인증 실패
   Login wireframe + error card — AuthStateEdgeBoard 'network' 케이스 ---------- */
const M01MobileStateError = () => (
  <div style={{ width: M01_MB_W, height: M01_MB_H, fontFamily: 'var(--font)', position: 'relative', overflow: 'hidden' }}>
    <Phone>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--grey50)' }}>
        {/* Header */}
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="red" size="sm">NETWORK_ERROR</Badge>
          <div className="tm-text-2xl" style={{ fontWeight: 700, marginTop: 8 }}>네트워크가 불안정해요</div>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>
            입력한 닉네임과 선택한 종목은 보존됩니다. 연결 후 다시 시도하세요.
          </div>
        </div>

        {/* Error card (canonical auth error pattern) */}
        <div style={{ flex: 1, padding: 20, display: 'flex', alignItems: 'center' }}>
          <div style={{
            width: '100%',
            padding: 22,
            borderRadius: 20,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
          }}>
            {/* Status row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <Badge tone="red">NETWORK_ERROR</Badge>
              <Icon name="close" size={20} color="var(--red500)" />
            </div>
            {/* Error message */}
            <div className="tm-text-2xl" style={{ fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.25, marginTop: 20 }}>
              인증 서버에 연결할 수 없어요
            </div>
            <div className="tm-text-sm" style={{ color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 10 }}>
              잠시 후 다시 시도해주세요. 입력한 내용은 그대로 유지됩니다.
            </div>
            {/* Recovery context box */}
            <div style={{
              marginTop: 22,
              padding: 14,
              borderRadius: 14,
              background: 'var(--red50)',
            }}>
              <div className="tm-text-xs" style={{ fontWeight: 700, color: 'var(--red500)' }}>복구 원칙</div>
              <div className="tm-text-xs" style={{ color: 'var(--text)', lineHeight: 1.45, marginTop: 4 }}>
                입력/선택값을 잃지 않고 이전 단계로 돌아갈 수 있어야 합니다.
              </div>
            </div>
            {/* CTAs */}
            <div style={{ display: 'grid', gap: 8, marginTop: 20 }}>
              <button
                className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block"
                style={{ minHeight: 44 }}
                aria-label="로그인 다시 시도"
              >
                다시 시도
              </button>
              <button
                className="tm-btn tm-btn-ghost tm-btn-md tm-btn-block"
                style={{ minHeight: 44 }}
                aria-label="다른 방법으로 로그인"
              >
                다른 방법으로 로그인
              </button>
            </div>
          </div>
        </div>
      </div>
    </Phone>
  </div>
);

/* ---------- m01-mb-state-permission: OS 권한 거부 / 온보딩 검증
   Canonical AuthValidationAndPermissionBoard ---------- */
const M01MobileStatePermission = () => (
  <div style={{ width: M01_MB_W, height: M01_MB_H, fontFamily: 'var(--font)', position: 'relative', overflow: 'hidden' }}>
    <AuthValidationAndPermissionBoard />
  </div>
);

/* ---------- m01-mb-components: 버튼·입력 상태 인벤토리
   Canonical AuthControlStatesBoard ---------- */
const M01ComponentsBoard = ({ viewport }) => {
  const w = viewport === 'mb' ? M01_MB_W : viewport === 'tb' ? M01_TB_W : M01_DT_W;
  const h = viewport === 'mb' ? M01_MB_H : viewport === 'tb' ? M01_TB_H : M01_DT_H;
  return (
    <div style={{ width: w, height: h, fontFamily: 'var(--font)', position: 'relative', overflow: 'hidden' }}>
      <AuthControlStatesBoard />
    </div>
  );
};

/* ---------- m01-assets: 사용 토큰 인벤토리 ---------- */
const M01AssetRow = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <div className="tm-text-micro" style={{ color: 'var(--text-muted)', fontWeight: 700 }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</div>
  </div>
);

const M01TokenChip = ({ token, bg, text }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
    <div style={{
      width: 40,
      height: 40,
      borderRadius: 'var(--r-md)',
      background: bg,
      border: '1px solid var(--grey150)',
    }} />
    <div className="tm-text-micro" style={{ color: 'var(--text-muted)', textAlign: 'center', maxWidth: 60 }}>{token}</div>
  </div>
);

const M01AssetsBoard = ({ viewport }) => {
  const w = viewport === 'mb' ? M01_MB_W : viewport === 'tb' ? M01_TB_W : M01_DT_W;
  const h = viewport === 'mb' ? M01_MB_H : viewport === 'tb' ? M01_TB_H : M01_DT_H;
  return (
    <div style={{ width: w, height: h, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflow: 'hidden' }}>
      <Badge tone="blue" size="sm">{`m01-${viewport}-assets`}</Badge>
      <div className="tm-text-xl" style={{ marginTop: 8, fontWeight: 700 }}>
        M01 {viewport === 'mb' ? '모바일' : viewport === 'tb' ? '태블릿' : '데스크탑'} · 사용 토큰/에셋
      </div>
      <div className="tm-text-sm" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
        인증·온보딩 화면이 사용하는 디자인 토큰 인벤토리
      </div>

      <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
        {/* Brand colors */}
        <M01AssetRow label="Color · brand (blue)">
          <M01TokenChip token="blue500" bg="var(--blue500)" />
          <M01TokenChip token="blue700" bg="var(--blue700)" />
          <M01TokenChip token="blue50" bg="var(--blue50)" />
        </M01AssetRow>

        {/* Neutral */}
        <M01AssetRow label="Color · neutral">
          <M01TokenChip token="grey50" bg="var(--grey50)" />
          <M01TokenChip token="grey100" bg="var(--grey100)" />
          <M01TokenChip token="grey150" bg="var(--grey150)" />
          <M01TokenChip token="grey200" bg="var(--grey200)" />
          <M01TokenChip token="grey900" bg="var(--grey900)" />
        </M01AssetRow>

        {/* Semantic */}
        <M01AssetRow label="Color · semantic">
          <M01TokenChip token="green500" bg="var(--green500)" />
          <M01TokenChip token="red500" bg="var(--red500)" />
          <M01TokenChip token="red50" bg="var(--red50)" />
          <M01TokenChip token="orange500" bg="var(--orange500)" />
          <M01TokenChip token="orange50" bg="var(--orange50)" />
        </M01AssetRow>

        {/* Social brand — raw exception */}
        <M01AssetRow label="Color · social brand (raw hex — exception)">
          <M01TokenChip token="kakao #FEE500" bg="#FEE500" />
          <M01TokenChip token="naver #03C75A" bg="#03C75A" />
          <M01TokenChip token="apple #191919" bg="#191919" />
        </M01AssetRow>

        {/* Typography */}
        <M01AssetRow label="Type scale (M01 사용)">
          <span className="tm-text-2xl" style={{ fontWeight: 800 }}>2xl 헤드라인</span>
          <span className="tm-text-xl" style={{ fontWeight: 700 }}>xl 부제목</span>
          <span className="tm-text-base">base 본문</span>
          <span className="tm-text-sm" style={{ color: 'var(--text-muted)' }}>sm 설명</span>
          <span className="tm-text-xs" style={{ color: 'var(--text-caption)' }}>xs 캡션</span>
          <span className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>micro 약관</span>
        </M01AssetRow>

        {/* Radius */}
        <M01AssetRow label="Radius">
          {[
            ['r-sm', 'var(--r-sm)'],
            ['r-md', 'var(--r-md)'],
            ['r-lg', 'var(--r-lg)'],
            ['r-pill', 'var(--r-pill)'],
          ].map(([token, val]) => (
            <div key={token} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 36, height: 36, background: 'var(--blue500)', borderRadius: val }} />
              <span className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{token}</span>
            </div>
          ))}
        </M01AssetRow>

        {/* Touch targets */}
        <M01AssetRow label="Control min-height (touch targets ≥ 44px)">
          {['44px icon', '48px md', '52px input', '56px lg'].map((t) => (
            <Badge key={t} tone="grey" size="sm">{t}</Badge>
          ))}
        </M01AssetRow>
      </div>
    </div>
  );
};

/* ---------- m01-motion: 인증 플로우 모션 계약
   Canonical AuthMotionContractBoard (840×812) ---------- */
const M01MotionBoard = () => (
  <div style={{ width: 840, height: M01_MB_H, fontFamily: 'var(--font)', position: 'relative', overflow: 'hidden' }}>
    <AuthMotionContractBoard />
  </div>
);

Object.assign(window, {
  M01MobileMain,
  M01TabletMain,
  M01DesktopMain,
  M01MobileStateLoading,
  M01MobileStateError,
  M01MobileStatePermission,
  M01ComponentsBoard,
  M01AssetsBoard,
  M01MotionBoard,
  // Shared swatch helpers — first-defined wins (M01 only). Other modules reference globally.
  ComponentSwatch: ({ label, children }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 12, background: 'var(--grey50)', border: '1px solid var(--grey100)' }}>
      <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</div>
    </div>
  ),
  AssetSwatch: ({ label, children }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>{children}</div>
    </div>
  ),
  ColorSwatch: ({ token, value }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: value, border: '1px solid var(--grey100)' }} />
      <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{token}</div>
    </div>
  ),
});
