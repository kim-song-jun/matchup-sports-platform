/* Desktop expansions — Landing, Lessons, Venues, Marketplace, Detail views
   Toss-compliant: white surfaces, blue only for interaction, no emoji, no gradient,
   400/600/700 weights, 8/12/16px radius, breathing room on numerals */

const DesktopShell = ({ active, children, footer = true }) => (
  <div style={{ width: 1280, height: 800, background: 'var(--static-white)', display: 'flex', flexDirection: 'column', fontFamily: "'Pretendard', -apple-system, sans-serif", overflow: 'hidden', color: 'var(--grey900)' }}>
    <div style={{ height: 64, borderBottom: '1px solid var(--grey200)', display: 'flex', alignItems: 'center', padding: '0 32px', gap: 40, flexShrink: 0 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--grey900)', letterSpacing: 0 }}>Teameet</div>
      <div style={{ display: 'flex', gap: 28 }}>
        {[['매치', 'match'], ['팀', 'team'], ['레슨', 'lesson'], ['장터', 'market'], ['시설', 'venue']].map(([t, k]) => (
          <div key={k} style={{ fontSize: 14, fontWeight: active === k ? 600 : 400, color: active === k ? 'var(--grey900)' : 'var(--grey600)', cursor: 'pointer' }}>{t}</div>
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
      {children}
      {footer && (
        <div style={{ borderTop: '1px solid var(--grey200)', padding: '32px', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--grey900)' }}>Teameet</div>
          <div style={{ fontSize: 12, color: 'var(--grey500)', marginTop: 8 }}>© 2026 Teameet, Inc. · 사업자등록번호 123-45-67890</div>
        </div>
      )}
    </div>
  </div>
);

/* ─── DESKTOP · LANDING (public, marketing-lite) ─── */
const DesktopLanding = () => (
  <DesktopShell>
    {/* Hero — restrained, copy-led */}
    <div style={{ padding: '80px 32px 72px', borderBottom: '1px solid var(--grey200)' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue500)', marginBottom: 16, letterSpacing: .2 }}>Since 2024</div>
          <h1 style={{ fontSize: 44, fontWeight: 700, lineHeight: 1.25, color: 'var(--grey900)', margin: 0, letterSpacing: 0 }}>
            같이 뛸 사람을<br/>3분 안에 찾아요
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: 'var(--grey700)', marginTop: 20, fontWeight: 400, maxWidth: 440 }}>
            축구, 풋살, 농구, 테니스, 배드민턴까지. 종목과 레벨, 지역만 고르면 지금 열린 매치가 바로 보여요.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 32 }}>
            <SBtn size="lg">매치 찾기</SBtn>
            <SBtn variant="neutral" size="lg">앱 다운로드</SBtn>
          </div>
          <div style={{ display: 'flex', gap: 32, marginTop: 40 }}>
            {[['매일 열리는 매치', '124'], ['누적 사용자', '8.2만'], ['평균 매너 점수', '4.7']].map(([l, v]) => (
              <div key={l}>
                <div className="tab-num" style={{ fontSize: 22, fontWeight: 700, color: 'var(--grey900)' }}>{v}</div>
                <div style={{ fontSize: 12, color: 'var(--grey500)', fontWeight: 400, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Phone mock placeholder — tinted card with simulated UI, no gradient */}
        <div style={{ position: 'relative', height: 440, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ width: 280, height: 560, background: 'var(--grey900)', borderRadius: 36, padding: 8, position: 'relative', transform: 'rotate(-4deg)' }}>
            <div style={{ width: '100%', height: '100%', background: 'var(--static-white)', borderRadius: 28, overflow: 'hidden', position: 'relative' }}>
              <div style={{ padding: '20px 18px' }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--blue500)', marginBottom: 16 }}/>
                <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3 }}>오늘, 강남에서<br/>뛸 사람?</div>
                <div style={{ marginTop: 20, padding: 16, border: '1px solid var(--grey200)', borderRadius: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--blue500)' }}>축구 · B급</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>주말 축구 한 판</div>
                  <div className="tab-num" style={{ fontSize: 11, color: 'var(--grey600)', marginTop: 6 }}>14:00 · 상암 보조구장</div>
                  <div style={{ display: 'flex', alignItems: 'center', marginTop: 10 }}>
                    <div className="tab-num" style={{ fontSize: 11, color: 'var(--grey600)' }}>18/22명</div>
                    <div style={{ flex: 1 }}/>
                    <div className="tab-num" style={{ fontSize: 13, fontWeight: 700 }}>12,000원</div>
                  </div>
                </div>
                <div style={{ marginTop: 10, padding: 16, border: '1px solid var(--grey200)', borderRadius: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--green500)' }}>풋살 · C급</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>수요일 저녁 풋살</div>
                  <div className="tab-num" style={{ fontSize: 11, color: 'var(--grey600)', marginTop: 6 }}>20:30 · 이태원 풋살파크</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Feature row — text-led cards */}
    <div style={{ padding: '72px 32px', borderBottom: '1px solid var(--grey200)' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--grey600)', marginBottom: 10 }}>Teameet이 다른 이유</div>
        <h2 style={{ fontSize: 32, fontWeight: 700, color: 'var(--grey900)', margin: 0, letterSpacing: 0, maxWidth: 620, lineHeight: 1.3 }}>
          단순히 사람만 모이는 게 아니에요.
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginTop: 48 }}>
          {[
            { t: '레벨이 맞는 사람만', s: 'A~D급 매너 점수와 실력을 함께 봐요. 혼자만 헤매거나, 너무 쉬운 경기에 지치지 않게.' },
            { t: '지금 열린 매치부터', s: '3분이면 충분해요. 오늘 저녁 · 이번 주말 · 지역 · 종목 필터로 바로 찾아요.' },
            { t: '결제부터 정산까지', s: '참가비 분할, 노쇼 보증금, 시설 예약까지 한 번에. 돈 얘기로 감정 상할 일 없어요.' },
          ].map(f => (
            <div key={f.t} style={{ padding: 28, border: '1px solid var(--grey200)', borderRadius: 16 }}>
              <div style={{ width: 32, height: 32, background: 'var(--blue50)', borderRadius: 8, marginBottom: 20 }}/>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--grey900)', marginBottom: 10 }}>{f.t}</div>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--grey700)', fontWeight: 400 }}>{f.s}</div>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* Sports grid */}
    <div style={{ padding: '72px 32px', borderBottom: '1px solid var(--grey200)' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 24 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--grey900)', margin: 0 }}>종목별 이번 주 매치</h2>
          <div style={{ flex: 1 }}/>
          <SBtn variant="ghost" size="sm">전체 보기</SBtn>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
          {[
            ['축구', 42, IMG.soccer],
            ['풋살', 38, IMG.futsal],
            ['농구', 18, IMG.basket],
            ['테니스', 14, IMG.tennis],
            ['배드민턴', 8, IMG.badmin],
            ['아이스하키', 4, IMG.hockey],
          ].map(([n, c, img]) => (
            <div key={n} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--grey200)', cursor: 'pointer' }}>
              <div style={{ height: 120, background: `url(${img}) center/cover` }}/>
              <div style={{ padding: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--grey900)' }}>{n}</div>
                <div className="tab-num" style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400, marginTop: 4 }}>{c}건</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* Stats strip — typographic, no icons */}
    <div style={{ padding: '72px 32px', background: 'var(--grey50)', borderBottom: '1px solid var(--grey200)' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
        {[
          ['누적 매치', '48,320+'],
          ['활성 시설', '312곳'],
          ['인증 코치', '86명'],
          ['지난달 거래액', '3,248만원'],
        ].map(([l, v], i) => (
          <div key={l} style={{ padding: '0 24px', borderRight: i < 3 ? '1px solid var(--grey200)' : 'none' }}>
            <div className="tab-num" style={{ fontSize: 36, fontWeight: 700, color: 'var(--grey900)', letterSpacing: 0 }}>{v}</div>
            <div style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400, marginTop: 6 }}>{l}</div>
          </div>
        ))}
      </div>
    </div>

    {/* CTA footer */}
    <div style={{ padding: '72px 32px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontSize: 32, fontWeight: 700, margin: 0, color: 'var(--grey900)', letterSpacing: 0, lineHeight: 1.3 }}>
          3분 안에 오늘의 매치를 찾아보세요
        </h2>
        <p style={{ fontSize: 15, color: 'var(--grey600)', marginTop: 14, lineHeight: 1.6, fontWeight: 400 }}>
          무료로 시작할 수 있어요.
        </p>
        <SBtn size="lg" style={{ marginTop: 24, minWidth: 200 }}>시작하기</SBtn>
      </div>
    </div>
  </DesktopShell>
);

/* ─── DESKTOP · LESSONS ─── */
const DesktopLessons = () => {
  const cats = ['전체', '축구', '풋살', '농구', '테니스', '배드민턴', '1:1', '그룹'];
  const lessonList = [...LESSONS, ...LESSONS, ...LESSONS].slice(0, 9).map((l, i) => ({ ...l, id: i }));
  return (
    <DesktopShell active="lesson">
      <div style={{ padding: '32px 32px 0' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <div style={{ fontSize: 13, fontWeight: 400, color: 'var(--grey500)', marginBottom: 6 }}>
            홈 <span style={{ margin: '0 6px', color: 'var(--grey300)' }}>/</span> 레슨
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: 'var(--grey900)', letterSpacing: 0 }}>검증된 코치, 지금 가까운 곳에서</h1>
          <div className="tab-num" style={{ fontSize: 14, color: 'var(--grey600)', marginTop: 8, fontWeight: 400 }}>총 86명의 코치 · 320개 레슨</div>

          <div style={{ display: 'flex', gap: 8, marginTop: 28, flexWrap: 'wrap' }}>
            {cats.map((c, i) => (
              <Chip key={c} size="sm" active={i === 0}>{c}</Chip>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: '32px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
            <div className="tab-num" style={{ fontSize: 14, color: 'var(--grey600)', fontWeight: 400 }}>총 <b style={{ color: 'var(--grey900)', fontWeight: 700 }}>320</b>개 레슨</div>
            <div style={{ flex: 1 }}/>
            {[['지역', '강남구'], ['가격대', '5만원 이하'], ['시간대', '평일 저녁'], ['정렬', '평점 높은순']].map(([l, v]) => (
              <SBtn key={l} variant="outline" size="sm" style={{ marginLeft: 8 }}>
                <span style={{ color: 'var(--grey500)' }}>{l}</span>
                <span style={{ fontWeight: 600, color: 'var(--grey900)' }}>{v}</span>
                <Icon name="chevD" size={14} color="var(--grey500)"/>
              </SBtn>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {lessonList.map(l => (
              <div key={l.id} style={{ border: '1px solid var(--grey200)', borderRadius: 12, overflow: 'hidden', cursor: 'pointer' }}>
                <div style={{ height: 180, background: `url(${l.img}) center/cover`, position: 'relative' }}>
                  {l.id % 3 === 0 && <div style={{ position: 'absolute', top: 12, left: 12, padding: '4px 10px', background: 'var(--grey900)', color: 'var(--static-white)', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>신규</div>}
                </div>
                <div style={{ padding: 20 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    {l.tags.map(t => <span key={t} style={{ fontSize: 11, padding: '2px 8px', background: 'var(--grey100)', color: 'var(--grey700)', borderRadius: 4, fontWeight: 600 }}>{t}</span>)}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--grey900)', marginBottom: 8, lineHeight: 1.4 }}>{l.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 12, background: `url(${l.avatar}) center/cover` }}/>
                    <span style={{ fontSize: 13, color: 'var(--grey700)', fontWeight: 400 }}>{l.coach}</span>
                    <div style={{ flex: 1 }}/>
                    <Icon name="star" size={12} color="var(--orange500)"/>
                    <span className="tab-num" style={{ fontSize: 13, fontWeight: 600, color: 'var(--grey900)' }}>{l.rating}</span>
                    <span className="tab-num" style={{ fontSize: 12, color: 'var(--grey500)', fontWeight: 400 }}>({l.reviews})</span>
                  </div>
                  <div style={{ paddingTop: 12, borderTop: '1px solid var(--grey100)', display: 'flex', alignItems: 'baseline' }}>
                    <div className="tab-num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--grey900)' }}>{l.price.toLocaleString()}원</div>
                    <span style={{ fontSize: 12, color: 'var(--grey500)', marginLeft: 4, fontWeight: 400 }}>/{l.unit}</span>
                    <div style={{ flex: 1 }}/>
                    <span className="tab-num" style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400 }}>{l.venue}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 40 }}>
            <SBtn variant="outline" size="md">더 보기</SBtn>
          </div>
        </div>
      </div>
    </DesktopShell>
  );
};

/* ─── DESKTOP · VENUES (map + list) ─── */
const DesktopVenues = () => (
  <DesktopShell active="venue" footer={false}>
    <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--grey200)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--grey900)' }}>시설 예약</h1>
        <div className="tab-num" style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400 }}>총 312곳 · 오늘 예약 가능 48곳</div>
        <div style={{ flex: 1 }}/>
        <div style={{ display: 'flex', gap: 0, padding: 4, background: 'var(--grey100)', borderRadius: 8 }}>
          {['리스트', '지도', '캘린더'].map((t, i) => (
            <SBtn key={t} variant={i === 1 ? 'outline' : 'ghost'} size="sm" style={{ minHeight: 32 }}>{t}</SBtn>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        {['종목 · 축구', '지역 · 강남', '오늘 18:00', '실내', '주차'].map((t, i) => (
          <Chip key={t} size="sm" active={i === 0}>
            {t} {i > 0 && <Icon name="close" size={12}/>}
          </Chip>
        ))}
        <SBtn variant="outline" size="sm">
          <Icon name="plus" size={14}/> 필터 추가
        </SBtn>
      </div>
    </div>

    <div style={{ display: 'flex', overflow: 'hidden', height: 'calc(100% - 170px)' }}>
      {/* List — left */}
      <div style={{ width: 440, borderRight: '1px solid var(--grey200)', overflow: 'auto' }}>
        {VENUES.concat(VENUES).slice(0, 8).map((v, i) => (
          <div key={i} style={{ padding: 20, borderBottom: '1px solid var(--grey100)', display: 'flex', gap: 16, cursor: 'pointer', background: i === 0 ? 'var(--grey50)' : 'transparent', boxShadow: i === 0 ? 'inset 0 0 0 1px var(--blue100)' : 'none' }}>
            <div style={{ width: 96, height: 96, borderRadius: 10, background: `url(${v.img}) center/cover`, flexShrink: 0 }}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--grey100)', color: 'var(--grey700)', fontWeight: 600, borderRadius: 4 }}>{v.type}</span>
                {v.openNow && <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--green50)', color: 'var(--green500)', fontWeight: 600, borderRadius: 4 }}>지금 가능</span>}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--grey900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>{v.name}</div>
              <div className="tab-num" style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400, marginBottom: 8 }}>{v.region}구 · {v.dist}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="star" size={12} color="var(--orange500)"/>
                <span className="tab-num" style={{ fontSize: 12, fontWeight: 600, color: 'var(--grey900)' }}>{v.rating}</span>
                <span className="tab-num" style={{ fontSize: 12, color: 'var(--grey500)', fontWeight: 400 }}>({v.reviews})</span>
                <div style={{ flex: 1 }}/>
                <div className="tab-num" style={{ fontSize: 15, fontWeight: 700, color: 'var(--grey900)' }}>{v.price.toLocaleString()}원</div>
                <span style={{ fontSize: 11, color: 'var(--grey500)', fontWeight: 400 }}>/{v.unit}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Map canvas — stylized, no emoji */}
      <div style={{ flex: 1, background: 'var(--grey100)', position: 'relative', overflow: 'hidden' }}>
        {/* grid lines */}
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: .3 }}>
          {Array.from({ length: 20 }).map((_, i) => (
            <line key={'h' + i} x1="0" y1={i * 50} x2="100%" y2={i * 50} stroke="var(--grey300)" strokeWidth=".5"/>
          ))}
          {Array.from({ length: 20 }).map((_, i) => (
            <line key={'v' + i} y1="0" x1={i * 50} y2="100%" x2={i * 50} stroke="var(--grey300)" strokeWidth=".5"/>
          ))}
        </svg>
        {/* "roads" */}
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
          <path d="M 0 300 Q 200 290 400 320 T 800 300" stroke="var(--static-white)" strokeWidth="12" fill="none"/>
          <path d="M 100 0 Q 120 200 200 400 T 300 800" stroke="var(--static-white)" strokeWidth="10" fill="none"/>
          <path d="M 0 500 L 800 450" stroke="var(--static-white)" strokeWidth="8" fill="none"/>
          <path d="M 500 0 L 520 800" stroke="var(--static-white)" strokeWidth="6" fill="none"/>
        </svg>
        {/* park shape */}
        <div style={{ position: 'absolute', left: 320, top: 200, width: 180, height: 140, background: '#dbe9d4', borderRadius: 40 }}/>
        {/* pins */}
        {[
          { x: 180, y: 280, p: 180, sel: true, name: '상암 월드컵' },
          { x: 380, y: 180, p: 60,  name: '이태원' },
          { x: 520, y: 340, p: 25,  name: '강남 농구' },
          { x: 620, y: 200, p: 45,  name: '잠실' },
          { x: 280, y: 480, p: 120, name: '목동' },
          { x: 450, y: 520, p: 18,  name: '서초' },
        ].map((m, i) => (
          <div key={i} style={{ position: 'absolute', left: m.x, top: m.y, transform: 'translate(-50%, -100%)', zIndex: m.sel ? 10 : 1 }}>
            <div style={{ padding: '6px 12px', background: m.sel ? 'var(--grey900)' : 'var(--static-white)', color: m.sel ? 'var(--static-white)' : 'var(--grey900)', borderRadius: 999, fontSize: 12, fontWeight: 700, boxShadow: '0 2px 8px rgba(0,0,0,.15)', border: m.sel ? 'none' : '1px solid var(--grey200)', whiteSpace: 'nowrap' }} className="tab-num">
              {m.p}k
            </div>
            <div style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `8px solid ${m.sel ? 'var(--grey900)' : 'var(--static-white)'}`, margin: '-1px auto 0' }}/>
          </div>
        ))}
        {/* controls */}
        <div style={{ position: 'absolute', top: 16, right: 16, background: 'var(--static-white)', borderRadius: 8, border: '1px solid var(--grey200)', overflow: 'hidden' }}>
          <button className="tm-pressable tm-break-keep" style={{ width: 36, height: 36, borderBottom: '1px solid var(--grey200)', display: 'grid', placeItems: 'center' }}><Icon name="plus" size={16}/></button>
          <button className="tm-pressable tm-break-keep" style={{ width: 36, height: 36, display: 'grid', placeItems: 'center' }}><span style={{ fontSize: 20, color: 'var(--grey700)', fontWeight: 400 }}>—</span></button>
        </div>
      </div>
    </div>
  </DesktopShell>
);

/* ─── DESKTOP · MARKETPLACE ─── */
const DesktopMarket = () => {
  const listings = [...LISTINGS, ...LISTINGS, ...LISTINGS].slice(0, 12).map((l, i) => ({ ...l, id: i }));
  return (
    <DesktopShell active="market">
      <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--grey200)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--grey900)' }}>장터</h1>
            <div className="tab-num" style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400, marginLeft: 12 }}>12,840개 매물 · 오늘 등록 84</div>
            <div style={{ flex: 1 }}/>
            <SBtn size="sm">팔기</SBtn>
          </div>
          <div style={{ display: 'flex', gap: 0, marginTop: 20, borderBottom: '1px solid var(--grey200)', marginBottom: -25 }}>
            {['전체', '중고 거래', '장비 대여', '용병', '티켓', '기타'].map((t, i) => (
              <button className="tm-pressable tm-break-keep" key={t} style={{ padding: '10px 18px 18px', borderBottom: i === 0 ? '2px solid var(--grey900)' : '2px solid transparent', fontSize: 14, fontWeight: i === 0 ? 700 : 500, color: i === 0 ? 'var(--grey900)' : 'var(--grey600)' }}>{t}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: '32px', display: 'flex', gap: 32 }}>
        {/* left filter */}
        <div style={{ width: 220, flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--grey900)', marginBottom: 12 }}>카테고리</div>
          {[['축구화', 284, true], ['풋살화', 156], ['유니폼', 423], ['라켓', 89], ['농구공', 62], ['축구공', 41], ['보호장비', 78], ['가방', 124]].map(([t, n, a], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 13, fontWeight: a ? 600 : 400, color: a ? 'var(--blue500)' : 'var(--grey700)', cursor: 'pointer' }}>
              <span>{t}</span>
              <span className="tab-num" style={{ color: 'var(--grey500)', fontWeight: 400 }}>{n}</span>
            </div>
          ))}

          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--grey900)', marginBottom: 12, marginTop: 28 }}>가격대</div>
          <div className="tab-num" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--grey600)', fontWeight: 400, marginBottom: 10 }}>
            <span>0원</span><span>500,000원</span>
          </div>
          <div style={{ height: 4, background: 'var(--grey200)', borderRadius: 2, position: 'relative' }}>
            <div style={{ position: 'absolute', left: '15%', right: '55%', height: '100%', background: 'var(--blue500)', borderRadius: 2 }}/>
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--grey900)', marginBottom: 12, marginTop: 28 }}>상태</div>
          {['새상품', '거의 새것', '상태 최상', '사용감 있음'].map(t => {
            const on = t === '거의 새것' || t === '상태 최상';
            return (
              <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 14, color: 'var(--grey700)', fontWeight: 400, cursor: 'pointer' }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, background: on ? 'var(--blue500)' : 'var(--static-white)', border: '1.5px solid ' + (on ? 'var(--blue500)' : 'var(--grey300)'), display: 'grid', placeItems: 'center' }}>
                  {on && <Icon name="check" size={12} color="var(--static-white)" stroke={2.5}/>}
                </div>
                {t}
              </label>
            );
          })}

          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--grey900)', marginBottom: 12, marginTop: 28 }}>거래 지역</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['강남', '서초', '송파', '마포', '용산', '영등포'].map(r => (
              <Chip key={r} size="sm" active={r === '강남'}>{r}</Chip>
            ))}
          </div>
        </div>

        {/* grid */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
            <div className="tab-num" style={{ fontSize: 14, color: 'var(--grey600)', fontWeight: 400 }}>총 <b style={{ color: 'var(--grey900)', fontWeight: 700 }}>12,840</b>개</div>
            <div style={{ flex: 1 }}/>
            {['안전거래만', '직거래 가능'].map(t => (
              <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 16, fontSize: 13, color: 'var(--grey700)', cursor: 'pointer', fontWeight: 400 }}>
                <div style={{ width: 16, height: 16, borderRadius: 3, border: '1.5px solid var(--grey300)' }}/> {t}
              </label>
            ))}
            <SBtn variant="outline" size="sm">
              최신순 <Icon name="chevD" size={14}/>
            </SBtn>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {listings.map(l => (
              <div key={l.id} style={{ borderRadius: 12, border: '1px solid var(--grey200)', overflow: 'hidden', cursor: 'pointer', background: 'var(--static-white)' }}>
                <div style={{ aspectRatio: '1', background: `url(${l.img}) center/cover`, position: 'relative' }}>
                  {l.id === 0 && <div style={{ position: 'absolute', top: 10, left: 10, padding: '3px 8px', background: 'var(--grey900)', color: 'var(--static-white)', fontSize: 11, fontWeight: 700, borderRadius: 4 }}>안전거래</div>}
                  <button className="tm-pressable tm-break-keep" style={{ position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: 16, background: 'rgba(255,255,255,.9)', display: 'grid', placeItems: 'center' }}>
                    <Icon name="heart" size={16} color="var(--grey700)"/>
                  </button>
                </div>
                <div style={{ padding: 14 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--grey100)', color: 'var(--grey700)', borderRadius: 3, fontWeight: 600 }}>{l.category}</span>
                    <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--orange50)', color: 'var(--orange500)', borderRadius: 3, fontWeight: 600 }}>{l.cond}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--grey900)', lineHeight: 1.4, marginBottom: 8, fontWeight: 400, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{l.title}</div>
                  <div className="tab-num" style={{ fontSize: 16, fontWeight: 700, color: 'var(--grey900)' }}>{l.price.toLocaleString()}원</div>
                  <div className="tab-num" style={{ fontSize: 11, color: 'var(--grey500)', fontWeight: 400, marginTop: 4 }}>{l.venue} · {l.id + 3}시간 전</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DesktopShell>
  );
};

/* ─── DESKTOP · LESSON DETAIL ─── */
const DesktopLessonDetail = () => {
  const l = LESSONS[0];
  return (
    <DesktopShell active="lesson" footer={false}>
      <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--grey200)' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', fontSize: 13, color: 'var(--grey500)', fontWeight: 400 }}>
          레슨 <span style={{ margin: '0 6px', color: 'var(--grey300)' }}>/</span>
          축구 <span style={{ margin: '0 6px', color: 'var(--grey300)' }}>/</span>
          <span style={{ color: 'var(--grey700)' }}>1:1 맞춤 축구 개인레슨</span>
        </div>
      </div>

      <div style={{ padding: 32 }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 360px', gap: 40 }}>
          <div>
            {/* gallery */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 8, height: 420, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ gridRow: '1 / 3', background: `url(${l.img}) center/cover` }}/>
              <div style={{ background: `url(${IMG.soccer}) center/cover` }}/>
              <div style={{ background: `url(${IMG.futsal}) center/cover` }}/>
              <div style={{ background: `url(${IMG.venue1}) center/cover` }}/>
              <div style={{ background: `url(${IMG.coach2}) center/cover`, position: 'relative' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', color: 'var(--static-white)', fontSize: 14, fontWeight: 600 }}>+6</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 24, flexWrap: 'wrap' }}>
              {l.tags.map(t => <span key={t} style={{ fontSize: 12, padding: '4px 10px', background: 'var(--grey100)', color: 'var(--grey700)', borderRadius: 6, fontWeight: 600 }}>{t}</span>)}
              <span style={{ fontSize: 12, padding: '4px 10px', background: 'var(--green50)', color: 'var(--green500)', borderRadius: 6, fontWeight: 600 }}>인증 코치</span>
            </div>

            <h1 style={{ fontSize: 28, fontWeight: 700, margin: '20px 0 10px', color: 'var(--grey900)', lineHeight: 1.3, letterSpacing: 0 }}>{l.title}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icon name="star" size={14} color="var(--orange500)"/>
                <span className="tab-num" style={{ fontSize: 15, fontWeight: 700, color: 'var(--grey900)' }}>{l.rating}</span>
                <span className="tab-num" style={{ fontSize: 13, color: 'var(--grey500)', fontWeight: 400 }}>({l.reviews}개 리뷰)</span>
              </div>
              <div className="tab-num" style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400 }}>수강 누적 420명</div>
            </div>

            {/* tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--grey200)', marginBottom: 24 }}>
              {['상세 소개', '커리큘럼', '리뷰 128', '환불 정책'].map((t, i) => (
                <button className="tm-pressable tm-break-keep" key={t} style={{ padding: '14px 20px', borderBottom: i === 0 ? '2px solid var(--grey900)' : '2px solid transparent', fontSize: 14, fontWeight: i === 0 ? 700 : 500, color: i === 0 ? 'var(--grey900)' : 'var(--grey600)' }}>{t}</button>
              ))}
            </div>

            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14, color: 'var(--grey900)' }}>이런 분께 추천해요</div>
            <ul style={{ fontSize: 15, color: 'var(--grey700)', lineHeight: 1.75, paddingLeft: 20, margin: '0 0 32px', fontWeight: 400 }}>
              <li>축구를 처음 시작하는 성인 분</li>
              <li>동호회 매치에서 자신감 있게 뛰고 싶은 분</li>
              <li>기본기부터 체계적으로 배우고 싶은 분</li>
            </ul>

            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14, color: 'var(--grey900)' }}>코치 소개</div>
            <div style={{ padding: 24, background: 'var(--grey50)', borderRadius: 12 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: 28, background: `url(${l.avatar}) center/cover` }}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{l.coach}</div>
                  <div style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400, marginTop: 4 }}>U리그 출신 · 지도자 2급 · 경력 12년</div>
                </div>
                <button className="tm-pressable tm-break-keep" style={{ height: 40, padding: '0 16px', borderRadius: 8, background: 'var(--static-white)', border: '1px solid var(--grey300)', color: 'var(--grey900)', fontSize: 13, fontWeight: 600 }}>코치 프로필</button>
              </div>
              <p style={{ fontSize: 14, color: 'var(--grey700)', lineHeight: 1.7, marginTop: 16, marginBottom: 0, fontWeight: 400 }}>
                10년 이상의 지도 경험을 바탕으로 성인 초심자 맞춤형 커리큘럼을 구성합니다. 체력과 상관없이 한 달 안에 동호회에서 뛸 수 있을 만큼 성장하실 수 있어요.
              </p>
            </div>

            <div style={{ fontSize: 17, fontWeight: 700, marginTop: 40, marginBottom: 14, color: 'var(--grey900)' }}>장소</div>
            <div style={{ padding: 20, background: 'var(--grey50)', borderRadius: 12, display: 'flex', gap: 16 }}>
              <div style={{ width: 120, height: 96, borderRadius: 8, background: `url(${IMG.venue1}) center/cover` }}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{l.venue}</div>
                <div style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400, marginTop: 4 }}>서울 마포구 상암동 1-1</div>
                <div style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400, marginTop: 2 }}>지하철 월드컵경기장역 도보 8분</div>
              </div>
            </div>
          </div>

          {/* sticky booking */}
          <div>
            <div style={{ position: 'sticky', top: 24, padding: 28, border: '1px solid var(--grey200)', borderRadius: 16 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 20 }}>
                <div className="tab-num" style={{ fontSize: 26, fontWeight: 700, color: 'var(--grey900)' }}>{l.price.toLocaleString()}원</div>
                <span style={{ fontSize: 13, color: 'var(--grey500)', marginLeft: 4, fontWeight: 400 }}>/{l.unit}</span>
              </div>

              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--grey600)', marginBottom: 10 }}>수강권</div>
              {[
                { n: '1회 체험', p: 60000 },
                { n: '4회 패키지', p: 220000, save: '7% 할인' },
                { n: '8회 패키지', p: 400000, save: '17% 할인', sel: true },
              ].map(pk => (
                <button className="tm-pressable tm-break-keep" key={pk.n} style={{ width: '100%', padding: 16, marginBottom: 8, borderRadius: 12, border: pk.sel ? '2px solid var(--blue500)' : '1px solid var(--grey200)', background: pk.sel ? 'var(--blue50)' : 'var(--static-white)', display: 'flex', alignItems: 'center', textAlign: 'left', cursor: 'pointer' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--grey900)' }}>{pk.n}</div>
                    {pk.save && <div style={{ fontSize: 11, color: 'var(--red500)', fontWeight: 600, marginTop: 2 }}>{pk.save}</div>}
                  </div>
                  <div style={{ flex: 1 }}/>
                  <div className="tab-num" style={{ fontSize: 15, fontWeight: 700 }}>{pk.p.toLocaleString()}원</div>
                </button>
              ))}

              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--grey600)', marginTop: 20, marginBottom: 10 }}>수강일</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {['월', '화', '수', '목', '금', '토', '일'].map(d => <div key={d} style={{ textAlign: 'center', fontSize: 11, color: 'var(--grey500)', fontWeight: 400, marginBottom: 4 }}>{d}</div>)}
                {Array.from({ length: 21 }).map((_, i) => {
                  const d = i + 24;
                  const sel = i === 10;
                  const dis = i < 2 || i === 7;
                  return (
                    <button key={i} disabled={dis} style={{ aspectRatio: '1', borderRadius: 6, background: sel ? 'var(--grey900)' : (dis ? 'transparent' : 'var(--grey50)'), color: sel ? 'var(--static-white)' : (dis ? 'var(--grey300)' : 'var(--grey900)'), fontSize: 13, fontWeight: sel ? 700 : 400 }} className="tab-num">{d > 30 ? d - 30 : d}</button>
                  );
                })}
              </div>

              <button className="tm-pressable tm-break-keep" style={{ width: '100%', height: 52, borderRadius: 12, background: 'var(--blue500)', color: 'var(--static-white)', fontSize: 15, fontWeight: 600, marginTop: 20 }}>예약하기</button>
              <button className="tm-pressable tm-break-keep" style={{ width: '100%', height: 48, borderRadius: 12, background: 'var(--grey100)', color: 'var(--grey700)', fontSize: 14, fontWeight: 600, marginTop: 8 }}>문의하기</button>

              <div style={{ padding: 14, background: 'var(--grey50)', borderRadius: 10, marginTop: 20 }}>
                <div style={{ fontSize: 12, color: 'var(--grey700)', lineHeight: 1.6, fontWeight: 400 }}>
                  <b style={{ color: 'var(--grey900)', fontWeight: 700 }}>안전 결제</b> · 수강 전 전액 환불 가능
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DesktopShell>
  );
};

