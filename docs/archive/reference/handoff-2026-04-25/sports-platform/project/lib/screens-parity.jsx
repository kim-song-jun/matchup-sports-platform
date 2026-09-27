const routeGroups = [
  {
    name: 'Public / Auth',
    tone: 'blue',
    routes: ['/', '/landing', '/about', '/guide', '/pricing', '/faq', '/login', '/callback/kakao', '/callback/naver', '/users/[id]', '/user/[id]'],
    missing: ['OAuth callback 상태', '/about desktop/mobile split'],
  },
  {
    name: 'Core Play',
    tone: 'green',
    routes: ['/home', '/onboarding', '/matches', '/matches/[id]', '/matches/new', '/matches/[id]/edit', '/team-matches', '/team-matches/[id]', '/team-matches/new', '/team-matches/[id]/edit'],
    missing: ['edit flow parity', 'deadline / sold out states'],
  },
  {
    name: 'Commerce / Booking',
    tone: 'orange',
    routes: ['/lessons', '/lessons/[id]', '/lessons/new', '/lessons/[id]/edit', '/marketplace', '/marketplace/[id]', '/marketplace/new', '/marketplace/[id]/edit', '/marketplace/orders/[id]', '/venues', '/venues/[id]', '/venues/[id]/edit'],
    missing: ['주문 상태', '시설 수정', '수강권 만료/잔여 관리'],
  },
  {
    name: 'Community / My',
    tone: 'grey',
    routes: ['/chat', '/chat/[id]', '/notifications', '/feed', '/reviews', '/badges', '/profile', '/my/matches', '/my/lessons', '/my/lesson-tickets', '/my/listings', '/my/mercenary', '/my/team-matches', '/my/team-match-applications', '/my/disputes', '/my/disputes/[id]', '/my/teams'],
    missing: ['내 레슨', '내 용병', '분쟁 상세'],
  },
  {
    name: 'Admin',
    tone: 'red',
    routes: ['/admin/dashboard', '/admin/matches', '/admin/matches/[id]', '/admin/team-matches', '/admin/team-matches/[id]', '/admin/users', '/admin/users/[id]', '/admin/teams', '/admin/teams/[id]', '/admin/lessons', '/admin/lessons/[id]', '/admin/venues', '/admin/venues/[id]', '/admin/venues/new', '/admin/payments', '/admin/payouts', '/admin/settlements', '/admin/disputes', '/admin/disputes/[id]', '/admin/reviews', '/admin/statistics', '/admin/ops', '/admin/lesson-tickets', '/admin/mercenary'],
    missing: ['admin detail shell', 'admin payments', 'admin lesson tickets'],
  },
];

const navPrimary = [
  ['home', '홈', '내 활동 요약과 추천'],
  ['matches', '매치', '개인/팀 경기 탐색'],
  ['lessons', '레슨', '코치와 수강권'],
  ['marketplace', '장터', '거래와 주문'],
  ['my', '마이', '프로필과 내 활동'],
];

const navMenu = [
  ['경기', ['매치 찾기', '매치 만들기', '팀 매칭', '용병', '대회']],
  ['예약/거래', ['레슨', '시설', '장터', '주문 상태', '결제']],
  ['내 활동', ['내 매치', '내 팀', '수강권', '판매글', '분쟁/문의']],
  ['소통', ['채팅', '알림', '피드', '리뷰', '뱃지']],
  ['설정', ['계정', '알림', '개인정보', '약관']],
];

const Surface = ({ children, style }) => (
  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 16, ...style }}>
    {children}
  </div>
);

const Row = ({ title, sub, right, leading }) => (
  <div style={{ minHeight: 52, display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--grey100)' }}>
    {leading}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{title}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.35 }}>{sub}</div>}
    </div>
    {right}
  </div>
);

const RoutePill = ({ children, tone = 'grey' }) => (
  <span style={{
    display: 'inline-flex', height: 26, alignItems: 'center',
    padding: '0 9px', borderRadius: 999,
    background: tone === 'blue' ? 'var(--blue50)' : tone === 'green' ? 'var(--green50)' : tone === 'orange' ? 'var(--orange50)' : tone === 'red' ? 'var(--red50)' : 'var(--grey100)',
    color: tone === 'blue' ? 'var(--blue500)' : tone === 'green' ? 'var(--green500)' : tone === 'orange' ? 'var(--orange500)' : tone === 'red' ? 'var(--red500)' : 'var(--grey700)',
    fontSize: 12, fontWeight: 700, margin: '0 6px 6px 0',
  }}>{children}</span>
);

