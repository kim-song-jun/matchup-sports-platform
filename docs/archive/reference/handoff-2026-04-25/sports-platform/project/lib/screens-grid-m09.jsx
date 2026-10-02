/* fix32 — M09 대회·Tournaments 풀 grid.
   ID schema: m09-{mb|tb|dt}-{kind}[-{state|sub}]
   Routes: /tournaments, /tournaments/[id], /tournaments/new
   Light-only. References tokens.jsx + signatures.jsx + screens-readiness-wave21a.jsx. */

const M09_MB_W = 375;
const M09_MB_H = 812;
const M09_TB_W = 768;
const M09_TB_H = 1024;
const M09_DT_W = 1280;
const M09_DT_H = 820;

/* ---------- Static fixtures (M09-prefixed to avoid scope collision) ---------- */
const M09_TOURNAMENTS = [
  {
    id: 't1',
    sport: '풋살',
    sportColor: 'var(--blue500)',
    title: '강남 풋살 리그 시즌 3',
    date: '5월 10일 (토)',
    venue: '잠실 풋살파크',
    teams: 8,
    maxTeams: 8,
    prize: 300000,
    fee: 50000,
    status: 'open',
    statusLabel: '참가 신청 중',
    format: '풀리그+결승 토너먼트',
  },
  {
    id: 't2',
    sport: '농구',
    sportColor: 'var(--orange500)',
    title: '서울 3×3 농구 오픈',
    date: '5월 17일 (토)',
    venue: '올림픽공원 체육관',
    teams: 6,
    maxTeams: 12,
    prize: 500000,
    fee: 30000,
    status: 'open',
    statusLabel: '참가 신청 중',
    format: '더블 엘리미네이션',
  },
  {
    id: 't3',
    sport: '배드민턴',
    sportColor: 'var(--green500)',
    title: '신논현 배드민턴 복식 대회',
    date: '5월 24일 (토)',
    venue: '신논현 배드민턴장',
    teams: 16,
    maxTeams: 16,
    prize: 200000,
    fee: 20000,
    status: 'sold-out',
    statusLabel: '접수 마감',
    format: '싱글 엘리미네이션',
  },
];

const M09_BRACKET_TEAMS = ['팀 레드', '팀 블루', '팀 그린', '팀 오렌지', '팀 퍼플', '팀 틸', '팀 옐로', '팀 핑크'];

/* ---------- M09 Sub-atoms (all M09-prefixed) ---------- */

/* Status chip — uses tm-text-micro + var(--*) tokens, no raw fontSize */
const M09StatusChip = ({ status, label }) => {
  const bg = status === 'open' ? 'var(--blue50)'
    : status === 'sold-out' ? 'var(--red50)'
    : status === 'deadline' ? 'var(--orange50)'
    : status === 'ongoing' ? 'var(--green50)'
    : 'var(--grey100)';
  const fg = status === 'open' ? 'var(--blue500)'
    : status === 'sold-out' ? 'var(--red500)'
    : status === 'deadline' ? 'var(--orange500)'
    : status === 'ongoing' ? 'var(--green500)'
    : 'var(--grey700)';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      height: 20, padding: '0 8px',
      borderRadius: 'var(--r-pill)',
      background: bg, color: fg,
      whiteSpace: 'nowrap', fontWeight: 600,
    }} className="tm-text-micro">{label}</span>
  );
};

/* Sport accent dot — 8px circle via var(--*) */
const M09SportDot = ({ color }) => (
  <span aria-hidden="true" style={{
    width: 8, height: 8, borderRadius: 'var(--r-pill)',
    background: color, display: 'inline-block', flexShrink: 0,
  }}/>
);

/* Tournament card — canonical M09 card with full MoneyRow prize/fee */
const M09TournamentCard = ({ t, compact }) => (
  <div className="tm-card tm-card-interactive" style={{ padding: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <M09SportDot color={t.sportColor}/>
        <span className="tm-text-label" style={{ color: t.sportColor }}>{t.sport}</span>
      </div>
      <M09StatusChip status={t.status} label={t.statusLabel}/>
    </div>
    <div className="tm-text-body-lg" style={{ marginBottom: 4, fontWeight: 700 }}>{t.title}</div>
    <div style={{ display: 'flex', gap: 12, marginBottom: compact ? 0 : 12 }}>
      <span className="tm-text-caption">{t.date}</span>
      <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{t.venue}</span>
    </div>
    {!compact && (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
          <div>
            <div className="tm-text-micro" style={{ color: 'var(--text-muted)', marginBottom: 4 }}>참가팀</div>
            <div className="tm-text-label tab-num">{t.teams}/{t.maxTeams}팀</div>
          </div>
          <div>
            <div className="tm-text-micro" style={{ color: 'var(--text-muted)', marginBottom: 4 }}>상금</div>
            <div className="tm-text-label tab-num">{t.prize.toLocaleString('ko-KR')}원</div>
          </div>
          <div>
            <div className="tm-text-micro" style={{ color: 'var(--text-muted)', marginBottom: 4 }}>참가비</div>
            <div className="tm-text-label tab-num">{t.fee.toLocaleString('ko-KR')}원/팀</div>
          </div>
        </div>
        <button
          className={`tm-btn ${t.status === 'sold-out' ? 'tm-btn-neutral' : 'tm-btn-primary'} tm-btn-sm`}
          disabled={t.status === 'sold-out'}
          style={{ minWidth: 64, minHeight: 44 }}
          aria-label={t.status === 'sold-out' ? '접수 마감' : `${t.title} 참가 신청`}
        >
          {t.status === 'sold-out' ? '마감' : '신청'}
        </button>
      </div>
    )}
  </div>
);

/* Bracket match node — winner row bg via var(--blue-alpha-08), no raw hex */
const M09BracketMatch = ({ team1, team2, score1, score2, winner, round }) => {
  const w1 = winner === 1;
  const w2 = winner === 2;
  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
      overflow: 'hidden',
      width: 148,
      background: 'var(--bg)',
      flexShrink: 0,
    }}>
      {round && (
        <div className="tm-text-micro" style={{
          padding: '4px 12px',
          background: 'var(--grey50)',
          borderBottom: '1px solid var(--border)',
          fontWeight: 700, color: 'var(--text-muted)',
        }}>{round}</div>
      )}
      {[
        { name: team1, score: score1, won: w1 },
        { name: team2, score: score2, won: w2 },
      ].map((p, i) => (
        <div key={i} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 12px',
          background: p.won ? 'var(--blue-alpha-08)' : 'transparent',
          borderTop: i === 1 ? '1px solid var(--grey100)' : 'none',
        }}>
          <span className="tm-text-caption" style={{
            fontWeight: p.won ? 700 : 400,
            color: p.won ? 'var(--blue500)' : p.name ? 'var(--text-strong)' : 'var(--text-placeholder)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 88,
          }}>{p.name || 'TBD'}</span>
          <span className="tm-text-caption tab-num" style={{
            fontWeight: p.won ? 700 : 500,
            color: p.won ? 'var(--blue500)' : 'var(--text-muted)',
          }}>{p.score ?? '-'}</span>
        </div>
      ))}
    </div>
  );
};

