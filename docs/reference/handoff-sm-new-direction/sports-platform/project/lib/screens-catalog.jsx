const CATALOG_BLUE = 'var(--blue500)';
const CATALOG_BORDER = '1px solid var(--border)';

const CATALOG_TOTALS = [
  ['Design DNA', '00~00l', '40', '컴포넌트, light shell, foundation, 개발 핸드오프 기준'],
  ['Actual screens', '01~18', '135', '실제 route/variant 화면'],
  ['Case matrix', '01~18', '18', '개발 계약 요약'],
  ['Readiness boards', '01~18', '121', '상태/엣지/모션/반응형/문구맞춤'],
  ['Common flows', '19', '7', '전역 플로우와 atlas'],
  ['Catalog hub', '00j', '6', '화면/컨셉/토큰 위치 안내'],
];

const CATALOG_MODULES = [
  ['01', '인증 · 온보딩', '로그인, OAuth, 온보딩 3-step, 환영', '/login · /callback/* · /onboarding', 6, 1, 5],
  ['02', '홈 · 추천', '홈 variants, 위젯/FAB, 추천 이유', '/home · /feed · /badges', 7, 1, 5],
  ['03', '개인 매치', '목록, 지도, 타임라인, 상세, 참가, 생성', '/matches · /matches/[id] · /matches/new', 9, 1, 6],
  ['04', '팀 · 팀매칭', '팀 매칭, 팀 프로필, 가입, 예약, 출석, 스코어', '/teams · /team-matches', 16, 1, 7],
  ['05', '레슨 Academy', 'Academy Hub, 코치, 상세, 등록, 수강권', '/lessons · /my/lesson-tickets', 11, 1, 7],
  ['06', '장터 Marketplace', '목록, 상세, 등록, 주문, 내 판매글, desktop', '/marketplace · /marketplace/orders/[id]', 8, 1, 7],
  ['07', '시설 Venues', '목록, 지도, 예약, 상세, 시설 운영', '/venues · /venues/[id]/schedule', 8, 1, 7],
  ['08', '용병 Mercenary', '목록, 상세, 등록', '/mercenary · /mercenary/[id]', 3, 1, 7],
  ['09', '대회 Tournaments', '목록, 상세, 대진표, 운영 도구', '/tournaments · /admin/tournaments', 4, 1, 7],
  ['10', '장비 대여', '목록, 상세, 픽업/반납 운영', '/rentals · /rentals/orders/[id]', 3, 1, 7],
  ['11', '종목 · 실력 · 안전', '종목별 UX, 실력 인증, 안전 체크', '/sports · /profile/edit · /matches/new', 13, 1, 7],
  ['12', '커뮤니티', '채팅, 알림, 피드, 매치 카드 임베드', '/chat · /notifications · /feed', 5, 1, 7],
  ['13', '마이 · 평판', '마이 홈, 내 활동, 리뷰, 뱃지, 공개 프로필', '/my · /profile · /reviews', 7, 1, 7],
  ['14', '결제 · 환불', '체크아웃, 성공, 내역, 환불, 분쟁', '/payments · /my/disputes', 7, 1, 7],
  ['15', '설정 · 약관', '계정, 알림, 약관, 404, 상태 화면', '/settings · /privacy · /terms', 6, 1, 7],
  ['16', '공개 · 마케팅', '랜딩, 가격, FAQ, 가이드, 공개 프로필', '/landing · /pricing · /faq', 5, 1, 7],
  ['17', '데스크탑 웹', '랜딩, 로그인 후 홈, 매치 탐색', '/home · /matches · /lessons · /venues', 4, 1, 7],
  ['18', '관리자 · 운영', '대시보드, 테이블, 신고, 정산, 통계, 운영', '/admin/*', 13, 1, 7],
];

const CATALOG_CONCEPT_GROUPS = [
  ['Case matrix', '각 모듈 마지막의 `...-case-matrix`', 'Route, 핵심 flow, state, edge, interaction, owning shell을 한 보드에 고정합니다.'],
  ['Readiness', '`...-state-edge`부터 responsive/copy fit까지', '개발자가 구현해야 할 예외, 버튼 상태, 모션, 반응형, 긴 문구 맞춤을 실제 UI 형태로 보여줍니다.'],
  ['Common flows', '`19 · 공통 플로우 · 인터랙션`', '등록/수정 shell, 상태 패밀리, edge gallery, interaction transition, handoff matrix를 전역 기준으로 둡니다.'],
  ['Token docs', '`tailwind.teameet.config.js` + token docs', '색상, spacing, radius, typography, breakpoint를 Tailwind 기준으로 정량화합니다.'],
  ['Dev handoff', '`00l · 개발 핸드오프`', '토큰 migration, component extraction, page wave, QA gate를 구현 착수 순서로 고정합니다.'],
];

