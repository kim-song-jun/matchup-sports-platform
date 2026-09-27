/* Teameet — Admin sub-pages + Operational flows + State pages
   Covers: admin/disputes, admin/lessons, admin/reviews, admin/statistics,
           admin/settlements, admin/team-matches, admin/teams, admin/lesson-tickets,
           admin/ops, admin/mercenary, team-matches arrival/evaluate/score,
           venue admin new, settings sub-pages, 404/error */

/* ── Admin shell reuse ── */
const ASide = ({ active }) => (
  <aside style={{ width: 240, background: '#111827', color: 'var(--static-white)', borderRight: '1px solid #1f2937', padding: '20px 0', flexShrink: 0, height: '100%' }}>
    <div style={{ padding: '0 20px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--blue500)', display: 'grid', placeItems: 'center', color: 'var(--static-white)', fontWeight: 800, fontSize: 13 }}>T</div>
      <div><div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0, color: 'var(--static-white)' }}>Teameet</div><div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>Admin</div></div>
    </div>
    {[
      ['dash', '대시보드'],
      ['matches', '매치'],
      ['team-matches', '팀 매치'],
      ['teams', '팀'],
      ['lessons', '레슨'],
      ['tickets', '수강권'],
      ['mercenary', '용병'],
      ['venues', '시설'],
      ['users', '유저'],
      ['reviews', '리뷰'],
      ['disputes', '신고'],
      ['payments', '결제'],
      ['settlements', '정산'],
      ['statistics', '통계'],
      ['ops', '운영 툴'],
    ].map(([k, l]) => {
      const isActive = active === k;
      return (
        <div key={k} style={{
          margin: '2px 12px',
          padding: '10px 12px',
          borderRadius: 10,
          fontSize: 13,
          color: isActive ? '#93c5fd' : '#e5e7eb',
          background: isActive ? 'rgba(49,130,246,.18)' : 'transparent',
          fontWeight: isActive ? 700 : 500,
        }}>{l}</div>
      );
    })}
  </aside>
);

const ATopBar = ({ title, actions }) => (
  <div style={{ height: 64, background: 'var(--static-white)', borderBottom: '1px solid var(--grey200)', display: 'flex', alignItems: 'center', padding: '0 28px', gap: 12 }}>
    <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: 0 }}>{title}</h1>
    <div style={{ flex: 1 }}/>
    {actions}
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 32, height: 32, borderRadius: 16, background: `url(${IMG.av2}) center/cover` }}/>
      <div style={{ fontSize: 13, fontWeight: 600 }}>운영자</div>
    </div>
  </div>
);

const AdminShell = ({ active, title, actions, children }) => (
  <div style={{ width: 1280, height: 800, background: 'var(--grey50)', fontFamily: 'Pretendard, sans-serif', display: 'flex', overflow: 'hidden' }}>
    <ASide active={active}/>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <ATopBar title={title} actions={actions}/>
      <div style={{ flex: 1, overflow: 'auto', padding: 28 }}>{children}</div>
    </div>
  </div>
);

const AStat = ({ label, value, delta, tone }) => (
  <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 12, padding: 18, border: '1px solid var(--border)' }}>
    <KPIStat label={label} value={value}/>
    {delta && <div className="tab-num" style={{ fontSize: 12, color: tone === 'up' ? 'var(--green500)' : tone === 'down' ? 'var(--red500)' : 'var(--text-muted)', fontWeight: 600, marginTop: 4 }}>{tone === 'up' ? '↑' : tone === 'down' ? '↓' : ''} {delta}</div>}
  </div>
);

