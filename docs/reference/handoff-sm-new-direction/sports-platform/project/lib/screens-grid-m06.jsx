/* fix32 — M06 장터(Marketplace) 풀 grid.
   ID schema: m06-{mb|tb|dt}-{main|detail|create|flow|state|components|assets|motion}[-{sub}]
   Canonical components: Marketplace, ListingCard (screens-other.jsx),
   MarketplaceV2 (screens-v2main2.jsx), ListingCreate (screens-forms.jsx),
   MarketplaceStateEdgeBoard, MarketplaceOrderLifecycleBoard, MarketplaceDisputeSafetyBoard (screens-readiness.jsx)
   MoneyRow, NumberDisplay, KPIStat, Skeleton (signatures.jsx)
   Light-only. */

const M06_MB_W = 375;
const M06_MB_H = 812;
const M06_TB_W = 768;
const M06_TB_H = 1024;
const M06_DT_W = 1280;
const M06_DT_H = 820;

/* ------------------------------------------------------------------ */
/* M06-prefixed data fixtures (prefix avoids babel scope collision)    */
/* ------------------------------------------------------------------ */

const M06_CATEGORIES = [
  { id: 'all',    label: '전체' },
  { id: 'used',   label: '중고' },
  { id: 'rental', label: '대여' },
  { id: 'group',  label: '공구' },
];

const M06_SPORT_CHIPS = [
  { id: 'all',        label: '전체' },
  { id: 'futsal',     label: '풋살' },
  { id: 'basketball', label: '농구' },
  { id: 'badminton',  label: '배드민턴' },
  { id: 'tennis',     label: '테니스' },
  { id: 'icehockey',  label: '하키' },
];

const M06_LISTINGS = [
  { id: 1, sport: '풋살', type: '중고', title: '풋살화 나이키 팬텀 260', price: 45000, meta: '강남구 · 상태 양호', badge: 'used' },
  { id: 2, sport: '배드민턴', type: '대여', title: '배드민턴 라켓 × 2 하루 대여', price: 8000, meta: '신논현 · 1일 대여', badge: 'rental' },
  { id: 3, sport: '농구', type: '공구', title: 'NBA 공식구 공동구매 (4인)', price: 22000, meta: '잠실 · 3/4명 참여', badge: 'group' },
  { id: 4, sport: '테니스', type: '중고', title: '테니스 라켓 윌슨 블레이드 98', price: 120000, meta: '강남구 · 1회 사용', badge: 'used' },
];

const M06_ORDER_STATES = [
  { key: 'pending',       label: '결제 대기',      tone: 'orange' },
  { key: 'paid',          label: '결제 완료',      tone: 'blue' },
  { key: 'shipped',       label: '배송 중',        tone: 'blue' },
  { key: 'delivered',     label: '배송 완료',      tone: 'green' },
  { key: 'completed',     label: '거래 완료',      tone: 'grey' },
  { key: 'auto_released', label: '자동 정산 완료', tone: 'grey' },
];

/* ------------------------------------------------------------------ */
/* M06-prefixed local helpers (prefix mandatory — avoid scope collision)*/
/* ------------------------------------------------------------------ */

/* Order state chip — status indicator pill */
const M06OrderStateChip = ({ stateKey }) => {
  const s = M06_ORDER_STATES.find((x) => x.key === stateKey) || M06_ORDER_STATES[0];
  const map = {
    blue:   { bg: 'var(--blue50)',    fg: 'var(--blue500)' },
    green:  { bg: 'var(--green50)',   fg: 'var(--green500)' },
    orange: { bg: 'var(--orange50)',  fg: 'var(--orange500)' },
    grey:   { bg: 'var(--grey100)',   fg: 'var(--grey600)' },
    red:    { bg: 'var(--red50)',     fg: 'var(--red500)' },
  };
  const { bg, fg } = map[s.tone] || map.grey;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      height: 24, padding: '0 8px', borderRadius: 999,
      background: bg, color: fg,
      fontWeight: 700,
    }} className="tm-text-micro">
      <span style={{ width: 5, height: 5, borderRadius: 999, background: fg, flexShrink: 0 }} aria-hidden="true"/>
      {s.label}
    </span>
  );
};

