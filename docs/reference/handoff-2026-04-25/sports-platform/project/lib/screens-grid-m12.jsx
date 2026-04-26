/* fix32 — M12 커뮤니티·채팅·알림 grid (canonical rewrite).
   ID schema: m12-{mb|tb|dt}-{main|detail|flow|state|components|assets|motion}[-{sub}]
   Routes: /chat, /chat/[id], /notifications, /feed
   Canonical refs: Chat (screens-other), ChatRoom (screens-other),
     Notifications (screens-other), Feed (screens-extras), ChatEmbed (screens-extras)
   Light-only. All helpers prefixed M12. */

const M12_MB_W = 375;
const M12_MB_H = 812;
const M12_TB_W = 768;
const M12_TB_H = 1024;
const M12_DT_W = 1280;
const M12_DT_H = 820;

/* ─── Local fixture data (M12 prefix) ─────────────────────── */
const M12Rooms = CHATS;  /* re-use canonical CHATS fixture from data.jsx */

const M12SystemMsgs = [
  { id: 'ms1', type: 'system', text: '2026년 4월 26일 (토)' },
  { id: 'ms7', type: 'system', text: '이재은님이 퇴장했습니다.' },
];

const M12ConvoMsgs = [
  { id: 'mc2', me: false, n: '김민수', txt: '안녕하세요! 오늘 경기 기대되네요 😊', time: '오후 5:12', av: IMG.av1 },
  { id: 'mc3', me: true,  txt: '저도요! 몇 시에 모이면 될까요?', time: '오후 5:13' },
  { id: 'mc4', me: false, n: '김민수', txt: '19시 15분 전까지 잠실 풋살장 입구에서 만나요. 주차는 B1 가능해요.', time: '오후 5:15', av: IMG.av1 },
  { id: 'mc5', me: true,  txt: '알겠습니다 👍 잠깐 늦을 수도 있는데 연락드릴게요', time: '오후 5:17' },
  { id: 'mc6', me: false, n: '박지연', txt: '저도 조금 늦을 것 같아요, 19시 5분 정도?', time: '오후 5:20', av: IMG.av2 },
  { id: 'mc8', me: false, n: '김민수', txt: '오늘 19시 잠실 풋살장에서 뵙겠습니다!', time: '오후 6:32', av: IMG.av1 },
];

const M12NotifGroups = NOTIFS
  ? [{ group: '오늘', items: NOTIFS.filter(n => n.unread) }, { group: '이전', items: NOTIFS.filter(n => !n.unread) }].filter(g => g.items.length > 0)
  : [
    {
      group: '오늘',
      items: [
        { id: 'n1', type: 'match', title: '매치 완료', body: '강남 6vs6 풋살 경기가 완료됐어요. 리뷰를 남겨보세요!', time: '방금 전', unread: true },
        { id: 'n2', type: 'chat',  title: '새 메시지', body: '김민수: 오늘 19시 잠실 풋살장에서 뵙겠습니다!', time: '6분 전', unread: true },
        { id: 'n3', type: 'team',  title: '팀 신청 수락', body: '강동 테니스 클럽에 가입이 승인됐어요.', time: '23분 전', unread: true },
      ],
    },
    {
      group: '어제',
      items: [
        { id: 'n4', type: 'review', title: 'ELO 변경', body: '이번 매치 결과로 ELO가 1,248 → 1,265로 올랐어요.', time: '어제 오후 11:20', unread: false },
        { id: 'n5', type: 'pay',   title: '결제 완료', body: '강남 6vs6 · 17,000원 결제가 완료됐어요.', time: '어제 오후 8:05', unread: false },
      ],
    },
  ];

/* ─── Embedded match card (canonical-style, for ChatRoom detail) ─── */
const M12EmbeddedMatchCard = () => (
  <div style={{
    margin: '0 16px 8px',
    padding: '12px 16px',
    borderRadius: 'var(--r-md)',
    background: 'var(--blue-alpha-08)',
    border: '1px solid var(--blue500)',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    cursor: 'pointer',
  }}
    role="button"
    aria-label="매치 상세 보기"
  >
    <div style={{
      width: 40, height: 40,
      borderRadius: 'var(--r-sm)',
      background: 'var(--blue500)',
      display: 'grid', placeItems: 'center',
      flexShrink: 0,
    }}>
      <Icon name="swords" size={20} color="var(--static-white)" />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="tm-text-label" style={{ color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        강남 풋살 6vs6
      </div>
      <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2 }}>
        오늘 19:00 · 잠실 풋살장
      </div>
    </div>
    <Badge tone="blue" size="sm">D-0</Badge>
  </div>
);

