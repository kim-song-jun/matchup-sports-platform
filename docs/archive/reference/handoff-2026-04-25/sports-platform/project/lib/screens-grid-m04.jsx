/* fix32 — M04 팀·팀매칭 grid.
   ID schema: m04-{mb|tb|dt}-{main|detail|create|flow|state|components|assets|motion}[-{sub}]
   Light-only. All helpers prefixed M04 to prevent Babel single-scope collisions.
   Canonical components used directly: TeamMatchesList, TeamMatchDetail, TeamDetail,
   TeamMatchCard, GradeBadge, TeamMembers, TeamMatchHistory, Skeleton, EmptyState,
   ListItem, StatBar, StackedAvatars, MoneyRow, NumberDisplay, SectionTitle */

/* ---------- Dimensions ---------- */
const M04_MB_W = 375;
const M04_MB_H = 812;
const M04_TB_W = 768;
const M04_TB_H = 1024;
const M04_DT_W = 1280;
const M04_DT_H = 820;

/* ---------- M04-local helpers (prefix prevents collision) ---------- */

/* Role chip — owner/manager/member */
const M04RoleChip = ({ role }) => {
  const map = {
    owner:   { label: '팀장',   bg: 'var(--grey900)', fg: 'var(--static-white)' },
    manager: { label: '매니저', bg: 'var(--blue50)',   fg: 'var(--blue500)'     },
    member:  { label: '멤버',   bg: 'var(--grey100)', fg: 'var(--grey700)'     },
  };
  const r = map[role] || map.member;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      height: 20, padding: '0 7px', borderRadius: 9999,
      background: r.bg, color: r.fg,
      fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap',
    }}>
      <span className="tm-text-micro" style={{ color: 'inherit', fontWeight: 'inherit' }}>{r.label}</span>
    </span>
  );
};

/* My-team pill for the horizontal scroll row in main */
const M04MyTeamPill = ({ team }) => (
  <div style={{
    flexShrink: 0, padding: '10px 14px',
    background: 'var(--grey50)', border: '1px solid var(--grey100)',
    borderRadius: 14, display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 4, minWidth: 84,
    cursor: 'pointer',
  }}>
    <div style={{
      width: 40, height: 40, borderRadius: 12,
      background: team.color, display: 'grid', placeItems: 'center', fontSize: 'var(--fs-subhead)',
    }}>{team.logo}</div>
    <div className="tm-text-micro" style={{
      fontWeight: 600, color: 'var(--text-strong)',
      textAlign: 'center', maxWidth: 72,
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }}>{team.name}</div>
    <M04RoleChip role={team.role}/>
  </div>
);

/* Section heading used inside boards */
const M04BoardTitle = ({ label, sub }) => (
  <div style={{ marginBottom: 16 }}>
    <div className="tm-text-heading">{label}</div>
    {sub && <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
  </div>
);

/* Swatch wrapper for components board */
const M04Swatch = ({ label, children }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', gap: 8,
    padding: 12, borderRadius: 12,
    background: 'var(--grey50)', border: '1px solid var(--grey100)',
  }}>
    <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</div>
  </div>
);

/* Color tile for assets board */
const M04ColorTile = ({ token, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
    <div style={{
      width: 36, height: 36, borderRadius: 8,
      background: value, border: '1px solid var(--grey100)',
    }}/>
    <div className="tm-text-micro tm-tabular" style={{ color: 'var(--text-caption)' }}>{token}</div>
  </div>
);

/* 星-rating row used in eval board */
const M04StarRow = ({ label, value, max = 5 }) => {
  const pct = (value / max) * 100;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className="tm-text-label" style={{ width: 76, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 8, background: 'var(--grey150)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{
          width: pct + '%', height: '100%',
          background: 'var(--blue500)', borderRadius: 999,
          transition: 'width var(--dur-slow) var(--ease-out-quart)',
        }}/>
      </div>
      <div className="tm-text-label tm-tabular" style={{ width: 20, textAlign: 'right', color: 'var(--blue500)' }}>{value}</div>
    </div>
  );
};

/* Local fixture — my teams */
const M04_MY_TEAMS = [
  { id: 1, name: 'FC 발빠른놈들', sport: '축구',     members: 24, level: 'B', role: 'owner',  manner: 4.8, logo: '⚽', color: 'var(--blue500)' },
  { id: 2, name: '다이나믹 FS',   sport: '풋살',     members: 14, level: 'B', role: 'member', manner: 4.6, logo: '🔥', color: 'var(--red500)' },
];

const M04_EVAL_ITEMS = [
  { key: 'manner',   label: '매너·태도',  value: 4, max: 5 },
  { key: 'skill',    label: '실력',       value: 4, max: 5 },
  { key: 'fair',     label: '페어플레이', value: 5, max: 5 },
  { key: 'uniform',  label: '복장·용품',  value: 3, max: 5 },
  { key: 'venue',    label: '구장 관리',  value: 4, max: 5 },
  { key: 'punctual', label: '시간 준수',  value: 5, max: 5 },
];

const M04_GRADES = ['S', 'A', 'B', 'C', 'D'];

const M04_SPORT_FILTERS = [
  { id: 'all',       label: '전체' },
  { id: 'soccer',    label: '축구' },
  { id: 'futsal',    label: '풋살' },
  { id: 'basketball',label: '농구' },
  { id: 'badminton', label: '배드민턴' },
];

/* ─────────────────────────────────────────────
   m04-mb-main — TeamMatchesList canonical
───────────────────────────────────────────── */
const M04MobileMain = () => (
  <TeamMatchesList/>
);

