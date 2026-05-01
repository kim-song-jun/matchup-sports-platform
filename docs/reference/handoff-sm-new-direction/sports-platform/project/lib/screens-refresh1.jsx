/* Teameet — Refreshed weak screens with Toss DNA signatures
   Section 1: Onboarding · Mercenary · Tournaments */

/* ───────────────────── Onboarding (3 steps) ───────────────────── */

const OnboardingV2_Step1 = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ padding: '8px 20px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
      <button className="tm-pressable tm-break-keep" style={{ width: 40, height: 40, background: 'transparent', border: 'none', color: 'var(--text-strong)' }}>
        <Icon name="chevL" size={22}/>
      </button>
      <div style={{ flex: 1, display: 'flex', gap: 4 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: i === 1 ? 'var(--blue500)' : 'var(--grey150)',
          }}/>
        ))}
      </div>
      <button className="tm-pressable tm-break-keep" style={{ background: 'transparent', border: 'none', fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>건너뛰기</button>
    </div>

    <div style={{ flex: 1, padding: '40px 24px 0', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, color: 'var(--blue500)', fontWeight: 700, letterSpacing: 0.5 }}>STEP 1 / 3</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', marginTop: 8, letterSpacing: 0, lineHeight: 1.3 }}>
        어떤 운동을<br/>좋아하세요?
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 12, fontWeight: 500 }}>
        여러 개 선택할 수 있어요
      </div>

      <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { e: '⚽', n: '축구', sel: true },
          { e: '🥅', n: '풋살', sel: true },
          { e: '🏀', n: '농구', sel: false },
          { e: '🎾', n: '테니스', sel: false },
          { e: '🏸', n: '배드민턴', sel: false },
          { e: '🏐', n: '배구', sel: false },
          { e: '🏃', n: '러닝', sel: false },
          { e: '🥎', n: '야구', sel: false },
          { e: '⛸', n: '아이스', sel: false },
        ].map((s, i) => (
          <div key={i} style={{
            aspectRatio: '1',
            borderRadius: 16,
            background: s.sel ? 'var(--blue50)' : 'var(--grey50)',
            border: s.sel ? '2px solid var(--blue500)' : '2px solid transparent',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', position: 'relative',
          }}>
            <div style={{ fontSize: 32 }}>{s.e}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', marginTop: 6 }}>{s.n}</div>
            {s.sel && <div style={{
              position: 'absolute', top: 6, right: 6,
              width: 18, height: 18, borderRadius: '50%',
              background: 'var(--blue500)', color: 'var(--static-white)',
              display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700,
            }}>✓</div>}
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }}/>

      <div style={{ paddingBottom: 24 }}>
        <button className="tm-pressable tm-break-keep" style={{
          width: '100%', height: 56, borderRadius: 14,
          background: 'var(--blue500)', color: 'var(--static-white)',
          border: 'none', fontSize: 16, fontWeight: 700,
        }}>2개 선택 · 다음</button>
      </div>
    </div>
  </div>
);

