const Wave21BBlue = 'var(--blue500)';
const Wave21BText = 'var(--grey900)';
const Wave21BMuted = 'var(--grey600)';
const Wave21BLine = 'var(--grey200)';
const Wave21BSoft = '#f8fafc';
const Wave21BDark = '#101316';
const Wave21BDarkPanel = '#171b21';
const Wave21BDarkLine = '#2b323a';

const Wave21BTone = {
  blue: { fg: Wave21BBlue, bg: '#eff6ff', border: '#d6e8ff' },
  green: { fg: '#0f9f6e', bg: '#ecfdf5', border: '#cdeee1' },
  amber: { fg: '#b76e00', bg: 'var(--static-white)7e6', border: '#ffe1a6' },
  red: { fg: '#e03131', bg: 'var(--static-white)1f1', border: '#ffd8d8' },
  gray: { fg: Wave21BMuted, bg: 'var(--grey100)', border: 'var(--grey200)' },
  dark: { fg: 'var(--grey300)', bg: '#20252c', border: Wave21BDarkLine },
};

function Wave21BToneOf(tone) {
  return Wave21BTone[tone] || Wave21BTone.gray;
}

function Wave21BFrame({ title, subtitle, children, nav = 'home', dark = false, footer }) {
  const fg = dark ? 'var(--grey100)' : Wave21BText;
  const muted = dark ? '#9aa3ad' : Wave21BMuted;
  const bg = dark ? Wave21BDark : 'var(--static-white)';
  return (
    <Phone>
      <div style={{ minHeight: '100%', background: bg, color: fg, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '24px 20px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: dark ? 'var(--grey300)' : Wave21BBlue }}>Teameet</div>
            <Badge tone={dark ? 'gray' : 'blue'}>{dark ? 'Dark' : 'Ready'}</Badge>
          </div>
          <div style={{ fontSize: 24, lineHeight: 1.25, fontWeight: 700, letterSpacing: 0 }}>{title}</div>
          <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.5, color: muted }}>{subtitle}</div>
        </div>
        <div style={{ flex: 1, padding: '0 16px 92px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {children}
        </div>
        {footer}
        <BottomNav active={nav} />
      </div>
    </Phone>
  );
}

function Wave21BCard({ children, dark = false, style }) {
  return (
    <Card
      style={{
        borderRadius: 16,
        border: `1px solid ${dark ? Wave21BDarkLine : Wave21BLine}`,
        background: dark ? Wave21BDarkPanel : 'var(--static-white)',
        boxShadow: 'none',
        ...style,
      }}
    >
      {children}
    </Card>
  );
}

function Wave21BStateRow({ label, value, tone = 'gray', helper, disabled = false, dark = false }) {
  const color = Wave21BToneOf(tone);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        minHeight: 56,
        padding: '12px 0',
        borderBottom: `1px solid ${dark ? Wave21BDarkLine : Wave21BLine}`,
        opacity: disabled ? 0.46 : 1,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: dark ? 'var(--grey100)' : Wave21BText }}>{label}</div>
        {helper ? <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.45, color: dark ? '#9aa3ad' : Wave21BMuted }}>{helper}</div> : null}
      </div>
      <div
        style={{
          flex: '0 0 auto',
          borderRadius: 999,
          padding: '6px 10px',
          fontSize: 12,
          fontWeight: 700,
          color: dark ? 'var(--grey100)' : color.fg,
          background: dark ? '#20252c' : color.bg,
          border: `1px solid ${dark ? Wave21BDarkLine : color.border}`,
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Wave21BMetricGrid({ items, dark = false }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            padding: 14,
            borderRadius: 14,
            background: dark ? '#20252c' : Wave21BSoft,
            border: `1px solid ${dark ? Wave21BDarkLine : '#edf0f3'}`,
            minWidth: 0,
          }}
        >
          <div style={{ fontSize: 12, color: dark ? '#9aa3ad' : Wave21BMuted }}>{item.label}</div>
          <div style={{ marginTop: 6, fontSize: 19, fontWeight: 700, color: dark ? 'var(--grey100)' : Wave21BText, fontVariantNumeric: 'tabular-nums' }}>
            {item.value}
          </div>
          {item.helper ? <div style={{ marginTop: 4, fontSize: 11, color: dark ? 'var(--grey500)' : 'var(--grey500)' }}>{item.helper}</div> : null}
        </div>
      ))}
    </div>
  );
}