const SourcePrototypeParityMap = () => (
  <div style={{ width: 1180, minHeight: 760, background: 'var(--grey50)', fontFamily: 'var(--font)', padding: 32 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, alignItems: 'flex-end', marginBottom: 24 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue500)', marginBottom: 8 }}>SOURCE -> PROTOTYPE PARITY</div>
        <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: 0 }}>실제 구현 route를 기준으로 프로토타입 coverage를 맞춥니다</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>현재 source page route 101개를 기능 주제로 묶고, prototype에서 부족한 운영성 화면을 별도 보드로 보강합니다.</div>
      </div>
      <Surface style={{ width: 260 }}>
        <KPIStat label="source routes" value={101}/>
        <div style={{ height: 12 }}/>
        <KPIStat label="prototype boards" value={207}/>
      </Surface>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
      {routeGroups.map((g) => (
        <Surface key={g.name} style={{ minHeight: 560 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)' }}>{g.name}</div>
            <Badge tone={g.tone}>{g.routes.length}</Badge>
          </div>
          <div style={{ marginBottom: 14 }}>
            {g.routes.map((r) => <RoutePill key={r} tone={g.tone}>{r}</RoutePill>)}
          </div>
          <div style={{ paddingTop: 12, borderTop: '1px solid var(--grey100)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-caption)', fontWeight: 700, marginBottom: 8 }}>PROTOTYPE 보강 대상</div>
            {g.missing.map((m) => (
              <div key={m} style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, lineHeight: 1.55 }}>- {m}</div>
            ))}
          </div>
        </Surface>
      ))}
    </div>
  </div>
);

