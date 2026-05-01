/* Deep sport-specific level systems, lesson pass flow, equipment rental, team booking, home widgets */

/* ═══════════════════ 1. Sport-specific LEVEL CERTIFICATION ═══════════════════ */

/* 축구/풋살 — 선출 인증 + 포지션별 경력 */
const SoccerLevelCert = ({ onNav }) => {
  const [pro, setPro] = React.useState(null);
  const [years, setYears] = React.useState(3);
  const [pos, setPos] = React.useState('MF');
  return (
    <Phone>
      <AppBar title="축구 · 풋살 실력 인증" leading={<button className="tm-pressable tm-break-keep" onClick={() => onNav?.('settings')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>}/>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px 20px' }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>선출 여부</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
          {[
            { id: 'pro',    l: '선출',      s: '고교 이상 선수 경력' },
            { id: 'semi',   l: '반선출',    s: '유소년 엘리트반' },
            { id: 'club',   l: '클럽 출신', s: '동호회 리그 경력' },
            { id: 'none',   l: '일반',      s: '취미로 시작' },
          ].map(o => {
            const on = pro === o.id;
            return (
              <button className="tm-pressable tm-break-keep" key={o.id} onClick={() => setPro(o.id)} style={{
                padding: 14, borderRadius: 12, textAlign: 'left',
                background: on ? 'var(--blue50)' : 'var(--bg)',
                border: `2px solid ${on ? 'var(--blue500)' : 'var(--border)'}`,
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: on ? 'var(--blue500)' : 'var(--text-strong)' }}>{o.l}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>{o.s}</div>
              </button>
            );
          })}
        </div>

        {pro && pro !== 'none' && (
          <div style={{ padding: 14, background: 'var(--orange50)', borderRadius: 12, marginBottom: 22, display: 'flex', gap: 10 }}>
            <Icon name="shield" size={18} color="var(--orange500)"/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--orange500)' }}>선출 인증 필요</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>공정한 매칭을 위해 학적부 또는 선수증 사진이 필요해요. 초급 매치에는 참가 제한이 걸립니다.</div>
              <button className="tm-pressable tm-break-keep" style={{ marginTop: 10, padding: '6px 12px', borderRadius: 8, background: 'var(--orange500)', color: 'var(--static-white)', fontSize: 12, fontWeight: 700 }}>서류 업로드</button>
            </div>
          </div>
        )}

        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>축구 구력 <span className="tab-num" style={{ color: 'var(--blue500)', fontWeight: 800 }}>{years}년</span></div>
        <Card pad={16} style={{ marginBottom: 22 }}>
          <input type="range" min="0" max="20" value={years} onChange={e => setYears(+e.target.value)} style={{ width: '100%', accentColor: 'var(--blue500)' }}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-caption)', marginTop: 4 }}>
            <span>0년</span><span>10년</span><span>20년+</span>
          </div>
        </Card>

        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>주 포지션</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
          {['GK', 'DF', 'MF', 'FW'].map(p => (
            <button className="tm-pressable tm-break-keep" key={p} onClick={() => setPos(p)} style={{
              flex: 1, height: 48, borderRadius: 10,
              background: pos === p ? 'var(--blue500)' : 'var(--grey100)',
              color: pos === p ? 'var(--static-white)' : 'var(--grey700)',
              fontSize: 14, fontWeight: 800,
            }}>{p}</button>
          ))}
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>선호 발</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['왼발', '오른발', '양발'].map(f => (
            <Chip key={f}>{f}</Chip>
          ))}
        </div>
      </div>
      <div style={{ padding: '12px 20px 24px', borderTop: '1px solid var(--border)' }}>
        <SBtn full size="lg" disabled={!pro}>실력 등록하기</SBtn>
      </div>
    </Phone>
  );
};

