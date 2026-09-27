const DEV2_BLUE = 'var(--blue500)';

const ROUTE_MODULE_ROWS = [
  ['01 · 인증·온보딩', 4, 'login, OAuth callback, onboarding, 환영', 'Wave 2'],
  ['02 · 홈·추천', 1, '/home', 'Wave 2'],
  ['03 · 개인 매치', 3, 'matches list/detail/new + edit (19)', 'Wave 2'],
  ['04 · 팀·팀매칭', 11, 'teams root, team-matches, members, evaluate, score', 'Wave 2'],
  ['05 · 레슨 Academy', 3, 'lessons + my/lesson-tickets cross', 'Wave 3'],
  ['06 · 장터 Marketplace', 4, 'marketplace + orders/[id] cross 14', 'Wave 3'],
  ['07 · 시설 Venues', 2, 'venues list/detail', 'Wave 3'],
  ['08 · 용병', 3, 'mercenary list/detail/new', 'Wave 3'],
  ['09 · 대회 Tournaments', 3, 'tournaments list/detail/new', 'Wave 3'],
  ['12 · 커뮤니티·채팅·알림', 4, 'chat, notifications, feed', 'Wave 4'],
  ['13 · 마이·프로필·평판', 14, 'profile, badges, reviews, my/*', 'Wave 4'],
  ['14 · 결제·환불·분쟁', 6, 'payments, checkout, refund, disputes', 'Wave 4'],
  ['15 · 설정·약관·상태', 5, 'settings/account, notifications, privacy, terms', 'Wave 4'],
  ['16 · 공개·마케팅', 6, 'landing, about, faq, guide, pricing, users/[id]', 'Wave 5'],
  ['18 · 관리자·운영', 24, 'admin/* dashboard + dispute/payout/ops', 'Wave 5'],
  ['19 · 공통 플로우', 6, 'edit-flow parity (matches/teams/lessons/marketplace/mercenary/venues)', 'Wave 3-4'],
];

const FUTURE_ROWS = [
  ['/rentals/*', 'future', '10 · 장비 대여 보드는 reference로만 유지'],
  ['/sports, /sports/[type]', 'future', '11 · 종목·실력·안전 wave 분리'],
  ['/profile/edit', 'decide', '인라인 sheet vs 별도 route'],
  ['/venues/[id]/schedule', 'decide', '탭 vs route'],
  ['/admin/tournaments', 'future', '대회 운영 도구'],
  ['/admin/reports', 'future', 'ops alert + report 분리 시'],
  ['/my (root)', 'decide', '허브 추가 vs more 메뉴 흡수'],
];