/* ─── Chat message bubble row (canonical bubble grammar) ─── */
const M12Bubble = ({ msg }) => {
  if (msg.type === 'system' || msg.text === undefined && !msg.txt) {
    const text = msg.text || msg.txt || '';
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 20px' }}>
        <span className="tm-text-micro" style={{
          color: 'var(--text-caption)',
          background: 'var(--grey100)',
          padding: '4px 12px',
          borderRadius: 'var(--r-pill)',
        }}>
          {text}
        </span>
      </div>
    );
  }
  const isMe = msg.me !== undefined ? msg.me : msg.type === 'own';
  const text = msg.txt || msg.text || '';
  const sender = msg.n || msg.sender || '';
  const av = msg.av || msg.avatar || 'var(--grey300)';
  const time = msg.time || '';

  if (isMe) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '3px 20px', gap: 6, alignItems: 'flex-end' }}>
        <div className="tm-text-micro" style={{ color: 'var(--text-caption)', flexShrink: 0, paddingBottom: 2 }}>{time}</div>
        <div style={{
          maxWidth: 240,
          background: 'var(--blue500)',
          color: 'var(--static-white)',
          borderRadius: '16px 4px 16px 16px',
          padding: '10px 14px',
          fontSize: 'var(--fs-body)',
          lineHeight: 'var(--lh-body)',
          wordBreak: 'keep-all',
          overflowWrap: 'break-word',
        }}>
          {text}
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', padding: '3px 20px', gap: 8, alignItems: 'flex-end' }}>
      <div style={{
        width: 32, height: 32,
        borderRadius: '50%',
        background: typeof av === 'string' && av.startsWith('url') ? av : `var(--grey200) ${typeof av === 'string' && av.startsWith('url') ? av : ''} center/cover`,
        backgroundImage: typeof av === 'string' && av.startsWith('url') ? av : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        flexShrink: 0,
      }} aria-hidden="true" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 240 }}>
        <div className="tm-text-micro" style={{ color: 'var(--text-caption)', paddingLeft: 4 }}>{sender}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
          <div style={{
            background: 'var(--grey100)',
            color: 'var(--text-strong)',
            borderRadius: '4px 16px 16px 16px',
            padding: '10px 14px',
            fontSize: 'var(--fs-body)',
            lineHeight: 'var(--lh-body)',
            wordBreak: 'keep-all',
            overflowWrap: 'break-word',
          }}>
            {text}
          </div>
          <div className="tm-text-micro" style={{ color: 'var(--text-caption)', flexShrink: 0, paddingBottom: 2 }}>{time}</div>
        </div>
      </div>
    </div>
  );
};

/* ─── Notification row (grouped, canonical Notifications vocabulary) ─── */
const M12NotifRow = ({ item }) => {
  const iconMap = { match: 'swords', team: 'people', pay: 'money', chat: 'chat', review: 'star' };
  const toneMap = { match: { bg: 'var(--blue50)', fg: 'var(--blue500)' }, team: { bg: 'var(--orange50)', fg: 'var(--orange500)' }, pay: { bg: 'var(--green50)', fg: 'var(--green500)' }, chat: { bg: 'var(--grey100)', fg: 'var(--grey600)' }, review: { bg: 'var(--grey100)', fg: 'var(--grey600)' } };
  const t = toneMap[item.type] || toneMap.chat;
  return (
    <div className="tm-pressable" style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '14px 20px',
      background: item.unread ? 'var(--blue-alpha-08)' : 'transparent',
      borderBottom: '1px solid var(--border)',
      cursor: 'pointer',
      minHeight: 44,
    }}>
      <div style={{
        width: 40, height: 40,
        borderRadius: 'var(--r-md)',
        background: t.bg,
        display: 'grid', placeItems: 'center',
        flexShrink: 0,
      }}>
        <Icon name={iconMap[item.type] || 'bell'} size={18} color={t.fg} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{item.title}</span>
          <span className="tm-text-micro" style={{ color: 'var(--text-caption)', flexShrink: 0 }}>{item.time}</span>
        </div>
        <div className="tm-text-caption" style={{ marginTop: 2, color: 'var(--text-muted)', wordBreak: 'keep-all', lineHeight: 1.5 }}>{item.body}</div>
      </div>
      {item.unread && (
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--blue500)', flexShrink: 0, marginTop: 6 }} aria-hidden="true" />
      )}
    </div>
  );
};

/* ─── Unread badge (canonical tab-bar / list usage) ─── */
const M12UnreadBadge = ({ count }) => {
  if (!count) return null;
  return (
    <div className="tab-num" style={{
      minWidth: 20, height: 20,
      padding: '0 6px',
      borderRadius: 'var(--r-pill)',
      background: 'var(--blue500)',
      color: 'var(--static-white)',
      fontSize: 'var(--fs-micro)',
      fontWeight: 700,
      display: 'grid', placeItems: 'center',
      flexShrink: 0,
    }}>
      {count > 99 ? '99+' : count}
    </div>
  );
};

