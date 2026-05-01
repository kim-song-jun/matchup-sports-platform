/* Teameet — Refresh Part 2: Payment flow · Chat · Notifications */

/* ────────── Payment Checkout ────────── */
const PaymentCheckoutV2 = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <TopNav title="결제"/>
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100 }}>
      {/* Order summary */}
      <div style={{ background: 'var(--bg)', padding: 20, borderBottom: '8px solid var(--grey50)' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ width: 64, height: 64, borderRadius: 12, background: `url(${IMG.soccer}) center/cover`, flexShrink: 0 }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--blue500)', fontWeight: 700 }}>축구 매치</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', marginTop: 4, lineHeight: 1.3 }}>주말 축구 한 판</div>
            <div className="tab-num" style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginTop: 4 }}>5/3 (토) 14:00 · 상암</div>
          </div>
        </div>
      </div>

      {/* Payment methods */}
      <div style={{ background: 'var(--bg)', padding: '20px 0', borderBottom: '8px solid var(--grey50)' }}>
        <SectionTitle title="결제 수단"/>
        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { n: '토스페이', sub: '잔액 26,500원', sel: true, ic: 'T', c: 'var(--blue500)' },
            { n: '신한카드 ●●●● 8624', sub: '간편결제', sel: false, ic: 'S', c: '#0046ff' },
            { n: '계좌이체', sub: '국민은행', sel: false, ic: 'B', c: 'var(--grey500)' },
            { n: '+ 결제수단 추가', sub: '', sel: false, ic: '', c: 'var(--text-caption)' },
          ].map((p, i) => (
            <div key={i} style={{
              padding: 14, borderRadius: 12,
              background: p.sel ? 'var(--blue50)' : 'var(--grey50)',
              border: p.sel ? '2px solid var(--blue500)' : '2px solid transparent',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              {p.ic && <div style={{ width: 36, height: 36, borderRadius: 8, background: p.c, color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{p.ic}</div>}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>{p.n}</div>
                {p.sub && <div className="tab-num" style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, marginTop: 2 }}>{p.sub}</div>}
              </div>
              {p.sel && <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800 }}>✓</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Discount */}
      <div style={{ background: 'var(--bg)', padding: '20px', borderBottom: '8px solid var(--grey50)' }}>
        <SectionTitle title="할인 · 쿠폰"/>
        <div style={{ padding: '0 20px' }}>
          <ListItem
            leading={<div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--orange50)', color: 'var(--orange500)', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 800 }}>%</div>}
            title="신규 가입 쿠폰 -3,000원"
            sub="자동 적용됨"
            trailing={<span style={{ fontSize: 11, color: 'var(--orange500)', fontWeight: 700 }}>적용중</span>}
          />
          <ListItem
            leading={<div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--grey100)', color: 'var(--text-muted)', display: 'grid', placeItems: 'center' }}>🎁</div>}
            title="포인트 사용"
            sub="보유 1,200P"
            chev
          />
        </div>
      </div>

      {/* Total breakdown — Toss signature */}
      <div style={{ background: 'var(--bg)', padding: 20 }}>
        <SectionTitle title="결제 금액"/>
        <div style={{ padding: '0 20px' }}>
          <MoneyRow label="기본 참가비" amount={10000}/>
          <MoneyRow label="조끼 대여" amount={2000}/>
          <MoneyRow label="장소 분담" amount={3000}/>
          <MoneyRow label="신규 쿠폰" amount={-3000}/>
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 4 }}>
            <MoneyRow label="총 결제 금액" amount={12000} strong accent/>
          </div>
        </div>
      </div>

      {/* Notice */}
      <AnnouncementBar icon="i" text="경기 시작 24시간 전까지 100% 환불 가능"/>
    </div>

    <div style={{ padding: '12px 20px 24px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
      <button className="tm-pressable tm-break-keep" style={{
        width: '100%', height: 56, borderRadius: 14,
        background: 'var(--blue500)', color: 'var(--static-white)',
        border: 'none', fontSize: 16, fontWeight: 700,
      }}>12,000원 결제하기</button>
    </div>
  </div>
);

/* ────────── Payment Success ────────── */
const PaymentSuccessV2 = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ flex: 1, padding: '60px 24px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      {/* Animated check */}
      <div style={{
        width: 88, height: 88, borderRadius: '50%',
        background: 'var(--blue500)', color: 'var(--static-white)',
        display: 'grid', placeItems: 'center',
        animation: 'pop 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
      }}>
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5"/>
        </svg>
      </div>

      <div style={{ marginTop: 28, fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: 0 }}>
        결제가 완료됐어요
      </div>
      <NumberDisplay value={12000} unit="원" size={36}/>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8, fontWeight: 500 }}>토스페이 · 4/24 14:32</div>

      {/* Receipt */}
      <div style={{ width: '100%', marginTop: 36, background: 'var(--grey50)', borderRadius: 16, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 10, background: `url(${IMG.soccer}) center/cover` }}/>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>주말 축구 한 판</div>
            <div className="tab-num" style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>5/3 (토) 14:00 · 상암</div>
          </div>
        </div>
        <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>주문번호</span>
            <span className="tab-num" style={{ fontSize: 12, color: 'var(--text-strong)', fontWeight: 600 }}>TM-202604240001</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>결제수단</span>
            <span style={{ fontSize: 12, color: 'var(--text-strong)', fontWeight: 600 }}>토스페이</span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }}/>
      <div style={{ width: '100%', paddingBottom: 24 }}>
        <button className="tm-pressable tm-break-keep" style={{ width: '100%', height: 56, borderRadius: 14, background: 'var(--blue500)', color: 'var(--static-white)', border: 'none', fontSize: 16, fontWeight: 700 }}>매치 보러가기</button>
        <button className="tm-pressable tm-break-keep" style={{ width: '100%', height: 48, marginTop: 8, background: 'transparent', color: 'var(--text-muted)', border: 'none', fontSize: 14, fontWeight: 500 }}>홈으로</button>
      </div>
    </div>
  </div>
);

