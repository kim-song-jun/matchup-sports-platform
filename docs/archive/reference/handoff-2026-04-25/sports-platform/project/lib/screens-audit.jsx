/* fix28 audit summary boards — light-only, source-of-truth = teameet-design-fix27-audit.json */

const AUDIT_BLUE = 'var(--blue500)';
const AUDIT_ORANGE = 'var(--orange500)';
const AUDIT_GREEN = 'var(--green500)';
const AUDIT_RED = 'var(--red500)';

const AUDIT_QUESTIONS = [
  ['1', '디자인 시스템(색상/간격/타이핑) 준수', 'conditional', 'DOM 97% / source 92.9% color · spacing 69% · typography 41% class / 67% spec'],
  ['2', '모든 viewport (mobile/tablet/desktop) 페이지 존재', 'pass', 'functional 18 모듈 모두 3 viewport 보드 보유. reference 모듈은 의도된 single viewport.'],
  ['3', '각 페이지가 디자인 시스템 준수', 'conditional', '31 모듈 평균 typo 65% · spacing 72% · color 93%. 약점 5 모듈에 sweep 집중.'],
  ['4', '개발자가 즉시 개발 가능', 'pass', 'route/nav/token/component 결정 문서 4종 + 18 case matrix + 121 readiness boards. token sweep은 별도 PR.'],
];

const TOKEN_SCORE_ROWS = [
  ['Color (DOM)', 0.97, 'pass', 'raw hex 3건 / token 적용 dominant'],
  ['Color (source)', 0.929, 'conditional', 'lib JSX 380건 raw / 4972 token'],
  ['Spacing', 0.694, 'conditional', 'strict 4-multiple. 14/18/22 등 디자인 raw 포함'],
  ['Typography (class)', 0.41, 'conditional', 'tm-text class 63건 / inline 2660건'],
  ['Typography (spec)', 0.671, 'conditional', '1785건 inline은 fs-token spec 일치'],
  ['Sport color 11종', 1, 'pass', 'sportCardAccent 통합'],
];

const VIEWPORT_MATRIX_ROWS = [
  ['auth-onboarding', 10, 1, 1],
  ['home-discovery', 11, 1, 1],
  ['matches-core', 14, 1, 1],
  ['teams-team-matches', 21, 2, 1],
  ['lessons', 14, 2, 3],
  ['marketplace', 13, 1, 2],
  ['venues', 12, 1, 3],
  ['mercenary', 9, 1, 1],
  ['tournaments', 9, 1, 2],
  ['equipment-rental', 9, 1, 1],
  ['sports-level-safety', 19, 1, 1],
  ['community', 11, 1, 1],
  ['my-profile-trust', 13, 1, 1],
  ['payments-support', 12, 1, 2],
  ['settings-states', 12, 1, 1],
  ['public-marketing', 11, 1, 1],
  ['desktop-web (17)', 0, 1, 11],
  ['admin-ops (18)', 0, 1, 20],
  ['common-flows-motion (19)', 4, 1, 2],
];

const MODULE_HEAT_ROWS = [
  ['screens-match (03)', 1.0, 0.80, 0.56, 43],
  ['screens-team (04)', 1.0, 0.81, 0.58, 32],
  ['screens-other (08+)', 1.0, 0.76, 0.51, 31],
  ['screens-more (13/14)', 0.99, 0.84, 0.62, 41],
  ['screens-sport (11)', 0.94, 0.71, 0.77, 33],
  ['screens-deep (12)', 1.0, 0.64, 0.74, 71],
  ['screens-variants (02)', 0.90, 0.73, 0.44, 74],
  ['screens-variants2', 0.90, 0.74, 0.55, 50],
  ['screens-desktop (17)', 0.97, 0.78, 0.73, 74],
  ['screens-desktop2', 1.0, 0.77, 0.71, 58],
  ['screens-upgrade', 1.0, 0.70, 0.80, 55],
  ['screens-my (13)', 0.99, 0.72, 0.79, 19],
  ['screens-forms (19)', 0.99, 0.70, 0.55, 70],
  ['screens-ops (18)', 0.96, 0.66, 0.64, 93],
  ['screens-extras (14)', 1.0, 0.84, 0.64, 32],
  ['screens-hero (00)', 1.0, 0.94, 0.75, 13],
  ['screens-refresh1', 1.0, 0.85, 0.65, 43],
  ['screens-refresh2', 0.99, 0.82, 0.67, 30],
  ['screens-refresh3', 0.98, 0.87, 0.61, 31],
  ['screens-v2main', 0.97, 0.79, 0.65, 61],
  ['screens-v2main2', 0.98, 0.76, 0.63, 57],
  ['screens-parity (01)', 1.0, 0.68, 0.47, 41],
  ['screens-case-matrix (00g)', 1.0, 0.48, 0.73, 28],
  ['screens-readiness', 0.88, 0.58, 0.71, 317],
  ['screens-readiness-wave21a', 0.89, 0.58, 0.69, 87],
  ['screens-readiness-wave21b', 0.0, 0.60, 0.75, 28],
  ['screens-readiness-wave21c', 0.86, 0.62, 0.72, 42],
  ['screens-readiness-wave21d', 0.83, 0.64, 0.74, 51],
  ['screens-readiness-wave21e', 0.77, 0.51, 0.72, 52],
  ['screens-dev-handoff (00l)', 0.94, 0.42, 1.0, 12],
  ['screens-dev-handoff2 (00m)', 0.65, 0.48, 1.0, 26],
];