/* ─── Message input bar (canonical ChatRoom grammar) ─── */
const M12InputBar = ({ sending }) => (
  <div style={{
    padding: '8px 16px 24px',
    background: 'var(--bg)',
    backdropFilter: 'blur(12px)',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'flex-end',
    gap: 8,
  }}>
    <button
      className="tm-btn-icon tm-pressable"
      aria-label="첨부"
      style={{ width: 40, height: 40, borderRadius: 14, background: 'var(--grey100)', flexShrink: 0, border: 'none', display: 'grid', placeItems: 'center' }}
    >
      <Icon name="plus" size={18} color="var(--grey600)" />
    </button>
    <div className="tm-input" style={{
      flex: 1,
      minHeight: 44,
      padding: '10px 14px',
      background: 'var(--grey100)',
      borderRadius: 22,
      fontSize: 'var(--fs-body)',
      color: sending ? 'var(--text-caption)' : 'var(--text-placeholder)',
      display: 'flex', alignItems: 'center',
      border: 'none',
    }}>
      {sending ? '전송 중...' : '메시지 입력'}
    </div>
    <button
      className="tm-btn-icon tm-pressable"
      aria-label="전송"
      style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--blue500)', flexShrink: 0, border: 'none', display: 'grid', placeItems: 'center' }}
    >
      <Icon name="send" size={18} color="var(--static-white)" />
    </button>
  </div>
);

/* ─────────────────────────────────────────────────────────────
   m12-mb-main : 채팅 목록 — canonical Chat
   ──────────────────────────────────────────────────────────── */
const M12MobileMain = () => <Chat />;

/* ─────────────────────────────────────────────────────────────
   m12-tb-main : 태블릿 · 채팅 split-view (canonical Chat + ChatRoom)
   ──────────────────────────────────────────────────────────── */