/* ── /admin/disputes ── */
const AdminDisputes = () => (
  <AdminShell active="disputes" title="신고 · 분쟁 처리" actions={<button className="tm-pressable tm-break-keep" style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--grey900)', color: 'var(--static-white)', fontSize: 13, fontWeight: 600 }}>내보내기</button>}>
    <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
      <AStat label="대기중" value="17" delta="+3" tone="down"/>
      <AStat label="처리중" value="8" delta="-2" tone="up"/>
      <AStat label="오늘 해결" value="24" delta="+12" tone="up"/>
      <AStat label="평균 처리" value="4.2시간" delta="-0.8시간" tone="up"/>
    </div>
    <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--grey200)', display: 'flex', alignItems: 'center', gap: 10 }}>
        {['전체 49', '매너 12', '노쇼 8', '장터 14', '결제 9', '기타 6'].map((t, i) => (
          <div key={i} style={{ padding: '6px 12px', borderRadius: 999, background: i === 0 ? 'var(--grey900)' : 'var(--grey100)', color: i === 0 ? 'var(--static-white)' : 'var(--grey700)', fontSize: 12, fontWeight: 600 }}>{t}</div>
        ))}
        <div style={{ flex: 1 }}/>
        <div style={{ width: 240, height: 36, borderRadius: 8, background: 'var(--grey100)', display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 13, color: 'var(--grey500)' }}>🔍 신고번호 · 유저 검색</div>
      </div>
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--grey50)', color: 'var(--grey500)', fontSize: 12, fontWeight: 600 }}>
            {['#', '유형', '신고자', '피신고자', '내용', '접수일', '상태', ''].map((h, i) => (
              <th key={i} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--grey200)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            ['D-2842', '매너', '민준', '도현', '경기 중 욕설 · 폭언', '04/24 13:02', 'pending'],
            ['D-2841', '노쇼', '지훈', '수연', '매치 5분 전 취소', '04/24 11:30', 'pending'],
            ['D-2840', '장터', '예은', '태형', '배송 지연 · 환불 요청', '04/24 09:15', 'processing'],
            ['D-2839', '결제', '소희', '시스템', '이중 결제 발생', '04/23 22:41', 'processing'],
            ['D-2838', '매너', '태현', '은우', '심판 판정 시비', '04/23 21:10', 'resolved'],
            ['D-2837', '기타', '정민', '—', '광고성 DM 수신', '04/23 19:00', 'resolved'],
          ].map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--grey100)' }}>
              <td className="tab-num" style={{ padding: '14px 16px', color: 'var(--grey500)' }}>{r[0]}</td>
              <td style={{ padding: '14px 16px', fontWeight: 600 }}>{r[1]}</td>
              <td style={{ padding: '14px 16px', color: 'var(--grey700)' }}>{r[2]}</td>
              <td style={{ padding: '14px 16px', color: 'var(--grey700)' }}>{r[3]}</td>
              <td style={{ padding: '14px 16px', color: 'var(--grey900)' }}>{r[4]}</td>
              <td className="tab-num" style={{ padding: '14px 16px', color: 'var(--grey500)' }}>{r[5]}</td>
              <td style={{ padding: '14px 16px' }}>
                <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: r[6] === 'pending' ? 'var(--red50)' : r[6] === 'processing' ? 'var(--orange50)' : 'var(--green50)', color: r[6] === 'pending' ? 'var(--red500)' : r[6] === 'processing' ? 'var(--orange500)' : 'var(--green500)' }}>{r[6] === 'pending' ? '대기' : r[6] === 'processing' ? '처리중' : '해결'}</span>
              </td>
              <td style={{ padding: '14px 16px' }}><button className="tm-pressable tm-break-keep" style={{ fontSize: 12, color: 'var(--blue500)', fontWeight: 600 }}>처리</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </AdminShell>
);

/* ── /admin/lessons ── */
const AdminLessons = () => (
  <AdminShell active="lessons" title="레슨 관리" actions={<button className="tm-pressable tm-break-keep" style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--blue500)', color: 'var(--static-white)', fontSize: 13, fontWeight: 600 }}>+ 레슨 승인 대기 8</button>}>
    <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
      <AStat label="활성 레슨" value="486" delta="+24" tone="up"/>
      <AStat label="코치 수" value="142" delta="+8" tone="up"/>
      <AStat label="월 수강 건수" value="2,148" delta="+18%" tone="up"/>
      <AStat label="수강권 매출" value="84,720,000원" delta="+22%" tone="up"/>
    </div>
    <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)' }}>
      <table style={{ width: '100%', fontSize: 13 }}>
        <thead><tr style={{ background: 'var(--grey50)', color: 'var(--grey500)', fontSize: 12 }}>{['레슨', '코치', '종목', '유형', '가격', '수강생', '평점', '상태'].map((h, i) => <th key={i} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--grey200)' }}>{h}</th>)}</tr></thead>
        <tbody>
          {[
            ['1:1 맞춤 축구 레슨', '박준수', '축구', '1:1', 60000, 18, 4.9, 'active'],
            ['풋살 기초반 (성인)', '이민정', '풋살', '그룹', 45000, 12, 4.8, 'active'],
            ['아이들 농구 원데이', '최현우', '농구', '원데이', 35000, 24, 4.7, 'active'],
            ['테니스 NTRP 3.0', '정예린', '테니스', '1:2', 55000, 6, 4.6, 'pending'],
            ['배드민턴 기초', '김진우', '배드민턴', '그룹', 30000, 8, 4.5, 'suspended'],
          ].map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--grey100)' }}>
              <td style={{ padding: '14px 16px', fontWeight: 700 }}>{r[0]}</td>
              <td style={{ padding: '14px 16px' }}>{r[1]}</td>
              <td style={{ padding: '14px 16px', color: 'var(--grey600)' }}>{r[2]}</td>
              <td style={{ padding: '14px 16px', color: 'var(--grey600)' }}>{r[3]}</td>
              <td className="tab-num" style={{ padding: '14px 16px' }}>{r[4].toLocaleString()}원</td>
              <td className="tab-num" style={{ padding: '14px 16px' }}>{r[5]}명</td>
              <td className="tab-num" style={{ padding: '14px 16px', color: 'var(--orange500)', fontWeight: 600 }}>★ {r[6]}</td>
              <td style={{ padding: '14px 16px' }}>
                <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: r[7] === 'active' ? 'var(--green50)' : r[7] === 'pending' ? 'var(--orange50)' : 'var(--red50)', color: r[7] === 'active' ? 'var(--green500)' : r[7] === 'pending' ? 'var(--orange500)' : 'var(--red500)' }}>{r[7] === 'active' ? '운영중' : r[7] === 'pending' ? '승인대기' : '정지'}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </AdminShell>
);

