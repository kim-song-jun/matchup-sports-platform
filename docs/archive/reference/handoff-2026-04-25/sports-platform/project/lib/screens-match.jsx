/* Teameet — Home, Matches list, Match detail, Match create */

const SportPill = ({ sport, active, onClick }) => (
  <button className="tm-pressable" onClick={onClick} style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
    minWidth: 64, padding: '4px 0',
    background: 'transparent',
  }}>
    <div style={{
      width: 56, height: 56, borderRadius: 20,
      background: sport.img ? `var(--grey100) url(${sport.img}) center/cover` : 'var(--blue50)',
      position: 'relative', overflow: 'hidden',
      boxShadow: active ? '0 0 0 2px var(--blue500)' : 'inset 0 0 0 1px var(--border)',
      transition: 'box-shadow .15s',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: sport.img ? 'linear-gradient(180deg, rgba(0,0,0,.0), rgba(0,0,0,.35))' : 'transparent',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        color: 'var(--static-white)', fontWeight: 800, fontSize: 14, paddingBottom: 6,
      }}>
        {!sport.img && <span style={{ color: 'var(--blue500)', fontSize: 22 }}>{sport.emoji}</span>}
      </div>
    </div>
    <div style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? 'var(--grey900)' : 'var(--grey600)' }}>
      {sport.label}
    </div>
  </button>
);

const MatchCard = ({ m, compact, onClick }) => {
  const fillPct = (m.cur / m.max) * 100;
  const urgent = fillPct >= 70;
  return (
    <div className="tm-card tm-card-interactive" onClick={onClick} style={{
      overflow: 'hidden',
    }}>
      <div style={{ position: 'relative', aspectRatio: compact ? '16/9' : '16/10', background: `var(--grey100) url(${m.img}) center/cover` }}>
        <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6 }}>
          <Badge tone="dark">{SPORTS.find(s => s.id === m.sport)?.label}</Badge>
          {urgent && <Badge tone="red">마감임박</Badge>}
        </div>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,.55))',
        }} />
        <div style={{ position: 'absolute', bottom: 12, left: 14, right: 14, color: 'var(--static-white)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, opacity: .9, letterSpacing: .3 }}>{m.date} · {m.time}</div>
        </div>
      </div>
      <div style={{ padding: compact ? '14px 16px 16px' : '16px 18px 18px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.4, marginBottom: 8,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {m.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          <Icon name="pin" size={13} color="var(--grey400)" /> {m.venue}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: urgent ? 'var(--red500)' : 'var(--text)' }}>
            <Icon name="people" size={14} /> <span className="tab-num">{m.cur}/{m.max}명</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }} className="tab-num">
            {m.fee === 0 ? '무료' : m.fee.toLocaleString() + '원'}
          </div>
        </div>
        <Progress value={m.cur} max={m.max} urgent={urgent} />
      </div>
    </div>
  );
};

