/* fix32 — M14 결제·환불·분쟁 풀 grid (canonical rewrite).
   ID schema: m14-{mb|tb|dt}-{main|detail|flow|state|components|assets|motion}[-sub]
   Routes: /payments, /payments/[id], /payments/[id]/refund, /payments/checkout,
           /my/disputes, /my/disputes/[id]
   Light-only. Canonical: PaymentDetail, PaymentRefund, WalletToss, MoneyRow, NumberDisplay */

const M14_MB_W = 375;
const M14_MB_H = 812;
const M14_TB_W = 768;
const M14_TB_H = 1024;

/* ---------- Domain fixtures (M14 prefix — no top-level collision) ---------- */
const M14_PAYMENTS = [
  { id: 'pay-001', date: '2026.04.20', title: '강남 풋살 6vs6',       amount: 17000, status: 'completed',   method: '카카오페이',      receipt: 'T2604201234' },
  { id: 'pay-002', date: '2026.04.14', title: '배드민턴 레슨 4회권',  amount: 48000, status: 'completed',   method: '신용카드 (삼성)', receipt: 'T2604141098' },
  { id: 'pay-003', date: '2026.04.07', title: '아이스하키 용병 신청', amount: 25000, status: 'refunded',    method: '토스페이',        receipt: 'T2604071765' },
  { id: 'pay-004', date: '2026.03.29', title: '풋살화 (중고 거래)',   amount: 35000, status: 'escrow_held', method: '계좌이체',        receipt: 'T2603291543' },
];

const M14_CHECKOUT_ROWS = [
  { label: '참가비',            amount: 20000 },
  { label: '플랫폼 수수료 (5%)', amount: 1000 },
  { label: '쿠폰 할인',         amount: -3000 },
  { label: '포인트 사용',       amount: -1000 },
];

const M14_RECEIPT_ROWS = [
  { label: '원래 금액',   amount: 20000 },
  { label: '플랫폼 수수료', amount: 1000 },
  { label: '쿠폰 할인',   amount: -3000 },
  { label: '포인트',      amount: -1000 },
];

const M14_DISPUTE_MESSAGES = [
  { role: 'buyer',  text: '배송된 상품이 사진과 다릅니다. 박음질이 뜯겨 있어요.',    time: '04.22 14:10' },
  { role: 'seller', text: '발송 당시엔 정상이었는데 확인해보겠습니다.',               time: '04.22 15:32' },
  { role: 'admin',  text: '관리자가 검토를 시작했습니다.',                           time: '04.23 09:00' },
  { role: 'buyer',  text: '사진 첨부합니다. 확인 부탁드려요.',                       time: '04.23 09:45' },
];

const M14_STATUS_MAP = {
  completed:   { label: '결제 완료',      tone: 'green' },
  refunded:    { label: '환불 완료',      tone: 'grey' },
  escrow_held: { label: '에스크로 보관중', tone: 'orange' },
  pending:     { label: '결제 대기',      tone: 'orange' },
  failed:      { label: '결제 실패',      tone: 'red' },
};

const M14_DISPUTE_STATUS_MAP = {
  filed:            { label: '접수됨',     tone: 'orange' },
  seller_responded: { label: '판매자 응답', tone: 'blue' },
  admin_reviewing:  { label: '관리자 검토중', tone: 'blue' },
  resolved_refund:  { label: '환불 처리',   tone: 'green' },
  dismissed:        { label: '기각',        tone: 'grey' },
};

/* ---------- M14-scoped sub-components ---------- */

/* M14PaymentListItem — 결제 내역 단일 행 (global MoneyRow grammar) */
const M14PaymentListItem = ({ item, divider }) => {
  const s = M14_STATUS_MAP[item.status] || { label: item.status, tone: 'grey' };
  return (
    <div style={{
      padding: '16px 20px',
      borderBottom: divider ? '1px solid var(--border)' : 'none',
      background: 'var(--bg)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tm-text-body" style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{item.title}</div>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
            {item.date} · {item.method}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          <span
            className="tm-text-body tm-tabular"
            style={{
              fontWeight: 700,
              color: item.status === 'refunded' ? 'var(--text-muted)' : 'var(--text-strong)',
              textDecoration: item.status === 'refunded' ? 'line-through' : 'none',
            }}
          >
            {item.amount.toLocaleString()}원
          </span>
          <Badge tone={s.tone} size="sm">{s.label}</Badge>
        </div>
      </div>
    </div>
  );
};

/* M14MonthLabel — 월별 그룹 헤더 */
const M14MonthLabel = ({ label }) => (
  <div style={{ padding: '16px 20px 8px', background: 'var(--bg-surface)' }}>
    <div className="tm-text-label" style={{ color: 'var(--text-muted)' }}>{label}</div>
  </div>
);

/* M14EscrowBadge — 에스크로/결제 상태 배지 + 설명 */
const M14EscrowBadge = ({ status, showDesc }) => {
  const info = {
    escrow_held:   { label: '에스크로 보관중', tone: 'orange', desc: '구매 확정 또는 7일 후 자동 해제' },
    completed:     { label: '결제 완료',       tone: 'green',  desc: '정상 결제됨' },
    refunded:      { label: '환불 완료',       tone: 'grey',   desc: '전액 환불 처리됨' },
    pending:       { label: '결제 대기',       tone: 'orange', desc: '결제 진행 중' },
    failed:        { label: '결제 실패',       tone: 'red',    desc: '결제에 실패했어요' },
    auto_released: { label: '자동 해제',       tone: 'grey',   desc: '7일 경과 후 자동 정산' },
  }[status] || { label: status, tone: 'grey', desc: '' };

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <Badge tone={info.tone} size="sm">{info.label}</Badge>
      {showDesc && info.desc && (
        <span className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{info.desc}</span>
      )}
    </div>
  );
};

/* M14DisputeBubble — 분쟁 메시지 버블 (ChatBubble grammar) */
const M14DisputeBubble = ({ role, text, time }) => {
  const isMe = role === 'buyer';
  const isAdmin = role === 'admin';
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isAdmin ? 'center' : isMe ? 'flex-end' : 'flex-start',
      gap: 4,
      padding: '4px 0',
    }}>
      {isAdmin ? (
        <div style={{
          padding: '6px 14px',
          background: 'var(--grey100)',
          borderRadius: 'var(--r-pill)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Icon name="shield" size={12} color="var(--grey600)" />
          <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{text}</span>
        </div>
      ) : (
        <div style={{
          maxWidth: 240,
          padding: '10px 14px',
          borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          background: isMe ? 'var(--blue500)' : 'var(--grey100)',
          color: isMe ? 'var(--static-white)' : 'var(--text-strong)',
        }}>
          <span className="tm-text-body">{text}</span>
        </div>
      )}
      <span className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{time}</span>
    </div>
  );
};