function Wave21BStepper({ current, total, dark = false }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {Array.from({ length: total }).map((_, index) => (
        <div
          key={index}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 999,
            background: index < current ? Wave21BBlue : dark ? '#303843' : 'var(--grey200)',
          }}
        />
      ))}
    </div>
  );
}

function Wave21BActionButton({ children, disabled = false, secondary = false, dark = false }) {
  const bg = disabled ? (dark ? '#252b33' : 'var(--grey100)') : secondary ? (dark ? '#20252c' : 'var(--grey100)') : Wave21BBlue;
  const color = disabled ? (dark ? '#6f7a86' : 'var(--grey400)') : secondary ? (dark ? 'var(--grey100)' : Wave21BText) : 'var(--static-white)';
  return (
    <button className="tm-pressable tm-break-keep"
      type="button"
      disabled={disabled}
      style={{
        minHeight: 48,
        border: `1px solid ${secondary ? (dark ? Wave21BDarkLine : 'var(--grey200)') : 'transparent'}`,
        borderRadius: 14,
        background: bg,
        color,
        fontSize: 15,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transform: 'translateZ(0)',
        transition: 'transform 140ms ease, background 160ms ease, opacity 160ms ease',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

function Wave21BInfoPill({ icon, label, value, tone = 'gray', dark = false }) {
  const color = Wave21BToneOf(tone);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 42,
        borderRadius: 13,
        padding: '8px 10px',
        background: dark ? '#20252c' : color.bg,
        border: `1px solid ${dark ? Wave21BDarkLine : color.border}`,
        color: dark ? 'var(--grey100)' : color.fg,
        minWidth: 0,
      }}
    >
      <Icon name={icon} size={16} />
      <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ marginLeft: 'auto', fontSize: 12, color: dark ? 'var(--grey300)' : Wave21BText, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}

function Wave21BMotionSurface({ title, subtitle, items, dark = false }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: 32,
        background: dark ? Wave21BDark : 'var(--static-white)',
        color: dark ? 'var(--grey100)' : Wave21BText,
        display: 'grid',
        gridTemplateColumns: '0.95fr 1.05fr',
        gap: 22,
        alignItems: 'stretch',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <Badge tone="blue">Motion contract</Badge>
          <h2 style={{ margin: '18px 0 10px', fontSize: 34, lineHeight: 1.18, letterSpacing: 0 }}>{title}</h2>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: dark ? '#9aa3ad' : Wave21BMuted }}>{subtitle}</p>
        </div>
        <div style={{ borderRadius: 18, padding: 18, background: dark ? Wave21BDarkPanel : Wave21BSoft, border: `1px solid ${dark ? Wave21BDarkLine : Wave21BLine}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Reduced motion</div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: dark ? '#9aa3ad' : Wave21BMuted }}>
            모든 움직임은 opacity 전환과 즉시 상태 문구로 대체된다. CTA 결과, 실패, 권한 상태는 모션 없이도 동일하게 이해된다.
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 10, alignContent: 'center' }}>
        {items.map((item, index) => (
          <div
            key={item.title}
            style={{
              display: 'grid',
              gridTemplateColumns: '44px 1fr auto',
              alignItems: 'center',
              gap: 12,
              padding: 14,
              borderRadius: 16,
              background: dark ? Wave21BDarkPanel : 'var(--static-white)',
              border: `1px solid ${dark ? Wave21BDarkLine : Wave21BLine}`,
              boxShadow: 'none',
            }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 14, display: 'grid', placeItems: 'center', background: index === 0 ? Wave21BBlue : dark ? '#20252c' : '#eff6ff', color: index === 0 ? 'var(--static-white)' : Wave21BBlue }}>
              <Icon name={item.icon} size={19} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{item.title}</div>
              <div style={{ marginTop: 4, fontSize: 12, color: dark ? '#9aa3ad' : Wave21BMuted }}>{item.copy}</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: dark ? 'var(--grey300)' : Wave21BMuted, whiteSpace: 'nowrap' }}>{item.timing}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Wave21BDevice({ label, width, children, dark = false }) {
  return (
    <div
      style={{
        width,
        minHeight: 620,
        borderRadius: 24,
        border: `1px solid ${dark ? Wave21BDarkLine : Wave21BLine}`,
        background: dark ? Wave21BDark : 'var(--static-white)',
        overflow: 'hidden',
        boxShadow: 'none',
      }}
    >
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${dark ? Wave21BDarkLine : Wave21BLine}`, fontSize: 12, fontWeight: 700, color: dark ? '#9aa3ad' : Wave21BMuted }}>
        {label}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

const Wave21BSportsChips = ['축구', '테니스', '농구', '아이스하키'];
const Wave21BCommunityChips = ['전체', '팀 채팅', '알림', '차단'];

function SportsCapabilityStateBoard() {
  return (
    <Wave21BFrame title="종목별 가능 범위" subtitle="레벨, 장비, 안전 체크가 충족될 때만 신청 CTA가 활성화됩니다." nav="profile">
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
        {Wave21BSportsChips.map((chip, index) => (
          <HapticChip key={chip} active={index === 0}>{chip}</HapticChip>
        ))}
      </div>
      <Wave21BCard>
        <SectionTitle eyebrow="Capability" title="오늘 신청 가능한 활동" />
        <Wave21BStateRow label="축구 6:6 매치" value="가능" tone="green" helper="레벨 B · 포지션 MF · 안전 동의 완료" />
        <Wave21BStateRow label="테니스 복식" value="확인 필요" tone="amber" helper="NTRP 인증 만료 3일 전" />
        <Wave21BStateRow label="아이스하키" value="비활성" tone="gray" helper="헬멧/보호대 등록 전까지 신청 제한" disabled />
        <Wave21BStateRow label="피겨 연습권" value="가능" tone="blue" helper="스케이트 경력 공개 범위: 코치에게만" />
      </Wave21BCard>
      <Wave21BCard style={{ background: Wave21BSoft }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="shield" size={20} color={Wave21BBlue} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>신청 전 자동 검증</div>
            <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.5, color: Wave21BMuted }}>종목별 요구 정보가 누락되면 이유와 다음 행동을 함께 보여줍니다.</div>
          </div>
        </div>
      </Wave21BCard>
      <Wave21BActionButton>가능한 활동만 보기</Wave21BActionButton>
    </Wave21BFrame>
  );
}