const GlobalNavigationSystem = () => (
  <Phone>
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--grey50)' }}>
      <div style={{ padding: '8px 20px 18px', background: 'var(--bg)' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>GLOBAL NAVIGATION</div>
        <div style={{ fontSize: 25, fontWeight: 700, color: 'var(--text-strong)', marginTop: 6, lineHeight: 1.25 }}>하단 탭은 5개만 유지하고 나머지는 메뉴로 보냅니다</div>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {navPrimary.map(([id, label, sub]) => (
          <Surface key={id} style={{ padding: 14 }}>
            <Row
              title={label}
              sub={sub}
              leading={<div style={{ width: 36, height: 36, borderRadius: 12, background: id === 'home' ? 'var(--blue50)' : 'var(--grey100)', color: id === 'home' ? 'var(--blue500)' : 'var(--grey700)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{label[0]}</div>}
              right={<Badge tone={id === 'home' ? 'blue' : 'grey'}>{id}</Badge>}
            />
          </Surface>
        ))}
      </div>
    </div>
    <BottomNav active="home"/>
  </Phone>
);

const GlobalMenuSystem = () => (
  <Phone>
    <div style={{ padding: '8px 20px 16px', borderBottom: '1px solid var(--grey100)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>전체 메뉴</div>
        <button className="tm-pressable tm-break-keep" style={{ width: 36, height: 36, borderRadius: 18, background: 'var(--grey100)', display: 'grid', placeItems: 'center' }}><Icon name="search" size={18}/></button>
      </div>
    </div>
    <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px 80px', background: 'var(--grey50)' }}>
      {navMenu.map(([group, items]) => (
        <Surface key={group} style={{ marginBottom: 12, padding: '14px 16px 6px' }}>
          <div style={{ fontSize: 13, color: 'var(--text-caption)', fontWeight: 700, marginBottom: 4 }}>{group}</div>
          {items.map((item) => (
            <Row key={item} title={item} right={<Icon name="chevR" size={18} color="var(--grey400)"/>}/>
          ))}
        </Surface>
      ))}
    </div>
    <BottomNav active="my"/>
  </Phone>
);

const DarkModeSystem = () => (
  <div style={{ width: 840, minHeight: 812, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, fontFamily: 'var(--font)' }}>
    <Phone>
      <div style={{ flex: 1, padding: 20, background: 'var(--grey50)' }}>
        <SectionTitle title="Light mode" sub="기본 서비스 화면"/>
        <Surface style={{ marginTop: 16 }}>
          <LabeledNumber label="이번 달 결제" value={144000} unit="원"/>
          <div style={{ height: 18 }}/>
          <MoneyRow label="이번 주 매치" amount={12000}/>
          <MoneyRow label="레슨 수강권" amount={120000}/>
          <div style={{ marginTop: 18 }}><SBtn full>다음 결제 확인</SBtn></div>
        </Surface>
      </div>
      <BottomNav active="home"/>
    </Phone>
    <div data-theme="dark">
      <Phone bg="var(--bg)">
        <div style={{ flex: 1, padding: 20, background: 'var(--grey50)' }}>
          <SectionTitle title="Dark mode" sub="야간 사용과 운영 모니터링용"/>
          <Surface style={{ marginTop: 16, background: 'var(--bg)', borderColor: 'var(--border)' }}>
            <LabeledNumber label="오늘 처리 대기" value={18} unit="건"/>
            <div style={{ height: 18 }}/>
            <MoneyRow label="정산 예정" amount={26500}/>
            <MoneyRow label="환불 대기" amount={8000}/>
            <div style={{ marginTop: 18 }}><SBtn full>운영 큐 보기</SBtn></div>
          </Surface>
        </div>
        <BottomNav active="my"/>
      </Phone>
    </div>
  </div>
);

const AuthCallbackStates = () => (
  <Phone>
    <div style={{ flex: 1, padding: 20, background: 'var(--grey50)' }}>
      <SectionTitle title="OAuth callback" sub="/callback/kakao · /callback/naver"/>
      <Surface style={{ marginTop: 16 }}>
        {[
          ['loading', '계정 정보를 확인하고 있어요', '3초 이상 걸리면 로그인 화면으로 돌아갈 수 있어야 합니다', 'blue'],
          ['success', '로그인 완료', '온보딩 필요 여부에 따라 다음 화면을 분기합니다', 'green'],
          ['error', '로그인에 실패했어요', '권한 거부, 토큰 만료, 네트워크 오류를 같은 구조로 보여줍니다', 'red'],
        ].map(([state, title, sub, tone]) => (
          <Row key={state} title={title} sub={sub} leading={<Badge tone={tone}>{state}</Badge>} right={<Icon name="chevR" size={18} color="var(--grey400)"/>}/>
        ))}
      </Surface>
      <div style={{ marginTop: 16 }}>
        <Toast type="info" msg="실제 서비스에서는 provider별 로고보다 상태와 복구 CTA를 우선합니다"/>
      </div>
    </div>
  </Phone>
);

const EditFlowParity = () => (
  <Phone>
    <TopNav title="등록 · 수정 플로우"/>
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 96px', background: 'var(--grey50)' }}>
      <SectionTitle title="source에 있는 edit route" sub="new 화면과 같은 FormStepShell을 공유"/>
      <Surface style={{ marginTop: 14 }}>
        {[
          ['/matches/[id]/edit', '매치 수정', '일정, 장소, 모집 인원, 참가비'],
          ['/team-matches/[id]/edit', '팀 매치 수정', '상대 조건, 유니폼, 비용'],
          ['/lessons/[id]/edit', '레슨 수정', '커리큘럼, 가격, 수강권'],
          ['/marketplace/[id]/edit', '판매글 수정', '사진, 상태, 가격'],
          ['/mercenary/[id]/edit', '용병 공고 수정', '포지션, 페이, 마감'],
          ['/venues/[id]/edit', '시설 수정', '사진, 편의시설, 운영 정보'],
        ].map(([route, title, sub]) => (
          <Row key={route} title={title} sub={sub} leading={<Badge tone="blue">{route}</Badge>}/>
        ))}
      </Surface>
      <div style={{ marginTop: 18 }}>
        <SBtn full>변경사항 저장</SBtn>
      </div>
    </div>
  </Phone>
);

const MarketplaceOrderStatus = () => (
  <Phone>
    <TopNav title="주문 · 거래 상태"/>
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 96px', background: 'var(--grey50)' }}>
      <SectionTitle title="/marketplace/orders/[id]" sub="구매자와 판매자가 같은 상태 언어를 봅니다"/>
      <Surface style={{ marginTop: 14 }}>
        <LabeledNumber label="거래 금액" value={180000} unit="원"/>
        <div style={{ marginTop: 16 }}>
          {[
            ['결제 대기', '구매자가 체크아웃을 완료해야 합니다', 'grey'],
            ['입금 확인', '판매자에게 발송 준비 요청이 갔습니다', 'blue'],
            ['배송/픽업 중', '운송장 또는 픽업 장소가 노출됩니다', 'orange'],
            ['거래 완료', '리뷰와 분쟁 접수가 열립니다', 'green'],
          ].map(([title, sub, tone]) => (
            <Row key={title} title={title} sub={sub} leading={<Badge tone={tone}>{title}</Badge>}/>
          ))}
        </div>
      </Surface>
    </div>
    <BottomNav active="marketplace"/>
  </Phone>
);

const SettingsLegalPages = () => (
  <Phone>
    <TopNav title="개인정보 · 약관"/>
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 96px', background: 'var(--grey50)' }}>
      <SectionTitle title="Settings legal" sub="/settings/privacy · /settings/terms"/>
      <Surface style={{ marginTop: 14 }}>
        {[
          ['개인정보 처리방침', '수집 항목, 보관 기간, 제3자 제공, 삭제 요청'],
          ['서비스 이용약관', '매치 참가, 거래, 환불, 제재 기준'],
          ['위치 기반 서비스', '시설 검색과 거리 필터에만 사용'],
          ['알림 수신 동의', '푸시, 이메일, SMS를 채널별로 분리'],
        ].map(([title, sub]) => (
          <Row key={title} title={title} sub={sub} right={<Icon name="chevR" size={18} color="var(--grey400)"/>}/>
        ))}
      </Surface>
    </div>
    <BottomNav active="my"/>
  </Phone>
);

const MyExpandedCoverage = () => (
  <Phone>
    <TopNav title="내 활동 전체"/>
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 96px', background: 'var(--grey50)' }}>
      <SectionTitle title="My route parity" sub="source에 있는 /my/* 전체를 같은 리스트 문법으로 묶습니다"/>
      {[
        ['내 레슨', '/my/lessons', '예약한 레슨과 수강 일정'],
        ['내 용병', '/my/mercenary', '지원/모집 중인 용병 공고'],
        ['내 팀매치', '/my/team-matches', '신청, 승인, 경기 후 평가'],
        ['분쟁 상세', '/my/disputes/[id]', '증빙, 답변, 처리 상태'],
      ].map(([title, route, sub]) => (
        <Surface key={route} style={{ marginTop: 10 }}>
          <Row title={title} sub={sub} leading={<Badge tone="blue">{route}</Badge>} right={<Icon name="chevR" size={18} color="var(--grey400)"/>}/>
        </Surface>
      ))}
    </div>
    <BottomNav active="my"/>
  </Phone>
);

const AdminSourceParity = () => (
  <div style={{ width: 1180, minHeight: 760, background: 'var(--grey50)', fontFamily: 'var(--font)', display: 'flex' }}>
    <div style={{ width: 224, background: 'var(--text-strong)', color: 'var(--static-white)', padding: '20px 0' }}>
      <div style={{ padding: '0 20px 20px', fontSize: 16, fontWeight: 700 }}>teameet admin</div>
      {['Dashboard', 'Matches', 'Team matches', 'Users', 'Teams', 'Lessons', 'Venues', 'Payments', 'Disputes', 'Ops'].map((m, i) => (
        <div key={m} style={{ padding: '10px 20px', color: i === 0 ? 'var(--static-white)' : 'rgba(255,255,255,.58)', fontSize: 13, fontWeight: 700 }}>{m}</div>
      ))}
    </div>
    <div style={{ flex: 1, padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Admin route parity</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 6 }}>source의 admin route 전체를 list/detail/action shell로 분류합니다.</div>
        </div>
        <SBtn>운영 큐 열기</SBtn>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
        <KPIStat label="관리 route" value={25}/>
        <KPIStat label="detail route" value={8}/>
        <KPIStat label="action queue" value={6}/>
        <KPIStat label="unified shell" value={1}/>
      </div>
      <Surface>
        {[
          ['결제 관리', '/admin/payments', '환불, 결제 실패, mock mode 표시'],
          ['팀매치 상세', '/admin/team-matches/[id]', '스코어, 평가, 출석 이력'],
          ['팀 상세', '/admin/teams/[id]', '멤버, 제재, 공개 프로필'],
          ['시설 상세', '/admin/venues/[id]', '사진, 가격, 검수, 공개 여부'],
          ['수강권 관리', '/admin/lesson-tickets', '만료, 잔여, 환불 연결'],
          ['용병 관리', '/admin/mercenary', '마감, 신고, 페이 검수'],
        ].map(([title, route, sub]) => (
          <Row key={route} title={title} sub={sub} leading={<Badge tone="grey">{route}</Badge>} right={<Badge tone="blue">add</Badge>}/>
        ))}
      </Surface>
    </div>
  </div>
);

const AdminDetailToolkit = () => (
  <div style={{ width: 1180, minHeight: 760, background: 'var(--grey50)', fontFamily: 'var(--font)', padding: 32 }}>
    <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Admin detail shell</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 22 }}>운영 상세 화면은 좌측 요약, 우측 조치 로그, 하단 근거 테이블을 공유합니다.</div>
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 18 }}>
      <Surface>
        <SectionTitle title="사용자 / 거래 요약"/>
        <LabeledNumber label="검토 대상 금액" value={180000} unit="원"/>
        <div style={{ marginTop: 16 }}>
          <MoneyRow label="결제" amount={180000}/>
          <MoneyRow label="환불 가능" amount={172000}/>
          <MoneyRow label="수수료" amount={8000}/>
        </div>
      </Surface>
      <Surface>
        <SectionTitle title="운영 조치"/>
        {['상태 변경', '담당자 지정', '사용자 알림', '부분 실패 기록', '감사 로그'].map((x, i) => (
          <Row key={x} title={x} sub={i === 3 ? '실패도 성공처럼 숨기지 않고 별도 상태로 남깁니다' : '처리 주체와 시간이 남는 액션'} right={<SBtn size="tiny" variant={i === 0 ? 'primary' : 'neutral'}>{i === 0 ? '처리' : '보기'}</SBtn>}/>
        ))}
      </Surface>
    </div>
    <Surface style={{ marginTop: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr', gap: 12, fontSize: 12, color: 'var(--text-caption)', fontWeight: 700, paddingBottom: 10, borderBottom: '1px solid var(--grey100)' }}>
        <div>대상</div><div>상태</div><div>담당</div><div>마감</div><div>결과</div>
      </div>
      {['payment-318', 'team-match-882', 'venue-104', 'ticket-551'].map((id, i) => (
        <div key={id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr', gap: 12, fontSize: 13, padding: '12px 0', borderBottom: '1px solid var(--grey100)' }}>
          <div style={{ fontWeight: 700 }}>{id}</div><div>{['대기', '진행', '검수', '완료'][i]}</div><div>ops-{i + 1}</div><div>오늘 {14 + i}:00</div><div>{i === 3 ? '완료' : '미정'}</div>
        </div>
      ))}
    </Surface>
  </div>
);

const FuturePageBacklog = () => (
  <div style={{ width: 1180, minHeight: 760, background: 'var(--grey50)', fontFamily: 'var(--font)', padding: 32 }}>
    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue500)', marginBottom: 8 }}>NOT IN SOURCE YET</div>
    <div style={{ fontSize: 30, fontWeight: 700, marginBottom: 22 }}>아직 구현되지 않았지만 서비스 완성에 필요한 프로토타입</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
      {[
        ['Coach workspace', ['레슨 일정표', '학생 관리', '수강권 정산']],
        ['Venue owner', ['시설 등록 승인', '가격표 관리', '예약 캘린더']],
        ['Tournament ops', ['대진표 편집', '참가팀 검수', '결과 공지']],
        ['Trust center', ['신고 증빙', '분쟁 타임라인', '제재 이력']],
        ['Rental operations', ['대여 재고', '픽업/반납', '파손 보상']],
        ['Team captain tools', ['출석 템플릿', '회비 정산', '라인업 공유']],
        ['Safety checks', ['하키 장비', '부상 고지', '보험 안내']],
        ['Growth experiments', ['추천 이유', '초대 링크', '지역 커뮤니티']],
      ].map(([title, items]) => (
        <Surface key={title} style={{ minHeight: 230 }}>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>{title}</div>
          {items.map((item) => (
            <Row key={item} title={item} right={<Badge tone="grey">planned</Badge>}/>
          ))}
        </Surface>
      ))}
    </div>
  </div>
);

const PrototypeTopicGrouping = () => (
  <div style={{ width: 1180, minHeight: 760, background: 'var(--grey50)', fontFamily: 'var(--font)', padding: 32 }}>
    <div style={{ fontSize: 30, fontWeight: 700, marginBottom: 8 }}>Prototype topic grouping</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 22 }}>이후 01~24도 아래 주제 구조로 재배치하면 source와 prototype을 같은 언어로 비교할 수 있습니다.</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
      {[
        ['Core Shell', ['00 Toss DNA', '00i Navigation', 'Dark mode', 'States']],
        ['Discover', ['Home', 'Matches', 'Team matches', 'Venues', 'Lessons', 'Marketplace']],
        ['Transaction', ['Checkout', 'Payment detail', 'Refund', 'Orders', 'Lesson tickets']],
        ['Operations', ['Attendance', 'Score', 'Evaluate', 'Admin queues', 'Disputes']],
        ['Identity', ['Onboarding', 'Profile', 'Badges', 'Reviews', 'Settings']],
        ['Growth / Public', ['Landing', 'Pricing', 'FAQ', 'Guide', 'Public profiles']],
      ].map(([title, items]) => (
        <Surface key={title}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{title}</div>
          {items.map((item) => <RoutePill key={item}>{item}</RoutePill>)}
        </Surface>
      ))}
    </div>
  </div>
);

const MiniMetric = ({ label, value, tone = 'blue' }) => (
  <div style={{ flex: 1, padding: 12, borderRadius: 12, background: tone === 'blue' ? 'var(--blue50)' : tone === 'green' ? 'var(--green50)' : tone === 'orange' ? 'var(--orange50)' : 'var(--grey100)' }}>
    <div className="tab-num" style={{ fontSize: 20, fontWeight: 700, color: tone === 'blue' ? 'var(--blue500)' : tone === 'green' ? 'var(--green500)' : tone === 'orange' ? 'var(--orange500)' : 'var(--grey800)' }}>{value}</div>
    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, marginTop: 2 }}>{label}</div>
  </div>
);

