/* fix32 — M07 시설(Venues) grid.
   ID schema: m07-{mb|tb|dt}-{main|detail|flow|state|components|assets|motion}[-{sub}]
   Routes: /venues  /venues/[id]  /venues/[id]/booking
   Light-only. Canonical: Venues, VenueCard (screens-other), VenueBooking (screens-deep),
   VenueDetail (screens-more), VenuesMap, VenuesWeek (screens-variants2),
   DesktopVenues, DesktopVenueDetail (screens-desktop2),
   VenuesStateEdgeBoard, VenuesBookingSlotConflictBoard,
   VenuesMapPermissionBoard, VenuesClosurePriceEdgeBoard (screens-readiness).
   Depends on tokens.jsx + signatures.jsx + data.jsx. */

const M07_MB_W = 375;
const M07_MB_H = 812;
const M07_TB_W = 768;
const M07_TB_H = 1024;
const M07_DT_W = 1280;
const M07_DT_H = 820;

/* ──────────────────────────────────────────────────────────
   Local prefix helpers (M07* only — no collisions)
────────────────────────────────────────────────────────── */

/* M07MapCanvas — map tile using SVG roads + price pins, zero raw hex */
const M07MapCanvas = ({ height = 220, pinCount = 5 }) => {
  const pins = [
    { x: 18, y: 28, price: '180k', sel: true },
    { x: 62, y: 44, price: '60k',  sel: false },
    { x: 38, y: 68, price: '45k',  sel: false },
    { x: 76, y: 30, price: '120k', sel: false },
    { x: 52, y: 58, price: '18k',  sel: false },
  ].slice(0, pinCount);
  return (
    <div style={{ position: 'relative', height, background: 'var(--blue50)', overflow: 'hidden' }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        {/* roads */}
        <path d="M 0 60 Q 150 50 375 80" stroke="var(--static-white)" strokeWidth="10" fill="none" opacity=".8"/>
        <path d="M 80 0 Q 100 220 180 440" stroke="var(--static-white)" strokeWidth="8" fill="none" opacity=".7"/>
        <path d="M 0 160 L 375 140" stroke="var(--static-white)" strokeWidth="6" fill="none" opacity=".6"/>
        {/* park */}
        <rect x="200" y="50" width="90" height="60" rx="12" fill="var(--green50)" opacity=".8"/>
        {/* grid overlay */}
        {[0.25, 0.5, 0.75].map((r) => (
          <line key={r} x1="0" y1={r * height} x2="375" y2={r * height} stroke="var(--border)" strokeWidth=".5" opacity=".4"/>
        ))}
        {[0.33, 0.66].map((c) => (
          <line key={c} x1={c * 375} y1="0" x2={c * 375} y2={height} stroke="var(--border)" strokeWidth=".5" opacity=".4"/>
        ))}
      </svg>
      {/* my location */}
      <div style={{
        position: 'absolute', left: '46%', top: '54%',
        width: 16, height: 16, borderRadius: '50%',
        background: 'var(--blue500)', border: '3px solid var(--static-white)',
        boxShadow: '0 0 0 6px var(--blue-alpha-10)',
        transform: 'translate(-50%,-50%)',
      }}/>
      {/* price pins */}
      {pins.map((p, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${p.x}%`, top: `${p.y}%`,
          transform: 'translate(-50%, -100%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <div className="tm-text-micro tm-tabular" style={{
            padding: '4px 8px', borderRadius: 14, fontWeight: 800,
            background: p.sel ? 'var(--grey900)' : 'var(--static-white)',
            color: p.sel ? 'var(--static-white)' : 'var(--text-strong)',
            border: p.sel ? 'none' : '1.5px solid var(--border)',
            boxShadow: '0 2px 8px rgba(0,0,0,.12)',
            whiteSpace: 'nowrap',
          }}>
            {p.price}
          </div>
          <div style={{ width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: `6px solid ${p.sel ? 'var(--grey900)' : 'var(--static-white)'}`, marginTop: -1 }}/>
        </div>
      ))}
      {/* map controls */}
      <div style={{ position: 'absolute', top: 12, right: 12, background: 'var(--static-white)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,.1)' }}>
        <button aria-label="지도 확대" style={{ width: 36, height: 36, borderBottom: '1px solid var(--border)', display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer' }}>
          <Icon name="plus" size={16} color="var(--grey700)"/>
        </button>
        <button aria-label="지도 축소" style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer' }}>
          <Icon name="minus" size={16} color="var(--grey700)"/>
        </button>
      </div>
    </div>
  );
};

/* M07SportChips — sport filter chip row */
const M07SportChips = ({ active = 0 }) => (
  <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 20px 12px' }}>
    {['전체', '⚽ 축구장', '🏃 풋살장', '🏀 농구장', '🎾 테니스장', '🏸 배드민턴장'].map((label, i) => (
      <HapticChip key={label} active={i === active}>{label}</HapticChip>
    ))}
  </div>
);

/* M07StarRating — inline star row */
const M07StarRating = ({ rating = 4.8, reviews = 0 }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
    <Icon name="star" size={13} color="var(--orange500)"/>
    <span className="tm-text-caption tm-tabular" style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{rating}</span>
    {reviews > 0 && <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>({reviews})</span>}
  </div>
);

/* M07VenueListCard — compact venue card for list view using VENUES data shape */
const M07VenueListCard = ({ v }) => (
  <Card pad={0} interactive style={{ overflow: 'hidden' }}>
    <div style={{ height: 140, background: `var(--grey100) url(${v.img}) center/cover` }}/>
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <Badge tone="grey">{v.type}</Badge>
        {v.openNow && <Badge tone="green" size="sm">지금 가능</Badge>}
        <div style={{ flex: 1 }}/>
        <span className="tm-text-caption tm-tabular" style={{ color: 'var(--text-muted)' }}>{v.dist}</span>
      </div>
      <div className="tm-text-body-lg" style={{ fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4 }}>{v.name}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <M07StarRating rating={v.rating} reviews={v.reviews}/>
        <div className="tm-text-label tm-tabular" style={{ fontWeight: 700, color: 'var(--text-strong)' }}>
          {v.price.toLocaleString()}원<span className="tm-text-caption" style={{ fontWeight: 400 }}>/{v.unit}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
        {v.facilities.slice(0, 3).map((f) => (
          <span key={f} className="tm-text-micro" style={{ fontWeight: 600, color: 'var(--text-muted)', background: 'var(--grey100)', borderRadius: 8, padding: '2px 8px' }}>{f}</span>
        ))}
      </div>
    </div>
  </Card>
);

/* M07SlotPicker — interactive slot grid (stateless for prototype) */
const M07SlotPicker = ({ selected = ['14:00'], booked = ['11:00', '13:00', '18:00', '19:00'] }) => {
  const hours = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00'];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
      {hours.map((h) => {
        const isBooked = booked.includes(h);
        const isSelected = selected.includes(h);
        return (
          <button
            key={h}
            aria-label={`${h} 슬롯 ${isBooked ? '예약불가' : isSelected ? '선택됨' : '선택가능'}`}
            disabled={isBooked}
            style={{
              height: 44, borderRadius: 10, border: 'none', cursor: isBooked ? 'default' : 'pointer',
              background: isSelected ? 'var(--blue500)' : isBooked ? 'var(--grey100)' : 'var(--bg)',
              outline: isSelected ? 'none' : `1px solid ${isBooked ? 'var(--border)' : 'var(--border)'}`,
              color: isSelected ? 'var(--static-white)' : isBooked ? 'var(--grey400)' : 'var(--text-strong)',
              fontWeight: 700,
              textDecoration: isBooked ? 'line-through' : 'none',
              transition: 'background-color 120ms, color 120ms',
            }}
            className="tm-text-label tm-tabular"
          >{h}</button>
        );
      })}
    </div>
  );
};

/* M07DayStrip — 14-day horizontal scroll strip */
const M07DayStrip = ({ selected = 5 }) => {
  const dayLabels = ['월','화','수','목','금','토','일'];
  const days = Array.from({ length: 14 }, (_, i) => 3 + i);
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 20px' }}>
      {days.map((d) => (
        <button
          key={d}
          aria-label={`${d}일 선택`}
          style={{
            minWidth: 52, padding: '12px 8px', borderRadius: 10, textAlign: 'center', flexShrink: 0,
            background: d === selected ? 'var(--blue500)' : 'var(--grey50)',
            color: d === selected ? 'var(--static-white)' : 'var(--text-strong)',
            border: d === selected ? 'none' : '1px solid var(--border)',
            cursor: 'pointer',
          }}
        >
          <div className="tm-text-micro" style={{ fontWeight: 700, opacity: d === selected ? 0.85 : 0.7 }}>{dayLabels[(d + 4) % 7]}</div>
          <div className="tm-text-body-lg tm-tabular" style={{ fontWeight: 800, marginTop: 2 }}>{d}</div>
        </button>
      ))}
    </div>
  );
};

/* M07ReviewRow — single review list item */
const M07ReviewRow = ({ author = '김민준', rating = 5, text = '시설이 깔끔합니다.', date = '3일 전' }) => (
  <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--grey200)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <span className="tm-text-caption" style={{ fontWeight: 700 }}>{author[0]}</span>
      </div>
      <div style={{ flex: 1 }}>
        <div className="tm-text-label">{author}</div>
        <div className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>{date}</div>
      </div>
      <div style={{ display: 'flex', gap: 2 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Icon key={i} name="star" size={12} color={i < rating ? 'var(--orange500)' : 'var(--grey200)'}/>
        ))}
      </div>
    </div>
    <div className="tm-text-body" style={{ paddingLeft: 40, color: 'var(--text-muted)', lineHeight: 1.55 }}>{text}</div>
  </div>
);

/* M07BookingTimeline — today's booked slots */
const M07BookingTimeline = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    {[
      { slot: '14:00 ~ 16:00', team: '강남 FC', accent: 'var(--blue500)' },
      { slot: '18:00 ~ 20:00', team: '목동 킥커스', accent: 'var(--green500)' },
    ].map((b, i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--grey50)', borderRadius: 12, border: '1px solid var(--border)' }}>
        <div style={{ width: 4, height: 36, borderRadius: 2, background: b.accent, flexShrink: 0 }}/>
        <div>
          <div className="tm-text-label tm-tabular">{b.slot}</div>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{b.team}</div>
        </div>
      </div>
    ))}
  </div>
);

/* M07StickyCTA — bottom action bar */
const M07StickyCTA = ({ label, sub, disabled = false }) => (
  <div style={{ padding: '12px 20px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
    {sub && <div className="tm-text-caption" style={{ textAlign: 'center', marginBottom: 8, color: 'var(--text-muted)' }}>{sub}</div>}
    <button
      disabled={disabled}
      aria-label={label}
      className={`tm-btn ${disabled ? 'tm-btn-neutral' : 'tm-btn-primary'} tm-btn-lg tm-btn-block`}
      style={{ minHeight: 52 }}
    >{label}</button>
  </div>
);

/* M07ComponentSwatch — inventory row */
const M07ComponentSwatch = ({ label, children }) => (
  <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
    <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginBottom: 8 }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</div>
  </div>
);

/* M07AssetSwatch — token row */
const M07AssetSwatch = ({ label, children }) => (
  <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
    <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginBottom: 8 }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</div>
  </div>
);

/* M07ColorDot — single color swatch */
const M07ColorDot = ({ token, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
    <div style={{ width: 32, height: 32, borderRadius: 10, background: value, border: '1px solid var(--border)' }}/>
    <span className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>{token}</span>
  </div>
);

/* M07WeeklyGrid — heat-map style weekly availability grid */
const M07WeeklyGrid = () => {
  const hours = ['09','10','11','12','13','14','15','16','17','18','19','20','21'];
  const days = ['월','화','수','목','금','토','일'];
  const cellColors = ['var(--blue50)', 'var(--red50)', 'var(--yellow500)'];
  const heat = days.map((_, di) =>
    hours.map((_, hi) => {
      if (di >= 5 && hi >= 8) return 1;
      if (di >= 5) return hi % 2 === 0 ? 1 : 2;
      if (hi >= 8) return hi % 3 === 0 ? 1 : 2;
      return hi % 7 === 0 ? 1 : 0;
    })
  );
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 12, overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `28px repeat(${hours.length}, 1fr)`, gap: 3 }}>
        <div/>
        {hours.map((h) => (
          <div key={h} className="tm-text-micro tm-tabular" style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text-caption)' }}>{h}</div>
        ))}
        {days.map((d, di) => (
          <React.Fragment key={d}>
            <div className="tm-text-micro" style={{ fontWeight: 700, alignSelf: 'center', color: di >= 5 ? 'var(--red500)' : 'var(--text-strong)' }}>{d}</div>
            {hours.map((_, hi) => (
              <div key={hi} style={{ aspectRatio: '1/1', background: cellColors[heat[di][hi]], borderRadius: 3, minHeight: 18, cursor: heat[di][hi] === 0 ? 'pointer' : 'default' }}/>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   m07-mb-main — 시설 예약 (venue-book canonical, Venues base)
   Canonical refs: Venues (screens-other), VenueBooking (screens-deep)
═══════════════════════════════════════════════════════════════ */
const M07MobileMain = () => (
  <Phone>
    <AppBar
      title="시설 찾기"
      trailing={[
        <button key="s" aria-label="검색" className="tm-btn tm-btn-ghost tm-btn-icon" style={{ minHeight: 44 }}><Icon name="search" size={22} color="var(--grey800)"/></button>,
        <button key="f" aria-label="필터" className="tm-btn tm-btn-ghost tm-btn-icon" style={{ minHeight: 44 }}><Icon name="filter" size={22} color="var(--grey800)"/></button>,
      ]}
    />
    <M07SportChips active={0}/>
    {/* view toggle */}
    <div style={{ display: 'flex', gap: 4, padding: '0 20px 12px' }}>
      {[['list', '목록'], ['map', '지도'], ['week', '주간']].map(([v, label], i) => (
        <button key={v} style={{
          flex: 1, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer',
          fontWeight: 700,
          background: i === 0 ? 'var(--grey900)' : 'var(--grey100)',
          color: i === 0 ? 'var(--static-white)' : 'var(--grey700)',
          transition: 'background-color 120ms',
        }} className="tm-text-label">{label}</button>
      ))}
    </div>
    <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>내 주변 · 6곳 찾음</span>
        <button className="tm-btn tm-btn-ghost tm-btn-sm" style={{ gap: 4 }}>
          거리순 <Icon name="chevD" size={12}/>
        </button>
      </div>
      {VENUES.map((v) => <M07VenueListCard key={v.id} v={v}/>)}
    </div>
    <TabBar active="venues"/>
  </Phone>
);

/* ═══════════════════════════════════════════════════════════════
   m07-tb-main — 태블릿 (768) map + list split
   Canonical refs: VenuesMap (screens-variants2)
═══════════════════════════════════════════════════════════════ */
const M07TabletMain = () => (
  <div style={{ width: M07_TB_W, height: M07_TB_H, background: 'var(--bg)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font)', overflow: 'hidden' }}>
    {/* header */}
    <div style={{ padding: '20px 32px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16 }}>
      <div className="tm-text-heading">시설 예약</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, height: 44, borderRadius: 12, background: 'var(--grey100)', padding: '0 16px' }}>
        <Icon name="search" size={18} color="var(--text-caption)"/>
        <span className="tm-text-body" style={{ color: 'var(--text-placeholder)' }}>시설 이름 또는 지역</span>
      </div>
      <button aria-label="필터" className="tm-btn tm-btn-outline tm-btn-md" style={{ gap: 8, minHeight: 44 }}>
        <Icon name="filter" size={16}/> 필터
      </button>
    </div>
    {/* sport chips */}
    <div style={{ padding: '12px 32px', display: 'flex', gap: 8, borderBottom: '1px solid var(--border)' }}>
      {['전체', '⚽ 축구', '🏃 풋살', '🏀 농구', '🎾 테니스', '🏸 배드민턴'].map((c, i) => (
        <HapticChip key={c} active={i === 0}>{c}</HapticChip>
      ))}
    </div>
    {/* map + list */}
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 320px', overflow: 'hidden' }}>
      <M07MapCanvas height={M07_TB_H - 160}/>
      <div style={{ borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <span className="tm-text-label" style={{ color: 'var(--text-muted)' }}>근처 6곳</span>
        </div>
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
          {VENUES.slice(0, 4).map((v, i) => (
            <div key={v.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, cursor: 'pointer', background: i === 0 ? 'var(--blue-alpha-08)' : 'transparent' }}>
              <div style={{ width: 64, height: 64, borderRadius: 10, background: `var(--grey100) url(${v.img}) center/cover`, flexShrink: 0 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                  <Badge tone="grey" size="sm">{v.type}</Badge>
                  {v.openNow && <Badge tone="green" size="sm">가능</Badge>}
                </div>
                <div className="tm-text-label" style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <M07StarRating rating={v.rating}/>
                  <span className="tm-text-label tm-tabular" style={{ fontWeight: 700 }}>{v.price.toLocaleString()}원/{v.unit}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   m07-dt-main — 데스크탑 (1280) DesktopVenues canonical
   Canonical: DesktopVenues (screens-desktop2)
═══════════════════════════════════════════════════════════════ */
const M07DesktopMain = () => (
  <div style={{ width: M07_DT_W, height: M07_DT_H, fontFamily: 'var(--font)', overflow: 'hidden' }}>
    <DesktopVenues/>
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   m07-mb-detail — venue-detail-v2 canonical
   Canonical: VenueDetail (screens-more)
═══════════════════════════════════════════════════════════════ */
const M07MobileDetail = () => (
  <Phone>
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100 }}>
        {/* hero photo */}
        <div style={{ position: 'relative', height: 260, background: `var(--grey100) url(${VENUES[0].img}) center/cover` }}>
          <div style={{ position: 'absolute', top: 8, left: 8 }}>
            <button aria-label="뒤로" className="tm-btn tm-btn-icon tm-pressable" style={{ width: 44, height: 44, borderRadius: 22, background: 'rgba(0,0,0,.38)', color: 'var(--static-white)' }}>
              <Icon name="chevL" size={22}/>
            </button>
          </div>
          <button aria-label="공유" style={{ position: 'absolute', top: 8, right: 8, width: 44, height: 44, borderRadius: 22, background: 'rgba(0,0,0,.38)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', border: 'none', cursor: 'pointer' }}>
            <Icon name="share" size={20}/>
          </button>
        </div>

        {/* title */}
        <div style={{ padding: '16px 20px 12px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <Badge tone="grey">{VENUES[0].type}</Badge>
            <Badge tone="green" size="sm">지금 가능</Badge>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="tm-text-subhead" style={{ fontWeight: 800 }}>{VENUES[0].name}</div>
              <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>{VENUES[0].address}</div>
            </div>
            <button aria-label="찜하기" style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer' }}>
              <Icon name="heart" size={22} color="var(--grey400)"/>
            </button>
          </div>
          <div style={{ marginTop: 8 }}>
            <M07StarRating rating={VENUES[0].rating} reviews={VENUES[0].reviews}/>
          </div>
        </div>

        {/* price */}
        <div style={{ padding: '0 20px 16px' }}>
          <div style={{ background: 'var(--blue50)', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="tm-text-body">시간당 이용 요금</span>
            <div>
              <NumberDisplay value={VENUES[0].price} unit="원" size={20} color="var(--blue500)"/>
            </div>
          </div>
        </div>

        {/* divider */}
        <div style={{ height: 8, background: 'var(--grey50)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}/>

        {/* facilities */}
        <div style={{ padding: '16px 20px' }}>
          <div className="tm-text-label" style={{ marginBottom: 12 }}>편의시설</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {VENUES[0].facilities.map((f) => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
                <Icon name="check" size={14} color="var(--green500)" stroke={2.5}/>
                <span className="tm-text-label">{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* today bookings */}
        <div style={{ padding: '0 20px 16px' }}>
          <div className="tm-text-label" style={{ marginBottom: 12 }}>오늘 예약 현황</div>
          <M07BookingTimeline/>
        </div>

        {/* divider */}
        <div style={{ height: 8, background: 'var(--grey50)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}/>

        {/* reviews */}
        <div style={{ padding: '16px 20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div className="tm-text-label">이용 후기</div>
            <button className="tm-text-caption" style={{ color: 'var(--blue500)', background: 'none', border: 'none', cursor: 'pointer' }}>전체 보기</button>
          </div>
          <M07ReviewRow author="김민준" rating={5} text="시설이 깔끔하고 주차도 편했어요. 다음에 또 쓸게요!" date="3일 전"/>
          <M07ReviewRow author="이서연" rating={4} text="가격 대비 훌륭해요. 샤워실이 조금 좁은 게 아쉽네요." date="1주 전"/>
          <M07ReviewRow author="박지훈" rating={5} text="조명 밝고 잔디 상태 최고입니다. 팀 훈련에 딱 좋아요." date="2주 전"/>
        </div>
      </div>
      <M07StickyCTA label="예약하기"/>
    </div>
  </Phone>
);

/* ═══════════════════════════════════════════════════════════════
   m07-mb-flow-booking — venue-book canonical slot picker
   Canonical: VenueBooking (screens-deep)
═══════════════════════════════════════════════════════════════ */
const M07MobileFlowBooking = () => (
  <Phone>
    <AppBar
      title="시설 예약"
      leading={<button aria-label="뒤로" className="tm-btn tm-btn-ghost tm-btn-icon"><Icon name="chevL" size={24} color="var(--grey800)"/></button>}
    />
    {/* venue summary */}
    <div style={{ padding: '8px 20px 4px' }}>
      <div className="tm-text-body-lg" style={{ fontWeight: 700 }}>{VENUES[0].name}</div>
      <div className="tm-text-caption" style={{ marginTop: 2, color: 'var(--text-muted)' }}>{VENUES[0].type} · 시간당 {VENUES[0].price.toLocaleString()}원</div>
    </div>
    {/* date strip */}
    <M07DayStrip selected={5}/>
    {/* slot grid */}
    <div style={{ flex: 1, overflow: 'auto', padding: '4px 20px 20px' }}>
      <div className="tm-text-label" style={{ marginBottom: 12, color: 'var(--text-muted)' }}>시간 선택 (중복 가능)</div>
      <M07SlotPicker selected={['14:00', '15:00']} booked={['11:00', '13:00', '18:00', '19:00']}/>
      {/* legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
        {[['var(--blue500)', '선택'], ['var(--bg)', '가능'], ['var(--grey100)', '불가']].map(([bg, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 14, height: 14, borderRadius: 4, background: bg, border: `1px solid ${bg === 'var(--bg)' ? 'var(--border)' : 'transparent'}` }}/>
            <span className="tm-text-caption">{label}</span>
          </div>
        ))}
      </div>
      {/* price summary */}
      <div style={{ padding: 16, background: 'var(--grey50)', borderRadius: 12, marginTop: 20 }}>
        <MoneyRow label="선택 시간" amount="2시간" unit="" sub="5월 5일(월)"/>
        <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }}/>
        <MoneyRow label="예상 금액" amount={VENUES[0].price * 2} strong accent/>
      </div>
      {/* notice */}
      <div style={{ background: 'var(--orange50)', borderRadius: 12, padding: '12px 16px', marginTop: 12, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Icon name="info" size={16} color="var(--orange500)" style={{ flexShrink: 0, marginTop: 1 }}/>
        <span className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.55 }}>예약 확정 후 24시간 이내 취소 시 전액 환불됩니다.</span>
      </div>
    </div>
    <M07StickyCTA
      label={`결제하기 · ${(VENUES[0].price * 2).toLocaleString()}원`}
      sub="5월 5일(월) 14:00 ~ 16:00"
    />
  </Phone>
);

/* ═══════════════════════════════════════════════════════════════
   m07-mb-state-loading — skeleton wireframe
═══════════════════════════════════════════════════════════════ */
const M07MobileStateLoading = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* header skeleton */}
      <div style={{ padding: '12px 20px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton width={80} height={24} radius={8}/>
        <div style={{ display: 'flex', gap: 4 }}>
          <Skeleton width={44} height={44} radius={12}/>
          <Skeleton width={44} height={44} radius={12}/>
        </div>
      </div>
      {/* chip row skeleton */}
      <div style={{ display: 'flex', gap: 8, padding: '0 20px 12px' }}>
        {[60, 80, 72, 68, 76].map((w, i) => (
          <Skeleton key={i} width={w} height={32} radius={999}/>
        ))}
      </div>
      {/* view toggle skeleton */}
      <div style={{ display: 'flex', gap: 4, padding: '0 20px 12px' }}>
        <Skeleton width="100%" height={36} radius={10}/>
        <Skeleton width="100%" height={36} radius={10}/>
        <Skeleton width="100%" height={36} radius={10}/>
      </div>
      {/* card skeletons */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <Skeleton width="100%" height={140} radius={0}/>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skeleton width={80} height={20} radius={6}/>
              <Skeleton width="70%" height={18} radius={6}/>
              <Skeleton width="50%" height={14} radius={6}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  </Phone>
);

/* ═══════════════════════════════════════════════════════════════
   m07-mb-state-empty — 시설 없음 상태 (EmptyState 패턴)
═══════════════════════════════════════════════════════════════ */
const M07MobileStateEmpty = () => (
  <Phone>
    <AppBar title="시설 찾기"/>
    <M07SportChips active={2}/>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', gap: 12 }}>
      <div style={{ width: 72, height: 72, borderRadius: 22, background: 'var(--grey100)', display: 'grid', placeItems: 'center' }}>
        <Icon name="pin" size={32} color="var(--grey400)"/>
      </div>
      <div className="tm-text-heading">이 지역에 시설이 없어요</div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>검색 반경을 넓히거나 다른 종목으로 바꿔보세요</div>
      <div style={{ display: 'grid', gap: 8, marginTop: 12, width: '100%' }}>
        <button aria-label="반경 넓히기" className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" style={{ minHeight: 52 }}>반경 넓히기 (10km)</button>
        <button aria-label="종목 바꾸기" className="tm-btn tm-btn-outline tm-btn-md tm-btn-block" style={{ minHeight: 44 }}>종목 바꾸기</button>
      </div>
    </div>
    <TabBar active="venues"/>
  </Phone>
);

/* ═══════════════════════════════════════════════════════════════
   m07-mb-state-permission — 위치 권한 거부
   Canonical ref: VenuesMapPermissionBoard (screens-readiness)
═══════════════════════════════════════════════════════════════ */
const M07MobileStatePermission = () => (
  <Phone>
    <AppBar title="시설 찾기"/>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* map with permission overlay */}
      <div style={{ position: 'relative', height: 240, background: 'var(--blue50)', overflow: 'hidden' }}>
        <M07MapCanvas height={240} pinCount={3}/>
        {/* permission overlay */}
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, padding: '16px 16px', borderRadius: 16, background: 'rgba(255,255,255,.96)', border: '1px solid var(--border)', boxShadow: '0 4px 20px rgba(0,0,0,.12)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--orange50)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon name="pin" size={20} color="var(--orange500)"/>
            </div>
            <div>
              <div className="tm-text-label" style={{ fontWeight: 700 }}>위치 권한이 꺼져 있어요</div>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2 }}>거리순 대신 선택 지역 기준으로 보여줍니다.</div>
            </div>
          </div>
        </div>
      </div>
      {/* fallback region list */}
      <div style={{ padding: '16px 20px', flex: 1, overflow: 'auto' }}>
        <div className="tm-text-label" style={{ marginBottom: 12 }}>지역을 선택하세요</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {REGIONS.slice(1, 7).map((r, i) => (
            <button key={r.id} aria-label={`${r.label} 지역 선택`} style={{ padding: '12px 16px', borderRadius: 12, border: `1px solid ${i === 0 ? 'var(--blue500)' : 'var(--border)'}`, background: i === 0 ? 'var(--blue50)' : 'var(--bg)', cursor: 'pointer', textAlign: 'left', minHeight: 44 }}>
              <div className="tm-text-label" style={{ fontWeight: 700, color: i === 0 ? 'var(--blue500)' : 'var(--text-strong)' }}>{r.label}</div>
              <div className="tm-text-caption" style={{ color: 'var(--text-caption)', marginTop: 2 }}>{r.count}곳</div>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
          <button aria-label="설정에서 위치 권한 허용" className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" style={{ minHeight: 52 }}>설정에서 위치 허용하기</button>
          <button aria-label="직접 주소 입력" className="tm-btn tm-btn-ghost tm-btn-md tm-btn-block" style={{ minHeight: 44 }}>직접 주소 입력</button>
        </div>
      </div>
    </div>
    <TabBar active="venues"/>
  </Phone>
);

/* ═══════════════════════════════════════════════════════════════
   m07-mb-state-sold-out — 예약 매진
   Canonical ref: VenuesStateEdgeBoard (screens-readiness)
═══════════════════════════════════════════════════════════════ */
const M07MobileStateSoldOut = () => (
  <Phone>
    <AppBar
      title={VENUES[0].name}
      leading={<button aria-label="뒤로" className="tm-btn tm-btn-ghost tm-btn-icon"><Icon name="chevL" size={24} color="var(--grey800)"/></button>}
    />
    <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px 24px' }}>
      {/* sold-out state card */}
      <Card pad={18} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Badge tone="grey">예약 마감</Badge>
            <div className="tm-text-heading" style={{ marginTop: 12 }}>5월 5일(월) 전체 마감</div>
          </div>
          <div style={{ width: 42, height: 42, borderRadius: 14, background: 'var(--grey100)', display: 'grid', placeItems: 'center' }}>
            <Icon name="calendar" size={20} color="var(--grey500)"/>
          </div>
        </div>
        <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.55 }}>이미 예약이 가득 찼어요. 다른 날짜를 선택해 보세요.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
          <div style={{ padding: 12, borderRadius: 12, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
            <div className="tm-text-caption" style={{ color: 'var(--text-caption)', fontWeight: 700 }}>상태</div>
            <div className="tm-text-label tm-tabular" style={{ marginTop: 4, fontWeight: 700 }}>전체 마감</div>
          </div>
          <div style={{ padding: 12, borderRadius: 12, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
            <div className="tm-text-caption" style={{ color: 'var(--text-caption)', fontWeight: 700 }}>대기자</div>
            <div className="tm-text-label tm-tabular" style={{ marginTop: 4, fontWeight: 700 }}>3명</div>
          </div>
        </div>
      </Card>
      {/* date strip — different day */}
      <div className="tm-text-label" style={{ marginBottom: 8 }}>다른 날짜를 선택하세요</div>
      <M07DayStrip selected={6}/>
      {/* all slots disabled */}
      <div style={{ marginTop: 8 }}>
        <M07SlotPicker selected={[]} booked={['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00']}/>
      </div>
      <div style={{ marginTop: 20, display: 'grid', gap: 8 }}>
        <button aria-label="다음 날 보기" className="tm-btn tm-btn-outline tm-btn-lg tm-btn-block" style={{ minHeight: 52 }}>다음 날 보기</button>
        <button aria-label="대기자 등록" className="tm-btn tm-btn-ghost tm-btn-md tm-btn-block" style={{ minHeight: 44 }}>대기자 등록</button>
      </div>
    </div>
  </Phone>
);

/* ═══════════════════════════════════════════════════════════════
   m07-mb-state-deadline — 예약 마감 임박
   Canonical ref: VenuesBookingSlotConflictBoard (screens-readiness)
═══════════════════════════════════════════════════════════════ */
const M07MobileStateDeadline = () => (
  <Phone>
    <AppBar
      title="시설 예약"
      leading={<button aria-label="뒤로" className="tm-btn tm-btn-ghost tm-btn-icon"><Icon name="chevL" size={24} color="var(--grey800)"/></button>}
    />
    {/* urgent banner */}
    <div style={{ margin: '8px 20px 4px', padding: '12px 16px', background: 'var(--red50)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--border)' }}>
      <Icon name="clock" size={20} color="var(--red500)"/>
      <div>
        <div className="tm-text-label" style={{ color: 'var(--red500)', fontWeight: 700 }}>마감까지 23분 남았어요</div>
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2 }}>선택한 슬롯이 곧 마감됩니다</div>
      </div>
    </div>
    <M07DayStrip selected={5}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '4px 20px 20px' }}>
      <M07SlotPicker selected={['19:00']} booked={['11:00','13:00','18:00','20:00']}/>
      <div style={{ padding: 16, background: 'var(--red50)', borderRadius: 12, marginTop: 20, border: '1px solid var(--border)' }}>
        <MoneyRow label="예상 금액" amount={VENUES[0].price} strong/>
        <div className="tm-text-caption" style={{ color: 'var(--red500)', fontWeight: 700, textAlign: 'right', marginTop: 4 }}>마감 임박 — 즉시 결제 권장</div>
      </div>
      <Toast type="info" msg="19:00 슬롯은 23분 내 마감됩니다."/>
    </div>
    <M07StickyCTA label="지금 바로 결제하기 · 마감 임박"/>
  </Phone>
);

/* ═══════════════════════════════════════════════════════════════
   m07-mb-components — M07 컴포넌트 인벤토리 (canonical primitives)
═══════════════════════════════════════════════════════════════ */
const M07MobileComponents = () => (
  <div style={{ width: M07_MB_W, minHeight: M07_MB_H, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)' }}>
    <Badge tone="blue" size="sm">m07-mb-components</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M07 모바일 · 컴포넌트 인벤토리</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>시설 화면이 사용하는 production primitives</div>
    <div style={{ marginTop: 16 }}>

      <M07ComponentSwatch label="VenueCard (canonical) · 시설 리스트 카드">
        <div style={{ width: 300 }}>
          <M07VenueListCard v={VENUES[0]}/>
        </div>
      </M07ComponentSwatch>

      <M07ComponentSwatch label="M07MapCanvas · pin cluster + road SVG">
        <div style={{ width: 300, overflow: 'hidden', borderRadius: 12 }}>
          <M07MapCanvas height={120} pinCount={4}/>
        </div>
      </M07ComponentSwatch>

      <M07ComponentSwatch label="M07SlotPicker · 3-col slot grid (44px touch)">
        <div style={{ width: 300 }}>
          <M07SlotPicker selected={['09:00','10:00']} booked={['11:00','13:00']}/>
        </div>
      </M07ComponentSwatch>

      <M07ComponentSwatch label="M07DayStrip · 14-day horizontal scroller">
        <div style={{ width: 300, overflow: 'hidden' }}>
          <M07DayStrip selected={5}/>
        </div>
      </M07ComponentSwatch>

      <M07ComponentSwatch label="M07WeeklyGrid · weekly heat-map (venues-week canonical)">
        <div style={{ width: 300 }}>
          <M07WeeklyGrid/>
        </div>
      </M07ComponentSwatch>

      <M07ComponentSwatch label="M07BookingTimeline · today's slots">
        <div style={{ width: 300 }}>
          <M07BookingTimeline/>
        </div>
      </M07ComponentSwatch>

      <M07ComponentSwatch label="M07ReviewRow · author + stars + text">
        <div style={{ width: 300 }}>
          <M07ReviewRow author="김민준" rating={5} text="시설 최고예요! 다음에 또 이용할게요." date="3일 전"/>
        </div>
      </M07ComponentSwatch>

      <M07ComponentSwatch label="MoneyRow · 금액 요약 (canonical signatures)">
        <div style={{ width: 300, padding: '0 4px' }}>
          <MoneyRow label="시간당 이용 요금" amount={VENUES[0].price}/>
          <MoneyRow label="예상 금액 (2시간)" amount={VENUES[0].price * 2} strong accent/>
        </div>
      </M07ComponentSwatch>

      <M07ComponentSwatch label="M07StickyCTA · primary action bar">
        <div style={{ width: 300 }}>
          <M07StickyCTA label="예약하기" sub="5월 5일(월) 14:00 ~ 16:00"/>
        </div>
      </M07ComponentSwatch>

      <M07ComponentSwatch label="M07StarRating · rating row">
        <M07StarRating rating={4.8} reviews={234}/>
      </M07ComponentSwatch>

      <M07ComponentSwatch label="Badge · venue type tones">
        <Badge tone="grey">축구장</Badge>
        <Badge tone="green" size="sm">지금 가능</Badge>
        <Badge tone="orange" size="sm">마감 임박</Badge>
        <Badge tone="red" size="sm">예약 마감</Badge>
      </M07ComponentSwatch>

      <M07ComponentSwatch label="HapticChip · sport filter (active / inactive)">
        {['전체', '⚽ 축구', '🏃 풋살', '🏀 농구'].map((c, i) => (
          <HapticChip key={c} active={i === 0}>{c}</HapticChip>
        ))}
      </M07ComponentSwatch>

      <M07ComponentSwatch label="Skeleton · loading shimmer">
        <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton width="100%" height={140} radius={0}/>
          <Skeleton width="60%" height={18} radius={6}/>
          <Skeleton width="40%" height={14} radius={6}/>
        </div>
      </M07ComponentSwatch>

      <M07ComponentSwatch label="Toast · slot conflict error">
        <div style={{ width: 300 }}>
          <Toast type="error" msg="19:00 슬롯은 방금 선점되어 예약할 수 없어요."/>
        </div>
      </M07ComponentSwatch>

      <M07ComponentSwatch label="TabBar · venues tab active">
        <div style={{ width: 300 }}><TabBar active="venues"/></div>
      </M07ComponentSwatch>

    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   m07-tb-components — 태블릿 컴포넌트 인벤토리
═══════════════════════════════════════════════════════════════ */
const M07TabletComponents = () => (
  <div style={{ width: M07_TB_W, minHeight: 600, background: 'var(--bg)', padding: 32, fontFamily: 'var(--font)' }}>
    <Badge tone="blue" size="sm">m07-tb-components</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M07 태블릿 · 컴포넌트 인벤토리</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>시설 태블릿(768) 화면 primitives</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 20 }}>
      <M07ComponentSwatch label="VenueCard · compact list (tb)">
        <div style={{ width: 280 }}>
          <M07VenueListCard v={VENUES[1]}/>
        </div>
      </M07ComponentSwatch>
      <M07ComponentSwatch label="MapCanvas · split panel (tb)">
        <div style={{ width: 280, overflow: 'hidden', borderRadius: 12 }}>
          <M07MapCanvas height={160} pinCount={3}/>
        </div>
      </M07ComponentSwatch>
      <M07ComponentSwatch label="M07WeeklyGrid · venues-week canonical">
        <div style={{ width: 320 }}>
          <M07WeeklyGrid/>
        </div>
      </M07ComponentSwatch>
      <M07ComponentSwatch label="SlotPicker + DayStrip (tb)">
        <div style={{ width: 280 }}>
          <M07DayStrip selected={7}/>
          <div style={{ marginTop: 8 }}>
            <M07SlotPicker selected={['10:00']} booked={['11:00','12:00']}/>
          </div>
        </div>
      </M07ComponentSwatch>
      <M07ComponentSwatch label="HapticChip · sport filter tb">
        {['전체', '⚽ 축구', '🏃 풋살', '🏀 농구', '🎾 테니스'].map((c, i) => (
          <HapticChip key={c} active={i === 0}>{c}</HapticChip>
        ))}
      </M07ComponentSwatch>
      <M07ComponentSwatch label="ReviewRow · tb side panel">
        <div style={{ width: 280 }}>
          <M07ReviewRow author="이서연" rating={4} text="가격 대비 훌륭해요." date="1주 전"/>
        </div>
      </M07ComponentSwatch>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   m07-dt-components — 데스크탑 컴포넌트 인벤토리
═══════════════════════════════════════════════════════════════ */
const M07DesktopComponents = () => (
  <div style={{ width: M07_DT_W, minHeight: 600, background: 'var(--bg)', padding: 32, fontFamily: 'var(--font)' }}>
    <Badge tone="blue" size="sm">m07-dt-components</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M07 데스크탑 · 컴포넌트 인벤토리</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>시설 데스크탑(1280) 화면 primitives</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, marginTop: 20 }}>
      <M07ComponentSwatch label="VenueCard · dt list row">
        <div style={{ width: 280 }}>
          <M07VenueListCard v={VENUES[2]}/>
        </div>
      </M07ComponentSwatch>
      <M07ComponentSwatch label="MapCanvas · dt full">
        <div style={{ width: 360, overflow: 'hidden', borderRadius: 12 }}>
          <M07MapCanvas height={200} pinCount={5}/>
        </div>
      </M07ComponentSwatch>
      <M07ComponentSwatch label="BookingTimeline · dt sidebar">
        <div style={{ width: 260 }}>
          <M07BookingTimeline/>
        </div>
      </M07ComponentSwatch>
      <M07ComponentSwatch label="SlotPicker · dt sidebar">
        <div style={{ width: 260 }}>
          <M07SlotPicker selected={['14:00','15:00']} booked={['11:00','12:00','18:00']}/>
        </div>
      </M07ComponentSwatch>
      <M07ComponentSwatch label="MoneyRow · dt booking summary">
        <div style={{ width: 260, padding: '0 4px' }}>
          <MoneyRow label="2시간 이용" amount={360000}/>
          <MoneyRow label="서비스 수수료" amount={0} unit="원 (면제)"/>
          <MoneyRow label="최종 결제" amount={360000} strong accent/>
        </div>
      </M07ComponentSwatch>
      <M07ComponentSwatch label="ReviewRow · dt detail">
        <div style={{ width: 260 }}>
          <M07ReviewRow author="박지훈" rating={5} text="잔디 상태 최고입니다. 팀 훈련에 딱 좋아요." date="2주 전"/>
          <M07ReviewRow author="김민준" rating={4} text="시설이 깔끔하고 주차도 편했어요." date="3일 전"/>
        </div>
      </M07ComponentSwatch>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   m07-mb-assets — 디자인 토큰 인벤토리
═══════════════════════════════════════════════════════════════ */
const M07MobileAssets = () => (
  <div style={{ width: M07_MB_W, minHeight: M07_MB_H, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)' }}>
    <Badge tone="blue" size="sm">m07-mb-assets</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M07 모바일 · 토큰/에셋</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>시설 화면이 사용하는 디자인 토큰</div>
    <div style={{ marginTop: 16 }}>

      <M07AssetSwatch label="Color · brand + semantic">
        <M07ColorDot token="blue500" value="var(--blue500)"/>
        <M07ColorDot token="blue50" value="var(--blue50)"/>
        <M07ColorDot token="green500" value="var(--green500)"/>
        <M07ColorDot token="orange500" value="var(--orange500)"/>
        <M07ColorDot token="red500" value="var(--red500)"/>
        <M07ColorDot token="yellow500" value="var(--yellow500)"/>
      </M07AssetSwatch>

      <M07AssetSwatch label="Color · sport facility accent tones">
        <M07ColorDot token="soccer" value="var(--red50)"/>
        <M07ColorDot token="futsal" value="var(--blue50)"/>
        <M07ColorDot token="basketball" value="var(--orange50)"/>
        <M07ColorDot token="badminton" value="var(--green50)"/>
        <M07ColorDot token="icehockey" value="var(--teal500)"/>
        <M07ColorDot token="tennis" value="var(--yellow500)"/>
      </M07AssetSwatch>

      <M07AssetSwatch label="Color · neutral hierarchy">
        <M07ColorDot token="grey50" value="var(--grey50)"/>
        <M07ColorDot token="grey100" value="var(--grey100)"/>
        <M07ColorDot token="grey200" value="var(--grey200)"/>
        <M07ColorDot token="grey400" value="var(--grey400)"/>
        <M07ColorDot token="grey900" value="var(--grey900)"/>
      </M07AssetSwatch>

      <M07AssetSwatch label="Type scale · 8단계 사용">
        <span className="tm-text-subhead">subhead · 20px</span>
        <span className="tm-text-heading">heading · 24px</span>
        <span className="tm-text-body-lg">body-lg · 17px</span>
        <span className="tm-text-body">body · 15px</span>
        <span className="tm-text-label">label · 13px</span>
        <span className="tm-text-caption">caption · 12px</span>
        <span className="tm-text-micro">micro · 11px</span>
        <span className="tm-tabular">tabular · mono</span>
      </M07AssetSwatch>

      <M07AssetSwatch label="Spacing · used (4-multiple px)">
        {[4, 8, 12, 16, 20, 24, 32, 40, 48].map((n) => (
          <Badge key={n} tone="grey" size="sm">{n}px</Badge>
        ))}
      </M07AssetSwatch>

      <M07AssetSwatch label="Border radius">
        <Badge tone="grey" size="sm">r-sm 8 · slot button</Badge>
        <Badge tone="grey" size="sm">r-md 12 · price panel</Badge>
        <Badge tone="grey" size="sm">r-lg 16 · card outer</Badge>
        <Badge tone="grey" size="sm">r-22 · avatar round btn</Badge>
        <Badge tone="grey" size="sm">r-pill · badge / chip</Badge>
      </M07AssetSwatch>

      <M07AssetSwatch label="Icon · lucide used in M07">
        <span className="tm-text-caption" style={{ lineHeight: 1.8 }}>
          pin · search · filter · calendar · clock · star · heart · share · check · plus · minus · chevL · chevR · chevD · info · close · shield
        </span>
      </M07AssetSwatch>

      <M07AssetSwatch label="Weekly grid · heat-map colors">
        <div style={{ display: 'flex', gap: 12 }}>
          {[['var(--blue50)', '가능'], ['var(--yellow500)', '혼잡'], ['var(--red50)', '예약됨']].map(([c, l]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 16, height: 16, borderRadius: 4, background: c, border: '1px solid var(--border)' }}/>
              <span className="tm-text-caption">{l}</span>
            </div>
          ))}
        </div>
      </M07AssetSwatch>

      <M07AssetSwatch label="Shadow">
        <Badge tone="grey" size="sm">sh-1 · card default</Badge>
        <Badge tone="grey" size="sm">sh-2 · map pin</Badge>
        <Badge tone="grey" size="sm">sh-3 · bottom sheet</Badge>
      </M07AssetSwatch>

    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   m07-mb-motion — motion contract
═══════════════════════════════════════════════════════════════ */
const M07MobileMotion = () => (
  <div style={{ width: M07_MB_W, minHeight: M07_MB_H, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)' }}>
    <Badge tone="blue" size="sm">m07-mb-motion</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M07 모바일 · motion contract</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>시설 화면의 micro-interaction 가이드</div>
    <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
      <ListItem title="VenueCard tap" sub="카드 tap → scale(.98) · 120ms · ease-out-quart" trailing="tap" chev/>
      <ListItem title="HapticChip tap" sub="종목 chip → scale(.97) · 120ms + bg 전환 120ms" trailing="chip" chev/>
      <ListItem title="Slot toggle" sub="슬롯 선택/해제 → bg-color 120ms · color 120ms (transition-colors)" trailing="slot" chev/>
      <ListItem title="Date strip scroll" sub="14-day strip → native overflow-x scroll + momentum scrolling" trailing="scroll" chev/>
      <ListItem title="Map pan / zoom" sub="지도 pan → translate3d 0ms (native) · zoom +/- → scale 200ms" trailing="pan" chev/>
      <ListItem title="Map pin select" sub="핀 선택 → scale(1 → 1.15 → 1) · 180ms · ease-out-back" trailing="pin" chev/>
      <ListItem title="Weekly heatmap tap" sub="셀 tap → ripple 160ms + 슬롯 그리드 slide-up 280ms" trailing="heat" chev/>
      <ListItem title="List / Map / Week toggle" sub="뷰 전환 → bg 120ms + opacity fade-in 150ms cross" trailing="toggle" chev/>
      <ListItem title="Skeleton shimmer" sub="로딩 → 1.4s linear infinite gradient sweep (skeleton-shimmer class)" trailing="load" chev/>
      <ListItem title="Sticky CTA reveal" sub="스크롤 시 → tm-animate-sheet 280ms · ease-out-expo" trailing="cta" chev/>
      <ListItem title="Photo carousel" sub="사진 스와이프 → translateX snap · 240ms · ease-out-quart" trailing="photo" chev/>
      <ListItem title="Bottom sheet" sub="예약 확인 시트 → translateY 100%→0 · 280ms · ease-out-expo" trailing="sheet" chev/>
      <ListItem title="Toast" sub="예약 완료/슬롯 선점 → slide-up 200ms + auto-dismiss 2.5s" trailing="toast" chev/>
      <ListItem title="Reduced motion" sub="prefers-reduced-motion → 모든 transition: 0.01ms" trailing="a11y" chev/>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   window exports
═══════════════════════════════════════════════════════════════ */
Object.assign(window, {
  M07MobileMain,
  M07TabletMain,
  M07DesktopMain,
  M07MobileDetail,
  M07MobileFlowBooking,
  M07MobileStateLoading,
  M07MobileStateEmpty,
  M07MobileStatePermission,
  M07MobileStateDeadline,
  M07MobileStateSoldOut,
  M07MobileComponents,
  M07TabletComponents,
  M07DesktopComponents,
  M07MobileAssets,
  M07MobileMotion,
});
