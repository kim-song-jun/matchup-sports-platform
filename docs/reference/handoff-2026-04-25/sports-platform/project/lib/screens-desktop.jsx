/* Desktop web + Admin — strict Toss DS compliance
   Rules: no emojis, no gradients, white surfaces, blue only for interaction,
   400/600/700 weights only, 8/12/16px radius, single-layer shadows */

const Desktop = ({ children }) => (
  <div style={{ width: 1280, height: 800, background: 'var(--static-white)', display: 'flex', flexDirection: 'column', fontFamily: "'Pretendard', -apple-system, sans-serif", overflow: 'hidden', color: 'var(--grey900)' }}>
    {children}
  </div>
);

/* ─── DESKTOP · HOME (Toss-style mobile-web centered column) ─── */
const DesktopHome = () => (
  <Desktop>
    {/* Top nav — minimal, white, no shadow */}
    <div style={{ height: 64, borderBottom: '1px solid var(--grey200)', display: 'flex', alignItems: 'center', padding: '0 32px', gap: 40, flexShrink: 0 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--grey900)', letterSpacing: 0 }}>Teameet</div>
      <div style={{ display: 'flex', gap: 28 }}>
        {[['매치', true], ['팀'], ['레슨'], ['장터'], ['시설']].map(([t, a], i) => (
          <div key={i} style={{ fontSize: 14, fontWeight: a ? 600 : 400, color: a ? 'var(--grey900)' : 'var(--grey600)', cursor: 'pointer' }}>{t}</div>
        ))}
      </div>
      <div style={{ flex: 1 }}/>
      <div style={{ width: 280, height: 40, background: 'var(--grey100)', borderRadius: 8, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 8 }}>
        <Icon name="search" size={16} color="var(--grey500)"/>
        <span style={{ fontSize: 14, color: 'var(--grey400)', fontWeight: 400 }}>종목 · 지역 검색</span>
      </div>
      <Icon name="bell" size={20} color="var(--grey700)"/>
      <div style={{ width: 36, height: 36, borderRadius: 18, background: `url(${IMG.av1}) center/cover` }}/>
    </div>

    <div style={{ flex: 1, overflow: 'auto' }}>
      {/* Centered content column — mobile-web parity, max 720 */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px 80px' }}>

        {/* Hero — white, text-led, single CTA */}
        <div style={{ marginBottom: 56 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--grey600)', marginBottom: 16 }}>오늘 열린 매치 <span className="tab-num" style={{ color: 'var(--grey900)', fontWeight: 700 }}>124</span></div>
          <h1 style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.35, color: 'var(--grey900)', margin: 0, letterSpacing: 0 }}>
            오늘, 같이 뛸 사람을<br/>3분 안에 찾아요.
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.5, color: 'var(--grey700)', marginTop: 16, fontWeight: 400 }}>
            종목과 레벨, 지역을 고르면 맞는 매치를 바로 보여드려요.
          </p>
          <div style={{ marginTop: 28 }}>
            <SBtn size="lg" style={{ minWidth: 200 }}>매치 찾기</SBtn>
          </div>
        </div>

        {/* Filter summary card — single-layer, white */}
        <div style={{ padding: 20, border: '1px solid var(--grey200)', borderRadius: 12, marginBottom: 48 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--grey900)', marginBottom: 14 }}>빠른 필터</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
            {[['종목', '축구'], ['지역', '강남구'], ['일시', '이번 주말'], ['레벨', 'B급 이상']].map(([l, v], i) => (
              <div key={l} style={{ padding: '0 16px', borderRight: i < 3 ? '1px solid var(--grey200)' : 'none' }}>
                <div style={{ fontSize: 12, color: 'var(--grey500)', fontWeight: 400, marginBottom: 4 }}>{l}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--grey900)' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Matches list — dense rows, no images per row, clean */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--grey900)', margin: 0 }}>지금 뜨는 매치</h2>
          <SBtn variant="ghost" size="sm">전체 보기</SBtn>
        </div>

        <div style={{ border: '1px solid var(--grey200)', borderRadius: 12, overflow: 'hidden', marginBottom: 48 }}>
          {MATCHES.slice(0, 5).map((m, i) => (
            <div key={m.id} style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, borderTop: i > 0 ? '1px solid var(--grey100)' : 'none', cursor: 'pointer' }}>
              <div style={{ width: 56, height: 56, borderRadius: 12, background: `url(${m.img}) center/cover`, flexShrink: 0 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, padding: '2px 6px', background: 'var(--grey100)', color: 'var(--grey700)', fontWeight: 600, borderRadius: 4 }}>{SPORTS.find(s => s.id === m.sport)?.label}</span>
                  <span style={{ fontSize: 12, padding: '2px 6px', background: 'var(--blue50)', color: 'var(--blue500)', fontWeight: 600, borderRadius: 4 }}>Lv {m.level}</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--grey900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</div>
                <div className="tab-num" style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400, marginTop: 2 }}>{m.date} {m.time} · {m.venue}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="tab-num" style={{ fontSize: 16, fontWeight: 700, color: 'var(--grey900)' }}>{m.fee.toLocaleString()}원</div>
                <div className="tab-num" style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400, marginTop: 2 }}>{m.cur}/{m.max}명</div>
              </div>
              <Icon name="chevR" size={16} color="var(--grey400)"/>
            </div>
          ))}
        </div>

        {/* Category row — plain text, no icons/emojis */}
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--grey900)', margin: '0 0 16px' }}>다른 서비스</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { t: '레슨', s: '검증된 코치와 1:1' },
            { t: '장터', s: '장비 · 티켓 · 용병' },
            { t: '시설', s: '실시간 예약' },
          ].map(c => (
            <div key={c.t} style={{ padding: 20, border: '1px solid var(--grey200)', borderRadius: 12, cursor: 'pointer' }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--grey900)', marginBottom: 4 }}>{c.t}</div>
              <div style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400 }}>{c.s}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid var(--grey200)', padding: '32px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--grey900)' }}>Teameet</div>
        <div style={{ fontSize: 12, color: 'var(--grey500)', marginTop: 8 }}>© 2026 Teameet, Inc. · 사업자등록번호 123-45-67890</div>
      </div>
    </div>
  </Desktop>
);

