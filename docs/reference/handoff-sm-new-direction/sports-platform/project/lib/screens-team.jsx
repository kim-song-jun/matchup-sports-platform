/* Team matches, Teams, Lessons */

const GradeBadge = ({ grade }) => {
  const colors = { S: 'var(--purple500)', A: 'var(--red500)', B: 'var(--blue500)', C: 'var(--green500)', D: 'var(--grey500)' };
  return (
    <span style={{
      width: 24, height: 24, borderRadius: 6, fontWeight: 800, fontSize: 13,
      background: colors[grade] || 'var(--grey500)', color: 'var(--static-white)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>{grade}</span>
  );
};

const TeamMatchCard = ({ tm, onClick }) => (
  <div className="tm-card tm-card-interactive" onClick={onClick} style={{
    padding: 16,
  }}>
    <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
      <GradeBadge grade={tm.grade}/>
      <Badge tone="grey">{tm.sport}</Badge>
      <Badge tone="grey">{tm.format}</Badge>
      {tm.free && <Badge tone="blue">무료초청</Badge>}
      {tm.pro > 0 && <Badge tone="orange">선출 {tm.pro}명</Badge>}
    </div>
    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 10, lineHeight: 1.4 }}>
      {tm.title}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
      <Icon name="pin" size={13}/> {tm.venue}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
        <Icon name="calendar" size={13}/> {tm.date} {tm.time}
      </div>
      <div className="tab-num" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>
        {tm.cost.toLocaleString()}원
      </div>
    </div>
  </div>
);

const TeamMatchesList = ({ onNav }) => {
  const [sport, setSport] = React.useState('all');
  const list = sport === 'all' ? TEAM_MATCHES : TEAM_MATCHES.filter(t => t.sport === (sport === 'soccer' ? '축구' : '풋살'));
  return (
    <Phone>
      <AppBar title="팀 매칭" leading={<button className="tm-btn tm-btn-ghost tm-btn-icon" onClick={() => onNav?.('home')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>} trailing={[
        <button key="s" className="tm-btn tm-btn-ghost tm-btn-icon"><Icon name="search" size={22} color="var(--grey800)"/></button>,
      ]}/>
      <div style={{ padding: '0 20px 12px' }}>
        <div style={{ padding: 16, background: 'var(--grey50)', border: '1px solid var(--border)', borderRadius: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>팀 단위 매칭</div>
          <div style={{ fontSize: 17, fontWeight: 800, marginTop: 4, lineHeight: 1.4, color: 'var(--text-strong)' }}>S~D 등급으로<br/>우리 팀과 딱 맞는 상대를</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '8px 20px 12px', overflow: 'auto' }}>
        {['all', 'soccer', 'futsal'].map(s => (
          <Chip key={s} active={sport === s} onClick={() => setSport(s)}>
            {s === 'all' ? '전체' : s === 'soccer' ? '축구' : '풋살'}
          </Chip>
        ))}
        {['S급', 'A급', 'B급', 'C급'].map(g => <Chip key={g}>{g}</Chip>)}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map(tm => <TeamMatchCard key={tm.id} tm={tm} onClick={() => onNav?.('team-match', tm)}/>)}
      </div>
      <button className="tm-btn tm-btn-primary tm-pressable" onClick={() => onNav?.('team-match-new')} style={{
        position: 'absolute', bottom: 80, right: 20, width: 56, height: 56, borderRadius: 28,
        boxShadow: 'var(--sh-3)', padding: 0,
      }}><Icon name="plus" size={26} stroke={2.4}/></button>
      <TabBar active="match"/>
    </Phone>
  );
};