/* M14DisputeThread — 분쟁 전체 스레드 (global DisputeMessageThread grammar) */
const M14DisputeThread = ({ messages }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    {messages.map((m, i) => (
      <M14DisputeBubble key={i} role={m.role} text={m.text} time={m.time} />
    ))}
  </div>
);

/* M14StickyCTA — 결제/환불 하단 고정 CTA 래퍼 */
const M14StickyCTA = ({ children }) => (
  <div style={{
    padding: '12px 20px 28px',
    borderTop: '1px solid var(--border)',
    background: 'var(--bg)',
  }}>
    {children}
  </div>
);

/* M14ComponentRow — components board 라벨 + 컨텐츠 행 */
const M14ComponentRow = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>{children}</div>
  </div>
);

/* M14AssetRow — assets board 라벨 + 컨텐츠 행 */
const M14AssetRow = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>{children}</div>
  </div>
);

/* M14TokenChip — 단일 색상 토큰 칩 */
const M14TokenChip = ({ token, value }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <div style={{
      width: 20, height: 20, borderRadius: 5,
      background: value,
      border: '1px solid var(--border)',
      flexShrink: 0,
    }} />
    <span className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{token}</span>
  </div>
);

/* M14MotionRow — motion board 단일 행 */
const M14MotionRow = ({ title, sub, trailing }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 0', borderBottom: '1px solid var(--grey100)',
  }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{title}</div>
      <div className="tm-text-caption" style={{ marginTop: 2, color: 'var(--text-muted)' }}>{sub}</div>
    </div>
    <Badge tone="grey" size="sm">{trailing}</Badge>
  </div>
);

/* ==========================================
   BOARDS
   ========================================== */

/* ---------- m14-mb-main — 결제 내역 (월별 grouped + global MoneyRow grammar) ---------- */
const M14MobileMain = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TopNav title="결제 내역" />

      {/* Hero: 이번 달 사용 (WalletToss grammar — NumberDisplay + KPIStat) */}
      <div style={{ padding: '20px 20px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginBottom: 4 }}>이번 달 사용</div>
        <NumberDisplay value={90000} size={28} sub="지난달보다 -54,000원" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16 }}>
          <KPIStat label="결제" value={3} unit="건" />
          <KPIStat label="환불" value={1} unit="건" />
          <KPIStat label="에스크로" value={1} unit="건" />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-surface)' }}>
        {/* 2026년 4월 */}
        <M14MonthLabel label="2026년 4월" />
        {M14_PAYMENTS.slice(0, 3).map((p, i) => (
          <M14PaymentListItem key={p.id} item={p} divider={i < 2} />
        ))}

        {/* 2026년 3월 */}
        <M14MonthLabel label="2026년 3월" />
        <M14PaymentListItem item={{ ...M14_PAYMENTS[3], id: 'p-m3a', title: '농구 하프코트 3vs3', date: '2026.03.20', amount: 5000, status: 'completed', method: '네이버페이' }} />
        <M14PaymentListItem item={{ ...M14_PAYMENTS[3] }} divider={false} />
      </div>
      <BottomNav active="my" />
    </div>
  </Phone>
);

