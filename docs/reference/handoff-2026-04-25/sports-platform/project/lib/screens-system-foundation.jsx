const SYSTEM_BLUE = 'var(--blue500)';
const SYSTEM_BORDER = '1px solid var(--border)';

const TYPE_SCALE_ROWS = [
  ['Display', 'tm-text-display', '36 / 44', '핵심 성과, 성공 화면, 404 같은 단일 주목 숫자'],
  ['Title', 'tm-text-title', '30 / 36', '데스크탑 보드 제목, 큰 섹션 헤딩'],
  ['Heading', 'tm-text-heading', '24 / 32', '상세 상단, 모바일 주요 타이틀'],
  ['Subhead', 'tm-text-subhead', '20 / 28', '카드 그룹 제목, sheet 제목'],
  ['Body large', 'tm-text-body-lg', '17 / 26', '강조 본문, 리스트 primary'],
  ['Body', 'tm-text-body', '15 / 22', '기본 설명, 폼 도움말'],
  ['Label', 'tm-text-label', '13 / 19', '칩, 필터, 섹션 보조 라벨'],
  ['Caption', 'tm-text-caption', '12 / 18', '메타, 시간, empty state 설명'],
  ['Micro', 'tm-text-micro', '11 / 15', '상태 badge, 테이블 보조값'],
];

const BUTTON_RULE_ROWS = [
  ['sm', '40', 'px-4', '보조 액션, compact row action'],
  ['md', '48', 'px-5', '기본 폼 CTA, 리스트 내 action'],
  ['lg', '56', 'px-[22px]', 'sticky CTA, bottom sheet primary'],
  ['xl', '64', 'px-6', '결제/가입 확정 같은 최종 CTA'],
  ['icon', '44', 'square', 'nav, close, filter, share'],
];

const MOTION_ROWS = [
  ['Tap', 'scale(.98)', '120ms / out-quart', 'button, chip, card action feedback'],
  ['Enter', 'translateY(8) + opacity', '280ms / out-quint', 'list, card, empty state appear'],
  ['Sheet', 'translateY(20) + opacity', '280ms / out-expo', 'bottom sheet open/close'],
  ['Skeleton', 'shimmer', '1400ms', 'loading row and card placeholder'],
  ['Reduced motion', '0.01ms', 'system preference', 'prefers-reduced-motion 대응'],
];

const FOUNDATION_DOC_ROWS = [
  ['tailwind.teameet.config.js', 'color, spacing, radius, type, screen, motion token'],
  ['tailwind.teameet.css', '@layer components 기반 tm-* component classes'],
  ['tokens.jsx', 'static prototype runtime classes and shared atoms'],
  ['DESIGN_SYSTEM_FOUNDATION_FIX24.md', '개발팀 구현 contract 문서'],
];