function SportsVerificationRejectedBoard() {
  return (
    <Wave21BFrame title="인증 반려 상태" subtitle="반려 사유, 재제출 항목, 심사 ETA를 한 화면에서 복구합니다." nav="profile">
      <Wave21BCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <Badge tone="red">반려</Badge>
            <div style={{ marginTop: 10, fontSize: 20, fontWeight: 700 }}>테니스 NTRP 인증</div>
            <div style={{ marginTop: 6, fontSize: 13, color: Wave21BMuted }}>사진의 이름과 프로필 이름이 일치하지 않습니다.</div>
          </div>
          <div style={{ width: 54, height: 54, borderRadius: 18, background: 'var(--static-white)1f1', color: '#e03131', display: 'grid', placeItems: 'center' }}>
            <Icon name="alert" size={24} />
          </div>
        </div>
      </Wave21BCard>
      <Wave21BCard>
        <SectionTitle eyebrow="Recovery" title="다시 제출할 항목" />
        <ListItem title="신분 확인 이미지" subtitle="이름과 생년월일이 보이게 촬영" trailing="필수" />
        <ListItem title="최근 경기 기록" subtitle="선택 항목 · 레벨 산정 정확도 향상" trailing="선택" />
        <ListItem title="공개 범위 확인" subtitle="팀장과 코치에게만 노출" trailing="확인" />
      </Wave21BCard>
      <Wave21BCard style={{ background: 'var(--static-white)7e6', borderColor: '#ffe1a6' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#b76e00' }}>심사 중 제한</div>
        <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5, color: '#8a5a00' }}>레벨 제한이 있는 대회와 상급 레슨 신청은 재승인 전까지 비활성화됩니다.</div>
      </Wave21BCard>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Wave21BActionButton secondary>문의하기</Wave21BActionButton>
        <Wave21BActionButton>재제출</Wave21BActionButton>
      </div>
    </Wave21BFrame>
  );
}