/* ---------- m14-tb-main — 태블릿 결제 내역 ---------- */
const M14TabletMain = () => (
  <div style={{ width: M14_TB_W, height: M14_TB_H, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column' }}>
    <div style={{ padding: '20px 32px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
      <button style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-strong)' }} aria-label="뒤로">
        <Icon name="chevL" size={22} />
      </button>
      <div className="tm-text-subhead">결제 내역</div>
    </div>
    {/* Month summary strip */}
    <div style={{ padding: '16px 32px 12px', background: 'var(--bg-surface)', display: 'flex', gap: 24, alignItems: 'center' }}>
      <NumberDisplay value={90000} size={22} sub="2026년 4월 사용" />
      <KPIStat label="결제" value={3} unit="건" />
      <KPIStat label="환불" value={1} unit="건" />
    </div>
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 32px' }}>
      <div style={{ padding: '16px 0 8px' }}>
        <div className="tm-text-label" style={{ color: 'var(--text-muted)' }}>2026년 4월</div>
      </div>
      <div style={{ display: 'grid', gap: 1, background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
        {M14_PAYMENTS.map((p) => {
          const s = M14_STATUS_MAP[p.status] || { label: p.status, tone: 'grey' };
          return (
            <div key={p.id} style={{ background: 'var(--bg)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', minHeight: 44 }}>
              <div style={{ flex: 1 }}>
                <div className="tm-text-body" style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{p.title}</div>
                <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 4 }}>{p.date} · {p.method}</div>
              </div>
              <Badge tone={s.tone} size="sm">{s.label}</Badge>
              <span className="tm-text-body tm-tabular" style={{ fontWeight: 700, color: 'var(--text-strong)', minWidth: 80, textAlign: 'right' }}>
                {p.amount.toLocaleString()}원
              </span>
              <Icon name="chevR" size={16} color="var(--grey400)" aria-hidden="true" />
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

/* ---------- m14-dt-main — 데스크탑 trust-center split ---------- */
const M14DesktopMain = () => (
  <div style={{ width: 1280, height: 820, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'grid', gridTemplateColumns: '240px 1fr 380px' }}>
    <aside style={{ borderRight: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>T</div>
        <div className="tm-text-body-lg">Teameet</div>
      </div>
      <nav style={{ display: 'grid', gap: 4 }}>
        {[['홈', false], ['매치', false], ['팀', false], ['장터', false], ['결제', true], ['마이', false]].map(([l, a]) => (
          <button key={l} className={`tm-btn tm-btn-md ${a ? 'tm-btn-secondary' : 'tm-btn-ghost'}`} style={{ justifyContent: 'flex-start' }}>{l}</button>
        ))}
      </nav>
    </aside>
    <main style={{ padding: '32px 32px', overflowY: 'auto' }}>
      <div className="tm-text-heading" style={{ marginBottom: 8 }}>결제 내역</div>
      {/* Month summary */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
        <NumberDisplay value={90000} size={22} sub="2026년 4월" />
        <KPIStat label="건수" value={4} unit="건" />
        <KPIStat label="환불" value={1} unit="건" />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['전체', '결제 완료', '환불', '에스크로'].map((f, i) => (
          <Chip key={f} active={i === 0} size="sm">{f}</Chip>
        ))}
      </div>
      <div style={{ display: 'grid', gap: 2 }}>
        {M14_PAYMENTS.map((p) => {
          const s = M14_STATUS_MAP[p.status] || { label: p.status, tone: 'grey' };
          return (
            <div key={p.id} className="tm-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', borderRadius: 'var(--r-md)', minHeight: 44 }}>
              <div style={{ flex: 1 }}>
                <div className="tm-text-body" style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{p.title}</div>
                <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 4 }}>{p.date} · {p.method} · {p.receipt}</div>
              </div>
              <Badge tone={s.tone} size="sm">{s.label}</Badge>
              <span className="tm-text-body tm-tabular" style={{ fontWeight: 700, color: 'var(--text-strong)', minWidth: 96, textAlign: 'right' }}>
                {p.amount.toLocaleString()}원
              </span>
              <Icon name="chevR" size={16} color="var(--grey400)" aria-hidden="true" />
            </div>
          );
        })}
      </div>
    </main>
    {/* Right panel — PaymentDetail grammar */}
    <aside style={{ borderLeft: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="tm-text-label" style={{ color: 'var(--text-muted)' }}>결제 상세</div>
      <Card pad={16}>
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginBottom: 4 }}>결제 금액</div>
        <NumberDisplay value={17000} size={28} sub="2026.04.20 19:41 결제" />
        <div style={{ display: 'inline-block', marginTop: 10, padding: '4px 10px', background: 'var(--green50)', color: 'var(--green500)', borderRadius: 6 }}>
          <span className="tm-text-label" style={{ fontWeight: 700 }}>결제 완료</span>
        </div>
        <AnnouncementBar icon="ⓘ" text="주문 정보와 환불 규칙을 MoneyRow grammar로 정리한 상세입니다" />
        <div style={{ marginTop: 8 }}>
          <SectionTitle title="주문 정보" />
          <div style={{ padding: '0 4px' }}>
            {[['결제 수단', '카카오페이'], ['결제 일시', '2026.04.20 19:41'], ['영수증 번호', 'T2604201234'], ['상품', '강남 풋살 6vs6']].map(([k, v]) => (
              <div key={k} style={{ borderBottom: '1px solid var(--grey100)' }}>
                <MoneyRow label={k} amount={v} unit="" />
              </div>
            ))}
          </div>
        </div>
      </Card>
    </aside>
  </div>
);

/* ---------- m14-mb-detail — PaymentDetail canonical ---------- */
const M14MobileDetail = () => <PaymentDetail />;

/* ---------- m14-mb-flow-checkout — pay-checkout canonical ---------- */
const M14MobileFlowCheckout = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TopNav title="결제하기" />
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
        {/* 주문 요약 */}
        <Card pad={16} style={{ margin: '16px 0 12px' }}>
          <SectionTitle title="주문 상품" />
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '0 4px 8px' }}>
            <div style={{
              width: 48, height: 48, borderRadius: 'var(--r-md)',
              background: 'var(--blue50)', display: 'grid', placeItems: 'center',
            }}>
              <Icon name="trophy" size={20} color="var(--blue500)" aria-hidden="true" />
            </div>
            <div>
              <div className="tm-text-body" style={{ color: 'var(--text-strong)', fontWeight: 600 }}>강남 풋살 6vs6</div>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2 }}>2026.04.27 (일) 19:00 · 잠실 풋살장</div>
            </div>
          </div>
        </Card>

        {/* 결제 수단 선택 */}
        <Card pad={16} style={{ marginBottom: 12 }}>
          <SectionTitle title="결제 수단" />
          {['카카오페이', '토스페이', '신용카드'].map((m, i) => (
            <label key={m} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 4px',
              borderBottom: i < 2 ? '1px solid var(--grey100)' : 'none',
              cursor: 'pointer',
              minHeight: 44,
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%',
                border: `2px solid ${i === 0 ? 'var(--blue500)' : 'var(--grey300)'}`,
                background: i === 0 ? 'var(--blue500)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {i === 0 && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--static-white)' }} />}
              </div>
              <span className="tm-text-body" style={{ color: 'var(--text-strong)' }}>{m}</span>
            </label>
          ))}
        </Card>

        {/* 결제 금액 — global MoneyRow */}
        <Card pad={16} style={{ marginBottom: 12 }}>
          <SectionTitle title="결제 금액" />
          <div style={{ padding: '0 4px' }}>
            {M14_CHECKOUT_ROWS.map((r, i) => (
              <div key={i} style={{ borderBottom: '1px solid var(--grey100)' }}>
                <MoneyRow label={r.label} amount={r.amount} />
              </div>
            ))}
            <MoneyRow label="최종 결제금액" amount={17000} strong accent />
          </div>
        </Card>

        {/* 약관 동의 */}
        <div style={{ padding: '12px 0 16px' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', minHeight: 44 }}>
            <div style={{
              width: 20, height: 20, borderRadius: 6,
              background: 'var(--blue500)',
              display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 2,
            }}>
              <Icon name="check" size={12} color="var(--static-white)" stroke={2.5} aria-hidden="true" />
            </div>
            <div>
              <div className="tm-text-caption" style={{ color: 'var(--text)' }}>
                구매조건 확인 및 결제 진행에 동의합니다.
              </div>
              <div className="tm-text-micro" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                이용약관 · 개인정보처리방침 · 환불규정
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Sticky CTA */}
      <M14StickyCTA>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span className="tm-text-label">최종 결제</span>
          <NumberDisplay value={17000} size={20} />
        </div>
        <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" style={{ minHeight: 44 }}>17,000원 결제하기</button>
      </M14StickyCTA>
    </div>
  </Phone>
);

/* ---------- m14-mb-flow-refund — PaymentRefund canonical ---------- */
const M14MobileFlowRefund = () => <PaymentRefund />;

/* ---------- m14-mb-flow-dispute — 분쟁 message thread (DisputeMessageThread grammar) ---------- */
const M14MobileFlowDispute = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TopNav title="분쟁 처리" trailing={
        <Badge tone="orange" size="sm">접수됨</Badge>
      } />
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
        {/* 분쟁 요약 — MoneyRow grammar */}
        <div style={{ padding: 16, margin: '16px 0 12px', background: 'var(--bg-surface)', borderRadius: 'var(--r-md)' }}>
          <div className="tm-text-label" style={{ marginBottom: 8 }}>분쟁 요약</div>
          <MoneyRow label="풋살화 (중고 거래)" amount={35000} strong />
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <Badge tone="orange" size="sm">오배송</Badge>
            <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>2026.04.22</span>
          </div>
        </div>

        {/* 진행 타임라인 */}
        <SectionTitle title="진행 상황" />
        <div style={{ padding: '0 4px', marginBottom: 16 }}>
          {[
            { step: '분쟁 접수',      done: true,  date: '04.22' },
            { step: '판매자 응답 대기', done: false, date: null },
            { step: '관리자 검토',     done: false, date: null },
            { step: '분쟁 해결',       done: false, date: null },
          ].map((s, i) => (
            <div key={s.step} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: s.done ? 'var(--blue500)' : 'var(--grey200)',
                  display: 'grid', placeItems: 'center', flexShrink: 0,
                }}>
                  {s.done && <Icon name="check" size={12} color="var(--static-white)" stroke={2.5} aria-hidden="true" />}
                </div>
                {i < 3 && <div style={{ width: 2, height: 20, background: s.done ? 'var(--blue200)' : 'var(--grey200)', marginTop: 4 }} />}
              </div>
              <div style={{ paddingTop: 2 }}>
                <div className="tm-text-label" style={{ color: s.done ? 'var(--text-strong)' : 'var(--text-muted)' }}>{s.step}</div>
                {s.date && <div className="tm-text-micro" style={{ color: 'var(--text-muted)', marginTop: 2 }}>{s.date}</div>}
              </div>
            </div>
          ))}
        </div>

        {/* 메시지 스레드 — M14DisputeThread (DisputeMessageThread grammar) */}
        <SectionTitle title="메시지" />
        <div style={{ padding: '0 4px', marginBottom: 16 }}>
          <M14DisputeThread messages={M14_DISPUTE_MESSAGES} />
        </div>
      </div>

      {/* 메시지 입력 영역 */}
      <div style={{
        padding: '8px 20px 24px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg)',
        display: 'flex', gap: 8, alignItems: 'flex-end',
      }}>
        <textarea
          className="tm-input"
          style={{ flex: 1, height: 44, resize: 'none', padding: '10px 14px', borderRadius: 'var(--r-md)' }}
          placeholder="메시지 입력..."
          readOnly
        />
        <button
          className="tm-btn tm-btn-primary tm-btn-md"
          style={{ width: 44, height: 44, padding: 0, borderRadius: 'var(--r-md)' }}
          aria-label="전송"
        >
          <Icon name="send" size={16} color="var(--static-white)" aria-hidden="true" />
        </button>
      </div>
    </div>
  </Phone>
);

