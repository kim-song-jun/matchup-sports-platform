const DEV_BLUE = 'var(--blue500)';
const DEV_BORDER = '1px solid var(--border)';

const TOKEN_HANDOFF_ROWS = [
  ['Brand', '--blue500', 'blue-500 / primary', 'var(--blue500)', 'Primary interaction only'],
  ['Surface', '--bg / --grey50', 'white / gray-50', 'white-first', 'Page background and muted bands'],
  ['Text', '--text-strong / --text-muted', 'gray-900 / gray-600', '400/600/700', 'No negative letter spacing'],
  ['Radius', '--r-md / --r-lg', 'rounded-md / rounded-xl', '12 / 16', 'Controls, cards, inputs'],
  ['Control', '--control-sm~xl', 'h-10~h-16', '40 / 48 / 56 / 64', 'Button and form heights'],
  ['Motion', '--dur-fast/base/slow', 'duration-fast/base/slow', '120 / 180 / 280', 'Tap, enter, sheet'],
  ['Admin', '.tm-admin-sidebar', 'admin.sidebar', '#111827', 'Admin sidebar only'],
];

const COMPONENT_HANDOFF_ROWS = [
  ['Button', 'Button / buttonStyles', 'size: sm md lg xl icon, variant: primary secondary neutral outline ghost danger dark', 'apps/web/src/components/ui/button.tsx'],
  ['Chip', 'Chip / HapticChip', 'active, size, count, disabled, pressed state', 'new ui/chip.tsx'],
  ['Number', 'NumberDisplay / MoneyRow / KPIStat / StatBar', 'value, unit, delta, tone, tabular', 'new ui/number-display.tsx'],
  ['List', 'ListItem / SectionTitle', 'leading, title, sub, trailing, action, danger', 'new ui/list-row.tsx'],
  ['State', 'EmptyState / Skeleton / Toast / PullHint', 'empty, loading, error, success, pending, permission', 'existing ui/* extend'],
  ['Shell', 'TabBar / AppBar / TopNav / AdminSidebar', 'mobile global nav, desktop workspace, admin dark sidebar', 'layout components'],
];

const PAGE_WAVE_ROWS = [
  ['0', 'Token alignment', 'globals.css, tailwind config, Button/Card/Input', 'No route changes'],
  ['1', 'Shared components', 'Chip, NumberDisplay, KPIStat, ListRow, Toast, EmptyState', 'Story/prototype examples'],
  ['2', 'Mobile core', 'Auth, Onboarding, Home, Matches, Team matching', 'Bottom nav and sticky CTA'],
  ['3', 'Commerce and booking', 'Lessons, Marketplace, Venues, Mercenary, Tournaments, Rentals', 'Transaction states'],
  ['4', 'Account and community', 'Chat, Notification, My, Profile, Payment, Settings, Public', 'Grouped history and state pages'],
  ['5', 'Desktop and Admin', 'Desktop search/detail flows, Admin table/detail/action shells', 'Admin dark sidebar only'],
  ['6', 'QA and docs', 'Route smoke, visual QA, component tests, scenario index', 'Release gate'],
];

const QA_GATE_ROWS = [
  ['Render', 'No page error, no unexpected console error, duplicate slots 0', 'Prototype + route smoke'],
  ['Token', 'No new one-off button height/radius/color without token', 'Static grep + review'],
  ['Responsive', '375 / 768 / 1024 / 1280 layouts checked', 'Playwright screenshots'],
  ['Interaction', 'Tap scale, sticky CTA, sheet, toast, skeleton, form progress', 'Scenario checklist'],
  ['State', 'Empty, loading, error, disabled, pending, sold out, permission denied', 'Per module matrix'],
  ['Data truth', 'No fake success for payment/refund/admin decisions', 'API/fixture contract'],
];

const HOTSPOT_ROWS = [
  ['Prototype residual', '385 direct buttons, 65 without tm press class', 'Convert by module after source components exist'],
  ['Inline prototype style', '6542 inline style blocks remain by design prototype format', 'Use as visual source, not production code'],
  ['App dark mode drift', 'globals.css still contains broad .dark overrides', 'For this prototype migration, light-only consumer scope first'],
  ['Current UI primitives', 'Button/Card/Input exist but size/radius/motion differ', 'Align before page migration'],
];

const DevHandoffPage = ({ kicker, title, sub, children }) => (
  <div style={{ width: 1280, height: 820, background: 'var(--bg)', color: 'var(--text-strong)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, marginBottom: 22 }}>
      <div style={{ minWidth: 0 }}>
        <Badge tone="blue" size="sm">{kicker}</Badge>
        <div className="tm-text-title" style={{ marginTop: 10 }}>{title}</div>
        {sub && <div className="tm-text-body" style={{ marginTop: 8, maxWidth: 900, color: 'var(--text-muted)' }}>{sub}</div>}
      </div>
    </div>
    {children}
  </div>
);

const DevPanel = ({ children, pad = 16, style }) => (
  <div className="tm-card" style={{ padding: pad, ...style }}>
    {children}
  </div>
);

const DevRow = ({ cols, children, active }) => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: cols,
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    borderRadius: 14,
    background: active ? 'var(--blue50)' : 'var(--grey50)',
    border: active ? '1px solid var(--blue-alpha-08)' : '1px solid var(--grey100)',
    minWidth: 0,
  }}>
    {children}
  </div>
);

