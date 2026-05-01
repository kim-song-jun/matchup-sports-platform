/* Marketplace, Venues, Chat, Onboarding, My, Notifications, Profile */

const ListingCard = ({ l, onClick }) => (
  <div className="tm-pressable" onClick={onClick} style={{ cursor: 'pointer' }}>
    <div style={{ aspectRatio: '1/1', background: `var(--grey100) url(${l.img}) center/cover`, borderRadius: 14, marginBottom: 8 }}/>
    <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4,
      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{l.title}</div>
    <div className="tab-num" style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)', marginTop: 4 }}>
      {l.price.toLocaleString()}원
    </div>
    <div style={{ fontSize: 11, color: 'var(--text-caption)', marginTop: 2 }}>{l.venue} · {l.cond}</div>
  </div>
);

const Marketplace = ({ onNav }) => (
  <Phone>
    <AppBar title="장터" leading={<button className="tm-btn tm-btn-ghost tm-btn-icon" onClick={() => onNav?.('home')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>} trailing={[
      <button key="s" className="tm-btn tm-btn-ghost tm-btn-icon"><Icon name="search" size={22} color="var(--grey800)"/></button>,
    ]}/>
    <div style={{ padding: '0 20px 12px', display: 'flex', gap: 8, overflow: 'auto' }}>
      {['전체', '축구화', '풋살화', '라켓', '농구공', '유니폼'].map(c => <Chip key={c}>{c}</Chip>)}
    </div>
    <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px 20px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {LISTINGS.map(l => <ListingCard key={l.id} l={l}/>)}
      </div>
    </div>
    <button className="tm-btn tm-btn-dark tm-pressable" style={{ position: 'absolute', bottom: 80, right: 20, width: 56, height: 56, borderRadius: 28, boxShadow: 'var(--sh-3)', padding: 0 }}>
      <Icon name="plus" size={26} stroke={2.4}/>
    </button>
    <TabBar/>
  </Phone>
);

const VenueCard = ({ v, onClick }) => (
  <div className="tm-card tm-card-interactive" onClick={onClick} style={{ overflow: 'hidden' }}>
    <div style={{ height: 140, background: `var(--grey100) url(${v.img}) center/cover` }}/>
    <div style={{ padding: 14 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <Badge tone="grey">{v.type}</Badge>
        <Badge tone="blue" size="sm">★ {v.rating}</Badge>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4 }}>{v.name}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{v.address}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {v.facilities.slice(0, 3).map(f => <span key={f} style={{ fontSize: 11, padding: '3px 7px', borderRadius: 6, background: 'var(--grey100)', color: 'var(--grey700)', fontWeight: 600 }}>{f}</span>)}
        </div>
        <span className="tab-num" style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-strong)' }}>
          {v.price.toLocaleString()}원<span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>/{v.unit}</span>
        </span>
      </div>
    </div>
  </div>
);

