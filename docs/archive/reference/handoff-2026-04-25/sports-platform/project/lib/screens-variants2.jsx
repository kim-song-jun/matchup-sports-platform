/* Diversified Lessons / Market / Venues UX */

/* ═══════════════════ LESSONS — Variant B: Coach-centric cards ═══════════════════ */

const LessonsCoaches = ({ onNav }) => {
  const coaches = [
    { id: 1, name: '박준수', sport: '축구', img: IMG.coach1, avatar: IMG.av1, years: 12, students: 248, rating: 4.9, specialty: '1:1 집중', lowest: 55000, badge: '선출' },
    { id: 2, name: '이민정', sport: '풋살', img: IMG.coach3, avatar: IMG.av3, years: 8,  students: 156, rating: 4.8, specialty: '성인 기초', lowest: 45000, badge: '여성' },
    { id: 3, name: '김지훈', sport: '축구', img: IMG.coach2, avatar: IMG.av2, years: 15, students: 412, rating: 4.7, specialty: '유소년',   lowest: 35000, badge: 'AFC B급' },
    { id: 4, name: '최현우', sport: '농구', img: IMG.coach4, avatar: IMG.av4, years: 6,  students: 98,  rating: 4.9, specialty: '슛 클리닉', lowest: 55000, badge: '선출' },
  ];
  return (
    <Phone>
      <AppBar title="코치 찾기" trailing={[<button key="s" className="tm-btn tm-btn-ghost tm-btn-icon"><Icon name="search" size={22} color="var(--grey800)"/></button>]}/>
      <div style={{ padding: '0 20px 14px' }}>
        <div style={{ display: 'flex', gap: 8, overflow: 'auto' }}>
          {['전체', '⚽ 축구', '⚽ 풋살', '🏀 농구', '🎾 테니스', '🏸 배민'].map((s, i) => (
            <HapticChip key={s} active={i === 0}>{s}</HapticChip>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 20px' }}>
        {coaches.map(c => (
          <Card key={c.id} pad={0} style={{ marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex' }}>
              <div style={{ width: 120, height: 140, background: `url(${c.img}) center/cover`, flexShrink: 0, position: 'relative' }}>
                <div style={{ position: 'absolute', bottom: 6, left: 6, right: 6, padding: 4, background: 'rgba(0,0,0,.7)', color: 'var(--static-white)', fontSize: 9, fontWeight: 700, textAlign: 'center', borderRadius: 4 }}>
                  {c.badge}
                </div>
              </div>
              <div style={{ flex: 1, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 800 }}>{c.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>코치</span>
                  <Badge tone="blue" size="sm">{c.sport}</Badge>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{c.specialty} · 경력 {c.years}년</div>
                <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 11, color: 'var(--text-strong)', fontWeight: 600 }}>
                  <span>★ <b className="tab-num">{c.rating}</b></span>
                  <span className="tab-num">{c.students}명 지도</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>회당</span>
                  <span className="tab-num" style={{ fontSize: 15, fontWeight: 800, color: 'var(--blue500)' }}>{c.lowest.toLocaleString()}원~</span>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <TabBar active="lesson"/>
    </Phone>
  );
};

/* ═══════════════════ LESSONS — Variant C: 레슨 스튜디오 맵 + 카테고리 섹션 ═══════════════════ */

const LessonsHub = ({ onNav }) => (
  <Phone>
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80, background: 'var(--grey50)' }}>
      <div style={{ padding: '52px 20px 16px', background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)', color: 'var(--static-white)' }}>
        <div style={{ fontSize: 12, opacity: .85, fontWeight: 600 }}>TEAMEET ACADEMY</div>
        <div style={{ fontSize: 26, fontWeight: 900, marginTop: 8, lineHeight: 1.2 }}>실력이<br/>바뀌는 1시간</div>
        <div style={{ fontSize: 13, opacity: .9, marginTop: 10 }}>검증된 코치 320명 · 평균 ★4.8</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <SBtn variant="outline" size="sm" style={{ flex: 1, background: 'var(--static-white)', color: 'var(--green500)' }}>코치 찾기</SBtn>
          <SBtn variant="outline" size="sm" style={{ flex: 1, background: 'rgba(255,255,255,.2)', color: 'var(--static-white)', borderColor: 'rgba(255,255,255,.3)' }}>AI 추천 받기</SBtn>
        </div>
      </div>

      {/* Category circles */}
      <div style={{ padding: '20px 16px', background: 'var(--bg)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { l: '1:1', e: '👤', c: 'var(--blue500)' },
            { l: '그룹', e: '👥', c: 'var(--red500)' },
            { l: '원데이', e: '⚡', c: 'var(--orange500)' },
            { l: '입문', e: '🌱', c: '#10b981' },
            { l: '교정', e: '🎯', c: '#8b5cf6' },
            { l: '정기반', e: '📅', c: '#ec4899' },
            { l: '아이', e: '🧒', c: '#f97316' },
            { l: '여성', e: '💗', c: '#e11d48' },
          ].map((x, i) => (
            <button className="tm-pressable tm-break-keep" key={i} style={{ textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: x.c + '20', display: 'grid', placeItems: 'center', fontSize: 24, margin: '0 auto' }}>{x.e}</div>
              <div style={{ fontSize: 11, fontWeight: 700, marginTop: 6 }}>{x.l}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Weekly bestseller carousel */}
      <div style={{ padding: '16px 0' }}>
        <div style={{ padding: '0 20px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>🔥 이번주 인기 레슨</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>전체보기</span>
        </div>
        <div style={{ overflow: 'auto', padding: '0 20px' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            {LESSONS.slice(0, 4).map((l, i) => (
              <div key={l.id} style={{ minWidth: 180, background: 'var(--bg)', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <div style={{ position: 'relative', aspectRatio: '4/3', background: `url(${l.img}) center/cover` }}>
                  <div style={{ position: 'absolute', top: 8, left: 8, background: 'var(--static-white)', borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 800 }}>#{i + 1}</div>
                </div>
                <div style={{ padding: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l.coach}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</div>
                  <div className="tab-num" style={{ fontSize: 14, fontWeight: 800, color: 'var(--green500)', marginTop: 6 }}>{l.price.toLocaleString()}원</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live class right now */}
      <div style={{ margin: '4px 16px 16px', padding: 16, background: 'var(--grey900)', borderRadius: 14, color: 'var(--static-white)', display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ position: 'relative', width: 48, height: 48, borderRadius: 12, background: `url(${IMG.coach1}) center/cover` }}>
          <div style={{ position: 'absolute', bottom: -2, right: -2, width: 10, height: 10, borderRadius: 5, background: 'var(--red500)', border: '2px solid var(--grey900)' }}/>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--red500)', letterSpacing: 1 }}>LIVE</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>박준수 코치 · 라이브 드릴</div>
          <div style={{ fontSize: 10, opacity: .7, marginTop: 2 }}>48명 시청중 · 15분 남음</div>
        </div>
        <SBtn variant="danger" size="sm">시청</SBtn>
      </div>

      {/* Nearby map card */}
      <div style={{ padding: '0 16px 20px' }}>
        <Card pad={0} style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>📍 내 근처 레슨</span>
            <div style={{ flex: 1 }}/>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>5km</span>
          </div>
          <div style={{ position: 'relative', height: 140, background: 'linear-gradient(135deg, var(--blue50), #d4e4f6)' }}>
            {[{x:20,y:40},{x:55,y:30},{x:72,y:60},{x:35,y:70}].map((p, i) => (
              <div key={i} style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, width: 28, height: 28, borderRadius: 14, background: 'var(--green500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, boxShadow: '0 2px 8px rgba(0,0,0,.15)', transform: 'translate(-50%,-50%)' }}>{i+1}</div>
            ))}
            <div style={{ position: 'absolute', bottom: 10, right: 10, padding: '4px 10px', background: 'var(--static-white)', borderRadius: 999, fontSize: 11, fontWeight: 700, boxShadow: 'var(--sh-1)' }}>지도 보기 →</div>
          </div>
        </Card>
      </div>
    </div>
    <TabBar active="lesson"/>
  </Phone>
);

/* ═══════════════════ MARKET — Variant B: Auction / Trending grid ═══════════════════ */

const MarketHot = ({ onNav }) => {
  const hot = [
    { id: 1, title: '나이키 머큐리얼 슈퍼플라이 9', price: 180000, img: IMG.gear1, views: 1247, likes: 89, time: '3분', hot: true },
    { id: 2, title: '요넥스 아크세이버 11 프로',   price: 120000, img: IMG.gear2, views: 823,  likes: 42, time: '12분' },
    { id: 3, title: '아디다스 프레데터 엣지+',      price: 95000,  img: IMG.gear3, views: 612,  likes: 31, time: '34분' },
    { id: 4, title: '몰텐 농구공 GG7X',            price: 65000,  img: IMG.gear4, views: 445,  likes: 22, time: '1시간' },
  ];
  return (
    <Phone>
      <div style={{ padding: '50px 20px 8px', background: 'var(--grey900)', color: 'var(--static-white)' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 900 }}>장터</div>
          <div style={{ flex: 1 }}/>
          <Icon name="search" size={22} color="var(--static-white)"/>
          <div style={{ width: 16 }}/>
          <Icon name="bell" size={22} color="var(--static-white)"/>
        </div>
        <div style={{ fontSize: 12, opacity: .7, marginTop: 8, fontWeight: 600 }}>오늘 3,428건 거래 · 평균 3분만에 채팅</div>
      </div>

      {/* hot banner */}
      <div style={{ background: 'var(--grey900)', padding: '0 20px 16px', overflow: 'auto' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          {['🔥 급처', '⚡ 새상품', '📍 근처', '🏷️ 네고가능', '🎁 무료나눔'].map((c, i) => (
            <button key={c} className="tm-chip" style={{ background: i === 0 ? 'var(--red500)' : 'rgba(255,255,255,.1)', color: 'var(--static-white)', border: i === 0 ? 'none' : '1px solid rgba(255,255,255,.2)' }}>{c}</button>
          ))}
        </div>
      </div>

      {/* Featured auction banner */}
      <div style={{ margin: '-10px 20px 16px', padding: 16, background: 'linear-gradient(135deg, var(--orange500), var(--red500))', borderRadius: 16, color: 'var(--static-white)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, opacity: .9 }}>🔨 실시간 경매</div>
        <div style={{ fontSize: 18, fontWeight: 800, marginTop: 6 }}>미즈노 모렐리아 네오3</div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12, alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 10, opacity: .85, fontWeight: 700 }}>현재가</div>
            <div className="tab-num" style={{ fontSize: 22, fontWeight: 900 }}>135,000원</div>
          </div>
          <div style={{ flex: 1 }}/>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, opacity: .85, fontWeight: 700 }}>마감까지</div>
            <div className="tab-num" style={{ fontSize: 16, fontWeight: 900 }}>02:14:37</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 16px 16px', display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: 15, fontWeight: 800 }}>지금 뜨는 매물</span>
        <div style={{ flex: 1 }}/>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>실시간 업데이트</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {hot.map((it, i) => (
            <div key={it.id} style={{ background: 'var(--bg)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div style={{ position: 'relative', aspectRatio: '1/1', background: `url(${it.img}) center/cover` }}>
                {it.hot && <div style={{ position: 'absolute', top: 8, left: 8, padding: '3px 8px', background: 'var(--red500)', color: 'var(--static-white)', fontSize: 10, fontWeight: 800, borderRadius: 4 }}>🔥 HOT</div>}
                <div style={{ position: 'absolute', bottom: 6, right: 6, padding: '3px 8px', background: 'rgba(0,0,0,.6)', color: 'var(--static-white)', fontSize: 10, fontWeight: 700, borderRadius: 4, backdropFilter: 'blur(4px)' }}>👁 {it.views}</div>
              </div>
              <div style={{ padding: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</div>
                <div className="tab-num" style={{ fontSize: 14, fontWeight: 800, marginTop: 4 }}>{it.price.toLocaleString()}원</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: 'var(--text-muted)' }}>
                  <span>♡ {it.likes}</span>
                  <span>{it.time} 전</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <TabBar active="market"/>
    </Phone>
  );
};

/* ═══════════════════ MARKET — Variant C: 카테고리 카달로그 ═══════════════════ */

const MarketCatalog = ({ onNav }) => {
  const cats = [
    { k: '축구화', n: 842, img: IMG.gear1 },
    { k: '라켓',   n: 316, img: IMG.gear2 },
    { k: '풋살화', n: 218, img: IMG.gear3 },
    { k: '공',     n: 184, img: IMG.gear4 },
    { k: '보호대', n: 127, img: IMG.gear1 },
    { k: '유니폼', n: 456, img: IMG.gear2 },
  ];
  return (
    <Phone>
      <AppBar title="장터 카달로그" trailing={[<button key="s" className="tm-btn tm-btn-ghost tm-btn-icon"><Icon name="search" size={22} color="var(--grey800)"/></button>]}/>
      <div style={{ padding: '0 20px 16px' }}>
        <div style={{ padding: 14, background: 'linear-gradient(135deg, var(--blue500), var(--blue700))', borderRadius: 14, color: 'var(--static-white)' }}>
          <div style={{ fontSize: 12, opacity: .85, fontWeight: 600 }}>내가 찾던 것</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>축구화 275mm · 중고가 82,000원~</div>
          <div style={{ fontSize: 11, opacity: .85, marginTop: 4 }}>저장된 검색어에서 새 매물 24건</div>
        </div>
      </div>

      <div style={{ fontSize: 14, fontWeight: 800, padding: '0 20px 10px' }}>카테고리</div>
      <div style={{ padding: '0 20px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {cats.map(c => (
            <div key={c.k} style={{ padding: 12, background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)', textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: 28, background: `var(--grey100) url(${c.img}) center/cover`, margin: '0 auto 8px' }}/>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{c.k}</div>
              <div className="tab-num" style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontWeight: 600 }}>{c.n.toLocaleString()}건</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 14, fontWeight: 800, padding: '0 20px 10px' }}>브랜드</div>
      <div style={{ padding: '0 20px 20px', overflow: 'auto' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          {['Nike', 'Adidas', 'Puma', 'Mizuno', 'Yonex', 'Molten', 'Umbro'].map(b => (
            <div key={b} style={{ minWidth: 80, height: 60, borderRadius: 10, background: 'var(--grey50)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800 }}>{b}</div>
          ))}
        </div>
      </div>

      <div style={{ padding: '0 20px 20px', flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}>맞춤 추천</span>
          <div style={{ flex: 1 }}/>
          <Icon name="refresh" size={16} color="var(--grey600)"/>
        </div>
        {LISTINGS.map(l => (
          <div key={l.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: 72, height: 72, borderRadius: 10, background: `url(${l.img}) center/cover`, flexShrink: 0 }}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{l.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{l.venue} · {l.cond}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                <span className="tab-num" style={{ fontSize: 14, fontWeight: 800 }}>{l.price.toLocaleString()}원</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>♡ 24 · 💬 5</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <TabBar active="market"/>
    </Phone>
  );
};

/* ═══════════════════ VENUES — Variant B: 지도 + 시간슬롯 ═══════════════════ */

const VenuesMap = ({ onNav }) => (
  <Phone>
    <div style={{ padding: '48px 16px 12px', display: 'flex', gap: 8 }}>
      <button onClick={() => onNav?.('venues')} className="tm-btn tm-btn-ghost tm-btn-icon"><Icon name="chevL" size={22} color="var(--grey800)"/></button>
      <div style={{ flex: 1, height: 40, background: 'var(--grey50)', borderRadius: 20, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8 }}>
        <Icon name="search" size={18} color="var(--grey600)"/>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>지역·시설 검색</span>
      </div>
      <button className="tm-btn tm-btn-ghost tm-btn-icon"><Icon name="filter" size={22} color="var(--grey800)"/></button>
    </div>

    <div style={{ padding: '0 16px 12px', overflow: 'auto' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {['⚽ 축구장', '⚽ 풋살장', '🏀 농구장', '🎾 테니스장', '🏸 배드민턴장'].map((s, i) => (
          <HapticChip key={s} active={i === 1}>{s}</HapticChip>
        ))}
      </div>
    </div>

    <div style={{ flex: 1, position: 'relative', background: 'linear-gradient(135deg, var(--blue50), #c1d7ed)', overflow: 'hidden' }}>
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <path d="M 0 150 Q 180 100 400 250" stroke="var(--static-white)" strokeWidth="16" fill="none" opacity=".7"/>
        <path d="M 80 0 Q 120 400 280 600" stroke="var(--static-white)" strokeWidth="12" fill="none" opacity=".5"/>
        <rect x="40" y="100" width="110" height="70" fill="#b7dfc0" opacity=".5" rx="6"/>
        <path d="M 0 350 Q 150 380 300 360 L 400 380 L 400 420 L 0 420 Z" fill="#b4d1ec" opacity=".6"/>
      </svg>

      {[
        { x: 25, y: 30, l: '상암 월드컵 보조구장', price: '180k', busy: false },
        { x: 60, y: 24, l: '풋볼파크 강남', price: '90k', busy: true },
        { x: 45, y: 48, l: '이태원 풋살', price: '65k', busy: false },
        { x: 72, y: 60, l: '목동 아이스', price: '120k', busy: false },
      ].map((v, i) => (
        <div key={i} style={{ position: 'absolute', left: `${v.x}%`, top: `${v.y}%`, transform: 'translate(-50%, -100%)' }}>
          <div style={{ padding: '8px 12px', borderRadius: 14, background: v.busy ? 'var(--red500)' : 'var(--static-white)', color: v.busy ? 'var(--static-white)' : 'var(--text-strong)', fontSize: 11, fontWeight: 800, boxShadow: 'var(--sh-2)', border: '2px solid var(--static-white)', minWidth: 72, textAlign: 'center' }}>
            <div className="tab-num" style={{ fontSize: 14, fontWeight: 900 }}>{v.price}</div>
            <div style={{ fontSize: 9, marginTop: 2, opacity: .8 }}>{v.busy ? '예약종료' : '예약가능'}</div>
          </div>
        </div>
      ))}
    </div>

    {/* Bottom card */}
    <div style={{ position: 'absolute', bottom: 64, left: 12, right: 12, padding: 16, background: 'var(--static-white)', borderRadius: 18, boxShadow: '0 10px 30px rgba(0,0,0,.15)' }}>
      <div style={{ width: 32, height: 4, background: 'var(--grey200)', borderRadius: 2, margin: '0 auto 12px' }}/>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ width: 76, height: 76, borderRadius: 12, background: `url(${IMG.venue1}) center/cover`, flexShrink: 0 }}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>상암 월드컵 보조구장</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>축구장 · 풀사이즈 · 1.8km</div>
          <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
            {['주차', '조명', '샤워실', '락커'].map(x => <span key={x} style={{ padding: '2px 6px', background: 'var(--grey100)', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>{x}</span>)}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 8 }}>오늘 가능 시간</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {[{t:'10:00',o:true},{t:'12:00',o:false},{t:'14:00',o:true},{t:'16:00',o:true},{t:'18:00',o:false},{t:'20:00',o:true}].map(s => (
          <div key={s.t} style={{ flex: 1, padding: '8px 0', textAlign: 'center', borderRadius: 8, background: s.o ? 'var(--blue50)' : 'var(--grey100)', color: s.o ? 'var(--blue500)' : 'var(--grey400)', fontSize: 11, fontWeight: 700, textDecoration: s.o ? 'none' : 'line-through' }}>
            {s.t}
          </div>
        ))}
      </div>
    </div>
    <TabBar active="venues"/>
  </Phone>
);

/* ═══════════════════ VENUES — Variant C: 주간 캘린더 히트맵 ═══════════════════ */

const VenuesWeek = ({ onNav }) => {
  const hours = ['09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21'];
  const days = ['월', '화', '수', '목', '금', '토', '일'];
  // 0=available, 1=booked, 2=busy
  const heat = days.map((_, di) => hours.map((_, hi) => {
    const saturday = di === 5;
    const evening = hi >= 8;
    if (saturday && evening) return 1;
    if (saturday) return Math.random() > 0.5 ? 1 : 2;
    if (evening) return Math.random() > 0.6 ? 1 : 2;
    return Math.random() > 0.85 ? 1 : 0;
  }));
  const colors = ['var(--blue50)', 'var(--red500)', 'var(--yellow500)'];
  return (
    <Phone>
      <AppBar title="풋볼파크 강남" leading={<button onClick={() => onNav?.('venue-detail')} className="tm-btn tm-btn-ghost tm-btn-icon"><Icon name="chevL" size={24} color="var(--grey800)"/></button>} trailing={[<button key="h" className="tm-btn tm-btn-ghost tm-btn-icon"><Icon name="heart" size={22} color="var(--grey800)"/></button>]}/>

      <div style={{ padding: '8px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>주간 예약 현황</span>
          <div style={{ flex: 1 }}/>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>‹ 5.5 — 5.11 ›</span>
        </div>

        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 10, overflow: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `28px repeat(${hours.length}, 1fr)`, gap: 3 }}>
            <div></div>
            {hours.map(h => <div key={h} className="tab-num" style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'center', fontWeight: 700 }}>{h}</div>)}
            {days.map((d, di) => (
              <React.Fragment key={d}>
                <div style={{ fontSize: 11, fontWeight: 700, alignSelf: 'center', color: di >= 5 ? 'var(--red500)' : 'var(--text-strong)' }}>{d}</div>
                {hours.map((_, hi) => (
                  <div key={hi} style={{ aspectRatio: '1/1', background: colors[heat[di][hi]], borderRadius: 3, minHeight: 18, cursor: heat[di][hi] === 0 ? 'pointer' : 'default' }}/>
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, marginTop: 14, alignItems: 'center', fontSize: 11 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--blue50)' }}/>가능
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--yellow500)' }}/>혼잡
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--red500)' }}/>예약됨
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 20px' }}>
        <Card pad={14}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>이번주 추천 시간</div>
          {[
            { d: '수요일 10:00', s: '가장 한가한 시간', p: '90,000원', save: '20% 할인' },
            { d: '목요일 14:00', s: '우천 취소 자리',  p: '72,000원', save: '취소분' },
            { d: '금요일 16:00', s: '평일 얼리버드',    p: '80,000원', save: '10% 할인' },
          ].map((x, i) => (
            <div key={i} style={{ display: 'flex', padding: '10px 0', borderBottom: i < 2 ? '1px solid var(--border)' : 'none', gap: 12 }}>
              <div style={{ width: 4, background: 'var(--blue500)', borderRadius: 2 }}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{x.d}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{x.s}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Badge tone="green" size="sm">{x.save}</Badge>
                <div className="tab-num" style={{ fontSize: 13, fontWeight: 800, marginTop: 4 }}>{x.p}</div>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </Phone>
  );
};

Object.assign(window, { LessonsCoaches, LessonsHub, MarketHot, MarketCatalog, VenuesMap, VenuesWeek });
