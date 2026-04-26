/* Login, Payments, Reviews, Mercenary, Tournaments, Settings, Empty/Loading states */

const Login = ({ onNav }) => {
  const [nick, setNick] = React.useState('');
  return (
    <Phone>
      <div style={{ flex: 1, padding: '40px 24px 20px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: 'var(--blue500)', display: 'grid', placeItems: 'center', color: 'var(--static-white)', fontSize: 34, fontWeight: 900, marginBottom: 28, letterSpacing: 0 }}>T</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-strong)', lineHeight: 1.3, marginBottom: 10 }}>
            같이 뛸 사람을<br/>한 번에 찾아요
          </div>
          <div style={{ fontSize: 15, color: 'var(--text-muted)', marginBottom: 36 }}>
            Teameet에 오신 걸 환영합니다
          </div>

          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>닉네임</div>
          <input
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            placeholder="사용할 닉네임을 입력하세요"
            className="tm-input"
            style={{ minHeight: 52, borderColor: nick ? 'var(--blue500)' : 'var(--border)', background: 'var(--grey50)', marginBottom: 20 }}
          />
        </div>

        <div>
          <SBtn full size="lg" onClick={() => onNav?.('onboarding')} disabled={!nick}>시작하기</SBtn>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }}/>
            <span style={{ fontSize: 12, color: 'var(--text-caption)' }}>또는</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }}/>
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, opacity: .5 }}>
            {[{ b: '#FEE500', c: 'var(--static-black)', l: '카카오' }, { b: 'var(--green500)', c: 'var(--static-white)', l: '네이버' }, { b: 'var(--static-black)', c: 'var(--static-white)', l: 'Apple' }].map(o => (
              <button key={o.l} className="tm-btn tm-btn-md tm-pressable" style={{ flex: 1, minHeight: 52, background: o.b, color: o.c }}>{o.l}</button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-caption)', textAlign: 'center', lineHeight: 1.6 }}>
            계속하면 <span style={{ textDecoration: 'underline' }}>서비스 약관</span>과 <span style={{ textDecoration: 'underline' }}>개인정보 처리방침</span>에 동의하는 것으로 간주됩니다.
          </div>
        </div>
      </div>
    </Phone>
  );
};

const PaymentCheckout = ({ onNav, m = MATCHES[0] }) => {
  const [method, setMethod] = React.useState('card');
  return (
    <Phone>
      <AppBar title="결제" leading={<button className="tm-btn tm-btn-ghost tm-btn-icon" onClick={() => onNav?.('match')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>}/>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <AnnouncementBar icon="₩" text="참가 확정 후 채팅방과 내 활동에서 영수증과 참가 상태를 함께 확인할 수 있어요"/>

        <div style={{ padding: '0 20px 16px' }}>
          <SectionTitle title="주문 상품" sub="참가 비용과 일정이 이 단계에서 확정됩니다"/>
          <Card pad={16}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ width: 72, height: 72, borderRadius: 10, background: `var(--grey100) url(${m.img}) center/cover`, flexShrink: 0 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4 }}>{m.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.date} {m.time}</div>
                <div className="tab-num" style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-strong)', marginTop: 8 }}>{m.fee.toLocaleString()}원</div>
              </div>
            </div>
          </Card>
        </div>

        <div style={{ padding: '0 20px 16px' }}>
          <SectionTitle title="결제 수단" sub="실제 서비스에서는 카드와 간편결제 중 하나로 이어집니다"/>
          {[
            { id: 'card',  l: '신용/체크카드', s: '신한카드 **** 4821' },
            { id: 'toss',  l: '토스페이',     s: '간편하게 결제' },
            { id: 'trans', l: '계좌이체',     s: '수수료 없음' },
          ].map(p => (
            <button key={p.id} className="tm-card tm-pressable" onClick={() => setMethod(p.id)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: 16, marginBottom: 8,
              background: method === p.id ? 'var(--blue50)' : 'var(--bg)',
              border: `1px solid ${method === p.id ? 'var(--blue500)' : 'var(--border)'}`, textAlign: 'left',
            }}>
              <div style={{ width: 22, height: 22, borderRadius: 11, border: `2px solid ${method === p.id ? 'var(--blue500)' : 'var(--grey300)'}`, background: method === p.id ? 'var(--blue500)' : 'transparent', display: 'grid', placeItems: 'center' }}>
                {method === p.id && <div style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--static-white)' }}/>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{p.l}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{p.s}</div>
              </div>
            </button>
          ))}
        </div>

        <div style={{ padding: '0 20px 20px' }}>
          <SectionTitle title="결제 금액" sub="MoneyRow 문법으로 영수증과 동일하게 읽히도록 정리"/>
          <Card pad={18}>
            <MoneyRow label="상품 금액" amount={m.fee} />
            <MoneyRow label="서비스 수수료" amount="무료" unit="" />
            <div style={{ height: 1, background: 'var(--border)', margin: '2px 0 4px' }}/>
            <MoneyRow label="최종 결제" amount={m.fee} strong accent />
          </Card>
        </div>
      </div>
      <div style={{ padding: '12px 20px 24px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
        <SBtn full size="lg" onClick={() => onNav?.('pay-success')}>{m.fee.toLocaleString()}원 결제하기</SBtn>
      </div>
    </Phone>
  );
};

