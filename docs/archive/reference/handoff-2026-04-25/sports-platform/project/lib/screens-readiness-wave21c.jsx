/* Teameet readiness wave 21c: My/Profile/Trust and Payments/Refund/Disputes. */

const Wave21C_COLORS = {
  blue: ['var(--blue50)', 'var(--blue500)'],
  grey: ['var(--grey50)', 'var(--text-muted)'],
  green: ['var(--green50)', 'var(--green500)'],
  orange: ['var(--orange50)', 'var(--orange500)'],
  red: ['var(--red50)', 'var(--red500)'],
};

const Wave21CToneBg = (tone) => (Wave21C_COLORS[tone] || Wave21C_COLORS.grey)[0];
const Wave21CToneColor = (tone) => (Wave21C_COLORS[tone] || Wave21C_COLORS.grey)[1];
const Wave21CButtonClass = (tone, ghost) => `tm-btn tm-btn-md ${ghost ? 'tm-btn-secondary' : tone === 'red' ? 'tm-btn-danger' : 'tm-btn-primary'}`;

const Wave21CButton = ({ children, tone = 'blue', disabled, loading, ghost }) => (
  <button
    className={Wave21CButtonClass(tone, ghost)}
    disabled={disabled}
    style={{
      width: '100%',
    }}
  >
    {loading && <Skeleton w={18} h={18} r={999}/>}
    {children}
  </button>
);

const Wave21CPhoneHeader = ({ badge, title, sub, tone = 'blue' }) => (
  <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
    <Badge tone={tone} size="sm">{badge}</Badge>
    <div style={{ fontSize: 23, fontWeight: 700, lineHeight: 1.25, marginTop: 8 }}>{title}</div>
    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>{sub}</div>
  </div>
);

const Wave21CRow = ({ title, sub, meta, tone = 'grey', right }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: '1px solid var(--grey100)' }}>
    <div style={{ minWidth: 42, height: 34, padding: '0 8px', borderRadius: 12, background: Wave21CToneBg(tone), color: Wave21CToneColor(tone), display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
      {meta || title.slice(0, 1)}
    </div>
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.3 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 2 }}>{sub}</div>
    </div>
    {right}
  </div>
);

const Wave21CTrustLabel = ({ kind }) => {
  const map = {
    verified: ['검증됨', 'blue', '운영 검증 또는 실제 활동 기반'],
    estimated: ['추정치', 'orange', '최근 활동이 적어 모델 추정 포함'],
    sample: ['샘플', 'grey', '프로토타입 예시 데이터'],
  };
  const [label, tone, title] = map[kind] || map.sample;
  return <Badge tone={tone} size="sm" title={title}>{label}</Badge>;
};

const Wave21CProfileCases = [
  { id: 'photo-error', chip: '사진 실패', tone: 'red', title: '사진을 올리지 못했어요', sub: '원본은 보존하고 파일 용량, 권한, 네트워크 실패를 각각 분리해 안내합니다.', cta: '다시 업로드' },
  { id: 'private', chip: '비공개', tone: 'grey', title: '비공개 프로필이에요', sub: '이름, 연락처, 민감 활동은 숨기고 공개 가능한 신뢰 신호만 남깁니다.', cta: '공개 범위 보기' },
  { id: 'nickname', chip: '닉네임', tone: 'orange', title: '이미 사용 중인 닉네임이에요', sub: '저장 버튼을 막고 입력값은 유지합니다. 추천 닉네임을 같이 제안합니다.', cta: '추천 닉네임 적용' },
  { id: 'pending', chip: '검수중', tone: 'blue', title: '프로필 검수 중이에요', sub: '배지와 리뷰 반영 전까지 공개 프로필에는 대기 상태를 표시합니다.', cta: '미리보기' },
  { id: 'success', chip: '저장됨', tone: 'green', title: '프로필이 저장됐어요', sub: '저장 toast 이후 공개 프로필 확인 CTA를 고정합니다.', cta: '공개 프로필 보기' },
];