const OnboardingV2_Step2 = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ padding: '8px 20px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
      <button className="tm-pressable tm-break-keep" style={{ width: 40, height: 40, background: 'transparent', border: 'none', color: 'var(--text-strong)' }}>
        <Icon name="chevL" size={22}/>
      </button>
      <div style={{ flex: 1, display: 'flex', gap: 4 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= 2 ? 'var(--blue500)' : 'var(--grey150)' }}/>
        ))}
      </div>
    </div>

    <div style={{ flex: 1, padding: '40px 24px 0', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      <div style={{ fontSize: 12, color: 'var(--blue500)', fontWeight: 700, letterSpacing: 0.5 }}>STEP 2 / 3</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', marginTop: 8, letterSpacing: 0, lineHeight: 1.3 }}>
        축구 실력은<br/>어느 정도세요?
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 12, fontWeight: 500 }}>
        솔직하게 알려주세요. 비슷한 분들과 매칭해드려요.
      </div>

      <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          { lv: '입문', d: '공차본 적 있어요', sel: false, c: 'var(--green500)' },
          { lv: '초급', d: '동호회 1년 미만', sel: true, c: 'var(--blue500)' },
          { lv: '중급', d: '동호회 1~3년', sel: false, c: 'var(--orange500)' },
          { lv: '상급', d: '대학·실업 출신', sel: false, c: 'var(--purple500)' },
          { lv: '선출', d: '선수 출신 (인증 필요)', sel: false, c: 'var(--red500)' },
        ].map((l, i) => (
          <div key={i} style={{
            padding: '18px 16px', borderRadius: 14,
            background: l.sel ? l.c + '12' : 'var(--grey50)',
            border: l.sel ? `2px solid ${l.c}` : '2px solid transparent',
            display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: l.c, color: 'var(--static-white)',
              display: 'grid', placeItems: 'center',
              fontSize: 13, fontWeight: 800,
            }}>{l.lv}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{l.lv}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginTop: 2 }}>{l.d}</div>
            </div>
            {l.sel && <div style={{ width: 22, height: 22, borderRadius: '50%', background: l.c, color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800 }}>✓</div>}
          </div>
        ))}
      </div>

      <div style={{ paddingBottom: 24, marginTop: 32 }}>
        <button className="tm-pressable tm-break-keep" style={{
          width: '100%', height: 56, borderRadius: 14,
          background: 'var(--blue500)', color: 'var(--static-white)',
          border: 'none', fontSize: 16, fontWeight: 700,
        }}>다음</button>
      </div>
    </div>
  </div>
);