/* ─── DESKTOP · MATCHES (left filters + center list, no right preview clutter) ─── */
const DesktopMatches = () => (
  <Desktop>
    <div style={{ height: 64, borderBottom: '1px solid var(--grey200)', display: 'flex', alignItems: 'center', padding: '0 32px', gap: 40, flexShrink: 0 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--grey900)' }}>Teameet</div>
      <div style={{ display: 'flex', gap: 28 }}>
        {[['매치', true], ['팀'], ['레슨'], ['장터'], ['시설']].map(([t, a], i) => (
          <div key={i} style={{ fontSize: 14, fontWeight: a ? 600 : 400, color: a ? 'var(--grey900)' : 'var(--grey600)', cursor: 'pointer' }}>{t}</div>
        ))}
      </div>
      <div style={{ flex: 1 }}/>
      <div style={{ width: 36, height: 36, borderRadius: 18, background: `url(${IMG.av1}) center/cover` }}/>
    </div>

    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Left filter rail */}
      <div style={{ width: 240, borderRight: '1px solid var(--grey200)', padding: 24, overflow: 'auto', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--grey900)', marginBottom: 12 }}>종목</div>
        <div style={{ marginBottom: 32 }}>
          {[['전체', 124, true], ['축구', 42], ['풋살', 38], ['농구', 18], ['테니스', 14], ['배드민턴', 8], ['하키', 4]].map(([t, n, a], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14, fontWeight: a ? 600 : 400, color: a ? 'var(--blue500)' : 'var(--grey700)', cursor: 'pointer' }}>
              <span>{t}</span>
              <span className="tab-num" style={{ color: 'var(--grey500)', fontWeight: 400 }}>{n}</span>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--grey900)', marginBottom: 12 }}>레벨</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 32 }}>
          {['A', 'B', 'C', 'D'].map(g => (
            <Chip key={g} size="sm" active={g === 'B'}>{g}급</Chip>
          ))}
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--grey900)', marginBottom: 12 }}>참가비</div>
        <div style={{ marginBottom: 32 }}>
          <div className="tab-num" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--grey600)', fontWeight: 400, marginBottom: 10 }}>
            <span>0원</span><span>100,000원</span>
          </div>
          <div style={{ height: 4, background: 'var(--grey200)', borderRadius: 2, position: 'relative' }}>
            <div style={{ position: 'absolute', left: '10%', right: '40%', height: '100%', background: 'var(--blue500)', borderRadius: 2 }}/>
          </div>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--grey900)', marginBottom: 12 }}>특징</div>
        {['주차가능', '샤워실', '야간조명', '초보환영'].map(t => {
          const on = t === '초보환영';
          return (
            <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 14, color: 'var(--grey700)', cursor: 'pointer', fontWeight: 400 }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, background: on ? 'var(--blue500)' : 'var(--static-white)', border: '1.5px solid ' + (on ? 'var(--blue500)' : 'var(--grey300)'), display: 'grid', placeItems: 'center' }}>
                {on && <Icon name="check" size={12} color="var(--static-white)" stroke={2.5}/>}
              </div>
              {t}
            </label>
          );
        })}
      </div>

      {/* Main list — single column */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ maxWidth: 780, margin: '0 auto', padding: '32px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 24 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--grey900)', margin: 0 }}>매치 찾기</h1>
            <span className="tab-num" style={{ fontSize: 14, color: 'var(--grey600)', marginLeft: 10, fontWeight: 400 }}>124건</span>
            <div style={{ flex: 1 }}/>
            <SBtn variant="neutral" size="sm">
              마감임박순 <Icon name="chevD" size={14}/>
            </SBtn>
          </div>

          <div style={{ border: '1px solid var(--grey200)', borderRadius: 12, overflow: 'hidden' }}>
            {MATCHES.concat(MATCHES).slice(0, 10).map((m, i) => (
              <div key={i} style={{ padding: 20, display: 'flex', gap: 20, alignItems: 'center', borderTop: i > 0 ? '1px solid var(--grey100)' : 'none', cursor: 'pointer' }}>
                <div style={{ width: 96, height: 96, borderRadius: 12, background: `url(${m.img}) center/cover`, flexShrink: 0 }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, padding: '2px 8px', background: 'var(--grey100)', color: 'var(--grey700)', fontWeight: 600, borderRadius: 4 }}>{SPORTS.find(s => s.id === m.sport)?.label}</span>
                    <span style={{ fontSize: 12, padding: '2px 8px', background: 'var(--blue50)', color: 'var(--blue500)', fontWeight: 600, borderRadius: 4 }}>Lv {m.level}</span>
                    {m.cur/m.max > .7 && <span style={{ fontSize: 12, padding: '2px 8px', background: 'var(--red50)', color: 'var(--red500)', fontWeight: 600, borderRadius: 4 }}>마감임박</span>}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--grey900)', marginBottom: 4 }}>{m.title}</div>
                  <div className="tab-num" style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400 }}>{m.date} {m.time} · {m.venue}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 100 }}>
                  <div className="tab-num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--grey900)' }}>{m.fee.toLocaleString()}원</div>
                  <div className="tab-num" style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400, marginTop: 4 }}>{m.cur}/{m.max}명</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </Desktop>
);

