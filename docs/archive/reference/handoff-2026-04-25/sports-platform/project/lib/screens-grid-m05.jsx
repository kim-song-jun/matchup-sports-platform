/* fix32 — M05 레슨 Academy 풀 grid.
   ID schema: m05-{mb|tb|dt}-{main|detail|create|flow|state|components|assets|motion}[-{sub}]
   Light-only. References tokens.jsx + signatures.jsx.
   Canonical: LessonAcademyHub (screens-v2main2), LessonsListV2 (screens-v2main2),
               LessonPass, LessonPassBuy (screens-deep),
               LessonCard, LessonsList (screens-team). */

const M05_MB_W = 375;
const M05_MB_H = 812;
const M05_TB_W = 768;
const M05_TB_H = 1024;
const M05_DT_W = 1280;
const M05_DT_H = 820;

/* ---------- M05 shared data fixtures ---------- */
const M05_SPORT_CHIPS = [
  { id: 'all',        label: '전체',    color: 'var(--blue500)' },
  { id: 'futsal',     label: '풋살',    color: 'var(--blue500)' },
  { id: 'basketball', label: '농구',    color: 'var(--orange500)' },
  { id: 'badminton',  label: '배드민턴', color: 'var(--green500)' },
  { id: 'tennis',     label: '테니스',  color: 'var(--purple500)' },
  { id: 'icehockey',  label: '하키',    color: 'var(--teal500)' },
];

const M05_LESSON_TYPES = [
  { id: 'group',    label: '그룹레슨' },
  { id: 'practice', label: '연습경기' },
  { id: 'free',     label: '자유연습' },
  { id: 'clinic',   label: '클리닉' },
];

const M05_LESSONS_DATA = [
  {
    sport: '풋살', tone: 'var(--blue500)', type: '그룹레슨',
    title: '풋살 입문 그룹레슨 A반',
    coach: '김민준 코치', rating: 4.9, reviewCount: 42,
    schedule: '매주 화·목 19:00', venue: '강남 실내 풋살장',
    price: 120000, seats: 3, maxSeats: 10,
  },
  {
    sport: '배드민턴', tone: 'var(--green500)', type: '클리닉',
    title: '배드민턴 스매시 집중 클리닉',
    coach: '이수진 코치', rating: 4.8, reviewCount: 28,
    schedule: '토 10:00 · 1회',   venue: '서초 배드민턴 센터',
    price: 45000, seats: 6, maxSeats: 8,
  },
  {
    sport: '농구', tone: 'var(--orange500)', type: '연습경기',
    title: '농구 3vs3 연습경기반',
    coach: '박지훈 코치', rating: 4.7, reviewCount: 17,
    schedule: '매주 일 14:00',    venue: '광교 농구 코트',
    price: 30000, seats: 0, maxSeats: 12,
  },
];

const M05_TICKET_TYPES = [
  { id: 'single',  label: '1회권',  price: 45000, desc: '원하는 날 1회 수강' },
  { id: 'multi',   label: '10회권', price: 380000, desc: '10% 할인 · 6개월 유효' },
  { id: 'period',  label: '월정액', price: 120000, desc: '한 달 무제한 수강' },
];

const M05_ATTENDANCE = [
  { name: '이지원', date: '4/22', present: true  },
  { name: '김태현', date: '4/22', present: true  },
  { name: '박소연', date: '4/22', present: false },
  { name: '최민수', date: '4/22', present: true  },
  { name: '정하늘', date: '4/22', present: false },
];

const M05_SCHEDULE = [
  { day: '월', times: [] },
  { day: '화', times: ['19:00~20:30'] },
  { day: '수', times: [] },
  { day: '목', times: ['19:00~20:30'] },
  { day: '금', times: [] },
  { day: '토', times: ['10:00~12:00', '14:00~16:00'] },
  { day: '일', times: [] },
];

/* ---------- M05 local atoms (prefix M05 for babel single-scope safety) ---------- */

const M05ComponentSwatch = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 12, background: 'var(--grey50)', border: '1px solid var(--grey100)' }}>
    <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</div>
  </div>
);

const M05AssetSwatch = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>{children}</div>
  </div>
);

const M05ColorSwatch = ({ token, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
    <div style={{ width: 36, height: 36, borderRadius: 8, background: value, border: '1px solid var(--grey100)' }}/>
    <div className="tm-text-micro tm-tabular">{token}</div>
  </div>
);

/* M05CoachAvatar — prefixed to avoid collision with other modules */
const M05CoachAvatar = ({ name, size = 32 }) => (
  <div style={{
    width: size, height: size, borderRadius: size / 2,
    background: 'var(--blue500)', color: 'var(--static-white)',
    display: 'grid', placeItems: 'center',
    fontWeight: 700, flexShrink: 0,
  }} className="tm-text-label">
    {name ? name[0] : 'C'}
  </div>
);

/* M05TicketBadge — prefixed */
const M05TicketBadge = ({ type }) => {
  const map = {
    single: { label: '1회권',  bg: 'var(--blue50)',   fg: 'var(--blue500)' },
    multi:  { label: '10회권', bg: 'var(--orange50)', fg: 'var(--orange500)' },
    period: { label: '월정액', bg: 'var(--green50)',  fg: 'var(--green500)' },
  }[type] || { label: type, bg: 'var(--grey100)', fg: 'var(--grey700)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 8px',
      borderRadius: 999, fontWeight: 600,
      background: map.bg, color: map.fg,
    }} className="tm-text-xs">
      {map.label}
    </span>
  );
};

