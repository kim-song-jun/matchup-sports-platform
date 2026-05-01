const Wave21EBlue = 'var(--blue500)';
const Wave21EBorder = '1px solid var(--border)';
const Wave21EButtonClass = (variant = 'primary', size = 'sm') => {
  const tone = variant === 'danger' ? 'tm-btn-danger' : variant === 'secondary' ? 'tm-btn-secondary' : variant === 'neutral' ? 'tm-btn-neutral' : 'tm-btn-primary';
  return `tm-btn tm-btn-${size} ${tone}`;
};

const Wave21EBoard = ({ kicker, title, sub, children, width = 1280, height = 800, dark = false }) => (
  <div style={{
    width,
    height,
    overflow: 'hidden',
    background: dark ? '#111827' : 'var(--bg)',
    color: dark ? '#f8fafc' : 'var(--text-strong)',
    fontFamily: 'var(--font)',
    padding: 28,
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, marginBottom: 22 }}>
      <div style={{ minWidth: 0 }}>
        <Badge tone={dark ? 'grey' : 'blue'} size="sm">{kicker}</Badge>
        <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.18, marginTop: 10, letterSpacing: 0 }}>{title}</div>
        {sub && <div style={{ fontSize: 13, color: dark ? '#94a3b8' : 'var(--text-muted)', lineHeight: 1.55, marginTop: 8, maxWidth: 720 }}>{sub}</div>}
      </div>
    </div>
    {children}
  </div>
);

const Wave21EPanel = ({ children, pad = 16, dark = false, style }) => (
  <div style={{
    borderRadius: 16,
    background: dark ? '#1f2937' : 'var(--bg)',
    border: dark ? '1px solid rgba(148,163,184,.2)' : Wave21EBorder,
    padding: pad,
    minWidth: 0,
    ...style,
  }}>
    {children}
  </div>
);

const Wave21ESoftPanel = ({ children, dark = false, style }) => (
  <div style={{
    borderRadius: 14,
    background: dark ? 'rgba(148,163,184,.08)' : 'var(--grey50)',
    border: dark ? '1px solid rgba(148,163,184,.14)' : '1px solid var(--grey100)',
    padding: 14,
    minWidth: 0,
    ...style,
  }}>
    {children}
  </div>
);

const Wave21EIconBox = ({ name = 'check', tone = 'blue', dark = false }) => {
  const toneMap = {
    blue: ['var(--blue50)', Wave21EBlue],
    green: ['var(--green50)', 'var(--green500)'],
    orange: ['var(--orange50)', 'var(--orange500)'],
    red: ['var(--red50)', 'var(--red500)'],
    grey: ['var(--grey100)', 'var(--text-muted)'],
  };
  const [bg, fg] = toneMap[tone] || toneMap.blue;
  return (
    <div style={{
      width: 36,
      height: 36,
      borderRadius: 12,
      display: 'grid',
      placeItems: 'center',
      background: dark ? 'rgba(49,130,246,.12)' : bg,
      color: dark ? '#60a5fa' : fg,
      flexShrink: 0,
    }}>
      <Icon name={name} size={18} color="currentColor"/>
    </div>
  );
};

const Wave21ECellText = ({ title, sub, dark = false }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ fontSize: 13, fontWeight: 700, color: dark ? '#f8fafc' : 'var(--text-strong)', whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', lineHeight: 1.28, wordBreak: 'keep-all' }}>{title}</div>
    {sub && <div style={{ fontSize: 11, color: dark ? '#94a3b8' : 'var(--text-caption)', marginTop: 3, whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', lineHeight: 1.3, wordBreak: 'keep-all' }}>{sub}</div>}
  </div>
);

const Wave21EProgress = ({ value, tone = 'blue', dark = false }) => {
  const colors = {
    blue: Wave21EBlue,
    green: 'var(--green500)',
    orange: 'var(--orange500)',
    red: 'var(--red500)',
  };
  return (
    <div style={{ height: 8, borderRadius: 999, background: dark ? 'rgba(148,163,184,.18)' : 'var(--grey100)', overflow: 'hidden' }}>
      <div style={{ width: `${value}%`, height: '100%', borderRadius: 999, background: colors[tone] || Wave21EBlue }}/>
    </div>
  );
};

const Wave21ETable = ({ columns, rows, dark = false, compact = false }) => (
  <div style={{ borderRadius: 14, border: dark ? '1px solid rgba(148,163,184,.18)' : Wave21EBorder, overflow: 'hidden', background: dark ? '#111827' : 'var(--bg)' }}>
    <div style={{
      display: 'grid',
      gridTemplateColumns: columns.map((c) => c.width).join(' '),
      background: dark ? 'rgba(148,163,184,.08)' : 'var(--grey50)',
      color: dark ? '#94a3b8' : 'var(--text-muted)',
      fontSize: 11,
      fontWeight: 700,
      borderBottom: dark ? '1px solid rgba(148,163,184,.16)' : '1px solid var(--grey100)',
    }}>
      {columns.map((column) => <div key={column.label} style={{ padding: compact ? '9px 10px' : '12px 14px' }}>{column.label}</div>)}
    </div>
    {rows.map((row, rowIndex) => (
      <div key={`${row[0]}-${rowIndex}`} style={{
        display: 'grid',
        gridTemplateColumns: columns.map((c) => c.width).join(' '),
        alignItems: 'center',
        borderBottom: rowIndex === rows.length - 1 ? 'none' : dark ? '1px solid rgba(148,163,184,.12)' : '1px solid var(--grey100)',
        fontSize: compact ? 12 : 13,
      }}>
        {row.map((cell, cellIndex) => <div key={`${rowIndex}-${cellIndex}`} style={{ padding: compact ? '10px' : '12px 14px', minWidth: 0 }}>{cell}</div>)}
      </div>
    ))}
  </div>
);

const Wave21EStateItem = ({ badge, tone, title, sub, action, dark = false }) => (
  <Wave21ESoftPanel dark={dark} style={{ display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 12, alignItems: 'center' }}>
    <Wave21EIconBox tone={tone} name={tone === 'red' ? 'close' : tone === 'orange' ? 'clock' : 'check'} dark={dark}/>
    <div style={{ minWidth: 0 }}>
      <Badge tone={tone} size="sm">{badge}</Badge>
      <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35, marginTop: 7 }}>{title}</div>
      <div style={{ fontSize: 12, color: dark ? '#94a3b8' : 'var(--text-muted)', lineHeight: 1.45, marginTop: 4 }}>{sub}</div>
    </div>
    {action && <button className={Wave21EButtonClass(tone === 'red' ? 'danger' : 'primary')} style={{ flexShrink: 0 }}>{action}</button>}
  </Wave21ESoftPanel>
);

const Wave21EKeyboardKey = ({ children, active = false, dark = false }) => (
  <span className="tab-num" style={{
    minWidth: 34,
    height: 30,
    padding: '0 10px',
    borderRadius: 9,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: active ? Wave21EBlue : dark ? 'rgba(148,163,184,.12)' : 'var(--grey100)',
    color: active ? 'var(--static-white)' : dark ? '#e5e7eb' : 'var(--text-strong)',
    fontSize: 12,
    fontWeight: 700,
  }}>{children}</span>
);

const Wave21EMotionStep = ({ step, title, sub, tone = 'blue', dark = false }) => (
  <Wave21ESoftPanel dark={dark} style={{ display: 'grid', gridTemplateColumns: '42px 1fr', gap: 12, alignItems: 'start' }}>
    <div className="tab-num" style={{
      width: 42,
      height: 42,
      borderRadius: 14,
      display: 'grid',
      placeItems: 'center',
      background: tone === 'blue' ? Wave21EBlue : tone === 'orange' ? 'var(--orange500)' : 'var(--green500)',
      color: 'var(--static-white)',
      fontSize: 14,
      fontWeight: 700,
    }}>{step}</div>
    <div>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 12, color: dark ? '#94a3b8' : 'var(--text-muted)', lineHeight: 1.45, marginTop: 4 }}>{sub}</div>
    </div>
  </Wave21ESoftPanel>
);