/* ---------- m14-mb-state-loading — Skeleton shimmer on payment-list wireframe ---------- */
const M14MobileStateLoading = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TopNav title="결제 내역" />
      {/* Hero skeleton */}
      <div style={{ padding: '20px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
        <Skeleton w="40%" h={12} mb={8} />
        <Skeleton w="55%" h={28} mb={12} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Skeleton h={36} r={8} />
          <Skeleton h={36} r={8} />
          <Skeleton h={36} r={8} />
        </div>
      </div>
      <div style={{ flex: 1, padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Skeleton w="30%" h={14} mb={4} />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ padding: '16px 0', borderBottom: '1px solid var(--grey100)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skeleton w="60%" h={14} />
              <Skeleton w="40%" h={12} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
              <Skeleton w={72} h={14} />
              <Skeleton w={64} h={20} r={9999} />
            </div>
          </div>
        ))}
      </div>
    </div>
  </Phone>
);

/* ---------- m14-mb-state-pending — 결제 승인 대기 (approval pulse) ---------- */
const M14MobileStatePending = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 32px', gap: 16, textAlign: 'center' }}>
      {/* Approval pulse spinner */}
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        border: '4px solid var(--blue100)',
        borderTopColor: 'var(--blue500)',
        animation: 'M14spin 0.9s linear infinite',
      }} />
      <style>{`
        @keyframes M14spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .m14-pending-ring { animation: none; border-color: var(--blue200); }
        }
      `}</style>
      <div>
        <div className="tm-text-heading">결제 진행 중</div>
        <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>
          카카오페이 앱에서 인증을 완료해주세요
        </div>
      </div>
      <NumberDisplay value={17000} size={24} color="var(--text-muted)" />
      <AnnouncementBar icon="ⓘ" text="강남 풋살 6vs6 · 2026.04.27 (일) 19:00" />
      <button className="tm-btn tm-btn-ghost tm-btn-md" style={{ color: 'var(--text-muted)', minHeight: 44 }}>결제 취소</button>
    </div>
  </Phone>
);