const CATALOG_DOCS = [
  ['README.md', '현재 prototype system 문서 허브'],
  ['MODULE_MAP.md', '모듈별 실제 화면/계약 보드 위치'],
  ['CASE_COVERAGE_MATRIX.md', 'case matrix와 readiness board 범위'],
  ['DESIGN_SYSTEM_FOUNDATION_FIX24.md', '타이포, 버튼, 상태, 모션, Tailwind class 계약'],
  ['TAILWIND_TOKEN_SYSTEM_FIX24.md', 'Tailwind 토큰과 breakpoint 기준'],
  ['PRODUCTION_HANDOFF_FIX26.md', '실제 개발 이행 순서와 acceptance gate'],
  ['DESIGN_QA_FIX26.md', 'fix26 개발 핸드오프/반응형/문구 맞춤 QA 결과'],
];

const TAILWIND_TOKEN_GROUPS = [
  ['Color', 'blue-500 var(--blue500)', 'interactive only', 'grey scale + semantic status'],
  ['Spacing', '4px step', '4-32px scale', 'section gap 24~32'],
  ['Radius', '12~16px', 'button/input/card', 'mobile shell 28~30'],
  ['Type', 'Pretendard', '400/600/700', 'tabular nums for stats'],
  ['Button', '40/48/56/64', 'tm-btn sizes', 'no custom button px'],
  ['Shadow', 'minimal', 'shadow-sm only', 'border/list first'],
  ['Screens', '375/768/1024/1280', 'mobile first', 'desktop split layout'],
];

const RESPONSIVE_AUDIT_ROWS = [
  ['Mobile', '375', '단일 컬럼, sticky CTA, nav 5 tabs', 'CTA 2줄 허용 · 금액 tabular'],
  ['Tablet', '768', '2컬럼 카드, filter + result 병렬', '칩은 wrap · 본문은 minmax(0,1fr)'],
  ['Desktop', '1024+', '좌측 필터 + 우측 결과, 중앙 1120~1280', '리스트/테이블 우선 · hero 과장 금지'],
  ['Admin', '1280', '어두운 sidebar + 흰 본문 + 고밀도 표', '행 높이 44~52 · 숫자 tabular'],
];

const CatalogPage = ({ kicker, title, sub, children }) => (
  <div style={{ width: 1280, height: 820, background: 'var(--bg)', color: 'var(--text-strong)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, marginBottom: 22 }}>
      <div style={{ minWidth: 0 }}>
        <Badge tone="blue" size="sm">{kicker}</Badge>
        <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.18, marginTop: 10, letterSpacing: 0 }}>{title}</div>
        {sub && <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8, maxWidth: 780 }}>{sub}</div>}
      </div>
    </div>
    {children}
  </div>
);

const CatalogPanel = ({ children, pad = 16, style }) => (
  <div style={{ borderRadius: 16, background: 'var(--bg)', border: CATALOG_BORDER, padding: pad, minWidth: 0, ...style }}>
    {children}
  </div>
);