const Wave21EKPI = ({ label, value, unit = '', dark = false }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ fontSize: 11, fontWeight: 600, color: dark ? '#94a3b8' : 'var(--text-muted)' }}>{label}</div>
    <div className="tab-num" style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.15, marginTop: 4, color: dark ? '#f8fafc' : 'var(--text-strong)', whiteSpace: 'nowrap' }}>
      {value}<span style={{ fontSize: 11, fontWeight: 600, color: dark ? '#94a3b8' : 'var(--text-muted)', marginLeft: 2 }}>{unit}</span>
    </div>
  </div>
);

const Wave21EDesktopShell = ({ mode = 'list', dark = false }) => {
  const compact = mode === 'tablet';
  const textMuted = dark ? '#94a3b8' : 'var(--text-muted)';
  return (
    <div style={{
      height: '100%',
      borderRadius: 18,
      background: dark ? '#0f172a' : 'var(--grey50)',
      border: dark ? '1px solid rgba(148,163,184,.18)' : '1px solid var(--grey100)',
      overflow: 'hidden',
      display: 'grid',
      gridTemplateColumns: compact ? '132px minmax(0, 1fr)' : '170px minmax(0, 1fr) 220px',
      minWidth: 0,
    }}>
      <div style={{ background: dark ? '#111827' : 'var(--bg)', borderRight: dark ? '1px solid rgba(148,163,184,.14)' : '1px solid var(--grey100)', padding: compact ? 14 : 18 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Teameet</div>
        <div style={{ fontSize: 11, color: textMuted, marginTop: 3 }}>Desktop</div>
        <div style={{ marginTop: 22, display: 'grid', gap: 8 }}>
          {['홈', '매치 찾기', '레슨', '시설', '장터'].map((item, index) => (
            <div key={item} style={{ height: 38, borderRadius: 12, padding: '0 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: index === 1 ? dark ? 'rgba(49,130,246,.16)' : 'var(--blue50)' : 'transparent', color: index === 1 ? dark ? '#60a5fa' : Wave21EBlue : dark ? '#e5e7eb' : 'var(--text)', fontSize: compact ? 12 : 13, fontWeight: index === 1 ? 700 : 600, whiteSpace: 'nowrap' }}>
              {item}
              {index === 1 && <span style={{ width: 6, height: 6, borderRadius: 999, background: Wave21EBlue }}/>}
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: compact ? 16 : 18, minWidth: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: compact ? 20 : 22, fontWeight: 700, lineHeight: 1.2, color: dark ? '#f8fafc' : 'var(--text-strong)' }}>서울 매치 검색</div>
            <div style={{ fontSize: 12, color: textMuted, marginTop: 4 }}>키보드, 필터, 사이드 패널이 같은 IA 안에서 작동합니다.</div>
          </div>
          <button className="tm-pressable tm-break-keep" style={{ height: 36, borderRadius: 11, padding: '0 12px', background: Wave21EBlue, color: 'var(--static-white)', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{compact ? '새 매치' : '새 매치 만들기'}</button>
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['축구', '오늘', '강남 5km', '중급', '참가 가능'].slice(0, compact ? 4 : 5).map((chip, index) => <HapticChip key={chip} active={index < 2}>{chip}</HapticChip>)}
        </div>
        <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
          {[
            ['오늘 20:00', '잠실 보조구장 · 11v11', '4자리', 'blue'],
            ['내일 07:30', '성수 풋살파크 · 5v5', '대기 3명', 'orange'],
            ['토 18:00', '한강 농구장 · 3on3', '모집 완료', 'grey'],
          ].map(([time, sub, state, tone], index) => (
            <Wave21EPanel key={time} dark={dark} pad={14} style={{ outline: index === 0 ? `2px solid ${Wave21EBlue}` : 'none', outlineOffset: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
                <Wave21ECellText title={time} sub={sub} dark={dark}/>
                <Badge tone={tone} size="sm">{state}</Badge>
              </div>
            </Wave21EPanel>
          ))}
        </div>
      </div>
      {mode !== 'tablet' && (
        <div style={{ background: dark ? '#111827' : 'var(--bg)', border: dark ? '1px solid rgba(148,163,184,.14)' : '1px solid var(--grey100)', borderRadius: 16, padding: 16, overflow: 'hidden' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: dark ? '#f8fafc' : 'var(--text-strong)' }}>상세 패널</div>
          <div style={{ fontSize: 12, color: textMuted, marginTop: 5, lineHeight: 1.45 }}>선택한 행의 예약, 결제, 채팅 진입을 같은 화면에서 처리합니다.</div>
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Wave21EKPI label="남은 자리" value={4} unit="명" dark={dark}/>
            <Wave21EKPI label="참가비" value="12,000" unit="원" dark={dark}/>
          </div>
          <div style={{ marginTop: 16 }}>
            <MoneyRow label="예상 결제" amount={12000} strong accent/>
            <MoneyRow label="취소 가능" amount="경기 3시간 전" unit=""/>
          </div>
        </div>
      )}
    </div>
  );
};

const Wave21EAdminShell = ({ mode = 'queue', dark = false }) => {
  const compact = mode === 'tablet';
  const textMuted = dark ? '#94a3b8' : 'var(--text-muted)';
  const sidebarMuted = '#94a3b8';
  const rows = [
    ['☑', <Wave21ECellText title="신고 #R-2048" sub="매치 취소 분쟁" dark={dark}/>, '민지', <Badge tone="orange" size="sm">검토</Badge>, '증빙 2건 추가'],
    ['☑', <Wave21ECellText title="정산 #P-7812" sub="부분 환불 포함" dark={dark}/>, '준호', <Badge tone="red" size="sm">실패</Badge>, 'PG 응답 timeout'],
    ['☐', <Wave21ECellText title="시설 #V-312" sub="가격표 재승인" dark={dark}/>, '소연', <Badge tone="blue" size="sm">잠금</Badge>, '다른 운영자 처리 중'],
    ['☐', <Wave21ECellText title="유저 #U-180" sub="제재 이의제기" dark={dark}/>, '리드', <Badge tone="green" size="sm">완료</Badge>, '감사 로그 기록됨'],
  ];
  return (
    <div style={{
      height: '100%',
      borderRadius: 18,
      background: dark ? '#0f172a' : 'var(--grey50)',
      border: dark ? '1px solid rgba(148,163,184,.18)' : '1px solid var(--grey100)',
      overflow: 'hidden',
      display: 'grid',
      gridTemplateColumns: compact ? '132px minmax(0, 1fr)' : '170px minmax(0, 1fr)',
    }}>
      <div style={{ background: '#111827', borderRight: '1px solid #1f2937', padding: compact ? 14 : 18, color: 'var(--static-white)' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--static-white)' }}>Teameet</div>
        <div style={{ fontSize: 11, color: sidebarMuted, marginTop: 3 }}>Admin</div>
        <div style={{ marginTop: 24, display: 'grid', gap: 8 }}>
          {['대시보드', '신고 처리', '정산', '시설 승인', '운영 로그'].map((item, index) => (
            <div key={item} style={{ height: 38, borderRadius: 12, padding: '0 10px', display: 'flex', alignItems: 'center', background: index === 1 ? 'rgba(49,130,246,.18)' : 'transparent', color: index === 1 ? '#93c5fd' : '#e5e7eb', fontSize: compact ? 12 : 13, fontWeight: index === 1 ? 700 : 600, whiteSpace: 'nowrap' }}>{item}</div>
          ))}
        </div>
      </div>
      <div style={{ padding: compact ? 16 : 20, overflow: 'hidden', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: compact ? 20 : 22, fontWeight: 700, lineHeight: 1.2, color: dark ? '#f8fafc' : 'var(--text-strong)' }}>운영 처리 큐</div>
            <div style={{ fontSize: 12, color: textMuted, marginTop: 4 }}>부분 실패, 동시 처리, 감사 로그를 숨기지 않습니다.</div>
          </div>
          <button className="tm-pressable tm-break-keep" style={{ height: 36, borderRadius: 11, padding: '0 12px', background: Wave21EBlue, color: 'var(--static-white)', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{compact ? '처리' : '선택 처리'}</button>
        </div>
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: compact ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12 }}>
          <Wave21EKPI label="대기" value={42} dark={dark}/>
          <Wave21EKPI label="부분 실패" value={3} dark={dark}/>
          <Wave21EKPI label="동시 처리" value={2} dark={dark}/>
          <Wave21EKPI label="권한 제한" value={7} dark={dark}/>
        </div>
        <div style={{ marginTop: 16 }}>
          {compact ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {rows.slice(0, 3).map(([check, caseCell, owner, state, log], index) => (
                <Wave21ESoftPanel key={index} dark={dark} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>{caseCell}<div style={{ fontSize: 11, color: textMuted, marginTop: 5 }}>{owner} · {log}</div></div>
                  {state}
                </Wave21ESoftPanel>
              ))}
            </div>
          ) : (
            <Wave21ETable
              dark={dark}
              compact
              columns={[
                { label: '선택', width: '42px' },
                { label: '케이스', width: '1fr' },
                { label: '담당', width: '56px' },
                { label: '상태', width: '72px' },
              ]}
              rows={rows.map(([check, caseCell, owner, state]) => [check, caseCell, owner, state])}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const DesktopStateEdgeBoard = () => (
  <Wave21EBoard
    kicker="DESKTOP STATES"
    title="데스크탑 웹 · 상태와 예외"
    sub="넓은 화면에서도 empty/loading/error/permission/deadline/sold out을 같은 정보 구조로 다룹니다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 18, height: 650 }}>
      <Wave21EPanel pad={18}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          <KPIStat label="검색 결과" value={128}/>
          <KPIStat label="참가 가능" value={42}/>
          <KPIStat label="마감 임박" value={8}/>
          <KPIStat label="권한 필요" value={3}/>
        </div>
        <Wave21EDesktopShell/>
      </Wave21EPanel>
      <div style={{ display: 'grid', gap: 12 }}>
        <Wave21EStateItem badge="EMPTY" tone="grey" title="조건에 맞는 결과가 없어요" sub="필터를 초기화하거나 근처 지역을 제안합니다." action="필터 초기화"/>
        <Wave21EStateItem badge="LOADING" tone="blue" title="목록을 불러오는 중" sub="표 영역만 Skeleton으로 유지하고 필터 상태는 보존합니다."/>
        <Wave21EStateItem badge="ERROR" tone="red" title="결과를 가져오지 못했어요" sub="네트워크 실패와 서버 오류를 분리해 재시도 CTA를 둡니다." action="재시도"/>
        <Wave21EStateItem badge="PERMISSION" tone="orange" title="위치 권한이 필요해요" sub="현재 위치 대신 지역 직접 선택을 즉시 제공합니다." action="지역 선택"/>
        <Wave21EStateItem badge="SOLD OUT" tone="grey" title="모집 완료" sub="CTA를 대기 신청으로 낮추고 결제 진입을 차단합니다."/>
      </div>
    </div>
  </Wave21EBoard>
);

const DesktopKeyboardFocusBoard = () => (
  <Wave21EBoard
    kicker="KEYBOARD FOCUS"
    title="데스크탑 웹 · 키보드와 포커스"
    sub="마우스 사용자를 전제하지 않고 Tab 순서, 단축키, focus ring, command palette 진입을 화면화합니다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 18, height: 650 }}>
      <Wave21EPanel pad={18}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>포커스 순서</div>
        <div style={{ display: 'grid', gap: 10 }}>
          {[
            ['1', '전역 검색', 'Ctrl K로 같은 위치 진입'],
            ['2', '필터 chip', '좌우 화살표로 이동'],
            ['3', '결과 행', 'Enter로 상세 패널 열기'],
            ['4', '상세 CTA', '결제/참가 버튼 명확화'],
            ['5', '닫기/뒤로', 'Esc로 패널 닫기'],
          ].map(([step, title, sub], index) => (
            <Wave21ESoftPanel key={step} style={{ display: 'grid', gridTemplateColumns: '34px 1fr auto', alignItems: 'center', gap: 12, outline: index === 2 ? `2px solid ${Wave21EBlue}` : 'none' }}>
              <div className="tab-num" style={{ width: 34, height: 34, borderRadius: 11, display: 'grid', placeItems: 'center', background: index === 2 ? Wave21EBlue : 'var(--grey100)', color: index === 2 ? 'var(--static-white)' : 'var(--text-muted)', fontWeight: 700 }}>{step}</div>
              <Wave21ECellText title={title} sub={sub}/>
              <Badge tone={index === 2 ? 'blue' : 'grey'} size="sm">{index === 2 ? 'FOCUS' : 'Tab'}</Badge>
            </Wave21ESoftPanel>
          ))}
        </div>
        <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Wave21EKeyboardKey>Ctrl</Wave21EKeyboardKey>
          <Wave21EKeyboardKey active>K</Wave21EKeyboardKey>
          <Wave21EKeyboardKey>Enter</Wave21EKeyboardKey>
          <Wave21EKeyboardKey>Esc</Wave21EKeyboardKey>
        </div>
      </Wave21EPanel>
      <Wave21EPanel pad={18}>
        <div style={{ height: 86, borderRadius: 16, border: `2px solid ${Wave21EBlue}`, display: 'grid', gridTemplateColumns: '44px 1fr auto', alignItems: 'center', gap: 12, padding: '0 16px', background: 'var(--blue50)' }}>
          <Wave21EIconBox name="search" tone="blue"/>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Ctrl K · 빠른 이동</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>매치, 레슨, 시설, 장터, 관리자 메뉴를 검색합니다.</div>
          </div>
          <Badge tone="blue">focused</Badge>
        </div>
        <div style={{ marginTop: 18 }}>
          <Wave21ETable
            columns={[
              { label: '단축키', width: '120px' },
              { label: '동작', width: '1fr' },
              { label: '상태 피드백', width: '180px' },
            ]}
            rows={[
              [<><Wave21EKeyboardKey>Tab</Wave21EKeyboardKey></>, '다음 인터랙션으로 이동', <Badge tone="blue" size="sm">ring visible</Badge>],
              [<><Wave21EKeyboardKey>Enter</Wave21EKeyboardKey></>, '선택한 행 상세 패널 열기', <Badge tone="green" size="sm">panel open</Badge>],
              [<><Wave21EKeyboardKey>Esc</Wave21EKeyboardKey></>, '패널/드롭다운 닫기', <Badge tone="grey" size="sm">return focus</Badge>],
              [<><Wave21EKeyboardKey>Shift</Wave21EKeyboardKey> <Wave21EKeyboardKey>Tab</Wave21EKeyboardKey></>, '이전 컨트롤로 이동', <Badge tone="orange" size="sm">skip disabled</Badge>],
            ]}
          />
        </div>
        <div style={{ marginTop: 16, position: 'relative', height: 84 }}>
          <Toast msg="상세 패널을 열었어요. Esc로 닫을 수 있어요." type="info"/>
        </div>
      </Wave21EPanel>
    </div>
  </Wave21EBoard>
);

const DesktopSidePanelBoard = () => (
  <Wave21EBoard
    kicker="SIDE PANEL"
    title="데스크탑 웹 · 사이드 패널 상태"
    sub="상세, 비교, 결제, 오류 패널이 화면 전환 없이 같은 작업 맥락을 유지합니다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 18, height: 650 }}>
      <Wave21EPanel pad={18}>
        <Wave21EDesktopShell/>
      </Wave21EPanel>
      <Wave21EPanel pad={18}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Badge tone="blue" size="sm">DETAIL PANEL</Badge>
            <div style={{ fontSize: 19, fontWeight: 700, marginTop: 8 }}>잠실 11v11 매치</div>
          </div>
          <button className="tm-pressable tm-break-keep" style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--grey100)', color: 'var(--text-muted)' }}>×</button>
        </div>
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <KPIStat label="남은 자리" value={4} unit="명"/>
          <KPIStat label="마감" value="18:00" unit=""/>
        </div>
        <div style={{ marginTop: 16 }}>
          <MoneyRow label="참가비" amount={12000} strong accent/>
          <MoneyRow label="수수료" amount={0}/>
        </div>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          <Wave21EStateItem badge="READY" tone="blue" title="참가 가능" sub="필수 프로필과 결제 수단이 준비됐습니다." action="참가"/>
          <Wave21EStateItem badge="PENDING" tone="orange" title="팀장 승인 대기" sub="승인 전에는 결제가 보류 상태로 표시됩니다."/>
          <Wave21EStateItem badge="ERROR" tone="red" title="결제 준비 실패" sub="필수 order id가 없으면 checkout으로 이동하지 않습니다." action="복구"/>
        </div>
      </Wave21EPanel>
    </div>
  </Wave21EBoard>
);

const DesktopTableOverflowBoard = () => (
  <Wave21EBoard
    kicker="TABLE OVERFLOW"
    title="데스크탑 웹 · 큰 표와 가로 overflow"
    sub="표가 커져도 주요 열 고정, 행 선택, 빈 값/긴 값/대량 데이터를 읽을 수 있게 유지합니다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '330px 1fr', gap: 18, height: 650 }}>
      <Wave21EPanel pad={18}>
        <SectionTitle title="표 overflow 규칙" sub="숨기기보다 우선순위와 스크롤 affordance를 표시합니다."/>
        <div style={{ display: 'grid', gap: 10, marginTop: 4 }}>
          {[
            ['고정 열', '사용자/매치명/상태는 좌측에 유지'],
            ['긴 한글', '2줄 clamp 또는 tooltip으로 처리'],
            ['대량 선택', '상단 bulk bar로 선택 수 표시'],
            ['숫자', 'tabular number와 우측 정렬'],
            ['빈 값', '— 또는 미입력 상태를 명확히 구분'],
          ].map(([title, sub], index) => (
            <ListItem
              key={title}
              leading={<Wave21EIconBox name={index < 2 ? 'check' : 'menu'} tone={index < 3 ? 'blue' : 'grey'}/>}
              title={title}
              sub={sub}
              trailing={index === 2 ? <Badge tone="blue" size="sm">bulk</Badge> : null}
            />
          ))}
        </div>
      </Wave21EPanel>
      <Wave21EPanel pad={18}>
        <div style={{ height: 44, borderRadius: 14, background: 'var(--blue50)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: Wave21EBlue }}>12개 행 선택됨</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="tm-pressable tm-break-keep" style={{ height: 30, borderRadius: 9, padding: '0 10px', background: Wave21EBlue, color: 'var(--static-white)', fontSize: 12, fontWeight: 700 }}>일괄 승인</button>
            <button className="tm-pressable tm-break-keep" style={{ height: 30, borderRadius: 9, padding: '0 10px', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontWeight: 700 }}>내보내기</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
          <div style={{ width: 980 }}>
            <Wave21ETable
              compact
              columns={[
                { label: '선택', width: '56px' },
                { label: '매치/상품', width: '220px' },
                { label: '카테고리', width: '110px' },
                { label: '거래액', width: '120px' },
                { label: '상태', width: '100px' },
                { label: '최근 변경', width: '160px' },
                { label: '담당', width: '100px' },
                { label: '액션', width: '110px' },
              ]}
              rows={[
                ['☑', <Wave21ECellText title="토요일 오전 초중급 풋살" sub="긴 제목은 한 줄 말줄임 처리"/>, '매치', <NumberDisplay value="120,000" unit="원" size={18}/>, <Badge tone="orange" size="sm">대기</Badge>, '2026.04.26 09:12', '민지', '검토'],
                ['☑', <Wave21ECellText title="동호회 장비 패키지 예약 거래" sub="구매자 확인 필요"/>, '장터', <NumberDisplay value="88,000" unit="원" size={18}/>, <Badge tone="blue" size="sm">진행</Badge>, '2026.04.26 08:40', '준호', '상세'],
                ['☐', <Wave21ECellText title="—" sub="상품명이 비어 있음"/>, '장터', <NumberDisplay value="0" unit="원" size={18}/>, <Badge tone="red" size="sm">오류</Badge>, '—', '미배정', '복구'],
                ['☑', <Wave21ECellText title="서초 테니스 복식 파트너 모집" sub="NTRP 3.5 이상"/>, '매치', <NumberDisplay value="36,000" unit="원" size={18}/>, <Badge tone="green" size="sm">완료</Badge>, '2026.04.25 22:11', '소연', '열기'],
              ]}
            />
          </div>
        </div>
      </Wave21EPanel>
    </div>
  </Wave21EBoard>
);

const DesktopControlInteractionBoard = () => (
  <Wave21EBoard
    kicker="DESKTOP CONTROLS"
    title="데스크탑 웹 · 컨트롤과 인터랙션 상태"
    sub="버튼, chip, 검색, bulk action, disabled reason을 데스크탑 기준으로 한 번에 검수합니다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, height: 650 }}>
      <Wave21EPanel pad={18}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>버튼 상태</div>
        <div style={{ display: 'grid', gap: 12 }}>
          {[
            ['Default', '검색 적용', Wave21EBlue, 'var(--static-white)', '기본'],
            ['Hover', '검색 적용', 'var(--blue600)', 'var(--static-white)', 'hover'],
            ['Pressed', '검색 적용', 'var(--blue600)', 'var(--static-white)', 'scale 0.98'],
            ['Loading', '적용 중', Wave21EBlue, 'var(--static-white)', 'spinner'],
            ['Disabled', '조건 선택 필요', 'var(--grey200)', 'var(--grey500)', 'reason'],
            ['Danger', '선택 취소', 'var(--red500)', 'var(--static-white)', 'confirm'],
          ].map(([state, label, bg, color, note]) => (
            <Wave21ESoftPanel key={state}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <Badge tone={state === 'Danger' ? 'red' : state === 'Disabled' ? 'grey' : 'blue'} size="sm">{state}</Badge>
                <span style={{ fontSize: 11, color: 'var(--text-caption)' }}>{note}</span>
              </div>
              <button className="tm-pressable tm-break-keep" style={{ width: '100%', minHeight: 42, borderRadius: 12, background: bg, color, fontSize: 13, fontWeight: 700, transform: state === 'Pressed' ? 'scale(.98)' : 'scale(1)' }}>{state === 'Loading' ? '● ' : ''}{label}</button>
            </Wave21ESoftPanel>
          ))}
        </div>
      </Wave21EPanel>
      <Wave21EPanel pad={18}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>필터와 검색</div>
        <div style={{ height: 46, borderRadius: 14, border: `2px solid ${Wave21EBlue}`, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', background: 'var(--bg)' }}>
          <Icon name="search" size={18} color={Wave21EBlue}/>
          <div style={{ fontSize: 14, color: 'var(--text-strong)' }}>강남 풋살 오늘 저녁</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          {['오늘', '축구', '5km', '참가 가능', '중급', '지도'].map((chip, index) => <HapticChip key={chip} active={index < 4}>{chip}</HapticChip>)}
        </div>
        <div style={{ marginTop: 16 }}>
          <Wave21EStateItem badge="STALE QUERY" tone="orange" title="빠른 필터 변경 중" sub="URL query보다 draft state를 먼저 유지합니다." action="동기화"/>
        </div>
      </Wave21EPanel>
      <Wave21EPanel pad={18}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>피드백</div>
        <div style={{ position: 'relative', height: 180, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--grey100)' }}>
          <Toast msg="필터가 적용됐어요" type="success"/>
        </div>
        <div style={{ marginTop: 16 }}>
          <Wave21EStateItem badge="DISABLED" tone="grey" title="일괄 승인할 수 없어요" sub="선택 항목 중 권한 밖 케이스가 2개 있습니다."/>
          <div style={{ marginTop: 10 }}/>
          <Wave21EStateItem badge="CONFIRM" tone="orange" title="12개 항목 처리 전 확인" sub="결과와 실패 항목은 audit log에 남깁니다." action="계속"/>
        </div>
      </Wave21EPanel>
    </div>
  </Wave21EBoard>
);

const DesktopMotionContractBoard = () => (
  <Wave21EBoard
    kicker="DESKTOP MOTION"
    title="데스크탑 웹 · 모션 계약"
    sub="패널, 표, 필터, toast가 목적 있는 motion만 사용하고 reduced motion에서는 즉시 상태 전환합니다."
    width={840}
    height={812}
  >
    <div style={{ display: 'grid', gap: 12 }}>
      <Wave21EMotionStep step="1" title="필터 chip 선택" sub="100ms tap scale 후 160ms background 전환. 레이아웃 크기는 변하지 않습니다."/>
      <Wave21EMotionStep step="2" title="결과 행 업데이트" sub="Skeleton shimmer에서 새 행 fade-in. 기존 focus 위치는 유지합니다." tone="orange"/>
      <Wave21EMotionStep step="3" title="상세 패널 push" sub="320ms translateX + opacity. Esc나 닫기 버튼은 focus를 원래 행으로 되돌립니다."/>
      <Wave21EMotionStep step="4" title="결제/신청 성공" sub="Toast 2.4초 노출 후 채팅 또는 내 매치 CTA를 제공합니다." tone="green"/>
      <Wave21EPanel pad={18}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Reduced motion</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 6 }}>prefers-reduced-motion이면 transform 전환을 제거하고, 상태 텍스트와 focus ring만 즉시 업데이트합니다.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
          <Wave21ESoftPanel>
            <Badge tone="blue" size="sm">DEFAULT</Badge>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>slide + fade</div>
            <Wave21EProgress value={72}/>
          </Wave21ESoftPanel>
          <Wave21ESoftPanel>
            <Badge tone="grey" size="sm">REDUCED</Badge>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>instant + ring</div>
            <Wave21EProgress value={100} tone="green"/>
          </Wave21ESoftPanel>
        </div>
      </Wave21EPanel>
    </div>
  </Wave21EBoard>
);

const DesktopResponsiveBoard = () => (
  <Wave21EBoard
    kicker="DESKTOP RESPONSIVE"
    title="데스크탑 웹 · Mobile/Tablet/Desktop 재배치"
    sub="데스크탑 모듈은 PC 전용 화면이지만 tablet split과 작은 노트북 폭에서도 핵심 기능을 숨기지 않습니다."
    width={1280}
    height={820}
  >
    <div style={{ display: 'grid', gridTemplateColumns: '280px 360px 1fr', gap: 16, height: 660 }}>
      <Wave21EPanel pad={14}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Mobile 375</div>
        <div style={{ height: 570, borderRadius: 18, background: 'var(--grey50)', border: '1px solid var(--grey100)', padding: 14, overflow: 'hidden' }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>매치 찾기</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 12, overflow: 'hidden' }}>
            {['오늘', '축구', '5km'].map((chip, index) => <HapticChip key={chip} active={index === 0}>{chip}</HapticChip>)}
          </div>
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            {[1, 2, 3].map((item) => <Wave21EPanel key={item} pad={12}><Wave21ECellText title={`추천 매치 ${item}`} sub="상세는 bottom sheet"/></Wave21EPanel>)}
          </div>
        </div>
      </Wave21EPanel>
      <Wave21EPanel pad={14}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Tablet 834</div>
        <Wave21EDesktopShell mode="tablet"/>
      </Wave21EPanel>
      <Wave21EPanel pad={14}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Desktop 1280</div>
        <Wave21EDesktopShell/>
      </Wave21EPanel>
    </div>
  </Wave21EBoard>
);

const DesktopDarkModeBoard = () => (
  <Wave21EBoard
    kicker="DESKTOP DARK"
    title="데스크탑 웹 · 다크모드 비교"
    sub="흰 배경 중심의 시스템을 유지하되, dark token에서도 표와 패널의 대비가 무너지지 않게 검수합니다."
    width={920}
    height={812}
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, height: 650 }}>
      <Wave21EPanel pad={14}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Light</div>
        <Wave21EDesktopShell mode="tablet"/>
      </Wave21EPanel>
      <Wave21EPanel pad={14} dark style={{ background: '#0f172a' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: '#f8fafc' }}>Dark</div>
        <Wave21EDesktopShell mode="tablet" dark/>
      </Wave21EPanel>
    </div>
  </Wave21EBoard>
);

const AdminStateEdgeBoard = () => (
  <Wave21EBoard
    kicker="ADMIN STATES"
    title="Admin/Ops · 상태와 예외"
    sub="운영 화면은 정보 밀도를 높이되, 처리 불가/권한 제한/실패/보류를 숨기지 않는 구조로 정리합니다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 18, height: 650 }}>
      <Wave21EPanel pad={18}>
        <Wave21EAdminShell/>
      </Wave21EPanel>
      <div style={{ display: 'grid', gap: 12 }}>
        <Wave21EStateItem badge="EMPTY" tone="grey" title="대기 중인 운영 케이스 없음" sub="감사 로그와 최근 완료 기록을 대신 보여줍니다."/>
        <Wave21EStateItem badge="PENDING" tone="orange" title="처리 보류" sub="외부 결제사 응답 또는 증빙 검토가 필요합니다." action="보류 사유"/>
        <Wave21EStateItem badge="PARTIAL" tone="red" title="일괄 처리 부분 실패" sub="성공/실패 항목을 분리하고 재시도 대상을 남깁니다." action="실패만 재시도"/>
        <Wave21EStateItem badge="ROLE LIMIT" tone="orange" title="권한이 부족해요" sub="읽기 전용 운영자는 제재/환불 버튼을 사용할 수 없습니다."/>
        <Wave21EStateItem badge="LOCKED" tone="blue" title="다른 운영자가 처리 중" sub="동시 처리 충돌을 잠금 상태로 표시합니다."/>
      </div>
    </div>
  </Wave21EBoard>
);

const AdminBulkPartialFailureBoard = () => (
  <Wave21EBoard
    kicker="BULK PARTIAL FAILURE"
    title="Admin/Ops · 일괄 처리 부분 실패"
    sub="운영 bulk action은 전체 성공처럼 보이면 안 됩니다. 성공, 실패, 재시도, 수동 확인을 분리합니다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 18, height: 650 }}>
      <Wave21EPanel pad={18}>
        <Badge tone="red">부분 실패</Badge>
        <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.25, marginTop: 12 }}>선택한 24건 중<br/>3건을 처리하지 못했어요</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 18 }}>
          <KPIStat label="성공" value={21} unit="건"/>
          <KPIStat label="실패" value={3} unit="건"/>
        </div>
        <div style={{ marginTop: 18 }}>
          <Wave21EProgress value={88} tone="orange"/>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            <span>audit log 기록 완료</span>
            <span className="tab-num">88%</span>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8, marginTop: 18 }}>
          <button className="tm-pressable tm-break-keep" style={{ height: 44, borderRadius: 13, background: Wave21EBlue, color: 'var(--static-white)', fontSize: 14, fontWeight: 700 }}>실패 항목만 재시도</button>
          <button className="tm-pressable tm-break-keep" style={{ height: 44, borderRadius: 13, background: 'var(--grey100)', color: 'var(--text-strong)', fontSize: 14, fontWeight: 700 }}>CSV로 내보내기</button>
        </div>
      </Wave21EPanel>
      <Wave21EPanel pad={18}>
        <Wave21ETable
          columns={[
            { label: '대상', width: '1fr' },
            { label: '요청', width: '140px' },
            { label: '결과', width: '110px' },
            { label: '실패 원인', width: '1.1fr' },
            { label: '다음 액션', width: '150px' },
          ]}
          rows={[
            [<Wave21ECellText title="신고 #R-2048" sub="부적절한 채팅"/>, '숨김 처리', <Badge tone="green" size="sm">성공</Badge>, '—', '완료'],
            [<Wave21ECellText title="정산 #P-7812" sub="부분 환불"/>, '환불 요청', <Badge tone="red" size="sm">실패</Badge>, 'PG timeout', '재시도'],
            [<Wave21ECellText title="유저 #U-933" sub="임시 제재"/>, '7일 제한', <Badge tone="red" size="sm">실패</Badge>, '권한 부족', '상위 권한 요청'],
            [<Wave21ECellText title="시설 #V-108" sub="가격표 승인"/>, '승인', <Badge tone="orange" size="sm">보류</Badge>, '증빙 누락', '수동 확인'],
            [<Wave21ECellText title="리뷰 #RV-71" sub="신고 리뷰"/>, '숨김 처리', <Badge tone="green" size="sm">성공</Badge>, '—', '완료'],
          ]}
        />
      </Wave21EPanel>
    </div>
  </Wave21EBoard>
);

const AdminConcurrentProcessingBoard = () => (
  <Wave21EBoard
    kicker="CONCURRENT PROCESSING"
    title="Admin/Ops · 동시 처리 충돌"
    sub="두 운영자가 같은 케이스를 처리할 때 잠금, 소유자, 최신 변경사항, handoff CTA가 분명해야 합니다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 18, height: 650 }}>
      <Wave21EPanel pad={18}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
          <KPIStat label="현재 처리자" value="2" unit="명"/>
          <KPIStat label="잠금 케이스" value={6} unit="건"/>
          <KPIStat label="평균 잠금" value="04:12" unit=""/>
        </div>
        <Wave21ETable
          columns={[
            { label: '케이스', width: '1fr' },
            { label: '소유자', width: '120px' },
            { label: '잠금', width: '110px' },
            { label: '최근 변경', width: '180px' },
            { label: '액션', width: '150px' },
          ]}
          rows={[
            [<Wave21ECellText title="분쟁 #D-2401" sub="환불 금액 조정"/>, '민지', <Badge tone="blue" size="sm">처리 중</Badge>, '방금 전 증빙 추가', '보기 전용'],
            [<Wave21ECellText title="신고 #R-888" sub="경기 후 평가"/>, '준호', <Badge tone="orange" size="sm">잠금 만료 임박</Badge>, '3분 전 메모', '인계 요청'],
            [<Wave21ECellText title="정산 #P-901" sub="계좌 검증"/>, '나', <Badge tone="green" size="sm">내 작업</Badge>, '저장 안 됨', '계속 처리'],
            [<Wave21ECellText title="유저 #U-109" sub="제재 해제 요청"/>, '소연', <Badge tone="grey" size="sm">읽기 전용</Badge>, '12분 전 결정', '로그 보기'],
          ]}
        />
      </Wave21EPanel>
      <Wave21EPanel pad={18}>
        <Badge tone="orange">LOCKED</Badge>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 12 }}>준호님이 처리 중입니다</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8 }}>이 케이스는 동시에 수정할 수 없습니다. 현재 변경사항을 확인하거나 인계를 요청하세요.</div>
        <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
          <Wave21ESoftPanel>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>마지막 저장</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>2026.04.26 14:22:08</div>
          </Wave21ESoftPanel>
          <Wave21ESoftPanel>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>변경 요약</div>
            <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 4 }}>환불 사유를 "시설 휴관"으로 수정, 증빙 이미지 1건 추가</div>
          </Wave21ESoftPanel>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 18 }}>
          <button className="tm-pressable tm-break-keep" style={{ height: 42, borderRadius: 12, background: Wave21EBlue, color: 'var(--static-white)', fontSize: 13, fontWeight: 700 }}>인계 요청</button>
          <button className="tm-pressable tm-break-keep" style={{ height: 42, borderRadius: 12, background: 'var(--grey100)', color: 'var(--text-strong)', fontSize: 13, fontWeight: 700 }}>로그 보기</button>
        </div>
      </Wave21EPanel>
    </div>
  </Wave21EBoard>
);