/* Bracket connector line — visual only, aria-hidden */
const M09BracketConnector = ({ height = 64 }) => (
  <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', padding: '0 4px' }}>
    <div style={{ width: 16, height: 1, background: 'var(--border)' }}/>
    <div style={{ width: 1, height: height, background: 'var(--border)', marginLeft: 15 }}/>
    <div style={{ width: 16, height: 1, background: 'var(--border)' }}/>
  </div>
);

/* Prize pool — uses MoneyRow canonical primitive (1위/2위/3위) */
const M09PrizePool = ({ items }) => (
  <div style={{ display: 'grid', gap: 8 }}>
    {items.map((p, i) => (
      <div key={p.rank} style={{
        padding: '12px 16px',
        borderRadius: 'var(--r-md)',
        background: i === 0 ? 'var(--blue50)' : 'var(--grey50)',
        border: `1px solid ${i === 0 ? 'var(--blue100)' : 'var(--grey150)'}`,
      }}>
        <MoneyRow
          label={`${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} ${p.rank}`}
          amount={p.amount}
          strong={i === 0}
          accent={i === 0}
        />
      </div>
    ))}
  </div>
);

/* Payout account form — label+id pairs, no placeholder-only labels */
const M09PayoutAccountForm = ({ compact }) => (
  <div style={{ display: 'grid', gap: 16 }}>
    <div>
      <label htmlFor="m09-bank" className="tm-text-label" style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
        은행 선택
      </label>
      <div id="m09-bank" className="tm-input" role="button" aria-haspopup="listbox" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        minHeight: 48, cursor: 'pointer',
      }}>
        <span className="tm-text-body" style={{ color: 'var(--text-placeholder)' }}>은행을 선택하세요</span>
        <Icon name="chevD" size={16} aria-hidden="true"/>
      </div>
    </div>
    <div>
      <label htmlFor="m09-account" className="tm-text-label" style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
        계좌번호
      </label>
      <input id="m09-account" className="tm-input" placeholder="숫자만 입력" style={{ minHeight: 48 }}/>
    </div>
    <div>
      <label htmlFor="m09-owner" className="tm-text-label" style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
        예금주
      </label>
      <input id="m09-owner" className="tm-input" placeholder="예금주 명" style={{ minHeight: 48 }}/>
    </div>
    {!compact && (
      <button className="tm-btn tm-btn-outline tm-btn-md tm-btn-block" style={{ minHeight: 44, marginTop: 4 }}>
        계좌 인증
      </button>
    )}
  </div>
);

/* Standings row — rank + team name + KPIStat for points/wins */
const M09StandingsRow = ({ rank, team, played, wins, losses, points, highlight }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
    background: highlight ? 'var(--blue-alpha-08)' : 'transparent',
    borderBottom: '1px solid var(--grey100)',
    minHeight: 44,
  }}>
    <span className="tm-text-label tab-num" style={{
      width: 20, flexShrink: 0,
      color: rank <= 2 ? 'var(--blue500)' : 'var(--text-muted)',
      fontWeight: rank <= 2 ? 700 : 500,
    }}>{rank}</span>
    <span className="tm-text-body" style={{ flex: 1, fontWeight: highlight ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team}</span>
    <span className="tm-text-caption tab-num" style={{ width: 20, color: 'var(--text-muted)', textAlign: 'center' }}>{played}</span>
    <span className="tm-text-caption tab-num" style={{ width: 20, color: 'var(--text-muted)', textAlign: 'center' }}>{wins}</span>
    <span className="tm-text-caption tab-num" style={{ width: 20, color: 'var(--text-muted)', textAlign: 'center' }}>{losses}</span>
    <span className="tm-text-label tab-num" style={{ width: 24, color: highlight ? 'var(--blue500)' : 'var(--text-strong)', fontWeight: 700, textAlign: 'right' }}>{points}</span>
  </div>
);