const CatalogCell = ({ title, sub }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
    {sub && <div style={{ fontSize: 11, color: 'var(--text-caption)', lineHeight: 1.35, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
  </div>
);

const CatalogCount = ({ label, value, tone = 'blue' }) => (
  <div style={{ padding: 14, borderRadius: 15, background: tone === 'blue' ? 'var(--blue50)' : 'var(--grey50)', border: tone === 'blue' ? '1px solid var(--blue-alpha-08)' : '1px solid var(--grey100)' }}>
    <div style={{ fontSize: 11, color: tone === 'blue' ? CATALOG_BLUE : 'var(--text-muted)', fontWeight: 700 }}>{label}</div>
    <div className="tab-num" style={{ fontSize: 27, fontWeight: 700, marginTop: 4, lineHeight: 1 }}>{value}</div>
  </div>
);

const ScreenCatalogOverview = () => (
  <CatalogPage
    kicker="00J CATALOG"
    title="화면과 설명을 분리해서 읽는 구조"
    sub="실제 화면은 각 기능 모듈에 남겨두고, 설명/컨셉/핸드오프 계약은 이 카탈로그와 문서 허브에서 추적합니다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 18, height: 650 }}>
      <CatalogPanel pad={18}>
        <SectionTitle title="읽는 순서" sub="처음 보는 사람도 실제 화면과 설명 보드를 헷갈리지 않게 분리합니다."/>
        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          {[
            ['1', '00~00i', '디자인 DNA와 글로벌 shell을 먼저 본다'],
            ['2', '01~18', '모듈별 실제 화면과 variants를 확인한다'],
            ['3', 'Case matrix', 'route, flow, state, edge, interaction 계약을 확인한다'],
            ['4', 'Readiness', '예외/버튼/모션/반응형/문구 맞춤을 검수한다'],
            ['5', 'Tokens + docs', 'Tailwind token과 상세 설명 문서를 참조한다'],
          ].map(([step, title, sub], index) => (
            <div key={step} style={{ display: 'grid', gridTemplateColumns: '34px 1fr', gap: 12, alignItems: 'start', padding: 12, borderRadius: 14, background: index === 1 ? 'var(--blue50)' : 'var(--grey50)', border: index === 1 ? '1px solid var(--blue-alpha-08)' : '1px solid var(--grey100)' }}>
              <div className="tab-num" style={{ width: 34, height: 34, borderRadius: 12, display: 'grid', placeItems: 'center', background: index === 1 ? CATALOG_BLUE : 'var(--grey100)', color: index === 1 ? 'var(--static-white)' : 'var(--text-muted)', fontWeight: 700 }}>{step}</div>
              <CatalogCell title={title} sub={sub}/>
            </div>
          ))}
        </div>
      </CatalogPanel>
      <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <CatalogCount label="전체 섹션" value={29}/>
          <CatalogCount label="전체 보드" value={317}/>
          <CatalogCount label="실제 화면" value={135}/>
        </div>
        <CatalogPanel pad={0} style={{ overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 100px 90px 1fr', background: 'var(--grey50)', borderBottom: '1px solid var(--grey100)', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
            {['구분', '범위', '보드', '역할'].map((h) => <div key={h} style={{ padding: '12px 14px' }}>{h}</div>)}
          </div>
          {CATALOG_TOTALS.map(([name, range, count, role], index) => (
            <div key={name} style={{ display: 'grid', gridTemplateColumns: '1.1fr 100px 90px 1fr', alignItems: 'center', borderBottom: index === CATALOG_TOTALS.length - 1 ? 'none' : '1px solid var(--grey100)' }}>
              <div style={{ padding: '13px 14px', fontSize: 13, fontWeight: 700 }}>{name}</div>
              <div style={{ padding: '13px 14px' }}><Badge tone={index === 1 ? 'blue' : 'grey'} size="sm">{range}</Badge></div>
              <div className="tab-num" style={{ padding: '13px 14px', fontSize: 17, fontWeight: 700 }}>{count}</div>
              <div style={{ padding: '13px 14px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>{role}</div>
            </div>
          ))}
        </CatalogPanel>
      </div>
    </div>
  </CatalogPage>
);

const ActualScreenIndexBoard = () => (
  <CatalogPage
    kicker="ACTUAL SCREENS"
    title="실제 화면 인덱스"
    sub="개발자가 구현할 route/variant 화면은 모듈별 section 안에서 먼저 확인합니다. 설명 보드와 섞이지 않도록 실제 화면 수를 별도로 표시합니다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, height: 650 }}>
      {CATALOG_MODULES.map(([no, name, actual, route, actualCount, matrixCount, readinessCount]) => (
        <CatalogPanel key={no} pad={11}>
          <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 10, alignItems: 'start' }}>
            <div className="tab-num" style={{ width: 36, height: 36, borderRadius: 12, display: 'grid', placeItems: 'center', background: no === '05' ? CATALOG_BLUE : 'var(--grey100)', color: no === '05' ? 'var(--static-white)' : 'var(--text-muted)', fontWeight: 700 }}>{no}</div>
            <CatalogCell title={name} sub={actual}/>
            <Badge tone="blue" size="sm">{actualCount} screens</Badge>
          </div>
          <div style={{ marginTop: 9, padding: 9, borderRadius: 11, background: 'var(--grey50)', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 7, alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{route}</div>
            <span className="tab-num" style={{ fontSize: 11, color: 'var(--text-caption)' }}>M{matrixCount}</span>
            <span className="tab-num" style={{ fontSize: 11, color: 'var(--text-caption)' }}>R{readinessCount}</span>
          </div>
        </CatalogPanel>
      ))}
    </div>
  </CatalogPage>
);

const ConceptContractIndexBoard = () => (
  <CatalogPage
    kicker="CONCEPT CONTRACT"
    title="설명 · 컨셉 · 핸드오프 계약 위치"
    sub="실제 앱 화면에 들어가면 안 되는 설명은 case matrix, readiness, common flow, 문서 허브로 모읍니다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 18, height: 650 }}>
      <CatalogPanel pad={16}>
        <SectionTitle title="설명 보드의 역할" sub="설명은 화면 위에 흩뿌리지 않고 의사결정 단위별로 묶습니다."/>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {CATALOG_CONCEPT_GROUPS.map(([title, where, desc], index) => (
            <div key={title} style={{ padding: 12, borderRadius: 14, background: index === 0 ? 'var(--blue50)' : 'var(--grey50)', border: index === 0 ? '1px solid var(--blue-alpha-08)' : '1px solid var(--grey100)' }}>
              <Badge tone={index === 0 ? 'blue' : 'grey'} size="sm">{title}</Badge>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 9 }}>{where}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{desc}</div>
            </div>
          ))}
        </div>
      </CatalogPanel>
      <CatalogPanel pad={14} style={{ overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 9 }}>
        {CATALOG_MODULES.map(([no, name, actual, route, actualCount, matrixCount, readinessCount]) => (
          <div key={no} style={{ padding: 11, borderRadius: 13, background: 'var(--grey50)', border: '1px solid var(--grey100)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '34px 1fr auto', gap: 9, alignItems: 'center' }}>
              <div className="tab-num" style={{ width: 34, height: 34, borderRadius: 11, display: 'grid', placeItems: 'center', background: no === '17' || no === '18' ? CATALOG_BLUE : 'var(--grey100)', color: no === '17' || no === '18' ? 'var(--static-white)' : 'var(--text-muted)', fontWeight: 700 }}>{no}</div>
              <CatalogCell title={name} sub={route}/>
              <div className="tab-num" style={{ fontSize: 18, fontWeight: 700 }}>{actualCount}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
              <Badge tone="grey" size="sm">{matrixCount} matrix</Badge>
              <Badge tone="blue" size="sm">{readinessCount} boards</Badge>
            </div>
          </div>
        ))}
        </div>
      </CatalogPanel>
    </div>
  </CatalogPage>
);

const TailwindTokenSystemBoard = () => (
  <CatalogPage
    kicker="TAILWIND TOKENS"
    title="Light-only 디자인 토큰 정량화"
    sub="프로토타입의 CSS 변수와 production Tailwind theme가 같은 숫자를 쓰도록 색상, spacing, radius, type, breakpoint를 고정합니다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 390px', gap: 18, height: 650 }}>
      <CatalogPanel pad={0} style={{ overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '150px 210px 130px 1fr', background: 'var(--grey50)', borderBottom: '1px solid var(--grey100)', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
          {['Token', 'Primary value', 'Usage', 'Constraint'].map((h) => <div key={h} style={{ padding: '13px 14px' }}>{h}</div>)}
        </div>
        {TAILWIND_TOKEN_GROUPS.map(([name, value, usage, constraint], index) => (
          <div key={name} style={{ display: 'grid', gridTemplateColumns: '150px 210px 130px 1fr', alignItems: 'center', borderBottom: index === TAILWIND_TOKEN_GROUPS.length - 1 ? 'none' : '1px solid var(--grey100)' }}>
            <div style={{ padding: '15px 14px', fontSize: 14, fontWeight: 700 }}>{name}</div>
            <div className="tab-num" style={{ padding: '15px 14px', fontSize: 12, color: index === 0 ? CATALOG_BLUE : 'var(--text-strong)', fontWeight: 700, whiteSpace: 'nowrap' }}>{value}</div>
            <div style={{ padding: '15px 14px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>{usage}</div>
            <div style={{ padding: '15px 14px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>{constraint}</div>
          </div>
        ))}
      </CatalogPanel>
      <CatalogPanel pad={18}>
        <SectionTitle title="Tailwind 적용 원칙" sub="utility를 쓰더라도 값은 token에서만 가져옵니다."/>
        <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
          {[
            ['White base', 'desktop과 mobile 모두 white surface를 기준으로 하고, grey는 분리와 disabled에만 씁니다.'],
            ['Blue action', 'var(--blue500)은 CTA, 선택, focus, link에만 쓰고 장식 배경으로 쓰지 않습니다.'],
            ['Copy fit', '긴 한글 CTA는 2줄까지 허용하고, 숫자/금액은 tabular number로 고정합니다.'],
            ['Admin exception', '관리자 desktop의 좌측 sidebar만 dark panel을 허용합니다.'],
          ].map(([title, sub], index) => (
            <ListItem
              key={title}
              leading={<div className="tab-num" style={{ width: 34, height: 34, borderRadius: 12, background: index === 0 ? CATALOG_BLUE : 'var(--grey100)', color: index === 0 ? 'var(--static-white)' : 'var(--text-muted)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{index + 1}</div>}
              title={title}
              sub={sub}
            />
          ))}
        </div>
        <div style={{ marginTop: 18, borderRadius: 16, background: 'var(--grey900)', color: 'var(--static-white)', padding: 16 }}>
          <div style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 700 }}>CONFIG</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 5 }}>tailwind.teameet.config.js</div>
          <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.55, marginTop: 6 }}>prototype token을 production utility class로 옮기는 기준 파일입니다.</div>
        </div>
      </CatalogPanel>
    </div>
  </CatalogPage>
);

const ResponsiveCopyFitAuditBoard = () => (
  <CatalogPage
    kicker="RESPONSIVE QA"
    title="Mobile · Tablet · Desktop 재배치 기준"
    sub="글씨가 짤리는 문제를 막기 위해 viewport별 column, CTA wrapping, table density, admin sidebar 예외를 한 보드에서 고정합니다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '440px 1fr', gap: 18, height: 650 }}>
      <CatalogPanel pad={18}>
        <SectionTitle title="Viewport contract" sub="보드는 같은 정보 구조를 유지하면서 밀도만 바꿉니다."/>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {RESPONSIVE_AUDIT_ROWS.map(([device, width, layout, copy], index) => (
            <div key={device} style={{ padding: 13, borderRadius: 15, background: index === 3 ? '#111827' : index === 0 ? 'var(--blue50)' : 'var(--grey50)', border: index === 3 ? '1px solid #1f2937' : index === 0 ? '1px solid var(--blue-alpha-08)' : '1px solid var(--grey100)', color: index === 3 ? '#f8fafc' : 'var(--text-strong)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge tone={index === 0 ? 'blue' : 'grey'} size="sm">{width}px</Badge>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{device}</div>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.5, color: index === 3 ? '#cbd5e1' : 'var(--text-muted)', marginTop: 7 }}>{layout}</div>
              <div style={{ fontSize: 11, lineHeight: 1.45, color: index === 3 ? '#94a3b8' : 'var(--text-caption)', marginTop: 3 }}>{copy}</div>
            </div>
          ))}
        </div>
      </CatalogPanel>
      <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 14 }}>
        <CatalogPanel pad={16}>
          <SectionTitle title="문구 잘림 방지" sub="모든 컴포넌트에서 우선 적용할 규칙"/>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[
              ['min-w-0', 'grid/flex 자식은 최소 폭 0'],
              ['break-keep', '한글은 단어 단위 줄바꿈'],
              ['tabular-nums', '통계/금액은 폭 고정'],
              ['line-clamp', '리스트 sub copy는 2줄 제한'],
              ['whitespace-normal', 'CTA 문구는 2줄 허용'],
              ['overflow-hidden', '보드 자체는 넘침 차단'],
            ].map(([title, sub], index) => (
              <div key={title} style={{ padding: 12, borderRadius: 14, background: index === 0 ? 'var(--blue50)' : 'var(--grey50)', border: index === 0 ? '1px solid var(--blue-alpha-08)' : '1px solid var(--grey100)' }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, marginTop: 4 }}>{sub}</div>
              </div>
            ))}
          </div>
        </CatalogPanel>
        <CatalogPanel pad={16}>
          <SectionTitle title="검수 순서" sub="각 페이지별로 같은 순서로 확인합니다."/>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 9 }}>
            {['Mobile 375', 'Tablet 768', 'Desktop 1280', 'Admin sidebar'].map((item, index) => (
              <div key={item} style={{ height: 104, borderRadius: 15, background: index === 3 ? '#111827' : index === 0 ? 'var(--blue50)' : 'var(--grey50)', color: index === 3 ? '#f8fafc' : 'var(--text-strong)', border: index === 3 ? '1px solid #1f2937' : index === 0 ? '1px solid var(--blue-alpha-08)' : '1px solid var(--grey100)', padding: 13, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div className="tab-num" style={{ fontSize: 22, fontWeight: 700 }}>{index + 1}</div>
                <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>{item}</div>
              </div>
            ))}
          </div>
        </CatalogPanel>
      </div>
    </div>
  </CatalogPage>
);

const DocumentationHubBoard = () => (
  <CatalogPage
    kicker="DOC HUB"
    title="문서와 캔버스의 역할 분리"
    sub="캔버스는 볼 수 있는 UI를 보여주고, 긴 설명과 운영 기준은 prototype-system 문서로 모읍니다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 18, height: 650 }}>
      <CatalogPanel pad={18}>
        <SectionTitle title="문서 SSOT" sub="긴 설명은 화면 위에 남기지 않고 문서로 이동합니다."/>
        <div style={{ display: 'grid', gap: 11, marginTop: 14 }}>
          {CATALOG_DOCS.map(([file, desc], index) => (
            <div key={file} style={{ display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 12, alignItems: 'center', padding: 13, borderRadius: 14, background: index === 0 ? 'var(--blue50)' : 'var(--grey50)', border: index === 0 ? '1px solid var(--blue-alpha-08)' : '1px solid var(--grey100)' }}>
              <div className="tab-num" style={{ width: 36, height: 36, borderRadius: 12, display: 'grid', placeItems: 'center', background: index === 0 ? CATALOG_BLUE : 'var(--grey100)', color: index === 0 ? 'var(--static-white)' : 'var(--text-muted)', fontWeight: 700 }}>{index + 1}</div>
              <CatalogCell title={file} sub={desc}/>
              <Badge tone={index === 0 ? 'blue' : 'grey'} size="sm">{index === 0 ? 'new' : 'doc'}</Badge>
            </div>
          ))}
        </div>
      </CatalogPanel>
      <CatalogPanel pad={18}>
        <SectionTitle title="운영 원칙" sub="앞으로 새 화면을 추가할 때의 분류 규칙"/>
        <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
          {[
            ['Actual', '사용자가 실제로 보는 화면이면 해당 기능 모듈 안에 둡니다.'],
            ['Variant', '최종 선택 전 비교가 필요한 화면도 실제 화면이면 삭제하지 않습니다.'],
            ['Contract', 'route, state, edge, interaction 설명은 case/readiness 보드로 보냅니다.'],
            ['Docs', '긴 의사결정, QA 결과, 운영 방식은 prototype-system 문서로 보냅니다.'],
          ].map(([title, sub], index) => (
            <ListItem
              key={title}
              leading={<div className="tab-num" style={{ width: 34, height: 34, borderRadius: 12, background: index === 0 ? 'var(--blue500)' : 'var(--grey100)', color: index === 0 ? 'var(--static-white)' : 'var(--text-muted)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{title.slice(0, 1)}</div>}
              title={title}
              sub={sub}
            />
          ))}
        </div>
        <div style={{ marginTop: 18, padding: 14, borderRadius: 15, background: 'var(--grey50)', border: '1px solid var(--grey100)' }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>다음 작업 기준</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 6 }}>prototype은 이제 화면 카탈로그와 설명 허브를 갖췄으므로, 다음 큰 단계는 이 구조를 production route와 shared component로 이전하는 것입니다.</div>
        </div>
      </CatalogPanel>
    </div>
  </CatalogPage>
);

Object.assign(window, {
  ScreenCatalogOverview,
  ActualScreenIndexBoard,
  ConceptContractIndexBoard,
  TailwindTokenSystemBoard,
  ResponsiveCopyFitAuditBoard,
  DocumentationHubBoard,
});