const LabeledNumber = ({ label, value, unit = '원', sub }) => (
  <div>
    <div style={{ fontSize: 12, color: 'var(--text-caption)', fontWeight: 700, marginBottom: 6 }}>{label}</div>
    <NumberDisplay value={value} unit={unit} sub={sub}/>
  </div>
);

const CoachWorkspace = () => (
  <Phone>
    <TopNav title="코치 워크스페이스"/>
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 96px', background: 'var(--grey50)' }}>
      <SectionTitle title="오늘 레슨" sub="학생 관리와 수강권 잔여를 같은 흐름에서 확인"/>
      <div style={{ display: 'flex', gap: 8, margin: '14px 0' }}>
        <MiniMetric label="예약" value="6" tone="blue"/>
        <MiniMetric label="완료" value="2" tone="green"/>
        <MiniMetric label="노쇼 위험" value="1" tone="orange"/>
      </div>
      <Surface>
        {[
          ['10:00', '김정민 · 축구 1:1', '잔여 3회 · 상암 풋볼파크', '확정'],
          ['13:30', '수아 · 슛 클리닉', '잔여 1회 · 영상 피드백 필요', '대기'],
          ['19:00', '성인 풋살 기초반', '8명 그룹 · 출석 체크 필요', '확정'],
        ].map(([time, title, sub, status]) => (
          <Row key={time} title={`${time} ${title}`} sub={sub} leading={<Badge tone={status === '확정' ? 'blue' : 'orange'}>{status}</Badge>} right={<Icon name="chevR" size={18} color="var(--grey400)"/>}/>
        ))}
      </Surface>
    </div>
    <BottomNav active="lessons"/>
  </Phone>
);

