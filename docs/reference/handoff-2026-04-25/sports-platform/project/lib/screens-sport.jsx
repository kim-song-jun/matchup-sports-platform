/* Sport-specific match templates + marketplace detail + team chat announcement */

/* Sport-specific match views — each sport shows different context:
   - soccer: position diagram, uniform color, 11v11 structure
   - futsal: 5v5, indoor, time slots
   - basketball: court side, 3on3 vs 5on5
   - tennis: singles/doubles, skill level rating (NTRP)
   - badminton: doubles partners, rank
   - ice hockey: full gear req, experience note
*/

const SportBadge = ({ sport }) => {
  const map = {
    soccer:     { l: '축구',  c: 'var(--green500)', bg: '#e7f7ee' },
    futsal:     { l: '풋살',  c: 'var(--red500)', bg: '#fef0f1' },
    basketball: { l: '농구',  c: 'var(--orange500)', bg: 'var(--orange50)' },
    badminton:  { l: '배드민턴', c: '#8b5cf6', bg: '#f3eeff' },
    tennis:     { l: '테니스', c: '#09b0c1', bg: '#e0f6f8' },
    ice_hockey: { l: '아이스하키', c: 'var(--blue500)', bg: 'var(--blue50)' },
  };
  const s = map[sport] || map.soccer;
  return (
    <span style={{ padding: '3px 10px', borderRadius: 999, background: s.bg, color: s.c, fontSize: 11, fontWeight: 700 }}>{s.l}</span>
  );
};