/* ── /admin/reviews ── */
const AdminReviews = () => (
  <AdminShell active="reviews" title="리뷰 모더레이션">
    <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
      <AStat label="전체 리뷰" value="28,490" delta="+412" tone="up"/>
      <AStat label="신고된 리뷰" value="42" delta="+6" tone="down"/>
      <AStat label="숨김 처리" value="14"/>
      <AStat label="평균 평점" value="4.72" delta="+0.03" tone="up"/>
    </div>
    <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', padding: 20 }}>
      {[
        { u: '민준', t: '도현', s: 1, c: '경기 내내 욕설만 하다가 갔어요. 매너 최악.', flagged: 3, d: '04/24' },
        { u: '지훈', t: '수연', s: 2, c: '시간 약속 안 지키고 경기 중 말 많음', flagged: 1, d: '04/24' },
        { u: '정민', t: 'FC 발빠른놈들', s: 5, c: '좋은 팀입니다! 다음에도 같이 뛰고 싶어요', flagged: 0, d: '04/23' },
      ].map((r, i) => (
        <div key={i} style={{ padding: 16, borderBottom: i < 2 ? '1px solid var(--grey100)' : 'none', display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{r.u}</div>
              <div style={{ fontSize: 12, color: 'var(--grey500)' }}>→</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{r.t}</div>
              <div className="tab-num" style={{ fontSize: 12, color: 'var(--orange500)', fontWeight: 700 }}>{'★'.repeat(r.s)}{'☆'.repeat(5 - r.s)}</div>
              {r.flagged > 0 && <span className="tab-num" style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--red50)', color: 'var(--red500)', fontSize: 11, fontWeight: 700 }}>신고 {r.flagged}</span>}
              <div style={{ flex: 1 }}/>
              <span className="tab-num" style={{ fontSize: 11, color: 'var(--grey500)' }}>{r.d}</span>
            </div>
            <div style={{ fontSize: 14, color: 'var(--grey700)', fontWeight: 400, lineHeight: 1.5 }}>{r.c}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className="tm-pressable tm-break-keep" style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--grey100)', color: 'var(--grey700)', fontSize: 12, fontWeight: 600 }}>유지</button>
            <button className="tm-pressable tm-break-keep" style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--grey900)', color: 'var(--static-white)', fontSize: 12, fontWeight: 600 }}>숨김</button>
            <button className="tm-pressable tm-break-keep" style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--red500)', color: 'var(--static-white)', fontSize: 12, fontWeight: 600 }}>제재</button>
          </div>
        </div>
      ))}
    </div>
  </AdminShell>
);