const AdminAuditRecoveryBoard = () => (
  <Wave21EBoard
    kicker="AUDIT RECOVERY"
    title="Admin/Ops · 감사 로그와 오류 복구"
    sub="운영 판단은 toast 하나로 끝나지 않습니다. 누가, 왜, 어떤 결과를 만들었는지 복구 가능한 로그로 남깁니다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 18, height: 650 }}>
      <Wave21EPanel pad={18}>
        <Badge tone="red">처리 실패</Badge>
        <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.25, marginTop: 12 }}>환불 승인 중<br/>서버 오류가 발생했어요</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8 }}>사용자에게 성공으로 보이지 않게 보류 상태로 되돌리고, 운영 로그에 실패 원인을 남깁니다.</div>
        <div style={{ marginTop: 18 }}>
          <Wave21EStateItem badge="RECOVERED" tone="orange" title="상태 복구 완료" sub="결제 상태를 pending_review로 되돌렸습니다."/>
          <div style={{ marginTop: 10 }}/>
          <Wave21EStateItem badge="AUDIT" tone="blue" title="로그 기록됨" sub="request id, actor id, payload checksum 저장"/>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 18 }}>
          <button className="tm-pressable tm-break-keep" style={{ height: 42, borderRadius: 12, background: Wave21EBlue, color: 'var(--static-white)', fontSize: 13, fontWeight: 700 }}>재시도</button>
          <button className="tm-pressable tm-break-keep" style={{ height: 42, borderRadius: 12, background: 'var(--grey100)', color: 'var(--text-strong)', fontSize: 13, fontWeight: 700 }}>개발팀 공유</button>
        </div>
      </Wave21EPanel>
      <Wave21EPanel pad={18}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Audit timeline</div>
        <div style={{ display: 'grid', gap: 10 }}>
          {[
            ['14:22:08', 'refund.approve.requested', '민지', '요청 payload 검증 성공', 'blue'],
            ['14:22:09', 'payment.provider.timeout', 'system', 'PG 응답 30초 초과', 'red'],
            ['14:22:10', 'refund.status.recovered', 'system', 'pending_review 상태로 복구', 'orange'],
            ['14:22:12', 'operator.note.created', '민지', '사용자 문의 답변 템플릿 생성', 'green'],
          ].map(([time, event, actor, sub, tone]) => (
            <Wave21ESoftPanel key={event} style={{ display: 'grid', gridTemplateColumns: '72px 1fr 80px', gap: 12, alignItems: 'center' }}>
              <div className="tab-num" style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{time}</div>
              <Wave21ECellText title={event} sub={sub}/>
              <Badge tone={tone} size="sm">{actor}</Badge>
            </Wave21ESoftPanel>
          ))}
        </div>
        <div style={{ marginTop: 14, position: 'relative', height: 82 }}>
          <Toast msg="실패 상태를 복구하고 감사 로그를 남겼어요" type="info"/>
        </div>
      </Wave21EPanel>
    </div>
  </Wave21EBoard>
);