function SportsEquipmentSafetyBoard() {
  return (
    <Wave21BFrame title="장비·안전 체크" subtitle="필수 장비가 빠진 종목은 이유가 보이는 disabled CTA로 처리합니다." nav="profile">
      <Wave21BCard>
        <SectionTitle eyebrow="Ice hockey" title="필수 장비" />
        <Wave21BStateRow label="헬멧" value="등록됨" tone="green" helper="2026.04.18 확인" />
        <Wave21BStateRow label="목 보호대" value="미등록" tone="red" helper="필수 장비라 신청을 막습니다." />
        <Wave21BStateRow label="스케이트" value="대여 가능" tone="blue" helper="시설 대여 재고 2개" />
      </Wave21BCard>
      <Wave21BCard>
        <SectionTitle eyebrow="CTA states" title="장비 누락 시 버튼 상태" />
        <div style={{ display: 'grid', gap: 8 }}>
          <Wave21BActionButton disabled>목 보호대 등록 후 신청 가능</Wave21BActionButton>
          <Wave21BActionButton secondary>장비 등록하기</Wave21BActionButton>
        </div>
      </Wave21BCard>
      <Toast type="info" msg="안전 정보가 부족해요. 필수 장비를 등록하면 신청할 수 있어요." />
    </Wave21BFrame>
  );
}

function SportsPrivacyDisplayBoard() {
  return (
    <Wave21BFrame title="스포츠 프로필 공개" subtitle="종목별 민감 정보는 표시 대상과 마스킹 수준을 분리합니다." nav="profile">
      <Wave21BCard>
        <SectionTitle eyebrow="Privacy" title="상대에게 보이는 정보" />
        <Wave21BInfoPill icon="user" label="이름" value="김서준" tone="blue" />
        <Wave21BInfoPill icon="activity" label="레벨" value="축구 B" tone="green" />
        <Wave21BInfoPill icon="eye" label="키/체중" value="비공개" tone="gray" />
        <Wave21BInfoPill icon="shield" label="안전서약" value="완료" tone="green" />
      </Wave21BCard>
      <Wave21BCard>
        <SectionTitle eyebrow="Audience" title="대상별 표시" />
        <ListItem title="참가자" subtitle="닉네임, 레벨, 포지션만 표시" trailing="기본" />
        <ListItem title="팀장/코치" subtitle="인증 상태와 경력 요약까지 표시" trailing="확장" />
        <ListItem title="공개 프로필" subtitle="민감 정보 마스킹" trailing="보호" />
      </Wave21BCard>
      <Wave21BActionButton>공개 범위 저장</Wave21BActionButton>
    </Wave21BFrame>
  );
}

function SportsControlInteractionBoard() {
  return (
    <Wave21BFrame title="종목 필터 컨트롤" subtitle="칩 선택, 인증 상태, 신청 버튼의 상호작용을 한 흐름으로 묶습니다." nav="profile">
      <Wave21BCard>
        <SectionTitle eyebrow="Filter" title="활동 조건" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {['가능만', '내 레벨', '장비 완료', '인증 필요', '비공개'].map((chip, index) => (
            <HapticChip key={chip} active={index < 3}>{chip}</HapticChip>
          ))}
        </div>
      </Wave21BCard>
      <Wave21BCard>
        <SectionTitle eyebrow="Progress" title="신청 준비도" />
        <Wave21BStepper current={3} total={4} />
        <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.55, color: Wave21BMuted }}>레벨, 포지션, 안전 체크 완료. 장비 확인만 남았습니다.</div>
      </Wave21BCard>
      <Wave21BMetricGrid
        items={[
          { label: '터치 피드백', value: '0.96x', helper: 'tap scale' },
          { label: '필터 반영', value: '즉시', helper: 'optimistic' },
          { label: '오류 복구', value: 'sheet', helper: 'reason first' },
          { label: '저장 상태', value: 'toast', helper: '1.8초' },
        ]}
      />
      <Wave21BActionButton>조건 적용</Wave21BActionButton>
    </Wave21BFrame>
  );
}