const MyProfileStateEdgeBoard = () => {
  const [active, setActive] = React.useState('photo-error');
  const current = Wave21CProfileCases.find((item) => item.id === active) || Wave21CProfileCases[0];
  return (
    <Phone>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--grey50)' }}>
        <Wave21CPhoneHeader badge="MY STATES" title="프로필 상태와 예외" sub="사진, 닉네임, 공개 범위, 검수 상태를 happy path와 분리해 보여줍니다."/>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 20px 0' }}>
          {Wave21CProfileCases.map((item) => <HapticChip key={item.id} active={active === item.id} onClick={() => setActive(item.id)}>{item.chip}</HapticChip>)}
        </div>
        <div style={{ flex: 1, padding: 20, overflow: 'auto' }}>
          <Card pad={20}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <Badge tone={current.tone}>{current.chip}</Badge>
              <div style={{ width: 42, height: 42, borderRadius: 15, background: Wave21CToneBg(current.tone), color: Wave21CToneColor(current.tone), display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 800 }}>{current.tone === 'green' ? '✓' : current.tone === 'red' ? '!' : 'i'}</div>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.25, marginTop: 18 }}>{current.title}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8 }}>{current.sub}</div>
            <div style={{ marginTop: 18, display: 'grid', gap: 8 }}>
              <Wave21CRow title="프로필 사진" sub={current.id === 'photo-error' ? '업로드 실패 · 원본 유지' : '최근 촬영 사진'} meta="P" tone={current.id === 'photo-error' ? 'red' : 'blue'} right={<Wave21CTrustLabel kind={current.id === 'photo-error' ? 'sample' : 'verified'}/>}/>
              <Wave21CRow title="매너 점수" sub="최근 90일 리뷰 18건 기준" meta="4.8" tone="green" right={<Wave21CTrustLabel kind="verified"/>}/>
              <Wave21CRow title="경기 실력" sub="자가 입력과 활동 로그 혼합" meta="B" tone="orange" right={<Wave21CTrustLabel kind="estimated"/>}/>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 18 }}>
              <Wave21CButton ghost>나중에</Wave21CButton>
              <Wave21CButton tone={current.tone === 'red' ? 'red' : 'blue'}>{current.cta}</Wave21CButton>
            </div>
          </Card>
          <Toast type={current.tone === 'green' ? 'success' : current.tone === 'red' ? 'error' : 'info'} msg={current.id === 'success' ? '프로필 저장 완료' : '상태별 복구 CTA가 유지됩니다'}/>
        </div>
        <BottomNav active="my"/>
      </div>
    </Phone>
  );
};

const MyProfileUploadErrorBoard = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--grey50)' }}>
      <Wave21CPhoneHeader badge="UPLOAD ERROR" title="사진 업로드 실패" sub="파일 문제와 네트워크 실패가 같은 오류 문구로 뭉개지지 않도록 분리합니다." tone="red"/>
      <div style={{ flex: 1, padding: 20, overflow: 'auto' }}>
        <Card pad={20}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ width: 86, height: 86, borderRadius: 28, background: 'var(--grey100)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, textAlign: 'center' }}>원본<br/>보존</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>사진은 아직 바뀌지 않았어요</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>저장 전 실패라 기존 공개 사진을 그대로 유지합니다.</div>
            </div>
          </div>
          <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
            {[
              ['파일 용량 초과', '10MB 이하 JPG/PNG만 업로드할 수 있어요.', 'red'],
              ['카메라 권한 없음', '설정에서 사진 접근을 허용한 뒤 다시 시도하세요.', 'orange'],
              ['네트워크 중단', '연결되면 같은 파일로 다시 업로드할 수 있어요.', 'blue'],
            ].map(([title, sub, tone]) => <Wave21CRow key={title} title={title} sub={sub} tone={tone} meta={tone === 'red' ? '!' : tone === 'orange' ? '?' : '↻'}/>)}
          </div>
          <div style={{ marginTop: 18, padding: 14, borderRadius: 14, background: 'var(--red50)', color: 'var(--red500)', fontSize: 12, fontWeight: 700, lineHeight: 1.45 }}>업로드 실패 상태에서는 저장 CTA를 성공처럼 닫지 않습니다.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 18 }}>
            <Wave21CButton ghost>다른 사진 선택</Wave21CButton>
            <Wave21CButton tone="red">다시 업로드</Wave21CButton>
          </div>
        </Card>
      </div>
    </div>
  </Phone>
);