const DevCellTitle = ({ children }) => (
  <div className="tm-text-label" style={{ color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</div>
);

const DevCellMeta = ({ children, blue }) => (
  <div className="tm-text-caption tm-tabular" style={{ color: blue ? DEV_BLUE : 'var(--text-muted)', minWidth: 0, lineHeight: '18px', wordBreak: 'keep-all', overflowWrap: 'break-word' }}>{children}</div>
);

const TokenMigrationHandoffBoard = () => (
  <DevHandoffPage
    kicker="00L TOKENS"
    title="개발용 token migration map"
    sub="Prototype CSS variable, Tailwind handoff config, 실제 앱 globals.css를 같은 이름과 역할로 맞춘 뒤 페이지 이행을 시작합니다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 18, height: 650 }}>
      <DevPanel pad={18}>
        <SectionTitle title="Token mapping" sub="blue는 primary interaction, grey는 구조와 정보 계층, semantic color는 상태에만 사용합니다."/>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {TOKEN_HANDOFF_ROWS.map(([group, proto, app, value, usage], index) => (
            <DevRow key={group} cols="100px 190px 190px 120px 1fr" active={index === 0}>
              <DevCellTitle>{group}</DevCellTitle>
              <DevCellMeta blue>{proto}</DevCellMeta>
              <DevCellMeta>{app}</DevCellMeta>
              <DevCellMeta>{value}</DevCellMeta>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)', minWidth: 0 }}>{usage}</div>
            </DevRow>
          ))}
        </div>
      </DevPanel>
      <DevPanel pad={18}>
        <SectionTitle title="Migration rule" sub="토큰을 먼저 맞추지 않으면 페이지별 QA가 의미 없어집니다."/>
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <div className="tm-surface-muted" style={{ padding: 16 }}>
            <div className="tm-text-micro">SOURCE OF TRUTH</div>
            <div className="tm-text-heading" style={{ marginTop: 6 }}>globals.css</div>
            <div className="tm-text-caption" style={{ marginTop: 6 }}>prototype token은 앱 token으로 흡수하고, page file에서 새 색/크기 값을 만들지 않습니다.</div>
          </div>
          <ListItem title="Light-only consumer scope" sub="다크모드는 이번 prototype migration에서 제외. Admin sidebar만 dark panel 허용." trailing="Rule"/>
          <ListItem title="Tabular number" sub="금액, 점수, KPI, table 숫자는 tm-tabular 고정." trailing="Data"/>
          <ListItem title="4px spacing step" sub="4, 8, 12, 16, 20, 24, 32, 40 중심." trailing="Scale"/>
        </div>
      </DevPanel>
    </div>
  </DevHandoffPage>
);

const ComponentExtractionHandoffBoard = () => (
  <DevHandoffPage
    kicker="00L COMPONENTS"
    title="production component extraction order"
    sub="현재 앱에 이미 있는 UI primitive를 먼저 맞추고, prototype signature component를 그 위에 얹습니다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 18, height: 650 }}>
      <DevPanel pad={18}>
        <SectionTitle title="Component API draft" sub="개발자는 이 표를 기준으로 props와 variant를 먼저 고정합니다."/>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {COMPONENT_HANDOFF_ROWS.map(([name, component, api, target], index) => (
            <DevRow key={name} cols="100px 190px 1fr 260px" active={index < 2}>
              <DevCellTitle>{name}</DevCellTitle>
              <DevCellMeta blue>{component}</DevCellMeta>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)', minWidth: 0 }}>{api}</div>
              <DevCellMeta>{target}</DevCellMeta>
            </DevRow>
          ))}
        </div>
      </DevPanel>
      <DevPanel pad={18}>
        <SectionTitle title="Review checklist" sub="컴포넌트 추출 PR에서 바로 볼 항목"/>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {[
            ['Button', '40/48/56/64 + active scale'],
            ['Chip', 'wrap policy + selected state'],
            ['Number', 'tabular + unit size'],
            ['State', 'persistent reason + recovery'],
            ['Admin', 'dense table + dark sidebar'],
          ].map(([title, sub], index) => (
            <div key={title} style={{ display: 'grid', gridTemplateColumns: '44px 1fr', gap: 12, alignItems: 'center', padding: 12, borderRadius: 14, background: index === 0 ? 'var(--blue50)' : 'var(--grey50)', border: index === 0 ? '1px solid var(--blue-alpha-08)' : '1px solid var(--grey100)' }}>
              <div className="tm-tabular" style={{ width: 44, height: 44, borderRadius: 14, background: index === 0 ? DEV_BLUE : 'var(--bg)', color: index === 0 ? 'var(--static-white)' : 'var(--text-muted)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{index + 1}</div>
              <div style={{ minWidth: 0 }}>
                <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{title}</div>
                <div className="tm-text-caption" style={{ marginTop: 3 }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>
      </DevPanel>
    </div>
  </DevHandoffPage>
);

const PageImplementationWaveBoard = () => (
  <DevHandoffPage
    kicker="00L PAGES"
    title="page migration waves"
    sub="페이지를 한 번에 옮기지 않고, token과 primitive를 먼저 고정한 뒤 module ownership 기준으로 순차 이행합니다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 370px', gap: 18, height: 650 }}>
      <DevPanel pad={18}>
        <SectionTitle title="Implementation sequence" sub="각 wave는 이전 wave의 컴포넌트와 QA gate를 재사용합니다."/>
        <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
          {PAGE_WAVE_ROWS.map(([wave, title, scope, gate], index) => (
            <DevRow key={wave} cols="48px 170px 1fr 250px" active={index <= 1}>
              <div className="tm-tabular" style={{ width: 36, height: 36, borderRadius: 12, display: 'grid', placeItems: 'center', background: index <= 1 ? DEV_BLUE : 'var(--bg)', color: index <= 1 ? 'var(--static-white)' : 'var(--text-muted)', fontWeight: 700 }}>{wave}</div>
              <DevCellTitle>{title}</DevCellTitle>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)', minWidth: 0 }}>{scope}</div>
              <DevCellMeta>{gate}</DevCellMeta>
            </DevRow>
          ))}
        </div>
      </DevPanel>
      <DevPanel pad={18}>
        <SectionTitle title="Ownership rule" sub="variant는 지우지 말고 owning module 안에 둡니다."/>
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <ListItem title="Mobile first" sub="각 모듈은 mobile happy path, state, edge, controls, responsive 순서로 닫습니다." trailing="01"/>
          <ListItem title="Desktop split" sub="데스크탑은 단순 확대가 아니라 filter/list/detail split로 재구성합니다." trailing="17"/>
          <ListItem title="Admin dense" sub="Admin은 dark sidebar + white content + table/KPI 중심." trailing="18"/>
          <ListItem title="No legacy bucket" sub="상세/생성/내역은 generic section이 아니라 해당 기능 모듈에 둡니다." trailing="Rule"/>
        </div>
      </DevPanel>
    </div>
  </DevHandoffPage>
);

const QAGateHandoffBoard = () => (
  <DevHandoffPage
    kicker="00L QA"
    title="development acceptance gates"
    sub="prototype QA는 렌더링 무결성을 보장하고, production migration은 route별 interaction/data contract까지 추가로 검증해야 합니다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 390px', gap: 18, height: 650 }}>
      <DevPanel pad={18}>
        <SectionTitle title="Acceptance checklist" sub="각 migration PR은 이 gate를 체크하고 넘어갑니다."/>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {QA_GATE_ROWS.map(([name, rule, proof], index) => (
            <DevRow key={name} cols="120px 1fr 220px" active={index === 0}>
              <DevCellTitle>{name}</DevCellTitle>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)', minWidth: 0 }}>{rule}</div>
              <DevCellMeta blue={index === 0}>{proof}</DevCellMeta>
            </DevRow>
          ))}
        </div>
      </DevPanel>
      <DevPanel pad={18}>
        <SectionTitle title="Known handoff risks" sub="지금 당장 개발 착수 전 정리해야 할 잔여 판단"/>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {HOTSPOT_ROWS.map(([title, stat, action], index) => (
            <div key={title} style={{ padding: 13, borderRadius: 14, background: index === 0 ? 'var(--orange50)' : 'var(--grey50)', border: index === 0 ? '1px solid rgba(254,152,0,.14)' : '1px solid var(--grey100)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{title}</div>
                <Badge tone={index === 0 ? 'orange' : 'grey'} size="sm">Risk</Badge>
              </div>
              <div className="tm-text-caption tm-tabular" style={{ marginTop: 6, color: index === 0 ? 'var(--orange500)' : 'var(--text-muted)', fontWeight: 700 }}>{stat}</div>
              <div className="tm-text-caption" style={{ marginTop: 5 }}>{action}</div>
            </div>
          ))}
        </div>
      </DevPanel>
    </div>
  </DevHandoffPage>
);

Object.assign(window, {
  TokenMigrationHandoffBoard,
  ComponentExtractionHandoffBoard,
  PageImplementationWaveBoard,
  QAGateHandoffBoard,
});
