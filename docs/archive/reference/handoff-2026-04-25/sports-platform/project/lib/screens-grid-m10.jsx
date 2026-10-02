/* fix32 — M10 장비 대여 (Rental) m-grid rewrite.
   Canonical references: EquipmentRental (screens-deep.jsx),
   RentalStateEdgeBoard / RentalPickupReturnBoard / RentalDepositDamageBoard /
   RentalInventoryConflictBoard / RentalControlInteractionBoard /
   RentalMotionContractBoard / RentalMiniLayout (screens-readiness-wave21a.jsx).
   Rules: 0 raw hex / 0 inline fontSize / var(--*) tokens / 4-multiple spacing / 44px touch. */

const M10_MB_W = 375;
const M10_MB_H = 812;
const M10_TB_W = 768;
const M10_TB_H = 1024;
const M10_DT_W = 1280;
const M10_DT_H = 820;

/* Rental category data — teal/purple via token vars */
const M10_CATEGORIES = [
  { id: 'all',      label: '전체',     color: 'var(--blue500)' },
  { id: 'soccer',   label: '축구화',   color: 'var(--blue500)' },
  { id: 'racket',   label: '라켓',     color: 'var(--teal500)' },
  { id: 'hockey',   label: '하키 풀세트', color: 'var(--grey700)' },
  { id: 'ball',     label: '공',       color: 'var(--green500)' },
  { id: 'protect',  label: '보호장비', color: 'var(--orange500)' },
];

/* Mock rental items — mirrors EquipmentRental fixture, no raw hex */
const M10_ITEMS = [
  {
    id: 'r1',
    category: '축구화',
    accentToken: 'var(--blue500)',
    accentBg: 'var(--blue50)',
    iconName: 'store',
    name: '어덜트 풋살화 + 정강이 보호대 세트',
    sub: '사이즈 260~280 · 강남역 A픽업지점',
    priceDay: 8000,
    deposit: 50000,
    status: 'available',
    rating: 4.9,
    reviews: 36,
  },
  {
    id: 'r2',
    category: '라켓',
    accentToken: 'var(--teal500)',
    accentBg: 'var(--blue50)',
    iconName: 'store',
    name: '성인 배드민턴 라켓 (2개 세트)',
    sub: '4U 3U · 서초 클럽',
    priceDay: 6000,
    deposit: 20000,
    status: 'available',
    rating: 4.7,
    reviews: 21,
  },
  {
    id: 'r3',
    category: '하키 풀세트',
    accentToken: 'var(--grey700)',
    accentBg: 'var(--grey100)',
    iconName: 'shield',
    name: '아이스하키 풀세트 (헬멧·패드·스틱)',
    sub: '사이즈 L · 목동 아이스링크',
    priceDay: 35000,
    deposit: 200000,
    status: 'rented',
    rating: 4.8,
    reviews: 14,
  },
  {
    id: 'r4',
    category: '공',
    accentToken: 'var(--green500)',
    accentBg: 'var(--green50)',
    iconName: 'store',
    name: '몰텐 농구공 + 펌프',
    sub: 'GG7 · 강남 농구장',
    priceDay: 3000,
    deposit: 10000,
    status: 'available',
    rating: 4.6,
    reviews: 28,
  },
];

/* M10RentalItemCard — canonical rental item card for list views.
   Uses Icon primitive (no emoji), MoneyRow via inline pattern,
   status badge via tone system. */