const OnboardingV2_Step3 = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ padding: '8px 20px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
      <button className="tm-pressable tm-break-keep" style={{ width: 40, height: 40, background: 'transparent', border: 'none', color: 'var(--text-strong)' }}>
        <Icon name="chevL" size={22}/>
      </button>
      <div style={{ flex: 1, display: 'flex', gap: 4 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--blue500)' }}/>
        ))}
      </div>
    </div>

    <div style={{ flex: 1, padding: '40px 24px 0', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, color: 'var(--blue500)', fontWeight: 700, letterSpacing: 0.5 }}>STEP 3 / 3</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', marginTop: 8, letterSpacing: 0, lineHeight: 1.3 }}>
        주로 어디서<br/>운동하세요?
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 12, fontWeight: 500 }}>
        근처 매치를 우선 추천해드려요
      </div>

      <div style={{
        marginTop: 24, padding: '14px 16px',
        borderRadius: 12, background: 'var(--grey50)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Icon name="search" size={18} color="var(--text-muted)"/>
        <input placeholder="동·구 검색" style={{
          flex: 1, border: 'none', background: 'transparent',
          fontSize: 14, color: 'var(--text-strong)',
        }}/>
      </div>

      <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>인기 지역</div>
      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {['강남구', '마포구 (선택됨)', '송파구', '성동구', '용산구', '서초구', '영등포구', '관악구', '서대문구'].map((r, i) => (
          <div key={i} style={{
            height: 36, padding: '0 14px', borderRadius: 999,
            background: i === 1 ? 'var(--grey900)' : 'var(--grey100)',
            color: i === 1 ? 'var(--static-white)' : 'var(--text-strong)',
            fontSize: 13, fontWeight: 600,
            display: 'grid', placeItems: 'center',
          }}>{r.replace(' (선택됨)', '')}</div>
        ))}
      </div>

      <div style={{
        marginTop: 32, padding: 16, borderRadius: 12,
        background: 'var(--blue50)',
        display: 'flex', alignItems: 'flex-start', gap: 10,
      }}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>i</div>
        <div style={{ fontSize: 13, color: 'var(--blue700)', fontWeight: 500, lineHeight: 1.5 }}>
          마포구 근처에 <span style={{ fontWeight: 700 }}>이번 주 12개 매치</span>가 모집 중이에요!
        </div>
      </div>

      <div style={{ flex: 1 }}/>

      <div style={{ paddingBottom: 24 }}>
        <button className="tm-pressable tm-break-keep" style={{
          width: '100%', height: 56, borderRadius: 14,
          background: 'var(--blue500)', color: 'var(--static-white)',
          border: 'none', fontSize: 16, fontWeight: 700,
        }}>시작하기</button>
      </div>
    </div>
  </div>
);

const OnboardingV2_Welcome = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ flex: 1, padding: '60px 32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div style={{
        width: 88, height: 88, borderRadius: 28,
        background: 'var(--blue500)', color: 'var(--static-white)',
        display: 'grid', placeItems: 'center',
        fontSize: 44, fontWeight: 800, letterSpacing: 0,
      }}>T</div>

      <div style={{ marginTop: 28, fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: 0, lineHeight: 1.3 }}>
        준비 끝!<br/>정민님의 첫 매치를<br/>찾아드릴게요
      </div>

      <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 16, fontWeight: 500, lineHeight: 1.6 }}>
        축구·풋살 / 초급 / 마포구 기준<br/>맞춤 추천 매치 5개를 골라뒀어요
      </div>

      {/* recommendation card preview */}
      <div style={{ width: '100%', marginTop: 36, padding: 16, borderRadius: 16, background: 'var(--grey50)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'var(--blue50)', color: 'var(--blue500)',
            display: 'grid', placeItems: 'center', fontWeight: 800,
          }}>5/3</div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>주말 축구 한 판</div>
            <div className="tab-num" style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, marginTop: 2 }}>토 14:00 · 상암 · 18/22명</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }}/>

      <div style={{ width: '100%', paddingBottom: 24 }}>
        <button className="tm-pressable tm-break-keep" style={{
          width: '100%', height: 56, borderRadius: 14,
          background: 'var(--blue500)', color: 'var(--static-white)',
          border: 'none', fontSize: 16, fontWeight: 700,
        }}>홈으로</button>
        <button className="tm-pressable tm-break-keep" style={{
          width: '100%', height: 48, marginTop: 8,
          background: 'transparent', color: 'var(--text-muted)',
          border: 'none', fontSize: 14, fontWeight: 500,
        }}>프로필 더 채우기</button>
      </div>
    </div>
  </div>
);

/* ───────────────────── Mercenary refresh ───────────────────── */