/* Seller actions CTA — switches based on order state */
const M06SellerActions = ({ state }) => {
  if (state === 'paid') return (
    <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" style={{ minHeight: 44 }}>배송 시작</button>
  );
  if (state === 'shipped') return (
    <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" style={{ minHeight: 44 }}>배송 완료 처리</button>
  );
  return (
    <button className="tm-btn tm-btn-outline tm-btn-md tm-btn-block" style={{ minHeight: 44 }} disabled>현재 상태: {state}</button>
  );
};

/* Confirm receipt CTA with countdown */
const M06ConfirmReceiptCTA = ({ daysLeft }) => (
  <div>
    <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" style={{ minHeight: 44 }}>수령 확인</button>
    {daysLeft !== undefined && (
      <div className="tm-text-caption" style={{ textAlign: 'center', marginTop: 8, color: 'var(--text-muted)' }}>
        {daysLeft}일 후 자동 정산
      </div>
    )}
  </div>
);

/* Escrow status badge — inline shield pill */
const M06EscrowBadge = ({ held }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4,
    height: 24, padding: '0 8px', borderRadius: 999,
    background: held ? 'var(--red50)' : 'var(--green50)',
    color: held ? 'var(--red500)' : 'var(--green500)',
    fontWeight: 700,
  }} className="tm-text-micro">
    <Icon name="shield" size={12} aria-hidden="true"/>
    {held ? '정산 보류' : '에스크로 보호'}
  </span>
);