/* ── /admin/statistics ── */
const AdminStats = () => (
  <AdminShell active="statistics" title="통계 · 리포트">
    <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
      <AStat label="DAU" value="24,812" delta="+4.2%" tone="up"/>
      <AStat label="WAU" value="98,420" delta="+2.1%" tone="up"/>
      <AStat label="MAU" value="384,219" delta="+8.3%" tone="up"/>
      <AStat label="매치 완료율" value="87.4%" delta="+1.2%p" tone="up"/>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
      <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>주간 매치 개설 추이</div>
        <div style={{ fontSize: 12, color: 'var(--grey600)', marginBottom: 16 }}>최근 12주</div>
        <svg viewBox="0 0 400 160" style={{ width: '100%', height: 160 }}>
          <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--blue500)" stopOpacity=".3"/><stop offset="1" stopColor="var(--blue500)" stopOpacity="0"/></linearGradient></defs>
          <path d="M0 120 L33 100 L66 108 L100 80 L133 90 L166 70 L200 60 L233 55 L266 40 L300 48 L333 30 L366 20 L400 25 L400 160 L0 160 Z" fill="url(#g1)"/>
          <path d="M0 120 L33 100 L66 108 L100 80 L133 90 L166 70 L200 60 L233 55 L266 40 L300 48 L333 30 L366 20 L400 25" stroke="var(--blue500)" strokeWidth="2" fill="none"/>
        </svg>
      </div>
      <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>종목별 매치 비율</div>
        {[['축구', 34, 'var(--blue500)'], ['풋살', 28, 'var(--red500)'], ['농구', 14, 'var(--orange500)'], ['배드민턴', 12, 'var(--green500)'], ['테니스', 8, 'var(--purple500)'], ['기타', 4, 'var(--grey500)']].map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 60, fontSize: 12, fontWeight: 600 }}>{s[0]}</div>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--grey100)', overflow: 'hidden' }}>
              <div style={{ width: s[1] + '%', height: '100%', background: s[2] }}/>
            </div>
            <div className="tab-num" style={{ width: 36, textAlign: 'right', fontSize: 12, fontWeight: 700 }}>{s[1]}%</div>
          </div>
        ))}
      </div>
    </div>
    <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>지역별 매치 열림 (상위 8)</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {[['강남구', 842], ['마포구', 624], ['송파구', 512], ['영등포', 480], ['성동구', 384], ['관악구', 298], ['용산구', 272], ['서초구', 248]].map(([n, v], i) => (
          <div key={i} style={{ padding: 14, borderRadius: 10, background: 'var(--grey50)' }}>
            <div style={{ fontSize: 12, color: 'var(--grey600)' }}>{n}</div>
            <div className="tab-num" style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  </AdminShell>
);

/* ── /admin/settlements ── */
const AdminSettlements = () => (
  <AdminShell active="settlements" title="정산">
    <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
      <AStat label="이번달 정산액" value="142,840,000원" delta="+18%" tone="up"/>
      <AStat label="정산 대기" value="28,420,000원"/>
      <AStat label="정산 완료" value="114,420,000원"/>
      <AStat label="수수료 수익" value="14,280,000원"/>
    </div>
    <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--grey200)', display: 'flex', alignItems: 'center', gap: 10 }}>
        {['대기 18', '승인 대기 7', '완료 142', '보류 3'].map((t, i) => (
          <div key={i} style={{ padding: '6px 12px', borderRadius: 999, background: i === 0 ? 'var(--grey900)' : 'var(--grey100)', color: i === 0 ? 'var(--static-white)' : 'var(--grey700)', fontSize: 12, fontWeight: 600 }}>{t}</div>
        ))}
      </div>
      <table style={{ width: '100%', fontSize: 13 }}>
        <thead><tr style={{ background: 'var(--grey50)', color: 'var(--grey500)', fontSize: 12 }}>{['#', '대상', '유형', '총액', '수수료', '지급액', '예정일', '상태'].map((h, i) => <th key={i} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--grey200)' }}>{h}</th>)}</tr></thead>
        <tbody>
          {[
            ['S-4821', '박준수 코치', '레슨', 2400000, 144000, 2256000, '04/30', 'pending'],
            ['S-4820', '상암월드컵경기장', '시설', 4200000, 252000, 3948000, '04/30', 'pending'],
            ['S-4819', '이민정 코치', '레슨', 1800000, 108000, 1692000, '04/28', 'approved'],
            ['S-4818', 'FC 발빠른놈들', '팀매치', 560000, 0, 560000, '04/27', 'done'],
          ].map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--grey100)' }}>
              <td className="tab-num" style={{ padding: '14px 16px', color: 'var(--grey500)' }}>{r[0]}</td>
              <td style={{ padding: '14px 16px', fontWeight: 700 }}>{r[1]}</td>
              <td style={{ padding: '14px 16px', color: 'var(--grey600)' }}>{r[2]}</td>
              <td className="tab-num" style={{ padding: '14px 16px' }}>{r[3].toLocaleString()}원</td>
              <td className="tab-num" style={{ padding: '14px 16px', color: 'var(--grey500)' }}>-{r[4].toLocaleString()}</td>
              <td className="tab-num" style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--blue500)' }}>{r[5].toLocaleString()}원</td>
              <td className="tab-num" style={{ padding: '14px 16px', color: 'var(--grey500)' }}>{r[6]}</td>
              <td style={{ padding: '14px 16px' }}>
                <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: r[7] === 'pending' ? 'var(--orange50)' : r[7] === 'approved' ? 'var(--blue50)' : 'var(--green50)', color: r[7] === 'pending' ? 'var(--orange500)' : r[7] === 'approved' ? 'var(--blue500)' : 'var(--green500)' }}>{r[7] === 'pending' ? '대기' : r[7] === 'approved' ? '승인' : '완료'}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </AdminShell>
);

