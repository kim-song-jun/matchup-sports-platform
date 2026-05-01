/* Teameet — Create/Edit forms + public/marketing pages
   Covers: lessons/new, marketplace/new, mercenary/new, team-matches/new,
           teams/new, tournaments/new, venues/edit, profile edit,
           landing, about, faq, guide, pricing, public user profile */

/* ── FormShell (shared) ── */
const FormHead = ({ title, step, total }) => (
  <div style={{ padding: '16px 20px 12px', background: 'var(--static-white)', borderBottom: '1px solid var(--grey100)', position: 'relative' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      <button className="tm-pressable tm-break-keep" style={{ width: 28, height: 28, color: 'var(--grey900)', fontSize: 22 }}>‹</button>
      <div style={{ flex: 1 }}/>
      {step != null && <div className="tab-num" style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 500 }}>{step}/{total}</div>}
    </div>
    <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--grey900)', letterSpacing: 0 }}>{title}</h1>
    {step != null && total ? (
      <div style={{ marginTop: 12, height: 4, background: 'var(--grey200)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${(step / total) * 100}%`, height: '100%', background: 'var(--blue500)', borderRadius: 999 }}/>
      </div>
    ) : null}
  </div>
);

const Field = ({ label, required, hint, children }) => (
  <div style={{ marginBottom: 20 }}>
    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--grey700)', marginBottom: 8 }}>
      {label}{required && <span style={{ color: 'var(--red500)', marginLeft: 3 }}>*</span>}
    </div>
    {children}
    {hint && <div style={{ fontSize: 11, color: 'var(--grey500)', marginTop: 6, fontWeight: 400 }}>{hint}</div>}
  </div>
);

const Input = ({ placeholder, value, suffix, tabular }) => (
  <div style={{ position: 'relative', height: 52, background: 'var(--grey100)', borderRadius: 12, border: '1px solid var(--grey200)', display: 'flex', alignItems: 'center', padding: '0 14px' }}>
    <div className={tabular ? 'tab-num' : ''} style={{ flex: 1, fontSize: 15, color: value ? 'var(--grey900)' : 'var(--grey400)', fontWeight: value ? 500 : 400 }}>{value || placeholder}</div>
    {suffix && <div style={{ fontSize: 14, color: 'var(--grey600)', fontWeight: 500 }}>{suffix}</div>}
  </div>
);

const Select = ({ value, placeholder }) => (
  <div style={{ position: 'relative', height: 52, background: 'var(--grey100)', borderRadius: 12, border: '1px solid var(--grey200)', display: 'flex', alignItems: 'center', padding: '0 14px' }}>
    <div style={{ flex: 1, fontSize: 15, color: value ? 'var(--grey900)' : 'var(--grey400)', fontWeight: value ? 500 : 400 }}>{value || placeholder}</div>
    <div style={{ fontSize: 14, color: 'var(--grey500)' }}>▾</div>
  </div>
);

const Chips = ({ options, active }) => (
  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
    {options.map(o => (
      <HapticChip key={o} active={active === o}>{o}</HapticChip>
    ))}
  </div>
);

const CTAFooter = ({ primary = '완료', secondary, disabled }) => (
  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(16px)', padding: '12px 20px 28px', borderTop: '1px solid var(--grey100)', display: 'flex', gap: 8 }}>
    {secondary && <SBtn variant="neutral" size="lg" style={{ flex: 1 }}>{secondary}</SBtn>}
    <SBtn size="lg" disabled={disabled} style={{ flex: 2 }}>{primary}</SBtn>
  </div>
);