/* Hot listing card (grid-style, 2-col) used in market-hot board */
const M06HotListingCard = ({ item }) => {
  const badgeTone = { used: 'grey', rental: 'green', group: 'orange' };
  const badgeLabel = { used: '중고', rental: '대여', group: '공구' };
  return (
    <Card interactive style={{ overflow: 'hidden', padding: 0 }}>
      <div style={{ aspectRatio: '1', background: 'var(--grey100)', display: 'grid', placeItems: 'center', position: 'relative' }}>
        <Icon name="store" size={28} color="var(--grey300)" aria-hidden="true"/>
        <div style={{ position: 'absolute', top: 8, left: 8 }}>
          <Badge tone={badgeTone[item.badge] || 'grey'} size="sm">{badgeLabel[item.badge] || item.type}</Badge>
        </div>
        <button style={{ position: 'absolute', top: 6, right: 6, width: 28, height: 28, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.85)', borderRadius: 999, border: 'none', cursor: 'pointer' }} aria-label="관심 상품 추가">
          <Icon name="heart" size={14} color="var(--text-caption)"/>
        </button>
      </div>
      <div style={{ padding: '10px 12px 12px' }}>
        <div className="tm-text-label" style={{ lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{item.title}</div>
        <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>{item.meta}</div>
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="tab-num" style={{ fontWeight: 700, color: 'var(--text-strong)' }} >
            {item.price.toLocaleString('ko-KR')}<span className="tm-text-micro" style={{ fontWeight: 500, color: 'var(--text-muted)', marginLeft: 2 }}>원</span>
          </div>
          {item.badge === 'group' && <Badge tone="orange" size="sm">참여 가능</Badge>}
        </div>
      </div>
    </Card>
  );
};

/* Listing list-row — used in catalog board (1-col) */
const M06ListingRow = ({ item }) => {
  const badgeTone = { used: 'grey', rental: 'green', group: 'orange' };
  const badgeLabel = { used: '중고', rental: '대여', group: '공구' };
  return (
    <Card interactive>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ width: 72, height: 72, borderRadius: 12, background: 'var(--grey100)', flexShrink: 0, display: 'grid', placeItems: 'center' }}>
          <Icon name="store" size={24} color="var(--grey300)" aria-hidden="true"/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            <Badge tone={badgeTone[item.badge] || 'grey'} size="sm">{badgeLabel[item.badge] || item.type}</Badge>
            <Badge tone="blue" size="sm">{item.sport}</Badge>
          </div>
          <div className="tm-text-body-lg" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
          <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>{item.meta}</div>
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="tab-num" style={{ fontWeight: 700, color: 'var(--text-strong)' }}>
              {item.price.toLocaleString('ko-KR')}<span className="tm-text-micro" style={{ fontWeight: 500, color: 'var(--text-muted)', marginLeft: 2 }}>원</span>
            </div>
            <button aria-label="관심 상품 추가" style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <Icon name="heart" size={16} color="var(--text-caption)"/>
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
};

/* ------------------------------------------------------------------ */
/* m06-mb-main — canonical: Marketplace (screens-other.jsx)            */
/* ------------------------------------------------------------------ */
const M06MobileMain = () => <Marketplace/>;

/* ------------------------------------------------------------------ */
/* m06-tb-main — tablet 2-col marketplace                              */
/* ------------------------------------------------------------------ */
const M06TabletMain = () => (
  <div style={{ width: M06_TB_W, height: M06_TB_H, background: 'var(--bg)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font)' }}>
    <div style={{ padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--grey100)' }}>
      <div className="tm-text-heading">장터</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="tm-btn tm-btn-outline tm-btn-md" style={{ minHeight: 44 }}>
          <Icon name="search" size={16} aria-hidden="true"/> 검색
        </button>
        <button className="tm-btn tm-btn-primary tm-btn-md" style={{ minHeight: 44 }}>
          <Icon name="plus" size={16} aria-hidden="true"/> 판매하기
        </button>
      </div>
    </div>
    <div style={{ padding: '16px 32px', display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid var(--grey100)' }}>
      {M06_CATEGORIES.map((c, i) => <Chip key={c.id} active={i === 0}>{c.label}</Chip>)}
      <div style={{ width: 1, background: 'var(--grey200)', alignSelf: 'stretch', margin: '0 4px' }} aria-hidden="true"/>
      {M06_SPORT_CHIPS.slice(0, 4).map((c, i) => <Chip key={c.id} active={i === 0} size="sm">{c.label}</Chip>)}
    </div>
    <div style={{ flex: 1, padding: '20px 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, overflowY: 'auto' }}>
      {M06_LISTINGS.concat(M06_LISTINGS).map((item, idx) => (
        <M06HotListingCard key={idx} item={item}/>
      ))}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* m06-dt-main — desktop 3-col workspace                               */
/* ------------------------------------------------------------------ */
const M06DesktopMain = () => (
  <div style={{ width: M06_DT_W, height: M06_DT_H, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'grid', gridTemplateColumns: '240px 1fr 320px' }}>
    {/* Left sidebar */}
    <aside style={{ borderRight: '1px solid var(--grey100)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>T</div>
        <div className="tm-text-body-lg">Teameet</div>
      </div>
      <nav style={{ display: 'grid', gap: 4 }}>
        {[['홈', false], ['매치', false], ['팀', false], ['장터', true], ['더보기', false]].map(([l, a]) => (
          <button key={l} className={`tm-btn tm-btn-md ${a ? 'tm-btn-secondary' : 'tm-btn-ghost'}`} style={{ justifyContent: 'flex-start', minHeight: 44 }}>{l}</button>
        ))}
      </nav>
      <div style={{ marginTop: 8 }}>
        <SectionTitle title="카테고리"/>
        <div style={{ display: 'grid', gap: 4, padding: '0 20px' }}>
          {M06_CATEGORIES.map((c, i) => (
            <button key={c.id} style={{ textAlign: 'left', padding: '8px 12px', borderRadius: 8, background: i === 0 ? 'var(--blue50)' : 'transparent', color: i === 0 ? 'var(--blue600)' : 'var(--text-muted)', fontWeight: i === 0 ? 600 : 400, cursor: 'pointer', border: 'none', minHeight: 44 }} className="tm-text-label">
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <SectionTitle title="종목 필터"/>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0 20px' }}>
          {M06_SPORT_CHIPS.map((c, i) => <Chip key={c.id} active={i === 0} size="sm">{c.label}</Chip>)}
        </div>
      </div>
    </aside>
    {/* Main listing grid */}
    <main style={{ padding: 32, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
        <div>
          <div className="tm-text-heading">장터</div>
          <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>거래 143건 · 실시간 등록</div>
        </div>
        <button className="tm-btn tm-btn-primary tm-btn-md" style={{ minHeight: 44 }}>
          <Icon name="plus" size={16} aria-hidden="true"/> 판매 등록
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        {M06_LISTINGS.concat(M06_LISTINGS).map((item, idx) => (
          <M06HotListingCard key={idx} item={item}/>
        ))}
      </div>
    </main>
    {/* Right panel — quick preview + KPI */}
    <aside style={{ borderLeft: '1px solid var(--grey100)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="tm-text-label">최근 등록</div>
      {M06_LISTINGS.slice(0, 3).map((item) => (
        <div key={item.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--grey100)', flexShrink: 0 }} aria-hidden="true"/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tm-text-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
            <div className="tab-num" style={{ fontWeight: 700, color: 'var(--text-strong)', marginTop: 2 }} >
              {item.price.toLocaleString('ko-KR')}원
            </div>
          </div>
        </div>
      ))}
      <div style={{ marginTop: 8 }}>
        <div className="tm-text-label">내 판매/구매</div>
        <Card pad={16} style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <KPIStat label="판매 중" value={3} unit="건"/>
            <KPIStat label="구매 완료" value={7} unit="건"/>
          </div>
        </Card>
      </div>
    </aside>
  </div>
);

/* ------------------------------------------------------------------ */
/* m06-mb-detail — canonical: listing-detail-v2 visual language        */
/* Based on MarketplaceV2 (screens-v2main2.jsx) detail pattern         */
/* ------------------------------------------------------------------ */
const M06MobileDetail = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--grey100)' }}>
        <button style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', flexShrink: 0 }} className="tm-pressable" aria-label="뒤로">
          <Icon name="chevL" size={22}/>
        </button>
        <div style={{ flex: 1 }}/>
        <button style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none' }} className="tm-pressable" aria-label="공유">
          <Icon name="share" size={20}/>
        </button>
        <button style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none' }} className="tm-pressable" aria-label="관심 상품">
          <Icon name="heart" size={20}/>
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 100 }}>
        {/* Photo carousel placeholder */}
        <div style={{ width: '100%', height: 280, background: 'var(--grey100)', display: 'grid', placeItems: 'center', position: 'relative' }} aria-label="상품 사진">
          <Icon name="store" size={48} color="var(--grey300)" aria-hidden="true"/>
          <div style={{ position: 'absolute', bottom: 12, right: 16, padding: '4px 10px', borderRadius: 999, background: 'rgba(25,31,40,0.55)', color: 'var(--static-white)' }} className="tm-text-caption">
            1 / 4
          </div>
        </div>
        <div style={{ padding: '20px 20px 0' }}>
          {/* Type + sport badges */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
            <Badge tone="grey" size="sm">중고</Badge>
            <Badge tone="blue" size="sm">풋살</Badge>
            <M06EscrowBadge held={false}/>
          </div>
          <div className="tm-text-heading">풋살화 나이키 팬텀 260</div>
          <div className="tm-text-caption" style={{ marginTop: 6, color: 'var(--text-muted)' }}>강남구 신논현동 · 2시간 전</div>
          {/* Seller info row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, padding: '12px 0', borderTop: '1px solid var(--grey100)', borderBottom: '1px solid var(--grey100)' }}>
            <div style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--grey200)', flexShrink: 0 }} aria-hidden="true"/>
            <div style={{ flex: 1 }}>
              <div className="tm-text-label">김선수</div>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>매너 4.8 · 거래 12회</div>
            </div>
            <button className="tm-btn tm-btn-outline tm-btn-sm" style={{ minHeight: 44 }}>채팅</button>
          </div>
          {/* Description */}
          <div className="tm-text-body" style={{ marginTop: 16, lineHeight: '22px' }}>
            260 사이즈, 실내 풋살 전용. 3회 착용 후 보관 중. 원가 95,000원. 기스 없고 청결히 세척 완료.
          </div>
          {/* MoneyRow — canonical signature component */}
          <div style={{ marginTop: 16 }}>
            <MoneyRow label="판매가" amount={45000}/>
            <MoneyRow label="안전결제 수수료" amount={2250} sub="거래금액의 5%"/>
            <MoneyRow label="총 결제금액" amount={47250} strong/>
          </div>
        </div>
      </div>
      {/* Sticky CTA */}
      <div style={{ padding: '12px 20px 28px', borderTop: '1px solid var(--grey100)', background: 'var(--bg)', display: 'flex', gap: 8 }}>
        <button className="tm-btn tm-btn-outline tm-btn-md" aria-label="관심 상품 등록" style={{ minHeight: 44, minWidth: 44 }}>
          <Icon name="heart" size={18}/>
        </button>
        <button className="tm-btn tm-btn-primary tm-btn-lg" style={{ flex: 1, minHeight: 44 }}>에스크로 결제</button>
      </div>
    </div>
  </Phone>
);

/* ------------------------------------------------------------------ */
/* m06-mb-create — canonical: ListingCreate (screens-forms.jsx)        */
/* ------------------------------------------------------------------ */
const M06MobileCreate = () => <ListingCreate/>;

/* ------------------------------------------------------------------ */
/* m06-mb-flow-order — canonical: MarketplaceOrderLifecycleBoard       */
/* (screens-readiness.jsx) — order state machine visualization         */
/* ------------------------------------------------------------------ */
const M06MobileFlowOrder = () => <MarketplaceOrderLifecycleBoard/>;

/* ------------------------------------------------------------------ */
/* m06-mb-flow-dispute — canonical: MarketplaceDisputeSafetyBoard      */
/* (screens-readiness.jsx) — dispute file + thread visualization       */
/* ------------------------------------------------------------------ */
const M06MobileFlowDispute = () => <MarketplaceDisputeSafetyBoard/>;

/* ------------------------------------------------------------------ */
/* m06-mb-state-loading — Marketplace wireframe + Skeleton             */
/* ------------------------------------------------------------------ */
const M06MobileStateLoading = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* AppBar skeleton */}
      <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton width={80} height={24} radius={6}/>
        <div style={{ display: 'flex', gap: 8 }}>
          <Skeleton width={36} height={36} radius={10}/>
          <Skeleton width={36} height={36} radius={10}/>
        </div>
      </div>
      {/* Category chip skeleton */}
      <div style={{ padding: '4px 20px 8px', display: 'flex', gap: 8 }}>
        {[56, 44, 56, 44].map((w, i) => <Skeleton key={i} width={w} height={30} radius={15}/>)}
      </div>
      {/* Sport chip skeleton */}
      <div style={{ padding: '0 20px 12px', display: 'flex', gap: 8 }}>
        {[44, 44, 64, 44, 44].map((w, i) => <Skeleton key={i} width={w} height={26} radius={13}/>)}
      </div>
      {/* Listing card skeletons — 2-col grid */}
      <div style={{ flex: 1, padding: '0 20px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, overflowY: 'auto' }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton-shimmer" style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--grey100)' }}>
            <Skeleton width="100%" height={0} radius={0} style={{ paddingBottom: '100%', display: 'block' }}/>
            <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skeleton width="80%" height={14} radius={4}/>
              <Skeleton width="55%" height={12} radius={4}/>
              <Skeleton width="40%" height={16} radius={4}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  </Phone>
);

/* ------------------------------------------------------------------ */
/* m06-mb-state-empty — Marketplace wireframe + 상품 없음              */
/* ------------------------------------------------------------------ */
const M06MobileStateEmpty = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <AppBar title="장터" trailing={
        <button className="tm-btn-icon" aria-label="검색"><Icon name="search" size={18}/></button>
      }/>
      {/* Category filter — preserved wireframe */}
      <div style={{ padding: '0 20px 8px', display: 'flex', gap: 6 }}>
        {M06_CATEGORIES.map((c, i) => <Chip key={c.id} active={i === 1} size="sm">{c.label}</Chip>)}
      </div>
      {/* Empty state */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--grey100)', display: 'grid', placeItems: 'center' }} aria-hidden="true">
          <Icon name="store" size={28} color="var(--grey400)"/>
        </div>
        <div>
          <div className="tm-text-heading">아직 중고 거래가 없어요</div>
          <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>사용하지 않는 장비를 팔거나<br/>필요한 용품을 구해보세요</div>
        </div>
        <div style={{ display: 'grid', gap: 8, marginTop: 8, width: '100%' }}>
          <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" style={{ minHeight: 44 }}>판매 등록하기</button>
          <button className="tm-btn tm-btn-outline tm-btn-md tm-btn-block" style={{ minHeight: 44 }}>다른 카테고리 보기</button>
        </div>
      </div>
      <BottomNav active="marketplace"/>
    </div>
  </Phone>
);

/* ------------------------------------------------------------------ */
/* m06-mb-state-error — Marketplace wireframe + retry CTA + toast      */
/* ------------------------------------------------------------------ */
const M06MobileStateError = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <AppBar title="장터"/>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16, textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--red50)', color: 'var(--red500)', display: 'grid', placeItems: 'center' }} aria-hidden="true">
          <Icon name="close" size={24}/>
        </div>
        <div>
          <div className="tm-text-heading">장터를 불러올 수 없어요</div>
          <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>네트워크가 불안정해요.<br/>잠시 후 다시 시도해주세요.</div>
        </div>
        <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" style={{ marginTop: 8, minHeight: 44 }}>다시 시도</button>
      </div>
      {/* Toast demo */}
      <div style={{ position: 'absolute', bottom: 80, left: 20, right: 20 }}>
        <div style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--grey900)', color: 'var(--static-white)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="close" size={16} color="var(--red500)" aria-hidden="true"/>
          <div className="tm-text-label" style={{ color: 'var(--static-white)', flex: 1 }}>연결 오류 — 재시도</div>
        </div>
      </div>
    </div>
  </Phone>
);

/* ------------------------------------------------------------------ */
/* m06-mb-state-sold-out — 판매 완료 overlay on detail                 */
/* ------------------------------------------------------------------ */
const M06MobileStateSoldOut = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--grey100)' }}>
        <button style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none' }} className="tm-pressable" aria-label="뒤로">
          <Icon name="chevL" size={22}/>
        </button>
        <div style={{ flex: 1, textAlign: 'center' }} className="tm-text-body-lg">상품 상세</div>
        <div style={{ width: 40 }} aria-hidden="true"/>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Photo with sold-out overlay */}
        <div style={{ position: 'relative', width: '100%', height: 280, background: 'var(--grey100)', display: 'grid', placeItems: 'center' }}>
          <Icon name="store" size={48} color="var(--grey300)" aria-hidden="true"/>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(25,31,40,0.52)', display: 'grid', placeItems: 'center' }} role="status" aria-label="판매 완료">
            <div style={{ background: 'var(--grey900)', color: 'var(--static-white)', padding: '8px 24px', borderRadius: 999, fontWeight: 700 }} className="tm-text-body-lg">판매 완료</div>
          </div>
        </div>
        <div style={{ padding: '20px 20px 0' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <Badge tone="grey" size="sm">중고</Badge>
            <Badge tone="grey" size="sm">풋살</Badge>
          </div>
          <div className="tm-text-heading" style={{ color: 'var(--text-muted)' }}>풋살화 나이키 팬텀 260</div>
          <div className="tm-text-caption" style={{ marginTop: 6, color: 'var(--text-caption)' }}>강남구 신논현동 · 3일 전 판매 완료</div>
          {/* Similar items */}
          <div style={{ marginTop: 20 }}>
            <SectionTitle title="비슷한 상품"/>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {M06_LISTINGS.slice(0, 2).map((item) => (
                <M06ListingRow key={item.id} item={item}/>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div style={{ padding: '12px 20px 28px', borderTop: '1px solid var(--grey100)' }}>
        <button className="tm-btn tm-btn-outline tm-btn-lg tm-btn-block" style={{ minHeight: 44 }} disabled>이미 판매된 상품이에요</button>
      </div>
    </div>
  </Phone>
);

/* ------------------------------------------------------------------ */
/* m06-mb-components — M06 primitives inventory                        */
/* ------------------------------------------------------------------ */
const M06ComponentsBoard = ({ viewport }) => {
  const w = viewport === 'mb' ? M06_MB_W : viewport === 'tb' ? M06_TB_W : M06_DT_W;
  const h = viewport === 'mb' ? M06_MB_H : viewport === 'tb' ? M06_TB_H : M06_DT_H;
  const vLabel = viewport === 'mb' ? '모바일' : viewport === 'tb' ? '태블릿' : '데스크탑';
  return (
    <div style={{ width: w, height: h, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflow: 'hidden' }}>
      <Badge tone="blue" size="sm">{`m06-${viewport || 'mb'}-components`}</Badge>
      <div className="tm-text-title" style={{ marginTop: 8 }}>M06 {vLabel} · 사용 컴포넌트</div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>장터 화면이 사용하는 production primitives</div>
      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        {/* ListingCard — canonical from screens-other.jsx */}
        <ComponentSwatch label="ListingCard (canonical) · 2-col grid tile">
          <M06HotListingCard item={M06_LISTINGS[0]}/>
        </ComponentSwatch>
        {/* MoneyRow — canonical signature component */}
        <ComponentSwatch label="MoneyRow (signature) · label + amount">
          <div style={{ width: '100%' }}>
            <MoneyRow label="판매가" amount={45000}/>
            <MoneyRow label="안전결제 수수료" amount={2250} sub="거래금액의 5%"/>
            <MoneyRow label="총 결제금액" amount={47250} strong/>
          </div>
        </ComponentSwatch>
        {/* OrderStateChip — 6 states */}
        <ComponentSwatch label="OrderStateChip · 6 states">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {M06_ORDER_STATES.map((s) => <M06OrderStateChip key={s.key} stateKey={s.key}/>)}
          </div>
        </ComponentSwatch>
        {/* EscrowBadge */}
        <ComponentSwatch label="EscrowBadge · 안전거래 표시">
          <M06EscrowBadge held={false}/>
          <M06EscrowBadge held={true}/>
        </ComponentSwatch>
        {/* SellerActions */}
        <ComponentSwatch label="SellerActions · paid / shipped CTA">
          <M06SellerActions state="paid"/>
          <M06SellerActions state="shipped"/>
        </ComponentSwatch>
        {/* ConfirmReceiptCTA */}
        <ComponentSwatch label="ConfirmReceiptCTA · 구매자 수령 확인 + 자동정산 D-N">
          <div style={{ width: 240 }}><M06ConfirmReceiptCTA daysLeft={5}/></div>
        </ComponentSwatch>
        {/* FilterChip */}
        <ComponentSwatch label="FilterChip · category (중고/대여/공구) + sport">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {M06_CATEGORIES.map((c, i) => <Chip key={c.id} active={i === 1} size="sm">{c.label}</Chip>)}
            {M06_SPORT_CHIPS.slice(0, 4).map((c, i) => <Chip key={c.id} active={i === 1} size="sm">{c.label}</Chip>)}
          </div>
        </ComponentSwatch>
        {/* Badge type tones */}
        <ComponentSwatch label="Badge · 거래 타입 tone (grey/green/orange)">
          <Badge tone="grey" size="sm">중고</Badge>
          <Badge tone="green" size="sm">대여</Badge>
          <Badge tone="orange" size="sm">공구</Badge>
          <Badge tone="blue" size="sm">풋살</Badge>
          <Badge tone="red" size="sm">판매완료</Badge>
        </ComponentSwatch>
        {/* Skeleton */}
        <ComponentSwatch label="Skeleton · listing card placeholder">
          <div className="skeleton-shimmer" style={{ width: 160, height: 160, borderRadius: 14, background: 'var(--grey100)' }} aria-label="로딩 중"/>
        </ComponentSwatch>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* m06-mb-assets — M06 design token inventory                          */
/* ------------------------------------------------------------------ */
const M06AssetsBoard = () => (
  <div style={{ width: M06_MB_W, height: M06_MB_H, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflow: 'hidden' }}>
    <Badge tone="blue" size="sm">m06-mb-assets</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M06 모바일 · 사용 토큰</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>장터 화면에서 실제로 쓰는 디자인 토큰 인벤토리</div>
    <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
      <AssetSwatch label="Color · 가격 tone (price-strong)">
        <ColorSwatch token="text-strong" value="var(--text-strong)"/>
        <ColorSwatch token="blue500" value="var(--blue500)"/>
      </AssetSwatch>
      <AssetSwatch label="Color · 거래 타입 badge tone">
        <ColorSwatch token="grey100 (중고)" value="var(--grey100)"/>
        <ColorSwatch token="green50 (대여)" value="var(--green50)"/>
        <ColorSwatch token="orange50 (공구)" value="var(--orange50)"/>
      </AssetSwatch>
      <AssetSwatch label="Color · 주문 상태 badge">
        <ColorSwatch token="orange50 (결제대기)" value="var(--orange50)"/>
        <ColorSwatch token="blue50 (배송중)" value="var(--blue50)"/>
        <ColorSwatch token="green50 (거래완료)" value="var(--green50)"/>
        <ColorSwatch token="red50 (분쟁)" value="var(--red50)"/>
      </AssetSwatch>
      <AssetSwatch label="Color · neutral hierarchy">
        <ColorSwatch token="grey50"  value="var(--grey50)"/>
        <ColorSwatch token="grey100" value="var(--grey100)"/>
        <ColorSwatch token="grey200" value="var(--grey200)"/>
        <ColorSwatch token="grey700" value="var(--grey700)"/>
        <ColorSwatch token="grey900" value="var(--grey900)"/>
      </AssetSwatch>
      <AssetSwatch label="Type · 사용 단계">
        <span className="tm-text-heading">heading</span>
        <span className="tm-text-body-lg">body-lg</span>
        <span className="tm-text-body">body</span>
        <span className="tm-text-label">label</span>
        <span className="tm-text-caption">caption</span>
        <span className="tm-text-micro">micro</span>
      </AssetSwatch>
      <AssetSwatch label="Spacing · 4-multiple">
        {[8, 12, 16, 20, 24, 32].map((n) => (
          <Badge key={n} tone="grey" size="sm">{`${n}px`}</Badge>
        ))}
      </AssetSwatch>
      <AssetSwatch label="Radius">
        <Badge tone="grey" size="sm">r-14 · listing card</Badge>
        <Badge tone="grey" size="sm">r-pill · chip/badge</Badge>
        <Badge tone="grey" size="sm">r-12 · form input</Badge>
      </AssetSwatch>
      <AssetSwatch label="Motion token · 사용">
        <Badge tone="grey" size="sm">dur-fast 120ms · card tap</Badge>
        <Badge tone="grey" size="sm">dur-base 180ms · filter chip</Badge>
        <Badge tone="grey" size="sm">sk-shimmer 1.4s · skeleton</Badge>
        <Badge tone="grey" size="sm">expo 280ms · sheet open</Badge>
      </AssetSwatch>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* m06-tb-motion — motion contract board (tablet width)                */
/* ------------------------------------------------------------------ */
const M06MotionBoard = () => (
  <div style={{ width: M06_MB_W, height: M06_MB_H, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)' }}>
    <Badge tone="blue" size="sm">m06-mb-motion</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M06 모바일 · motion contract</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>장터에서 사용하는 micro-interaction 가이드</div>
    <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
      <ListItem
        title="Listing card tap"
        sub="카드 터치 → scale(0.98) 120ms ease-out-quart → 상세로 push"
        trailing={<Badge tone="grey" size="sm">tap</Badge>}
      />
      <ListItem
        title="Photo carousel swipe"
        sub="이미지 좌우 슬라이드 → translate3d 200ms cubic-bezier(.25,.46,.45,.94)"
        trailing={<Badge tone="grey" size="sm">swipe</Badge>}
      />
      <ListItem
        title="Filter chip select"
        sub="카테고리/종목 선택 → background + color 120ms · haptic feedback"
        trailing={<Badge tone="grey" size="sm">chip</Badge>}
      />
      <ListItem
        title="Heart / bookmark"
        sub="관심 등록 → scale(0.9→1.1→1) 200ms spring bounce"
        trailing={<Badge tone="grey" size="sm">heart</Badge>}
      />
      <ListItem
        title="Skeleton shimmer"
        sub="listing 로드 → 1.4s linear infinite gradient shimmer"
        trailing={<Badge tone="grey" size="sm">load</Badge>}
      />
      <ListItem
        title="Sticky CTA reveal"
        sub="스크롤 다운 → slide-up 280ms + opacity 0→1"
        trailing={<Badge tone="grey" size="sm">cta</Badge>}
      />
      <ListItem
        title="Escrow status pulse"
        sub="에스크로 보호 배지 → badge-pulse 2s ease-in-out infinite"
        trailing={<Badge tone="blue" size="sm">pulse</Badge>}
      />
      <ListItem
        title="Dispute sheet open"
        sub="분쟁 신청 bottom sheet → tm-animate-sheet 280ms expo"
        trailing={<Badge tone="red" size="sm">sheet</Badge>}
      />
      <ListItem
        title="Order state update toast"
        sub="주문 상태 변경 → tm-animate-enter 280ms + 2.5s auto-dismiss"
        trailing={<Badge tone="orange" size="sm">toast</Badge>}
      />
      <ListItem
        title="Reduced motion"
        sub="prefers-reduced-motion → 모든 transition 0.01ms, 애니메이션 disable"
        trailing={<Badge tone="grey" size="sm">a11y</Badge>}
      />
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Export — preserve every name exactly                                 */
/* ------------------------------------------------------------------ */
Object.assign(window, {
  M06MobileMain,
  M06TabletMain,
  M06DesktopMain,
  M06MobileDetail,
  M06MobileCreate,
  M06MobileFlowOrder,
  M06MobileFlowDispute,
  M06MobileStateLoading,
  M06MobileStateEmpty,
  M06MobileStateSoldOut,
  M06MobileStateError,
  M06ComponentsBoard,
  M06AssetsBoard,
  M06MotionBoard,
});
