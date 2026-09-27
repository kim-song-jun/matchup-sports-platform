/* fix32 — M03 개인 매치 풀 grid.
   ID schema: m03-{mb|tb|dt}-{main|detail|create|state|components|assets|motion}[-{state}]
   Routes: /matches, /matches/[id], /matches/new
   Light-only. Canonical components: MatchesList, MatchDetail, MatchCreate, JoinSheet, MatchCard, SportPill */

const M03_MB_W = 375;
const M03_MB_H = 812;
const M03_TB_W = 768;
const M03_TB_H = 1024;
const M03_DT_W = 1280;
const M03_DT_H = 820;

/* Sport accent tokens — uses var(--*) tokens, no raw hex */
const M03_SPORT_ACCENTS = [
  { id: 'futsal',      label: '풋살',       color: 'var(--blue500)',    bg: 'var(--blue50)' },
  { id: 'soccer',      label: '축구',       color: 'var(--red500)',     bg: 'var(--red50)' },
  { id: 'basketball',  label: '농구',       color: 'var(--orange500)',  bg: 'var(--orange50)' },
  { id: 'badminton',   label: '배드민턴',   color: 'var(--green500)',   bg: 'var(--green50)' },
  { id: 'tennis',      label: '테니스',     color: 'var(--purple500)',  bg: 'var(--purple-alpha-10)' },
  { id: 'icehockey',   label: '아이스하키', color: 'var(--teal500)',    bg: 'var(--blue50)' },
  { id: 'volleyball',  label: '배구',       color: 'var(--orange500)',  bg: 'var(--orange50)' },
  { id: 'baseball',    label: '야구',       color: 'var(--red500)',     bg: 'var(--red50)' },
  { id: 'tabletennis', label: '탁구',       color: 'var(--blue500)',    bg: 'var(--blue50)' },
  { id: 'bowling',     label: '볼링',       color: 'var(--purple500)',  bg: 'var(--purple-alpha-10)' },
  { id: 'golf',        label: '골프',       color: 'var(--green500)',   bg: 'var(--green50)' },
];

const M03_FILTER_CHIPS = [
  { id: 'all',         label: '전체' },
  { id: 'futsal',      label: '풋살' },
  { id: 'soccer',      label: '축구' },
  { id: 'basketball',  label: '농구' },
  { id: 'badminton',   label: '배드민턴' },
  { id: 'tennis',      label: '테니스' },
];

/* fixture data: sport accent resolved to var(--*) tokens */
const M03_MATCHES = [
  {
    id: 'a1', sport: 'futsal', sportLabel: '풋살',
    sportColor: 'var(--blue500)', sportBg: 'var(--blue50)',
    title: '강남 6vs6 풋살 · 토요일 저녁',
    venue: '강남구 밤고개로 풋살파크 A구장', date: '5/10(토)', time: '19:00',
    cur: 9, max: 12, fee: 17000, level: '중급', host: '박민준', urgent: true,
  },
  {
    id: 'a2', sport: 'badminton', sportLabel: '배드민턴',
    sportColor: 'var(--green500)', sportBg: 'var(--green50)',
    title: '복식 4명 배드민턴 · 일요일 오전',
    venue: '신논현 배드민턴 코트 2번 구장', date: '5/11(일)', time: '10:00',
    cur: 3, max: 4, fee: 8000, level: '초급', host: '이수진', urgent: false,
  },
  {
    id: 'a3', sport: 'basketball', sportLabel: '농구',
    sportColor: 'var(--orange500)', sportBg: 'var(--orange50)',
    title: '하프코트 3vs3 농구 · 주말 오후',
    venue: '광교 실내 체육관 2층', date: '5/10(토)', time: '14:00',
    cur: 5, max: 6, fee: 5000, level: '중급', host: '최동훈', urgent: true,
  },
  {
    id: 'a4', sport: 'soccer', sportLabel: '축구',
    sportColor: 'var(--red500)', sportBg: 'var(--red50)',
    title: '11vs11 풀코트 축구 · 토요일',
    venue: '상암 월드컵경기장 보조구장', date: '5/10(토)', time: '09:00',
    cur: 16, max: 22, fee: 12000, level: '중상급', host: '정대현', urgent: false,
  },
];