/* M05ScheduleSlot — schedule slot fade atom (motion target) */
const M05ScheduleSlot = ({ time, fade }) => (
  <div style={{
    height: 28, background: 'var(--blue50)', borderRadius: 6,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
    opacity: fade ? 0.4 : 1,
    transition: 'opacity 280ms ease-out',
  }}>
    <span className="tm-text-micro" style={{ color: 'var(--blue500)', fontWeight: 700, lineHeight: 1.2 }}>{time.split('~')[0]}</span>
  </div>
);

/* M05ScheduleTable — weekly schedule grid with slot fade */
const M05ScheduleTable = ({ schedule }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }}>
    {schedule.map((col) => (
      <div key={col.day}>
        <div className="tm-text-micro" style={{ marginBottom: 6, color: 'var(--text-muted)', fontWeight: 600 }}>{col.day}</div>
        {col.times.length === 0
          ? <div style={{ height: 28, background: 'var(--grey50)', borderRadius: 6 }}/>
          : col.times.map((t, i) => <M05ScheduleSlot key={i} time={t}/>)
        }
      </div>
    ))}
  </div>
);

/* M05AttendanceList */
const M05AttendanceList = ({ items }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
    {items.map((item, i) => (
      <div key={i} style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 0',
        borderBottom: i < items.length - 1 ? '1px solid var(--grey100)' : 'none',
      }}>
        <M05CoachAvatar name={item.name} size={28}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tm-text-label">{item.name}</div>
          <div className="tm-text-caption">{item.date}</div>
        </div>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: item.present ? 'var(--green50)' : 'var(--red50)',
          color: item.present ? 'var(--green500)' : 'var(--red500)',
          display: 'grid', placeItems: 'center',
        }} className="tm-text-sm" aria-label={item.present ? '출석' : '결석'}>
          {item.present ? '✓' : '✗'}
        </div>
      </div>
    ))}
  </div>
);