const PaymentSuccess = ({ onNav }) => (
  <Phone>
    <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 96, height: 96, borderRadius: 48, background: 'var(--green500)', display: 'grid', placeItems: 'center', marginBottom: 24, color: 'var(--static-white)' }}>
        <Icon name="check" size={52} stroke={3}/>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 8 }}>결제가 완료되었어요</div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 32 }}>
        매치 정보는 채팅방과<br/>마이페이지에서 확인할 수 있어요
      </div>
      <div style={{ marginBottom: 20 }}>
        <NumberDisplay value={8000} unit="원" size={34} sub="이번 결제는 즉시 확정되었어요" />
      </div>
      <div style={{ width: '100%', padding: 18, background: 'var(--grey50)', borderRadius: 14, marginBottom: 24 }}>
        <MoneyRow label="결제금액" amount={8000} />
        <MoneyRow label="결제수단" amount="신한카드 **** 4821" unit="" />
        <MoneyRow label="결제일시" amount="2026.04.23 14:28" unit="" />
      </div>
      <AnnouncementBar icon="✓" text="참가 내역과 영수증, 환불 규칙이 같은 결제 문법으로 이어집니다"/>
    </div>
    <div style={{ padding: '0 20px 32px', display: 'flex', gap: 10 }}>
      <SBtn variant="neutral" size="lg" style={{ flex: 1 }} onClick={() => onNav?.('home')}>홈으로</SBtn>
      <SBtn size="lg" style={{ flex: 1 }} onClick={() => onNav?.('my')}>매치 보기</SBtn>
    </div>
  </Phone>
);

const PaymentHistory = ({ onNav }) => {
  const items = [
    { id: 1, title: '주말 축구 한 판', date: '2026.04.23', amount: 12000, status: '결제완료', tone: 'green' },
    { id: 2, title: '수요일 저녁 풋살 매치', date: '2026.04.18', amount: 8000, status: '결제완료', tone: 'green' },
    { id: 3, title: '박준수 코치 1:1 레슨', date: '2026.04.15', amount: 60000, status: '결제완료', tone: 'green' },
    { id: 4, title: '3on3 하프코트 농구', date: '2026.04.10', amount: 5000, status: '환불', tone: 'grey' },
    { id: 5, title: '테니스 단식 상대', date: '2026.04.05', amount: 15000, status: '결제완료', tone: 'green' },
  ];
  return (
    <Phone>
      <AppBar title="결제 내역" leading={<button className="tm-btn tm-btn-ghost tm-btn-icon" onClick={() => onNav?.('my')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>}/>
      <div style={{ padding: '8px 20px 16px' }}>
        <Card pad={18}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>이번 달 결제</div>
          <div className="tab-num" style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-strong)', marginTop: 4 }}>100,000원</div>
          <div style={{ fontSize: 12, color: 'var(--green500)', fontWeight: 600, marginTop: 4 }}>↓ 지난달 대비 23% 감소</div>
        </Card>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <SectionTitle title="월별 결제 내역" sub="현재 variant는 compact list, refresh variant는 grouped receipt 중심으로 비교할 수 있어요"/>
        {items.map(it => (
          <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Badge tone={it.tone} size="sm">{it.status}</Badge>
                <span style={{ fontSize: 11, color: 'var(--text-caption)' }}>{it.date}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>{it.title}</div>
            </div>
            <div className="tab-num" style={{ fontSize: 15, fontWeight: 800, color: it.tone === 'grey' ? 'var(--text-muted)' : 'var(--text-strong)', textDecoration: it.tone === 'grey' ? 'line-through' : 'none' }}>
              {it.amount.toLocaleString()}원
            </div>
          </div>
        ))}
      </div>
    </Phone>
  );
};