const RouteOwnershipManifestBoard = () => (
  <DevHandoffPage
    kicker="00M ROUTES"
    title="route ownership manifest — 101 / 91 mapped"
    sub="apps/web/src/app의 101개 page route를 prototype 모듈로 1:1 매핑. cross-module 6, future 7."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 18, height: 650 }}>
      <DevPanel pad={18}>
        <SectionTitle title="Module ownership" sub="각 PR은 owning module의 reviewer 1명, cross-module은 secondary cc."/>
        <div style={{ display: 'grid', gap: 8, marginTop: 12, maxHeight: 580, overflow: 'hidden' }}>
          {ROUTE_MODULE_ROWS.map(([mod, count, scope, wave], index) => (
            <DevRow key={mod} cols="170px 56px 1fr 90px" active={index < 4}>
              <DevCellTitle>{mod}</DevCellTitle>
              <div className="tm-tabular tm-text-label" style={{ color: index < 4 ? DEV2_BLUE : 'var(--text-strong)', fontWeight: 700, textAlign: 'right' }}>{count}</div>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)', minWidth: 0 }}>{scope}</div>
              <DevCellMeta>{wave}</DevCellMeta>
            </DevRow>
          ))}
        </div>
      </DevPanel>
      <DevPanel pad={18}>
        <SectionTitle title="Future scope" sub="source에 route 없거나 별도 task."/>
        <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
          {FUTURE_ROWS.map(([route, kind, why], index) => (
            <div key={route} style={{ padding: 12, borderRadius: 14, background: kind === 'future' ? 'var(--grey50)' : 'var(--blue50)', border: kind === 'future' ? '1px solid var(--grey100)' : '1px solid var(--blue-alpha-08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <div className="tm-text-label tm-tabular" style={{ color: 'var(--text-strong)' }}>{route}</div>
                <Badge tone={kind === 'future' ? 'grey' : 'blue'} size="sm">{kind}</Badge>
              </div>
              <div className="tm-text-caption" style={{ marginTop: 4 }}>{why}</div>
            </div>
          ))}
        </div>
        <div className="tm-surface-muted" style={{ padding: 14, marginTop: 14 }}>
          <div className="tm-text-micro">DOC</div>
          <div className="tm-text-label" style={{ marginTop: 4 }}>ROUTE_OWNERSHIP_MANIFEST_FIX27.md</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>전체 101개 route 표 + cross-module + future scope</div>
        </div>
      </DevPanel>
    </div>
  </DevHandoffPage>
);

const NAV_TABS = [
  { id: 'home', label: '홈', icon: 'M3 11 L12 3 L21 11 V21 H3 Z' },
  { id: 'matches', label: '매치', icon: 'M12 3 L15 9 L21 10 L16 14 L18 21 L12 17 L6 21 L8 14 L3 10 L9 9 Z' },
  { id: 'teams', label: '팀', icon: 'M9 12 A 4 4 0 1 0 9 4 A 4 4 0 0 0 9 12 M2 21 A 7 7 0 0 1 16 21 M17 9 A 3 3 0 1 0 17 3 M22 19 A 5 5 0 0 0 18 15' },
  { id: 'marketplace', label: '장터', icon: 'M4 7h16l-1 12H5L4 7z M8 7V5a4 4 0 0 1 8 0v2' },
  { id: 'more', label: '더보기', icon: 'M4 5h6v6H4z M14 5h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z' },
];

const NavPreviewBar = ({ active, dimmed }) => (
  <div style={{
    display: 'flex',
    background: 'rgba(255,255,255,0.94)',
    border: '1px solid var(--border)',
    borderRadius: 18,
    padding: '6px 4px',
    boxShadow: '0 4px 14px rgba(15,23,42,0.06)',
    opacity: dimmed ? 0.55 : 1,
    width: 320,
  }}>
    {NAV_TABS.map((tab) => (
      <div key={tab.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '4px 0' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth={active === tab.id ? 2.2 : 1.6} strokeLinecap="round" strokeLinejoin="round"
          style={{ color: active === tab.id ? DEV2_BLUE : 'var(--grey400)' }}>
          <path d={tab.icon}/>
        </svg>
        <span className="tm-text-micro" style={{ color: active === tab.id ? DEV2_BLUE : 'var(--grey500)', fontWeight: active === tab.id ? 700 : 500 }}>{tab.label}</span>
      </div>
    ))}
  </div>
);

const NAV_DELTA_ROWS = [
  ['Slot 1', 'home', 'home', '동일'],
  ['Slot 2', 'matches', 'matches', '동일'],
  ['Slot 3', 'lessons (legacy)', 'teams', 'prototype 변경 — lessons는 more 시트로'],
  ['Slot 4', 'marketplace', 'marketplace', '동일'],
  ['Slot 5', 'my (legacy)', 'more', 'prototype 변경 — my는 more 시트 + profile entry로'],
];

const MORE_SHEET_ROWS = [
  ['matching', '/team-matches, /mercenary'],
  ['explore', '/lessons, /tournaments, /venues'],
  ['communication', '/chat, /notifications (auth-only)'],
  ['activity', '/badges'],
  ['service', '/settings'],
];

const BottomNavContractBoard = () => (
  <DevHandoffPage
    kicker="00M NAV"
    title="bottom nav canonical = source 5 tab"
    sub="prototype의 lessons/my variant는 legacy로 보존, normalizeNavId가 자동 매핑. canonical은 home / matches / teams / marketplace / more."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 18, height: 650 }}>
      <DevPanel pad={18}>
        <SectionTitle title="Canonical contract" sub="active = stroke 2 + blue. inactive = stroke 1.5 + grey-400."/>
        <div style={{ display: 'grid', gap: 18, marginTop: 16 }}>
          <div>
            <div className="tm-text-micro" style={{ marginBottom: 6 }}>ACTIVE = home</div>
            <NavPreviewBar active="home"/>
          </div>
          <div>
            <div className="tm-text-micro" style={{ marginBottom: 6 }}>ACTIVE = teams (slot 3)</div>
            <NavPreviewBar active="teams"/>
          </div>
          <div>
            <div className="tm-text-micro" style={{ marginBottom: 6 }}>ACTIVE = more (sheet open OR pathname matches MORE_PATHS)</div>
            <NavPreviewBar active="more"/>
          </div>
          <div>
            <div className="tm-text-micro" style={{ marginBottom: 6 }}>HIDDEN — /matches/new, /teams/new, /mercenary/new, /lessons/new (form step shells)</div>
            <NavPreviewBar active="home" dimmed/>
          </div>
        </div>
        <div style={{ marginTop: 18, display: 'grid', gap: 8 }}>
          {NAV_DELTA_ROWS.map(([slot, proto, source, note], index) => (
            <DevRow key={slot} cols="80px 160px 160px 1fr" active={note.startsWith('prototype')}>
              <DevCellTitle>{slot}</DevCellTitle>
              <DevCellMeta>{proto}</DevCellMeta>
              <DevCellMeta blue>{source}</DevCellMeta>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{note}</div>
            </DevRow>
          ))}
        </div>
      </DevPanel>
      <DevPanel pad={18}>
        <SectionTitle title="More sheet groups" sub="source 의 5 그룹. profile은 시트 상단 사용자 row 직접 진입."/>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {MORE_SHEET_ROWS.map(([group, items]) => (
            <div key={group} style={{ padding: 12, borderRadius: 14, background: 'var(--grey50)', border: '1px solid var(--grey100)' }}>
              <div className="tm-text-micro">{group.toUpperCase()}</div>
              <div className="tm-text-label" style={{ marginTop: 4, color: 'var(--text-strong)' }}>{items}</div>
            </div>
          ))}
        </div>
        <div className="tm-surface-muted" style={{ padding: 14, marginTop: 14 }}>
          <div className="tm-text-micro">VARIANT RULE</div>
          <div className="tm-text-label" style={{ marginTop: 4 }}>기존 lessons/my variant는 보존</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>normalizeNavId가 lessons/lesson_tab → more, my/mypage → more, venue/venues → more, team_match → teams, market → marketplace로 매핑.</div>
        </div>
        <div className="tm-surface-muted" style={{ padding: 14, marginTop: 12 }}>
          <div className="tm-text-micro">DOC</div>
          <div className="tm-text-label" style={{ marginTop: 4 }}>BOTTOM_NAV_CONTRACT_FIX27.md</div>
        </div>
      </DevPanel>
    </div>
  </DevHandoffPage>
);