const VenueOwnerConsole = () => (
  <Phone>
    <TopNav title="시설 운영"/>
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 96px', background: 'var(--grey50)' }}>
      <SectionTitle title="예약 캘린더" sub="가격표, 블록 시간, 검수 상태를 한 곳에 배치"/>
      <Surface style={{ marginTop: 14 }}>
        <LabeledNumber label="오늘 예약 매출" value={420000} unit="원"/>
        <div style={{ height: 16 }}/>
        {['18:00 풋살 A코트 · 결제 완료', '20:00 풋살 B코트 · 승인 대기', '21:00 축구장 · 운영자 블록'].map((x, i) => (
          <Row key={x} title={x} sub={i === 1 ? '관리자 검수 후 공개됩니다' : '예약자와 취소 정책이 연결됩니다'} leading={<Badge tone={i === 1 ? 'orange' : 'blue'}>{i === 2 ? 'block' : 'book'}</Badge>}/>
        ))}
      </Surface>
    </div>
    <BottomNav active="matches"/>
  </Phone>
);

const TournamentOps = () => (
  <div style={{ width: 1180, minHeight: 760, background: 'var(--grey50)', fontFamily: 'var(--font)', padding: 32 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
      <div>
        <div style={{ fontSize: 28, fontWeight: 700 }}>Tournament operations</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 6 }}>대진표 편집, 참가팀 검수, 결과 공지를 운영 화면으로 분리합니다.</div>
      </div>
      <SBtn>대진표 공개</SBtn>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 18 }}>
      <Surface>
        <SectionTitle title="8강 대진"/>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {['FC 발빠른놈들 vs 다이나믹 FS', '서초 Raiders vs 강남 FC', '송파 스매쉬 vs 강북 United', '목동 Ice vs 잠실 Stars'].map((m, i) => (
            <div key={m} style={{ padding: 14, borderRadius: 12, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
              <Badge tone={i === 0 ? 'blue' : 'grey'}>{i === 0 ? 'live' : 'pending'}</Badge>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 10 }}>{m}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>심판 배정 · 결과 입력 대기</div>
            </div>
          ))}
        </div>
      </Surface>
      <Surface>
        <SectionTitle title="검수 큐"/>
        {['참가비 입금 확인', '유니폼 색상 충돌', '선출 여부 증빙', '결과 공지 예약'].map((x, i) => (
          <Row key={x} title={x} sub="담당자와 처리 시각이 기록됩니다" leading={<Badge tone={i === 0 ? 'blue' : 'orange'}>{i + 1}</Badge>}/>
        ))}
      </Surface>
    </div>
  </div>
);

