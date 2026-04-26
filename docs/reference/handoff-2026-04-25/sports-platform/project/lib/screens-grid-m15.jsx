/* fix32 — M15 설정·약관·상태 canonical grid.
   ID schema: m15-{mb|tb|dt}-{main|detail|flow|state|components|assets|motion}[-{sub}]
   Routes: /settings  /settings/account  /settings/notifications  /settings/privacy  /settings/terms
   Light-only. Uses canonical: SettingsAccount, SettingsNotifs, StatePages,
   SettingsStateEdgeBoard, SettingsNotificationPermissionBoard,
   SettingsDestructiveConfirmBoard, SettingsLegalVersionBoard. */

const M15_MB_W = 375;
const M15_MB_H = 812;
const M15_TB_W = 768;
const M15_TB_H = 1024;
const M15_DT_W = 1280;
const M15_DT_H = 820;

/* ---------- local helpers (M15-prefixed to avoid scope collision) ---------- */

const M15ComponentSwatch = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 12, background: 'var(--grey50)', border: '1px solid var(--grey100)' }}>
    <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</div>
  </div>
);

const M15AssetSwatch = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>{children}</div>
  </div>
);

/* M15ColorSwatch — uses tm-text-micro, no inline fontSize */
const M15ColorSwatch = ({ token, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
    <div style={{ width: 36, height: 36, borderRadius: 8, background: value, border: '1px solid var(--grey100)' }}/>
    <div className="tm-text-micro tm-tabular">{token}</div>
  </div>
);

/* M15ToggleSwitch — 44×44px touch target, WCAG 2.1 AA */
const M15ToggleSwitch = ({ on = false, disabled = false, label }) => {
  const trackBg = on ? 'var(--blue500)' : 'var(--grey300)';
  const knobLeft = on ? 20 : 2;
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      style={{
        width: 44, height: 44,
        minWidth: 44,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: 0, opacity: disabled ? 0.4 : 1,
      }}
    >
      <div style={{
        width: 44, height: 26,
        borderRadius: 'var(--r-pill)',
        background: trackBg,
        position: 'relative',
        transition: 'background-color var(--dur-base) var(--ease-out-quart)',
      }}>
        <div style={{
          position: 'absolute',
          top: 2, left: knobLeft,
          width: 22, height: 22,
          borderRadius: '50%',
          background: 'var(--static-white)',
          boxShadow: '0 1px 3px rgba(0,0,0,.18)',
          transition: 'left var(--dur-base) var(--ease-out-quart)',
        }}/>
      </div>
    </button>
  );
};

/* M15SettingsRow — 44px touch target, chevron or right slot */
const M15SettingsRow = ({ label, sub, right, danger, topBorder }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 44, padding: '10px 0',
    borderTop: topBorder ? '1px solid var(--grey100)' : 'none',
    borderBottom: '1px solid var(--grey100)',
  }}>
    <div style={{ flex: 1 }}>
      <div className="tm-text-body" style={{ color: danger ? 'var(--red500)' : 'var(--text-strong)' }}>{label}</div>
      {sub && <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
    {right !== undefined ? right : (
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--grey400)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="m9 6 6 6-6 6"/>
      </svg>
    )}
  </div>
);

/* M15SectionHeader — group label */
const M15SectionHeader = ({ label }) => (
  <div style={{ padding: '20px 0 6px' }}>
    <div className="tm-text-label" style={{ color: 'var(--text-muted)', letterSpacing: '0.02em' }}>{label}</div>
  </div>
);

/* M15LegalVersionBadge — version pill for terms pages */
const M15LegalVersionBadge = ({ version, date }) => (
  <div style={{
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '4px 10px',
    borderRadius: 'var(--r-pill)',
    background: 'var(--grey100)',
    border: '1px solid var(--grey200)',
  }}>
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--grey600)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
    </svg>
    <span className="tm-text-micro" style={{ color: 'var(--grey700)' }}>{version}</span>
    <span className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>· {date}</span>
  </div>
);