const M10RentalItemCard = ({ item, compact }) => (
  <div className="tm-card tm-card-interactive" style={{ padding: compact ? 14 : 16 }}>
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      {/* icon thumbnail — store/shield icon, no emoji */}
      <div style={{
        width: compact ? 56 : 88,
        height: compact ? 56 : 88,
        borderRadius: 12,
        background: item.accentBg,
        border: `1px solid var(--border)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: item.accentToken,
      }}>
        <Icon name={item.iconName} size={compact ? 24 : 34}/>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <span className="tm-badge tm-badge-sm" style={{ background: item.accentBg, color: item.accentToken, flexShrink: 0 }}>
            {item.category}
          </span>
          {item.status === 'rented' ? (
            <Badge tone="grey" size="sm">대여중</Badge>
          ) : (
            <Badge tone="green" size="sm">대여 가능</Badge>
          )}
        </div>

        <div className="tm-text-body-lg" style={{ marginTop: 8, lineHeight: 1.3 }}>{item.name}</div>
        <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>{item.sub}</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span className="tm-text-body-lg tab-num" style={{ color: 'var(--blue500)' }}>
              {item.priceDay.toLocaleString('ko-KR')}
            </span>
            <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>원/일</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--yellow500)" stroke="none" aria-hidden="true">
              <path d="m12 3 3 6 6 1-4.5 4 1 6L12 17l-5.5 3 1-6L3 10l6-1z"/>
            </svg>
            <span className="tm-text-caption tab-num">{item.rating}</span>
            <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>({item.reviews})</span>
          </div>
        </div>
      </div>
    </div>
  </div>
);

/* M10DepositRow — deposit display using MoneyRow vocabulary + shield icon.
   Uses var(--orange50) background + var(--border) border, token-only. */
const M10DepositRow = ({ amount, returned }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: 'var(--orange50)',
    borderRadius: 12,
    border: '1px solid var(--border)',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: 'var(--orange500)',
        color: 'var(--static-white)',
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
      }}>
        <Icon name="shield" size={16}/>
      </div>
      <div>
        <div className="tm-text-label">보증금</div>
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2 }}>
          {returned ? '반납 후 자동 환급' : '손상 없으면 전액 환급'}
        </div>
      </div>
    </div>
    <div className="tm-text-body-lg tab-num" style={{ color: 'var(--orange500)' }}>
      {amount.toLocaleString('ko-KR')}원
    </div>
  </div>
);

/* M10ConditionScoreBadge — item condition score (1–5) using canonical badge tone. */
const M10ConditionScoreBadge = ({ score }) => {
  const tone = score >= 4.5 ? 'green' : score >= 3.5 ? 'blue' : score >= 2.5 ? 'orange' : 'red';
  const label = score >= 4.5 ? '최상' : score >= 3.5 ? '양호' : score >= 2.5 ? '보통' : '주의';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Badge tone={tone} size="sm">상태 {label}</Badge>
      <div style={{ display: 'flex', gap: 2 }}>
        {[1,2,3,4,5].map((n) => (
          <div key={n} style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: n <= Math.round(score)
              ? (tone === 'green' ? 'var(--green500)' : tone === 'blue' ? 'var(--blue500)' : tone === 'orange' ? 'var(--orange500)' : 'var(--red500)')
              : 'var(--grey200)',
          }} aria-hidden="true"/>
        ))}
      </div>
    </div>
  );
};

/* M10PickupSlot — time slot button for rental booking.
   44x44 min touch target, keyboard accessible. */
const M10PickupSlot = ({ time, available, selected }) => (
  <button
    aria-label={`픽업 시간 ${time}${!available ? ' (불가)' : selected ? ' (선택됨)' : ''}`}
    disabled={!available}
    style={{
      minWidth: 64,
      minHeight: 44,
      padding: '8px 12px',
      borderRadius: 10,
      border: `1.5px solid ${selected ? 'var(--blue500)' : available ? 'var(--border)' : 'var(--grey200)'}`,
      background: selected ? 'var(--blue50)' : available ? 'var(--bg)' : 'var(--grey50)',
      color: selected ? 'var(--blue600)' : available ? 'var(--text-strong)' : 'var(--text-caption)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      opacity: available ? 1 : 0.5,
      cursor: available ? 'pointer' : 'not-allowed',
      transition: 'border-color var(--dur-fast), background var(--dur-fast)',
    }}
  >
    <span className="tm-text-label" style={{ color: 'inherit', fontWeight: selected ? 700 : 600 }}>{time}</span>
  </button>
);

/* M10CalendarStrip — horizontal date strip for rental booking.
   No inline fontSize — uses tm-text-* classes. */
const M10CalendarStrip = ({ selectedDay = 4 }) => {
  const days = [
    { d: '화', n: 29, avail: true },
    { d: '수', n: 30, avail: true },
    { d: '목', n: 1,  avail: false },
    { d: '금', n: 2,  avail: true },
    { d: '토', n: 3,  avail: true },
    { d: '일', n: 4,  avail: false },
    { d: '월', n: 5,  avail: true },
  ];
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '4px 0' }}>
      {days.map((day) => (
        <button
          key={day.n}
          aria-label={`${day.d} ${day.n}일${!day.avail ? ' (불가)' : ''}`}
          disabled={!day.avail}
          style={{
            flexShrink: 0,
            width: 44,
            minHeight: 56,
            borderRadius: 12,
            border: `1.5px solid ${day.n === selectedDay ? 'var(--blue500)' : 'var(--border)'}`,
            background: day.n === selectedDay ? 'var(--blue500)' : day.avail ? 'var(--bg)' : 'var(--grey50)',
            color: day.n === selectedDay ? 'var(--static-white)' : day.avail ? 'var(--text-strong)' : 'var(--text-caption)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            opacity: day.avail ? 1 : 0.4,
            cursor: day.avail ? 'pointer' : 'not-allowed',
          }}
        >
          <span className="tm-text-micro" style={{ fontWeight: 600, color: 'inherit', opacity: 0.8 }}>{day.d}</span>
          <span className="tm-text-body-lg" style={{ fontWeight: 700, lineHeight: 1, color: 'inherit' }}>{day.n}</span>
        </button>
      ))}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────
   m10-mb-main: EquipmentRental canonical list
   Mirrors EquipmentRental from screens-deep.jsx:
   category chips / info banner / item cards / bottom nav
   ───────────────────────────────────────────────────────────── */
const M10MobileMain = () => (
  <Phone>
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* AppBar */}
      <AppBar
        title="장비 대여"
        trailing={[
          <button key="s" className="tm-pressable tm-break-keep" style={{ padding: 8 }} aria-label="검색">
            <Icon name="search" size={22} color="var(--grey800)"/>
          </button>,
        ]}
      />

      {/* Category chips — mirrors EquipmentRental chip row */}
      <div style={{ padding: '0 20px 12px', display: 'flex', gap: 8, overflow: 'auto' }}>
        {M10_CATEGORIES.map((c, i) => (
          <HapticChip key={c.id} active={i === 0}>{c.label}</HapticChip>
        ))}
      </div>

      {/* Info banner — mirrors EquipmentRental blue info card */}
      <div style={{ padding: '0 20px 12px' }}>
        <div style={{ padding: 14, background: 'var(--blue50)', borderRadius: 12, display: 'flex', gap: 10 }}>
          <Icon name="calendar" size={18} color="var(--blue500)"/>
          <div style={{ flex: 1 }} className="tm-text-caption" >
            <b style={{ color: 'var(--blue500)' }}>당일 픽업 · 반납</b>이 기본이에요. 분실 시 보증금에서 차감됩니다.
          </div>
        </div>
      </div>

      {/* Sort / count bar */}
      <div style={{ padding: '0 20px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>총 4개 장비</span>
        <button
          aria-label="정렬 방식 변경"
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer', minHeight: 44 }}
        >
          <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>최신순</span>
          <Icon name="chevD" size={14} color="var(--text-caption)"/>
        </button>
      </div>

      {/* Item list — uses M10RentalItemCard (canonical vocabulary) */}
      <div style={{ flex: 1, padding: '0 20px 8px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
        {M10_ITEMS.map((item) => (
          <M10RentalItemCard key={item.id} item={item}/>
        ))}
      </div>

      <BottomNav active="marketplace"/>
    </div>
  </Phone>
);

/* ─────────────────────────────────────────────────────────────
   m10-tb-main: 태블릿 2-col using RentalMiniLayout vocabulary
   ───────────────────────────────────────────────────────────── */
const M10TabletMain = () => (
  <div style={{ width: M10_TB_W, height: M10_TB_H, background: 'var(--bg)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font)' }}>
    {/* header */}
    <div style={{ padding: '20px 32px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--grey100)' }}>
      <div>
        <div className="tm-text-subhead">장비 대여</div>
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 4 }}>내 주변 대여 가능한 장비</div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="tm-pressable tm-break-keep"
          aria-label="검색"
          style={{ minHeight: 44, padding: '0 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Icon name="search" size={16}/>
          <span className="tm-text-label">검색</span>
        </button>
        <button
          className="tm-pressable tm-break-keep"
          aria-label="장비 등록"
          style={{ minHeight: 44, padding: '0 16px', borderRadius: 12, background: 'var(--blue500)', color: 'var(--static-white)', display: 'flex', alignItems: 'center' }}
        >
          <span className="tm-text-label" style={{ color: 'inherit', fontWeight: 700 }}>장비 등록</span>
        </button>
      </div>
    </div>

    {/* chips */}
    <div style={{ padding: '12px 32px 8px', display: 'flex', gap: 8 }}>
      {M10_CATEGORIES.map((c, i) => <HapticChip key={c.id} active={i === 0}>{c.label}</HapticChip>)}
    </div>

    {/* 2-col grid */}
    <div style={{ padding: '8px 32px 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, flex: 1, overflowY: 'auto' }}>
      {M10_ITEMS.concat(M10_ITEMS.slice(0, 2)).map((item, idx) => (
        <M10RentalItemCard key={idx} item={item}/>
      ))}
    </div>
  </div>
);

/* ─────────────────────────────────────────────────────────────
   m10-dt-main: 데스크탑 3-col workspace
   Left nav / center 3-col grid / right status panel
   Uses RentalMiniLayout mini-preview in right panel
   ───────────────────────────────────────────────────────────── */
const M10DesktopMain = () => (
  <div style={{ width: M10_DT_W, height: M10_DT_H, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'grid', gridTemplateColumns: '240px 1fr 300px' }}>
    {/* left nav */}
    <aside style={{ borderRight: '1px solid var(--grey100)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>T</div>
        <div className="tm-text-body-lg">Teameet</div>
      </div>
      <nav style={{ display: 'grid', gap: 4 }}>
        {[['홈', false], ['매치', false], ['팀', false], ['장터', false], ['대여', true], ['더보기', false]].map(([l, a]) => (
          <button
            key={l}
            aria-label={l}
            className="tm-pressable tm-break-keep"
            style={{
              minHeight: 44,
              padding: '0 16px',
              borderRadius: 12,
              background: a ? 'var(--blue50)' : 'transparent',
              color: a ? 'var(--blue500)' : 'var(--text-strong)',
              display: 'flex',
              alignItems: 'center',
              fontWeight: a ? 700 : 500,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <span className="tm-text-label" style={{ color: 'inherit' }}>{l}</span>
          </button>
        ))}
      </nav>
    </aside>

    {/* main content */}
    <main style={{ padding: 32, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
        <div>
          <div className="tm-text-heading">장비 대여</div>
          <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>강남구 5km · 대여 가능 3건</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            aria-label="필터"
            className="tm-pressable tm-break-keep"
            style={{ minHeight: 44, padding: '0 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'center' }}
          >
            <span className="tm-text-label">필터</span>
          </button>
          <button
            aria-label="장비 등록"
            className="tm-pressable tm-break-keep"
            style={{ minHeight: 44, padding: '0 16px', borderRadius: 12, background: 'var(--blue500)', color: 'var(--static-white)', display: 'flex', alignItems: 'center' }}
          >
            <span className="tm-text-label" style={{ color: 'inherit', fontWeight: 700 }}>장비 등록</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {M10_CATEGORIES.map((c, i) => <HapticChip key={c.id} active={i === 0}>{c.label}</HapticChip>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        {M10_ITEMS.concat(M10_ITEMS.slice(0, 2)).map((item, idx) => (
          <M10RentalItemCard key={idx} item={item} compact/>
        ))}
      </div>
    </main>

    {/* right panel — RentalMiniLayout vocabulary */}
    <aside style={{ borderLeft: '1px solid var(--grey100)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="tm-text-label">내 대여 현황</div>
      <Card pad={16}>
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>현재 대여 중</div>
        <NumberDisplay value={2} unit="건" size={28}/>
      </Card>
      <div className="tm-text-label">반납 임박</div>
      <Card pad={14}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <div className="tm-text-label" style={{ color: 'var(--orange500)' }}>내일 14:00 반납</div>
            <div className="tm-text-body" style={{ marginTop: 4 }}>풋살화 + 보호대 세트</div>
            <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2 }}>강남역 A픽업지점</div>
          </div>
          <Badge tone="orange" size="sm">D-0</Badge>
        </div>
      </Card>
      <div className="tm-text-label">빠른 액션</div>
      {['대여 승인', 'QR 확인', '반납 검수'].map((label, i) => (
        <button
          key={label}
          aria-label={label}
          className="tm-pressable tm-break-keep"
          style={{ width: '100%', minHeight: 44, borderRadius: 12, background: i === 0 ? 'var(--blue500)' : 'var(--grey100)', color: i === 0 ? 'var(--static-white)' : 'var(--text-strong)', border: 'none', fontWeight: 700, cursor: 'pointer', marginBottom: 0 }}
        >
          <span className="tm-text-label" style={{ color: 'inherit' }}>{label}</span>
        </button>
      ))}
    </aside>
  </div>
);

/* ─────────────────────────────────────────────────────────────
   m10-mb-detail: 장비 상세 + 보증금 + 컨디션 점수 + 픽업 슬롯
   Mirrors RentalDetail (screens-deep.jsx) with MoneyRow / NumberDisplay.
   ───────────────────────────────────────────────────────────── */
const M10MobileDetail = () => {
  const item = M10_ITEMS[0]; /* 풋살화 + 보호대 세트*/
  const [days, setDays] = React.useState(1);
  const total = item.priceDay * days + item.deposit;

  return (
    <Phone>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <TopNav title="장비 상세" trailing={
          <button className="tm-pressable tm-break-keep" aria-label="공유" style={{ padding: 8, background: 'none', border: 'none' }}>
            <Icon name="share" size={20}/>
          </button>
        }/>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* hero thumbnail — Icon-based, no emoji */}
          <div style={{
            height: 200,
            background: 'var(--blue50)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--blue500)',
          }}>
            <Icon name="store" size={64}/>
          </div>

          <div style={{ padding: '20px 20px 0' }}>
            {/* category + availability */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Badge tone="blue" size="sm">{item.category}</Badge>
              <Badge tone="green" size="sm">대여 가능</Badge>
            </div>

            <div className="tm-text-heading" style={{ marginTop: 12 }}>{item.name}</div>
            <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>{item.sub}</div>

            {/* star + reviews */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--yellow500)" stroke="none" aria-hidden="true">
                <path d="m12 3 3 6 6 1-4.5 4 1 6L12 17l-5.5 3 1-6L3 10l6-1z"/>
              </svg>
              <span className="tm-text-label tab-num">{item.rating}</span>
              <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>후기 {item.reviews}개</span>
            </div>

            {/* condition score badge */}
            <div style={{ marginTop: 12 }}>
              <M10ConditionScoreBadge score={item.rating}/>
            </div>

            {/* price breakdown via MoneyRow */}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--grey100)', borderBottom: '1px solid var(--grey100)', paddingBottom: 16 }}>
              <MoneyRow label="하루 대여료" amount={item.priceDay} strong/>
              <MoneyRow label="3일 대여" amount={item.priceDay * 3 * 0.9} sub="10% 할인 적용" accent/>
              <MoneyRow label="7일 대여" amount={item.priceDay * 7 * 0.8} sub="20% 할인 적용" accent/>
            </div>

            {/* deposit row — M10DepositRow canonical */}
            <div style={{ marginTop: 16 }}>
              <M10DepositRow amount={item.deposit}/>
            </div>

            {/* rental period stepper — RentalControlInteractionBoard pattern */}
            <Card pad={16} style={{ marginTop: 20 }}>
              <SectionTitle title="대여 기간"/>
              <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px', gap: 12, alignItems: 'center', marginTop: 12 }}>
                <button
                  className="tm-pressable tm-break-keep"
                  aria-label="기간 줄이기"
                  onClick={() => setDays(Math.max(1, days - 1))}
                  style={{ height: 44, borderRadius: 14, background: 'var(--grey100)', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                >
                  <span className="tm-text-body-lg">−</span>
                </button>
                <div style={{ textAlign: 'center' }}>
                  <span className="tm-text-body-lg tab-num" style={{ fontWeight: 800 }}>{days}일</span>
                  <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                    대여료 {(item.priceDay * days).toLocaleString()}원 + 보증금
                  </div>
                </div>
                <button
                  className="tm-pressable tm-break-keep"
                  aria-label="기간 늘리기"
                  onClick={() => setDays(days + 1)}
                  style={{ height: 44, borderRadius: 14, background: 'var(--blue500)', color: 'var(--static-white)', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                >
                  <span className="tm-text-body-lg" style={{ color: 'inherit' }}>+</span>
                </button>
              </div>
            </Card>

            {/* Calendar section */}
            <div style={{ marginTop: 20 }}>
              <div className="tm-text-label" style={{ marginBottom: 12 }}>픽업 날짜 선택</div>
              <M10CalendarStrip selectedDay={4}/>
            </div>

            {/* Time slots */}
            <div style={{ marginTop: 16 }}>
              <div className="tm-text-label" style={{ marginBottom: 12 }}>픽업 시간</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <M10PickupSlot time="09:00" available={true}/>
                <M10PickupSlot time="10:00" available={true}/>
                <M10PickupSlot time="11:00" available={false}/>
                <M10PickupSlot time="13:00" available={true} selected={true}/>
                <M10PickupSlot time="14:00" available={true}/>
                <M10PickupSlot time="16:00" available={false}/>
              </div>
            </div>

            {/* pickup location */}
            <div style={{ marginTop: 20 }}>
              <div className="tm-text-label" style={{ marginBottom: 12 }}>픽업 장소</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'var(--grey50)', borderRadius: 12, border: '1px solid var(--grey100)' }}>
                <Icon name="pin" size={18} color="var(--blue500)"/>
                <div>
                  <div className="tm-text-body">강남역 A픽업지점</div>
                  <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2 }}>도보 5분 · 강남역 5번 출구</div>
                </div>
              </div>
            </div>

            {/* payment summary */}
            <Card pad={16} style={{ marginTop: 20, marginBottom: 8 }}>
              <div className="tm-text-label" style={{ marginBottom: 4 }}>결제 내역</div>
              <MoneyRow label="대여료" amount={item.priceDay * days}/>
              <MoneyRow label="보증금" amount={item.deposit} sub="검수 후 반환"/>
              <div style={{ borderTop: '2px solid var(--border)', marginTop: 8, paddingTop: 12 }}>
                <MoneyRow label="총 결제" amount={total} strong/>
              </div>
            </Card>

            <div style={{ height: 100 }}/>
          </div>
        </div>

        {/* Sticky CTA */}
        <div style={{ padding: '12px 20px 24px', borderTop: '1px solid var(--grey100)', background: 'var(--bg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <NumberDisplay value={item.priceDay} unit="원/일" size={20} color="var(--blue500)"/>
            <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>보증금 {item.deposit.toLocaleString()}원 별도</span>
          </div>
          <button
            className="tm-pressable tm-break-keep"
            aria-label="예약하기"
            style={{ width: '100%', minHeight: 52, borderRadius: 14, background: 'var(--blue500)', color: 'var(--static-white)', fontWeight: 700, border: 'none', cursor: 'pointer' }}
          >
            <span className="tm-text-body-lg" style={{ color: 'inherit' }}>예약하기</span>
          </button>
        </div>
      </div>
    </Phone>
  );
};

/* ─────────────────────────────────────────────────────────────
   m10-mb-flow-pickup: 픽업/반납 QR flow
   Directly mirrors RentalPickupReturnBoard canonical vocabulary:
   QR grid / Wave21AInfoRow pattern / Wave21AStickyCTA pattern.
   ───────────────────────────────────────────────────────────── */
const M10MobileFlowPickup = () => (
  <Phone>
    <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 116 }}>
      {/* header section — mirrors RentalPickupReturnBoard */}
      <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
        <Badge tone="blue" size="sm">PICKUP / RETURN QR</Badge>
        <div className="tm-text-subhead" style={{ marginTop: 8 }}>픽업 · 반납 QR</div>
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 8 }}>
          예약자, 운영자, 장비 ID가 모두 맞아야 상태가 넘어갑니다.
        </div>
      </div>

      <div style={{ padding: 20 }}>
        {/* QR card — from RentalPickupReturnBoard */}
        <Card pad={18}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <Badge tone="orange" size="sm">픽업 대기</Badge>
              <div className="tm-text-subhead" style={{ lineHeight: 1.28, marginTop: 12 }}>강남역 A픽업지점</div>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 8 }}>오늘 18:00까지 수령</div>
            </div>
            {/* QR grid mock — 3x3 dot grid, no emoji */}
            <div style={{
              width: 92,
              height: 92,
              borderRadius: 16,
              background: 'var(--grey50)',
              border: '1px solid var(--border)',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 5,
              padding: 12,
            }}>
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  style={{ borderRadius: 3, background: [0, 2, 4, 6, 7].includes(i) ? 'var(--text-strong)' : 'var(--grey200)' }}
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>

          {/* reservation details */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
            <div style={{ padding: 12, borderRadius: 13, background: 'var(--blue50)', border: '1px solid var(--border)' }}>
              <div className="tm-text-micro" style={{ color: 'var(--blue500)', fontWeight: 800 }}>예약자 확인</div>
              <div className="tm-text-label" style={{ marginTop: 8 }}>김정민 · 260mm</div>
            </div>
            <div style={{ padding: 12, borderRadius: 13, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
              <div className="tm-text-micro" style={{ color: 'var(--text-caption)', fontWeight: 800 }}>장비 ID</div>
              <div className="tm-text-label tab-num" style={{ marginTop: 8 }}>TM-GR-260-09</div>
            </div>
          </div>
        </Card>

        {/* info rows — Wave21AInfoRow vocabulary */}
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <Wave21AInfoRow
            title="다른 사용자의 QR"
            sub="예약자 이름과 장비 ID가 다르면 픽업 확정을 막습니다."
            status="차단"
            tone="red"
            icon="shield"
          />
          <Wave21AInfoRow
            title="반납 사진 3장 필요"
            sub="전체, 밑창, 손상 의심 부위를 촬영해야 검수로 넘어갑니다."
            status="필수"
            tone="orange"
            icon="edit"
          />
          <Wave21AInfoRow
            title="운영자 확인"
            sub="운영자가 QR을 스캔하면 상태가 사용 중/반납 완료로 바뀝니다."
            status="확인"
            tone="blue"
            icon="check"
          />
        </div>

        {/* deposit row */}
        <div style={{ marginTop: 16 }}>
          <M10DepositRow amount={50000}/>
        </div>
      </div>
    </div>

    {/* sticky CTA — Wave21AStickyCTA pattern */}
    <Wave21AStickyCTA
      title="픽업 확인 요청"
      sub="QR은 5분마다 갱신되며 캡처본은 사용할 수 없습니다."
    />
  </Phone>
);

/* ─────────────────────────────────────────────────────────────
   m10-mb-state-loading: list wireframe with Skeleton primitives
   ───────────────────────────────────────────────────────────── */
const M10MobileStateLoading = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* AppBar skeleton */}
      <div style={{ padding: '12px 20px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton w={100} h={20} r={6}/>
          <Skeleton w={140} h={12} r={4}/>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Skeleton w={36} h={36} r={10}/>
        </div>
      </div>

      {/* chip row skeleton */}
      <div style={{ padding: '4px 20px 12px', display: 'flex', gap: 8 }}>
        {[48, 52, 80, 64, 56].map((w, i) => <Skeleton key={i} w={w} h={32} r={16}/>)}
      </div>

      {/* info banner skeleton */}
      <div style={{ padding: '0 20px 12px' }}>
        <Skeleton w="100%" h={48} r={12}/>
      </div>

      {/* sort bar skeleton */}
      <div style={{ padding: '0 20px 8px', display: 'flex', justifyContent: 'space-between' }}>
        <Skeleton w={64} h={16} r={4}/>
        <Skeleton w={48} h={16} r={4}/>
      </div>

      {/* item card skeletons */}
      <div style={{ flex: 1, padding: '0 20px 8px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} pad={16}>
            <div style={{ display: 'flex', gap: 12 }}>
              <Skeleton w={88} h={88} r={12}/>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
                <Skeleton w="40%" h={16} r={4}/>
                <Skeleton w="85%" h={18} r={4}/>
                <Skeleton w="65%" h={12} r={4}/>
                <Skeleton w="50%" h={14} r={4}/>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  </Phone>
);

/* ─────────────────────────────────────────────────────────────
   m10-mb-state-empty: EmptyState canonical + rental context
   ───────────────────────────────────────────────────────────── */
const M10MobileStateEmpty = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* preserved list wireframe header */}
      <AppBar title="장비 대여"/>
      <div style={{ padding: '0 20px 12px', display: 'flex', gap: 8 }}>
        {M10_CATEGORIES.slice(0, 4).map((c, i) => <HapticChip key={c.id} active={i === 0}>{c.label}</HapticChip>)}
      </div>

      {/* EmptyState canonical */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <EmptyState
          icon={<Icon name="store" size={40} color="var(--text-caption)"/>}
          title="근처 대여 장비가 없어요"
          sub="다른 카테고리를 선택하거나 반경을 넓혀보세요"
          cta="전체 카테고리 보기"
        />
        <button
          className="tm-pressable tm-break-keep"
          aria-label="내 장비 등록하기"
          style={{ minHeight: 44, padding: '0 24px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', marginTop: 8, cursor: 'pointer' }}
        >
          <span className="tm-text-label">내 장비 등록하기</span>
        </button>
      </div>
    </div>
  </Phone>
);

/* ─────────────────────────────────────────────────────────────
   m10-mb-state-error: 보증금 결제 실패
   Uses MoneyRow + Toast canonical primitives.
   ───────────────────────────────────────────────────────────── */
const M10MobileStateError = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <AppBar title="결제 오류"/>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16, textAlign: 'center' }}>
        {/* error icon — shield with X, no emoji */}
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--red50)', color: 'var(--red500)', display: 'grid', placeItems: 'center' }}>
          <Icon name="shield" size={28}/>
        </div>

        <div className="tm-text-heading">보증금 결제에 실패했어요</div>
        <div className="tm-text-body" style={{ color: 'var(--text-muted)' }}>카드사 응답이 없거나 한도를 초과했어요. 다른 결제수단을 사용해보세요.</div>

        {/* order summary — MoneyRow */}
        <Card pad={14} style={{ width: '100%', textAlign: 'left', marginTop: 8 }}>
          <MoneyRow label="보증금" amount={50000} strong/>
          <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--red50)', borderRadius: 8 }}>
            <div className="tm-text-caption" style={{ color: 'var(--red500)', fontWeight: 600 }}>결제 실패 · 신한카드 5678</div>
          </div>
        </Card>

        <div style={{ display: 'grid', gap: 8, marginTop: 8, width: '100%' }}>
          <button
            className="tm-pressable tm-break-keep"
            aria-label="다른 카드로 시도"
            style={{ width: '100%', minHeight: 52, borderRadius: 14, background: 'var(--blue500)', color: 'var(--static-white)', fontWeight: 700, border: 'none', cursor: 'pointer' }}
          >
            <span className="tm-text-body-lg" style={{ color: 'inherit' }}>다른 카드로 시도</span>
          </button>
          <button
            className="tm-pressable tm-break-keep"
            aria-label="카카오페이로 결제"
            style={{ width: '100%', minHeight: 44, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', fontWeight: 600, cursor: 'pointer' }}
          >
            <span className="tm-text-label">카카오페이로 결제</span>
          </button>
          <button
            className="tm-pressable tm-break-keep"
            aria-label="예약 취소"
            style={{ width: '100%', minHeight: 44, borderRadius: 12, background: 'transparent', border: 'none', fontWeight: 500, color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <span className="tm-text-label" style={{ color: 'var(--text-muted)' }}>예약 취소</span>
          </button>
        </div>
      </div>

      {/* Toast canonical */}
      <Toast msg="보증금 결제에 실패했어요. 다시 시도해주세요." type="error" visible={true}/>
    </div>
  </Phone>
);

/* ─────────────────────────────────────────────────────────────
   m10-mb-state-deadline: 반납 임박 (RentalStateCases 'late'/'inUse' vocabulary)
   Uses RentalStateCard pattern + M10DepositRow + Progress.
   ───────────────────────────────────────────────────────────── */
const M10MobileStateDeadline = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <AppBar title="반납 알림"/>

      <div style={{ flex: 1, padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
        {/* deadline warning card — RentalStateCard 'late' pattern */}
        <Card pad={18}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <Badge tone="red" size="sm">반납 지연 임박</Badge>
              <div className="tm-text-heading" style={{ lineHeight: 1.28, marginTop: 12 }}>반납 2시간 전이에요</div>
            </div>
            <div style={{ width: 42, height: 42, borderRadius: 14, background: 'var(--orange50)', color: 'var(--orange500)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon name="clock" size={19}/>
            </div>
          </div>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 12 }}>
            오늘 14:00까지 반납해주세요. 기한 초과 시 보증금에서 지연료가 차감됩니다.
          </div>

          {/* progress bar — rental deadline urgency */}
          <div style={{ marginTop: 16 }}>
            <Progress value={80} max={100} urgent/>
          </div>

          {/* state grid — RentalStateCard inner grid pattern */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
            <div style={{ padding: 12, borderRadius: 13, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
              <div className="tm-text-micro" style={{ color: 'var(--text-caption)', fontWeight: 700 }}>보증금</div>
              <div className="tm-text-body-lg tab-num" style={{ fontWeight: 800, marginTop: 4 }}>
                {(50000).toLocaleString()}원
              </div>
            </div>
            <div style={{ padding: 12, borderRadius: 13, background: 'var(--orange50)', border: '1px solid var(--border)' }}>
              <div className="tm-text-micro" style={{ color: 'var(--orange500)', fontWeight: 700 }}>잔여</div>
              <div className="tm-text-body-lg tab-num" style={{ fontWeight: 800, marginTop: 4, color: 'var(--orange500)' }}>2시간</div>
            </div>
          </div>
        </Card>

        {/* item card — rental item info */}
        <Card pad={16}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, background: 'var(--blue50)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', color: 'var(--blue500)', flexShrink: 0 }}>
              <Icon name="store" size={28}/>
            </div>
            <div>
              <div className="tm-text-body-lg">{M10_ITEMS[0].name}</div>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 4 }}>{M10_ITEMS[0].sub}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '10px 12px', background: 'var(--grey50)', borderRadius: 10 }}>
            <Icon name="pin" size={16} color="var(--blue500)"/>
            <span className="tm-text-caption">강남역 A픽업지점</span>
          </div>
        </Card>

        {/* deposit returned row */}
        <M10DepositRow amount={50000} returned/>

        {/* action buttons */}
        <div style={{ display: 'grid', gap: 8, marginTop: 'auto' }}>
          <button
            className="tm-pressable tm-break-keep"
            aria-label="지금 반납하러 가기"
            style={{ width: '100%', minHeight: 52, borderRadius: 14, background: 'var(--blue500)', color: 'var(--static-white)', fontWeight: 700, border: 'none', cursor: 'pointer' }}
          >
            <span className="tm-text-body-lg" style={{ color: 'inherit' }}>지금 반납하러 가기</span>
          </button>
          <button
            className="tm-pressable tm-break-keep"
            aria-label="연장 신청"
            style={{ width: '100%', minHeight: 44, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', fontWeight: 600, cursor: 'pointer' }}
          >
            <span className="tm-text-label">연장 신청 (추가 요금)</span>
          </button>
          <button
            className="tm-pressable tm-break-keep"
            aria-label="대여자에게 연락"
            style={{ width: '100%', minHeight: 44, borderRadius: 12, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <span className="tm-text-label" style={{ color: 'var(--text-muted)' }}>장비 대여자에게 연락</span>
          </button>
        </div>
      </div>
    </div>
  </Phone>
);

/* ─────────────────────────────────────────────────────────────
   m10-mb-state-sold-out: 재고 없음 (RentalStateCases 'inventory' vocabulary)
   ───────────────────────────────────────────────────────────── */
const M10MobileStateSoldOut = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <AppBar title="장비 상세"/>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* hero with sold-out overlay — Icon-based, no emoji */}
        <div style={{ height: 200, background: 'var(--grey100)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          <Icon name="store" size={64} color="var(--grey400)"/>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)', borderRadius: 0, display: 'grid', placeItems: 'center' }}>
            <Badge tone="grey">재고 없음</Badge>
          </div>
        </div>

        <div style={{ flex: 1, padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* sold-out state card — RentalStateCard 'inventory' pattern */}
          <Card pad={18}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <Badge tone="red" size="sm">재고 충돌</Badge>
                <div className="tm-text-heading" style={{ lineHeight: 1.28, marginTop: 12 }}>모든 날짜가 예약되었어요</div>
              </div>
              <div style={{ width: 42, height: 42, borderRadius: 14, background: 'var(--red50)', color: 'var(--red500)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Icon name="store" size={19}/>
              </div>
            </div>
            <div className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 12 }}>
              이 장비는 현재 모든 슬롯이 꽉 찼어요. 알림을 설정하면 반납 시 바로 알려드려요.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
              <div style={{ padding: 12, borderRadius: 13, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
                <div className="tm-text-micro" style={{ color: 'var(--text-caption)', fontWeight: 700 }}>보증금</div>
                <div className="tm-text-body-lg tab-num" style={{ fontWeight: 800, marginTop: 4 }}>50,000원</div>
              </div>
              <div style={{ padding: 12, borderRadius: 13, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
                <div className="tm-text-micro" style={{ color: 'var(--text-caption)', fontWeight: 700 }}>재고</div>
                <div className="tm-text-body-lg tab-num" style={{ fontWeight: 800, marginTop: 4, color: 'var(--red500)' }}>0개</div>
              </div>
            </div>
          </Card>

          <div style={{ display: 'grid', gap: 8, marginTop: 'auto' }}>
            <button
              className="tm-pressable tm-break-keep"
              aria-label="반납 알림 받기"
              style={{ width: '100%', minHeight: 52, borderRadius: 14, background: 'var(--blue500)', color: 'var(--static-white)', fontWeight: 700, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <Icon name="bell" size={16} color="var(--static-white)"/>
              <span className="tm-text-body-lg" style={{ color: 'inherit' }}>반납 알림 받기</span>
            </button>
            <button
              className="tm-pressable tm-break-keep"
              aria-label="비슷한 장비 보기"
              style={{ width: '100%', minHeight: 44, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', fontWeight: 600, cursor: 'pointer' }}
            >
              <span className="tm-text-label">비슷한 장비 보기</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Phone>
);

/* ─────────────────────────────────────────────────────────────
   m10-mb-components: RentalControlInteractionBoard vocabulary inventory.
   Inventories M10 primitives + canonical components.
   ───────────────────────────────────────────────────────────── */
const M10ComponentSwatch = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 12, background: 'var(--grey50)', border: '1px solid var(--grey100)' }}>
    <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</div>
  </div>
);

const M10ComponentsBoard = ({ viewport }) => {
  const w = viewport === 'mb' ? M10_MB_W : viewport === 'tb' ? M10_TB_W : M10_DT_W;
  const h = viewport === 'mb' ? M10_MB_H : viewport === 'tb' ? M10_TB_H : M10_DT_H;
  return (
    <div style={{ width: w, height: h, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflow: 'hidden' }}>
      <Badge tone="blue" size="sm">{`m10-${viewport || 'mb'}-components`}</Badge>
      <div className="tm-text-title" style={{ marginTop: 8 }}>M10 · 사용 컴포넌트 인벤토리</div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>장비 대여 화면에서 실제 사용되는 primitives · canonical components</div>

      <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        {/* RentalItemCard */}
        <M10ComponentSwatch label="M10RentalItemCard · 장비 카드 (list item)">
          <div style={{ width: '100%', maxWidth: 300 }}>
            <M10RentalItemCard item={M10_ITEMS[0]} compact/>
          </div>
        </M10ComponentSwatch>

        {/* MoneyRow canonical */}
        <M10ComponentSwatch label="MoneyRow · 대여료/보증금 행 (canonical)">
          <div style={{ width: '100%', maxWidth: 280 }}>
            <MoneyRow label="하루 대여료" amount={8000} strong/>
            <MoneyRow label="3일 할인가" amount={21600} accent sub="10% 할인"/>
            <MoneyRow label="보증금" amount={50000}/>
          </div>
        </M10ComponentSwatch>

        {/* M10DepositRow */}
        <M10ComponentSwatch label="M10DepositRow · 보증금 배너 (shield icon)">
          <div style={{ width: '100%', maxWidth: 320 }}>
            <M10DepositRow amount={50000}/>
          </div>
        </M10ComponentSwatch>

        {/* M10ConditionScoreBadge */}
        <M10ComponentSwatch label="M10ConditionScoreBadge · 컨디션 점수">
          <M10ConditionScoreBadge score={4.9}/>
          <M10ConditionScoreBadge score={3.5}/>
          <M10ConditionScoreBadge score={2.2}/>
        </M10ComponentSwatch>

        {/* M10PickupSlot */}
        <M10ComponentSwatch label="M10PickupSlot · 픽업 시간 슬롯 (44px min)">
          <M10PickupSlot time="09:00" available={true}/>
          <M10PickupSlot time="10:00" available={true} selected={true}/>
          <M10PickupSlot time="11:00" available={false}/>
        </M10ComponentSwatch>

        {/* M10CalendarStrip */}
        <M10ComponentSwatch label="M10CalendarStrip · 날짜 선택 strip">
          <div style={{ width: '100%' }}>
            <M10CalendarStrip selectedDay={4}/>
          </div>
        </M10ComponentSwatch>

        {/* NumberDisplay */}
        <M10ComponentSwatch label="NumberDisplay · 보증금 / 대여료 hero KPI (canonical)">
          <NumberDisplay value={50000} unit="원" size={24} sub="보증금 · 검수 후 반환"/>
          <NumberDisplay value={8000} unit="원/일" size={24} color="var(--blue500)"/>
        </M10ComponentSwatch>

        {/* HapticChip category / status badges */}
        <M10ComponentSwatch label="HapticChip · 카테고리 필터 / status Badge">
          {M10_CATEGORIES.slice(0, 4).map((c, i) => <HapticChip key={c.id} active={i === 0}>{c.label}</HapticChip>)}
          <Badge tone="green" size="sm">대여 가능</Badge>
          <Badge tone="grey" size="sm">대여중</Badge>
          <Badge tone="orange" size="sm">픽업 대기</Badge>
          <Badge tone="red" size="sm">재고 없음</Badge>
        </M10ComponentSwatch>

        {/* Wave21AInfoRow */}
        <M10ComponentSwatch label="Wave21AInfoRow · 픽업/반납/파손 정보 행 (canonical)">
          <div style={{ width: '100%' }}>
            <Wave21AInfoRow title="반납 사진 3장 필요" sub="전체, 밑창, 손상 의심 부위 촬영" status="필수" tone="orange" icon="edit"/>
          </div>
        </M10ComponentSwatch>

        {/* CTA states — RentalControlInteractionBoard pattern */}
        <M10ComponentSwatch label="CTA 상태 매트릭스 (RentalControlInteractionBoard 패턴)">
          <div style={{ display: 'grid', gap: 8, width: '100%', maxWidth: 240 }}>
            {[
              ['대여 예약', 'var(--blue500)', 'var(--static-white)', false],
              ['픽업 QR 보기', 'var(--grey100)', 'var(--text-strong)', false],
              ['반납 사진 업로드', 'var(--grey100)', 'var(--text-strong)', false],
              ['재고 없음', 'var(--grey200)', 'var(--grey500)', true],
            ].map(([title, bg, color, disabled]) => (
              <button
                key={title}
                disabled={disabled}
                aria-label={title}
                className="tm-pressable tm-break-keep"
                style={{ minHeight: 44, borderRadius: 12, background: bg, color, fontWeight: 700, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer' }}
              >
                <span className="tm-text-label" style={{ color: 'inherit' }}>{title}</span>
              </button>
            ))}
          </div>
        </M10ComponentSwatch>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────
   m10-mb-assets: token inventory — rental accent, deposit, condition, motion
   ───────────────────────────────────────────────────────────── */
const M10AssetSwatch = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</div>
  </div>
);

const M10ColorSwatch = ({ token, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
    <div style={{ width: 36, height: 36, borderRadius: 8, background: value, border: '1px solid var(--grey100)' }}/>
    <div className="tm-text-micro tab-num">{token}</div>
  </div>
);

const M10AssetsBoard = ({ viewport }) => {
  const w = viewport === 'mb' ? M10_MB_W : viewport === 'tb' ? M10_TB_W : M10_DT_W;
  const h = viewport === 'mb' ? M10_MB_H : viewport === 'tb' ? M10_TB_H : M10_DT_H;
  return (
    <div style={{ width: w, height: h, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflow: 'hidden' }}>
      <Badge tone="blue" size="sm">{`m10-${viewport || 'mb'}-assets`}</Badge>
      <div className="tm-text-title" style={{ marginTop: 8 }}>M10 · 디자인 토큰 인벤토리</div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>rental accent · deposit tone · condition badge · motion tokens</div>

      <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
        {/* rental accent colors */}
        <M10AssetSwatch label="Color · rental accent (var-only, no raw hex)">
          <M10ColorSwatch token="blue500" value="var(--blue500)"/>
          <M10ColorSwatch token="blue50" value="var(--blue50)"/>
          <M10ColorSwatch token="teal500" value="var(--teal500)"/>
          <M10ColorSwatch token="grey700" value="var(--grey700)"/>
        </M10AssetSwatch>

        {/* deposit + condition semantic colors */}
        <M10AssetSwatch label="Color · deposit + condition semantic">
          <M10ColorSwatch token="orange500" value="var(--orange500)"/>
          <M10ColorSwatch token="orange50" value="var(--orange50)"/>
          <M10ColorSwatch token="green500" value="var(--green500)"/>
          <M10ColorSwatch token="red500" value="var(--red500)"/>
          <M10ColorSwatch token="yellow500" value="var(--yellow500)"/>
        </M10AssetSwatch>

        {/* neutral hierarchy */}
        <M10AssetSwatch label="Color · neutral surface hierarchy">
          <M10ColorSwatch token="grey50" value="var(--grey50)"/>
          <M10ColorSwatch token="grey100" value="var(--grey100)"/>
          <M10ColorSwatch token="grey200" value="var(--grey200)"/>
          <M10ColorSwatch token="grey400" value="var(--grey400)"/>
          <M10ColorSwatch token="grey900" value="var(--grey900)"/>
        </M10AssetSwatch>

        {/* typography */}
        <M10AssetSwatch label="Type · used scale (tm-text-* classes, no inline fontSize)">
          <span className="tm-text-heading">heading</span>
          <span className="tm-text-subhead">subhead</span>
          <span className="tm-text-body-lg">body-lg</span>
          <span className="tm-text-body">body</span>
          <span className="tm-text-label">label</span>
          <span className="tm-text-caption">caption</span>
          <span className="tm-text-micro">micro</span>
        </M10AssetSwatch>

        {/* spacing */}
        <M10AssetSwatch label="Spacing · 4-multiple only">
          {[8, 12, 16, 20, 24, 32, 40, 48].map((n) => (
            <Badge key={n} tone="grey" size="sm">{`${n}px`}</Badge>
          ))}
        </M10AssetSwatch>

        {/* radius */}
        <M10AssetSwatch label="Radius tokens">
          <Badge tone="grey" size="sm">r-sm 8 · slot</Badge>
          <Badge tone="grey" size="sm">r-md 12 · card/thumb</Badge>
          <Badge tone="grey" size="sm">r-lg 16 · sheet outer</Badge>
          <Badge tone="grey" size="sm">r-pill · badge/chip</Badge>
        </M10AssetSwatch>

        {/* icons */}
        <M10AssetSwatch label="Icon · lucide (store · shield · pin · clock · bell · calendar · edit · check)">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {['store', 'shield', 'pin', 'clock', 'bell', 'calendar', 'edit', 'check', 'search', 'share'].map((name) => (
              <div key={name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <Icon name={name} size={20} color="var(--text-strong)"/>
                <span className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{name}</span>
              </div>
            ))}
          </div>
        </M10AssetSwatch>

        {/* motion */}
        <M10AssetSwatch label="Motion tokens · rental micro-interactions">
          <Badge tone="grey" size="sm">dur-fast 120ms</Badge>
          <Badge tone="grey" size="sm">dur-base 180ms</Badge>
          <Badge tone="grey" size="sm">ease-out-quart</Badge>
          <Badge tone="grey" size="sm">scale(.98) card tap</Badge>
          <Badge tone="grey" size="sm">scaleX progress bar</Badge>
          <Badge tone="grey" size="sm">slide-up sticky CTA</Badge>
        </M10AssetSwatch>

        {/* touch targets */}
        <M10AssetSwatch label="Touch target · min 44×44px (WCAG 2.5.5)">
          {['픽업 슬롯 64×44', '날짜 슬롯 44×56', 'CTA btn ∞×52', '아이콘 btn 44×44'].map((t) => (
            <Badge key={t} tone="grey" size="sm">{t}</Badge>
          ))}
        </M10AssetSwatch>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────
   m10-tb-motion (M10MotionBoard): RentalMotionContractBoard vocabulary
   Uses Wave21AMotionCard pattern, 840×812 width.
   ───────────────────────────────────────────────────────────── */
const M10MotionBoard = () => (
  <div style={{ width: 840, height: M10_MB_H, background: 'var(--bg)', padding: 28, fontFamily: 'var(--font)', overflow: 'hidden' }}>
    <Badge tone="blue">RENTAL MOTION</Badge>
    <div className="tm-text-title" style={{ marginTop: 12 }}>M10 장비 대여 · 모션 계약</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8 }}>
      대여 흐름은 빠른 피드백보다 상태 증거와 재고 재검증이 중요합니다.
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
      <Wave21AMotionCard
        index={0}
        trigger="기간 stepper"
        feedback="scale(.98) · 120ms"
        result="금액 즉시 갱신"
        guard="다음 예약 재검증"
      />
      <Wave21AMotionCard
        index={1}
        trigger="예약 제출"
        feedback="button loading"
        result="재고 lock 확인"
        guard="보증금 sheet 진입"
      />
      <Wave21AMotionCard
        index={2}
        trigger="QR 열기"
        feedback="sheet rise 240ms"
        result="QR 갱신 타이머"
        guard="캡처본 차단"
      />
      <Wave21AMotionCard
        index={3}
        trigger="반납 사진"
        feedback="upload progress"
        result="검수 pending row"
        guard="누락 사진 표시"
      />
      <Wave21AMotionCard
        index={4}
        trigger="파손 신고"
        feedback="red row reveal"
        result="보증금 보류"
        guard="이의 제기 CTA"
      />
      <Wave21AMotionCard
        index={5}
        trigger="반납 완료"
        feedback="success toast"
        result="반환 예정일 생성"
        guard="영수증 링크"
      />
    </div>

    <div style={{ marginTop: 20, padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
      <div className="tm-text-label">Reduced motion</div>
      <div className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8 }}>
        QR sheet, upload progress, success toast는 opacity 전환 또는 즉시 상태 row로 대체합니다.
        재고 충돌과 파손 보류는 persistent copy를 우선합니다. prefers-reduced-motion: all transitions → 0.01ms.
      </div>
    </div>
  </div>
);

Object.assign(window, {
  M10MobileMain,
  M10TabletMain,
  M10DesktopMain,
  M10MobileDetail,
  M10MobileFlowPickup,
  M10MobileStateLoading,
  M10MobileStateEmpty,
  M10MobileStateDeadline,
  M10MobileStateSoldOut,
  M10MobileStateError,
  M10ComponentsBoard,
  M10AssetsBoard,
  M10MotionBoard,
});