function SportsMotionContractBoard() {
  return (
    <Wave21BMotionSurface
      title="스포츠 검증 모션"
      subtitle="레벨/장비/안전 검증은 빠른 피드백이 핵심입니다. 버튼은 짧게 눌리고, 실패는 sheet로 내려와 이유를 먼저 보여줍니다."
      items={[
        { icon: 'check', title: '인증 통과', copy: '상태 pill이 성공 색으로 전환되고 CTA가 활성화됩니다.', timing: '160ms' },
        { icon: 'alert', title: '인증 반려', copy: '반려 사유 카드가 위에서 8px 이동하며 등장합니다.', timing: '220ms' },
        { icon: 'shield', title: '장비 누락', copy: '비활성 CTA 아래에 필요한 장비가 고정 문구로 남습니다.', timing: '0ms' },
        { icon: 'refresh', title: '재심사 제출', copy: 'toast와 pending chip이 동시에 업데이트됩니다.', timing: '180ms' },
      ]}
    />
  );
}

function SportsMiniContent({ mode = 'mobile', dark = false }) {
  return (
    <div style={{ display: 'grid', gap: mode === 'desktop' ? 14 : 10 }}>
      <SectionTitle eyebrow="Sports profile" title={mode === 'desktop' ? '레벨과 안전 상태를 함께 판단' : '신청 준비'} />
      <Wave21BMetricGrid
        dark={dark}
        items={[
          { label: '인증', value: '3/4' },
          { label: '장비', value: '1개 누락' },
          { label: '공개', value: '제한' },
          { label: '안전', value: '완료' },
        ]}
      />
      <Wave21BCard dark={dark}>
        <Wave21BStateRow dark={dark} label="아이스하키 목 보호대" value="필수" tone="red" helper="신청 전 등록 필요" />
        <Wave21BStateRow dark={dark} label="테니스 NTRP" value="심사중" tone="amber" helper="평균 6시간 소요" />
      </Wave21BCard>
      <Wave21BActionButton disabled={mode !== 'desktop'} dark={dark}>{mode === 'desktop' ? '신청 가능한 종목 보기' : '필수 항목 완료 후 신청'}</Wave21BActionButton>
    </div>
  );
}

function SportsResponsiveBoard() {
  return (
    <div style={{ width: '100%', height: '100%', padding: 30, background: '#f6f8fb', display: 'flex', gap: 18, alignItems: 'center', justifyContent: 'center' }}>
      <Wave21BDevice label="Mobile 375 · 단계형 검증" width={310}>
        <SportsMiniContent />
      </Wave21BDevice>
      <Wave21BDevice label="Tablet 768 · 요약 + 세부" width={390}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <SportsMiniContent mode="tablet" />
          <Wave21BCard>
            <SectionTitle eyebrow="Detail" title="공개 범위" />
            <ListItem title="참가자" subtitle="레벨/포지션" trailing="공개" />
            <ListItem title="코치" subtitle="인증 상태" trailing="공개" />
            <ListItem title="공개 프로필" subtitle="개인정보 마스킹" trailing="제한" />
          </Wave21BCard>
        </div>
      </Wave21BDevice>
      <Wave21BDevice label="Desktop 1200 · 좌측 검증 / 우측 결과" width={450}>
        <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: 14 }}>
          <Wave21BCard style={{ background: Wave21BSoft }}>
            <SectionTitle eyebrow="Filter" title="종목" />
            {Wave21BSportsChips.map((chip, index) => <HapticChip key={chip} active={index === 0}>{chip}</HapticChip>)}
          </Wave21BCard>
          <SportsMiniContent mode="desktop" />
        </div>
      </Wave21BDevice>
    </div>
  );
}