const TrustCenter = () => (
  <div style={{ width: 1180, minHeight: 760, background: 'var(--grey50)', fontFamily: 'var(--font)', padding: 32 }}>
    <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>Trust center</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>신고, 분쟁, 제재 이력을 사용자/운영자가 같은 상태 언어로 추적합니다.</div>
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 18 }}>
      <Surface>
        <LabeledNumber label="열린 케이스" value={12} unit="건"/>
        <div style={{ height: 16 }}/>
        <StatBar label="증빙 제출" value={72}/>
        <StatBar label="운영자 검토" value={38} color="var(--orange500)"/>
        <StatBar label="해결 완료" value={64} color="var(--green500)"/>
      </Surface>
      <Surface>
        {[
          ['분쟁 접수', '거래 취소 요청 · 결제 180,000원', '증빙 필요'],
          ['신고 처리', '팀 매치 노쇼 반복 · 최근 3회', '검토 중'],
          ['제재 이력', '욕설 채팅 신고 · 7일 제한', '완료'],
          ['환불 중재', '레슨 노쇼 기준 이견', '담당자 배정'],
        ].map(([title, sub, status]) => (
          <Row key={title} title={title} sub={sub} leading={<Badge tone={status === '완료' ? 'green' : status === '검토 중' ? 'orange' : 'blue'}>{status}</Badge>} right={<Icon name="chevR" size={18} color="var(--grey400)"/>}/>
        ))}
      </Surface>
    </div>
  </div>
);