/* ─── DESKTOP · VENUE DETAIL ─── */
const DesktopVenueDetail = () => {
  const v = VENUES[0];
  const hours = ['06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22'];
  return (
    <DesktopShell active="venue" footer={false}>
      <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--grey200)' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', fontSize: 13, color: 'var(--grey500)', fontWeight: 400 }}>
          시설 <span style={{ margin: '0 6px', color: 'var(--grey300)' }}>/</span>
          축구장 <span style={{ margin: '0 6px', color: 'var(--grey300)' }}>/</span>
          <span style={{ color: 'var(--grey700)' }}>{v.name}</span>
        </div>
      </div>
      <div style={{ padding: 32 }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 8, height: 440, borderRadius: 12, overflow: 'hidden', marginBottom: 32 }}>
            <div style={{ gridRow: '1 / 3', background: `url(${v.img}) center/cover` }}/>
            <div style={{ background: `url(${IMG.venue2}) center/cover` }}/>
            <div style={{ background: `url(${IMG.venue3}) center/cover` }}/>
            <div style={{ background: `url(${IMG.soccer}) center/cover` }}/>
            <div style={{ background: `url(${IMG.futsal}) center/cover`, position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', color: 'var(--static-white)', fontSize: 14, fontWeight: 600 }}>+12</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 40 }}>
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 12, padding: '4px 10px', background: 'var(--grey100)', color: 'var(--grey700)', borderRadius: 6, fontWeight: 600 }}>{v.type}</span>
                {v.openNow && <span style={{ fontSize: 12, padding: '4px 10px', background: 'var(--green50)', color: 'var(--green500)', borderRadius: 6, fontWeight: 600 }}>지금 예약 가능</span>}
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: 0 }}>{v.name}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="star" size={14} color="var(--orange500)"/>
                  <span className="tab-num" style={{ fontSize: 14, fontWeight: 700 }}>{v.rating}</span>
                  <span className="tab-num" style={{ fontSize: 13, color: 'var(--grey500)', fontWeight: 400 }}>({v.reviews})</span>
                </div>
                <div className="tab-num" style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400 }}>{v.address}</div>
              </div>

              <div style={{ marginTop: 32, paddingTop: 32, borderTop: '1px solid var(--grey200)' }}>
                <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>편의시설</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  {[...v.facilities, '라운지', '자판기', '화장실', '와이파이'].map(f => (
                    <div key={f} style={{ padding: 14, background: 'var(--grey50)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Icon name="check" size={14} color="var(--green500)" stroke={2.5}/>
                      <span style={{ fontSize: 13, color: 'var(--grey900)', fontWeight: 500 }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 32, paddingTop: 32, borderTop: '1px solid var(--grey200)' }}>
                <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>이용 규칙</div>
                <ul style={{ fontSize: 14, color: 'var(--grey700)', lineHeight: 1.8, paddingLeft: 20, margin: 0, fontWeight: 400 }}>
                  <li>대관 30분 전부터 입장 가능합니다.</li>
                  <li>축구화(FG/AG)만 착용 가능합니다. 스터드는 입장 불가.</li>
                  <li>음주 후 입장은 제한됩니다.</li>
                  <li>취소는 이용일 24시간 전까지 전액 환불됩니다.</li>
                </ul>
              </div>

              <div style={{ marginTop: 32, paddingTop: 32, borderTop: '1px solid var(--grey200)' }}>
                <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>위치</div>
                <div style={{ height: 240, background: 'var(--grey100)', borderRadius: 12, position: 'relative', overflow: 'hidden' }}>
                  <svg width="100%" height="100%" style={{ opacity: .5 }}>
                    <path d="M 0 120 Q 200 110 400 130 T 800 120" stroke="var(--static-white)" strokeWidth="10" fill="none"/>
                    <path d="M 200 0 L 220 240" stroke="var(--static-white)" strokeWidth="8" fill="none"/>
                    <path d="M 500 0 L 510 240" stroke="var(--static-white)" strokeWidth="6" fill="none"/>
                  </svg>
                  <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -100%)' }}>
                    <div style={{ padding: '8px 14px', background: 'var(--grey900)', color: 'var(--static-white)', borderRadius: 999, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{v.name}</div>
                    <div style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '10px solid var(--grey900)', margin: '-1px auto 0' }}/>
                  </div>
                </div>
              </div>
            </div>

            {/* booking sidebar */}
            <div>
              <div style={{ position: 'sticky', top: 24, padding: 28, border: '1px solid var(--grey200)', borderRadius: 16 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 16 }}>
                  <div className="tab-num" style={{ fontSize: 26, fontWeight: 700 }}>{v.price.toLocaleString()}원</div>
                  <span style={{ fontSize: 13, color: 'var(--grey500)', marginLeft: 4, fontWeight: 400 }}>/{v.unit}</span>
                </div>
                <div style={{ padding: 12, background: 'var(--grey50)', borderRadius: 8, fontSize: 13, fontWeight: 400, color: 'var(--grey700)', marginBottom: 16 }}>
                  평일 기본 · <b className="tab-num" style={{ color: 'var(--grey900)', fontWeight: 700 }}>주말</b>은 220,000원
                </div>

                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--grey600)', marginBottom: 10 }}>날짜</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
                  {[
                    { l: '오늘', d: '24' },
                    { l: '내일', d: '25', sel: true },
                    { l: '토', d: '26' },
                    { l: '일', d: '27' },
                  ].map(x => (
                    <button className="tm-pressable tm-break-keep" key={x.l} style={{ flex: 1, padding: '10px 0', borderRadius: 10, background: x.sel ? 'var(--grey900)' : 'var(--grey100)', color: x.sel ? 'var(--static-white)' : 'var(--grey900)', fontSize: 12, fontWeight: 600 }}>
                      <div>{x.l}</div>
                      <div className="tab-num" style={{ fontSize: 14, marginTop: 2 }}>{x.d}</div>
                    </button>
                  ))}
                </div>

                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--grey600)', marginBottom: 10 }}>시간대</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 20 }}>
                  {hours.slice(0, 12).map((h, i) => {
                    const dis = i < 2 || i === 5 || i === 8;
                    const sel = i === 9;
                    return (
                      <button key={h} disabled={dis} className="tab-num" style={{ padding: '10px 0', borderRadius: 6, background: sel ? 'var(--blue500)' : (dis ? 'var(--grey50)' : 'var(--static-white)'), border: dis ? '1px solid var(--grey100)' : '1px solid var(--grey200)', color: sel ? 'var(--static-white)' : (dis ? 'var(--grey300)' : 'var(--grey900)'), fontSize: 12, fontWeight: sel ? 700 : 500 }}>{h}:00</button>
                    );
                  })}
                </div>

                <div style={{ padding: 16, background: 'var(--grey50)', borderRadius: 10, marginBottom: 16 }}>
                  <div className="tab-num" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--grey600)', padding: '4px 0', fontWeight: 400 }}>
                    <span>2시간 이용</span><span>360,000원</span>
                  </div>
                  <div className="tab-num" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--grey600)', padding: '4px 0', fontWeight: 400 }}>
                    <span>예약 수수료</span><span>3,000원</span>
                  </div>
                  <div className="tab-num" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, color: 'var(--grey900)', padding: '8px 0 0', borderTop: '1px solid var(--grey200)', marginTop: 8, fontWeight: 700 }}>
                    <span>합계</span><span>363,000원</span>
                  </div>
                </div>

                <button className="tm-pressable tm-break-keep" style={{ width: '100%', height: 52, borderRadius: 12, background: 'var(--blue500)', color: 'var(--static-white)', fontSize: 15, fontWeight: 600 }}>예약하기</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DesktopShell>
  );
};

Object.assign(window, { DesktopLanding, DesktopLessons, DesktopVenues, DesktopMarket, DesktopLessonDetail, DesktopVenueDetail });