const SystemPage = ({ kicker, title, sub, children }) => (
  <div style={{ width: 1280, height: 820, background: 'var(--bg)', color: 'var(--text-strong)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, marginBottom: 22 }}>
      <div style={{ minWidth: 0 }}>
        <Badge tone="blue" size="sm">{kicker}</Badge>
        <div className="tm-text-title" style={{ marginTop: 10 }}>{title}</div>
        {sub && <div className="tm-text-body" style={{ marginTop: 8, maxWidth: 850, color: 'var(--text-muted)' }}>{sub}</div>}
      </div>
    </div>
    {children}
  </div>
);

const SystemPanel = ({ children, pad = 16, style, className = '' }) => (
  <div className={`tm-card ${className}`.trim()} style={{ padding: pad, ...style }}>
    {children}
  </div>
);

const SystemTableHeader = ({ cols }) => (
  <div style={{ display: 'grid', gridTemplateColumns: cols, background: 'var(--grey50)', borderBottom: '1px solid var(--grey100)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>
    {['Name', 'Token class', 'Size', 'Usage'].map((h) => <div key={h} style={{ padding: '12px 14px' }}>{h}</div>)}
  </div>
);

const TypographyFoundationBoard = () => (
  <SystemPage
    kicker="00K TYPOGRAPHY"
    title="타이포그래피는 9단계만 사용"
    sub="Pretendard 기반, weight는 400/600/700 중심으로 제한합니다. 모든 숫자/금액/통계는 tm-tabular 또는 tab-num을 같이 사용합니다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 390px', gap: 18, height: 650 }}>
      <SystemPanel pad={0} style={{ overflow: 'hidden' }}>
        <SystemTableHeader cols="130px 190px 110px 1fr"/>
        {TYPE_SCALE_ROWS.map(([name, token, size, usage], index) => (
          <div key={name} style={{ display: 'grid', gridTemplateColumns: '130px 190px 110px 1fr', alignItems: 'center', borderBottom: index === TYPE_SCALE_ROWS.length - 1 ? 'none' : '1px solid var(--grey100)' }}>
            <div style={{ padding: '12px 14px', fontWeight: 700, fontSize: 13 }}>{name}</div>
            <div className="tm-tabular" style={{ padding: '12px 14px', fontSize: 12, color: SYSTEM_BLUE, fontWeight: 700 }}>{token}</div>
            <div className="tm-tabular" style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)' }}>{size}</div>
            <div style={{ padding: '12px 14px' }}><div className={token} style={{ fontSize: index < 3 ? undefined : undefined }}>{usage}</div></div>
          </div>
        ))}
      </SystemPanel>
      <SystemPanel pad={18}>
        <SectionTitle title="숫자 표시 원칙" sub="숫자는 글자보다 더 엄격하게 폭과 정렬을 고정합니다."/>
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <div className="tm-surface-muted" style={{ padding: 16 }}>
            <div className="tm-text-micro">KPI / NUMBERDISPLAY</div>
            <div className="tm-tabular" style={{ fontSize: 42, lineHeight: '48px', fontWeight: 700, marginTop: 6 }}>128,400<span style={{ fontSize: 18, color: 'var(--text-muted)', marginLeft: 4 }}>원</span></div>
            <div className="tm-text-caption" style={{ marginTop: 6 }}>금액, 인원, 시간, 점수는 tabular number 고정</div>
          </div>
          <ListItem title="대형 숫자" sub="line-height는 글자 높이보다 넉넉하게 잡아 clipping false positive를 줄입니다." trailing="36/44"/>
          <ListItem title="리스트 숫자" sub="금액/시간은 우측 정렬, 단위는 50~60% 크기" trailing="15/22"/>
          <ListItem title="테이블 숫자" sub="Admin 표에서는 모든 숫자 셀을 tm-tabular로 고정" trailing="tabular"/>
        </div>
      </SystemPanel>
    </div>
  </SystemPage>
);

const ButtonActionSystemBoard = () => (
  <SystemPage
    kicker="00K BUTTONS"
    title="버튼 크기와 액션 위계"
    sub="버튼은 tm-btn + size + variant 조합으로만 만든다. 직접 height, padding, radius를 각 화면에서 다시 정의하지 않는다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 18, height: 650 }}>
      <SystemPanel pad={18}>
        <SectionTitle title="Size contract" sub="모바일 터치 타겟 44px 이상을 유지합니다."/>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {BUTTON_RULE_ROWS.map(([size, h, pad, usage], index) => (
            <div key={size} style={{ display: 'grid', gridTemplateColumns: '52px 62px 86px 1fr', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, background: index === 1 ? 'var(--blue50)' : 'var(--grey50)', border: index === 1 ? '1px solid var(--blue-alpha-08)' : '1px solid var(--grey100)' }}>
              <div className="tm-tabular" style={{ fontWeight: 700, color: index === 1 ? SYSTEM_BLUE : 'var(--text-strong)' }}>{size}</div>
              <div className="tm-tabular tm-text-label">{h}px</div>
              <div className="tm-text-micro">{pad}</div>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{usage}</div>
            </div>
          ))}
        </div>
      </SystemPanel>
      <SystemPanel pad={18}>
        <SectionTitle title="Variant matrix" sub="blue는 장식이 아니라 primary interaction에만 사용합니다."/>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14, marginTop: 14 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <SBtn size="sm">Small primary</SBtn>
            <SBtn size="md">Medium primary</SBtn>
            <SBtn size="lg">Large sticky CTA</SBtn>
            <SBtn size="xl">Final confirmation</SBtn>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <SBtn variant="secondary" size="md">Secondary action</SBtn>
            <SBtn variant="neutral" size="md">Neutral action</SBtn>
            <SBtn variant="outline" size="md">Outline action</SBtn>
            <SBtn variant="danger" size="md">Danger action</SBtn>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 18 }}>
          {['Default', 'Hover', 'Pressed', 'Disabled'].map((state, index) => (
            <div key={state} className="tm-surface-muted" style={{ padding: 12, minHeight: 112 }}>
              <div className="tm-text-micro">{state}</div>
              <SBtn size="sm" disabled={index === 3} style={{ marginTop: 12, transform: index === 2 ? 'scale(.98)' : undefined }}>{index === 1 ? 'hover' : '확인'}</SBtn>
              <div className="tm-text-caption" style={{ marginTop: 10 }}>{index === 1 ? 'bg blue-600' : index === 2 ? 'scale .98' : index === 3 ? 'opacity .42' : 'base token'}</div>
            </div>
          ))}
        </div>
      </SystemPanel>
    </div>
  </SystemPage>
);

const ControlFoundationBoard = () => (
  <SystemPage
    kicker="00K CONTROLS"
    title="Chip · Input · Card · List row 규격"
    sub="필터, 입력, 리스트, 카드가 서로 다른 앱처럼 보이지 않도록 기본 높이와 radius를 고정합니다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18, height: 650 }}>
      <SystemPanel pad={18}>
        <SectionTitle title="Chips and segmented controls" sub="선택 상태는 blue, 비선택은 grey로만 처리합니다."/>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <Chip active>오늘</Chip>
          <Chip>내일</Chip>
          <Chip>초급 환영</Chip>
          <Chip>마감임박</Chip>
          <Chip size="sm" active>sm active</Chip>
          <Chip size="sm">sm inactive</Chip>
        </div>
        <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
          <input className="tm-input" placeholder="지역, 팀명, 코치 이름 검색"/>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input className="tm-input" placeholder="시작 시간"/>
            <input className="tm-input" placeholder="종료 시간"/>
          </div>
        </div>
      </SystemPanel>
      <SystemPanel pad={18}>
        <SectionTitle title="List before card" sub="정보 구조가 우선이고, 카드는 반복 item frame에만 사용합니다."/>
        <div style={{ marginTop: 10, borderRadius: 16, overflow: 'hidden', border: SYSTEM_BORDER }}>
          <ListItem leading={<Badge tone="blue">매치</Badge>} title="오늘 20:00 잠실 풋살장" sub="초중급 · 2자리 · 12,000원" trailing="상세" chev/>
          <ListItem leading={<Badge tone="green">레슨</Badge>} title="서브 집중반 4회권" sub="잔여 2회 · 다음 예약 토 10:00" trailing="예약"/>
          <ListItem leading={<Badge tone="orange">장터</Badge>} title="테니스 라켓 거래 대기" sub="안전거래 · 픽업 전 확인 필요" trailing="진행중"/>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 16 }}>
          <Card interactive pad={16}>
            <div className="tm-text-label">tm-card</div>
            <div className="tm-text-caption" style={{ marginTop: 6 }}>border + radius 16 + restrained hover</div>
          </Card>
          <Card pad={16}>
            <div className="tm-text-label">solid surface</div>
            <div className="tm-text-caption" style={{ marginTop: 6 }}>no glow, no one-side border</div>
          </Card>
        </div>
      </SystemPanel>
    </div>
  </SystemPage>
);