/* ---------- m14-mb-state-error — 결제 실패 ---------- */
const M14MobileStateError = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 32px', gap: 16, textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--red50)', display: 'grid', placeItems: 'center' }}>
        <Icon name="close" size={28} color="var(--red500)" aria-hidden="true" />
      </div>
      <div>
        <div className="tm-text-heading">결제에 실패했어요</div>
        <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>
          카카오페이 잔액이 부족하거나 일시적인 오류가 발생했어요.
        </div>
      </div>
      <Card pad={14} style={{ width: '100%', textAlign: 'left' }}>
        <div className="tm-text-label" style={{ color: 'var(--text-muted)', marginBottom: 6 }}>에러 코드</div>
        <div className="tm-text-caption tm-tabular" style={{ fontFamily: 'var(--font-tab)', color: 'var(--red500)' }}>
          PAYMENT_FAILED · PAY_CANCEL_KAK
        </div>
      </Card>
      <div style={{ display: 'grid', gap: 8, width: '100%' }}>
        <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" style={{ minHeight: 44 }}>다시 시도</button>
        <button className="tm-btn tm-btn-outline tm-btn-md tm-btn-block" style={{ minHeight: 44 }}>다른 결제 수단 선택</button>
        <button className="tm-btn tm-btn-ghost tm-btn-md tm-btn-block" style={{ color: 'var(--text-muted)', minHeight: 44 }}>매치 목록으로</button>
      </div>
    </div>
  </Phone>
);

/* ---------- m14-mb-state-success — 결제 완료 (success scale + Toast) ---------- */
const M14MobileStateSuccess = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TopNav title="결제 완료" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 28px', gap: 20, textAlign: 'center' }}>
        {/* Success scale icon */}
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--green50)', display: 'grid', placeItems: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--green500)', display: 'grid', placeItems: 'center' }}>
            <Icon name="check" size={28} color="var(--static-white)" stroke={2.5} aria-hidden="true" />
          </div>
        </div>
        <div>
          <div className="tm-text-heading">결제 완료!</div>
          <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>
            강남 풋살 6vs6 참가가 확정됐어요
          </div>
        </div>
        <NumberDisplay value={17000} size={32} />
        {/* Receipt summary — global MoneyRow grammar */}
        <Card pad={16} style={{ width: '100%', textAlign: 'left' }}>
          <SectionTitle title="결제 정보" />
          <div style={{ padding: '0 4px' }}>
            {[['경기 일시', '2026.04.27 (일) 19:00'], ['경기 장소', '잠실 풋살장 A구장'], ['결제 수단', '카카오페이']].map(([k, v]) => (
              <div key={k} style={{ borderBottom: '1px solid var(--grey100)' }}>
                <MoneyRow label={k} amount={v} unit="" />
              </div>
            ))}
            <MoneyRow label="결제 금액" amount={17000} strong accent />
          </div>
        </Card>
      </div>
      {/* Toast overlay */}
      <Toast msg="결제가 완료됐어요" type="success" visible />
      <M14StickyCTA>
        <div style={{ display: 'grid', gap: 8 }}>
          <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" style={{ minHeight: 44 }}>매치 상세 보기</button>
          <button className="tm-btn tm-btn-outline tm-btn-md tm-btn-block" style={{ minHeight: 44 }}>결제 내역 보기</button>
        </div>
      </M14StickyCTA>
    </div>
  </Phone>
);