/* M05LessonInfoCard — lesson detail info card using canonical primitives */
const M05LessonInfoCard = ({ lesson }) => (
  <div className="tm-card tm-card-interactive" style={{ padding: 18 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Badge tone="blue" size="sm">{lesson.sport}</Badge>
        <Badge tone="grey" size="sm">{lesson.type}</Badge>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
        <Icon name="star" size={12} color="var(--orange500)"/>
        <span className="tm-text-micro tm-tabular">{lesson.rating}</span>
        <span className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>({lesson.reviewCount})</span>
      </div>
    </div>
    <div className="tm-text-body-lg" style={{ marginTop: 8, fontWeight: 700 }}>{lesson.title}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
      <M05CoachAvatar name={lesson.coach} size={20}/>
      <span className="tm-text-caption">{lesson.coach}</span>
    </div>
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="calendar" size={13} color="var(--text-caption)"/>
        <span className="tm-text-caption">{lesson.schedule}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="pin" size={13} color="var(--text-caption)"/>
        <span className="tm-text-caption">{lesson.venue}</span>
      </div>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
      <MoneyRow label="월" amount={lesson.price}/>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {lesson.seats === 0
          ? <Badge tone="red" size="sm">정원 마감</Badge>
          : <Badge tone="green" size="sm">잔여 {lesson.seats}석</Badge>}
      </div>
    </div>
  </div>
);

/* ---------- m05-mb-main: Academy Hub — uses LessonAcademyHub canonical ---------- */
const M05MobileMain = () => (
  <LessonAcademyHub/>
);

/* ---------- m05-tb-main: 태블릿 Academy hub ---------- */
const M05TabletMain = () => (
  <div style={{ width: M05_TB_W, height: M05_TB_H, background: 'var(--bg)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font)' }}>
    {/* header */}
    <div style={{ padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--grey100)' }}>
      <div>
        <div className="tm-text-2xs" style={{ fontWeight: 700, color: 'var(--blue500)' }}>TEAMEET ACADEMY</div>
        <div className="tm-text-heading" style={{ marginTop: 4 }}>레슨 아카데미</div>
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 4 }}>강사에게 직접 배워요</div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <KPIStat label="검증 코치" value={86}/>
        <KPIStat label="운영 코스" value={320}/>
        <KPIStat label="평균 평점" value="4.8"/>
      </div>
    </div>

    {/* filters */}
    <div style={{ padding: '16px 32px 0', display: 'flex', gap: 8, overflowX: 'auto' }}>
      {M05_SPORT_CHIPS.map((c, i) => <HapticChip key={c.id} active={i === 0}>{c.label}</HapticChip>)}
    </div>
    <div style={{ padding: '8px 32px 12px', display: 'flex', gap: 6 }}>
      {M05_LESSON_TYPES.map((t, i) => (
        <HapticChip key={t.id} active={i === 0}>{t.label}</HapticChip>
      ))}
    </div>

    {/* 2-col grid */}
    <div style={{ padding: '0 32px 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, flex: 1, overflowY: 'auto' }}>
      {M05_LESSONS_DATA.concat([M05_LESSONS_DATA[0]]).map((l, idx) => (
        <M05LessonInfoCard key={idx} lesson={l}/>
      ))}
    </div>
  </div>
);

/* ---------- m05-dt-main: 데스크탑 3-col (filter / list / coach panel) ---------- */
const M05DesktopMain = () => (
  <div style={{ width: M05_DT_W, height: M05_DT_H, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'grid', gridTemplateColumns: '220px 1fr 300px' }}>

    {/* left: filter sidebar */}
    <aside style={{ borderRight: '1px solid var(--grey100)', padding: 24, display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>
      <div className="tm-text-label" style={{ color: 'var(--text-muted)' }}>종목</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {M05_SPORT_CHIPS.map((c, i) => (
          <button key={c.id} className={`tm-btn tm-btn-md ${i === 0 ? 'tm-btn-secondary' : 'tm-btn-ghost'}`} style={{ justifyContent: 'flex-start', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: c.color, flexShrink: 0 }} aria-hidden="true"/>
            {c.label}
          </button>
        ))}
      </div>
      <div className="tm-text-label" style={{ color: 'var(--text-muted)' }}>강좌 유형</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {M05_LESSON_TYPES.map((t, i) => (
          <button key={t.id} className={`tm-btn tm-btn-md ${i === 0 ? 'tm-btn-secondary' : 'tm-btn-ghost'}`} style={{ justifyContent: 'flex-start' }}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="tm-text-label" style={{ color: 'var(--text-muted)', marginTop: 4 }}>가격</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {['3만원 이하', '3~10만원', '10만원 이상'].map((r) => (
          <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} className="tm-text-sm">
            <input type="checkbox" style={{ accentColor: 'var(--blue500)', width: 16, height: 16 }}/>
            {r}
          </label>
        ))}
      </div>
    </aside>

    {/* center: lesson list (LessonsListV2 visual vocabulary) */}
    <main style={{ padding: '24px 28px', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div className="tm-text-heading">레슨 아카데미</div>
          <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>총 {M05_LESSONS_DATA.length}개 강좌</div>
        </div>
        <button className="tm-btn tm-btn-primary tm-btn-md" aria-label="강좌 만들기">
          <Icon name="plus" size={16} aria-hidden="true"/> 강좌 만들기
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, overflowY: 'auto', paddingBottom: 16 }}>
        {M05_LESSONS_DATA.map((l) => (
          <M05LessonInfoCard key={l.title} lesson={l}/>
        ))}
      </div>
    </main>

    {/* right: featured coach panel */}
    <aside style={{ borderLeft: '1px solid var(--grey100)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
      <div className="tm-text-label">이 달의 코치</div>
      <div className="tm-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
        <M05CoachAvatar name="김민준" size={56}/>
        <div>
          <div className="tm-text-body-lg">김민준 코치</div>
          <div className="tm-text-caption">풋살 · 경력 8년</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <KPIStat label="평점" value="4.9"/>
          <KPIStat label="리뷰" value={42}/>
          <KPIStat label="수강생" value={120}/>
        </div>
        <button className="tm-btn tm-btn-primary tm-btn-md" style={{ width: '100%' }} aria-label="김민준 코치 프로필 보기">프로필 보기</button>
      </div>
      <div className="tm-text-label">오늘의 스케줄</div>
      <M05ScheduleTable schedule={M05_SCHEDULE}/>
    </aside>
  </div>
);

/* ---------- m05-mb-detail: lesson-detail-v2 canonical — 강좌 상세 + 티켓 구매 ---------- */
const M05MobileDetail = () => {
  const l = M05_LESSONS_DATA[0];
  return (
    <Phone>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* top nav */}
        <AppBar title="강좌 상세" leading={
          <button className="tm-btn tm-btn-ghost tm-btn-icon" aria-label="뒤로 가기"><Icon name="chevL" size={24} color="var(--grey800)"/></button>
        } trailing={[
          <button key="share" className="tm-btn tm-btn-ghost tm-btn-icon" aria-label="공유"><Icon name="share" size={20}/></button>,
        ]}/>

        {/* scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 100px' }}>
          {/* hero band */}
          <div style={{ background: 'var(--blue500)', padding: '24px 20px 20px' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <Badge tone="dark" size="sm">{l.sport}</Badge>
              <Badge tone="dark" size="sm">{l.type}</Badge>
            </div>
            <div className="tm-text-heading" style={{ color: 'var(--static-white)' }}>{l.title}</div>
          </div>

          {/* coach row */}
          <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--grey100)' }}>
            <M05CoachAvatar name={l.coach} size={44}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tm-text-body-lg">{l.coach}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <Icon name="star" size={12} color="var(--orange500)"/>
                <span className="tm-text-caption">{l.rating} ({l.reviewCount}개 리뷰)</span>
              </div>
            </div>
            <button className="tm-btn tm-btn-outline tm-btn-md" aria-label="코치에게 채팅">채팅</button>
          </div>

          {/* info list */}
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { icon: 'calendar', label: '일정', value: l.schedule },
              { icon: 'pin',      label: '장소', value: l.venue },
              { icon: 'people',   label: '정원', value: `${l.maxSeats - l.seats} / ${l.maxSeats}명 · 잔여 ${l.seats}석` },
            ].map(({ icon, label, value }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <Icon name={icon} size={16} color="var(--text-muted)"/>
                <div style={{ minWidth: 40 }}>
                  <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{label}</span>
                </div>
                <span className="tm-text-caption">{value}</span>
              </div>
            ))}
          </div>

          {/* weekly schedule */}
          <div style={{ padding: '0 20px 16px' }}>
            <div className="tm-text-label" style={{ marginBottom: 10 }}>주간 일정</div>
            <M05ScheduleTable schedule={M05_SCHEDULE}/>
          </div>

          {/* ticket picker — LessonPassBuy visual vocabulary */}
          <div style={{ padding: '16px 20px', borderTop: '1px solid var(--grey100)' }}>
            <div className="tm-text-label" style={{ marginBottom: 10 }}>티켓 선택</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {M05_TICKET_TYPES.map((t, i) => (
                <div key={t.id} style={{
                  padding: '14px 16px', borderRadius: 12,
                  border: `2px solid ${i === 1 ? 'var(--blue500)' : 'var(--border)'}`,
                  background: i === 1 ? 'var(--blue50)' : 'var(--bg)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  cursor: 'pointer',
                }}>
                  <div>
                    <M05TicketBadge type={t.id}/>
                    <div className="tm-text-caption" style={{ marginTop: 4 }}>{t.desc}</div>
                  </div>
                  <MoneyRow label="" amount={t.price}/>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* fixed CTA */}
        <div style={{ padding: '12px 20px 24px', borderTop: '1px solid var(--grey100)', background: 'var(--bg)' }}>
          <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" aria-label="10회권 수강 신청 380,000원">10회권 수강 신청 · 380,000원</button>
        </div>
      </div>
    </Phone>
  );
};

/* ---------- m05-mb-create: 강좌 만들기 form-step shell ---------- */
const M05MobileCreate = () => (
  <Phone>
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <AppBar title="강좌 만들기" leading={
        <button className="tm-btn tm-btn-ghost tm-btn-icon" aria-label="뒤로 가기"><Icon name="chevL" size={24} color="var(--grey800)"/></button>
      }/>

      {/* stepper */}
      <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 0 }}>
        {['기본 정보', '일정/장소', '티켓 설정'].map((label, i) => (
          <React.Fragment key={label}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 24, height: 24, borderRadius: 12, display: 'grid', placeItems: 'center',
                background: i === 0 ? 'var(--blue500)' : 'var(--grey200)',
                color: i === 0 ? 'var(--static-white)' : 'var(--text-muted)',
                fontWeight: 700,
              }} className="tm-text-xs" aria-current={i === 0 ? 'step' : undefined}>{i + 1}</div>
              <span className="tm-text-micro" style={{ color: i === 0 ? 'var(--blue500)' : 'var(--text-muted)', fontWeight: i === 0 ? 600 : 400, whiteSpace: 'nowrap' }}>{label}</span>
            </div>
            {i < 2 && <div style={{ flex: 1, height: 2, background: 'var(--grey200)', margin: '0 6px 16px' }} aria-hidden="true"/>}
          </React.Fragment>
        ))}
      </div>

      {/* form body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* field: title */}
        <div>
          <label htmlFor="m05-lesson-title" className="tm-text-label" style={{ display: 'block', marginBottom: 6 }}>
            강좌 이름 <span style={{ color: 'var(--red500)' }} aria-hidden="true">*</span>
          </label>
          <input id="m05-lesson-title" className="tm-input" placeholder="예: 풋살 입문 그룹레슨 A반" defaultValue="풋살 입문 그룹레슨 A반"/>
        </div>

        {/* field: sport */}
        <div>
          <div className="tm-text-label" style={{ marginBottom: 6 }}>종목 <span style={{ color: 'var(--red500)' }} aria-hidden="true">*</span></div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {M05_SPORT_CHIPS.filter(c => c.id !== 'all').map((c, i) => (
              <HapticChip key={c.id} active={i === 0}>{c.label}</HapticChip>
            ))}
          </div>
        </div>

        {/* field: lesson type */}
        <div>
          <div className="tm-text-label" style={{ marginBottom: 6 }}>강좌 유형 <span style={{ color: 'var(--red500)' }} aria-hidden="true">*</span></div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {M05_LESSON_TYPES.map((t, i) => (
              <HapticChip key={t.id} active={i === 0}>{t.label}</HapticChip>
            ))}
          </div>
        </div>

        {/* field: description */}
        <div>
          <label htmlFor="m05-lesson-desc" className="tm-text-label" style={{ display: 'block', marginBottom: 6 }}>강좌 소개</label>
          <textarea id="m05-lesson-desc" className="tm-input" placeholder="강좌를 소개해주세요" rows={4}
            style={{ height: 96, resize: 'none', padding: '12px 14px', display: 'block' }}
            defaultValue="초보자도 쉽게 따라올 수 있는 기초 풋살 강좌입니다. 개인기 훈련부터 팀 전술까지!"/>
        </div>

        {/* field: max seats */}
        <div>
          <label htmlFor="m05-lesson-seats" className="tm-text-label" style={{ display: 'block', marginBottom: 6 }}>
            최대 정원 <span style={{ color: 'var(--red500)' }} aria-hidden="true">*</span>
          </label>
          <input id="m05-lesson-seats" className="tm-input" type="number" placeholder="최대 수강 인원" defaultValue="10" style={{ width: '50%' }}/>
        </div>
      </div>

      {/* CTA */}
      <div style={{ padding: '12px 20px 24px', borderTop: '1px solid var(--grey100)', background: 'var(--bg)' }}>
        <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block">다음 · 일정/장소 설정</button>
      </div>
    </div>
  </Phone>
);

/* ---------- m05-mb-flow-ticket: LessonPass/LessonPassBuy canonical ---------- */
const M05MobileFlowTicket = () => (
  <LessonPass/>
);

/* ---------- m05-mb-state-loading: Academy Hub skeleton ---------- */
const M05MobileStateLoading = () => (
  <Phone>
    <div style={{ flex: 1, padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* header skeleton */}
      <Skeleton h={20} w="60%" r={6}/>
      <Skeleton h={44} w="80%" r={8}/>
      {/* KPI row skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 4 }}>
        {[0, 1, 2].map((i) => <Skeleton key={i} h={52} r={12}/>)}
      </div>
      {/* carousel skeleton */}
      <Skeleton h={16} w="40%" r={6} mb={4}/>
      <div style={{ display: 'flex', gap: 10, overflowX: 'hidden' }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ flexShrink: 0, width: 240 }}>
            <Skeleton h={120} r={12} mb={8}/>
            <Skeleton h={14} w="70%" r={6} mb={4}/>
            <Skeleton h={12} w="50%" r={6}/>
          </div>
        ))}
      </div>
      {/* card list skeleton */}
      <Skeleton h={16} w="35%" r={6} mb={4}/>
      {[0, 1].map((i) => (
        <div key={i} className="tm-card skeleton-shimmer" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton h={16} w="40%" r={4}/>
          <Skeleton h={14} w="75%" r={4}/>
          <Skeleton h={12} w="55%" r={4}/>
        </div>
      ))}
    </div>
  </Phone>
);

/* ---------- m05-mb-state-empty: 코스 없음 ---------- */
const M05MobileStateEmpty = () => (
  <Phone>
    <AppBar title="레슨 아카데미" leading={
      <button className="tm-btn tm-btn-ghost tm-btn-icon" aria-label="뒤로 가기"><Icon name="chevL" size={24} color="var(--grey800)"/></button>
    }/>
    <EmptyState
      icon="ticket"
      title="등록된 강좌가 없어요"
      sub="종목 필터를 바꾸거나 직접 강좌를 만들어 보세요"
      cta="강좌 만들기"
    />
    <BottomNav active="lessons"/>
  </Phone>
);

/* ---------- m05-mb-state-deadline: 신청 마감 임박 ---------- */
const M05MobileStateDeadline = () => {
  const l = M05_LESSONS_DATA[0];
  return (
    <Phone>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <AppBar title="강좌 상세" leading={
          <button className="tm-btn tm-btn-ghost tm-btn-icon" aria-label="뒤로 가기"><Icon name="chevL" size={24} color="var(--grey800)"/></button>
        }/>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 100px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* urgency banner */}
          <AnnouncementBar
            icon="clock"
            text="마감 임박 · 잔여 2석 — 오늘 자정 마감"
            action="바로 신청"
          />
          <M05LessonInfoCard lesson={{ ...l, seats: 2 }}/>

          {/* remaining seats progress */}
          <div className="tm-card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="tm-text-label">수강 신청 현황</span>
              <span className="tm-text-label tm-tabular" style={{ color: 'var(--orange500)' }}>8/10 신청</span>
            </div>
            <StatBar value={80} color="var(--orange500)" label=""/>
            <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 6 }}>잔여 2석 · 마감 임박</div>
          </div>
        </div>
        <div style={{ padding: '12px 20px 24px', borderTop: '1px solid var(--grey100)', background: 'var(--bg)' }}>
          <button className="tm-btn tm-btn-danger tm-btn-lg tm-btn-block" aria-label="지금 바로 신청하기">지금 바로 신청하기</button>
        </div>
      </div>
    </Phone>
  );
};

