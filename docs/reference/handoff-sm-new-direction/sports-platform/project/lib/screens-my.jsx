/* Teameet — My sub-pages: disputes, listings, lesson-tickets, lessons,
   matches, mercenary, team-matches, team-match-applications, teams */

const MyNav = ({ active }) => (
  <div style={{ background: 'var(--static-white)', borderBottom: '1px solid var(--grey200)', padding: '0 4px', position: 'sticky', top: 0, zIndex: 10 }}>
    <div style={{ display: 'flex', overflowX: 'auto', gap: 4, padding: '8px 16px' }} className="no-sb">
      {[
        ['matches', '매치'],
        ['team-matches', '팀매치'],
        ['teams', '팀'],
        ['lessons', '레슨'],
        ['tickets', '수강권'],
        ['listings', '장터'],
        ['merc', '용병'],
        ['disputes', '분쟁'],
        ['reviews', '리뷰'],
      ].map(([k, l]) => (
        <HapticChip key={k} active={active === k}>{l}</HapticChip>
      ))}
    </div>
  </div>
);

const MyHeader = ({ title, count }) => (
  <div style={{ padding: '20px 20px 12px', background: 'var(--static-white)' }}>
    <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--grey900)', letterSpacing: 0 }}>{title}</h1>
    {count != null && <div className="tab-num" style={{ fontSize: 13, color: 'var(--grey600)', marginTop: 4, fontWeight: 400 }}>총 {count}건</div>}
  </div>
);

/* ── /my/matches — 내가 참가한 매치 ── */
const MyMatches = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'Pretendard, sans-serif', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar/>
    <TopNav title="내 매치"/>
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ display: 'flex', background: 'var(--static-white)', borderBottom: '1px solid var(--grey200)', padding: '0 20px' }}>
        {[['upcoming', '예정 2', true], ['past', '지난 18'], ['canceled', '취소 1']].map(([k, l, a]) => (
          <button className="tm-pressable tm-break-keep" key={k} style={{ padding: '14px 0', marginRight: 24, borderBottom: a ? '2px solid var(--grey900)' : '2px solid transparent', fontSize: 14, fontWeight: a ? 700 : 500, color: a ? 'var(--grey900)' : 'var(--grey600)' }}>{l}</button>
        ))}
      </div>

      <div style={{ padding: 16 }}>
        {[
          { s: '축구', t: '주말 축구 한 판', v: '상암 보조구장', d: '5월 3일 (토)', tm: '14:00', state: '확정', stateC: 'var(--blue500)', img: IMG.soccer, fee: 12000, participants: 18, max: 22 },
          { s: '풋살', t: '수요일 저녁 풋살', v: '이태원 풋살파크', d: '5월 7일 (수)', tm: '20:30', state: '대기', stateC: 'var(--orange500)', img: IMG.futsal, fee: 8000, participants: 9, max: 10 },
        ].map((m, i) => (
          <div key={i} style={{ background: 'var(--static-white)', borderRadius: 14, overflow: 'hidden', marginBottom: 12, border: '1px solid var(--grey100)' }}>
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 11, padding: '2px 7px', background: 'var(--blue50)', color: 'var(--blue500)', borderRadius: 4, fontWeight: 700 }}>{m.s}</span>
                <span style={{ fontSize: 11, padding: '2px 7px', background: m.stateC + '1a', color: m.stateC, borderRadius: 4, fontWeight: 700 }}>참가 {m.state}</span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--grey900)', marginBottom: 6 }}>{m.t}</div>
              <div className="tab-num" style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400, marginBottom: 2 }}>{m.d} · {m.tm}</div>
              <div style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400 }}>{m.v}</div>
            </div>
            <div style={{ display: 'flex', borderTop: '1px solid var(--grey100)' }}>
              <SBtn variant="ghost" size="sm" style={{ flex: 1, borderRadius: 0, borderRight: '1px solid var(--grey100)' }}>채팅방</SBtn>
              <SBtn variant="ghost" size="sm" style={{ flex: 1, borderRadius: 0, borderRight: '1px solid var(--grey100)' }}>참가자</SBtn>
              <SBtn variant="ghost" size="sm" style={{ flex: 1, borderRadius: 0, color: 'var(--red500)' }}>참가 취소</SBtn>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* ── /my/lesson-tickets ── */