const AdminControlInteractionBoard = () => (
  <Wave21EBoard
    kicker="ADMIN CONTROLS"
    title="Admin/Ops · 컨트롤과 권한 제한"
    sub="운영 버튼은 권한, 확인, 실패, 보류 상태를 모두 가져야 하며 위험 액션은 즉시 실행하지 않습니다."
  >
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, height: 650 }}>
      <Wave21EPanel pad={18}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>권한별 버튼</div>
        <div style={{ display: 'grid', gap: 12 }}>
          {[
            ['Owner', '환불 승인', 'blue', '가능'],
            ['Manager', '임시 제재', 'orange', '확인 필요'],
            ['Viewer', '환불 승인', 'grey', '권한 없음'],
            ['Support', '메모 추가', 'blue', '가능'],
            ['System', '자동 재시도', 'green', '예약됨'],
          ].map(([role, label, tone, note]) => (
            <Wave21ESoftPanel key={role}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <Badge tone={tone} size="sm">{role}</Badge>
                <span style={{ fontSize: 11, color: 'var(--text-caption)' }}>{note}</span>
              </div>
              <button className="tm-pressable tm-break-keep" style={{ width: '100%', height: 42, borderRadius: 12, background: tone === 'grey' ? 'var(--grey200)' : tone === 'orange' ? 'var(--orange500)' : tone === 'green' ? 'var(--green500)' : Wave21EBlue, color: tone === 'grey' ? 'var(--grey500)' : 'var(--static-white)', fontSize: 13, fontWeight: 700 }}>{label}</button>
            </Wave21ESoftPanel>
          ))}
        </div>
      </Wave21EPanel>
      <Wave21EPanel pad={18}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>위험 액션 확인</div>
        <Wave21ESoftPanel>
          <Badge tone="red">CONFIRM</Badge>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 10 }}>7일 제재를 적용할까요?</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8 }}>사유, 근거, 알림 발송 여부를 확인해야 실행됩니다.</div>
          <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
            <div style={{ height: 42, borderRadius: 12, background: 'var(--bg)', border: Wave21EBorder, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 13 }}>사유: 반복 노쇼</div>
            <div style={{ height: 42, borderRadius: 12, background: 'var(--bg)', border: `1px solid var(--red500)`, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 13, color: 'var(--red500)' }}>증빙 선택 필요</div>
          </div>
        </Wave21ESoftPanel>
      </Wave21EPanel>
      <Wave21EPanel pad={18}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>처리 피드백</div>
        <div style={{ position: 'relative', height: 150, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--grey100)' }}>
          <Toast msg="선택한 8건 중 1건은 권한 부족으로 제외됐어요" type="info"/>
        </div>
        <div style={{ marginTop: 16 }}>
          <Wave21EStateItem badge="DISABLED" tone="grey" title="정산 마감 후 수정 불가" sub="마감 취소 권한이 있는 관리자만 변경할 수 있습니다."/>
          <div style={{ marginTop: 10 }}/>
          <Wave21EStateItem badge="PENDING" tone="orange" title="승인 대기" sub="2인 승인 정책에 따라 두 번째 관리자를 기다립니다."/>
        </div>
      </Wave21EPanel>
    </div>
  </Wave21EBoard>
);