const M12TabletMain = () => (
  <div style={{ width: M12_TB_W, height: M12_TB_H, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div className="tm-text-subhead" style={{ color: 'var(--text-strong)', fontWeight: 800 }}>채팅</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="tm-btn tm-btn-ghost tm-btn-icon tm-pressable" aria-label="채팅방 검색" style={{ width: 40, height: 40 }}>
          <Icon name="search" size={20} color="var(--grey800)" />
        </button>
        <button className="tm-btn tm-btn-primary tm-btn-sm tm-pressable" style={{ height: 36, padding: '0 16px', borderRadius: 'var(--r-pill)', fontWeight: 700 }}>
          <Icon name="edit" size={16} /> 새 채팅
        </button>
      </div>
    </div>
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '300px 1fr', overflow: 'hidden' }}>
      {/* left — room list */}
      <div style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '8px 16px' }}>
          <div className="tm-input" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-placeholder)', cursor: 'text', borderRadius: 'var(--r-md)' }}>
            <Icon name="search" size={14} color="var(--text-placeholder)" />
            <span className="tm-text-caption">검색</span>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {CHATS.map(c => (
            <button key={c.id} className="tm-list-row tm-pressable" style={{ width: '100%', textAlign: 'left', borderBottom: '1px solid var(--border)', background: c === CHATS[0] ? 'var(--blue-alpha-08)' : 'transparent', padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', minHeight: 44 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: `var(--grey100) url(${c.avatar}) center/cover` }} />
                {c.group && (
                  <div style={{ position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, background: 'var(--grey900)', color: 'var(--static-white)', fontSize: 'var(--fs-micro)', fontWeight: 700, display: 'grid', placeItems: 'center', border: '2px solid var(--bg)' }}>
                    {c.members}
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{c.name}</span>
                  <span className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>{c.time}</span>
                </div>
                <div className="tm-text-caption" style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.last}</div>
              </div>
              {c.unread > 0 && <M12UnreadBadge count={c.unread} />}
            </button>
          ))}
        </div>
      </div>
      {/* right — message thread */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `var(--grey100) url(${CHATS[0].avatar}) center/cover`, flexShrink: 0 }} />
          <div>
            <div className="tm-text-body-lg" style={{ fontWeight: 700 }}>{CHATS[0].name}</div>
            <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>참가자 {CHATS[0].members}명</div>
          </div>
          <button className="tm-btn-icon tm-pressable" aria-label="참가자 보기" style={{ marginLeft: 'auto', width: 36, height: 36, border: 'none', background: 'transparent', display: 'grid', placeItems: 'center' }}>
            <Icon name="people" size={18} color="var(--text-strong)" />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <M12Bubble msg={M12SystemMsgs[0]} />
          {M12ConvoMsgs.map(m => <M12Bubble key={m.id} msg={m} />)}
        </div>
        <M12InputBar sending={false} />
      </div>
    </div>
  </div>
);

/* ─────────────────────────────────────────────────────────────
   m12-dt-main : 데스크탑 3-col (nav + rooms + thread)
   ──────────────────────────────────────────────────────────── */
const M12DesktopMain = () => (
  <div style={{ width: M12_DT_W, height: M12_DT_H, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'grid', gridTemplateColumns: '220px 300px 1fr', overflow: 'hidden' }}>
    {/* left nav */}
    <aside style={{ borderRight: '1px solid var(--border)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 'var(--fs-label)' }}>T</div>
        <span className="tm-text-body-lg" style={{ fontWeight: 700 }}>Teameet</span>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[['홈', false], ['매치', false], ['팀', false], ['채팅', true], ['마이', false]].map(([label, active]) => (
          <button key={label} className={`tm-btn tm-btn-md tm-pressable ${active ? 'tm-btn-secondary' : 'tm-btn-ghost'}`} style={{ justifyContent: 'flex-start', textAlign: 'left', minHeight: 44, fontWeight: active ? 700 : 500 }}>
            {label}
          </button>
        ))}
      </nav>
    </aside>
    {/* room list */}
    <div style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="tm-text-body-lg" style={{ fontWeight: 700 }}>채팅</span>
        <button className="tm-btn-icon tm-pressable" aria-label="새 채팅" style={{ width: 36, height: 36, border: 'none', background: 'transparent', display: 'grid', placeItems: 'center' }}>
          <Icon name="edit" size={18} color="var(--text-strong)" />
        </button>
      </div>
      <div style={{ padding: '8px 16px' }}>
        <div className="tm-input" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-placeholder)', cursor: 'text', borderRadius: 'var(--r-md)' }}>
          <Icon name="search" size={14} color="var(--text-placeholder)" />
          <span className="tm-text-caption">검색</span>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {CHATS.map(c => (
          <button key={c.id} className="tm-list-row tm-pressable" style={{ width: '100%', textAlign: 'left', borderBottom: '1px solid var(--border)', background: c === CHATS[0] ? 'var(--blue-alpha-08)' : 'transparent', padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', minHeight: 44 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: `var(--grey100) url(${c.avatar}) center/cover`, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{c.name}</span>
                <span className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>{c.time}</span>
              </div>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.last}</div>
            </div>
            {c.unread > 0 && <M12UnreadBadge count={c.unread} />}
          </button>
        ))}
      </div>
    </div>
    {/* thread */}
    <main style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `var(--grey100) url(${CHATS[0].avatar}) center/cover`, flexShrink: 0 }} />
        <div>
          <div className="tm-text-body-lg" style={{ fontWeight: 700 }}>{CHATS[0].name}</div>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>참가자 {CHATS[0].members}명</div>
        </div>
        <button className="tm-btn-icon tm-pressable" aria-label="참가자 목록" style={{ marginLeft: 'auto', width: 36, height: 36, border: 'none', background: 'transparent', display: 'grid', placeItems: 'center' }}>
          <Icon name="people" size={18} color="var(--text-strong)" />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <M12Bubble msg={M12SystemMsgs[0]} />
        {M12ConvoMsgs.map(m => <M12Bubble key={m.id} msg={m} />)}
      </div>
      <div style={{ padding: '8px 24px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <button className="tm-btn-icon tm-pressable" aria-label="첨부" style={{ width: 40, height: 40, borderRadius: 14, background: 'var(--grey100)', border: 'none', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon name="plus" size={16} color="var(--grey600)" />
        </button>
        <div className="tm-input" style={{ flex: 1, minHeight: 44, padding: '10px 14px', background: 'var(--grey100)', borderRadius: 22, fontSize: 'var(--fs-body)', color: 'var(--text-placeholder)', display: 'flex', alignItems: 'center' }}>
          메시지 입력
        </div>
        <button className="tm-btn-icon tm-pressable" aria-label="전송" style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--blue500)', border: 'none', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon name="send" size={16} color="var(--static-white)" />
        </button>
      </div>
    </main>
  </div>
);

/* ─────────────────────────────────────────────────────────────
   m12-mb-detail : 채팅방 상세 — canonical ChatRoom + embedded card
   ──────────────────────────────────────────────────────────── */
const M12MobileDetail = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <AppBar
        title={CHATS[0].name}
        leading={
          <button className="tm-btn tm-btn-ghost tm-btn-icon tm-pressable" aria-label="뒤로" style={{ width: 44, height: 44 }}>
            <Icon name="chevL" size={24} color="var(--grey800)" />
          </button>
        }
        trailing={
          <button className="tm-btn-icon tm-pressable" aria-label="참가자 보기" style={{ width: 44, height: 44, border: 'none', background: 'transparent', display: 'grid', placeItems: 'center' }}>
            <Icon name="people" size={20} color="var(--grey800)" />
          </button>
        }
      />
      <div className="tm-text-micro" style={{ textAlign: 'center', padding: '4px 0', color: 'var(--text-caption)' }}>
        참가자 {CHATS[0].members}명
      </div>
      {/* embedded match card */}
      <M12EmbeddedMatchCard />
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--grey50)', padding: '8px 0 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <M12Bubble msg={M12SystemMsgs[0]} />
        {M12ConvoMsgs.map(m => <M12Bubble key={m.id} msg={m} />)}
      </div>
      <M12InputBar sending={false} />
    </div>
  </Phone>
);

