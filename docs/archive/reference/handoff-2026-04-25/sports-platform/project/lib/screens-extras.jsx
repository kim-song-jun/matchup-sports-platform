/* Teameet — Remaining missing pages: team sub-pages, payments, chat flows,
   tournament detail, badges, feed, venue edit, lesson edit */

/* ── /teams/[id]/members ── */
const TeamMembers = () => {
  const members = [
    { n: '김정민', r: '주장', pos: 'MF', age: 32, manner: 4.9, att: 96, ex: true, img: IMG.av1 },
    { n: '박지훈', r: '부주장', pos: 'DF', age: 28, manner: 4.8, att: 92, img: IMG.av2 },
    { n: '이수현', r: '팀원', pos: 'FW', age: 25, manner: 4.7, att: 88, img: IMG.av3 },
    { n: '정소연', r: '팀원', pos: 'GK', age: 30, manner: 4.9, att: 100, img: IMG.av4 },
    { n: '최현우', r: '팀원', pos: 'MF', age: 27, manner: 4.6, att: 74, img: IMG.av5 },
    { n: '강태오', r: '팀원', pos: 'DF', age: 35, manner: 4.8, att: 82, img: IMG.av6 },
  ];
  return (
    <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <StatusBar/><TopNav title="팀원 24명"/>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '16px 20px', background: 'var(--grey50)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {['전체 24', '주장 1', '부주장 2', '선출 3'].map((t, i) => (
              <div key={t} style={{ height: 32, padding: '0 12px', borderRadius: 999, background: i === 0 ? 'var(--grey900)' : 'var(--grey100)', color: i === 0 ? 'var(--static-white)' : 'var(--text)', fontSize: 12, fontWeight: 600, display: 'grid', placeItems: 'center' }}>{t}</div>
            ))}
          </div>
        </div>
        <div>
          {members.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--grey100)' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: `url(${m.img}) center/cover`, flexShrink: 0 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{m.n}</span>
                  {m.r !== '팀원' && <span style={{ fontSize: 10, padding: '2px 6px', background: m.r === '주장' ? 'var(--blue50)' : 'var(--grey100)', color: m.r === '주장' ? 'var(--blue500)' : 'var(--text)', borderRadius: 4, fontWeight: 700 }}>{m.r}</span>}
                  {m.ex && <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--orange50)', color: 'var(--orange500)', borderRadius: 4, fontWeight: 700 }}>선출</span>}
                </div>
                <div className="tab-num" style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontWeight: 400 }}>{m.pos} · {m.age}세 · 매너 {m.manner}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="tab-num" style={{ fontSize: 13, fontWeight: 700, color: m.att >= 90 ? 'var(--green500)' : m.att >= 80 ? 'var(--text-strong)' : 'var(--orange500)' }}>{m.att}%</div>
                <div style={{ fontSize: 10, color: 'var(--text-caption)', fontWeight: 400, marginTop: 2 }}>출석률</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ── /teams/[id]/matches ── */