/* ────────── Payment History — refreshed ────────── */
const PaymentHistoryV2 = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <TopNav title="결제 내역"/>

    {/* Month picker + summary */}
    <div style={{ background: 'var(--bg)', padding: 20, borderBottom: '8px solid var(--grey50)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="tm-pressable tm-break-keep" style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--grey100)', border: 'none' }}>‹</button>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>2026년 4월</div>
        <button className="tm-pressable tm-break-keep" style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--grey100)', border: 'none' }}>›</button>
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>이번 달 사용 금액</div>
        <NumberDisplay value={144000} unit="원" size={32} sub="지난달보다 -32,000원"/>
      </div>

      <div style={{ marginTop: 20, padding: '14px 16px', background: 'var(--grey50)', borderRadius: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <KPIStat label="결제" value={12} unit="건"/>
        <KPIStat label="환불" value={1} unit="건"/>
        <KPIStat label="평균" value={12000} unit="원"/>
      </div>
    </div>

    {/* Filter */}
    <div style={{ background: 'var(--bg)', padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
        <HapticChip active>전체 13</HapticChip>
        <HapticChip count={8}>매치</HapticChip>
        <HapticChip count={2}>레슨</HapticChip>
        <HapticChip count={2}>예약</HapticChip>
        <HapticChip count={1}>환불</HapticChip>
      </div>
    </div>

    {/* Group by date */}
    <div style={{ flex: 1, overflow: 'auto' }}>
      {[
        {
          d: '4월 24일 (수)', total: 12000,
          tx: [
            { t: '주말 축구 한 판', sub: '토스페이 · 14:32', a: -12000, c: 'var(--blue500)' },
          ],
        },
        {
          d: '4월 22일 (월)', total: 120000,
          tx: [
            { t: '풋살 레슨 5회권', sub: '신한카드 · 09:11', a: -120000, c: 'var(--green500)' },
          ],
        },
        {
          d: '4월 20일 (토)', total: -8000,
          tx: [
            { t: '환불: 평일 농구', sub: '토스페이 · 18:42', a: 8000, refund: true, c: 'var(--green500)' },
          ],
        },
        {
          d: '4월 18일 (목)', total: 40000,
          tx: [
            { t: '시설 예약 (반포 풋살장)', sub: '신한카드 · 21:00', a: -25000, c: 'var(--purple500)' },
            { t: '용병 매칭', sub: '토스페이 · 16:11', a: -15000, c: 'var(--orange500)' },
          ],
        },
      ].map((g, i) => (
        <div key={i} style={{ background: 'var(--bg)', marginBottom: 8 }}>
          <div style={{ padding: '12px 20px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{g.d}</span>
            <span className="tab-num" style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{g.total > 0 ? '+' : ''}{Math.abs(g.total).toLocaleString()}원</span>
          </div>
          {g.tx.map((tx, j) => (
            <ListItem
              key={j}
              leading={<div style={{ width: 40, height: 40, borderRadius: 10, background: tx.c + '15', color: tx.c, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800 }}>{tx.refund ? '↺' : '₩'}</div>}
              title={tx.t}
              sub={tx.sub}
              trailing={
                <span className="tab-num" style={{ fontSize: 14, fontWeight: 700, color: tx.a > 0 ? 'var(--green500)' : 'var(--text-strong)' }}>
                  {tx.a > 0 ? '+' : ''}{tx.a.toLocaleString()}원
                </span>
              }
            />
          ))}
        </div>
      ))}
    </div>
  </div>
);

/* ────────── Chat list refresh ────────── */
const ChatListV2 = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)', letterSpacing: 0 }}>채팅</div>
      <button className="tm-pressable tm-break-keep" style={{ width: 40, height: 40, background: 'transparent', border: 'none', color: 'var(--text-strong)' }}>
        <Icon name="search" size={22}/>
      </button>
    </div>

    {/* Tabs */}
    <div style={{ padding: '0 20px 8px', display: 'flex', gap: 6 }}>
      <HapticChip active count={5}>전체</HapticChip>
      <HapticChip count={2}>매치</HapticChip>
      <HapticChip count={3}>팀</HapticChip>
      <HapticChip count={0}>1:1</HapticChip>
    </div>

    {/* Pinned */}
    <div style={{ padding: '8px 20px 4px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: 0.4 }}>📌 고정</div>

    <div style={{ flex: 1, overflow: 'auto' }}>
      {[
        {
          pinned: true, t: 'FC 발빠른놈들', sub: '정민: 이번 주 토요일 가시는 분?',
          time: '10:24', unread: 3, type: '팀',
          avs: [IMG.av1, IMG.av2, IMG.av3], typing: false,
        },
        {
          pinned: true, t: '주말 축구 한 판', sub: '지훈: 조끼 대여 가능합니다',
          time: '09:18', unread: 0, type: '매치',
          avs: [IMG.av4, IMG.av5], typing: false,
        },
      ].map((c, i) => (
        <ChatRow key={i} c={c}/>
      ))}

      <div style={{ padding: '12px 20px 4px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: 0.4 }}>최근</div>

      {[
        { t: '강남 농구회', sub: '수현: ㅎㅎㅎㅎㅎ 네넵', time: '어제', unread: 1, type: '팀', avs: [IMG.av3] },
        { t: '풋살 레슨 5회권', sub: '코치: 다음 주 화요일 7시 진행됩니다.', time: '어제', unread: 0, type: '레슨', avs: [IMG.av6] },
        { t: '소연', sub: '입금 완료했어요!', time: '4/22', unread: 0, type: '1:1', avs: [IMG.av4], typing: true },
        { t: '이번 주말 매치 알림방', sub: '봇: 주말 5개 매치가 추가되었어요', time: '4/20', unread: 0, type: '봇', avs: [], bot: true },
        { t: 'FC 번개', sub: '나: 다음 매치 일정 공유드립니다', time: '4/18', unread: 0, type: '팀', avs: [IMG.av2] },
      ].map((c, i) => <ChatRow key={i} c={c}/>)}
    </div>
    <TabBar active="chat"/>
  </div>
);

const ChatRow = ({ c }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', cursor: 'pointer' }}>
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {c.bot ? (
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 800 }}>T</div>
      ) : c.avs.length > 1 ? (
        <div style={{ width: 48, height: 48, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: 32, height: 32, borderRadius: '50%', background: `url(${c.avs[0]}) center/cover`, border: '2px solid var(--bg)' }}/>
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: '50%', background: `url(${c.avs[1]}) center/cover`, border: '2px solid var(--bg)' }}/>
        </div>
      ) : (
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: c.avs[0] ? `url(${c.avs[0]}) center/cover` : 'var(--grey200)' }}/>
      )}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{c.t}</span>
        <span style={{ fontSize: 10, padding: '2px 5px', background: 'var(--grey100)', color: 'var(--text-muted)', borderRadius: 3, fontWeight: 700 }}>{c.type}</span>
      </div>
      <div style={{ fontSize: 13, color: c.typing ? 'var(--blue500)' : 'var(--text-muted)', fontWeight: c.typing ? 600 : 400, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {c.typing ? '입력중...' : c.sub}
      </div>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
      <span className="tab-num" style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 500 }}>{c.time}</span>
      {c.unread > 0 && (
        <span className="tab-num" style={{
          minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
          background: 'var(--red500)', color: 'var(--static-white)',
          fontSize: 10, fontWeight: 700,
          display: 'grid', placeItems: 'center',
        }}>{c.unread}</span>
      )}
    </div>
  </div>
);

/* ────────── Chat room refresh ────────── */
const ChatRoomV2 = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    {/* Custom topnav with team info */}
    <div style={{ padding: '8px 8px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
      <button className="tm-pressable tm-break-keep" style={{ width: 40, height: 40, background: 'transparent', border: 'none', color: 'var(--text-strong)' }}><Icon name="chevL" size={22}/></button>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: `url(${IMG.av1}) center/cover` }}/>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: 4 }}>FC 발빠른놈들 <span className="tab-num" style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>22</span></div>
          <div style={{ fontSize: 11, color: 'var(--green500)', fontWeight: 600 }}>● 12명 접속중</div>
        </div>
      </div>
      <button className="tm-pressable tm-break-keep" style={{ width: 40, height: 40, background: 'transparent', border: 'none', color: 'var(--text-strong)' }}>≡</button>
    </div>

    {/* Pinned event card */}
    <div style={{ padding: '12px 16px 0' }}>
      <div style={{ background: 'var(--blue50)', borderRadius: 12, padding: 14, display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--blue100)' }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800 }}>5/3</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue700)' }}>📌 다음 매치 · 토 14:00 상암</div>
          <div className="tab-num" style={{ fontSize: 11, color: 'var(--blue500)', fontWeight: 500, marginTop: 2 }}>18/22 참가 · 4명 더 모집</div>
        </div>
        <button className="tm-pressable tm-break-keep" style={{ height: 28, padding: '0 10px', borderRadius: 6, background: 'var(--bg)', color: 'var(--blue500)', border: 'none', fontSize: 11, fontWeight: 700 }}>참가</button>
      </div>
    </div>

    {/* Messages */}
    <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <DateDivider d="오늘"/>
      <Bubble side="left" name="정민" av={IMG.av1} text="이번 주 토요일 가시는 분?" time="10:20"/>
      <Bubble side="left" av={IMG.av1} text="오랜만에 풀매치로 갑시다 🔥" time="10:21"/>
      <Bubble side="right" text="저요" time="10:23"/>
      <Bubble side="left" name="지훈" av={IMG.av2} text="저도 갑니다" time="10:23"/>
      {/* System message */}
      <div style={{ alignSelf: 'center', fontSize: 11, color: 'var(--text-caption)', fontWeight: 500, padding: '4px 10px', background: 'var(--grey100)', borderRadius: 999 }}>
        수현님이 입장했어요
      </div>
      <Bubble side="left" name="수현" av={IMG.av3} text="저 이번 주 풀매치 가능해요!! 골키퍼는 어떻게 되나요" time="10:24"/>
    </div>

    {/* Input */}
    <div style={{ padding: '12px 12px 24px', background: 'var(--bg)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
      <button className="tm-pressable tm-break-keep" style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--grey100)', border: 'none', color: 'var(--text-strong)', fontSize: 18, fontWeight: 700 }}>+</button>
      <div style={{ flex: 1, height: 40, padding: '0 14px', borderRadius: 20, background: 'var(--grey100)', display: 'flex', alignItems: 'center', fontSize: 13, color: 'var(--text-placeholder)' }}>
        메시지 입력...
      </div>
      <button className="tm-pressable tm-break-keep" style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--blue500)', border: 'none', color: 'var(--static-white)', display: 'grid', placeItems: 'center' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
      </button>
    </div>
  </div>
);