/* ─────────────────────────────────────────
   m09-mb-main  (375 × 812)
   대회 리스트 메인 — TournamentsStateEdgeBoard + 카드 목록
   Uses: M09TournamentCard, M09StatusChip, SectionTitle, Chip, BottomNav
───────────────────────────────────────── */
const M09MobileMain = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* AppBar */}
      <div style={{ padding: '8px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="tm-text-subhead" style={{ fontWeight: 700 }}>대회</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="tm-pressable tm-break-keep"
            style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none' }}
            aria-label="대회 검색"
          >
            <Icon name="search" size={20}/>
          </button>
          <button
            className="tm-btn tm-btn-primary tm-btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 44 }}
            aria-label="대회 만들기"
          >
            <Icon name="plus" size={16} aria-hidden="true"/>
            만들기
          </button>
        </div>
      </div>

      {/* Sport filter chips */}
      <div style={{ padding: '4px 20px 8px', display: 'flex', gap: 8, overflowX: 'auto' }}>
        {[['전체', true], ['풋살', false], ['농구', false], ['배드민턴', false], ['테니스', false], ['하키', false]].map(([l, a]) => (
          <Chip key={l} active={a} size="sm">{l}</Chip>
        ))}
      </div>

      {/* Count + filter row */}
      <div style={{ padding: '8px 20px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="tm-text-label" style={{ color: 'var(--text-muted)' }}>총 3건</span>
        <button
          className="tm-pressable tm-break-keep"
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', minHeight: 44 }}
          aria-label="목록 필터 열기"
        >
          <Icon name="filter" size={14} aria-hidden="true"/>
          <span className="tm-text-label" style={{ color: 'var(--text-muted)' }}>필터</span>
        </button>
      </div>

      {/* Card list */}
      <div style={{ flex: 1, padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
        {M09_TOURNAMENTS.map((t) => (
          <M09TournamentCard key={t.id} t={t}/>
        ))}
      </div>

      <BottomNav active="matches"/>
    </div>
  </Phone>
);

/* ─────────────────────────────────────────
   m09-tb-main  (768 × 1024)
   태블릿 2-col 리스트
───────────────────────────────────────── */
const M09TabletMain = () => (
  <div style={{ width: M09_TB_W, height: M09_TB_H, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    {/* Header */}
    <div style={{ padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--grey100)' }}>
      <div className="tm-text-heading" style={{ fontWeight: 700 }}>대회</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="tm-btn tm-btn-outline tm-btn-md" style={{ minHeight: 44 }} aria-label="대회 검색">
          <Icon name="search" size={16} aria-hidden="true"/> 검색
        </button>
        <button className="tm-btn tm-btn-primary tm-btn-md" style={{ minHeight: 44 }} aria-label="대회 만들기">
          <Icon name="plus" size={16} aria-hidden="true"/> 대회 만들기
        </button>
      </div>
    </div>

    {/* Sport filter chips */}
    <div style={{ padding: '16px 32px 12px', display: 'flex', gap: 8, overflowX: 'auto' }}>
      {['전체', '풋살', '농구', '배드민턴', '테니스', '하키'].map((l, i) => (
        <Chip key={l} active={i === 0}>{l}</Chip>
      ))}
    </div>

    {/* 2-col grid */}
    <div style={{ padding: '0 32px 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, flex: 1, overflowY: 'auto' }}>
      {M09_TOURNAMENTS.concat(M09_TOURNAMENTS.slice(0, 1)).map((t, idx) => (
        <M09TournamentCard key={idx} t={t}/>
      ))}
    </div>
  </div>
);

/* ─────────────────────────────────────────
   m09-dt-main  (1280 × 820) — bracket dominant 3-col
   Left sidebar · Center bracket · Right detail panel
   Uses: M09BracketMatch, M09BracketConnector, M09PrizePool, MoneyRow, NumberDisplay
───────────────────────────────────────── */
const M09DesktopMain = () => (
  <div style={{ width: M09_DT_W, height: M09_DT_H, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'grid', gridTemplateColumns: '260px 1fr 320px', overflow: 'hidden' }}>
    {/* Left sidebar — tournament list */}
    <aside style={{ borderRight: '1px solid var(--grey100)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid var(--grey100)' }}>
        <div className="tm-text-body-lg" style={{ fontWeight: 700 }}>대회 목록</div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['풋살', '농구', '배드민턴'].map((l, i) => (
            <Chip key={l} active={i === 0} size="sm">{l}</Chip>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {M09_TOURNAMENTS.map((t, i) => (
          <div key={t.id} style={{
            padding: '12px', borderRadius: 'var(--r-md)', marginBottom: 8, cursor: 'pointer',
            background: i === 0 ? 'var(--blue-alpha-08)' : 'transparent',
            border: `1px solid ${i === 0 ? 'var(--blue200)' : 'transparent'}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <M09SportDot color={t.sportColor}/>
                <span className="tm-text-label" style={{ color: t.sportColor }}>{t.sport}</span>
              </div>
              <M09StatusChip status={t.status} label={t.statusLabel}/>
            </div>
            <div className="tm-text-label" style={{ color: 'var(--text-strong)', lineHeight: '18px' }}>{t.title}</div>
            <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>{t.date}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: 16, borderTop: '1px solid var(--grey100)' }}>
        <button className="tm-btn tm-btn-primary tm-btn-md tm-btn-block" style={{ minHeight: 44 }}>
          <Icon name="plus" size={16} aria-hidden="true"/> 대회 만들기
        </button>
      </div>
    </aside>

    {/* Center — bracket view */}
    <main style={{ padding: 24, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
        <div>
          <div className="tm-text-heading" style={{ fontWeight: 700 }}>강남 풋살 리그 시즌 3</div>
          <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>5월 10일 (토) · 잠실 풋살파크</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Badge tone="blue" size="sm">참가 신청 중</Badge>
          <Badge tone="grey" size="sm">8/8팀</Badge>
        </div>
      </div>

      {/* Bracket — QF + SF + Final */}
      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', display: 'flex', alignItems: 'center', gap: 0 }}>
        {/* Quarter-finals column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[[0,1],[2,3],[4,5],[6,7]].map(([a, b], i) => (
            <M09BracketMatch key={i}
              round="8강"
              team1={M09_BRACKET_TEAMS[a]}
              team2={M09_BRACKET_TEAMS[b]}
              score1={i < 2 ? 2 : undefined}
              score2={i < 2 ? 1 : undefined}
              winner={i < 2 ? 1 : undefined}
            />
          ))}
        </div>

        {/* Connectors QF → SF */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', height: '100%', padding: '8px 0' }}>
          {[0,1,2,3].map((i) => (
            <M09BracketConnector key={i} height={32}/>
          ))}
        </div>

        {/* Semi-finals column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 80, paddingTop: 40, paddingBottom: 40 }}>
          {[
            { t1: M09_BRACKET_TEAMS[0], t2: M09_BRACKET_TEAMS[2], s1: 1, s2: 0, w: 1 },
            { t1: M09_BRACKET_TEAMS[4], t2: M09_BRACKET_TEAMS[6] },
          ].map((m, i) => (
            <M09BracketMatch key={i}
              round="4강"
              team1={m.t1} team2={m.t2}
              score1={m.s1} score2={m.s2}
              winner={m.w}
            />
          ))}
        </div>

        {/* Connectors SF → F */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
          <M09BracketConnector height={80}/>
        </div>

        {/* Final column */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
          <M09BracketMatch
            round="결승"
            team1={M09_BRACKET_TEAMS[0]}
            team2="TBD"
          />
        </div>
      </div>
    </main>

    {/* Right panel — prize + payout + ops */}
    <aside style={{ borderLeft: '1px solid var(--grey100)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
      <div>
        <SectionTitle title="상금" sub="3개 순위"/>
        <M09PrizePool items={[
          { rank: '1위', amount: 200000 },
          { rank: '2위', amount: 70000 },
          { rank: '3위', amount: 30000 },
        ]}/>
      </div>
      <div>
        <SectionTitle title="정산 계좌"/>
        <M09PayoutAccountForm compact/>
        <button className="tm-btn tm-btn-outline tm-btn-md tm-btn-block" style={{ minHeight: 44, marginTop: 8 }}>계좌 인증</button>
      </div>
      <div style={{ borderTop: '1px solid var(--grey100)', paddingTop: 16 }}>
        <div className="tm-text-label" style={{ marginBottom: 8, fontWeight: 600, paddingLeft: 4 }}>운영 도구</div>
        {[
          { label: '라운드 진행', icon: 'trophy' },
          { label: '결과 분쟁 처리', icon: 'shield' },
          { label: '참가팀 관리', icon: 'people' },
        ].map((a) => (
          <ListItem key={a.label}
            leading={<Icon name={a.icon} size={18} color="var(--text-muted)" aria-hidden="true"/>}
            title={a.label}
            chev
          />
        ))}
      </div>
    </aside>
  </div>
);

/* ─────────────────────────────────────────
   m09-mb-detail  (375 × 812)
   대회 상세 + bracket 미리보기 + standings + MoneyRow prize
   Canonical: M09BracketMatch, M09PrizePool, M09StandingsRow, MoneyRow, NumberDisplay
───────────────────────────────────────── */
const M09MobileDetail = () => {
  const t = M09_TOURNAMENTS[0];
  return (
    <Phone>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopNav title="대회 상세"/>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Tournament hero section */}
          <div style={{
            padding: '20px 20px 16px',
            background: 'linear-gradient(160deg, var(--blue500) 0%, var(--blue700) 100%)',
            color: 'var(--static-white)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <M09SportDot color="var(--static-white)"/>
              <span className="tm-text-label" style={{ color: 'rgba(255,255,255,.8)' }}>{t.sport}</span>
              <M09StatusChip status={t.status} label={t.statusLabel}/>
            </div>
            <div className="tm-text-heading" style={{ color: 'var(--static-white)', marginBottom: 12 }}>{t.title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="calendar" size={14} aria-hidden="true"/>
                <span className="tm-text-caption" style={{ color: 'rgba(255,255,255,.88)' }}>{t.date}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="pin" size={14} aria-hidden="true"/>
                <span className="tm-text-caption" style={{ color: 'rgba(255,255,255,.88)' }}>{t.venue}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="people" size={14} aria-hidden="true"/>
                <span className="tm-text-caption" style={{ color: 'rgba(255,255,255,.88)' }}>{t.teams}/{t.maxTeams}팀 참가</span>
              </div>
            </div>
          </div>

          {/* KPI strip — NumberDisplay + KPIStat canonical */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--grey100)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div>
              <div className="tm-text-micro" style={{ color: 'var(--text-muted)', marginBottom: 4 }}>상금</div>
              <NumberDisplay value={t.prize} unit="원" size={20} sub="1위 기준"/>
            </div>
            <div>
              <div className="tm-text-micro" style={{ color: 'var(--text-muted)', marginBottom: 4 }}>참가비</div>
              <NumberDisplay value={t.fee} unit="원/팀" size={20}/>
            </div>
            <div>
              <div className="tm-text-micro" style={{ color: 'var(--text-muted)', marginBottom: 4 }}>방식</div>
              <div className="tm-text-caption" style={{ marginTop: 4, lineHeight: '16px' }}>{t.format}</div>
            </div>
          </div>

          {/* Bracket preview (mobile compact) */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--grey100)' }}>
            <SectionTitle title="대진표 미리보기" action="전체 보기"/>
            <div style={{ overflowX: 'auto', display: 'flex', gap: 0, paddingBottom: 4 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[[0,1],[2,3]].map(([a,b], i) => (
                  <M09BracketMatch key={i}
                    team1={M09_BRACKET_TEAMS[a]}
                    team2={M09_BRACKET_TEAMS[b]}
                  />
                ))}
              </div>
              <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 4px' }}>
                <div style={{ width: 12, height: 1, background: 'var(--border)' }}/>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <M09BracketMatch team1="TBD" team2="TBD"/>
              </div>
            </div>
          </div>

          {/* Standings */}
          <div style={{ borderBottom: '1px solid var(--grey100)' }}>
            <div style={{ padding: '16px 20px 8px' }}>
              <SectionTitle title="순위표" sub="리그 스테이지 진행 중"/>
            </div>
            {/* header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: 'var(--grey50)' }}>
              <span className="tm-text-micro" style={{ width: 20, color: 'var(--text-caption)' }}>#</span>
              <span className="tm-text-micro" style={{ flex: 1, color: 'var(--text-caption)' }}>팀</span>
              <span className="tm-text-micro" style={{ width: 20, color: 'var(--text-caption)', textAlign: 'center' }}>경</span>
              <span className="tm-text-micro" style={{ width: 20, color: 'var(--text-caption)', textAlign: 'center' }}>승</span>
              <span className="tm-text-micro" style={{ width: 20, color: 'var(--text-caption)', textAlign: 'center' }}>패</span>
              <span className="tm-text-micro" style={{ width: 24, color: 'var(--text-caption)', textAlign: 'right' }}>점</span>
            </div>
            {[
              { rank: 1, team: '팀 레드', played: 3, wins: 3, losses: 0, points: 9, highlight: true },
              { rank: 2, team: '팀 블루', played: 3, wins: 2, losses: 1, points: 6 },
              { rank: 3, team: '팀 그린', played: 3, wins: 1, losses: 2, points: 3 },
              { rank: 4, team: '팀 오렌지', played: 3, wins: 0, losses: 3, points: 0 },
            ].map((row) => (
              <M09StandingsRow key={row.rank} {...row}/>
            ))}
          </div>

          {/* Prize breakdown — MoneyRow canonical */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--grey100)' }}>
            <SectionTitle title="상금"/>
            <M09PrizePool items={[
              { rank: '1위', amount: 200000 },
              { rank: '2위', amount: 70000 },
              { rank: '3위', amount: 30000 },
            ]}/>
          </div>

          {/* Rules */}
          <div style={{ padding: '16px 20px' }}>
            <SectionTitle title="대회 규칙"/>
            <div className="tm-text-body" style={{ color: 'var(--text-muted)', lineHeight: '22px' }}>
              경기는 10분 2쿼터로 진행됩니다. 동점 시 연장전 없이 승부차기를 진행합니다.
              선수 교체는 자유롭게 가능하며, 한 팀 최소 4명이 있어야 경기 참가가 가능합니다.
            </div>
          </div>
        </div>

        {/* Sticky CTA */}
        <div style={{ padding: '12px 16px 24px', borderTop: '1px solid var(--grey100)', background: 'var(--bg)' }}>
          <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" style={{ minHeight: 52 }}>
            참가 신청 — {t.fee.toLocaleString('ko-KR')}원/팀
          </button>
        </div>
      </div>
    </Phone>
  );
};

/* ─────────────────────────────────────────
   m09-mb-create  (375 × 812)
   대회 만들기 form (3-step stepper)
───────────────────────────────────────── */
const M09MobileCreate = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TopNav title="대회 만들기"/>

      {/* Step indicator */}
      <div style={{ padding: '12px 20px', display: 'flex', gap: 8, alignItems: 'center' }}>
        {['기본 정보', '대진·상금', '정산 계좌'].map((label, i) => (
          <React.Fragment key={label}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 24, height: 24, borderRadius: 'var(--r-pill)',
                background: i === 0 ? 'var(--blue500)' : 'var(--grey200)',
                color: i === 0 ? 'var(--static-white)' : 'var(--text-muted)',
                display: 'grid', placeItems: 'center', fontWeight: 700,
              }} className="tm-text-micro">{i + 1}</div>
              <span className="tm-text-micro" style={{ fontWeight: 600, color: i === 0 ? 'var(--blue500)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>{label}</span>
            </div>
            {i < 2 && <div aria-hidden="true" style={{ flex: 1, height: 1, background: 'var(--grey200)', marginBottom: 16 }}/>}
          </React.Fragment>
        ))}
      </div>

      {/* Form fields — step 1, label+id pairs */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 24px', display: 'grid', gap: 16 }}>
        <div>
          <label htmlFor="m09c-name" className="tm-text-label" style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>대회명</label>
          <input id="m09c-name" className="tm-input" placeholder="예: 강남 풋살 리그 시즌 3" style={{ minHeight: 48 }}/>
        </div>
        <div>
          <label htmlFor="m09c-sport" className="tm-text-label" style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>종목</label>
          <div id="m09c-sport" className="tm-input" role="button" aria-haspopup="listbox" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            minHeight: 48, cursor: 'pointer',
          }}>
            <span className="tm-text-body" style={{ color: 'var(--text-placeholder)' }}>종목을 선택하세요</span>
            <Icon name="chevD" size={16} aria-hidden="true"/>
          </div>
        </div>
        <div>
          <label htmlFor="m09c-date" className="tm-text-label" style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>대회 일자</label>
          <input id="m09c-date" className="tm-input" placeholder="날짜 선택" type="date" style={{ minHeight: 48 }}/>
        </div>
        <div>
          <label htmlFor="m09c-venue" className="tm-text-label" style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>장소</label>
          <input id="m09c-venue" className="tm-input" placeholder="구장을 검색하세요" style={{ minHeight: 48 }}/>
        </div>
        <div>
          <label htmlFor="m09c-maxteams" className="tm-text-label" style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>최대 참가팀 수</label>
          <div id="m09c-maxteams" className="tm-input" role="button" aria-haspopup="listbox" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            minHeight: 48, cursor: 'pointer',
          }}>
            <span className="tm-text-body" style={{ color: 'var(--text-placeholder)' }}>팀 수 선택 (4/8/16/32)</span>
            <Icon name="chevD" size={16} aria-hidden="true"/>
          </div>
        </div>
        <div>
          <label htmlFor="m09c-fee" className="tm-text-label" style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>참가비 (팀당, 원)</label>
          <input id="m09c-fee" className="tm-input" placeholder="0" type="number" style={{ minHeight: 48 }}/>
        </div>
      </div>

      {/* CTA */}
      <div style={{ padding: '12px 16px 24px', borderTop: '1px solid var(--grey100)' }}>
        <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" style={{ minHeight: 52 }}>다음</button>
      </div>
    </div>
  </Phone>
);

/* ─────────────────────────────────────────
   m09-mb-flow-bracket  (375 × 812)
   Bracket 진행 화면 + 순위표 + MoneyRow 상금 분배
   Canonical: TournamentsStateEdgeBoard layout + M09BracketMatch, M09StandingsRow, MoneyRow
───────────────────────────────────────── */
const M09MobileFlowBracket = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TopNav title="대진표 진행"/>

      {/* Round tabs */}
      <div style={{ padding: '8px 20px', display: 'flex', gap: 8, borderBottom: '1px solid var(--grey100)', overflowX: 'auto' }}>
        {['8강', '4강', '결승'].map((r, i) => (
          <Chip key={r} active={i === 0} size="sm">{r}</Chip>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 24 }}>
        {/* Match list */}
        <div style={{ padding: '12px 16px', display: 'grid', gap: 12 }}>
          {[
            { id: 'qf1', t1: '팀 레드', t2: '팀 블루', s1: 2, s2: 1, winner: 1, done: true },
            { id: 'qf2', t1: '팀 그린', t2: '팀 오렌지', s1: 1, s2: 2, winner: 2, done: true },
            { id: 'qf3', t1: '팀 퍼플', t2: '팀 틸', done: false },
            { id: 'qf4', t1: '팀 옐로', t2: '팀 핑크', done: false },
          ].map((m) => (
            <div key={m.id} className="tm-card" style={{ padding: 0 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--grey100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="tm-text-label">8강 경기</span>
                {m.done
                  ? <Badge tone="grey" size="sm">종료</Badge>
                  : <Badge tone="orange" size="sm">진행 예정</Badge>}
              </div>
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { name: m.t1, score: m.s1, won: m.winner === 1 },
                  { name: m.t2, score: m.s2, won: m.winner === 2 },
                ].map((p, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 12px', borderRadius: 'var(--r-sm)',
                    background: p.won ? 'var(--blue-alpha-08)' : 'var(--grey50)',
                  }}>
                    <span className="tm-text-body" style={{ fontWeight: p.won ? 700 : 400, color: p.won ? 'var(--blue500)' : 'var(--text-strong)' }}>{p.name}</span>
                    <span className="tm-text-body-lg tab-num">{p.score ?? '-'}</span>
                  </div>
                ))}
                {!m.done && (
                  <button className="tm-btn tm-btn-outline tm-btn-md tm-btn-block" style={{ marginTop: 4, minHeight: 44 }}>
                    결과 입력
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Standings section */}
        <div style={{ marginTop: 8 }}>
          <SectionTitle title="현재 순위표" sub="8강 라운드"/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: 'var(--grey50)' }}>
            <span className="tm-text-micro" style={{ width: 20, color: 'var(--text-caption)' }}>#</span>
            <span className="tm-text-micro" style={{ flex: 1, color: 'var(--text-caption)' }}>팀</span>
            <span className="tm-text-micro" style={{ width: 20, color: 'var(--text-caption)', textAlign: 'center' }}>경</span>
            <span className="tm-text-micro" style={{ width: 20, color: 'var(--text-caption)', textAlign: 'center' }}>승</span>
            <span className="tm-text-micro" style={{ width: 20, color: 'var(--text-caption)', textAlign: 'center' }}>패</span>
            <span className="tm-text-micro" style={{ width: 24, color: 'var(--text-caption)', textAlign: 'right' }}>점</span>
          </div>
          {[
            { rank: 1, team: '팀 레드', played: 2, wins: 2, losses: 0, points: 6, highlight: true },
            { rank: 2, team: '팀 오렌지', played: 2, wins: 1, losses: 1, points: 3 },
            { rank: 3, team: '팀 블루', played: 2, wins: 1, losses: 1, points: 3 },
            { rank: 4, team: '팀 그린', played: 2, wins: 0, losses: 2, points: 0 },
          ].map((row) => <M09StandingsRow key={row.rank} {...row}/>)}
        </div>

        {/* Prize split — MoneyRow canonical */}
        <div style={{ padding: '16px 20px', marginTop: 8, borderTop: '8px solid var(--grey50)' }}>
          <SectionTitle title="상금 분배"/>
          <MoneyRow label="🥇 1위 상금" amount={200000} accent strong/>
          <MoneyRow label="🥈 2위 상금" amount={70000}/>
          <MoneyRow label="🥉 3위 상금" amount={30000}/>
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 4 }}>
            <MoneyRow label="총 상금" amount={300000} strong/>
          </div>
        </div>
      </div>
    </div>
  </Phone>
);

/* ─────────────────────────────────────────
   m09-mb-state-loading  (375 × 812)
   Skeleton shimmer — mirrors M09MobileMain wireframe
───────────────────────────────────────── */
const M09MobileStateLoading = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* AppBar skeleton */}
      <div style={{ padding: '8px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton w={48} h={24} r={8}/>
        <div style={{ display: 'flex', gap: 8 }}>
          <Skeleton w={44} h={44} r={8}/>
          <Skeleton w={80} h={44} r={8}/>
        </div>
      </div>
      {/* Chip row skeleton */}
      <div style={{ padding: '4px 20px 8px', display: 'flex', gap: 8 }}>
        {[48, 40, 48, 56, 40].map((w, i) => <Skeleton key={i} w={w} h={32} r="var(--r-pill)"/>)}
      </div>
      {/* Card skeletons */}
      <div style={{ flex: 1, padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="tm-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Skeleton w={8} h={8} r="var(--r-pill)"/>
                <Skeleton w={40} h={16} r={8}/>
              </div>
              <Skeleton w={64} h={20} r="var(--r-pill)"/>
            </div>
            <Skeleton h={20} w="80%" r={8}/>
            <div style={{ display: 'flex', gap: 12 }}>
              <Skeleton w={72} h={14} r={4}/>
              <Skeleton w={88} h={14} r={4}/>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 4 }}>
              <Skeleton h={36} r={8}/>
              <Skeleton h={36} r={8}/>
              <Skeleton h={36} r={8}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  </Phone>
);

/* ─────────────────────────────────────────
   m09-mb-state-empty  (375 × 812)
   EmptyState canonical — same wireframe as M09MobileMain
───────────────────────────────────────── */
const M09MobileStateEmpty = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TopNav title="대회"/>
      {/* Sport filter chips (neutral, nothing selected) */}
      <div style={{ padding: '4px 20px 8px', display: 'flex', gap: 8, overflowX: 'auto' }}>
        {['전체', '풋살', '농구', '배드민턴'].map((l) => (
          <Chip key={l} size="sm">{l}</Chip>
        ))}
      </div>
      {/* Empty state */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 32px' }}>
        <EmptyState
          icon={<Icon name="trophy" size={36} color="var(--text-caption)" aria-hidden="true"/>}
          title="아직 열린 대회가 없어요"
          sub="종목 필터를 바꾸거나 직접 대회를 만들어보세요"
          cta="대회 만들기"
        />
        <button className="tm-btn tm-btn-outline tm-btn-md tm-btn-block" style={{ minHeight: 44, marginTop: 12 }}>
          종목 필터 변경
        </button>
      </div>
      <BottomNav active="matches"/>
    </div>
  </Phone>
);

/* ─────────────────────────────────────────
   m09-mb-state-deadline  (375 × 812)
   마감 임박 — urgent banner + countdown + accept CTA
   Canonical: TournamentsStateCard (deadline state) + M09TournamentCard compact
───────────────────────────────────────── */
const M09MobileStateDeadline = () => {
  const t = M09_TOURNAMENTS[0];
  return (
    <Phone>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopNav title="대회 상세"/>

        {/* Deadline urgent banner — uses var(--orange*) tokens, no raw hex */}
        <div style={{
          margin: '12px 16px 0', padding: '12px 16px', borderRadius: 'var(--r-md)',
          background: 'var(--orange50)', border: '1px solid var(--orange500)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Icon name="clock" size={16} color="var(--orange500)" aria-hidden="true"/>
          <span className="tm-text-label" style={{ color: 'var(--orange500)' }}>
            신청 마감까지 <span className="tab-num">2시간 14분</span> 남았어요
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <M09SportDot color={t.sportColor}/>
            <span className="tm-text-label" style={{ color: t.sportColor }}>{t.sport}</span>
            <M09StatusChip status="deadline" label="마감 임박"/>
          </div>
          <div className="tm-text-heading" style={{ marginBottom: 12, fontWeight: 700 }}>{t.title}</div>

          {/* Urgency progress */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="tm-text-caption">참가팀</span>
              <span className="tm-text-label tab-num" style={{ color: 'var(--red500)' }}>{t.teams}/{t.maxTeams}</span>
            </div>
            <Progress value={t.teams} max={t.maxTeams} urgent/>
          </div>

          {/* Accept countdown — uses TournamentsStateCard vocabulary */}
          <div className="tm-card" style={{ padding: 16, marginBottom: 16 }}>
            <div className="tm-text-label" style={{ color: 'var(--text-muted)', marginBottom: 8 }}>접수 마감</div>
            <NumberDisplay value="23:59" unit="까지" size={28} sub="오늘 23:59 · D-0"/>
            <button className="tm-btn tm-btn-danger tm-btn-lg tm-btn-block" style={{ minHeight: 52, marginTop: 16 }}>
              지금 신청하기 — {t.fee.toLocaleString('ko-KR')}원/팀
            </button>
          </div>

          <M09TournamentCard t={{ ...t, status: 'deadline', statusLabel: '마감 임박' }} compact/>
        </div>
      </div>
    </Phone>
  );
};

/* ─────────────────────────────────────────
   m09-mb-state-sold-out  (375 × 812)
   접수 마감 — disabled CTA + 비슷한 대회 추천
   Canonical: M09TournamentCard + M09StatusChip sold-out + Progress full
───────────────────────────────────────── */
const M09MobileStateSoldOut = () => {
  const t = M09_TOURNAMENTS[2];
  return (
    <Phone>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopNav title="대회 상세"/>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <M09SportDot color={t.sportColor}/>
            <span className="tm-text-label" style={{ color: t.sportColor }}>{t.sport}</span>
            <M09StatusChip status="sold-out" label="접수 마감"/>
          </div>
          <div className="tm-text-heading" style={{ marginBottom: 12, fontWeight: 700 }}>{t.title}</div>

          {/* Closed notice — uses var(--grey*) tokens */}
          <div style={{
            padding: '16px', borderRadius: 'var(--r-md)',
            background: 'var(--grey50)', border: '1px solid var(--grey200)',
            textAlign: 'center', marginBottom: 16,
          }}>
            <Icon name="people" size={24} color="var(--grey400)" aria-hidden="true"/>
            <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>
              {t.teams}/{t.maxTeams}팀 · 신청이 마감되었어요
            </div>
          </div>

          {/* Full fill bar */}
          <div style={{ marginBottom: 16 }}>
            <Progress value={t.maxTeams} max={t.maxTeams}/>
          </div>

          <M09TournamentCard t={t} compact/>

          {/* Similar tournaments */}
          <div style={{ marginTop: 24 }}>
            <SectionTitle title="비슷한 대회"/>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {M09_TOURNAMENTS.filter(x => x.id !== t.id && x.status !== 'sold-out').map((tr) => (
                <M09TournamentCard key={tr.id} t={tr} compact/>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 16px 24px', borderTop: '1px solid var(--grey100)', background: 'var(--bg)' }}>
          <button className="tm-btn tm-btn-neutral tm-btn-lg tm-btn-block" style={{ minHeight: 52 }} disabled aria-disabled="true">
            신청 마감
          </button>
        </div>
      </div>
    </Phone>
  );
};

/* ─────────────────────────────────────────
   m09-mb-components  (375 × 812)
   M09 primitives inventory — canonical component instances
   Uses: M09TournamentCard, M09StatusChip, M09BracketMatch, M09PrizePool,
         M09StandingsRow, M09PayoutAccountForm, MoneyRow, NumberDisplay, Skeleton
───────────────────────────────────────── */
const M09MobileComponents = () => (
  <div style={{ width: M09_MB_W, height: M09_MB_H, background: 'var(--bg)', padding: 20, fontFamily: 'var(--font)', overflowY: 'auto' }}>
    <Badge tone="blue" size="sm">m09-mb-components</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M09 모바일 · 사용 컴포넌트</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>대회 화면이 사용하는 canonical primitives 인벤토리</div>

    <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
      <ComponentSwatch label="M09TournamentCard · full">
        <M09TournamentCard t={M09_TOURNAMENTS[0]}/>
      </ComponentSwatch>

      <ComponentSwatch label="M09TournamentCard · compact (sold-out)">
        <M09TournamentCard t={M09_TOURNAMENTS[2]} compact/>
      </ComponentSwatch>

      <ComponentSwatch label="M09StatusChip · 5 states">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <M09StatusChip status="open" label="참가 신청 중"/>
          <M09StatusChip status="deadline" label="마감 임박"/>
          <M09StatusChip status="sold-out" label="접수 마감"/>
          <M09StatusChip status="ongoing" label="진행 중"/>
          <M09StatusChip status="completed" label="종료"/>
        </div>
      </ComponentSwatch>

      <ComponentSwatch label="M09BracketMatch · 완료 / 대기">
        <div style={{ display: 'flex', gap: 8 }}>
          <M09BracketMatch team1="팀 레드" team2="팀 블루" score1={2} score2={1} winner={1}/>
          <M09BracketMatch team1="팀 그린" team2="TBD"/>
        </div>
      </ComponentSwatch>

      <ComponentSwatch label="M09StandingsRow (순위표 행)">
        <div style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
          <M09StandingsRow rank={1} team="팀 레드" played={3} wins={3} losses={0} points={9} highlight/>
          <M09StandingsRow rank={2} team="팀 블루" played={3} wins={2} losses={1} points={6}/>
        </div>
      </ComponentSwatch>

      <ComponentSwatch label="M09PrizePool (MoneyRow 기반)">
        <div style={{ width: '100%' }}>
          <M09PrizePool items={[
            { rank: '1위', amount: 200000 },
            { rank: '2위', amount: 70000 },
            { rank: '3위', amount: 30000 },
          ]}/>
        </div>
      </ComponentSwatch>

      <ComponentSwatch label="NumberDisplay · 대회 KPI">
        <div style={{ display: 'flex', gap: 24 }}>
          <NumberDisplay value={31} unit="팀" size={28} sub="32팀 마감"/>
          <NumberDisplay value={300000} unit="원" size={28} sub="총 상금"/>
        </div>
      </ComponentSwatch>

      <ComponentSwatch label="MoneyRow · 상금 분배">
        <div style={{ width: '100%' }}>
          <MoneyRow label="🥇 1위 상금" amount={200000} accent strong/>
          <MoneyRow label="🥈 2위 상금" amount={70000}/>
          <MoneyRow label="🥉 3위 상금" amount={30000}/>
        </div>
      </ComponentSwatch>

      <ComponentSwatch label="M09PayoutAccountForm">
        <div style={{ width: '100%' }}>
          <M09PayoutAccountForm compact/>
        </div>
      </ComponentSwatch>

      <ComponentSwatch label="Progress · normal / urgent">
        <div style={{ width: '100%', display: 'grid', gap: 8 }}>
          <Progress value={6} max={8}/>
          <Progress value={8} max={8} urgent/>
        </div>
      </ComponentSwatch>

      <ComponentSwatch label="종목 필터 칩">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['전체', '풋살', '농구', '배드민턴'].map((l, i) => (
            <Chip key={l} active={i === 0} size="sm">{l}</Chip>
          ))}
        </div>
      </ComponentSwatch>

      <ComponentSwatch label="Button · CTA variants">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="tm-btn tm-btn-primary tm-btn-md" style={{ minHeight: 44 }}>참가 신청</button>
          <button className="tm-btn tm-btn-danger tm-btn-md" style={{ minHeight: 44 }}>지금 신청</button>
          <button className="tm-btn tm-btn-neutral tm-btn-md" style={{ minHeight: 44 }} disabled>마감</button>
          <button className="tm-btn tm-btn-outline tm-btn-md" style={{ minHeight: 44 }}>결과 입력</button>
        </div>
      </ComponentSwatch>

      <ComponentSwatch label="Skeleton · 카드 로딩 shimmer">
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton h={20} w="70%" r={8}/>
          <Skeleton h={16} w="90%" r={6}/>
          <div style={{ display: 'flex', gap: 8 }}>
            <Skeleton w={60} h={32} r={8}/>
            <Skeleton w={60} h={32} r={8}/>
            <Skeleton w={60} h={32} r={8}/>
          </div>
        </div>
      </ComponentSwatch>

      <ComponentSwatch label="아이콘 · 대회 화면 사용 (trophy/shield/calendar/clock/people)">
        <div style={{ display: 'flex', gap: 16 }}>
          {['trophy', 'shield', 'calendar', 'clock', 'people', 'filter', 'plus'].map((n) => (
            <Icon key={n} name={n} size={20} color="var(--grey700)" aria-hidden="true"/>
          ))}
        </div>
      </ComponentSwatch>
    </div>
  </div>
);

/* ─────────────────────────────────────────
   m09-mb-assets  (375 × 812)
   M09 token inventory — sport accent + bracket semantics + type scale
───────────────────────────────────────── */
const M09MobileAssets = () => (
  <div style={{ width: M09_MB_W, height: M09_MB_H, background: 'var(--bg)', padding: 20, fontFamily: 'var(--font)', overflowY: 'auto' }}>
    <Badge tone="blue" size="sm">m09-mb-assets</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M09 모바일 · 디자인 토큰</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>대회 화면이 실제 사용하는 토큰 인벤토리</div>

    <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
      <AssetSwatch label="Color · tournament gradient header">
        <ColorSwatch token="blue500" value="var(--blue500)"/>
        <ColorSwatch token="blue700" value="var(--blue700)"/>
        <ColorSwatch token="blue50" value="var(--blue50)"/>
        <ColorSwatch token="blue100" value="var(--blue100)"/>
      </AssetSwatch>

      <AssetSwatch label="Color · prize tone (상금/정산)">
        <ColorSwatch token="blue-alpha-08 (winner bg)" value="var(--blue-alpha-08)"/>
        <ColorSwatch token="blue50 (1위 prize)" value="var(--blue50)"/>
        <ColorSwatch token="orange50 (deadline)" value="var(--orange50)"/>
        <ColorSwatch token="orange500 (urgent)" value="var(--orange500)"/>
        <ColorSwatch token="red50 (sold-out)" value="var(--red50)"/>
        <ColorSwatch token="red500 (danger CTA)" value="var(--red500)"/>
      </AssetSwatch>

      <AssetSwatch label="Color · sportCardAccent (대회 종목 dot)">
        <ColorSwatch token="futsal · blue500" value="var(--blue500)"/>
        <ColorSwatch token="basketball · orange500" value="var(--orange500)"/>
        <ColorSwatch token="badminton · green500" value="var(--green500)"/>
        <ColorSwatch token="tennis · purple500" value="var(--purple500)"/>
        <ColorSwatch token="hockey · teal500" value="var(--teal500)"/>
      </AssetSwatch>

      <AssetSwatch label="Color · neutral hierarchy">
        <ColorSwatch token="grey50" value="var(--grey50)"/>
        <ColorSwatch token="grey100" value="var(--grey100)"/>
        <ColorSwatch token="grey150" value="var(--grey150)"/>
        <ColorSwatch token="grey200" value="var(--grey200)"/>
        <ColorSwatch token="grey400" value="var(--grey400)"/>
      </AssetSwatch>

      <AssetSwatch label="Color · bracket semantics">
        <ColorSwatch token="blue-alpha-08 (winner row)" value="var(--blue-alpha-08)"/>
        <ColorSwatch token="border (match cell outline)" value="var(--border)"/>
        <ColorSwatch token="grey50 (pending row bg)" value="var(--grey50)"/>
      </AssetSwatch>

      <AssetSwatch label="Type scale · 대회 화면 사용">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="tm-text-heading">heading — 대회명</span>
          <span className="tm-text-subhead">subhead — 섹션 타이틀</span>
          <span className="tm-text-body-lg">body-lg — 카드 타이틀</span>
          <span className="tm-text-label">label — 종목명 / 상태 텍스트</span>
          <span className="tm-text-caption">caption — 날짜 / 장소 / 메타</span>
          <span className="tm-text-micro">micro — 보조 레이블 / 칩</span>
        </div>
      </AssetSwatch>

      <AssetSwatch label="Spacing · 4-multiple">
        {[4, 8, 12, 16, 20, 24, 32, 40, 48].map((n) => (
          <Badge key={n} tone="grey" size="sm">{`${n}px`}</Badge>
        ))}
      </AssetSwatch>

      <AssetSwatch label="Radius">
        <Badge tone="grey" size="sm">r-sm 8px · bracket row</Badge>
        <Badge tone="grey" size="sm">r-md 12px · card</Badge>
        <Badge tone="grey" size="sm">r-lg 16px · hero card</Badge>
        <Badge tone="grey" size="sm">r-pill · badge/chip/status/dot</Badge>
      </AssetSwatch>

      <AssetSwatch label="Motion token">
        <Badge tone="grey" size="sm">dur-fast 120ms · tap scale(.98)</Badge>
        <Badge tone="grey" size="sm">dur-base 180ms · bracket node hover</Badge>
        <Badge tone="grey" size="sm">dur-slow 280ms · standings reorder</Badge>
        <Badge tone="grey" size="sm">ease-out-quart</Badge>
      </AssetSwatch>
    </div>
  </div>
);

/* ─────────────────────────────────────────
   m09-mb-motion  (375 × 812)
   Motion contract — uses TournamentsMotionContractBoard vocabulary
───────────────────────────────────────── */
const M09MobileMotion = () => (
  <div style={{ width: M09_MB_W, height: M09_MB_H, background: 'var(--bg)', padding: 20, fontFamily: 'var(--font)' }}>
    <Badge tone="blue" size="sm">m09-mb-motion</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M09 모바일 · 모션 계약</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>대진표, 순위표, 상금 분배 화면의 micro-interaction 가이드</div>
    <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
      <ListItem
        title="Bracket node hover"
        sub="경기 카드 hover → scale(.99) border-color transition-colors 120ms ease-out-quart"
        trailing="hover"
      />
      <ListItem
        title="Standings reorder"
        sub="순위 변경 → translateY + opacity 280ms ease-out-quint. prefers-reduced-motion → 즉시 교체"
        trailing="reorder"
      />
      <ListItem
        title="Accept countdown pulse"
        sub="마감 임박 배너 → badge-pulse 1.5s ease infinite. 감소: animation: none"
        trailing="urgent"
      />
      <ListItem
        title="Round tab switch"
        sub="8강↔4강↔결승 탭 → slide-x + opacity 160ms. snap-type: x mandatory"
        trailing="tab"
      />
      <ListItem
        title="Result input confirm"
        sub="결과 제출 → checkmark scale-in 300ms + toast-up 280ms"
        trailing="confirm"
      />
      <ListItem
        title="Prize reveal"
        sub="M09PrizePool 등장 → stagger fade-in-up 40ms 단위"
        trailing="prize"
      />
      <ListItem
        title="Form step transition"
        sub="대회 만들기 단계 → translateX + opacity 280ms ease-out-quint"
        trailing="step"
      />
      <ListItem
        title="Skeleton shimmer"
        sub="리스트 로딩 → sk-shimmer 1.4s linear infinite"
        trailing="load"
      />
      <ListItem
        title="Card tap"
        sub="M09TournamentCard → scale(.98) 120ms. 손가락 떼면 복원"
        trailing="tap"
      />
      <ListItem
        title="Sticky CTA"
        sub="상세 스크롤 시 하단 CTA 고정 유지. Y 트랜지션 없음 — 즉각 반응"
        trailing="cta"
      />
      <ListItem
        title="Reduced motion"
        sub="prefers-reduced-motion: reduce → 모든 transition: 0.01ms"
        trailing="a11y"
      />
    </div>
  </div>
);

/* ─────────────────────────────────────────
   Object.assign export (fix32 convention)
───────────────────────────────────────── */
Object.assign(window, {
  /* main boards */
  M09MobileMain,
  M09TabletMain,
  M09DesktopMain,
  /* detail */
  M09MobileDetail,
  /* create */
  M09MobileCreate,
  /* flow */
  M09MobileFlowBracket,
  /* states */
  M09MobileStateLoading,
  M09MobileStateEmpty,
  M09MobileStateDeadline,
  M09MobileStateSoldOut,
  /* design system */
  M09MobileComponents,
  M09MobileAssets,
  M09MobileMotion,
  /* shared sub-atoms (M09-prefixed, reusable across M09 boards) */
  M09TournamentCard,
  M09StatusChip,
  M09BracketMatch,
  M09PrizePool,
  M09PayoutAccountForm,
  M09SportDot,
  M09BracketConnector,
  M09StandingsRow,
  /* backward compat aliases for any external references */
  TournamentCard: M09TournamentCard,
  TournamentStatusBadge: M09StatusChip,
  BracketMatch: M09BracketMatch,
  PrizePool: M09PrizePool,
  PayoutAccountForm: M09PayoutAccountForm,
  SportDot: M09SportDot,
  BracketConnector: M09BracketConnector,
});