function SportsDarkModeBoard() {
  return (
    <div style={{ width: '100%', height: '100%', padding: 28, background: 'var(--grey100)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22, alignItems: 'center', justifyItems: 'center' }}>
      <Wave21BFrame title="스포츠 프로필" subtitle="밝은 모드에서는 흰 배경과 최소 구분선으로 상태를 보여줍니다." nav="profile">
        <SportsMiniContent />
      </Wave21BFrame>
      <Wave21BFrame title="스포츠 프로필" subtitle="다크 모드는 본문 대비와 상태 색을 낮춰 야간 사용성을 유지합니다." nav="profile" dark>
        <SportsMiniContent dark />
      </Wave21BFrame>
    </div>
  );
}

function CommunityStateEdgeBoard() {
  return (
    <Wave21BFrame title="커뮤니티 상태" subtitle="채팅, 알림, 차단, 오프라인 상태를 한 언어로 정리합니다." nav="chat">
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
        {Wave21BCommunityChips.map((chip, index) => <HapticChip key={chip} active={index === 0}>{chip}</HapticChip>)}
      </div>
      <Wave21BCard>
        <SectionTitle eyebrow="Inbox" title="오늘의 메시지" />
        <ListItem title="FC 성수 토요 매치" subtitle="오후 7:30 · 새 메시지 3개" trailing="읽기" />
        <ListItem title="테니스 복식 파트너" subtitle="상대가 참가비를 확인 중입니다" trailing="대기" />
        <ListItem title="시스템 알림" subtitle="네트워크가 복구되면 자동 동기화" trailing="오프라인" />
      </Wave21BCard>
      <Wave21BMetricGrid
        items={[
          { label: '안읽음', value: '12' },
          { label: '실패', value: '1' },
          { label: '차단', value: '2' },
          { label: '동기화', value: '대기' },
        ]}
      />
    </Wave21BFrame>
  );
}

function CommunityMessageFailureBoard() {
  return (
    <Wave21BFrame title="메시지 전송 실패" subtitle="실패한 말풍선은 삭제하지 않고 재시도/복사/취소 경로를 제공합니다." nav="chat">
      <Wave21BCard>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ justifySelf: 'start', maxWidth: '78%', padding: '10px 12px', borderRadius: 16, background: Wave21BSoft, fontSize: 14 }}>오늘 경기장 B코트 맞나요?</div>
          <div style={{ justifySelf: 'end', maxWidth: '82%', padding: '10px 12px', borderRadius: 16, background: '#eff6ff', color: Wave21BText, fontSize: 14 }}>네, 20분 전에 도착할게요.</div>
          <div style={{ justifySelf: 'end', maxWidth: '82%', padding: '10px 12px', borderRadius: 16, background: 'var(--static-white)1f1', border: '1px solid #ffd8d8', color: Wave21BText }}>
            <div style={{ fontSize: 14 }}>입금 확인되면 알려주세요.</div>
            <div style={{ marginTop: 6, fontSize: 11, color: '#e03131' }}>전송 실패 · 네트워크 연결 없음</div>
          </div>
        </div>
      </Wave21BCard>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <Wave21BActionButton secondary>복사</Wave21BActionButton>
        <Wave21BActionButton secondary>취소</Wave21BActionButton>
        <Wave21BActionButton>재시도</Wave21BActionButton>
      </div>
      <Toast type="error" msg="메시지를 보내지 못했어요. 연결 후 다시 시도하세요." />
    </Wave21BFrame>
  );
}

function CommunityBlockedUserBoard() {
  return (
    <Wave21BFrame title="차단 사용자 처리" subtitle="차단 상태는 대화 입력, 프로필, 알림에 일관되게 반영됩니다." nav="chat">
      <Wave21BCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 52, height: 52, borderRadius: 18, background: 'var(--grey100)', display: 'grid', placeItems: 'center', color: Wave21BMuted }}>
            <Icon name="user" size={24} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>차단된 사용자</div>
            <div style={{ marginTop: 5, fontSize: 13, color: Wave21BMuted }}>메시지와 초대 알림을 받지 않습니다.</div>
          </div>
          <Badge tone="gray">차단</Badge>
        </div>
      </Wave21BCard>
      <Wave21BCard>
        <SectionTitle eyebrow="Disabled states" title="제한된 기능" />
        <Wave21BStateRow label="채팅 입력" value="비활성" tone="gray" helper="차단 해제 전까지 메시지를 보낼 수 없음" disabled />
        <Wave21BStateRow label="팀 초대" value="차단됨" tone="gray" helper="초대 CTA 숨김 대신 사유 표시" disabled />
        <Wave21BStateRow label="신고 기록" value="보관" tone="amber" helper="운영자 확인용으로만 유지" />
      </Wave21BCard>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Wave21BActionButton secondary>신고 내역</Wave21BActionButton>
        <Wave21BActionButton>차단 해제</Wave21BActionButton>
      </div>
    </Wave21BFrame>
  );
}