/* ── /admin/ops ── */
const AdminOps = () => (
  <AdminShell active="ops" title="운영 툴">
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
      {[
        { t: '공지사항 발송', d: '전체/종목별 푸시 · 인앱 배너', btn: '작성', c: 'var(--blue500)' },
        { t: '쿠폰 발행', d: '특정 유저군 대상 할인권 생성', btn: '새 쿠폰', c: 'var(--green500)' },
        { t: '시스템 점검 예약', d: '점검 시간 공지 · 로그인 제한', btn: '예약', c: 'var(--orange500)' },
        { t: '피처 플래그', d: 'AB 테스트 · 기능 롤아웃 관리', btn: '열기', c: 'var(--purple500)' },
        { t: '금칙어 관리', d: '채팅 · 리뷰 필터링 단어', btn: '편집', c: 'var(--grey900)' },
        { t: '백오피스 로그', d: '운영자 활동 내역', btn: '보기', c: 'var(--grey600)' },
      ].map((o, i) => (
        <div key={i} style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', padding: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: o.c + '15', color: o.c, display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 800, marginBottom: 14 }}>⚙</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{o.t}</div>
          <div style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400, lineHeight: 1.5, marginBottom: 14 }}>{o.d}</div>
          <button className="tm-pressable tm-break-keep" style={{ padding: '8px 14px', borderRadius: 8, background: o.c, color: 'var(--static-white)', fontSize: 12, fontWeight: 600 }}>{o.btn}</button>
        </div>
      ))}
    </div>
    <div style={{ marginTop: 20, background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>최근 운영 로그</div>
      {[
        ['운영자', '박지현', '공지사항 발송 · 5월 정기 점검', '방금'],
        ['운영자', '최민수', '쿠폰 생성 · FIRST10K', '12분 전'],
        ['시스템', '자동', '금칙어 3개 추가', '1시간 전'],
        ['운영자', '박지현', '피처 플래그 "new-chat" 100%', '3시간 전'],
      ].map((l, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: i < 3 ? '1px solid var(--grey100)' : 'none', fontSize: 13 }}>
          <div style={{ width: 80, color: 'var(--grey500)', fontSize: 11, fontWeight: 600 }}>{l[0]}</div>
          <div style={{ width: 80, fontWeight: 600 }}>{l[1]}</div>
          <div style={{ flex: 1, color: 'var(--grey700)' }}>{l[2]}</div>
          <div className="tab-num" style={{ color: 'var(--grey500)', fontSize: 12 }}>{l[3]}</div>
        </div>
      ))}
    </div>
  </AdminShell>
);

/* ── Team-match operational flows ── */

/* /team-matches/[id]/arrival — 팀원 출석 체크 */
const TMArrival = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'Pretendard, sans-serif', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar/><TopNav title="출석 체크"/>
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: 20, background: 'var(--static-white)', borderBottom: '1px solid var(--grey100)' }}>
        <div style={{ fontSize: 12, color: 'var(--grey600)', marginBottom: 4 }}>FC 발빠른놈들 vs 수요풋살</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--grey900)' }}>5월 11일 (일) 09:00 · 상암 A구장</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <div style={{ flex: 1, padding: 12, borderRadius: 10, background: 'var(--green50)', textAlign: 'center' }}>
            <div className="tab-num" style={{ fontSize: 22, fontWeight: 800, color: 'var(--green500)' }}>11</div>
            <div style={{ fontSize: 11, color: 'var(--green500)', fontWeight: 600, marginTop: 2 }}>출석</div>
          </div>
          <div style={{ flex: 1, padding: 12, borderRadius: 10, background: 'var(--orange50)', textAlign: 'center' }}>
            <div className="tab-num" style={{ fontSize: 22, fontWeight: 800, color: 'var(--orange500)' }}>2</div>
            <div style={{ fontSize: 11, color: 'var(--orange500)', fontWeight: 600, marginTop: 2 }}>이동중</div>
          </div>
          <div style={{ flex: 1, padding: 12, borderRadius: 10, background: 'var(--red50)', textAlign: 'center' }}>
            <div className="tab-num" style={{ fontSize: 22, fontWeight: 800, color: 'var(--red500)' }}>1</div>
            <div style={{ fontSize: 11, color: 'var(--red500)', fontWeight: 600, marginTop: 2 }}>미응답</div>
          </div>
        </div>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 600, marginBottom: 10 }}>우리 팀 14명</div>
        {[['정민', 'av1', 'arrived', '08:42 도착'], ['지훈', 'av2', 'arrived', '08:45 도착'], ['수아', 'av3', 'arriving', '2km · 도착 12분'], ['민준', 'av4', 'arrived', '08:51 도착'], ['소희', 'av5', 'none', '응답 없음'], ['예은', 'av6', 'arriving', '1.4km · 도착 7분']].map((p, i) => (
          <div key={i} style={{ background: 'var(--static-white)', borderRadius: 12, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 20, background: `url(${IMG[p[1]]}) center/cover` }}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{p[0]}</div>
              <div className="tab-num" style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400, marginTop: 2 }}>{p[3]}</div>
            </div>
            <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: p[2] === 'arrived' ? 'var(--green50)' : p[2] === 'arriving' ? 'var(--orange50)' : 'var(--red50)', color: p[2] === 'arrived' ? 'var(--green500)' : p[2] === 'arriving' ? 'var(--orange500)' : 'var(--red500)' }}>{p[2] === 'arrived' ? '도착' : p[2] === 'arriving' ? '이동중' : '미응답'}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* /team-matches/[id]/score */