const AdminMotionContractBoard = () => (
  <Wave21EBoard
    kicker="ADMIN MOTION"
    title="Admin/Ops · 모션 계약"
    sub="운영 화면의 motion은 장식이 아니라 처리 상태, 위험 액션, 복구 결과를 명확히 설명해야 합니다."
    width={840}
    height={812}
  >
    <div style={{ display: 'grid', gap: 12 }}>
      <Wave21EMotionStep step="1" title="bulk bar 등장" sub="행 선택 시 상단 bar가 180ms fade-in. 표 높이는 유지하고 선택 수만 갱신합니다."/>
      <Wave21EMotionStep step="2" title="confirm panel 열림" sub="위험 액션은 260ms slide-in 후 focus를 첫 필수 입력으로 이동합니다." tone="orange"/>
      <Wave21EMotionStep step="3" title="부분 실패 분리" sub="성공 행은 고정, 실패 행만 error group으로 이동해 재시도 대상을 좁힙니다." tone="orange"/>
      <Wave21EMotionStep step="4" title="audit log append" sub="새 로그 행은 160ms background flash 후 일반 행으로 돌아옵니다." tone="green"/>
      <Wave21EPanel pad={18}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Reduced motion</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 6 }}>운영자는 장시간 화면을 보기 때문에 반복 shimmer와 움직임을 줄일 수 있어야 합니다. reduced motion에서는 색상, 텍스트, focus ring만 사용합니다.</div>
        <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
          <Wave21EStateItem badge="DEFAULT" tone="blue" title="행 flash + toast" sub="상태 변화 위치를 알려줍니다."/>
          <Wave21EStateItem badge="REDUCED" tone="grey" title="즉시 갱신 + aria-live" sub="움직임 없이 처리 결과를 읽을 수 있습니다."/>
        </div>
      </Wave21EPanel>
    </div>
  </Wave21EBoard>
);