/* ─────────────────────────────────────────────────────────────
   m12-mb-flow-feed : 활동 피드 — canonical Feed
   ──────────────────────────────────────────────────────────── */
const M12MobileFlowFeed = () => <Feed />;

/* ─────────────────────────────────────────────────────────────
   m12-mb-flow-notif : 알림 그루핑 — canonical Notifications + groups
   ──────────────────────────────────────────────────────────── */
const M12MobileFlowNotif = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <AppBar
        title="알림"
        trailing={
          <button className="tm-btn tm-btn-ghost tm-btn-sm tm-pressable" style={{ color: 'var(--blue500)', fontWeight: 700, minHeight: 44, padding: '0 12px' }}>
            모두 읽음
          </button>
        }
      />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {M12NotifGroups.map(group => (
          <div key={group.group}>
            <SectionTitle title={group.group} style={{ padding: '12px 20px 4px' }} />
            {group.items.map(item => <M12NotifRow key={item.id} item={item} />)}
          </div>
        ))}
      </div>
      <TabBar active="my" />
    </div>
  </Phone>
);

/* ─────────────────────────────────────────────────────────────
   State variants — chat-list wireframe base
   ──────────────────────────────────────────────────────────── */

/* m12-mb-state-loading */
const M12MobileStateLoading = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <AppBar title="채팅" />
      <div style={{ padding: '8px 16px' }}>
        <Skeleton style={{ height: 40, borderRadius: 'var(--r-md)' }} />
      </div>
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className="skeleton-shimmer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
          <Skeleton style={{ width: 48, height: 48, borderRadius: 14, flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton style={{ height: 14, width: '55%', borderRadius: 4 }} />
            <Skeleton style={{ height: 12, width: '80%', borderRadius: 4 }} />
          </div>
          <Skeleton style={{ width: 32, height: 12, borderRadius: 4 }} />
        </div>
      ))}
    </div>
  </Phone>
);

/* m12-mb-state-empty */
const M12MobileStateEmpty = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <AppBar title="채팅" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12, textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64,
          borderRadius: 20,
          background: 'var(--grey100)',
          display: 'grid', placeItems: 'center',
        }}>
          <Icon name="chat" size={28} color="var(--grey400)" />
        </div>
        <div className="tm-text-heading" style={{ color: 'var(--text-strong)' }}>아직 채팅방이 없어요</div>
        <div className="tm-text-body" style={{ color: 'var(--text-muted)', wordBreak: 'keep-all', lineHeight: 1.6 }}>
          매치에 참가하거나 팀에 가입하면<br />채팅방이 생겨요
        </div>
        <div style={{ display: 'grid', gap: 8, marginTop: 12, width: '100%' }}>
          <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block tm-pressable" style={{ minHeight: 52, borderRadius: 'var(--r-md)', fontWeight: 700 }}>
            매치 찾기
          </button>
          <button className="tm-btn tm-btn-outline tm-btn-md tm-btn-block tm-pressable" style={{ minHeight: 48, borderRadius: 'var(--r-md)' }}>
            팀 찾기
          </button>
        </div>
      </div>
      <TabBar active="chat" />
    </div>
  </Phone>
);

/* m12-mb-state-error — message failure canonical pattern */
const M12MobileStateError = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <AppBar
        title={CHATS[0].name}
        leading={
          <button className="tm-btn-icon tm-pressable" aria-label="뒤로" style={{ width: 44, height: 44, border: 'none', background: 'transparent', display: 'grid', placeItems: 'center' }}>
            <Icon name="chevL" size={24} color="var(--grey800)" />
          </button>
        }
      />
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--grey50)', padding: '8px 0 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <M12Bubble msg={M12SystemMsgs[0]} />
        {M12ConvoMsgs.slice(0, 4).map(m => <M12Bubble key={m.id} msg={m} />)}
        {/* failed bubble */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '3px 20px', gap: 6, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="alert" size={12} color="var(--red500)" />
              <span className="tm-text-micro" style={{ color: 'var(--red500)', fontWeight: 600 }}>전송 실패</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="tm-pressable" style={{ background: 'transparent', border: 'none', padding: 0 }}>
                <span className="tm-text-micro" style={{ color: 'var(--blue500)', fontWeight: 700 }}>재시도</span>
              </button>
              <span className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>|</span>
              <button className="tm-pressable" style={{ background: 'transparent', border: 'none', padding: 0 }}>
                <span className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>취소</span>
              </button>
            </div>
          </div>
          <div style={{
            maxWidth: 240,
            background: 'var(--blue200)',
            color: 'var(--static-white)',
            borderRadius: '16px 4px 16px 16px',
            padding: '10px 14px',
            fontSize: 'var(--fs-body)',
            lineHeight: 'var(--lh-body)',
            opacity: 0.72,
          }}>
            입금 확인되면 알려주세요.
          </div>
        </div>
      </div>
      <Toast type="error" msg="메시지를 보내지 못했어요. 연결 후 다시 시도하세요." />
      <M12InputBar sending={false} />
    </div>
  </Phone>
);