/* ─── ADMIN SHELL — dark sidebar, light workspace ─── */
const AdminShell = ({ active, children }) => {
  const menu = [
    { l: '대시보드', k: 'dashboard' },
    { l: '매치 관리', k: 'matches' },
    { l: '유저 관리', k: 'users' },
    { l: '시설 관리', k: 'venues' },
    { l: '코치 관리', k: 'coaches' },
    { l: '정산', k: 'payouts' },
    { l: '신고 처리', k: 'reports', badge: 7 },
    { l: '설정', k: 'settings' },
  ];
  return (
    <div style={{ width: 1280, height: 800, background: 'var(--grey50)', display: 'flex', fontFamily: "'Pretendard', sans-serif", overflow: 'hidden', color: 'var(--grey900)' }}>
      <div style={{ width: 220, background: '#111827', borderRight: '1px solid #1f2937', display: 'flex', flexDirection: 'column', color: 'var(--static-white)' }}>
        <div style={{ padding: '24px 20px', borderBottom: '1px solid #1f2937' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--static-white)' }}>Teameet</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginTop: 4 }}>Admin</div>
        </div>
        <div style={{ padding: 12, flex: 1 }}>
          {menu.map(m => {
            const on = active === m.k;
            return (
              <div key={m.k} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderRadius: 8, background: on ? 'rgba(49,130,246,.18)' : 'transparent', color: on ? '#93c5fd' : '#e5e7eb', fontSize: 14, fontWeight: on ? 600 : 400, marginBottom: 2, cursor: 'pointer' }}>
                <span style={{ flex: 1 }}>{m.l}</span>
                {m.badge && <div className="tab-num" style={{ minWidth: 20, height: 20, padding: '0 6px', background: 'var(--red500)', color: 'var(--static-white)', fontSize: 11, fontWeight: 700, borderRadius: 10, display: 'grid', placeItems: 'center' }}>{m.badge}</div>}
              </div>
            );
          })}
        </div>
        <div style={{ padding: 16, borderTop: '1px solid #1f2937', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 16, background: `url(${IMG.av2}) center/cover` }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--static-white)' }}>운영자</div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis' }}>admin@teameet.kr</div>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
};