/* ---------- m05-mb-state-sold-out: 정원 초과 ---------- */
const M05MobileStateSoldOut = () => {
  const l = { ...M05_LESSONS_DATA[2], seats: 0, maxSeats: 12 };
  return (
    <Phone>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <AppBar title="강좌 상세" leading={
          <button className="tm-btn tm-btn-ghost tm-btn-icon" aria-label="뒤로 가기"><Icon name="chevL" size={24} color="var(--grey800)"/></button>
        }/>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 100px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* sold-out banner */}
          <AnnouncementBar
            icon="close"
            text="정원이 마감되었어요 · 웨이팅 신청 후 자리 나면 알림을 받아요"
          />

          <div style={{ opacity: 0.55 }} aria-hidden="true">
            <M05LessonInfoCard lesson={l}/>
          </div>

          <div className="tm-card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="tm-text-label">수강 신청 현황</span>
              <span className="tm-text-label tm-tabular" style={{ color: 'var(--red500)' }}>12/12 마감</span>
            </div>
            <StatBar value={100} color="var(--red500)" label=""/>
          </div>

          <div className="tm-card" style={{ padding: 14, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Icon name="bell" size={16} color="var(--text-muted)"/>
            <div>
              <div className="tm-text-label">비슷한 강좌 추천받기</div>
              <div className="tm-text-caption" style={{ marginTop: 2 }}>농구 · 비슷한 일정 강좌 3개</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 20px 24px', borderTop: '1px solid var(--grey100)', background: 'var(--bg)', display: 'grid', gap: 8 }}>
          <button className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" aria-label="웨이팅 신청">웨이팅 신청</button>
          <button className="tm-btn tm-btn-outline tm-btn-md tm-btn-block" aria-label="비슷한 강좌 보기">비슷한 강좌 보기</button>
        </div>
      </div>
    </Phone>
  );
};

/* ---------- m05-mb-components: 컴포넌트 인벤토리 ---------- */
const M05ComponentsBoard = ({ viewport }) => {
  const w = viewport === 'mb' ? M05_MB_W : viewport === 'tb' ? M05_TB_W : M05_DT_W;
  const h = viewport === 'mb' ? M05_MB_H : viewport === 'tb' ? M05_TB_H : M05_DT_H;
  return (
    <div style={{ width: w, height: h, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflow: 'hidden' }}>
      <Badge tone="blue" size="sm">{`m05-${viewport}-components`}</Badge>
      <div className="tm-text-title" style={{ marginTop: 8 }}>
        M05 {viewport === 'mb' ? '모바일' : viewport === 'tb' ? '태블릿' : '데스크탑'} · 사용 컴포넌트
      </div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>레슨 Academy 화면이 사용하는 production primitives</div>
      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        <M05ComponentSwatch label="LessonAcademyHub canonical · m05-mb-main 직접 마운트">
          <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--blue50)', border: '1px solid var(--grey200)' }}>
            <span className="tm-text-xs" style={{ color: 'var(--blue500)', fontWeight: 700 }}>&lt;LessonAcademyHub/&gt;</span>
          </div>
        </M05ComponentSwatch>
        <M05ComponentSwatch label="LessonPass · LessonPassBuy canonical (screens-deep)">
          <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--blue50)', border: '1px solid var(--grey200)' }}>
            <span className="tm-text-xs" style={{ color: 'var(--blue500)', fontWeight: 700 }}>&lt;LessonPass/&gt; &lt;LessonPassBuy/&gt;</span>
          </div>
        </M05ComponentSwatch>
        <M05ComponentSwatch label="LessonCard · canonical (screens-team) — 코스 카드">
          {LESSONS && LESSONS[0] ? <LessonCard l={LESSONS[0]}/> : (
            <div className="tm-card" style={{ padding: 14, minWidth: 200 }}>
              <span className="tm-text-caption">LessonCard (LESSONS data)</span>
            </div>
          )}
        </M05ComponentSwatch>
        <M05ComponentSwatch label="M05TicketBadge · 3 types">
          <M05TicketBadge type="single"/>
          <M05TicketBadge type="multi"/>
          <M05TicketBadge type="period"/>
        </M05ComponentSwatch>
        <M05ComponentSwatch label="M05CoachAvatar · size variants (20 / 28 / 32 / 44 / 56)">
          {[20, 28, 32, 44, 56].map((s) => <M05CoachAvatar key={s} name="김민준" size={s}/>)}
        </M05ComponentSwatch>
        <M05ComponentSwatch label="M05AttendanceList · 출석 체크">
          <div style={{ width: 300 }}>
            <M05AttendanceList items={M05_ATTENDANCE.slice(0, 3)}/>
          </div>
        </M05ComponentSwatch>
        <M05ComponentSwatch label="M05ScheduleTable + M05ScheduleSlot · 주간 스케줄 그리드">
          <div style={{ width: 300 }}>
            <M05ScheduleTable schedule={M05_SCHEDULE}/>
          </div>
        </M05ComponentSwatch>
        <M05ComponentSwatch label="KPIStat · academy hub 지표">
          <KPIStat label="검증 코치" value={86}/>
          <KPIStat label="운영 코스" value={320}/>
          <KPIStat label="평균 평점" value="4.8"/>
        </M05ComponentSwatch>
        <M05ComponentSwatch label="StatBar · 수강권 잔여/진행률">
          <div style={{ width: 200 }}><StatBar value={75} color="var(--blue500)" label=""/></div>
          <div style={{ width: 200 }}><StatBar value={90} color="var(--orange500)" label=""/></div>
        </M05ComponentSwatch>
        <M05ComponentSwatch label="MoneyRow · 가격 표시">
          <MoneyRow label="패키지 시작가" amount={120000}/>
          <MoneyRow label="10회권" amount={380000}/>
        </M05ComponentSwatch>
        <M05ComponentSwatch label="HapticChip · 필터/탭">
          {M05_SPORT_CHIPS.slice(0, 4).map((c, i) => <HapticChip key={c.id} active={i === 0}>{c.label}</HapticChip>)}
        </M05ComponentSwatch>
        <M05ComponentSwatch label="Badge · 상태 표시">
          <Badge tone="blue" size="sm">풋살</Badge>
          <Badge tone="red" size="sm">정원 마감</Badge>
          <Badge tone="green" size="sm">잔여 3석</Badge>
          <Badge tone="orange" size="sm">마감 임박</Badge>
        </M05ComponentSwatch>
        <M05ComponentSwatch label="AnnouncementBar · 긴급 배너">
          <AnnouncementBar icon="clock" text="마감 임박 · 오늘 자정" action="신청"/>
        </M05ComponentSwatch>
        <M05ComponentSwatch label="EmptyState · 코스 없음">
          <div style={{ width: 300 }}>
            <EmptyState icon="ticket" title="등록된 강좌가 없어요" sub="필터를 바꿔보세요" cta="강좌 만들기"/>
          </div>
        </M05ComponentSwatch>
      </div>
    </div>
  );
};