const MyProfilePrivacyTrustBoard = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <Wave21CPhoneHeader badge="PRIVACY" title="공개 범위와 신뢰 라벨" sub="비공개 프로필에서도 verified/estimated/sample의 출처가 명확해야 합니다."/>
      <div style={{ flex: 1, padding: 20, overflow: 'auto' }}>
        <Card pad={18}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>김정민</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>축구 · MF · 서울</div>
            </div>
            <Badge tone="grey">비공개</Badge>
          </div>
          <div style={{ marginTop: 16, padding: 14, borderRadius: 14, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>숨김 처리된 정보</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 5 }}>연락처, 생년, 정확한 활동 위치, 최근 결제 이력은 공개 프로필에 노출하지 않습니다.</div>
          </div>
          <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
            <Wave21CRow title="출석률 96%" sub="실제 참가 기록 기반" tone="blue" meta="96" right={<Wave21CTrustLabel kind="verified"/>}/>
            <Wave21CRow title="실력 등급 B" sub="리뷰와 자가 입력 혼합" tone="orange" meta="B" right={<Wave21CTrustLabel kind="estimated"/>}/>
            <Wave21CRow title="추천 배지" sub="시안 예시로만 표시" tone="grey" meta="S" right={<Wave21CTrustLabel kind="sample"/>}/>
          </div>
        </Card>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Wave21CButton ghost>미리보기</Wave21CButton>
          <Wave21CButton>공개 범위 저장</Wave21CButton>
        </div>
      </div>
      <BottomNav active="my"/>
    </div>
  </Phone>
);

const MyProfileBadgeReviewBoard = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--grey50)' }}>
      <Wave21CPhoneHeader badge="BADGE REVIEW" title="뱃지와 리뷰 신뢰도" sub="뱃지, 리뷰, 평판 수치는 출처 라벨과 만료/검수 상태를 함께 가져갑니다."/>
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <KPIStat label="리뷰" value={18}/>
          <KPIStat label="평점" value="4.8"/>
          <KPIStat label="뱃지" value={6}/>
        </div>
        <Card pad={18} style={{ marginTop: 14 }}>
          <SectionTitle title="대표 뱃지" sub="공개 프로필에서 신뢰 신호로 쓰이는 항목"/>
          {[
            ['시간 약속 지킴', '최근 10경기 노쇼 0회', 'verified', 'blue'],
            ['팀플레이 좋음', '리뷰 12건에서 언급', 'verified', 'green'],
            ['새로운 포지션 도전', '활동이 적어 추정치 포함', 'estimated', 'orange'],
            ['인기 플레이어', '프로토타입 샘플', 'sample', 'grey'],
          ].map(([title, sub, kind, tone]) => (
            <Wave21CRow key={title} title={title} sub={sub} tone={tone} meta="★" right={<Wave21CTrustLabel kind={kind}/>}/>
          ))}
        </Card>
        <Card pad={18} style={{ marginTop: 12 }}>
          <SectionTitle title="리뷰 작성 가능 기간" sub="기간 만료 리뷰는 CTA 대신 이유를 남깁니다"/>
          <Wave21CRow title="주말 축구 한 판" sub="D+5 · 리뷰 작성 가능" tone="blue" meta="D5" right={<Badge tone="blue" size="sm">작성</Badge>}/>
          <Wave21CRow title="평일 농구" sub="작성 기간이 지났어요" tone="grey" meta="만료" right={<Badge tone="grey" size="sm">차단</Badge>}/>
        </Card>
      </div>
    </div>
  </Phone>
);