/* M15DangerButton — destructive CTA (회원탈퇴/로그아웃) */
const M15DangerButton = ({ label, sub }) => (
  <button
    className="tm-btn tm-btn-block"
    aria-label={label}
    style={{
      minHeight: 44,
      background: 'var(--red-alpha-08)',
      color: 'var(--red500)',
      borderRadius: 'var(--r-md)',
      border: '1px solid rgba(240,68,82,0.2)',
      flexDirection: 'column',
      gap: 2,
      padding: '10px 20px',
    }}
  >
    <span className="tm-text-body" style={{ color: 'var(--red500)', fontWeight: 600 }}>{label}</span>
    {sub && <span className="tm-text-caption" style={{ color: 'var(--red500)', opacity: 0.7 }}>{sub}</span>}
  </button>
);

/* M15NotifRow — notification toggle row with 44×44 touch target */
const M15NotifRow = ({ label, sub, on = true }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 56, padding: '6px 0',
    borderBottom: '1px solid var(--grey100)',
  }}>
    <div style={{ flex: 1, paddingRight: 12 }}>
      <div className="tm-text-body">{label}</div>
      {sub && <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
    <M15ToggleSwitch on={on} label={label}/>
  </div>
);

/* ---------- M15 data constants ---------- */

const M15_NOTIF_PREFS = [
  { key: 'teamApplication', label: '팀 가입 신청',   sub: '내 팀에 새 가입 신청이 있을 때', on: true },
  { key: 'matchCompleted',  label: '매치 확정',       sub: '신청한 매치가 확정될 때',        on: true },
  { key: 'eloChanged',      label: 'ELO 변동',        sub: '실력 점수가 변경될 때',          on: false },
  { key: 'chatMessage',     label: '채팅 메시지',     sub: '새 메시지를 받을 때',            on: true },
  { key: 'mercenaryPost',   label: '용병 모집',       sub: '관심 종목 용병 모집 글',         on: true },
  { key: 'teamMatch',       label: '팀 매치',         sub: '팀 경기 확정·변경 알림',         on: true },
  { key: 'payment',         label: '결제·환불',       sub: '결제 완료 또는 환불 시',         on: true },
  { key: 'system',          label: '시스템 공지',     sub: '서비스 점검·정책 변경',          on: false },
];

const M15_SETTINGS_MENU = [
  { group: '계정', items: [
    { label: '이메일 변경',       sub: 'kim@example.com' },
    { label: '비밀번호 변경' },
    { label: '연결된 소셜 계정', sub: '카카오 · 네이버' },
  ]},
  { group: '알림', items: [
    { label: '알림 설정',     sub: '8개 항목 관리' },
    { label: 'OS 알림 권한', sub: '허용됨' },
  ]},
  { group: '보안 및 개인정보', items: [
    { label: '개인정보 처리 방침' },
    { label: '위치 정보 동의' },
  ]},
  { group: '약관', items: [
    { label: '이용약관',            sub: 'v2.1 · 2025.01.01' },
    { label: '개인정보처리방침',    sub: 'v1.8 · 2025.03.15' },
    { label: '마케팅 정보 수신 동의' },
  ]},
  { group: '앱 정보', items: [
    { label: '버전',             sub: '1.4.2 (최신)' },
    { label: '오픈소스 라이선스' },
  ]},
];

/* ==========================================================================
   m15-mb-main: 설정 entry list
   Canonical reference: SettingsNotifs structure (sectioned grouped row list)
   ========================================================================== */
const M15MobileMain = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <AppBar title="설정" leading={null} trailing={null}/>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
        {M15_SETTINGS_MENU.map((section) => (
          <div key={section.group} style={{ paddingBottom: 8 }}>
            <M15SectionHeader label={section.group}/>
            {section.items.map((item, i) => (
              <M15SettingsRow
                key={item.label}
                label={item.label}
                sub={item.sub}
                topBorder={i === 0}
              />
            ))}
          </div>
        ))}
        <div style={{ marginTop: 24, display: 'grid', gap: 8 }}>
          <M15DangerButton label="로그아웃"/>
          <M15DangerButton label="회원탈퇴" sub="탈퇴 후 30일 내 복구 가능"/>
        </div>
      </div>
      <BottomNav active="my"/>
    </div>
  </Phone>
);