/* ---------- m14-mb-components — M14 컴포넌트 인벤토리 ---------- */
const M14MobileComponents = () => (
  <div style={{ width: M14_MB_W, height: M14_MB_H, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflowY: 'auto' }}>
    <Badge tone="blue" size="sm">m14-mb-components</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M14 모바일 · 사용 컴포넌트</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8, marginBottom: 20 }}>
      결제·환불·분쟁에서 사용하는 canonical 컴포넌트 인벤토리
    </div>
    <div style={{ display: 'grid', gap: 20 }}>

      {/* NumberDisplay — global canonical */}
      <M14ComponentRow label="NumberDisplay (global) · 결제 금액 hero — 4 size">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          <NumberDisplay value={17000} size={20} sub="sm — sticky CTA" />
          <NumberDisplay value={17000} size={24} sub="md — 결제 대기" />
          <NumberDisplay value={17000} size={28} sub="lg — 상세 hero" />
          <NumberDisplay value={17000} size={32} sub="xl — 완료 hero" />
        </div>
      </M14ComponentRow>

      {/* MoneyRow — global canonical */}
      <M14ComponentRow label="MoneyRow (global) · 영수증 행 (normal / strong / accent)">
        <div style={{ width: '100%', padding: '0 4px' }}>
          <div style={{ borderBottom: '1px solid var(--grey100)' }}>
            <MoneyRow label="참가비" amount={20000} />
          </div>
          <div style={{ borderBottom: '1px solid var(--grey100)' }}>
            <MoneyRow label="플랫폼 수수료 (5%)" amount={1000} />
          </div>
          <div style={{ borderBottom: '1px solid var(--grey100)' }}>
            <MoneyRow label="쿠폰 할인" amount={-3000} />
          </div>
          <MoneyRow label="최종 결제금액" amount={17000} strong accent />
        </div>
      </M14ComponentRow>

      {/* MoneyRow text variant */}
      <M14ComponentRow label="MoneyRow (global) · text variant (결제 수단, 날짜, 영수증번호)">
        <div style={{ width: '100%', padding: '0 4px' }}>
          <div style={{ borderBottom: '1px solid var(--grey100)' }}>
            <MoneyRow label="결제 수단" amount="카카오페이" unit="" />
          </div>
          <div style={{ borderBottom: '1px solid var(--grey100)' }}>
            <MoneyRow label="결제일" amount="2026.04.20 19:41" unit="" />
          </div>
          <MoneyRow label="영수증 번호" amount="T2604201234" unit="" />
        </div>
      </M14ComponentRow>

      {/* M14EscrowBadge */}
      <M14ComponentRow label="M14EscrowBadge · 6 status (badge + desc)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {['completed', 'escrow_held', 'refunded', 'pending', 'failed', 'auto_released'].map(s => (
            <M14EscrowBadge key={s} status={s} showDesc />
          ))}
        </div>
      </M14ComponentRow>

      {/* M14DisputeThread */}
      <M14ComponentRow label="M14DisputeThread · buyer / seller / admin bubble">
        <div style={{ width: '100%' }}>
          <M14DisputeThread messages={M14_DISPUTE_MESSAGES.slice(0, 3)} />
        </div>
      </M14ComponentRow>

      {/* AnnouncementBar — global */}
      <M14ComponentRow label="AnnouncementBar (global) · 정책 알림 배너">
        <div style={{ width: '100%' }}>
          <AnnouncementBar icon="!" text="경기 시작 32시간 전입니다. 현재는 100% 환불 가능한 구간이에요." />
        </div>
      </M14ComponentRow>

      {/* Skeleton */}
      <M14ComponentRow label="Skeleton (global) · 결제 목록 shimmer">
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton w="60%" h={14} />
          <Skeleton w="40%" h={12} />
          <Skeleton w="72px" h={20} r={9999} />
        </div>
      </M14ComponentRow>

      {/* Toast */}
      <M14ComponentRow label="Toast (global) · 결제 완료/실패 알림">
        <div style={{ position: 'relative', width: '100%', height: 64 }}>
          <Toast msg="결제가 완료됐어요" type="success" visible />
        </div>
      </M14ComponentRow>

      {/* Badge status tones */}
      <M14ComponentRow label="Badge · 결제/분쟁 상태 tone 팔레트">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <Badge tone="green" size="sm">결제 완료</Badge>
          <Badge tone="orange" size="sm">에스크로 보관중</Badge>
          <Badge tone="grey" size="sm">환불 완료</Badge>
          <Badge tone="red" size="sm">결제 실패</Badge>
          <Badge tone="blue" size="sm">분쟁 검토중</Badge>
          <Badge tone="orange" size="sm">분쟁 접수</Badge>
        </div>
      </M14ComponentRow>

      {/* SBtn */}
      <M14ComponentRow label="SBtn · 결제/환불 CTA 변형">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          <SBtn full size="lg">17,000원 결제하기</SBtn>
          <SBtn full size="lg" variant="danger">환불 신청하기</SBtn>
          <SBtn full size="md" variant="neutral">영수증 보기</SBtn>
        </div>
      </M14ComponentRow>
    </div>
  </div>
);