const ReviewWrite = ({ onNav }) => {
  const [rating, setRating] = React.useState(0);
  const [tags, setTags] = React.useState([]);
  const tagList = ['시간 약속 잘 지켜요', '매너가 좋아요', '실력이 좋아요', '또 같이 뛰고 싶어요', '팀플레이 잘해요'];
  return (
    <Phone>
      <AppBar title="리뷰 작성" leading={<button className="tm-btn tm-btn-ghost tm-btn-icon" onClick={() => onNav?.('my')}><Icon name="close" size={24} color="var(--grey800)"/></button>}/>
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 20px' }}>
        <Card pad={16}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 12, background: `var(--grey100) url(${MATCHES[0].img}) center/cover` }}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{MATCHES[0].title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{MATCHES[0].date} {MATCHES[0].time}</div>
            </div>
          </div>
        </Card>

        <div style={{ textAlign: 'center', padding: '32px 0 24px' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 20 }}>경기는 어떠셨나요?</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} className="tm-pressable" onClick={() => setRating(n)}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill={n <= rating ? 'var(--orange500)' : 'var(--grey200)'}>
                  <path d="m12 2 3 7 7 .7-5.3 4.7 1.6 6.9L12 17.8 5.7 21.3l1.6-6.9L2 9.7 9 9z"/>
                </svg>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 12 }}>
            {['별점을 선택해주세요', '아쉬웠어요', '괜찮았어요', '좋았어요', '정말 좋았어요', '최고였어요!'][rating]}
          </div>
        </div>

        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>어떤 점이 좋았나요?</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {tagList.map(t => {
            const on = tags.includes(t);
            return (
              <Chip key={t} active={on} onClick={() => setTags(on ? tags.filter(x => x !== t) : [...tags, t])}>{t}</Chip>
            );
          })}
        </div>

        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>자세한 후기 (선택)</div>
        <textarea className="tm-input" placeholder="경기 후기를 남겨주시면 다른 분들에게 도움이 돼요" style={{
          minHeight: 120, padding: 14,
          background: 'var(--grey50)', resize: 'none',
        }}/>
      </div>
      <div style={{ padding: '12px 20px 24px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
        <SBtn full size="lg" disabled={rating === 0}>리뷰 등록하기</SBtn>
      </div>
    </Phone>
  );
};