const TOKEN_DELTA_ROWS = [
  ['Brand · blue-500', 'var(--blue500)', 'var(--blue500)', 'match', '변경 없음 — primary'],
  ['Brand · blue-600', 'var(--blue600)', 'var(--blue700)', 'source 채택', 'prototype 흡수 (hover/pressed)'],
  ['Brand · blue-700', 'var(--blue700)', '#1957C2', 'source 채택', 'prototype의 700은 사실상 source 600'],
  ['Brand · blue-200', 'var(--blue200)', '없음', 'source에 추가', 'badge accent용 신규 토큰'],
  ['Brand · blue-400', 'var(--blue400)', '없음', 'source에 추가', 'ghost variant용'],
  ['Neutral · grey/gray', '--grey-*', '--color-gray-*', 'rename', 'prototype을 gray-*로 일괄 변경'],
  ['Neutral · gray-150', 'var(--grey150)', '없음', 'source에 추가', 'var(--grey150) hover step'],
  ['Border · strong', '--border-strong', '없음', 'source에 추가', 'gray-300 alias'],
  ['Type · 17/30', 'fs-body-lg / title', 'xl(18) / 4xl(36)', 'round-up', '17→18, 30→36'],
  ['Type · 24/20', 'fs-heading / subhead', '2xl(22)', 'round-down', 'visual review gate 필요'],
  ['Control · sm/md/lg/xl', '40/48/56/64', '인라인 h-10/12/14/16', 'source에 추가', '--control-* 신설'],
  ['Control · icon', '44', '인라인 h-11 w-11', 'source에 추가', '--control-icon 신설'],
  ['Motion · ease-out-quart', 'cubic-bezier(0.25,1,0.5,1)', '없음', 'source에 추가', 'globals 키프레임 이미 같은 값 사용'],
  ['Shadow', 'sh-1~sh-4', 'shadow-sm/md/lg/xl', 'Tailwind 직접', '토큰화하지 않음 — 시각 절제'],
  ['Semantic · 50 tints', 'green/red/orange 50', '없음', 'source에 추가', 'var(--green50) / var(--red50) / var(--static-white)3E0'],
];