const MyProfileControlInteractionBoard = () => {
  const [name, setName] = React.useState('축구왕');
  const isConflict = name === '축구왕';
  return (
    <Phone>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        <Wave21CPhoneHeader badge="CONTROLS" title="프로필 입력 컨트롤" sub="닉네임 중복, 공개 토글, 저장 loading/disabled/focus 상태를 한 화면에 묶습니다."/>
        <div style={{ flex: 1, padding: 20, overflow: 'auto' }}>
          <Card pad={18}>
            <label style={{ display: 'block' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>닉네임</div>
              <input value={name} onChange={(event) => setName(event.target.value)} style={{ width: '100%', height: 48, borderRadius: 14, border: `1px solid ${isConflict ? 'var(--orange500)' : 'var(--border)'}`, padding: '0 14px', fontSize: 15, fontWeight: 600, fontFamily: 'inherit', outline: 'none' }}/>
            </label>
            <div style={{ marginTop: 8, fontSize: 12, color: isConflict ? 'var(--orange500)' : 'var(--text-muted)', lineHeight: 1.4 }}>{isConflict ? '이미 사용 중입니다. 축구왕23, 서울MF를 추천합니다.' : '사용 가능한 닉네임입니다.'}</div>
            <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
              {[
                ['공개 프로필', '매너 점수와 활동 배지를 공개합니다.', true],
                ['정확한 지역 숨김', '동 단위 대신 구 단위로 표시합니다.', true],
                ['리뷰 알림 받기', '새 리뷰와 배지 변동을 알려줍니다.', false],
              ].map(([title, sub, active]) => (
                <div key={title} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>
                  </div>
                  <div style={{ width: 46, height: 26, borderRadius: 999, background: active ? 'var(--blue500)' : 'var(--grey200)', padding: 3 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--static-white)', marginLeft: active ? 20 : 0 }}/>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
              <Wave21CButton disabled={isConflict}>저장하기</Wave21CButton>
              <Wave21CButton loading ghost>저장 중 상태</Wave21CButton>
              <Wave21CButton ghost>배지 상세 시트 열기</Wave21CButton>
            </div>
          </Card>
        </div>
      </div>
    </Phone>
  );
};

const MyProfileMotionContractBoard = () => (
  <div style={{ width: 840, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">MOTION CONTRACT</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>마이 · 프로필 모션 규칙</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>프로필은 신뢰 화면이라 장식보다 상태 전환의 원인과 결과가 명확해야 합니다.</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 18, marginTop: 26 }}>
      <Card pad={18}>
        {[
          ['사진 선택', 'sheet rise 180ms', '업로드 progress row', '실패 시 원본 유지'],
          ['닉네임 입력', 'focus ring 120ms', '중복 검사 pending', '추천 닉네임 칩'],
          ['저장 성공', 'button loading -> toast', '공개 미리보기 CTA', 'tab state 유지'],
          ['배지 상세', 'bottom sheet', 'verified/estimated/sample 설명', '닫기 후 위치 유지'],
        ].map(([trigger, motion, feedback, final]) => (
          <div key={trigger} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr 1fr', gap: 10, padding: '13px 0', borderBottom: '1px solid var(--grey100)', fontSize: 12 }}>
            <b>{trigger}</b><span>{motion}</span><span>{feedback}</span><span>{final}</span>
          </div>
        ))}
      </Card>
      <Card pad={18}>
        <SectionTitle title="Reduced motion" sub="신뢰 상태는 애니메이션 없이도 동일하게 읽혀야 합니다"/>
        {['scale 대신 색/문구 변경', 'sheet 대신 즉시 expanded panel', 'toast는 persistent row로 대체', 'tab 이동은 위치 점프 없이 focus 유지'].map((item) => (
          <Wave21CRow key={item} title={item} sub="prefers-reduced-motion에서 확인" tone="grey" meta="RM"/>
        ))}
      </Card>
    </div>
  </div>
);

const Wave21CMiniProfileLayout = ({ mode = 'mobile', dark }) => {
  const width = mode === 'desktop' ? 560 : mode === 'tablet' ? 360 : 230;
  const height = mode === 'desktop' ? 390 : 470;
  return (
    <div style={{ width, height, borderRadius: 24, background: dark ? '#15181d' : 'var(--grey50)', color: dark ? 'var(--grey100)' : 'var(--text-strong)', border: `1px solid ${dark ? '#303741' : 'var(--border)'}`, padding: 16, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: mode === 'desktop' ? '180px 1fr' : '1fr', gap: 14 }}>
        <div style={{ padding: 14, borderRadius: 18, background: dark ? '#1f242b' : 'var(--bg)', border: `1px solid ${dark ? '#303741' : 'var(--border)'}` }}>
          <div style={{ width: 58, height: 58, borderRadius: 22, background: dark ? '#303741' : 'var(--grey100)', marginBottom: 12 }}/>
          <div style={{ fontSize: 18, fontWeight: 700 }}>김정민</div>
          <div style={{ fontSize: 12, opacity: .68, marginTop: 4 }}>서울 · 축구 · MF</div>
          <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Badge tone="blue" size="sm">검증됨</Badge>
            <Badge tone="orange" size="sm">추정치</Badge>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {['사진 업로드 오류', '공개 범위 설정', '리뷰와 뱃지', '저장 CTA'].map((item, i) => (
            <div key={item} style={{ padding: 11, borderRadius: 14, background: dark ? '#1f242b' : 'var(--bg)', border: `1px solid ${dark ? '#303741' : 'var(--border)'}`, fontSize: 12, fontWeight: 700 }}>
              <span className="tab-num" style={{ color: i === 0 ? 'var(--red500)' : i === 1 ? 'var(--blue500)' : 'inherit' }}>{String(i + 1).padStart(2, '0')}</span> {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const MyProfileResponsiveBoard = () => (
  <div style={{ width: 1280, height: 820, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">RESPONSIVE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>마이 · Mobile/Tablet/Desktop 재배치</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>모바일은 프로필 편집 흐름, 태블릿은 공개 미리보기, 데스크탑은 좌측 계정 레일과 우측 신뢰 패널로 확장합니다.</div>
    <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', marginTop: 26 }}>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Mobile 375</div><Wave21CMiniProfileLayout mode="mobile"/></div>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Tablet 768</div><Wave21CMiniProfileLayout mode="tablet"/></div>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Desktop 1280</div><Wave21CMiniProfileLayout mode="desktop"/></div>
    </div>
    <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {[
        ['Mobile', '사진 picker sheet, 개인정보 토글, sticky 저장 CTA'],
        ['Tablet', '편집 form과 공개 미리보기 2열'],
        ['Desktop', '좌측 계정 메뉴, 중앙 편집, 우측 신뢰 라벨 설명'],
      ].map(([title, sub]) => <Card key={title} pad={16}><div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div><div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{sub}</div></Card>)}
    </div>
  </div>
);

const MyProfileDarkModeBoard = () => (
  <div style={{ width: 920, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">DARK MODE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>마이 · Light/Dark 비교</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>사진 오류, 비공개, 신뢰 라벨이 dark mode에서도 장식 없이 명확해야 합니다.</div>
    <div style={{ display: 'flex', gap: 18, marginTop: 28 }}>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Light</div><Wave21CMiniProfileLayout mode="tablet"/></div>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Dark</div><Wave21CMiniProfileLayout mode="tablet" dark/></div>
    </div>
    <div style={{ marginTop: 22, padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>마이 dark 검수 포인트</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
        {['사진 오류', '비공개 배지', '추정치 라벨', '저장 CTA'].map((item) => <Badge key={item} tone="grey">{item}</Badge>)}
      </div>
    </div>
  </div>
);

const Wave21CPaymentCases = [
  { id: 'pending', chip: '보류', tone: 'orange', title: '결제 승인을 기다려요', sub: '주문은 생성됐지만 결제사 승인이 끝나지 않았습니다. 참가 확정으로 보이면 안 됩니다.', cta: '상태 새로고침' },
  { id: 'failed', chip: '실패', tone: 'red', title: '결제를 완료하지 못했어요', sub: '카드 거절, 네트워크 중단, 한도 초과를 각각 복구 CTA로 연결합니다.', cta: '다른 수단으로 결제' },
  { id: 'partial', chip: '부분 환불', tone: 'orange', title: '일부 금액만 환불돼요', sub: '사용 수수료와 포인트 차감을 MoneyRow로 분리해 설명합니다.', cta: '환불 내역 확인' },
  { id: 'rejected', chip: '거절', tone: 'red', title: '환불 요청이 거절됐어요', sub: '처리 주체, 사유, 문의 CTA를 함께 남겨 분쟁으로 이어갈 수 있어야 합니다.', cta: '분쟁 접수' },
  { id: 'permission', chip: '권한', tone: 'grey', title: '본인 결제만 볼 수 있어요', sub: '주문 소유자가 아니면 금액과 영수증 링크를 노출하지 않습니다.', cta: '내 결제 내역으로' },
];

const PaymentsStateEdgeBoard = () => {
  const [active, setActive] = React.useState('pending');
  const current = Wave21CPaymentCases.find((item) => item.id === active) || Wave21CPaymentCases[0];
  return (
    <Phone>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--grey50)' }}>
        <Wave21CPhoneHeader badge="PAYMENT STATES" title="결제·환불 상태" sub="보류, 실패, 부분 환불, 거절, 권한 제한을 거래 화면으로 명확히 분리합니다."/>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 20px 0' }}>
          {Wave21CPaymentCases.map((item) => <HapticChip key={item.id} active={active === item.id} onClick={() => setActive(item.id)}>{item.chip}</HapticChip>)}
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          <Card pad={20}>
            <Badge tone={current.tone}>{current.chip}</Badge>
            <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.25, marginTop: 16 }}>{current.title}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8 }}>{current.sub}</div>
            <div style={{ marginTop: 18, padding: 14, borderRadius: 14, background: Wave21CToneBg(current.tone), border: '1px solid var(--border)' }}>
              <MoneyRow label="주문 금액" amount={12000}/>
              <MoneyRow label={active === 'partial' ? '환불 예정' : active === 'failed' ? '결제 실패 금액' : '승인 대기 금액'} amount={active === 'partial' ? 8000 : 12000} accent/>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 18 }}>
              <Wave21CButton ghost>내역 보기</Wave21CButton>
              <Wave21CButton tone={current.tone === 'red' ? 'red' : 'blue'}>{current.cta}</Wave21CButton>
            </div>
          </Card>
          <Toast type={current.tone === 'red' ? 'error' : 'info'} msg="거래형 액션은 성공처럼 닫지 않고 상태 row를 남깁니다"/>
        </div>
        <BottomNav active="my"/>
      </div>
    </Phone>
  );
};

const PaymentsPendingFailedBoard = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <Wave21CPhoneHeader badge="PENDING FAILED" title="결제 보류와 실패" sub="결제 성공 후 서버 확정 지연, 카드 실패, 네트워크 실패를 독립 상태로 둡니다." tone="orange"/>
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        <Card pad={18}>
          <SectionTitle title="주문 TM-20260426-0912" sub="주말 축구 한 판 · 2026.05.03"/>
          <MoneyRow label="결제 예정 금액" amount={12000} strong accent/>
          <div style={{ height: 1, background: 'var(--grey100)', margin: '12px 0' }}/>
          {[
            ['카드 인증', '완료', 'green'],
            ['결제사 승인', '대기 중', 'orange'],
            ['Teameet 확정', '아직 아님', 'grey'],
          ].map(([title, state, tone]) => <Wave21CRow key={title} title={title} sub={state} tone={tone} meta={tone === 'green' ? '✓' : tone === 'orange' ? '…' : '-'}/>)}
        </Card>
        <Card pad={18} style={{ marginTop: 12 }}>
          <SectionTitle title="실패 복구" sub="원인별 다음 행동을 분리"/>
          <Wave21CRow title="카드 한도 초과" sub="다른 카드 또는 토스페이로 결제" tone="red" meta="!" right={<Badge tone="red" size="sm">재시도</Badge>}/>
          <Wave21CRow title="네트워크 실패" sub="주문은 10분간 보존됩니다" tone="orange" meta="↻" right={<Badge tone="orange" size="sm">대기</Badge>}/>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
            <Wave21CButton ghost>주문 취소</Wave21CButton>
            <Wave21CButton>결제 이어서</Wave21CButton>
          </div>
        </Card>
      </div>
    </div>
  </Phone>
);

const PaymentsRefundEdgeBoard = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--grey50)' }}>
      <Wave21CPhoneHeader badge="REFUND EDGE" title="부분 환불과 거절" sub="수수료, 포인트, 분쟁 접수까지 한 화면 안에서 추적 가능해야 합니다." tone="orange"/>
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        <Card pad={18}>
          <Badge tone="orange">부분 환불</Badge>
          <div style={{ marginTop: 12 }}>
            <MoneyRow label="결제 금액" amount={60000}/>
            <MoneyRow label="사용 수수료" amount={12000}/>
            <MoneyRow label="포인트 차감" amount={2000}/>
            <MoneyRow label="환불 예정 금액" amount={46000} strong accent/>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>레슨 1회 사용 후 환불이라 전액 환불로 보이면 안 됩니다.</div>
        </Card>
        <Card pad={18} style={{ marginTop: 12 }}>
          <Badge tone="red">환불 거절</Badge>
          <Wave21CRow title="거절 사유" sub="경기 시작 2시간 전 취소로 환불 불가 구간입니다." tone="red" meta="불가"/>
          <Wave21CRow title="처리 주체" sub="운영팀 · 2026.04.26 14:20 기록" tone="grey" meta="OPS"/>
          <Wave21CRow title="다음 행동" sub="증빙을 추가해 분쟁을 접수할 수 있습니다." tone="blue" meta="문의"/>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
            <Wave21CButton ghost>결제 상세</Wave21CButton>
            <Wave21CButton tone="red">분쟁 접수</Wave21CButton>
          </div>
        </Card>
      </div>
    </div>
  </Phone>
);

const PaymentsReceiptSettlementBoard = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <Wave21CPhoneHeader badge="RECEIPT" title="영수증과 정산 정보" sub="copy/download 성공과 실패, 테스트 결제 여부, 정산 보류를 같은 문법으로 정리합니다."/>
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        <Card pad={18}>
          <SectionTitle title="영수증" sub="TM-20260426-0912"/>
          <MoneyRow label="결제 금액" amount={12000} strong/>
          <MoneyRow label="결제 수단" amount="토스페이" unit=""/>
          <MoneyRow label="테스트 결제" amount="실청구 없음" unit=""/>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
            <Wave21CButton ghost>링크 복사</Wave21CButton>
            <Wave21CButton>PDF 저장</Wave21CButton>
          </div>
        </Card>
        <Card pad={18} style={{ marginTop: 12 }}>
          <SectionTitle title="정산 상태" sub="판매자/코치/시설 운영자가 보는 후속 상태"/>
          <Wave21CRow title="정산 예정" sub="2026.04.29 10:00 자동 정산" tone="blue" meta="D+3" right={<Badge tone="blue" size="sm">예정</Badge>}/>
          <Wave21CRow title="분쟁 보류" sub="증빙 확인 전까지 정산이 멈춥니다" tone="orange" meta="HOLD" right={<Badge tone="orange" size="sm">보류</Badge>}/>
          <Wave21CRow title="복사 실패" sub="브라우저 권한 없음 · 수동 복사 row 제공" tone="red" meta="!" right={<Badge tone="red" size="sm">실패</Badge>}/>
        </Card>
        <Toast type="info" msg="영수증 링크를 복사했어요"/>
      </div>
    </div>
  </Phone>
);

const PaymentsControlInteractionBoard = () => {
  const [step, setStep] = React.useState(2);
  return (
    <Phone>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--grey50)' }}>
        <Wave21CPhoneHeader badge="CONTROLS" title="결제·환불 컨트롤" sub="결제 CTA, 환불 사유 form progress, 영수증 copy/download 상태를 함께 정의합니다."/>
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          <Card pad={18}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
              {[1, 2, 3].map((item) => <button key={item} className="tm-pressable" onClick={() => setStep(item)} style={{ flex: 1, height: 6, borderRadius: 999, background: item <= step ? 'var(--blue500)' : 'var(--grey150)' }}/>)}
            </div>
            <SectionTitle title={`환불 요청 ${step}/3`} sub={step === 1 ? '사유 선택' : step === 2 ? '환불 금액 확인' : '접수 완료'}/>
            {[
              ['결제하기', 'default/pressed/loading/disabled', 'blue'],
              ['환불 요청', '사유 선택 전 disabled', 'red'],
              ['영수증 복사', 'success toast + 실패 row', 'blue'],
              ['PDF 다운로드', '권한 실패 시 수동 링크 제공', 'grey'],
            ].map(([title, sub, tone]) => <Wave21CRow key={title} title={title} sub={sub} tone={tone} meta="CTA"/>)}
            <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
              <Wave21CButton loading>결제 승인 중</Wave21CButton>
              <Wave21CButton disabled>사유 선택 전 환불 불가</Wave21CButton>
              <Wave21CButton ghost>영수증 복사</Wave21CButton>
            </div>
          </Card>
        </div>
      </div>
    </Phone>
  );
};

const PaymentsMotionContractBoard = () => (
  <div style={{ width: 840, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">MOTION CONTRACT</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>결제 · 환불 모션 규칙</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>돈이 움직이는 화면은 화려한 성공 연출보다 기록, 보류, 실패 상태가 우선입니다.</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 18, marginTop: 26 }}>
      <Card pad={18}>
        {[
          ['결제 submit', 'button loading 180ms', 'pending payment row', 'server 확정 후 success'],
          ['결제 실패', 'shake 금지', 'red status row', '수단 변경 CTA'],
          ['환불 진행', 'step progress', 'MoneyRow 재계산', '접수 번호 표시'],
          ['영수증 복사', 'toast 240ms', 'copy success row', '실패 시 수동 복사'],
        ].map(([trigger, motion, feedback, final]) => (
          <div key={trigger} style={{ display: 'grid', gridTemplateColumns: '105px 1fr 1fr 1fr', gap: 10, padding: '13px 0', borderBottom: '1px solid var(--grey100)', fontSize: 12 }}>
            <b>{trigger}</b><span>{motion}</span><span>{feedback}</span><span>{final}</span>
          </div>
        ))}
      </Card>
      <Card pad={18}>
        <SectionTitle title="Reduced motion" sub="확정 상태는 애니메이션 없이도 명확해야 합니다"/>
        {['check pulse는 정적 완료 배지로 대체', 'sheet는 inline panel로 대체', 'toast는 persistent receipt row 병행', '금액 변화는 tabular row만 갱신'].map((item) => (
          <Wave21CRow key={item} title={item} sub="prefers-reduced-motion 대응" tone="grey" meta="RM"/>
        ))}
      </Card>
    </div>
  </div>
);

const Wave21CMiniPaymentsLayout = ({ mode = 'mobile', dark }) => {
  const width = mode === 'desktop' ? 560 : mode === 'tablet' ? 360 : 230;
  const height = mode === 'desktop' ? 390 : 470;
  return (
    <div style={{ width, height, borderRadius: 24, background: dark ? '#15181d' : 'var(--grey50)', color: dark ? 'var(--grey100)' : 'var(--text-strong)', border: `1px solid ${dark ? '#303741' : 'var(--border)'}`, padding: 16, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: mode === 'desktop' ? '1fr 220px' : '1fr', gap: 12 }}>
        <div style={{ padding: 14, borderRadius: 18, background: dark ? '#1f242b' : 'var(--bg)', border: `1px solid ${dark ? '#303741' : 'var(--border)'}` }}>
          <div style={{ fontSize: 12, opacity: .68 }}>결제 예정 금액</div>
          <div className="tab-num" style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>12,000원</div>
          <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Badge tone="orange" size="sm">보류</Badge>
            <Badge tone="red" size="sm">실패</Badge>
            <Badge tone="blue" size="sm">영수증</Badge>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {['pending row', 'failed retry', 'partial refund', 'receipt copy'].map((item, i) => (
            <div key={item} style={{ padding: 11, borderRadius: 14, background: dark ? '#1f242b' : 'var(--bg)', border: `1px solid ${dark ? '#303741' : 'var(--border)'}`, fontSize: 12, fontWeight: 700 }}>
              <span className="tab-num" style={{ color: i === 1 ? 'var(--red500)' : i === 2 ? 'var(--orange500)' : 'var(--blue500)' }}>{String(i + 1).padStart(2, '0')}</span> {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const PaymentsResponsiveBoard = () => (
  <div style={{ width: 1280, height: 820, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">RESPONSIVE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>결제 · Mobile/Tablet/Desktop 재배치</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>모바일은 결제 단계, 태블릿은 금액/상태 2열, 데스크탑은 내역 테이블과 우측 영수증 레일로 확장합니다.</div>
    <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', marginTop: 26 }}>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Mobile 375</div><Wave21CMiniPaymentsLayout mode="mobile"/></div>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Tablet 768</div><Wave21CMiniPaymentsLayout mode="tablet"/></div>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Desktop 1280</div><Wave21CMiniPaymentsLayout mode="desktop"/></div>
    </div>
    <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {[
        ['Mobile', '금액 요약, 결제 CTA, 실패/보류 row, 환불 step'],
        ['Tablet', '상태 상세와 영수증/정산 정보를 2열로 분리'],
        ['Desktop', '좌측 필터, 결제 내역 테이블, 우측 receipt rail'],
      ].map(([title, sub]) => <Card key={title} pad={16}><div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div><div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{sub}</div></Card>)}
    </div>
  </div>
);

const PaymentsDarkModeBoard = () => (
  <div style={{ width: 920, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">DARK MODE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>결제 · Light/Dark 비교</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>dark mode에서도 금액, 환불, 실패, 영수증 CTA가 장식 없이 읽혀야 합니다.</div>
    <div style={{ display: 'flex', gap: 18, marginTop: 28 }}>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Light</div><Wave21CMiniPaymentsLayout mode="tablet"/></div>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Dark</div><Wave21CMiniPaymentsLayout mode="tablet" dark/></div>
    </div>
    <div style={{ marginTop: 22, padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>결제 dark 검수 포인트</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
        {['금액 대비', '실패 red', '보류 orange', '영수증 CTA'].map((item) => <Badge key={item} tone="grey">{item}</Badge>)}
      </div>
    </div>
  </div>
);

Object.assign(window, {
  MyProfileStateEdgeBoard,
  MyProfileUploadErrorBoard,
  MyProfilePrivacyTrustBoard,
  MyProfileBadgeReviewBoard,
  MyProfileControlInteractionBoard,
  MyProfileMotionContractBoard,
  MyProfileResponsiveBoard,
  MyProfileDarkModeBoard,
  PaymentsStateEdgeBoard,
  PaymentsPendingFailedBoard,
  PaymentsRefundEdgeBoard,
  PaymentsReceiptSettlementBoard,
  PaymentsControlInteractionBoard,
  PaymentsMotionContractBoard,
  PaymentsResponsiveBoard,
  PaymentsDarkModeBoard,
});