const MercenaryV2 = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ padding: '12px 20px', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: 0 }}>용병</div>
      <button className="tm-pressable tm-break-keep" style={{ height: 36, padding: '0 14px', borderRadius: 8, background: 'var(--grey900)', color: 'var(--static-white)', border: 'none', fontSize: 12, fontWeight: 700 }}>+ 구인 등록</button>
    </div>

    {/* KPI strip */}
    <div style={{ background: 'var(--bg)', padding: '16px 20px 20px', borderBottom: '8px solid var(--grey50)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <KPIStat label="오늘 모집" value={42} unit="건"/>
        <KPIStat label="평균 매칭" value={18} unit="분"/>
        <KPIStat label="평균 페이" value={20000} unit="원"/>
      </div>
    </div>

    {/* Filter chips */}
    <div style={{ background: 'var(--bg)', padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
        <HapticChip active>전체 42</HapticChip>
        <HapticChip count={18}>축구</HapticChip>
        <HapticChip count={12}>풋살</HapticChip>
        <HapticChip count={6}>농구</HapticChip>
        <HapticChip count={4}>테니스</HapticChip>
      </div>
    </div>

    {/* List */}
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 0' }}>
      {[
        { sport: '축구', pos: 'GK', team: 'FC 발빠른놈들', dt: '오늘 18:00', loc: '상암', pay: 25000, urgent: true, dist: '1.2km', host: { n: '정민', mn: 4.9, av: IMG.av1 } },
        { sport: '풋살', pos: 'MF', team: '다이나믹 FS', dt: '내일 20:00', loc: '잠실', pay: 15000, dist: '4.5km', host: { n: '지훈', mn: 4.8, av: IMG.av2 } },
        { sport: '농구', pos: 'C', team: '강남 농구회', dt: '4/26 14:00', loc: '강남', pay: 20000, dist: '8.2km', host: { n: '수현', mn: 4.7, av: IMG.av3 } },
        { sport: '풋살', pos: 'FW', team: '수요풋살', dt: '4/26 21:00', loc: '신도림', pay: 18000, dist: '6.0km', host: { n: '소연', mn: 4.9, av: IMG.av4 } },
      ].map((m, i) => (
        <div key={i} style={{ background: 'var(--bg)', padding: 16, marginBottom: 8, borderTop: '1px solid var(--grey100)', borderBottom: '1px solid var(--grey100)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            {m.urgent && <span style={{ fontSize: 10, padding: '3px 7px', background: 'var(--red50)', color: 'var(--red500)', borderRadius: 4, fontWeight: 700 }}>긴급</span>}
            <span style={{ fontSize: 11, padding: '3px 7px', background: 'var(--blue50)', color: 'var(--blue500)', borderRadius: 4, fontWeight: 700 }}>{m.sport} · {m.pos}</span>
            <span className="tab-num" style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 500, marginLeft: 'auto' }}>{m.dist}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: 0 }}>{m.team}</div>
              <div className="tab-num" style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginTop: 4 }}>{m.dt} · {m.loc}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="tab-num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--blue500)', letterSpacing: 0 }}>+{m.pay.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 500 }}>페이</div>
            </div>
          </div>

          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: `url(${m.host.av}) center/cover` }}/>
            <span style={{ fontSize: 12, color: 'var(--text-strong)', fontWeight: 600 }}>{m.host.n} 호스트</span>
            <span className="tab-num" style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>· 매너 {m.host.mn}</span>
            <button className="tm-pressable tm-break-keep" style={{ marginLeft: 'auto', height: 32, padding: '0 14px', borderRadius: 8, background: 'var(--blue500)', color: 'var(--static-white)', border: 'none', fontSize: 12, fontWeight: 700 }}>지원</button>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const MercenaryDetailV2 = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <TopNav title="용병 구인 상세"/>

    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100 }}>
      {/* Hero */}
      <div style={{ background: 'var(--bg)', padding: 20, borderBottom: '8px solid var(--grey50)' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <span style={{ fontSize: 11, padding: '4px 8px', background: 'var(--red50)', color: 'var(--red500)', borderRadius: 4, fontWeight: 700 }}>긴급</span>
          <span style={{ fontSize: 11, padding: '4px 8px', background: 'var(--blue50)', color: 'var(--blue500)', borderRadius: 4, fontWeight: 700 }}>축구 · GK</span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: 0, lineHeight: 1.3 }}>오늘 18:00 골키퍼 1명 급구</div>
      </div>

      {/* Pay & info */}
      <div style={{ background: 'var(--bg)', padding: '20px', borderBottom: '8px solid var(--grey50)' }}>
        <NumberDisplay value={25000} unit="원" size={36} sub="평균보다 +5,000원"/>
        <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: 'var(--grey50)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            ['일시', '오늘 18:00 ~ 20:00 (2시간)'],
            ['장소', '상암월드컵 보조구장'],
            ['거리', '내 위치에서 1.2km'],
            ['팀명', 'FC 발빠른놈들'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>{k}</span>
              <span className={k === '거리' ? 'tab-num' : ''} style={{ fontSize: 13, color: 'var(--text-strong)', fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Requirements */}
      <div style={{ background: 'var(--bg)', padding: 20, borderBottom: '8px solid var(--grey50)' }}>
        <SectionTitle title="요청 조건"/>
        <div style={{ padding: '0 20px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {['초급 이상', '20~40대', '장갑 지참', '5분 전 도착'].map(r => (
            <div key={r} style={{ height: 32, padding: '0 12px', borderRadius: 999, background: 'var(--grey100)', fontSize: 12, fontWeight: 600, color: 'var(--text-strong)', display: 'grid', placeItems: 'center' }}>{r}</div>
          ))}
        </div>
      </div>

      {/* Pay breakdown */}
      <div style={{ background: 'var(--bg)', padding: 20, borderBottom: '8px solid var(--grey50)' }}>
        <SectionTitle title="페이 구성"/>
        <div style={{ padding: '0 20px' }}>
          <MoneyRow label="기본 출전료" amount={20000}/>
          <MoneyRow label="긴급 모집 가산" amount={5000}/>
          <div style={{ borderTop: '1px solid var(--border)' }}>
            <MoneyRow label="총 페이" amount={25000} strong accent/>
          </div>
        </div>
      </div>

      {/* Host */}
      <div style={{ background: 'var(--bg)', padding: 20 }}>
        <SectionTitle title="호스트 정보"/>
        <div style={{ padding: '0 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: `url(${IMG.av1}) center/cover` }}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>김정민</div>
            <div className="tab-num" style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginTop: 2 }}>매너 4.9 · 용병 매칭 24회 · 노쇼 0%</div>
          </div>
        </div>
      </div>
    </div>

    {/* Sticky CTA */}
    <div style={{ padding: '12px 20px 24px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
      <button className="tm-pressable tm-break-keep" style={{
        width: '100%', height: 52, borderRadius: 12,
        background: 'var(--blue500)', color: 'var(--static-white)',
        border: 'none', fontSize: 15, fontWeight: 700,
      }}>지원하기 · 25,000원 받기</button>
    </div>
  </div>
);

/* ───────────────────── Tournaments refresh ───────────────────── */

const TournamentsV2 = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ padding: '12px 20px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: 0 }}>대회</div>
    </div>

    {/* Featured */}
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 24 }}>
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{
          borderRadius: 16, overflow: 'hidden',
          background: `linear-gradient(180deg, rgba(0,0,0,.1) 0%, rgba(0,0,0,.55) 100%), url(${IMG.soccer}) center/cover`,
          color: 'var(--static-white)', padding: '20px 18px', minHeight: 200,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        }}>
          <div style={{ fontSize: 11, padding: '3px 8px', background: 'rgba(255,255,255,0.2)', borderRadius: 4, fontWeight: 700, alignSelf: 'flex-start', marginBottom: 8, backdropFilter: 'blur(8px)' }}>이번 달 · MAJOR</div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 0, lineHeight: 1.3 }}>제 12회 Teameet<br/>아마추어 풋살 챔피언십</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, fontWeight: 500, opacity: 0.9 }}>
            <span className="tab-num">5/17 ~ 6/1</span>
            <span className="tab-num">·  16팀 / 32팀</span>
            <span className="tab-num">·  상금 200만원</span>
          </div>
        </div>
      </div>

      {/* KPI */}
      <div style={{ background: 'var(--bg)', margin: '16px 20px 0', padding: '16px', borderRadius: 14, border: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <KPIStat label="진행 중" value={3} unit="개"/>
        <KPIStat label="모집 중" value={8} unit="개"/>
        <KPIStat label="총 상금" value="430만"/>
      </div>

      {/* Tabs */}
      <div style={{ marginTop: 24, padding: '0 20px', display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
        {['전체', '모집중 8', '진행중 3', '종료'].map((t, i) => (
          <button className="tm-pressable tm-break-keep" key={t} style={{
            padding: '12px 14px', background: 'transparent', border: 'none',
            borderBottom: i === 1 ? '2px solid var(--text-strong)' : '2px solid transparent',
            fontSize: 13, fontWeight: i === 1 ? 700 : 500,
            color: i === 1 ? 'var(--text-strong)' : 'var(--text-muted)',
          }}>{t}</button>
        ))}
      </div>

      {/* List */}
      <div style={{ padding: '16px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[
          { t: '서울 동호인 5월 풋살리그', d: '5/10 ~ 5/31', team: '12 / 16', prize: '50만', fee: 30000, sport: '풋살' },
          { t: '주말 농구 3on3 토너먼트', d: '5/17', team: '6 / 32', prize: '30만', fee: 15000, sport: '농구' },
          { t: '한강 마라톤 5km', d: '6/7', team: '180 / 300', prize: '메달', fee: 25000, sport: '러닝' },
        ].map((tn, i) => (
          <div key={i} style={{ background: 'var(--bg)', borderRadius: 14, padding: 16, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <span style={{ fontSize: 11, padding: '3px 7px', background: 'var(--blue50)', color: 'var(--blue500)', borderRadius: 4, fontWeight: 700 }}>{tn.sport}</span>
              <span className="tab-num" style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 500 }}>모집 {Math.round((parseInt(tn.team.split(' / ')[0]) / parseInt(tn.team.split(' / ')[1])) * 100)}%</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: 0, marginBottom: 6 }}>{tn.t}</div>
            <div className="tab-num" style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{tn.d} · {tn.team}팀 모집</div>
            <div style={{ marginTop: 12, height: 4, borderRadius: 2, background: 'var(--grey100)', overflow: 'hidden' }}>
              <div style={{ width: `${(parseInt(tn.team.split(' / ')[0]) / parseInt(tn.team.split(' / ')[1])) * 100}%`, height: '100%', background: 'var(--blue500)' }}/>
            </div>
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 500 }}>참가비</div>
                <div className="tab-num" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>{tn.fee.toLocaleString()}<span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>원</span></div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 500 }}>상금</div>
                <div className="tab-num" style={{ fontSize: 16, fontWeight: 700, color: 'var(--blue500)' }}>{tn.prize}원</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const TournamentDetailV2 = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <TopNav title="" transparent/>

    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100 }}>
      {/* Hero */}
      <div style={{
        marginTop: -92,
        height: 280, background: `linear-gradient(180deg, rgba(0,0,0,.05) 30%, rgba(0,0,0,.65) 100%), url(${IMG.soccer}) center/cover`,
        padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', color: 'var(--static-white)',
      }}>
        <div style={{ fontSize: 11, padding: '3px 8px', background: 'rgba(255,255,255,0.2)', borderRadius: 4, fontWeight: 700, alignSelf: 'flex-start', marginBottom: 12, backdropFilter: 'blur(8px)' }}>5월 · MAJOR</div>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 0, lineHeight: 1.3 }}>제 12회 Teameet<br/>아마추어 풋살 챔피언십</div>
        <div className="tab-num" style={{ fontSize: 12, fontWeight: 500, opacity: 0.9, marginTop: 8 }}>5/17 ~ 6/1 · 토·일 진행</div>
      </div>

      {/* KPI */}
      <div style={{ background: 'var(--bg)', padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, borderBottom: '8px solid var(--grey50)' }}>
        <KPIStat label="참가팀" value="16/32"/>
        <KPIStat label="경기" value={30} unit="경기"/>
        <KPIStat label="상금" value="200만"/>
        <KPIStat label="기간" value="16일"/>
      </div>

      {/* Bracket preview */}
      <div style={{ background: 'var(--bg)', padding: '20px 0', borderBottom: '8px solid var(--grey50)' }}>
        <SectionTitle title="대진표" sub="현재 8강 진행 중" action="전체보기"/>
        <div style={{ padding: '0 20px' }}>
          {[
            { a: 'FC 발빠른놈들', b: '수요풋살', sa: 6, sb: 2, w: 'a' },
            { a: '다이나믹 FS', b: '퇴근후축구', sa: 3, sb: 3, w: 'pk', pk: '5:4' },
            { a: 'FC 번개', b: 'FC 불꽃', sa: 1, sb: 2, w: 'b' },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: i < 2 ? '1px solid var(--grey100)' : 'none' }}>
              <div style={{ flex: 1, textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: r.w === 'a' ? 700 : 500, color: r.w === 'a' ? 'var(--text-strong)' : 'var(--text-muted)' }}>{r.a}</div>
              </div>
              <div className="tab-num" style={{ padding: '0 16px', fontSize: 16, fontWeight: 800, color: 'var(--text-strong)', textAlign: 'center', minWidth: 80 }}>
                {r.sa} : {r.sb}
                {r.pk && <div style={{ fontSize: 10, color: 'var(--text-caption)', fontWeight: 500, marginTop: 2 }}>(PK {r.pk})</div>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: r.w === 'b' ? 700 : 500, color: r.w === 'b' ? 'var(--text-strong)' : 'var(--text-muted)' }}>{r.b}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Standings */}
      <div style={{ background: 'var(--bg)', padding: '20px 0', borderBottom: '8px solid var(--grey50)' }}>
        <SectionTitle title="순위표"/>
        <div style={{ padding: '0 20px' }}>
          {[
            { r: 1, n: 'FC 발빠른놈들', w: 4, d: 0, l: 0, gd: 18 },
            { r: 2, n: '다이나믹 FS', w: 3, d: 1, l: 0, gd: 11 },
            { r: 3, n: 'FC 불꽃', w: 3, d: 0, l: 1, gd: 7 },
            { r: 4, n: '퇴근후축구', w: 2, d: 1, l: 1, gd: 2 },
          ].map(t => (
            <div key={t.r} style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--grey100)' }}>
              <span className="tab-num" style={{ width: 24, fontSize: 13, fontWeight: 800, color: t.r <= 3 ? 'var(--blue500)' : 'var(--text-muted)' }}>{t.r}</span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>{t.n}</span>
              <span className="tab-num" style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginRight: 12 }}>{t.w}승 {t.d}무 {t.l}패</span>
              <span className="tab-num" style={{ fontSize: 13, fontWeight: 700, color: t.gd > 0 ? 'var(--green500)' : 'var(--red500)' }}>{t.gd > 0 ? '+' : ''}{t.gd}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Prize */}
      <div style={{ background: 'var(--bg)', padding: '20px' }}>
        <SectionTitle title="상금 구성"/>
        <div style={{ padding: '0 20px' }}>
          <MoneyRow label="🥇 우승" amount={1000000}/>
          <MoneyRow label="🥈 준우승" amount={500000}/>
          <MoneyRow label="🥉 3위" amount={300000}/>
          <MoneyRow label="MVP" amount={100000}/>
          <MoneyRow label="베스트 GK" amount={100000}/>
          <div style={{ borderTop: '1px solid var(--border)' }}>
            <MoneyRow label="총 상금" amount={2000000} strong accent/>
          </div>
        </div>
      </div>
    </div>

    <div style={{ padding: '12px 20px 24px', background: 'var(--bg)', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
      <button className="tm-pressable tm-break-keep" style={{ width: 52, height: 52, borderRadius: 12, background: 'var(--grey100)', border: 'none' }}>♡</button>
      <button className="tm-pressable tm-break-keep" style={{ flex: 1, height: 52, borderRadius: 12, background: 'var(--blue500)', color: 'var(--static-white)', border: 'none', fontSize: 15, fontWeight: 700 }}>우리 팀 참가 (3만원)</button>
    </div>
  </div>
);

Object.assign(window, {
  OnboardingV2_Step1, OnboardingV2_Step2, OnboardingV2_Step3, OnboardingV2_Welcome,
  MercenaryV2, MercenaryDetailV2,
  TournamentsV2, TournamentDetailV2,
});