function CommunityNotificationRaceBoard() {
  return (
    <Wave21BFrame title="알림 읽음 경쟁" subtitle="읽음 처리와 딥링크 이동이 서로 덮어쓰지 않도록 상태를 분리합니다." nav="notifications">
      <Wave21BCard>
        <SectionTitle eyebrow="Race condition" title="탭 직후 처리 순서" />
        <Wave21BStateRow label="1. 로컬 읽음 표시" value="즉시" tone="blue" helper="카드는 바로 흐려지지만 위치는 유지" />
        <Wave21BStateRow label="2. 서버 mutation" value="pending" tone="amber" helper="실패 시 다시 안읽음으로 복구" />
        <Wave21BStateRow label="3. 딥링크 이동" value="보장" tone="green" helper="mutation 완료를 기다리지 않음" />
      </Wave21BCard>
      <Wave21BCard style={{ background: Wave21BSoft }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>매치 초대 알림</div>
        <div style={{ marginTop: 6, fontSize: 13, color: Wave21BMuted }}>읽음 처리 중에도 `/matches/812`로 이동합니다.</div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <Badge tone="blue">deeplink</Badge>
          <Badge tone="gray">read pending</Badge>
        </div>
      </Wave21BCard>
      <Wave21BActionButton>알림 열기</Wave21BActionButton>
    </Wave21BFrame>
  );
}

function CommunityControlInteractionBoard() {
  return (
    <Wave21BFrame title="채팅·알림 컨트롤" subtitle="입력, 필터, 읽음, 차단 컨트롤의 상태 피드백을 통일합니다." nav="chat">
      <Wave21BCard>
        <SectionTitle eyebrow="Controls" title="메시지 입력 상태" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {['읽지 않음', '멘션', '시스템', '실패', '차단'].map((chip, index) => <HapticChip key={chip} active={index < 2}>{chip}</HapticChip>)}
        </div>
      </Wave21BCard>
      <Wave21BCard>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 48px', gap: 8, alignItems: 'center' }}>
          <div style={{ minHeight: 48, borderRadius: 14, border: `1px solid ${Wave21BLine}`, padding: '14px 12px', color: Wave21BMuted, fontSize: 14 }}>메시지를 입력하세요</div>
          <button className="tm-pressable tm-break-keep" type="button" style={{ width: 48, height: 48, borderRadius: 14, border: 0, background: Wave21BBlue, color: 'var(--static-white)', display: 'grid', placeItems: 'center' }}>
            <Icon name="send" size={18} />
          </button>
        </div>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Wave21BActionButton secondary>모두 읽음</Wave21BActionButton>
          <Wave21BActionButton>필터 적용</Wave21BActionButton>
        </div>
      </Wave21BCard>
      <Wave21BMetricGrid
        items={[
          { label: 'tap scale', value: '0.96x' },
          { label: 'send lock', value: '600ms' },
          { label: 'toast', value: '1.8s' },
          { label: 'retry', value: 'inline' },
        ]}
      />
    </Wave21BFrame>
  );
}

function CommunityMotionContractBoard() {
  return (
    <Wave21BMotionSurface
      title="커뮤니티 모션"
      subtitle="채팅과 알림은 빠른 신뢰가 중요합니다. 전송 실패는 말풍선 내부에서 유지하고, 알림 이동은 재정렬보다 먼저 보장합니다."
      items={[
        { icon: 'send', title: '전송 중', copy: '말풍선 opacity 70%와 pending 점 3개로 표현합니다.', timing: '120ms' },
        { icon: 'alert', title: '전송 실패', copy: '위치를 유지한 채 실패 reason과 재시도 버튼을 표시합니다.', timing: '180ms' },
        { icon: 'bell', title: '알림 읽음', copy: '카드 재정렬 없이 local read 상태만 먼저 반영합니다.', timing: '0ms' },
        { icon: 'user-x', title: '차단 적용', copy: '입력창 비활성화와 안내 toast가 동시에 등장합니다.', timing: '160ms' },
      ]}
    />
  );
}

function CommunityMiniContent({ mode = 'mobile', dark = false }) {
  return (
    <div style={{ display: 'grid', gap: mode === 'desktop' ? 14 : 10 }}>
      <SectionTitle eyebrow="Community" title={mode === 'desktop' ? '채팅과 알림을 동시에 관리' : '메시지 상태'} />
      <Wave21BCard dark={dark}>
        <Wave21BStateRow dark={dark} label="팀 채팅" value="3" tone="blue" helper="새 메시지" />
        <Wave21BStateRow dark={dark} label="실패한 메시지" value="1" tone="red" helper="재시도 가능" />
        <Wave21BStateRow dark={dark} label="차단 사용자" value="2" tone="gray" helper="알림 제한" />
      </Wave21BCard>
      <Wave21BMetricGrid
        dark={dark}
        items={[
          { label: '읽음 처리', value: '즉시' },
          { label: '딥링크', value: '보장' },
          { label: '오프라인', value: '대기' },
          { label: '재시도', value: 'inline' },
        ]}
      />
      <Wave21BActionButton dark={dark}>{mode === 'desktop' ? '운영 알림 확인' : '채팅 열기'}</Wave21BActionButton>
    </div>
  );
}

function CommunityResponsiveBoard() {
  return (
    <div style={{ width: '100%', height: '100%', padding: 30, background: '#f6f8fb', display: 'flex', gap: 18, alignItems: 'center', justifyContent: 'center' }}>
      <Wave21BDevice label="Mobile 375 · 단일 대화 중심" width={310}>
        <CommunityMiniContent />
      </Wave21BDevice>
      <Wave21BDevice label="Tablet 768 · 대화 + 알림" width={390}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <CommunityMiniContent mode="tablet" />
          <Wave21BCard>
            <SectionTitle eyebrow="Notifications" title="오늘" />
            <ListItem title="매치 초대" subtitle="딥링크 보장" trailing="읽기" />
            <ListItem title="결제 확인" subtitle="시스템 메시지" trailing="완료" />
          </Wave21BCard>
        </div>
      </Wave21BDevice>
      <Wave21BDevice label="Desktop 1200 · 좌측 목록 / 우측 스레드" width={450}>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 14 }}>
          <Wave21BCard style={{ background: Wave21BSoft }}>
            <SectionTitle eyebrow="Filter" title="분류" />
            {Wave21BCommunityChips.map((chip, index) => <HapticChip key={chip} active={index === 1}>{chip}</HapticChip>)}
          </Wave21BCard>
          <CommunityMiniContent mode="desktop" />
        </div>
      </Wave21BDevice>
    </div>
  );
}

