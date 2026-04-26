/* Upgraded mobile venue list + deepened detail pages
   All in Toss style: white surfaces, blue only for interactive, no emoji, 400/600/700 weights */

/* ═══ MOBILE · VENUE LIST (upgraded with region, filters, map toggle) ═══ */
const M_VenueList = () => (
  <Phone>
    {/* Header */}
    <div style={{ padding: '8px 20px 12px', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <Icon name="chevL" size={24} color="var(--grey900)"/>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 700, marginLeft: 8 }}>시설 예약</div>
        <Icon name="search" size={22} color="var(--grey900)"/>
      </div>

      {/* Region selector — Toss-style big pill button */}
      <button className="tm-btn tm-btn-neutral tm-btn-md tm-break-keep" style={{ width: '100%', justifyContent: 'flex-start', gap: 8 }}>
        <Icon name="pin" size={18} color="var(--grey700)"/>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--grey900)' }}>서울 강남구</span>
        <span className="tab-num" style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400 }}>· 내 위치에서 1.3km</span>
        <div style={{ flex: 1 }}/>
        <Icon name="chevD" size={16} color="var(--grey600)"/>
      </button>
    </div>

    {/* Region chips row — scroll-x */}
    <div style={{ padding: '4px 20px 14px', display: 'flex', gap: 6, overflowX: 'auto' }}>
      {REGIONS.slice(0, 9).map((r, i) => (
        <HapticChip key={r.id} active={i === 1} count={r.count}>{r.label}</HapticChip>
      ))}
    </div>

    {/* Filter bar */}
    <div style={{ padding: '0 20px 14px', display: 'flex', gap: 6, overflowX: 'auto' }}>
      {[
        { l: '종목', v: '축구', active: true },
        { l: '날짜', v: '오늘', active: true },
        { l: '시간', v: '18:00~' },
        { l: '가격', v: '전체' },
        { l: '실내', v: '' },
      ].map(f => (
        <button key={f.l} className={f.active ? 'tm-chip tm-chip-active' : 'tm-chip'} style={{ gap: 4 }}>
          <span style={{ opacity: .7, fontWeight: 400 }}>{f.l}</span>
          {f.v && <span>{f.v}</span>}
          <Icon name="chevD" size={12}/>
        </button>
      ))}
    </div>

    {/* View toggle + count */}
    <div style={{ padding: '0 20px 10px', display: 'flex', alignItems: 'center' }}>
      <div className="tab-num" style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400 }}>
        총 <b style={{ color: 'var(--grey900)', fontWeight: 700 }}>12</b>곳 · 지금 예약 가능 <b style={{ color: 'var(--green500)', fontWeight: 700 }}>6</b>곳
      </div>
      <div style={{ flex: 1 }}/>
      <button className="tm-btn tm-btn-ghost tm-btn-sm" style={{ gap: 4 }}>
        거리순 <Icon name="chevD" size={12}/>
      </button>
    </div>

    {/* List */}
    <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 20px' }}>
      {VENUES.map((v, i) => (
        <div key={v.id} style={{ padding: '16px 0', borderBottom: i < VENUES.length - 1 ? '1px solid var(--grey100)' : 'none', display: 'flex', gap: 12 }}>
          <div style={{ width: 96, height: 96, borderRadius: 12, background: `url(${v.img}) center/cover`, flexShrink: 0, position: 'relative' }}>
            {v.openNow && (
              <div style={{ position: 'absolute', top: 6, left: 6, padding: '2px 6px', background: 'rgba(3,178,108,.95)', color: 'var(--static-white)', fontSize: 10, fontWeight: 700, borderRadius: 4 }}>예약가능</div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--grey100)', color: 'var(--grey700)', fontWeight: 600, borderRadius: 4 }}>{v.type}</span>
              {v.indoor && <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--blue50)', color: 'var(--blue500)', fontWeight: 600, borderRadius: 4 }}>실내</span>}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--grey900)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.name}</div>
            <div className="tab-num" style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="pin" size={11} color="var(--grey500)"/>
              {v.region}구 · {v.dist}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Icon name="star" size={11} color="var(--orange500)"/>
              <span className="tab-num" style={{ fontSize: 12, fontWeight: 700, color: 'var(--grey900)' }}>{v.rating}</span>
              <span className="tab-num" style={{ fontSize: 11, color: 'var(--grey500)', fontWeight: 400 }}>({v.reviews})</span>
              <span style={{ color: 'var(--grey300)', fontSize: 11 }}>·</span>
              <span className="tab-num" style={{ fontSize: 11, color: 'var(--grey600)', fontWeight: 400 }}>{v.nextSlot}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <span className="tab-num" style={{ fontSize: 15, fontWeight: 700, color: 'var(--grey900)' }}>{v.price.toLocaleString()}원</span>
              <span style={{ fontSize: 11, color: 'var(--grey500)', marginLeft: 2, fontWeight: 400 }}>/{v.unit}</span>
            </div>
          </div>
        </div>
      ))}
    </div>

    {/* Floating map button */}
    <button className="tm-btn tm-btn-dark tm-btn-md" style={{ position: 'absolute', bottom: 96, left: '50%', transform: 'translateX(-50%)', gap: 6, boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>
      <Icon name="pin" size={16} color="var(--static-white)"/> 지도 보기
    </button>

    <TabBar active="home"/>
  </Phone>
);

/* ═══ MOBILE · VENUE LIST (Map View variant) ═══ */
const M_VenueMap = () => (
  <Phone>
    <div style={{ padding: '8px 20px 10px', display: 'flex', alignItems: 'center', background: 'var(--bg)', zIndex: 10 }}>
      <Icon name="chevL" size={24}/>
      <div style={{ flex: 1, marginLeft: 10, height: 40, background: 'var(--grey100)', borderRadius: 10, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="search" size={16} color="var(--grey500)"/>
        <span style={{ fontSize: 13, color: 'var(--grey600)' }}>강남구 · 축구장</span>
      </div>
    </div>

    <div style={{ padding: '0 20px 10px', display: 'flex', gap: 6, overflowX: 'auto' }}>
      {['축구장', '풋살장', '농구장', '테니스', '배드민턴'].map((t, i) => (
        <HapticChip key={t} active={i === 0}>{t}</HapticChip>
      ))}
    </div>

    {/* Map */}
    <div style={{ flex: 1, background: 'var(--grey150)', position: 'relative', overflow: 'hidden' }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        <path d="M 0 200 Q 150 180 300 210 T 500 200" stroke="var(--static-white)" strokeWidth="14" fill="none"/>
        <path d="M 100 0 L 120 600" stroke="var(--static-white)" strokeWidth="10" fill="none"/>
        <path d="M 250 0 L 270 600" stroke="var(--static-white)" strokeWidth="8" fill="none"/>
        <path d="M 0 400 Q 200 380 400 400" stroke="var(--static-white)" strokeWidth="10" fill="none"/>
      </svg>
      <div style={{ position: 'absolute', left: 180, top: 260, width: 110, height: 80, background: '#dbe9d4', borderRadius: 24 }}/>

      {[
        { x: 80, y: 170, p: 180, name: '상암' },
        { x: 190, y: 140, p: 60, sel: true, name: '이태원' },
        { x: 260, y: 340, p: 25, name: '강남' },
        { x: 100, y: 440, p: 45, name: '목동' },
        { x: 300, y: 460, p: 18, name: '서초' },
      ].map((m, i) => (
        <div key={i} style={{ position: 'absolute', left: m.x, top: m.y, transform: 'translate(-50%, -100%)', zIndex: m.sel ? 10 : 1 }}>
          <div className="tab-num" style={{ padding: '5px 10px', background: m.sel ? 'var(--grey900)' : 'var(--static-white)', color: m.sel ? 'var(--static-white)' : 'var(--grey900)', borderRadius: 999, fontSize: 11, fontWeight: 700, boxShadow: '0 2px 6px rgba(0,0,0,.15)', whiteSpace: 'nowrap' }}>
            {m.p}k
          </div>
          <div style={{ width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: `7px solid ${m.sel ? 'var(--grey900)' : 'var(--static-white)'}`, margin: '-1px auto 0' }}/>
        </div>
      ))}

      {/* control */}
      <div style={{ position: 'absolute', top: 16, right: 16, background: 'var(--static-white)', borderRadius: 10, boxShadow: '0 2px 6px rgba(0,0,0,.1)' }}>
        <button className="tm-btn tm-btn-ghost tm-btn-icon">
          <Icon name="pin" size={18} color="var(--blue500)"/>
        </button>
      </div>
    </div>

    {/* Pinned card preview */}
    <div style={{ position: 'absolute', left: 12, right: 12, bottom: 92, background: 'var(--static-white)', borderRadius: 16, padding: 14, display: 'flex', gap: 12, boxShadow: '0 8px 24px rgba(0,0,0,.15)' }}>
      <div style={{ width: 72, height: 72, borderRadius: 10, background: `url(${VENUES[1].img}) center/cover`, flexShrink: 0 }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--green500)', fontWeight: 700, marginBottom: 2 }}>예약 가능</div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{VENUES[1].name}</div>
        <div className="tab-num" style={{ fontSize: 11, color: 'var(--grey600)', fontWeight: 400, marginBottom: 6 }}>{VENUES[1].region}구 · {VENUES[1].dist}</div>
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span className="tab-num" style={{ fontSize: 15, fontWeight: 700 }}>{VENUES[1].price.toLocaleString()}원</span>
          <span style={{ fontSize: 11, color: 'var(--grey500)', marginLeft: 2 }}>/시간</span>
        </div>
      </div>
      <Icon name="chevR" size={18} color="var(--grey500)"/>
    </div>

    <TabBar active="home"/>
  </Phone>
);

/* ═══ MOBILE · VENUE DETAIL (deep) ═══ */
const M_VenueDetail = () => {
  const v = VENUES[0];
  return (
    <Phone statusDark>
      <div style={{ position: 'absolute', inset: 0, overflow: 'auto' }}>
        {/* gallery */}
        <div style={{ height: 280, background: `url(${v.img}) center/cover`, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.3) 0%, transparent 40%)' }}/>
          <div style={{ position: 'absolute', top: 52, left: 16, right: 16, display: 'flex', justifyContent: 'space-between' }}>
            <button className="tm-pressable tm-break-keep" style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(0,0,0,.3)', display: 'grid', placeItems: 'center' }}>
              <Icon name="chevL" size={22} color="var(--static-white)"/>
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="tm-pressable tm-break-keep" style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(0,0,0,.3)', display: 'grid', placeItems: 'center' }}>
                <Icon name="share" size={18} color="var(--static-white)"/>
              </button>
              <button className="tm-pressable tm-break-keep" style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(0,0,0,.3)', display: 'grid', placeItems: 'center' }}>
                <Icon name="heart" size={18} color="var(--static-white)"/>
              </button>
            </div>
          </div>
          <div className="tab-num" style={{ position: 'absolute', bottom: 12, right: 14, padding: '4px 10px', background: 'rgba(0,0,0,.5)', color: 'var(--static-white)', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>1 / 12</div>
        </div>

        <div style={{ padding: '20px 20px 140px', background: 'var(--static-white)' }}>
          {/* Header */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 11, padding: '3px 8px', background: 'var(--grey100)', color: 'var(--grey700)', fontWeight: 600, borderRadius: 4 }}>{v.type}</span>
            <span style={{ fontSize: 11, padding: '3px 8px', background: 'var(--green50)', color: 'var(--green500)', fontWeight: 600, borderRadius: 4 }}>예약 가능</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, lineHeight: 1.3, letterSpacing: 0 }}>{v.name}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <Icon name="star" size={13} color="var(--orange500)"/>
            <span className="tab-num" style={{ fontSize: 13, fontWeight: 700 }}>{v.rating}</span>
            <span className="tab-num" style={{ fontSize: 12, color: 'var(--grey500)', fontWeight: 400 }}>({v.reviews})</span>
            <span style={{ color: 'var(--grey300)' }}>·</span>
            <span className="tab-num" style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400 }}>{v.address}</span>
          </div>

          {/* stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, marginTop: 20, padding: '14px 0', background: 'var(--grey50)', borderRadius: 12 }}>
            {[
              ['운영 시간', '06-22', '연중무휴'],
              ['코트 규격', '풋살 3면', '인조잔디'],
              ['수용 인원', '최대 22명', '대관'],
            ].map(([l, v1, v2], i) => (
              <div key={l} style={{ padding: '0 16px', borderRight: i < 2 ? '1px solid var(--grey200)' : 'none', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--grey500)', fontWeight: 400, marginBottom: 4 }}>{l}</div>
                <div className="tab-num" style={{ fontSize: 14, fontWeight: 700, color: 'var(--grey900)' }}>{v1}</div>
                <div style={{ fontSize: 10, color: 'var(--grey500)', fontWeight: 400, marginTop: 2 }}>{v2}</div>
              </div>
            ))}
          </div>

          {/* Quick tabs */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--grey200)', marginTop: 24, marginBottom: 20 }}>
            {['정보', '시설', '리뷰 234', '환불'].map((t, i) => (
              <button className="tm-pressable tm-break-keep" key={t} style={{ flex: 1, padding: '12px 0', borderBottom: i === 0 ? '2px solid var(--grey900)' : '2px solid transparent', fontSize: 13, fontWeight: i === 0 ? 700 : 500, color: i === 0 ? 'var(--grey900)' : 'var(--grey500)' }}>{t}</button>
            ))}
          </div>

          {/* Facilities */}
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>편의시설</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 24 }}>
            {[...v.facilities, '라운지', '자판기', '화장실', '와이파이'].map(f => (
              <div key={f} style={{ padding: '10px 12px', background: 'var(--grey50)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="check" size={13} color="var(--green500)" stroke={2.5}/>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{f}</span>
              </div>
            ))}
          </div>

          {/* Price table */}
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>요금 안내</div>
          <div style={{ padding: 14, background: 'var(--grey50)', borderRadius: 12, marginBottom: 24 }}>
            {[
              ['평일 주간', '06-18시', '180,000'],
              ['평일 야간', '18-22시', '220,000'],
              ['주말', '종일', '260,000', true],
            ].map(([k, t, p, hi]) => (
              <div key={k} className="tab-num" style={{ display: 'flex', alignItems: 'center', padding: '6px 0', fontSize: 13, color: hi ? 'var(--grey900)' : 'var(--grey700)', fontWeight: hi ? 700 : 400 }}>
                <span style={{ width: 72 }}>{k}</span>
                <span style={{ color: 'var(--grey500)', fontWeight: 400 }}>{t}</span>
                <div style={{ flex: 1 }}/>
                <span>{p}원</span>
              </div>
            ))}
          </div>

          {/* Location */}
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>위치</div>
          <div style={{ height: 160, background: 'var(--grey100)', borderRadius: 12, position: 'relative', overflow: 'hidden', marginBottom: 10 }}>
            <svg width="100%" height="100%" style={{ opacity: .5 }}>
              <path d="M 0 80 Q 150 70 320 85" stroke="var(--static-white)" strokeWidth="10" fill="none"/>
              <path d="M 150 0 L 160 160" stroke="var(--static-white)" strokeWidth="8" fill="none"/>
            </svg>
            <div style={{ position: 'absolute', left: '50%', top: '55%', transform: 'translate(-50%, -100%)' }}>
              <div style={{ padding: '5px 10px', background: 'var(--grey900)', color: 'var(--static-white)', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>{v.name}</div>
              <div style={{ width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '7px solid var(--grey900)', margin: '-1px auto 0' }}/>
            </div>
          </div>
          <div className="tab-num" style={{ fontSize: 13, color: 'var(--grey700)', fontWeight: 400 }}>{v.address}</div>
          <div style={{ fontSize: 12, color: 'var(--grey500)', fontWeight: 400, marginTop: 4 }}>지하철 월드컵경기장역 도보 8분</div>

          {/* Reviews preview */}
          <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 32, marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>리뷰</div>
            <div className="tab-num" style={{ fontSize: 13, color: 'var(--grey500)', marginLeft: 8, fontWeight: 400 }}>234개</div>
            <div style={{ flex: 1 }}/>
            <button className="tm-pressable tm-break-keep" style={{ fontSize: 13, color: 'var(--blue500)', fontWeight: 600 }}>전체 보기</button>
          </div>
          {[
            { n: '정민', d: '3일 전', t: '관리가 정말 잘 되어 있어요. 잔디 상태도 좋고 주차도 편하네요.', av: IMG.av1, r: 5 },
            { n: '수아', d: '1주 전', t: '야간 조명이 밝아서 저녁에 하기 좋아요. 샤워실도 깨끗해요.', av: IMG.av3, r: 5 },
          ].map(rv => (
            <div key={rv.n} style={{ padding: '14px 0', borderBottom: '1px solid var(--grey100)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 28, height: 28, borderRadius: 14, background: `url(${rv.av}) center/cover` }}/>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{rv.n}</span>
                <span className="tab-num" style={{ fontSize: 11, color: 'var(--grey500)', fontWeight: 400 }}>· {rv.d}</span>
                <div style={{ flex: 1 }}/>
                <div style={{ display: 'flex', gap: 1 }}>
                  {Array.from({ length: 5 }).map((_, i) => <Icon key={i} name="star" size={11} color={i < rv.r ? 'var(--orange500)' : 'var(--grey200)'}/>)}
                </div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--grey700)', lineHeight: 1.5, fontWeight: 400 }}>{rv.t}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom sticky CTA */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--static-white)', padding: '12px 20px 24px', borderTop: '1px solid var(--grey150)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--grey500)', fontWeight: 400 }}>시간당</div>
          <div className="tab-num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--grey900)' }}>{v.price.toLocaleString()}원</div>
        </div>
        <div style={{ flex: 1 }}/>
        <SBtn size="lg" style={{ flex: 1.4, maxWidth: 220 }}>예약하기</SBtn>
      </div>
    </Phone>
  );
};

/* ═══ MOBILE · LESSON DETAIL (deep) ═══ */
const M_LessonDetail = () => {
  const l = LESSONS[0];
  return (
    <Phone statusDark>
      <div style={{ position: 'absolute', inset: 0, overflow: 'auto' }}>
        <div style={{ height: 260, background: `url(${l.img}) center/cover`, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.25) 0%, transparent 40%)' }}/>
          <div style={{ position: 'absolute', top: 52, left: 16, right: 16, display: 'flex', justifyContent: 'space-between' }}>
            <button className="tm-pressable tm-break-keep" style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(0,0,0,.3)', display: 'grid', placeItems: 'center' }}>
              <Icon name="chevL" size={22} color="var(--static-white)"/>
            </button>
            <button className="tm-pressable tm-break-keep" style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(0,0,0,.3)', display: 'grid', placeItems: 'center' }}>
              <Icon name="share" size={18} color="var(--static-white)"/>
            </button>
          </div>
        </div>

        <div style={{ padding: '20px 20px 140px', background: 'var(--static-white)' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {l.tags.map(t => <span key={t} style={{ fontSize: 11, padding: '3px 8px', background: 'var(--grey100)', color: 'var(--grey700)', fontWeight: 600, borderRadius: 4 }}>{t}</span>)}
            <span style={{ fontSize: 11, padding: '3px 8px', background: 'var(--green50)', color: 'var(--green500)', fontWeight: 600, borderRadius: 4 }}>인증 코치</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, lineHeight: 1.3, letterSpacing: 0 }}>{l.title}</h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <Icon name="star" size={13} color="var(--orange500)"/>
            <span className="tab-num" style={{ fontSize: 13, fontWeight: 700 }}>{l.rating}</span>
            <span className="tab-num" style={{ fontSize: 12, color: 'var(--grey500)', fontWeight: 400 }}>({l.reviews}개 리뷰)</span>
            <span style={{ color: 'var(--grey300)' }}>·</span>
            <span className="tab-num" style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400 }}>수강 420명</span>
          </div>

          {/* Coach card */}
          <div style={{ marginTop: 20, padding: 16, background: 'var(--grey50)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 24, background: `url(${l.avatar}) center/cover` }}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{l.coach}</div>
              <div style={{ fontSize: 11, color: 'var(--grey600)', fontWeight: 400, marginTop: 2 }}>U리그 출신 · 지도자 2급 · 경력 12년</div>
            </div>
            <Icon name="chevR" size={18} color="var(--grey500)"/>
          </div>

          {/* Recommended for */}
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 28, marginBottom: 12 }}>이런 분께 추천해요</div>
          {['축구를 처음 시작하는 성인', '동호회 매치에서 뛰고 싶은 분', '기본기부터 체계적으로 배우고 싶은 분'].map(x => (
            <div key={x} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 0', fontSize: 13, color: 'var(--grey700)', fontWeight: 400 }}>
              <Icon name="check" size={14} color="var(--blue500)" stroke={2.5}/>
              {x}
            </div>
          ))}

          {/* Curriculum */}
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 28, marginBottom: 12 }}>커리큘럼</div>
          {[
            { w: '1주차', t: '스트레칭, 기본 자세', d: '60분' },
            { w: '2주차', t: '패스 & 트래핑 기초', d: '60분' },
            { w: '3주차', t: '드리블과 1:1 돌파', d: '60분' },
            { w: '4주차', t: '슈팅 기본 · 미니게임', d: '60분' },
          ].map((c, i) => (
            <div key={c.w} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: i < 3 ? '1px solid var(--grey100)' : 'none' }}>
              <div className="tab-num" style={{ width: 44, fontSize: 13, color: 'var(--blue500)', fontWeight: 700 }}>{c.w}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--grey900)' }}>{c.t}</div>
                <div className="tab-num" style={{ fontSize: 11, color: 'var(--grey500)', marginTop: 2, fontWeight: 400 }}>{c.d}</div>
              </div>
            </div>
          ))}

          {/* Reviews */}
          <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 32, marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>리뷰</div>
            <div className="tab-num" style={{ fontSize: 13, color: 'var(--grey500)', marginLeft: 8, fontWeight: 400 }}>128개</div>
            <div style={{ flex: 1 }}/>
            <button className="tm-pressable tm-break-keep" style={{ fontSize: 13, color: 'var(--blue500)', fontWeight: 600 }}>전체 보기</button>
          </div>
          {[
            { n: '예은', d: '4일 전', t: '기초부터 차근차근 알려주셔서 한 달 만에 자신감이 붙었어요.', av: IMG.av5 },
            { n: '준호', d: '2주 전', t: '영상 분석까지 해주셔서 본인 문제점을 정확히 짚어낼 수 있었어요.', av: IMG.av7 },
          ].map(r => (
            <div key={r.n} style={{ padding: '14px 0', borderBottom: '1px solid var(--grey100)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 28, height: 28, borderRadius: 14, background: `url(${r.av}) center/cover` }}/>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{r.n}</span>
                <span className="tab-num" style={{ fontSize: 11, color: 'var(--grey500)', fontWeight: 400 }}>· {r.d}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--grey700)', lineHeight: 1.5, fontWeight: 400 }}>{r.t}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--static-white)', padding: '12px 20px 24px', borderTop: '1px solid var(--grey150)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="tm-btn tm-btn-neutral tm-btn-icon">
          <Icon name="heart" size={20} color="var(--grey700)"/>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: 'var(--grey500)', fontWeight: 400 }}>1회 기준</div>
          <div className="tab-num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--grey900)' }}>{l.price.toLocaleString()}원</div>
        </div>
        <SBtn size="lg" style={{ flex: 1.3 }}>예약하기</SBtn>
      </div>
    </Phone>
  );
};

/* ═══ MOBILE · LISTING DETAIL (장터 상세) ═══ */
const M_ListingDetail = () => {
  const it = LISTINGS[0];
  return (
    <Phone statusDark>
      <div style={{ position: 'absolute', inset: 0, overflow: 'auto' }}>
        <div style={{ width: 375, height: 375, background: `url(${it.img}) center/cover`, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 52, left: 16, right: 16, display: 'flex', justifyContent: 'space-between' }}>
            <button className="tm-pressable tm-break-keep" style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(0,0,0,.35)', display: 'grid', placeItems: 'center' }}>
              <Icon name="chevL" size={22} color="var(--static-white)"/>
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="tm-pressable tm-break-keep" style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(0,0,0,.35)', display: 'grid', placeItems: 'center' }}>
                <Icon name="share" size={18} color="var(--static-white)"/>
              </button>
            </div>
          </div>
          <div className="tab-num" style={{ position: 'absolute', bottom: 14, right: 14, padding: '4px 10px', background: 'rgba(0,0,0,.55)', color: 'var(--static-white)', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>1 / 5</div>
        </div>

        <div style={{ padding: '20px 20px 140px', background: 'var(--static-white)' }}>
          {/* seller */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 16, borderBottom: '1px solid var(--grey100)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 22, background: `url(${IMG.av2}) center/cover` }}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>지훈</div>
              <div className="tab-num" style={{ fontSize: 11, color: 'var(--grey600)', fontWeight: 400, marginTop: 2 }}>{it.venue} · 매너 4.8</div>
            </div>
            <button className="tm-pressable tm-break-keep" style={{ height: 32, padding: '0 12px', borderRadius: 8, background: 'var(--grey100)', fontSize: 12, fontWeight: 600, color: 'var(--grey700)' }}>프로필</button>
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 16, marginBottom: 10 }}>
            <span style={{ fontSize: 11, padding: '3px 8px', background: 'var(--grey100)', color: 'var(--grey700)', fontWeight: 600, borderRadius: 4 }}>{it.category}</span>
            <span style={{ fontSize: 11, padding: '3px 8px', background: 'var(--orange50)', color: 'var(--orange500)', fontWeight: 600, borderRadius: 4 }}>{it.cond}</span>
            <span style={{ fontSize: 11, padding: '3px 8px', background: 'var(--blue50)', color: 'var(--blue500)', fontWeight: 600, borderRadius: 4 }}>안전거래</span>
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', lineHeight: 1.35 }}>{it.title}</h1>
          <div className="tab-num" style={{ fontSize: 22, fontWeight: 700, color: 'var(--grey900)' }}>{it.price.toLocaleString()}원</div>

          {/* Info grid */}
          <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              ['사이즈', '275mm'],
              ['사용 기간', '6개월'],
              ['보증', '정품 확인'],
              ['직거래', '강남역 가능'],
            ].map(([k, v]) => (
              <div key={k} style={{ padding: 14, background: 'var(--grey50)', borderRadius: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--grey500)', fontWeight: 400 }}>{k}</div>
                <div className="tab-num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--grey900)', marginTop: 4 }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Description */}
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 28, marginBottom: 10 }}>상품 설명</div>
          <p style={{ fontSize: 13, color: 'var(--grey700)', lineHeight: 1.7, margin: 0, fontWeight: 400 }}>
            작년 7월 국내 공식 매장에서 구매한 정품입니다. 매치에서 5회 정도 착용했고, 평소 관리 잘 해서 상태 좋아요. 박스, 영수증 모두 보관하고 있어서 같이 드릴 수 있습니다. 사이즈 안 맞아서 판매합니다.
          </p>

          {/* Safe trade */}
          <div style={{ marginTop: 24, padding: 16, background: 'var(--blue50)', borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Icon name="shield" size={16} color="var(--blue500)"/>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue500)' }}>Teameet 안전거래</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--grey700)', lineHeight: 1.6, fontWeight: 400 }}>
              구매자가 상품을 받고 확인한 후 판매자에게 금액이 전달돼요. 사기 걱정 없이 거래하세요.
            </div>
          </div>

          {/* Similar */}
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 28, marginBottom: 12 }}>비슷한 상품</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {LISTINGS.slice(1, 3).map(s => (
              <div key={s.id}>
                <div style={{ aspectRatio: '1', borderRadius: 10, background: `url(${s.img}) center/cover`, marginBottom: 8 }}/>
                <div style={{ fontSize: 12, color: 'var(--grey900)', lineHeight: 1.4, fontWeight: 400, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.title}</div>
                <div className="tab-num" style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{s.price.toLocaleString()}원</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--static-white)', padding: '12px 20px 24px', borderTop: '1px solid var(--grey150)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="tm-btn tm-btn-neutral tm-btn-icon">
          <Icon name="heart" size={20} color="var(--grey700)"/>
        </button>
        <SBtn variant="dark" size="md" style={{ flex: 1 }}>채팅하기</SBtn>
        <SBtn size="md" style={{ flex: 1 }}>안전거래</SBtn>
      </div>
    </Phone>
  );
};

/* ═══ MOBILE · MATCH DETAIL (deep, Toss-style) ═══ */
const M_MatchDetailDeep = () => {
  const m = MATCHES[0];
  return (
    <Phone statusDark>
      <div style={{ position: 'absolute', inset: 0, overflow: 'auto' }}>
        <div style={{ height: 240, background: `url(${m.img}) center/cover`, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.35) 0%, transparent 50%, rgba(0,0,0,.55) 100%)' }}/>
          <div style={{ position: 'absolute', top: 52, left: 16, right: 16, display: 'flex', justifyContent: 'space-between' }}>
            <button className="tm-pressable tm-break-keep" style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(0,0,0,.3)', display: 'grid', placeItems: 'center' }}>
              <Icon name="chevL" size={22} color="var(--static-white)"/>
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="tm-pressable tm-break-keep" style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(0,0,0,.3)', display: 'grid', placeItems: 'center' }}>
                <Icon name="share" size={18} color="var(--static-white)"/>
              </button>
            </div>
          </div>
          <div style={{ position: 'absolute', bottom: 16, left: 20, right: 20, color: 'var(--static-white)' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 11, padding: '3px 8px', background: 'rgba(255,255,255,.2)', color: 'var(--static-white)', fontWeight: 700, borderRadius: 4 }}>축구</span>
              <span style={{ fontSize: 11, padding: '3px 8px', background: 'rgba(255,255,255,.2)', color: 'var(--static-white)', fontWeight: 700, borderRadius: 4 }}>B급</span>
              <span style={{ fontSize: 11, padding: '3px 8px', background: 'var(--red500)', color: 'var(--static-white)', fontWeight: 700, borderRadius: 4 }}>마감 임박</span>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, lineHeight: 1.3, letterSpacing: 0 }}>{m.title}</h1>
          </div>
        </div>

        <div style={{ padding: '20px 20px 140px', background: 'var(--static-white)' }}>
          {/* Key info block */}
          <div style={{ padding: 16, background: 'var(--grey50)', borderRadius: 12 }}>
            {[
              ['일정', `${m.date} ${m.time} (2시간)`, 'calendar'],
              ['장소', m.venue, 'pin'],
              ['인원', `${m.cur}명 / ${m.max}명 · 4자리 남음`, 'people'],
              ['참가비', `${m.fee.toLocaleString()}원`, 'money'],
            ].map(([k, v, ic], i, a) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < a.length - 1 ? '1px solid var(--grey200)' : 'none' }}>
                <Icon name={ic} size={16} color="var(--grey500)"/>
                <div style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400, width: 48 }}>{k}</div>
                <div className="tab-num" style={{ fontSize: 13, fontWeight: 600, color: 'var(--grey900)', flex: 1 }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Participants */}
          <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 28, marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>참가자</div>
            <div className="tab-num" style={{ fontSize: 13, color: 'var(--grey500)', marginLeft: 8, fontWeight: 400 }}>18명</div>
            <div style={{ flex: 1 }}/>
            <button className="tm-pressable tm-break-keep" style={{ fontSize: 13, color: 'var(--blue500)', fontWeight: 600 }}>전체</button>
          </div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
            {[IMG.av1, IMG.av2, IMG.av3, IMG.av4, IMG.av5, IMG.av6, IMG.av7].map((a, i) => (
              <div key={i} style={{ flexShrink: 0, textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: 26, background: `url(${a}) center/cover`, border: i === 0 ? '2px solid var(--blue500)' : 'none', position: 'relative' }}>
                  {i === 0 && <div style={{ position: 'absolute', bottom: -2, right: -2, padding: '1px 5px', background: 'var(--blue500)', color: 'var(--static-white)', fontSize: 9, fontWeight: 700, borderRadius: 999 }}>방장</div>}
                </div>
                <div style={{ fontSize: 10, color: 'var(--grey700)', marginTop: 4, fontWeight: 500 }}>{['정민', '지훈', '수아', '준호', '예은', '민호', '소희'][i]}</div>
              </div>
            ))}
          </div>

          {/* Host */}
          <div style={{ marginTop: 24, padding: 16, background: 'var(--grey50)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 22, background: `url(${IMG.av1}) center/cover` }}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>정민 (방장)</div>
              <div className="tab-num" style={{ fontSize: 11, color: 'var(--grey600)', fontWeight: 400, marginTop: 2 }}>개설 42회 · 매너 4.9 · B급</div>
            </div>
            <SBtn variant="outline" size="sm">프로필</SBtn>
          </div>

          {/* Description */}
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 28, marginBottom: 10 }}>매치 소개</div>
          <p style={{ fontSize: 13, color: 'var(--grey700)', lineHeight: 1.75, margin: 0, fontWeight: 400 }}>
            매주 토요일 정기 모임이에요. 실력 상관없이 축구를 좋아하시는 분이라면 누구나 환영합니다. 팀 나눠서 진행하고 쉬는 시간에는 간단한 음료 드려요. 늦어도 5분 전 도착 부탁드려요!
          </p>

          {/* Rules */}
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 28, marginBottom: 10 }}>유의사항</div>
          {[
            '매치 시작 2시간 전 이후로 취소 시 환불이 어려워요.',
            '음주 후 참가는 엄격히 제한합니다.',
            '안전을 위해 축구화(FG/AG) 착용 필수.',
          ].map(r => (
            <div key={r} style={{ display: 'flex', gap: 10, padding: '7px 0', fontSize: 13, color: 'var(--grey700)', fontWeight: 400, lineHeight: 1.6 }}>
              <span style={{ color: 'var(--grey400)' }}>•</span>{r}
            </div>
          ))}

          {/* Map */}
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 28, marginBottom: 10 }}>{m.venue}</div>
          <div style={{ height: 140, background: 'var(--grey100)', borderRadius: 12, position: 'relative', overflow: 'hidden', marginBottom: 10 }}>
            <svg width="100%" height="100%" style={{ opacity: .5 }}>
              <path d="M 0 70 Q 150 60 320 80" stroke="var(--static-white)" strokeWidth="10" fill="none"/>
            </svg>
            <div style={{ position: 'absolute', left: '50%', top: '60%', transform: 'translate(-50%, -100%)' }}>
              <div style={{ padding: '5px 10px', background: 'var(--grey900)', color: 'var(--static-white)', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>{m.venue}</div>
              <div style={{ width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '7px solid var(--grey900)', margin: '-1px auto 0' }}/>
            </div>
          </div>
          <div className="tab-num" style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400 }}>서울 마포구 상암동 1-1</div>
        </div>
      </div>

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--static-white)', padding: '12px 20px 24px', borderTop: '1px solid var(--grey150)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="tm-btn tm-btn-neutral tm-btn-icon">
          <Icon name="heart" size={20} color="var(--grey700)"/>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: 'var(--grey500)', fontWeight: 400 }}>참가비</div>
          <div className="tab-num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--grey900)' }}>{m.fee.toLocaleString()}원</div>
        </div>
        <SBtn size="lg" style={{ flex: 1.3 }}>참가하기</SBtn>
      </div>
    </Phone>
  );
};

Object.assign(window, { M_VenueList, M_VenueMap, M_VenueDetail, M_LessonDetail, M_ListingDetail, M_MatchDetailDeep });