const Venues = ({ onNav }) => (
  <Phone>
    <AppBar title="시설" leading={<button className="tm-btn tm-btn-ghost tm-btn-icon" onClick={() => onNav?.('home')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>} trailing={[
      <button key="s" className="tm-btn tm-btn-ghost tm-btn-icon"><Icon name="search" size={22} color="var(--grey800)"/></button>,
    ]}/>
    <div style={{ padding: '0 20px 12px', display: 'flex', gap: 8, overflow: 'auto' }}>
      {['전체', '축구장', '풋살장', '농구장', '배드민턴장', '테니스장'].map(c => <Chip key={c}>{c}</Chip>)}
    </div>
    <div style={{ flex: 1, overflow: 'auto', padding: '4px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {VENUES.map(v => <VenueCard key={v.id} v={v}/>)}
    </div>
    <TabBar/>
  </Phone>
);

const Chat = ({ onNav }) => (
  <Phone>
    <AppBar title="채팅" trailing={[
      <button key="s" className="tm-btn tm-btn-ghost tm-btn-icon"><Icon name="search" size={22} color="var(--grey800)"/></button>,
    ]}/>
    <div style={{ flex: 1, overflow: 'auto' }}>
      {CHATS.map(c => (
        <button key={c.id} className="tm-list-row tm-pressable" onClick={() => onNav?.('chat-room', c)} style={{
          width: '100%', textAlign: 'left', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ position: 'relative' }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: `var(--grey100) url(${c.avatar}) center/cover` }}/>
            {c.group && (
              <div style={{ position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, background: 'var(--grey900)', color: 'var(--static-white)', fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center', border: '2px solid var(--bg)' }}>
                {c.members}
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{c.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-caption)' }}>{c.time}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>
              {c.last}
            </div>
          </div>
          {c.unread > 0 && (
            <div className="tab-num" style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10, background: 'var(--blue500)', color: 'var(--static-white)', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center' }}>
              {c.unread}
            </div>
          )}
        </button>
      ))}
    </div>
    <TabBar active="chat"/>
  </Phone>
);

const ChatRoom = ({ c = CHATS[0], onNav }) => {
  const msgs = [
    { id: 1, me: false, txt: '내일 몇 시에 모여요?', time: '오후 2:14', author: '지훈' },
    { id: 2, me: false, txt: '저는 1시 반쯤 도착할 예정입니다', time: '오후 2:14', author: '지훈' },
    { id: 3, me: true,  txt: '저도 그때쯤 갈게요. 정문에서 봐요', time: '오후 2:16' },
    { id: 4, me: false, txt: '네 좋아요!', time: '오후 2:17', author: '수아' },
    { id: 5, me: false, txt: '참고로 우리팀 유니폼 빨강이에요', time: '오후 2:18', author: '수아' },
    { id: 6, me: true,  txt: '확인했어요 👍', time: '오후 2:20' },
  ];
  return (
    <Phone>
      <AppBar
        leading={<button className="tm-btn tm-btn-ghost tm-btn-icon" onClick={() => onNav?.('chat')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>}
        title={c.name}
        trailing={[<button key="m" className="tm-btn tm-btn-ghost tm-btn-icon"><Icon name="menu" size={22} color="var(--grey800)"/></button>]}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px', background: 'var(--grey50)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {msgs.map(m => (
          <div key={m.id} style={{ display: 'flex', flexDirection: m.me ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8 }}>
            {!m.me && <div style={{ width: 32, height: 32, borderRadius: 16, background: `var(--grey100) url(${IMG.av2}) center/cover`, flexShrink: 0 }}/>}
            <div style={{ maxWidth: '70%' }}>
              {!m.me && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2, marginLeft: 4 }}>{m.author}</div>}
              <div style={{
                padding: '10px 14px', borderRadius: 16,
                background: m.me ? 'var(--blue500)' : 'var(--static-white)',
                color: m.me ? 'var(--static-white)' : 'var(--text-strong)',
                fontSize: 14, lineHeight: 1.4,
                border: m.me ? 'none' : '1px solid var(--border)',
              }}>{m.txt}</div>
              <div style={{ fontSize: 10, color: 'var(--text-caption)', marginTop: 2, textAlign: m.me ? 'right' : 'left', padding: '0 4px' }}>
                {m.time}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '10px 16px 20px', background: 'var(--bg)', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="tm-btn tm-btn-neutral tm-pressable" style={{ width: 40, minWidth: 40, height: 40, borderRadius: 20, padding: 0, color: 'var(--grey700)' }}>
          <Icon name="plus" size={22}/>
        </button>
        <input className="tm-input" placeholder="메시지 입력" style={{ flex: 1, minHeight: 40, borderRadius: 20, background: 'var(--grey100)', border: 'none' }}/>
        <button className="tm-btn tm-btn-primary tm-pressable" style={{ width: 40, minWidth: 40, height: 40, borderRadius: 20, padding: 0 }}>
          <Icon name="send" size={20}/>
        </button>
      </div>
    </Phone>
  );
};

const Onboarding = ({ onNav }) => {
  const [step, setStep] = React.useState(0);
  const [sports, setSports] = React.useState([]);
  const slides = [
    { t: '같이 뛸 사람을\n한 번에 찾아요', s: '매치 · 팀 · 레슨을 한 앱에서', img: IMG.soccer },
    { t: '관심 종목을\n알려주세요', form: true },
    { t: '내 레벨은?', form2: true },
  ];
  const cur = slides[step];
  return (
    <Phone bg="var(--static-white)">
      {step < 2 && (
        <div style={{ position: 'absolute', top: 56, right: 20, zIndex: 2 }}>
          <SBtn variant="ghost" size="sm" onClick={() => onNav?.('home')}>건너뛰기</SBtn>
        </div>
      )}

      {step === 0 && (
        <>
          <div style={{ flex: 1, background: `var(--grey100) url(${cur.img}) center/cover`, position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.04) 0%, rgba(0,0,0,.42) 100%)' }}/>
            <div style={{ position: 'absolute', bottom: 40, left: 24, right: 24, color: 'var(--static-white)' }}>
              <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.25, whiteSpace: 'pre-line' }}>{cur.t}</div>
              <div style={{ fontSize: 16, marginTop: 10, opacity: .85 }}>{cur.s}</div>
            </div>
          </div>
        </>
      )}
      {step === 1 && (
        <div style={{ flex: 1, padding: '40px 20px 20px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-strong)', lineHeight: 1.3, whiteSpace: 'pre-line', marginBottom: 8 }}>{cur.t}</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 32 }}>여러 개 선택할 수 있어요</div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {SPORTS.filter(s => s.id !== 'all').map(s => {
                const on = sports.includes(s.id);
                return (
                  <button key={s.id} className="tm-card tm-pressable" onClick={() => setSports(on ? sports.filter(x => x !== s.id) : [...sports, s.id])}
                    style={{
                      aspectRatio: '1/1', padding: 16, textAlign: 'left',
                      background: on ? 'var(--blue50)' : 'var(--bg)',
                      border: `2px solid ${on ? 'var(--blue500)' : 'var(--border)'}`,
                      position: 'relative', overflow: 'hidden',
                    }}>
                    <div style={{ position: 'absolute', inset: 0, background: `url(${s.img}) center/cover`, opacity: on ? .2 : .12 }}/>
                    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)' }}>{s.label}</div>
                    </div>
                    {on && <div style={{ position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: 11, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center' }}><Icon name="check" size={14} stroke={3}/></div>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {step === 2 && (
        <div style={{ flex: 1, padding: '40px 20px 20px' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 8 }}>내 레벨은?</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 28 }}>솔직하게 알려주세요</div>
          {[
            { l: 'S', t: '선수 출신', s: '전/현직 선수' },
            { l: 'A', t: '상급', s: '동호회 선수급' },
            { l: 'B', t: '중급', s: '주 2-3회 규칙적 참여' },
            { l: 'C', t: '초급', s: '취미로 시작한 정도' },
            { l: 'D', t: '입문', s: '처음 시작해요' },
          ].map(x => (
            <button key={x.l} className="tm-list-row tm-pressable" style={{
              width: '100%', marginBottom: 10, borderRadius: 12,
              border: '1px solid var(--border)', textAlign: 'left',
            }}>
              <GradeBadge grade={x.l}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{x.t}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{x.s}</div>
              </div>
              <Icon name="chevR" size={20} color="var(--grey400)"/>
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: '12px 20px 32px', background: 'var(--bg)' }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 16 }}>
          {slides.map((_, i) => (
            <div key={i} style={{ width: i === step ? 24 : 6, height: 6, borderRadius: 3, background: i === step ? 'var(--blue500)' : 'var(--grey200)', transition: 'width .2s' }}/>
          ))}
        </div>
        <SBtn full size="lg" onClick={() => step < 2 ? setStep(step + 1) : onNav?.('home')}>
          {step < 2 ? '다음' : '시작하기'}
        </SBtn>
      </div>
    </Phone>
  );
};

const MyPage = ({ onNav }) => (
  <Phone>
    <AppBar title="마이" trailing={[
      <button key="m" className="tm-btn tm-btn-ghost tm-btn-icon" onClick={() => onNav?.('settings')}><Icon name="menu" size={22} color="var(--grey800)"/></button>,
    ]}/>
    <div style={{ flex: 1, overflow: 'auto' }}>
      {/* profile summary */}
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 68, height: 68, borderRadius: 34, background: `var(--grey100) url(${IMG.av1}) center/cover` }}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-strong)' }}>정민</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
              <GradeBadge grade="B"/>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>매너 ★ 4.8 · 매치 23회</span>
            </div>
          </div>
          <SBtn variant="neutral" size="sm">편집</SBtn>
        </div>
      </div>

      {/* stats row */}
      <div style={{ padding: '0 20px 20px' }}>
        <div style={{ display: 'flex', gap: 8, padding: 8, background: 'var(--grey50)', borderRadius: 14 }}>
          {[['매치', 23], ['팀', 2], ['리뷰', 18]].map(([k, v], i) => (
            <div key={k} style={{ flex: 1, textAlign: 'center', padding: '10px 0', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div className="tab-num" style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-strong)' }}>{v}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{k}</div>
            </div>
          ))}
        </div>
      </div>

      {/* menu groups */}
      {[
        { t: '내 활동', items: [
          { i: 'calendar', l: '내 매치', n: 4 },
          { i: 'swords',   l: '팀 매칭 신청', n: 2 },
          { i: 'people',   l: '내 팀' },
          { i: 'ticket',   l: '레슨 이용권', n: 1 },
          { i: 'store',    l: '내 거래' },
        ]},
        { t: '지갑', items: [
          { i: 'money',   l: '결제 내역' },
          { i: 'shield',  l: '환불 / 분쟁' },
        ]},
        { t: '설정', items: [
          { i: 'bell',    l: '알림 설정' },
          { i: 'shield',  l: '개인정보' },
          { i: 'menu',    l: '약관 및 정책' },
        ]},
      ].map(g => (
        <div key={g.t} style={{ padding: '0 20px 20px' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8, paddingLeft: 4 }}>{g.t}</div>
          <Card pad={0}>
            {g.items.map((it, i) => (
              <button key={it.l} className="tm-list-row tm-pressable" style={{
                width: '100%', borderBottom: i < g.items.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--grey100)', display: 'grid', placeItems: 'center', color: 'var(--grey700)'}}>
                  <Icon name={it.i} size={18}/>
                </div>
                <span style={{ flex: 1, textAlign: 'left', fontSize: 14, color: 'var(--text-strong)', fontWeight: 500 }}>{it.l}</span>
                {it.n !== undefined && <Badge tone="blue" size="sm">{it.n}</Badge>}
                <Icon name="chevR" size={18} color="var(--grey400)"/>
              </button>
            ))}
          </Card>
        </div>
      ))}
    </div>
    <TabBar active="my"/>
  </Phone>
);

const Notifications = ({ onNav }) => (
  <Phone>
    <AppBar title="알림" leading={<button className="tm-btn tm-btn-ghost tm-btn-icon" onClick={() => onNav?.('home')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>}/>
    <div style={{ flex: 1, overflow: 'auto' }}>
      {NOTIFS.map(n => {
        const toneMap = { match: 'blue', team: 'orange', pay: 'green', chat: 'grey', review: 'grey' };
        return (
          <div key={n.id} style={{ display: 'flex', gap: 12, padding: '16px 20px', background: n.unread ? 'var(--blue50)' : 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center' }}>
              <Icon name={n.type === 'match' ? 'swords' : n.type === 'team' ? 'people' : n.type === 'pay' ? 'money' : n.type === 'chat' ? 'chat' : 'star'} size={18} color="var(--grey700)"/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{n.title}</span>
                <span style={{ fontSize: 11, color: 'var(--text-caption)' }}>{n.time}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>{n.body}</div>
            </div>
            {n.unread && <div style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--blue500)', marginTop: 6, flexShrink: 0 }}/>}
          </div>
        );
      })}
    </div>
  </Phone>
);

const MyActivity = ({ onNav }) => {
  const [tab, setTab] = React.useState('upcoming');
  return (
    <Phone>
      <AppBar title="내 매치" leading={<button className="tm-btn tm-btn-ghost tm-btn-icon" onClick={() => onNav?.('my')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>}/>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {[{id:'upcoming',l:'다가오는'},{id:'past',l:'지난'},{id:'cancel',l:'취소'}].map(t => (
          <button key={t.id} className="tm-pressable" onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '14px 0',
            fontSize: 14, fontWeight: tab === t.id ? 700 : 500,
            color: tab === t.id ? 'var(--text-strong)' : 'var(--text-muted)',
            borderBottom: tab === t.id ? '2px solid var(--grey900)' : '2px solid transparent',
          }}>{t.l}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {MATCHES.slice(0, 3).map(m => (
          <div key={m.id} style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 14, padding: 14 }}>
              <div style={{ width: 88, height: 88, borderRadius: 12, background: `var(--grey100) url(${m.img}) center/cover`, flexShrink: 0 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Badge tone="blue" size="sm">{m.date} {m.time}</Badge>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginTop: 8, lineHeight: 1.4,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {m.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{m.venue}</div>
              </div>
            </div>
            <div style={{ display: 'flex', borderTop: '1px solid var(--border)' }}>
              <button className="tm-btn tm-btn-ghost tm-btn-sm" style={{ flex: 1, borderRight: '1px solid var(--border)', color: 'var(--text-muted)' }}>취소</button>
              <button className="tm-btn tm-btn-ghost tm-btn-sm" style={{ flex: 1, color: 'var(--blue500)' }}>상세보기</button>
            </div>
          </div>
        ))}
      </div>
    </Phone>
  );
};

Object.assign(window, { Marketplace, Venues, Chat, ChatRoom, Onboarding, MyPage, Notifications, MyActivity, ListingCard, VenueCard });