/* ─── ADMIN · DASHBOARD ─── */
const AdminDashboard = () => {
  const kpi = [
    { l: '오늘 매치', v: '124', d: '+12%', p: true, sub: '어제 111건' },
    { l: '신규 가입', v: '486', d: '+8%', p: true, sub: '이번 주' },
    { l: '총 거래액', v: '3,248,500원', d: '+24%', p: true, sub: '이번 달' },
    { l: '신고 미처리', v: '7', d: '긴급 2', p: false, sub: '대기중' },
  ];
  const bars = [42, 68, 55, 91, 74, 128, 104];
  const maxB = 140;
  return (
    <AdminShell active="dashboard">
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '24px 32px', background: 'var(--static-white)', borderBottom: '1px solid var(--grey200)', display: 'flex', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--grey900)' }}>대시보드</h1>
            <div className="tab-num" style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400, marginTop: 4 }}>2026년 4월 24일 목요일</div>
          </div>
          <div style={{ flex: 1 }}/>
          <div style={{ display: 'flex', gap: 0, padding: 4, background: 'var(--grey100)', borderRadius: 8 }}>
            {['오늘', '7일', '30일', '3개월'].map((t, i) => (
              <SBtn key={t} variant={i === 1 ? 'outline' : 'ghost'} size="sm" style={{ minHeight: 32 }}>{t}</SBtn>
            ))}
          </div>
        </div>

        <div style={{ padding: 32 }}>
          {/* KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            {kpi.map(k => (
              <div key={k.l} style={{ padding: 24, background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)' }}>
                <div style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400 }}>{k.l}</div>
                <div className="tab-num" style={{ fontSize: 26, fontWeight: 700, marginTop: 8, color: 'var(--grey900)' }}>{k.v}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  <span className="tab-num" style={{ fontSize: 13, fontWeight: 600, color: k.p ? 'var(--green500)' : 'var(--red500)' }}>{k.d}</span>
                  <span style={{ fontSize: 12, color: 'var(--grey500)', fontWeight: 400 }}>{k.sub}</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>
            {/* Bar chart */}
            <div style={{ padding: 24, background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--grey900)' }}>매치 개설 추이</div>
                  <div style={{ fontSize: 12, color: 'var(--grey600)', marginTop: 2, fontWeight: 400 }}>최근 7일</div>
                </div>
                <div style={{ flex: 1 }}/>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--grey600)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 10, height: 10, background: 'var(--blue500)', borderRadius: 2 }}/>개설</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 10, height: 10, background: 'var(--blue50)', borderRadius: 2 }}/>완료</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, height: 180, paddingBottom: 16, borderBottom: '1px solid var(--grey100)' }}>
                {bars.map((b, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <span className="tab-num" style={{ fontSize: 12, fontWeight: 600, color: 'var(--grey900)' }}>{b}</span>
                    <div style={{ width: '100%', height: `${(b/maxB)*140}px`, background: 'var(--blue500)', borderRadius: '4px 4px 0 0' }}/>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 20, paddingTop: 10 }}>
                {['월','화','수','목','금','토','일'].map(d => (
                  <div key={d} style={{ flex: 1, textAlign: 'center', fontSize: 12, color: 'var(--grey500)', fontWeight: 400 }}>{d}</div>
                ))}
              </div>
            </div>

            {/* Donut */}
            <div style={{ padding: 24, background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--grey900)', marginBottom: 20 }}>종목별 비중</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <svg width="100" height="100" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--grey100)" strokeWidth="3.5"/>
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--blue500)" strokeWidth="3.5" strokeDasharray="42 58" transform="rotate(-90 18 18)" strokeLinecap="round"/>
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--blue400)" strokeWidth="3.5" strokeDasharray="24 76" strokeDashoffset="-42" transform="rotate(-90 18 18)" strokeLinecap="round"/>
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--blue200)" strokeWidth="3.5" strokeDasharray="18 82" strokeDashoffset="-66" transform="rotate(-90 18 18)" strokeLinecap="round"/>
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--blue100)" strokeWidth="3.5" strokeDasharray="16 84" strokeDashoffset="-84" transform="rotate(-90 18 18)" strokeLinecap="round"/>
                </svg>
                <div style={{ flex: 1, fontSize: 13 }}>
                  {[['축구', 42, 'var(--blue500)'], ['풋살', 24, 'var(--blue400)'], ['농구', 18, 'var(--blue200)'], ['기타', 16, 'var(--blue100)']].map(([n, p, c]) => (
                    <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: c }}/>
                      <span style={{ flex: 1, fontWeight: 400, color: 'var(--grey700)' }}>{n}</span>
                      <span className="tab-num" style={{ color: 'var(--grey900)', fontWeight: 600 }}>{p}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', overflow: 'hidden' }}>
              <div style={{ padding: 20, borderBottom: '1px solid var(--grey200)', display: 'flex', alignItems: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>실시간 매치</div>
                <div style={{ flex: 1 }}/>
                <SBtn variant="ghost" size="sm">전체 보기</SBtn>
              </div>
              {MATCHES.slice(0, 4).map((m, i) => (
                <div key={m.id} style={{ padding: '14px 20px', borderTop: i > 0 ? '1px solid var(--grey100)' : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="tab-num" style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400, width: 50 }}>{m.time}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400, marginTop: 2 }}>{m.host}</div>
                  </div>
                  <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: i === 0 ? 'var(--blue50)' : i === 1 ? 'var(--green50)' : 'var(--grey100)', color: i === 0 ? 'var(--blue500)' : i === 1 ? 'var(--green500)' : 'var(--grey600)' }}>
                    {i === 0 ? '모집중' : i === 1 ? '마감' : '진행중'}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', overflow: 'hidden' }}>
              <div style={{ padding: 20, borderBottom: '1px solid var(--grey200)' }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>처리 대기 신고</div>
              </div>
              {[
                { t: '매너 없는 행동', u: '지훈***', urgent: true },
                { t: '노쇼 반복', u: '현우***' },
                { t: '허위 매물', u: '민정***' },
                { t: '불쾌한 메시지', u: '재영***', urgent: true },
              ].map((x, i) => (
                <div key={i} style={{ padding: '14px 20px', borderTop: i > 0 ? '1px solid var(--grey100)' : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 4, height: 36, borderRadius: 2, background: x.urgent ? 'var(--red500)' : 'var(--orange500)' }}/>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{x.t}</div>
                    <div style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400, marginTop: 2 }}>피신고자 {x.u}</div>
                  </div>
                  <SBtn size="sm" variant={x.urgent ? 'danger' : 'neutral'}>{x.urgent ? '긴급' : '검토'}</SBtn>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
};

/* ─── ADMIN · MATCHES ─── */
const AdminMatches = () => (
  <AdminShell active="matches">
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '24px 32px', background: 'var(--static-white)', borderBottom: '1px solid var(--grey200)', display: 'flex', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>매치 관리</h1>
          <div className="tab-num" style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400, marginTop: 4 }}>전체 1,284건 · 오늘 124건</div>
        </div>
        <div style={{ flex: 1 }}/>
        <SBtn size="md">매치 만들기</SBtn>
      </div>

      <div style={{ padding: 32 }}>
        <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)' }}>
          <div style={{ padding: 20, display: 'flex', gap: 10, alignItems: 'center', borderBottom: '1px solid var(--grey200)' }}>
            <div style={{ width: 300, height: 40, background: 'var(--grey100)', borderRadius: 8, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 8 }}>
              <Icon name="search" size={16} color="var(--grey500)"/>
              <span style={{ fontSize: 14, color: 'var(--grey400)', fontWeight: 400 }}>제목·호스트 검색</span>
            </div>
            {['종목', '상태', '지역'].map(f => (
              <SBtn key={f} variant="outline" size="sm">
                {f} <Icon name="chevD" size={14}/>
              </SBtn>
            ))}
            <div style={{ flex: 1 }}/>
            <span style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400 }}>선택 <b className="tab-num" style={{ color: 'var(--grey900)', fontWeight: 700 }}>3</b></span>
            <SBtn variant="danger" size="sm">일괄 취소</SBtn>
          </div>

          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--grey50)', color: 'var(--grey500)', fontWeight: 600, fontSize: 12 }}>
                {[['', 40], ['ID', 70], ['매치', 340], ['호스트', 100], ['일시', 120], ['인원', 70], ['참가비', 100], ['수수료', 90], ['상태', 90]].map(([h, w], i) => (
                  <th key={i} style={{ padding: '14px 16px', textAlign: h === '참가비' || h === '수수료' || h === '인원' ? 'right' : 'left', width: w, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATCHES.concat(MATCHES).slice(0, 10).map((m, i) => {
                const statuses = [['모집중', 'var(--blue500)', 'var(--blue50)'], ['마감', 'var(--green500)', 'var(--green50)'], ['진행중', 'var(--orange500)', 'var(--orange50)'], ['취소', 'var(--red500)', 'var(--red50)'], ['완료', 'var(--grey600)', 'var(--grey100)']];
                const st = statuses[i % statuses.length];
                const sel = [0, 2, 4].includes(i);
                return (
                  <tr key={i} style={{ borderTop: '1px solid var(--grey100)', background: sel ? 'var(--grey50)' : 'transparent' }}>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ width: 18, height: 18, borderRadius: 4, background: sel ? 'var(--blue500)' : 'var(--static-white)', border: '1.5px solid ' + (sel ? 'var(--blue500)' : 'var(--grey300)'), display: 'grid', placeItems: 'center' }}>
                        {sel && <Icon name="check" size={12} color="var(--static-white)" stroke={2.5}/>}
                      </div>
                    </td>
                    <td className="tab-num" style={{ padding: '14px 16px', color: 'var(--grey500)', fontWeight: 400 }}>#{1024 - i}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div style={{ width: 40, height: 40, borderRadius: 8, background: `url(${m.img}) center/cover`, flexShrink: 0 }}/>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: 'var(--grey900)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.35 }}>{m.title}</div>
                          <div style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400, marginTop: 2 }}>{SPORTS.find(s => s.id === m.sport)?.label} · {m.venue}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', fontWeight: 400, color: 'var(--grey700)' }}>{m.host}</td>
                    <td className="tab-num" style={{ padding: '14px 16px', color: 'var(--grey700)', fontWeight: 400 }}>{m.date} {m.time}</td>
                    <td className="tab-num" style={{ padding: '14px 16px', fontWeight: 600, textAlign: 'right' }}>{m.cur}/{m.max}</td>
                    <td className="tab-num" style={{ padding: '14px 16px', fontWeight: 700, textAlign: 'right' }}>{m.fee.toLocaleString()}원</td>
                    <td className="tab-num" style={{ padding: '14px 16px', color: 'var(--green500)', fontWeight: 600, textAlign: 'right' }}>{Math.round(m.fee * m.cur * 0.05).toLocaleString()}원</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 600, background: st[2], color: st[1] }}>{st[0]}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ padding: 20, borderTop: '1px solid var(--grey200)', display: 'flex', alignItems: 'center' }}>
            <span className="tab-num" style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400 }}>1–10 / 1,284건</span>
            <div style={{ flex: 1 }}/>
            <div style={{ display: 'flex', gap: 4 }}>
              {['이전', '1', '2', '3', '4', '…', '129', '다음'].map((p, i) => (
                <button key={i} className={`tm-btn tm-btn-sm ${p === '1' ? 'tm-btn-primary' : 'tm-btn-outline'}`} style={{ minWidth: 36, minHeight: 36, padding: '0 10px' }}>{p}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  </AdminShell>
);

/* ─── ADMIN · USER DETAIL ─── */
const AdminUserDetail = () => (
  <AdminShell active="users">
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '24px 32px', background: 'var(--static-white)', borderBottom: '1px solid var(--grey200)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
        <span style={{ color: 'var(--grey600)', fontWeight: 400, cursor: 'pointer' }}>유저 관리</span>
        <Icon name="chevR" size={14} color="var(--grey300)"/>
        <span style={{ fontWeight: 600, color: 'var(--grey900)' }}>강정민</span>
        <span className="tab-num" style={{ fontSize: 12, color: 'var(--grey500)', fontWeight: 400 }}>U-10284</span>
        <div style={{ flex: 1 }}/>
        <SBtn variant="outline" size="sm">경고 발송</SBtn>
        <SBtn variant="danger" size="sm">계정 정지</SBtn>
      </div>

      <div style={{ padding: 32, display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16 }}>
        <div>
          <div style={{ padding: 24, background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', textAlign: 'center', marginBottom: 16 }}>
            <div style={{ width: 80, height: 80, borderRadius: 40, background: `url(${IMG.av1}) center/cover`, margin: '0 auto 16px' }}/>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--grey900)' }}>강정민</div>
            <div style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400, marginTop: 4 }}>jungmin@example.com</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16, flexWrap: 'wrap' }}>
              <span style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--blue50)', color: 'var(--blue500)', fontSize: 12, fontWeight: 600 }}>B급</span>
              <span style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--green50)', color: 'var(--green500)', fontSize: 12, fontWeight: 600 }}>선출 인증</span>
              <span style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--grey100)', color: 'var(--grey700)', fontSize: 12, fontWeight: 600 }}>본인인증</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--grey100)' }}>
              {[['매치', '47'], ['매너', '4.8'], ['신고', '0']].map(([k, v]) => (
                <div key={k}>
                  <div className="tab-num" style={{ fontSize: 20, fontWeight: 700, color: 'var(--grey900)' }}>{v}</div>
                  <div style={{ fontSize: 12, color: 'var(--grey500)', fontWeight: 400, marginTop: 2 }}>{k}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: 20, background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--grey900)' }}>기본 정보</div>
            {[['가입일', '2024.03.12'], ['전화', '010-****-3284'], ['지역', '서울 강남구'], ['종목', '축구, 풋살'], ['구력', '5년'], ['최근 접속', '5분 전'], ['디바이스', 'iPhone 15'], ['결제수단', '카드 등록']].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 13 }}>
                <span style={{ color: 'var(--grey600)', fontWeight: 400 }}>{k}</span>
                <span className="tab-num" style={{ fontWeight: 600, color: 'var(--grey900)' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', gap: 2, background: 'var(--grey100)', borderRadius: 8, padding: 4, marginBottom: 16 }}>
            {['활동 내역', '결제', '리뷰', '신고', '운영 메모'].map((t, i) => (
              <SBtn key={t} variant={i === 0 ? 'outline' : 'ghost'} size="sm" style={{ flex: 1, minHeight: 34 }}>{t}</SBtn>
            ))}
          </div>

          <div style={{ padding: 24, background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>최근 활동</div>
              <div style={{ flex: 1 }}/>
              <SBtn variant="neutral" size="sm">
                전체 <Icon name="chevD" size={12}/>
              </SBtn>
            </div>
            {[
              { t: '매치 참가 완료', s: '주말 축구 한 판 · 상암', d: '오늘 14:32', tone: 'var(--green500)' },
              { t: '결제 15,000원', s: '카드결제', d: '오늘 10:14', tone: 'var(--blue500)' },
              { t: '리뷰 작성 (5점)', s: '박준수 코치 레슨', d: '어제', tone: 'var(--orange500)' },
              { t: '매치 생성', s: '초보환영 풋살 11명 모집', d: '2일 전', tone: 'var(--blue500)' },
              { t: '신고 접수 (본인)', s: '상대방 욕설 · 처리완료', d: '3일 전', tone: 'var(--red500)' },
              { t: '레벨 업그레이드', s: 'C → B급', d: '1주 전', tone: 'var(--green500)' },
            ].map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 16, padding: '14px 0', borderTop: i > 0 ? '1px solid var(--grey100)' : 'none' }}>
                <div style={{ width: 4, height: 'auto', background: e.tone, borderRadius: 2, flexShrink: 0 }}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--grey900)' }}>{e.t}</div>
                  <div style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400, marginTop: 2 }}>{e.s}</div>
                </div>
                <div className="tab-num" style={{ fontSize: 12, color: 'var(--grey500)', fontWeight: 400 }}>{e.d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </AdminShell>
);

/* ─── ADMIN · REPORTS ─── */
const AdminReports = () => (
  <AdminShell active="reports">
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <div style={{ width: 360, borderRight: '1px solid var(--grey200)', background: 'var(--static-white)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 24, borderBottom: '1px solid var(--grey200)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>신고 처리</h1>
            <span className="tab-num" style={{ fontSize: 14, color: 'var(--red500)', fontWeight: 600 }}>7</span>
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 16 }}>
            {[['전체', 7, true], ['긴급', 2], ['검토', 5], ['완료', 0]].map(([t, n, a], i) => (
              <Chip key={i} size="sm" active={a}>
                {t} <span className="tab-num" style={{ marginLeft: 4, opacity: .7 }}>{n}</span>
              </Chip>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {[
            { t: '매너 없는 플레이', c: '지훈***', m: '주말 축구 한 판에서 거친 태클로 부상을 입혔습니다.', urgent: true, sel: true },
            { t: '노쇼 반복 (3회)', c: '현우***', m: '최근 3개월간 예약 후 미참여 기록이 있습니다.' },
            { t: '허위 매물 의심', c: '민정***', m: '중고 축구화 사진이 공식 제품 이미지와 다릅니다.' },
            { t: '불쾌한 메시지', c: '재영***', m: '채팅에서 욕설 및 인신공격이 있었습니다.', urgent: true },
            { t: '사기 의심 거래', c: '하은***', m: '입금 후 연락이 끊긴 판매자입니다.' },
          ].map((r, i) => (
            <div key={i} style={{ padding: '16px 24px', borderBottom: '1px solid var(--grey100)', background: r.sel ? 'var(--grey50)' : 'transparent', boxShadow: r.sel ? 'inset 0 0 0 1px var(--blue100)' : 'none', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ padding: '2px 8px', borderRadius: 4, background: r.urgent ? 'var(--red50)' : 'var(--orange50)', color: r.urgent ? 'var(--red500)' : 'var(--orange500)', fontSize: 11, fontWeight: 600 }}>{r.urgent ? '긴급' : '검토'}</span>
                <span className="tab-num" style={{ fontSize: 11, color: 'var(--grey500)', fontWeight: 400 }}>R-{1024 + i}</span>
                <div style={{ flex: 1 }}/>
                <span className="tab-num" style={{ fontSize: 11, color: 'var(--grey500)', fontWeight: 400 }}>{i * 12 + 3}분 전</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--grey900)', marginBottom: 4 }}>{r.t}</div>
              <div style={{ fontSize: 12, color: 'var(--grey600)', marginBottom: 8, fontWeight: 400 }}>피신고자 {r.c}</div>
              <div style={{ fontSize: 13, color: 'var(--grey700)', lineHeight: 1.5, fontWeight: 400, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{r.m}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', background: 'var(--grey50)' }}>
        <div style={{ padding: 32 }}>
          <div style={{ padding: 32, background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ padding: '3px 10px', borderRadius: 4, background: 'var(--red50)', color: 'var(--red500)', fontSize: 12, fontWeight: 600 }}>긴급</span>
              <span className="tab-num" style={{ fontSize: 13, color: 'var(--grey500)', fontWeight: 400 }}>R-1024</span>
              <div style={{ flex: 1 }}/>
              <span className="tab-num" style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400 }}>신고일 2026.04.24 14:32</span>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 24px', color: 'var(--grey900)' }}>매너 없는 플레이</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div style={{ padding: 16, background: 'var(--grey50)', borderRadius: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--grey500)', marginBottom: 12 }}>신고자</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 20, background: `url(${IMG.av2}) center/cover` }}/>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>이은서 <span className="tab-num" style={{ color: 'var(--grey500)', fontWeight: 400, fontSize: 12 }}>U-10445</span></div>
                    <div style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400 }}>매너 4.9 · 가입 2년</div>
                  </div>
                </div>
              </div>
              <div style={{ padding: 16, background: 'var(--grey50)', borderRadius: 10, border: '1px solid #fccfd3' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--red500)', marginBottom: 12 }}>피신고자</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 20, background: `url(${IMG.av6}) center/cover` }}/>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>박지훈 <span className="tab-num" style={{ color: 'var(--grey500)', fontWeight: 400, fontSize: 12 }}>U-08112</span></div>
                    <div style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400 }}>매너 3.2 · 이전 신고 2회</div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--grey600)', marginBottom: 8 }}>신고 내용</div>
            <div style={{ padding: 16, background: 'var(--grey50)', borderRadius: 10, fontSize: 14, lineHeight: 1.7, color: 'var(--grey900)', marginBottom: 20, fontWeight: 400 }}>
              주말 축구 한 판 매치에 참가했는데, 해당 유저가 경기 중 일부러 거친 태클로 다른 참가자를 다치게 했습니다. 경기 후에도 사과 없이 욕설을 했어요. 주변 증인도 있고, 영상도 있습니다.
            </div>

            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--grey600)', marginBottom: 8 }}>첨부 증거</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ width: 80, height: 80, borderRadius: 8, background: 'var(--grey100)', display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--grey500)', fontWeight: 600 }}>사진 {i}</div>
              ))}
            </div>

            <div style={{ padding: 16, background: 'var(--blue50)', borderRadius: 10, fontSize: 13, color: 'var(--grey900)', lineHeight: 1.6, fontWeight: 400 }}>
              <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--blue500)' }}>분석 요약</div>
              이전 신고 2회, 매너 점수 하위 15%, 증거 3건 수집. 조치 권고: 3일 정지 + 경고.
            </div>
          </div>

          <div style={{ padding: 32, background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)' }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>조치 결정</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
              {[
                { l: '경고', sel: false },
                { l: '3일 정지', sel: true },
                { l: '7일 정지' },
                { l: '영구 정지' },
              ].map(a => (
                <SBtn key={a.l} variant={a.sel ? 'dark' : 'neutral'} size="md">{a.l}</SBtn>
              ))}
            </div>
            <textarea placeholder="조치 사유 및 유저에게 전달할 메시지" style={{ width: '100%', minHeight: 96, padding: 14, borderRadius: 8, border: '1px solid var(--grey200)', fontSize: 14, resize: 'none', fontFamily: 'inherit', fontWeight: 400, color: 'var(--grey900)' }}/>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <SBtn variant="neutral" size="lg" style={{ flex: 1 }}>반려</SBtn>
              <SBtn size="lg" style={{ flex: 2 }}>조치 실행</SBtn>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AdminShell>
);