const DateDivider = ({ d }) => (
  <div style={{ alignSelf: 'center', fontSize: 11, color: 'var(--text-caption)', fontWeight: 600, padding: '4px 12px', background: 'var(--grey100)', borderRadius: 999, marginTop: 4 }}>{d}</div>
);

const Bubble = ({ side, av, name, text, time }) => (
  <div style={{ display: 'flex', flexDirection: side === 'right' ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8 }}>
    {side === 'left' && av && <div style={{ width: 28, height: 28, borderRadius: '50%', background: `url(${av}) center/cover`, flexShrink: 0 }}/>}
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: side === 'right' ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
      {name && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 3 }}>{name}</div>}
      <div style={{
        padding: '9px 13px', borderRadius: 16,
        background: side === 'right' ? 'var(--blue500)' : 'var(--bg)',
        color: side === 'right' ? 'var(--static-white)' : 'var(--text-strong)',
        fontSize: 14, fontWeight: 500, lineHeight: 1.4,
        boxShadow: side === 'right' ? 'none' : '0 1px 2px rgba(0,0,0,.04)',
        border: side === 'right' ? 'none' : '1px solid var(--border)',
      }}>{text}</div>
    </div>
    <span className="tab-num" style={{ fontSize: 10, color: 'var(--text-caption)', fontWeight: 500, alignSelf: 'flex-end' }}>{time}</span>
  </div>
);