const TMScore = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey900)', color: 'var(--static-white)', fontFamily: 'Pretendard, sans-serif', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar dark/>
    <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center' }}>
      <button className="tm-pressable tm-break-keep" style={{ color: 'var(--static-white)', fontSize: 22 }}>‹</button>
      <div style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 700 }}>스코어 입력</div>
      <div style={{ width: 28 }}/>
    </div>
    <div style={{ flex: 1, padding: '30px 20px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, color: 'var(--grey500)', textAlign: 'center', marginBottom: 4 }}>종료 시간 15:30</div>
      <div style={{ fontSize: 14, textAlign: 'center', color: '#c4cbd4', marginBottom: 40 }}>5월 11일 · 상암 A구장</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40 }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 16, background: 'var(--blue-alpha-08)', color: 'var(--blue500)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 18, margin: '0 auto 12px' }}>FC</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>FC 발빠른놈들</div>
          <div style={{ fontSize: 11, color: 'var(--grey500)', marginTop: 2 }}>우리 팀</div>
        </div>
        <div style={{ flex: 2, textAlign: 'center' }}>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center' }}>
            <button className="tm-pressable tm-break-keep" style={{ width: 48, height: 48, borderRadius: 12, background: '#242a33', color: 'var(--static-white)', fontSize: 24, fontWeight: 700 }}>−</button>
            <div className="tab-num" style={{ fontSize: 72, fontWeight: 800, letterSpacing: 0, color: 'var(--blue500)', minWidth: 80 }}>3</div>
            <button className="tm-pressable tm-break-keep" style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--blue500)', color: 'var(--static-white)', fontSize: 24, fontWeight: 700 }}>+</button>
          </div>
          <div style={{ fontSize: 16, color: 'var(--grey500)', fontWeight: 600, margin: '8px 0' }}>:</div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center' }}>
            <button className="tm-pressable tm-break-keep" style={{ width: 48, height: 48, borderRadius: 12, background: '#242a33', color: 'var(--static-white)', fontSize: 24, fontWeight: 700 }}>−</button>
            <div className="tab-num" style={{ fontSize: 72, fontWeight: 800, letterSpacing: 0, color: 'var(--static-white)', minWidth: 80 }}>2</div>
            <button className="tm-pressable tm-break-keep" style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--blue500)', color: 'var(--static-white)', fontSize: 24, fontWeight: 700 }}>+</button>
          </div>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 16, background: 'var(--red-alpha-08)', color: 'var(--red500)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 16, margin: '0 auto 12px' }}>수요</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>수요풋살</div>
          <div style={{ fontSize: 11, color: 'var(--grey500)', marginTop: 2 }}>상대 팀</div>
        </div>
      </div>
      <div style={{ padding: 16, borderRadius: 14, background: '#242a33', marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--grey500)', marginBottom: 10 }}>득점자 (우리팀)</div>
        {[['정민', 18], ['지훈', 32], ['민준', 67]].map((g, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: i < 2 ? '1px solid #303742' : 'none' }}>
            <div className="tab-num" style={{ fontSize: 13, color: 'var(--blue500)', fontWeight: 700, width: 44 }}>{g[1]}'</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--static-white)' }}>{g[0]}</div>
          </div>
        ))}
        <button className="tm-pressable tm-break-keep" style={{ fontSize: 13, color: 'var(--blue500)', fontWeight: 600, marginTop: 10 }}>+ 득점 추가</button>
      </div>
      <div style={{ flex: 1 }}/>
      <button className="tm-pressable tm-break-keep" style={{ height: 52, borderRadius: 12, background: 'var(--blue500)', color: 'var(--static-white)', fontSize: 16, fontWeight: 700 }}>양팀 확인 요청</button>
    </div>
  </div>
);