/* ---------- m05-mb-assets: 토큰/에셋 인벤토리 ---------- */
const M05AssetsBoard = ({ viewport }) => {
  const w = viewport === 'mb' ? M05_MB_W : viewport === 'tb' ? M05_TB_W : M05_DT_W;
  const h = viewport === 'mb' ? M05_MB_H : viewport === 'tb' ? M05_TB_H : M05_DT_H;
  return (
    <div style={{ width: w, height: h, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflow: 'hidden' }}>
      <Badge tone="blue" size="sm">{`m05-${viewport}-assets`}</Badge>
      <div className="tm-text-title" style={{ marginTop: 8 }}>
        M05 {viewport === 'mb' ? '모바일' : viewport === 'tb' ? '태블릿' : '데스크탑'} · 사용 토큰/에셋
      </div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>레슨 Academy 화면이 사용하는 디자인 토큰 인벤토리</div>
      <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
        <M05AssetSwatch label="Color · brand + semantic">
          <M05ColorSwatch token="blue500"   value="var(--blue500)"/>
          <M05ColorSwatch token="blue50"    value="var(--blue50)"/>
          <M05ColorSwatch token="green500"  value="var(--green500)"/>
          <M05ColorSwatch token="green50"   value="var(--green50)"/>
          <M05ColorSwatch token="orange500" value="var(--orange500)"/>
          <M05ColorSwatch token="orange50"  value="var(--orange50)"/>
          <M05ColorSwatch token="red500"    value="var(--red500)"/>
          <M05ColorSwatch token="red50"     value="var(--red50)"/>
        </M05AssetSwatch>
        <M05AssetSwatch label="Color · ticket type tones">
          <M05ColorSwatch token="single·blue"  value="var(--blue50)"/>
          <M05ColorSwatch token="multi·orange" value="var(--orange50)"/>
          <M05ColorSwatch token="period·green" value="var(--green50)"/>
        </M05AssetSwatch>
        <M05AssetSwatch label="Color · sport accent (M05 사용 — token 기반)">
          <M05ColorSwatch token="futsal→blue500"     value="var(--blue500)"/>
          <M05ColorSwatch token="basketball→orange500" value="var(--orange500)"/>
          <M05ColorSwatch token="badminton→green500" value="var(--green500)"/>
          <M05ColorSwatch token="tennis→purple500"   value="var(--purple500)"/>
          <M05ColorSwatch token="hockey→teal500"     value="var(--teal500)"/>
        </M05AssetSwatch>
        <M05AssetSwatch label="Color · neutral hierarchy">
          <M05ColorSwatch token="grey50"  value="var(--grey50)"/>
          <M05ColorSwatch token="grey100" value="var(--grey100)"/>
          <M05ColorSwatch token="grey150" value="var(--grey150)"/>
          <M05ColorSwatch token="grey200" value="var(--grey200)"/>
          <M05ColorSwatch token="grey400" value="var(--grey400)"/>
          <M05ColorSwatch token="grey700" value="var(--grey700)"/>
          <M05ColorSwatch token="grey900" value="var(--grey900)"/>
        </M05AssetSwatch>
        <M05AssetSwatch label="Type · scale (tm-text-* class)">
          <span className="tm-text-heading">heading</span>
          <span className="tm-text-body-lg">body-lg</span>
          <span className="tm-text-body">body</span>
          <span className="tm-text-label">label</span>
          <span className="tm-text-caption">caption</span>
          <span className="tm-text-xs">xs</span>
          <span className="tm-text-micro">micro</span>
        </M05AssetSwatch>
        <M05AssetSwatch label="Spacing · 4-multiple (px)">
          {[8, 12, 14, 16, 18, 20, 24, 28, 32].map((n) => (
            <Badge key={n} tone="grey" size="sm">{n}</Badge>
          ))}
        </M05AssetSwatch>
        <M05AssetSwatch label="Radius">
          <Badge tone="grey" size="sm">r-sm 8 · chip/badge</Badge>
          <Badge tone="grey" size="sm">r-md 12 · card inner</Badge>
          <Badge tone="grey" size="sm">r-lg 16 · card outer</Badge>
          <Badge tone="grey" size="sm">r-pill 9999 · ticket</Badge>
        </M05AssetSwatch>
        <M05AssetSwatch label="Icon · lucide (M05 사용)">
          <span className="tm-text-caption">ticket · calendar · pin · clock · people · star · check · edit · share · bell · plus · search · chevR</span>
        </M05AssetSwatch>
      </div>
    </div>
  );
};