const AdminResponsiveBoard = () => (
  <Wave21EBoard
    kicker="ADMIN RESPONSIVE"
    title="Admin/Ops · Tablet/Desktop 재배치"
    sub="관리자는 PC 중심이지만 tablet 운영 상황에서도 필수 큐와 처리 CTA가 사라지면 안 됩니다."
    width={1280}
    height={820}
  >
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16, height: 660 }}>
      <Wave21EPanel pad={14}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Tablet 834</div>
        <Wave21EAdminShell mode="tablet"/>
      </Wave21EPanel>
      <Wave21EPanel pad={14}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Desktop 1440</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 14, height: 570 }}>
          <Wave21EAdminShell/>
          <Wave21EPanel pad={16}>
            <Badge tone="blue" size="sm">ACTION RAIL</Badge>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 10 }}>선택 케이스 요약</div>
            <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
              <KPIStat label="선택" value={12} unit="건"/>
              <KPIStat label="권한 밖" value={2} unit="건"/>
              <Wave21EStateItem badge="READY" tone="blue" title="10건 처리 가능" sub="2건은 제외 후 실행됩니다." action="실행"/>
            </div>
          </Wave21EPanel>
        </div>
      </Wave21EPanel>
    </div>
  </Wave21EBoard>
);

const AdminDarkModeBoard = () => (
  <Wave21EBoard
    kicker="ADMIN DARK"
    title="Admin/Ops · 다크모드 비교"
    sub="운영 화면의 dark mode는 장시간 사용 피로를 낮추되, 위험/보류/성공 상태 대비를 유지합니다."
    width={920}
    height={812}
  >
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, height: 650 }}>
      <Wave21EPanel pad={14}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Light</div>
        <Wave21EAdminShell mode="tablet"/>
      </Wave21EPanel>
      <Wave21EPanel pad={14} dark style={{ background: '#0f172a' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: '#f8fafc' }}>Dark</div>
        <Wave21EAdminShell mode="tablet" dark/>
      </Wave21EPanel>
    </div>
  </Wave21EBoard>
);

Object.assign(window, {
  DesktopStateEdgeBoard,
  DesktopKeyboardFocusBoard,
  DesktopSidePanelBoard,
  DesktopTableOverflowBoard,
  DesktopControlInteractionBoard,
  DesktopMotionContractBoard,
  DesktopResponsiveBoard,
  DesktopDarkModeBoard,
  AdminStateEdgeBoard,
  AdminBulkPartialFailureBoard,
  AdminConcurrentProcessingBoard,
  AdminAuditRecoveryBoard,
  AdminControlInteractionBoard,
  AdminMotionContractBoard,
  AdminResponsiveBoard,
  AdminDarkModeBoard,
});