const RentalOperations = () => (
  <Phone>
    <TopNav title="장비 대여 운영"/>
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 96px', background: 'var(--grey50)' }}>
      <SectionTitle title="픽업 · 반납" sub="재고, 보증금, 파손 상태를 분리"/>
      <Surface style={{ marginTop: 14 }}>
        {[
          ['아이스하키 풀세트 L', '픽업 대기 · 보증금 50,000원', '대기'],
          ['배드민턴 라켓 2개', '반납 지연 2시간 · 알림 발송', '지연'],
          ['풋살화 270mm', '검수 완료 · 다음 예약 가능', '완료'],
        ].map(([title, sub, status]) => (
          <Row key={title} title={title} sub={sub} leading={<Badge tone={status === '완료' ? 'green' : status === '지연' ? 'red' : 'blue'}>{status}</Badge>}/>
        ))}
      </Surface>
    </div>
    <BottomNav active="marketplace"/>
  </Phone>
);

const TeamCaptainTools = () => (
  <Phone>
    <TopNav title="팀장 도구"/>
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 96px', background: 'var(--grey50)' }}>
      <SectionTitle title="경기 준비" sub="출석, 라인업, 회비 정산을 한 흐름으로 연결"/>
      <div style={{ display: 'flex', gap: 8, margin: '14px 0' }}>
        <MiniMetric label="출석" value="11/14"/>
        <MiniMetric label="미납" value="3" tone="orange"/>
        <MiniMetric label="라인업" value="2안" tone="green"/>
      </div>
      <Surface>
        {['라인업 공유', '회비 요청', '상대팀 확인', '경기 후 평가 요청'].map((x, i) => (
          <Row key={x} title={x} sub="팀 채팅과 알림으로 이어집니다" leading={<Badge tone={i === 1 ? 'orange' : 'blue'}>{i + 1}</Badge>} right={<SBtn size="tiny" variant={i === 0 ? 'primary' : 'neutral'}>{i === 0 ? '공유' : '열기'}</SBtn>}/>
        ))}
      </Surface>
    </div>
    <BottomNav active="matches"/>
  </Phone>
);

const SafetyChecks = () => (
  <Phone>
    <TopNav title="안전 체크"/>
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 96px', background: 'var(--grey50)' }}>
      <SectionTitle title="종목별 필수 확인" sub="하키/피겨/고강도 경기에서 안전 조건을 노출"/>
      <Surface style={{ marginTop: 14 }}>
        {[
          ['보호 장비', '헬멧, 패드, 스틱, 장갑 보유 여부', true],
          ['경력 확인', '스케이트 경력 1년 이상 권장', true],
          ['부상 고지', '최근 30일 내 부상 여부 입력', false],
          ['보험 안내', '실제 서비스 약관과 연결', true],
        ].map(([title, sub, ok]) => (
          <Row key={title} title={title} sub={sub} leading={<Badge tone={ok ? 'green' : 'orange'}>{ok ? '확인' : '입력'}</Badge>}/>
        ))}
      </Surface>
    </div>
    <BottomNav active="matches"/>
  </Phone>
);

const GrowthExperiments = () => (
  <Phone>
    <TopNav title="추천 · 초대"/>
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 96px', background: 'var(--grey50)' }}>
      <SectionTitle title="추천 이유" sub="사용자가 왜 이 매치를 보는지 숨기지 않습니다"/>
      <Surface style={{ marginTop: 14 }}>
        {[
          ['실력대가 맞아요', '최근 참가 경기 기준 B레벨과 잘 맞습니다'],
          ['거리 2.1km', '자주 가는 지역과 가까워요'],
          ['팀원이 3명 참가', 'FC 발빠른놈들 멤버가 이미 참가했어요'],
        ].map(([title, sub]) => (
          <Row key={title} title={title} sub={sub} leading={<Badge tone="blue">why</Badge>}/>
        ))}
      </Surface>
      <div style={{ marginTop: 16 }}>
        <SBtn full>초대 링크 만들기</SBtn>
      </div>
    </div>
    <BottomNav active="home"/>
  </Phone>
);