/* ── /lessons/new ── */
const LessonCreate = () => (
  <div style={{ width: 375, height: 812, background: 'var(--static-white)', fontFamily: 'Pretendard, sans-serif', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar/>
    <FormHead title="레슨 등록" step={2} total={4}/>
    <div style={{ flex: 1, overflow: 'auto', padding: 20, paddingBottom: 100 }}>
      <Field label="종목" required><Chips options={['축구', '풋살', '농구', '테니스', '배드민턴']} active="풋살"/></Field>
      <Field label="레슨 제목" required><Input value="주말 성인 풋살 입문 클래스"/></Field>
      <Field label="1:1 vs 그룹" required><Chips options={['1:1', '1:2', '그룹(4~8)']} active="그룹(4~8)"/></Field>
      <Field label="레벨" required><Chips options={['입문', '초급', '중급', '상급', '선출']} active="초급"/></Field>
      <Field label="회당 가격" required hint="플랫폼 수수료 10%가 차감됩니다."><Input placeholder="0" value="55,000" suffix="원" tabular/></Field>
      <Field label="수강권 옵션"><Input value="4회권 200,000원 · 8회권 380,000원" /></Field>
      <Field label="장소"><Input value="이태원 풋살파크 A코트"/></Field>
      <Field label="상세 설명"><div style={{ minHeight: 120, background: 'var(--grey100)', borderRadius: 12, padding: 14, fontSize: 13, color: 'var(--grey700)', fontWeight: 400, lineHeight: 1.6 }}>풋살 기초 체력·볼 컨트롤·슈팅까지 원데이 8주 프로그램입니다. 첫 주 무료 참관 가능.</div></Field>
      <Field label="커리큘럼 (주차별)"><div style={{ background: 'var(--grey50)', borderRadius: 12, padding: 14 }}>{['1주 · 볼 컨트롤', '2주 · 드리블', '3주 · 패스 정확도', '4주 · 슈팅'].map((t, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: i < 3 ? '1px solid var(--grey200)' : 'none' }}>
          <div className="tab-num" style={{ width: 20, fontSize: 12, color: 'var(--grey500)' }}>{i + 1}</div>
          <div style={{ flex: 1, fontSize: 13, color: 'var(--grey900)' }}>{t}</div>
          <button className="tm-pressable tm-break-keep" style={{ fontSize: 18, color: 'var(--grey500)' }}>⋮</button>
        </div>
      ))}<button className="tm-pressable tm-break-keep" style={{ marginTop: 10, fontSize: 13, color: 'var(--blue500)', fontWeight: 600 }}>+ 주차 추가</button></div></Field>
    </div>
    <CTAFooter primary="다음" secondary="저장"/>
  </div>
);

