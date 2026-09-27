/* Teameet page-readiness boards.
   These boards track missing prototype coverage and add page-by-page UI for
   states, edge cases, interaction states, responsive layouts, and copy fit. */

const PAGE_READINESS_ROWS = [
  ['01 인증·온보딩', '완료', '상태/엣지/버튼/모션/반응형/문구 맞춤 보강', 'fix13'],
  ['02 홈·추천', '완료', '추천 실패, stale 추천, offline, FAB, tablet/desktop 문구 맞춤 보강', 'fix14'],
  ['03 개인 매치', '완료', '정원 race, sold out, 결제 실패, 지도 권한, responsive split 보강', 'fix15'],
  ['04 팀·팀매칭', '완료', '역할 권한, 출석/스코어 conflict, 승인/거절 state 보강', 'fix16'],
  ['05 레슨 Academy', '완료', '아카데미 IA, 수강권 만료/잔여 0회, 휴강/대기, 예약/구매 컨트롤 보강', 'fix17'],
  ['06 장터 Marketplace', '완료', '판매완료/예약중, 사진 업로드 실패, 가격 race, 주문/분쟁/안전거래 보강', 'fix18'],
  ['07 시설 Venues', '완료', '예약 충돌, 휴관, 위치 권한, slot disabled, map/list split 보강', 'fix19'],
  ['08 용병 Mercenary', '완료', '포지션 충원, 보상 변경, 호스트 신뢰, 지원 취소/확정 상태 보강', 'fix20'],
  ['09~18 나머지 모듈', '완료', '대회, 장비, 종목, 커뮤니티, 마이, 결제, 설정, 공개, 데스크탑, Admin 예외 보강', 'fix21'],
  ['19 공통 플로우', '부분', 'atlas는 있으나 각 페이지 적용 검수는 순차 진행 필요', '계속'],
];

const READINESS_DIMENSIONS = [
  ['State UI', 'empty/loading/error/success/disabled/pending/deadline/sold out/permission이 실제 화면으로 있는가'],
  ['Edge UI', 'race, 권한 충돌, 네트워크 실패, 데이터 누락이 happy path와 별도 UI로 보이는가'],
  ['Controls', 'button/input/chip/sheet의 default/hover/focus/active/loading/disabled/error 상태가 있는가'],
  ['Motion', 'trigger -> feedback -> final state, reduced motion 대안이 있는가'],
  ['Responsive', 'mobile/tablet/desktop이 같은 IA로 재배치되는가'],
  ['Light theme', '흰 배경 기준으로 surface, border, blue action이 일관적인가'],
  ['Copy Fit', '긴 한글, 긴 숫자, 줄바꿈, CTA 문구가 컨테이너 안에 맞는가'],
];

const ReadinessButtonClass = ({ size = 'md', variant = 'primary', block = false } = {}) => (
  ['tm-btn', `tm-btn-${size}`, `tm-btn-${variant}`, block && 'tm-btn-block'].filter(Boolean).join(' ')
);

const ReadinessToneButtonVariant = (tone) => (
  tone === 'red' ? 'danger' : 'primary'
);

const ReadinessAuditDashboard = () => (
  <div style={{ width: 1280, height: 820, background: 'var(--bg)', fontFamily: 'var(--font)', color: 'var(--text-strong)', padding: 28, overflow: 'hidden' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
      <div>
          <Badge tone="orange">PAGE READINESS AUDIT</Badge>
          <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>아직 준비 안 된 범주</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.55 }}>
          fix23은 01~18 전체 기능 모듈을 light-only 기준으로 정리하고, 반응형 재배치와 긴 한글 문구 맞춤을 검수 기준으로 유지합니다.
          </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 120px)', gap: 10 }}>
        <KPIStat label="검수 범주" value={READINESS_DIMENSIONS.length}/>
        <KPIStat label="완료 모듈" value="18"/>
        <KPIStat label="미완료군" value="0"/>
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 18, marginTop: 24 }}>
      <Card pad={18}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>품질 게이트</div>
        <div style={{ display: 'grid', gap: 9 }}>
          {READINESS_DIMENSIONS.map(([title, sub], i) => (
            <div key={title} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 10, borderRadius: 12, background: i === 0 ? 'var(--blue50)' : 'var(--grey50)' }}>
              <div className="tab-num" style={{ width: 26, height: 26, borderRadius: 9, display: 'grid', placeItems: 'center', background: i === 0 ? 'var(--blue500)' : 'var(--grey100)', color: i === 0 ? 'var(--static-white)' : 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>{i + 1}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 2 }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card pad={0} style={{ overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 88px 1fr 72px', background: 'var(--grey50)', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
          {['페이지군', '상태', '부족한 것', '순서'].map((h) => <div key={h} style={{ padding: '12px 14px' }}>{h}</div>)}
        </div>
        {PAGE_READINESS_ROWS.map(([page, state, gap, order], i) => (
          <div key={page} style={{ display: 'grid', gridTemplateColumns: '160px 88px 1fr 72px', borderBottom: '1px solid var(--grey100)', alignItems: 'center' }}>
            <div style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700 }}>{page}</div>
            <div style={{ padding: '12px 14px' }}><Badge tone={state === '완료' ? 'blue' : state === '부분' ? 'orange' : 'red'} size="sm">{state}</Badge></div>
            <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text)', lineHeight: 1.45 }}>{gap}</div>
            <div style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, color: i <= 8 ? 'var(--blue500)' : 'var(--text-muted)' }}>{order}</div>
          </div>
        ))}
      </Card>
    </div>
  </div>
);

const AuthStateEdgeBoard = () => {
  const cases = [
    { id: 'loading', tone: 'blue', title: '계정 정보를 확인하고 있어요', sub: '카카오에서 돌아오는 중입니다. 3초 이상 지연되면 취소할 수 있어야 합니다.', cta: '로그인 취소', badge: 'LOADING' },
    { id: 'denied', tone: 'red', title: '권한 동의가 취소됐어요', sub: '필수 정보 제공에 동의해야 Teameet 계정을 만들 수 있어요.', cta: '다시 로그인', badge: 'PROVIDER_DENIED' },
    { id: 'network', tone: 'red', title: '네트워크가 불안정해요', sub: '입력한 닉네임과 선택한 종목은 보존됩니다. 연결 후 다시 시도하세요.', cta: '재시도', badge: 'NETWORK_ERROR' },
    { id: 'duplicate', tone: 'orange', title: '이미 연결된 계정이에요', sub: '네이버로 가입한 계정이 있어요. 기존 계정으로 이어서 로그인할 수 있습니다.', cta: '기존 계정으로 계속', badge: 'ACCOUNT_CONFLICT' },
    { id: 'missing', tone: 'orange', title: '이메일을 받을 수 없어요', sub: 'provider가 이메일을 제공하지 않았습니다. 연락 가능한 이메일을 직접 입력하세요.', cta: '이메일 입력', badge: 'MISSING_EMAIL' },
    { id: 'age', tone: 'red', title: '가입할 수 없는 계정이에요', sub: '서비스 이용 가능 연령 또는 필수 약관 조건을 충족하지 않았습니다.', cta: '고객센터 보기', badge: 'BLOCKED' },
  ];
  const [active, setActive] = React.useState('loading');
  const current = cases.find((item) => item.id === active) || cases[0];
  return (
    <Phone>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--grey50)' }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="blue" size="sm">AUTH STATES</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>OAuth 예외 상태</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>callback 화면은 로고보다 상태와 복구 CTA가 먼저 보여야 합니다.</div>
        </div>
        <div style={{ padding: '12px 20px 0', display: 'flex', gap: 8, overflowX: 'auto' }}>
          {cases.map((item) => <HapticChip key={item.id} active={active === item.id} onClick={() => setActive(item.id)}>{item.id}</HapticChip>)}
        </div>
        <div style={{ flex: 1, padding: 20, display: 'flex', alignItems: 'center' }}>
          <div style={{ width: '100%', padding: 22, borderRadius: 20, background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <Badge tone={current.tone}>{current.badge}</Badge>
              {current.id === 'loading' ? <Skeleton w={58} h={20} r={999}/> : <Icon name={current.tone === 'red' ? 'close' : current.tone === 'orange' ? 'clock' : 'check'} size={20} color={current.tone === 'red' ? 'var(--red500)' : current.tone === 'orange' ? 'var(--orange500)' : 'var(--blue500)'}/>}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.25, marginTop: 20 }}>{current.title}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 10 }}>{current.sub}</div>
            <div style={{ marginTop: 22, padding: 14, borderRadius: 14, background: current.tone === 'red' ? 'var(--red50)' : current.tone === 'orange' ? 'var(--orange50)' : 'var(--blue50)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: current.tone === 'red' ? 'var(--red500)' : current.tone === 'orange' ? 'var(--orange500)' : 'var(--blue500)' }}>복구 원칙</div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.45, marginTop: 4 }}>입력/선택값을 잃지 않고 이전 단계로 돌아갈 수 있어야 합니다.</div>
            </div>
            <button className={ReadinessButtonClass({ size: 'lg', variant: ReadinessToneButtonVariant(current.tone), block: true })} style={{ marginTop: 20 }}>{current.cta}</button>
            {current.id === 'loading' && <div style={{ marginTop: 12 }}><Skeleton h={12} w="72%" r={6}/></div>}
          </div>
        </div>
      </div>
    </Phone>
  );
};

const AuthValidationAndPermissionBoard = () => (
  <Phone>
    <div style={{ flex: 1, background: 'var(--bg)', overflow: 'auto', paddingBottom: 24 }}>
      <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--grey100)' }}>
        <Badge tone="orange" size="sm">VALIDATION</Badge>
        <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>필수 입력과 권한 거부</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>disabled CTA는 이유와 해결 방법이 같이 보여야 합니다.</div>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
          {[1, 2, 3].map((step) => <div key={step} style={{ flex: 1, height: 5, borderRadius: 999, background: step <= 2 ? 'var(--blue500)' : 'var(--grey150)' }}/>)}
        </div>
        <div style={{ fontSize: 12, color: 'var(--blue500)', fontWeight: 700 }}>STEP 2 / 3</div>
        <div style={{ fontSize: 25, fontWeight: 700, lineHeight: 1.25, marginTop: 8 }}>축구 실력을<br/>선택해주세요</div>

        <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
          {[
            ['입문', '공차본 적 있어요', false],
            ['초급', '동호회 1년 미만', false],
            ['중급', '동호회 1~3년', false],
          ].map(([title, sub]) => (
            <button key={title} className="tm-pressable" style={{ minHeight: 58, borderRadius: 14, background: 'var(--grey50)', border: '1px solid var(--border)', padding: '12px 14px', textAlign: 'left' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>
            </button>
          ))}
        </div>

        <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: 'var(--red50)', border: '1px solid var(--red-alpha-08)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red500)' }}>필수 선택이 필요해요</div>
          <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.45, marginTop: 4 }}>실력을 선택해야 비슷한 사람들과 매칭할 수 있습니다.</div>
        </div>

        <div style={{ marginTop: 18, padding: 14, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--orange50)', color: 'var(--orange500)', display: 'grid', placeItems: 'center' }}><Icon name="pin" size={18}/></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>위치 권한이 꺼져 있어요</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 4 }}>현재 위치 대신 지역을 직접 선택하면 같은 추천 흐름을 이어갈 수 있습니다.</div>
              <button className={ReadinessButtonClass({ size: 'sm', variant: 'primary' })} style={{ marginTop: 10, minHeight: 34 }}>지역 직접 선택</button>
            </div>
          </div>
        </div>

        <button disabled className={ReadinessButtonClass({ size: 'lg', variant: 'primary', block: true })} style={{ marginTop: 18 }}>다음</button>
      </div>
    </div>
  </Phone>
);

