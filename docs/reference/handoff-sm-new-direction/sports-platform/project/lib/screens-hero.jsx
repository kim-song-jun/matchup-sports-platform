/* Teameet — Refreshed hero screens using signature components.
   These are the 'reference' implementations showing how Toss DNA
   (NumberDisplay, MoneyRow, KPIStat, SectionTitle, etc) compose. */

/* ── Home · Toss-canonical hero ── */
const HomeToss = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    {/* Top bar — minimal, Toss-style */}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 8px' }}>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 0, color: 'var(--text-strong)' }}>
        teameet
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="tm-pressable tm-break-keep" style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', color: 'var(--text-strong)' }}>
          <Icon name="search" size={22}/>
        </button>
        <button className="tm-pressable tm-break-keep" style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', color: 'var(--text-strong)', position: 'relative' }}>
          <Icon name="bell" size={22}/>
          <span style={{ position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: '50%', background: 'var(--red500)', border: '2px solid var(--bg)' }}/>
        </button>
      </div>
    </div>

    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
      {/* Greeting + KPI hero */}
      <div style={{ padding: '8px 20px 24px' }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>안녕하세요, 정민님</div>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>이번 달 활동</div>
            <NumberDisplay value={12} unit="경기" size={36} sub="지난달보다 +3"/>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>매너 점수</div>
            <NumberDisplay value="4.9" unit="" size={36} sub="상위 5%"/>
          </div>
        </div>
      </div>

      {/* Today's match — featured card */}
      <div style={{ margin: '0 20px 28px' }}>
        <div style={{
          padding: 20,
          borderRadius: 16,
          background: 'linear-gradient(135deg, var(--blue500) 0%, var(--blue600) 100%)',
          color: 'var(--static-white)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', right: -20, top: -20, width: 140, height: 140,
            borderRadius: '50%', background: 'rgba(255,255,255,0.08)',
          }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, opacity: 0.8 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--static-white)', display: 'inline-block', animation: 'pulse 1.5s infinite' }}/>
            오늘 14:00 시작
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, marginTop: 8, letterSpacing: 0, lineHeight: 1.3 }}>
            주말 축구 한 판,<br/>같이 뛰어요
          </div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 8, fontWeight: 500 }}>
            상암월드컵경기장 보조구장 · 18/22명
          </div>
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <StackedAvatars avatars={[IMG.av1, IMG.av2, IMG.av3, IMG.av4]} max={4}/>
            <button className="tm-pressable tm-break-keep" style={{
              height: 36, padding: '0 16px', borderRadius: 999,
              background: 'var(--static-white)', color: 'var(--blue500)',
              fontSize: 13, fontWeight: 700, border: 'none',
            }}>입장하기</button>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ padding: '0 20px 28px' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
          padding: '20px 12px',
          background: 'var(--grey50)', borderRadius: 16,
        }}>
          {[
            { l: '매치 찾기', c: 'var(--blue500)' },
            { l: '팀 매칭', c: 'var(--orange500)' },
            { l: '레슨', c: 'var(--green500)' },
            { l: '시설 예약', c: 'var(--purple500)' },
          ].map((q, i) => (
            <button className="tm-pressable tm-break-keep" key={i} style={{ background: 'transparent', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <div style={{
                width: 44, height: 44, borderRadius: 14,
                background: q.c + '15', color: q.c,
                display: 'grid', placeItems: 'center',
                fontSize: 17, fontWeight: 800,
              }}>{q.l[0]}</div>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-strong)' }}>{q.l}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Weather strip */}
      <div style={{ padding: '0 20px 24px' }}>
        <WeatherStrip city="상암" temp={18} cond="맑음" wind={2}/>
      </div>

      {/* Recommended matches */}
      <SectionTitle title="추천 매치" sub="실력에 맞는 경기 5개" action="전체보기"/>
      <div style={{ paddingLeft: 20, display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, paddingRight: 20 }}>
        {MATCHES.slice(0, 4).map(m => (
          <div key={m.id} style={{
            flexShrink: 0, width: 220,
            background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14,
            overflow: 'hidden',
          }}>
            <div style={{ height: 110, background: `url(${m.img}) center/cover` }}/>
            <div style={{ padding: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--blue500)', fontWeight: 700 }}>{SPORTS.find(s => s.id === m.sport)?.label ?? m.sport}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginTop: 4, lineHeight: 1.3, height: 36, overflow: 'hidden' }}>{m.title}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                <span className="tab-num" style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{m.cur}/{m.max}명</span>
                <span className="tab-num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>{m.fee.toLocaleString()}원</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Activity stats — KPIStat showcase */}
      <div style={{ padding: '24px 20px 20px' }}>
        <SectionTitle title="이번 달 통계"/>
        <div style={{
          background: 'var(--grey50)', borderRadius: 16,
          padding: '20px 16px',
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12,
        }}>
          <KPIStat label="참가" value={12} unit="회" delta={3} deltaLabel="회"/>
          <KPIStat label="MVP" value={2} unit="회" delta={1} deltaLabel="회"/>
          <KPIStat label="결제" value={144000} unit="원"/>
        </div>
      </div>

      {/* Live announcement */}
      <AnnouncementBar icon="🔥" text="이번 주말 16개 매치 모집 중" action/>
    </div>
    <TabBar active="home"/>
  </div>
);

const HomeTossCanonicalUiRules = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ padding: '16px 20px 14px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
      <Badge tone="blue" size="sm">HOME CANONICAL</Badge>
      <div style={{ fontSize: 23, fontWeight: 700, lineHeight: 1.28, letterSpacing: 0, marginTop: 8 }}>홈 디자인 규약</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>원본 `홈 · Toss canonical` 화면을 그대로 기준안으로 두고, 그 화면에서 지켜야 할 UI 규약을 정리합니다.</div>
    </div>
    <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'grid', gap: 12, alignContent: 'start' }}>
      {[
        ['상단 구조', '`teameet` 로고, 검색, 알림을 최소 chrome으로 유지하고 홈 첫 화면은 인사말과 활동 요약이 바로 읽히게 합니다.'],
        ['Hero 카드', '오늘의 매치는 HomeToss의 blue featured card를 유지합니다. 이 카드는 홈의 유일한 강한 visual anchor입니다.'],
        ['Quick action', '4개 shortcut은 HomeToss 구조를 유지하되 blue 외 색은 semantic support로만 사용하고 primary CTA처럼 보이지 않게 합니다.'],
        ['추천 목록', '추천 매치는 가로 카드 리스트를 유지합니다. 종목, 제목, 인원, 가격 순서로 판단 정보를 고정합니다.'],
        ['활동/신뢰', '이번 달 통계와 매너 점수는 sample/verified 상태를 분리해 실제 신뢰 지표처럼 과장하지 않습니다.'],
      ].map(([title, sub], i) => (
        <Card key={title} pad={16} style={{ boxShadow: 'none' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div className="tab-num" style={{ width: 32, height: 32, borderRadius: 12, background: i === 0 ? 'var(--blue500)' : 'var(--grey100)', color: i === 0 ? 'var(--static-white)' : 'var(--text-muted)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700 }}>{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{sub}</div>
            </div>
          </div>
        </Card>
      ))}
      <Card pad={16} style={{ background: 'var(--bg)', boxShadow: 'none' }}>
        <SectionTitle title="사용 컴포넌트" sub="Home canonical에서 허용하는 기본 vocabulary"/>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '4px 20px 0' }}>
          {['NumberDisplay', 'KPIStat', 'SectionTitle', 'StackedAvatars', 'WeatherStrip', 'AnnouncementBar', 'TabBar'].map((item, i) => (
            <HapticChip key={item} active={i === 0}>{item}</HapticChip>
          ))}
        </div>
      </Card>
    </div>
  </div>
);

const HomeTossCanonicalFlowRules = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--grey100)' }}>
      <Badge tone="blue" size="sm">FLOW / STATE</Badge>
      <div style={{ fontSize: 23, fontWeight: 700, lineHeight: 1.28, letterSpacing: 0, marginTop: 8 }}>홈 동작 기준</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>Grid 제작 전 원본 HomeToss 화면의 interaction과 state 기준을 먼저 고정합니다.</div>
    </div>
    <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
      <Card pad={18} style={{ boxShadow: 'none' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>탐색 흐름</div>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {[
            ['진입', '홈 진입 직후 인사말과 이번 달 활동/매너 점수가 먼저 보입니다.'],
            ['오늘 매치 판단', 'blue featured card에서 시간, 장소, 인원, 참가 CTA를 확인합니다.'],
            ['탐색 확장', 'quick action과 추천 매치 가로 리스트로 매치/팀/레슨/시설 탐색을 확장합니다.'],
            ['활동 확인', '하단 통계와 announcement로 현재 활동 상태와 다음 행동을 확인합니다.'],
          ].map(([title, sub], i) => (
            <div key={title} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div className="tab-num" style={{ width: 26, height: 26, borderRadius: 999, background: i === 0 ? 'var(--blue500)' : 'var(--grey100)', color: i === 0 ? 'var(--static-white)' : 'var(--text-muted)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4, marginTop: 2 }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        {[
          ['loading', 'KPI, featured card, 추천 카드 shape를 유지한 skeleton'],
          ['empty', '추천 매치 영역에 다음 행동 CTA와 필터 완화 안내 제공'],
          ['error', '추천 영역은 원인 + 재시도, 상단 활동 요약은 유지'],
          ['permission', '위치 권한 없이도 지역 직접 선택 흐름 제공'],
          ['pending', '추천 갱신 중 stale badge와 마지막 갱신 시각 표시'],
        ].map(([state, rule]) => (
          <Card key={state} pad={14} style={{ boxShadow: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div className="tab-num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue500)' }}>{state}</div>
              <div style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4, textAlign: 'right' }}>{rule}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  </div>
);

/* ── Match detail · refreshed using signatures ── */
const MatchDetailToss = () => {
  const m = MATCHES[0];
  return (
    <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <StatusBar/>
      <TopNav title="" transparent/>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Cover with overlay */}
        <div style={{
          height: 280,
          background: `linear-gradient(180deg, rgba(0,0,0,.05) 50%, rgba(0,0,0,.4) 100%), url(${m.img}) center/cover`,
          padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', color: 'var(--static-white)',
          marginTop: -92,
        }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: 11, padding: '4px 8px', background: 'rgba(255,255,255,0.2)', borderRadius: 4, fontWeight: 700, backdropFilter: 'blur(8px)' }}>축구 · 11vs11</span>
            <span style={{ fontSize: 11, padding: '4px 8px', background: 'var(--blue500)', borderRadius: 4, fontWeight: 700 }}>모집중</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 0, lineHeight: 1.3 }}>{m.title}</div>
        </div>

        {/* KPI strip */}
        <div style={{ background: 'var(--bg)', padding: '20px 20px 24px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, borderBottom: '8px solid var(--grey50)' }}>
          <KPIStat label="모집 인원" value={m.cur} unit={`/${m.max}`}/>
          <KPIStat label="참가비" value={m.fee} unit="원"/>
          <KPIStat label="평균 매너" value="4.8"/>
        </div>

        {/* Event info */}
        <div style={{ background: 'var(--bg)', padding: 20, borderBottom: '8px solid var(--grey50)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 12 }}>일시 · 장소</div>
          <ListItem
            leading={<div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--blue50)', color: 'var(--blue500)', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700 }}>5/3</div>}
            title="2026년 5월 3일 (토) 14:00"
            sub="3시간 진행 · 17:00 종료 예정"
          />
          <ListItem
            leading={<div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--green50)', color: 'var(--green500)', display: 'grid', placeItems: 'center' }}>
              <Icon name="pin" size={16}/>
            </div>}
            title="상암월드컵경기장 보조구장"
            sub="서울 마포구 성산동 · 6호선 월드컵경기장역 도보 5분"
            chev
          />
        </div>

        {/* Participants */}
        <div style={{ background: 'var(--bg)', padding: 20, borderBottom: '8px solid var(--grey50)' }}>
          <SectionTitle title="참가자" sub={`${m.cur}/${m.max}명 · 4명 더 모집 중`} action="전체보기"/>
          <div style={{ padding: '0 20px' }}>
            <StackedAvatars avatars={[IMG.av1, IMG.av2, IMG.av3, IMG.av4, IMG.av5, IMG.av6]} max={6} size={36}/>
          </div>
          <div style={{ padding: '16px 20px 0' }}>
            <StatBar label="포지션 채움" value={18} total={22} sub="GK 1, DF 6/8, MF 6/8, FW 5/5"/>
          </div>
        </div>

        {/* Fee breakdown using MoneyRow */}
        <div style={{ background: 'var(--bg)', padding: '20px', borderBottom: '8px solid var(--grey50)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4 }}>참가비 안내</div>
          <MoneyRow label="기본 참가비" amount={10000}/>
          <MoneyRow label="조끼 대여" amount={2000}/>
          <MoneyRow label="장소 대관 (분담)" amount={3000}/>
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 4 }}>
            <MoneyRow label="총 참가비" amount={15000} strong accent/>
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-caption)', fontWeight: 400 }}>
            경기 시작 24시간 전까지 100% 환불 가능
          </div>
        </div>

        {/* Host card */}
        <div style={{ background: 'var(--bg)', padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 12 }}>호스트</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: `url(${IMG.av1}) center/cover` }}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>김정민</div>
              <div className="tab-num" style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginTop: 2 }}>매너 4.9 · 호스팅 32회 · 노쇼 0%</div>
            </div>
            <button className="tm-pressable tm-break-keep" style={{ height: 32, padding: '0 14px', borderRadius: 8, background: 'var(--grey100)', border: 'none', fontSize: 12, fontWeight: 700, color: 'var(--text-strong)' }}>프로필</button>
          </div>
        </div>

        <div style={{ height: 100 }}/>
      </div>

      {/* Sticky CTA */}
      <div style={{ padding: '12px 20px 24px', background: 'var(--bg)', borderTop: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center' }}>
        <button className="tm-pressable tm-break-keep" style={{ width: 44, height: 52, borderRadius: 12, background: 'var(--grey100)', border: 'none', display: 'grid', placeItems: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-strong)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>
          </svg>
        </button>
        <button className="tm-pressable tm-break-keep" style={{ flex: 1, height: 52, borderRadius: 12, background: 'var(--blue500)', color: 'var(--static-white)', border: 'none', fontSize: 15, fontWeight: 700 }}>
          15,000원 · 참가하기
        </button>
      </div>
    </div>
  );
};

/* ── Wallet · Toss-style payment hub ── */
const WalletToss = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <TopNav title="결제 · 정산"/>
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 24 }}>
      {/* Hero balance */}
      <div style={{ padding: '20px 20px 28px', background: 'var(--bg)' }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>이번 달 사용</div>
        <NumberDisplay value={144000} unit="원" size={32} sub="지난달보다 -32,000원"/>

        <div style={{
          marginTop: 24, padding: '14px 16px', borderRadius: 12,
          background: 'var(--grey50)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>토스페이 잔액</div>
            <div className="tab-num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)', marginTop: 2 }}>26,500<span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>원</span></div>
          </div>
          <button className="tm-pressable tm-break-keep" style={{ height: 36, padding: '0 14px', borderRadius: 8, background: 'var(--blue500)', color: 'var(--static-white)', border: 'none', fontSize: 12, fontWeight: 700 }}>충전</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ background: 'var(--bg)', marginTop: 8, padding: '20px 16px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <KPIStat label="결제" value={12} unit="건"/>
        <KPIStat label="환불" value={1} unit="건"/>
        <KPIStat label="평균" value={12000} unit="원"/>
      </div>

      {/* Recent transactions */}
      <div style={{ marginTop: 8, background: 'var(--bg)', padding: '20px 0' }}>
        <SectionTitle title="최근 결제" action="더보기"/>
        {[
          { t: '주말 축구 한 판', d: '4/24 · 토스페이', a: -12000, st: 'paid' },
          { t: '풋살 레슨 5회권', d: '4/22 · 카드', a: -120000, st: 'paid' },
          { t: '환불: 평일 농구', d: '4/20 · 토스페이', a: 8000, st: 'refund' },
          { t: '시설 예약 (반포)', d: '4/18 · 카드', a: -25000, st: 'paid' },
          { t: '용병 매칭', d: '4/15 · 토스페이', a: -15000, st: 'paid' },
        ].map((tx, i) => (
          <ListItem
            key={i}
            leading={<div style={{
              width: 40, height: 40, borderRadius: 12,
              background: tx.st === 'refund' ? 'var(--green50)' : 'var(--blue50)',
              color: tx.st === 'refund' ? 'var(--green500)' : 'var(--blue500)',
              display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700,
            }}>{tx.st === 'refund' ? '↺' : '₩'}</div>}
            title={tx.t}
            sub={tx.d}
            trailing={
              <span className={"tab-num"} style={{
                fontSize: 14, fontWeight: 700,
                color: tx.a > 0 ? 'var(--green500)' : 'var(--text-strong)',
              }}>
                {tx.a > 0 ? '+' : ''}{tx.a.toLocaleString('ko-KR')}원
              </span>
            }
          />
        ))}
      </div>

      {/* Settlement (for hosts) */}
      <div style={{ marginTop: 8, background: 'var(--bg)', padding: '20px' }}>
        <SectionTitle title="정산 예정"/>
        <div style={{ padding: 16, borderRadius: 12, background: 'var(--blue50)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--blue500)', fontWeight: 700 }}>호스트 정산</div>
            <NumberDisplay value={86000} unit="원" size={22} sub="다음 정산일 5/1"/>
          </div>
          <button className="tm-pressable tm-break-keep" style={{ height: 36, padding: '0 16px', borderRadius: 8, background: 'var(--blue500)', color: 'var(--static-white)', border: 'none', fontSize: 12, fontWeight: 700 }}>내역</button>
        </div>
      </div>
    </div>
  </div>
);

/* ── Activity · using StatBar + KPIStat ── */
const ActivityToss = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <TopNav title="내 활동"/>
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 24 }}>
      {/* Profile mini */}
      <div style={{ background: 'var(--bg)', padding: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: `url(${IMG.av1}) center/cover` }}/>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)' }}>김정민</div>
          <div className="tab-num" style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginTop: 2 }}>축구 · 매너 4.9 · 가입 8개월</div>
        </div>
        <span style={{ fontSize: 11, padding: '4px 8px', background: 'var(--orange50)', color: 'var(--orange500)', borderRadius: 4, fontWeight: 700 }}>선출</span>
      </div>

      {/* This-month KPI */}
      <div style={{ background: 'var(--bg)', marginTop: 8, padding: '20px 16px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        <KPIStat label="이번 달 경기" value={12} unit="회" delta={3} deltaLabel="회"/>
        <KPIStat label="누적 경기" value={86} unit="회"/>
        <KPIStat label="평균 출석" value={96} unit="%" delta={4} deltaLabel="%p"/>
        <KPIStat label="MVP" value={2} unit="회" delta={1} deltaLabel="회"/>
      </div>

      {/* Skill bars */}
      <div style={{ background: 'var(--bg)', marginTop: 8, padding: 20 }}>
        <SectionTitle title="실력 지표" sub="동료들이 평가한 기준"/>
        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <StatBar label="피지컬" value={85} sub="동일 연령대 상위 12%"/>
          <StatBar label="기술" value={72} sub="평균 64"/>
          <StatBar label="협동심" value={94} sub="동일 연령대 상위 5%" color="var(--green500)"/>
          <StatBar label="매너" value={98} sub="98/100 · 상위 5%" color="var(--orange500)"/>
        </div>
      </div>

      {/* Badges row */}
      <div style={{ background: 'var(--bg)', marginTop: 8, padding: '20px 0' }}>
        <SectionTitle title="획득한 뱃지" action="전체"/>
        <div style={{ padding: '0 20px', display: 'flex', gap: 12, overflowX: 'auto' }}>
          {[
            { n: '첫 매치', c: 'var(--blue500)' },
            { n: '연속 10', c: 'var(--green500)' },
            { n: '매너왕', c: 'var(--orange500)' },
            { n: '주장', c: 'var(--red500)' },
          ].map((b, i) => (
            <div key={i} style={{ flexShrink: 0, textAlign: 'center', width: 70 }}>
              <div style={{
                width: 56, height: 56, margin: '0 auto 6px',
                borderRadius: '50%',
                background: b.c + '18',
                display: 'grid', placeItems: 'center',
              }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: b.c }}/>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-strong)' }}>{b.n}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

/* ── Empty state showcase ── */
const EmptyShowcase = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <TopNav title="빈 상태"/>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <EmptyState
        title="아직 참가한 매치가 없어요"
        sub="이번 주말 추천 매치가 5개 모집 중이에요. 한번 둘러볼까요?"
        cta="매치 둘러보기"
      />
      <div style={{ flex: 1, padding: 20, background: 'var(--grey50)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>SKELETON LOADING</div>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ background: 'var(--bg)', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
            <Skeleton w="60%" h={14} mb={10}/>
            <Skeleton w="80%" h={18} mb={12}/>
            <div style={{ display: 'flex', gap: 8 }}>
              <Skeleton w={60} h={20} r={10}/>
              <Skeleton w={80} h={20} r={10}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

Object.assign(window, {
  HomeToss, HomeTossCanonicalUiRules, HomeTossCanonicalFlowRules, MatchDetailToss, WalletToss, ActivityToss, EmptyShowcase,
});