/* ─────────────────────────────────────────────
   m04-tb-main — 2-column team list
───────────────────────────────────────────── */
const M04TabletMain = () => (
  <div style={{
    width: M04_TB_W, height: M04_TB_H,
    background: 'var(--bg)', display: 'flex', flexDirection: 'column',
    fontFamily: 'var(--font)', overflow: 'hidden',
  }}>
    <div style={{
      padding: '20px 32px', display: 'flex',
      justifyContent: 'space-between', alignItems: 'center',
      borderBottom: '1px solid var(--grey100)',
    }}>
      <div className="tm-text-subhead">팀 매칭</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="tm-btn tm-btn-outline tm-btn-md" aria-label="검색">
          <Icon name="search" size={16}/> 검색
        </button>
        <button className="tm-btn tm-btn-primary tm-btn-md">
          <Icon name="plus" size={16} color="var(--static-white)"/> 팀 매칭 만들기
        </button>
      </div>
    </div>
    <div style={{ padding: '16px 32px 12px', display: 'flex', gap: 8, overflow: 'auto' }}>
      {M04_SPORT_FILTERS.map((f, i) => (
        <Chip key={f.id} active={i === 0}>{f.label}</Chip>
      ))}
      {['S급', 'A급', 'B급'].map(g => <Chip key={g}>{g}</Chip>)}
    </div>
    <div style={{
      padding: '4px 32px 32px', flex: 1,
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, overflowY: 'auto',
    }}>
      {TEAM_MATCHES.concat(TEAM_MATCHES).map((tm, idx) => (
        <TeamMatchCard key={idx} tm={tm}/>
      ))}
    </div>
  </div>
);

/* ─────────────────────────────────────────────
   m04-dt-main — 3-col workspace
───────────────────────────────────────────── */
const M04DesktopMain = () => (
  <div style={{
    width: M04_DT_W, height: M04_DT_H,
    background: 'var(--bg)', fontFamily: 'var(--font)',
    display: 'grid', gridTemplateColumns: '240px 1fr 300px', overflow: 'hidden',
  }}>
    {/* left sidebar */}
    <aside style={{
      borderRight: '1px solid var(--grey100)',
      padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'var(--blue500)', color: 'var(--static-white)',
          display: 'grid', placeItems: 'center', fontWeight: 800,
        }}>T</div>
        <div className="tm-text-body-lg">Teameet</div>
      </div>
      <nav style={{ display: 'grid', gap: 4 }}>
        {[['홈', false], ['매치', false], ['팀', true], ['장터', false], ['더보기', false]].map(([l, a]) => (
          <button key={l} className={`tm-btn tm-btn-md ${a ? 'tm-btn-secondary' : 'tm-btn-ghost'}`}
            style={{ justifyContent: 'flex-start' }}>{l}</button>
        ))}
      </nav>
      <div style={{ marginTop: 8 }}>
        <div className="tm-text-label" style={{ marginBottom: 8, color: 'var(--text-muted)' }}>내 팀</div>
        {M04_MY_TEAMS.map(t => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 0', borderBottom: '1px solid var(--grey100)',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: t.color, display: 'grid', placeItems: 'center',
              fontSize: 'var(--fs-body)', flexShrink: 0,
            }}>{t.logo}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tm-text-caption" style={{
                fontWeight: 600, color: 'var(--text-strong)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{t.name}</div>
            </div>
            <M04RoleChip role={t.role}/>
          </div>
        ))}
      </div>
    </aside>

    {/* main content */}
    <main style={{
      padding: 32, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-end', marginBottom: 16,
      }}>
        <div>
          <div className="tm-text-title">팀 매칭 찾기</div>
          <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
            종목·등급·지역 맞춤 팀 매칭 {TEAM_MATCHES.length}개
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="tm-btn tm-btn-outline tm-btn-md">필터</button>
          <button className="tm-btn tm-btn-primary tm-btn-md">팀 매칭 만들기</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {M04_SPORT_FILTERS.map((f, i) => (
          <Chip key={f.id} active={i === 0} size="sm">{f.label}</Chip>
        ))}
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 16, overflowY: 'auto', flex: 1,
      }}>
        {TEAM_MATCHES.map(tm => <TeamMatchCard key={tm.id} tm={tm}/>)}
      </div>
    </main>

    {/* right panel */}
    <aside style={{
      borderLeft: '1px solid var(--grey100)',
      padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
      overflowY: 'auto',
    }}>
      <div className="tm-text-label">내 팀 현황</div>
      {M04_MY_TEAMS.map(t => (
        <Card key={t.id} pad={14}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: t.color, display: 'grid', placeItems: 'center', fontSize: 'var(--fs-subhead)',
            }}>{t.logo}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tm-text-label" style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{t.name}</div>
              <div className="tm-text-caption">{t.sport} · {t.members}명</div>
            </div>
            <GradeBadge grade={t.level}/>
          </div>
        </Card>
      ))}
      <div className="tm-text-label">진행 중 팀 매치</div>
      {TEAM_MATCHES.slice(0, 2).map(tm => (
        <Card key={tm.id} pad={14}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
            <GradeBadge grade={tm.grade}/>
            <Badge tone="grey" size="sm">{tm.sport}</Badge>
          </div>
          <div className="tm-text-label" style={{ marginBottom: 4, color: 'var(--text-strong)' }}>{tm.host}</div>
          <div className="tm-text-caption">{tm.date} {tm.time}</div>
        </Card>
      ))}
    </aside>
  </div>
);

/* ─────────────────────────────────────────────
   m04-mb-detail — TeamMatchDetail + TeamDetail canonical
───────────────────────────────────────────── */
const M04MobileDetail = () => {
  const [view, setView] = React.useState('match');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'flex-start' }}>
      {/* tab selector for the board */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className={`tm-btn tm-btn-sm ${view === 'match' ? 'tm-btn-primary' : 'tm-btn-outline'}`}
          onClick={() => setView('match')}>팀 매칭 상세</button>
        <button
          className={`tm-btn tm-btn-sm ${view === 'team' ? 'tm-btn-primary' : 'tm-btn-outline'}`}
          onClick={() => setView('team')}>팀 프로필</button>
      </div>
      {view === 'match'
        ? <TeamMatchDetail tm={TEAM_MATCHES[0]}/>
        : <TeamDetail team={TEAMS[0]}/>
      }
    </div>
  );
};