const TeamMatchHistory = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/><TopNav title="팀 매치 기록"/>
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '16px 20px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12 }}>
        {[['18', '경기'], ['12', '승'], ['2', '무'], ['4', '패'], ['75%', '승률']].map(([v, l]) => (
          <div key={l} style={{ flex: 1, textAlign: 'center' }}>
            <div className="tab-num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)' }}>{v}</div>
            <div style={{ fontSize: 10, color: 'var(--text-caption)', fontWeight: 400, marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: 16 }}>
        {[
          { d: '4/20 (일)', opp: 'FC 번개', res: 'W', score: '3:1', venue: '상암 A구장' },
          { d: '4/13 (일)', opp: '다이나믹 FS', res: 'D', score: '2:2', venue: '잠실 풋살' },
          { d: '4/06 (일)', opp: '퇴근후축구', res: 'W', score: '4:2', venue: '반포 B구장' },
          { d: '3/30 (일)', opp: '수요풋살', res: 'L', score: '1:3', venue: '신도림 풋살' },
          { d: '3/23 (일)', opp: 'FC 불꽃', res: 'W', score: '5:0', venue: '상암 A구장' },
        ].map((m, i) => {
          const c = m.res === 'W' ? 'var(--blue500)' : m.res === 'L' ? 'var(--red500)' : 'var(--text-muted)';
          return (
            <div key={i} style={{ background: 'var(--bg)', borderRadius: 12, padding: '14px 16px', marginBottom: 8, border: '1px solid var(--grey100)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: c + '1a', color: c, display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 800 }}>{m.res}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>vs {m.opp}</div>
                <div className="tab-num" style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, marginTop: 2 }}>{m.d} · {m.venue}</div>
              </div>
              <div className="tab-num" style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)' }}>{m.score}</div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

/* ── /payments/[id] ── */
const PaymentDetail = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/><TopNav title="결제 상세"/>
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px 100px' }}>
      <div style={{ background: 'var(--bg)', borderRadius: 14, padding: 20, border: '1px solid var(--grey100)' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>결제 금액</div>
        <div style={{ marginTop: 4 }}>
          <NumberDisplay value={12000} size={28} sub="2026-04-24 13:45 결제"/>
        </div>
        <div style={{ display: 'inline-block', marginTop: 10, fontSize: 12, padding: '4px 10px', background: 'var(--green50)', color: 'var(--green500)', borderRadius: 6, fontWeight: 700 }}>결제 완료</div>
      </div>

      <AnnouncementBar icon="ⓘ" text="테스트 결제 기준으로 주문 정보와 환불 규칙을 동일한 MoneyRow grammar로 정리한 상세 화면입니다"/>

      <div style={{ marginTop: 16, background: 'var(--bg)', borderRadius: 14, padding: '16px 0 8px', border: '1px solid var(--grey100)' }}>
        <SectionTitle title="주문 정보"/>
        <div style={{ padding: '0 20px 8px' }}>
          {[
            ['결제 수단', '토스페이'],
            ['결제 일시', '2026-04-24 13:45'],
            ['주문번호', 'TM-20260424-1834'],
            ['상품', '주말 축구 한 판, 같이 뛰어요'],
            ['경기 일시', '2026-05-03 14:00'],
            ['장소', '상암월드컵경기장 보조구장'],
          ].map(([k, v]) => (
            <div key={k} style={{ borderBottom: '1px solid var(--grey100)' }}>
              <MoneyRow label={k} amount={v} unit=""/>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, background: 'var(--bg)', borderRadius: 14, padding: '16px 0 8px', border: '1px solid var(--grey100)' }}>
        <SectionTitle title="환불 안내" sub="확정 전 반드시 환불 가능 시간과 수수료를 확인하세요"/>
        <div style={{ padding: '0 20px 8px' }}>
          <div style={{ borderBottom: '1px solid var(--grey100)' }}>
            <MoneyRow label="24시간 전까지" amount="100%" unit="" sub="전액 환불"/>
          </div>
          <div style={{ borderBottom: '1px solid var(--grey100)' }}>
            <MoneyRow label="24~6시간 전" amount="50%" unit="" sub="부분 환불"/>
          </div>
          <MoneyRow label="6시간 이내" amount="환불 불가" unit="" sub="경기 준비가 시작된 상태"/>
        </div>
      </div>

      <SBtn full size="md" variant="neutral" style={{ marginTop: 16 }}>영수증 보기</SBtn>
    </div>
    <div style={{ padding: '12px 20px 24px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
      <SBtn full size="lg" variant="danger">환불 요청</SBtn>
    </div>
  </div>
);

/* ── /payments/[id]/refund ── */
const PaymentRefund = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/><TopNav title="환불 요청"/>
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px 100px' }}>
      <AnnouncementBar icon="!" text="경기 시작 32시간 전입니다. 현재는 100% 환불 가능한 구간이에요."/>

      <SectionTitle title="환불 사유" sub="거래형 액션이라 선택 이유를 분리해 남깁니다"/>
      {['일정이 갑자기 변경되었어요', '매치 내용이 설명과 달라요', '다른 매치에 참가하기로 했어요', '기타'].map((r, i) => (
        <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px', background: 'var(--grey50)', borderRadius: 12, marginBottom: 8, cursor: 'pointer', border: i === 0 ? '1px solid var(--blue500)' : '1px solid transparent' }}>
          <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid ' + (i === 0 ? 'var(--blue500)' : 'var(--border-strong)'), display: 'grid', placeItems: 'center' }}>
            {i === 0 && <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--blue500)' }}/>}
          </div>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-strong)' }}>{r}</span>
        </label>
      ))}

      <div style={{ marginTop: 20 }}>
        <SectionTitle title="상세 사유" sub="운영 검토가 필요한 경우에만 참고됩니다"/>
        <textarea placeholder="자세한 사유를 남겨주시면 운영에 참고하겠습니다" style={{ width: '100%', height: 90, padding: 14, borderRadius: 12, border: '1px solid var(--border)', fontSize: 14, resize: 'none', fontFamily: 'inherit' }}/>
      </div>

      <div style={{ marginTop: 20, padding: '16px 16px 8px', borderRadius: 12, background: 'var(--grey50)' }}>
        <SectionTitle title="환불 요약"/>
        <div style={{ padding: '0 4px' }}>
          <div style={{ borderBottom: '1px solid var(--border)' }}>
            <MoneyRow label="결제 금액" amount={12000}/>
          </div>
          <div style={{ borderBottom: '1px solid var(--border)' }}>
            <MoneyRow label="환불 수수료" amount={0}/>
          </div>
          <MoneyRow label="환불 예정 금액" amount={12000} strong accent/>
        </div>
      </div>
    </div>
    <div style={{ padding: '12px 20px 24px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
      <SBtn full size="lg" variant="danger">환불 요청하기</SBtn>
    </div>
  </div>
);

/* ── /tournaments/[id] ── */
const TournamentDetail = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/><TopNav title="" transparent/>
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ height: 220, background: `linear-gradient(180deg, rgba(0,0,0,.06) 0%, rgba(0,0,0,.36) 100%), url(${IMG.soccer}) center/cover`, padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', color: 'var(--static-white)' }}>
        <div style={{ fontSize: 11, padding: '3px 8px', background: 'rgba(25,31,40,.55)', borderRadius: 4, fontWeight: 700, alignSelf: 'flex-start', marginBottom: 8 }}>5월 · 정기 리그</div>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 0, lineHeight: 1.3 }}>제 12회 Teameet<br/>아마추어 풋살 챔피언십</div>
      </div>
      <div style={{ background: 'var(--bg)', padding: 20, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[['참가팀', '16팀'], ['경기 수', '30경기'], ['상금', '200만원'], ['기간', '5/17~6/1']].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 400 }}>{l}</div>
              <div className="tab-num" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: 'var(--bg)', marginTop: 8, padding: '20px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 12 }}>대진표</div>
        {[
          ['FC 발빠른놈들', '6:2', '수요풋살', 'W'],
          ['다이나믹 FS', '3:3 (PK 5:4)', '퇴근후축구', 'W'],
          ['FC 번개', '1:2', 'FC 불꽃', 'L'],
        ].map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--grey100)' }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: r[3] === 'W' ? 700 : 500, color: 'var(--text-strong)' }}>{r[0]}</span>
            <span className="tab-num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', padding: '0 12px', minWidth: 110, textAlign: 'center' }}>{r[1]}</span>
            <span style={{ flex: 1, fontSize: 13, fontWeight: r[3] === 'L' ? 700 : 500, color: 'var(--text-strong)', textAlign: 'right' }}>{r[2]}</span>
          </div>
        ))}
      </div>

      <div style={{ padding: 20, background: 'var(--bg)', marginTop: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 12 }}>참가팀 순위</div>
        {[
          { r: 1, n: 'FC 발빠른놈들', w: 4, d: 0, l: 0 },
          { r: 2, n: '다이나믹 FS', w: 3, d: 1, l: 0 },
          { r: 3, n: 'FC 불꽃', w: 3, d: 0, l: 1 },
          { r: 4, n: '퇴근후축구', w: 2, d: 1, l: 1 },
        ].map(t => (
          <div key={t.r} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--grey100)' }}>
            <span className="tab-num" style={{ width: 28, fontSize: 13, fontWeight: 700, color: t.r <= 3 ? 'var(--blue500)' : 'var(--text-muted)' }}>{t.r}</span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>{t.n}</span>
            <span className="tab-num" style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{t.w}승 {t.d}무 {t.l}패</span>
          </div>
        ))}
      </div>

      <div style={{ height: 80 }}/>
    </div>
    <div style={{ padding: '12px 20px 24px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
      <SBtn full size="lg">우리 팀 참가 신청 (3만원)</SBtn>
    </div>
  </div>
);

/* ── /feed ── */
const Feed = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ padding: '14px 20px', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: 0 }}>피드</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--grey100)' }}/>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--grey100)' }}/>
      </div>
    </div>
    <div style={{ flex: 1, overflow: 'auto' }}>
      {[
        { u: '김정민', h: '주장 · FC 발빠른놈들', t: '오늘 상암에서 멋진 경기 같이 뛰어주신 분들 감사합니다! 다음 주도 기대되네요 💪', time: '2시간 전', likes: 23, comments: 5, img: IMG.soccer, av: IMG.av1 },
        { u: '이수현', h: '풋살 애호가', t: '이번 주 토요일 풋살 같이 하실 분 계신가요? 실력 무관 누구나 환영이에요.', time: '5시간 전', likes: 8, comments: 12, av: IMG.av3 },
        { u: '박지훈', h: '테니스 코치', t: '신규 회원 모집합니다. 1:1 레슨 50% 할인 이벤트 중!', time: '어제', likes: 45, comments: 8, img: IMG.tennis, av: IMG.av2 },
      ].map((p, i) => (
        <div key={i} style={{ background: 'var(--bg)', padding: 16, marginBottom: 8, borderBottom: '1px solid var(--grey100)' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: `url(${p.av}) center/cover` }}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{p.u}</div>
              <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 400 }}>{p.h} · {p.time}</div>
            </div>
            <div style={{ width: 24, height: 24, color: 'var(--text-muted)', display: 'grid', placeItems: 'center' }}>⋯</div>
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-strong)', lineHeight: 1.55, fontWeight: 400, marginBottom: p.img ? 12 : 0 }}>{p.t}</div>
          {p.img && <div style={{ height: 200, background: `url(${p.img}) center/cover`, borderRadius: 12, marginBottom: 12 }}/>}
          <div style={{ display: 'flex', gap: 18, fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
            <span className="tab-num">♡ {p.likes}</span>
            <span className="tab-num">💬 {p.comments}</span>
            <span>공유</span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

/* ── /badges ── */
const Badges = () => {
  const badges = [
    { n: '첫 매치', d: '첫 매치 참가 완료', e: true, c: 'var(--blue500)' },
    { n: '연속 10경기', d: '한 달 안에 10경기', e: true, c: 'var(--green500)' },
    { n: '매너왕', d: '매너 4.9 유지', e: true, c: 'var(--orange500)' },
    { n: '선출', d: '선수 출신 인증', e: false, c: 'var(--purple500)' },
    { n: '주장', d: '팀 주장 등록', e: true, c: 'var(--red500)' },
    { n: '개근상', d: '출석률 100%', e: false, c: 'var(--teal500)' },
    { n: '리그 우승', d: '대회 1위', e: false, c: 'var(--yellow500)' },
    { n: '베테랑', d: '50경기 달성', e: false, c: 'var(--grey500)' },
    { n: '장터 거래왕', d: '거래 10회', e: false, c: 'var(--blue500)' },
  ];
  return (
    <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <StatusBar/><TopNav title="뱃지"/>
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        <div style={{ padding: 20, background: 'var(--grey900)', color: 'var(--static-white)', borderRadius: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 13, opacity: .7, fontWeight: 500 }}>획득한 뱃지</div>
          <div className="tab-num" style={{ fontSize: 30, fontWeight: 700, marginTop: 4 }}>4<span style={{ fontSize: 15, opacity: .5, fontWeight: 400 }}> / {badges.length}</span></div>
          <div style={{ marginTop: 12, height: 6, background: 'rgba(255,255,255,.12)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${4 / badges.length * 100}%`, height: '100%', background: 'var(--static-white)' }}/>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {badges.map(b => (
            <div key={b.n} style={{ textAlign: 'center', padding: 14, borderRadius: 14, background: b.e ? 'var(--bg)' : 'var(--grey50)', border: '1px solid ' + (b.e ? 'var(--grey100)' : 'var(--border)'), opacity: b.e ? 1 : .45 }}>
              <div style={{ width: 56, height: 56, margin: '0 auto 8px', borderRadius: '50%', background: b.e ? b.c + '15' : 'var(--grey200)', display: 'grid', placeItems: 'center' }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: b.e ? b.c : 'var(--grey400)' }}/>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-strong)' }}>{b.n}</div>
              <div style={{ fontSize: 10, color: 'var(--text-caption)', fontWeight: 400, marginTop: 2, lineHeight: 1.3 }}>{b.d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ── /chat/[id]/embed (in-match chat tab) ── */
const ChatEmbed = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <TopNav title="주말 축구 한 판"/>
    <div style={{ display: 'flex', background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
      {['상세', '참가자 18', '채팅', '출석'].map((t, i) => (
        <button className="tm-pressable tm-break-keep" key={t} style={{ padding: '12px 0', marginRight: 20, borderBottom: i === 2 ? '2px solid var(--text-strong)' : '2px solid transparent', fontSize: 13, fontWeight: i === 2 ? 700 : 500, color: i === 2 ? 'var(--text-strong)' : 'var(--text-muted)' }}>{t}</button>
      ))}
    </div>
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 16px' }}>
      <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-caption)', fontWeight: 400, marginBottom: 16 }}>2026년 4월 25일</div>
      {[
        { s: 0, n: '정민 (호스트)', t: '안녕하세요 여러분! 이번 주 토요일 경기 확정입니다. 편하게 오세요 🙌', time: '10:24' },
        { s: 0, n: '수현', t: '혹시 조끼 있나요?', time: '10:30' },
        { s: 1, t: '조끼는 이쪽에서 준비합니다! 편하게 오세요', time: '10:31' },
        { s: 0, n: '지훈', t: '저 30분 정도 늦을 수도 있어요', time: '10:45' },
        { s: 1, t: '네 괜찮습니다. 도착하시면 알려주세요', time: '10:46' },
      ].map((m, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: m.s === 1 ? 'row-reverse' : 'row', gap: 8, marginBottom: 12 }}>
          {m.s === 0 && <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--grey200)', flexShrink: 0 }}/>}
          <div style={{ maxWidth: 240 }}>
            {m.s === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4 }}>{m.n}</div>}
            <div style={{ background: m.s === 1 ? 'var(--blue500)' : 'var(--bg)', color: m.s === 1 ? 'var(--static-white)' : 'var(--text-strong)', padding: '10px 14px', borderRadius: 14, fontSize: 14, fontWeight: 400, lineHeight: 1.4, boxShadow: m.s === 1 ? 'none' : '0 1px 2px rgba(0,0,0,.04)' }}>{m.t}</div>
            <div className="tab-num" style={{ fontSize: 10, color: 'var(--text-caption)', fontWeight: 400, marginTop: 4, textAlign: m.s === 1 ? 'right' : 'left' }}>{m.time}</div>
          </div>
        </div>
      ))}
    </div>
    <div style={{ padding: 12, background: 'var(--bg)', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--grey100)', display: 'grid', placeItems: 'center', fontSize: 16, color: 'var(--text-muted)' }}>+</div>
      <input placeholder="메시지" style={{ flex: 1, height: 40, padding: '0 14px', borderRadius: 20, background: 'var(--grey100)', border: 'none', fontSize: 14 }}/>
    </div>
  </div>
);

/* ── /teams/[id]/mercenary ── */
const TeamMercenary = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/><TopNav title="팀 용병 관리"/>
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: 20, background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          {[['2', '진행중'], ['14', '이번 달'], ['86%', '매칭률']].map(([v, l]) => (
            <div key={l} style={{ flex: 1, padding: 12, borderRadius: 10, background: 'var(--grey50)' }}>
              <div className="tab-num" style={{ fontSize: 18, fontWeight: 700 }}>{v}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: 16 }}>
        {[
          { t: '이번주 토요일 용병 1명', p: 'MF', date: '5/3 14:00', app: 4, state: 'open' },
          { t: '내일 풋살 용병 구해요', p: 'GK', date: '4/26 20:00', app: 2, state: 'open' },
          { t: '지난주 용병', p: 'FW', date: '4/19 10:00', app: 6, state: 'filled' },
        ].map((m, i) => (
          <div key={i} style={{ background: 'var(--bg)', borderRadius: 14, padding: 16, marginBottom: 10, border: '1px solid var(--grey100)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 11, padding: '3px 8px', background: m.state === 'open' ? 'var(--blue50)' : 'var(--grey100)', color: m.state === 'open' ? 'var(--blue500)' : 'var(--text-muted)', borderRadius: 4, fontWeight: 700 }}>{m.state === 'open' ? '모집중' : '마감'}</span>
              <span className="tab-num" style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 400 }}>지원 {m.app}명</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>{m.t}</div>
            <div className="tab-num" style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>{m.p} · {m.date}</div>
          </div>
        ))}
        <SBtn full size="md" variant="outline" style={{ borderStyle: 'dashed' }}>+ 용병 구인 올리기</SBtn>
      </div>
    </div>
  </div>
);

Object.assign(window, { TeamMembers, TeamMatchHistory, PaymentDetail, PaymentRefund, TournamentDetail, Feed, Badges, ChatEmbed, TeamMercenary });