const Home = ({ variant = 'A', onNav }) => {
  const [sport, setSport] = React.useState('all');
  const [tab, setTab] = React.useState('home');
  const filtered = sport === 'all' ? MATCHES : MATCHES.filter(m => m.sport === sport);

  const Hero = variant === 'A' ? (
    <div style={{ margin: '0 20px 20px', borderRadius: 20, overflow: 'hidden',
      background: 'linear-gradient(135deg, var(--blue500) 0%, var(--blue700) 100%)',
      padding: '22px 20px', color: 'var(--static-white)', position: 'relative',
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, opacity: .9 }}>이번 주 딱 맞는 매치</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, lineHeight: 1.3 }}>
        124건이 지금<br/>당신을 기다려요
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <div style={{ background: 'rgba(255,255,255,.2)', padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>마감임박 12</div>
        <div style={{ background: 'rgba(255,255,255,.2)', padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>무료 8</div>
      </div>
    </div>
  ) : variant === 'B' ? (
    <div style={{ margin: '0 20px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {[
        { t: '빠른 매칭',  s: '지금 참가', bg: 'var(--grey900)', fg: 'var(--static-white)' },
        { t: '팀 매칭',    s: 'S~D 등급',  bg: 'var(--blue500)', fg: 'var(--static-white)' },
        { t: '용병 구인',  s: '자리 채우기', bg: 'var(--blue50)', fg: 'var(--blue500)' },
        { t: '레슨 예약',  s: '코치 찾기',  bg: 'var(--grey100)', fg: 'var(--grey900)' },
      ].map((x, i) => (
        <div key={i} style={{ background: x.bg, color: x.fg, padding: 16, borderRadius: 14, minHeight: 84 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{x.t}</div>
          <div style={{ fontSize: 11, opacity: .8, marginTop: 4 }}>{x.s}</div>
        </div>
      ))}
    </div>
  ) : (
    <div style={{ margin: '0 20px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '16px 0 12px' }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>안녕하세요, 정민님</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)', marginTop: 4 }}>오늘은 어떤 경기를 뛸까요?</div>
        </div>
      </div>
    </div>
  );

  return (
    <Phone>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 20 }}>
        {/* header */}
        <div style={{ padding: '8px 20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--blue500)', letterSpacing: 0 }}>Teameet</div>
          <div style={{ display: 'flex', gap: 14 }}>
            <Icon name="search" size={22} color="var(--grey800)" />
            <Icon name="bell" size={22} color="var(--grey800)" />
          </div>
        </div>

        {Hero}

        {/* sport carousel */}
        <div style={{ overflow: 'auto', padding: '0 20px 16px' }}>
          <div style={{ display: 'flex', gap: 14 }}>
            {SPORTS.map(s => <SportPill key={s.id} sport={s} active={sport === s.id} onClick={() => setSport(s.id)} />)}
          </div>
        </div>

        {/* featured match */}
        <div style={{ padding: '4px 20px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-strong)' }}>추천 매치</div>
            <SBtn variant="ghost" size="sm" onClick={() => onNav?.('matches')}>전체보기</SBtn>
          </div>
          <MatchCard m={filtered[0]} onClick={() => onNav?.('match', filtered[0])} />
        </div>

        {/* upcoming row */}
        <div style={{ padding: '0 0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 12px' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-strong)' }}>마감임박</div>
          </div>
          <div style={{ overflow: 'auto', padding: '0 20px' }}>
            <div style={{ display: 'flex', gap: 12 }}>
              {filtered.slice(1, 4).map(m => (
                <div key={m.id} style={{ minWidth: 220 }} onClick={() => onNav?.('match', m)}>
                  <MatchCard m={m} compact />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* shortcut tiles */}
        <div style={{ padding: '0 20px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { t: '팀 매칭', s: 'S~D 등급으로 대결', tone: 'var(--blue500)', dest: 'team-matches' },
              { t: '내 팀',   s: '소속 팀 바로가기',   tone: 'var(--grey900)', dest: 'teams' },
              { t: '레슨',    s: '검증된 코치 예약',   tone: 'var(--green500)', dest: 'lessons' },
              { t: '장터',    s: '스포츠 용품 거래',   tone: 'var(--orange500)', dest: 'marketplace' },
            ].map((x, i) => (
              <button key={i} className="tm-card tm-card-interactive tm-pressable" onClick={() => onNav?.(x.dest)} style={{
                padding: 14, textAlign: 'left',
              }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: x.tone, opacity: .12, marginBottom: 10 }} />
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{x.t}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{x.s}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
      <TabBar active={tab} onChange={setTab} />
    </Phone>
  );
};

const MatchesList = ({ onNav }) => {
  const [sport, setSport] = React.useState('all');
  const [sort, setSort] = React.useState('recent');
  const list = sport === 'all' ? MATCHES : MATCHES.filter(m => m.sport === sport);
  return (
    <Phone>
      <AppBar title="매치 찾기" trailing={[
        <button key="s" className="tm-btn tm-btn-ghost tm-btn-icon"><Icon name="search" size={22} color="var(--grey800)"/></button>,
        <button key="f" className="tm-btn tm-btn-ghost tm-btn-icon"><Icon name="filter" size={22} color="var(--grey800)"/></button>,
      ]} />
      {/* sport chips */}
      <div style={{ overflow: 'auto', padding: '4px 20px 12px' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {SPORTS.map(s => (
            <Chip key={s.id} active={sport === s.id} onClick={() => setSport(s.id)}>{s.label}</Chip>
          ))}
        </div>
      </div>
      {/* sort row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px 12px', alignItems: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
          <span className="tab-num">{list.length}</span>개의 매치
        </div>
        <SBtn
          variant="ghost"
          size="sm"
          onClick={() => setSort(sort === 'recent' ? 'urgent' : 'recent')}
          iconRight={<Icon name="chevD" size={14}/>}
        >
          {sort === 'recent' ? '최신순' : '마감임박순'}
        </SBtn>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {list.map(m => <MatchCard key={m.id} m={m} onClick={() => onNav?.('match', m)} />)}
      </div>
      {/* FAB */}
      <button className="tm-btn tm-btn-primary tm-pressable" onClick={() => onNav?.('match-new')} style={{
        position: 'absolute', bottom: 80, right: 20,
        width: 56, height: 56, borderRadius: 28,
        boxShadow: 'var(--sh-3)',
        padding: 0,
      }}>
        <Icon name="plus" size={26} stroke={2.4}/>
      </button>
      <TabBar active="match"/>
    </Phone>
  );
};

const MatchDetail = ({ m = MATCHES[0], onNav, onJoin }) => {
  const fillPct = (m.cur / m.max) * 100;
  const urgent = fillPct >= 70;
  return (
    <Phone>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 110 }}>
        {/* hero image */}
        <div style={{ position: 'relative', height: 300, background: `var(--grey100) url(${m.img}) center/cover` }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,.55) 100%)' }}/>
          <div style={{ position: 'absolute', top: 8, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', padding: '0 16px' }}>
            <button className="tm-btn tm-btn-icon tm-pressable" onClick={() => onNav?.('matches')} style={{ width: 40, minWidth: 40, height: 40, borderRadius: 20, background: 'rgba(0,0,0,.4)', color: 'var(--static-white)' }}>
              <Icon name="chevL" size={22}/>
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              {['share', 'heart'].map(n => (
                <button key={n} className="tm-btn tm-btn-icon tm-pressable" style={{ width: 40, minWidth: 40, height: 40, borderRadius: 20, background: 'rgba(0,0,0,.4)', color: 'var(--static-white)' }}>
                  <Icon name={n} size={20}/>
                </button>
              ))}
            </div>
          </div>
          <div style={{ position: 'absolute', bottom: 16, left: 20, right: 20, color: 'var(--static-white)' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <Badge tone="dark">{SPORTS.find(s => s.id === m.sport)?.label}</Badge>
              <Badge tone="blue">레벨 {m.level}</Badge>
              {urgent && <Badge tone="red">마감임박</Badge>}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.3 }}>{m.title}</div>
          </div>
        </div>

        {/* info rows */}
        <div style={{ padding: 20 }}>
          {[
            { icon: 'calendar', label: '일시', value: `${m.date} ${m.time}` },
            { icon: 'pin',      label: '장소', value: m.venue },
            { icon: 'people',   label: '인원', value: <span><span className="tab-num" style={{ fontWeight: 700, color: urgent ? 'var(--red500)' : 'var(--text-strong)'}}>{m.cur}</span><span style={{color:'var(--text-muted)'}}>/{m.max}명</span></span> },
            { icon: 'money',    label: '참가비', value: <span className="tab-num" style={{ fontWeight: 700 }}>{m.fee.toLocaleString()}원</span> },
          ].map((row, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: i < 3 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--grey100)', display: 'grid', placeItems: 'center', color: 'var(--grey700)'}}>
                <Icon name={row.icon} size={18}/>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', width: 48 }}>{row.label}</div>
              <div style={{ fontSize: 14, color: 'var(--text-strong)', fontWeight: 500 }}>{row.value}</div>
            </div>
          ))}
          {/* fill progress */}
          <div style={{ marginTop: 16, padding: 14, background: 'var(--grey50)', borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>모집 현황</span>
              <span className="tab-num" style={{ fontSize: 12, fontWeight: 700, color: urgent ? 'var(--red500)' : 'var(--text-strong)' }}>{Math.round(fillPct)}% 차는 중</span>
            </div>
            <Progress value={m.cur} max={m.max} urgent={urgent}/>
          </div>
        </div>

        {/* host */}
        <div style={{ padding: '0 20px 20px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 10 }}>호스트</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, border: '1px solid var(--border)', borderRadius: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 22, background: `var(--grey100) url(${IMG.av1}) center/cover` }}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{m.host}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>매너 ★ 4.9 · 주최 23회</div>
            </div>
            <SBtn variant="neutral" size="sm">프로필</SBtn>
          </div>
        </div>

        {/* description */}
        <div style={{ padding: '0 20px 24px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 8 }}>경기 소개</div>
          <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }}>
            토요일 오후 가볍게 한 판 뛸 사람 구합니다. 풀코트, 22명 11:11 경기로 진행해요. 초급부터 중상급까지 환영하고 매너 있는 분들이면 누구나 환영입니다. 첫 참여도 부담 없이 오세요.
          </div>
        </div>

        {/* participants */}
        <div style={{ padding: '0 20px 24px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 12 }}>참가자 <span className="tab-num" style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{m.cur}명</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[IMG.av1, IMG.av2, IMG.av3, IMG.av4, IMG.av5, IMG.av6, IMG.av7, IMG.av8].map((a, i) => (
              <div key={i} style={{ width: 40, height: 40, borderRadius: 20, background: `var(--grey100) url(${a}) center/cover`, border: '2px solid var(--bg)' }}/>
            ))}
            <div style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--grey100)', display: 'grid', placeItems: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>+{Math.max(0, m.cur - 8)}</div>
          </div>
        </div>
      </div>

      {/* sticky CTA */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '12px 20px 28px',
        background: 'var(--bg)', borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>참가비</div>
          <div className="tab-num" style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-strong)' }}>{m.fee.toLocaleString()}원</div>
        </div>
        <SBtn full={false} size="lg" onClick={onJoin} style={{ padding: '0 36px' }}>참가하기</SBtn>
      </div>
    </Phone>
  );
};

/* Bottom sheet for join confirm / payment */
const JoinSheet = ({ open, onClose, m }) => {
  if (!open) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10,
      background: 'rgba(2,9,19,.5)',
      display: 'flex', alignItems: 'flex-end',
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', background: 'var(--bg)',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: '16px 20px 28px',
        animation: 'slideUp .25s cubic-bezier(0,0,.2,1)',
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--grey200)', margin: '0 auto 16px' }}/>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 4 }}>매치 참가 확인</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>아래 내용을 확인 후 참가해주세요</div>

        <div style={{ padding: 16, background: 'var(--grey50)', borderRadius: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 12 }}>{m.title}</div>
          {[['일시', `${m.date} ${m.time}`], ['장소', m.venue], ['인원', `${m.cur}/${m.max}명`]].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>{k}</span>
              <span style={{ color: 'var(--text-strong)', fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 4px 20px' }}>
          <span style={{ fontSize: 15, color: 'var(--text-strong)', fontWeight: 700 }}>총 결제금액</span>
          <span className="tab-num" style={{ fontSize: 20, fontWeight: 800, color: 'var(--blue500)' }}>{m.fee.toLocaleString()}원</span>
        </div>

        <SBtn full size="lg" onClick={onClose}>{m.fee === 0 ? '참가하기' : '결제하고 참가하기'}</SBtn>
      </div>
      <style>{`@keyframes slideUp { from { transform: translateY(40px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }`}</style>
    </div>
  );
};

/* Match create - multi-step form */
const MatchCreate = ({ onNav }) => {
  const [step, setStep] = React.useState(0);
  const [sport, setSport] = React.useState('soccer');
  const steps = ['종목', '정보', '장소·일시', '확인'];
  return (
    <Phone>
      <AppBar title="매치 만들기" leading={
        <button className="tm-btn tm-btn-ghost tm-btn-icon" onClick={() => step === 0 ? onNav?.('matches') : setStep(step - 1)}>
          <Icon name="chevL" size={24} color="var(--grey800)"/>
        </button>
      }/>
      {/* step dots */}
      <div style={{ padding: '4px 20px 20px' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {steps.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? 'var(--blue500)' : 'var(--grey150)' }}/>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
          <span className="tab-num">{step + 1}</span>/{steps.length} · {steps[step]}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 20px' }}>
        {step === 0 && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 6 }}>어떤 종목인가요?</div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>경기 종목을 선택해주세요</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {SPORTS.filter(s => s.id !== 'all').map(s => (
                <button key={s.id} className="tm-card tm-pressable" onClick={() => setSport(s.id)} style={{
                  aspectRatio: '1/1', padding: 16, textAlign: 'left',
                  background: sport === s.id ? 'var(--blue50)' : 'var(--bg)',
                  border: `2px solid ${sport === s.id ? 'var(--blue500)' : 'var(--border)'}`,
                  position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{ position: 'absolute', inset: 0, background: `url(${s.img}) center/cover`, opacity: .15 }}/>
                  <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--static-white)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', color: 'var(--blue500)', fontWeight: 800 }}>{s.emoji}</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)' }}>{s.label}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        {step === 1 && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 20 }}>매치 정보를 알려주세요</div>
            <FormField label="제목" placeholder="예) 주말 축구 한 판"/>
            <FormField label="설명" placeholder="간단한 경기 소개" multi/>
            <FormField label="레벨" placeholder="중급 ~ 상급"/>
          </div>
        )}
        {step === 2 && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 20 }}>언제, 어디서 할까요?</div>
            <FormField label="시설명" placeholder="상암월드컵경기장 보조구장"/>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <FormField label="날짜" placeholder="2026.05.03"/>
              <FormField label="시간" placeholder="14:00"/>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <FormField label="인원" placeholder="22명"/>
              <FormField label="참가비" placeholder="12,000원"/>
            </div>
          </div>
        )}
        {step === 3 && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 20 }}>이렇게 만들까요?</div>
            <div style={{ padding: 18, background: 'var(--grey50)', borderRadius: 14 }}>
              {[
                ['종목', '축구'],
                ['제목', '주말 축구 한 판'],
                ['일시', '2026.05.03 14:00'],
                ['장소', '상암월드컵경기장 보조구장'],
                ['인원', '22명'],
                ['참가비', '12,000원'],
              ].map(([k, v], i, arr) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{k}</span>
                  <span style={{ fontSize: 14, color: 'var(--text-strong)', fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '12px 20px 24px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
        <SBtn full size="lg" onClick={() => step < 3 ? setStep(step + 1) : onNav?.('matches')}>
          {step < 3 ? '다음' : '매치 만들기'}
        </SBtn>
      </div>
    </Phone>
  );
};

const FormField = ({ label, placeholder, multi }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>{label}</div>
    {multi ? (
      <textarea placeholder={placeholder} className="tm-input" style={{
        padding: 14,
        background: 'var(--grey50)', minHeight: 80, resize: 'none',
      }}/>
    ) : (
      <input placeholder={placeholder} className="tm-input" style={{
        background: 'var(--grey50)',
      }}/>
    )}
  </div>
);

Object.assign(window, { Home, MatchesList, MatchDetail, MatchCreate, JoinSheet, MatchCard, SportPill });