/* 하키/피겨 — 스케이트 경력 + 등급 */
const HockeyLevelCert = ({ onNav }) => {
  const [cat, setCat] = React.useState('hockey');
  const [skateYears, setSkateYears] = React.useState(5);
  const [hockeyYears, setHockeyYears] = React.useState(2);
  const grades = ['프리 8급', '프리 7급', '프리 6급', '프리 5급', '프리 4급', '프리 3급', '프리 2급', '프리 1급', '싱글 테스트'];
  const [grade, setGrade] = React.useState(4);
  return (
    <Phone>
      <AppBar title="아이스 · 피겨 경력" leading={<button className="tm-pressable tm-break-keep" onClick={() => onNav?.('settings')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>}/>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px 20px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
          {[{id:'hockey',l:'아이스하키'},{id:'figure',l:'피겨'},{id:'speed',l:'스피드'}].map(c => (
            <button className="tm-pressable tm-break-keep" key={c.id} onClick={() => setCat(c.id)} style={{
              flex: 1, height: 42, borderRadius: 10,
              background: cat === c.id ? 'var(--grey900)' : 'var(--grey100)',
              color: cat === c.id ? 'var(--static-white)' : 'var(--grey700)',
              fontSize: 13, fontWeight: 700,
            }}>{c.l}</button>
          ))}
        </div>

        <Card pad={16} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>총 스케이트 경력</div>
          <div className="tab-num" style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-strong)' }}>{skateYears}년</div>
          <input type="range" min="0" max="20" value={skateYears} onChange={e => setSkateYears(+e.target.value)} style={{ width: '100%', accentColor: 'var(--blue500)', marginTop: 10 }}/>
        </Card>

        {cat === 'hockey' && (
          <>
            <Card pad={16} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>아이스하키 경력</div>
              <div className="tab-num" style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-strong)' }}>{hockeyYears}년</div>
              <input type="range" min="0" max="15" value={hockeyYears} onChange={e => setHockeyYears(+e.target.value)} style={{ width: '100%', accentColor: 'var(--blue500)', marginTop: 10 }}/>
            </Card>

            <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>리그 참가 경력</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
              {['없음', '사회인 리그', '실업팀', '대학부', '국가대표'].map(l => <Chip key={l}>{l}</Chip>)}
            </div>

            <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>포지션 · 핸드</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              {['센터', '윙', '디펜스', '골리'].map(p => <Chip key={p}>{p}</Chip>)}
            </div>
          </>
        )}

        {cat === 'figure' && (
          <>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>피겨 등급 (KOR)</div>
            <Card pad={16} style={{ marginBottom: 18 }}>
              <div className="tab-num" style={{ fontSize: 22, fontWeight: 800, color: 'var(--blue500)', marginBottom: 10 }}>{grades[grade]}</div>
              <input type="range" min="0" max={grades.length - 1} value={grade} onChange={e => setGrade(+e.target.value)} style={{ width: '100%', accentColor: 'var(--blue500)' }}/>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-caption)', marginTop: 4 }}>
                <span>입문</span><span>중급</span><span>엘리트</span>
              </div>
            </Card>

            <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>구사 가능 점프</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
              {['싱글 살코', '싱글 루프', '싱글 플립', '싱글 럿츠', '싱글 악셀', '더블 살코'].map(j => <Chip key={j}>{j}</Chip>)}
            </div>
          </>
        )}

        <div style={{ padding: 14, background: 'var(--blue50)', borderRadius: 12, display: 'flex', gap: 10 }}>
          <Icon name="shield" size={18} color="var(--blue500)"/>
          <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>
            경력 정보는 매치 참가 조건 필터링에 사용돼요. 경력이 부족한 경기는 자동으로 숨겨집니다.
          </div>
        </div>
      </div>
      <div style={{ padding: '12px 20px 24px', borderTop: '1px solid var(--border)' }}>
        <SBtn full size="lg">저장하기</SBtn>
      </div>
    </Phone>
  );
};

/* 테니스 — NTRP 상세 자가진단 */
const TennisLevelCert = ({ onNav }) => {
  const [ntrp, setNtrp] = React.useState(3.5);
  const desc = {
    1.0: '이제 막 배우기 시작했어요',
    1.5: '서브 정도는 넣을 수 있어요',
    2.0: '랠리가 몇 번 이어져요',
    2.5: '게임 룰을 알고 플레이해요',
    3.0: '방향성 있게 칠 수 있어요',
    3.5: '의도적인 방향·스핀·깊이가 가능해요',
    4.0: '네트 플레이, 전술 이해',
    4.5: '강한 서브, 페이스 조절',
    5.0: '클럽 챔피언 수준',
    5.5: '지역 토너먼트 우승 경험',
    6.0: '실업급',
    6.5: '프로 입문',
    7.0: '프로',
  };
  const keys = Object.keys(desc).map(Number);
  return (
    <Phone>
      <AppBar title="NTRP 자가진단" leading={<button className="tm-pressable tm-break-keep" onClick={() => onNav?.('settings')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>}/>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px 20px' }}>
        <Card pad={20} style={{ marginBottom: 22, background: 'var(--blue500)', borderColor: 'var(--blue500)' }}>
          <div style={{ color: 'var(--static-white)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, opacity: .8 }}>내 NTRP</div>
            <div className="tab-num" style={{ fontSize: 44, fontWeight: 800, lineHeight: 1 }}>{ntrp.toFixed(1)}</div>
            <div style={{ fontSize: 13, marginTop: 6, opacity: .9 }}>{desc[ntrp]}</div>
          </div>
        </Card>

        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>레벨 조정</div>
        <Card pad={16} style={{ marginBottom: 22 }}>
          <input type="range" min="1" max="7" step="0.5" value={ntrp} onChange={e => setNtrp(+e.target.value)} style={{ width: '100%', accentColor: 'var(--blue500)' }}/>
          <div className="tab-num" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-caption)', marginTop: 6 }}>
            <span>1.0</span><span>3.5</span><span>5.0</span><span>7.0</span>
          </div>
        </Card>

        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>스타일</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 22 }}>
          {['베이스라이너', '올코트', '서브앤발리', '카운터펀처'].map(s => <Chip key={s}>{s}</Chip>)}
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>경력</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['1년 미만', '1-3년', '3-5년', '5년+'].map(y => <Chip key={y}>{y}</Chip>)}
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginTop: 22, marginBottom: 10 }}>레벨 인증</div>
        <Card pad={16}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>상위 유저와 게임 후 인증</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>3경기 후 인증 배지가 발급돼요</div>
            </div>
            <Badge tone="blue" size="sm">진행중 1/3</Badge>
          </div>
        </Card>
      </div>
      <div style={{ padding: '12px 20px 24px', borderTop: '1px solid var(--border)' }}>
        <SBtn full size="lg">저장하기</SBtn>
      </div>
    </Phone>
  );
};