/* ---------- m14-mb-assets — 토큰/에셋 인벤토리 ---------- */
const M14MobileAssets = () => (
  <div style={{ width: M14_MB_W, height: M14_MB_H, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflowY: 'auto' }}>
    <Badge tone="blue" size="sm">m14-mb-assets</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M14 모바일 · 사용 토큰/에셋</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8, marginBottom: 20 }}>
      결제·환불·분쟁 화면에서 사용하는 디자인 토큰 인벤토리
    </div>
    <div style={{ display: 'grid', gap: 16 }}>
      <M14AssetRow label="Color · semantic (결제 상태 tone)">
        <M14TokenChip token="green500 — 결제 완료"      value="var(--green500)" />
        <M14TokenChip token="green50 — 완료 배경"       value="var(--green50)" />
        <M14TokenChip token="orange500 — 에스크로/대기"  value="var(--orange500)" />
        <M14TokenChip token="orange50 — 에스크로 배경"   value="var(--orange50)" />
        <M14TokenChip token="red500 — 실패/위험"        value="var(--red500)" />
        <M14TokenChip token="red50 — 실패 배경"         value="var(--red50)" />
        <M14TokenChip token="blue500 — 할인/accent"     value="var(--blue500)" />
        <M14TokenChip token="blue50 — 정보 배경"        value="var(--blue50)" />
      </M14AssetRow>
      <M14AssetRow label="Color · neutral hierarchy">
        <M14TokenChip token="grey900 — toast bg"   value="var(--grey900)" />
        <M14TokenChip token="grey700"              value="var(--grey700)" />
        <M14TokenChip token="grey200 — step off"   value="var(--grey200)" />
        <M14TokenChip token="grey100 — skeleton"   value="var(--grey100)" />
        <M14TokenChip token="grey50 — surface-muted" value="var(--grey50)" />
      </M14AssetRow>
      <M14AssetRow label="Type scale · 사용 단계 (tm-text-*)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="tm-text-heading">heading — 결제 완료/실패 타이틀</span>
          <span className="tm-text-subhead">subhead — 태블릿 nav</span>
          <span className="tm-text-body-lg">body-lg — 상품명, 합계 행</span>
          <span className="tm-text-body">body — 항목명, 설명</span>
          <span className="tm-text-label">label — 섹션 타이틀</span>
          <span className="tm-text-caption">caption — 날짜, 메타</span>
          <span className="tm-text-micro">micro — 영수증 번호, 에러 코드</span>
        </div>
      </M14AssetRow>
      <M14AssetRow label="tabular-nums — 금액 표시 필수 (tm-tabular)">
        <span className="tm-tabular tm-text-body-lg">17,000원</span>
        <span className="tm-tabular tm-text-body-lg">-3,000원</span>
        <span className="tm-tabular tm-text-body-lg">35,000원</span>
      </M14AssetRow>
      <M14AssetRow label="Spacing · 4-multiple">
        {[8, 12, 16, 20, 24, 28, 32].map((n) => (
          <Badge key={n} tone="grey" size="sm">{n}px</Badge>
        ))}
      </M14AssetRow>
      <M14AssetRow label="Radius">
        <Badge tone="grey" size="sm">r-sm (8) · 뱃지/소형</Badge>
        <Badge tone="grey" size="sm">r-md (12) · 카드/입력</Badge>
        <Badge tone="grey" size="sm">r-lg (16) · 큰 카드</Badge>
        <Badge tone="grey" size="sm">r-pill · 배지/칩</Badge>
        <Badge tone="grey" size="sm">50% · 아이콘 배경/스텝</Badge>
      </M14AssetRow>
      <M14AssetRow label="Shadow">
        <Badge tone="grey" size="sm">sh-4 · toast overlay</Badge>
        <Badge tone="grey" size="sm">hairline border · default card</Badge>
      </M14AssetRow>
      <M14AssetRow label="Icon · lucide (사용 목록)">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {['money', 'shield', 'calendar', 'ticket', 'check', 'close', 'send', 'share', 'chevR', 'chevL', 'trophy', 'pin'].map(n => (
            <div key={n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <Icon name={n} size={18} color="var(--grey600)" aria-hidden="true" />
              <span className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{n}</span>
            </div>
          ))}
        </div>
      </M14AssetRow>
      <M14AssetRow label="Motion token · 사용">
        <Badge tone="grey" size="sm">120ms · tap scale</Badge>
        <Badge tone="grey" size="sm">180ms · card / error shake</Badge>
        <Badge tone="grey" size="sm">240ms · success pop</Badge>
        <Badge tone="grey" size="sm">280ms · sheet-up / CTA enter</Badge>
        <Badge tone="grey" size="sm">ease-out-expo · sticky CTA</Badge>
        <Badge tone="grey" size="sm">ease-out-back · success icon</Badge>
      </M14AssetRow>
    </div>
  </div>
);