const TeamMatchDetail = ({ tm = TEAM_MATCHES[0], onNav }) => {
  return (
    <Phone>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100 }}>
        <div style={{ padding: '12px 16px 8px' }}>
          <button className="tm-btn tm-btn-ghost tm-btn-icon" onClick={() => onNav?.('team-matches')}>
            <Icon name="chevL" size={24} color="var(--grey800)"/>
          </button>
        </div>
        <div style={{ padding: '0 20px 20px' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            <GradeBadge grade={tm.grade}/>
            <Badge tone="grey">{tm.format}</Badge>
            <Badge tone="grey">{tm.sport}</Badge>
            {tm.free && <Badge tone="blue">무료초청</Badge>}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)', lineHeight: 1.35 }}>
            {tm.title}
          </div>
        </div>

        {/* host team */}
        <div style={{ padding: '0 20px 20px' }}>
          <Card pad={16}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--blue50)', display: 'grid', placeItems: 'center', fontSize: 22 }}>⚽</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{tm.host}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Lv. {tm.grade} · 매너 ★ 4.8</div>
              </div>
              <SBtn variant="neutral" size="sm">팀 정보</SBtn>
            </div>
          </Card>
        </div>

        {/* info grid */}
        <div style={{ padding: '0 20px 20px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 12 }}>경기 정보</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              ['일시', `${tm.date}`],
              ['시간', tm.time],
              ['경기장', tm.venue],
              ['유니폼', tm.uniform],
              ['경기방식', tm.format],
              ['선출선수', `${tm.pro}명`],
            ].map(([k, v]) => (
              <div key={k} style={{ padding: 14, background: 'var(--grey50)', borderRadius: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>{k}</div>
                <div style={{ fontSize: 14, color: 'var(--text-strong)', fontWeight: 700 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* referee schedule */}
        <div style={{ padding: '0 20px 20px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 12 }}>심판 배정표</div>
          <Card pad={0}>
            {[1, 2, 3, 4].map(q => (
              <div key={q} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 16px', borderBottom: q < 4 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>쿼터 {q}</span>
                <span style={{ fontSize: 13, color: 'var(--text-strong)', fontWeight: 600 }}>{q % 2 ? tm.host : '상대팀'}</span>
              </div>
            ))}
          </Card>
        </div>

        <div style={{ padding: '0 20px 20px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 12 }}>비용</div>
          <Card pad={16}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>총 구장비</span>
              <span className="tab-num" style={{ fontSize: 13, color: 'var(--text-strong)', fontWeight: 600 }}>{tm.cost.toLocaleString()}원</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--border)', marginTop: 8 }}>
              <span style={{ fontSize: 14, color: 'var(--text-strong)', fontWeight: 700 }}>상대팀 부담</span>
              <span className="tab-num" style={{ fontSize: 16, color: 'var(--blue500)', fontWeight: 800 }}>{Math.round(tm.cost / 2).toLocaleString()}원</span>
            </div>
          </Card>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 20px 24px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
        <SBtn full size="lg">신청하기</SBtn>
      </div>
    </Phone>
  );
};

const TeamDetail = ({ team = TEAMS[0], onNav }) => {
  const [tab, setTab] = React.useState('정보');
  return (
    <Phone>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100 }}>
        <div style={{ position: 'relative', height: 180, background: team.color }}>
          <div style={{ position: 'absolute', top: 8, left: 8 }}>
            <button className="tm-btn tm-btn-ghost tm-btn-icon" onClick={() => onNav?.('home')} style={{ color: 'var(--static-white)' }}>
              <Icon name="chevL" size={24} color="var(--static-white)"/>
            </button>
          </div>
          <div style={{ position: 'absolute', bottom: -36, left: 20, display: 'flex', alignItems: 'flex-end', gap: 12 }}>
            <div style={{ width: 80, height: 80, borderRadius: 20, background: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 36, boxShadow: 'var(--sh-2)' }}>
              {team.logo}
            </div>
          </div>
        </div>
        <div style={{ padding: '44px 20px 20px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)' }}>{team.name}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
            <GradeBadge grade={team.level}/>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{team.sport} · 멤버 {team.members}명 · 매너 ★ {team.manner}</span>
          </div>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {['정보', '경기', '멤버', '용병'].map(t => (
            <button key={t} className="tm-pressable" onClick={() => setTab(t)} style={{
              flex: 1, padding: '14px 0',
              fontSize: 14, fontWeight: tab === t ? 700 : 500,
              color: tab === t ? 'var(--text-strong)' : 'var(--text-muted)',
              borderBottom: tab === t ? '2px solid var(--grey900)' : '2px solid transparent',
            }}>{t}</button>
          ))}
        </div>

        {tab === '정보' && (
          <div style={{ padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 8 }}>팀 소개</div>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }}>
              매주 주말에 모여 축구하는 팀입니다. 실력보다는 매너와 즐거움이 최우선. 새 멤버 환영합니다.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 20 }}>
              {[['전적', '12승 4패'], ['득실', '+28'], ['매너', '★ 4.8']].map(([k, v]) => (
                <div key={k} style={{ padding: 14, background: 'var(--grey50)', borderRadius: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{k}</div>
                  <div className="tab-num" style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)' }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 24, fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 12 }}>다음 경기</div>
            <TeamMatchCard tm={TEAM_MATCHES[0]}/>
          </div>
        )}
        {tab === '멤버' && (
          <div style={{ padding: 20 }}>
            {[IMG.av1, IMG.av2, IMG.av3, IMG.av4, IMG.av5, IMG.av6].map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i < 5 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width: 44, height: 44, borderRadius: 22, background: `var(--grey100) url(${a}) center/cover` }}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>멤버 {i + 1}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{i === 0 ? '팀장' : '멤버'}</div>
                </div>
                <GradeBadge grade={['S','A','B','B','C','C'][i]}/>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 20px 24px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
        <SBtn full size="lg" variant="weak">가입 신청하기</SBtn>
      </div>
    </Phone>
  );
};

/* Lessons */
const LessonCard = ({ l, onClick }) => (
  <div className="tm-card tm-card-interactive" onClick={onClick} style={{
    overflow: 'hidden',
  }}>
    <div style={{ height: 130, background: `var(--grey100) url(${l.img}) center/cover`, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6 }}>
        {l.tags.map(t => <Badge key={t} tone="dark" size="sm">{t}</Badge>)}
      </div>
    </div>
    <div style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
        <div style={{ width: 20, height: 20, borderRadius: 10, background: `var(--grey100) url(${l.avatar}) center/cover`}}/>
        {l.coach}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.4, marginBottom: 8,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {l.title}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
        <Icon name="star" size={12} color="var(--orange500)"/> {l.rating} ({l.reviews})
      </div>
      <div className="tab-num" style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)' }}>
        {l.price.toLocaleString()}원<span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>/{l.unit}</span>
      </div>
    </div>
  </div>
);

const LessonsList = ({ onNav }) => (
  <Phone>
    <AppBar title="레슨" leading={<button className="tm-btn tm-btn-ghost tm-btn-icon" onClick={() => onNav?.('home')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>} trailing={[
      <button key="s" className="tm-btn tm-btn-ghost tm-btn-icon"><Icon name="search" size={22} color="var(--grey800)"/></button>,
    ]}/>
    <div style={{ padding: '0 20px 16px' }}>
      <div style={{ padding: 16, background: 'var(--blue50)', borderRadius: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--blue500)', fontWeight: 700 }}>검증된 코치와 함께</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-strong)', marginTop: 2, lineHeight: 1.35 }}>한 번에 확실히 배워요</div>
      </div>
    </div>
    <div style={{ padding: '0 20px 12px', display: 'flex', gap: 8, overflow: 'auto' }}>
      {['전체', '1:1', '그룹', '원데이', '초보', '실전'].map(c => <Chip key={c}>{c}</Chip>)}
    </div>
    <div style={{ flex: 1, overflow: 'auto', padding: '4px 20px 20px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {LESSONS.map(l => <LessonCard key={l.id} l={l} onClick={() => onNav?.('lesson', l)}/>)}
      </div>
    </div>
    <TabBar/>
  </Phone>
);

Object.assign(window, { TeamMatchesList, TeamMatchDetail, TeamDetail, LessonsList, TeamMatchCard, LessonCard, GradeBadge });