/* /team-matches/[id]/evaluate */
const TMEvaluate = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'Pretendard, sans-serif', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar/>
    <TopNav title="상대팀 평가"/>
    <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
      <div style={{ background: 'var(--static-white)', borderRadius: 14, padding: 18, marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--grey600)' }}>평가 대상</div>
        <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>수요풋살 (14명)</div>
        <div style={{ fontSize: 12, color: 'var(--grey500)', marginTop: 2 }}>B급 · 평점 4.6</div>
      </div>
      {[
        ['팀 매너', '경기 중 페어플레이 · 심판 존중'],
        ['실력 수준', '공고한 등급과 일치했는지'],
        ['시간 준수', '약속 시간 · 경기 진행 속도'],
        ['커뮤니케이션', '경기 전 · 후 소통'],
      ].map((r, i) => (
        <div key={i} style={{ background: 'var(--static-white)', borderRadius: 14, padding: 18, marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{r[0]}</div>
          <div style={{ fontSize: 12, color: 'var(--grey500)', fontWeight: 400, marginBottom: 12 }}>{r[1]}</div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button className="tm-pressable tm-break-keep" key={n} style={{ flex: 1, height: 46, borderRadius: 10, background: n <= (4 - i % 2) ? '#ffbf1a' : 'var(--grey100)', color: n <= (4 - i % 2) ? 'var(--static-white)' : 'var(--grey300)', fontSize: 22 }}>★</button>
            ))}
          </div>
        </div>
      ))}
      <div style={{ background: 'var(--static-white)', borderRadius: 14, padding: 18, marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>한줄 평 (선택)</div>
        <div style={{ minHeight: 80, background: 'var(--grey100)', borderRadius: 10, padding: 12, fontSize: 13, color: 'var(--grey700)', fontWeight: 400, lineHeight: 1.5 }}>매너 좋고 등급에 맞는 실력이었어요. 다음에 또 만나요!</div>
      </div>
    </div>
    <div style={{ padding: '12px 20px 28px', background: 'var(--static-white)', borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-pressable tm-break-keep" style={{ width: '100%', height: 52, borderRadius: 12, background: 'var(--blue500)', color: 'var(--static-white)', fontSize: 16, fontWeight: 700 }}>평가 제출</button>
    </div>
  </div>
);

/* ── Settings sub-pages ── */
const SettingsAccount = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'Pretendard, sans-serif', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar/><TopNav title="계정 관리"/>
    <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
      <div style={{ background: 'var(--static-white)', borderRadius: 14, padding: '4px 20px', marginBottom: 12 }}>
        {[['이메일', 'jungmin@teameet.app'], ['휴대폰', '010-1234-5678'], ['로그인 방식', '카카오'], ['가입일', '2024.03.12']].map(([l, v], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '14px 0', borderBottom: i < 3 ? '1px solid var(--grey100)' : 'none' }}>
            <div style={{ fontSize: 13, color: 'var(--grey600)', width: 90, fontWeight: 500 }}>{l}</div>
            <div className="tab-num" style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{v}</div>
            {i < 2 && <button className="tm-pressable tm-break-keep" style={{ fontSize: 12, color: 'var(--blue500)', fontWeight: 600 }}>변경</button>}
          </div>
        ))}
      </div>
      <div style={{ background: 'var(--static-white)', borderRadius: 14, padding: '4px 20px', marginBottom: 12 }}>
        {['비밀번호 변경', '연결된 소셜 계정', '2단계 인증', '활성 세션'].map((l, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '14px 0', borderBottom: i < 3 ? '1px solid var(--grey100)' : 'none' }}>
            <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{l}</div>
            <div style={{ color: 'var(--grey500)', fontSize: 16 }}>›</div>
          </div>
        ))}
      </div>
      <div style={{ background: 'var(--static-white)', borderRadius: 14, padding: '4px 20px' }}>
        <div style={{ padding: '14px 0', fontSize: 14, color: 'var(--red500)', fontWeight: 600 }}>계정 탈퇴</div>
      </div>
    </div>
  </div>
);