/* ────────── Notifications refresh ────────── */
const NotificationsV2 = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)', letterSpacing: 0 }}>알림</div>
      <button className="tm-pressable tm-break-keep" style={{ background: 'transparent', border: 'none', fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>모두 읽음</button>
    </div>

    {/* Tabs */}
    <div style={{ padding: '0 20px 8px', display: 'flex', gap: 6, borderBottom: '1px solid var(--border)' }}>
      {['전체 12', '매치 5', '팀 4', '결제 3'].map((t, i) => (
        <button className="tm-pressable tm-break-keep" key={t} style={{
          padding: '12px 8px', background: 'transparent', border: 'none',
          borderBottom: i === 0 ? '2px solid var(--text-strong)' : '2px solid transparent',
          fontSize: 13, fontWeight: i === 0 ? 700 : 500,
          color: i === 0 ? 'var(--text-strong)' : 'var(--text-muted)',
        }}>{t}</button>
      ))}
    </div>

    <div style={{ flex: 1, overflow: 'auto' }}>
      {/* TODAY */}
      <div style={{ padding: '14px 20px 6px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: 0.4 }}>오늘</div>
      <NotifRow type="match" icon="⚽" iconBg="var(--blue50)" iconColor="var(--blue500)"
        title="매치 시작 1시간 전이에요"
        sub="주말 축구 한 판 · 14:00 상암 · 18/22명"
        time="13:00" unread/>
      <NotifRow type="team" icon="👥" iconBg="var(--orange50)" iconColor="var(--orange500)"
        title="FC 발빠른놈들에 새 멤버 합류"
        sub="박수현님이 가입했어요 (총 22명)"
        time="11:42" unread/>
      <NotifRow type="pay" icon="₩" iconBg="var(--blue50)" iconColor="var(--blue500)"
        title="결제 완료"
        sub="주말 축구 한 판 · 12,000원"
        time="14:32" unread/>

      {/* YESTERDAY */}
      <div style={{ padding: '14px 20px 6px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: 0.4 }}>어제</div>
      <NotifRow type="badge" icon="🏆" iconBg="var(--orange50)" iconColor="var(--orange500)"
        title="새로운 뱃지 획득!"
        sub="‘연속 10경기’ 뱃지를 받았어요"
        time="20:14"/>
      <NotifRow type="review" icon="★" iconBg="var(--green50)" iconColor="var(--green500)"
        title="새 리뷰가 도착했어요"
        sub="지훈님이 매너 5점을 주셨어요"
        time="18:30"/>

      {/* THIS WEEK */}
      <div style={{ padding: '14px 20px 6px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: 0.4 }}>이번 주</div>
      <NotifRow type="match" icon="📍" iconBg="var(--grey100)" iconColor="var(--text-strong)"
        title="장소 변경 안내"
        sub="‘평일 농구’ 매치 장소가 변경됐어요"
        time="4/22"/>
      <NotifRow type="merc" icon="🆘" iconBg="var(--red50)" iconColor="var(--red500)"
        title="용병 모집 매칭 완료"
        sub="강남 농구회에서 25,000원 페이가 입금됐어요"
        time="4/21"/>
      <NotifRow type="pay" icon="↺" iconBg="var(--green50)" iconColor="var(--green500)"
        title="환불 완료"
        sub="평일 농구 환불 8,000원"
        time="4/20"/>

      <div style={{ padding: '20px', textAlign: 'center', fontSize: 12, color: 'var(--text-caption)', fontWeight: 500 }}>
        지난 30일간의 알림이 표시돼요
      </div>
    </div>
    <TabBar active="home"/>
  </div>
);

const NotifRow = ({ icon, iconBg, iconColor, title, sub, time, unread }) => (
  <div style={{
    padding: '14px 20px',
    background: unread ? 'var(--blue50)' : 'var(--bg)',
    display: 'flex', alignItems: 'flex-start', gap: 12,
    cursor: 'pointer', position: 'relative',
  }}>
    <div style={{
      width: 40, height: 40, borderRadius: 12, flexShrink: 0,
      background: iconBg, color: iconColor,
      display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 700,
    }}>{icon}</div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', lineHeight: 1.4 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginTop: 4, lineHeight: 1.4 }}>{sub}</div>
      <span className="tab-num" style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 500, marginTop: 6, display: 'inline-block' }}>{time}</span>
    </div>
    {unread && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--blue500)', position: 'absolute', top: 18, right: 20 }}/>}
  </div>
);

Object.assign(window, {
  PaymentCheckoutV2, PaymentSuccessV2, PaymentHistoryV2,
  ChatListV2, ChatRoomV2,
  NotificationsV2,
});