/* ---- inline swatch helpers (M03-scoped, no global name conflict) ---- */
const M03Swatch = ({ label, children }) => (
  <div style={{ marginBottom: 12 }}>
    <div className="tm-text-micro" style={{ color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</div>
  </div>
);

const M03ColorDot = ({ token, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
    <div style={{ width: 28, height: 28, borderRadius: 8, background: value, border: '1px solid var(--border)' }}/>
    <span className="tm-text-micro" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{token}</span>
  </div>
);

/* M03-scoped MatchCard — uses var(--*) tokens from fixture data */
const M03MatchCard = ({ m }) => {
  const fillPct = (m.cur / m.max) * 100;
  const urgent = fillPct >= 70 || m.urgent;
  return (
    <div className="tm-card tm-card-interactive" style={{ overflow: 'hidden', padding: 0 }}>
      <div style={{ padding: '12px 16px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <span className="tm-badge tm-badge-sm" style={{ background: m.sportBg, color: m.sportColor }}>{m.sportLabel}</span>
            {urgent && <span className="tm-badge tm-badge-sm" style={{ background: 'var(--red50)', color: 'var(--red500)' }}>마감임박</span>}
          </div>
          <span className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{m.date} {m.time}</span>
        </div>
        <div className="tm-text-body-lg" style={{ marginBottom: 6, lineHeight: 1.4 }}>{m.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
          <Icon name="pin" size={12} color="var(--grey400)"/>
          <span className="tm-text-caption">{m.venue}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="tm-text-caption tm-tabular" style={{ color: urgent ? 'var(--red500)' : 'var(--text-muted)' }}>
            {m.cur}/{m.max}명
          </span>
          <span className="tm-text-body-lg tm-tabular" style={{ color: 'var(--text-strong)' }}>
            {m.fee === 0 ? '무료' : m.fee.toLocaleString() + '원'}
          </span>
        </div>
        <div style={{ height: 4, background: 'var(--grey150)', borderRadius: 'var(--r-pill)', overflow: 'hidden' }}>
          <div style={{
            width: Math.min(100, fillPct) + '%', height: '100%',
            background: urgent ? 'var(--red500)' : 'var(--blue500)',
            borderRadius: 'var(--r-pill)',
            transition: 'width 300ms linear',
          }}/>
        </div>
      </div>
    </div>
  );
};

/* ---------- m03-mb-main — canonical MatchesList direct reuse ---------- */
const M03MobileMain = () => <MatchesList />;

/* ---------- m03-tb-main ---------- */
const M03TabletMain = () => (
  <div style={{ width: M03_TB_W, height: M03_TB_H, background: 'var(--bg)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font)' }}>
    {/* top bar */}
    <div style={{ padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
      <div className="tm-text-body-lg" style={{ fontWeight: 700 }}>매치 찾기</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="tm-btn tm-btn-outline tm-btn-md" aria-label="검색">
          <Icon name="search" size={16}/> 검색
        </button>
        <button className="tm-btn tm-btn-primary tm-btn-md" aria-label="매치 만들기">
          <Icon name="plus" size={16}/> 매치 만들기
        </button>
      </div>
    </div>

    {/* body: filter sidebar + list */}
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr', overflow: 'hidden' }}>
      {/* filter sidebar */}
      <aside style={{ borderRight: '1px solid var(--border)', padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div className="tm-text-label" style={{ marginBottom: 10 }}>종목</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {M03_FILTER_CHIPS.map((c, i) => (
              <button key={c.id} style={{
                padding: '8px 12px', borderRadius: 'var(--r-sm)', border: 'none',
                background: i === 0 ? 'var(--blue50)' : 'transparent',
                color: i === 0 ? 'var(--blue500)' : 'var(--text)',
                fontFamily: 'var(--font)', fontWeight: i === 0 ? 700 : 500,
                textAlign: 'left', cursor: 'pointer',
              }}><span className="tm-text-label">{c.label}</span></button>
            ))}
          </div>
        </div>
        <div>
          <div className="tm-text-label" style={{ marginBottom: 10 }}>지역</div>
          <button className="tm-btn tm-btn-outline tm-btn-md" style={{ width: '100%', justifyContent: 'space-between' }} aria-label="지역 선택">
            <span>강남구</span><Icon name="chevD" size={14}/>
          </button>
        </div>
        <div>
          <div className="tm-text-label" style={{ marginBottom: 10 }}>실력</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['초급', '중급', '중상급', '상급'].map((l, i) => (
              <Chip key={l} active={i === 1} size="sm">{l}</Chip>
            ))}
          </div>
        </div>
        <div>
          <div className="tm-text-label" style={{ marginBottom: 10 }}>날짜</div>
          {['오늘', '이번 주말', '다음 주'].map((d, i) => (
            <button key={d} style={{
              display: 'block', width: '100%', padding: '8px 12px', borderRadius: 'var(--r-sm)',
              background: i === 0 ? 'var(--blue50)' : 'transparent',
              color: i === 0 ? 'var(--blue500)' : 'var(--text)',
              fontFamily: 'var(--font)', fontWeight: i === 0 ? 700 : 500,
              textAlign: 'left', border: 'none', cursor: 'pointer', marginBottom: 2,
            }}><span className="tm-text-label">{d}</span></button>
          ))}
        </div>
        <div>
          <div className="tm-text-label" style={{ marginBottom: 10 }}>참가비</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['무료', '1만원 이하', '1~2만원'].map((p, i) => (
              <Chip key={p} size="sm" active={i === 2}>{p}</Chip>
            ))}
          </div>
        </div>
        <button className="tm-btn tm-btn-primary tm-btn-md" style={{ marginTop: 'auto' }} aria-label="필터 적용">필터 적용</button>
      </aside>

      {/* match list — 2-column grid */}
      <main style={{ overflowY: 'auto', padding: '20px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span className="tm-text-caption tm-tabular" style={{ color: 'var(--text-muted)' }}>{M03_MATCHES.length}개 결과</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {['최신순', '마감임박순', '거리순'].map((s, i) => (
              <Chip key={s} size="sm" active={i === 0}>{s}</Chip>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {M03_MATCHES.concat(M03_MATCHES.slice(0, 2)).map((m, idx) => (
            <M03MatchCard key={idx} m={m}/>
          ))}
        </div>
      </main>
    </div>
  </div>
);

/* ---------- m03-dt-main ---------- */
const M03DesktopMain = () => {
  const preview = M03_MATCHES[0];
  return (
    <div style={{ width: M03_DT_W, height: M03_DT_H, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'grid', gridTemplateColumns: '240px 1fr 340px' }}>
      {/* left nav */}
      <aside style={{ borderRight: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>T</div>
          <span className="tm-text-body-lg">Teameet</span>
        </div>
        <nav style={{ display: 'grid', gap: 4 }}>
          {[['홈', false], ['매치', true], ['팀', false], ['장터', false], ['더보기', false]].map(([l, a]) => (
            <button key={l} className={`tm-btn tm-btn-md ${a ? 'tm-btn-secondary' : 'tm-btn-ghost'}`} style={{ justifyContent: 'flex-start' }}>{l}</button>
          ))}
        </nav>
        <div style={{ marginTop: 8 }}>
          <div className="tm-text-label" style={{ marginBottom: 8 }}>필터</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {M03_FILTER_CHIPS.slice(0, 5).map((c, i) => (
              <button key={c.id} style={{
                padding: '6px 10px', borderRadius: 'var(--r-sm)', border: 'none',
                background: i === 0 ? 'var(--blue50)' : 'transparent',
                color: i === 0 ? 'var(--blue500)' : 'var(--text)',
                fontFamily: 'var(--font)', fontWeight: i === 0 ? 700 : 500,
                textAlign: 'left', cursor: 'pointer',
              }}><span className="tm-text-label">{c.label}</span></button>
            ))}
          </div>
        </div>
        <div className="tm-surface-muted" style={{ padding: 12, marginTop: 'auto' }}>
          <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>강남구 · 신논현동</span>
        </div>
      </aside>

      {/* center list */}
      <main style={{ padding: '24px 28px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
          <div>
            <div className="tm-text-heading">개인 매치</div>
            <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>강남구 · AI 매칭 {M03_MATCHES.length}개</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="tm-btn tm-btn-outline tm-btn-md" aria-label="필터"><Icon name="filter" size={15}/> 필터</button>
            <button className="tm-btn tm-btn-primary tm-btn-md" aria-label="매치 만들기"><Icon name="plus" size={15}/> 매치 만들기</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto' }}>
          {M03_FILTER_CHIPS.map((c, i) => <Chip key={c.id} active={i === 0}>{c.label}</Chip>)}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignContent: 'start' }}>
          {M03_MATCHES.map((m) => <M03MatchCard key={m.id} m={m}/>)}
        </div>
      </main>

      {/* right detail preview — var(--*) tokens only, no raw hex */}
      <aside style={{ borderLeft: '1px solid var(--border)', padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <span className="tm-text-label">선택된 매치</span>
        {/* sport accent header — background uses var(--*) from fixture */}
        <div style={{ height: 80, borderRadius: 'var(--r-md)', background: preview.sportBg, display: 'flex', alignItems: 'flex-end', padding: '12px 16px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: preview.sportColor, opacity: 0.18 }}/>
          <span className="tm-badge tm-badge-sm" style={{ background: preview.sportColor, color: 'var(--static-white)', position: 'relative' }}>{preview.sportLabel}</span>
        </div>
        <div>
          <div className="tm-text-body-lg" style={{ marginBottom: 4 }}>{preview.title}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {[
              { icon: 'calendar', v: `${preview.date} ${preview.time}` },
              { icon: 'pin', v: preview.venue },
              { icon: 'people', v: `${preview.cur}/${preview.max}명 · ${preview.level}` },
              { icon: 'money', v: `${preview.fee.toLocaleString()}원` },
            ].map((r) => (
              <div key={r.icon} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name={r.icon} size={15} color="var(--grey500)"/>
                <span className="tm-text-caption">{r.v}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ height: 4, background: 'var(--grey150)', borderRadius: 'var(--r-pill)', overflow: 'hidden' }}>
          <div style={{ width: ((preview.cur / preview.max) * 100) + '%', height: '100%', background: 'var(--red500)', borderRadius: 'var(--r-pill)', transition: 'width 300ms linear' }}/>
        </div>
        <span className="tm-text-caption tm-tabular" style={{ color: 'var(--text-muted)' }}>참가자 {preview.cur}명</span>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" aria-label="참가하기">참가하기</button>
          <button className="tm-btn tm-btn-outline tm-btn-md tm-btn-block" aria-label="상세 보기">상세 보기</button>
        </div>
      </aside>
    </div>
  );
};

/* ---------- m03-mb-detail — canonical MatchDetail direct reuse ---------- */
const M03MobileDetail = () => <MatchDetail />;

/* ---------- m03-mb-create — canonical MatchCreate direct reuse ---------- */
const M03MobileCreate = () => <MatchCreate />;

/* ---------- m03-mb-state-loading — MatchesList wireframe + Skeleton ---------- */
const M03MobileStateLoading = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* skeleton app bar */}
      <div style={{ padding: '8px 20px', height: 52, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <Skeleton width={80} height={18} radius={6}/>
        <div style={{ display: 'flex', gap: 8 }}>
          <Skeleton width={36} height={36} radius={10}/>
          <Skeleton width={36} height={36} radius={10}/>
        </div>
      </div>
      {/* skeleton filter chips */}
      <div style={{ padding: '10px 20px', display: 'flex', gap: 8, flexShrink: 0 }}>
        {[60, 48, 72, 56, 64].map((w, i) => (
          <Skeleton key={i} width={w} height={30} radius={999}/>
        ))}
      </div>
      {/* skeleton sort row */}
      <div style={{ padding: '4px 20px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <Skeleton width={64} height={14} radius={6}/>
        <Skeleton width={72} height={14} radius={6}/>
      </div>
      {/* skeleton match cards */}
      <div style={{ flex: 1, padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="tm-card skeleton-shimmer" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <Skeleton width={56} height={20} radius={10}/>
              <Skeleton width={72} height={14} radius={6}/>
            </div>
            <Skeleton width="80%" height={18} radius={6} style={{ marginBottom: 8 }}/>
            <Skeleton width="60%" height={13} radius={6} style={{ marginBottom: 12 }}/>
            <Skeleton width="100%" height={4} radius={999}/>
          </div>
        ))}
      </div>
    </div>
  </Phone>
);

/* ---------- m03-mb-state-empty ---------- */
const M03MobileStateEmpty = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* app bar matches MatchesList layout */}
      <div style={{ padding: '8px 20px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span className="tm-text-body-lg" style={{ fontWeight: 700 }}>매치 찾기</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={{ width: 44, height: 44, minHeight: 44, display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer' }} aria-label="검색"><Icon name="search" size={20} color="var(--grey800)"/></button>
          <button style={{ width: 44, height: 44, minHeight: 44, display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer' }} aria-label="필터"><Icon name="filter" size={20} color="var(--grey800)"/></button>
        </div>
      </div>
      {/* active filter badges */}
      <div style={{ padding: '10px 20px', display: 'flex', gap: 8, flexShrink: 0 }}>
        <span className="tm-badge" style={{ background: 'var(--blue50)', color: 'var(--blue500)' }}>배드민턴</span>
        <span className="tm-badge" style={{ background: 'var(--grey100)', color: 'var(--grey700)' }}>오늘</span>
        <span className="tm-badge" style={{ background: 'var(--grey100)', color: 'var(--grey700)' }}>초급</span>
      </div>
      {/* empty state centered in remaining space */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12, textAlign: 'center' }}>
        <div style={{ width: 68, height: 68, borderRadius: 22, background: 'var(--grey100)', display: 'grid', placeItems: 'center' }}>
          <Icon name="search" size={28} color="var(--grey400)"/>
        </div>
        <div className="tm-text-heading">조건에 맞는 매치가 없어요</div>
        <div className="tm-text-body" style={{ color: 'var(--text-muted)' }}>필터를 바꾸거나 직접 매치를 만들어보세요</div>
        <div style={{ display: 'grid', gap: 10, marginTop: 12, width: '100%' }}>
          <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" aria-label="매치 직접 만들기">
            <Icon name="plus" size={18}/> 매치 직접 만들기
          </button>
          <button className="tm-btn tm-btn-outline tm-btn-md tm-btn-block" aria-label="필터 초기화">필터 초기화</button>
        </div>
      </div>
      <BottomNav active="matches"/>
    </div>
  </Phone>
);

/* ---------- m03-mb-state-deadline ---------- */
const M03MobileStateDeadline = () => {
  const deadlineMatch = { ...M03_MATCHES[0], cur: 11, max: 12, urgent: true };
  const fillPct = (deadlineMatch.cur / deadlineMatch.max) * 100;
  return (
    <Phone>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '8px 20px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span className="tm-text-body-lg" style={{ fontWeight: 700 }}>매치 찾기</span>
          <button style={{ width: 44, height: 44, minHeight: 44, display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer' }} aria-label="필터"><Icon name="filter" size={20} color="var(--grey800)"/></button>
        </div>
        {/* deadline urgency banner */}
        <div style={{ margin: '12px 20px 0', padding: '12px 16px', background: 'var(--red50)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icon name="clock" size={16} color="var(--red500)"/>
          <div>
            <span className="tm-text-label" style={{ color: 'var(--red500)' }}>마감임박 매치 2개</span>
            <span className="tm-text-caption" style={{ color: 'var(--red500)', marginLeft: 6 }}>— 빨리 신청하세요!</span>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* highlighted deadline card — uses MatchCard wireframe, red border only for state variant */}
          <div className="tm-card tm-card-interactive" style={{ padding: 16, outline: '1px solid var(--red500)', outlineOffset: '-1px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <span className="tm-badge tm-badge-sm" style={{ background: deadlineMatch.sportBg, color: deadlineMatch.sportColor }}>{deadlineMatch.sportLabel}</span>
                <span className="tm-badge tm-badge-sm" style={{ background: 'var(--red500)', color: 'var(--static-white)' }}>마감임박</span>
              </div>
              <span className="tm-text-micro tm-tabular" style={{ color: 'var(--red500)', fontWeight: 700 }}>자리 1개 남음</span>
            </div>
            <div className="tm-text-body-lg" style={{ marginBottom: 6 }}>{deadlineMatch.title}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
              <Icon name="pin" size={12} color="var(--grey400)"/>
              <span className="tm-text-caption">{deadlineMatch.venue}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="tm-text-caption tm-tabular" style={{ color: 'var(--red500)', fontWeight: 700 }}>{deadlineMatch.cur}/{deadlineMatch.max}명</span>
              <span className="tm-text-body-lg tm-tabular">{deadlineMatch.fee.toLocaleString()}원</span>
            </div>
            <div style={{ height: 4, background: 'var(--grey150)', borderRadius: 'var(--r-pill)', overflow: 'hidden' }}>
              <div style={{ width: fillPct + '%', height: '100%', background: 'var(--red500)', borderRadius: 'var(--r-pill)' }}/>
            </div>
          </div>
          {M03_MATCHES.slice(1, 3).map((m) => <M03MatchCard key={m.id} m={m}/>)}
        </div>
        <BottomNav active="matches"/>
      </div>
    </Phone>
  );
};

/* ---------- m03-mb-state-sold-out — MatchDetail wireframe + sold-out overlay ---------- */
const M03MobileStateSoldOut = () => {
  const soldOut = { ...M03_MATCHES[2], cur: 6, max: 6 };
  return (
    <Phone>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* back nav matches MatchDetail layout */}
        <div style={{ padding: '0 8px', height: 52, display: 'flex', alignItems: 'center', gap: 4, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <button style={{ width: 44, height: 44, minHeight: 44, display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer' }} aria-label="뒤로가기">
            <Icon name="chevL" size={22} color="var(--grey800)"/>
          </button>
          <span className="tm-text-body-lg" style={{ flex: 1, textAlign: 'center' }}>매치 상세</span>
          <div style={{ width: 44 }}/>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 100 }}>
          {/* sport accent header — var(--*) only */}
          <div style={{ height: 160, background: soldOut.sportBg, position: 'relative', display: 'flex', alignItems: 'flex-end', padding: 20, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, background: soldOut.sportColor, opacity: 0.22 }}/>
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <span className="tm-badge tm-badge-sm" style={{ background: 'rgba(255,255,255,.25)', color: 'var(--static-white)' }}>{soldOut.sportLabel}</span>
                <span className="tm-badge tm-badge-sm" style={{ background: 'var(--grey900)', color: 'var(--static-white)' }}>정원 마감</span>
              </div>
              <span className="tm-text-subhead" style={{ color: 'var(--static-white)', fontWeight: 800 }}>{soldOut.title}</span>
            </div>
          </div>
          {/* sold-out notice */}
          <div style={{ margin: 20, padding: '16px', background: 'var(--grey50)', borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--grey200)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon name="people" size={18} color="var(--grey500)"/>
            </div>
            <div>
              <div className="tm-text-label" style={{ marginBottom: 2 }}>정원이 다 찼어요</div>
              <span className="tm-text-caption">대기 신청을 하면 자리 생길 때 알려드려요</span>
            </div>
          </div>
          {/* info rows (greyed) — mirrors MatchDetail layout */}
          <div style={{ padding: '0 20px', opacity: 0.6 }}>
            {[
              { icon: 'calendar', label: '일시', value: `${soldOut.date} ${soldOut.time}` },
              { icon: 'pin', label: '장소', value: soldOut.venue },
              { icon: 'people', label: '인원', value: `${soldOut.cur}/${soldOut.max}명 · 만석` },
              { icon: 'money', label: '참가비', value: soldOut.fee.toLocaleString() + '원' },
            ].map((row, i) => (
              <div key={row.icon} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: i < 3 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--grey100)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Icon name={row.icon} size={17} color="var(--grey500)"/>
                </div>
                <span className="tm-text-caption" style={{ width: 44, flexShrink: 0 }}>{row.label}</span>
                <span className="tm-text-body tm-tabular" style={{ fontWeight: 500 }}>{row.value}</span>
              </div>
            ))}
          </div>
          {/* fill bar — full 100% greyed */}
          <div style={{ margin: '16px 20px', padding: 16, background: 'var(--grey50)', borderRadius: 'var(--r-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="tm-text-caption" style={{ fontWeight: 600 }}>모집 현황</span>
              <span className="tm-text-caption tm-tabular" style={{ fontWeight: 700 }}>100% 마감</span>
            </div>
            <div style={{ height: 6, background: 'var(--grey200)', borderRadius: 'var(--r-pill)', overflow: 'hidden' }}>
              <div style={{ width: '100%', height: '100%', background: 'var(--grey400)', borderRadius: 'var(--r-pill)' }}/>
            </div>
          </div>
        </div>
        {/* disabled sticky CTA — mirrors MatchDetail sticky CTA */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 20px 28px', background: 'var(--bg)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>참가비</div>
            <div className="tm-text-subhead tm-tabular">{soldOut.fee.toLocaleString()}원</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="tm-btn tm-btn-outline tm-btn-md" style={{ minHeight: 44 }} aria-label="대기 신청">대기 신청</button>
            <button className="tm-btn tm-btn-neutral tm-btn-lg" disabled style={{ padding: '0 24px', minHeight: 44, opacity: 0.42 }} aria-label="정원 마감" aria-disabled="true">정원 마감</button>
          </div>
        </div>
      </div>
    </Phone>
  );
};

/* ---------- m03-mb-state-error ---------- */
const M03MobileStateError = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '8px 20px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span className="tm-text-body-lg" style={{ fontWeight: 700 }}>매치 찾기</span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12, textAlign: 'center' }}>
        <div style={{ width: 60, height: 60, borderRadius: 30, background: 'var(--red50)', display: 'grid', placeItems: 'center' }}>
          <Icon name="close" size={24} color="var(--red500)"/>
        </div>
        <div className="tm-text-heading">매치를 불러올 수 없어요</div>
        <div className="tm-text-body" style={{ color: 'var(--text-muted)' }}>네트워크가 불안정해요. 잠시 후 다시 시도해주세요.</div>
        <div style={{ marginTop: 4 }}>
          <span className="tm-badge tm-badge-sm" style={{ background: 'var(--red50)', color: 'var(--red500)', fontWeight: 400 }}>MATCH_FETCH_FAILED</span>
        </div>
        <div style={{ display: 'grid', gap: 10, marginTop: 12, width: '100%' }}>
          <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" aria-label="다시 시도">다시 시도</button>
          <button className="tm-btn tm-btn-ghost tm-btn-md tm-btn-block" aria-label="홈으로 돌아가기">홈으로 돌아가기</button>
        </div>
      </div>
      <BottomNav active="matches"/>
    </div>
  </Phone>
);

/* ---------- m03-mb-components — M03 primitives inventory ---------- */
const M03MobileComponents = () => (
  <div style={{ width: M03_MB_W, height: M03_MB_H, background: 'var(--bg)', padding: 20, fontFamily: 'var(--font)', overflowY: 'auto' }}>
    <span className="tm-badge tm-badge-sm" style={{ background: 'var(--blue50)', color: 'var(--blue500)' }}>m03-mb-components</span>
    <div className="tm-text-body-lg" style={{ marginTop: 8, marginBottom: 4 }}>M03 모바일 · 사용 컴포넌트</div>
    <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginBottom: 16 }}>개인 매치 화면이 사용하는 UI 컴포넌트 인벤토리</div>

    <M03Swatch label="SportPill · carousel (active/inactive)">
      <div style={{ display: 'flex', gap: 12, overflow: 'hidden' }}>
        {SPORTS && SPORTS.slice(0, 4).map((s, i) => (
          <SportPill key={s.id} sport={s} active={i === 0} onClick={() => {}}/>
        ))}
      </div>
    </M03Swatch>

    <M03Swatch label="FilterChip · sport (active/inactive)">
      {M03_FILTER_CHIPS.slice(0, 4).map((c, i) => <Chip key={c.id} active={i === 0} size="sm">{c.label}</Chip>)}
    </M03Swatch>

    <M03Swatch label="MatchCard · normal / urgent">
      <div style={{ display: 'flex', gap: 10, width: '100%' }}>
        <div style={{ flex: 1 }}><M03MatchCard m={M03_MATCHES[1]}/></div>
        <div style={{ flex: 1 }}><M03MatchCard m={M03_MATCHES[0]}/></div>
      </div>
    </M03Swatch>

    <M03Swatch label="Sticky CTA bar · enabled">
      <div style={{ width: '100%', padding: '12px 16px', background: 'var(--bg)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, borderRadius: 'var(--r-md)' }}>
        <div style={{ flex: 1 }}>
          <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>참가비</div>
          <div className="tm-text-body-lg tm-tabular">17,000원</div>
        </div>
        <button className="tm-btn tm-btn-primary tm-btn-lg" style={{ padding: '0 28px', minHeight: 44 }} aria-label="참가하기">참가하기</button>
      </div>
    </M03Swatch>

    <M03Swatch label="Sticky CTA · sold-out disabled">
      <div style={{ width: '100%', padding: '12px 16px', background: 'var(--bg)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, borderRadius: 'var(--r-md)' }}>
        <div style={{ flex: 1 }}>
          <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>참가비</div>
          <div className="tm-text-body-lg tm-tabular">5,000원</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="tm-btn tm-btn-outline tm-btn-sm" style={{ minHeight: 44 }} aria-label="대기 신청">대기 신청</button>
          <button className="tm-btn tm-btn-neutral tm-btn-lg" disabled style={{ padding: '0 20px', minHeight: 44, opacity: 0.42 }} aria-label="정원 마감" aria-disabled="true">정원 마감</button>
        </div>
      </div>
    </M03Swatch>

    <M03Swatch label="JoinSheet · bottom sheet (참가 확인)">
      <div style={{ width: '100%', background: 'var(--bg)', borderRadius: '16px 16px 0 0', padding: '16px 16px 20px', border: '1px solid var(--border)' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--grey200)', margin: '0 auto 16px' }}/>
        <div className="tm-text-subhead" style={{ marginBottom: 4 }}>매치 참가 확인</div>
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginBottom: 14 }}>아래 내용을 확인 후 참가해주세요</div>
        <div style={{ padding: 12, background: 'var(--grey50)', borderRadius: 10, marginBottom: 12 }}>
          <div className="tm-text-label" style={{ marginBottom: 8 }}>강남 6vs6 풋살 · 토요일 저녁</div>
          {[['일시', '5/10(토) 19:00'], ['장소', '강남구 밤고개로'], ['인원', '9/12명']].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
              <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{k}</span>
              <span className="tm-text-caption" style={{ color: 'var(--text-strong)', fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 16px' }}>
          <span className="tm-text-label">총 결제금액</span>
          <span className="tm-text-body-lg tm-tabular" style={{ color: 'var(--blue500)', fontWeight: 800 }}>17,000원</span>
        </div>
        <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" aria-label="결제하고 참가하기">결제하고 참가하기</button>
      </div>
    </M03Swatch>

    <M03Swatch label="Progress bar · states">
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          { label: '정상 (50%)', pct: 50, color: 'var(--blue500)' },
          { label: '마감임박 (83%)', pct: 83, color: 'var(--red500)' },
          { label: '만석 (100%)', pct: 100, color: 'var(--grey400)' },
        ].map((p) => (
          <div key={p.label}>
            <div className="tm-text-micro" style={{ marginBottom: 4, color: 'var(--text-muted)' }}>{p.label}</div>
            <div style={{ height: 6, background: 'var(--grey150)', borderRadius: 'var(--r-pill)' }}>
              <div style={{ width: p.pct + '%', height: '100%', background: p.color, borderRadius: 'var(--r-pill)', transition: 'width 300ms linear' }}/>
            </div>
          </div>
        ))}
      </div>
    </M03Swatch>

    <M03Swatch label="BottomNav · matches active">
      <div style={{ width: '100%' }}><BottomNav active="matches"/></div>
    </M03Swatch>
  </div>
);

/* ---------- m03-tb-components ---------- */
const M03TabletComponents = () => (
  <div style={{ width: M03_TB_W, height: M03_TB_H, background: 'var(--bg)', padding: 32, fontFamily: 'var(--font)', overflowY: 'auto' }}>
    <span className="tm-badge tm-badge-sm" style={{ background: 'var(--blue50)', color: 'var(--blue500)' }}>m03-tb-components</span>
    <div className="tm-text-body-lg" style={{ marginTop: 8, marginBottom: 4 }}>M03 태블릿 · 사용 컴포넌트</div>
    <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginBottom: 24 }}>개인 매치 화면이 사용하는 UI 컴포넌트 (tablet variant)</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      <div>
        <M03Swatch label="FilterChip · sport">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {M03_FILTER_CHIPS.map((c, i) => <Chip key={c.id} active={i === 0}>{c.label}</Chip>)}
          </div>
        </M03Swatch>
        <M03Swatch label="MatchCard · tablet (full-width)">
          <div style={{ width: '100%' }}><M03MatchCard m={M03_MATCHES[0]}/></div>
        </M03Swatch>
        <M03Swatch label="Filter sidebar buttons">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 180 }}>
            {['전체', '풋살', '축구', '농구', '배드민턴'].map((l, i) => (
              <button key={l} style={{ padding: '8px 12px', borderRadius: 'var(--r-sm)', textAlign: 'left', background: i === 0 ? 'var(--blue50)' : 'transparent', border: 'none', color: i === 0 ? 'var(--blue500)' : 'var(--text)', fontFamily: 'var(--font)', fontWeight: i === 0 ? 700 : 500, cursor: 'pointer', minHeight: 44 }}>
                <span className="tm-text-label">{l}</span>
              </button>
            ))}
          </div>
        </M03Swatch>
      </div>
      <div>
        <M03Swatch label="Sort chips (tablet)">
          <div style={{ display: 'flex', gap: 6 }}>
            {['최신순', '마감임박순', '거리순'].map((s, i) => <Chip key={s} active={i === 0}>{s}</Chip>)}
          </div>
        </M03Swatch>
        <M03Swatch label="2-column card grid (preview)">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, width: '100%' }}>
            {M03_MATCHES.slice(0, 2).map((m) => <M03MatchCard key={m.id} m={m}/>)}
          </div>
        </M03Swatch>
        <M03Swatch label="Skeleton shimmer · loading card">
          <div className="skeleton-shimmer" style={{ width: '100%', height: 100, background: 'var(--grey100)', borderRadius: 14 }}/>
        </M03Swatch>
      </div>
    </div>
  </div>
);

/* ---------- m03-dt-components ---------- */
const M03DesktopComponents = () => (
  <div style={{ width: M03_DT_W, height: M03_DT_H, background: 'var(--bg)', padding: 40, fontFamily: 'var(--font)', overflowY: 'auto' }}>
    <span className="tm-badge tm-badge-sm" style={{ background: 'var(--blue50)', color: 'var(--blue500)' }}>m03-dt-components</span>
    <div className="tm-text-body-lg" style={{ marginTop: 8, marginBottom: 4 }}>M03 데스크탑 · 사용 컴포넌트</div>
    <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginBottom: 32 }}>개인 매치 화면이 사용하는 UI 컴포넌트 (desktop variant)</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 28 }}>
      <div>
        <M03Swatch label="FilterChip · sport">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {M03_FILTER_CHIPS.map((c, i) => <Chip key={c.id} active={i === 0}>{c.label}</Chip>)}
          </div>
        </M03Swatch>
        <M03Swatch label="Left nav filter buttons">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 180 }}>
            {['전체', '풋살', '축구', '농구', '배드민턴', '테니스'].map((l, i) => (
              <button key={l} style={{ padding: '8px 12px', borderRadius: 'var(--r-sm)', textAlign: 'left', background: i === 0 ? 'var(--blue50)' : 'transparent', border: 'none', color: i === 0 ? 'var(--blue500)' : 'var(--text)', fontFamily: 'var(--font)', fontWeight: i === 0 ? 700 : 500, cursor: 'pointer', minHeight: 44 }}>
                <span className="tm-text-label">{l}</span>
              </button>
            ))}
          </div>
        </M03Swatch>
      </div>
      <div>
        <M03Swatch label="MatchCard · 3-col grid item">
          <div style={{ width: '100%' }}><M03MatchCard m={M03_MATCHES[2]}/></div>
        </M03Swatch>
        <M03Swatch label="Detail preview panel buttons">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 200 }}>
            <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" style={{ minHeight: 44 }} aria-label="참가하기">참가하기</button>
            <button className="tm-btn tm-btn-outline tm-btn-md tm-btn-block" style={{ minHeight: 44 }} aria-label="상세 보기">상세 보기</button>
          </div>
        </M03Swatch>
      </div>
      <div>
        <M03Swatch label="SportPill · sport carousel">
          <div style={{ display: 'flex', gap: 12 }}>
            {SPORTS && SPORTS.slice(0, 3).map((s, i) => (
              <SportPill key={s.id} sport={s} active={i === 1} onClick={() => {}}/>
            ))}
          </div>
        </M03Swatch>
        <M03Swatch label="Sort & CTA row">
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="tm-btn tm-btn-outline tm-btn-md" style={{ minHeight: 44 }} aria-label="필터"><Icon name="filter" size={15}/> 필터</button>
            <button className="tm-btn tm-btn-primary tm-btn-md" style={{ minHeight: 44 }} aria-label="매치 만들기"><Icon name="plus" size={15}/> 매치 만들기</button>
          </div>
        </M03Swatch>
        <M03Swatch label="Skeleton shimmer · card">
          <div className="skeleton-shimmer" style={{ width: '100%', height: 120, background: 'var(--grey100)', borderRadius: 14 }}/>
        </M03Swatch>
      </div>
    </div>
  </div>
);

/* ---------- m03-mb-assets — sportCardAccent tokens + spacing + type ---------- */
const M03MobileAssets = () => (
  <div style={{ width: M03_MB_W, height: M03_MB_H, background: 'var(--bg)', padding: 20, fontFamily: 'var(--font)', overflowY: 'auto' }}>
    <span className="tm-badge tm-badge-sm" style={{ background: 'var(--blue50)', color: 'var(--blue500)' }}>m03-mb-assets</span>
    <div className="tm-text-body-lg" style={{ marginTop: 8, marginBottom: 4 }}>M03 모바일 · 토큰/에셋 인벤토리</div>
    <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginBottom: 16 }}>개인 매치 화면이 사용하는 디자인 토큰 전체</div>

    <M03Swatch label="Color · sportCardAccent (11 종목) — var(--*) tokens">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {M03_SPORT_ACCENTS.map((s) => (
          <div key={s.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: s.color }}/>
            <span className="tm-text-micro" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{s.label}</span>
          </div>
        ))}
      </div>
    </M03Swatch>

    <M03Swatch label="Color · semantic states">
      <M03ColorDot token="blue500 (primary)" value="var(--blue500)"/>
      <M03ColorDot token="red500 (urgent)" value="var(--red500)"/>
      <M03ColorDot token="red50 (bg)" value="var(--red50)"/>
      <M03ColorDot token="grey900 (sold-out)" value="var(--grey900)"/>
      <M03ColorDot token="grey400 (disabled)" value="var(--grey400)"/>
    </M03Swatch>

    <M03Swatch label="Color · neutral hierarchy">
      <M03ColorDot token="grey50" value="var(--grey50)"/>
      <M03ColorDot token="grey100" value="var(--grey100)"/>
      <M03ColorDot token="grey150" value="var(--grey150)"/>
      <M03ColorDot token="grey200" value="var(--grey200)"/>
      <M03ColorDot token="grey700" value="var(--grey700)"/>
      <M03ColorDot token="grey900" value="var(--grey900)"/>
    </M03Swatch>

    <M03Swatch label="Typography · tm-text-* used">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="tm-text-heading">heading — 매치 찾기 h1</span>
        <span className="tm-text-body-lg">body-lg — 매치 카드 타이틀</span>
        <span className="tm-text-body">body — 경기 소개 본문</span>
        <span className="tm-text-label">label — 섹션 레이블</span>
        <span className="tm-text-caption">caption — 장소·인원 메타</span>
        <span className="tm-text-micro">micro — 참가비 소제목</span>
      </div>
    </M03Swatch>

    <M03Swatch label="Spacing · 4-multiple used">
      {[8, 12, 16, 20, 24, 28, 32, 40].map((n) => (
        <span key={n} className="tm-badge tm-badge-sm" style={{ background: 'var(--grey100)', color: 'var(--grey700)' }}>{n}px</span>
      ))}
    </M03Swatch>

    <M03Swatch label="Radius tokens">
      <span className="tm-badge tm-badge-sm" style={{ background: 'var(--grey100)', color: 'var(--grey700)' }}>r-sm 8 · tag/chip-inner</span>
      <span className="tm-badge tm-badge-sm" style={{ background: 'var(--grey100)', color: 'var(--grey700)' }}>r-md 12 · card/input</span>
      <span className="tm-badge tm-badge-sm" style={{ background: 'var(--grey100)', color: 'var(--grey700)' }}>r-lg 16 · card hero</span>
      <span className="tm-badge tm-badge-sm" style={{ background: 'var(--grey100)', color: 'var(--grey700)' }}>r-pill · chip/badge</span>
    </M03Swatch>

    <M03Swatch label="Icons · lucide inline">
      <div style={{ display: 'flex', gap: 10 }}>
        {['search', 'filter', 'pin', 'clock', 'people', 'money', 'calendar', 'plus', 'chevL', 'chevD', 'share', 'heart', 'check'].map((n) => (
          <span key={n} title={n} aria-hidden="true"><Icon name={n} size={18} color="var(--grey700)"/></span>
        ))}
      </div>
    </M03Swatch>

    <M03Swatch label="Motion tokens">
      <span className="tm-badge tm-badge-sm" style={{ background: 'var(--grey100)', color: 'var(--grey700)' }}>dur-fast 120ms · tap</span>
      <span className="tm-badge tm-badge-sm" style={{ background: 'var(--grey100)', color: 'var(--grey700)' }}>dur-slow 280ms · sheet</span>
      <span className="tm-badge tm-badge-sm" style={{ background: 'var(--grey100)', color: 'var(--grey700)' }}>ease-out-expo · sheet-up</span>
    </M03Swatch>

    <M03Swatch label="Shadow tokens">
      {['sh-1 (hairline)', 'sh-2 (card hover)', 'sh-3 (FAB/sticky)'].map((s) => (
        <span key={s} className="tm-badge tm-badge-sm" style={{ background: 'var(--grey100)', color: 'var(--grey700)' }}>{s}</span>
      ))}
    </M03Swatch>
  </div>
);

/* ---------- m03-mb-motion — M03 micro-interaction contract ---------- */
const M03MobileMotion = () => {
  const M03MotionRow = ({ title, sub, tag }) => (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tm-text-label" style={{ marginBottom: 2 }}>{title}</div>
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{sub}</div>
      </div>
      <span className="tm-badge tm-badge-sm" style={{ background: 'var(--blue50)', color: 'var(--blue500)', flexShrink: 0 }}>{tag}</span>
    </div>
  );
  return (
    <div style={{ width: M03_MB_W, height: M03_MB_H, background: 'var(--bg)', padding: '20px 20px', fontFamily: 'var(--font)' }}>
      <span className="tm-badge tm-badge-sm" style={{ background: 'var(--blue50)', color: 'var(--blue500)' }}>m03-mb-motion</span>
      <div className="tm-text-body-lg" style={{ marginTop: 8, marginBottom: 4 }}>M03 모바일 · motion contract</div>
      <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginBottom: 16 }}>개인 매치 화면이 사용하는 인터랙션 계약</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <M03MotionRow
          title="MatchCard tap"
          sub="카드 탭 → scale(.98) · 120ms · ease-out-quart"
          tag="tap"
        />
        <M03MotionRow
          title="FilterChip toggle"
          sub="칩 전환 → scale(.97) + bg/color transition-colors · 120ms"
          tag="chip"
        />
        <M03MotionRow
          title="JoinSheet snap"
          sub="참가 확인 시트 → translateY(20→0) + opacity · 280ms · ease-out-expo"
          tag="sheet"
        />
        <M03MotionRow
          title="Sticky CTA pin"
          sub="스크롤 상세에서 CTA 고정 → position:absolute + border-top reveal"
          tag="sticky"
        />
        <M03MotionRow
          title="Progress bar fill"
          sub="모집 현황 바 → scaleX(N%) transition · 300ms linear"
          tag="progress"
        />
        <M03MotionRow
          title="Skeleton shimmer"
          sub="로딩 상태 → 1.5s linear infinite shimmer animation"
          tag="skeleton"
        />
        <M03MotionRow
          title="Stagger card in"
          sub="리스트 등장 → 0.04s 간격 + fade-in-up (tm-animate-enter)"
          tag="stagger"
        />
        <M03MotionRow
          title="FAB scale appear"
          sub="매치 만들기 FAB → scale(0→1) + opacity · 180ms"
          tag="fab"
        />
        <M03MotionRow
          title="Swipe gesture"
          sub="카드 스와이프 → translateX + opacity · 200ms ease-out · 60px threshold"
          tag="swipe"
        />
        <M03MotionRow
          title="Pull to refresh"
          sub="당기기 → spinner 등장 + haptic light"
          tag="pull"
        />
        <M03MotionRow
          title="Reduced motion"
          sub="prefers-reduced-motion → 모든 transition 0.01ms, no scale transforms"
          tag="a11y"
        />
      </div>
    </div>
  );
};

Object.assign(window, {
  M03MobileMain,
  M03TabletMain,
  M03DesktopMain,
  M03MobileDetail,
  M03MobileCreate,
  M03MobileStateLoading,
  M03MobileStateEmpty,
  M03MobileStateDeadline,
  M03MobileStateSoldOut,
  M03MobileStateError,
  M03MobileComponents,
  M03TabletComponents,
  M03DesktopComponents,
  M03MobileAssets,
  M03MobileMotion,
});