/* ==========================================================================
   m15-tb-main: 설정 메뉴 (태블릿 768) — sidebar + content panel
   ========================================================================== */
const M15TabletMain = () => (
  <div style={{ width: M15_TB_W, height: M15_TB_H, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'grid', gridTemplateColumns: '240px 1fr', overflow: 'hidden' }}>
    {/* sidebar */}
    <nav aria-label="설정 메뉴" style={{ borderRight: '1px solid var(--grey100)', padding: '24px 0', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <div style={{ padding: '0 20px 16px' }} className="tm-text-subhead">설정</div>
      {M15_SETTINGS_MENU.map((section) => (
        <div key={section.group}>
          <div className="tm-text-micro" style={{ color: 'var(--text-muted)', padding: '12px 20px 4px' }}>{section.group}</div>
          {section.items.map((item, i) => (
            <button
              key={item.label}
              className="tm-btn tm-btn-ghost tm-btn-md"
              style={{
                justifyContent: 'flex-start', width: '100%',
                padding: '10px 20px', borderRadius: 0,
                background: i === 0 && section.group === '알림' ? 'var(--blue50)' : 'transparent',
                color: i === 0 && section.group === '알림' ? 'var(--blue600)' : 'var(--text-strong)',
              }}
            >
              <span className="tm-text-body">{item.label}</span>
            </button>
          ))}
        </div>
      ))}
      <div style={{ marginTop: 'auto', padding: '16px 20px', display: 'grid', gap: 8 }}>
        <M15DangerButton label="로그아웃"/>
        <M15DangerButton label="회원탈퇴"/>
      </div>
    </nav>
    {/* content — SettingsNotifs canonical structure */}
    <main style={{ padding: 32, overflowY: 'auto' }}>
      <div className="tm-text-heading" style={{ marginBottom: 20 }}>알림 설정</div>
      {M15_NOTIF_PREFS.map((p) => (
        <M15NotifRow key={p.key} label={p.label} sub={p.sub} on={p.on}/>
      ))}
    </main>
  </div>
);

/* ==========================================================================
   m15-dt-main: 설정 메뉴 (데스크탑 1280)
   ========================================================================== */
const M15DesktopMain = () => (
  <div style={{ width: M15_DT_W, height: M15_DT_H, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'grid', gridTemplateColumns: '240px 1fr', overflow: 'hidden' }}>
    <aside style={{ borderRight: '1px solid var(--grey100)', padding: '24px 0', display: 'flex', flexDirection: 'column', background: 'var(--grey50)', overflowY: 'auto' }}>
      <div style={{ padding: '0 24px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--blue500)', display: 'grid', placeItems: 'center', color: 'var(--static-white)', fontWeight: 800 }}>T</div>
        <div className="tm-text-body-lg">설정</div>
      </div>
      {M15_SETTINGS_MENU.map((section) => (
        <div key={section.group}>
          <div className="tm-text-micro" style={{ color: 'var(--text-muted)', padding: '14px 24px 4px' }}>{section.group.toUpperCase()}</div>
          {section.items.map((item) => (
            <button
              key={item.label}
              className="tm-btn tm-btn-ghost tm-btn-md"
              style={{
                justifyContent: 'flex-start', width: '100%',
                padding: '10px 24px', borderRadius: 0,
                color: item.label === '알림 설정' ? 'var(--blue600)' : 'var(--text)',
                background: item.label === '알림 설정' ? 'var(--blue-alpha-08)' : 'transparent',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ))}
      <div style={{ marginTop: 'auto', padding: '16px 24px', display: 'grid', gap: 8 }}>
        <M15DangerButton label="로그아웃"/>
        <M15DangerButton label="회원탈퇴"/>
      </div>
    </aside>
    <main style={{ padding: 40, overflowY: 'auto' }}>
      <div className="tm-text-title" style={{ marginBottom: 8 }}>알림 설정</div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginBottom: 24 }}>수신할 알림 유형을 선택하세요. 변경사항은 즉시 저장됩니다.</div>
      <div style={{ maxWidth: 600 }}>
        {M15_NOTIF_PREFS.map((p) => (
          <M15NotifRow key={p.key} label={p.label} sub={p.sub} on={p.on}/>
        ))}
      </div>
    </main>
  </div>
);

/* ==========================================================================
   m15-mb-detail: 알림 설정 detail — canonical SettingsNotifs
   ========================================================================== */
const M15MobileDetail = () => <SettingsNotifs/>;

/* ==========================================================================
   m15-mb-flow-account: 계정 관리 — canonical SettingsAccount
   ========================================================================== */
const M15MobileFlowAccount = () => <SettingsAccount/>;

/* ==========================================================================
   m15-mb-flow-terms: 약관·버전 — canonical SettingsLegalVersionBoard
   ========================================================================== */
const M15MobileFlowTerms = () => <SettingsLegalVersionBoard/>;

/* ==========================================================================
   m15-mb-state-loading: 설정 skeleton
   Base: SettingsNotifs wireframe with Skeleton rows
   ========================================================================== */
const M15MobileStateLoading = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TopNav title="알림 설정"/>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {/* group header skeleton */}
        <div style={{ paddingBottom: 8 }}>
          <Skeleton h={12} w="40%" r={4} mb={16}/>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              minHeight: 56, padding: '6px 0',
              borderBottom: '1px solid var(--grey100)',
            }}>
              <div style={{ flex: 1 }}>
                <Skeleton h={14} w="52%" r={6} mb={6}/>
                <Skeleton h={11} w="72%" r={4}/>
              </div>
              <div style={{ width: 44, height: 26, borderRadius: 'var(--r-pill)', background: 'var(--grey150)', flexShrink: 0 }}/>
            </div>
          ))}
        </div>
      </div>
    </div>
  </Phone>
);