const SettingsNotifs = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'Pretendard, sans-serif', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar/><TopNav title="알림 설정"/>
    <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
      {[
        { h: '매치', items: [['매치 참가 확정', true], ['매치 취소 · 변경', true], ['매치 시작 1시간 전', true], ['근처 긴급 모집', false]] },
        { h: '팀', items: [['팀 공지사항', true], ['팀매치 신청 수락/거절', true], ['새 팀원 가입', false]] },
        { h: '레슨 · 장터', items: [['레슨 예약 확정', true], ['장터 관심상품 가격 변동', false], ['채팅 메시지', true]] },
        { h: '마케팅', items: [['이벤트 · 혜택', false], ['이메일 뉴스레터', false]] },
      ].map((g, i) => (
        <div key={i} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--grey500)', fontWeight: 600, padding: '0 4px', marginBottom: 6 }}>{g.h}</div>
          <div style={{ background: 'var(--static-white)', borderRadius: 14, padding: '4px 20px' }}>
            {g.items.map((it, j) => (
              <div key={j} style={{ display: 'flex', alignItems: 'center', padding: '14px 0', borderBottom: j < g.items.length - 1 ? '1px solid var(--grey100)' : 'none' }}>
                <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{it[0]}</div>
                <div style={{ width: 40, height: 24, borderRadius: 12, background: it[1] ? 'var(--blue500)' : 'var(--grey300)', position: 'relative', transition: 'background .2s' }}>
                  <div style={{ width: 20, height: 20, borderRadius: 10, background: 'var(--static-white)', position: 'absolute', top: 2, left: it[1] ? 18 : 2, transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.15)' }}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

/* ── Error · 404 · Empty (combined) ── */
const StatePages = () => (
  <div style={{ width: 375, height: 812, background: 'var(--static-white)', fontFamily: 'Pretendard, sans-serif', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar/>
    <TopNav title="404 / Error"/>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: 0, color: 'var(--blue500)', lineHeight: 1 }} className="tab-num">404</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 20, marginBottom: 10 }}>페이지를 찾을 수 없어요</div>
      <div style={{ fontSize: 14, color: 'var(--grey600)', fontWeight: 400, lineHeight: 1.6, marginBottom: 32 }}>주소가 바뀌었거나 삭제된 페이지예요.<br/>홈으로 돌아가서 다시 찾아보세요.</div>
      <button className="tm-pressable tm-break-keep" style={{ padding: '14px 28px', borderRadius: 12, background: 'var(--blue500)', color: 'var(--static-white)', fontSize: 15, fontWeight: 700, marginBottom: 10 }}>홈으로 가기</button>
      <button className="tm-pressable tm-break-keep" style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 500 }}>문제를 신고할게요</button>
    </div>
  </div>
);

/* ── /admin/venues/new ── */
const AdminVenueNew = () => (
  <AdminShell active="venues" title="시설 등록">
    <div style={{ background: 'var(--static-white)', borderRadius: 12, border: '1px solid var(--grey200)', padding: 28, maxWidth: 820 }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>기본 정보</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div><div style={{ fontSize: 12, color: 'var(--grey600)', marginBottom: 6, fontWeight: 600 }}>시설명 *</div><div style={{ height: 44, borderRadius: 8, background: 'var(--grey100)', padding: '0 12px', display: 'flex', alignItems: 'center', fontSize: 14 }}>상암월드컵경기장 보조구장</div></div>
        <div><div style={{ fontSize: 12, color: 'var(--grey600)', marginBottom: 6, fontWeight: 600 }}>종목 *</div><div style={{ height: 44, borderRadius: 8, background: 'var(--grey100)', padding: '0 12px', display: 'flex', alignItems: 'center', fontSize: 14 }}>축구 · 풋살</div></div>
        <div><div style={{ fontSize: 12, color: 'var(--grey600)', marginBottom: 6, fontWeight: 600 }}>주소 *</div><div style={{ height: 44, borderRadius: 8, background: 'var(--grey100)', padding: '0 12px', display: 'flex', alignItems: 'center', fontSize: 14 }}>서울시 마포구 월드컵로 240</div></div>
        <div><div style={{ fontSize: 12, color: 'var(--grey600)', marginBottom: 6, fontWeight: 600 }}>시간당 가격 *</div><div className="tab-num" style={{ height: 44, borderRadius: 8, background: 'var(--grey100)', padding: '0 12px', display: 'flex', alignItems: 'center', fontSize: 14 }}>60,000원</div></div>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 28, marginBottom: 16 }}>사진 (최대 10장)</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="tm-pressable tm-break-keep" style={{ width: 120, height: 120, borderRadius: 10, background: 'var(--grey100)', border: '1px dashed var(--grey300)', fontSize: 24, color: 'var(--grey500)' }}>+</button>
        {[IMG.venue1, IMG.venue2, IMG.venue3].map((v, i) => (
          <div key={i} style={{ width: 120, height: 120, borderRadius: 10, background: `url(${v}) center/cover` }}/>
        ))}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 28, marginBottom: 14 }}>편의시설</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {['주차', '샤워실', '탈의실', '라커', '음수대', '매점', '조명', '관람석', '와이파이'].map((f, i) => (
          <div key={i} style={{ padding: '8px 14px', borderRadius: 8, background: i < 5 ? 'var(--blue50)' : 'var(--grey100)', color: i < 5 ? 'var(--blue500)' : 'var(--grey700)', fontSize: 13, fontWeight: 600, border: '1px solid ' + (i < 5 ? 'var(--blue500)' : 'transparent') }}>{f}</div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
        <button className="tm-pressable tm-break-keep" style={{ flex: 1, height: 48, borderRadius: 10, background: 'var(--grey100)', color: 'var(--grey700)', fontSize: 14, fontWeight: 700 }}>임시저장</button>
        <button className="tm-pressable tm-break-keep" style={{ flex: 2, height: 48, borderRadius: 10, background: 'var(--blue500)', color: 'var(--static-white)', fontSize: 14, fontWeight: 700 }}>등록하기</button>
      </div>
    </div>
  </AdminShell>
);

Object.assign(window, { AdminDisputes, AdminLessons, AdminReviews, AdminStats, AdminSettlements, AdminOps, TMArrival, TMScore, TMEvaluate, SettingsAccount, SettingsNotifs, StatePages, AdminVenueNew });