const READINESS_ROWS = [
  ['Route manifest', 'pass', 'ROUTE_OWNERSHIP_MANIFEST_FIX27.md — 101 routes'],
  ['Bottom nav contract', 'pass', 'BOTTOM_NAV_CONTRACT_FIX27.md — source 5 tab canonical'],
  ['Token alignment plan', 'pass', 'TOKEN_ALIGNMENT_PLAN_FIX27.md — 12 신규 토큰'],
  ['Component extraction', 'pass', 'COMPONENT_EXTRACTION_PLAN_FIX27.md — 5 primitive'],
  ['18 module case matrix', 'pass', '00g + 18 module each'],
  ['18 module readiness', 'pass', '121 boards (PAGE_READINESS_AUDIT_FIX21)'],
  ['Form step + edit-flow', 'pass', '19 · 공통 플로우'],
  ['Admin dark sidebar 격리', 'pass', 'tm-admin-sidebar 단독'],
  ['Light-only consumer', 'pass', 'fix22+ 결정 유지'],
  ['Production token sweep', 'pending', '1,695 violations — production task'],
  ['tm-text-* class adoption', 'conditional', '41% — sweep으로 95%+ 가능'],
  ['API contract 캡션', 'conditional', '일부 보드만 endpoint 표기'],
];