/* ==========================================================================
   m15-mb-state-success: 설정 저장 완료
   Base: SettingsNotifs wireframe + success toast (저장됐어요)
   ========================================================================== */
const M15MobileStateSuccess = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TopNav title="알림 설정"/>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {M15_NOTIF_PREFS.map((p) => (
          <M15NotifRow key={p.key} label={p.label} sub={p.sub} on={p.on}/>
        ))}
      </div>
      {/* Success toast — 저장 완료, enter-up animation */}
      <Toast type="success" msg="알림 설정이 저장됐어요"/>
    </div>
  </Phone>
);

/* ==========================================================================
   m15-mb-state-permission: OS 알림 권한 거부
   Canonical: SettingsNotificationPermissionBoard
   ========================================================================== */
const M15MobileStatePermission = () => <SettingsNotificationPermissionBoard/>;

/* ==========================================================================
   m15-mb-state-error: 설정 로드/저장 실패
   Canonical: SettingsStateEdgeBoard (loading-error case)
   ========================================================================== */
const M15MobileStateError = () => <SettingsStateEdgeBoard/>;

/* ==========================================================================
   m15-mb-components: component inventory
   ========================================================================== */
const M15MobileComponentsBoard = () => (
  <div style={{ width: M15_MB_W, height: M15_MB_H, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflow: 'hidden' }}>
    <Badge tone="blue" size="sm">m15-mb-components</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M15 모바일 · 사용 컴포넌트</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>설정·약관·상태 화면이 사용하는 primitives</div>
    <div style={{ display: 'grid', gap: 10, marginTop: 14, overflowY: 'auto', maxHeight: 680 }}>

      <M15ComponentSwatch label="M15ToggleSwitch · 44×44px touch target (WCAG 2.1 AA)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <M15ToggleSwitch on={true} label="켜짐"/>
            <span className="tm-text-caption">켜짐 (blue500)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <M15ToggleSwitch on={false} label="꺼짐"/>
            <span className="tm-text-caption">꺼짐 (grey300)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <M15ToggleSwitch on={false} disabled label="비활성"/>
            <span className="tm-text-caption">비활성 (opacity .4)</span>
          </div>
          <div className="tm-text-micro" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
            44×44 · role=switch · aria-checked · aria-label 필수
          </div>
        </div>
      </M15ComponentSwatch>

      <M15ComponentSwatch label="M15SettingsRow · 44px min-height · chevron">
        <div style={{ width: '100%' }}>
          <M15SettingsRow label="이메일 변경" sub="kim@example.com" topBorder/>
          <M15SettingsRow label="비밀번호 변경"/>
        </div>
      </M15ComponentSwatch>

      <M15ComponentSwatch label="M15LegalVersionBadge · version chip">
        <M15LegalVersionBadge version="v2.1" date="2025.01.01"/>
        <M15LegalVersionBadge version="v1.8" date="2025.03.15"/>
      </M15ComponentSwatch>

      <M15ComponentSwatch label="M15DangerButton · 회원탈퇴 / 로그아웃">
        <div style={{ width: '100%' }}>
          <M15DangerButton label="회원탈퇴" sub="탈퇴 후 30일 내 복구 가능"/>
        </div>
      </M15ComponentSwatch>

      <M15ComponentSwatch label="M15NotifRow · toggle + label + sub (56px)">
        <div style={{ width: '100%' }}>
          <M15NotifRow label="팀 가입 신청" sub="내 팀에 새 가입 신청이 있을 때" on={true}/>
          <M15NotifRow label="ELO 변동" sub="실력 점수가 변경될 때" on={false}/>
        </div>
      </M15ComponentSwatch>

      <M15ComponentSwatch label="Toast (signatures.jsx) · 저장 완료">
        <Toast type="success" msg="알림 설정이 저장됐어요"/>
      </M15ComponentSwatch>

      <M15ComponentSwatch label="Skeleton (signatures.jsx) · 로딩 shimmer">
        <div style={{ width: '100%', display: 'grid', gap: 8 }}>
          <Skeleton h={14} w="55%" r={6}/>
          <Skeleton h={11} w="75%" r={4}/>
        </div>
      </M15ComponentSwatch>

      <M15ComponentSwatch label="Input · label+id 연결 (WCAG)">
        <div style={{ width: '100%' }}>
          <label htmlFor="m15-demo-email" style={{ display: 'block', marginBottom: 4 }}>
            <span className="tm-text-label">이메일</span>
          </label>
          <input id="m15-demo-email" className="tm-input" placeholder="이메일 주소" type="email"/>
        </div>
      </M15ComponentSwatch>

    </div>
  </div>
);