const ReviewsReceived = ({ onNav }) => {
  const reviews = [
    { id: 1, author: '지훈', avatar: IMG.av2, rating: 5, tags: ['시간 약속 잘 지켜요', '매너 좋아요'], body: '첫 매치였는데 먼저 다가와주셔서 편하게 뛸 수 있었어요. 다음에 또 같이 해요!', date: '3일 전' },
    { id: 2, author: '수아', avatar: IMG.av3, rating: 5, tags: ['실력이 좋아요'], body: '크로스가 정말 정확했어요', date: '1주 전' },
    { id: 3, author: '소희', avatar: IMG.av4, rating: 4, tags: ['팀플레이 잘해요'], body: '수비적으로 든든했어요.', date: '2주 전' },
  ];
  return (
    <Phone>
      <AppBar title="받은 리뷰" leading={<button className="tm-btn tm-btn-ghost tm-btn-icon" onClick={() => onNav?.('my')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>}/>
      <div style={{ padding: '8px 20px 16px' }}>
        <Card pad={18}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>매너 점수</div>
              <div className="tab-num" style={{ fontSize: 30, fontWeight: 800, color: 'var(--text-strong)', marginTop: 2 }}>4.8</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>총 18개의 리뷰</div>
            </div>
            <div style={{ width: 80, height: 80, borderRadius: 40, border: '6px solid var(--blue500)', display: 'grid', placeItems: 'center' }}>
              <div className="tab-num" style={{ fontSize: 20, fontWeight: 800, color: 'var(--blue500)' }}>96%</div>
            </div>
          </div>
        </Card>
      </div>
      <AnnouncementBar icon="★" text="리뷰도 payment/history와 같은 grouped list grammar로 읽히도록 정리된 variant입니다"/>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {reviews.map(r => (
          <Card key={r.id} pad={16}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 18, background: `var(--grey100) url(${r.avatar}) center/cover` }}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{r.author}</div>
                <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
                  {[1,2,3,4,5].map(n => (
                    <svg key={n} width="12" height="12" viewBox="0 0 24 24" fill={n <= r.rating ? 'var(--orange500)' : 'var(--grey200)'}>
                      <path d="m12 2 3 7 7 .7-5.3 4.7 1.6 6.9L12 17.8 5.7 21.3l1.6-6.9L2 9.7 9 9z"/>
                    </svg>
                  ))}
                </div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-caption)' }}>{r.date}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {r.tags.map(t => <Badge key={t} tone="blue" size="sm">{t}</Badge>)}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{r.body}</div>
          </Card>
        ))}
      </div>
    </Phone>
  );
};

const Mercenary = ({ onNav }) => {
  const listings = [
    { id: 1, title: '이번주 토요일 축구 용병 1명', team: 'FC 발빠른놈들', venue: '상암 보조구장', date: '5/3 (토) 14:00', level: 'B', fee: 10000, pos: '미드필더' },
    { id: 2, title: '내일 저녁 풋살 용병 구해요', team: '다이나믹 FS', venue: '이태원 풋살파크', date: '4/24 (목) 20:00', level: 'C', fee: 8000, pos: '골키퍼', urgent: true },
    { id: 3, title: '일요일 3on3 농구 용병', team: '강남 바스켓', venue: '강남 농구장', date: '5/4 (일) 10:00', level: 'A', fee: 5000, pos: '포워드' },
    { id: 4, title: '주말 배드민턴 복식 상대 구함', team: '서초 셔틀콕', venue: '서초체육관', date: '5/5 (월) 19:00', level: 'B', fee: 6000, pos: '파트너' },
  ];
  return (
    <Phone>
      <AppBar title="용병 구인" leading={<button className="tm-btn tm-btn-ghost tm-btn-icon" onClick={() => onNav?.('home')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>} trailing={[
        <button key="s" className="tm-btn tm-btn-ghost tm-btn-icon"><Icon name="search" size={22} color="var(--grey800)"/></button>,
      ]}/>
      <div style={{ padding: '0 20px 12px', display: 'flex', gap: 8, overflow: 'auto' }}>
        {['전체', '축구', '풋살', '농구', '배드민턴', '오늘', '이번주'].map(c => <Chip key={c}>{c}</Chip>)}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {listings.map(l => (
          <Card key={l.id} pad={16}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
              <GradeBadge grade={l.level}/>
              <Badge tone="grey">{l.pos}</Badge>
              {l.urgent && <Badge tone="red">급구</Badge>}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 8 }}>{l.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{l.team} · {l.venue}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l.date}</span>
              <span className="tab-num" style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)' }}>{l.fee.toLocaleString()}원</span>
            </div>
          </Card>
        ))}
      </div>
      <button className="tm-btn tm-btn-primary tm-pressable" style={{ position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, boxShadow: 'var(--sh-3)', padding: 0 }}>
        <Icon name="plus" size={26} stroke={2.4}/>
      </button>
    </Phone>
  );
};

