/* fix32 — M13 마이·프로필·평판 canonical rewrite.
   ID schema: m13-{mb|tb|dt}-{main|detail|flow|state|components|assets|motion}[-{sub}]
   Canonical references: MyPage, MyActivity, MyMatches, MyTeams, MyLessonTickets,
     Badges, MyProfileStateEdgeBoard, MyProfileBadgeReviewBoard,
     MyProfileControlInteractionBoard (read-only)
   Light-only. All tokens via var(--*). 0 raw hex / 0 inline fontSize. */

const M13_MB_W = 375;
const M13_MB_H = 812;
const M13_TB_W = 768;
const M13_TB_H = 1024;
const M13_DT_W = 1280;
const M13_DT_H = 820;

/* ---------- M13 local primitives (M13-prefixed to avoid scope collision) ---------- */

/** ELO-tier dot: gold / silver / bronze */
const M13EloDot = ({ tier = 'silver' }) => {
  const map = {
    gold:   { bg: 'var(--yellow500)', label: 'Gold',   text: 'var(--static-white)' },
    silver: { bg: 'var(--grey500)',   label: 'Silver', text: 'var(--static-white)' },
    bronze: { bg: 'var(--orange500)', label: 'Bronze', text: 'var(--static-white)' },
  };
  const t = map[tier] || map.silver;
  return (
    <span
      aria-label={`ELO 등급 ${t.label}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 'var(--r-pill)',
        background: t.bg, color: t.text,
      }}
      className="tm-text-micro"
    >
      {t.label}
    </span>
  );
};

/** Manner score row: label + bar + value */
const M13MannerRow = ({ label, score }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
    <div className="tm-text-caption" style={{ width: 80, flexShrink: 0, color: 'var(--text-muted)' }}>{label}</div>
    <div style={{ flex: 1, height: 4, background: 'var(--grey100)', borderRadius: 'var(--r-pill)', overflow: 'hidden' }}>
      <div style={{ width: (score / 5 * 100) + '%', height: '100%', background: 'var(--blue500)', borderRadius: 'var(--r-pill)' }}/>
    </div>
    <div className="tab-num tm-text-caption" style={{ fontWeight: 700, color: 'var(--text-strong)', width: 28, textAlign: 'right' }}>{score}</div>
  </div>
);

/** Review card: reviewer identity + scores + comment */
const M13ReviewCard = ({ reviewer, sport, manner, skill, comment, date, avatarKey }) => (
  <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--grey100)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: comment ? 8 : 0 }}>
      <div
        aria-hidden="true"
        style={{
          width: 32, height: 32, borderRadius: 16, flexShrink: 0,
          background: avatarKey ? `url(${IMG[avatarKey]}) center/cover` : 'var(--grey200)',
        }}
      />
      <div style={{ flex: 1 }}>
        <div className="tm-text-label">{reviewer}</div>
        <div className="tm-text-caption" style={{ color: 'var(--text-caption)', marginTop: 2 }}>{sport} · {date}</div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <span className="tm-text-micro" style={{ fontWeight: 600, color: 'var(--blue500)' }}>매너 {manner}</span>
        <span className="tm-text-micro" style={{ fontWeight: 600, color: 'var(--orange500)' }}>실력 {skill}</span>
      </div>
    </div>
    {comment && (
      <div className="tm-text-body" style={{ color: 'var(--text)', lineHeight: 1.5 }}>{comment}</div>
    )}
  </div>
);

/** Ticket card: lesson ticket with progress */
const M13TicketCard = ({ coach, lesson, left, total, exp, active, coachImg }) => {
  const pct = total ? (left / total) * 100 : 0;
  return (
    <div style={{
      background: active ? 'var(--bg)' : 'var(--grey50)',
      borderRadius: 14, padding: 16, marginBottom: 8,
      border: '1px solid var(--grey100)', opacity: active ? 1 : 0.6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: active ? 12 : 0 }}>
        <div
          aria-hidden="true"
          style={{
            width: 40, height: 40, borderRadius: 20, flexShrink: 0,
            background: coachImg ? `url(${coachImg}) center/cover` : 'var(--grey200)',
          }}
        />
        <div style={{ flex: 1 }}>
          <div className="tm-text-label">{lesson}</div>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2 }}>{coach}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="tab-num tm-text-body-lg" style={{ fontWeight: 700, color: active ? 'var(--text-strong)' : 'var(--text-muted)' }}>
            {left}<span className="tm-text-caption" style={{ fontWeight: 500, color: 'var(--text-muted)' }}>/{total}</span>
          </div>
          <div className="tm-text-micro" style={{ fontWeight: 600, color: active ? 'var(--green500)' : 'var(--text-muted)', marginTop: 2 }}>
            {active ? '사용중' : '만료'}
          </div>
        </div>
      </div>
      {active && <Progress value={pct} max={100}/>}
      <div className="tab-num tm-text-micro" style={{ color: 'var(--text-caption)', marginTop: active ? 8 : 0 }}>만료일 {exp}</div>
    </div>
  );
};

/** Profile stats pill: label + value + optional color accent */
const M13StatPill = ({ label, value, accent = 'var(--text-strong)' }) => (
  <div style={{
    flex: 1, textAlign: 'center', padding: '12px 8px',
    borderRadius: 'var(--r-md)', background: 'var(--bg)',
    border: '1px solid var(--grey100)',
  }}>
    <div className="tm-text-micro" style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
    <div className="tab-num tm-text-body-lg" style={{ fontWeight: 700, color: accent }}>{value}</div>
  </div>
);

/** Trust-tone badge tile: earned / locked */
const M13BadgeTile = ({ color, label, earned, trustTone }) => {
  const tierColors = { gold: 'var(--yellow500)', silver: 'var(--grey500)', bronze: 'var(--orange500)' };
  const bg = earned ? (tierColors[trustTone] || 'var(--blue50)') : 'var(--grey100)';
  const border = earned ? (tierColors[trustTone] ? 'transparent' : 'var(--grey200)') : 'transparent';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: earned ? 1 : 0.35 }}>
      <div
        aria-hidden="true"
        style={{
          width: 52, height: 52, borderRadius: 16,
          background: bg, border: `1.5px solid ${border}`,
          display: 'grid', placeItems: 'center',
        }}
      >
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: earned ? 'rgba(255,255,255,0.55)' : 'var(--grey300)' }}/>
      </div>
      <div className="tm-text-micro" style={{ color: earned ? 'var(--text)' : 'var(--text-muted)', textAlign: 'center', maxWidth: 52 }}>{label}</div>
    </div>
  );
};

/* ---------- m13-mb-main: MyPage canonical ---------- */
const M13MobileMain = () => <MyPage/>;

/* ---------- m13-tb-main: 태블릿 2-col ---------- */
const M13TabletMain = () => (
  <div style={{ width: M13_TB_W, height: M13_TB_H, background: 'var(--bg-surface)', fontFamily: 'var(--font)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    {/* Top bar */}
    <div style={{ padding: '20px 32px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div className="tm-text-subhead">마이</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="알림"><Icon name="bell" size={18}/></button>
        <button className="tm-btn tm-btn-secondary tm-btn-md">프로필 수정</button>
      </div>
    </div>

    {/* 2-col */}
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '280px 1fr', overflow: 'hidden' }}>
      {/* Left: profile summary */}
      <div style={{ borderRight: '1px solid var(--grey100)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: 40, background: `var(--grey100) url(${IMG.av1}) center/cover`, margin: '0 auto', border: '3px solid var(--bg)', boxShadow: 'var(--sh-1)' }} aria-hidden="true"/>
          <div className="tm-text-body-lg" style={{ marginTop: 12 }}>정민</div>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 4 }}>강남구 · 신논현동</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 8 }}>
            <Badge tone="blue" size="sm">축구</Badge>
            <Badge tone="grey" size="sm">풋살</Badge>
          </div>
        </div>
        {/* Stats row */}
        <div style={{ display: 'flex', gap: 8, padding: 8, background: 'var(--grey50)', borderRadius: 14 }}>
          {[['매치', 23], ['팀', 2], ['리뷰', 18]].map(([k, v]) => (
            <div key={k} style={{ flex: 1, textAlign: 'center', padding: '10px 0', background: 'var(--bg)', border: '1px solid var(--grey100)', borderRadius: 10 }}>
              <div className="tab-num tm-text-body-lg" style={{ fontWeight: 800, color: 'var(--text-strong)' }}>{v}</div>
              <div className="tm-text-micro" style={{ color: 'var(--text-muted)', marginTop: 2 }}>{k}</div>
            </div>
          ))}
        </div>
        {/* Badges teaser */}
        <div style={{ padding: '12px 0', borderTop: '1px solid var(--grey100)' }}>
          <div className="tm-text-label" style={{ marginBottom: 10 }}>획득 뱃지</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {[
              { label: '첫매치', earned: true, trustTone: 'silver' },
              { label: '매너왕', earned: true, trustTone: 'gold' },
              { label: '연속출석', earned: false, trustTone: 'bronze' },
              { label: '베테랑', earned: false, trustTone: 'silver' },
            ].map((b) => <M13BadgeTile key={b.label} {...b}/>)}
          </div>
        </div>
      </div>

      {/* Right: activity */}
      <div style={{ padding: 24, overflowY: 'auto' }}>
        <MyNav active="matches"/>
        <div style={{ marginTop: 16 }}>
          <SectionTitle title="최근 매치 활동"/>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {MATCHES.slice(0, 3).map((m, i) => (
              <Card key={m.id} interactive pad={14}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      <Badge tone="blue" size="sm">{m.sport}</Badge>
                      <Badge tone={i === 0 ? 'green' : i === 1 ? 'orange' : 'grey'} size="sm">{i === 0 ? '확정' : i === 1 ? '대기' : '완료'}</Badge>
                    </div>
                    <div className="tm-text-body-lg">{m.title}</div>
                    <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 4 }}>{m.date} · {m.time} · {m.venue}</div>
                  </div>
                  <Icon name="chevR" size={16} color="var(--grey400)" aria-hidden="true"/>
                </div>
              </Card>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 20 }}>
          <SectionTitle title="최근 리뷰"/>
          <Card pad={0}>
            <M13ReviewCard reviewer="김수아" sport="풋살" manner="5.0" skill="4.5" comment="패스가 정말 세련됐어요!" date="4/20" avatarKey="av2"/>
            <M13ReviewCard reviewer="박지훈" sport="축구" manner="4.8" skill="4.0" comment="팀플레이가 좋았어요." date="4/18" avatarKey="av3"/>
          </Card>
        </div>
      </div>
    </div>
  </div>
);

/* ---------- m13-dt-main: 데스크탑 3-col ---------- */
const M13DesktopMain = () => (
  <div style={{ width: M13_DT_W, height: M13_DT_H, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'grid', gridTemplateColumns: '240px 1fr 320px' }}>
    {/* Left sidebar */}
    <aside style={{ borderRight: '1px solid var(--grey100)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontWeight: 800 }} aria-hidden="true">T</div>
        <div className="tm-text-body-lg">Teameet</div>
      </div>
      <nav style={{ display: 'grid', gap: 4 }} aria-label="메인 내비게이션">
        {[['홈', false], ['매치', false], ['팀', false], ['장터', false], ['마이', true]].map(([l, a]) => (
          <button key={l} className={`tm-btn tm-btn-md ${a ? 'tm-btn-secondary' : 'tm-btn-ghost'}`} style={{ justifyContent: 'flex-start' }}>{l}</button>
        ))}
      </nav>
      <div style={{ marginTop: 'auto', padding: '12px 0', borderTop: '1px solid var(--grey100)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 18, background: `var(--grey100) url(${IMG.av1}) center/cover`, flexShrink: 0 }} aria-hidden="true"/>
          <div>
            <div className="tm-text-label">정민</div>
            <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>강남구</div>
          </div>
        </div>
      </div>
    </aside>

    {/* Center: activity list */}
    <main style={{ padding: 32, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div className="tm-text-heading" style={{ marginBottom: 4 }}>내 활동</div>
        <div className="tm-text-body" style={{ color: 'var(--text-muted)' }}>전체 23건 · 이번 달 3건</div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {['전체', '매치', '팀', '수강권', '장터'].map((l, i) => <Chip key={l} active={i === 0}>{l}</Chip>)}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {MATCHES.slice(0, 4).map((m, i) => (
          <Card key={m.id} interactive pad={14}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <Badge tone="blue" size="sm">{m.sport}</Badge>
                  <Badge tone={i === 0 ? 'green' : i === 1 ? 'orange' : 'grey'} size="sm">{i === 0 ? '확정' : i === 1 ? '대기' : '완료'}</Badge>
                </div>
                <div className="tm-text-body-lg">{m.title}</div>
                <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 4 }}>{m.date} · {m.time} · {m.venue}</div>
              </div>
              <Icon name="chevR" size={16} color="var(--grey400)" aria-hidden="true"/>
            </div>
          </Card>
        ))}
      </div>
    </main>

    {/* Right: profile panel */}
    <aside style={{ borderLeft: '1px solid var(--grey100)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: 36, background: `var(--grey100) url(${IMG.av1}) center/cover`, margin: '0 auto', border: '3px solid var(--bg)', boxShadow: 'var(--sh-1)' }} aria-hidden="true"/>
        <div className="tm-text-body-lg" style={{ marginTop: 10 }}>정민</div>
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2 }}>강남구 · 신논현동</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 8 }}>
          <M13EloDot tier="silver"/>
        </div>
      </div>
      {/* Stat pills */}
      <div style={{ display: 'flex', gap: 6, padding: 8, background: 'var(--grey50)', borderRadius: 14 }}>
        <M13StatPill label="매너" value="4.9" accent="var(--blue500)"/>
        <M13StatPill label="매치" value="23" accent="var(--text-strong)"/>
        <M13StatPill label="뱃지" value="6" accent="var(--orange500)"/>
      </div>
      {/* Badge inventory */}
      <div>
        <div className="tm-text-label" style={{ marginBottom: 10 }}>획득 뱃지</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: '첫매치',    earned: true,  trustTone: 'silver' },
            { label: '매너왕',    earned: true,  trustTone: 'gold' },
            { label: '연속출석',  earned: true,  trustTone: 'bronze' },
            { label: '베테랑',    earned: false, trustTone: 'silver' },
            { label: '리그우승',  earned: false, trustTone: 'gold' },
          ].map((b) => <M13BadgeTile key={b.label} {...b}/>)}
        </div>
      </div>
      <button className="tm-btn tm-btn-secondary tm-btn-md tm-btn-block">프로필 수정</button>
    </aside>
  </div>
);

/* ---------- m13-mb-detail: 프로필 상세 (상태·뱃지·리뷰 combined)
   Canonical: MyProfileStateEdgeBoard 구조 + Badges 뱃지 그리드 + reviews ---------- */
const M13MobileDetail = () => (
  <Phone>
    <div style={{ flex: 1, overflow: 'auto' }}>
      <TopNav title="프로필 상세"/>

      {/* Hero section: avatar + identity */}
      <div style={{ padding: '20px 20px 16px', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div
          aria-label="프로필 사진"
          style={{ width: 80, height: 80, borderRadius: 40, background: `var(--grey100) url(${IMG.av2}) center/cover`, border: '3px solid var(--bg)', boxShadow: 'var(--sh-2)' }}
        />
        <div className="tm-text-body-lg">김수아</div>
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>서초구 · 잠원동</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <Badge tone="blue" size="sm">풋살</Badge>
          <Badge tone="grey" size="sm">배드민턴</Badge>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <M13EloDot tier="silver"/>
          <Badge tone="grey" size="sm">검증됨</Badge>
        </div>
        <button className="tm-btn tm-btn-secondary tm-btn-sm" style={{ marginTop: 4, minHeight: 44 }} aria-label="1:1 채팅 시작">
          <Icon name="chat" size={14} aria-hidden="true"/> 1:1 채팅
        </button>
      </div>

      {/* ELO + Manner scores */}
      <div style={{ margin: '8px 20px', background: 'var(--bg)', border: '1px solid var(--grey100)', borderRadius: 14, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="tm-text-label">매너 점수</div>
          <div className="tab-num tm-text-heading" style={{ fontWeight: 700, color: 'var(--blue500)' }}>4.9</div>
        </div>
        {[
          ['시간 약속', 4.9],
          ['팀워크', 5.0],
          ['페어플레이', 4.8],
          ['커뮤니케이션', 4.9],
          ['경기 후 매너', 5.0],
        ].map(([cat, score]) => <M13MannerRow key={cat} label={cat} score={score}/>)}
      </div>

      {/* Trust sub-indicators */}
      <div style={{ margin: '0 20px 8px', background: 'var(--bg)', border: '1px solid var(--grey100)', borderRadius: 14, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div className="tm-text-label">신뢰 점수</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <div className="tab-num tm-text-heading" style={{ fontWeight: 700, color: 'var(--green500)' }}>87</div>
            <div className="tm-text-caption">/100</div>
          </div>
        </div>
        <Progress value={87} max={100}/>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
          {[
            { label: '매치 완주율', value: '96%' },
            { label: '리뷰 응답률', value: '100%' },
            { label: '노쇼 횟수', value: '0회' },
            { label: '활동 기간', value: '14개월' },
          ].map(({ label, value }) => (
            <div key={label} style={{ padding: '8px 10px', background: 'var(--grey50)', borderRadius: 8 }}>
              <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{label}</div>
              <div className="tab-num tm-text-label" style={{ fontWeight: 700, color: 'var(--text-strong)', marginTop: 2 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Badge grid — trust-tone visual (gold/silver/bronze) */}
      <div style={{ margin: '0 20px 8px', background: 'var(--bg)', border: '1px solid var(--grey100)', borderRadius: 14, padding: 16 }}>
        <KPIStat label="획득 뱃지" value={6}/>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
          {[
            { label: '첫매치',    earned: true,  trustTone: 'silver' },
            { label: '매너왕',    earned: true,  trustTone: 'gold' },
            { label: '연속출석',  earned: true,  trustTone: 'bronze' },
            { label: '베테랑',    earned: false, trustTone: 'silver' },
            { label: '리그우승',  earned: false, trustTone: 'gold' },
            { label: '개근상',    earned: true,  trustTone: 'silver' },
            { label: '팀캡틴',    earned: true,  trustTone: 'bronze' },
            { label: 'MVP',       earned: false, trustTone: 'gold' },
          ].map((b) => <M13BadgeTile key={b.label} {...b}/>)}
        </div>
      </div>

      {/* Reviews received */}
      <div style={{ margin: '0 20px 20px' }}>
        <SectionTitle title="받은 리뷰" action="전체보기"/>
        <Card pad={0}>
          <M13ReviewCard reviewer="이민정" sport="배드민턴" manner="5.0" skill="4.8" comment="복식 파트너로 최고였어요. 다음에도 꼭 같이 하고 싶어요." date="4/22" avatarKey="av4"/>
          <M13ReviewCard reviewer="박준수" sport="풋살" manner="4.9" skill="4.5" comment="패스와 위치 선정이 탁월해요!" date="4/18" avatarKey="av3"/>
        </Card>
      </div>
    </div>
  </Phone>
);

/* ---------- m13-mb-flow-mymatches: 내 매치 list — MyMatches canonical ---------- */
const M13MobileFlowMyMatches = () => <MyMatches/>;

/* ---------- m13-mb-flow-myteams: 내 팀 list — MyTeams canonical ---------- */
const M13MobileFlowMyTeams = () => <MyTeams/>;

/* ---------- m13-mb-flow-reviews-received: 받은 리뷰 — MyActivity wireframe + review data ---------- */
const M13MobileFlowReviewsReceived = () => (
  <Phone>
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <TopNav title="받은 리뷰"/>

      {/* Summary stats — KPIStat row */}
      <div style={{ padding: '12px 20px 8px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
        <div style={{ display: 'flex', gap: 8, padding: 8, background: 'var(--grey50)', borderRadius: 14 }}>
          {[['매너 평균', '4.9', 'var(--blue500)'], ['실력 평균', '4.5', 'var(--orange500)'], ['총 리뷰', '18', 'var(--text-strong)']].map(([label, value, accent]) => (
            <div key={label} style={{ flex: 1, textAlign: 'center', padding: '10px 0', background: 'var(--bg)', border: '1px solid var(--grey100)', borderRadius: 10 }}>
              <div className="tab-num tm-text-body-lg" style={{ fontWeight: 800, color: accent }}>{value}</div>
              <div className="tm-text-micro" style={{ color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sport filter chips */}
      <div style={{ padding: '10px 20px', display: 'flex', gap: 6, overflowX: 'auto', borderBottom: '1px solid var(--grey100)' }}>
        {['전체', '풋살', '축구', '배드민턴'].map((s, i) => (
          <HapticChip key={s} active={i === 0}>{s}</HapticChip>
        ))}
      </div>

      {/* Review list */}
      <div style={{ padding: '12px 20px 24px', flex: 1 }}>
        <Card pad={0}>
          {[
            { reviewer: '이민정', sport: '배드민턴', manner: '5.0', skill: '4.8', comment: '복식 파트너로 최고였어요!', date: '4/22', avatarKey: 'av4' },
            { reviewer: '박준수', sport: '풋살',     manner: '4.9', skill: '4.5', comment: '패스와 위치 선정이 탁월해요.', date: '4/18', avatarKey: 'av3' },
            { reviewer: '김지훈', sport: '축구',     manner: '5.0', skill: '4.2', comment: null, date: '4/15', avatarKey: 'av5' },
            { reviewer: '최수아', sport: '풋살',     manner: '4.8', skill: '4.7', comment: '다음에도 꼭 같이 해요!', date: '4/10', avatarKey: 'av6' },
          ].map((r) => <M13ReviewCard key={r.reviewer + r.date} {...r}/>)}
        </Card>
      </div>
    </div>
  </Phone>
);

/* ---------- m13-mb-flow-tickets: 수강권 — MyLessonTickets canonical ---------- */
const M13MobileFlowTickets = () => <MyLessonTickets/>;

/* ---------- m13-mb-state-loading: MyPage wireframe + Skeleton ---------- */
const M13MobileStateLoading = () => (
  <Phone>
    <div style={{ flex: 1, padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* AppBar skeleton */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton w={80} h={28} r={8}/>
        <Skeleton w={36} h={36} r={8}/>
      </div>
      {/* Profile hero skeleton */}
      <div style={{ padding: 20, border: '1px solid var(--grey100)', borderRadius: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <Skeleton w={68} h={68} r={34}/>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton w="60%" h={20} r={6}/>
            <Skeleton w="40%" h={14} r={4}/>
          </div>
          <Skeleton w={56} h={32} r={8}/>
        </div>
        {/* Stats row skeleton */}
        <div style={{ display: 'flex', gap: 8, padding: 8, background: 'var(--grey50)', borderRadius: 14 }}>
          {[0,1,2].map((i) => <Skeleton key={i} w="33%" h={52} r={10}/>)}
        </div>
      </div>
      {/* Menu group skeleton */}
      <Skeleton w="30%" h={16} r={4}/>
      <div style={{ borderRadius: 14, border: '1px solid var(--grey100)', overflow: 'hidden' }}>
        {[0,1,2,3,4].map((i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: i < 4 ? '1px solid var(--grey100)' : 'none' }}>
            <Skeleton w={36} h={36} r={10}/>
            <Skeleton w="50%" h={16} r={4}/>
          </div>
        ))}
      </div>
      <Skeleton w="30%" h={16} r={4}/>
      <div style={{ borderRadius: 14, border: '1px solid var(--grey100)', overflow: 'hidden' }}>
        {[0,1,2].map((i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: i < 2 ? '1px solid var(--grey100)' : 'none' }}>
            <Skeleton w={36} h={36} r={10}/>
            <Skeleton w="45%" h={16} r={4}/>
          </div>
        ))}
      </div>
    </div>
    <BottomNav active="my"/>
  </Phone>
);

/* ---------- m13-mb-state-empty: 아직 활동 없음 — MyPage layout + EmptyState ---------- */
const M13MobileStateEmpty = () => (
  <Phone>
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* AppBar */}
      <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--grey100)' }}>
        <div className="tm-text-subhead">마이</div>
        <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="메뉴"><Icon name="menu" size={20} aria-hidden="true"/></button>
      </div>

      {/* Profile summary (신규 회원 — no scores) */}
      <div style={{ padding: 20, background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 68, height: 68, borderRadius: 34, background: 'var(--grey100)', display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }} aria-label="프로필 사진 없음" role="img">
            <Icon name="people" size={28} aria-hidden="true"/>
          </div>
          <div style={{ flex: 1 }}>
            <div className="tm-text-body-lg">신규 회원</div>
            <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2 }}>가입일 2026.04.26</div>
          </div>
          <button className="tm-btn tm-btn-secondary tm-btn-sm" style={{ minHeight: 44 }}>프로필 설정</button>
        </div>
        {/* Stats row — dashes for new users */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, padding: 8, background: 'var(--grey50)', borderRadius: 14 }}>
          {[['매치', '—'], ['팀', '—'], ['리뷰', '—']].map(([k, v]) => (
            <div key={k} style={{ flex: 1, textAlign: 'center', padding: '10px 0', background: 'var(--bg)', border: '1px solid var(--grey100)', borderRadius: 10 }}>
              <div className="tab-num tm-text-body-lg" style={{ fontWeight: 800, color: 'var(--text-caption)' }}>{v}</div>
              <div className="tm-text-micro" style={{ color: 'var(--text-muted)', marginTop: 2 }}>{k}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Empty state body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 32px 60px' }}>
        <EmptyState
          icon={<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
          title="아직 활동 내역이 없어요"
          sub="첫 매치에 참가하면 매너 점수와 뱃지가 쌓여요"
          cta="매치 둘러보기"
        />
      </div>
    </div>
    <BottomNav active="my"/>
  </Phone>
);

/* ---------- m13-mb-state-error: 프로필 로드 실패 — ErrorState pattern ---------- */
const M13MobileStateError = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <TopNav title="마이"/>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: 16, textAlign: 'center' }}>
        <div
          style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--red50)', color: 'var(--red500)', display: 'grid', placeItems: 'center' }}
          aria-hidden="true"
        >
          <Icon name="xCircle" size={28}/>
        </div>
        <div className="tm-text-heading">프로필을 불러올 수 없어요</div>
        <div className="tm-text-body" style={{ color: 'var(--text-muted)' }}>
          네트워크가 불안정해요. 잠시 후 다시 시도해주세요.
        </div>
        <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" style={{ marginTop: 8, minHeight: 44 }}>
          다시 시도
        </button>
        <Toast type="error" msg="프로필 데이터를 가져오지 못했어요"/>
      </div>
    </div>
    <BottomNav active="my"/>
  </Phone>
);

/* ---------- m13-mb-components: 사용 컴포넌트 인벤토리 ---------- */
const M13ComponentsBoard = ({ viewport = 'mb' }) => {
  const w = viewport === 'mb' ? M13_MB_W : viewport === 'tb' ? M13_TB_W : M13_DT_W;
  const h = viewport === 'mb' ? M13_MB_H : viewport === 'tb' ? M13_TB_H : M13_DT_H;
  const label = { mb: '모바일', tb: '태블릿', dt: '데스크탑' }[viewport];

  /** Local swatch helper (M13-scoped) */
  const M13Swatch = ({ title, children }) => (
    <div style={{ marginBottom: 12 }}>
      <div className="tm-text-micro" style={{ color: 'var(--text-muted)', marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>{children}</div>
    </div>
  );

  return (
    <div style={{ width: w, height: h, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflow: 'hidden' }}>
      <Badge tone="blue" size="sm">{`m13-${viewport}-components`}</Badge>
      <div className="tm-text-title" style={{ marginTop: 8 }}>M13 {label} · 사용 컴포넌트</div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>마이·프로필·평판 화면이 사용하는 production primitive 인벤토리</div>

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        {/* Avatar */}
        <M13Swatch title="Avatar · 80 / 68 / 36">
          {[80, 68, 36].map((sz) => (
            <div key={sz} style={{ width: sz, height: sz, borderRadius: sz, background: `var(--grey100) url(${IMG.av1}) center/cover`, border: '2px solid var(--bg)', boxShadow: 'var(--sh-1)', flexShrink: 0 }} aria-label={`아바타 ${sz}px`}/>
          ))}
        </M13Swatch>

        {/* ELO dot */}
        <M13Swatch title="M13EloDot · 등급 표시 (gold / silver / bronze)">
          <M13EloDot tier="gold"/>
          <M13EloDot tier="silver"/>
          <M13EloDot tier="bronze"/>
        </M13Swatch>

        {/* KPIStat */}
        <M13Swatch title="KPIStat · 요약 수치">
          <KPIStat label="리뷰" value={18}/>
          <KPIStat label="평점" value="4.9"/>
          <KPIStat label="뱃지" value={6}/>
        </M13Swatch>

        {/* Badge */}
        <M13Swatch title="Badge · 종목 / 상태">
          <Badge tone="blue" size="sm">축구</Badge>
          <Badge tone="grey" size="sm">풋살</Badge>
          <Badge tone="green" size="sm">검증됨</Badge>
          <Badge tone="orange" size="sm">추정치</Badge>
        </M13Swatch>

        {/* Trust-tone badge tiles */}
        <M13Swatch title="M13BadgeTile · gold / silver / bronze trust tone">
          <M13BadgeTile label="매너왕" earned={true} trustTone="gold"/>
          <M13BadgeTile label="첫매치" earned={true} trustTone="silver"/>
          <M13BadgeTile label="개근상" earned={true} trustTone="bronze"/>
          <M13BadgeTile label="베테랑" earned={false} trustTone="silver"/>
        </M13Swatch>

        {/* Manner bar */}
        <M13Swatch title="M13MannerRow · 매너 항목별 바">
          <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 0 }}>
            <M13MannerRow label="팀워크" score={5.0}/>
            <M13MannerRow label="시간 약속" score={4.9}/>
            <M13MannerRow label="페어플레이" score={3.2}/>
          </div>
        </M13Swatch>

        {/* Progress */}
        <M13Swatch title="Progress · 신뢰 점수 / 수강권 잔여">
          <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Progress value={87} max={100}/>
            <Progress value={30} max={100} urgent/>
          </div>
        </M13Swatch>

        {/* Review card */}
        <M13Swatch title="M13ReviewCard · 받은 리뷰">
          <div style={{ width: '100%', border: '1px solid var(--grey100)', borderRadius: 12 }}>
            <M13ReviewCard reviewer="이민정" sport="배드민턴" manner="5.0" skill="4.8" comment="복식 파트너로 최고였어요!" date="4/22" avatarKey="av4"/>
          </div>
        </M13Swatch>

        {/* Ticket card */}
        <M13Swatch title="M13TicketCard · 수강권 (active / expired)">
          <div style={{ width: '100%' }}>
            <M13TicketCard coach="박준수 코치" lesson="1:1 맞춤 축구" left={6} total={8} exp="2026-06-12" active={true} coachImg={IMG.coach1}/>
            <M13TicketCard coach="최현우 코치" lesson="농구 슛 원데이" left={0} total={1} exp="2026-03-10" active={false} coachImg={IMG.coach4}/>
          </div>
        </M13Swatch>

        {/* EmptyState */}
        <M13Swatch title="EmptyState · 활동 없음">
          <div style={{ width: 240 }}>
            <EmptyState title="활동 내역이 없어요" sub="첫 매치에 참가해보세요" cta="매치 보기"/>
          </div>
        </M13Swatch>
      </div>
    </div>
  );
};

/* ---------- m13-mb-assets: 사용 토큰 인벤토리 ---------- */
const M13AssetsBoard = ({ viewport = 'mb' }) => {
  const w = viewport === 'mb' ? M13_MB_W : viewport === 'tb' ? M13_TB_W : M13_DT_W;
  const h = viewport === 'mb' ? M13_MB_H : viewport === 'tb' ? M13_TB_H : M13_DT_H;
  const label = { mb: '모바일', tb: '태블릿', dt: '데스크탑' }[viewport];

  const M13ColorSwatch = ({ token, value }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: value, border: '1px solid var(--grey100)' }}/>
      <div className="tm-text-micro" style={{ color: 'var(--text-muted)', textAlign: 'center', maxWidth: 64 }}>{token}</div>
    </div>
  );

  const M13AssetRow = ({ label: rowLabel, children }) => (
    <div style={{ marginBottom: 16 }}>
      <div className="tm-text-micro" style={{ color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>{rowLabel}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>{children}</div>
    </div>
  );

  return (
    <div style={{ width: w, height: h, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflow: 'hidden' }}>
      <Badge tone="blue" size="sm">{`m13-${viewport}-assets`}</Badge>
      <div className="tm-text-title" style={{ marginTop: 8 }}>M13 {label} · 디자인 토큰</div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>마이·프로필·평판 화면이 실제로 쓰는 토큰 인벤토리</div>

      <div style={{ marginTop: 16 }}>
        <M13AssetRow label="Color · brand + semantic">
          <M13ColorSwatch token="blue500" value="var(--blue500)"/>
          <M13ColorSwatch token="blue50" value="var(--blue50)"/>
          <M13ColorSwatch token="green500" value="var(--green500)"/>
          <M13ColorSwatch token="green50" value="var(--green50)"/>
          <M13ColorSwatch token="orange500" value="var(--orange500)"/>
          <M13ColorSwatch token="red500" value="var(--red500)"/>
        </M13AssetRow>

        <M13AssetRow label="Color · trust tones (gold / silver / bronze)">
          <M13ColorSwatch token="gold → yellow500" value="var(--yellow500)"/>
          <M13ColorSwatch token="silver → grey500" value="var(--grey500)"/>
          <M13ColorSwatch token="bronze → orange500" value="var(--orange500)"/>
        </M13AssetRow>

        <M13AssetRow label="Color · score accent">
          <M13ColorSwatch token="manner → blue500" value="var(--blue500)"/>
          <M13ColorSwatch token="trust → green500" value="var(--green500)"/>
          <M13ColorSwatch token="badge → orange500" value="var(--orange500)"/>
        </M13AssetRow>

        <M13AssetRow label="Color · neutral surface">
          <M13ColorSwatch token="grey50" value="var(--grey50)"/>
          <M13ColorSwatch token="grey100" value="var(--grey100)"/>
          <M13ColorSwatch token="grey200" value="var(--grey200)"/>
          <M13ColorSwatch token="grey900" value="var(--grey900)"/>
        </M13AssetRow>

        <M13AssetRow label="Type scale · 사용 단계">
          <span className="tm-text-heading">heading</span>
          <span className="tm-text-subhead">subhead</span>
          <span className="tm-text-body-lg">body-lg</span>
          <span className="tm-text-body">body</span>
          <span className="tm-text-label">label</span>
          <span className="tm-text-caption">caption</span>
          <span className="tm-text-micro">micro</span>
        </M13AssetRow>

        <M13AssetRow label="Spacing · 4-multiple">
          {[4, 8, 12, 14, 16, 20, 24, 32].map((n) => (
            <Badge key={n} tone="grey" size="sm">{n}px</Badge>
          ))}
        </M13AssetRow>

        <M13AssetRow label="Radius">
          <Badge tone="grey" size="sm">r-sm (8) · 상태 chip</Badge>
          <Badge tone="grey" size="sm">r-md (12) · review card</Badge>
          <Badge tone="grey" size="sm">r-lg (16) · 수강권/배지 패널</Badge>
          <Badge tone="grey" size="sm">r-pill · ELO dot</Badge>
          <Badge tone="grey" size="sm">r-full · 아바타</Badge>
        </M13AssetRow>

        <M13AssetRow label="Motion · 사용 토큰">
          <Badge tone="grey" size="sm">dur-fast 120ms · tap scale</Badge>
          <Badge tone="grey" size="sm">ease-out-quart · badge unlock</Badge>
          <Badge tone="grey" size="sm">Progress width 300ms · ease-out-quint</Badge>
          <Badge tone="grey" size="sm">count-up 600ms · ELO pulse</Badge>
        </M13AssetRow>
      </div>
    </div>
  );
};

/* ---------- m13-tb-components: 태블릿 컴포넌트 보드 ---------- */
const M13TabletComponents = () => <M13ComponentsBoard viewport="tb"/>;

/* ---------- m13-mb-motion: 모션 계약 ---------- */
const M13MotionBoard = () => (
  <div style={{ width: M13_MB_W, height: M13_MB_H, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)' }}>
    <Badge tone="blue" size="sm">m13-mb-motion</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M13 모바일 · motion contract</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>마이·프로필·평판에서 사용하는 micro-interaction 규칙</div>
    <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
      <ListItem
        title="Badge unlock"
        sub="새 뱃지 획득 → scale(.85)→(1.05)→(1.0) · 400ms · ease-out-quart + trust-tone glow"
        trailing={<Badge tone="orange" size="sm">badge</Badge>}
      />
      <ListItem
        title="ELO pulse"
        sub="등급 변경 → dot scale(1.0)→(1.2)→(1.0) · 500ms + tier 색 flash"
        trailing={<Badge tone="grey" size="sm">pulse</Badge>}
      />
      <ListItem
        title="Score count-up"
        sub="매너 점수 hero → 0.0→4.9 · 600ms · ease-out-expo (page enter)"
        trailing={<Badge tone="blue" size="sm">count</Badge>}
      />
      <ListItem
        title="Review reveal"
        sub="리뷰 카드 등장 → translateY(16px)→0 + opacity 0→1 · stagger 80ms per card"
        trailing={<Badge tone="grey" size="sm">reveal</Badge>}
      />
      <ListItem
        title="Ticket flip"
        sub="수강권 만료 → rotateY(0→180deg) · 360ms · preserve-3d (front: 잔여, back: 만료)"
        trailing={<Badge tone="grey" size="sm">flip</Badge>}
      />
      <ListItem
        title="Progress bar fill"
        sub="신뢰/수강권 프로그레스 → width 0→N% · 300ms · ease-out-quint (page enter)"
        trailing={<Badge tone="blue" size="sm">bar</Badge>}
      />
      <ListItem
        title="Tab underline slide"
        sub="예정/지난/취소 탭 전환 → underline translateX · 200ms · ease-out"
        trailing={<Badge tone="grey" size="sm">tab</Badge>}
      />
      <ListItem
        title="Skeleton shimmer"
        sub="프로필 로딩 → 1.4s linear infinite shimmer (bg 200% gradient)"
        trailing={<Badge tone="grey" size="sm">load</Badge>}
      />
      <ListItem
        title="Reduced motion"
        sub="prefers-reduced-motion → 모든 transform/transition 0.01ms, 즉시 expanded"
        trailing={<Badge tone="grey" size="sm">a11y</Badge>}
      />
    </div>
  </div>
);

/* ---------- window exports ---------- */
Object.assign(window, {
  M13MobileMain,
  M13TabletMain,
  M13DesktopMain,
  M13MobileDetail,
  M13MobileFlowMyMatches,
  M13MobileFlowMyTeams,
  M13MobileFlowTickets,
  M13MobileFlowReviewsReceived,
  M13MobileStateLoading,
  M13MobileStateEmpty,
  M13MobileStateError,
  M13ComponentsBoard,
  M13AssetsBoard,
  M13TabletComponents,
  M13MotionBoard,
});