/* ─── ADMIN · PAYOUTS ─── */
const AdminPayouts = () => (
  <AdminShell active="payouts">
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '24px 32px', background: 'var(--static-white)', borderBottom: '1px solid var(--grey200)' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>정산 관리</h1>
        <div style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400, marginTop: 4 }}>파트너 정산 대기 · 완료 · 보류</div>
      </div>

      <div style={{ padding: 32 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { l: '이번 달 거래액', v: '3,248,500원' },
            { l: '플랫폼 수수료', v: '162,425원', s: '5%' },
            { l: '정산 대기', v: '2,186,100원', s: '87건', tone: 'var(--orange500)' },
            { l: '보류 · 환불', v: '48,000원', s: '3건', tone: 'var(--red500)' },
          ].map(k => (
            <div key={k.l} style={{ padding: 24, background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)' }}>
              <div style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400 }}>{k.l}</div>
              <div className="tab-num" style={{ fontSize: 24, fontWeight: 700, marginTop: 8, color: 'var(--grey900)' }}>{k.v}</div>
              {k.s && <div className="tab-num" style={{ fontSize: 12, color: k.tone || 'var(--grey500)', fontWeight: 600, marginTop: 4 }}>{k.s}</div>}
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)' }}>
          <div style={{ padding: 20, borderBottom: '1px solid var(--grey200)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>정산 대기 목록</div>
            <div style={{ flex: 1 }}/>
            <SBtn variant="neutral" size="sm">CSV 다운로드</SBtn>
            <SBtn size="sm">일괄 정산 (87건)</SBtn>
          </div>

          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--grey50)', color: 'var(--grey500)', fontSize: 12, fontWeight: 600 }}>
                {[['파트너', 'left'], ['유형', 'left'], ['거래일', 'left'], ['건수', 'right'], ['거래액', 'right'], ['수수료', 'right'], ['정산액', 'right'], ['상태', 'left'], ['', 'left']].map(([h, a], i) => (
                  <th key={i} style={{ padding: '14px 16px', textAlign: a, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { n: '상암 월드컵 보조구장', t: '시설', d: 8, v: 1440000 },
                { n: '박준수 코치', t: '레슨', d: 12, v: 720000 },
                { n: '이민정 코치', t: '레슨', d: 8, v: 360000 },
                { n: '풋볼파크 강남', t: '시설', d: 5, v: 450000 },
                { n: '김지훈 코치', t: '레슨', d: 15, v: 525000 },
                { n: '이태원 풋살파크', t: '시설', d: 6, v: 390000 },
                { n: '최현우 코치', t: '레슨', d: 4, v: 220000 },
              ].map((p, i) => {
                const fee = Math.round(p.v * 0.05);
                const net = p.v - fee;
                const statuses = [['대기', 'var(--orange500)', 'var(--orange50)'], ['대기', 'var(--orange500)', 'var(--orange50)'], ['완료', 'var(--green500)', 'var(--green50)'], ['대기', 'var(--orange500)', 'var(--orange50)'], ['보류', 'var(--red500)', 'var(--red50)'], ['대기', 'var(--orange500)', 'var(--orange50)'], ['대기', 'var(--orange500)', 'var(--orange50)']][i];
                return (
                  <tr key={i} style={{ borderTop: '1px solid var(--grey100)' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--grey900)' }}>{p.n}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ padding: '3px 8px', borderRadius: 4, background: p.t === '레슨' ? 'var(--green50)' : 'var(--blue50)', color: p.t === '레슨' ? 'var(--green500)' : 'var(--blue500)', fontSize: 12, fontWeight: 600 }}>{p.t}</span>
                    </td>
                    <td className="tab-num" style={{ padding: '14px 16px', color: 'var(--grey600)', fontWeight: 400 }}>2026.04.21-23</td>
                    <td className="tab-num" style={{ padding: '14px 16px', fontWeight: 400, color: 'var(--grey700)', textAlign: 'right' }}>{p.d}건</td>
                    <td className="tab-num" style={{ padding: '14px 16px', fontWeight: 600, textAlign: 'right' }}>{p.v.toLocaleString()}원</td>
                    <td className="tab-num" style={{ padding: '14px 16px', color: 'var(--red500)', textAlign: 'right', fontWeight: 400 }}>−{fee.toLocaleString()}원</td>
                    <td className="tab-num" style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--green500)', textAlign: 'right' }}>{net.toLocaleString()}원</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 600, background: statuses[2], color: statuses[1] }}>{statuses[0]}</span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <SBtn variant="ghost" size="sm">상세</SBtn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </AdminShell>
);

Object.assign(window, { DesktopHome, DesktopMatches, AdminDashboard, AdminMatches, AdminUserDetail, AdminReports, AdminPayouts });