const Tournaments = ({ onNav }) => {
  const tours = [
    { id: 1, title: '서울 봄 컵 2026', sport: '축구', date: '5/17 (토) ~ 5/18 (일)', teams: 16, fee: 200000, img: IMG.soccer, status: '모집중' },
    { id: 2, title: '아마추어 풋살 챔피언십', sport: '풋살', date: '5/24 (토)', teams: 12, fee: 150000, img: IMG.futsal, status: '모집중' },
    { id: 3, title: '시민 3on3 농구 대회', sport: '농구', date: '6/1 (일)', teams: 24, fee: 60000, img: IMG.basket, status: '예정' },
  ];
  return (
    <Phone>
      <AppBar title="대회" leading={<button className="tm-btn tm-btn-ghost tm-btn-icon" onClick={() => onNav?.('home')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>}/>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {tours.map(t => (
          <div key={t.id} style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <div style={{ height: 140, background: `var(--grey100) url(${t.img}) center/cover`, position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,.7))' }}/>
              <div style={{ position: 'absolute', top: 12, left: 12 }}>
                <Badge tone={t.status === '모집중' ? 'blue' : 'grey'}>{t.status}</Badge>
              </div>
              <div style={{ position: 'absolute', bottom: 12, left: 14, right: 14, color: 'var(--static-white)' }}>
                <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>{t.title}</div>
                <div style={{ fontSize: 12, opacity: .9 }}>{t.sport} · {t.date}</div>
              </div>
            </div>
            <div style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}>
                <Icon name="trophy" size={16} color="var(--orange500)"/> {t.teams}팀 참가
              </div>
              <div className="tab-num" style={{ fontSize: 14, fontWeight: 800 }}>참가비 {t.fee.toLocaleString()}원</div>
            </div>
          </div>
        ))}
      </div>
    </Phone>
  );
};