/* ==========================================================================
   m15-mb-assets: token inventory
   ========================================================================== */
const M15MobileAssetsBoard = () => (
  <div style={{ width: M15_MB_W, height: M15_MB_H, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflow: 'hidden' }}>
    <Badge tone="blue" size="sm">m15-mb-assets</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M15 모바일 · 사용 토큰/에셋</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>설정·약관 화면이 사용하는 디자인 토큰 인벤토리</div>
    <div style={{ display: 'grid', gap: 14, marginTop: 14, overflowY: 'auto', maxHeight: 680 }}>

      <M15AssetSwatch label="Color · brand / CTA">
        <M15ColorSwatch token="blue500" value="var(--blue500)"/>
        <M15ColorSwatch token="blue50" value="var(--blue50)"/>
        <M15ColorSwatch token="blue-alpha-08" value="var(--blue-alpha-08)"/>
      </M15AssetSwatch>

      <M15AssetSwatch label="Color · danger">
        <M15ColorSwatch token="red500" value="var(--red500)"/>
        <M15ColorSwatch token="red50" value="var(--red50)"/>
        <M15ColorSwatch token="red-alpha-08" value="var(--red-alpha-08)"/>
      </M15AssetSwatch>

      <M15AssetSwatch label="Color · warning (OS permission)">
        <M15ColorSwatch token="orange500" value="var(--orange500)"/>
        <M15ColorSwatch token="orange50" value="var(--orange50)"/>
      </M15AssetSwatch>

      <M15AssetSwatch label="Color · semantic (toast success)">
        <M15ColorSwatch token="green500" value="var(--green500)"/>
        <M15ColorSwatch token="grey900 (toast bg)" value="var(--grey900)"/>
      </M15AssetSwatch>

      <M15AssetSwatch label="Color · neutral hierarchy">
        <M15ColorSwatch token="grey50" value="var(--grey50)"/>
        <M15ColorSwatch token="grey100" value="var(--grey100)"/>
        <M15ColorSwatch token="grey150" value="var(--grey150)"/>
        <M15ColorSwatch token="grey200" value="var(--grey200)"/>
        <M15ColorSwatch token="grey300 (toggle off)" value="var(--grey300)"/>
        <M15ColorSwatch token="grey400" value="var(--grey400)"/>
      </M15AssetSwatch>

      <M15AssetSwatch label="Type · 사용 단계">
        <span className="tm-text-heading">heading</span>
        <span className="tm-text-body-lg">body-lg</span>
        <span className="tm-text-body">body</span>
        <span className="tm-text-label">label</span>
        <span className="tm-text-caption">caption</span>
        <span className="tm-text-micro">micro</span>
      </M15AssetSwatch>

      <M15AssetSwatch label="Spacing · 4-multiple (used)">
        {[4, 8, 12, 16, 20, 24, 32, 40, 48].map((n) => (
          <Badge key={n} tone="grey" size="sm">{`${n}px`}</Badge>
        ))}
      </M15AssetSwatch>

      <M15AssetSwatch label="Control height">
        {['min-h 44 (touch)', 'toggle 26h 44w', 'notif-row 56h', 'btn-lg 56h'].map((t) => (
          <Badge key={t} tone="grey" size="sm">{t}</Badge>
        ))}
      </M15AssetSwatch>

      <M15AssetSwatch label="Radius">
        <Badge tone="grey" size="sm">r-md 12 · card/sheet</Badge>
        <Badge tone="grey" size="sm">r-pill · toggle/badge</Badge>
        <Badge tone="grey" size="sm">r-sm 8 · input</Badge>
      </M15AssetSwatch>

      <M15AssetSwatch label="Icon · lucide (used in M15)">
        <span className="tm-text-caption">chevron-right · check · alert-circle · bell · bell-off · shield · file-text · lock · mail · log-out · trash-2 · edit</span>
      </M15AssetSwatch>

      <M15AssetSwatch label="Motion token">
        <Badge tone="grey" size="sm">dur-base 180ms</Badge>
        <Badge tone="grey" size="sm">ease-out-quart</Badge>
        <Badge tone="grey" size="sm">toggle knob 180ms</Badge>
        <Badge tone="grey" size="sm">toast enter-up 280ms</Badge>
      </M15AssetSwatch>

    </div>
  </div>
);