const TokenAlignmentMapBoard = () => (
  <DevHandoffPage
    kicker="00M TOKENS"
    title="prototype ↔ globals.css 정렬 결정"
    sub="source가 truth. prototype을 source 토큰으로 흡수. 신규 토큰 12개는 별도 production PR에서 추가."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 18, height: 650 }}>
      <DevPanel pad={18}>
        <SectionTitle title="Decision matrix" sub="prototype value · source value · 결정 · 메모"/>
        <div style={{ display: 'grid', gap: 7, marginTop: 12, maxHeight: 580, overflowY: 'hidden' }}>
          {TOKEN_DELTA_ROWS.map(([key, proto, src, decision, note], index) => (
            <DevRow key={key} cols="180px 170px 150px 130px 1fr" active={decision !== 'match'}>
              <DevCellTitle>{key}</DevCellTitle>
              <DevCellMeta>{proto}</DevCellMeta>
              <DevCellMeta blue>{src}</DevCellMeta>
              <div className="tm-text-caption" style={{ color: decision === 'match' ? 'var(--green500)' : DEV2_BLUE, fontWeight: 700 }}>{decision}</div>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)', minWidth: 0 }}>{note}</div>
            </DevRow>
          ))}
        </div>
      </DevPanel>
      <DevPanel pad={18}>
        <SectionTitle title="Production-side actions" sub="이 prototype PR이 아닌 별도 production PR에서 수행"/>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          <ListItem title="Phase A — globals.css 보강" sub="blue-200/400/alpha, gray-150, control-*, ease-out-*, semantic-50 추가" trailing="A"/>
          <ListItem title="Phase B — Tailwind alias" sub="tm-* class를 Button/Chip/Card primitive prop API와 정렬" trailing="B"/>
          <ListItem title="Phase C — sweep" sub="text-[Npx], h-[Npx], rounded-[12px], var(--blue500) 직접 → token으로 일괄" trailing="C"/>
        </div>
        <div className="tm-surface-muted" style={{ padding: 14, marginTop: 14 }}>
          <div className="tm-text-micro">VISUAL GATE</div>
          <div className="tm-text-label" style={{ marginTop: 4 }}>type 24/30 round-up 결정</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>30→4xl(36) 즉시 채택. 24→2xl(22)는 page-title 시각 검증 후 확정.</div>
        </div>
        <div className="tm-surface-muted" style={{ padding: 14, marginTop: 12 }}>
          <div className="tm-text-micro">DOC</div>
          <div className="tm-text-label" style={{ marginTop: 4 }}>TOKEN_ALIGNMENT_PLAN_FIX27.md</div>
        </div>
      </DevPanel>
    </div>
  </DevHandoffPage>
);