/* ---------- m14-tb-components — 태블릿 컴포넌트 인벤토리 ---------- */
const M14TabletComponents = () => (
  <div style={{ width: M14_TB_W, height: M14_TB_H, background: 'var(--bg)', padding: 32, fontFamily: 'var(--font)', overflowY: 'auto' }}>
    <Badge tone="blue" size="sm">m14-tb-components</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M14 태블릿 · 컴포넌트 인벤토리</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8, marginBottom: 24 }}>
      태블릿 viewport에서 사용하는 M14 컴포넌트 (모바일과 동일 grammar, 2-column)
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      {/* Left column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <M14ComponentRow label="NumberDisplay (global) · xl — 결제 완료 hero">
          <NumberDisplay value={17000} size={32} sub="결제 완료 · 강남 풋살 6vs6" />
        </M14ComponentRow>
        <M14ComponentRow label="MoneyRow (global) · 전체 receipt">
          <div style={{ width: '100%', padding: '0 4px' }}>
            {M14_CHECKOUT_ROWS.map((r, i) => (
              <div key={i} style={{ borderBottom: '1px solid var(--grey100)' }}>
                <MoneyRow label={r.label} amount={r.amount} />
              </div>
            ))}
            <MoneyRow label="최종 결제금액" amount={17000} strong accent />
          </div>
        </M14ComponentRow>
        <M14ComponentRow label="M14EscrowBadge · 가로 배치">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {['completed', 'escrow_held', 'refunded', 'pending', 'failed'].map(s => (
              <M14EscrowBadge key={s} status={s} />
            ))}
          </div>
        </M14ComponentRow>
        <M14ComponentRow label="KPIStat (global) · 결제 집계">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, width: '100%' }}>
            <KPIStat label="결제" value={12} unit="건" />
            <KPIStat label="환불" value={1} unit="건" />
            <KPIStat label="평균" value={12000} unit="원" />
          </div>
        </M14ComponentRow>
      </div>
      {/* Right column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <M14ComponentRow label="M14DisputeThread · full (4 messages)">
          <div style={{ width: '100%' }}>
            <M14DisputeThread messages={M14_DISPUTE_MESSAGES} />
          </div>
        </M14ComponentRow>
        <M14ComponentRow label="SectionTitle (global) · 주문 정보 / 환불 안내">
          <div style={{ width: '100%' }}>
            <SectionTitle title="주문 정보" />
            <SectionTitle title="환불 안내" sub="확정 전 반드시 환불 가능 시간과 수수료를 확인하세요" />
          </div>
        </M14ComponentRow>
        <M14ComponentRow label="Badge · 결제/분쟁 전체 상태">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(M14_STATUS_MAP).map(([k, v]) => (
              <Badge key={k} tone={v.tone} size="sm">{v.label}</Badge>
            ))}
            {Object.entries(M14_DISPUTE_STATUS_MAP).map(([k, v]) => (
              <Badge key={k} tone={v.tone} size="sm">{v.label}</Badge>
            ))}
          </div>
        </M14ComponentRow>
      </div>
    </div>
  </div>
);

/* ---------- m14-mb-motion — motion contract ---------- */
const M14MotionBoard = () => (
  <div style={{ width: M14_MB_W, height: M14_MB_H, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflowY: 'auto' }}>
    <Badge tone="blue" size="sm">m14-mb-motion</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M14 모바일 · motion contract</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8, marginBottom: 20 }}>
      결제·환불·분쟁에서 사용하는 motion 토큰 및 패턴
    </div>
    <div style={{ display: 'grid', gap: 0 }}>
      <M14MotionRow title="Checkout sheet enter" sub="bottom sheet 올라오기 → translateY(20px)→0 · 280ms · ease-out-expo" trailing="sheet" />
      <M14MotionRow title="Approval pulse spinner" sub="결제 승인 대기 · 0.9s linear infinite · reduced-motion → 정적 도넛" trailing="spin" />
      <M14MotionRow title="Success icon pop" sub="scale(0.6)→1 · 240ms · ease-out-back · 완료 직후" trailing="pop" />
      <M14MotionRow title="MoneyRow stagger" sub="receipt 행 순차 등장 · 40ms 단위 + fade-in-up · 120ms · ease-out-quart" trailing="stagger" />
      <M14MotionRow title="Toast slide-down" sub="translateY(-8px)→0 + fade-in · 180ms · ease-out-quart · 상단" trailing="toast" />
      <M14MotionRow title="Button tap" sub="scale(.98) · 120ms · 결제 CTA 포함 모든 버튼" trailing="tap" />
      <M14MotionRow title="Error shake" sub="translateX(±6px) 3회 · 180ms · 결제 실패 직후" trailing="shake" />
      <M14MotionRow title="Skeleton shimmer" sub="loading → 1.5s linear infinite gradient (sk-shimmer)" trailing="shimmer" />
      <M14MotionRow title="Timeline step complete" sub="background-color · 180ms · 분쟁 진행 타임라인" trailing="step" />
      <M14MotionRow title="Dispute bubble enter" sub="opacity 0→1 + translateY(6px)→0 · 160ms · 메시지 등장" trailing="bubble" />
      <M14MotionRow title="EscrowBadge pulse" sub="pending/escrow_held → badge-pulse 2s infinite · 주의 색상" trailing="pulse" />
      <M14MotionRow title="Reduced motion" sub="prefers-reduced-motion → 모든 transition 0.01ms, spinner 정적" trailing="a11y" />
    </div>
  </div>
);

Object.assign(window, {
  M14MobileMain,
  M14TabletMain,
  M14DesktopMain,
  M14MobileDetail,
  M14MobileFlowCheckout,
  M14MobileFlowRefund,
  M14MobileFlowDispute,
  M14MobileStateLoading,
  M14MobileStatePending,
  M14MobileStateError,
  M14MobileStateSuccess,
  M14MobileComponents,
  M14MobileAssets,
  M14TabletComponents,
  M14MotionBoard,
});