/* 배드민턴 — 군부·구부 랭크 */
const BadmintonLevelCert = ({ onNav }) => {
  const tiers = [
    { k: '구부', ranks: ['A조', 'B조'], c: 'var(--red500)' },
    { k: '군부', ranks: ['A조', 'B조', 'C조', 'D조'], c: 'var(--orange500)' },
    { k: '시부', ranks: ['A조', 'B조', 'C조', 'D조'], c: 'var(--blue500)' },
  ];
  const [sel, setSel] = React.useState({ t: '군부', r: 'B조' });
  return (
    <Phone>
      <AppBar title="배드민턴 랭크" leading={<button className="tm-pressable tm-break-keep" onClick={() => onNav?.('settings')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>}/>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px 20px' }}>
        <div style={{ padding: 14, background: 'var(--blue50)', borderRadius: 12, marginBottom: 22, fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
          대한배드민턴협회 기준입니다. 선출 또는 군부 이상은 공식 인증이 필요해요.
        </div>

        {tiers.map(t => (
          <div key={t.k} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 6, height: 20, borderRadius: 3, background: t.c }}/>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{t.k}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${t.ranks.length}, 1fr)`, gap: 8 }}>
              {t.ranks.map(r => {
                const on = sel.t === t.k && sel.r === r;
                return (
                  <button className="tm-pressable tm-break-keep" key={r} onClick={() => setSel({ t: t.k, r })} style={{
                    padding: '14px 8px', borderRadius: 10,
                    background: on ? t.c : 'var(--bg)',
                    border: `1px solid ${on ? t.c : 'var(--border)'}`,
                    color: on ? 'var(--static-white)' : 'var(--text-strong)',
                    fontSize: 13, fontWeight: 700,
                  }}>{r}</button>
                );
              })}
            </div>
          </div>
        ))}

        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginTop: 10, marginBottom: 10 }}>선호 종목</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['단식', '복식', '혼복'].map(m => <Chip key={m}>{m}</Chip>)}
        </div>

        <div style={{ padding: 16, marginTop: 22, border: '1px dashed var(--border)', borderRadius: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>내 현재 랭크</div>
          <div className="tab-num" style={{ fontSize: 22, fontWeight: 800, color: 'var(--blue500)' }}>{sel.t} · {sel.r}</div>
        </div>
      </div>
      <div style={{ padding: '12px 20px 24px', borderTop: '1px solid var(--border)' }}>
        <SBtn full size="lg">저장하기</SBtn>
      </div>
    </Phone>
  );
};

/* 농구 — 포지션, 신장, 드라이브·슛 특기 */
const BasketLevelCert = ({ onNav }) => {
  const [h, setH] = React.useState(178);
  const [traits, setTraits] = React.useState(['드라이브']);
  return (
    <Phone>
      <AppBar title="농구 프로필" leading={<button className="tm-pressable tm-break-keep" onClick={() => onNav?.('settings')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>}/>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px 20px' }}>
        <Card pad={16} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>신장</div>
          <div className="tab-num" style={{ fontSize: 28, fontWeight: 800 }}>{h}cm</div>
          <input type="range" min="150" max="210" value={h} onChange={e => setH(+e.target.value)} style={{ width: '100%', accentColor: 'var(--orange500)', marginTop: 10 }}/>
        </Card>

        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>포지션</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 22 }}>
          {[{k:'PG',l:'가드'},{k:'SG',l:'슈팅가드'},{k:'SF',l:'포워드'},{k:'PF',l:'파워'},{k:'C',l:'센터'},{k:'ANY',l:'전포지션'}].map(p => (
            <button className="tm-pressable tm-break-keep" key={p.k} style={{
              padding: '14px 8px', borderRadius: 10,
              background: p.k === 'SF' ? 'var(--orange500)' : 'var(--grey100)',
              color: p.k === 'SF' ? 'var(--static-white)' : 'var(--grey700)',
              fontSize: 12, fontWeight: 700, textAlign: 'center',
            }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{p.k}</div>
              <div style={{ fontSize: 10, marginTop: 2, opacity: .8 }}>{p.l}</div>
            </button>
          ))}
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>특기 (최대 2개)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
          {['3점슛', '미드레인지', '드라이브', '포스트업', '리바운드', '스틸', '패스', '풀업점퍼'].map(t => {
            const on = traits.includes(t);
            return (
              <button className="tm-pressable tm-break-keep" key={t} onClick={() => setTraits(on ? traits.filter(x => x !== t) : traits.length < 2 ? [...traits, t] : traits)}
                style={{
                  padding: '8px 14px', borderRadius: 999,
                  background: on ? 'var(--blue50)' : 'var(--grey100)',
                  color: on ? 'var(--blue500)' : 'var(--grey700)',
                  border: `1px solid ${on ? 'var(--blue500)' : 'transparent'}`,
                  fontSize: 13, fontWeight: 600,
                }}>{t}</button>
            );
          })}
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>경기 경력</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['일반', '대학부', '실업 리그', '선수 출신'].map(c => <Chip key={c}>{c}</Chip>)}
        </div>
      </div>
      <div style={{ padding: '12px 20px 24px', borderTop: '1px solid var(--border)' }}>
        <SBtn full size="lg">저장하기</SBtn>
      </div>
    </Phone>
  );
};

/* ═══════════════════ 2. LESSON PASS (수강권) ═══════════════════ */

const LessonPass = ({ onNav }) => {
  const passes = [
    { id: 1, title: '박준수 코치 1:1 레슨', count: '10회', used: 7, remain: 3, expire: '2026.05.20', status: 'active', next: '5/25 (일) 10:00', img: IMG.coach1 },
    { id: 2, title: '성인 풋살 기초반',       count: '8회',  used: 3, remain: 5, expire: '2026.07.15', status: 'active', next: '5/7 (수) 20:00', img: IMG.coach3 },
    { id: 3, title: '주니어 축구 그룹레슨',    count: '12회', used: 12, remain: 0, expire: '2026.03.20', status: 'done', img: IMG.coach2 },
    { id: 4, title: '테니스 포핸드 집중반',    count: '5회',  used: 2, remain: 3, expire: '2026.04.28', status: 'expiring', next: '오늘 19:00', img: IMG.coach1 },
  ];
  return (
    <Phone>
      <AppBar title="수강권" leading={<button className="tm-pressable tm-break-keep" onClick={() => onNav?.('my')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>} trailing={[
        <button className="tm-pressable tm-break-keep" key="q" style={{padding:8}}><Icon name="menu" size={22} color="var(--grey800)"/></button>,
      ]}/>
      <div style={{ padding: '8px 20px 12px' }}>
        <Card pad={16}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>보유 수강권</div>
              <div className="tab-num" style={{ fontSize: 26, fontWeight: 800, marginTop: 2 }}>3<span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginLeft: 4 }}>장</span></div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>잔여 수업</div>
              <div className="tab-num" style={{ fontSize: 26, fontWeight: 800, marginTop: 2 }}>11<span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginLeft: 4 }}>회</span></div>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '4px 20px 12px' }}>
        {['전체', '사용중', '만료임박', '종료'].map((t, i) => (
          <button className="tm-pressable tm-break-keep" key={t} style={{
            padding: '8px 14px', borderRadius: 999,
            background: i === 0 ? 'var(--grey900)' : 'var(--grey100)',
            color: i === 0 ? 'var(--static-white)' : 'var(--grey700)',
            fontSize: 12, fontWeight: 700,
          }}>{t}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {passes.map(p => {
          const pct = (p.used / (p.used + p.remain)) * 100;
          return (
            <Card key={p.id} pad={0} style={{
              opacity: p.status === 'done' ? .55 : 1,
              borderColor: p.status === 'expiring' ? 'var(--red500)' : 'var(--border)',
            }}>
              <div style={{ padding: 16 }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 10, background: `var(--grey100) url(${p.img}) center/cover`, flexShrink: 0 }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                      {p.status === 'expiring' && <Badge tone="red" size="sm">D-5 만료</Badge>}
                      {p.status === 'done' && <Badge tone="grey" size="sm">종료</Badge>}
                      <Badge tone="grey" size="sm">{p.count}</Badge>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{p.title}</div>
                  </div>
                </div>

                <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'var(--grey100)', marginBottom: 8 }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${pct}%`, background: p.status === 'expiring' ? 'var(--red500)' : 'var(--blue500)', borderRadius: 3 }}/>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span className="tab-num" style={{ color: 'var(--text-strong)', fontWeight: 700 }}>
                    {p.used} / {p.used + p.remain}회 사용
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>만료 {p.expire}</span>
                </div>
              </div>

              {p.next && (
                <div style={{ padding: '10px 16px', background: 'var(--blue50)', borderTop: '1px solid var(--blue100)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="calendar" size={14} color="var(--blue500)"/>
                  <span style={{ fontSize: 12, color: 'var(--blue500)', fontWeight: 700 }}>다음 수업</span>
                  <span style={{ fontSize: 12, color: 'var(--text-strong)', fontWeight: 600 }}>{p.next}</span>
                  <div style={{ flex: 1 }}/>
                  <button className="tm-pressable tm-break-keep" style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue500)' }}>예약 변경</button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </Phone>
  );
};

/* 수강권 구매 (5회권/10회권/월간) */
const LessonPassBuy = ({ onNav, l = LESSONS[0] }) => {
  const [sel, setSel] = React.useState(1);
  const plans = [
    { id: 0, n: '1회권',  cnt: 1,  unit: 60000, bonus: 0,  tag: null },
    { id: 1, n: '5회권',  cnt: 5,  unit: 54000, bonus: 10, tag: '10% 할인' },
    { id: 2, n: '10회권', cnt: 10, unit: 48000, bonus: 20, tag: '베스트' },
    { id: 3, n: '월간 무제한', cnt: '무제한', unit: 280000, bonus: 0, tag: '신규' },
  ];
  return (
    <Phone>
      <AppBar title="수강권 구매" leading={<button className="tm-pressable tm-break-keep" onClick={() => onNav?.('lesson-detail')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>}/>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px 20px' }}>
        <Card pad={16} style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 10, background: `var(--grey100) url(${l.img}) center/cover` }}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{l.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{l.coach} · {l.venue}</div>
            </div>
          </div>
        </Card>

        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>수강권 선택</div>
        {plans.map(p => {
          const on = sel === p.id;
          const total = typeof p.cnt === 'number' ? p.cnt * p.unit : p.unit;
          return (
            <button className="tm-pressable tm-break-keep" key={p.id} onClick={() => setSel(p.id)} style={{
              width: '100%', padding: 16, marginBottom: 10, borderRadius: 14, textAlign: 'left',
              background: on ? 'var(--blue50)' : 'var(--bg)',
              border: `2px solid ${on ? 'var(--blue500)' : 'var(--border)'}`,
              position: 'relative',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: on ? 'var(--blue500)' : 'var(--text-strong)' }}>{p.n}</span>
                {p.tag && <Badge tone={p.tag === '베스트' ? 'orange' : 'blue'} size="sm">{p.tag}</Badge>}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span className="tab-num" style={{ fontSize: 20, fontWeight: 800 }}>{total.toLocaleString()}원</span>
                {typeof p.cnt === 'number' && p.cnt > 1 && (
                  <span className="tab-num" style={{ fontSize: 12, color: 'var(--text-muted)' }}>회당 {p.unit.toLocaleString()}원</span>
                )}
              </div>
              {p.bonus > 0 && (
                <div style={{ fontSize: 11, color: 'var(--green500)', fontWeight: 700, marginTop: 6 }}>기본가 대비 {p.bonus.toLocaleString()}% 절약</div>
              )}
            </button>
          );
        })}

        <div style={{ padding: 14, background: 'var(--grey50)', borderRadius: 12, marginTop: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            · 구매일로부터 3개월 내 사용<br/>
            · 미사용분은 90% 환불 (수수료 10%)<br/>
            · 1회 결제 시 티머니 페이백 2%
          </div>
        </div>
      </div>
      <div style={{ padding: '12px 20px 24px', borderTop: '1px solid var(--border)' }}>
        <SBtn full size="lg">결제하기</SBtn>
      </div>
    </Phone>
  );
};

/* ═══════════════════ 3. EQUIPMENT RENTAL (장비 대여) ═══════════════════ */

const EquipmentRental = ({ onNav }) => {
  const items = [
    { id: 1, title: '어덜트 풋살화 + 정강이 보호대 세트', size: '260~280', pricePerDay: 8000, img: IMG.gear3, venue: '강남역 A픽업지점', rating: 4.9, available: true },
    { id: 2, title: '성인 배드민턴 라켓 (2개 세트)', size: '4U 3U', pricePerDay: 6000, img: IMG.gear2, venue: '서초 클럽', rating: 4.7, available: true },
    { id: 3, title: '아이스하키 풀세트 (헬멧·패드·스틱)', size: 'L', pricePerDay: 35000, img: IMG.gear1, venue: '목동 아이스링크', rating: 4.8, available: false },
    { id: 4, title: '몰텐 농구공 + 펌프', size: 'GG7', pricePerDay: 3000, img: IMG.gear4, venue: '강남 농구장', rating: 4.6, available: true },
  ];
  return (
    <Phone>
      <AppBar title="장비 대여" leading={<button className="tm-pressable tm-break-keep" onClick={() => onNav?.('market')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>} trailing={[
        <button className="tm-pressable tm-break-keep" key="s" style={{padding:8}}><Icon name="search" size={22} color="var(--grey800)"/></button>,
      ]}/>

      <div style={{ padding: '0 20px 12px', display: 'flex', gap: 8, overflow: 'auto' }}>
        {['전체', '축구화', '라켓', '하키 풀세트', '공', '보호장비'].map(c => <Chip key={c}>{c}</Chip>)}
      </div>

      <div style={{ padding: '0 20px 12px' }}>
        <div style={{ padding: 14, background: 'var(--blue50)', borderRadius: 12, display: 'flex', gap: 10 }}>
          <Icon name="calendar" size={18} color="var(--blue500)"/>
          <div style={{ flex: 1, fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>
            <b style={{ color: 'var(--blue500)' }}>당일 픽업 · 반납</b>이 기본이에요. 분실 시 보증금에서 차감됩니다.
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '4px 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(it => (
          <Card key={it.id} pad={0} style={{ opacity: it.available ? 1 : .55 }}>
            <div style={{ display: 'flex', gap: 12, padding: 14 }}>
              <div style={{ width: 88, height: 88, borderRadius: 10, background: `var(--grey100) url(${it.img}) center/cover`, flexShrink: 0, position: 'relative' }}>
                {!it.available && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', borderRadius: 10, display: 'grid', placeItems: 'center', color: 'var(--static-white)', fontSize: 11, fontWeight: 700 }}>대여중</div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.4 }}>{it.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>사이즈 {it.size} · {it.venue}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>★ {it.rating}</span>
                  <span className="tab-num" style={{ fontSize: 14, fontWeight: 800 }}>{it.pricePerDay.toLocaleString()}원<span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>/일</span></span>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Phone>
  );
};

const RentalDetail = ({ onNav }) => {
  const [start, setStart] = React.useState('5/4');
  const [days, setDays] = React.useState(1);
  const [size, setSize] = React.useState('270');
  const total = 8000 * days + 3000;
  return (
    <Phone>
      <div style={{ position: 'relative', height: 300, background: `var(--grey100) url(${IMG.gear3}) center/cover` }}>
        <div style={{ position: 'absolute', top: 50, left: 8 }}>
          <button className="tm-pressable tm-break-keep" onClick={() => onNav?.('rental')} style={{ width: 40, height: 40, borderRadius: 20, background: 'rgba(0,0,0,.5)', color: 'var(--static-white)', display: 'grid', placeItems: 'center' }}>
            <Icon name="chevL" size={22}/>
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <Badge tone="blue" size="sm">대여 상품</Badge>
            <Badge tone="grey" size="sm">★ 4.9</Badge>
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.4 }}>어덜트 풋살화 + 정강이 보호대 세트</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 12 }}>
            <span className="tab-num" style={{ fontSize: 22, fontWeight: 800 }}>8,000원</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>/ 1일</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>보증금 3,000원 (반납시 전액 환급)</div>
        </div>

        <div style={{ padding: '0 20px 20px' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>사이즈 (mm)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {['250', '260', '265', '270', '275', '280', '285'].map(s => (
              <button className="tm-pressable tm-break-keep" key={s} onClick={() => setSize(s)} style={{
                minWidth: 52, height: 40, padding: '0 14px', borderRadius: 10,
                background: size === s ? 'var(--blue500)' : 'var(--bg)',
                border: `1px solid ${size === s ? 'var(--blue500)' : 'var(--border)'}`,
                color: size === s ? 'var(--static-white)' : 'var(--text-strong)',
                fontSize: 13, fontWeight: 700,
              }}>{s}</button>
            ))}
          </div>
        </div>

        <div style={{ padding: '0 20px 20px' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>대여 기간</div>
          <Card pad={16}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>시작일</div>
                <div className="tab-num" style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{start}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', color: 'var(--grey400)' }}>→</div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>반납일</div>
                <div className="tab-num" style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>5/{4 + days}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>기간</span>
              <div style={{ flex: 1 }}/>
              <button className="tm-pressable tm-break-keep" onClick={() => setDays(Math.max(1, days - 1))} style={{ width: 28, height: 28, borderRadius: 14, border: '1px solid var(--border)', fontSize: 16 }}>−</button>
              <span className="tab-num" style={{ fontSize: 15, fontWeight: 800, minWidth: 40, textAlign: 'center' }}>{days}일</span>
              <button className="tm-pressable tm-break-keep" onClick={() => setDays(days + 1)} style={{ width: 28, height: 28, borderRadius: 14, border: '1px solid var(--border)', fontSize: 16 }}>+</button>
            </div>
          </Card>
        </div>

        <div style={{ padding: '0 20px 20px' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>결제 내역</div>
          <Card pad={16}>
            {[['대여료', 8000 * days], ['보증금', 3000]].map(([k, v], i) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 1 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                <span className="tab-num" style={{ fontWeight: 600 }}>{v.toLocaleString()}원</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, marginTop: 6, borderTop: '2px solid var(--border)' }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>총 결제</span>
              <span className="tab-num" style={{ fontSize: 18, fontWeight: 800, color: 'var(--blue500)' }}>{total.toLocaleString()}원</span>
            </div>
          </Card>
        </div>
      </div>
      <div style={{ padding: '12px 20px 24px', borderTop: '1px solid var(--border)' }}>
        <SBtn full size="lg">예약하기</SBtn>
      </div>
    </Phone>
  );
};

/* ═══════════════════ 4. VENUE BOOKING CALENDAR ═══════════════════ */

const VenueBooking = ({ onNav }) => {
  const [day, setDay] = React.useState(5);
  const [slots, setSlots] = React.useState(['14:00']);
  const hours = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
  const availability = { '09:00': true, '10:00': true, '11:00': false, '12:00': true, '13:00': true, '14:00': true, '15:00': false, '16:00': true, '17:00': true, '18:00': false, '19:00': false, '20:00': true, '21:00': true, '08:00': true };
  const days = [];
  for (let i = 0; i < 14; i++) days.push(3 + i);

  const toggle = (h) => {
    if (slots.includes(h)) setSlots(slots.filter(s => s !== h));
    else setSlots([...slots, h].sort());
  };

  return (
    <Phone>
      <AppBar title="시설 예약" leading={<button className="tm-pressable tm-break-keep" onClick={() => onNav?.('venue-detail')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>}/>
      <div style={{ padding: '8px 20px 4px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>상암 월드컵 보조구장</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>축구장 · 시간당 180,000원</div>
      </div>

      <div style={{ padding: '12px 20px', overflow: 'auto', display: 'flex', gap: 6 }}>
        {days.map(d => (
          <button className="tm-pressable tm-break-keep" key={d} onClick={() => setDay(d)} style={{
            minWidth: 50, padding: '10px 8px', borderRadius: 10, textAlign: 'center',
            background: d === day ? 'var(--blue500)' : 'var(--grey50)',
            color: d === day ? 'var(--static-white)' : 'var(--text-strong)',
            border: d === day ? 'none' : '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 10, opacity: .8, fontWeight: 700 }}>{['월','화','수','목','금','토','일'][(d + 4) % 7]}</div>
            <div className="tab-num" style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{d}</div>
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '4px 20px 20px' }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>시간 선택 (중복 가능)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {hours.map(h => {
            const avail = availability[h] !== false;
            const on = slots.includes(h);
            return (
              <button className="tm-pressable tm-break-keep" key={h} disabled={!avail} onClick={() => toggle(h)} style={{
                height: 44, borderRadius: 10,
                background: on ? 'var(--blue500)' : avail ? 'var(--bg)' : 'var(--grey100)',
                border: `1px solid ${on ? 'var(--blue500)' : 'var(--border)'}`,
                color: on ? 'var(--static-white)' : avail ? 'var(--text-strong)' : 'var(--grey400)',
                fontSize: 13, fontWeight: 700,
                textDecoration: avail ? 'none' : 'line-through',
              }}>{h}</button>
            );
          })}
        </div>

        <div style={{ padding: 14, background: 'var(--grey50)', borderRadius: 12, marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>선택 시간</span>
            <span className="tab-num" style={{ fontSize: 13, fontWeight: 700 }}>{slots.length}시간</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>예상 금액</span>
            <span className="tab-num" style={{ fontSize: 15, fontWeight: 800 }}>{(180000 * slots.length).toLocaleString()}원</span>
          </div>
        </div>
      </div>
      <div style={{ padding: '12px 20px 24px', borderTop: '1px solid var(--border)' }}>
        <SBtn full size="lg" disabled={slots.length === 0}>예약하기</SBtn>
      </div>
    </Phone>
  );
};

/* ═══════════════════ 5. TEAM BOOKING / JOIN REQUEST ═══════════════════ */

const TeamJoinRequest = ({ onNav }) => {
  const [msg, setMsg] = React.useState('');
  return (
    <Phone>
      <AppBar title="팀 가입 신청" leading={<button className="tm-pressable tm-break-keep" onClick={() => onNav?.('team-profile')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>}/>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px 20px' }}>
        <Card pad={16} style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--blue500)', color: 'var(--static-white)', fontSize: 22, fontWeight: 800, display: 'grid', placeItems: 'center' }}>FC</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>FC 발빠른놈들</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>축구 · 24명 · B급</div>
            </div>
          </div>
        </Card>

        <Card pad={16} style={{ marginBottom: 18, background: 'var(--orange50)', borderColor: 'var(--orange500)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--orange500)', marginBottom: 6 }}>가입 조건</div>
          <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.7 }}>
            · 구력 3년 이상<br/>
            · 선출 불가 (공정성)<br/>
            · 주 1회 이상 정기 참여
          </div>
        </Card>

        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>내 프로필</div>
        <Card pad={14} style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
            <span style={{ color: 'var(--text-muted)' }}>레벨</span>
            <span><GradeBadge grade="B"/></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
            <span style={{ color: 'var(--text-muted)' }}>구력</span>
            <span style={{ fontWeight: 700 }}>5년</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: 'var(--text-muted)' }}>포지션</span>
            <span style={{ fontWeight: 700 }}>MF</span>
          </div>
        </Card>

        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>자기소개 (선택)</div>
        <textarea value={msg} onChange={e => setMsg(e.target.value)} placeholder="주장님께 간단히 소개해주세요"
          style={{ width: '100%', minHeight: 120, padding: 14, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--grey50)', fontSize: 14, resize: 'none' }}/>
      </div>
      <div style={{ padding: '12px 20px 24px', borderTop: '1px solid var(--border)' }}>
        <SBtn full size="lg">신청하기</SBtn>
      </div>
    </Phone>
  );
};

/* 팀 교환경기 예약 */
const TeamMatchBook = ({ onNav }) => (
  <Phone>
    <AppBar title="교환 매치 예약" leading={<button className="tm-pressable tm-break-keep" onClick={() => onNav?.('tm-detail')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px 20px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', padding: '20px 0' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: 'var(--blue500)', color: 'var(--static-white)', fontSize: 22, fontWeight: 800, display: 'grid', placeItems: 'center', margin: '0 auto 8px' }}>FC</div>
          <div style={{ fontSize: 12, fontWeight: 700 }}>발빠른놈들</div>
          <GradeBadge grade="B"/>
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-muted)', padding: '0 12px' }}>VS</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: 'var(--red500)', color: 'var(--static-white)', fontSize: 22, fontWeight: 800, display: 'grid', placeItems: 'center', margin: '0 auto 8px' }}>DY</div>
          <div style={{ fontSize: 12, fontWeight: 700 }}>다이나믹 FS</div>
          <GradeBadge grade="B"/>
        </div>
      </div>

      <Card pad={16} style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>합의 사항</div>
        {[
          ['일시', '5/11 (일) 09:00'],
          ['장소', '상암 월드컵 A구장'],
          ['포맷', '11:11 · 전후반 40분'],
          ['유니폼', '발빠른놈들 빨강 / 다이나믹 파랑'],
          ['선출 허용', '각 팀 2명'],
          ['대관비', '280,000원 (반반부담)'],
          ['심판', '자체 심판'],
        ].map(([k, v], i, a) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < a.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
            <span style={{ color: 'var(--text-muted)' }}>{k}</span>
            <span style={{ fontWeight: 600, textAlign: 'right' }}>{v}</span>
          </div>
        ))}
      </Card>

      <Card pad={16}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>내 팀 부담금</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="tab-num" style={{ fontSize: 22, fontWeight: 800 }}>140,000원</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>1인당 ≈ 7,000원</span>
        </div>
      </Card>
    </div>
    <div style={{ padding: '12px 20px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
      <SBtn variant="neutral" size="lg" style={{ flex: 1 }}>거절</SBtn>
      <SBtn size="lg" style={{ flex: 2 }}>수락하고 결제</SBtn>
    </div>
  </Phone>
);

/* ═══════════════════ 6. HOME with full widgets + FAB ═══════════════════ */

const HomePlus = ({ onNav }) => {
  const today = [
    { time: '14:00', title: '주말 축구 한 판', venue: '상암 월드컵 보조구장', status: 'confirmed' },
    { time: '20:00', title: '성인 풋살 기초반', venue: '이태원 풋살파크', status: 'lesson' },
  ];
  return (
    <Phone>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80, background: 'var(--grey50)' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '52px 20px 12px', gap: 12 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--blue500)', letterSpacing: 0 }}>Teameet</div>
          <div style={{ flex: 1 }}/>
          <button className="tm-pressable tm-break-keep" style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--bg)', display: 'grid', placeItems: 'center', position: 'relative' }}>
            <Icon name="bell" size={20} color="var(--grey700)"/>
            <div style={{ position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: 4, background: 'var(--red500)' }}/>
          </button>
        </div>

        {/* Greeting */}
        <div style={{ padding: '4px 20px 16px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)', lineHeight: 1.3 }}>정민님,<br/>오늘 같이 뛸 사람 찾으셨나요?</div>
        </div>

        {/* Today widget — 큰 위젯 */}
        <div style={{ padding: '0 20px 14px' }}>
          <div style={{ padding: 16, borderRadius: 16, background: 'var(--static-white)', boxShadow: 'var(--sh-1)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--green500)' }}/>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-strong)' }}>오늘의 일정</span>
              <div style={{ flex: 1 }}/>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>2개</span>
            </div>
            {today.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <div className="tab-num" style={{ width: 52, fontSize: 15, fontWeight: 800, color: 'var(--blue500)' }}>{t.time}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{t.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t.venue}</div>
                </div>
                {t.status === 'confirmed' && <Badge tone="green" size="sm">확정</Badge>}
                {t.status === 'lesson' && <Badge tone="blue" size="sm">레슨</Badge>}
              </div>
            ))}
          </div>
        </div>

        {/* Quick action grid 4개 */}
        <div style={{ padding: '0 20px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
            {[
              { i: 'swords', l: '매치', c: 'var(--blue500)', bg: 'var(--blue50)' },
              { i: 'people', l: '팀매칭', c: 'var(--red500)', bg: 'var(--red50)' },
              { i: 'ticket', l: '레슨', c: 'var(--green500)', bg: 'var(--green50)' },
              { i: 'store',  l: '장터', c: 'var(--orange500)', bg: 'var(--orange50)' },
            ].map(x => (
              <button className="tm-pressable tm-break-keep" key={x.l} style={{ padding: '14px 8px', borderRadius: 14, background: 'var(--static-white)', border: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ width: 36, height: 36, borderRadius: 18, background: x.bg, color: x.c, display: 'grid', placeItems: 'center', margin: '0 auto 6px' }}>
                  <Icon name={x.i} size={18}/>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700 }}>{x.l}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 2x2 stat widgets */}
        <div style={{ padding: '0 20px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ padding: 14, borderRadius: 14, background: 'var(--static-white)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6 }}>내 매너 점수</div>
              <div className="tab-num" style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)' }}>4.8<span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 2, fontWeight: 500 }}>/5</span></div>
              <div style={{ fontSize: 11, color: 'var(--green500)', fontWeight: 700, marginTop: 4 }}>↑ 0.2</div>
            </div>
            <div style={{ padding: 14, borderRadius: 14, background: 'var(--static-white)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6 }}>이번달 매치</div>
              <div className="tab-num" style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)' }}>7<span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 2, fontWeight: 500 }}>회</span></div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, marginTop: 4 }}>목표 10회</div>
            </div>
            <div style={{ padding: 14, borderRadius: 14, background: 'var(--static-white)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6 }}>수강권 잔여</div>
              <div className="tab-num" style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)' }}>11<span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 2, fontWeight: 500 }}>회</span></div>
              <div style={{ fontSize: 11, color: 'var(--red500)', fontWeight: 700, marginTop: 4 }}>D-5 만료 1장</div>
            </div>
            <div style={{ padding: 14, borderRadius: 14, background: 'var(--static-white)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6 }}>대여중</div>
              <div className="tab-num" style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)' }}>1<span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 2, fontWeight: 500 }}>건</span></div>
              <div style={{ fontSize: 11, color: 'var(--orange500)', fontWeight: 700, marginTop: 4 }}>내일 반납</div>
            </div>
          </div>
        </div>

        {/* Weather + recommended */}
        <div style={{ padding: '0 20px 16px' }}>
          <div style={{ padding: 14, borderRadius: 14, background: 'linear-gradient(135deg, var(--blue500) 0%, #6ba4ff 100%)', color: 'var(--static-white)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 32 }}>☀️</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, opacity: .9 }}>오늘 서울</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>맑음 · 22°</div>
              </div>
              <div style={{ fontSize: 12, opacity: .9, textAlign: 'right' }}>
                <div style={{ fontWeight: 700 }}>풋살하기 좋은 날</div>
                <div style={{ fontSize: 10, marginTop: 2 }}>미세먼지 좋음</div>
              </div>
            </div>
          </div>
        </div>

        {/* Recommended section */}
        <div style={{ padding: '0 20px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>추천 매치</span>
            <div style={{ flex: 1 }}/>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>더보기 ›</span>
          </div>
          {MATCHES.slice(0, 2).map(m => (
            <div key={m.id} style={{ padding: 12, background: 'var(--static-white)', borderRadius: 12, marginBottom: 8, border: '1px solid var(--border)', display: 'flex', gap: 12 }}>
              <div style={{ width: 64, height: 64, borderRadius: 10, background: `var(--grey100) url(${m.img}) center/cover`, flexShrink: 0 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.date} {m.time} · {m.venue}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <GradeBadge grade={m.lvl}/>
                  <span className="tab-num" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.cur}/{m.max}명</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating FAB */}
      <button className="tm-pressable tm-break-keep" style={{
        position: 'absolute', bottom: 96, right: 20, width: 58, height: 58, borderRadius: 29,
        background: 'var(--blue500)', color: 'var(--static-white)', boxShadow: '0 8px 24px rgba(49,130,246,.4)',
        display: 'grid', placeItems: 'center',
      }}>
        <Icon name="plus" size={28} stroke={2.4}/>
      </button>

      <TabBar active="home"/>
    </Phone>
  );
};

Object.assign(window, {
  SoccerLevelCert, HockeyLevelCert, TennisLevelCert, BadmintonLevelCert, BasketLevelCert,
  LessonPass, LessonPassBuy, EquipmentRental, RentalDetail,
  VenueBooking, TeamJoinRequest, TeamMatchBook, HomePlus,
});