const AuthControlStatesBoard = () => {
  const controls = [
    ['Default', '카카오로 계속하기', 'primary', '기본 CTA'],
    ['Pressed', '눌리는 중', 'primary', 'active class'],
    ['Loading', '계정 확인 중', 'primary', 'spinner/skeleton'],
    ['Disabled', '필수 선택 후 가능', 'primary', '이유 표시'],
    ['Error', '다시 시도', 'danger', '복구 CTA'],
    ['Secondary', '프로필 더 채우기', 'neutral', '보조 액션'],
  ];
  return (
    <Phone>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 24, background: 'var(--grey50)' }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="blue" size="sm">CONTROL STATES</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>버튼 · 입력 상태</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>모든 버튼은 44px 이상, focus/active/loading/disabled/error 상태를 가져야 합니다.</div>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            {controls.map(([state, label, variant, note]) => (
              <div key={state} style={{ padding: 12, borderRadius: 14, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Badge tone={state === 'Error' ? 'red' : state === 'Disabled' ? 'grey' : 'blue'} size="sm">{state}</Badge>
                  <span style={{ fontSize: 11, color: 'var(--text-caption)' }}>{note}</span>
                </div>
                <button disabled={state === 'Disabled'} className={ReadinessButtonClass({ size: 'md', variant, block: true })}>
                  {state === 'Loading' ? '●  ' : ''}{label}
                </button>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 18, padding: 14, borderRadius: 16, background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>입력 필드</div>
            {[
              ['Focus', '정민', 'var(--blue500)', '사용 가능한 닉네임이에요'],
              ['Error', '정민정민정민정민정민정민', 'var(--red500)', '닉네임은 12자 이하로 입력해주세요'],
            ].map(([state, value, border, msg]) => (
              <div key={state} style={{ marginBottom: 12 }}>
                <div style={{ height: 50, borderRadius: 12, border: `1px solid ${border}`, background: 'var(--grey50)', display: 'flex', alignItems: 'center', padding: '0 14px', minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: 'var(--text-strong)', overflowWrap: 'anywhere', lineHeight: 1.35 }}>{value}</div>
                </div>
                <div style={{ fontSize: 11, color: border === 'var(--red500)' ? 'var(--red500)' : 'var(--blue500)', marginTop: 5, fontWeight: 600 }}>{msg}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Phone>
  );
};

const AuthMotionContractBoard = () => (
  <div style={{ width: 840, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">AUTH MOTION</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>인증 플로우 모션 계약</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8 }}>장식 애니메이션이 아니라 상태 이해를 돕는 전이만 사용합니다.</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
      {[
        ['Provider tap', 'button scale 0.98 / 120ms', 'loading row로 치환', '중복 submit 차단'],
        ['Callback loading', 'skeleton shimmer / 1.4s', 'success 또는 error card', '3초 이후 취소 CTA'],
        ['Step next', 'content fade+slide / 220ms', 'progress bar advance', '이전 선택값 유지'],
        ['Validation error', 'color transition / 160ms', 'inline error reveal', 'focus는 필드로 이동'],
        ['Location sheet', 'scrim fade + sheet rise / 240ms', 'manual region select', '닫으면 이전 단계 유지'],
        ['Welcome complete', 'check pulse / 260ms', 'home push transition', 'reduced motion은 fade만'],
      ].map(([trigger, feedback, final, guard], i) => (
        <Card key={trigger} pad={16} style={{ minHeight: 122, background: i % 2 ? 'var(--bg)' : 'var(--grey50)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="tab-num" style={{ width: 32, height: 32, borderRadius: 12, background: i === 0 ? 'var(--blue500)' : 'var(--grey100)', color: i === 0 ? 'var(--static-white)' : 'var(--text-muted)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{i + 1}</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{trigger}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
            {[feedback, final, guard].map((txt, j) => <div key={txt} style={{ padding: 10, borderRadius: 10, background: j === 0 ? 'var(--blue50)' : 'var(--bg)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text)', lineHeight: 1.35 }}>{txt}</div>)}
          </div>
        </Card>
      ))}
    </div>
    <div style={{ marginTop: 18, padding: 16, borderRadius: 16, background: 'var(--orange50)', color: 'var(--text)' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--orange500)' }}>Reduced motion</div>
      <div style={{ fontSize: 12, lineHeight: 1.55, marginTop: 5 }}>prefers-reduced-motion에서는 scale, slide, shimmer를 최소화하고 opacity 전환 또는 즉시 상태 전환으로 대체합니다.</div>
    </div>
  </div>
);

const MiniAuthLayout = ({ mode, dark }) => {
  const palette = dark
    ? { bg: '#0f1318', panel: '#181d24', border: '#303742', text: 'var(--grey100)', muted: 'var(--grey500)', weak: '#242a33' }
    : { bg: 'var(--static-white)', panel: 'var(--static-white)', border: 'var(--grey200)', text: 'var(--grey900)', muted: 'var(--grey600)', weak: 'var(--grey100)' };
  const isMobile = mode === 'mobile';
  const isTablet = mode === 'tablet';
  return (
    <div style={{ width: isMobile ? 220 : isTablet ? 300 : 430, height: isMobile ? 430 : 360, borderRadius: isMobile ? 30 : 18, background: palette.bg, border: `1px solid ${palette.border}`, padding: isMobile ? 18 : 22, color: palette.text, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 18 }}>
      <div style={{ flex: isMobile ? 'none' : 1, minWidth: 0 }}>
        <div style={{ width: 46, height: 46, borderRadius: 15, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 24 }}>T</div>
        <div style={{ fontSize: isMobile ? 22 : 25, fontWeight: 700, lineHeight: 1.22, marginTop: 18 }}>
          {mode === 'desktop' ? '같이 뛸 사람을 빠르게 찾아요' : <>같이 뛸 사람을<br/>찾아요</>}
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.45, color: palette.muted, marginTop: 8 }}>로그인 후 관심 종목과 지역을 이어서 설정합니다.</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ height: 46, borderRadius: 12, background: palette.weak, border: `1px solid ${palette.border}`, marginBottom: 10, display: 'flex', alignItems: 'center', padding: '0 12px', color: palette.muted, fontSize: 12 }}>닉네임</div>
        <div style={{ height: 46, borderRadius: 12, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700 }}>시작하기</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8, marginTop: 10 }}>
          <div style={{ height: 38, borderRadius: 11, background: dark ? '#2a2412' : '#FEE500', color: dark ? '#f9fafb' : '#000', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>카카오</div>
          <div style={{ height: 38, borderRadius: 11, background: 'var(--green500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>네이버</div>
        </div>
      </div>
    </div>
  );
};

const AuthResponsiveBoard = () => (
  <div style={{ width: 1280, height: 820, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">RESPONSIVE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>인증 · 반응형 재배치</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>같은 IA를 유지하되 모바일은 단일 열, 태블릿은 compact two-column, 데스크탑은 split onboarding panel로 확장합니다.</div>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginTop: 26 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Mobile 375</div>
        <MiniAuthLayout mode="mobile"/>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Tablet 768</div>
        <MiniAuthLayout mode="tablet"/>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Desktop 1280</div>
        <MiniAuthLayout mode="desktop"/>
      </div>
    </div>
    <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {[
        ['Mobile', 'bottom CTA, full-width controls, 44px touch targets'],
        ['Tablet', '좌측 가치/우측 입력, 터치와 포인터 모두 허용'],
        ['Desktop', '중앙 max width, split panel, keyboard focus order 유지'],
      ].map(([title, sub]) => (
        <Card key={title} pad={16}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{sub}</div>
        </Card>
      ))}
    </div>
  </div>
);

const AuthDarkModeBoard = () => (
  <div style={{ width: 920, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">DARK MODE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>인증 · Light/Dark 비교</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>dark mode에서도 blue는 action이고, 상태 색은 의미를 유지해야 합니다.</div>
    <div style={{ display: 'flex', gap: 18, marginTop: 28 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Light</div>
        <MiniAuthLayout mode="tablet"/>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Dark</div>
        <MiniAuthLayout mode="tablet" dark/>
      </div>
    </div>
    <div style={{ marginTop: 22, padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>검수 포인트</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
        {['텍스트 대비', '입력 배경', 'provider 버튼', 'error/success 색'].map((item) => <Badge key={item} tone="grey">{item}</Badge>)}
      </div>
    </div>
  </div>
);

const HOME_STATE_CASES = [
  {
    id: 'loading',
    tone: 'blue',
    label: 'LOADING',
    title: '오늘 추천을 불러오고 있어요',
    sub: '추천 카드 shape skeleton과 Pull-to-refresh hint를 함께 보여줍니다.',
    cta: '잠시만 기다려주세요',
    meta: 'network < 2s',
  },
  {
    id: 'empty',
    tone: 'orange',
    label: 'EMPTY',
    title: '추천할 종목 정보가 부족해요',
    sub: '관심 종목과 활동 지역을 채우면 홈 추천이 바로 살아납니다.',
    cta: '관심 종목 설정',
    meta: 'profile missing',
  },
  {
    id: 'error',
    tone: 'red',
    label: 'ERROR',
    title: '추천을 새로 만들지 못했어요',
    sub: '최근 본 매치와 인기 시설 fallback을 유지하고 재시도 CTA를 제공합니다.',
    cta: '추천 다시 받기',
    meta: 'recommendation API',
  },
  {
    id: 'offline',
    tone: 'grey',
    label: 'OFFLINE',
    title: '오프라인 캐시를 보여드려요',
    sub: '마지막 업데이트 시간을 표시하고 신청/결제 CTA는 연결 후 가능하게 막습니다.',
    cta: '연결 후 새로고침',
    meta: 'cached 12:30',
  },
  {
    id: 'soldout',
    tone: 'red',
    label: 'STALE',
    title: '추천 매치가 방금 마감됐어요',
    sub: '카드는 사라지지 않고 모집 완료 상태와 대체 추천을 함께 보여줍니다.',
    cta: '비슷한 매치 보기',
    meta: 'capacity race',
  },
  {
    id: 'pending',
    tone: 'blue',
    label: 'PENDING',
    title: '초대 리워드를 확인 중이에요',
    sub: '공유 완료 toast만으로 끝내지 않고 정산 예정 상태를 홈 위젯에 남깁니다.',
    cta: '초대 현황 보기',
    meta: 'attribution delay',
  },
];

const HomeRecommendationCard = ({ state }) => {
  const isLoading = state.id === 'loading';
  const disabled = ['offline', 'soldout'].includes(state.id);
  return (
    <Card pad={16} style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <Badge tone={state.tone} size="sm">{state.label}</Badge>
          <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, marginTop: 10 }}>{state.title}</div>
        </div>
        <div style={{ width: 38, height: 38, borderRadius: 13, background: state.tone === 'red' ? 'var(--red50)' : state.tone === 'orange' ? 'var(--orange50)' : 'var(--blue50)', color: state.tone === 'red' ? 'var(--red500)' : state.tone === 'orange' ? 'var(--orange500)' : 'var(--blue500)', display: 'grid', placeItems: 'center' }}>
          <Icon name={state.id === 'empty' ? 'heart' : state.id === 'offline' ? 'clock' : state.id === 'pending' ? 'share' : state.id === 'soldout' ? 'close' : 'star'} size={19}/>
        </div>
      </div>
      {isLoading ? (
        <div style={{ marginTop: 18 }}>
          <Skeleton h={18} w="74%" r={8} mb={10}/>
          <Skeleton h={14} w="92%" r={7} mb={8}/>
          <Skeleton h={14} w="66%" r={7}/>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 16 }}>
            <Skeleton h={46} r={13}/>
            <Skeleton h={46} r={13}/>
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 10 }}>{state.sub}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
            <div style={{ padding: 12, borderRadius: 13, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 700 }}>추천 근거</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 5 }}>강남 · 풋살 · 중급</div>
            </div>
            <div style={{ padding: 12, borderRadius: 13, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 700 }}>상태</div>
              <div className="tab-num" style={{ fontSize: 13, fontWeight: 700, marginTop: 5 }}>{state.meta}</div>
            </div>
          </div>
          <button disabled={disabled} className={ReadinessButtonClass({ size: 'md', variant: 'primary', block: true })} style={{ marginTop: 16 }}>
            {state.cta}
          </button>
        </>
      )}
    </Card>
  );
};

const HomeStateEdgeBoard = () => {
  const [active, setActive] = React.useState('loading');
  const current = HOME_STATE_CASES.find((item) => item.id === active) || HOME_STATE_CASES[0];
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 92 }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="blue" size="sm">HOME READINESS</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>홈 추천 상태 UI</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>추천은 실패해도 홈의 다음 행동이 사라지면 안 됩니다.</div>
        </div>
        <PullHint/>
        <div style={{ padding: '0 20px 0', display: 'flex', gap: 8, overflowX: 'auto' }}>
          {HOME_STATE_CASES.map((item) => <HapticChip key={item.id} active={active === item.id} onClick={() => setActive(item.id)}>{item.id}</HapticChip>)}
        </div>
        <div style={{ padding: '0 20px' }}>
          <HomeRecommendationCard state={current}/>
          <div style={{ marginTop: 14 }}>
            <SectionTitle title="대체 행동" action="전체 보기"/>
            <Card pad={0}>
              <ListItem title="오늘 20:00 인기 매치" sub="추천 실패 시에도 최근/인기 기반 fallback 노출" trailing="4명 남음" chev/>
              <ListItem title="내 근처 실내 코트" sub="위치 권한이 없으면 선택 지역 기준" trailing="1.2km" chev/>
            </Card>
          </div>
        </div>
        <BottomNav active="home"/>
      </div>
    </Phone>
  );
};

const HomeRecommendationEdgeBoard = () => (
  <Phone>
    <div style={{ flex: 1, background: 'var(--bg)', overflow: 'auto', paddingBottom: 24 }}>
      <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--grey100)' }}>
        <Badge tone="orange" size="sm">RECOMMENDATION EDGES</Badge>
        <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>추천 신뢰도와 차단 케이스</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>추천 사유와 제외 사유를 숨기지 않아야 개발팀이 분기를 구현할 수 있습니다.</div>
      </div>
      <div style={{ padding: 20 }}>
        <Card pad={16} style={{ background: 'var(--blue50)', borderColor: 'var(--blue100)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>오늘의 홈 정렬 기준</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>지역 50% · 종목 30% · 참여 가능 시간 20%</div>
            </div>
            <NumberDisplay value="86" unit="점" size={28} sub="추천 신뢰도"/>
          </div>
        </Card>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {[
            ['위치 없음', '지역을 직접 선택하면 같은 홈 IA로 추천을 이어갑니다.', '지역 선택', 'orange'],
            ['신고/차단 콘텐츠', '차단한 사용자의 feed와 매치는 홈에서 제거하고 대체 추천을 채웁니다.', '숨김 처리됨', 'red'],
            ['마감된 추천', '마감 race는 카드 삭제 대신 모집 완료와 대체 CTA를 표시합니다.', '대체 추천', 'red'],
            ['초대 산정 지연', '공유 성공 toast 후 pending 위젯을 남겨 보상 상태를 추적합니다.', '정산 대기', 'blue'],
            ['알림 권한 OFF', '추천은 유지하되 마감 알림받기 CTA는 권한 복구 sheet로 연결합니다.', '권한 복구', 'orange'],
          ].map(([title, sub, action, tone]) => (
            <div key={title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
              <div style={{ width: 34, height: 34, borderRadius: 12, background: tone === 'red' ? 'var(--red50)' : tone === 'orange' ? 'var(--orange50)' : 'var(--blue50)', color: tone === 'red' ? 'var(--red500)' : tone === 'orange' ? 'var(--orange500)' : 'var(--blue500)', display: 'grid', placeItems: 'center' }}>
                <Icon name={tone === 'red' ? 'close' : tone === 'orange' ? 'pin' : 'check'} size={17}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
                  <Badge tone={tone} size="sm">{action}</Badge>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>
        <Toast msg="초대 링크를 보냈어요 · 정산 대기 중" type="success"/>
      </div>
    </div>
  </Phone>
);

const HomeControlInteractionBoard = () => {
  const [active, setActive] = React.useState('filters');
  const states = [
    ['filters', '필터 chip', '종목/지역/시간을 누르면 active blue와 count가 즉시 바뀝니다.'],
    ['fab', 'FAB sheet', '위젯 추가, 매치 만들기, 초대 공유가 같은 bottom sheet 패턴을 씁니다.'],
    ['widget', '위젯 상태', '활성/비활성/로딩/권한 거부를 홈 카드 안에서 유지합니다.'],
    ['button', '버튼 상태', '추천 CTA는 loading, disabled, stale, retry 상태를 모두 갖습니다.'],
  ];
  return (
    <Phone>
      <div style={{ flex: 1, position: 'relative', background: 'var(--grey50)', overflow: 'hidden' }}>
        <div style={{ height: '100%', overflow: 'auto', paddingBottom: 150 }}>
          <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
            <Badge tone="blue" size="sm">CONTROL STATES</Badge>
            <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>홈 버튼 · FAB · 필터</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>global nav와 FAB는 홈의 모든 variant에서 같은 위치와 상태를 가져야 합니다.</div>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
              {states.map(([id, title]) => <HapticChip key={id} active={active === id} onClick={() => setActive(id)} count={id === 'filters' ? 3 : undefined}>{title}</HapticChip>)}
            </div>
            <Card pad={16} style={{ marginTop: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{states.find(([id]) => id === active)?.[1]}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{states.find(([id]) => id === active)?.[2]}</div>
              <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
                {[
                  ['Default', '추천 보기', false, 'primary'],
                  ['Pressed', '눌리는 중', false, 'primary'],
                  ['Loading', '새 추천 계산 중', true, 'primary'],
                  ['Disabled', '연결 후 가능', false, 'primary'],
                  ['Retry', '다시 시도', false, 'danger'],
                ].map(([state, label, loading, variant]) => (
                  <div key={state} style={{ display: 'grid', gridTemplateColumns: '82px 1fr', gap: 10, alignItems: 'center' }}>
                    <Badge tone={state === 'Retry' ? 'red' : state === 'Disabled' ? 'grey' : 'blue'} size="sm">{state}</Badge>
                    <button disabled={state === 'Disabled'} className={ReadinessButtonClass({ size: 'sm', variant })}>{loading ? '●  ' : ''}{label}</button>
                  </div>
                ))}
              </div>
            </Card>
            <Card pad={16} style={{ marginTop: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>위젯 상태</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 12 }}>
                {['활성', '로딩', '권한 필요', '추가 가능'].map((item, i) => (
                  <div key={item} style={{ padding: 11, borderRadius: 12, background: i === 0 ? 'var(--blue50)' : 'var(--grey50)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{item}</div>
                    <div className="tab-num" style={{ fontSize: 16, fontWeight: 700, marginTop: 5 }}>{i === 0 ? '3' : i === 1 ? '...' : i === 2 ? 'OFF' : '+'}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
        <div style={{ position: 'absolute', right: 20, bottom: 94, width: 56, height: 56, borderRadius: 18, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', boxShadow: '0 8px 18px rgba(49,130,246,.22)' }}>
          <Icon name="plus" size={24}/>
        </div>
        <div style={{ position: 'absolute', left: 18, right: 18, bottom: 82, padding: 14, borderRadius: 20, background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,.10)' }}>
          <div style={{ width: 42, height: 4, borderRadius: 999, background: 'var(--grey200)', margin: '0 auto 12px' }}/>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              ['매치 만들기', 'plus'],
              ['위젯 추가', 'star'],
              ['친구 초대', 'share'],
            ].map(([label, icon]) => (
              <button className="tm-pressable tm-break-keep" key={label} style={{ minHeight: 62, borderRadius: 14, background: 'var(--grey50)', color: 'var(--text-strong)', fontSize: 11, fontWeight: 700 }}>
                <Icon name={icon} size={18}/><br/>{label}
              </button>
            ))}
          </div>
        </div>
        <BottomNav active="home"/>
      </div>
    </Phone>
  );
};

const HomeMotionContractBoard = () => (
  <div style={{ width: 840, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">HOME MOTION</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>홈 추천 모션 계약</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8 }}>홈 애니메이션은 추천 갱신과 화면 전환의 상태를 설명해야 합니다.</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
      {[
        ['Pull refresh', 'PullHint reveal / 160ms', 'skeleton shimmer', '기존 카드 유지 후 교체'],
        ['Filter chip', 'tap scale 0.96 / 100ms', 'active blue + count', 'scroll 위치 유지'],
        ['Card push', 'pressed card / 120ms', 'detail push transition', 'stale면 CTA 전환'],
        ['FAB sheet', 'scrim fade + sheet rise / 220ms', 'quick actions focus', '닫으면 FAB 복귀'],
        ['Invite share', 'native share open', 'success toast', 'pending widget 유지'],
        ['Offline retry', 'retry button loading', 'cache timestamp update', '실패 시 error card'],
      ].map(([trigger, feedback, mid, final], i) => (
        <Card key={trigger} pad={16} style={{ minHeight: 122, background: i % 2 ? 'var(--bg)' : 'var(--grey50)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="tab-num" style={{ width: 32, height: 32, borderRadius: 12, background: i === 0 ? 'var(--blue500)' : 'var(--grey100)', color: i === 0 ? 'var(--static-white)' : 'var(--text-muted)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{i + 1}</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{trigger}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
            {[feedback, mid, final].map((txt, j) => <div key={txt} style={{ padding: 10, borderRadius: 10, background: j === 0 ? 'var(--blue50)' : 'var(--bg)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text)', lineHeight: 1.35 }}>{txt}</div>)}
          </div>
        </Card>
      ))}
    </div>
    <div style={{ marginTop: 18, padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Reduced motion</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 5 }}>카드 push와 sheet rise는 fade-only로 대체하고, 추천 skeleton shimmer는 정적 placeholder로 바꿉니다.</div>
    </div>
  </div>
);

const MiniHomeLayout = ({ mode = 'mobile', dark = false }) => {
  const palette = dark
    ? { bg: '#0f1318', panel: '#181d24', weak: '#242a33', border: '#303742', text: 'var(--grey100)', muted: 'var(--grey500)' }
    : { bg: 'var(--static-white)', panel: 'var(--static-white)', weak: 'var(--grey100)', border: 'var(--grey200)', text: 'var(--grey900)', muted: 'var(--grey600)' };
  const isMobile = mode === 'mobile';
  const isTablet = mode === 'tablet';
  const width = isMobile ? 220 : isTablet ? 320 : 520;
  const height = isMobile ? 430 : 390;
  return (
    <div style={{ width, height, borderRadius: isMobile ? 30 : 18, background: palette.bg, color: palette.text, border: `1px solid ${palette.border}`, padding: isMobile ? 16 : 20, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '150px 1fr 150px', gap: 14, overflow: 'hidden' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: palette.muted, fontWeight: 700 }}>홈</div>
          {isMobile && <div style={{ width: 28, height: 28, borderRadius: 10, background: palette.weak, display: 'grid', placeItems: 'center' }}><Icon name="bell" size={15} color={palette.muted}/></div>}
        </div>
        <div style={{ fontSize: isMobile ? 20 : 23, fontWeight: 700, lineHeight: 1.25, marginTop: 12 }}>오늘 바로<br/>참여할 수 있어요</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
          {['풋살', '강남', '20시'].map((chip, i) => (
            <div key={chip} style={{ height: 28, padding: '0 10px', borderRadius: 999, display: 'grid', placeItems: 'center', background: i === 0 ? 'var(--blue500)' : palette.weak, color: i === 0 ? 'var(--static-white)' : palette.text, fontSize: 11, fontWeight: 700 }}>{chip}</div>
          ))}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ padding: 14, borderRadius: 16, background: palette.panel, border: `1px solid ${palette.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, color: palette.muted, fontWeight: 700 }}>추천 매치</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>강남 실내 풋살</div>
            </div>
            <div className="tab-num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--blue500)' }}>4</div>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: palette.weak, marginTop: 14 }}>
            <div style={{ width: '62%', height: '100%', borderRadius: 999, background: 'var(--blue500)' }}/>
          </div>
          <button className={ReadinessButtonClass({ size: 'sm', variant: 'primary', block: true })} style={{ marginTop: 14 }}>상세 보기</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
          {['내 주변 시설', '초대 리워드'].map((title, i) => (
            <div key={title} style={{ padding: 11, borderRadius: 13, background: palette.weak, border: `1px solid ${palette.border}` }}>
              <div style={{ fontSize: 11, color: palette.muted }}>{title}</div>
              <div className="tab-num" style={{ fontSize: 16, fontWeight: 700, marginTop: 5 }}>{i === 0 ? '12' : '2'}</div>
            </div>
          ))}
        </div>
      </div>
      {!isMobile && (
        <div style={{ minWidth: 0 }}>
          {['검색', '알림', '내 활동'].map((item, i) => (
            <div key={item} style={{ height: 42, borderRadius: 12, background: i === 0 ? 'var(--blue500)' : palette.weak, color: i === 0 ? 'var(--static-white)' : palette.text, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{item}</div>
          ))}
        </div>
      )}
    </div>
  );
};

const HomeResponsiveBoard = () => (
  <div style={{ width: 1280, height: 820, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">RESPONSIVE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>홈 · Mobile/Tablet/Desktop 재배치</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>모바일 홈을 늘리는 것이 아니라, 같은 추천 IA를 tablet split과 desktop work surface로 확장합니다.</div>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginTop: 26 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Mobile 375</div>
        <MiniHomeLayout mode="mobile"/>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Tablet 768</div>
        <MiniHomeLayout mode="tablet"/>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Desktop 1280</div>
        <MiniHomeLayout mode="desktop"/>
      </div>
    </div>
    <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {[
        ['Mobile', 'single-column feed, sticky global nav, FAB sheet'],
        ['Tablet', 'hero/action split, 추천 card + quick widgets two-column'],
        ['Desktop', 'left navigation, central recommendation list, right activity rail'],
      ].map(([title, sub]) => (
        <Card key={title} pad={16}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{sub}</div>
        </Card>
      ))}
    </div>
  </div>
);

const HomeDarkModeBoard = () => (
  <div style={{ width: 920, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">DARK MODE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>홈 · Light/Dark 비교</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>추천 카드, chip, FAB, 상태 색이 dark mode에서도 의미와 대비를 유지하는지 확인합니다.</div>
    <div style={{ display: 'flex', gap: 18, marginTop: 28 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Light</div>
        <MiniHomeLayout mode="tablet"/>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Dark</div>
        <MiniHomeLayout mode="tablet" dark/>
      </div>
    </div>
    <div style={{ marginTop: 22, padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>홈 dark 검수 포인트</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
        {['추천 카드 배경', 'active chip blue', 'FAB 그림자 최소', 'empty/error 색'].map((item) => <Badge key={item} tone="grey">{item}</Badge>)}
      </div>
    </div>
  </div>
);

const MATCH_STATE_CASES = [
  {
    id: 'loading',
    tone: 'blue',
    label: 'LOADING',
    title: '매치 목록을 불러오고 있어요',
    sub: '카드 skeleton과 필터 chip skeleton을 분리해 layout shift를 막습니다.',
    cta: '불러오는 중',
    meta: 'list query',
  },
  {
    id: 'empty',
    tone: 'orange',
    label: 'EMPTY',
    title: '조건에 맞는 매치가 없어요',
    sub: '필터를 초기화하거나 반경을 넓히는 CTA를 같은 화면 안에 둡니다.',
    cta: '필터 초기화',
    meta: '0 results',
  },
  {
    id: 'deadline',
    tone: 'orange',
    label: 'DEADLINE',
    title: '마감까지 18분 남았어요',
    sub: '마감임박은 badge와 sticky CTA 사유를 같이 보여줘야 합니다.',
    cta: '빠르게 참가하기',
    meta: '18m left',
  },
  {
    id: 'soldout',
    tone: 'red',
    label: 'SOLD OUT',
    title: '방금 모집이 완료됐어요',
    sub: '상세 화면에서 사라지지 않고 대기 신청 또는 알림받기로 전환합니다.',
    cta: '빈자리 알림받기',
    meta: '22/22',
  },
  {
    id: 'permission',
    tone: 'orange',
    label: 'PERMISSION',
    title: '호스트는 참가할 수 없어요',
    sub: '본인 매치, 로그인 전, 제재 계정, 연령 제한을 같은 CTA 패턴으로 차단합니다.',
    cta: '매치 수정하기',
    meta: 'owner view',
  },
  {
    id: 'payment',
    tone: 'red',
    label: 'PAYMENT',
    title: '결제가 완료되지 않았어요',
    sub: '성공처럼 닫지 말고 결제 실패 원인과 재시도/다른 결제수단 CTA를 남깁니다.',
    cta: '다시 결제하기',
    meta: 'card declined',
  },
];

const MatchStateCard = ({ state }) => {
  const disabled = ['loading', 'soldout'].includes(state.id);
  const icon = state.id === 'empty' ? 'filter' : state.id === 'deadline' ? 'clock' : state.id === 'soldout' ? 'close' : state.id === 'permission' ? 'shield' : state.id === 'payment' ? 'money' : 'calendar';
  return (
    <Card pad={16} style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <Badge tone={state.tone} size="sm">{state.label}</Badge>
          <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, marginTop: 10 }}>{state.title}</div>
        </div>
        <div style={{ width: 38, height: 38, borderRadius: 13, background: state.tone === 'red' ? 'var(--red50)' : state.tone === 'orange' ? 'var(--orange50)' : 'var(--blue50)', color: state.tone === 'red' ? 'var(--red500)' : state.tone === 'orange' ? 'var(--orange500)' : 'var(--blue500)', display: 'grid', placeItems: 'center' }}>
          <Icon name={icon} size={19}/>
        </div>
      </div>
      {state.id === 'loading' ? (
        <div style={{ marginTop: 18 }}>
          <Skeleton h={18} w="76%" r={8} mb={10}/>
          <Skeleton h={14} w="94%" r={7} mb={8}/>
          <Skeleton h={14} w="58%" r={7}/>
          <div style={{ height: 6, borderRadius: 999, background: 'var(--grey150)', marginTop: 18, overflow: 'hidden' }}>
            <div style={{ width: '48%', height: '100%', background: 'var(--blue500)', borderRadius: 999 }}/>
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 10 }}>{state.sub}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
            <div style={{ padding: 12, borderRadius: 13, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 700 }}>현재 인원</div>
              <div className="tab-num" style={{ fontSize: 18, fontWeight: 700, marginTop: 5 }}>{state.id === 'soldout' ? '22/22' : '18/22'}</div>
            </div>
            <div style={{ padding: 12, borderRadius: 13, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 700 }}>상태 근거</div>
              <div className="tab-num" style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>{state.meta}</div>
            </div>
          </div>
          <button disabled={disabled} className={ReadinessButtonClass({ size: 'md', variant: ReadinessToneButtonVariant(state.tone), block: true })} style={{ marginTop: 16 }}>
            {state.cta}
          </button>
        </>
      )}
    </Card>
  );
};

const MatchesStateEdgeBoard = () => {
  const [active, setActive] = React.useState('deadline');
  const current = MATCH_STATE_CASES.find((item) => item.id === active) || MATCH_STATE_CASES[0];
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 92 }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="blue" size="sm">MATCH READINESS</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>개인 매치 상태 UI</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>목록과 상세의 상태는 같은 의미 색과 복구 CTA를 공유합니다.</div>
        </div>
        <PullHint/>
        <div style={{ padding: '0 20px', display: 'flex', gap: 8, overflowX: 'auto' }}>
          {MATCH_STATE_CASES.map((item) => <HapticChip key={item.id} active={active === item.id} onClick={() => setActive(item.id)}>{item.id}</HapticChip>)}
        </div>
        <div style={{ padding: '0 20px' }}>
          <MatchStateCard state={current}/>
          <Card pad={0} style={{ marginTop: 14 }}>
            <ListItem title="상암월드컵 보조구장" sub="오늘 20:00 · 중급 · 남은 자리 4" trailing="12,000원" chev/>
            <ListItem title="이태원 풋살파크 A코트" sub="마감임박 · 1명 남음" trailing="8,000원" chev/>
          </Card>
        </div>
        <BottomNav active="matches"/>
      </div>
    </Phone>
  );
};

const MatchesJoinSheetStatesBoard = () => {
  const [active, setActive] = React.useState('confirm');
  const states = [
    ['confirm', '확인', '참가 전 일정/장소/환불 기준을 확인합니다.', '결제하고 참가하기', 'blue'],
    ['capacity', '정원 충돌', '바텀시트가 열린 사이 마지막 자리가 찼습니다.', '빈자리 알림받기', 'red'],
    ['duplicate', '중복 신청', '이미 참가 중인 매치입니다. 내 매치로 이동합니다.', '내 매치 보기', 'orange'],
    ['pending', '승인 대기', '호스트 승인 또는 결제 승인 대기 상태를 닫지 않고 유지합니다.', '대기 상태 확인', 'blue'],
    ['failed', '결제 실패', '실패 원인과 재시도/결제수단 변경을 분리합니다.', '다시 결제하기', 'red'],
  ];
  const selected = states.find(([id]) => id === active) || states[0];
  const tone = selected[4];
  return (
    <Phone>
      <div style={{ flex: 1, position: 'relative', background: 'var(--grey50)', overflow: 'hidden' }}>
        <div style={{ height: '100%', overflow: 'auto', paddingBottom: 130 }}>
          <div style={{ height: 220, background: `var(--grey100) url(${IMG.soccer}) center/cover`, position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.2), rgba(0,0,0,.55))' }}/>
            <div style={{ position: 'absolute', bottom: 18, left: 20, right: 20, color: 'var(--static-white)' }}>
              <Badge tone="dark" size="sm">축구</Badge>
              <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.25, marginTop: 10 }}>주말 축구 한 판,<br/>같이 뛰어요</div>
            </div>
          </div>
          <div style={{ padding: 20 }}>
            <SectionTitle title="참가 전 확인" sub="바텀시트 상태를 직접 바꿔 검수합니다."/>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12 }}>
              {states.map(([id, label]) => <HapticChip key={id} active={active === id} onClick={() => setActive(id)}>{label}</HapticChip>)}
            </div>
          </div>
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(2,9,19,.42)', display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', background: 'var(--bg)', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '16px 20px 28px' }}>
            <div style={{ width: 38, height: 4, borderRadius: 999, background: 'var(--grey200)', margin: '0 auto 16px' }}/>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div>
                <Badge tone={tone} size="sm">{selected[1]}</Badge>
                <div style={{ fontSize: 21, fontWeight: 700, marginTop: 10 }}>매치 참가 확인</div>
              </div>
              <Icon name={tone === 'red' ? 'close' : tone === 'orange' ? 'clock' : 'check'} size={22} color={tone === 'red' ? 'var(--red500)' : tone === 'orange' ? 'var(--orange500)' : 'var(--blue500)'}/>
            </div>
            <div style={{ padding: 14, borderRadius: 14, background: 'var(--grey50)', border: '1px solid var(--border)', marginTop: 16 }}>
              <MoneyRow label="참가비" amount={12000} strong accent={active === 'confirm'}/>
              <MoneyRow label="남은 자리" amount={active === 'capacity' ? '0/22' : '4/22'} unit="" sub="submit 직전 서버 재확인"/>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 14 }}>{selected[2]}</div>
            <button disabled={active === 'capacity'} className={ReadinessButtonClass({ size: 'lg', variant: ReadinessToneButtonVariant(tone), block: true })} style={{ marginTop: 18 }}>{selected[3]}</button>
          </div>
        </div>
      </div>
    </Phone>
  );
};

const MatchesMapPermissionBoard = () => (
  <Phone>
    <div style={{ flex: 1, background: 'var(--bg)', overflow: 'auto', paddingBottom: 24 }}>
      <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--grey100)' }}>
        <Badge tone="orange" size="sm">MAP / PERMISSION</Badge>
        <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>지도와 위치 권한</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>지도 화면은 권한이 없어도 리스트 탐색이 막히면 안 됩니다.</div>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ height: 220, borderRadius: 18, background: 'var(--grey100)', border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, var(--grey100) 24%, var(--grey50) 25%, var(--grey50) 26%, var(--grey100) 27%, var(--grey100) 74%, var(--grey50) 75%, var(--grey50) 76%, var(--grey100) 77%)' }}/>
          {[
            ['64%', '34%', '4'],
            ['32%', '58%', '1'],
            ['74%', '70%', '2'],
          ].map(([left, top, count]) => (
            <div key={left} style={{ position: 'absolute', left, top, transform: 'translate(-50%, -50%)', minWidth: 36, height: 36, borderRadius: 18, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, boxShadow: '0 8px 18px rgba(49,130,246,.20)' }}>{count}</div>
          ))}
          <div style={{ position: 'absolute', left: 14, right: 14, bottom: 14, padding: 12, borderRadius: 14, background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 34, height: 34, borderRadius: 12, background: 'var(--orange50)', color: 'var(--orange500)', display: 'grid', placeItems: 'center' }}><Icon name="pin" size={17}/></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>위치 권한 없이 탐색 중</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>선택 지역 강남 기준으로 정렬합니다.</div>
              </div>
              <Badge tone="orange" size="sm">수동</Badge>
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {[
            ['권한 거부', '현재 위치 버튼은 권한 복구 sheet로 연결하고, 리스트는 선택 지역 기준으로 유지합니다.', '지역 선택', 'orange'],
            ['시설 변경', '호스트가 장소를 바꾸면 지도 pin, 상세 주소, 참가자 알림이 동시에 갱신됩니다.', '변경 알림', 'blue'],
            ['악천후', '실외 매치는 날씨 경고와 취소/환불 정책 링크를 같은 카드에 표시합니다.', '주의', 'red'],
            ['지도 로딩 실패', '지도 SDK 실패 시 static 지역 카드와 리스트 탐색을 fallback으로 제공합니다.', '리스트 보기', 'orange'],
          ].map(([title, sub, action, tone]) => (
            <div key={title} style={{ display: 'flex', gap: 12, padding: 14, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
              <div style={{ width: 34, height: 34, borderRadius: 12, background: tone === 'red' ? 'var(--red50)' : tone === 'orange' ? 'var(--orange50)' : 'var(--blue50)', color: tone === 'red' ? 'var(--red500)' : tone === 'orange' ? 'var(--orange500)' : 'var(--blue500)', display: 'grid', placeItems: 'center' }}>
                <Icon name={tone === 'red' ? 'clock' : tone === 'orange' ? 'pin' : 'check'} size={17}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
                  <Badge tone={tone} size="sm">{action}</Badge>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </Phone>
);

const MatchesControlInteractionBoard = () => {
  const [active, setActive] = React.useState('filter');
  const groups = [
    ['filter', '필터 chip', '종목/지역/시간/레벨 선택 시 count와 리스트가 같은 frame에서 갱신됩니다.'],
    ['cta', 'Sticky CTA', '상세 하단 CTA는 참가 가능/마감/본인 매치/결제 실패 상태를 분기합니다.'],
    ['form', '생성 form', '종목 -> 정보 -> 장소/일시 -> 확인 progress와 disabled reason을 유지합니다.'],
    ['list', '목록 row', '카드 pressed, skeleton, stale badge, sold-out disabled 상태를 가집니다.'],
  ];
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 92 }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="blue" size="sm">CONTROL STATES</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>매치 버튼 · 필터 · CTA</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>매치 도메인의 버튼은 거래형 액션과 탐색형 액션을 분리합니다.</div>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
            {groups.map(([id, title], i) => <HapticChip key={id} active={active === id} onClick={() => setActive(id)} count={i === 0 ? 4 : undefined}>{title}</HapticChip>)}
          </div>
          <Card pad={16} style={{ marginTop: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{groups.find(([id]) => id === active)?.[1]}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{groups.find(([id]) => id === active)?.[2]}</div>
            <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
              {[
                ['Default', '참가하기', 'blue', false],
                ['Pressed', '눌리는 중', 'blue', false],
                ['Loading', '정원 확인 중', 'blue', false],
                ['Disabled', '모집 완료', 'grey', true],
                ['Error', '다시 시도', 'red', false],
              ].map(([state, label, tone, disabled]) => (
                <div key={state} style={{ display: 'grid', gridTemplateColumns: '82px 1fr', gap: 10, alignItems: 'center' }}>
                  <Badge tone={tone} size="sm">{state}</Badge>
                  <button disabled={disabled} className={ReadinessButtonClass({ size: 'sm', variant: ReadinessToneButtonVariant(tone) })}>{state === 'Loading' ? '●  ' : ''}{label}</button>
                </div>
              ))}
            </div>
          </Card>
          <Card pad={16} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>필터 결과 상태</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 12 }}>
              {[
                ['선택됨', '4개'],
                ['결과 없음', '0개'],
                ['마감 제외', '12개'],
                ['권한 필요', '위치'],
              ].map(([title, value], i) => (
                <div key={title} style={{ padding: 11, borderRadius: 12, background: i === 0 ? 'var(--blue50)' : 'var(--grey50)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{title}</div>
                  <div className="tab-num" style={{ fontSize: 16, fontWeight: 700, marginTop: 5 }}>{value}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <BottomNav active="matches"/>
      </div>
    </Phone>
  );
};

const MatchesMotionContractBoard = () => (
  <div style={{ width: 840, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">MATCH MOTION</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>개인 매치 모션 계약</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8 }}>거래형 참가 액션은 trigger, 서버 확인, final state가 명확해야 합니다.</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
      {[
        ['Filter select', 'chip scale 0.96 / 100ms', 'count update', '리스트 skeleton 후 교체'],
        ['Card push', 'card pressed / 120ms', 'detail push', 'stale면 상태 카드 노출'],
        ['Map pin tap', 'pin scale + list focus', 'bottom card sync', '지도 실패 시 리스트 유지'],
        ['Join sheet', 'scrim fade + sheet rise / 240ms', 'server capacity check', '성공/실패 persistent'],
        ['Payment success', 'check pulse / 260ms', '내 매치 추가', '영수증/채팅 CTA 표시'],
        ['Create step', 'progress advance / 180ms', 'field validation', '이전 값 유지'],
      ].map(([trigger, feedback, mid, final], i) => (
        <Card key={trigger} pad={16} style={{ minHeight: 122, background: i % 2 ? 'var(--bg)' : 'var(--grey50)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="tab-num" style={{ width: 32, height: 32, borderRadius: 12, background: i === 0 ? 'var(--blue500)' : 'var(--grey100)', color: i === 0 ? 'var(--static-white)' : 'var(--text-muted)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{i + 1}</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{trigger}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
            {[feedback, mid, final].map((txt, j) => <div key={txt} style={{ padding: 10, borderRadius: 10, background: j === 0 ? 'var(--blue50)' : 'var(--bg)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text)', lineHeight: 1.35 }}>{txt}</div>)}
          </div>
        </Card>
      ))}
    </div>
    <div style={{ marginTop: 18, padding: 16, borderRadius: 16, background: 'var(--orange50)', color: 'var(--text)' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--orange500)' }}>Reduced motion</div>
      <div style={{ fontSize: 12, lineHeight: 1.55, marginTop: 5 }}>map pin bounce, sheet rise, success pulse는 opacity 전환으로 대체하고, 정원 확인은 정적 loading row로 표시합니다.</div>
    </div>
  </div>
);

const MiniMatchLayout = ({ mode = 'mobile', dark = false }) => {
  const palette = dark
    ? { bg: '#0f1318', panel: '#181d24', weak: '#242a33', border: '#303742', text: 'var(--grey100)', muted: 'var(--grey500)' }
    : { bg: 'var(--static-white)', panel: 'var(--static-white)', weak: 'var(--grey100)', border: 'var(--grey200)', text: 'var(--grey900)', muted: 'var(--grey600)' };
  const isMobile = mode === 'mobile';
  const isTablet = mode === 'tablet';
  const width = isMobile ? 220 : isTablet ? 330 : 520;
  const height = isMobile ? 430 : 390;
  return (
    <div style={{ width, height, borderRadius: isMobile ? 30 : 18, background: palette.bg, color: palette.text, border: `1px solid ${palette.border}`, padding: isMobile ? 16 : 18, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '150px 1fr 160px', gap: 14, overflow: 'hidden' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: palette.muted, fontWeight: 700 }}>매치 찾기</div>
        <div style={{ fontSize: isMobile ? 20 : 23, fontWeight: 700, lineHeight: 1.25, marginTop: 12 }}>오늘 뛸 수 있는<br/>매치</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
          {['풋살', '강남', '마감 제외'].map((chip, i) => (
            <div key={chip} style={{ height: 28, padding: '0 10px', borderRadius: 999, display: 'grid', placeItems: 'center', background: i === 0 ? 'var(--blue500)' : palette.weak, color: i === 0 ? 'var(--static-white)' : palette.text, fontSize: 11, fontWeight: 700 }}>{chip}</div>
          ))}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ padding: 14, borderRadius: 16, background: palette.panel, border: `1px solid ${palette.border}` }}>
          <div style={{ height: 76, borderRadius: 13, background: `var(--grey100) url(${IMG.futsal}) center/cover`, marginBottom: 12 }}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>이태원 풋살파크</div>
              <div style={{ fontSize: 11, color: palette.muted, marginTop: 4 }}>오늘 20:30 · 1명 남음</div>
            </div>
            <div className="tab-num" style={{ fontSize: 16, fontWeight: 700, color: 'var(--red500)' }}>9/10</div>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: palette.weak, marginTop: 12 }}>
            <div style={{ width: '90%', height: '100%', borderRadius: 999, background: 'var(--red500)' }}/>
          </div>
        </div>
      </div>
      {!isMobile && (
        <div style={{ minWidth: 0 }}>
          <div style={{ height: isTablet ? 130 : 172, borderRadius: 16, background: palette.weak, border: `1px solid ${palette.border}`, position: 'relative', marginBottom: 10 }}>
            <div style={{ position: 'absolute', left: '56%', top: '42%', transform: 'translate(-50%, -50%)', width: 34, height: 34, borderRadius: 17, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>4</div>
          </div>
          <button className={ReadinessButtonClass({ size: 'sm', variant: 'primary', block: true })}>참가하기</button>
        </div>
      )}
    </div>
  );
};

const MatchesResponsiveBoard = () => (
  <div style={{ width: 1280, height: 820, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">RESPONSIVE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>개인 매치 · Mobile/Tablet/Desktop 재배치</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>모바일은 feed 중심, 태블릿은 list/map split, 데스크탑은 filter + result + map/action rail 구조로 확장합니다.</div>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginTop: 26 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Mobile 375</div>
        <MiniMatchLayout mode="mobile"/>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Tablet 768</div>
        <MiniMatchLayout mode="tablet"/>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Desktop 1280</div>
        <MiniMatchLayout mode="desktop"/>
      </div>
    </div>
    <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {[
        ['Mobile', 'single-column card feed, bottom nav, sticky join CTA'],
        ['Tablet', 'list + compact map split, filter bar remains top'],
        ['Desktop', 'left filter, central result list, right map/detail rail'],
      ].map(([title, sub]) => (
        <Card key={title} pad={16}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{sub}</div>
        </Card>
      ))}
    </div>
  </div>
);

const MatchesDarkModeBoard = () => (
  <div style={{ width: 920, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">DARK MODE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>개인 매치 · Light/Dark 비교</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>dark mode에서도 마감임박 red, action blue, map/list surface 대비가 유지되어야 합니다.</div>
    <div style={{ display: 'flex', gap: 18, marginTop: 28 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Light</div>
        <MiniMatchLayout mode="tablet"/>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Dark</div>
        <MiniMatchLayout mode="tablet" dark/>
      </div>
    </div>
    <div style={{ marginTop: 22, padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>매치 dark 검수 포인트</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
        {['카드 이미지 대비', '마감임박 red', '지도 pin blue', 'disabled CTA'].map((item) => <Badge key={item} tone="grey">{item}</Badge>)}
      </div>
    </div>
  </div>
);

const TEAM_STATE_CASES = [
  {
    id: 'pending',
    tone: 'blue',
    label: 'PENDING',
    title: '가입 신청을 검토 중이에요',
    sub: '처리 주체와 예상 시간을 남겨 사용자가 같은 신청을 반복하지 않게 합니다.',
    cta: '신청 상태 보기',
    meta: 'captain review',
  },
  {
    id: 'approved',
    tone: 'green',
    label: 'APPROVED',
    title: '팀 가입이 승인됐어요',
    sub: '환영 toast와 함께 팀 홈, 채팅, 다음 경기 CTA를 persistent row로 제공합니다.',
    cta: '팀 홈으로 이동',
    meta: 'member active',
  },
  {
    id: 'rejected',
    tone: 'red',
    label: 'REJECTED',
    title: '이번 가입은 거절됐어요',
    sub: '거절 사유, 재신청 가능일, 다른 팀 추천을 분리해서 보여줍니다.',
    cta: '비슷한 팀 보기',
    meta: 'retry D+7',
  },
  {
    id: 'permission',
    tone: 'orange',
    label: 'PERMISSION',
    title: '주장만 변경할 수 있어요',
    sub: '멤버/매니저/주장 역할에 따라 수정, 승인, 강퇴, 스코어 액션이 달라집니다.',
    cta: '권한 요청하기',
    meta: 'manager only',
  },
  {
    id: 'booking',
    tone: 'red',
    label: 'CONFLICT',
    title: '상대 팀 예약이 겹쳤어요',
    sub: '장소/시간/상대팀 중 어떤 조건이 충돌했는지 한 줄로 남깁니다.',
    cta: '시간 다시 선택',
    meta: 'slot race',
  },
  {
    id: 'cancelled',
    tone: 'red',
    label: 'CANCELLED',
    title: '상대 팀이 취소했어요',
    sub: '대체 상대 찾기, 환불/정산, 멤버 공지를 같은 상태 카드에서 처리합니다.',
    cta: '대체 상대 찾기',
    meta: 'opponent cancel',
  },
];

const TeamStateCard = ({ state }) => (
  <Card pad={16} style={{ marginTop: 14 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
      <div>
        <Badge tone={state.tone} size="sm">{state.label}</Badge>
        <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, marginTop: 10 }}>{state.title}</div>
      </div>
      <div style={{ width: 38, height: 38, borderRadius: 13, background: state.tone === 'red' ? 'var(--red50)' : state.tone === 'orange' ? 'var(--orange50)' : state.tone === 'green' ? 'var(--green50)' : 'var(--blue50)', color: state.tone === 'red' ? 'var(--red500)' : state.tone === 'orange' ? 'var(--orange500)' : state.tone === 'green' ? 'var(--green500)' : 'var(--blue500)', display: 'grid', placeItems: 'center' }}>
        <Icon name={state.tone === 'red' ? 'close' : state.tone === 'orange' ? 'shield' : state.tone === 'green' ? 'check' : 'clock'} size={19}/>
      </div>
    </div>
    <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 10 }}>{state.sub}</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
      <div style={{ padding: 12, borderRadius: 13, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 700 }}>팀 역할</div>
        <div style={{ fontSize: 14, fontWeight: 700, marginTop: 5 }}>{state.id === 'permission' ? '멤버' : '주장'}</div>
      </div>
      <div style={{ padding: 12, borderRadius: 13, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 700 }}>상태 근거</div>
        <div className="tab-num" style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>{state.meta}</div>
      </div>
    </div>
    <button className={ReadinessButtonClass({ size: 'md', variant: ReadinessToneButtonVariant(state.tone), block: true })} style={{ marginTop: 16 }}>
      {state.cta}
    </button>
  </Card>
);

const TeamsStateEdgeBoard = () => {
  const [active, setActive] = React.useState('pending');
  const current = TEAM_STATE_CASES.find((item) => item.id === active) || TEAM_STATE_CASES[0];
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 92 }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="blue" size="sm">TEAM READINESS</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>팀 상태 UI</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>팀 기능은 상태와 처리 주체가 같이 보여야 합니다.</div>
        </div>
        <div style={{ padding: '16px 20px 0', display: 'flex', gap: 8, overflowX: 'auto' }}>
          {TEAM_STATE_CASES.map((item) => <HapticChip key={item.id} active={active === item.id} onClick={() => setActive(item.id)}>{item.id}</HapticChip>)}
        </div>
        <div style={{ padding: '0 20px' }}>
          <TeamStateCard state={current}/>
          <Card pad={0} style={{ marginTop: 14 }}>
            <ListItem title="FC 발빠른놈들" sub="주장 정민 · 멤버 24명 · 팀 등급 B" trailing="승인 대기" chev/>
            <ListItem title="다이나믹 FS" sub="오늘 20:00 팀매치 예약" trailing="확정" chev/>
          </Card>
        </div>
        <BottomNav active="matches"/>
      </div>
    </Phone>
  );
};

const TeamsRolePermissionBoard = () => {
  const roles = ['주장', '매니저', '멤버', '신청자', '외부'];
  const actions = [
    ['가입 승인', ['주장', '매니저']],
    ['멤버 권한 변경', ['주장']],
    ['팀매치 예약', ['주장', '매니저']],
    ['출석 체크', ['주장', '매니저', '멤버']],
    ['스코어 확정', ['주장', '매니저']],
    ['팀 탈퇴', ['매니저', '멤버']],
  ];
  return (
    <div style={{ width: 960, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
      <Badge tone="blue">ROLE PERMISSION</Badge>
      <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>팀 역할별 액션 권한</div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8 }}>버튼을 숨기기 전에 왜 막혔는지, 누가 처리해야 하는지 화면에 남깁니다.</div>
      <Card pad={0} style={{ marginTop: 24, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '170px repeat(5, 1fr)', background: 'var(--grey50)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ padding: 12, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>액션</div>
          {roles.map((role) => <div key={role} style={{ padding: 12, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center' }}>{role}</div>)}
        </div>
        {actions.map(([action, allowed]) => (
          <div key={action} style={{ display: 'grid', gridTemplateColumns: '170px repeat(5, 1fr)', borderBottom: '1px solid var(--grey100)', alignItems: 'center' }}>
            <div style={{ padding: 14, fontSize: 13, fontWeight: 700 }}>{action}</div>
            {roles.map((role) => {
              const ok = allowed.includes(role);
              return (
                <div key={role} style={{ padding: 12, textAlign: 'center' }}>
                  <Badge tone={ok ? 'blue' : 'grey'} size="sm">{ok ? '가능' : '제한'}</Badge>
                </div>
              );
            })}
          </div>
        ))}
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 18 }}>
        {[
          ['권한 변경 race', '버튼 tap 직후 역할이 바뀌면 optimistic 완료 대신 권한 재확인 alert row를 표시'],
          ['주장 탈퇴', '마지막 주장은 탈퇴 전에 위임 flow가 필수'],
          ['신청자 view', '팀 정보는 보되 채팅/출석/스코어는 permission denied 상태로 분리'],
        ].map(([title, sub]) => (
          <Card key={title} pad={16}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{sub}</div>
          </Card>
        ))}
      </div>
    </div>
  );
};

const TeamsJoinApprovalBoard = () => {
  const [active, setActive] = React.useState('review');
  const states = [
    ['review', '검토 중', '주장이 프로필과 포지션을 확인하고 있어요.', '신청 취소', 'blue'],
    ['need-info', '정보 부족', '선호 포지션 또는 활동 지역이 없어 보완이 필요합니다.', '프로필 보완', 'orange'],
    ['approved', '승인됨', '팀 채팅과 다음 경기 일정에 바로 진입할 수 있습니다.', '팀 홈 열기', 'green'],
    ['rejected', '거절됨', '거절 사유와 재신청 가능일을 표시합니다.', '다른 팀 보기', 'red'],
    ['expired', '초대 만료', '초대 링크가 만료되어 새 링크를 요청해야 합니다.', '새 초대 요청', 'orange'],
  ];
  const selected = states.find(([id]) => id === active) || states[0];
  const tone = selected[4];
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--bg)', overflow: 'auto', paddingBottom: 24 }}>
        <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="orange" size="sm">JOIN FLOW</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>팀 가입 승인/거절</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>신청자와 주장 양쪽에서 같은 상태 이름을 써야 합니다.</div>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12 }}>
            {states.map(([id, label]) => <HapticChip key={id} active={active === id} onClick={() => setActive(id)}>{label}</HapticChip>)}
          </div>
          <Card pad={18}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <Badge tone={tone} size="sm">{selected[1]}</Badge>
                <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.25, marginTop: 12 }}>FC 발빠른놈들<br/>가입 신청</div>
              </div>
              <StackedAvatars avatars={[IMG.av1, IMG.av2, IMG.av3, IMG.av4]} size={30}/>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 12 }}>{selected[2]}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
              <KPIStat label="팀 등급" value="B"/>
              <KPIStat label="신청 포지션" value="MF"/>
            </div>
            <div style={{ marginTop: 16, padding: 12, borderRadius: 13, background: tone === 'red' ? 'var(--red50)' : tone === 'orange' ? 'var(--orange50)' : 'var(--blue50)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: tone === 'red' ? 'var(--red500)' : tone === 'orange' ? 'var(--orange500)' : 'var(--blue500)' }}>다음 상태</div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.45, marginTop: 4 }}>{active === 'approved' ? '팀 홈, 팀 채팅, 출석 체크가 활성화됩니다.' : active === 'rejected' ? '재신청 가능일 전까지 CTA를 비활성화합니다.' : '주장 처리 또는 신청자 보완을 기다립니다.'}</div>
            </div>
            <button className={ReadinessButtonClass({ size: 'lg', variant: ReadinessToneButtonVariant(tone), block: true })} style={{ marginTop: 18 }}>{selected[3]}</button>
          </Card>
        </div>
      </div>
    </Phone>
  );
};

const TeamsMatchOpsConflictBoard = () => (
  <Phone>
    <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 24 }}>
      <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
        <Badge tone="red" size="sm">OPS CONFLICT</Badge>
        <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>출석 · 스코어 충돌</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>경기 운영 상태는 결과와 감사 로그가 남아야 합니다.</div>
      </div>
      <div style={{ padding: 20, display: 'grid', gap: 12 }}>
        {[
          ['라인업 미확정', '출석 체크 전 주전/교체 명단이 확정되지 않았습니다.', '스코어 입력 비활성', 'orange'],
          ['출석 수정 충돌', '주장과 매니저가 동시에 출석을 수정했습니다.', '최신 변경 검토', 'red'],
          ['상대팀 스코어 불일치', '우리 팀 3:2, 상대 팀 2:2로 입력했습니다.', '확정 보류', 'red'],
          ['경기 후 평가 누락', '참가자 8명 중 3명이 아직 평가하지 않았습니다.', '리마인드', 'blue'],
          ['상대 팀 취소', '상대 팀이 경기 2시간 전에 취소했습니다.', '정산/공지 필요', 'red'],
        ].map(([title, sub, action, tone]) => (
          <Card key={title} pad={16}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 12, background: tone === 'red' ? 'var(--red50)' : tone === 'orange' ? 'var(--orange50)' : 'var(--blue50)', color: tone === 'red' ? 'var(--red500)' : tone === 'orange' ? 'var(--orange500)' : 'var(--blue500)', display: 'grid', placeItems: 'center' }}>
                <Icon name={tone === 'red' ? 'close' : tone === 'orange' ? 'clock' : 'check'} size={18}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
                  <Badge tone={tone} size="sm">{action}</Badge>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{sub}</div>
              </div>
            </div>
          </Card>
        ))}
        <Card pad={16} style={{ background: 'var(--bg)' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>스코어 확정 단계</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 12 }}>
            {['입력', '상대 확인', '충돌 검토', '확정'].map((step, i) => (
              <div key={step} style={{ height: 58, borderRadius: 13, background: i < 2 ? 'var(--blue50)' : i === 2 ? 'var(--orange50)' : 'var(--grey50)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>{step}</div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  </Phone>
);

const TeamsControlInteractionBoard = () => {
  const [score, setScore] = React.useState(2);
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 92 }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="blue" size="sm">CONTROL STATES</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>팀 운영 컨트롤</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>role menu, 출석 check, 스코어 stepper, 평가 submit 상태입니다.</div>
        </div>
        <div style={{ padding: 20 }}>
          <Card pad={16}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>멤버 역할 메뉴</div>
            <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
              {[
                ['주장으로 위임', '주장만 가능', 'blue', false],
                ['매니저 지정', '권한 변경 중', 'blue', false],
                ['팀에서 내보내기', '사유 입력 필요', 'red', false],
                ['권한 없음', '멤버는 변경 불가', 'grey', true],
              ].map(([title, sub, tone, disabled]) => (
                <button key={title} disabled={disabled} className="tm-pressable" style={{ minHeight: 48, borderRadius: 13, background: disabled ? 'var(--grey100)' : 'var(--bg)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 12px' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: tone === 'red' ? 'var(--red500)' : disabled ? 'var(--grey500)' : 'var(--text-strong)' }}>{title}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-caption)' }}>{sub}</span>
                </button>
              ))}
            </div>
          </Card>
          <Card pad={16} style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>스코어 입력</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>44px target stepper</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={() => setScore(Math.max(0, score - 1))} className={ReadinessButtonClass({ size: 'icon', variant: 'neutral' })}>-</button>
                <div className="tab-num" style={{ width: 38, textAlign: 'center', fontSize: 24, fontWeight: 700 }}>{score}</div>
                <button onClick={() => setScore(score + 1)} className={ReadinessButtonClass({ size: 'icon', variant: 'primary' })}>+</button>
              </div>
            </div>
          </Card>
          <Card pad={16} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>출석 체크</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 12 }}>
              {['참석', '지각', '불참', '미응답'].map((item, i) => (
                <button key={item} className={ReadinessButtonClass({ size: 'sm', variant: i === 0 ? 'primary' : 'neutral' })}>{item}</button>
              ))}
            </div>
          </Card>
        </div>
        <BottomNav active="matches"/>
      </div>
    </Phone>
  );
};

const TeamsMotionContractBoard = () => (
  <div style={{ width: 840, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">TEAM MOTION</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>팀/팀매칭 모션 계약</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8 }}>권한과 경기 결과가 바뀌는 액션은 feedback 이후 감사 가능한 final state를 남깁니다.</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
      {[
        ['Join submit', 'button loading', 'captain review state', '신청 row 유지'],
        ['Approve member', 'role menu close', 'member list update', 'team chat CTA'],
        ['Role change', 'confirm sheet rise', 'permission recheck', 'audit row 추가'],
        ['Booking request', 'slot selected', 'opponent pending', '충돌 시 retry sheet'],
        ['Attendance tap', 'chip scale 0.96', 'count update', 'conflict row 표시'],
        ['Score submit', 'stepper lock', 'opponent compare', '확정/보류 분기'],
      ].map(([trigger, feedback, mid, final], i) => (
        <Card key={trigger} pad={16} style={{ minHeight: 122, background: i % 2 ? 'var(--bg)' : 'var(--grey50)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="tab-num" style={{ width: 32, height: 32, borderRadius: 12, background: i === 0 ? 'var(--blue500)' : 'var(--grey100)', color: i === 0 ? 'var(--static-white)' : 'var(--text-muted)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{i + 1}</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{trigger}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
            {[feedback, mid, final].map((txt, j) => <div key={txt} style={{ padding: 10, borderRadius: 10, background: j === 0 ? 'var(--blue50)' : 'var(--bg)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text)', lineHeight: 1.35 }}>{txt}</div>)}
          </div>
        </Card>
      ))}
    </div>
    <div style={{ marginTop: 18, padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Reduced motion</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 5 }}>sheet rise, check pulse, role row reorder는 fade-only 또는 즉시 상태 전환으로 대체합니다.</div>
    </div>
  </div>
);

const MiniTeamLayout = ({ mode = 'mobile', dark = false }) => {
  const palette = dark
    ? { bg: '#0f1318', panel: '#181d24', weak: '#242a33', border: '#303742', text: 'var(--grey100)', muted: 'var(--grey500)' }
    : { bg: 'var(--static-white)', panel: 'var(--static-white)', weak: 'var(--grey100)', border: 'var(--grey200)', text: 'var(--grey900)', muted: 'var(--grey600)' };
  const isMobile = mode === 'mobile';
  const isTablet = mode === 'tablet';
  const width = isMobile ? 220 : isTablet ? 330 : 520;
  const height = isMobile ? 430 : 390;
  return (
    <div style={{ width, height, borderRadius: isMobile ? 30 : 18, background: palette.bg, color: palette.text, border: `1px solid ${palette.border}`, padding: isMobile ? 16 : 18, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '150px 1fr 160px', gap: 14, overflow: 'hidden' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: palette.muted, fontWeight: 700 }}>팀 홈</div>
        <div style={{ width: 48, height: 48, borderRadius: 17, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 800, marginTop: 14 }}>FC</div>
        <div style={{ fontSize: isMobile ? 20 : 23, fontWeight: 700, lineHeight: 1.25, marginTop: 12 }}>FC 발빠른놈들</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          {['주장', '24명', 'B등급'].map((chip, i) => (
            <div key={chip} style={{ height: 28, padding: '0 10px', borderRadius: 999, display: 'grid', placeItems: 'center', background: i === 0 ? 'var(--blue500)' : palette.weak, color: i === 0 ? 'var(--static-white)' : palette.text, fontSize: 11, fontWeight: 700 }}>{chip}</div>
          ))}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ padding: 14, borderRadius: 16, background: palette.panel, border: `1px solid ${palette.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontSize: 13, color: palette.muted, fontWeight: 700 }}>다음 팀매치</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>상암 A구장</div>
              <div style={{ fontSize: 11, color: palette.muted, marginTop: 4 }}>5월 11일 09:00</div>
            </div>
            <Badge tone="orange" size="sm">승인 대기</Badge>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
            <div style={{ padding: 10, borderRadius: 12, background: palette.weak, border: `1px solid ${palette.border}` }}>
              <div style={{ fontSize: 11, color: palette.muted }}>출석</div>
              <div className="tab-num" style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>18/24</div>
            </div>
            <div style={{ padding: 10, borderRadius: 12, background: palette.weak, border: `1px solid ${palette.border}` }}>
              <div style={{ fontSize: 11, color: palette.muted }}>스코어</div>
              <div className="tab-num" style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>2:1</div>
            </div>
          </div>
        </div>
      </div>
      {!isMobile && (
        <div style={{ minWidth: 0 }}>
          {['가입 승인', '팀매치 예약', '스코어 확정'].map((item, i) => (
            <button className="tm-pressable tm-break-keep" key={item} style={{ width: '100%', height: 42, borderRadius: 12, background: i === 0 ? 'var(--blue500)' : palette.weak, color: i === 0 ? 'var(--static-white)' : palette.text, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{item}</button>
          ))}
        </div>
      )}
    </div>
  );
};

const TeamsResponsiveBoard = () => (
  <div style={{ width: 1280, height: 820, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">RESPONSIVE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>팀/팀매칭 · Mobile/Tablet/Desktop 재배치</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>모바일 팀 홈은 action 중심, 태블릿은 팀 홈/운영 split, 데스크탑은 roster + match ops workspace로 확장합니다.</div>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginTop: 26 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Mobile 375</div>
        <MiniTeamLayout mode="mobile"/>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Tablet 768</div>
        <MiniTeamLayout mode="tablet"/>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Desktop 1280</div>
        <MiniTeamLayout mode="desktop"/>
      </div>
    </div>
    <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {[
        ['Mobile', 'team home, 신청 상태, sticky team action'],
        ['Tablet', 'profile + team-match operations two-column'],
        ['Desktop', 'roster table, match schedule, audit/action rail'],
      ].map(([title, sub]) => (
        <Card key={title} pad={16}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{sub}</div>
        </Card>
      ))}
    </div>
  </div>
);

const TeamsDarkModeBoard = () => (
  <div style={{ width: 920, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">DARK MODE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>팀/팀매칭 · Light/Dark 비교</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>권한 badge, 승인/거절 상태, roster row, 운영 CTA가 dark mode에서도 같은 의미를 유지해야 합니다.</div>
    <div style={{ display: 'flex', gap: 18, marginTop: 28 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Light</div>
        <MiniTeamLayout mode="tablet"/>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Dark</div>
        <MiniTeamLayout mode="tablet" dark/>
      </div>
    </div>
    <div style={{ marginTop: 22, padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>팀 dark 검수 포인트</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
        {['역할 badge', '승인/거절 색', 'roster row 대비', '운영 CTA'].map((item) => <Badge key={item} tone="grey">{item}</Badge>)}
      </div>
    </div>
  </div>
);

const LESSON_STATE_CASES = [
  {
    id: 'academy-empty',
    tone: 'grey',
    label: 'EMPTY',
    title: '조건에 맞는 아카데미가 없어요',
    sub: '관심 종목, 지역, 레벨을 다시 고르게 하고 단건 레슨으로 임의 fallback하지 않습니다.',
    cta: '조건 다시 선택',
    meta: '0 course',
  },
  {
    id: 'loading',
    tone: 'blue',
    label: 'LOADING',
    title: '이번 주 시작 코스를 불러와요',
    sub: '코스 카드, 코치, 가격 영역은 skeleton으로 분리하고 CTA는 아직 비활성입니다.',
    cta: '불러오는 중',
    meta: 'skeleton',
  },
  {
    id: 'offline',
    tone: 'red',
    label: 'ERROR',
    title: '레슨 정보를 불러오지 못했어요',
    sub: '검색어와 필터는 유지한 채 다시 시도하거나 저장된 수강권으로 이동할 수 있어야 합니다.',
    cta: '다시 시도',
    meta: 'network',
  },
  {
    id: 'soldout',
    tone: 'red',
    label: 'SOLD OUT',
    title: '이번 기수는 정원이 마감됐어요',
    sub: '결제 CTA 대신 대기 신청, 다음 기수 알림, 비슷한 코스 추천을 제공합니다.',
    cta: '대기 신청',
    meta: '12/12',
  },
  {
    id: 'deadline',
    tone: 'orange',
    label: 'D-1',
    title: '내일까지 등록해야 시작할 수 있어요',
    sub: '마감 임박은 빨간 장식이 아니라 일정/환불/준비물 정보를 같이 보여줍니다.',
    cta: '일정 확인',
    meta: 'D-1',
  },
  {
    id: 'pending',
    tone: 'orange',
    label: 'PENDING',
    title: '코치 승인을 기다리고 있어요',
    sub: '결제 완료 후 코치가 레벨과 일정 가능 여부를 확인하는 상태입니다.',
    cta: '승인 상태 보기',
    meta: 'coach review',
  },
  {
    id: 'disabled',
    tone: 'grey',
    label: 'DISABLED',
    title: '사용할 수강권이 없어요',
    sub: '잔여 0회, 만료, 다른 코스 전용 수강권은 사용 CTA를 명확히 차단합니다.',
    cta: '수강권 구매',
    meta: '0 remain',
  },
  {
    id: 'success',
    tone: 'green',
    label: 'SUCCESS',
    title: '첫 수업 예약이 완료됐어요',
    sub: '결제/예약 완료 후 캘린더, 채팅, 준비물 확인으로 이어지는 다음 행동을 보여줍니다.',
    cta: '준비물 보기',
    meta: 'reserved',
  },
];

const lessonToneColor = (tone) => (
  tone === 'red' ? 'var(--red500)' :
  tone === 'orange' ? 'var(--orange500)' :
  tone === 'green' ? 'var(--green500)' :
  tone === 'blue' ? 'var(--blue500)' :
  'var(--grey600)'
);

const lessonToneBg = (tone) => (
  tone === 'red' ? 'var(--red50)' :
  tone === 'orange' ? 'var(--orange50)' :
  tone === 'green' ? 'var(--green50)' :
  tone === 'blue' ? 'var(--blue50)' :
  'var(--grey100)'
);

const LessonStateCard = ({ state }) => (
  <Card pad={18} style={{ marginTop: 14 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <Badge tone={state.tone} size="sm">{state.label}</Badge>
        <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.28, marginTop: 12, color: 'var(--text-strong)' }}>{state.title}</div>
      </div>
      <div style={{ width: 42, height: 42, borderRadius: 14, background: lessonToneBg(state.tone), color: lessonToneColor(state.tone), display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon name={state.tone === 'red' ? 'close' : state.tone === 'orange' ? 'clock' : state.tone === 'green' ? 'check' : 'calendar'} size={19}/>
      </div>
    </div>
    <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 10 }}>{state.sub}</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
      <div style={{ padding: 12, borderRadius: 13, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 700 }}>상태 근거</div>
        <div className="tab-num" style={{ fontSize: 14, fontWeight: 700, marginTop: 5 }}>{state.meta}</div>
      </div>
      <div style={{ padding: 12, borderRadius: 13, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 700 }}>다음 화면</div>
        <div style={{ fontSize: 14, fontWeight: 700, marginTop: 5 }}>{state.id === 'success' ? '준비물' : state.id === 'disabled' ? '구매' : '복구 CTA'}</div>
      </div>
    </div>
    {state.id === 'loading' ? (
      <div style={{ marginTop: 16, display: 'grid', gap: 9 }}>
        <Skeleton h={12} w="86%" r={6}/>
        <Skeleton h={12} w="64%" r={6}/>
        <Skeleton h={48} w="100%" r={14}/>
      </div>
    ) : (
      <button disabled={state.id === 'disabled'} className={ReadinessButtonClass({ size: 'md', variant: ReadinessToneButtonVariant(state.tone), block: true })} style={{ marginTop: 16 }}>
        {state.cta}
      </button>
    )}
  </Card>
);

const LessonsAcademyHierarchyBoard = () => (
  <div style={{ width: 960, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', color: 'var(--text-strong)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">ACADEMY IA</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>레슨 메인은 Academy Hub</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8 }}>단건 레슨 목록이 루트가 아니라, 목표 기반 코스/코치/체험/수강권으로 분기하는 허브를 첫 화면으로 고정합니다.</div>
    <div style={{ display: 'grid', gridTemplateColumns: '330px 1fr', gap: 22, marginTop: 26 }}>
      <Card pad={18}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue500)' }}>ROOT /lessons</div>
        <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.25, marginTop: 10 }}>아카데미 허브에서<br/>학습 목표를 먼저 고릅니다</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 18 }}>
          <KPIStat label="코스" value={320}/>
          <KPIStat label="코치" value={86}/>
          <KPIStat label="평점" value="4.8"/>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 18 }}>
          {[
            ['코스 찾기', '목표별 커리큘럼', 'blue'],
            ['코치 찾기', '검증 프로필', 'grey'],
            ['무료 체험', '중복 신청 방지', 'orange'],
            ['내 수강권', '잔여/만료 관리', 'green'],
          ].map(([title, sub, tone], i) => (
            <div key={title} style={{ minHeight: 98, padding: 14, borderRadius: 15, background: i === 0 ? 'var(--blue50)' : 'var(--grey50)', border: '1px solid var(--border)' }}>
              <Badge tone={tone} size="sm">{i + 1}</Badge>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 10 }}>{title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>
            </div>
          ))}
        </div>
      </Card>
      <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
        {[
          ['01', 'Academy Hub', '/lessons', '추천 · 관심 종목 · 수강권 shortcut.', 'blue'],
          ['02', 'Course Detail', '/lessons/[id]', '목표, 커리큘럼, 코치, 일정, 정원, 가격을 한 흐름으로 정리합니다.', 'grey'],
          ['03', 'Ticket Use / Buy', '/my/tickets', '잔여/만료/환불 가능 여부를 보고 예약 또는 구매로 분기합니다.', 'green'],
          ['04', 'Coach Workspace', '/lessons/manage', '휴강, 일정 변경, 출석, 후기, 정산 상태를 운영자가 처리합니다.', 'orange'],
          ['05', 'Exception Layer', 'state boards', '핵심 예외 상태가 하위 화면에 적용됩니다.', 'red'],
        ].map(([num, title, route, sub, tone]) => (
          <Card key={title} pad={16} style={{ minWidth: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '42px 132px 102px minmax(0, 1fr)', gap: 10, alignItems: 'center', minWidth: 0 }}>
              <div className="tab-num" style={{ width: 36, height: 36, borderRadius: 13, background: tone === 'blue' ? 'var(--blue500)' : lessonToneBg(tone), color: tone === 'blue' ? 'var(--static-white)' : lessonToneColor(tone), display: 'grid', placeItems: 'center', fontWeight: 800 }}>{num}</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
              <Badge tone="grey" size="sm">{route}</Badge>
              <div style={{ minWidth: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, overflowWrap: 'break-word' }}>{sub}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
    <div style={{ marginTop: 20, padding: 16, borderRadius: 16, background: 'var(--blue50)', border: '1px solid var(--blue100)' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue700)' }}>개발 핸드오프 기준</div>
      <div style={{ fontSize: 12, color: 'var(--blue700)', lineHeight: 1.55, marginTop: 5 }}>레슨 루트는 `LessonAcademyHub`가 canonical main입니다. 목록/상세/수강권은 허브의 하위 분기이며, CTA와 bottom nav는 모두 `lessons` active language를 공유합니다.</div>
    </div>
  </div>
);

const LessonsStateEdgeBoard = () => {
  const [active, setActive] = React.useState('academy-empty');
  const current = LESSON_STATE_CASES.find((item) => item.id === active) || LESSON_STATE_CASES[0];
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 92 }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="blue" size="sm">LESSON READINESS</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>레슨 상태 UI</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>Academy Hub, 상세, 수강권에서 같은 상태 이름을 씁니다.</div>
        </div>
        <div style={{ padding: '16px 20px 0', display: 'flex', gap: 8, overflowX: 'auto' }}>
          {LESSON_STATE_CASES.map((item) => <HapticChip key={item.id} active={active === item.id} onClick={() => setActive(item.id)}>{item.id}</HapticChip>)}
        </div>
        <div style={{ padding: '0 20px' }}>
          <LessonStateCard state={current}/>
          <Card pad={0} style={{ marginTop: 14 }}>
            <ListItem title="축구 입문 아카데미" sub="4주 과정 · 5월 4일 시작 · 강남" trailing="D-1" chev/>
            <ListItem title="테니스 NTRP 업그레이드" sub="8회 과정 · 코치 승인 필요" trailing="대기" chev/>
          </Card>
        </div>
        <BottomNav active="lessons"/>
      </div>
    </Phone>
  );
};

const LessonsTicketLifecycleBoard = () => {
  const [active, setActive] = React.useState('active');
  const states = [
    ['active', '사용 가능', '6/8회 남음', '다음 수업 5월 8일 19:00', '예약 변경', 'blue'],
    ['zero', '잔여 0회', '8/8회 사용', '재예약은 새 수강권 구매 후 가능합니다.', '추가 구매', 'grey'],
    ['expired', '만료됨', '만료 2026.04.10', '예약 CTA는 차단하고 기록/영수증만 제공합니다.', '영수증 보기', 'grey'],
    ['refund', '환불 가능', '미사용 3회', '결제 후 7일 이내라 부분 환불을 요청할 수 있습니다.', '환불 요청', 'orange'],
    ['pending-pay', '결제 보류', '인증 대기', '카드 인증이 끝나기 전에는 예약 확정으로 보이지 않습니다.', '결제 이어서', 'orange'],
    ['coach-hold', '코치 승인 대기', '레벨 확인 중', '코치가 수업 가능 여부를 확인한 뒤 예약이 확정됩니다.', '상태 보기', 'blue'],
  ];
  const selected = states.find(([id]) => id === active) || states[0];
  const tone = selected[5];
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 24 }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="green" size="sm">TICKET LIFECYCLE</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>수강권 만료/잔여/환불</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>사용 가능 여부를 CTA보다 먼저 판단할 수 있어야 합니다.</div>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12 }}>
            {states.map(([id, label]) => <HapticChip key={id} active={active === id} onClick={() => setActive(id)}>{label}</HapticChip>)}
          </div>
          <Card pad={18}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <Badge tone={tone} size="sm">{selected[1]}</Badge>
                <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.25, marginTop: 12 }}>박준수 코치<br/>1:1 축구 수강권</div>
              </div>
              <NumberDisplay value={active === 'zero' ? 0 : active === 'expired' ? 0 : 6} unit="회" size={32} sub="잔여"/>
            </div>
            <div style={{ marginTop: 16 }}>
              <StatBar value={active === 'active' || active === 'coach-hold' ? 75 : active === 'refund' ? 38 : 100} color={tone === 'orange' ? 'var(--orange500)' : tone === 'grey' ? 'var(--grey400)' : 'var(--blue500)'}/>
            </div>
            <div style={{ marginTop: 14, padding: 13, borderRadius: 14, background: lessonToneBg(tone), border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: lessonToneColor(tone) }}>{selected[2]}</div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.45, marginTop: 4 }}>{selected[3]}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
              <KPIStat label="만료일" value="06.12"/>
              <KPIStat label="환불 가능" value={active === 'refund' ? '3회' : '-'}/>
            </div>
            <button disabled={active === 'expired'} className={ReadinessButtonClass({ size: 'lg', variant: 'primary', block: true })} style={{ marginTop: 18 }}>{selected[4]}</button>
          </Card>
        </div>
      </div>
    </Phone>
  );
};

const LessonsScheduleExceptionsBoard = () => (
  <Phone>
    <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 24 }}>
      <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
        <Badge tone="orange" size="sm">SCHEDULE EDGES</Badge>
        <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>일정 변경 · 휴강 · 대기</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>레슨 일정은 상태 변경 후 사용자가 무엇을 해야 하는지 남겨야 합니다.</div>
      </div>
      <div style={{ padding: 20, display: 'grid', gap: 12 }}>
        {[
          ['휴강 처리', '코치가 오늘 수업을 휴강했습니다. 보강 후보 3개를 제안합니다.', '보강 선택', 'orange'],
          ['일정 변경 요청', '코치가 5월 8일 19:00에서 20:30으로 변경을 요청했습니다.', '승인 필요', 'blue'],
          ['정원 마감', '12명 정원이 모두 찼습니다. 결제 CTA 대신 대기 신청을 노출합니다.', '대기 신청', 'red'],
          ['무료 체험 중복', '이미 같은 코스 체험을 신청했습니다. 중복 예약을 막습니다.', '신청 제한', 'grey'],
          ['노쇼 이력', '최근 30일 내 노쇼 2회로 무료 체험 신청 전 확인이 필요합니다.', '확인 필요', 'orange'],
          ['코치 unavailable', '코치가 선택한 시간대에 수업할 수 없습니다. 대체 코치를 추천합니다.', '대체 보기', 'red'],
        ].map(([title, sub, action, tone]) => (
          <Card key={title} pad={16}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 13, background: lessonToneBg(tone), color: lessonToneColor(tone), display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Icon name={tone === 'red' ? 'close' : tone === 'blue' ? 'calendar' : 'clock'} size={18}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
                  <Badge tone={tone} size="sm">{action}</Badge>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{sub}</div>
              </div>
            </div>
          </Card>
        ))}
        <Card pad={16}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>변경 승인 플로우</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 12 }}>
            {['요청', '알림', '승인/거절', '캘린더 반영'].map((step, i) => (
              <div key={step} style={{ minHeight: 58, borderRadius: 13, background: i < 2 ? 'var(--blue50)' : i === 2 ? 'var(--orange50)' : 'var(--grey50)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', textAlign: 'center', fontSize: 12, fontWeight: 700, padding: 6 }}>{step}</div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  </Phone>
);

const LessonsControlInteractionBoard = () => {
  const [slot, setSlot] = React.useState('sat');
  const [plan, setPlan] = React.useState('5회권');
  const amount = plan === '10회권' ? 480000 : plan === '5회권' ? 270000 : 60000;
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 116 }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="blue" size="sm">CONTROL STATES</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>예약/구매 컨트롤</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>칩 선택, sticky CTA 금액, bottom sheet, disabled/loading 상태입니다.</div>
        </div>
        <div style={{ padding: 20 }}>
          <Card pad={16}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>일정 선택</div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 12 }}>
              {[
                ['sat', '토 10:00', '4자리'],
                ['sun', '일 14:00', '마감임박'],
                ['wed', '수 20:30', '대기'],
              ].map(([id, label, sub]) => (
                <button key={id} onClick={() => setSlot(id)} className="tm-pressable" style={{ minWidth: 96, minHeight: 56, borderRadius: 14, background: slot === id ? 'var(--blue500)' : 'var(--bg)', color: slot === id ? 'var(--static-white)' : 'var(--text-strong)', border: '1px solid var(--border)', textAlign: 'left', padding: '9px 11px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
                  <div style={{ fontSize: 11, opacity: .72, marginTop: 4 }}>{sub}</div>
                </button>
              ))}
            </div>
          </Card>
          <Card pad={16} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>수강권 선택</div>
            <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
              {['1회권', '5회권', '10회권'].map((item) => (
                <button key={item} onClick={() => setPlan(item)} className="tm-pressable" style={{ minHeight: 48, borderRadius: 13, background: plan === item ? 'var(--blue50)' : 'var(--bg)', border: `1px solid ${plan === item ? 'var(--blue500)' : 'var(--border)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 12px' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: plan === item ? 'var(--blue500)' : 'var(--text-strong)' }}>{item}</span>
                  <span className="tab-num" style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{item === '1회권' ? '60,000원' : item === '5회권' ? '270,000원' : '480,000원'}</span>
                </button>
              ))}
            </div>
          </Card>
          <Card pad={16} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Bottom sheet 상태</div>
            <div style={{ marginTop: 12, padding: 14, borderRadius: '16px 16px 8px 8px', background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <div style={{ width: 38, height: 4, borderRadius: 999, background: 'var(--grey300)', margin: '0 auto 14px' }}/>
              <MoneyRow label="결제 예정 금액" amount={amount}/>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                <button className={ReadinessButtonClass({ size: 'sm', variant: 'neutral' })}>쿠폰 선택</button>
                <button disabled className={ReadinessButtonClass({ size: 'sm', variant: 'neutral' })}>중복 사용 불가</button>
              </div>
            </div>
          </Card>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 20px 24px', background: 'rgba(255,255,255,.96)', borderTop: '1px solid var(--border)' }}>
        <button className={ReadinessButtonClass({ size: 'lg', variant: 'primary', block: true })}>
          {amount.toLocaleString()}원 결제하기
        </button>
      </div>
    </Phone>
  );
};

const LessonsMotionContractBoard = () => (
  <div style={{ width: 840, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">LESSON MOTION</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>레슨 모션 계약</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8 }}>예약과 결제는 빠른 피드백 이후 persistent 상태 row를 남겨야 개발팀이 race를 처리할 수 있습니다.</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
      {[
        ['Hub card tap', 'card scale 0.98', 'course detail push', 'back keeps filter'],
        ['Schedule chip', 'chip blue select', 'sticky amount update', 'soldout blocks CTA'],
        ['Ticket use sheet', 'sheet rise 280ms', 'remaining/expiry check', 'confirm or disabled'],
        ['Payment submit', 'button loading', 'pending payment row', 'success confirmation'],
        ['Coach reschedule', 'toast + row highlight', 'approval sheet', 'calendar updated'],
        ['Refund request', 'reason validate', 'pending state', 'receipt/refund timeline'],
      ].map(([trigger, feedback, mid, final], i) => (
        <Card key={trigger} pad={16} style={{ minHeight: 122, background: i % 2 ? 'var(--bg)' : 'var(--grey50)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="tab-num" style={{ width: 32, height: 32, borderRadius: 12, background: i === 0 ? 'var(--blue500)' : 'var(--grey100)', color: i === 0 ? 'var(--static-white)' : 'var(--text-muted)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{i + 1}</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{trigger}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
            {[feedback, mid, final].map((txt, j) => <div key={txt} style={{ padding: 10, borderRadius: 10, background: j === 0 ? 'var(--blue50)' : 'var(--bg)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text)', lineHeight: 1.35 }}>{txt}</div>)}
          </div>
        </Card>
      ))}
    </div>
    <div style={{ marginTop: 18, padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Reduced motion</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 5 }}>push transition, sheet rise, success check는 fade-only 또는 즉시 상태 전환으로 대체합니다. 결제/환불은 애니메이션보다 상태 기록이 우선입니다.</div>
    </div>
  </div>
);

const MiniLessonLayout = ({ mode = 'mobile', dark = false }) => {
  const palette = dark
    ? { bg: '#0f1318', panel: '#181d24', weak: '#242a33', border: '#303742', text: 'var(--grey100)', muted: 'var(--grey500)' }
    : { bg: 'var(--static-white)', panel: 'var(--static-white)', weak: 'var(--grey100)', border: 'var(--grey200)', text: 'var(--grey900)', muted: 'var(--grey600)' };
  const isMobile = mode === 'mobile';
  const isTablet = mode === 'tablet';
  const width = isMobile ? 220 : isTablet ? 330 : 520;
  const height = isMobile ? 430 : 390;
  return (
    <div style={{ width, height, borderRadius: isMobile ? 30 : 18, background: palette.bg, color: palette.text, border: `1px solid ${palette.border}`, padding: isMobile ? 16 : 18, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '150px 1fr 160px', gap: 14, overflow: 'hidden' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: palette.muted, fontWeight: 700 }}>Academy Hub</div>
        <div style={{ fontSize: isMobile ? 22 : isTablet ? 22 : 25, fontWeight: 700, lineHeight: 1.22, marginTop: 14 }}>
          {isMobile || isTablet ? <>이번 달<br/>축구 입문<br/>코스</> : <>이번 달<br/>축구 입문 코스</>}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          {['초급', 'D-1', '4주'].map((chip, i) => (
            <div key={chip} style={{ height: 28, padding: '0 10px', borderRadius: 999, display: 'grid', placeItems: 'center', background: i === 0 ? 'var(--blue500)' : palette.weak, color: i === 0 ? 'var(--static-white)' : palette.text, fontSize: 11, fontWeight: 700 }}>{chip}</div>
          ))}
        </div>
        <div className="tab-num" style={{ fontSize: 22, fontWeight: 800, marginTop: 18 }}>270,000원</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ padding: 14, borderRadius: 16, background: palette.panel, border: `1px solid ${palette.border}` }}>
          <div style={{ display: 'flex', flexDirection: isTablet ? 'column' : 'row', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontSize: 13, color: palette.muted, fontWeight: 700 }}>수강권</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>6/8회 남음</div>
              <div style={{ fontSize: 11, color: palette.muted, marginTop: 4 }}>만료 6월 12일</div>
            </div>
            <Badge tone="green" size="sm">사용가능</Badge>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
            <div style={{ padding: 10, borderRadius: 12, background: palette.weak, border: `1px solid ${palette.border}` }}>
              <div style={{ fontSize: 11, color: palette.muted }}>다음 수업</div>
              <div className="tab-num" style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>5/8</div>
            </div>
            <div style={{ padding: 10, borderRadius: 12, background: palette.weak, border: `1px solid ${palette.border}` }}>
              <div style={{ fontSize: 11, color: palette.muted }}>정원</div>
              <div className="tab-num" style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>10/12</div>
            </div>
          </div>
        </div>
      </div>
      {mode === 'desktop' && (
        <div style={{ minWidth: 0 }}>
          {['일정 선택', '수강권 사용', '결제하기'].map((item, i) => (
            <button className="tm-pressable tm-break-keep" key={item} style={{ width: '100%', height: 42, borderRadius: 12, background: i === 0 ? 'var(--blue500)' : palette.weak, color: i === 0 ? 'var(--static-white)' : palette.text, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{item}</button>
          ))}
          <div style={{ padding: 10, borderRadius: 12, background: 'var(--orange50)', color: 'var(--orange500)', fontSize: 11, lineHeight: 1.35, fontWeight: 700 }}>휴강/변경 요청은 persistent row로 남김</div>
        </div>
      )}
    </div>
  );
};

const LessonsResponsiveBoard = () => (
  <div style={{ width: 1280, height: 820, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">RESPONSIVE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>레슨 · Mobile/Tablet/Desktop 재배치</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>모바일은 Academy Hub와 sticky CTA, 태블릿은 hub/detail split, 데스크탑은 filter + course result + ticket/action rail로 확장합니다.</div>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginTop: 26 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Mobile 375</div>
        <MiniLessonLayout mode="mobile"/>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Tablet 768</div>
        <MiniLessonLayout mode="tablet"/>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Desktop 1280</div>
        <MiniLessonLayout mode="desktop"/>
      </div>
    </div>
    <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {[
        ['Mobile', 'Academy Hub, 코스 카드, schedule chip, sticky pay CTA'],
        ['Tablet', 'hub + detail preview, 수강권 상태 side panel'],
        ['Desktop', 'left filter, course result, coach/ticket/action rail'],
      ].map(([title, sub]) => (
        <Card key={title} pad={16}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{sub}</div>
        </Card>
      ))}
    </div>
  </div>
);

const LessonsDarkModeBoard = () => (
  <div style={{ width: 920, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">DARK MODE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>레슨 · Light/Dark 비교</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>Academy Hub, 수강권 잔여, 마감임박, 휴강/대기 상태가 dark mode에서도 같은 의미로 읽혀야 합니다.</div>
    <div style={{ display: 'flex', gap: 18, marginTop: 28 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Light</div>
        <MiniLessonLayout mode="tablet"/>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Dark</div>
        <MiniLessonLayout mode="tablet" dark/>
      </div>
    </div>
    <div style={{ marginTop: 22, padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>레슨 dark 검수 포인트</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
        {['마감임박 orange', '잔여 0회 disabled', '수강권 progress', 'sticky CTA 대비'].map((item) => <Badge key={item} tone="grey">{item}</Badge>)}
      </div>
    </div>
  </div>
);

const MARKETPLACE_STATE_CASES = [
  {
    id: 'available',
    tone: 'blue',
    chip: '구매 가능',
    label: '구매 가능',
    title: '구매할 수 있는 매물이에요',
    sub: '가격, 안전거래 가능 여부, 직거래 지역, 판매자 응답률을 CTA 전에 확인합니다.',
    cta: '구매 문의',
    meta: '판매중',
  },
  {
    id: 'reserved',
    tone: 'orange',
    chip: '예약중',
    label: '예약중',
    title: '다른 구매자와 거래 예약 중이에요',
    sub: '결제 또는 픽업 마감 시간이 지나기 전까지 구매 CTA를 차단하고 알림 신청만 허용합니다.',
    cta: '풀리면 알림 받기',
    meta: '18:30 만료',
  },
  {
    id: 'sold',
    tone: 'grey',
    chip: '판매 완료',
    label: '판매 완료',
    title: '판매 완료된 상품이에요',
    sub: '구매 CTA를 제거하고 비슷한 상품, 거래 후기, 영수증 진입만 남깁니다.',
    cta: '비슷한 상품 보기',
    meta: '거래 종료',
  },
  {
    id: 'pending-pay',
    tone: 'orange',
    chip: '결제 대기',
    label: '결제 대기',
    title: '결제 확인을 기다리고 있어요',
    sub: '주문은 생성됐지만 결제 인증이 끝나지 않았습니다. 판매자에게 확정으로 보이면 안 됩니다.',
    cta: '결제 이어서',
    meta: '입금 확인 전',
  },
  {
    id: 'price-race',
    tone: 'red',
    chip: '가격 변경',
    label: '가격 변경',
    title: '가격이 방금 변경됐어요',
    sub: '구매자가 주문하는 동안 판매자가 가격을 바꾸면 새 금액 확인 시트를 띄웁니다.',
    cta: '새 가격 확인',
    meta: '+20,000원',
  },
  {
    id: 'upload-error',
    tone: 'red',
    chip: '업로드 실패',
    label: '업로드 실패',
    title: '사진 일부를 올리지 못했어요',
    sub: '성공한 사진과 실패한 사진을 분리하고, 게시 전 재시도 또는 제외 선택을 제공합니다.',
    cta: '실패 사진 재시도',
    meta: '2장 실패',
  },
  {
    id: 'permission',
    tone: 'orange',
    chip: '판매자 보기',
    label: '판매자 보기',
    title: '내 판매글은 구매할 수 없어요',
    sub: '구매 CTA 대신 가격 수정, 거래 상태 변경, 게시 중단 액션을 노출합니다.',
    cta: '판매글 수정',
    meta: '내 글',
  },
  {
    id: 'dispute',
    tone: 'red',
    chip: '분쟁',
    label: '분쟁',
    title: '분쟁 접수 중인 거래예요',
    sub: '후기 작성과 정산 완료를 막고, 증빙 제출/운영 검토 타임라인을 보여줍니다.',
    cta: '증빙 제출',
    meta: '운영 검토',
  },
];

const marketToneColor = (tone) => (
  tone === 'red' ? 'var(--red500)' :
  tone === 'orange' ? 'var(--orange500)' :
  tone === 'green' ? 'var(--green500)' :
  tone === 'blue' ? 'var(--blue500)' :
  'var(--grey600)'
);

const marketToneBg = (tone) => (
  tone === 'red' ? 'var(--red50)' :
  tone === 'orange' ? 'var(--orange50)' :
  tone === 'green' ? 'var(--green50)' :
  tone === 'blue' ? 'var(--blue50)' :
  'var(--grey100)'
);

const MarketplaceStateCard = ({ state }) => (
  <Card pad={18} style={{ marginTop: 14 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <Badge tone={state.tone} size="sm">{state.label}</Badge>
        <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.28, marginTop: 12, color: 'var(--text-strong)' }}>{state.title}</div>
      </div>
      <div style={{ width: 42, height: 42, borderRadius: 14, background: marketToneBg(state.tone), color: marketToneColor(state.tone), display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon name={state.tone === 'red' ? 'close' : state.tone === 'orange' ? 'clock' : state.tone === 'green' ? 'check' : 'shield'} size={19}/>
      </div>
    </div>
    <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 10 }}>{state.sub}</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
      <div style={{ padding: 12, borderRadius: 13, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 700 }}>거래 상태</div>
        <div className="tab-num" style={{ fontSize: 14, fontWeight: 700, marginTop: 5 }}>{state.meta}</div>
      </div>
      <div style={{ padding: 12, borderRadius: 13, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 700 }}>금액</div>
        <div className="tab-num" style={{ fontSize: 14, fontWeight: 700, marginTop: 5 }}>{state.id === 'price-race' ? '200,000원' : '180,000원'}</div>
      </div>
    </div>
    {state.id === 'upload-error' ? (
      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ height: 56, borderRadius: 13, background: i > 1 ? 'var(--red50)' : 'var(--grey100)', border: `1px ${i > 1 ? 'solid var(--red500)' : 'solid var(--border)'}`, display: 'grid', placeItems: 'center', color: i > 1 ? 'var(--red500)' : 'var(--grey500)' }}>
            <Icon name={i > 1 ? 'close' : 'check'} size={17}/>
          </div>
        ))}
      </div>
    ) : null}
    <button disabled={state.id === 'sold'} className={ReadinessButtonClass({ size: 'md', variant: ReadinessToneButtonVariant(state.tone), block: true })} style={{ marginTop: 16 }}>
      {state.cta}
    </button>
  </Card>
);

const MarketplaceStateEdgeBoard = () => {
  const [active, setActive] = React.useState('available');
  const current = MARKETPLACE_STATE_CASES.find((item) => item.id === active) || MARKETPLACE_STATE_CASES[0];
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 92 }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="blue" size="sm">MARKET READINESS</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>장터 상태 UI</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>목록, 상세, 주문, 내 판매글에서 같은 거래 상태 언어를 씁니다.</div>
        </div>
        <div style={{ padding: '16px 20px 0', display: 'flex', gap: 8, overflowX: 'auto' }}>
          {MARKETPLACE_STATE_CASES.map((item) => <HapticChip key={item.id} active={active === item.id} onClick={() => setActive(item.id)}>{item.chip}</HapticChip>)}
        </div>
        <div style={{ padding: '0 20px' }}>
          <MarketplaceStateCard state={current}/>
          <Card pad={0} style={{ marginTop: 14 }}>
            <ListItem title="나이키 머큐리얼 슈퍼플라이" sub="강남구 · 안전거래 가능 · 매너 4.8" trailing={current.label} chev/>
            <ListItem title="Wilson Ultra 100 라켓" sub="서초구 · 예약중 · 오늘 18:30까지" trailing="예약중" chev/>
          </Card>
        </div>
        <BottomNav active="marketplace"/>
      </div>
    </Phone>
  );
};

const MarketplaceOrderLifecycleBoard = () => {
  const [active, setActive] = React.useState('paid');
  const steps = [
    ['created', '주문 생성', '구매자가 안전거래 주문을 만들었습니다.', 'grey'],
    ['paid', '입금 확인', '결제 인증 완료. 판매자는 발송/픽업 준비를 시작합니다.', 'blue'],
    ['pickup', '픽업 중', '직거래 장소와 QR 확인 시간이 표시됩니다.', 'orange'],
    ['delivered', '수령 확인', '구매자가 상품을 확인하고 정산 대기 상태가 됩니다.', 'green'],
    ['completed', '거래 완료', '후기, 영수증, 분쟁 접수 진입을 제공합니다.', 'green'],
    ['cancelled', '판매자 취소', '취소 사유와 환불 경로를 분리해서 보여줍니다.', 'red'],
    ['disputed', '분쟁 검토', '정산을 보류하고 운영자 검토 타임라인을 띄웁니다.', 'red'],
  ];
  const currentIndex = Math.max(0, steps.findIndex(([id]) => id === active));
  const selected = steps[currentIndex] || steps[0];
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 24 }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="blue" size="sm">ORDER LIFECYCLE</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>주문/거래 라이프사이클</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>구매자와 판매자가 같은 단계 이름을 봅니다.</div>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12 }}>
            {steps.map(([id, label]) => <HapticChip key={id} active={active === id} onClick={() => setActive(id)}>{label}</HapticChip>)}
          </div>
          <Card pad={18}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <Badge tone={selected[3]} size="sm">{selected[1]}</Badge>
                <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.25, marginTop: 12 }}>나이키 축구화<br/>안전거래 주문</div>
              </div>
              <NumberDisplay value={180000} unit="원" size={30} sub="거래 금액"/>
            </div>
            <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
              {steps.slice(0, 5).map(([id, label, sub, tone], i) => {
                const done = i <= currentIndex && !['cancelled', 'disputed'].includes(active);
                const now = id === active;
                return (
                  <div key={id} style={{ display: 'grid', gridTemplateColumns: '32px 1fr', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 28, height: 28, borderRadius: 10, background: done || now ? 'var(--blue500)' : 'var(--grey100)', color: done || now ? 'var(--static-white)' : 'var(--grey500)', display: 'grid', placeItems: 'center' }}>
                      <Icon name={done ? 'check' : 'clock'} size={14}/>
                    </div>
                    <div style={{ paddingBottom: 10, borderBottom: '1px solid var(--grey100)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
                        {now && <Badge tone={tone} size="sm">현재</Badge>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, marginTop: 3 }}>{sub}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 14, padding: 13, borderRadius: 14, background: marketToneBg(selected[3]), border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: marketToneColor(selected[3]) }}>{selected[1]} 처리 원칙</div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.45, marginTop: 4 }}>{selected[2]}</div>
            </div>
          </Card>
        </div>
      </div>
    </Phone>
  );
};

const MarketplaceUploadPriceEdgeBoard = () => (
  <Phone>
    <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 24 }}>
      <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
        <Badge tone="red" size="sm">UPLOAD / PRICE EDGES</Badge>
        <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>사진/가격 변경 예외</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>게시와 주문 사이의 race를 화면에서 명확히 분리합니다.</div>
      </div>
      <div style={{ padding: 20, display: 'grid', gap: 12 }}>
        {[
          ['사진 업로드 실패', '10장 중 2장이 실패했습니다. 성공한 사진은 유지하고 실패만 재시도합니다.', '재시도', 'red'],
          ['사진 순서 저장 실패', '대표 사진 변경은 보류됐지만 기존 게시글은 유지됩니다.', '다시 저장', 'orange'],
        ['가격 변경 충돌', '판매자가 180,000원에서 200,000원으로 변경하는 동안 주문이 들어왔습니다.', '확인 시트', 'red'],
          ['상태 설명 불일치', '사진은 사용감이 큰데 설명은 거의 새것으로 되어 신고가 접수됐습니다.', '검토 중', 'orange'],
          ['중복 게시 감지', '동일 사진/제목의 판매글이 이미 있습니다.', '기존 글 보기', 'grey'],
          ['금지 품목 가능성', '보호장비가 아닌 의료/안전 인증 품목으로 분류될 수 있습니다.', '운영 검토', 'red'],
        ].map(([title, sub, action, tone]) => (
          <Card key={title} pad={16}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 13, background: marketToneBg(tone), color: marketToneColor(tone), display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Icon name={tone === 'red' ? 'close' : tone === 'orange' ? 'clock' : 'shield'} size={18}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
                  <Badge tone={tone} size="sm">{action}</Badge>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{sub}</div>
              </div>
            </div>
          </Card>
        ))}
        <Card pad={16}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>사진 업로드 상태</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginTop: 12 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} style={{ height: 56, borderRadius: 13, background: i < 3 ? 'var(--grey100)' : 'var(--red50)', border: `1px solid ${i < 3 ? 'var(--border)' : 'var(--red500)'}`, display: 'grid', placeItems: 'center', color: i < 3 ? 'var(--grey600)' : 'var(--red500)' }}>
                <Icon name={i < 3 ? 'check' : 'close'} size={16}/>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  </Phone>
);

const MarketplaceDisputeSafetyBoard = () => {
  const rows = [
    ['분쟁 접수', '상품 상태가 설명과 다르다는 구매자 신고가 들어왔습니다.', '정산 보류', 'red'],
    ['증빙 요청', '판매자에게 원본 사진, 구매 영수증, 운송장 제출을 요청합니다.', 'D+2', 'orange'],
    ['운영 검토', '운영자가 구매자/판매자 증빙을 비교합니다.', '진행 중', 'blue'],
    ['부분 환불 제안', '구매자는 상품을 유지하고 30,000원 부분 환불을 선택할 수 있습니다.', '제안', 'orange'],
    ['거래 완료 복구', '양측 확인이 끝나면 후기와 정산이 다시 열립니다.', '완료', 'green'],
  ];
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 24 }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="red" size="sm">DISPUTE / SAFETY</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>분쟁/신고/안전거래</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>거래형 화면은 운영 검토와 정산 보류를 숨기면 안 됩니다.</div>
        </div>
        <div style={{ padding: 20 }}>
          <Card pad={18}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <Badge tone="red" size="sm">정산 보류</Badge>
                <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.25, marginTop: 12 }}>상품 상태 불일치<br/>분쟁 검토</div>
              </div>
              <NumberDisplay value={30000} unit="원" size={29} sub="제안 환불"/>
            </div>
            <div style={{ marginTop: 16, padding: 13, borderRadius: 14, background: 'var(--red50)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red500)' }}>정산 잠금</div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.45, marginTop: 4 }}>분쟁이 닫힐 때까지 판매자 정산, 후기 작성, 거래 완료 처리를 막습니다.</div>
            </div>
          </Card>
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            {rows.map(([title, sub, status, tone]) => (
              <Card key={title} pad={14}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 4 }}>{sub}</div>
                  </div>
                  <Badge tone={tone} size="sm">{status}</Badge>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </Phone>
  );
};

const MarketplaceControlInteractionBoard = () => {
  const [cat, setCat] = React.useState('신발');
  const [offer, setOffer] = React.useState(170000);
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 116 }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="blue" size="sm">CONTROL STATES</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>필터/제안/거래 컨트롤</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>필터 칩, 가격 제안 sheet, 구매/예약/판매자 CTA 상태입니다.</div>
        </div>
        <div style={{ padding: 20 }}>
          <Card pad={16}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>카테고리 필터</div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 12 }}>
              {['전체', '신발', '라켓', '보호대', '의류'].map((item, i) => (
                <HapticChip key={item} active={cat === item} onClick={() => setCat(item)} count={i === 0 ? 284 : i === 1 ? 42 : undefined}>{item}</HapticChip>
              ))}
            </div>
          </Card>
          <Card pad={16} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>가격 제안</div>
            <div style={{ marginTop: 12, padding: 14, borderRadius: '16px 16px 8px 8px', background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <div style={{ width: 38, height: 4, borderRadius: 999, background: 'var(--grey300)', margin: '0 auto 14px' }}/>
              <MoneyRow label="판매가" amount={180000}/>
              <MoneyRow label="내 제안" amount={offer} accent/>
              <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px', gap: 10, alignItems: 'center', marginTop: 12 }}>
                <button onClick={() => setOffer(Math.max(10000, offer - 10000))} className={ReadinessButtonClass({ size: 'icon', variant: 'neutral' })}>-</button>
                <div className="tab-num" style={{ textAlign: 'center', fontSize: 20, fontWeight: 800 }}>{offer.toLocaleString()}원</div>
                <button onClick={() => setOffer(offer + 10000)} className={ReadinessButtonClass({ size: 'icon', variant: 'primary' })}>+</button>
              </div>
            </div>
          </Card>
          <Card pad={16} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>CTA 상태</div>
            <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
              {[
                ['구매 문의', 'primary', false],
                ['예약중 · 알림 받기', 'secondary', false],
                ['판매 완료', 'disabled', true],
                ['내 판매글 · 수정하기', 'seller', false],
              ].map(([title, type, disabled]) => (
                <button key={title} disabled={disabled} className={ReadinessButtonClass({ size: 'sm', variant: type === 'primary' ? 'primary' : 'neutral' })}>{title}</button>
              ))}
            </div>
          </Card>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 20px 24px', background: 'rgba(255,255,255,.96)', borderTop: '1px solid var(--border)' }}>
        <button className={ReadinessButtonClass({ size: 'lg', variant: 'primary', block: true })}>제안 보내기</button>
      </div>
    </Phone>
  );
};

const MarketplaceMotionContractBoard = () => (
  <div style={{ width: 840, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">MARKET MOTION</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>장터 모션 계약</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8 }}>거래형 액션은 피드백 이후 주문/정산/분쟁 상태가 화면에 남아야 합니다.</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
      {[
        ['Filter chip', 'chip scale 0.97', 'category count update', 'list keeps scroll'],
        ['Gallery swipe', 'image snap', 'index badge update', 'lightbox optional'],
        ['Price offer', 'sheet rise 280ms', 'amount stepper update', 'seller pending row'],
        ['Buy submit', 'button loading', 'stock/price recheck', 'order timeline'],
        ['Upload retry', 'failed tiles pulse', 'success tile replace', 'publish CTA enabled'],
        ['Dispute submit', 'reason validate', 'settlement lock row', 'ops timeline'],
      ].map(([trigger, feedback, mid, final], i) => (
        <Card key={trigger} pad={16} style={{ minHeight: 122, background: i % 2 ? 'var(--bg)' : 'var(--grey50)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="tab-num" style={{ width: 32, height: 32, borderRadius: 12, background: i === 0 ? 'var(--blue500)' : 'var(--grey100)', color: i === 0 ? 'var(--static-white)' : 'var(--text-muted)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{i + 1}</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{trigger}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
            {[feedback, mid, final].map((txt, j) => <div key={txt} style={{ padding: 10, borderRadius: 10, background: j === 0 ? 'var(--blue50)' : 'var(--bg)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text)', lineHeight: 1.35 }}>{txt}</div>)}
          </div>
        </Card>
      ))}
    </div>
    <div style={{ marginTop: 18, padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Reduced motion</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 5 }}>gallery snap, sheet rise, upload pulse는 fade-only로 대체합니다. 구매/분쟁은 모션보다 주문 타임라인과 정산 잠금 표시가 우선입니다.</div>
    </div>
  </div>
);

const MiniMarketplaceLayout = ({ mode = 'mobile', dark = false }) => {
  const palette = dark
    ? { bg: '#0f1318', panel: '#181d24', weak: '#242a33', border: '#303742', text: 'var(--grey100)', muted: 'var(--grey500)' }
    : { bg: 'var(--static-white)', panel: 'var(--static-white)', weak: 'var(--grey100)', border: 'var(--grey200)', text: 'var(--grey900)', muted: 'var(--grey600)' };
  const isMobile = mode === 'mobile';
  const isTablet = mode === 'tablet';
  const width = isMobile ? 220 : isTablet ? 330 : 520;
  const height = isMobile ? 430 : 390;
  return (
    <div style={{ width, height, borderRadius: isMobile ? 30 : 18, background: palette.bg, color: palette.text, border: `1px solid ${palette.border}`, padding: isMobile ? 16 : 18, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '140px 1fr 170px', gap: 14, overflow: 'hidden' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: palette.muted, fontWeight: 700 }}>Marketplace</div>
        <div style={{ width: isMobile ? 96 : 104, height: isMobile ? 96 : 104, borderRadius: 18, background: palette.weak, border: `1px solid ${palette.border}`, display: 'grid', placeItems: 'center', color: dark ? '#c9d2dc' : 'var(--grey600)', marginTop: 14 }}>
          <Icon name="store" size={34}/>
        </div>
        <div style={{ fontSize: isMobile ? 17 : 19, fontWeight: 700, lineHeight: 1.25, marginTop: 12 }}>나이키 머큐리얼<br/>슈퍼플라이</div>
        <div className="tab-num" style={{ fontSize: 22, fontWeight: 800, marginTop: 10 }}>180,000원</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ padding: 14, borderRadius: 16, background: palette.panel, border: `1px solid ${palette.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontSize: 13, color: palette.muted, fontWeight: 700 }}>거래 상태</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>입금 확인</div>
              <div style={{ fontSize: 11, color: palette.muted, marginTop: 4 }}>안전거래 · 강남구</div>
            </div>
            <Badge tone="blue" size="sm">진행중</Badge>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
            <div style={{ padding: 10, borderRadius: 12, background: palette.weak, border: `1px solid ${palette.border}` }}>
              <div style={{ fontSize: 11, color: palette.muted }}>응답률</div>
              <div className="tab-num" style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>96%</div>
            </div>
            <div style={{ padding: 10, borderRadius: 12, background: palette.weak, border: `1px solid ${palette.border}` }}>
              <div style={{ fontSize: 11, color: palette.muted }}>매너</div>
              <div className="tab-num" style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>4.8</div>
            </div>
          </div>
        </div>
      </div>
      {mode === 'desktop' && (
        <div style={{ minWidth: 0 }}>
          {['구매 문의', '가격 제안', '안전거래 주문'].map((item, i) => (
            <button className="tm-pressable tm-break-keep" key={item} style={{ width: '100%', height: 42, borderRadius: 12, background: i === 0 ? 'var(--blue500)' : palette.weak, color: i === 0 ? 'var(--static-white)' : palette.text, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{item}</button>
          ))}
          <div style={{ padding: 10, borderRadius: 12, background: 'var(--orange50)', color: 'var(--orange500)', fontSize: 11, lineHeight: 1.35, fontWeight: 700 }}>가격 변경/예약중은 CTA를 즉시 재검증</div>
        </div>
      )}
    </div>
  );
};

const MarketplaceResponsiveBoard = () => (
  <div style={{ width: 1280, height: 820, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">RESPONSIVE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>장터 · Mobile/Tablet/Desktop 재배치</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>모바일은 상품 피드와 고정 CTA, 태블릿은 상품/주문 상태 분할, 데스크탑은 필터 + 상품 그리드 + 거래 레일로 확장합니다.</div>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginTop: 26 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Mobile 375</div>
        <MiniMarketplaceLayout mode="mobile"/>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Tablet 768</div>
        <MiniMarketplaceLayout mode="tablet"/>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Desktop 1280</div>
        <MiniMarketplaceLayout mode="desktop"/>
      </div>
    </div>
    <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {[
        ['Mobile', '카테고리 칩, 상품 그리드, 가격 제안 시트, 고정 문의 CTA'],
        ['Tablet', '상품 상세와 주문 상태 패널을 2열로 분리'],
        ['Desktop', '좌측 필터, 상품 결과 그리드, 거래 액션 레일'],
      ].map(([title, sub]) => (
        <Card key={title} pad={16}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{sub}</div>
        </Card>
      ))}
    </div>
  </div>
);

const MarketplaceDarkModeBoard = () => (
  <div style={{ width: 920, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">DARK MODE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>장터 · Light/Dark 비교</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>상품 이미지, 가격, 예약중/판매완료, 안전거래 badge, 분쟁 red가 dark mode에서도 같은 의미로 읽혀야 합니다.</div>
    <div style={{ display: 'flex', gap: 18, marginTop: 28 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Light</div>
        <MiniMarketplaceLayout mode="tablet"/>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Dark</div>
        <MiniMarketplaceLayout mode="tablet" dark/>
      </div>
    </div>
    <div style={{ marginTop: 22, padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>장터 dark 검수 포인트</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
        {['가격 tabular', '예약중 orange', '판매완료 disabled', '분쟁 red'].map((item) => <Badge key={item} tone="grey">{item}</Badge>)}
      </div>
    </div>
  </div>
);

const VENUE_STATE_CASES = [
  {
    id: 'empty',
    tone: 'grey',
    chip: '주변 없음',
    label: '주변 시설 없음',
    title: '선택한 조건의 시설이 없어요',
    sub: '지역 반경을 넓히거나 실내/야외 필터를 완화하는 CTA를 제공합니다.',
    cta: '반경 넓히기',
    meta: '0곳',
  },
  {
    id: 'deadline',
    tone: 'orange',
    chip: '마감임박',
    label: '마감임박',
    title: '마지막 예약 가능 시간이 남았어요',
    sub: '대기 없이 결제까지 이어지지만, 결제 전 슬롯 재검증이 필요합니다.',
    cta: '18:00 예약',
    meta: '1개 남음',
  },
  {
    id: 'disabled',
    tone: 'grey',
    chip: '예약 불가',
    label: '예약 불가',
    title: '이 시간대는 예약할 수 없어요',
    sub: '정기 대관, 시설 점검, 최소 인원 미달 같은 이유를 슬롯 안에 표시합니다.',
    cta: '다른 시간 보기',
    meta: '점검',
  },
  {
    id: 'pending',
    tone: 'orange',
    chip: '승인 대기',
    label: '승인 대기',
    title: '시설 승인을 기다리고 있어요',
    sub: '즉시 확정이 아니라 운영자 승인 후 결제/확정으로 넘어갑니다.',
    cta: '신청 내역 보기',
    meta: 'D+1',
  },
  {
    id: 'conflict',
    tone: 'red',
    chip: '슬롯 충돌',
    label: '슬롯 충돌',
    title: '방금 다른 팀이 먼저 예약했어요',
    sub: '같은 슬롯을 선점한 경우 결제 전 재검증 결과를 시트와 persistent row에 남깁니다.',
    cta: '대체 시간 보기',
    meta: '선점됨',
  },
  {
    id: 'closed',
    tone: 'red',
    chip: '임시 휴관',
    label: '임시 휴관',
    title: '오늘은 시설을 열지 않아요',
    sub: '우천, 빙질 정비, 조명 점검처럼 예약 판단에 필요한 휴관 사유를 보여줍니다.',
    cta: '휴관 알림 받기',
    meta: '우천',
  },
  {
    id: 'location',
    tone: 'orange',
    chip: '위치 권한',
    label: '위치 권한 필요',
    title: '현재 위치를 확인할 수 없어요',
    sub: '지도는 유지하고 거리순 대신 지역 필터와 직접 검색으로 복구합니다.',
    cta: '지역 직접 선택',
    meta: '권한 꺼짐',
  },
  {
    id: 'success',
    tone: 'green',
    chip: '예약 완료',
    label: '예약 완료',
    title: '시설 예약이 확정됐어요',
    sub: '지도, 캘린더, 영수증, 팀원 공유를 다음 액션으로 제공합니다.',
    cta: '예약 상세 보기',
    meta: '확정',
  },
];

const venueToneColor = (tone) => (
  tone === 'red' ? 'var(--red500)' :
  tone === 'orange' ? 'var(--orange500)' :
  tone === 'green' ? 'var(--green500)' :
  tone === 'blue' ? 'var(--blue500)' :
  'var(--grey600)'
);

const venueToneBg = (tone) => (
  tone === 'red' ? 'var(--red50)' :
  tone === 'orange' ? 'var(--orange50)' :
  tone === 'green' ? 'var(--green50)' :
  tone === 'blue' ? 'var(--blue50)' :
  'var(--grey100)'
);

const VenueStateCard = ({ state }) => (
  <Card pad={18} style={{ marginTop: 14 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ minWidth: 0 }}>
        <Badge tone={state.tone} size="sm">{state.label}</Badge>
        <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.28, marginTop: 12, color: 'var(--text-strong)' }}>{state.title}</div>
      </div>
      <div style={{ width: 42, height: 42, borderRadius: 14, background: venueToneBg(state.tone), color: venueToneColor(state.tone), display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon name={state.id === 'location' ? 'pin' : state.tone === 'red' ? 'close' : state.tone === 'green' ? 'check' : 'clock'} size={19}/>
      </div>
    </div>
    <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 10 }}>{state.sub}</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
      <div style={{ padding: 12, borderRadius: 13, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 700 }}>상태</div>
        <div className="tab-num" style={{ fontSize: 14, fontWeight: 700, marginTop: 5 }}>{state.meta}</div>
      </div>
      <div style={{ padding: 12, borderRadius: 13, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 700 }}>예상 금액</div>
        <div className="tab-num" style={{ fontSize: 14, fontWeight: 700, marginTop: 5 }}>{state.id === 'empty' ? '0원' : '60,000원'}</div>
      </div>
    </div>
    <button disabled={state.id === 'disabled'} className={ReadinessButtonClass({ size: 'md', variant: ReadinessToneButtonVariant(state.tone), block: true })} style={{ marginTop: 16 }}>
      {state.cta}
    </button>
  </Card>
);

const VenuesStateEdgeBoard = () => {
  const [active, setActive] = React.useState('deadline');
  const current = VENUE_STATE_CASES.find((item) => item.id === active) || VENUE_STATE_CASES[0];
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 92 }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="blue" size="sm">VENUE READINESS</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>시설 상태 UI</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>목록, 지도, 상세, 예약, 운영 콘솔에서 같은 시설 상태 언어를 씁니다.</div>
        </div>
        <div style={{ padding: '16px 20px 0', display: 'flex', gap: 8, overflowX: 'auto' }}>
          {VENUE_STATE_CASES.map((item) => <HapticChip key={item.id} active={active === item.id} onClick={() => setActive(item.id)}>{item.chip}</HapticChip>)}
        </div>
        <div style={{ padding: '0 20px' }}>
          <VenueStateCard state={current}/>
          <Card pad={0} style={{ marginTop: 14 }}>
            <ListItem title="이태원 풋살파크" sub="용산구 · 실내 · 오늘 18:00" trailing={current.label} chev/>
            <ListItem title="잠실 테니스장 4번 코트" sub="송파구 · 야외 · 우천 점검" trailing="임시 휴관" chev/>
          </Card>
        </div>
        <BottomNav active="matches"/>
      </div>
    </Phone>
  );
};

const VenuesBookingSlotConflictBoard = () => {
  const [active, setActive] = React.useState('18:00');
  const slots = [
    ['14:00', '예약 가능', '60000', 'blue'],
    ['16:00', '정기 대관', '0', 'grey'],
    ['18:00', '1개 남음', '60000', 'orange'],
    ['20:00', '선점됨', '60000', 'red'],
    ['22:00', '조명 점검', '0', 'grey'],
  ];
  const current = slots.find(([time]) => time === active) || slots[2];
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 116 }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="orange" size="sm">SLOT CONFLICT</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>예약 슬롯 충돌</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>결제 전 시설/시간/가격을 다시 검증하고 충돌 이유를 슬롯 안에 남깁니다.</div>
        </div>
        <div style={{ padding: 20 }}>
          <Card pad={18}>
            <SectionTitle title="5월 2일 토요일" sub="이태원 풋살파크 A구장"/>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
              {slots.map(([time, label, price, tone]) => {
                const selected = active === time;
                const disabled = tone === 'grey';
                return (
                  <button key={time} disabled={disabled} onClick={() => setActive(time)} className="tm-pressable" style={{ minHeight: 76, borderRadius: 15, padding: 12, textAlign: 'left', background: selected ? 'var(--blue500)' : disabled ? 'var(--grey100)' : 'var(--bg)', color: selected ? 'var(--static-white)' : disabled ? 'var(--grey500)' : 'var(--text-strong)', border: `1px solid ${selected ? 'var(--blue500)' : 'var(--border)'}` }}>
                    <div className="tab-num" style={{ fontSize: 17, fontWeight: 800 }}>{time}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, marginTop: 5, color: selected ? 'var(--static-white)' : venueToneColor(tone) }}>{label}</div>
                    <div className="tab-num" style={{ fontSize: 11, marginTop: 3 }}>{Number(price).toLocaleString()}원</div>
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: 16, padding: 13, borderRadius: 14, background: venueToneBg(current[3]), border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: venueToneColor(current[3]) }}>{current[0]} 슬롯 처리</div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.45, marginTop: 4 }}>{current[3] === 'red' ? '다른 사용자가 선점했습니다. 결제 진입을 막고 대체 시간을 제안합니다.' : current[3] === 'grey' ? '비활성 슬롯은 선택 불가 이유를 함께 표시합니다.' : '예약 전 금액과 시설 운영 상태를 다시 확인합니다.'}</div>
            </div>
          </Card>
          <Toast type="error" msg="20:00 슬롯은 방금 선점되어 예약할 수 없어요."/>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 20px 24px', background: 'rgba(255,255,255,.96)', borderTop: '1px solid var(--border)' }}>
        <button disabled={current[3] === 'red' || current[3] === 'grey'} className={ReadinessButtonClass({ size: 'lg', variant: 'primary', block: true })}>{current[3] === 'red' ? '대체 시간 보기' : '60,000원 예약하기'}</button>
      </div>
    </Phone>
  );
};

const VenuesMapPermissionBoard = () => (
  <Phone>
    <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 24 }}>
      <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
        <Badge tone="orange" size="sm">MAP / LOCATION</Badge>
        <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>지도/위치 권한 예외</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>지도 실패가 탐색 실패로 이어지지 않도록 리스트와 지역 필터를 유지합니다.</div>
      </div>
      <div style={{ padding: 20, display: 'grid', gap: 12 }}>
        <Card pad={0} style={{ overflow: 'hidden' }}>
          <div style={{ height: 170, background: 'var(--blue50)', position: 'relative' }}>
            {[['22%', '32%'], ['54%', '44%'], ['76%', '26%']].map(([left, top], i) => (
              <div key={left} style={{ position: 'absolute', left, top, width: 34, height: 34, borderRadius: 12, background: i === 1 ? 'var(--red500)' : 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center' }}>
                <Icon name="pin" size={15}/>
              </div>
            ))}
            <div style={{ position: 'absolute', left: 14, right: 14, bottom: 14, padding: 12, borderRadius: 14, background: 'rgba(255,255,255,.94)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>위치 권한이 꺼져 있어요</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>거리순 대신 선택 지역 기준으로 보여줍니다.</div>
            </div>
          </div>
        </Card>
        {[
          ['위치 권한 거부', '현재 위치 버튼 대신 지역 직접 선택과 최근 검색 지역을 노출합니다.', '지역 선택', 'orange'],
          ['현재 위치 오래됨', '5분 이상 지난 좌표는 거리 배지를 추정 상태로 표시합니다.', '재확인', 'orange'],
          ['지도 타일 실패', '지도 영역은 오류 배너를 띄우고 리스트 결과는 유지합니다.', '지도 재시도', 'red'],
          ['지도/리스트 불일치', '선택한 지도 핀과 리스트 항목이 다르면 리스트 초점을 다시 맞춥니다.', '동기화', 'blue'],
          ['시설 위치 변경', '운영자가 주소를 바꾼 경우 기존 예약자에게 위치 변경 알림을 보냅니다.', '알림', 'red'],
        ].map(([title, sub, action, tone]) => (
          <Card key={title} pad={14}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 4 }}>{sub}</div>
              </div>
              <Badge tone={tone} size="sm">{action}</Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
  </Phone>
);

const VenuesClosurePriceEdgeBoard = () => (
  <Phone>
    <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 24 }}>
      <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
        <Badge tone="red" size="sm">CLOSURE / PRICE EDGES</Badge>
        <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>휴관/가격/편의시설 예외</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>예약 전후로 운영 정보가 바뀔 때 사용자에게 남길 persistent UI입니다.</div>
      </div>
      <div style={{ padding: 20, display: 'grid', gap: 12 }}>
        {[
          ['임시 휴관', '우천 또는 빙질 정비로 오늘 전체 예약을 막습니다.', '환불/대체', 'red'],
          ['가격 변경', '운영자가 60,000원에서 72,000원으로 변경했습니다. 결제 전 새 금액 확인이 필요합니다.', '확인 시트', 'red'],
          ['편의시설 불가', '샤워실 공사로 편의시설 표시와 상세 안내를 분리합니다.', '안내', 'orange'],
          ['리뷰 없음', '신규 시설은 평점 대신 검수 상태와 운영자 정보를 보여줍니다.', '신규', 'grey'],
          ['운영 검수 대기', '사진/가격표/사업자 정보 검수가 끝나기 전 예약 CTA를 막습니다.', '검수중', 'orange'],
          ['예약자 알림 실패', '휴관 공지를 일부 예약자에게 보내지 못했습니다. 재발송/전화 안내를 남깁니다.', '재발송', 'red'],
        ].map(([title, sub, action, tone]) => (
          <Card key={title} pad={16}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 13, background: venueToneBg(tone), color: venueToneColor(tone), display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Icon name={tone === 'red' ? 'close' : tone === 'orange' ? 'clock' : 'shield'} size={18}/>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
                  <Badge tone={tone} size="sm">{action}</Badge>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{sub}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  </Phone>
);

const VenuesControlInteractionBoard = () => {
  const [sport, setSport] = React.useState('풋살');
  const [slot, setSlot] = React.useState('18:00');
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 116 }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="blue" size="sm">CONTROL STATES</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>필터/날짜/예약 컨트롤</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>지역 필터, 날짜 스트립, 슬롯 선택, 예약 CTA 상태입니다.</div>
        </div>
        <div style={{ padding: 20 }}>
          <Card pad={16}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>종목/시설 필터</div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 12 }}>
              {['전체', '풋살', '테니스', '농구', '배드민턴'].map((item, i) => (
                <HapticChip key={item} active={sport === item} onClick={() => setSport(item)} count={i === 0 ? 128 : i === 1 ? 18 : undefined}>{item}</HapticChip>
              ))}
            </div>
          </Card>
          <Card pad={16} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>날짜와 시간</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 12 }}>
              {['오늘', '내일', '토', '일'].map((day, i) => (
                <button key={day} className={ReadinessButtonClass({ size: 'md', variant: i === 2 ? 'primary' : 'neutral' })}>{day}<br/><span className="tab-num">{i + 2}</span></button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 12 }}>
              {['14:00', '16:00', '18:00', '20:00'].map((time) => <HapticChip key={time} active={slot === time} onClick={() => setSlot(time)}>{time}</HapticChip>)}
            </div>
          </Card>
          <Card pad={16} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>CTA 상태</div>
            <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
              {[
                ['예약하기', 'primary', false],
                ['승인 요청 보내기', 'secondary', false],
                ['예약 불가 · 정기 대관', 'disabled', true],
                ['운영자 · 가격표 수정', 'seller', false],
              ].map(([title, type, disabled]) => (
                <button key={title} disabled={disabled} className={ReadinessButtonClass({ size: 'sm', variant: type === 'primary' ? 'primary' : 'neutral' })}>{title}</button>
              ))}
            </div>
          </Card>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 20px 24px', background: 'rgba(255,255,255,.96)', borderTop: '1px solid var(--border)' }}>
        <button className={ReadinessButtonClass({ size: 'lg', variant: 'primary', block: true })}>{slot} · 60,000원 예약하기</button>
      </div>
    </Phone>
  );
};

const VenuesMotionContractBoard = () => (
  <div style={{ width: 840, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">VENUE MOTION</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>시설 모션 계약</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8 }}>지도와 예약은 즉시 피드백보다 최종 상태가 남는 것이 중요합니다.</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
      {[
        ['Map pin tap', 'pin scale 0.97', 'list row focus', 'detail card sync'],
        ['Date strip', 'chip active', 'slot grid refresh', 'price row update'],
        ['Slot tap', 'slot selected', 'sticky CTA amount', 'conflict recheck'],
        ['Confirm sheet', 'sheet rise 260ms', 'fee breakdown', 'payment route'],
        ['Closure update', 'banner fade', 'slots disabled', 'affected users row'],
        ['Reservation success', 'check reveal', 'calendar/share actions', 'receipt entry'],
      ].map(([trigger, feedback, mid, final], i) => (
        <Card key={trigger} pad={16} style={{ minHeight: 122, background: i % 2 ? 'var(--bg)' : 'var(--grey50)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="tab-num" style={{ width: 32, height: 32, borderRadius: 12, background: i === 0 ? 'var(--blue500)' : 'var(--grey100)', color: i === 0 ? 'var(--static-white)' : 'var(--text-muted)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{i + 1}</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{trigger}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
            {[feedback, mid, final].map((txt, j) => <div key={txt} style={{ padding: 10, borderRadius: 10, background: j === 0 ? 'var(--blue50)' : 'var(--bg)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text)', lineHeight: 1.35 }}>{txt}</div>)}
          </div>
        </Card>
      ))}
    </div>
    <div style={{ marginTop: 18, padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Reduced motion</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 5 }}>pin/list sync, sheet rise, success reveal은 fade-only로 대체합니다. 충돌/휴관은 애니메이션보다 비활성 이유와 대체 CTA가 우선입니다.</div>
    </div>
  </div>
);

const MiniVenueLayout = ({ mode = 'mobile', dark = false }) => {
  const palette = dark
    ? { bg: '#0f1318', panel: '#181d24', weak: '#242a33', border: '#303742', text: 'var(--grey100)', muted: 'var(--grey500)' }
    : { bg: 'var(--static-white)', panel: 'var(--static-white)', weak: 'var(--grey100)', border: 'var(--grey200)', text: 'var(--grey900)', muted: 'var(--grey600)' };
  const isMobile = mode === 'mobile';
  const isTablet = mode === 'tablet';
  const width = isMobile ? 220 : isTablet ? 330 : 520;
  const height = isMobile ? 430 : 390;
  return (
    <div style={{ width, height, borderRadius: isMobile ? 30 : 18, background: palette.bg, color: palette.text, border: `1px solid ${palette.border}`, padding: isMobile ? 16 : 18, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '150px 1fr 170px', gap: 14, overflow: 'hidden' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: palette.muted, fontWeight: 700 }}>Venues</div>
        <div style={{ height: 96, borderRadius: 18, background: palette.weak, border: `1px solid ${palette.border}`, position: 'relative', marginTop: 14, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 18, top: 22, width: 32, height: 32, borderRadius: 12, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center' }}><Icon name="pin" size={15}/></div>
          <div style={{ position: 'absolute', right: 18, bottom: 18, width: 42, height: 8, borderRadius: 999, background: dark ? '#39424d' : '#dbe2ea' }}/>
        </div>
        <div style={{ fontSize: isMobile ? 17 : 19, fontWeight: 700, lineHeight: 1.25, marginTop: 12 }}>이태원<br/>풋살파크</div>
        <div className="tab-num" style={{ fontSize: 22, fontWeight: 800, marginTop: 10 }}>60,000원</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ padding: 14, borderRadius: 16, background: palette.panel, border: `1px solid ${palette.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontSize: 13, color: palette.muted, fontWeight: 700 }}>예약 상태</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6, whiteSpace: 'nowrap' }}>18시 가능</div>
              <div style={{ fontSize: 11, color: palette.muted, marginTop: 4 }}>실내 · 용산구</div>
            </div>
            <Badge tone="orange" size="sm">1개</Badge>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
            <div style={{ padding: 10, borderRadius: 12, background: palette.weak, border: `1px solid ${palette.border}` }}>
              <div style={{ fontSize: 11, color: palette.muted }}>평점</div>
              <div className="tab-num" style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>4.5</div>
            </div>
            <div style={{ padding: 10, borderRadius: 12, background: palette.weak, border: `1px solid ${palette.border}` }}>
              <div style={{ fontSize: 11, color: palette.muted }}>거리</div>
              <div className="tab-num" style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>4.8km</div>
            </div>
          </div>
        </div>
      </div>
      {mode === 'desktop' && (
        <div style={{ minWidth: 0 }}>
          {['시간 예약', '지도 보기', '가격표 확인'].map((item, i) => (
            <button className="tm-pressable tm-break-keep" key={item} style={{ width: '100%', height: 42, borderRadius: 12, background: i === 0 ? 'var(--blue500)' : palette.weak, color: i === 0 ? 'var(--static-white)' : palette.text, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{item}</button>
          ))}
          <div style={{ padding: 10, borderRadius: 12, background: 'var(--orange50)', color: 'var(--orange500)', fontSize: 11, lineHeight: 1.35, fontWeight: 700 }}>예약 전 슬롯/가격/휴관 상태 재검증</div>
        </div>
      )}
    </div>
  );
};

const VenuesResponsiveBoard = () => (
  <div style={{ width: 1280, height: 820, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">RESPONSIVE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>시설 · Mobile/Tablet/Desktop 재배치</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>모바일은 지도/리스트 전환과 고정 예약 CTA, 태블릿은 지도와 예약 패널 분할, 데스크탑은 좌측 필터 + 지도/결과 + 예약 레일로 확장합니다.</div>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginTop: 26 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Mobile 375</div>
        <MiniVenueLayout mode="mobile"/>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Tablet 768</div>
        <MiniVenueLayout mode="tablet"/>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Desktop 1280</div>
        <MiniVenueLayout mode="desktop"/>
      </div>
    </div>
    <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {[
        ['Mobile', '지도/리스트 토글, 날짜 스트립, 슬롯 그리드, 고정 예약 CTA'],
        ['Tablet', '지도와 예약 상태 패널을 2열로 분리'],
        ['Desktop', '좌측 필터, 지도/목록 분할, 예약 액션 레일'],
      ].map(([title, sub]) => (
        <Card key={title} pad={16}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{sub}</div>
        </Card>
      ))}
    </div>
  </div>
);

const VenuesDarkModeBoard = () => (
  <div style={{ width: 920, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">DARK MODE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>시설 · Light/Dark 비교</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>지도, 예약 가능, 마감임박, 휴관, 비활성 슬롯이 dark mode에서도 같은 의미로 읽혀야 합니다.</div>
    <div style={{ display: 'flex', gap: 18, marginTop: 28 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Light</div>
        <MiniVenueLayout mode="tablet"/>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Dark</div>
        <MiniVenueLayout mode="tablet" dark/>
      </div>
    </div>
    <div style={{ marginTop: 22, padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>시설 dark 검수 포인트</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
        {['지도 대비', '마감임박 orange', '휴관 red', '비활성 슬롯'].map((item) => <Badge key={item} tone="grey">{item}</Badge>)}
      </div>
    </div>
  </div>
);

const MERCENARY_STATE_CASES = [
  {
    id: 'open',
    tone: 'blue',
    chip: '지원 가능',
    label: '지원 가능',
    title: '아직 지원할 수 있는 공고예요',
    sub: '포지션, 보상, 경기 시간, 호스트 신뢰를 CTA 전에 함께 확인합니다.',
    cta: '지원 조건 확인',
    meta: 'MF 1명',
  },
  {
    id: 'filled',
    tone: 'red',
    chip: '충원 완료',
    label: '충원 완료',
    title: '필요한 포지션이 모두 찼어요',
    sub: '지원 CTA를 막고 대기 지원, 비슷한 공고, 채팅 진입을 분리합니다.',
    cta: '대기 지원하기',
    meta: '마감',
  },
  {
    id: 'deadline',
    tone: 'orange',
    chip: '마감임박',
    label: '마감임박',
    title: '경기 시작이 얼마 남지 않았어요',
    sub: '지원은 가능하지만 취소 가능 시간, 이동 시간, 준비물 확인이 먼저 필요합니다.',
    cta: '빠른 지원',
    meta: '45분 전',
  },
  {
    id: 'pending',
    tone: 'orange',
    chip: '승인 대기',
    label: '승인 대기',
    title: '호스트 승인을 기다리고 있어요',
    sub: '지원자는 대기 상태와 취소 가능 시간을 보고, 호스트는 승인/거절 액션을 봅니다.',
    cta: '지원 내역 보기',
    meta: '대기중',
  },
  {
    id: 'confirmed',
    tone: 'green',
    chip: '확정',
    label: '확정',
    title: '용병 참가가 확정됐어요',
    sub: '채팅방, 장소, 보상 지급 조건, 출석 체크를 다음 액션으로 제공합니다.',
    cta: '채팅방 열기',
    meta: '확정',
  },
  {
    id: 'reward-change',
    tone: 'red',
    chip: '보상 변경',
    label: '보상 변경',
    title: '보상 조건이 방금 바뀌었어요',
    sub: '기존 지원자에게 새 금액 동의를 받아야 하고, 미동의자는 자동 확정하면 안 됩니다.',
    cta: '새 조건 확인',
    meta: '+5,000원',
  },
  {
    id: 'permission',
    tone: 'orange',
    chip: '내 공고',
    label: '본인 공고',
    title: '내가 올린 공고에는 지원할 수 없어요',
    sub: '지원 CTA 대신 지원자 관리, 보상 수정, 모집 마감 액션을 보여줍니다.',
    cta: '지원자 관리',
    meta: '호스트',
  },
  {
    id: 'cancelled',
    tone: 'red',
    chip: '경기 취소',
    label: '경기 취소',
    title: '경기가 취소된 공고예요',
    sub: '보상/환불, 호스트 공지, 대체 공고 추천을 같은 화면에서 확인할 수 있어야 합니다.',
    cta: '보상 처리 보기',
    meta: '취소',
  },
];

const mercToneColor = (tone) => (
  tone === 'red' ? 'var(--red500)' :
  tone === 'orange' ? 'var(--orange500)' :
  tone === 'green' ? 'var(--green500)' :
  tone === 'blue' ? 'var(--blue500)' :
  'var(--grey600)'
);

const mercToneBg = (tone) => (
  tone === 'red' ? 'var(--red50)' :
  tone === 'orange' ? 'var(--orange50)' :
  tone === 'green' ? 'var(--green50)' :
  tone === 'blue' ? 'var(--blue50)' :
  'var(--grey100)'
);

const MercenaryStateCard = ({ state }) => (
  <Card pad={18} style={{ marginTop: 14 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <Badge tone={state.tone} size="sm">{state.label}</Badge>
        <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.28, marginTop: 12, color: 'var(--text-strong)' }}>{state.title}</div>
      </div>
      <div style={{ width: 42, height: 42, borderRadius: 14, background: mercToneBg(state.tone), color: mercToneColor(state.tone), display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon name={state.tone === 'red' ? 'close' : state.tone === 'green' ? 'check' : state.id === 'open' ? 'people' : 'clock'} size={19}/>
      </div>
    </div>
    <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 10 }}>{state.sub}</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
      <div style={{ padding: 12, borderRadius: 13, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 700 }}>포지션</div>
        <div className="tab-num" style={{ fontSize: 14, fontWeight: 700, marginTop: 5 }}>{state.meta}</div>
      </div>
      <div style={{ padding: 12, borderRadius: 13, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 700 }}>보상</div>
        <div className="tab-num" style={{ fontSize: 14, fontWeight: 700, marginTop: 5 }}>{state.id === 'reward-change' ? '30,000원' : '25,000원'}</div>
      </div>
    </div>
    <button disabled={state.id === 'filled'} className={ReadinessButtonClass({ size: 'md', variant: ReadinessToneButtonVariant(state.tone), block: true })} style={{ marginTop: 16 }}>
      {state.cta}
    </button>
  </Card>
);

const MercenaryStateEdgeBoard = () => {
  const [active, setActive] = React.useState('open');
  const current = MERCENARY_STATE_CASES.find((item) => item.id === active) || MERCENARY_STATE_CASES[0];
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 92 }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="blue" size="sm">MERCENARY READINESS</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>용병 상태 UI</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>목록, 상세, 내 지원, 호스트 관리에서 같은 지원 상태 언어를 씁니다.</div>
        </div>
        <div style={{ padding: '16px 20px 0', display: 'flex', gap: 8, overflowX: 'auto' }}>
          {MERCENARY_STATE_CASES.map((item) => <HapticChip key={item.id} active={active === item.id} onClick={() => setActive(item.id)}>{item.chip}</HapticChip>)}
        </div>
        <div style={{ padding: '0 20px' }}>
          <MercenaryStateCard state={current}/>
          <Card pad={0} style={{ marginTop: 14 }}>
            <ListItem title="FC 스프린트 MF 1명" sub="상암 · 오늘 18:00 · 매너 4.9" trailing={current.label} chev/>
            <ListItem title="다이나믹 FS 골키퍼" sub="잠실 · 내일 20:00 · 보상 30,000원" trailing="승인 대기" chev/>
          </Card>
        </div>
        <BottomNav active="matches"/>
      </div>
    </Phone>
  );
};

const MercenaryPositionFilledBoard = () => {
  const [pos, setPos] = React.useState('MF');
  const positions = [
    ['GK', '충원 완료', 'red'],
    ['DF', '2명 대기', 'orange'],
    ['MF', '1명 모집', 'blue'],
    ['FW', '마감임박', 'orange'],
  ];
  const selected = positions.find(([id]) => id === pos) || positions[2];
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 116 }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="red" size="sm">POSITION FILLED</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>포지션 충원/대기 지원</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>포지션별 지원 가능 여부와 대기 전환을 같은 자리에서 보여줍니다.</div>
        </div>
        <div style={{ padding: 20 }}>
          <Card pad={18}>
            <SectionTitle title="필요 포지션" sub="지원 전 마지막으로 포지션 상태를 재검증합니다."/>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 14 }}>
              {positions.map(([id, label, tone]) => {
                const active = id === pos;
                return (
                  <button key={id} onClick={() => setPos(id)} className="tm-pressable" style={{ minHeight: 72, borderRadius: 15, padding: 12, textAlign: 'left', background: active ? 'var(--blue500)' : 'var(--bg)', color: active ? 'var(--static-white)' : 'var(--text-strong)', border: `1px solid ${active ? 'var(--blue500)' : 'var(--border)'}` }}>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{id}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, marginTop: 6, color: active ? 'var(--static-white)' : mercToneColor(tone) }}>{label}</div>
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: 16, padding: 13, borderRadius: 14, background: mercToneBg(selected[2]), border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: mercToneColor(selected[2]) }}>{selected[0]} 지원 처리</div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.45, marginTop: 4 }}>{selected[2] === 'red' ? '이미 충원된 포지션은 확정 지원을 막고 대기 지원만 허용합니다.' : selected[2] === 'orange' ? '마감임박 또는 대기 상태는 취소 가능 시간과 순번을 표시합니다.' : '지원 조건 확인 시트로 이동할 수 있습니다.'}</div>
            </div>
          </Card>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 20px 24px', background: 'rgba(255,255,255,.96)', borderTop: '1px solid var(--border)' }}>
        <button disabled={selected[2] === 'red'} className={ReadinessButtonClass({ size: 'lg', variant: 'primary', block: true })}>{selected[2] === 'red' ? '대기 지원하기' : `${selected[0]} 포지션 지원`}</button>
      </div>
    </Phone>
  );
};

const MercenaryRewardChangeBoard = () => (
  <Phone>
    <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 24 }}>
      <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
        <Badge tone="red" size="sm">REWARD CHANGE</Badge>
        <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>보상 조건 변경</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>지원 이후 보상이 바뀌면 기존 지원자의 동의를 다시 받아야 합니다.</div>
      </div>
      <div style={{ padding: 20, display: 'grid', gap: 12 }}>
        <Card pad={18}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div>
              <Badge tone="red" size="sm">새 조건 확인 필요</Badge>
              <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.25, marginTop: 12 }}>보상이 변경된<br/>용병 공고</div>
            </div>
            <NumberDisplay value={30000} unit="원" size={30} sub="변경 보상"/>
          </div>
          <div style={{ marginTop: 16 }}>
            <MoneyRow label="기존 보상" amount={25000}/>
            <MoneyRow label="변경 보상" amount={30000} accent/>
          </div>
        </Card>
        {[
          ['기존 지원자 동의 대기', '지원자 3명에게 새 보상 조건 확인 요청을 보냈습니다.', '3명', 'orange'],
          ['확정자 재확인 필요', '이미 확정된 지원자는 동의 전까지 경기 확정 상태로 보이면 안 됩니다.', '잠금', 'red'],
          ['호스트 변경 사유', '급구, 경기 시간 변경, 역할 변경 중 하나를 선택해야 합니다.', '필수', 'orange'],
          ['미동의자 자동 취소', '마감 전까지 동의하지 않으면 대기 지원으로 전환합니다.', 'D-1', 'grey'],
        ].map(([title, sub, action, tone]) => (
          <Card key={title} pad={14}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 4 }}>{sub}</div>
              </div>
              <Badge tone={tone} size="sm">{action}</Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
  </Phone>
);

const MercenaryHostTrustBoard = () => (
  <Phone>
    <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 24 }}>
      <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
        <Badge tone="orange" size="sm">HOST TRUST</Badge>
        <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>호스트 신뢰/안전</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>평판은 실제/추정/샘플 상태를 구분하고, 신고 이력은 지원 전에 보여줍니다.</div>
      </div>
      <div style={{ padding: 20 }}>
        <Card pad={18}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 16, background: 'var(--grey100)', display: 'grid', placeItems: 'center', color: 'var(--grey600)' }}><Icon name="people" size={22}/></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>정민 호스트</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>용병 매칭 24회 · 노쇼 0%</div>
            </div>
            <Badge tone="green" size="sm">검증됨</Badge>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 16 }}>
            <KPIStat label="매너" value="4.9"/>
            <KPIStat label="응답률" value="96%"/>
            <KPIStat label="신고" value="0"/>
          </div>
        </Card>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {[
            ['신고 이력 경고', '최근 30일 내 정산 지연 신고가 있으면 지원 전 확인 시트를 띄웁니다.', '확인', 'orange'],
            ['보상 지급 방식', '경기 완료 후 24시간 뒤 지급인지, 현장 지급인지 명확히 표시합니다.', '필수', 'blue'],
            ['후기 없음', '신규 호스트는 평점 대신 인증 정보와 운영자 검수 상태를 보여줍니다.', '신규', 'grey'],
            ['안전 체크', '아이스하키/풋살 등 장비 필수 종목은 준비물 미확인 시 CTA를 막습니다.', '장비', 'red'],
          ].map(([title, sub, action, tone]) => (
            <Card key={title} pad={14}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 4 }}>{sub}</div>
                </div>
                <Badge tone={tone} size="sm">{action}</Badge>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  </Phone>
);

const MercenaryControlInteractionBoard = () => {
  const [position, setPosition] = React.useState('MF');
  const [pay, setPay] = React.useState(25000);
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 116 }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="blue" size="sm">CONTROL STATES</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>지원/취소/확정 컨트롤</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>포지션 칩, 보상 stepper, 지원 확인 시트, 취소 CTA 상태입니다.</div>
        </div>
        <div style={{ padding: 20 }}>
          <Card pad={16}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>포지션 선택</div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 12 }}>
              {['GK', 'DF', 'MF', 'FW'].map((item) => <HapticChip key={item} active={position === item} onClick={() => setPosition(item)}>{item}</HapticChip>)}
            </div>
          </Card>
          <Card pad={16} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>보상 조건</div>
            <div style={{ marginTop: 12, padding: 14, borderRadius: 16, background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <MoneyRow label="현재 보상" amount={pay} accent/>
              <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px', gap: 10, alignItems: 'center', marginTop: 12 }}>
                <button onClick={() => setPay(Math.max(0, pay - 5000))} className={ReadinessButtonClass({ size: 'icon', variant: 'neutral' })}>-</button>
                <div className="tab-num" style={{ textAlign: 'center', fontSize: 20, fontWeight: 800 }}>{pay.toLocaleString()}원</div>
                <button onClick={() => setPay(pay + 5000)} className={ReadinessButtonClass({ size: 'icon', variant: 'primary' })}>+</button>
              </div>
            </div>
          </Card>
          <Card pad={16} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>CTA 상태</div>
            <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
              {[
                ['지원하기', 'primary', false],
                ['지원 취소 요청', 'secondary', false],
                ['충원 완료 · 대기 지원', 'disabled', true],
                ['호스트 · 지원자 확정', 'host', false],
              ].map(([title, type, disabled]) => (
                <button key={title} disabled={disabled} className={ReadinessButtonClass({ size: 'sm', variant: type === 'primary' ? 'primary' : 'neutral' })}>{title}</button>
              ))}
            </div>
          </Card>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 20px 24px', background: 'rgba(255,255,255,.96)', borderTop: '1px solid var(--border)' }}>
        <button className={ReadinessButtonClass({ size: 'lg', variant: 'primary', block: true })}>{position} · 지원 조건 확인</button>
      </div>
    </Phone>
  );
};

const MercenaryMotionContractBoard = () => (
  <div style={{ width: 840, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">MERCENARY MOTION</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>용병 모션 계약</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8 }}>지원형 액션은 조건 확인, 확정, 채팅 진입, 취소 복구 상태가 화면에 남아야 합니다.</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
      {[
        ['포지션 칩', 'chip scale 0.97', '지원 가능 수 갱신', 'CTA 상태 반영'],
        ['지원 제출', 'button loading', '조건 확인 시트', '승인 대기 row'],
        ['지원자 확정', 'row highlight', '확정 toast', '채팅 카드 생성'],
        ['보상 변경', 'amount pulse', '동의 요청 시트', '미동의자 잠금'],
        ['지원 취소', 'confirm sheet', '취소 사유 선택', '목록 복귀'],
        ['경기 취소', 'red banner', '보상/환불 상태', '대체 공고 추천'],
      ].map(([trigger, feedback, mid, final], i) => (
        <Card key={trigger} pad={16} style={{ minHeight: 122, background: i % 2 ? 'var(--bg)' : 'var(--grey50)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="tab-num" style={{ width: 32, height: 32, borderRadius: 12, background: i === 0 ? 'var(--blue500)' : 'var(--grey100)', color: i === 0 ? 'var(--static-white)' : 'var(--text-muted)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{i + 1}</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{trigger}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
            {[feedback, mid, final].map((txt, j) => <div key={txt} style={{ padding: 10, borderRadius: 10, background: j === 0 ? 'var(--blue50)' : 'var(--bg)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text)', lineHeight: 1.35 }}>{txt}</div>)}
          </div>
        </Card>
      ))}
    </div>
    <div style={{ marginTop: 18, padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Reduced motion</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 5 }}>chip scale, amount pulse, row highlight는 fade-only로 대체합니다. 보상 변경/경기 취소는 모션보다 persistent 상태 row가 우선입니다.</div>
    </div>
  </div>
);

const MiniMercenaryLayout = ({ mode = 'mobile', dark = false }) => {
  const palette = dark
    ? { bg: '#0f1318', panel: '#181d24', weak: '#242a33', border: '#303742', text: 'var(--grey100)', muted: 'var(--grey500)' }
    : { bg: 'var(--static-white)', panel: 'var(--static-white)', weak: 'var(--grey100)', border: 'var(--grey200)', text: 'var(--grey900)', muted: 'var(--grey600)' };
  const isMobile = mode === 'mobile';
  const isTablet = mode === 'tablet';
  const width = isMobile ? 220 : isTablet ? 330 : 520;
  const height = isMobile ? 430 : 390;
  return (
    <div style={{ width, height, borderRadius: isMobile ? 30 : 18, background: palette.bg, color: palette.text, border: `1px solid ${palette.border}`, padding: isMobile ? 16 : 18, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '150px 1fr 170px', gap: 14, overflow: 'hidden' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: palette.muted, fontWeight: 700 }}>Mercenary</div>
        <div style={{ width: isMobile ? 96 : 104, height: isMobile ? 96 : 104, borderRadius: 18, background: palette.weak, border: `1px solid ${palette.border}`, display: 'grid', placeItems: 'center', color: dark ? '#c9d2dc' : 'var(--grey600)', marginTop: 14 }}><Icon name="people" size={34}/></div>
        <div style={{ fontSize: isMobile ? 17 : 19, fontWeight: 700, lineHeight: 1.25, marginTop: 12 }}>FC 스프린트<br/>MF 1명</div>
        <div className="tab-num" style={{ fontSize: 22, fontWeight: 800, marginTop: 10 }}>25,000원</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ padding: 14, borderRadius: 16, background: palette.panel, border: `1px solid ${palette.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontSize: 13, color: palette.muted, fontWeight: 700 }}>지원 상태</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6, whiteSpace: 'nowrap' }}>지원 가능</div>
              <div style={{ fontSize: 11, color: palette.muted, marginTop: 4, whiteSpace: 'nowrap' }}>18시 · 상암</div>
            </div>
            <Badge tone="orange" size="sm">급구</Badge>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
            <div style={{ padding: 10, borderRadius: 12, background: palette.weak, border: `1px solid ${palette.border}` }}>
              <div style={{ fontSize: 11, color: palette.muted }}>매너</div>
              <div className="tab-num" style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>4.9</div>
            </div>
            <div style={{ padding: 10, borderRadius: 12, background: palette.weak, border: `1px solid ${palette.border}` }}>
              <div style={{ fontSize: 11, color: palette.muted }}>거리</div>
              <div className="tab-num" style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>1.2km</div>
            </div>
          </div>
        </div>
      </div>
      {mode === 'desktop' && (
        <div style={{ minWidth: 0 }}>
          {['지원 조건 확인', '호스트 신뢰 보기', '채팅 문의'].map((item, i) => (
            <button className="tm-pressable tm-break-keep" key={item} style={{ width: '100%', height: 42, borderRadius: 12, background: i === 0 ? 'var(--blue500)' : palette.weak, color: i === 0 ? 'var(--static-white)' : palette.text, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{item}</button>
          ))}
          <div style={{ padding: 10, borderRadius: 12, background: 'var(--orange50)', color: 'var(--orange500)', fontSize: 11, lineHeight: 1.35, fontWeight: 700 }}>지원 전 포지션/보상/호스트 신뢰 재검증</div>
        </div>
      )}
    </div>
  );
};

const MercenaryResponsiveBoard = () => (
  <div style={{ width: 1280, height: 820, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">RESPONSIVE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>용병 · Mobile/Tablet/Desktop 재배치</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>모바일은 공고 피드와 고정 지원 CTA, 태블릿은 공고/지원 상태 분할, 데스크탑은 필터 + 공고 결과 + 지원/호스트 레일로 확장합니다.</div>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginTop: 26 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Mobile 375</div>
        <MiniMercenaryLayout mode="mobile"/>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Tablet 768</div>
        <MiniMercenaryLayout mode="tablet"/>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Desktop 1280</div>
        <MiniMercenaryLayout mode="desktop"/>
      </div>
    </div>
    <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {[
        ['Mobile', '포지션 칩, 공고 피드, 조건 확인 시트, 고정 지원 CTA'],
        ['Tablet', '공고 상세와 지원 상태 패널을 2열로 분리'],
        ['Desktop', '좌측 필터, 공고 결과, 지원/호스트 액션 레일'],
      ].map(([title, sub]) => (
        <Card key={title} pad={16}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{sub}</div>
        </Card>
      ))}
    </div>
  </div>
);

const MercenaryDarkModeBoard = () => (
  <div style={{ width: 920, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">DARK MODE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>용병 · Light/Dark 비교</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>지원 가능, 급구, 충원 완료, 보상 변경, 호스트 신뢰가 dark mode에서도 같은 의미로 읽혀야 합니다.</div>
    <div style={{ display: 'flex', gap: 18, marginTop: 28 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Light</div>
        <MiniMercenaryLayout mode="tablet"/>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Dark</div>
        <MiniMercenaryLayout mode="tablet" dark/>
      </div>
    </div>
    <div style={{ marginTop: 22, padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>용병 dark 검수 포인트</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
        {['급구 orange', '충원 red', '보상 tabular', '호스트 신뢰'].map((item) => <Badge key={item} tone="grey">{item}</Badge>)}
      </div>
    </div>
  </div>
);

Object.assign(window, {
  ReadinessAuditDashboard,
  AuthStateEdgeBoard,
  AuthValidationAndPermissionBoard,
  AuthControlStatesBoard,
  AuthMotionContractBoard,
  AuthResponsiveBoard,
  AuthDarkModeBoard,
  HomeStateEdgeBoard,
  HomeRecommendationEdgeBoard,
  HomeControlInteractionBoard,
  HomeMotionContractBoard,
  HomeResponsiveBoard,
  HomeDarkModeBoard,
  MatchesStateEdgeBoard,
  MatchesJoinSheetStatesBoard,
  MatchesMapPermissionBoard,
  MatchesControlInteractionBoard,
  MatchesMotionContractBoard,
  MatchesResponsiveBoard,
  MatchesDarkModeBoard,
  TeamsStateEdgeBoard,
  TeamsRolePermissionBoard,
  TeamsJoinApprovalBoard,
  TeamsMatchOpsConflictBoard,
  TeamsControlInteractionBoard,
  TeamsMotionContractBoard,
  TeamsResponsiveBoard,
  TeamsDarkModeBoard,
  LessonsAcademyHierarchyBoard,
  LessonsStateEdgeBoard,
  LessonsTicketLifecycleBoard,
  LessonsScheduleExceptionsBoard,
  LessonsControlInteractionBoard,
  LessonsMotionContractBoard,
  LessonsResponsiveBoard,
  LessonsDarkModeBoard,
  MarketplaceStateEdgeBoard,
  MarketplaceOrderLifecycleBoard,
  MarketplaceUploadPriceEdgeBoard,
  MarketplaceDisputeSafetyBoard,
  MarketplaceControlInteractionBoard,
  MarketplaceMotionContractBoard,
  MarketplaceResponsiveBoard,
  MarketplaceDarkModeBoard,
  VenuesStateEdgeBoard,
  VenuesBookingSlotConflictBoard,
  VenuesMapPermissionBoard,
  VenuesClosurePriceEdgeBoard,
  VenuesControlInteractionBoard,
  VenuesMotionContractBoard,
  VenuesResponsiveBoard,
  VenuesDarkModeBoard,
  MercenaryStateEdgeBoard,
  MercenaryPositionFilledBoard,
  MercenaryRewardChangeBoard,
  MercenaryHostTrustBoard,
  MercenaryControlInteractionBoard,
  MercenaryMotionContractBoard,
  MercenaryResponsiveBoard,
  MercenaryDarkModeBoard,
});