const Settings = ({ onNav }) => (
  <Phone>
    <AppBar title="설정" leading={<button className="tm-btn tm-btn-ghost tm-btn-icon" onClick={() => onNav?.('my')}><Icon name="chevL" size={24} color="var(--grey800)"/></button>}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 0 20px' }}>
      {[
        { t: '계정', items: [{ l: '프로필 수정' }, { l: '연결된 계정' }, { l: '닉네임 변경' }] },
        { t: '알림', items: [
          { l: '푸시 알림', toggle: true, on: true },
          { l: '매치 리마인더', toggle: true, on: true },
          { l: '마케팅 알림', toggle: true, on: false },
        ]},
        { t: '화면', items: [
          { l: '다크 모드', toggle: true, on: false },
          { l: '화면 꾸미기', sub: 'A · B · C 스타일 변경' },
          { l: '글자 크기', sub: '보통' },
        ]},
        { t: '개인정보', items: [{ l: '개인정보 처리방침' }, { l: '위치 정보 동의' }, { l: '내 데이터 다운로드' }] },
        { t: '기타', items: [{ l: '서비스 약관' }, { l: '버전', sub: '1.24.0' }, { l: '로그아웃', danger: true }] },
      ].map(g => (
        <div key={g.t} style={{ padding: '0 20px 20px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 8, paddingLeft: 4 }}>{g.t}</div>
          <Card pad={0}>
            {g.items.map((it, i) => (
              <div key={it.l} style={{
                display: 'flex', alignItems: 'center', padding: '14px 16px',
                borderBottom: i < g.items.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: it.danger ? 'var(--red500)' : 'var(--text-strong)' }}>{it.l}</div>
                  {it.sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{it.sub}</div>}
                </div>
                {it.toggle ? (
                  <div style={{ width: 46, height: 26, borderRadius: 13, background: it.on ? 'var(--blue500)' : 'var(--grey300)', position: 'relative', transition: 'background .2s' }}>
                    <div style={{ position: 'absolute', top: 2, left: it.on ? 22 : 2, width: 22, height: 22, borderRadius: 11, background: 'var(--static-white)', boxShadow: 'var(--sh-1)', transition: 'left .2s' }}/>
                  </div>
                ) : (
                  <Icon name="chevR" size={18} color="var(--grey400)"/>
                )}
              </div>
            ))}
          </Card>
        </div>
      ))}
    </div>
  </Phone>
);

/* Empty + Loading + Error state bundle */
const StatesBundle = () => (
  <Phone>
    <AppBar title="상태 모음"/>
    <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px 20px' }}>
      {/* Empty */}
      <Card pad={24} style={{ marginBottom: 20 }}>
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ width: 56, height: 56, borderRadius: 28, background: 'var(--grey100)', display: 'grid', placeItems: 'center', margin: '0 auto 14px', color: 'var(--grey500)' }}>
            <Icon name="calendar" size={26}/>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>아직 참여한 매치가 없어요</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>첫 번째 매치에 참가하면<br/>여기에 내역이 쌓여요</div>
          <SBtn variant="weak">매치 둘러보기</SBtn>
        </div>
      </Card>

      {/* Skeleton */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 10, paddingLeft: 4 }}>로딩 (Skeleton)</div>
      <Card pad={16} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ width: 72, height: 72, borderRadius: 10, background: 'var(--grey100)' }} className="shimmer"/>
          <div style={{ flex: 1 }}>
            <div style={{ height: 14, width: '85%', background: 'var(--grey100)', borderRadius: 4, marginBottom: 8 }} className="shimmer"/>
            <div style={{ height: 12, width: '60%', background: 'var(--grey100)', borderRadius: 4, marginBottom: 16 }} className="shimmer"/>
            <div style={{ height: 6, width: '100%', background: 'var(--grey100)', borderRadius: 999 }} className="shimmer"/>
          </div>
        </div>
      </Card>

      {/* Error */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 10, paddingLeft: 4 }}>오류</div>
      <Card pad={20} style={{ marginBottom: 20, borderColor: 'var(--red500)' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 18, background: 'var(--red50)', display: 'grid', placeItems: 'center', color: 'var(--red500)', flexShrink: 0 }}>!</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4 }}>결제를 완료하지 못했어요</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>카드 정보를 다시 확인해주세요. 한도가 초과되었을 수 있어요.</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <SBtn variant="neutral" size="sm">취소</SBtn>
              <SBtn variant="primary" size="sm">다시 시도</SBtn>
            </div>
          </div>
        </div>
      </Card>

      {/* Success toast */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 10, paddingLeft: 4 }}>토스트</div>
      <div style={{ padding: '12px 16px', background: 'var(--grey900)', color: 'var(--static-white)', borderRadius: 12, fontSize: 13, fontWeight: 500 }}>
        송금이 완료되었어요
      </div>
    </div>
    <style>{`
      .shimmer { position: relative; overflow: hidden; }
      .shimmer::after {
        content: ''; position: absolute; inset: 0;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,.6), transparent);
        animation: shim 1.2s infinite;
      }
      @keyframes shim { to { transform: translateX(100%); } from { transform: translateX(-100%); } }
    `}</style>
  </Phone>
);