/* Soccer — position picker diagram on match detail */
const SoccerMatchDetail = ({ onNav, m = MATCHES[0] }) => {
  const [pos, setPos] = React.useState(null);
  const positions = [
    { id: 'gk', x: 50, y: 88, label: 'GK', taken: false },
    { id: 'lb', x: 20, y: 70, label: 'LB', taken: true },
    { id: 'cb1', x: 38, y: 72, label: 'CB', taken: true },
    { id: 'cb2', x: 62, y: 72, label: 'CB', taken: false },
    { id: 'rb', x: 80, y: 70, label: 'RB', taken: true },
    { id: 'lm', x: 20, y: 50, label: 'LM', taken: true },
    { id: 'cm1', x: 40, y: 50, label: 'CM', taken: false },
    { id: 'cm2', x: 60, y: 50, label: 'CM', taken: true },
    { id: 'rm', x: 80, y: 50, label: 'RM', taken: false },
    { id: 'st1', x: 38, y: 22, label: 'ST', taken: true },
    { id: 'st2', x: 62, y: 22, label: 'ST', taken: false },
  ];
  return (
    <Phone>
      <AppBar title="포지션 선택" leading={<button className="tm-btn tm-btn-ghost tm-btn-icon" onClick={() => onNav?.('match')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>}/>
      <div style={{ padding: '0 20px 12px' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>{m.title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>4-4-2 · {m.cur}/{m.max}명 · 빨강 유니폼</div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 20px 16px' }}>
        {/* Soccer field */}
        <div style={{ position: 'relative', aspectRatio: '2/3', borderRadius: 14, background: 'linear-gradient(180deg, #24a35a 0%, #1f8d4c 100%)', overflow: 'hidden', marginBottom: 18 }}>
          {/* lines */}
          <div style={{ position: 'absolute', inset: 12, border: '2px solid rgba(255,255,255,.6)', borderRadius: 4 }}/>
          <div style={{ position: 'absolute', left: 12, right: 12, top: '50%', height: 2, background: 'rgba(255,255,255,.6)' }}/>
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 70, height: 70, borderRadius: 35, border: '2px solid rgba(255,255,255,.6)' }}/>
          <div style={{ position: 'absolute', left: '25%', right: '25%', top: 12, height: 44, border: '2px solid rgba(255,255,255,.6)', borderTop: 'none' }}/>
          <div style={{ position: 'absolute', left: '25%', right: '25%', bottom: 12, height: 44, border: '2px solid rgba(255,255,255,.6)', borderBottom: 'none' }}/>
          {positions.map(p => (
            <button className="tm-pressable tm-break-keep" key={p.id} onClick={() => !p.taken && setPos(p.id)} style={{
              position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%,-50%)',
              width: 36, height: 36, borderRadius: 18,
              background: p.taken ? 'rgba(255,255,255,.3)' : pos === p.id ? 'var(--blue500)' : 'var(--static-white)',
              color: p.taken ? 'rgba(255,255,255,.6)' : pos === p.id ? 'var(--static-white)' : 'var(--grey900)',
              fontSize: 10, fontWeight: 800, border: pos === p.id ? '2px solid var(--static-white)' : 'none',
              boxShadow: p.taken ? 'none' : '0 2px 6px rgba(0,0,0,.2)',
            }}>{p.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', fontSize: 12, color: 'var(--text-muted)', marginBottom: 18 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 6, background: 'var(--static-white)', border: '1px solid var(--border)' }}/>지원 가능</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 6, background: 'var(--grey300)' }}/>마감</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>경기 정보</div>
        <Card pad={16}>
          {[['포맷', '4-4-2'], ['경기 시간', '전후반 45분'], ['볼', '주최측 제공'], ['유니폼', '빨강 / 파랑']].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: k !== '유니폼' ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>{k}</span>
              <span style={{ fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </Card>
      </div>
      <div style={{ padding: '12px 20px 24px', borderTop: '1px solid var(--border)' }}>
        <SBtn full size="lg" disabled={!pos}>{pos ? `${positions.find(p=>p.id===pos).label} 포지션으로 참가` : '포지션을 선택하세요'}</SBtn>
      </div>
    </Phone>
  );
};

/* Basketball — 3on3 simpler, team split view */
const BasketballMatch = ({ onNav }) => {
  const teamA = [
    { name: '정민', lvl: 'B', height: 178 },
    { name: '준호', lvl: 'A', height: 185 },
    { name: '태윤', lvl: 'B', height: 180 },
  ];
  const teamB = [
    { name: '수아', lvl: 'A', height: 174 },
    { name: '지훈', lvl: 'B', height: 182 },
    { name: '예은', lvl: 'C', height: 176 },
  ];
  return (
    <Phone>
      <AppBar title="팀 구성" leading={<button className="tm-btn tm-btn-ghost tm-btn-icon" onClick={() => onNav?.('match')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>}/>
      <div style={{ padding: '8px 20px 20px' }}>
        <Card pad={16}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <SportBadge sport="basketball"/>
            <Badge tone="grey">3 on 3</Badge>
            <Badge tone="blue" size="sm">하프코트</Badge>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>강남농구장 2번코트 · 5/4 (일) 10:00</div>
        </Card>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 20px' }}>
        {[
          { label: 'TEAM A', color: 'var(--blue500)', bg: 'var(--blue50)', list: teamA },
          { label: 'TEAM B', color: 'var(--red500)', bg: 'var(--red50)', list: teamB },
        ].map(t => (
          <div key={t.label} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 14, background: t.color, color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800 }}>{t.label.slice(-1)}</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{t.label}</div>
              <div style={{ flex: 1 }}/>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>평균 180cm</span>
            </div>
            <Card pad={0}>
              {t.list.map((p, i) => (
                <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: i < 2 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 16, background: `var(--grey100) url(${[IMG.av1,IMG.av2,IMG.av3,IMG.av4,IMG.av5,IMG.av6][i + (t.label==='TEAM B'?3:0)]}) center/cover` }}/>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{p.height}cm</div>
                  </div>
                  <GradeBadge grade={p.lvl}/>
                </div>
              ))}
            </Card>
          </div>
        ))}
        <button className="tm-btn tm-btn-outline tm-btn-md tm-btn-block" style={{ borderStyle: 'dashed', borderWidth: 2, color: 'var(--blue500)' }}>
          + 이 경기에 참가하기
        </button>
      </div>
    </Phone>
  );
};

/* Tennis — singles/doubles selector with NTRP level */
const TennisMatch = ({ onNav }) => {
  const [mode, setMode] = React.useState('singles');
  return (
    <Phone>
      <AppBar title="테니스 상대 구하기" leading={<button className="tm-btn tm-btn-ghost tm-btn-icon" onClick={() => onNav?.('match')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>}/>
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 20px 20px' }}>
        <Card pad={16} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <SportBadge sport="tennis"/>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>올림픽공원 테니스장 · 5/5 19:00</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>테니스 상대 구해요</div>
        </Card>

        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>경기 형식</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {[{ id: 'singles', l: '단식', s: '1 vs 1', need: '1명' }, { id: 'doubles', l: '복식', s: '2 vs 2', need: '3명' }].map(f => (
            <button key={f.id} className="tm-card tm-pressable" onClick={() => setMode(f.id)} style={{
              flex: 1, padding: 16, borderRadius: 14,
              background: mode === f.id ? 'var(--blue50)' : 'var(--bg)',
              border: `2px solid ${mode === f.id ? 'var(--blue500)' : 'var(--border)'}`,
              textAlign: 'left',
            }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: mode === f.id ? 'var(--blue500)' : 'var(--text-strong)' }}>{f.l}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{f.s}</div>
              <div className="tab-num" style={{ fontSize: 12, color: 'var(--text-strong)', fontWeight: 700, marginTop: 10 }}>필요 {f.need}</div>
            </button>
          ))}
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>요구 실력 (NTRP)</div>
        <Card pad={16} style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>3.0 ~ 4.0</span>
            <span className="tab-num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue500)' }}>중급 수준</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1,2,3,4,5,6,7].map(n => (
              <div key={n} style={{ flex: 1, height: 8, borderRadius: 4, background: n >= 3 && n <= 4 ? 'var(--blue500)' : 'var(--grey200)' }}/>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: 'var(--text-caption)' }}>
            <span>1.0</span><span>3.0</span><span>5.0</span><span>7.0</span>
          </div>
        </Card>

        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>코트 정보</div>
        <Card pad={16}>
          {[['코트 표면', '하드'], ['실내/외', '야외'], ['조명', '있음'], ['볼', '본인 지참']].map(([k, v], i) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 3 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>{k}</span>
              <span style={{ fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </Card>
      </div>
      <div style={{ padding: '12px 20px 24px', borderTop: '1px solid var(--border)' }}>
        <SBtn full size="lg">{mode === 'singles' ? '단식' : '복식'} 상대로 신청</SBtn>
      </div>
    </Phone>
  );
};

/* Badminton — doubles partner match with rank */
const BadmintonMatch = ({ onNav }) => (
  <Phone>
    <AppBar title="복식 파트너 구해요" leading={<button className="tm-btn tm-btn-ghost tm-btn-icon" onClick={() => onNav?.('match')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px 20px' }}>
      <Card pad={16} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <SportBadge sport="badminton"/>
          <Badge tone="grey">복식</Badge>
          <Badge tone="orange" size="sm">급구</Badge>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>서초체육관 · 오늘 19:00</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>2시간 · 셔틀콕 제공</div>
      </Card>

      <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>현재 구성</div>
      {[
        { role: '파트너', filled: true, name: '지원', rank: '군ㆍB조' },
        { role: '상대 1', filled: true, name: '준석', rank: '군ㆍA조' },
        { role: '상대 2', filled: true, name: '하윤', rank: '군ㆍB조' },
        { role: '나', filled: false, name: '', rank: '파트너 자리 비어있음' },
      ].map((p, i) => (
        <Card key={i} pad={14} style={{ marginBottom: 8, background: p.filled ? 'var(--bg)' : 'var(--blue50)', borderColor: p.filled ? 'var(--border)' : 'var(--blue500)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 20, background: p.filled ? `var(--grey100) url(${[IMG.av2,IMG.av3,IMG.av4,IMG.av5][i]}) center/cover` : 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center' }}>
              {!p.filled && <Icon name="plus" size={22}/>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: p.filled ? 'var(--text-strong)' : 'var(--blue500)' }}>{p.filled ? p.name : '빈 자리'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{p.rank}</div>
            </div>
            <Badge tone={p.role === '파트너' || p.role === '나' ? 'blue' : 'grey'} size="sm">{p.role}</Badge>
          </div>
        </Card>
      ))}

      <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginTop: 20, marginBottom: 10 }}>요구 랭크</div>
      <Card pad={14}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {['구부 A', '구부 B', '군부 A', '군부 B', '군부 C'].map((r, i) => (
            <div key={r} style={{ padding: '6px 12px', borderRadius: 8, background: i >= 2 && i <= 3 ? 'var(--blue500)' : 'var(--grey100)', color: i >= 2 && i <= 3 ? 'var(--static-white)' : 'var(--grey600)', fontSize: 12, fontWeight: 700 }}>{r}</div>
          ))}
        </div>
      </Card>
    </div>
    <div style={{ padding: '12px 20px 24px', borderTop: '1px solid var(--border)' }}>
      <SBtn full size="lg">파트너로 참가하기</SBtn>
    </div>
  </Phone>
);

/* Ice Hockey — gear checklist + experience required */
const IceHockeyMatch = ({ onNav }) => {
  const gear = ['스케이트', '헬멧', '장갑', '엘보 패드', '무릎 패드', '스틱', '퍽'];
  return (
    <Phone>
      <div style={{ height: 200, background: `#222 url(${IMG.hockey}) center/cover`, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.5), rgba(0,0,0,.2))' }}/>
        <div style={{ position: 'absolute', top: 50, left: 16 }}>
          <button className="tm-btn tm-btn-icon tm-pressable" onClick={() => onNav?.('match')} style={{ width: 40, minWidth: 40, height: 40, borderRadius: 20, background: 'rgba(0,0,0,.5)', color: 'var(--static-white)' }}>
            <Icon name="chevL" size={22}/>
          </button>
        </div>
        <div style={{ position: 'absolute', bottom: 16, left: 20, right: 20, color: 'var(--static-white)' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <SportBadge sport="ice_hockey"/>
            <Badge tone="red">상급 이상</Badge>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>아이스하키 친선경기</div>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px 20px' }}>
        <Card pad={16} style={{ marginBottom: 16 }}>
          {[['일시', '5/10 (토) 21:00 - 23:00'], ['장소', '목동 아이스링크'], ['인원', '12 / 20 명'], ['참가비', '18,000원']].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: k !== '참가비' ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>{k}</span>
              <span className={k === '참가비' ? 'tab-num' : ''} style={{ fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </Card>

        <div style={{ display: 'flex', gap: 10, padding: 14, background: 'var(--red50)', borderRadius: 12, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 14, background: 'var(--red500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0 }}>!</div>
          <div style={{ fontSize: 13, color: 'var(--red500)', fontWeight: 600, lineHeight: 1.5 }}>
            보호 장비 필수 · 초보자 참가 불가합니다. 안전상 경력 2년 이상만 받아요.
          </div>
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>필수 장비 (본인 지참)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
          {gear.map(g => (
            <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--grey50)', borderRadius: 10 }}>
              <Icon name="check" size={16} color="var(--green500)" stroke={3}/>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{g}</span>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>포지션</div>
        <Card pad={16}>
          <div style={{ display: 'flex', gap: 10 }}>
            {[{ l: '골리', o: 0, m: 2 }, { l: '디펜더', o: 3, m: 6 }, { l: '포워드', o: 3, m: 8 }, { l: '센터', o: 2, m: 4 }].map(p => (
              <div key={p.l} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>{p.l}</div>
                <div className="tab-num" style={{ fontSize: 16, fontWeight: 800, color: p.o < p.m ? 'var(--blue500)' : 'var(--text-caption)' }}>{p.o}/{p.m}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div style={{ padding: '12px 20px 24px', borderTop: '1px solid var(--border)' }}>
        <SBtn full size="lg">참가 신청하기</SBtn>
      </div>
    </Phone>
  );
};

/* Futsal — 5v5 short-format time selector */
const FutsalMatch = ({ onNav }) => (
  <Phone>
    <AppBar title="풋살 매치" leading={<button className="tm-btn tm-btn-ghost tm-btn-icon" onClick={() => onNav?.('match')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px 20px' }}>
      <Card pad={16} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <SportBadge sport="futsal"/>
          <Badge tone="grey">5 vs 5</Badge>
          <Badge tone="blue" size="sm">실내</Badge>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>이태원 풋살파크 A코트</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>5/7 (수) · 2시간 예약 · 샤워실 있음</div>
      </Card>

      <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>시간 선택</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
        {[
          { t: '20:00 - 21:00', full: false, people: '8/10' },
          { t: '21:00 - 22:00', full: false, people: '6/10', sel: true },
          { t: '22:00 - 23:00', full: true, people: '10/10' },
          { t: '23:00 - 24:00', full: false, people: '2/10', low: true },
        ].map(s => (
          <button key={s.t} className="tm-card tm-pressable" disabled={s.full} style={{
            padding: 14, borderRadius: 12, textAlign: 'left',
            background: s.full ? 'var(--grey100)' : s.sel ? 'var(--blue500)' : 'var(--bg)',
            border: `1px solid ${s.sel ? 'var(--blue500)' : 'var(--border)'}`,
            color: s.sel ? 'var(--static-white)' : s.full ? 'var(--text-caption)' : 'var(--text-strong)',
            opacity: s.full ? .5 : 1,
          }}>
            <div className="tab-num" style={{ fontSize: 13, fontWeight: 700 }}>{s.t}</div>
            <div style={{ fontSize: 11, marginTop: 4, opacity: .8 }}>
              {s.full ? '마감' : s.low ? `${s.people} · 자리 많음` : s.people}
            </div>
          </button>
        ))}
      </div>

      <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>구성</div>
      <Card pad={16}>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
          {[{l:'GK', n:1, m:2}, {l:'DF', n:2, m:4}, {l:'MF', n:2, m:2}, {l:'FW', n:1, m:2}].map(x => (
            <div key={x.l} style={{ flex: 1, textAlign: 'center', padding: '10px 0', background: 'var(--grey50)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>{x.l}</div>
              <div className="tab-num" style={{ fontSize: 14, fontWeight: 800, marginTop: 2 }}>{x.n}/{x.m}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
    <div style={{ padding: '12px 20px 24px', borderTop: '1px solid var(--border)' }}>
      <SBtn full size="lg">21:00 타임 참가하기</SBtn>
    </div>
  </Phone>
);

/* Marketplace detail */
const ListingDetail = ({ onNav, l = LISTINGS[0] }) => (
  <Phone>
    <div style={{ position: 'relative', height: 375, background: `var(--grey100) url(${l.img}) center/cover` }}>
      <div style={{ position: 'absolute', top: 50, left: 8 }}>
        <button className="tm-btn tm-btn-icon tm-pressable" onClick={() => onNav?.('market')} style={{ width: 40, minWidth: 40, height: 40, borderRadius: 20, background: 'rgba(0,0,0,.5)', color: 'var(--static-white)' }}>
          <Icon name="chevL" size={22}/>
        </button>
      </div>
      <div style={{ position: 'absolute', top: 50, right: 8, display: 'flex', gap: 6 }}>
        <button className="tm-btn tm-btn-icon tm-pressable" style={{ width: 40, minWidth: 40, height: 40, borderRadius: 20, background: 'rgba(0,0,0,.5)', color: 'var(--static-white)' }}>
          <Icon name="star" size={22}/>
        </button>
      </div>
    </div>
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 22, background: `var(--grey100) url(${IMG.av2}) center/cover` }}/>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>용팔이</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{l.venue} · 거래 12회</div>
        </div>
        <div style={{ padding: '4px 8px', background: 'var(--green50)', borderRadius: 6, fontSize: 11, fontWeight: 700, color: 'var(--green500)' }}>매너 36.5℃</div>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <Badge tone="grey">{l.category}</Badge>
          <Badge tone="blue" size="sm">{l.cond}</Badge>
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.4, marginBottom: 10 }}>{l.title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>2일 전 · 조회 142</div>
        <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }}>
          2023년 구매한 제품입니다. 3번 정도 착용했고 생활 기스 없이 상태 최상입니다. 사이즈가 맞지 않아 판매합니다. 박스·영수증 보유하고 있으며 직거래 우선입니다.
        </div>
      </div>
      <div style={{ padding: '0 20px 20px' }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>거래 희망 장소</div>
        <Card pad={14}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="pin" size={18} color="var(--blue500)"/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>강남역 2번 출구</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>지하철역 · 주중 저녁 가능</div>
            </div>
          </div>
        </Card>
      </div>
      <div style={{ padding: '0 20px 20px' }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>관련 매물</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {LISTINGS.slice(1, 3).map(it => (
            <div key={it.id}>
              <div style={{ aspectRatio: '1/1', borderRadius: 10, background: `var(--grey100) url(${it.img}) center/cover`, marginBottom: 6 }}/>
              <div style={{ fontSize: 12, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{it.title}</div>
              <div className="tab-num" style={{ fontSize: 13, fontWeight: 800, marginTop: 4 }}>{it.price.toLocaleString()}원</div>
            </div>
          ))}
        </div>
      </div>
    </div>
    <div style={{ padding: '12px 20px 24px', background: 'var(--bg)', borderTop: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center' }}>
      <button className="tm-btn tm-btn-neutral tm-btn-icon">
        <Icon name="star" size={22} color="var(--grey700)"/>
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>가격제안 가능</div>
        <div className="tab-num" style={{ fontSize: 18, fontWeight: 800 }}>{l.price.toLocaleString()}원</div>
      </div>
      <SBtn size="lg" style={{ padding: '0 28px' }}>채팅하기</SBtn>
    </div>
  </Phone>
);

/* Sport picker landing — shows per-sport match counts and features */
const SportHub = ({ onNav }) => (
  <Phone>
    <AppBar title="종목별" leading={<button className="tm-btn tm-btn-ghost tm-btn-icon" onClick={() => onNav?.('home')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>}/>
    <div style={{ flex: 1, overflow: 'auto' }}>
      {[
        { id: 'soccer',     l: '축구',    count: 12, feat: '포지션 선택 · 11v11', trend: '+23%' },
        { id: 'futsal',     l: '풋살',    count: 8,  feat: '5v5 · 실내 코트',      trend: '+15%' },
        { id: 'basketball', l: '농구',    count: 6,  feat: '3on3 · 팀 구성',       trend: '+8%' },
        { id: 'tennis',     l: '테니스',  count: 4,  feat: '단식 · 복식 · NTRP',   trend: '+40%' },
        { id: 'badminton',  l: '배드민턴', count: 9,  feat: '복식 파트너 · 랭크별',  trend: '+12%' },
        { id: 'ice_hockey', l: '아이스하키', count: 2, feat: '장비 필수 · 상급 이상', trend: '새 종목' },
      ].map((s, i) => {
        const img = { soccer: IMG.soccer, futsal: IMG.futsal, basketball: IMG.basket, tennis: IMG.tennis, badminton: IMG.badmin, ice_hockey: IMG.hockey }[s.id];
        return (
          <button key={s.id} className="tm-list-row tm-pressable" style={{
            width: '100%',
            borderBottom: '1px solid var(--border)', textAlign: 'left', background: 'transparent',
          }}>
            <div style={{ width: 72, height: 72, borderRadius: 14, background: `var(--grey100) url(${img}) center/cover`, flexShrink: 0 }}/>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-strong)' }}>{s.l}</span>
                <Badge tone={s.trend.startsWith('새') ? 'blue' : 'green'} size="sm">{s.trend}</Badge>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{s.feat}</div>
              <div className="tab-num" style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue500)' }}>이번주 {s.count}개 매치</div>
            </div>
            <div style={{ alignSelf: 'center' }}>
              <Icon name="chevR" size={20} color="var(--grey400)"/>
            </div>
          </button>
        );
      })}
    </div>
  </Phone>
);

Object.assign(window, { SoccerMatchDetail, BasketballMatch, TennisMatch, BadmintonMatch, IceHockeyMatch, FutsalMatch, ListingDetail, SportHub, SportBadge });