/* ==========================================================================
   m15-tb-components: tablet component board
   ========================================================================== */
const M15TabletComponentsBoard = () => (
  <div style={{ width: M15_TB_W, height: M15_TB_H, background: 'var(--bg)', padding: 32, fontFamily: 'var(--font)', overflow: 'hidden' }}>
    <Badge tone="blue" size="sm">m15-tb-components</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M15 태블릿 · 사용 컴포넌트</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>설정 화면 태블릿 variants (사이드바 nav + 상세 패널)</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 20 }}>

      <M15ComponentSwatch label="Sidebar nav button · active / default">
        <button className="tm-btn tm-btn-secondary tm-btn-md" style={{ justifyContent: 'flex-start', width: 180 }}>알림 설정</button>
        <button className="tm-btn tm-btn-ghost tm-btn-md" style={{ justifyContent: 'flex-start', width: 180 }}>계정 설정</button>
      </M15ComponentSwatch>

      <M15ComponentSwatch label="M15ToggleSwitch · 44×44px">
        <M15ToggleSwitch on={true} label="켜짐"/>
        <M15ToggleSwitch on={false} label="꺼짐"/>
      </M15ComponentSwatch>

      <M15ComponentSwatch label="M15SettingsRow · chevron">
        <div style={{ width: 280 }}>
          <M15SettingsRow label="이메일 변경" sub="kim@example.com" topBorder/>
        </div>
      </M15ComponentSwatch>

      <M15ComponentSwatch label="M15LegalVersionBadge">
        <M15LegalVersionBadge version="v2.1" date="2025.01.01"/>
      </M15ComponentSwatch>

      <M15ComponentSwatch label="M15DangerButton">
        <div style={{ width: 240 }}>
          <M15DangerButton label="회원탈퇴" sub="복구 30일"/>
        </div>
      </M15ComponentSwatch>

      <M15ComponentSwatch label="Input · label+id (a11y)">
        <div style={{ width: 240 }}>
          <label htmlFor="m15-tb-input">
            <span className="tm-text-label" style={{ display: 'block', marginBottom: 4 }}>이메일</span>
          </label>
          <input id="m15-tb-input" className="tm-input" placeholder="이메일"/>
        </div>
      </M15ComponentSwatch>

      <M15ComponentSwatch label="Wave21DToggleRow (readiness pattern)">
        <div style={{ width: 280 }}>
          <Wave21DToggleRow title="중요 알림" sub="확정·취소·결제는 항상 우선" on/>
          <Wave21DToggleRow title="마케팅 수신" sub="이벤트와 혜택 안내" on={false}/>
        </div>
      </M15ComponentSwatch>

      <M15ComponentSwatch label="KPIStat (signatures.jsx) · 탈퇴 전 보류 현황">
        <KPIStat label="예약" value={2}/>
        <KPIStat label="분쟁" value={1}/>
        <KPIStat label="정산" value="대기"/>
      </M15ComponentSwatch>

    </div>
  </div>
);