/* ─────────────────────────────────────────────
   m04-mb-create — team match create form + TeamMatchCard preview
───────────────────────────────────────────── */
const M04MobileCreate = () => {
  const previewTm = TEAM_MATCHES[0];
  return (
    <Phone>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <TopNav title="팀 매칭 만들기"/>
        <div style={{ padding: '16px 20px 0' }}>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
            팀 매칭을 만들고 상대팀을 초대하거나 모집해보세요
          </div>

          {/* preview card */}
          <div style={{ marginBottom: 20 }}>
            <div className="tm-text-label" style={{ marginBottom: 8 }}>미리보기</div>
            <TeamMatchCard tm={previewTm}/>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* host team selector */}
            <div>
              <label htmlFor="m04-create-host" className="tm-text-label" style={{ display: 'block', marginBottom: 6 }}>
                호스트 팀 <span style={{ color: 'var(--red500)' }}>*</span>
              </label>
              <select id="m04-create-host" className="tm-input" style={{ width: '100%' }}>
                {M04_MY_TEAMS.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.sport})</option>
                ))}
              </select>
            </div>

            {/* title */}
            <div>
              <label htmlFor="m04-create-title" className="tm-text-label" style={{ display: 'block', marginBottom: 6 }}>
                제목 <span style={{ color: 'var(--red500)' }}>*</span>
              </label>
              <input
                id="m04-create-title" className="tm-input"
                placeholder="팀 매칭 제목을 입력해주세요"
                style={{ width: '100%' }}
              />
            </div>

            {/* sport + format */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label htmlFor="m04-create-sport" className="tm-text-label" style={{ display: 'block', marginBottom: 6 }}>
                  종목 <span style={{ color: 'var(--red500)' }}>*</span>
                </label>
                <select id="m04-create-sport" className="tm-input" style={{ width: '100%' }}>
                  {M04_SPORT_FILTERS.filter(f => f.id !== 'all').map(f => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="m04-create-format" className="tm-text-label" style={{ display: 'block', marginBottom: 6 }}>
                  경기 방식
                </label>
                <select id="m04-create-format" className="tm-input" style={{ width: '100%' }}>
                  {['5:5', '6:6', '7:7', '11:11'].map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* grade */}
            <div>
              <label className="tm-text-label" style={{ display: 'block', marginBottom: 6 }}>
                등급 <span style={{ color: 'var(--red500)' }}>*</span>
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                {M04_GRADES.map((g, i) => (
                  <button
                    key={g}
                    className={`tm-btn tm-btn-sm ${i === 1 ? 'tm-btn-primary' : 'tm-btn-outline'}`}
                    style={{ flex: 1, minWidth: 0 }}
                    aria-label={`등급 ${g}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* venue */}
            <div>
              <label htmlFor="m04-create-venue" className="tm-text-label" style={{ display: 'block', marginBottom: 6 }}>
                경기장 <span style={{ color: 'var(--red500)' }}>*</span>
              </label>
              <input
                id="m04-create-venue" className="tm-input"
                placeholder="경기장 이름을 입력해주세요"
                style={{ width: '100%' }}
              />
            </div>

            {/* date + time */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label htmlFor="m04-create-date" className="tm-text-label" style={{ display: 'block', marginBottom: 6 }}>
                  날짜 <span style={{ color: 'var(--red500)' }}>*</span>
                </label>
                <input
                  id="m04-create-date" type="date" className="tm-input"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label htmlFor="m04-create-time" className="tm-text-label" style={{ display: 'block', marginBottom: 6 }}>
                  시간 <span style={{ color: 'var(--red500)' }}>*</span>
                </label>
                <input
                  id="m04-create-time" type="time" className="tm-input"
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            {/* cost */}
            <div>
              <label htmlFor="m04-create-cost" className="tm-text-label" style={{ display: 'block', marginBottom: 6 }}>
                구장비 (총액)
              </label>
              <input
                id="m04-create-cost" type="number" className="tm-input"
                placeholder="구장비를 입력해주세요"
                style={{ width: '100%' }}
              />
              <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>
                상대팀 부담 = 총액 ÷ 2
              </div>
            </div>

            {/* uniform */}
            <div>
              <label htmlFor="m04-create-uniform" className="tm-text-label" style={{ display: 'block', marginBottom: 6 }}>
                유니폼 색상
              </label>
              <input
                id="m04-create-uniform" className="tm-input"
                placeholder="예: 빨강, 파랑, 흰색"
                style={{ width: '100%' }}
              />
            </div>

            {/* pro player toggle */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px',
              background: 'var(--grey50)', borderRadius: 12, border: '1px solid var(--grey100)',
            }}>
              <div>
                <div className="tm-text-body" style={{ fontWeight: 600 }}>선출 선수 포함</div>
                <div className="tm-text-caption">선출 선수 참가 여부를 표시합니다</div>
              </div>
              <div style={{
                width: 44, height: 26, borderRadius: 13,
                background: 'var(--grey200)', display: 'flex', alignItems: 'center',
                padding: 2, cursor: 'pointer', flexShrink: 0,
                minWidth: 44, minHeight: 26,
              }} aria-label="선출 선수 포함 토글" role="switch" aria-checked="false">
                <div style={{ width: 22, height: 22, borderRadius: 11, background: 'var(--static-white)' }}/>
              </div>
            </div>
          </div>

          <div style={{ padding: '24px 0 40px' }}>
            <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block">
              팀 매칭 올리기
            </button>
          </div>
        </div>
      </div>
    </Phone>
  );
};

/* ─────────────────────────────────────────────
   m04-mb-flow-evaluate — 6항목 상호평가
───────────────────────────────────────────── */
const M04MobileFlowEvaluate = () => {
  const tm = TEAM_MATCHES[0];
  return (
    <Phone>
      <TopNav title="팀 상호평가"/>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100 }}>
        {/* opponent team header */}
        <div style={{ padding: '20px 20px 16px', textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: 'var(--blue50)', display: 'grid',
            placeItems: 'center', fontSize: 'var(--fs-title)', margin: '0 auto 12px',
          }}>⚽</div>
          <div className="tm-text-heading">{tm.host}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6 }}>
            <GradeBadge grade={tm.grade}/>
            <div className="tm-text-caption">{tm.sport} · {tm.date}</div>
          </div>
        </div>

        {/* 6-item evaluation using StatBar from signatures */}
        <div style={{ padding: '0 20px 16px' }}>
          <Card pad={20}>
            <div className="tm-text-label" style={{ marginBottom: 16, color: 'var(--text-strong)' }}>
              6항목 평가
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {M04_EVAL_ITEMS.map(item => (
                <M04StarRow key={item.key} label={item.label} value={item.value} max={item.max}/>
              ))}
            </div>
          </Card>
        </div>

        {/* trust score summary */}
        <div style={{ padding: '0 20px 16px' }}>
          <Card pad={16}>
            <div className="tm-text-label" style={{ marginBottom: 12 }}>팀 신뢰 점수 반영 항목</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[['매너', 4], ['페어플레이', 5], ['시간 준수', 5]].map(([k, v]) => (
                <div key={k} style={{
                  padding: 12, background: 'var(--grey50)', borderRadius: 12, textAlign: 'center',
                }}>
                  <div className="tm-text-micro" style={{ marginBottom: 4 }}>{k}</div>
                  <div className="tm-text-body tm-tabular" style={{ fontWeight: 800, color: 'var(--blue500)' }}>{v}/5</div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* free comment */}
        <div style={{ padding: '0 20px 16px' }}>
          <label htmlFor="m04-eval-comment" className="tm-text-label" style={{ display: 'block', marginBottom: 8 }}>
            한 줄 후기 (선택)
          </label>
          <textarea
            id="m04-eval-comment" className="tm-input"
            placeholder="상대팀에 대한 후기를 남겨주세요"
            style={{ width: '100%', height: 80, resize: 'none', paddingTop: 12, paddingBottom: 12 }}
          />
        </div>

        {/* notice */}
        <div style={{ margin: '0 20px 16px' }}>
          <div className="tm-surface-muted" style={{ padding: 12 }}>
            <div className="tm-text-caption">
              평가 결과는 상대 팀의 신뢰 점수에 반영되며, 쌍방 평가 완료 후 공개됩니다.
            </div>
          </div>
        </div>
      </div>

      {/* sticky CTA */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '12px 20px 24px',
        background: 'var(--bg)', borderTop: '1px solid var(--border)',
      }}>
        <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block">
          평가 제출하기
        </button>
      </div>
    </Phone>
  );
};

/* ─────────────────────────────────────────────
   m04-mb-flow-checkin — 도착 인증
───────────────────────────────────────────── */
const M04MobileFlowCheckin = () => {
  const tm = TEAM_MATCHES[0];
  return (
    <Phone>
      <TopNav title="도착 인증"/>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100 }}>
        {/* hero */}
        <div style={{ padding: '20px 20px 16px', textAlign: 'center' }}>
          <div style={{
            width: 80, height: 80, borderRadius: 22,
            background: 'var(--green50)',
            display: 'grid', placeItems: 'center', margin: '0 auto 12px',
          }}>
            <Icon name="pin" size={36} color="var(--green500)"/>
          </div>
          <div className="tm-text-heading" style={{ marginBottom: 6 }}>도착 인증</div>
          <div className="tm-text-body" style={{ color: 'var(--text-muted)' }}>
            경기 장소에 도착했을 때 인증해주세요
          </div>
        </div>

        {/* match info */}
        <div style={{ padding: '0 20px 16px' }}>
          <Card pad={16}>
            <div className="tm-text-label" style={{ marginBottom: 8 }}>경기 정보</div>
            {[
              ['상대팀', tm.host],
              ['장소',   tm.venue],
              ['일시',   `${tm.date} ${tm.time}`],
              ['방식',   tm.format],
            ].map(([k, v]) => (
              <div key={k} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '8px 0', borderBottom: '1px solid var(--grey100)',
              }}>
                <div className="tm-text-caption">{k}</div>
                <div className="tm-text-caption" style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{v}</div>
              </div>
            ))}
          </Card>
        </div>

        {/* location / map placeholder */}
        <div style={{ padding: '0 20px 16px' }}>
          <Card pad={16}>
            <div className="tm-text-label" style={{ marginBottom: 8 }}>현재 위치</div>
            {/* map placeholder with pin pulse animation */}
            <div style={{
              height: 140, background: 'var(--grey100)',
              borderRadius: 10, display: 'grid', placeItems: 'center', marginBottom: 12,
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 16,
                  background: 'var(--green50)',
                  display: 'grid', placeItems: 'center', margin: '0 auto 8px',
                  boxShadow: '0 0 0 8px rgba(3,178,108,.12)',
                }}>
                  <Icon name="pin" size={16} color="var(--green500)"/>
                </div>
                <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                  위치 확인 중...
                </div>
              </div>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 12px', background: 'var(--green50)', borderRadius: 8,
            }}>
              <Icon name="pin" size={14} color="var(--green500)"/>
              <div className="tm-text-caption">
                경기장까지{' '}
                <span style={{ fontWeight: 700, color: 'var(--text-strong)' }}>87m</span>
                {' '}이내
              </div>
            </div>
          </Card>
        </div>

        {/* team checkin status */}
        <div style={{ padding: '0 20px 16px' }}>
          <Card pad={16}>
            <div className="tm-text-label" style={{ marginBottom: 12 }}>양 팀 인증 현황</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { team: tm.host, done: true,  members: 8, total: 11 },
                { team: '우리 팀', done: false, members: 5, total: 11 },
              ].map(row => (
                <div key={row.team} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 12,
                    background: row.done ? 'var(--green50)' : 'var(--grey100)',
                    display: 'grid', placeItems: 'center', flexShrink: 0,
                  }}>
                    <Icon name="check" size={12} color={row.done ? 'var(--green500)' : 'var(--grey400)'}/>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="tm-text-caption" style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
                      {row.team}
                    </div>
                    <div className="tm-text-micro" style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                      {row.members}/{row.total}명 확인
                    </div>
                  </div>
                  <Badge tone={row.done ? 'green' : 'grey'} size="sm">
                    {row.done ? '인증 완료' : '대기 중'}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* notice */}
        <div style={{ margin: '0 20px 16px' }}>
          <div className="tm-surface-muted" style={{ padding: 12 }}>
            <div className="tm-text-caption">
              경기 시작 30분 전부터 인증 가능합니다. 양 팀 모두 인증 완료 시 경기가 시작됩니다.
            </div>
          </div>
        </div>
      </div>

      {/* sticky CTA */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '12px 20px 24px',
        background: 'var(--bg)', borderTop: '1px solid var(--border)',
      }}>
        <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block">
          <Icon name="check" size={18} color="var(--static-white)"/> 도착 인증하기
        </button>
      </div>
    </Phone>
  );
};

/* ─────────────────────────────────────────────
   m04-mb-state-loading — TeamMatchesList skeleton
───────────────────────────────────────────── */
const M04MobileStateLoading = () => (
  <Phone>
    {/* AppBar skeleton */}
    <div style={{
      padding: '8px 20px', height: 56,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderBottom: '1px solid var(--border)',
    }}>
      <Skeleton w={80} h={20} r={6}/>
      <Skeleton w={40} h={40} r={12}/>
    </div>

    {/* hero banner skeleton */}
    <div style={{ padding: '12px 20px' }}>
      <Skeleton w="100%" h={80} r={14}/>
    </div>

    {/* filter chips skeleton */}
    <div style={{ padding: '4px 20px 12px', display: 'flex', gap: 8 }}>
      {[60, 48, 52, 44, 56].map(w => (
        <Skeleton key={w} w={w} h={36} r={999}/>
      ))}
    </div>

    {/* team match card skeletons */}
    <div style={{ flex: 1, padding: '4px 20px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[0, 1, 2].map(i => (
        <div key={i} className="tm-card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            <Skeleton w={24} h={24} r={6}/>
            <Skeleton w={48} h={24} r={999}/>
            <Skeleton w={40} h={24} r={999}/>
          </div>
          <Skeleton w="85%" h={18} r={4} mb={8}/>
          <Skeleton w="60%" h={14} r={4} mb={6}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <Skeleton w={100} h={14} r={4}/>
            <Skeleton w={64} h={14} r={4}/>
          </div>
        </div>
      ))}
    </div>

    <TabBar active="matches"/>
  </Phone>
);

/* ─────────────────────────────────────────────
   m04-mb-state-empty — 팀 매칭 없음
───────────────────────────────────────────── */
const M04MobileStateEmpty = () => (
  <Phone>
    <AppBar
      title="팀 매칭"
      trailing={[
        <button key="s" className="tm-btn tm-btn-ghost tm-btn-icon" aria-label="검색">
          <Icon name="search" size={22} color="var(--grey800)"/>
        </button>,
      ]}
    />
    {/* filter chips — wireframe preserved */}
    <div style={{ padding: '0 20px 12px', display: 'flex', gap: 8, overflow: 'auto' }}>
      {['전체', '축구', '풋살'].map((s, i) => (
        <Chip key={s} active={i === 0}>{s}</Chip>
      ))}
    </div>

    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <EmptyState
        icon={<Icon name="swords" size={40} color="var(--text-caption)"/>}
        title="팀 매칭이 없어요"
        sub="조건에 맞는 팀 매칭을 찾을 수 없어요. 직접 만들어보세요."
        cta="팀 매칭 만들기"
      />
    </div>
    <TabBar active="matches"/>
  </Phone>
);

/* ─────────────────────────────────────────────
   m04-mb-state-permission — 위치 권한 없음 (checkin)
───────────────────────────────────────────── */
const M04MobileStatePermission = () => (
  <Phone>
    <TopNav title="도착 인증"/>
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 32, gap: 16, textAlign: 'center',
    }}>
      {/* permission sheet visual */}
      <div style={{
        width: 80, height: 80, borderRadius: 22,
        background: 'var(--orange50)', display: 'grid', placeItems: 'center',
      }}>
        <Icon name="pin" size={36} color="var(--orange500)"/>
      </div>
      <div>
        <div className="tm-text-heading" style={{ marginBottom: 8 }}>위치 권한이 필요해요</div>
        <div className="tm-text-body" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
          도착 인증을 위해 위치 접근 권한을 허용해주세요.
        </div>
      </div>
      <div className="tm-surface-muted" style={{ padding: 16, width: '100%', textAlign: 'left' }}>
        <ListItem
          title="Teameet이 위치에 접근하려고 합니다"
          sub="경기 장소 100m 이내에서만 인증됩니다"
          trailing={<Icon name="pin" size={16} color="var(--text-muted)"/>}
        />
      </div>
      <div style={{ display: 'grid', gap: 8, marginTop: 8, width: '100%' }}>
        <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" style={{ minHeight: 44 }}>
          위치 권한 허용
        </button>
        <button className="tm-btn tm-btn-ghost tm-btn-md tm-btn-block" style={{ minHeight: 44 }}>
          나중에 하기
        </button>
      </div>
    </div>
  </Phone>
);

/* ─────────────────────────────────────────────
   m04-mb-state-pending — 상대팀 인증 대기 중
───────────────────────────────────────────── */
const M04MobileStatePending = () => (
  <Phone>
    <TopNav title="팀 매칭 확인"/>
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 32, gap: 16, textAlign: 'center',
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: 22,
        background: 'var(--blue50)', display: 'grid', placeItems: 'center',
      }}>
        <Icon name="clock" size={36} color="var(--blue500)"/>
      </div>
      <div>
        <div className="tm-text-heading" style={{ marginBottom: 8 }}>상대팀 확인 중이에요</div>
        <div className="tm-text-body" style={{ color: 'var(--text-muted)' }}>
          {TEAM_MATCHES[0].host}팀 주장의 최종 수락을 기다리고 있어요
        </div>
      </div>

      {/* pending detail card */}
      <div className="tm-surface-muted" style={{ padding: 16, width: '100%', textAlign: 'left' }}>
        {[
          ['신청 팀',  TEAMS[1].name],
          ['상대 팀',  TEAM_MATCHES[0].host],
          ['경기 일시', `${TEAM_MATCHES[0].date} ${TEAM_MATCHES[0].time}`],
          ['장소',     TEAM_MATCHES[0].venue],
          ['신청일',   '2026. 04. 25'],
        ].map(([k, v]) => (
          <div key={k} style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '6px 0', borderBottom: '1px solid var(--grey100)',
          }}>
            <div className="tm-text-caption">{k}</div>
            <div className="tm-text-caption" style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{v}</div>
          </div>
        ))}
      </div>

      <button className="tm-btn tm-btn-outline tm-btn-md tm-btn-block" style={{ minHeight: 44 }}>
        신청 취소
      </button>
    </div>
  </Phone>
);

/* ─────────────────────────────────────────────
   m04-mb-components — M04 primitives inventory
───────────────────────────────────────────── */
const M04MobileComponents = () => (
  <div style={{
    width: M04_MB_W, height: M04_MB_H,
    background: 'var(--bg)', padding: 20,
    fontFamily: 'var(--font)', overflow: 'hidden',
  }}>
    <Badge tone="blue" size="sm">m04-mb-components</Badge>
    <M04BoardTitle
      label="M04 모바일 · 사용 컴포넌트"
      sub="팀·팀매칭 화면이 사용하는 production primitives 인벤토리"
    />
    <div style={{ display: 'grid', gap: 8 }}>
      <M04Swatch label="TeamMatchCard · canonical (GradeBadge + badges + venue + cost)">
        <div style={{ width: '100%' }}><TeamMatchCard tm={TEAM_MATCHES[0]}/></div>
      </M04Swatch>
      <M04Swatch label="GradeBadge · S/A/B/C/D (canonical)">
        {M04_GRADES.map(g => <GradeBadge key={g} grade={g}/>)}
      </M04Swatch>
      <M04Swatch label="M04RoleChip · owner / manager / member">
        <M04RoleChip role="owner"/>
        <M04RoleChip role="manager"/>
        <M04RoleChip role="member"/>
      </M04Swatch>
      <M04Swatch label="M04StarRow · 6항목 평가 (StatBar style)">
        <div style={{ width: '100%' }}>
          <M04StarRow label="매너·태도" value={4} max={5}/>
        </div>
      </M04Swatch>
      <M04Swatch label="Badge · 종목·등급·상태">
        <Badge tone="grey" size="sm">축구</Badge>
        <Badge tone="grey" size="sm">11:11</Badge>
        <Badge tone="blue" size="sm">무료초청</Badge>
        <Badge tone="orange" size="sm">선출 2명</Badge>
        <Badge tone="green" size="sm">인증 완료</Badge>
      </M04Swatch>
      <M04Swatch label="Skeleton · 카드 로딩 shimmer">
        <Skeleton w={200} h={16} r={4}/>
        <Skeleton w={120} h={14} r={4}/>
        <Skeleton w={24} h={24} r={6}/>
      </M04Swatch>
      <M04Swatch label="Button · CTA 계층">
        <button className="tm-btn tm-btn-primary tm-btn-sm" style={{ minHeight: 44 }}>팀 매칭 만들기</button>
        <button className="tm-btn tm-btn-secondary tm-btn-sm" style={{ minHeight: 44 }}>신청하기</button>
        <button className="tm-btn tm-btn-outline tm-btn-sm" style={{ minHeight: 44 }}>취소</button>
        <button className="tm-btn tm-btn-danger tm-btn-sm" style={{ minHeight: 44 }}>퇴장</button>
      </M04Swatch>
      <M04Swatch label="BottomNav / TabBar · matches 탭 active">
        <div style={{ width: 335 }}><TabBar active="matches"/></div>
      </M04Swatch>
    </div>
  </div>
);

/* ─────────────────────────────────────────────
   m04-tb-components — 태블릿 primitives
───────────────────────────────────────────── */
const M04TabletComponents = () => (
  <div style={{
    width: M04_TB_W, height: M04_TB_H,
    background: 'var(--bg)', padding: 32,
    fontFamily: 'var(--font)', overflow: 'hidden',
  }}>
    <Badge tone="blue" size="sm">m04-tb-components</Badge>
    <M04BoardTitle
      label="M04 태블릿 · 사용 컴포넌트"
      sub="팀·팀매칭 태블릿 variants — 2-column grid 기준"
    />
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8 }}>
      <M04Swatch label="TeamMatchCard · 2-col grid cell">
        <div style={{ width: '100%' }}><TeamMatchCard tm={TEAM_MATCHES[0]}/></div>
        <div style={{ width: '100%' }}><TeamMatchCard tm={TEAM_MATCHES[1]}/></div>
      </M04Swatch>
      <M04Swatch label="TeamDetail panel (team header)">
        <div style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 12,
          background: 'var(--grey50)', borderRadius: 12,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: TEAMS[0].color, display: 'grid', placeItems: 'center', fontSize: 'var(--fs-subhead)',
          }}>{TEAMS[0].logo}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tm-text-body-lg">{TEAMS[0].name}</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center' }}>
              <GradeBadge grade={TEAMS[0].level}/>
              <div className="tm-text-caption">{TEAMS[0].sport} · {TEAMS[0].members}명</div>
            </div>
          </div>
        </div>
      </M04Swatch>
      <M04Swatch label="GradeBadge + RoleBadge inline">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {M04_GRADES.map(g => <GradeBadge key={g} grade={g}/>)}
          <M04RoleChip role="owner"/>
          <M04RoleChip role="manager"/>
        </div>
      </M04Swatch>
      <M04Swatch label="M04StarRow · 3항목 preview">
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {M04_EVAL_ITEMS.slice(0, 3).map(item => (
            <M04StarRow key={item.key} label={item.label} value={item.value} max={item.max}/>
          ))}
        </div>
      </M04Swatch>
      <M04Swatch label="Chip · sport filter row">
        {M04_SPORT_FILTERS.map((f, i) => (
          <Chip key={f.id} active={i === 0}>{f.label}</Chip>
        ))}
      </M04Swatch>
      <M04Swatch label="Button · action spectrum">
        <button className="tm-btn tm-btn-primary tm-btn-md" style={{ minHeight: 44 }}>팀 매칭 만들기</button>
        <button className="tm-btn tm-btn-secondary tm-btn-md" style={{ minHeight: 44 }}>신청하기</button>
        <button className="tm-btn tm-btn-outline tm-btn-md" style={{ minHeight: 44 }}>필터</button>
      </M04Swatch>
    </div>
  </div>
);

/* ─────────────────────────────────────────────
   m04-dt-components — 데스크탑 primitives
───────────────────────────────────────────── */
const M04DesktopComponents = () => (
  <div style={{
    width: M04_DT_W, height: M04_DT_H,
    background: 'var(--bg)', padding: 32,
    fontFamily: 'var(--font)', overflow: 'hidden',
  }}>
    <Badge tone="blue" size="sm">m04-dt-components</Badge>
    <M04BoardTitle
      label="M04 데스크탑 · 사용 컴포넌트"
      sub="팀·팀매칭 3-col workspace primitives"
    />
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
      <M04Swatch label="Sidebar · 내 팀 nav row">
        {M04_MY_TEAMS.map(t => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: t.color, display: 'grid', placeItems: 'center', fontSize: 'var(--fs-body)',
            }}>{t.logo}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tm-text-caption" style={{
                fontWeight: 600, color: 'var(--text-strong)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{t.name}</div>
            </div>
            <M04RoleChip role={t.role}/>
          </div>
        ))}
      </M04Swatch>
      <M04Swatch label="TeamMatchCard · main grid (canonical)">
        <div style={{ width: '100%' }}><TeamMatchCard tm={TEAM_MATCHES[1]}/></div>
      </M04Swatch>
      <M04Swatch label="右 panel · 팀 현황 preview">
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {M04_MY_TEAMS.map(t => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: 12, background: 'var(--grey50)', borderRadius: 10,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: t.color, display: 'grid', placeItems: 'center', fontSize: 'var(--fs-body-lg)',
              }}>{t.logo}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tm-text-caption" style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{t.name}</div>
                <div className="tm-text-micro">{t.sport} · {t.members}명</div>
              </div>
              <GradeBadge grade={t.level}/>
            </div>
          ))}
        </div>
      </M04Swatch>
      <M04Swatch label="GradeBadge 전체 / 신뢰점수 scale">
        <div style={{ display: 'flex', gap: 8 }}>
          {M04_GRADES.map(g => <GradeBadge key={g} grade={g}/>)}
        </div>
      </M04Swatch>
      <M04Swatch label="M04StarRow · 6항목 full (desktop)">
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {M04_EVAL_ITEMS.map(item => (
            <M04StarRow key={item.key} label={item.label} value={item.value} max={item.max}/>
          ))}
        </div>
      </M04Swatch>
      <M04Swatch label="Button · desktop CTA row">
        <button className="tm-btn tm-btn-primary tm-btn-md" style={{ minHeight: 44 }}>팀 매칭 만들기</button>
        <button className="tm-btn tm-btn-outline tm-btn-md" style={{ minHeight: 44 }}>필터</button>
        <button className="tm-btn tm-btn-secondary tm-btn-md" style={{ minHeight: 44 }}>신청하기</button>
      </M04Swatch>
    </div>
  </div>
);

/* ─────────────────────────────────────────────
   m04-mb-assets — 디자인 토큰 인벤토리
───────────────────────────────────────────── */
const M04AssetRow = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>{children}</div>
  </div>
);

const M04MobileAssets = () => (
  <div style={{
    width: M04_MB_W, height: M04_MB_H,
    background: 'var(--bg)', padding: 24,
    fontFamily: 'var(--font)', overflow: 'hidden',
  }}>
    <Badge tone="blue" size="sm">m04-mb-assets</Badge>
    <M04BoardTitle
      label="M04 모바일 · 사용 토큰/에셋"
      sub="팀·팀매칭 화면이 실제로 사용하는 디자인 토큰 인벤토리"
    />
    <div style={{ display: 'grid', gap: 16 }}>
      <M04AssetRow label="Color · brand + semantic">
        <M04ColorTile token="blue500" value="var(--blue500)"/>
        <M04ColorTile token="blue50"  value="var(--blue50)"/>
        <M04ColorTile token="green500" value="var(--green500)"/>
        <M04ColorTile token="orange500" value="var(--orange500)"/>
        <M04ColorTile token="red500"  value="var(--red500)"/>
        <M04ColorTile token="purple500" value="var(--purple500)"/>
        <M04ColorTile token="teal500" value="var(--teal500)"/>
      </M04AssetRow>
      <M04AssetRow label="Color · grade (S→D)">
        <M04ColorTile token="S·purple" value="var(--purple500)"/>
        <M04ColorTile token="A·red"   value="var(--red500)"/>
        <M04ColorTile token="B·blue"  value="var(--blue500)"/>
        <M04ColorTile token="C·green" value="var(--green500)"/>
        <M04ColorTile token="D·grey"  value="var(--grey500)"/>
      </M04AssetRow>
      <M04AssetRow label="Color · team sport accent">
        <M04ColorTile token="축구" value="var(--red500)"/>
        <M04ColorTile token="풋살" value="var(--blue500)"/>
        <M04ColorTile token="농구" value="var(--orange500)"/>
        <M04ColorTile token="배드민턴" value="var(--green500)"/>
        <M04ColorTile token="하키" value="var(--teal500)"/>
      </M04AssetRow>
      <M04AssetRow label="Color · neutral">
        <M04ColorTile token="grey50"  value="var(--grey50)"/>
        <M04ColorTile token="grey100" value="var(--grey100)"/>
        <M04ColorTile token="grey300" value="var(--grey300)"/>
        <M04ColorTile token="grey900" value="var(--grey900)"/>
      </M04AssetRow>
      <M04AssetRow label="Type · 사용 단계">
        <span className="tm-text-subhead">subhead</span>
        <span className="tm-text-heading">heading</span>
        <span className="tm-text-body-lg">body-lg</span>
        <span className="tm-text-body">body</span>
        <span className="tm-text-label">label</span>
        <span className="tm-text-caption">caption</span>
        <span className="tm-text-micro">micro</span>
      </M04AssetRow>
      <M04AssetRow label="Spacing · used (4-multiple)">
        {[8, 12, 14, 16, 20, 24, 32].map(n => (
          <Badge key={n} tone="grey" size="sm">{n}px</Badge>
        ))}
      </M04AssetRow>
      <M04AssetRow label="Radius · used">
        <Badge tone="grey" size="sm">r-sm 8 · badge</Badge>
        <Badge tone="grey" size="sm">r-md 12 · card/form</Badge>
        <Badge tone="grey" size="sm">r-lg 16 · team logo</Badge>
        <Badge tone="grey" size="sm">r-pill · chip/grade</Badge>
      </M04AssetRow>
      <M04AssetRow label="Icon · key set">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['pin', 'calendar', 'check', 'clock', 'shield', 'trophy', 'swords', 'people', 'edit', 'plus'].map(n => (
            <Icon key={n} name={n} size={20} color="var(--text-muted)"/>
          ))}
        </div>
      </M04AssetRow>
      <M04AssetRow label="Motion token · 사용">
        <Badge tone="grey" size="sm">dur-fast 120ms · tap / badge</Badge>
        <Badge tone="grey" size="sm">dur-slow 280ms · sheet-up</Badge>
        <Badge tone="grey" size="sm">ease-out-expo · sheet / checkin</Badge>
      </M04AssetRow>
    </div>
  </div>
);

/* ─────────────────────────────────────────────
   m04-mb-motion — motion contract
───────────────────────────────────────────── */
const M04MotionBoard = () => (
  <div style={{
    width: M04_MB_W, height: M04_MB_H,
    background: 'var(--bg)', padding: 24,
    fontFamily: 'var(--font)', overflow: 'hidden',
  }}>
    <Badge tone="blue" size="sm">m04-mb-motion</Badge>
    <M04BoardTitle
      label="M04 모바일 · motion contract"
      sub="팀·팀매칭에서 사용하는 micro-interaction 가이드"
    />
    <div style={{ display: 'grid', gap: 0 }}>
      <ListItem
        title="TeamMatchesList 목록 진입"
        sub="fade-in 200ms + slide-up 8px / ease-out-quint. stagger 60ms/card"
        trailing="enter"
      />
      <ListItem
        title="TeamMatchDetail sheet 등장"
        sub="bottom → slide-up 280ms ease-out-expo + overlay fade-in 200ms"
        trailing="sheet"
      />
      <ListItem
        title="TeamMatchCard tap"
        sub="scale(0.98) 120ms ease-out-quart. 터치 끝 → 즉시 복원"
        trailing="tap"
      />
      <ListItem
        title="GradeBadge role 변경"
        sub="background-color + color transition 180ms ease-out-quart"
        trailing="role"
      />
      <ListItem
        title="도착 인증 성공 pulse"
        sub="pin 아이콘 → circle expand + green glow 300ms ease-out-quint"
        trailing="checkin"
      />
      <ListItem
        title="StarRow / StatBar fill"
        sub="width 0→{pct}% 600ms ease-out-quart. prefers-reduced-motion → 즉시"
        trailing="bar"
      />
      <ListItem
        title="모집 중 Toggle"
        sub="thumb translate 220ms ease-out-quart. bg grey→blue500 동시 전환"
        trailing="toggle"
      />
      <ListItem
        title="Skeleton shimmer"
        sub="background-position 200% → 0 infinite 1.4s linear. stagger 80ms"
        trailing="shimmer"
      />
      <ListItem
        title="탭 전환 (정보·경기·멤버)"
        sub="underline width 200ms. text-muted→text-strong 동시. no layout shift"
        trailing="tab"
      />
      <ListItem
        title="신청 수락/거절 swipe"
        sub="수락 → right slide-out + green flash 160ms. 거절 → left + red flash"
        trailing="swipe"
      />
      <ListItem
        title="평가 스텝퍼 전진"
        sub="항목 체크 → next focus ring translate 160ms. submit → confetti 3p"
        trailing="step"
      />
      <ListItem
        title="Reduced motion"
        sub="prefers-reduced-motion → 모든 transition/animation 0.01ms. bar 즉시"
        trailing="a11y"
      />
    </div>
  </div>
);

/* ─────────────────────────────────────────────
   window exports — 16 names preserved exactly
───────────────────────────────────────────── */
Object.assign(window, {
  M04MobileMain,
  M04TabletMain,
  M04DesktopMain,
  M04MobileDetail,
  M04MobileCreate,
  M04MobileFlowEvaluate,
  M04MobileFlowCheckin,
  M04MobileStateLoading,
  M04MobileStateEmpty,
  M04MobileStatePermission,
  M04MobileStatePending,
  M04MobileComponents,
  M04TabletComponents,
  M04DesktopComponents,
  M04MobileAssets,
  M04MotionBoard,
});