/* Venue detail */
const VenueDetail = ({ onNav, v = VENUES[0] }) => (
  <Phone>
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100 }}>
      <div style={{ position: 'relative', height: 260, background: `var(--grey100) url(${v.img}) center/cover` }}>
        <div style={{ position: 'absolute', top: 8, left: 8 }}>
          <button className="tm-btn tm-btn-icon tm-pressable" onClick={() => onNav?.('venues')} style={{ width: 40, minWidth: 40, height: 40, borderRadius: 20, background: 'rgba(0,0,0,.4)', color: 'var(--static-white)' }}>
            <Icon name="chevL" size={22}/>
          </button>
        </div>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <Badge tone="grey">{v.type}</Badge>
          <Badge tone="orange" size="sm">★ {v.rating}</Badge>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800 }}>{v.name}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{v.address}</div>
      </div>
      <div style={{ padding: '0 20px 20px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>시설</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {v.facilities.concat(['화장실', '매점', 'WiFi']).map(f => (
            <div key={f} style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--grey100)', fontSize: 13, fontWeight: 600, color: 'var(--grey700)' }}>{f}</div>
          ))}
        </div>
      </div>
      <div style={{ padding: '0 20px 20px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>예약 가능한 시간</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'].map((t, i) => (
            <button key={t} className="tm-btn tm-btn-sm tm-pressable" style={{
              height: 44,
              background: i === 3 ? 'var(--blue500)' : i === 2 ? 'var(--grey100)' : 'var(--bg)',
              border: i === 3 ? 'none' : '1px solid var(--border)',
              color: i === 3 ? 'var(--static-white)' : i === 2 ? 'var(--grey400)' : 'var(--text-strong)',
              textDecoration: i === 2 ? 'line-through' : 'none',
            }}>{t}</button>
          ))}
        </div>
      </div>
    </div>
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 20px 24px', background: 'var(--bg)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>1시간</div>
        <div className="tab-num" style={{ fontSize: 18, fontWeight: 800 }}>{v.price.toLocaleString()}원</div>
      </div>
      <SBtn size="lg" style={{ padding: '0 36px' }}>예약하기</SBtn>
    </div>
  </Phone>
);

/* Lesson detail */
const LessonDetail = ({ onNav, l = LESSONS[0] }) => (
  <Phone>
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100 }}>
      <div style={{ position: 'relative', height: 280, background: `var(--grey100) url(${l.img}) center/cover` }}>
        <div style={{ position: 'absolute', top: 8, left: 8 }}>
          <button className="tm-btn tm-btn-icon tm-pressable" onClick={() => onNav?.('lessons')} style={{ width: 40, minWidth: 40, height: 40, borderRadius: 20, background: 'rgba(0,0,0,.4)', color: 'var(--static-white)' }}>
            <Icon name="chevL" size={22}/>
          </button>
        </div>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {l.tags.map(t => <Badge key={t} tone="blue">{t}</Badge>)}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.3 }}>{l.title}</div>
      </div>
      <div style={{ padding: '0 20px 20px' }}>
        <Card pad={16}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 56, height: 56, borderRadius: 28, background: `var(--grey100) url(${l.avatar}) center/cover` }}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{l.coach}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>★ {l.rating} · 후기 {l.reviews}개</div>
            </div>
            <SBtn variant="neutral" size="sm">프로필</SBtn>
          </div>
        </Card>
      </div>
      <div style={{ padding: '0 20px 20px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>레슨 소개</div>
        <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }}>
          기본기부터 실전 기술까지 체계적으로 배울 수 있는 1:1 맞춤 레슨입니다. 수강생의 레벨과 목표에 따라 커리큘럼을 조정해드려요. 첫 만남부터 실력이 느는 게 보이실 거예요.
        </div>
      </div>
      <div style={{ padding: '0 20px 20px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>커리큘럼</div>
        {['기초 자세 · 스텝', '패스 · 드리블', '슈팅 · 마무리', '실전 1:1 대결'].map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: i < 3 ? '1px solid var(--border)' : 'none' }}>
            <div className="tab-num" style={{ width: 28, height: 28, borderRadius: 14, background: 'var(--blue50)', color: 'var(--blue500)', fontSize: 13, fontWeight: 800, display: 'grid', placeItems: 'center' }}>{i + 1}</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{s}</div>
          </div>
        ))}
      </div>
    </div>
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 20px 24px', background: 'var(--bg)', borderTop: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ flex: 1 }}>
        <div className="tab-num" style={{ fontSize: 18, fontWeight: 800 }}>{l.price.toLocaleString()}원<span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>/{l.unit}</span></div>
      </div>
      <SBtn size="lg" style={{ padding: '0 36px' }}>예약하기</SBtn>
    </div>
  </Phone>
);

Object.assign(window, { Login, PaymentCheckout, PaymentSuccess, PaymentHistory, ReviewWrite, ReviewsReceived, Mercenary, Tournaments, Settings, StatesBundle, VenueDetail, LessonDetail });