/* ---------- m05-mb-motion: motion contract ---------- */
const M05MotionBoard = () => (
  <div style={{ width: M05_MB_W, height: M05_MB_H, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)' }}>
    <Badge tone="blue" size="sm">m05-mb-motion</Badge>
    <div className="tm-text-title" style={{ marginTop: 8 }}>M05 모바일 · motion contract</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>레슨 Academy에서 사용하는 motion 토큰</div>
    <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
      <ListItem title="LessonCard tap" sub="카드 → scale(0.98) · 120ms · ease-out-quart" trailing="tap"/>
      <ListItem title="Card carousel swipe" sub="Academy Hub 추천 경로 → translateX snap · 280ms · ease-out-expo" trailing="swipe"/>
      <ListItem title="Ticket pass flip" sub="수강권 상세 → rotateY(180deg) · 360ms · ease-in-out (card flip effect)" trailing="flip"/>
      <ListItem title="ScheduleSlot fade" sub="일정 슬롯 등장 → opacity 0→1 · 280ms · stagger 40ms" trailing="fade"/>
      <ListItem title="Skeleton shimmer" sub="loading state → 1.4s linear infinite (sk-shimmer)" trailing="load"/>
      <ListItem title="Stagger in" sub="카드 목록 → 0.05s delay 단위 + fade-in-up · 280ms" trailing="stagger"/>
      <ListItem title="Step transition" sub="강좌 만들기 step → fade-in + translateX(8px) · 280ms · ease-out-expo" trailing="step"/>
      <ListItem title="Urgency pulse" sub="마감 임박 badge → badge-pulse 1.5s infinite" trailing="pulse"/>
      <ListItem title="CTA slide-up" sub="fixed CTA → translateY(100%) → 0 · 280ms · ease-out-quart" trailing="cta"/>
      <ListItem title="StatBar fill" sub="잔여 bar → width transition · 300ms · ease-out-quart" trailing="bar"/>
      <ListItem title="Reduced motion" sub="prefers-reduced-motion → 모든 transition 0.01ms" trailing="a11y"/>
    </div>
  </div>
);

/* ---------- export ---------- */
Object.assign(window, {
  M05MobileMain,
  M05TabletMain,
  M05DesktopMain,
  M05MobileDetail,
  M05MobileCreate,
  M05MobileFlowTicket,
  M05MobileStateLoading,
  M05MobileStateEmpty,
  M05MobileStateDeadline,
  M05MobileStateSoldOut,
  M05ComponentsBoard,
  M05AssetsBoard,
  M05MotionBoard,
});