const MyLessonTickets = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'Pretendard, sans-serif', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar/>
    <TopNav title="수강권"/>
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: 20, background: 'var(--grey900)', color: 'var(--static-white)' }}>
        <div style={{ fontSize: 13, fontWeight: 500, opacity: .7, marginBottom: 6 }}>내 수강권</div>
        <div className="tab-num" style={{ fontSize: 30, fontWeight: 700 }}>14회 <span style={{ fontSize: 15, opacity: .6, fontWeight: 400 }}>남음</span></div>
        <div style={{ fontSize: 12, color: 'var(--grey500)', marginTop: 6 }}>3개 코치 · 총 2개 유효 수강권</div>
      </div>

      <div style={{ padding: 16 }}>
        {[
          { c: '박준수 코치', l: '1:1 맞춤 축구', left: 6, total: 8, exp: '2026-06-12', state: 'active', img: IMG.coach1 },
          { c: '이민정 코치', l: '풋살 기초반',    left: 8, total: 12, exp: '2026-07-20', state: 'active', img: IMG.coach3 },
          { c: '최현우 코치', l: '농구 슛 원데이',  left: 0, total: 1,  exp: '2026-03-10', state: 'done',    img: IMG.coach4 },
        ].map((t, i) => {
          const pct = t.total ? (t.left / t.total) * 100 : 0;
          const expired = t.state !== 'active';
          return (
            <div key={i} style={{ background: expired ? 'var(--grey100)' : 'var(--static-white)', borderRadius: 14, padding: 16, marginBottom: 10, border: '1px solid ' + (expired ? 'var(--grey200)' : 'var(--grey100)'), opacity: expired ? .6 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 20, background: `url(${t.img}) center/cover` }}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--grey900)' }}>{t.l}</div>
                  <div style={{ fontSize: 12, color: 'var(--grey600)', marginTop: 2, fontWeight: 400 }}>{t.c}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="tab-num" style={{ fontSize: 20, fontWeight: 700, color: expired ? 'var(--grey500)' : 'var(--grey900)' }}>{t.left}<span style={{ fontSize: 12, fontWeight: 500, color: 'var(--grey500)' }}>/{t.total}</span></div>
                  <div style={{ fontSize: 11, color: expired ? 'var(--grey500)' : 'var(--green500)', fontWeight: 600, marginTop: 2 }}>{expired ? '만료' : '사용중'}</div>
                </div>
              </div>
              {!expired && (
                <div style={{ height: 6, background: 'var(--grey100)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: pct + '%', height: '100%', background: 'var(--blue500)', borderRadius: 3 }}/>
                </div>
              )}
              <div className="tab-num" style={{ fontSize: 11, color: 'var(--grey500)', marginTop: 10, fontWeight: 400 }}>만료일 {t.exp}</div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

/* ── /my/listings 내 판매글 ── */
const MyListings = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'Pretendard, sans-serif', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar/>
    <TopNav title="내 판매글"/>
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ display: 'flex', background: 'var(--static-white)', borderBottom: '1px solid var(--grey200)', padding: '0 20px' }}>
        {[['판매중 3', true], ['거래완료 8'], ['숨김 1']].map(([l, a], i) => (
          <button className="tm-pressable tm-break-keep" key={i} style={{ padding: '14px 0', marginRight: 24, borderBottom: a ? '2px solid var(--grey900)' : '2px solid transparent', fontSize: 14, fontWeight: a ? 700 : 500, color: a ? 'var(--grey900)' : 'var(--grey600)' }}>{l}</button>
        ))}
      </div>
      <div style={{ padding: 16 }}>
        {LISTINGS.slice(0, 3).map((l, i) => (
          <div key={i} style={{ background: 'var(--static-white)', borderRadius: 12, overflow: 'hidden', marginBottom: 12, border: '1px solid var(--grey100)', display: 'flex' }}>
            <div style={{ width: 120, height: 120, background: `url(${l.img}) center/cover`, flexShrink: 0 }}/>
            <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 14, color: 'var(--grey900)', lineHeight: 1.4, fontWeight: 400 }}>{l.title}</div>
              <div className="tab-num" style={{ fontSize: 15, fontWeight: 700, color: 'var(--grey900)', marginTop: 4 }}>{l.price.toLocaleString()}원</div>
              <div style={{ flex: 1 }}/>
              <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
                <span className="tab-num" style={{ fontSize: 11, color: 'var(--grey500)', fontWeight: 400 }}>찜 {3 + i * 2}</span>
                <span className="tab-num" style={{ fontSize: 11, color: 'var(--grey500)', fontWeight: 400 }}>조회 {42 + i * 8}</span>
                <span className="tab-num" style={{ fontSize: 11, color: 'var(--grey500)', fontWeight: 400 }}>채팅 {i + 1}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <SBtn variant="neutral" size="sm" style={{ flex: 1 }}>끌어올리기</SBtn>
                <SBtn variant="neutral" size="sm" style={{ width: 56 }}>수정</SBtn>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* ── /my/disputes — 신고/분쟁 ── */
const MyDisputes = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'Pretendard, sans-serif', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar/>
    <TopNav title="신고 · 분쟁"/>
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '20px 20px 10px', background: 'var(--static-white)' }}>
        <div className="tab-num" style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400 }}>접수 3건 · 처리중 1건</div>
      </div>
      <div style={{ padding: 16 }}>
        {[
          { t: '매치 중 매너 문제', d: '주말 축구 한 판 매치에서 상대 팀 선수와의 매너 분쟁', state: '접수중', stateC: 'var(--orange500)', date: '4/24' },
          { t: '장터 거래 미완료', d: '약속 시간에 나타나지 않은 판매자', state: '환불 완료', stateC: 'var(--green500)', date: '4/20' },
          { t: '레슨 장소 변경 문의', d: '일방적인 장소 변경으로 수강 포기', state: '처리중', stateC: 'var(--blue500)', date: '4/18' },
        ].map((d, i) => (
          <div key={i} style={{ background: 'var(--static-white)', borderRadius: 12, padding: 16, marginBottom: 10, border: '1px solid var(--grey100)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 11, padding: '2px 8px', background: d.stateC + '1a', color: d.stateC, borderRadius: 4, fontWeight: 700 }}>{d.state}</span>
              <div style={{ flex: 1 }}/>
              <span className="tab-num" style={{ fontSize: 12, color: 'var(--grey500)', fontWeight: 400 }}>{d.date}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--grey900)', marginBottom: 4 }}>{d.t}</div>
            <div style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400, lineHeight: 1.5 }}>{d.d}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* ── /my/team-match-applications — 팀매치 신청 관리 ── */
const MyTeamMatchApplications = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'Pretendard, sans-serif', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar/>
    <TopNav title="팀매치 신청"/>
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ display: 'flex', background: 'var(--static-white)', borderBottom: '1px solid var(--grey200)', padding: '0 20px' }}>
        {[['받은 신청 4', true], ['보낸 신청 2']].map(([l, a], i) => (
          <button className="tm-pressable tm-break-keep" key={i} style={{ padding: '14px 20px 14px 0', borderBottom: a ? '2px solid var(--grey900)' : '2px solid transparent', fontSize: 14, fontWeight: a ? 700 : 500, color: a ? 'var(--grey900)' : 'var(--grey600)' }}>{l}</button>
        ))}
      </div>
      <div style={{ padding: 16 }}>
        {[
          { team: 'FC 번개',       sport: '축구', grade: 'B', date: '5/11 (일) 09:00', venue: '상암 A구장', state: 'pending' },
          { team: '다이나믹 FS',   sport: '풋살', grade: 'B', date: '5/12 (월) 20:00', venue: '신도림 풋살장', state: 'pending' },
          { team: '퇴근후축구',    sport: '축구', grade: 'C', date: '5/14 (수) 19:30', venue: '잠실 B구장', state: 'accepted' },
          { team: '수요풋살',      sport: '풋살', grade: 'A', date: '5/15 (목) 21:00', venue: '반포 풋살장', state: 'rejected' },
        ].map((a, i) => (
          <div key={i} style={{ background: 'var(--static-white)', borderRadius: 14, padding: 16, marginBottom: 10, border: '1px solid var(--grey100)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--grey100)', display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 700, color: 'var(--grey700)' }}>{a.team.slice(0, 2)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--grey900)' }}>{a.team}</div>
                <div style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400, marginTop: 2 }}>{a.sport} · {a.grade}급</div>
              </div>
              {a.state === 'accepted' && <span style={{ fontSize: 11, padding: '3px 8px', background: 'var(--green50)', color: 'var(--green500)', borderRadius: 4, fontWeight: 700 }}>수락됨</span>}
              {a.state === 'rejected' && <span style={{ fontSize: 11, padding: '3px 8px', background: '#ffe5e8', color: 'var(--red500)', borderRadius: 4, fontWeight: 700 }}>거절됨</span>}
            </div>
            <div className="tab-num" style={{ fontSize: 13, color: 'var(--grey700)', fontWeight: 400, marginBottom: 2 }}>{a.date}</div>
            <div style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400, marginBottom: 12 }}>{a.venue}</div>
            {a.state === 'pending' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <SBtn variant="neutral" size="sm" style={{ flex: 1 }}>거절</SBtn>
                <SBtn size="sm" style={{ flex: 2 }}>수락하기</SBtn>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* ── /my/teams, /my/mercenary, /my/lessons — slim list variants ── */
const MyTeams = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'Pretendard, sans-serif', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar/><TopNav title="내 팀"/>
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: 16 }}>
        {TEAMS.slice(0, 3).map((t, i) => (
          <div key={i} style={{ background: 'var(--static-white)', borderRadius: 14, padding: 16, marginBottom: 10, border: '1px solid var(--grey100)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: t.color + '15', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 800, color: t.color, letterSpacing: 0 }}>{t.name.slice(0, 2)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{t.name}</div>
                <div className="tab-num" style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400, marginTop: 2 }}>{t.sport} · {t.members}명 · {t.level}급</div>
              </div>
              <span style={{ fontSize: 11, padding: '3px 8px', background: i === 0 ? 'var(--grey900)' : 'var(--grey100)', color: i === 0 ? 'var(--static-white)' : 'var(--grey700)', borderRadius: 4, fontWeight: 700 }}>{i === 0 ? '주장' : '팀원'}</span>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--grey100)' }}>
              {[['이번 달 매치', 3], ['출석률', '92%'], ['매너', 4.8]].map(([l, v]) => (
                <div key={l} style={{ flex: 1, textAlign: 'center' }}>
                  <div className="tab-num" style={{ fontSize: 15, fontWeight: 700, color: 'var(--grey900)' }}>{v}</div>
                  <div style={{ fontSize: 11, color: 'var(--grey500)', fontWeight: 400, marginTop: 2 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <SBtn full size="md" variant="outline" style={{ borderStyle: 'dashed' }}>+ 새 팀 만들기</SBtn>
      </div>
    </div>
  </div>
);

Object.assign(window, { MyMatches, MyLessonTickets, MyListings, MyDisputes, MyTeamMatchApplications, MyTeams });