/* ==========================================================================
   m15-mb-motion: motion contract
   ========================================================================== */
const M15MotionBoard = () => (
  <div style={{ width: M15_MB_W, height: M15_MB_H, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflow: 'hidden' }}>
    <Badge tone="blue" size="sm">m15-mb-motion</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M15 모바일 · motion contract</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>설정·약관·상태 화면에서 사용하는 motion 토큰</div>
    <div style={{ display: 'grid', gap: 1, marginTop: 16 }}>

      <ListItem
        title="Toggle knob slide"
        sub="켜짐/꺼짐 → knob left 2→20 + track background-color · 180ms · ease-out-quart"
        trailing="toggle"
      />
      <ListItem
        title="Button tap scale"
        sub="모든 button → scale(.98) · 120ms · ease-out-quart · transition-transform"
        trailing="tap"
      />
      <ListItem
        title="Toast enter-up"
        sub="저장 완료 → translateY(8px)→0 + fade-in · 280ms · ease-out-quint"
        trailing="toast"
      />
      <ListItem
        title="Toast auto-dismiss"
        sub="3000ms 후 fade-out · opacity 1→0 · 180ms · transition-opacity"
        trailing="dismiss"
      />
      <ListItem
        title="Page push transition"
        sub="설정 메뉴 → 상세 · translateX(100%→0) · 280ms · ease-out-quint"
        trailing="push"
      />
      <ListItem
        title="Destructive confirm reveal"
        sub="회원탈퇴 sheet → slide-up + backdrop · 240ms · ease-out-quart"
        trailing="sheet"
      />
      <ListItem
        title="Skeleton shimmer"
        sub="설정 로딩 → skeleton-shimmer gradient 1.5s linear infinite"
        trailing="load"
      />
      <ListItem
        title="Save success pulse"
        sub="저장 완료 토스트 아이콘 → scale-in 1.12→1.0 · 200ms · ease-out-back"
        trailing="pulse"
      />
      <ListItem
        title="Reduced motion"
        sub="prefers-reduced-motion → 모든 transition duration 0.01ms · toggle 즉시 전환"
        trailing="a11y"
      />

    </div>
    <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--grey50)', borderRadius: 'var(--r-md)', border: '1px solid var(--grey100)' }}>
      <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
        transition-colors / transition-transform 사용. transition-all 금지.
        ToggleSwitch: background-color + left 각각 명시.
      </div>
    </div>
  </div>
);

/* ---------- Object.assign export (14 names — must match Teameet Design.html) ---------- */
Object.assign(window, {
  M15MobileMain,
  M15TabletMain,
  M15DesktopMain,
  M15MobileDetail,
  M15MobileFlowAccount,
  M15MobileFlowTerms,
  M15MobileStateLoading,
  M15MobileStateSuccess,
  M15MobileStatePermission,
  M15MobileStateError,
  M15MobileComponentsBoard,
  M15MobileAssetsBoard,
  M15TabletComponentsBoard,
  M15MotionBoard,
});