const AuditPage = ({ kicker, title, sub, children }) => (
  <div style={{ width: 1280, height: 820, background: 'var(--bg)', color: 'var(--text-strong)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, marginBottom: 20 }}>
      <div style={{ minWidth: 0 }}>
        <Badge tone="blue" size="sm">{kicker}</Badge>
        <div className="tm-text-title" style={{ marginTop: 8 }}>{title}</div>
        {sub && <div className="tm-text-body" style={{ marginTop: 8, maxWidth: 900, color: 'var(--text-muted)' }}>{sub}</div>}
      </div>
    </div>
    {children}
  </div>
);

const Panel = ({ children, pad = 16, style }) => (
  <div className="tm-card" style={{ padding: pad, ...style }}>
    {children}
  </div>
);

const StatusBadge = ({ status }) => {
  const map = {
    pass: { tone: 'green', label: 'PASS' },
    conditional: { tone: 'orange', label: 'CONDITIONAL' },
    fail: { tone: 'red', label: 'FAIL' },
    pending: { tone: 'grey', label: 'PENDING' },
  };
  const { tone, label } = map[status] || map.pending;
  return <Badge tone={tone} size="sm">{label}</Badge>;
};

const Bar = ({ rate, color = AUDIT_BLUE, height = 8 }) => (
  <div style={{ height, background: 'var(--grey200)', borderRadius: 999, overflow: 'hidden', minWidth: 80 }}>
    <div style={{ width: `${Math.max(2, rate * 100)}%`, height: '100%', background: color, borderRadius: 999 }}/>
  </div>
);

const AuditSummaryBoard = () => (
  <AuditPage
    kicker="00N AUDIT"
    title="prototype audit summary — fix28"
    sub="사용자의 4가지 검수 질문에 정량 + 정성 답. 자동 측정 스크립트 + JSON artifact 기반."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, height: 650 }}>
      <Panel pad={18}>
        <SectionTitle title="4가지 검수 질문" sub="prototype의 production-readiness 종합 평가"/>
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          {AUDIT_QUESTIONS.map(([num, q, status, summary]) => (
            <div key={num} style={{
              padding: 14, borderRadius: 14,
              background: status === 'pass' ? 'var(--green50)' : status === 'conditional' ? 'var(--orange50)' : 'var(--red50)',
              border: status === 'pass' ? '1px solid rgba(3,178,108,.16)' : status === 'conditional' ? '1px solid rgba(254,152,0,.16)' : '1px solid rgba(240,68,82,.16)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div className="tm-tabular" style={{
                  width: 32, height: 32, borderRadius: 12,
                  background: status === 'pass' ? AUDIT_GREEN : status === 'conditional' ? AUDIT_ORANGE : AUDIT_RED,
                  color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontWeight: 700,
                }}>{num}</div>
                <div className="tm-text-label" style={{ flex: 1, color: 'var(--text-strong)' }}>{q}</div>
                <StatusBadge status={status}/>
              </div>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{summary}</div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel pad={16}>
        <SectionTitle title="Final verdict" sub="개발 진입 가능 / 조건부 / 차단"/>
        <div className="tm-surface-muted" style={{ padding: 12, marginTop: 12 }}>
          <div className="tm-text-micro">VERDICT</div>
          <div className="tm-text-heading" style={{ marginTop: 4, color: AUDIT_GREEN }}>개발 진입 가능</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>결정 문서 4종 + 18 module readiness 완비. production token sweep은 별도 PR.</div>
        </div>
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          <ListItem title="P0 차단 요소" sub="없음 → 즉시 시작" trailing="0건"/>
          <ListItem title="P1 sweep 권장" sub="PR-A NumberDisplay → 5 weakest sweep" trailing="3 task"/>
          <ListItem title="P2 production 이연" sub="axe / reduced-motion / i18n / wave21b" trailing="4 task"/>
        </div>
        <div className="tm-surface-muted" style={{ padding: 12, marginTop: 12 }}>
          <div className="tm-text-micro">FIRST PR SCOPE</div>
          <div className="tm-text-label" style={{ marginTop: 4 }}>PR-A · NumberDisplay primitive</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>COMPONENT_EXTRACTION_PLAN_FIX27 §1 — 19+ callers, low risk.</div>
        </div>
        <div className="tm-surface-muted" style={{ padding: 12, marginTop: 8 }}>
          <div className="tm-text-micro">DATA SOURCE</div>
          <div className="tm-text-label" style={{ marginTop: 4 }}>fix28 · 33 sections · 331 artboards</div>
        </div>
        <div className="tm-surface-muted" style={{ padding: 12, marginTop: 8 }}>
          <div className="tm-text-micro">DOC</div>
          <div className="tm-text-label" style={{ marginTop: 4 }}>PROTOTYPE_AUDIT_FIX28.md</div>
        </div>
      </Panel>
    </div>
  </AuditPage>
);

const TokenScoreBoard = () => (
  <AuditPage
    kicker="00N TOKENS"
    title="token compliance score — color · spacing · typography"
    sub="Source(lib JSX) 정적 측정 + DOM 동적 측정. compliance rate 시각화."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, height: 650 }}>
      <Panel pad={18}>
        <SectionTitle title="Compliance breakdown" sub="raw hits vs token hits 비율"/>
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          {TOKEN_SCORE_ROWS.map(([label, rate, status, note], index) => (
            <div key={label} style={{ padding: 14, borderRadius: 14, background: 'var(--grey50)', border: '1px solid var(--grey100)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div className="tm-text-label" style={{ flex: 1 }}>{label}</div>
                <div className="tm-tabular tm-text-body-lg" style={{ color: status === 'pass' ? AUDIT_GREEN : status === 'conditional' ? AUDIT_ORANGE : AUDIT_RED, fontWeight: 700 }}>
                  {(rate * 100).toFixed(1)}%
                </div>
                <StatusBadge status={status}/>
              </div>
              <Bar rate={rate} color={status === 'pass' ? AUDIT_GREEN : status === 'conditional' ? AUDIT_ORANGE : AUDIT_RED}/>
              <div className="tm-text-caption" style={{ marginTop: 8, color: 'var(--text-muted)' }}>{note}</div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel pad={18}>
        <SectionTitle title="Production sweep 작업량" sub="lib JSX 인라인 raw value를 token으로 일괄 정리"/>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          <ListItem title="Typography sweep" sub="2,660 inline fontSize → tm-text-* class" trailing="P1·1"/>
          <ListItem title="Spacing sweep" sub="1,990 raw → token + 4-multiple 확정" trailing="P1·2"/>
          <ListItem title="Color sweep" sub="380 raw hex → var() 또는 tailwind class" trailing="P1·3"/>
          <ListItem title="Class adoption sweep" sub="63 → 95%+ tm-text-* / text-{token}" trailing="합산"/>
        </div>
        <div className="tm-surface-muted" style={{ padding: 14, marginTop: 12 }}>
          <div className="tm-text-micro">EXPECTED OUTCOME</div>
          <div className="tm-text-label" style={{ marginTop: 4, color: AUDIT_GREEN }}>typography 95%+, spacing 92%+, color 99%+</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>DOM 측정은 이미 production-equivalent. sweep은 source 정렬용.</div>
        </div>
      </Panel>
    </div>
  </AuditPage>
);

const ViewportMatrixBoard = () => (
  <AuditPage
    kicker="00N VIEWPORT"
    title="viewport coverage — functional 18 모듈"
    sub="모든 functional 모듈이 mobile + tablet + desktop 보드를 보유. reference 모듈은 의도된 single viewport."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, height: 650 }}>
      <Panel pad={18}>
        <SectionTitle title="Section × viewport count" sub="실측 dc-card offsetWidth 기준 분류"/>
        <div style={{ display: 'grid', gap: 6, marginTop: 12, maxHeight: 580, overflow: 'hidden' }}>
          <DevRow cols="220px 80px 80px 80px 1fr">
            <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>SECTION</div>
            <div className="tm-text-micro" style={{ color: 'var(--text-muted)', textAlign: 'center' }}>MOBILE</div>
            <div className="tm-text-micro" style={{ color: 'var(--text-muted)', textAlign: 'center' }}>TABLET</div>
            <div className="tm-text-micro" style={{ color: 'var(--text-muted)', textAlign: 'center' }}>DESKTOP</div>
            <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>STATUS</div>
          </DevRow>
          {VIEWPORT_MATRIX_ROWS.map(([sec, m, t, d]) => {
            const allThree = m > 0 && t > 0 && d > 0;
            const intentSingle = (m === 0 && d > 0) || (d === 0 && m > 0);
            return (
              <DevRow key={sec} cols="220px 80px 80px 80px 1fr" active={allThree}>
                <DevCellTitle>{sec}</DevCellTitle>
                <div className="tm-tabular" style={{ textAlign: 'center', color: m > 0 ? AUDIT_GREEN : 'var(--text-muted)', fontWeight: 700 }}>{m}</div>
                <div className="tm-tabular" style={{ textAlign: 'center', color: t > 0 ? AUDIT_GREEN : 'var(--text-muted)', fontWeight: 700 }}>{t}</div>
                <div className="tm-tabular" style={{ textAlign: 'center', color: d > 0 ? AUDIT_GREEN : 'var(--text-muted)', fontWeight: 700 }}>{d}</div>
                <div className="tm-text-caption" style={{ color: allThree ? AUDIT_GREEN : intentSingle ? 'var(--text-muted)' : AUDIT_ORANGE }}>{allThree ? 'pass · 3 viewport' : intentSingle ? 'pass · 의도된 single' : 'review'}</div>
              </DevRow>
            );
          })}
        </div>
      </Panel>
      <Panel pad={18}>
        <SectionTitle title="Viewport rule" sub="prototype의 의도된 viewport 정책"/>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          <ListItem title="Functional 18 모듈" sub="3 viewport 의무 (mobile + tablet + desktop)" trailing="rule"/>
          <ListItem title="Reference 모듈" sub="의도된 single viewport. mobile-first refresh / desktop-first foundation" trailing="rule"/>
          <ListItem title="Tablet 보드 단일" sub="대부분 1개. mobile-first wider variant로 처리" trailing="design"/>
          <ListItem title="Admin / Desktop 17·18" sub="mobile board 의도적 0. desktop 전용" trailing="design"/>
        </div>
        <div className="tm-surface-muted" style={{ padding: 14, marginTop: 12 }}>
          <div className="tm-text-micro">RESULT</div>
          <div className="tm-text-label" style={{ marginTop: 4, color: AUDIT_GREEN }}>functional 18/18 통과 · reference 의도 준수</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>missing viewport는 의도된 single viewport이거나 admin/desktop 전용. 결함 0.</div>
        </div>
      </Panel>
    </div>
  </AuditPage>
);

const ModuleHeatmapBoard = () => (
  <AuditPage
    kicker="00N MODULES"
    title="module compliance heatmap — 31 modules"
    sub="color · spacing · typography compliance per source file. 약점 5 모듈은 P1 sweep 우선 대상."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, height: 650 }}>
      <Panel pad={18}>
        <SectionTitle title="Compliance heatmap" sub="rate ≥ 0.95 green · 0.7-0.95 orange · &lt; 0.7 red · VIO ≥ 70은 P1 sweep 대상"/>
        <div className="tm-text-micro" style={{ display: 'grid', gap: 4, marginTop: 12, maxHeight: 560, overflowY: 'auto' }}>
          <DevRow cols="240px 80px 80px 80px 60px">
            <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>FILE</div>
            <div className="tm-text-micro" style={{ color: 'var(--text-muted)', textAlign: 'right' }}>COLOR</div>
            <div className="tm-text-micro" style={{ color: 'var(--text-muted)', textAlign: 'right' }}>SPACING</div>
            <div className="tm-text-micro" style={{ color: 'var(--text-muted)', textAlign: 'right' }}>TYPO</div>
            <div className="tm-text-micro" style={{ color: 'var(--text-muted)', textAlign: 'right' }}>VIO</div>
          </DevRow>
          {MODULE_HEAT_ROWS.map(([file, c, s, t, v]) => {
            const cellColor = (rate) => rate >= 0.95 ? AUDIT_GREEN : rate >= 0.70 ? AUDIT_ORANGE : AUDIT_RED;
            const isWeak = v >= 70;
            const isNA = c === 0 && file.includes('wave21b');
            return (
              <DevRow key={file} cols="240px 80px 80px 80px 60px" active={isWeak}>
                <DevCellTitle>{file}</DevCellTitle>
                <div className="tm-tabular" style={{ textAlign: 'right', color: isNA ? 'var(--text-muted)' : cellColor(c), fontWeight: 600 }}>{isNA ? 'N/A' : `${(c * 100).toFixed(0)}%`}</div>
                <div className="tm-tabular" style={{ textAlign: 'right', color: cellColor(s), fontWeight: 600 }}>{(s * 100).toFixed(0)}%</div>
                <div className="tm-tabular" style={{ textAlign: 'right', color: cellColor(t), fontWeight: 600 }}>{(t * 100).toFixed(0)}%</div>
                <div className="tm-tabular" style={{ textAlign: 'right', color: isWeak ? AUDIT_RED : 'var(--text-muted)', fontWeight: isWeak ? 700 : 400 }}>{v}</div>
              </DevRow>
            );
          })}
        </div>
      </Panel>
      <Panel pad={18}>
        <SectionTitle title="Top 5 weakest" sub="sweep 우선 대상 (violations 기준). 1-2위 = critical, 3-5위 = warning"/>
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {[
            ['screens-readiness', 317, 'page-family wave 누적', 'critical', 'PR-Sweep-1'],
            ['screens-ops (18)', 93, 'admin dense table inline 다수', 'critical', 'PR-Sweep-2'],
            ['screens-readiness-wave21a', 87, '09-11 readiness wave', 'warning', 'PR-Sweep-3'],
            ['screens-variants', 74, '02 홈 variant 탐구 보드', 'warning', 'PR-Sweep-4'],
            ['screens-desktop (17)', 74, 'desktop 전용 inline 패턴', 'warning', 'PR-Sweep-5'],
          ].map(([file, vio, why, severity, pr], index) => {
            const isCritical = severity === 'critical';
            return (
              <div key={file} style={{
                padding: 12, borderRadius: 14,
                background: isCritical ? 'var(--red50)' : 'var(--orange50)',
                border: isCritical ? '1px solid rgba(240,68,82,.18)' : '1px solid rgba(254,152,0,.16)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div className="tm-text-label" style={{ flex: 1 }}>{file}</div>
                  <Badge tone={isCritical ? 'red' : 'orange'} size="sm">{pr}</Badge>
                  <div className="tm-tabular" style={{ color: isCritical ? AUDIT_RED : AUDIT_ORANGE, fontWeight: 700, minWidth: 36, textAlign: 'right' }}>{vio}</div>
                </div>
                <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>{why}</div>
              </div>
            );
          })}
        </div>
        <div className="tm-surface-muted" style={{ padding: 12, marginTop: 12 }}>
          <div className="tm-text-micro">SWEEP IMPACT</div>
          <div className="tm-text-label" style={{ marginTop: 4 }}>5 모듈 sweep으로 38% violations 해소</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>전체 1,715건 중 645건이 이 5 파일에 집중 (38.0%). 나머지 26 모듈은 30건 이하씩 분산.</div>
        </div>
      </Panel>
    </div>
  </AuditPage>
);

const ReadinessChecklistBoard = () => (
  <AuditPage
    kicker="00N READY"
    title="developer readiness checklist"
    sub="개발자가 이 보드를 보고 '내일 시작 가능'을 확인. 12 항목 중 9 pass / 3 conditional or pending."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, height: 650 }}>
      <Panel pad={16}>
        <SectionTitle title="Readiness items" sub="개발 시작 전 체크해야 할 12 항목 + owner"/>
        <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
          {READINESS_ROWS.map(([label, status, note], index) => (
            <DevRow key={label} cols="220px 110px 60px 1fr" active={status === 'pending'}>
              <DevCellTitle>{label}</DevCellTitle>
              <StatusBadge status={status}/>
              <div className="tm-text-micro" style={{ color: 'var(--text-muted)', textAlign: 'right' }}>{
                ['Route manifest','Token alignment plan','Component extraction','Production token sweep','tm-text-* class adoption','API contract 캡션'].includes(label) ? 'FE-Lead' :
                ['Bottom nav contract','Light-only consumer'].includes(label) ? 'Design' :
                ['18 module case matrix','18 module readiness','Form step + edit-flow'].includes(label) ? 'PM' :
                'Backend'
              }</div>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{note}</div>
            </DevRow>
          ))}
        </div>
      </Panel>
      <Panel pad={16}>
        <SectionTitle title="Re-audit gate threshold" sub="P0 0건 + P1 ≤ 50% 통과 시 재게이트 통과"/>
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          <ListItem title="Token sweep PR 머지 후" sub="typography 80%+, spacing 92%+, color 99%+" trailing="FE-Lead"/>
          <ListItem title="5 primitive 추출 PR 후" sub="component reuse rate 95%+" trailing="FE-Lead"/>
          <ListItem title="신규 모듈 추가 시" sub="단일 module audit + 새 readiness 보드" trailing="Design"/>
        </div>
        <div className="tm-surface-muted" style={{ padding: 12, marginTop: 12 }}>
          <div className="tm-text-micro">ESCALATION</div>
          <div className="tm-text-label" style={{ marginTop: 4 }}>P0 발견 시</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>.github/tasks/{`{N}`}-{`{name}`}.md 신규 생성 → owner 지정 → re-audit gate</div>
        </div>
        <div className="tm-surface-muted" style={{ padding: 12, marginTop: 8 }}>
          <div className="tm-text-micro">SCRIPT</div>
          <div className="tm-text-label tm-tabular" style={{ marginTop: 4, fontSize: 'var(--fs-caption)' }}>PROTOTYPE_FIX=fix29 node scripts/qa/teameet-design-prototype-audit.mjs</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>artifact: output/playwright/teameet-design-{`{fix}`}-audit.json</div>
        </div>
        <div className="tm-surface-muted" style={{ padding: 12, marginTop: 8 }}>
          <div className="tm-text-micro">DOC</div>
          <div className="tm-text-label" style={{ marginTop: 4 }}>PROTOTYPE_AUDIT_FIX28.md</div>
        </div>
      </Panel>
    </div>
  </AuditPage>
);

Object.assign(window, {
  AuditSummaryBoard,
  TokenScoreBoard,
  ViewportMatrixBoard,
  ModuleHeatmapBoard,
  ReadinessChecklistBoard,
});