/* ── /marketplace/new ── */
const ListingCreate = () => (
  <div style={{ width: 375, height: 812, background: 'var(--static-white)', fontFamily: 'Pretendard, sans-serif', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar/><FormHead title="물건 팔기"/>
    <div style={{ flex: 1, overflow: 'auto', padding: 20, paddingBottom: 100 }}>
      <Field label="사진" required hint="최대 10장">
        <div style={{ display: 'flex', gap: 8, overflow: 'auto' }}>
          <button className="tm-pressable tm-break-keep" style={{ width: 76, height: 76, borderRadius: 12, background: 'var(--grey100)', border: '1px dashed var(--grey300)', color: 'var(--grey600)', fontSize: 12, flexShrink: 0 }}>
            <div style={{ fontSize: 22, marginBottom: 2 }}>📷</div>
            <div className="tab-num">0/10</div>
          </button>
          {[IMG.gear1, IMG.gear2].map((g, i) => (
            <div key={i} style={{ width: 76, height: 76, borderRadius: 12, background: `url(${g}) center/cover`, flexShrink: 0 }}/>
          ))}
        </div>
      </Field>
      <Field label="제목" required><Input value="나이키 머큐리얼 슈퍼플라이 9 (275mm)"/></Field>
      <Field label="카테고리" required><Select value="축구 · 축구화"/></Field>
      <Field label="거래 방식"><Chips options={['판매', '무료나눔', '대여']} active="판매"/></Field>
      <Field label="가격" required><Input value="180,000" suffix="원" tabular/></Field>
      <Field label="상태"><Chips options={['새상품', '거의 새것', '사용감 적음', '사용감 있음']} active="거의 새것"/></Field>
      <Field label="거래 희망 지역"><Input value="서울 강남구 역삼동"/></Field>
      <Field label="설명"><div style={{ minHeight: 140, background: 'var(--grey100)', borderRadius: 12, padding: 14, fontSize: 13, color: 'var(--grey700)', fontWeight: 400, lineHeight: 1.6 }}>구매 후 3개월 착용. 박스 · 여분 깔창 모두 있습니다. 직거래 환영.</div></Field>
    </div>
    <CTAFooter primary="등록하기" secondary="임시저장"/>
  </div>
);

/* ── /mercenary/new ── */
const MercCreate = () => (
  <div style={{ width: 375, height: 812, background: 'var(--static-white)', fontFamily: 'Pretendard, sans-serif', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar/><FormHead title="용병 구하기"/>
    <div style={{ flex: 1, overflow: 'auto', padding: 20, paddingBottom: 100 }}>
      <Field label="종목" required><Chips options={['축구', '풋살', '농구', '배드민턴']} active="축구"/></Field>
      <Field label="경기 일시" required><Input value="5월 3일 (토) 14:00"/></Field>
      <Field label="장소" required><Input value="상암 월드컵경기장 보조구장"/></Field>
      <Field label="구하는 인원" required><Input value="1" suffix="명" tabular/></Field>
      <Field label="원하는 포지션"><Chips options={['GK', 'DF', 'MF', 'FW', '무관']} active="MF"/></Field>
      <Field label="최소 레벨"><Chips options={['D', 'C', 'B', 'A', 'S']} active="B"/></Field>
      <Field label="참가비" required><Input value="10,000" suffix="원" tabular/></Field>
      <Field label="추가 설명"><div style={{ minHeight: 100, background: 'var(--grey100)', borderRadius: 12, padding: 14, fontSize: 13, color: 'var(--grey700)', fontWeight: 400 }}>빠른 스피드와 중원 장악 가능한 분 구해요. 유니폼 지급.</div></Field>
      <div style={{ padding: 14, background: 'var(--orange50)', borderRadius: 12, display: 'flex', gap: 10 }}>
        <div style={{ fontSize: 18 }}>⚠️</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--grey900)', marginBottom: 2 }}>긴급 표시 (+1,000원)</div>
          <div style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400 }}>상단 고정 + 푸시 알림 발송</div>
        </div>
        <div style={{ width: 36, height: 22, background: 'var(--blue500)', borderRadius: 11, position: 'relative' }}><div style={{ width: 18, height: 18, background: 'var(--static-white)', borderRadius: 9, position: 'absolute', right: 2, top: 2 }}/></div>
      </div>
    </div>
    <CTAFooter primary="용병 공고 등록"/>
  </div>
);

/* ── /team-matches/new ── */
const TeamMatchCreate = () => (
  <div style={{ width: 375, height: 812, background: 'var(--static-white)', fontFamily: 'Pretendard, sans-serif', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar/><FormHead title="팀 매치 등록" step={1} total={3}/>
    <div style={{ flex: 1, overflow: 'auto', padding: 20, paddingBottom: 100 }}>
      <Field label="우리 팀" required>
        <div style={{ padding: 14, background: 'var(--grey50)', borderRadius: 12, border: '1px solid var(--grey100)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 11, background: 'var(--blue-alpha-08)', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 800, color: 'var(--blue500)' }}>FC</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>FC 발빠른놈들</div>
            <div className="tab-num" style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400, marginTop: 2 }}>축구 · 24명 · B급</div>
          </div>
          <button className="tm-pressable tm-break-keep" style={{ fontSize: 12, color: 'var(--blue500)', fontWeight: 600 }}>변경</button>
        </div>
      </Field>
      <Field label="경기 일시" required><Input value="5월 11일 (일) 09:00"/></Field>
      <Field label="포맷" required><Chips options={['5:5', '6:6', '7:7', '8:8', '11:11']} active="11:11"/></Field>
      <Field label="시설" required>
        <div style={{ padding: 14, background: 'var(--grey100)', borderRadius: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>상암 월드컵경기장 A구장</div>
          <div style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400, marginTop: 4 }}>90분 · 시설비 280,000원</div>
        </div>
      </Field>
      <Field label="비용 분담"><Chips options={['무료 매치', '균등 부담', '우리 팀 전액', '지는 팀 부담']} active="균등 부담"/></Field>
      <Field label="원하는 상대 등급" required><Chips options={['S', 'A', 'B', 'C', 'D', '무관']} active="B"/></Field>
      <Field label="심판 고용 (+60,000원)"><Chips options={['없음', '공식 심판', '팀 자체']} active="공식 심판"/></Field>
    </div>
    <CTAFooter primary="다음" secondary="저장"/>
  </div>
);

/* ── /teams/new ── */
const TeamCreate = () => (
  <div style={{ width: 375, height: 812, background: 'var(--static-white)', fontFamily: 'Pretendard, sans-serif', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar/><FormHead title="팀 만들기"/>
    <div style={{ flex: 1, overflow: 'auto', padding: 20, paddingBottom: 100 }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
        <div style={{ width: 96, height: 96, borderRadius: 24, background: 'var(--blue500)', display: 'grid', placeItems: 'center', position: 'relative' }}>
          <div style={{ fontSize: 40, color: 'var(--static-white)', fontWeight: 800, letterSpacing: 0 }}>FC</div>
          <div style={{ position: 'absolute', right: -6, bottom: -6, width: 32, height: 32, borderRadius: 16, background: 'var(--grey900)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 14 }}>✎</div>
        </div>
      </div>
      <Field label="팀 이름" required><Input value="FC 발빠른놈들"/></Field>
      <Field label="종목" required><Chips options={['축구', '풋살', '농구', '테니스', '배드민턴']} active="축구"/></Field>
      <Field label="활동 지역"><Input value="서울 마포구 · 상암동 위주"/></Field>
      <Field label="팀 등급 (자체 평가)" required><Chips options={['S', 'A', 'B', 'C', 'D']} active="B"/></Field>
      <Field label="팀 인원"><Input value="24" suffix="명" tabular/></Field>
      <Field label="정기 모임일">
        <div style={{ display: 'flex', gap: 6 }}>{['월','화','수','목','금','토','일'].map((d, i) => (
          <div key={i} style={{ flex: 1, height: 36, display: 'grid', placeItems: 'center', borderRadius: 10, background: [5,6].includes(i) ? 'var(--grey900)' : 'var(--grey100)', color: [5,6].includes(i) ? 'var(--static-white)' : 'var(--grey700)', fontSize: 13, fontWeight: 600 }}>{d}</div>
        ))}</div>
      </Field>
      <Field label="가입 방식"><Chips options={['공개', '승인', '초대만']} active="승인"/></Field>
      <Field label="팀 소개"><div style={{ minHeight: 100, background: 'var(--grey100)', borderRadius: 12, padding: 14, fontSize: 13, color: 'var(--grey700)', lineHeight: 1.6, fontWeight: 400 }}>2019년 창단. 매주 토요일 오후 상암 보조구장에서 정기 모임 진행 중. 매너와 열정을 중요하게 생각합니다.</div></Field>
    </div>
    <CTAFooter primary="팀 만들기"/>
  </div>
);

/* ── /profile (edit) ── */
const ProfileEdit = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'Pretendard, sans-serif', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar/><FormHead title="프로필 수정"/>
    <div style={{ flex: 1, overflow: 'auto', padding: 20, paddingBottom: 100 }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
        <div style={{ position: 'relative' }}>
          <div style={{ width: 96, height: 96, borderRadius: 48, background: `url(${IMG.av1}) center/cover`, border: '3px solid var(--static-white)', boxShadow: '0 2px 8px rgba(0,0,0,.08)' }}/>
          <div style={{ position: 'absolute', right: -4, bottom: -4, width: 32, height: 32, borderRadius: 16, background: 'var(--grey900)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 14, border: '2px solid var(--static-white)' }}>📷</div>
        </div>
      </div>
      <div style={{ background: 'var(--static-white)', borderRadius: 14, padding: 20, marginBottom: 12 }}>
        <Field label="닉네임" required><Input value="정민"/></Field>
        <Field label="한줄 소개"><Input value="주말마다 볼차는 직장인 · 평일 풋살도 가끔"/></Field>
        <Field label="성별"><Chips options={['남성', '여성', '선택 안함']} active="남성"/></Field>
        <Field label="연령대"><Chips options={['20대', '30대', '40대', '50+']} active="30대"/></Field>
        <Field label="활동 지역"><Input value="서울 마포구"/></Field>
      </div>
      <div style={{ background: 'var(--static-white)', borderRadius: 14, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>주력 종목</div>
        {[['⚽', '축구', 'B급 · 미드필더'], ['🥅', '풋살', 'C급'], ['🏀', '농구', '미인증']].map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: i < 2 ? '1px solid var(--grey100)' : 'none' }}>
            <div style={{ width: 36, height: 36, borderRadius: 18, background: 'var(--grey100)', display: 'grid', placeItems: 'center', fontSize: 16 }}>{s[0]}</div>
            <div style={{ flex: 1, marginLeft: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--grey900)' }}>{s[1]}</div>
              <div style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400, marginTop: 2 }}>{s[2]}</div>
            </div>
            <button className="tm-pressable tm-break-keep" style={{ fontSize: 12, color: 'var(--blue500)', fontWeight: 600 }}>수정</button>
          </div>
        ))}
        <button className="tm-pressable tm-break-keep" style={{ marginTop: 10, fontSize: 13, color: 'var(--blue500)', fontWeight: 600 }}>+ 종목 추가</button>
      </div>
    </div>
    <CTAFooter primary="저장"/>
  </div>
);

/* ── /user/[id] — 공개 프로필 ── */
const PublicUserProfile = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'Pretendard, sans-serif', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar/>
    <TopNav transparent/>
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ background: 'linear-gradient(180deg, var(--blue500) 0%, var(--blue600) 100%)', padding: '20px 20px 60px', color: 'var(--static-white)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 76, height: 76, borderRadius: 38, background: `url(${IMG.av3}) center/cover`, border: '3px solid rgba(255,255,255,.3)' }}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>수아</div>
            <div style={{ fontSize: 12, opacity: .8, marginTop: 4 }}>농구 A급 · 서울 강남구</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <span style={{ fontSize: 11, padding: '3px 8px', background: 'rgba(255,255,255,.2)', borderRadius: 4, fontWeight: 600 }}>⭐ 매너 4.9</span>
              <span className="tab-num" style={{ fontSize: 11, padding: '3px 8px', background: 'rgba(255,255,255,.2)', borderRadius: 4, fontWeight: 600 }}>매치 132회</span>
            </div>
          </div>
        </div>
      </div>
      <div style={{ marginTop: -44, padding: '0 16px' }}>
        <div style={{ background: 'var(--static-white)', borderRadius: 14, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>
          <div style={{ display: 'flex' }}>
            {[['매치', 132], ['팀', 3], ['리뷰', 48], ['뱃지', 11]].map(([l, v], i) => (
              <div key={l} style={{ flex: 1, textAlign: 'center', borderRight: i < 3 ? '1px solid var(--grey100)' : 'none' }}>
                <div className="tab-num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--grey900)' }}>{v}</div>
                <div style={{ fontSize: 11, color: 'var(--grey500)', fontWeight: 400, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ background: 'var(--static-white)', borderRadius: 14, padding: 18, marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400, lineHeight: 1.6 }}>
            주말마다 강남에서 3on3 치는 직장인 농구러. 슛 보다는 수비와 리바운드 담당. 매너는 보장합니다.
          </div>
        </div>
        <div style={{ background: 'var(--static-white)', borderRadius: 14, padding: 18, marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>주력 종목</div>
          {[['🏀', '농구', 'A급', '3on3 스페셜'], ['🎾', '테니스', 'NTRP 3.5', '복식 위주']].map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: i < 1 ? '1px solid var(--grey100)' : 'none' }}>
              <div style={{ width: 36, height: 36, borderRadius: 18, background: 'var(--grey100)', display: 'grid', placeItems: 'center', fontSize: 16 }}>{s[0]}</div>
              <div style={{ flex: 1, marginLeft: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{s[1]} · {s[2]}</div>
                <div style={{ fontSize: 11, color: 'var(--grey500)', fontWeight: 400, marginTop: 2 }}>{s[3]}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ background: 'var(--static-white)', borderRadius: 14, padding: 18, marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>받은 리뷰 48</div>
          {[['민준', '정확한 수비 · 팀플 최고', 5], ['소연', '시간 약속 잘 지켜요', 5]].map((r, i) => (
            <div key={i} style={{ padding: '10px 0', borderBottom: i < 1 ? '1px solid var(--grey100)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--grey900)' }}>{r[0]}</div>
                <div style={{ flex: 1 }}/>
                <div className="tab-num" style={{ fontSize: 12, color: 'var(--orange500)', fontWeight: 600 }}>★★★★★</div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--grey700)', fontWeight: 400 }}>{r[1]}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
    <div style={{ padding: '12px 20px 28px', background: 'var(--static-white)', borderTop: '1px solid var(--grey100)', display: 'flex', gap: 8 }}>
      <button className="tm-btn tm-btn-neutral tm-btn-icon" style={{ width: 52, minWidth: 52, height: 52, borderRadius: 12, fontSize: 22 }}>🚩</button>
      <SBtn variant="neutral" size="lg" style={{ flex: 1 }}>채팅하기</SBtn>
      <SBtn variant="dark" size="lg" style={{ flex: 1 }}>팔로우</SBtn>
    </div>
  </div>
);

/* ── /landing (public) ── */
const MobileLanding = () => (
  <div style={{ width: 375, height: 812, background: 'var(--static-white)', fontFamily: 'Pretendard, sans-serif', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar/>
    <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 0, color: 'var(--blue500)' }}>Teameet</div>
      <div style={{ flex: 1 }}/>
      <SBtn variant="ghost" size="sm">로그인</SBtn>
    </div>
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '40px 20px 60px', background: 'linear-gradient(180deg, #f3f7ff 0%, var(--static-white) 100%)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue500)', marginBottom: 10 }}>누구나 · 언제나 · 어디서나</div>
        <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: 0, lineHeight: 1.2, color: 'var(--grey900)', margin: '0 0 14px' }}>같이 운동할<br/>사람, 여기 다 있어요</h1>
        <div style={{ fontSize: 15, color: 'var(--grey700)', fontWeight: 400, lineHeight: 1.6, marginBottom: 24 }}>풋살부터 아이스하키까지 23개 종목.<br/>오늘 바로 매치 잡고 나가요.</div>
        <SBtn full size="lg">Teameet 시작하기</SBtn>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 16 }}>
          {[['⚡', '12초'], ['👥', '38만'], ['⭐', '4.8']].map(([e, v], i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16 }}>{e}</div>
              <div className="tab-num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--grey900)', marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: '40px 20px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: 0, margin: '0 0 18px' }}>이렇게 동작해요</h2>
        {[
          ['종목·레벨 선택', '풋살 B급, 축구 C급처럼 나만의 프로필을 만들어요'],
          ['매치 참가 or 만들기', '오늘 근처에서 열리는 매치를 바로 찾거나 직접 열어요'],
          ['경기 후 상호 평가', '매너 · 실력 · 성격을 평가해 더 좋은 매칭으로 이어져요'],
        ].map(([t, d], i) => (
          <div key={i} style={{ display: 'flex', gap: 14, padding: '16px 0', borderBottom: i < 2 ? '1px solid var(--grey100)' : 'none' }}>
            <div className="tab-num" style={{ width: 32, height: 32, borderRadius: 16, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 700 }}>{i + 1}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{t}</div>
              <div style={{ fontSize: 13, color: 'var(--grey600)', fontWeight: 400, lineHeight: 1.5 }}>{d}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '30px 20px', background: 'var(--grey50)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 14px' }}>지금 열린 매치</h2>
        {MATCHES.slice(0, 3).map((m, i) => (
          <div key={i} style={{ background: 'var(--static-white)', borderRadius: 12, padding: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--grey100)' }}>
            <div style={{ width: 56, height: 56, borderRadius: 10, background: `url(${m.img}) center/cover` }}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--grey900)', marginBottom: 3 }}>{m.title}</div>
              <div className="tab-num" style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400 }}>{m.date} · {m.time}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '40px 20px 60px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: 0, margin: '0 0 20px' }}>이미 많은 분들이 함께해요</h2>
        {[{a: IMG.av1, n: '정민', r: '"혼자 풋살 시작했는데 이젠 팀까지 생겼어요"'}, {a: IMG.av3, n: '수아', r: '"매너 좋은 사람만 남아서 꾸준히 하게 돼요"'}].map((r, i) => (
          <div key={i} style={{ padding: 16, background: 'var(--grey50)', borderRadius: 14, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 18, background: `url(${r.a}) center/cover` }}/>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{r.n}</div>
            </div>
            <div style={{ fontSize: 14, color: 'var(--grey700)', fontWeight: 400, lineHeight: 1.5 }}>{r.r}</div>
          </div>
        ))}
      </div>
    </div>
    <div style={{ padding: '12px 20px 28px', background: 'var(--static-white)', borderTop: '1px solid var(--grey100)' }}>
      <SBtn full size="lg">무료로 시작하기</SBtn>
    </div>
  </div>
);

/* ── /faq ── */
const FAQ = () => (
  <div style={{ width: 375, height: 812, background: 'var(--static-white)', fontFamily: 'Pretendard, sans-serif', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar/><TopNav title="자주 묻는 질문"/>
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: 16, borderBottom: '1px solid var(--grey100)' }}>
        <div style={{ height: 46, borderRadius: 12, background: 'var(--grey100)', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 8 }}>
          <div style={{ fontSize: 15, color: 'var(--grey500)' }}>🔍</div>
          <div style={{ fontSize: 14, color: 'var(--grey400)', fontWeight: 400 }}>궁금한 내용을 검색하세요</div>
        </div>
      </div>
      <div style={{ display: 'flex', overflowX: 'auto', gap: 6, padding: 16 }}>
        {['전체', '계정', '매치 참가', '결제·환불', '레슨', '장터', '용병', '분쟁'].map((c, i) => (
          <HapticChip key={c} active={i === 0}>{c}</HapticChip>
        ))}
      </div>
      {[
        ['매치 참가 취소는 언제까지 가능한가요?', '매치 시작 24시간 전까지는 무료 취소 · 환불이 가능합니다. 이후 취소하면 매너 점수에 반영될 수 있어요.'],
        ['레벨은 어떻게 정해지나요?', '종목마다 다릅니다. 축구/풋살은 자가평가 + 상호평가 누적, 테니스는 NTRP 2.0~7.0, 아이스하키는 실업·아마추어·입문 구분이에요.'],
        ['용병 참가비 결제는 어떻게 이뤄지나요?', '용병 신청 시 Teameet에서 미리 결제하고 보관했다가 경기 완료 24시간 후 팀장에게 정산됩니다.'],
        ['장터 분쟁이 생겼어요', '결제 후 14일 이내에 마이 > 분쟁 신청을 눌러주세요. 평균 2영업일 내 답변드립니다.'],
        ['팀 매치 등급은 어떤 기준인가요?', 'S(실업·선출), A(강한 아마추어), B(일반 아마추어), C(취미), D(입문) 기준으로 구분되며 다른 팀의 평가도 반영됩니다.'],
      ].map((q, i) => (
        <div key={i} style={{ padding: '18px 20px', borderBottom: '1px solid var(--grey100)' }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: i === 0 ? 10 : 0 }}>
            <div style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>Q</div>
            <div style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--grey900)', lineHeight: 1.5 }}>{q[0]}</div>
            <div style={{ fontSize: 16, color: 'var(--grey500)' }}>{i === 0 ? '▾' : '▸'}</div>
          </div>
          {i === 0 && (
            <div style={{ display: 'flex', gap: 12, paddingLeft: 2 }}>
              <div style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--grey100)', color: 'var(--grey700)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>A</div>
              <div style={{ flex: 1, fontSize: 13, color: 'var(--grey700)', fontWeight: 400, lineHeight: 1.6 }}>{q[1]}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  </div>
);

/* ── /pricing ── */
const Pricing = () => (
  <div style={{ width: 375, height: 812, background: 'var(--static-white)', fontFamily: 'Pretendard, sans-serif', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar/><TopNav title="요금제"/>
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 16px 40px' }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: 0, margin: '0 0 8px', textAlign: 'center' }}>매치는 언제나 무료</h1>
      <div style={{ fontSize: 14, color: 'var(--grey600)', fontWeight: 400, textAlign: 'center', marginBottom: 28, lineHeight: 1.6 }}>레슨 · 시설 예약은<br/>결제 금액의 3~10% 수수료만 붙어요</div>
      {[
        { t: 'Free', price: 0, feats: ['개인 매치 무제한', '종목 최대 2개', '기본 채팅', '리뷰 주고받기'], hi: false },
        { t: 'Plus', price: 4900, feats: ['종목 무제한', '인기 시간대 우선 예약', '매치 통계 분석', '광고 제거', '긴급 공고 3회/월'], hi: true },
        { t: 'Pro', price: 9900, feats: ['Plus 모든 기능', '팀 운영자 도구', '장비 대여 추천 상단', '레슨 수수료 10% → 6%'], hi: false },
      ].map((p, i) => (
        <div key={i} style={{ position: 'relative', background: p.hi ? 'var(--grey900)' : 'var(--static-white)', color: p.hi ? 'var(--static-white)' : 'var(--grey900)', border: '1px solid ' + (p.hi ? 'var(--grey900)' : 'var(--grey200)'), borderRadius: 16, padding: 22, marginBottom: 12 }}>
          {p.hi && <div style={{ position: 'absolute', top: -10, right: 20, padding: '4px 10px', background: 'var(--blue500)', color: 'var(--static-white)', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>추천</div>}
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, opacity: p.hi ? .7 : 1, color: p.hi ? 'var(--static-white)' : 'var(--grey700)' }}>{p.t}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 18 }}>
            <div className="tab-num" style={{ fontSize: 32, fontWeight: 800, letterSpacing: 0 }}>{p.price.toLocaleString()}<span style={{ fontSize: 14, fontWeight: 600, opacity: .6 }}>원/월</span></div>
          </div>
          {p.feats.map((f, j) => (
            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 13, fontWeight: 400 }}>
              <div style={{ color: p.hi ? '#6dd2a8' : 'var(--green500)', fontSize: 13, fontWeight: 700 }}>✓</div>
              {f}
            </div>
          ))}
          <SBtn full size="md" variant={p.hi ? 'primary' : 'neutral'} style={{ marginTop: 18 }}>
            {i === 0 ? '무료로 시작하기' : '구독하기'}
          </SBtn>
        </div>
      ))}
    </div>
  </div>
);

/* ── /guide ── */
const Guide = () => (
  <div style={{ width: 375, height: 812, background: 'var(--static-white)', fontFamily: 'Pretendard, sans-serif', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <StatusBar/><TopNav title="이용 가이드"/>
    <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
      <div style={{ padding: 20, borderRadius: 14, background: 'linear-gradient(135deg, var(--blue500), var(--blue600))', color: 'var(--static-white)', marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, opacity: .8, marginBottom: 6 }}>빠른 시작</div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10, letterSpacing: 0 }}>처음이라면 이것부터</div>
        <div style={{ fontSize: 13, opacity: .9, lineHeight: 1.5, fontWeight: 400 }}>종목·레벨 설정 → 근처 매치 탐색 → 참가 신청 → 경기 후 리뷰</div>
      </div>
      {[
        { icon: '⚽', t: '매치 참가하기', d: '종목과 일정을 고르고 한 번의 탭으로 참가' },
        { icon: '🏟', t: '매치 만들기', d: '시간 · 장소 · 인원만 정하면 자동 모객' },
        { icon: '👥', t: '팀 운영하기', d: '팀 생성 · 매치 일정 관리 · 정기 모임' },
        { icon: '💰', t: '결제 · 환불', d: '24시간 전 취소 무료 · 자동 정산' },
        { icon: '🎓', t: '레슨 받기', d: '원하는 코치 예약 · 수강권 구매' },
        { icon: '🛍', t: '장터 이용법', d: '안전거래 · 분쟁 중재 시스템' },
      ].map((g, i) => (
        <div key={i} style={{ display: 'flex', gap: 14, padding: 16, background: 'var(--grey50)', borderRadius: 12, marginBottom: 8 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 22 }}>{g.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{g.t}</div>
            <div style={{ fontSize: 12, color: 'var(--grey600)', fontWeight: 400, lineHeight: 1.5 }}>{g.d}</div>
          </div>
          <div style={{ alignSelf: 'center', fontSize: 18, color: 'var(--grey500)' }}>›</div>
        </div>
      ))}
    </div>
  </div>
);

Object.assign(window, { LessonCreate, ListingCreate, MercCreate, TeamMatchCreate, TeamCreate, ProfileEdit, PublicUserProfile, MobileLanding, FAQ, Pricing, Guide });