function CommunityDarkModeBoard() {
  return (
    <div style={{ width: '100%', height: '100%', padding: 28, background: 'var(--grey100)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22, alignItems: 'center', justifyItems: 'center' }}>
      <Wave21BFrame title="커뮤니티" subtitle="밝은 모드는 메시지 상태와 재시도 CTA를 리스트 중심으로 보여줍니다." nav="chat">
        <CommunityMiniContent />
      </Wave21BFrame>
      <Wave21BFrame title="커뮤니티" subtitle="다크 모드는 말풍선 대비와 상태 색을 낮춰 장시간 읽기를 지원합니다." nav="chat" dark>
        <CommunityMiniContent dark />
      </Wave21BFrame>
    </div>
  );
}

Object.assign(window, {
  SportsCapabilityStateBoard,
  SportsVerificationRejectedBoard,
  SportsEquipmentSafetyBoard,
  SportsPrivacyDisplayBoard,
  SportsControlInteractionBoard,
  SportsMotionContractBoard,
  SportsResponsiveBoard,
  SportsDarkModeBoard,
  CommunityStateEdgeBoard,
  CommunityMessageFailureBoard,
  CommunityBlockedUserBoard,
  CommunityNotificationRaceBoard,
  CommunityControlInteractionBoard,
  CommunityMotionContractBoard,
  CommunityResponsiveBoard,
  CommunityDarkModeBoard,
});
