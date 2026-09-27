/* Teameet — Refresh Part 3: Desktop web · Admin dashboard */

/* ────────── Desktop Landing — Toss-canonical ────────── */
const DesktopLandingV2 = () => (
  <div style={{ width: 1280, minHeight: 800, background: 'var(--bg)', fontFamily: 'var(--font)', overflow: 'hidden' }}>
    {/* Nav */}
    <div style={{ height: 64, padding: '0 48px', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)', letterSpacing: 0 }}>teameet</div>
      <div style={{ flex: 1, marginLeft: 48, display: 'flex', gap: 28 }}>
        {['매치', '팀매칭', '레슨', '시설', '용병', '대회'].map(m => (
          <a key={m} style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}>{m}</a>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="tm-pressable tm-break-keep" style={{ height: 36, padding: '0 14px', background: 'transparent', border: 'none', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>로그인</button>
        <button className="tm-pressable tm-break-keep" style={{ height: 36, padding: '0 16px', borderRadius: 8, background: 'var(--text-strong)', color: 'var(--static-white)', border: 'none', fontSize: 13, fontWeight: 700 }}>앱 다운로드</button>
      </div>
    </div>

    {/* Hero */}
    <div style={{ padding: '72px 48px 60px', display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 48, alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--blue500)', fontWeight: 700, letterSpacing: 0.5 }}>SPORTS COMMUNITY · 2026</div>
        <h1 style={{ fontSize: 56, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: 0, lineHeight: 1.15, margin: '16px 0' }}>
          오늘 저녁,<br/>
          <span style={{ color: 'var(--blue500)' }}>같이 운동할</span> 사람<br/>
          이미 모여 있어요
        </h1>
        <p style={{ fontSize: 17, color: 'var(--text-muted)', fontWeight: 500, lineHeight: 1.6, margin: '20px 0 32px', maxWidth: 480 }}>
          전국 12,000개 매치, 8개 종목.<br/>
          비슷한 실력의 사람들과 즉시 매칭되는 운동 커뮤니티 플랫폼
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="tm-pressable tm-break-keep" style={{ height: 56, padding: '0 28px', borderRadius: 14, background: 'var(--blue500)', color: 'var(--static-white)', border: 'none', fontSize: 16, fontWeight: 700 }}>지금 시작하기 →</button>
          <button className="tm-pressable tm-break-keep" style={{ height: 56, padding: '0 28px', borderRadius: 14, background: 'var(--grey100)', color: 'var(--text-strong)', border: 'none', fontSize: 16, fontWeight: 700 }}>이번 주 매치 보기</button>
        </div>

        {/* KPI proof */}
        <div style={{ marginTop: 56, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, maxWidth: 540 }}>
          <KPIStat label="누적 매치" value="124K"/>
          <KPIStat label="활성 사용자" value="38K"/>
          <KPIStat label="평균 매너" value="4.7"/>
          <KPIStat label="재참여율" value={89} unit="%"/>
        </div>
      </div>

      {/* Floating phone preview */}
      <div style={{ position: 'relative', height: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(49,130,246,0.12), transparent 70%)' }}/>
        <div style={{ transform: 'scale(0.85) rotate(-3deg)', filter: 'drop-shadow(0 30px 60px rgba(0,0,0,.18))' }}>
          <HomeToss/>
        </div>
      </div>
    </div>

    {/* Trust bar */}
    <div style={{ padding: '24px 48px', background: 'var(--grey50)', display: 'flex', alignItems: 'center', gap: 32, justifyContent: 'center' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>FEATURED IN</span>
      {['매일경제', '동아일보', '스포츠조선', 'TechCrunch', 'OUTSTANDING'].map((b, i) => (
        <span key={i} style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: 0, opacity: 0.6 }}>{b}</span>
      ))}
    </div>

    {/* Feature grid */}
    <div style={{ padding: '80px 48px' }}>
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div style={{ fontSize: 13, color: 'var(--blue500)', fontWeight: 700, letterSpacing: 0.5 }}>WHY TEAMEET</div>
        <h2 style={{ fontSize: 36, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: 0, margin: '12px 0 0' }}>
          운동, 더 이상 혼자 고민하지 마세요
        </h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
        {[
          { e: '⚽', t: '8개 종목 · 12,000개 매치', s: '축구 · 풋살 · 농구 · 테니스 · 배드민턴 · 야구 · 러닝 · 아이스하키' },
          { e: '👥', t: '실력별 매칭', s: '비슷한 레벨 · 매너 점수 기반으로 안전한 매칭' },
          { e: '💸', t: '간편 결제 · 100% 환불', s: '시작 24시간 전까지 100% 환불 보장' },
        ].map((f, i) => (
          <div key={i} style={{ padding: 32, borderRadius: 20, background: 'var(--grey50)' }}>
            <div style={{ fontSize: 36, marginBottom: 16 }}>{f.e}</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: 0, marginBottom: 8 }}>{f.t}</div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 500, lineHeight: 1.6 }}>{f.s}</div>
          </div>
        ))}
      </div>
    </div>

    {/* CTA strip */}
    <div style={{ padding: '64px 48px 80px' }}>
      <div style={{ padding: '48px', borderRadius: 24, background: 'linear-gradient(135deg, var(--blue500), var(--blue700))', color: 'var(--static-white)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 0, lineHeight: 1.3 }}>이번 주말,<br/>첫 매치는 무료</div>
          <div style={{ fontSize: 14, opacity: 0.9, fontWeight: 500, marginTop: 12 }}>신규 가입 시 3,000원 쿠폰 자동 적용</div>
        </div>
        <button className="tm-pressable tm-break-keep" style={{ height: 56, padding: '0 28px', borderRadius: 14, background: 'var(--static-white)', color: 'var(--blue500)', border: 'none', fontSize: 15, fontWeight: 700 }}>앱 다운로드 →</button>
      </div>
    </div>
  </div>
);

/* ────────── Desktop Matches list ────────── */
const DesktopMatchesV2 = () => (
  <div style={{ width: 1280, minHeight: 800, background: 'var(--grey50)', fontFamily: 'var(--font)' }}>
    <div style={{ height: 60, padding: '0 32px', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-strong)' }}>teameet</div>
      <div style={{ flex: 1, marginLeft: 32, display: 'flex', gap: 24 }}>
        {[['매치', true], ['팀매칭'], ['레슨'], ['시설'], ['용병'], ['대회']].map(([m, a]) => (
          <a key={m} style={{ fontSize: 13, fontWeight: a ? 700 : 500, color: a ? 'var(--text-strong)' : 'var(--text-muted)', borderBottom: a ? '2px solid var(--text-strong)' : 'none', height: 60, lineHeight: '60px', cursor: 'pointer' }}>{m}</a>
        ))}
      </div>
      <div style={{ width: 280, height: 36, padding: '0 14px', borderRadius: 8, background: 'var(--grey100)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="search" size={16} color="var(--text-muted)"/>
        <span style={{ fontSize: 13, color: 'var(--text-placeholder)' }}>매치, 팀, 시설 검색</span>
      </div>
      <div style={{ marginLeft: 16, width: 36, height: 36, borderRadius: '50%', background: `url(${IMG.av1}) center/cover` }}/>
    </div>

    {/* Hero header */}
    <div style={{ padding: '32px 32px 0' }}>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>홈 · 매치 찾기</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: 0, margin: 0 }}>
          이번 주말 매치 <span className="tab-num" style={{ color: 'var(--blue500)' }}>16개</span>
        </h1>
        <button className="tm-pressable tm-break-keep" style={{ height: 44, padding: '0 18px', borderRadius: 10, background: 'var(--text-strong)', color: 'var(--static-white)', border: 'none', fontSize: 14, fontWeight: 700 }}>+ 매치 만들기</button>
      </div>
    </div>

    {/* Filter row */}
    <div style={{ padding: '24px 32px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <HapticChip active count={42}>전체</HapticChip>
      <HapticChip count={18}>축구</HapticChip>
      <HapticChip count={12}>풋살</HapticChip>
      <HapticChip count={6}>농구</HapticChip>
      <HapticChip count={4}>테니스</HapticChip>
      <div style={{ width: 1, background: 'var(--border)', margin: '0 4px' }}/>
      <HapticChip>강남구</HapticChip>
      <HapticChip>마포구</HapticChip>
      <HapticChip>이번 주말</HapticChip>
      <HapticChip>5만원 이하</HapticChip>
    </div>

    {/* KPI row */}
    <div style={{ padding: '20px 32px 0', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
      <div style={{ padding: 20, borderRadius: 14, background: 'var(--bg)' }}><KPIStat label="모집중" value={42} unit="개"/></div>
      <div style={{ padding: 20, borderRadius: 14, background: 'var(--bg)' }}><KPIStat label="긴급 모집" value={6} unit="개" delta={2} deltaLabel="개"/></div>
      <div style={{ padding: 20, borderRadius: 14, background: 'var(--bg)' }}><KPIStat label="평균 참가비" value={14000} unit="원"/></div>
      <div style={{ padding: 20, borderRadius: 14, background: 'var(--bg)' }}><KPIStat label="평균 매너" value="4.7"/></div>
    </div>

    {/* Layout */}
    <div style={{ padding: '24px 32px 64px', display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24 }}>
      {/* Sidebar — sorts */}
      <div>
        <div style={{ background: 'var(--bg)', borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 12 }}>정렬</div>
          {['추천순', '시간 임박순', '거리순', '저렴한순', '평점 높은순'].map((s, i) => (
            <div key={s} style={{ padding: '10px 0', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid', borderColor: i === 0 ? 'var(--blue500)' : 'var(--border-strong)', background: i === 0 ? 'var(--blue500)' : 'transparent', display: 'grid', placeItems: 'center' }}>
                {i === 0 && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--static-white)' }}/>}
              </div>
              <span style={{ fontSize: 13, color: 'var(--text-strong)', fontWeight: i === 0 ? 600 : 500 }}>{s}</span>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--bg)', borderRadius: 14, padding: 18, marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 12 }}>참가 형태</div>
          {[['혼자 가도 OK', true], ['팀 단위만'], ['신규 환영']].map(([s, a]) => (
            <label key={s} style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, border: '2px solid', borderColor: a ? 'var(--blue500)' : 'var(--border-strong)', background: a ? 'var(--blue500)' : 'transparent', display: 'grid', placeItems: 'center', color: 'var(--static-white)', fontSize: 11, fontWeight: 800 }}>{a && '✓'}</div>
              <span style={{ fontSize: 13, color: 'var(--text-strong)', fontWeight: 500 }}>{s}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {MATCHES.slice(0, 9).map(m => (
          <div key={m.id} style={{ background: 'var(--bg)', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', cursor: 'pointer' }}>
            <div style={{ height: 140, background: `url(${m.img}) center/cover`, position: 'relative' }}>
              <div style={{ position: 'absolute', top: 12, left: 12, fontSize: 10, padding: '3px 7px', background: 'rgba(0,0,0,0.6)', color: 'var(--static-white)', borderRadius: 4, fontWeight: 700 }}>{SPORTS.find(s => s.id === m.sport)?.label ?? m.sport}</div>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.3, height: 38, overflow: 'hidden' }}>{m.title}</div>
              <div className="tab-num" style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginTop: 8 }}>{m.date} · {m.venue}</div>
              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <StackedAvatars avatars={[IMG.av1, IMG.av2, IMG.av3]} size={24} max={3}/>
                <div className="tab-num" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{m.fee.toLocaleString()}원</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* ────────── Admin Dashboard refresh ────────── */
const AdminDashboardV2 = () => (
  <div style={{ width: 1280, minHeight: 800, background: 'var(--grey50)', fontFamily: 'var(--font)', display: 'flex' }}>
    {/* Sidebar */}
    <div style={{ width: 220, background: '#111827', color: 'var(--static-white)', padding: '20px 0' }}>
      <div style={{ padding: '0 20px 20px', fontSize: 16, fontWeight: 800, letterSpacing: 0 }}>teameet · admin</div>
      {[
        { n: '대시보드', a: true, ic: '◫' },
        { n: '매치', ic: '⚽' },
        { n: '레슨', ic: '✎' },
        { n: '용병', ic: '🆘' },
        { n: '결제', ic: '₩' },
        { n: '리뷰', ic: '★' },
        { n: '분쟁', ic: '⚖' },
        { n: '정산', ic: '⇆' },
        { n: '회원', ic: '👤' },
        { n: '시설', ic: '⌂' },
        { n: '운영툴', ic: '⚙' },
      ].map(m => (
        <div key={m.n} style={{
          padding: '10px 20px',
          display: 'flex', alignItems: 'center', gap: 12,
          background: m.a ? 'rgba(49,130,246,.18)' : 'transparent',
          boxShadow: m.a ? 'inset 0 0 0 1px rgba(49,130,246,.34)' : 'none',
          fontSize: 13, fontWeight: m.a ? 700 : 500,
          color: m.a ? '#93c5fd' : '#e5e7eb',
          cursor: 'pointer',
        }}>
          <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>{m.ic}</span>
          {m.n}
        </div>
      ))}
    </div>

    <div style={{ flex: 1 }}>
      {/* Top */}
      <div style={{ height: 64, padding: '0 32px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)' }}>대시보드</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button className="tm-pressable tm-break-keep" style={{ height: 36, padding: '0 14px', borderRadius: 8, background: 'var(--grey100)', border: 'none', fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>2026년 4월 ▾</button>
          <button className="tm-pressable tm-break-keep" style={{ height: 36, padding: '0 14px', borderRadius: 8, background: 'var(--blue500)', color: 'var(--static-white)', border: 'none', fontSize: 13, fontWeight: 700 }}>리포트 내보내기</button>
        </div>
      </div>

      <div style={{ padding: 32 }}>
        {/* KPI grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { l: '오늘 매출', v: 4286000, u: '원', d: 12, dl: '%' },
            { l: '오늘 매치', v: 286, u: '건', d: 8, dl: '%' },
            { l: '활성 사용자', v: 12482, u: '명', d: -2, dl: '%' },
            { l: '오픈 분쟁', v: 7, u: '건', d: 3, dl: '건' },
          ].map((k, i) => (
            <div key={i} style={{ padding: 24, borderRadius: 14, background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <KPIStat label={k.l} value={k.v} unit={k.u} delta={k.d} deltaLabel={k.dl}/>
              {/* Mini sparkline */}
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-end', gap: 3, height: 28 }}>
                {[40, 65, 50, 80, 45, 70, 90, 60, 75, 88].map((h, j) => (
                  <div key={j} style={{ flex: 1, height: `${h}%`, background: i === 3 ? 'var(--red500)' : 'var(--blue500)', borderRadius: 2, opacity: 0.8 }}/>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Two column */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>
          {/* Revenue chart */}
          <div style={{ padding: 24, borderRadius: 14, background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>매출 추이</div>
                <div className="tab-num" style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginTop: 4 }}>4/1 ~ 4/24 · 일 평균 178만원</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {['7일', '30일', '3개월'].map((p, i) => (
                  <button className="tm-pressable tm-break-keep" key={p} style={{ height: 28, padding: '0 10px', borderRadius: 6, background: i === 1 ? 'var(--text-strong)' : 'var(--grey100)', color: i === 1 ? 'var(--static-white)' : 'var(--text-muted)', border: 'none', fontSize: 11, fontWeight: 700 }}>{p}</button>
                ))}
              </div>
            </div>
            {/* SVG chart */}
            <svg width="100%" height="200" viewBox="0 0 600 200">
              <defs>
                <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--blue500)" stopOpacity="0.3"/>
                  <stop offset="100%" stopColor="var(--blue500)" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <path d="M 0,140 L 50,120 L 100,135 L 150,90 L 200,105 L 250,70 L 300,80 L 350,55 L 400,65 L 450,40 L 500,50 L 550,30 L 600,45 L 600,200 L 0,200 Z" fill="url(#rg)"/>
              <path d="M 0,140 L 50,120 L 100,135 L 150,90 L 200,105 L 250,70 L 300,80 L 350,55 L 400,65 L 450,40 L 500,50 L 550,30 L 600,45" stroke="var(--blue500)" strokeWidth="2.5" fill="none"/>
            </svg>
          </div>

          {/* Sport breakdown */}
          <div style={{ padding: 24, borderRadius: 14, background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 20 }}>종목별 비중</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <StatBar label="축구" value={42} sub="120건"/>
              <StatBar label="풋살" value={28} sub="80건" color="var(--green500)"/>
              <StatBar label="농구" value={18} sub="52건" color="var(--orange500)"/>
              <StatBar label="테니스" value={12} sub="34건" color="var(--purple500)"/>
            </div>
          </div>
        </div>

        {/* Recent activity table */}
        <div style={{ padding: 24, borderRadius: 14, background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>최근 결제</div>
            <button className="tm-pressable tm-break-keep" style={{ background: 'transparent', border: 'none', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>전체보기 →</button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['주문번호', '상품', '사용자', '결제수단', '금액', '상태', '시각'].map(h => (
                  <th key={h} style={{ padding: '10px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['TM-20260424-0086', '주말 축구 한 판', '김정민', '토스페이', 12000, '완료', '14:32'],
                ['TM-20260424-0085', '풋살 레슨 5회권', '이지훈', '신한카드', 120000, '완료', '14:18'],
                ['TM-20260424-0084', '시설 예약 (반포)', '박수현', '국민카드', 25000, '환불요청', '13:55'],
                ['TM-20260424-0083', '용병 매칭 GK', '최소연', '토스페이', 25000, '완료', '13:42'],
                ['TM-20260424-0082', '아이스하키 레슨', '정태욱', '토스페이', 80000, '완료', '13:11'],
              ].map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--grey100)' }}>
                  <td className="tab-num" style={{ padding: '12px 8px', fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{r[0]}</td>
                  <td style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-strong)', fontWeight: 600 }}>{r[1]}</td>
                  <td style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-strong)', fontWeight: 500 }}>{r[2]}</td>
                  <td style={{ padding: '12px 8px', fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{r[3]}</td>
                  <td className="tab-num" style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-strong)', fontWeight: 700 }}>{r[4].toLocaleString()}원</td>
                  <td style={{ padding: '12px 8px' }}>
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, fontWeight: 700,
                      background: r[5] === '완료' ? 'var(--green50)' : 'var(--red50)',
                      color: r[5] === '완료' ? 'var(--green500)' : 'var(--red500)',
                    }}>{r[5]}</span>
                  </td>
                  <td className="tab-num" style={{ padding: '12px 8px', fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{r[6]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
);

Object.assign(window, {
  DesktopLandingV2, DesktopMatchesV2, AdminDashboardV2,
});