const MotionInteractionSystemBoard = () => (
  <SystemPage
    kicker="00K MOTION"
    title="인터랙션과 애니메이션은 5개 패턴만 사용"
    sub="모션은 장식이 아니라 상태 변화를 설명해야 합니다. transform/opacity 중심으로 제한하고 layout property animation은 금지합니다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 18, height: 650 }}>
      <SystemPanel pad={0} style={{ overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '130px 210px 180px 1fr', background: 'var(--grey50)', borderBottom: '1px solid var(--grey100)', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
          {['Motion', 'Transform', 'Timing', 'Usage'].map((h) => <div key={h} style={{ padding: '13px 14px' }}>{h}</div>)}
        </div>
        {MOTION_ROWS.map(([name, transform, timing, usage], index) => (
          <div key={name} style={{ display: 'grid', gridTemplateColumns: '130px 210px 180px 1fr', borderBottom: index === MOTION_ROWS.length - 1 ? 'none' : '1px solid var(--grey100)', alignItems: 'center' }}>
            <div style={{ padding: '15px 14px', fontSize: 14, fontWeight: 700 }}>{name}</div>
            <div className="tm-tabular" style={{ padding: '15px 14px', fontSize: 12, color: SYSTEM_BLUE, fontWeight: 700 }}>{transform}</div>
            <div className="tm-tabular" style={{ padding: '15px 14px', fontSize: 12, color: 'var(--text-muted)' }}>{timing}</div>
            <div style={{ padding: '15px 14px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>{usage}</div>
          </div>
        ))}
      </SystemPanel>
      <SystemPanel pad={18}>
        <SectionTitle title="Storyboard" sub="상태 전이는 같은 리듬으로 반복됩니다."/>
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          {[
            ['1', 'Tap', '사용자가 CTA를 누르면 scale .98로 즉시 피드백'],
            ['2', 'Pending', '버튼 disabled + persistent row로 대기 이유 표시'],
            ['3', 'Sheet', '하단 sheet가 280ms로 올라오며 핵심 선택지만 표시'],
            ['4', 'Confirm', '성공은 toast가 아니라 화면 안 confirmation row로 남김'],
          ].map(([step, title, sub], index) => (
            <div key={step} className="tm-animate-enter" style={{ display: 'grid', gridTemplateColumns: '36px 1fr', gap: 12, alignItems: 'start', padding: 12, borderRadius: 14, background: index === 0 ? 'var(--blue50)' : 'var(--grey50)', border: index === 0 ? '1px solid var(--blue-alpha-08)' : '1px solid var(--grey100)', animationDelay: `${index * 35}ms` }}>
              <div className="tm-tabular" style={{ width: 36, height: 36, borderRadius: 12, background: index === 0 ? SYSTEM_BLUE : 'var(--grey100)', color: index === 0 ? 'var(--static-white)' : 'var(--text-muted)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{step}</div>
              <div>
                <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{title}</div>
                <div className="tm-text-caption" style={{ marginTop: 3 }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>
      </SystemPanel>
    </div>
  </SystemPage>
);

const LayoutSpacingSystemBoard = () => (
  <SystemPage
    kicker="00K LAYOUT"
    title="Mobile · Tablet · Desktop 배치 storyboard"
    sub="같은 기능을 기기별로 단순 확대하지 않고, 정보 우선순위와 조작 위치를 유지하면서 density만 바꿉니다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '360px 360px 1fr', gap: 16, height: 650 }}>
      {[
        ['Mobile', '375', 'single column', 'sticky CTA + bottom nav', 'var(--blue50)'],
        ['Tablet', '768', 'list + aside', 'chip wrap + 2 columns', 'var(--grey50)'],
        ['Desktop', '1280', 'filter + result', 'centered content + tables', 'var(--grey50)'],
      ].map(([device, width, grid, action, bg], index) => (
        <SystemPanel key={device} pad={16} style={{ background: bg }}>
          <Badge tone={index === 0 ? 'blue' : 'grey'}>{width}px</Badge>
          <div className="tm-text-heading" style={{ marginTop: 12 }}>{device}</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>{grid}</div>
          <div style={{ display: 'grid', gap: index === 0 ? 10 : 12, marginTop: 18 }}>
            <div style={{ height: index === 2 ? 74 : 92, borderRadius: 16, background: 'var(--bg)', border: SYSTEM_BORDER, padding: 14 }}>
              <div className="tm-text-label">Primary content</div>
              <div className="tm-text-caption" style={{ marginTop: 5 }}>{action}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: index === 0 ? '1fr' : '1fr 1fr', gap: 10 }}>
              <div style={{ height: 78, borderRadius: 14, background: 'var(--bg)', border: SYSTEM_BORDER, padding: 12 }}><div className="tm-text-micro">State</div></div>
              {index > 0 && <div style={{ height: 78, borderRadius: 14, background: 'var(--bg)', border: SYSTEM_BORDER, padding: 12 }}><div className="tm-text-micro">Aside</div></div>}
            </div>
            <div style={{ height: index === 0 ? 56 : 44, borderRadius: 14, background: index === 2 ? '#111827' : SYSTEM_BLUE, color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{index === 2 ? 'Admin sidebar only dark' : 'CTA / Nav action'}</div>
          </div>
        </SystemPanel>
      ))}
    </div>
  </SystemPage>
);

const TailwindImplementationContractBoard = () => (
  <SystemPage
    kicker="00K HANDOFF"
    title="개발팀 구현 계약"
    sub="화면을 만들기 전에 이 파일과 class contract를 먼저 확인합니다. 임의 px와 one-off button style은 새로 만들지 않습니다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 430px', gap: 18, height: 650 }}>
      <SystemPanel pad={18}>
        <SectionTitle title="Production usage" sub="실제 앱에서는 Tailwind utility + tm component class를 조합합니다."/>
        <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
          {FOUNDATION_DOC_ROWS.map(([file, desc], index) => (
            <div key={file} style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: 12, padding: 13, borderRadius: 14, background: index === 0 ? 'var(--blue50)' : 'var(--grey50)', border: index === 0 ? '1px solid var(--blue-alpha-08)' : '1px solid var(--grey100)' }}>
              <div className="tm-tabular" style={{ width: 40, height: 40, borderRadius: 13, display: 'grid', placeItems: 'center', background: index === 0 ? SYSTEM_BLUE : 'var(--grey100)', color: index === 0 ? 'var(--static-white)' : 'var(--text-muted)', fontWeight: 700 }}>{index + 1}</div>
              <div>
                <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{file}</div>
                <div className="tm-text-caption" style={{ marginTop: 4 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </SystemPanel>
      <SystemPanel pad={18}>
        <SectionTitle title="Do / Don't" sub="구현 리뷰에서 바로 확인할 항목"/>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {[
            ['Do', 'tm-btn tm-btn-md tm-btn-primary'],
            ['Do', 'tm-text-body + tm-tabular'],
            ['Do', 'grid minmax(0,1fr) + min-w-0'],
            ['Do', 'duration-fast/base/slow + ease-out-quart'],
            ['Do not', 'style={{ height: 47, padding: ... }}'],
            ['Do not', 'blue background for decoration'],
            ['Do not', 'one-side colored border'],
          ].map(([kind, text], index) => (
            <div key={`${kind}-${text}`} style={{ display: 'grid', gridTemplateColumns: '74px 1fr', alignItems: 'center', gap: 10, padding: 11, borderRadius: 13, background: kind === 'Do' ? 'var(--blue50)' : 'var(--red50)', border: kind === 'Do' ? '1px solid var(--blue-alpha-08)' : '1px solid var(--red-alpha-08)' }}>
              <Badge tone={kind === 'Do' ? 'blue' : 'red'} size="sm">{kind}</Badge>
              <div className="tm-tabular" style={{ fontSize: 12, fontWeight: 700, color: kind === 'Do' ? SYSTEM_BLUE : 'var(--red500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</div>
            </div>
          ))}
        </div>
      </SystemPanel>
    </div>
  </SystemPage>
);

Object.assign(window, {
  TypographyFoundationBoard,
  ButtonActionSystemBoard,
  ControlFoundationBoard,
  MotionInteractionSystemBoard,
  LayoutSpacingSystemBoard,
  TailwindImplementationContractBoard,
});