/* m12-mb-state-pending — sending in-progress */
const M12MobileStatePending = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <AppBar
        title={CHATS[0].name}
        leading={
          <button className="tm-btn-icon tm-pressable" aria-label="뒤로" style={{ width: 44, height: 44, border: 'none', background: 'transparent', display: 'grid', placeItems: 'center' }}>
            <Icon name="chevL" size={24} color="var(--grey800)" />
          </button>
        }
      />
      <div className="tm-text-micro" style={{ textAlign: 'center', padding: '4px 0', color: 'var(--text-caption)' }}>
        참가자 {CHATS[0].members}명
      </div>
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--grey50)', padding: '8px 0 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <M12Bubble msg={M12SystemMsgs[0]} />
        {M12ConvoMsgs.map(m => <M12Bubble key={m.id} msg={m} />)}
        {/* pending bubble */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '3px 20px', gap: 6, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>전송 중</div>
            <div style={{
              width: 12, height: 12,
              borderRadius: '50%',
              border: '2px solid var(--grey300)',
              borderTopColor: 'var(--blue500)',
              animation: 'tm-spin 0.8s linear infinite',
            }} aria-hidden="true" />
          </div>
          <div style={{
            maxWidth: 240,
            background: 'var(--blue200)',
            color: 'var(--static-white)',
            borderRadius: '16px 4px 16px 16px',
            padding: '10px 14px',
            fontSize: 'var(--fs-body)',
            lineHeight: 'var(--lh-body)',
            opacity: 0.72,
          }}>
            좀 있다 뵐게요!
          </div>
        </div>
      </div>
      <M12InputBar sending />
    </div>
  </Phone>
);

/* ─────────────────────────────────────────────────────────────
   m12-{mb|tb}-components : 컴포넌트 인벤토리
   ──────────────────────────────────────────────────────────── */