const GroupedCoreShell = () => (
  <div style={{ width: 1180, minHeight: 760, background: 'var(--grey50)', fontFamily: 'var(--font)', padding: 32 }}>
    <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 20 }}>Core Shell Group</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
      {[
        ['00 Toss DNA', 'NumberDisplay, MoneyRow, KPIStat, ListItem'],
        ['00i Global Shell', 'bottom nav, menu, dark mode'],
        ['State Family', 'empty, loading, error, permission, sold out'],
        ['Motion', 'tap scale, skeleton, toast, sticky CTA'],
      ].map(([title, sub]) => <Surface key={title}><div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div><div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>{sub}</div></Surface>)}
    </div>
  </div>
);

const GroupedDiscovery = () => (
  <div style={{ width: 1180, minHeight: 760, background: 'var(--grey50)', fontFamily: 'var(--font)', padding: 32 }}>
    <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 20 }}>Discovery Group</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
      {[
        ['Home', ['Toss canonical', 'Quick actions', 'Story/feed']],
        ['Play', ['Matches', 'Team matches', 'Mercenary', 'Tournaments']],
        ['Explore', ['Lessons', 'Venues', 'Marketplace']],
      ].map(([title, items]) => <Surface key={title}><div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{title}</div>{items.map(i => <RoutePill key={i}>{i}</RoutePill>)}</Surface>)}
    </div>
  </div>
);

const GroupedTransaction = () => (
  <div style={{ width: 1180, minHeight: 760, background: 'var(--grey50)', fontFamily: 'var(--font)', padding: 32 }}>
    <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 20 }}>Transaction Group</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
      {[
        ['Payments', ['checkout', 'success', 'history', 'refund']],
        ['Orders', ['marketplace order', 'rental pickup', 'return']],
        ['Tickets', ['lesson tickets', 'remain/expire', 'settlement']],
      ].map(([title, items]) => <Surface key={title}><div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{title}</div>{items.map(i => <RoutePill key={i} tone="orange">{i}</RoutePill>)}</Surface>)}
    </div>
  </div>
);

const GroupedOperations = () => (
  <div style={{ width: 1180, minHeight: 760, background: 'var(--grey50)', fontFamily: 'var(--font)', padding: 32 }}>
    <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 20 }}>Operations Group</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
      {[
        ['Game day', ['arrival', 'score', 'evaluate']],
        ['Admin', ['dashboard', 'tables', 'details']],
        ['Trust', ['reports', 'disputes', 'sanctions']],
        ['Owner tools', ['coach', 'venue', 'tournament']],
      ].map(([title, items]) => <Surface key={title}><div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{title}</div>{items.map(i => <RoutePill key={i} tone="green">{i}</RoutePill>)}</Surface>)}
    </div>
  </div>
);

const GroupedIdentityPublic = () => (
  <div style={{ width: 1180, minHeight: 760, background: 'var(--grey50)', fontFamily: 'var(--font)', padding: 32 }}>
    <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 20 }}>Identity / Public Group</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
      {[
        ['Identity', ['onboarding', 'profile', 'badges', 'reviews']],
        ['My', ['my matches', 'my teams', 'settings', 'legal']],
        ['Public', ['landing', 'pricing', 'FAQ', 'guide', 'public profile']],
      ].map(([title, items]) => <Surface key={title}><div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{title}</div>{items.map(i => <RoutePill key={i}>{i}</RoutePill>)}</Surface>)}
    </div>
  </div>
);

Object.assign(window, {
  SourcePrototypeParityMap,
  GlobalNavigationSystem,
  GlobalMenuSystem,
  DarkModeSystem,
  AuthCallbackStates,
  EditFlowParity,
  MarketplaceOrderStatus,
  SettingsLegalPages,
  MyExpandedCoverage,
  AdminSourceParity,
  AdminDetailToolkit,
  FuturePageBacklog,
  PrototypeTopicGrouping,
  CoachWorkspace,
  VenueOwnerConsole,
  TournamentOps,
  TrustCenter,
  RentalOperations,
  TeamCaptainTools,
  SafetyChecks,
  GrowthExperiments,
  GroupedCoreShell,
  GroupedDiscovery,
  GroupedTransaction,
  GroupedOperations,
  GroupedIdentityPublic,
});