const COMPONENT_PLAN_ROWS = [
  ['1', 'NumberDisplay', 'value/unit/sub/size/tone/format/align/loading/aria', '19+ callers · 기반 컴포넌트', 'low'],
  ['2', 'FilterChip', 'active/count/size/variant/asLink/aria', '11 pages · 인라인 chip 일괄 정리', 'med'],
  ['3', 'MoneyRow', 'label/amount/unit/description/tone/strong/rightSlot', '19+ callers · payments/marketplace/payouts', 'med'],
  ['4', 'StatBar', 'label/value/max/sub/tone/orientation/showValue/aria', '5+ callers · evaluate/score/trust', 'low'],
  ['5', 'MetricStat', 'label/value/unit/delta/deltaLabel/icon/loading/tone/href', '8 places · KpiCard 내부 정렬 포함', 'high'],
];

const COMPONENT_RISK_NOTES = [
  ['MetricStat', 'admin dashboard 회귀 위험', 'KpiCard 외부 API 보존 + 내부 MetricStat 호출'],
  ['FilterChip', 'visual diff 가능성', 'first caller marketplace에서만 검증 후 sweep'],
  ['MoneyRow', 'checkout 검증 필수', 'payments/[id] receipt에서 시각 + e2e smoke'],
];

const ComponentExtractionPlanBoard = () => (
  <DevHandoffPage
    kicker="00M COMPONENTS"
    title="production component extraction order"
    sub="NumberDisplay → FilterChip → MoneyRow → StatBar → MetricStat. 5개 새 primitive 모두 components/ui/."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 18, height: 650 }}>
      <DevPanel pad={18}>
        <SectionTitle title="Extraction order" sub="의존성 + 가치 기반. NumberDisplay가 다른 4개의 base."/>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {COMPONENT_PLAN_ROWS.map(([wave, name, api, callers, risk], index) => (
            <DevRow key={name} cols="44px 150px 1fr 220px 70px" active={index < 2}>
              <div className="tm-tabular" style={{ width: 36, height: 36, borderRadius: 12, display: 'grid', placeItems: 'center', background: index < 2 ? DEV2_BLUE : 'var(--bg)', color: index < 2 ? 'var(--static-white)' : 'var(--text-muted)', fontWeight: 700 }}>{wave}</div>
              <DevCellTitle>{name}</DevCellTitle>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)', minWidth: 0 }}>{api}</div>
              <DevCellMeta>{callers}</DevCellMeta>
              <Badge tone={risk === 'high' ? 'red' : risk === 'med' ? 'orange' : 'green'} size="sm">{risk}</Badge>
            </DevRow>
          ))}
        </div>
        <div className="tm-surface-muted" style={{ padding: 14, marginTop: 18 }}>
          <div className="tm-text-micro">PR SHAPE</div>
          <div className="tm-text-label" style={{ marginTop: 4 }}>1 컴포넌트 = 1 PR + 1 첫 caller migration</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>dead-code 방지. 나머지 caller는 후속 sweep PR (1 PR per page family).</div>
        </div>
      </DevPanel>
      <DevPanel pad={18}>
        <SectionTitle title="Risks & guard" sub="추출 시 회귀 가능성과 대비책"/>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {COMPONENT_RISK_NOTES.map(([component, risk, mitigation]) => (
            <div key={component} style={{ padding: 12, borderRadius: 14, background: 'var(--orange50)', border: '1px solid rgba(254,152,0,.16)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{component}</div>
                <Badge tone="orange" size="sm">Risk</Badge>
              </div>
              <div className="tm-text-caption" style={{ marginTop: 4, fontWeight: 600 }}>{risk}</div>
              <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>{mitigation}</div>
            </div>
          ))}
        </div>
        <div className="tm-surface-muted" style={{ padding: 14, marginTop: 14 }}>
          <div className="tm-text-micro">EXISTING ALIGN</div>
          <div className="tm-text-label" style={{ marginTop: 4 }}>Button / Card / Input / Skeleton</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>00k contract와 size/radius/motion 정렬 (별도 PR).</div>
        </div>
        <div className="tm-surface-muted" style={{ padding: 14, marginTop: 12 }}>
          <div className="tm-text-micro">DOC</div>
          <div className="tm-text-label" style={{ marginTop: 4 }}>COMPONENT_EXTRACTION_PLAN_FIX27.md</div>
        </div>
      </DevPanel>
    </div>
  </DevHandoffPage>
);

const PAGE_PRIORITY_ROWS = [
  ['Wave 2', 'Mobile core', '01·02·03·04', '19 routes', 'auth/home/match/team — bottom nav core'],
  ['Wave 3', 'Commerce / booking', '05·06·07·08·09 + 19', '19 routes + edit-flow', 'lessons/marketplace/venues/mercenary/tournaments + form shell'],
  ['Wave 4', 'Account / community / payment / settings', '12·13·14·15', '29 routes', 'chat/profile/payments/settings'],
  ['Wave 5', 'Public / admin', '16·18', '30 routes', 'landing + admin 24'],
  ['Future', 'Out of scope', '10·11·17 + 7 future', 'separate task', 'rentals, sports, profile/edit, schedule, admin/tournaments, admin/reports, my root'],
];

const PageMigrationPriorityBoard = () => (
  <DevHandoffPage
    kicker="00M PRIORITY"
    title="route migration priority — 91 / 101"
    sub="manifest의 모듈을 wave에 매핑. cross-module은 secondary module의 보드도 상태/엣지 통과해야 함."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 18, height: 650 }}>
      <DevPanel pad={18}>
        <SectionTitle title="Wave breakdown" sub="각 wave는 token + primitive가 선행되어야 시작"/>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {PAGE_PRIORITY_ROWS.map(([wave, title, modules, count, scope], index) => (
            <DevRow key={wave} cols="80px 220px 200px 130px 1fr" active={index < 2}>
              <div className="tm-tabular tm-text-label" style={{ color: index < 2 ? DEV2_BLUE : 'var(--text-strong)', fontWeight: 700 }}>{wave}</div>
              <DevCellTitle>{title}</DevCellTitle>
              <DevCellMeta blue>{modules}</DevCellMeta>
              <DevCellMeta>{count}</DevCellMeta>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)', minWidth: 0 }}>{scope}</div>
            </DevRow>
          ))}
        </div>
        <div className="tm-surface-muted" style={{ padding: 14, marginTop: 18 }}>
          <div className="tm-text-micro">CROSS MODULE</div>
          <div className="tm-text-label" style={{ marginTop: 4 }}>6개 route는 두 모듈 reviewer가 함께 본다</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>teams/[id]/mercenary, marketplace/orders/[id], my/lesson-tickets, my/lessons, my/listings, my/teams, settings/notifications</div>
        </div>
      </DevPanel>
      <DevPanel pad={18}>
        <SectionTitle title="Hotspot pages" sub="컴포넌트 추출 후 즉시 migration 우선"/>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          <ListItem title="/admin/statistics" sub="MetricStat × 8 + NumberDisplay × 8" trailing="Adm"/>
          <ListItem title="/admin/payouts" sub="MoneyRow × 5 + FilterChip × 3" trailing="Adm"/>
          <ListItem title="/admin/lesson-tickets" sub="NumberDisplay × 3 + MoneyRow × 3" trailing="Adm"/>
          <ListItem title="/marketplace" sub="FilterChip × 17 (type + sport)" trailing="06"/>
          <ListItem title="/team-matches/[id]/evaluate" sub="StatBar × 6 (6항목 평가)" trailing="04"/>
          <ListItem title="/payments/checkout" sub="MoneyRow × 6 + sticky CTA" trailing="14"/>
        </div>
        <div className="tm-surface-muted" style={{ padding: 14, marginTop: 14 }}>
          <div className="tm-text-micro">RULE</div>
          <div className="tm-text-label" style={{ marginTop: 4 }}>token alignment 후 시작</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>--control-*, gray-150, blue-200/400, ease-out-* 추가가 선행되지 않으면 회귀 발생.</div>
        </div>
      </DevPanel>
    </div>
  </DevHandoffPage>
);

Object.assign(window, {
  RouteOwnershipManifestBoard,
  BottomNavContractBoard,
  TokenAlignmentMapBoard,
  ComponentExtractionPlanBoard,
  PageMigrationPriorityBoard,
});