const M12ComponentsBoard = ({ viewport = 'mb' }) => {
  const w = viewport === 'mb' ? M12_MB_W : viewport === 'tb' ? M12_TB_W : M12_DT_W;
  const h = viewport === 'mb' ? M12_MB_H : viewport === 'tb' ? M12_TB_H : M12_DT_H;
  return (
    <div style={{ width: w, height: h, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflow: 'hidden' }}>
      <Badge tone="blue" size="sm">{`m12-${viewport}-components`}</Badge>
      <SectionTitle title="M12 · 사용 컴포넌트" sub="커뮤니티·채팅·알림 화면 primitives 인벤토리" style={{ marginTop: 8 }} />
      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>

        {/* ChatBubble own / other / system */}
        <div style={{ padding: 12, background: 'var(--grey50)', borderRadius: 'var(--r-md)' }}>
          <div className="tm-text-label" style={{ marginBottom: 8, color: 'var(--text-muted)' }}>M12Bubble · own / other / system</div>
          <M12Bubble msg={{ id: 'ds', type: 'system', text: '2026년 4월 26일 (토)' }} />
          <M12Bubble msg={{ id: 'do', me: false, n: '김민수', txt: '오늘 경기 기대되네요!', time: '오후 5:12', av: IMG.av1 }} />
          <M12Bubble msg={{ id: 'dm', me: true, txt: '저도요 😊', time: '오후 5:13' }} />
        </div>

        {/* Chat list row */}
        <div style={{ padding: 12, background: 'var(--grey50)', borderRadius: 'var(--r-md)' }}>
          <div className="tm-text-label" style={{ marginBottom: 4, color: 'var(--text-muted)' }}>Chat list row · unread / read</div>
          <button className="tm-list-row tm-pressable" style={{ width: '100%', borderBottom: '1px solid var(--border)', background: 'var(--blue-alpha-08)', padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', minHeight: 44 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: `var(--grey100) url(${CHATS[0].avatar}) center/cover`, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{CHATS[0].name}</span>
                <span className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>{CHATS[0].time}</span>
              </div>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{CHATS[0].last}</div>
            </div>
            <M12UnreadBadge count={CHATS[0].unread} />
          </button>
        </div>

        {/* M12UnreadBadge scale */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: 'var(--grey50)', borderRadius: 'var(--r-md)' }}>
          <span className="tm-text-label" style={{ color: 'var(--text-muted)', marginRight: 4 }}>M12UnreadBadge</span>
          {[1, 12, 99, 120].map(n => <M12UnreadBadge key={n} count={n} />)}
        </div>

        {/* M12NotifRow */}
        <div style={{ padding: 12, background: 'var(--grey50)', borderRadius: 'var(--r-md)' }}>
          <div className="tm-text-label" style={{ marginBottom: 4, color: 'var(--text-muted)' }}>M12NotifRow · unread / read</div>
          <M12NotifRow item={M12NotifGroups[0].items[0]} />
          <M12NotifRow item={M12NotifGroups[1] ? M12NotifGroups[1].items[0] : M12NotifGroups[0].items[2]} />
        </div>

        {/* M12EmbeddedMatchCard */}
        <div style={{ padding: 12, background: 'var(--grey50)', borderRadius: 'var(--r-md)' }}>
          <div className="tm-text-label" style={{ marginBottom: 8, color: 'var(--text-muted)' }}>M12EmbeddedMatchCard · 매치방 헤더 카드</div>
          <M12EmbeddedMatchCard />
        </div>

        {/* M12InputBar */}
        <div style={{ padding: 12, background: 'var(--grey50)', borderRadius: 'var(--r-md)' }}>
          <div className="tm-text-label" style={{ marginBottom: 8, color: 'var(--text-muted)' }}>M12InputBar · idle / sending</div>
          <M12InputBar sending={false} />
          <div style={{ marginTop: 4 }}><M12InputBar sending /></div>
        </div>

      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────
   m12-tb-components
   ──────────────────────────────────────────────────────────── */
const M12TabletComponents = () => <M12ComponentsBoard viewport="tb" />;

/* ─────────────────────────────────────────────────────────────
   m12-mb-assets : 토큰 인벤토리
   ──────────────────────────────────────────────────────────── */
const M12AssetsBoard = ({ viewport = 'mb' }) => {
  const w = viewport === 'mb' ? M12_MB_W : viewport === 'tb' ? M12_TB_W : M12_DT_W;
  const h = viewport === 'mb' ? M12_MB_H : viewport === 'tb' ? M12_TB_H : M12_DT_H;
  return (
    <div style={{ width: w, height: h, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflow: 'hidden' }}>
      <Badge tone="blue" size="sm">{`m12-${viewport}-assets`}</Badge>
      <SectionTitle title="M12 · 사용 토큰 / 에셋" sub="커뮤니티·채팅·알림 디자인 토큰 인벤토리" style={{ marginTop: 8 }} />
      <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>

        {/* Color */}
        <div style={{ padding: 12, background: 'var(--grey50)', borderRadius: 'var(--r-md)' }}>
          <div className="tm-text-label" style={{ marginBottom: 8, color: 'var(--text-muted)' }}>Color · M12 사용 색상</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { token: 'blue500', v: 'var(--blue500)' },
              { token: 'blue50', v: 'var(--blue50)' },
              { token: 'blue-alpha-08', v: 'var(--blue-alpha-08)' },
              { token: 'grey50', v: 'var(--grey50)' },
              { token: 'grey100', v: 'var(--grey100)' },
              { token: 'green500', v: 'var(--green500)' },
              { token: 'orange500', v: 'var(--orange500)' },
              { token: 'red500', v: 'var(--red500)' },
            ].map(c => (
              <div key={c.token} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: c.v, border: '1px solid var(--border)' }} aria-hidden="true" />
                <span className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>{c.token}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Type scale */}
        <div style={{ padding: 12, background: 'var(--grey50)', borderRadius: 'var(--r-md)' }}>
          <div className="tm-text-label" style={{ marginBottom: 8, color: 'var(--text-muted)' }}>Type · 사용 단계</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {['heading', 'body-lg', 'body', 'label', 'caption', 'micro'].map(t => (
              <span key={t} className={`tm-text-${t}`}>{t}</span>
            ))}
          </div>
        </div>

        {/* Spacing */}
        <div style={{ padding: 12, background: 'var(--grey50)', borderRadius: 'var(--r-md)' }}>
          <div className="tm-text-label" style={{ marginBottom: 8, color: 'var(--text-muted)' }}>Spacing · 4-multiple</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[4, 8, 12, 16, 20, 24, 32, 40].map(n => (
              <Badge key={n} tone="grey" size="sm">{n}px</Badge>
            ))}
          </div>
        </div>

        {/* Radius */}
        <div style={{ padding: 12, background: 'var(--grey50)', borderRadius: 'var(--r-md)' }}>
          <div className="tm-text-label" style={{ marginBottom: 8, color: 'var(--text-muted)' }}>Radius · used</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { label: 'r-sm · 8', r: 'var(--r-sm)' },
              { label: 'r-md · 12', r: 'var(--r-md)' },
              { label: 'r-lg · 16', r: 'var(--r-lg)' },
              { label: 'r-pill', r: 'var(--r-pill)' },
              { label: '22px · bubble', r: 22 },
            ].map(rx => (
              <div key={rx.label} style={{ padding: '8px 12px', borderRadius: rx.r, background: 'var(--blue50)', border: '1px solid var(--blue500)' }}>
                <span className="tm-text-micro" style={{ color: 'var(--blue500)' }}>{rx.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Icons */}
        <div style={{ padding: 12, background: 'var(--grey50)', borderRadius: 'var(--r-md)' }}>
          <div className="tm-text-label" style={{ marginBottom: 8, color: 'var(--text-muted)' }}>Icon · used</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {['chat', 'send', 'plus', 'bell', 'chevL', 'menu', 'people', 'search', 'edit', 'swords', 'star', 'money', 'alert'].map(name => (
              <div key={name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <Icon name={name} size={20} color="var(--grey700)" />
                <span className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>{name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Motion tokens */}
        <div style={{ padding: 12, background: 'var(--grey50)', borderRadius: 'var(--r-md)' }}>
          <div className="tm-text-label" style={{ marginBottom: 8, color: 'var(--text-muted)' }}>Motion token</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['dur-fast 120ms', 'dur-base 180ms', 'dur-slow 280ms', 'ease-out-quart', 'badge-pulse 400ms'].map(t => (
              <Badge key={t} tone="grey" size="sm">{t}</Badge>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────
   m12-mb-motion
   ──────────────────────────────────────────────────────────── */
const M12MotionBoard = () => (
  <div style={{ width: M12_MB_W, height: M12_MB_H, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflow: 'hidden' }}>
    <Badge tone="blue" size="sm">m12-mb-motion</Badge>
    <SectionTitle title="M12 · motion contract" sub="커뮤니티·채팅·알림 micro-interaction 가이드" style={{ marginTop: 8 }} />
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 16 }}>
      {[
        { icon: 'chat',   title: 'Room row tap',         copy: 'ChatRoomCard → scale(0.98) · 120ms · ease-out-quart',             timing: '120ms' },
        { icon: 'send',   title: 'Message send (own)',   copy: '버블 scale-in(0.92→1) + opacity(0→1) · 150ms · ease-out-quint',  timing: '150ms' },
        { icon: 'people', title: 'Bubble appear (other)',copy: 'translateX(-8px)→0 + opacity(0→1) · 180ms · ease-out-quart',      timing: '180ms' },
        { icon: 'bell',   title: 'Notification row',     copy: 'unread row fade-in + stagger 40ms',                               timing: '180ms' },
        { icon: 'star',   title: 'Feed item stagger',    copy: 'FeedItem 등장 → 0.05s 단위 fade-in-up',                          timing: '50ms/item' },
        { icon: 'send',   title: 'Input bar reveal',     copy: '키보드 올라올 때 translateY(0) · 200ms · ease-out-expo',          timing: '200ms' },
        { icon: 'alert',  title: 'Message failure',      copy: '실패 뱃지 scale-in · 적색 테두리 200ms',                         timing: '200ms' },
        { icon: 'chat',   title: 'Unread badge pulse',   copy: '새 메시지 수신 → badge-pulse 400ms × 2회',                       timing: '400ms' },
        { icon: 'check',  title: 'Skeleton shimmer',     copy: 'loading state → 1.5s linear infinite gradient sweep',            timing: '1.5s' },
        { icon: 'close',  title: 'Reduced motion',       copy: 'prefers-reduced-motion → transition 0.01ms, scale 제거',          timing: 'a11y' },
      ].map(({ icon, title, copy, timing }) => (
        <div key={title} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--blue50)', display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 2 }}>
            <Icon name={icon} size={16} color="var(--blue500)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{title}</div>
            <div className="tm-text-caption" style={{ marginTop: 2, color: 'var(--text-muted)', wordBreak: 'keep-all', lineHeight: 1.5 }}>{copy}</div>
          </div>
          <Badge tone="grey" size="sm">{timing}</Badge>
        </div>
      ))}
    </div>
  </div>
);

/* ─────────────────────────────────────────────────────────────
   Window mount (preserve all 14 exports)
   ──────────────────────────────────────────────────────────── */
Object.assign(window, {
  M12MobileMain,
  M12TabletMain,
  M12DesktopMain,
  M12MobileDetail,
  M12MobileFlowFeed,
  M12MobileFlowNotif,
  M12MobileStateLoading,
  M12MobileStateEmpty,
  M12MobileStateError,
  M12MobileStatePending,
  M12ComponentsBoard,
  M12AssetsBoard,
  M12TabletComponents,
  M12MotionBoard,
});
