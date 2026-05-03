/* Teameet — SM design-freeze comparison boards
   Mobile-first additions based on the SM revision brief.
   These boards intentionally do not replace the existing sections. */

const SM_BOTTOM_TABS = [
  { id: 'home', label: '홈', icon: 'M3 11 L12 3 L21 11 V21 H3 Z' },
  { id: 'matches', label: '매치', icon: 'M12 3 L15 9 L21 10 L16 14 L18 21 L12 17 L6 21 L8 14 L3 10 L9 9 Z' },
  { id: 'teamMatches', label: '팀매치', icon: 'M4 8h16v10H4z M8 8V6h8v2 M8 18v2h8v-2 M8 12h8' },
  { id: 'teams', label: '팀', icon: 'M9 11 A4 4 0 1 0 9 3 A4 4 0 0 0 9 11 M2 21 A7 7 0 0 1 16 21 M17 11 A3 3 0 1 0 17 5 A3 3 0 0 0 17 11 M17 15 A5 5 0 0 1 22 20' },
  { id: 'my', label: '마이', icon: 'M12 12 A4 4 0 1 0 12 4 A4 4 0 0 0 12 12 M4 21 A8 8 0 0 1 20 21' },
];

const SMBottomNav = ({ active = 'home' }) => (
  <div style={{
    minHeight: 74,
    borderTop: '1px solid var(--grey100)',
    background: 'rgba(255,255,255,.94)',
    backdropFilter: 'blur(18px)',
    padding: '6px 0 16px',
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    flexShrink: 0,
  }}>
    {SM_BOTTOM_TABS.map((tab) => {
      const current = active === tab.id;
      return (
        <button key={tab.id} className="tm-pressable tm-break-keep" aria-current={current ? 'page' : undefined} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 0, color: current ? 'var(--blue500)' : 'var(--grey400)' }}>
          <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={current ? 2.2 : 1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d={tab.icon}/>
          </svg>
          <span className="tm-text-micro" style={{ color: current ? 'var(--blue500)' : 'var(--grey500)', fontWeight: current ? 700 : 500, whiteSpace: 'nowrap' }}>{tab.label}</span>
        </button>
      );
    })}
  </div>
);

const SMRevisionShell = ({ title = 'teameet', search = false, notificationNew = true, back = false, children, bottom = true, navActive = 'home' }) => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <div style={{ minHeight: 56, padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--grey100)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {back && (
          <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="뒤로가기">
            <Icon name="chevL" size={22}/>
          </button>
        )}
        <div className="tm-text-body-lg" style={{ color: 'var(--text-strong)' }}>{title}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {search && (
          <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="검색">
            <Icon name="search" size={21}/>
          </button>
        )}
        <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="알림" style={{ position: 'relative' }}>
          <Icon name="bell" size={21}/>
          {notificationNew && <span style={{ position: 'absolute', top: 11, right: 11, width: 7, height: 7, borderRadius: 999, background: 'var(--red500)', border: '2px solid var(--bg)' }}/>}
        </button>
      </div>
    </div>
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: bottom ? 12 : 0 }}>
      {children}
    </div>
    {bottom && <SMBottomNav active={navActive}/>}
  </div>
);

const SMRevisionInfoRow = ({ label, value, sub }) => (
  <div style={{ padding: '14px 0', borderBottom: '1px solid var(--grey100)' }}>
    <div className="tm-text-caption">{label}</div>
    <div className="tm-text-body-lg" style={{ marginTop: 4 }}>{value}</div>
    {sub && <div className="tm-text-caption" style={{ marginTop: 2 }}>{sub}</div>}
  </div>
);

const SMRevisionRuleBoard = ({ title, items }) => (
  <div style={{ width: '100%', height: '100%', background: 'var(--grey50)', fontFamily: 'var(--font)', padding: 24, overflow: 'hidden' }}>
    <div className="tm-text-heading">{title}</div>
    <div className="tm-text-body" style={{ marginTop: 8 }}>SM design freeze 문서의 mobile-first contract를 grid 전환 전에 고정한다.</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 20 }}>
      {items.map((item, index) => (
        <Card key={index} pad={18} style={{ minHeight: 124 }}>
          <div className="tm-text-micro tab-num" style={{ color: 'var(--blue500)' }}>{String(index + 1).padStart(2, '0')}</div>
          <div className="tm-text-body-lg" style={{ marginTop: 8 }}>{item.title}</div>
          <div className="tm-text-caption" style={{ marginTop: 6, lineHeight: 1.45 }}>{item.body}</div>
        </Card>
      ))}
    </div>
  </div>
);

const SMRevisionHomeMobile = ({ signedOut = false, network = false }) => {
  const featured = MATCHES[1];
  const dash = signedOut || network;
  return (
    <SMRevisionShell title="teameet" search notificationNew>
      <div style={{ padding: '20px 20px 0' }}>
        <div className="tm-text-heading">{signedOut || network ? '안녕하세요' : '안녕하세요, 정민님'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 18 }}>
          <Card pad={16}>
            <div className="tm-text-caption">이번달 활동</div>
            <NumberDisplay value={dash ? '-' : 12} unit={dash ? '' : '경기'} size={30} sub={dash ? '지난달 비교 -' : '지난달보다 3경기 많아요'}/>
          </Card>
          <Card pad={16}>
            <div className="tm-text-caption">매너점수</div>
            <NumberDisplay value={dash ? '-' : '4.9'} unit={dash ? '' : '점'} size={30} sub={dash ? '상위 -' : '상위 8%'}/>
          </Card>
        </div>
      </div>

      <div style={{ margin: '18px 20px 0' }}>
        <div className="tm-text-label" style={{ marginBottom: 8 }}>오늘의 추천</div>
        <Card pad={0} style={{ overflow: 'hidden' }}>
          <div style={{ height: 146, background: network ? 'var(--grey100)' : `url(${featured.img}) center/cover`, position: 'relative' }}>
            {!network && (
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(25,31,40,.08), rgba(25,31,40,.58))' }}>
                <div style={{ position: 'absolute', left: 16, right: 16, bottom: 14, color: 'var(--static-white)' }}>
                  <div className="tm-text-micro" style={{ color: 'var(--static-white)' }}>관심 종목 중 충원률 가장 높은 경기</div>
                  <div className="tm-text-subhead" style={{ color: 'var(--static-white)', marginTop: 4 }}>{featured.title}</div>
                </div>
              </div>
            )}
          </div>
          <div style={{ padding: 16 }}>
            {network ? (
              <div className="tm-text-body-lg">새로고침이 필요합니다</div>
            ) : (
              <>
                <div className="tm-text-body-lg">{featured.venue}</div>
                <div className="tm-text-caption" style={{ marginTop: 4 }}>{featured.date} {featured.time} · {featured.cur}/{featured.max}명</div>
              </>
            )}
          </div>
        </Card>
      </div>

      <div style={{ padding: '18px 20px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {['match', 'team match', 'team', 'my team'].map((label, index) => (
          <button key={label} className="tm-pressable" style={{ minHeight: 64, borderRadius: 14, background: index === 0 ? 'var(--blue500)' : 'var(--grey100)', color: index === 0 ? 'var(--static-white)' : 'var(--text-strong)', textAlign: 'left', padding: '12px 14px' }}>
            <div className="tm-text-label" style={{ color: 'inherit' }}>{label}</div>
            <div className="tm-text-micro" style={{ color: index === 0 ? 'rgba(255,255,255,.78)' : 'var(--text-caption)', marginTop: 4 }}>{['03 개인매치', '04 팀매치', '05 팀전체조회', '추후 결정'][index]}</div>
          </button>
        ))}
      </div>

      <div style={{ padding: '18px 20px 0' }}>
        <WeatherStrip city={signedOut ? '서울' : network ? '-' : '마포'} temp={network ? '-' : 18} cond={network ? '-' : '맑음'} wind={network ? '-' : 2}/>
      </div>

      <SectionTitle title="추천 매치" action="전체보기"/>
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {network ? (
          <EmptyState title="새로고침이 필요합니다" sub="이전 추천을 보존하고 다시 시도할 수 있어야 합니다." cta="다시 불러오기"/>
        ) : MATCHES.slice(0, 5).map((match) => (
          <ListItem key={match.id} title={match.title} sub={`${match.venue} · ${match.date} ${match.time}`} trailing={`${match.cur}/${match.max}`}/>
        ))}
      </div>

      <div style={{ padding: '18px 20px 24px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {['참가', 'MVP', '결제'].map((label, index) => (
          <Card key={label} pad={14}>
            <div className="tm-text-caption">{label}</div>
            <div className="tm-text-subhead tab-num" style={{ marginTop: 4 }}>{dash ? '-' : [8, 2, '86,000'][index]}</div>
          </Card>
        ))}
      </div>
    </SMRevisionShell>
  );
};

const SMRevisionHomeStates = () => (
  <SMRevisionShell title="홈 상태 기준" search notificationNew={false}>
    <div style={{ padding: 20 }}>
      {[
        ['비로그인', '인사는 닉네임 없이 표시하고 활동/매너/통계 값은 모두 - 처리한다. 추천은 랜덤 매치로 대체한다.'],
        ['네트워크 이슈', '인사는 유지하되 추천/공지/날씨는 새로고침 필요 또는 - 값으로 표시한다.'],
        ['알림 new', '상단 알림 액션은 new 여부를 점으로 구분한다.'],
        ['검색 노출', '상단 검색 버튼은 홈과 마이에서만 유지한다.']
      ].map(([title, body]) => (
        <Card key={title} pad={16} style={{ marginBottom: 10 }}>
          <div className="tm-text-body-lg">{title}</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>{body}</div>
        </Card>
      ))}
    </div>
  </SMRevisionShell>
);

const SMRevisionHomeNoticeRowV2 = ({ network = false }) => (
  <button className="tm-pressable tm-break-keep" type="button" style={{
    width: '100%',
    minHeight: 58,
    padding: '12px 14px',
    borderRadius: 14,
    background: 'var(--grey50)',
    border: '1px solid var(--grey100)',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    textAlign: 'left',
  }}>
    <span style={{ width: 34, height: 34, borderRadius: 12, background: network ? 'var(--orange50)' : 'var(--blue50)', color: network ? 'var(--orange500)' : 'var(--blue500)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
      <Icon name={network ? 'clock' : 'bell'} size={17}/>
    </span>
    <span style={{ flex: 1, minWidth: 0 }}>
      <span className="tm-text-label" style={{ display: 'block', color: 'var(--text-strong)' }}>
        {network ? '새로고침이 필요합니다' : '이번 주 고정 공지'}
      </span>
      <span className="tm-text-caption line-clamp-2" style={{ display: 'block', marginTop: 2 }}>
        {network ? '공지와 추천 데이터를 다시 불러올 수 있어야 합니다.' : '주말 경기장 혼잡 시간과 체크인 안내를 확인하세요.'}
      </span>
    </span>
    <Icon name="chevR" size={17} color="var(--grey400)"/>
  </button>
);

const SMRevisionHomeNoticeListV2 = ({ network = false }) => (
  <div style={{ display: 'grid', gap: 8 }}>
    {(network ? [
      ['새로고침이 필요합니다', '공지 데이터를 다시 불러와야 합니다.', '재시도'],
    ] : [
      ['이번 주 고정 공지', '주말 경기장 혼잡 시간과 체크인 안내', '오늘'],
      ['매너 점수 업데이트', '경기 후 리뷰 반영 기준 안내', '어제'],
      ['비 예보 경기 안내', '우천 시 취소/환불 기준 확인', '5월 2일'],
    ]).map(([title, sub, trailing]) => (
      <ListItem key={title} title={title} sub={sub} trailing={trailing} chev/>
    ))}
  </div>
);

const SMRevisionHomeShortcutV2 = ({ label, sub, active = false, disabled = false }) => (
  <button className="tm-pressable tm-break-keep" type="button" disabled={disabled} style={{
    minHeight: 68,
    borderRadius: 16,
    background: active ? 'var(--blue500)' : disabled ? 'var(--grey50)' : 'var(--grey100)',
    color: active ? 'var(--static-white)' : disabled ? 'var(--text-caption)' : 'var(--text-strong)',
    padding: '12px 14px',
    textAlign: 'left',
    opacity: disabled ? .72 : 1,
  }}>
    <span className="tm-text-label" style={{ color: 'inherit', display: 'block' }}>{label}</span>
    <span className="tm-text-micro" style={{ color: active ? 'rgba(255,255,255,.78)' : 'var(--text-caption)', display: 'block', marginTop: 5 }}>{sub}</span>
  </button>
);

const SMRevisionHomeMobileV2 = ({ signedOut = false, network = false }) => {
  const ranked = [...MATCHES].sort((a, b) => (b.cur / b.max) - (a.cur / a.max));
  const featured = signedOut ? MATCHES[0] : ranked[0];
  const dash = signedOut || network;
  return (
    <SMRevisionShell title="teameet" search notificationNew={!network}>
      <div style={{ padding: '8px 20px 24px' }}>
        <div className="tm-text-label" style={{ color: 'var(--text-muted)' }}>{dash ? '안녕하세요' : '안녕하세요, 정민님'}</div>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="tm-text-label" style={{ color: 'var(--text-muted)' }}>이번 달 활동</div>
            <NumberDisplay value={dash ? '-' : 12} unit={dash ? '' : '경기'} size={36} sub={dash ? '지난달 비교 -' : '지난달보다 +3'}/>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="tm-text-label" style={{ color: 'var(--text-muted)' }}>매너 점수</div>
            <NumberDisplay value={dash ? '-' : '4.9'} unit={dash ? '' : '점'} size={36} sub={dash ? '상위 -' : '상위 8%'}/>
          </div>
        </div>
      </div>

      <div style={{ margin: '0 20px 28px' }}>
        <div className="tm-text-label" style={{ marginBottom: 8 }}>오늘의 추천</div>
        <Card pad={0} style={{ overflow: 'hidden' }}>
          <div style={{ height: 146, background: network ? 'var(--grey100)' : `url(${featured.img}) center/cover`, position: 'relative' }}>
            {!network && (
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(25,31,40,.08), rgba(25,31,40,.58))' }}>
                <div style={{ position: 'absolute', left: 16, right: 16, bottom: 14, color: 'var(--static-white)' }}>
                  <div className="tm-text-micro" style={{ color: 'var(--static-white)' }}>{signedOut ? '랜덤 추천 매치' : '관심 종목 중 충원률 가장 높은 경기'}</div>
                  <div className="tm-text-subhead" style={{ color: 'var(--static-white)', marginTop: 4 }}>{featured.title}</div>
                </div>
              </div>
            )}
          </div>
          <div style={{ padding: 16 }}>
            {network ? (
              <>
                <div className="tm-text-body-lg">새로고침이 필요합니다</div>
                <button className="tm-btn tm-btn-sm tm-btn-primary" style={{ marginTop: 10 }}>다시 불러오기</button>
              </>
            ) : (
              <>
                <div className="tm-text-body-lg">{featured.venue}</div>
                <div className="tm-text-caption" style={{ marginTop: 4 }}>{featured.date} {featured.time} · {featured.cur}/{featured.max}명</div>
              </>
            )}
          </div>
        </Card>
      </div>

      <div style={{ padding: '0 20px 28px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '20px 12px', background: 'var(--grey50)', borderRadius: 16 }}>
          {[
            { label: '매치', sub: '03', color: 'var(--blue500)', bg: 'var(--blue50)', disabled: false },
            { label: '팀매치', sub: '04', color: 'var(--orange500)', bg: 'var(--orange50)', disabled: false },
            { label: '팀', sub: '05', color: 'var(--green500)', bg: 'var(--green50)', disabled: false },
            { label: '나의 팀', sub: '미정', color: 'var(--grey500)', bg: 'var(--grey100)', disabled: true },
          ].map((item) => (
            <button key={item.label} className="tm-pressable tm-break-keep" disabled={item.disabled} style={{ background: 'transparent', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: item.disabled ? .58 : 1 }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: item.bg, color: item.color, display: 'grid', placeItems: 'center', fontWeight: 800 }}>
                {item.label[0].toUpperCase()}
              </div>
              <span className="tm-text-micro" style={{ color: 'var(--text-strong)', textAlign: 'center', lineHeight: 1.2 }}>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '0 20px 24px' }}>
        <WeatherStrip city={signedOut ? '서울' : network ? '-' : '마포'} temp={network ? '-' : 18} cond={network ? '-' : '맑음'} wind={network ? '-' : 2}/>
      </div>

      <SectionTitle title="추천 매치" sub={network ? '다시 불러오기가 필요합니다' : '실력에 맞는 경기 5개'} action="전체보기"/>
      {network ? (
        <div style={{ padding: '0 20px 8px' }}>
          <EmptyState title="새로고침이 필요합니다" sub="추천 목록과 대표 매치를 다시 불러올 수 있어야 합니다." cta="다시 불러오기"/>
        </div>
      ) : (
        <div style={{ paddingLeft: 20, display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, paddingRight: 20 }}>
          {MATCHES.slice(0, 5).map((match) => (
            <button key={match.id} className="tm-pressable tm-break-keep" type="button" style={{ flexShrink: 0, width: 220, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', padding: 0, textAlign: 'left' }}>
              <div style={{ height: 110, background: `url(${match.img}) center/cover` }}/>
              <div style={{ padding: 12 }}>
                <div className="tm-text-micro" style={{ color: 'var(--blue500)' }}>{SPORTS.find(s => s.id === match.sport)?.label ?? match.sport}</div>
                <div className="tm-text-label line-clamp-2" style={{ color: 'var(--text-strong)', marginTop: 4, minHeight: 36 }}>{match.title}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                  <span className="tm-text-micro tab-num" style={{ color: 'var(--text-muted)' }}>{match.cur}/{match.max}명</span>
                  <span className="tm-text-label tab-num" style={{ color: 'var(--text-strong)' }}>{match.fee.toLocaleString()}원</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: '24px 20px 20px' }}>
        <SectionTitle title="이번 달 통계"/>
        <div style={{ background: 'var(--grey50)', borderRadius: 16, padding: '20px 16px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {['참가', 'MVP', '결제'].map((label, index) => (
            <KPIStat key={label} label={label} value={dash ? '-' : [8, 2, '86,000'][index]} unit={index === 2 || dash ? '' : index === 0 ? '회' : '개'}/>
          ))}
        </div>
      </div>

      <div style={{ padding: '0 20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '0 0 12px' }}>
          <div className="tm-text-body-lg">공지사항</div>
          <button className="tm-btn tm-btn-sm tm-btn-ghost" style={{ alignSelf: 'flex-end', minHeight: 30, padding: '0 4px' }}>전체보기</button>
        </div>
        <SMRevisionHomeNoticeListV2 network={network}/>
      </div>
    </SMRevisionShell>
  );
};

const SMRevisionHomeStatesV2 = () => (
  <SMRevisionShell title="홈 SM2 상태 기준" search notificationNew={false}>
    <div style={{ padding: 20, display: 'grid', gap: 10 }}>
      {[
        ['비로그인', '인사는 안녕하세요만 표시한다. 활동, 지난달 비교, 매너점수, 상위, 통계는 -로 처리하고 대표/추천 매치는 랜덤 조회로 대체한다.'],
        ['네트워크 이슈', '개인화 값을 모두 -로 유지하고 대표 추천, 추천 목록, 공지에는 새로고침이 필요합니다와 재시도 CTA를 둔다.'],
        ['대표 추천', '로그인 상태는 관심 종목 중 충원률이 가장 높은 경기 1개, 비로그인은 랜덤 경기 1개를 표시한다.'],
        ['공지', '고정 핀 공지사항만 노출하며 클릭 시 상세로 진입한다. 네트워크 이슈에서는 같은 슬롯에 복구 CTA를 둔다.'],
        ['미정 shortcut', 'my team 이동 위치는 아직 미정이므로 disabled/보류 상태로 표기하고 false affordance를 만들지 않는다.'],
      ].map(([title, body]) => (
        <Card key={title} pad={16}>
          <div className="tm-text-body-lg">{title}</div>
          <div className="tm-text-caption" style={{ marginTop: 6, lineHeight: 1.45 }}>{body}</div>
        </Card>
      ))}
    </div>
  </SMRevisionShell>
);

const SMRevisionHomeMobileGridV2 = () => (
  <SMRevisionRuleBoard title="02 홈 · SM 수정안 2 mobile grid" items={[
    { title: '보존 기준', body: '원본 02, Toss canonical, 기존 SM 수정안은 유지하고 같은 번호의 새 비교 섹션에서만 수정한다.' },
    { title: '모바일 main', body: '인사, 활동/매너, 대표 추천, shortcut, 날씨, 추천 5개, 통계, pinned 공지를 한 흐름으로 둔다.' },
    { title: '상태', body: '비로그인과 네트워크 이슈는 개인 수치 - 처리, 랜덤 추천/새로고침 필요, 공지 복구 CTA를 분리한다.' },
    { title: '인터랙션', body: '추천 항목은 상세 진입 chevron을 갖고, 전체보기는 03 개인 매치, team은 05 팀전체조회로 연결한다.' },
    { title: '미정 범위', body: 'my team 이동 위치는 결정 전까지 disabled 상태로 남겨 false affordance를 막는다.' },
    { title: '다음 단계', body: 'mobile 승인 후 M02 grid의 main/state/components/assets/motion을 SM2 기준으로 재작성한다.' },
  ]}/>
);

const SMRevisionHomeUIRulesV2 = () => (
  <div style={{ width: 840, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', padding: 24, overflow: 'hidden' }}>
    <Badge tone="blue" size="sm">02 HOME SM2 · UI RULES</Badge>
    <div className="tm-text-heading" style={{ marginTop: 10 }}>UI 규약</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 6 }}>
      상단바는 SM2 shell을 유지하고, 본문은 원본 HomeToss의 시각 리듬을 따른다.
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 20 }}>
      {[
        ['상단바', 'teameet 워드마크, 검색, 알림으로 구성한다. 검색은 홈에서 유지하고 알림은 new dot으로 상태를 구분한다.'],
        ['인사/숫자', '인사 아래 이번 달 활동과 매너 점수를 좌우 배치한다. 수치/점수는 NumberDisplay와 tabular number를 사용한다.'],
        ['오늘의 추천', 'SM 홈 모바일의 이미지 카드 패턴을 채택한다. 로그인은 충원률 기준, 비로그인은 랜덤 추천, 네트워크는 새로고침 상태를 보여준다.'],
        ['이동 버튼', '4개 이동은 아이콘형 quick action으로 구성한다. 라벨은 매치, 팀매치, 팀, 나의 팀이며 나의 팀은 목적지 확정 전 disabled다.'],
        ['추천 목록', '가로 스크롤 카드 리스트를 사용한다. 각 카드는 이미지, 종목, 제목, 인원, 가격을 포함하고 탭하면 상세로 이동한다.'],
        ['통계/공지', '통계는 원본의 grey block + KPIStat 리듬을 따른다. 공지사항은 설명 문구 없이 목록만 노출하고 우측 하단에 전체보기를 둔다.'],
        ['색/강조', 'blue는 CTA/선택/주요 추천에만 사용한다. deep shadow, content-wide glass, decorative hero text는 쓰지 않는다.'],
        ['상태 표현', '비로그인/네트워크 상태에서도 레이아웃 shape를 유지한다. 값이 없으면 -로 표시하고, 실패는 재시도 CTA를 같이 제공한다.'],
      ].map(([title, body], index) => (
        <Card key={title} pad={18} style={{ minHeight: 132 }}>
          <div className="tm-text-micro tab-num" style={{ color: 'var(--blue500)' }}>{String(index + 1).padStart(2, '0')}</div>
          <div className="tm-text-body-lg" style={{ marginTop: 8 }}>{title}</div>
          <div className="tm-text-caption" style={{ marginTop: 6, lineHeight: 1.45 }}>{body}</div>
        </Card>
      ))}
    </div>
  </div>
);

const SMRevisionHomeFlowCardV2 = ({ index, title, trigger, feedback, next, state }) => (
  <Card pad={16} style={{ minHeight: 142 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
      <div className="tm-text-micro tab-num" style={{ color: 'var(--blue500)' }}>{String(index).padStart(2, '0')}</div>
      <Badge tone={state === 'blocked' ? 'orange' : state === 'error' ? 'red' : 'blue'} size="sm">{state}</Badge>
    </div>
    <div className="tm-text-body-lg" style={{ marginTop: 8 }}>{title}</div>
    <div style={{ display: 'grid', gap: 5, marginTop: 8 }}>
      <div className="tm-text-caption"><b>Trigger</b> · {trigger}</div>
      <div className="tm-text-caption"><b>Feedback</b> · {feedback}</div>
      <div className="tm-text-caption"><b>Next</b> · {next}</div>
    </div>
  </Card>
);

const SMRevisionHomeInteractionFlowV2 = () => (
  <div style={{ width: 840, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 24, overflow: 'hidden' }}>
    <Badge tone="blue" size="sm">02 HOME SM2 · INTERACTION FLOW</Badge>
    <div className="tm-text-heading" style={{ marginTop: 10 }}>버튼별 동작/상태 흐름</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 6 }}>
      모든 탭 액션은 즉시 press feedback을 주고, 이동/상태 변경/복구 CTA 중 하나로 끝난다.
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginTop: 20 }}>
      <SMRevisionHomeFlowCardV2
        index={1}
        title="검색"
        trigger="상단 검색 버튼 탭"
        feedback="버튼 scale(.98), SM2 홈 검색 페이지 진입"
        next="최근 검색/빠른 조건을 먼저 보여주고, 제출 후 매치·팀매치·팀 결과로 분기"
        state="route"
      />
      <SMRevisionHomeFlowCardV2
        index={2}
        title="알림"
        trigger="상단 알림 버튼 탭"
        feedback="new dot 유지/해제는 알림 목록 backfill 이후 결정"
        next="06 알림 목록으로 이동. 읽음 처리는 알림 화면에서 수행"
        state="route"
      />
      <SMRevisionHomeFlowCardV2
        index={3}
        title="오늘의 추천 카드"
        trigger="대표 추천 카드 또는 상세보기 탭"
        feedback="카드 press 후 selected match context 유지"
        next="로그인/비로그인 모두 개인 매치 상세로 이동. 네트워크 상태면 재시도 CTA만 동작"
        state="route"
      />
      <SMRevisionHomeFlowCardV2
        index={4}
        title="매치"
        trigger="quick action 매치 탭"
        feedback="active blue action press"
        next="03 개인 매치 목록으로 이동"
        state="route"
      />
      <SMRevisionHomeFlowCardV2
        index={5}
        title="팀매치"
        trigger="quick action 팀매치 탭"
        feedback="orange icon action press"
        next="04 팀매치 목록으로 이동"
        state="route"
      />
      <SMRevisionHomeFlowCardV2
        index={6}
        title="팀"
        trigger="quick action 팀 탭"
        feedback="green icon action press"
        next="05 팀 전체조회/팀 둘러보기로 이동"
        state="route"
      />
      <SMRevisionHomeFlowCardV2
        index={7}
        title="나의 팀"
        trigger="quick action 나의 팀 탭"
        feedback="disabled 상태 유지. 목적지 미정 문구를 노출"
        next="이동하지 않는다. 목적지 확정 후 route 연결"
        state="blocked"
      />
      <SMRevisionHomeFlowCardV2
        index={8}
        title="추천 매치 전체보기"
        trigger="추천 매치 섹션 전체보기 탭"
        feedback="텍스트 버튼 press"
        next="03 개인 매치 목록으로 이동하고 추천/개인화 필터를 유지"
        state="route"
      />
      <SMRevisionHomeFlowCardV2
        index={9}
        title="추천 카드"
        trigger="가로 추천 카드 탭"
        feedback="카드 press, title/context 유지"
        next="선택한 개인 매치 상세로 이동"
        state="route"
      />
      <SMRevisionHomeFlowCardV2
        index={10}
        title="공지사항 전체보기"
        trigger="공지사항 우측 하단 전체보기 탭"
        feedback="ghost button press"
        next="공지 목록으로 이동. 현재는 pinned notice만 표시"
        state="route"
      />
      <SMRevisionHomeFlowCardV2
        index={11}
        title="공지 항목"
        trigger="공지 row 탭"
        feedback="ListItem press + chevron"
        next="공지 상세로 이동. 네트워크 상태면 재시도 상태 row만 노출"
        state="route"
      />
      <SMRevisionHomeFlowCardV2
        index={12}
        title="다시 불러오기"
        trigger="네트워크 이슈 상태의 재시도 CTA 탭"
        feedback="pending/loading state로 전환하고 기존 layout shape 유지"
        next="성공하면 SM2 main, 실패하면 network state 유지"
        state="error"
      />
    </div>
  </div>
);

const SMRevisionHomeSearchResultRowV2 = ({ type, title, meta, badge, tone = 'blue', compact = false }) => (
  <Card pad={compact ? 12 : 14} interactive>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: compact ? 36 : 42, height: compact ? 36 : 42, borderRadius: compact ? 12 : 14, background: tone === 'orange' ? 'rgba(254,152,0,.12)' : tone === 'green' ? 'rgba(3,178,108,.10)' : 'var(--blue50)', color: tone === 'orange' ? 'var(--orange500)' : tone === 'green' ? 'var(--green500)' : 'var(--blue500)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon name={type === 'team' ? 'people' : 'calendar'} size={compact ? 18 : 20}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <Badge tone={tone} size="sm">{badge}</Badge>
          <div className="tm-text-body-lg line-clamp-1">{title}</div>
        </div>
        <div className="tm-text-caption line-clamp-1" style={{ marginTop: 4 }}>{meta}</div>
      </div>
      <div className="tm-text-caption" style={{ color: 'var(--grey400)' }}>이동</div>
    </div>
  </Card>
);

const SMRevisionHomeSearchResultsV2 = ({ variant = 'grouped' }) => {
  const match = MATCHES[1];
  const teamMatch = TEAM_MATCHES[1];
  const team = TEAMS[1];
  const groups = [
    { key: 'match', label: '매치', count: 12, tone: 'blue', rows: [
      { type: 'match', badge: '매치', title: match.title, meta: `${match.venue} · ${match.date} ${match.time} · ${match.cur}/${match.max}명`, tone: 'blue' },
    ] },
    { key: 'teamMatch', label: '팀매치', count: 4, tone: 'orange', rows: [
      { type: 'teamMatch', badge: '팀매치', title: teamMatch.title, meta: `${teamMatch.venue} · ${teamMatch.format} · ${teamMatch.cost.toLocaleString()}원`, tone: 'orange' },
    ] },
    { key: 'team', label: '팀', count: 7, tone: 'green', rows: [
      { type: 'team', badge: '팀', title: team.name, meta: `${team.sport} · ${team.members}명 · 매너 ${team.manner}`, tone: 'green' },
    ] },
  ];

  if (variant === 'segmented') {
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {groups.map((group, index) => (
            <button key={group.key} className={`tm-chip ${index === 0 ? 'tm-chip-active' : ''}`} style={{ minHeight: 42, justifyContent: 'center' }}>
              {group.label} <span className="tab-num">{group.count}</span>
            </button>
          ))}
        </div>
        <Card pad={14} style={{ marginTop: 12, background: 'var(--blue50)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <div>
              <div className="tm-text-label" style={{ color: 'var(--blue500)' }}>매치 결과 먼저 보기</div>
              <div className="tm-text-caption" style={{ marginTop: 3 }}>선택한 탭 안에서만 상세 조건을 이어갑니다.</div>
            </div>
            <button className="tm-btn tm-btn-sm tm-btn-primary">12개</button>
          </div>
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
          <SMRevisionHomeSearchResultRowV2 type="match" badge="매치" title={match.title} meta={`${match.venue} · ${match.date} ${match.time} · ${match.cur}/${match.max}명`} tone="blue" compact/>
          <SMRevisionHomeSearchResultRowV2 type="match" badge="매치" title={MATCHES[0].title} meta={`${MATCHES[0].venue} · ${MATCHES[0].date} ${MATCHES[0].time} · ${MATCHES[0].cur}/${MATCHES[0].max}명`} tone="blue" compact/>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
          {groups.slice(1).map((group) => (
            <Card key={group.key} pad={13} interactive>
              <Badge tone={group.tone} size="sm">{group.label}</Badge>
              <div className="tm-text-body-lg tab-num" style={{ marginTop: 8 }}>{group.count}개</div>
              <div className="tm-text-caption" style={{ marginTop: 4 }}>탭하면 해당 결과만 보기</div>
            </Card>
          ))}
        </div>
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {groups.map((group) => (
        <div key={group.key}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Badge tone={group.tone} size="sm">{group.label}</Badge>
              <div className="tm-text-label"><span className="tab-num">{group.count}</span>개</div>
            </div>
            <button className="tm-btn tm-btn-sm tm-btn-ghost">더보기</button>
          </div>
          {group.rows.map((row) => <SMRevisionHomeSearchResultRowV2 key={row.type} {...row}/>)}
        </div>
      ))}
    </div>
  );
};

const SMRevisionHomeSearchMobileV2 = ({ variant = 'grouped' }) => {
  const totalCount = 23;
  return (
    <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <StatusBar/>
      <div style={{ minHeight: 58, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--grey100)' }}>
        <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="뒤로가기">
          <Icon name="chevL" size={22}/>
        </button>
        <div style={{ flex: 1, minHeight: 44, borderRadius: 12, background: 'var(--grey100)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 13px', boxShadow: '0 0 0 2px var(--blue50)' }}>
          <Icon name="search" size={18}/>
          <span className="tm-text-body" style={{ color: 'var(--text-strong)' }}>풋살</span>
          <span style={{ width: 1, height: 18, background: 'var(--blue500)' }}/>
          <button className="tm-btn tm-btn-icon tm-btn-primary" aria-label="검색 실행" style={{ width: 32, height: 32, minHeight: 32, marginLeft: 'auto', borderRadius: 10 }}>
            <Icon name="search" size={17}/>
          </button>
        </div>
        <button className="tm-btn tm-btn-sm tm-btn-ghost">취소</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px 22px' }}>
        <div>
          <div className="tm-text-label">최근 검색</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {['풋살', '강남', '오늘 저녁', '마감임박'].map((label, index) => (
              <button key={label} className={`tm-chip ${index === 0 ? 'tm-chip-active' : ''}`}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <div className="tm-text-label">빠른 조건</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            {[
              ['오늘 참여 가능', '오늘매치수 기준'],
              ['내 주변 5km', '위치 권한 확인'],
              ['마감임박', '24시간 이내'],
              ['초급 환영', '레벨 필터 적용'],
            ].map(([title, sub], index) => (
              <Card key={title} pad={14} interactive style={{ background: index === 0 ? 'var(--blue50)' : 'var(--bg)' }}>
                <div className="tm-text-label" style={{ color: index === 0 ? 'var(--blue500)' : 'var(--text-strong)' }}>{title}</div>
                <div className="tm-text-micro" style={{ marginTop: 4, color: 'var(--text-caption)' }}>{sub}</div>
              </Card>
            ))}
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--grey100)', margin: '20px 0 18px' }}/>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="tm-text-label">검색 결과</div>
            <div className="tm-text-caption" style={{ marginTop: 2 }}><span className="tab-num">{totalCount}</span>개 결과 · 매치/팀매치/팀 통합 조회</div>
          </div>
          <button className="tm-btn tm-btn-sm tm-btn-neutral">전체보기</button>
        </div>
        <div style={{ marginTop: 12 }}>
          <SMRevisionHomeSearchResultsV2 variant={variant}/>
        </div>

        <Card pad={14} style={{ marginTop: 14, background: 'var(--grey50)' }}>
          <div className="tm-text-label">상태 기준</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>결과 없음은 검색어 유지 + 전체 보기/조건 초기화, 오류는 검색어와 빠른 조건을 보존한 재시도 CTA로 복구합니다.</div>
        </Card>
      </div>
    </div>
  );
};

const SMRevisionHomeSearchRulesV2 = () => (
  <div style={{ width: 840, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', padding: 24, overflow: 'hidden' }}>
    <Badge tone="blue" size="sm">02 HOME SM2 · SEARCH CONTRACT</Badge>
    <div className="tm-text-heading" style={{ marginTop: 10 }}>검색 페이지 동작/상태 규약</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 6 }}>
      상단 검색 버튼은 홈과 마이에서만 유지한다. 홈 검색은 하단 탭 없이 집중 검색 페이지로 진입한다.
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginTop: 20 }}>
      {[
        ['진입', '홈 상단 검색 버튼을 누르면 press feedback 후 검색 페이지로 전환한다. 뒤로가기와 취소는 모두 홈 main으로 복귀한다.'],
        ['입력 전', '최근 검색과 빠른 조건을 먼저 보여준다. 최근 검색 chip은 즉시 해당 검색어를 입력하고 결과 영역을 갱신한다.'],
        ['입력 중', '검색어, 커서, 검색 실행 아이콘, 취소 버튼을 노출한다. 빠른 조건 chip은 active blue와 count/설명을 함께 보여준다.'],
        ['결과', '매치, 팀매치, 팀을 한 페이지에 묶되 각 row에는 목적지 타입을 badge로 표시한다. row tap은 해당 상세/목록으로 이동한다.'],
        ['결과 없음', '빈 화면은 단순 없음이 아니라 전체 보기, 조건 초기화, 검색어 수정 중 하나를 제공한다. 검색어는 지우지 않는다.'],
        ['오류', '네트워크 오류는 query/context를 보존하고 재시도 CTA를 제공한다. toast만으로 오류를 대체하지 않는다.'],
        ['stale query', '빠른 연속 입력/조건 선택 시 마지막 입력값을 source로 삼고 이전 결과가 덮어쓰지 않게 한다.'],
        ['권한', '내 주변 조건은 위치 권한이 없으면 권한 안내 상태를 먼저 보여주고 임의 위치로 성공 처리하지 않는다.'],
        ['범위', '홈 검색은 discovery entry다. 상세 필터와 카드/콤팩트 전환은 03/04 목록 화면에서 이어받는다.'],
      ].map(([title, body], index) => (
        <Card key={title} pad={16} style={{ minHeight: 146 }}>
          <div className="tm-text-micro tab-num" style={{ color: 'var(--blue500)' }}>{String(index + 1).padStart(2, '0')}</div>
          <div className="tm-text-body-lg" style={{ marginTop: 8 }}>{title}</div>
          <div className="tm-text-caption" style={{ marginTop: 6, lineHeight: 1.45 }}>{body}</div>
        </Card>
      ))}
    </div>
  </div>
);

const SMRevisionMatchListMobile = ({ team = false, compact = false }) => {
  const list = team ? TEAM_MATCHES : MATCHES;
  return (
    <SMRevisionShell title={team ? '팀매치' : '매치'} notificationNew bottom navActive={team ? 'teamMatches' : 'matches'}>
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, minHeight: 48, borderRadius: 12, background: 'var(--grey100)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', color: 'var(--text-caption)' }}>
            <Icon name="search" size={18}/>
            <span className="tm-text-body">지역, 시간, 팀명 검색</span>
          </div>
          <button className="tm-btn tm-btn-icon tm-btn-neutral" aria-label="콤팩트 보기">ㅁ|ㅁ</button>
          <button className="tm-btn tm-btn-icon tm-btn-primary" aria-label="카드 보기">ㅁ</button>
        </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '16px 0' }}>
          {SPORTS.slice(0, 7).map((sport, index) => (
            <HapticChip key={sport.id} active={index === 0} count={index === 0 ? list.length : index + 2}>{sport.label}</HapticChip>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          {['매치수', '오늘매치수', '마감임박'].map((label, index) => (
            <Card key={label} pad={12}>
              <div className="tm-text-caption">{label}</div>
              <div className="tm-text-subhead tab-num" style={{ marginTop: 4 }}>{[list.length, 3, 2][index]}</div>
            </Card>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.slice(0, 4).map((item, index) => compact ? (
            <Card key={item.id} pad={12}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 58, height: 58, borderRadius: 12, background: team ? 'var(--blue50)' : `url(${item.img}) center/cover`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  {team && <div className="tm-text-label" style={{ color: 'var(--blue500)' }}>{item.grade}</div>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="tm-text-body-lg line-clamp-2">{item.title}</div>
                  <div className="tm-text-caption" style={{ marginTop: 4 }}>{item.venue} · {item.time}</div>
                  <div className="tm-text-caption tab-num" style={{ marginTop: 4 }}>{team ? `${item.format} · ${item.cost.toLocaleString()}원 · ${item.grade}등급` : `${item.cur}/${item.max}명 · ${item.fee.toLocaleString()}원`}</div>
                </div>
              </div>
            </Card>
          ) : (
            <Card key={item.id} pad={0} style={{ overflow: 'hidden' }}>
              <div style={{ height: 140, background: team ? 'var(--grey900)' : `url(${item.img}) center/cover`, position: 'relative' }}>
                <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6 }}>
                  <Badge tone="blue">{team ? item.sport : item.level}</Badge>
                  <Badge tone={index === 1 ? 'red' : 'grey'}>{index === 1 ? '마감임박' : item.date}</Badge>
                </div>
                <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12, color: 'var(--static-white)' }}>
                  <div className="tm-text-label" style={{ color: 'var(--static-white)' }}>{item.date} {item.time}</div>
                </div>
              </div>
              <div style={{ padding: 16 }}>
                <div className="tm-text-body-lg">{team ? item.host : item.title}</div>
                <div className="tm-text-caption" style={{ marginTop: 4 }}>{item.venue}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                  <span className="tm-text-caption tab-num">{team ? `${item.format} · ${item.grade}등급` : `${item.cur}/${item.max}명`}</span>
                  <span className="tm-text-label tab-num">{team ? `${item.cost.toLocaleString()}원` : `${item.fee.toLocaleString()}원`}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </SMRevisionShell>
  );
};

const SMRevisionMatchDetailMobile = ({ team = false, mine = false }) => {
  const match = team ? TEAM_MATCHES[0] : MATCHES[0];
  return (
    <SMRevisionShell title="" back notificationNew={false} bottom={false}>
      <div style={{ height: 208, background: team ? 'var(--grey900)' : `url(${match.img}) center/cover`, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(25,31,40,.04), rgba(25,31,40,.66))' }}/>
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 18, color: 'var(--static-white)' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <Badge tone="blue">{team ? match.sport : match.level}</Badge>
            <Badge tone="orange">승인중/승인완료 상태 지원</Badge>
          </div>
          <div className="tm-text-heading" style={{ color: 'var(--static-white)' }}>{team ? `${match.host} vs 상대팀` : match.title}</div>
        </div>
      </div>
      <div style={{ padding: '6px 20px 110px' }}>
        <SMRevisionInfoRow label="일시" value={`${match.date} ${match.time}`}/>
        <SMRevisionInfoRow label="장소" value={match.venue}/>
        <SMRevisionInfoRow label={team ? '경기 정보' : '인원'} value={team ? `${match.format} · 전후반 · ${match.grade}등급` : `${match.cur}/${match.max}명 모집`}/>
        <SMRevisionInfoRow label={team ? '참가비' : '참가비'} value={`${(team ? match.cost : match.fee).toLocaleString()}원`} sub={team ? '팀 단위 정산' : '승인 후 결제 단계로 이동'}/>
        <Card pad={16} style={{ marginTop: 14 }}>
          <div className="tm-text-body-lg">{team ? '팀 정보 보러가기' : '호스트 정보'}</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>{team ? '팀 상세조회로 이동해 매너, 전적, 멤버 구성을 확인합니다.' : '주최 횟수 18회 · 매너 4.9 · 프로필 바로가기 가능'}</div>
        </Card>
        <Card pad={16} style={{ marginTop: 10 }}>
          <div className="tm-text-body-lg">{team ? '채팅 및 신청 흐름' : '참가자 리스트'}</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>{team ? '채팅 후 신청하기. 신청 CTA는 bottom sheet에서 결제하고 신청하기로 확정합니다.' : '참가자 프로필 조회 가능. 더보기는 참가자 리스트 페이지로 이동합니다.'}</div>
        </Card>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="tm-text-caption">{mine ? '내가 만든 매치' : '결제 전 요약 확인'}</span>
          <span className="tm-text-label tab-num">{(team ? match.cost : match.fee).toLocaleString()}원</span>
        </div>
        <SBtn full size="lg">{mine ? '매치 관리' : team ? '결제하고 신청하기' : '결제하고 참가하기'}</SBtn>
      </div>
    </SMRevisionShell>
  );
};

const SM3_MATCH_STATS = [
  ['매치수', '42', '선택 종목 기준'],
  ['오늘매치수', '7', '서울 전체'],
  ['마감임박', '4', '24시간 이내'],
];

const SMRevisionMatchSM3Header = ({ mode = 'card', query = '' }) => (
  <div style={{ padding: '18px 20px 0' }}>
    <div style={{ display: 'flex', gap: 8 }}>
      <div style={{ flex: 1, minHeight: 48, borderRadius: 12, background: 'var(--grey100)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', color: 'var(--text-caption)' }}>
        <Icon name="search" size={18}/>
        <span className="tm-text-body" style={{ color: query ? 'var(--text-strong)' : 'var(--text-caption)' }}>{query || '지역, 시간, 매치명 검색'}</span>
      </div>
      <button className="tm-btn tm-btn-icon tm-btn-neutral" aria-label={mode === 'card' ? '콤팩트 보기로 전환' : '카드 보기로 전환'}>
        {mode === 'card' ? 'ㅁ|ㅁ' : 'ㅁ'}
      </button>
    </div>
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '16px 0 14px' }}>
      {SPORTS.slice(0, 7).map((sport, index) => (
        <HapticChip key={sport.id} active={index === 0} count={index === 0 ? MATCHES.length : index + 2}>{sport.label}</HapticChip>
      ))}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, padding: '2px 0 4px' }}>
      {SM3_MATCH_STATS.map(([label, value, sub]) => (
        <div key={label} style={{ minWidth: 0 }}>
          <div className="tm-text-caption">{label}</div>
          <div className="tm-text-subhead tab-num" style={{ marginTop: 4 }}>{value}</div>
          <div className="tm-text-micro" style={{ marginTop: 2, color: 'var(--text-caption)' }}>{sub}</div>
        </div>
      ))}
    </div>
  </div>
);

const SMRevisionMatchSM3CardItem = ({ item, index }) => (
  <Card pad={0} style={{ overflow: 'hidden' }}>
    <div style={{ height: 148, background: `url(${item.img}) center/cover`, position: 'relative' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(25,31,40,.02), rgba(25,31,40,.58))' }}/>
      <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Badge tone="blue">{SPORTS.find((sport) => sport.id === item.sport)?.label || item.sport}</Badge>
          <Badge tone="grey">{item.level}</Badge>
        </div>
        <Badge tone={item.urgent || index === 1 ? 'orange' : 'grey'}>{item.urgent || index === 1 ? '마감임박' : '모집중'}</Badge>
      </div>
      <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12, color: 'var(--static-white)' }}>
        <div className="tm-text-label" style={{ color: 'var(--static-white)' }}>{item.date} · {item.time}</div>
      </div>
    </div>
    <div style={{ padding: 16 }}>
      <div className="tm-text-body-lg" style={{ color: 'var(--text-strong)' }}>{item.title}</div>
      <div className="tm-text-caption" style={{ marginTop: 5 }}>{item.venue}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end', marginTop: 12 }}>
        <div className="tm-text-caption tab-num">{item.cur}/{item.max}명 · 주최 {item.host}</div>
        <div className="tm-text-label tab-num">{item.fee.toLocaleString()}원</div>
      </div>
    </div>
  </Card>
);

const SMRevisionMatchSM3CompactItem = ({ item }) => (
  <Card pad={12}>
    <div style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) auto', gap: 12, alignItems: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: 12, background: `url(${item.img}) center/cover`, position: 'relative', overflow: 'hidden' }}>
        {item.urgent && <span style={{ position: 'absolute', left: 6, bottom: 6, borderRadius: 999, padding: '3px 6px', background: 'var(--orange500)', color: 'var(--static-white)' }} className="tm-text-micro">마감</span>}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="tm-text-body-lg" style={{ color: 'var(--text-strong)' }}>{item.title}</div>
        <div className="tm-text-caption" style={{ marginTop: 4 }}>{item.venue}</div>
        <div className="tm-text-caption tab-num" style={{ marginTop: 3 }}>{item.cur}/{item.max}명 · {item.date} {item.time}</div>
      </div>
      <div className="tm-text-label tab-num" style={{ color: 'var(--text-strong)', textAlign: 'right' }}>{item.fee.toLocaleString()}원</div>
    </div>
  </Card>
);

const SMRevisionMatchListMobileSM3 = ({ mode = 'card' }) => (
  <SMRevisionShell title="teameet" notificationNew bottom navActive="matches">
    <SMRevisionMatchSM3Header mode={mode}/>
    <div style={{ padding: '16px 20px 24px' }}>
      <div style={{ marginBottom: 10 }}>
        <div>
          <div className="tm-text-label">개인 매치</div>
          <div className="tm-text-caption" style={{ marginTop: 2 }}>카드형과 콤팩트형 중 하나만 선택해 비교합니다.</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {MATCHES.slice(0, mode === 'card' ? 3 : 5).map((item, index) => (
          mode === 'card'
            ? <SMRevisionMatchSM3CardItem key={item.id} item={item} index={index}/>
            : <SMRevisionMatchSM3CompactItem key={item.id} item={item}/>
        ))}
      </div>
    </div>
  </SMRevisionShell>
);

const SMRevisionMatchSearchMobileSM3 = () => {
  const results = MATCHES.filter((item) => item.title.includes('풋살') || item.venue.includes('풋살'));
  return (
    <SMRevisionShell title="teameet" notificationNew bottom navActive="matches">
      <SMRevisionMatchSM3Header mode="compact" query="풋살"/>
      <div style={{ padding: '16px 20px 24px' }}>
        <div style={{ marginBottom: 12 }}>
          <div className="tm-text-label">검색 결과</div>
          <div className="tm-text-caption" style={{ marginTop: 2 }}><span className="tab-num">{results.length}</span>개 매치 · 검색 조건은 유지한 채 보기 모드만 전환합니다.</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {results.map((item) => <SMRevisionMatchSM3CompactItem key={item.id} item={item}/>)}
        </div>
        <Card pad={14} style={{ marginTop: 14, background: 'var(--grey50)' }}>
          <div className="tm-text-label">검색 화면 규칙</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>검색어가 들어오면 카운터와 종목 selector는 그대로 유지하고, 목록 영역만 검색 결과로 바꾼다. 결과가 없으면 조회 없음 상태 보드로 연결한다.</div>
        </Card>
      </div>
    </SMRevisionShell>
  );
};

const SMRevisionMatchSearchFocusMobileSM3 = () => (
  <SMRevisionShell title="teameet" notificationNew={false} bottom navActive="matches">
    <div style={{ padding: '18px 20px 0' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1, minHeight: 48, borderRadius: 12, background: 'var(--grey100)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', color: 'var(--text-strong)', boxShadow: '0 0 0 2px var(--blue50)' }}>
          <Icon name="search" size={18}/>
          <span className="tm-text-body">풋살</span>
          <span style={{ width: 1, height: 20, background: 'var(--blue500)', marginLeft: 2 }}/>
        </div>
        <button className="tm-btn tm-btn-sm tm-btn-ghost">취소</button>
      </div>
    </div>
    <div style={{ padding: '18px 20px 24px' }}>
      <div className="tm-text-label">최근 검색</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {['풋살', '강남', '오늘 저녁', '마감임박'].map((label, index) => (
          <button key={label} className={`tm-chip ${index === 0 ? 'tm-chip-active' : ''}`}>{label}</button>
        ))}
      </div>
      <div style={{ height: 1, background: 'var(--grey100)', margin: '20px 0' }}/>
      <div className="tm-text-label">빠른 조건</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
        {[
          ['오늘 참여 가능', '오늘매치수 기준'],
          ['내 주변 5km', '위치 권한 필요 시 안내'],
          ['마감임박', '24시간 이내'],
          ['초급 환영', '레벨 필터 적용'],
        ].map(([title, sub]) => (
          <Card key={title} pad={14} interactive>
            <div className="tm-text-label">{title}</div>
            <div className="tm-text-micro" style={{ marginTop: 4, color: 'var(--text-caption)' }}>{sub}</div>
          </Card>
        ))}
      </div>
      <Card pad={14} style={{ marginTop: 18, background: 'var(--grey50)' }}>
        <div className="tm-text-label">검색 진입 규칙</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>검색바를 누르면 목록은 즉시 검색 모드로 전환한다. 하단 탭은 유지하고, 입력 중에는 취소 버튼과 최근 검색/빠른 조건을 먼저 보여준다.</div>
      </Card>
    </div>
  </SMRevisionShell>
);

const SMRevisionMatchStateMobileSM3 = ({ state = 'empty', noTop = false }) => {
  const isError = state === 'error';
  const Shell = noTop ? SMRevisionMatchSM4Shell : SMRevisionShell;
  return (
    <Shell title="teameet" notificationNew={false} bottom navActive="matches">
      {noTop ? <SMRevisionMatchSM4SearchHeader mode="card"/> : <SMRevisionMatchSM3Header mode="card"/>}
      <div style={{ padding: 20 }}>
        <Card pad={22} style={{ textAlign: 'center', minHeight: 246, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, background: isError ? 'rgba(254,152,0,.12)' : 'var(--grey100)', color: isError ? 'var(--orange500)' : 'var(--grey500)', display: 'grid', placeItems: 'center', marginBottom: 14 }}>
            <Icon name={isError ? 'bell' : 'calendar'} size={25}/>
          </div>
          <div className="tm-text-subhead">{isError ? '새로고침 필요합니다 필요' : '매치가 없습니다'}</div>
          <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text)' }}>{isError ? '네트워크 이슈 상태는 원문 문구를 보존하고, 사용자가 잃은 검색 조건 없이 다시 시도하게 합니다.' : '선택한 종목과 지역에 맞는 매치가 없을 때는 다른 종목 또는 전체 목록으로 복구합니다.'}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <button className="tm-btn tm-btn-md tm-btn-primary">{isError ? '새로고침' : '전체 보기'}</button>
            <button className="tm-btn tm-btn-md tm-btn-neutral">필터 초기화</button>
          </div>
        </Card>
      </div>
    </Shell>
  );
};

const SMRevisionMatchDetailMobileSM3 = ({ mine = false, status = 'default', sheet = false, noTop = false }) => {
  const match = MATCHES[0];
  const joined = status !== 'default';
  const locked = status === 'pending' || status === 'approved';
  const actionLabel = mine ? '매치 관리' : status === 'pending' ? '승인중' : status === 'approved' ? '승인완료' : '참가하기';
  const Shell = noTop ? SMRevisionMatchSM4Shell : SMRevisionShell;
  return (
    <Shell title="" back notificationNew={false} bottom={false}>
      <div style={{ height: 216, background: `url(${match.img}) center/cover`, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(25,31,40,.04), rgba(25,31,40,.66))' }}/>
        <div style={{ position: 'absolute', top: 12, right: 18, display: 'flex', gap: 4 }}>
          <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="공유" style={{ color: 'var(--static-white)' }}><Icon name="share" size={21}/></button>
          <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="알림" style={{ color: 'var(--static-white)' }}><Icon name="bell" size={21}/></button>
        </div>
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 18, color: 'var(--static-white)' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <Badge tone="blue">{SPORTS.find((sport) => sport.id === match.sport)?.label || match.sport}</Badge>
            <Badge tone="grey">{match.level}</Badge>
            <Badge tone={match.urgent ? 'orange' : 'grey'}>{match.urgent ? '마감임박' : '모집중'}</Badge>
          </div>
          <div className="tm-text-heading" style={{ color: 'var(--static-white)' }}>{match.title}</div>
        </div>
      </div>
      <div style={{ padding: '6px 20px 118px' }}>
        <SMRevisionInfoRow label="일시" value={`${match.date} ${match.time}`}/>
        <SMRevisionInfoRow label="장소" value={match.venue}/>
        <SMRevisionInfoRow label="인원" value={`${match.cur}/${match.max}명 모집`} sub="모집 완료 시 참가 CTA를 막고 이유를 표시한다."/>
        <SMRevisionInfoRow label="참가비" value={`${match.fee.toLocaleString()}원`} sub="승인 후 결제 단계로 이동"/>
        {joined && (
          <Card pad={14} style={{ marginTop: 14, background: status === 'approved' ? 'rgba(3,178,108,.08)' : 'rgba(254,152,0,.10)' }}>
            <div className="tm-text-label" style={{ color: status === 'approved' ? 'var(--green500)' : 'var(--orange500)' }}>{status === 'approved' ? '승인완료' : '승인중'}</div>
            <div className="tm-text-caption" style={{ marginTop: 5 }}>{status === 'approved' ? '참가가 확정되었습니다. 결제 내역과 매치 상세를 계속 확인할 수 있습니다.' : '호스트 승인 대기 중입니다. 처리 주체와 다음 상태를 계속 노출합니다.'}</div>
          </Card>
        )}
        <Card pad={16} style={{ marginTop: 14 }}>
          <div className="tm-text-body-lg">호스트 정보</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>주최 횟수 18회 · 매너 4.9 · 프로필 바로가기 가능</div>
        </Card>
        <Card pad={16} style={{ marginTop: 10 }}>
          <div className="tm-text-body-lg">경기 소개글</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>시간 맞춰 도착할 수 있는 분만 신청해주세요. 초급도 편하게 참여할 수 있습니다.</div>
        </Card>
        <Card pad={16} style={{ marginTop: 10 }}>
          <div className="tm-text-body-lg">참가자 리스트</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>참가자 프로필 조회 가능. 더보기는 참가자 리스트 페이지로 이동합니다.</div>
        </Card>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="tm-text-caption">{mine ? '내가 만든 매치' : joined ? '참가 상태' : '결제 전 요약 확인'}</span>
          <span className="tm-text-label tab-num">{match.fee.toLocaleString()}원</span>
        </div>
        <SBtn full size="lg" variant={locked ? 'neutral' : 'primary'} disabled={locked}>{actionLabel}</SBtn>
      </div>
      {sheet && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(25,31,40,.36)', display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', background: 'var(--bg)', borderRadius: '22px 22px 0 0', padding: '18px 20px 24px' }} role="dialog" aria-modal="true">
            <div style={{ width: 36, height: 4, borderRadius: 999, background: 'var(--grey200)', margin: '0 auto 18px' }}/>
            <div className="tm-text-subhead">참가 요약</div>
            <div className="tm-text-caption" style={{ marginTop: 6 }}>결제 전 매치, 일시, 장소, 인원, 금액을 다시 확인합니다.</div>
            <SMRevisionInfoRow label="매치" value={match.title}/>
            <SMRevisionInfoRow label="일시와 장소" value={`${match.date} ${match.time} · ${match.venue}`}/>
            <SMRevisionInfoRow label="참가비" value={`${match.fee.toLocaleString()}원`} sub="테스트 결제 흐름에서는 실제 청구 없음"/>
            <SBtn full size="lg">결제하고 참가하기</SBtn>
          </div>
        </div>
      )}
    </Shell>
  );
};

const SMRevisionMatchJoinFeedbackMobileSM3 = () => (
  <SMRevisionMatchDetailMobileSM3 sheet/>
);

const SMRevisionMatchJoinFeedbackOverlaySM3 = ({ noTop = false }) => {
  const match = MATCHES[0];
  const Shell = noTop ? SMRevisionMatchSM4Shell : SMRevisionShell;
  return (
    <Shell title="" back notificationNew={false} bottom={false}>
      <div style={{ height: 216, background: `url(${match.img}) center/cover`, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(25,31,40,.04), rgba(25,31,40,.66))' }}/>
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 18, color: 'var(--static-white)' }}>
          <Badge tone="blue">축구</Badge>
          <div className="tm-text-heading" style={{ color: 'var(--static-white)', marginTop: 8 }}>{match.title}</div>
        </div>
      </div>
      <div style={{ padding: '16px 20px 118px' }}>
        <SMRevisionInfoRow label="일시" value={`${match.date} ${match.time}`}/>
        <SMRevisionInfoRow label="장소" value={match.venue}/>
        <Card pad={16} style={{ marginTop: 14, background: 'rgba(254,152,0,.10)' }}>
          <div className="tm-text-label" style={{ color: 'var(--orange500)' }}>승인 요청 완료</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>호스트 승인 대기 중입니다. 승인 전까지 하단 CTA는 승인중으로 잠깁니다.</div>
        </Card>
      </div>
      <div style={{ position: 'absolute', left: 20, right: 20, bottom: 94, borderRadius: 16, background: 'var(--grey900)', color: 'var(--static-white)', padding: '14px 16px', boxShadow: 'var(--sh-2)' }}>
        <div className="tm-text-label" style={{ color: 'var(--static-white)' }}>승인 요청을 보냈습니다</div>
        <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.72)', marginTop: 3 }}>승인되면 알림으로 알려드릴게요.</div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="tm-text-caption">참가 상태</span>
          <span className="tm-text-label tab-num">{match.fee.toLocaleString()}원</span>
        </div>
        <SBtn full size="lg" variant="neutral" disabled>승인중</SBtn>
      </div>
    </Shell>
  );
};

const SMRevisionMatchMobileGridSM3 = () => (
  <SMRevisionRuleBoard title="03 개인 매치 · SM 수정안 3 mobile grid" items={[
    { title: '보존 기준', body: '원본 03, 기존 수정안 1/2, 기존 SM 수정안은 유지한다. SM3는 같은 번호 아래 새 비교 섹션으로만 추가한다.' },
    { title: '목록 구조', body: '상단바 title은 홈과 동일하게 teameet으로 유지하고 상단 검색 액션은 제외한다. 본문 검색바, 단일 보기 전환 버튼, 종목 count selector, 3개 요약 counter를 mobile 첫 화면에 둔다.' },
    { title: '보기 모드', body: '카드형과 콤팩트형은 동시에 노출하지 않는다. ㅁ|ㅁ 또는 ㅁ 단일 버튼 하나만 두고, 클릭할 때마다 다음 보기 모드로 전환한다.' },
    { title: '검색 진입', body: '검색바를 누르면 focused search 화면으로 전환한다. 입력창, 취소, 최근 검색, 빠른 조건을 먼저 보여주고 하단 탭은 유지한다.' },
    { title: '검색 결과', body: '검색어 확정 후에는 검색어를 검색바에 유지하고, 전체보기 버튼 없이 결과 목록만 보여준다. 결과 없음은 조회 없음 상태로 연결한다.' },
    { title: '요약 카운터', body: '매치수, 오늘매치수, 마감임박은 카드 박스 없이 텍스트 통계로만 표시해 목록보다 무겁게 보이지 않게 한다.' },
    { title: '상태 보드', body: '조회 없음과 네트워크 오류를 별도 보드로 둔다. 오류 문구는 0502 원문 그대로 보존하고 복구 CTA를 함께 둔다.' },
    { title: '상세/참가', body: '상세는 하단바를 제외하고 back/share/notification, 정보 블록, sticky CTA, 참가 요약 bottom sheet, 결제하고 참가하기를 분리한다.' },
    { title: '참가 직후 feedback', body: '결제하고 참가하기 후에는 승인 요청을 보냈다는 toast 또는 간단 팝업을 즉시 보여주고, 하단 CTA는 승인중으로 잠근다.' },
    { title: '참여 후 상태', body: '승인중과 승인완료는 하단 버튼 자체가 승인중/승인완료로 바뀌며 클릭되지 않는다. 별도 상태보기 CTA로 보내지 않는다.' },
    { title: '내 매치', body: '내가 만든 매치일 때 참가 CTA 대신 매치 관리 CTA를 보여주며, 관리 화면 이동 책임을 명시한다.' },
    { title: '미정 범위', body: '0502 문서에 개인 매치 만들기 상세 요구사항은 없다. SM3 mobile에서는 새로 설계하지 않고 grid에 미정으로 남긴다.' },
    { title: '다음 단계', body: 'mobile 확정 후 m03 grid 세부 동작과 tablet/desktop workspace를 별도 pass에서 정리한다.' },
  ]}/>
);

const SMRevisionTeamBrowseMobile = () => (
  <SMRevisionShell title="팀" notificationNew bottom navActive="teams">
    <div style={{ padding: 20 }}>
      <div className="tm-text-heading">팀 전체조회</div>
      <div className="tm-text-body" style={{ marginTop: 6 }}>SM 문서에는 body 요구사항이 아직 없으므로 shell, 비교, 선택 CTA를 먼저 고정한다.</div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '18px 0' }}>
        {['전체', '축구', '풋살', '농구', '배드민턴'].map((label, index) => <HapticChip key={label} active={index === 0}>{label}</HapticChip>)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {TEAMS.map((team) => (
          <Card key={team.id} pad={16}>
            <div style={{ display: 'flex', gap: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: 16, background: 'var(--blue50)', display: 'grid', placeItems: 'center', color: 'var(--blue500)' }}>
                <Icon name="people" size={24}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tm-text-body-lg">{team.name}</div>
                <div className="tm-text-caption" style={{ marginTop: 3 }}>{team.sport} · {team.members}명 · 매너 {team.manner}</div>
                <StatBar label="신뢰 신호" value={Math.round(team.manner * 20)} sub="sample signal · production에서는 verified/estimated 구분 필요"/>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  </SMRevisionShell>
);

const SMRevisionChatListMobile = () => (
  <SMRevisionShell title="채팅" back search notificationNew bottom navActive="my">
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 16 }}>
        {['전체', '개인매치', '팀매치', '팀'].map((label, index) => <HapticChip key={label} active={index === 0}>{label}</HapticChip>)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 72 }}>
        {CHATS.map((chat, index) => (
          <Card key={chat.id} pad={14}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: 16, background: `url(${chat.avatar}) center/cover`, flexShrink: 0 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div className="tm-text-body-lg line-clamp-2">{chat.name}</div>
                  {index === 0 && <Badge tone="blue">고정</Badge>}
                </div>
                <div className="tm-text-caption line-clamp-2">{chat.group ? '팀' : '개인매치'} · {chat.last}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="tm-text-micro">{chat.time}</div>
                {chat.unread > 0 && <div style={{ marginTop: 6, minWidth: 20, height: 20, borderRadius: 999, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{chat.unread}</div>}
              </div>
            </div>
          </Card>
        ))}
      </div>
      <button className="tm-btn tm-btn-primary" aria-label="새 채팅" style={{ position: 'absolute', right: 20, bottom: 90, width: 54, height: 54, borderRadius: 999, padding: 0, display: 'grid', placeItems: 'center', boxShadow: '0 10px 24px rgba(49,130,246,.28)' }}>
        <Icon name="chat" size={22}/>
      </button>
    </div>
  </SMRevisionShell>
);

const SMRevisionChatRoomMobile = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <TopNav title="주말 축구 매치" onBack={() => {}} trailing={<button className="tm-btn tm-btn-icon tm-btn-ghost"><Icon name="plus" size={20}/></button>}/>
    <div style={{ padding: 16, borderBottom: '1px solid var(--grey100)' }}>
      <Card pad={14}>
        <div className="tm-text-label">개인매치 상세조회 바로가기</div>
        <div className="tm-text-caption" style={{ marginTop: 4 }}>카테고리에 따른 주제를 상단에 노출하고 관련 상세로 이동합니다.</div>
      </Card>
    </div>
    <div style={{ flex: 1, padding: 20, overflow: 'auto', background: 'var(--grey50)' }}>
      {['오늘 14:00 경기 인원 확인 부탁드려요.', '네. 저는 20분 전에 도착할게요.', '시스템: 수아님이 참가 승인되었습니다.'].map((msg, index) => (
        <div key={index} style={{ maxWidth: index === 1 ? 246 : 280, marginLeft: index === 1 ? 'auto' : 0, marginBottom: 10, padding: '10px 12px', borderRadius: 14, background: index === 1 ? 'var(--blue500)' : 'var(--bg)', color: index === 1 ? 'var(--static-white)' : 'var(--text-strong)', boxShadow: 'var(--sh-1)' }}>
          <div className="tm-text-body" style={{ color: 'inherit' }}>{msg}</div>
        </div>
      ))}
    </div>
    <div style={{ padding: '12px 16px 22px', display: 'flex', gap: 8, borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-btn tm-btn-icon tm-btn-neutral" aria-label="이미지 추가"><Icon name="plus" size={20}/></button>
      <div style={{ flex: 1, minHeight: 44, borderRadius: 999, background: 'var(--grey100)', display: 'flex', alignItems: 'center', padding: '0 14px' }} className="tm-text-caption">메시지 입력</div>
      <button className="tm-btn tm-btn-icon tm-btn-primary" aria-label="전송"><Icon name="send" size={20}/></button>
    </div>
  </div>
);

const SMRevisionNotificationsMobile = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ height: 56, padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--grey100)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="tm-btn tm-btn-icon tm-btn-ghost"><Icon name="chevL" size={22}/></button>
        <div className="tm-text-body-lg">알림 <span className="tab-num" style={{ color: 'var(--blue500)' }}>2</span></div>
      </div>
      <button className="tm-btn tm-btn-sm tm-btn-ghost">모두읽음</button>
    </div>
    <div style={{ height: 756, overflow: 'auto', padding: 20 }}>
      {['오늘', '어제'].map((group, groupIndex) => (
        <div key={group} style={{ marginBottom: 20 }}>
          <div className="tm-text-label" style={{ marginBottom: 8 }}>{group}</div>
          {NOTIFS.slice(groupIndex * 2, groupIndex * 2 + 3).map((notif) => (
            <Card key={notif.id} pad={14} style={{ marginBottom: 8, background: notif.unread ? 'var(--blue50)' : 'var(--bg)' }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 14, background: notif.unread ? 'var(--blue500)' : 'var(--grey100)', color: notif.unread ? 'var(--static-white)' : 'var(--text-muted)', display: 'grid', placeItems: 'center' }}>
                  <Icon name="bell" size={18}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="tm-text-body-lg">{notif.title}</div>
                  <div className="tm-text-caption line-clamp-2" style={{ marginTop: 3 }}>{notif.body}</div>
                  <div className="tm-text-micro" style={{ marginTop: 6 }}>{notif.time}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ))}
    </div>
  </div>
);

const SMRevisionLoginMobile = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ flex: 1, padding: '72px 24px 24px', display: 'flex', flexDirection: 'column' }}>
      <div className="tm-text-heading">teameet에 로그인하고<br/>내 운동 기록을 이어가세요</div>
      <div className="tm-text-body" style={{ marginTop: 10 }}>SM design freeze의 로그인 대상은 기존 인증 흐름을 유지하되, 홈 비로그인 상태와 연결해 비교한다.</div>
      <div style={{ marginTop: 36, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">휴대폰 번호로 계속하기</button>
        <button className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block">카카오로 계속하기</button>
        <button className="tm-btn tm-btn-lg tm-btn-outline tm-btn-block">이메일로 로그인</button>
      </div>
      <Card pad={16} style={{ marginTop: 24 }}>
        <div className="tm-text-body-lg">비로그인 fallback</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>홈은 닉네임 없이 “안녕하세요”만 표시하고 모든 개인 수치를 -로 처리한다.</div>
      </Card>
      <div style={{ flex: 1 }}/>
      <div className="tm-text-caption">약관과 개인정보 처리방침에 동의하고 계속합니다.</div>
    </div>
  </div>
);

const SMRevisionAuthV2Option = ({ title, sub, tone = 'neutral', selected = false, disabled = false }) => (
  <button className="tm-pressable tm-break-keep" type="button" disabled={disabled} style={{
    width: '100%',
    minHeight: 62,
    borderRadius: 16,
    border: selected ? '1px solid var(--blue500)' : '1px solid var(--grey100)',
    background: disabled ? 'var(--grey50)' : selected ? 'var(--blue50)' : 'var(--bg)',
    color: disabled ? 'var(--text-caption)' : 'var(--text-strong)',
    padding: '12px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    textAlign: 'left',
    opacity: disabled ? .64 : 1,
  }}>
    <span style={{
      width: 38,
      height: 38,
      borderRadius: 13,
      display: 'grid',
      placeItems: 'center',
      background: tone === 'blue' ? 'var(--blue500)' : tone === 'warning' ? 'var(--orange50)' : 'var(--grey100)',
      color: tone === 'blue' ? 'var(--static-white)' : tone === 'warning' ? 'var(--orange500)' : 'var(--grey700)',
      flexShrink: 0,
    }}>
      {selected ? <Icon name="check" size={18}/> : <Icon name={tone === 'warning' ? 'bell' : 'shield'} size={18}/>}
    </span>
    <span style={{ flex: 1, minWidth: 0 }}>
      <span className="tm-text-body-lg" style={{ display: 'block' }}>{title}</span>
      <span className="tm-text-caption" style={{ display: 'block', marginTop: 2 }}>{sub}</span>
    </span>
  </button>
);

const SMRevisionLoginMobileV2 = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ height: 56, padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div className="tm-text-body-lg">teameet</div>
      <button className="tm-btn tm-btn-sm tm-btn-ghost">둘러보기</button>
    </div>
    <div style={{ flex: 1, overflow: 'auto', padding: '28px 24px 26px', display: 'flex', flexDirection: 'column' }}>
      <Badge tone="blue" size="sm">01 AUTH</Badge>
      <div className="tm-text-heading" style={{ marginTop: 14 }}>운동 기록과 팀 활동을<br/>계속 이어가세요</div>
      <div className="tm-text-body" style={{ marginTop: 10, color: 'var(--text-muted)' }}>
        0502 기준 login surface는 홈 비로그인 fallback과 분리해, 인증 전후의 상태 차이를 명확하게 보여준다.
      </div>

      <div style={{ marginTop: 28, display: 'grid', gap: 10 }}>
        <SMRevisionAuthV2Option title="휴대폰 번호로 계속하기" sub="가장 안정적인 계정 복구 경로" tone="blue" selected/>
        <SMRevisionAuthV2Option title="카카오로 계속하기" sub="프로필 동의 후 온보딩으로 이동"/>
        <SMRevisionAuthV2Option title="이메일로 로그인" sub="기존 계정이 있으면 바로 이어서 시작"/>
      </div>

      <Card pad={16} style={{ marginTop: 18, background: 'var(--grey50)' }}>
        <div className="tm-text-body-lg">로그인하지 않고 홈 보기</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>홈은 "안녕하세요"만 표시하고 활동, 매너, 통계는 모두 - 값으로 유지한다.</div>
      </Card>

      <div style={{ flex: 1, minHeight: 18 }}/>
      <div className="tm-text-caption" style={{ lineHeight: 1.55 }}>
        계속하면 서비스 약관과 개인정보 처리방침에 동의합니다. 필수 동의가 없으면 CTA는 비활성화된다.
      </div>
    </div>
  </div>
);

const SMRevisionAuthTermsV2 = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <TopNav title="약관 확인" onBack={() => {}}/>
    <div style={{ flex: 1, padding: '20px 20px 112px', overflow: 'auto' }}>
      <div className="tm-text-heading">시작하기 전에<br/>필수 동의를 확인해요</div>
      <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)' }}>동의 상태가 CTA 활성 조건이라는 점을 별도 보드로 고정한다.</div>
      <div style={{ display: 'grid', gap: 10, marginTop: 24 }}>
        <SMRevisionAuthV2Option title="서비스 이용약관" sub="필수 · 최신 버전 2026.05" selected/>
        <SMRevisionAuthV2Option title="개인정보 처리방침" sub="필수 · 인증/매치 참여에 필요" selected/>
        <SMRevisionAuthV2Option title="마케팅 알림 수신" sub="선택 · 홈 알림 new 상태와 연동"/>
        <SMRevisionAuthV2Option title="위치 권한" sub="선택 · 거부해도 수동 지역 선택 가능" tone="warning"/>
      </div>
      <Card pad={16} style={{ marginTop: 18 }}>
        <div className="tm-text-body-lg">Disabled state</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>필수 약관을 해제하면 하단 CTA는 비활성화하고, 어떤 항목이 필요한지 inline reason을 보여준다.</div>
      </Card>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">동의하고 계속하기</button>
    </div>
  </div>
);

const SMRevisionAuthCallbackV2 = ({ state = 'loading' }) => {
  const config = {
    loading: {
      badge: 'PROVIDER LOADING',
      title: '계정 정보를 확인하고 있어요',
      sub: '카카오에서 돌아오는 중입니다. 3초 이상 지연되면 취소 CTA를 함께 노출합니다.',
      tone: 'blue',
      action: '로그인 취소',
    },
    error: {
      badge: 'NETWORK ERROR',
      title: '로그인을 완료하지 못했어요',
      sub: '네트워크 오류가 발생했습니다. 입력한 선택값은 잃지 않고 다시 시도할 수 있어야 합니다.',
      tone: 'red',
      action: '다시 시도',
    },
    conflict: {
      badge: 'ACCOUNT CONFLICT',
      title: '이미 연결된 계정이 있어요',
      sub: '다른 provider로 가입한 계정이 있으면 기존 계정으로 이어서 시작하는 경로를 제공한다.',
      tone: 'orange',
      action: '기존 계정으로 계속',
    },
  }[state];
  const isLoading = state === 'loading';

  return (
    <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <StatusBar/>
      <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Card pad={20}>
          <Badge tone={config.tone} size="sm">{config.badge}</Badge>
          <div className="tm-text-heading" style={{ marginTop: 16 }}>{config.title}</div>
          <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)', lineHeight: 1.55 }}>{config.sub}</div>
          <div style={{ display: 'grid', gap: 10, marginTop: 22 }}>
            {isLoading ? (
              <>
                <Skeleton w="100%" h={52} r={14}/>
                <Skeleton w="72%" h={18} r={8}/>
                <button className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block">{config.action}</button>
              </>
            ) : (
              <>
                <button className={`tm-btn tm-btn-lg ${state === 'error' ? 'tm-btn-danger' : 'tm-btn-primary'} tm-btn-block`}>{config.action}</button>
                <button className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block">다른 방법 선택</button>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

const SMRevisionAuthFallbackV2 = () => (
  <SMRevisionShell title="teameet" search notificationNew={false}>
    <div style={{ padding: 20 }}>
      <div className="tm-text-heading">안녕하세요</div>
      <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)' }}>로그인하지 않은 사용자의 홈 연결 상태를 인증 섹션에서 함께 고정한다.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 18 }}>
        <Card pad={16}>
          <div className="tm-text-caption">이번달 활동</div>
          <NumberDisplay value="-" size={30} sub="지난달 비교 -"/>
        </Card>
        <Card pad={16}>
          <div className="tm-text-caption">매너점수</div>
          <NumberDisplay value="-" size={30} sub="상위 -"/>
        </Card>
      </div>
      <Card pad={16} style={{ marginTop: 14 }}>
        <div className="tm-text-body-lg">랜덤 추천으로 대체</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>대표 추천 매치와 추천 매치 5개는 개인화 추천 대신 랜덤 조회 결과로 표시한다.</div>
      </Card>
      <Card pad={16} style={{ marginTop: 10 }}>
        <div className="tm-text-body-lg">로그인 유도는 보조 액션</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>탐색을 막지 않고, 개인 수치가 필요한 영역에서만 로그인 CTA를 제공한다.</div>
      </Card>
    </div>
  </SMRevisionShell>
);

const SMRevisionAuthMobileGridV2 = () => (
  <SMRevisionRuleBoard title="01 인증/로그인 · SM 수정안 2 mobile grid" items={[
    { title: '보존 기준', body: '원본 01과 기존 SM 수정안은 그대로 두고, 같은 번호의 새 비교 섹션에서만 수정한다.' },
    { title: '모바일 우선', body: '로그인 main, 약관 disabled, callback loading/error/conflict, 비로그인 홈 fallback을 먼저 고정한다.' },
    { title: '상태 분리', body: 'provider loading, denied/network/account conflict는 toast가 아니라 persistent card와 복구 CTA로 보여준다.' },
    { title: '홈 연결', body: '비로그인 홈은 안녕하세요만 표시하고 개인 수치와 날씨/통계 값은 - 또는 랜덤 추천으로 대체한다.' },
    { title: '컴포넌트', body: 'tm-btn, tm-card, Badge, Skeleton, NumberDisplay, tab-num을 쓰고 임의 장식/깊은 shadow를 금지한다.' },
    { title: '다음 단계', body: 'mobile 확정 후 M01 grid의 m01-mb-main/state/components/motion을 이 기준으로 재작성한다.' },
  ]}/>
);

const SMRevisionAuthStepProgress = ({ step = 1 }) => (
  <div style={{ display: 'flex', gap: 6 }}>
    {[1, 2, 3, 4].map((item) => (
      <div key={item} style={{ flex: 1, height: 5, borderRadius: 999, background: item <= step ? 'var(--blue500)' : 'var(--grey150)' }}/>
    ))}
  </div>
);

const SMRevisionAuthStepShell = ({ step = 1, title, sub, children, cta = '다음', disabled = false, helper, back = true }) => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <TopNav title="시작 설정" onBack={back ? () => {} : undefined}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px 112px' }}>
      <SMRevisionAuthStepProgress step={step}/>
      <div className="tm-text-micro tab-num" style={{ marginTop: 18, color: 'var(--blue500)' }}>STEP {step} / 4</div>
      <div className="tm-text-heading" style={{ marginTop: 8 }}>{title}</div>
      <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)' }}>{sub}</div>
      <div style={{ marginTop: 22 }}>
        {children}
      </div>
      {helper && (
        <Card pad={16} style={{ marginTop: 18, background: 'var(--grey50)' }}>
          <div className="tm-text-body-lg">{helper.title}</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>{helper.body}</div>
        </Card>
      )}
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <button className={`tm-btn tm-btn-lg ${disabled ? 'tm-btn-neutral' : 'tm-btn-primary'} tm-btn-block`} disabled={disabled}>{cta}</button>
      {disabled && <div className="tm-text-micro" style={{ marginTop: 8, textAlign: 'center' }}>필수 선택을 완료하면 계속할 수 있어요.</div>}
    </div>
  </div>
);

const SMRevisionAuthSM3Login = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <div style={{ flex: 1, padding: '40px 24px 24px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: 20, background: 'var(--blue500)', display: 'grid', placeItems: 'center', color: 'var(--static-white)', marginBottom: 28 }}>
          <span className="tm-text-title" style={{ color: 'var(--static-white)' }}>T</span>
        </div>
        <div className="tm-text-heading">
          같이 뛸 사람을<br/>한 번에 찾아요
        </div>
        <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 10, marginBottom: 34 }}>
          Teameet에 오신 걸 환영합니다
        </div>

        <button className="tm-btn tm-btn-lg tm-btn-outline tm-btn-block">이메일로 로그인</button>
        <div className="tm-text-caption" style={{ marginTop: 10 }}>
          기존 계정이 있으면 이메일 로그인 후 종목·레벨·지역 확인으로 이어집니다.
        </div>
      </div>
      <div>
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">로그인 없이 시작하기</button>
        <div className="tm-text-body" style={{ marginTop: 12, textAlign: 'center' }}>
          아직 계정이 없나요? <span style={{ color: 'var(--blue500)', fontWeight: 600 }}>회원가입</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }}/>
          <span className="tm-text-caption">또는</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }}/>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { label: '카카오', bg: '#FEE500', color: 'var(--static-black)' },
            { label: '네이버', bg: 'var(--green500)', color: 'var(--static-white)' },
            { label: 'Apple', bg: 'var(--static-black)', color: 'var(--static-white)' },
          ].map((item) => (
            <button key={item.label} className="tm-btn tm-btn-md tm-pressable" style={{ flex: 1, background: item.bg, color: item.color }}>{item.label}</button>
          ))}
        </div>
        <div className="tm-text-caption" style={{ marginTop: 16, textAlign: 'center', lineHeight: 1.6 }}>
          계속하면 서비스 약관과 개인정보 처리방침에 동의합니다.
        </div>
      </div>
    </div>
  </div>
);

const SMRevisionAuthField = ({ label, placeholder, type = 'text', helper, state }) => (
  <div>
    <div className="tm-text-label" style={{ marginBottom: 8 }}>{label}</div>
    <div style={{ display: 'flex', gap: 8 }}>
      <input
        type={type}
        placeholder={placeholder}
        className="tm-input"
        style={{ flex: 1, minWidth: 0, borderColor: state === 'error' ? 'var(--red500)' : state === 'success' ? 'var(--green500)' : 'var(--border)' }}
      />
    </div>
    {helper && (
      <div className="tm-text-caption" style={{ marginTop: 6, color: state === 'error' ? 'var(--red500)' : state === 'success' ? 'var(--green500)' : 'var(--text-caption)' }}>
        {helper}
      </div>
    )}
  </div>
);

const SMRevisionAuthEmailLoginSM3 = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <TopNav title="이메일 로그인" onBack={() => {}}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '28px 24px 112px' }}>
      <Badge tone="blue" size="sm">EMAIL LOGIN</Badge>
      <div className="tm-text-heading" style={{ marginTop: 14 }}>이메일로<br/>로그인하세요</div>
      <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)' }}>입력은 이메일과 비밀번호만 받는다. 성공하면 기존 계정 상태에 따라 확인 화면 또는 홈으로 이동한다.</div>
      <div style={{ display: 'grid', gap: 18, marginTop: 30 }}>
        <SMRevisionAuthField label="이메일" placeholder="you@example.com" type="email"/>
        <SMRevisionAuthField label="비밀번호" placeholder="비밀번호" type="password"/>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
        <button className="tm-btn tm-btn-sm tm-btn-ghost">비밀번호 찾기</button>
        <button className="tm-btn tm-btn-sm tm-btn-ghost">회원가입</button>
      </div>
      <Card pad={16} style={{ marginTop: 22, background: 'var(--grey50)' }}>
        <div className="tm-text-body-lg">오류 처리</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>이메일 형식 오류, 비밀번호 불일치, 네트워크 실패는 field helper와 persistent error card로 표시한다.</div>
      </Card>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">로그인</button>
    </div>
  </div>
);

const SMRevisionAuthSignupSM3 = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <TopNav title="회원가입" onBack={() => {}}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 20px 118px' }}>
      <Badge tone="blue" size="sm">SIGN UP</Badge>
      <div className="tm-text-heading" style={{ marginTop: 14 }}>계정을 만들고<br/>운동 설정을 이어가요</div>
      <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)' }}>회원가입 후 원본 01의 종목, 레벨, 지역 선택 화면으로 이어진다.</div>
      <div style={{ display: 'grid', gap: 16, marginTop: 24 }}>
        <div>
          <div className="tm-text-label" style={{ marginBottom: 8 }}>닉네임</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 92px', gap: 8 }}>
            <input className="tm-input" placeholder="사용할 닉네임"/>
            <button className="tm-btn tm-btn-md tm-btn-neutral">중복체크</button>
          </div>
          <div className="tm-text-caption" style={{ marginTop: 6, color: 'var(--green500)' }}>사용 가능한 닉네임이에요.</div>
        </div>
        <SMRevisionAuthField label="이메일" placeholder="you@example.com" type="email"/>
        <SMRevisionAuthField label="비밀번호" placeholder="8자 이상" type="password"/>
        <SMRevisionAuthField label="비밀번호 확인" placeholder="비밀번호 다시 입력" type="password" helper="일치하지 않으면 가입 CTA는 비활성화한다."/>
      </div>
      <Card pad={16} style={{ marginTop: 18, background: 'var(--grey50)' }}>
        <div className="tm-text-body-lg">가입 후 행동</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>가입 성공 시 로그인 상태로 종목 선택 step에 진입한다. 닉네임 중복 실패와 비밀번호 불일치는 현재 화면에 남겨 복구한다.</div>
      </Card>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">회원가입하고 계속</button>
    </div>
  </div>
);

const SMRevisionAuthSM3TermsStep = () => (
  <SMRevisionAuthStepShell
    step={1}
    title={<>시작하기 전에<br/>약관을 확인해요</>}
    sub="SM2의 약관 확인 화면을 SM3 온보딩 첫 단계로 편입한다. 필수 동의가 없으면 다음 CTA는 비활성화한다."
    cta="동의하고 종목 선택"
    helper={{ title: 'Step 1 행동', body: '필수 약관 동의 후 원본 온보딩 종목 선택 디자인으로 이동한다. 선택 약관은 홈 알림 new 상태와 연결한다.' }}
  >
    <div style={{ display: 'grid', gap: 10 }}>
      <SMRevisionAuthV2Option title="서비스 이용약관" sub="필수 · 최신 버전 2026.05" selected tone="blue"/>
      <SMRevisionAuthV2Option title="개인정보 처리방침" sub="필수 · 인증/매치 참여에 필요" selected tone="blue"/>
      <SMRevisionAuthV2Option title="마케팅 알림 수신" sub="선택 · 추천/공지 알림에 사용"/>
      <SMRevisionAuthV2Option title="위치 권한 안내" sub="선택 · 거부해도 지역은 직접 선택 가능" tone="warning"/>
    </div>
  </SMRevisionAuthStepShell>
);

const SMRevisionAuthSM3SportStep = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ padding: '8px 20px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
      <button className="tm-pressable tm-break-keep" style={{ width: 40, height: 40, background: 'transparent', border: 'none', color: 'var(--text-strong)' }}>
        <Icon name="chevL" size={22}/>
      </button>
      <div style={{ flex: 1, display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= 2 ? 'var(--blue500)' : 'var(--grey150)' }}/>
        ))}
      </div>
      <button className="tm-pressable tm-break-keep" style={{ background: 'transparent', border: 'none', fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>건너뛰기</button>
    </div>

    <div style={{ flex: 1, padding: '40px 20px 20px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, color: 'var(--blue500)', fontWeight: 700, letterSpacing: 0 }}>STEP 2 / 4</div>
      <div className="tm-text-heading" style={{ marginTop: 8 }}>
        관심 종목을<br/>알려주세요
      </div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8, marginBottom: 24 }}>여러 개 선택할 수 있어요</div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {SPORTS.filter(s => s.id !== 'all').map((sport) => {
            const selected = ['soccer', 'futsal', 'ice_hockey', 'badminton'].includes(sport.id);
            return (
              <button key={sport.id} className="tm-card tm-pressable" style={{
                aspectRatio: '1/1',
                padding: 16,
                textAlign: 'left',
                background: selected ? 'var(--blue50)' : 'var(--bg)',
                border: `2px solid ${selected ? 'var(--blue500)' : 'var(--border)'}`,
                position: 'relative',
                overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', inset: 0, background: `url(${sport.img}) center/cover`, opacity: selected ? .2 : .12 }}/>
                <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                  <div className="tm-text-body-lg">{sport.label}</div>
                  <div className="tm-text-micro" style={{ marginTop: 4 }}>{selected ? '선택됨' : '선택 가능'}</div>
                </div>
                {selected && <div style={{ position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: 11, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center' }}><Icon name="check" size={14} stroke={3}/></div>}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ paddingTop: 16 }}>
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">4개 선택 · 다음</button>
      </div>
    </div>
  </div>
);

const SMRevisionAuthLevelSportCard = ({ sport, badge, options, note, selected = 1, needsInput = false }) => (
  <Card pad={16}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Badge tone={needsInput ? 'orange' : 'blue'} size="sm">{badge}</Badge>
      <div className="tm-text-body-lg">{sport}</div>
    </div>
    <div className="tm-text-caption" style={{ marginTop: 6 }}>{note}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
      {options.map((option, index) => (
        <button key={option} className={`tm-chip ${index === selected ? 'tm-chip-active' : ''}`} style={{ justifyContent: 'center' }}>{option}</button>
      ))}
    </div>
    {needsInput && (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
        <div className="tm-input" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-caption)' }}>스케이트 3년</div>
        <div className="tm-input" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-caption)' }}>장비 보유</div>
      </div>
    )}
  </Card>
);

const SMRevisionAuthSM3LevelStep = ({ disabled = false }) => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ padding: '8px 20px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
      <button className="tm-pressable tm-break-keep" style={{ width: 40, height: 40, background: 'transparent', border: 'none', color: 'var(--text-strong)' }}>
        <Icon name="chevL" size={22}/>
      </button>
      <div style={{ flex: 1, display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= 3 ? 'var(--blue500)' : 'var(--grey150)' }}/>
        ))}
      </div>
    </div>

    <div style={{ flex: 1, padding: '32px 20px 20px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ fontSize: 12, color: 'var(--blue500)', fontWeight: 700, letterSpacing: 0 }}>STEP 3 / 4</div>
      <div className="tm-text-heading" style={{ marginTop: 8 }}>
        종목별 실력은<br/>어느 정도세요?
      </div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8, marginBottom: 18 }}>선택한 종목마다 원본 레벨 선택 리스트로 입력해요</div>
      <div style={{ flex: 1, overflow: 'auto', paddingRight: 2 }}>
        {[
          { sport: '축구', selected: 'B', rows: [['S', '선수 출신', '전/현직 선수'], ['A', '상급', '동호회 선수급'], ['B', '중급', '주 2-3회 규칙적 참여'], ['C', '초급', '취미로 시작한 정도'], ['D', '입문', '처음 시작해요']] },
          { sport: '풋살', selected: 'C', rows: [['A', '상급', '팀 전술 이해'], ['B', '중급', '주 1회 이상'], ['C', '초중급', '5:5 경험 1년 이상']] },
          { sport: '하키', selected: 'D', rows: [['B', '리그 경험', '경기 규칙과 포지션 이해'], ['C', '동호회', '스케이트 경력 1년 이상'], ['D', '입문', '스케이트 경력 입력 필요']] },
        ].map((group) => (
          <div key={group.sport} style={{ marginBottom: 18 }}>
            <div className="tm-text-body-lg" style={{ marginBottom: 10 }}>{group.sport}</div>
            {group.rows.map(([grade, title, sub]) => {
              const selected = grade === group.selected;
              return (
                <button key={grade} className="tm-list-row tm-pressable" style={{
                  width: '100%',
                  marginBottom: 8,
                  borderRadius: 12,
                  border: selected ? '2px solid var(--blue500)' : '1px solid var(--border)',
                  background: selected ? 'var(--blue50)' : 'var(--bg)',
                  textAlign: 'left',
                }}>
                  <GradeBadge grade={grade}/>
                  <div style={{ flex: 1 }}>
                    <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{title}</div>
                    <div className="tm-text-caption" style={{ marginTop: 2 }}>{sub}</div>
                  </div>
                  {selected ? <Icon name="check" size={18} color="var(--blue500)" stroke={2.4}/> : <Icon name="chevR" size={20} color="var(--grey400)"/>}
                </button>
              );
            })}
            {group.sport === '하키' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                <div className="tm-input" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-caption)' }}>스케이트 3년</div>
                <div className="tm-input" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-caption)' }}>장비 보유</div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ paddingTop: 12 }}>
        <button className={`tm-btn tm-btn-lg ${disabled ? 'tm-btn-neutral' : 'tm-btn-primary'} tm-btn-block`} disabled={disabled}>{disabled ? '필수 레벨 입력 필요' : '레벨 선택 완료'}</button>
      </div>
    </div>
  </div>
);

const SMRevisionAuthSM3RegionStep = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ padding: '8px 20px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
      <button className="tm-pressable tm-break-keep" style={{ width: 40, height: 40, background: 'transparent', border: 'none', color: 'var(--text-strong)' }}>
        <Icon name="chevL" size={22}/>
      </button>
      <div style={{ flex: 1, display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--blue500)' }}/>
        ))}
      </div>
    </div>

    <div style={{ flex: 1, padding: '40px 24px 0', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, color: 'var(--blue500)', fontWeight: 700, letterSpacing: 0 }}>STEP 4 / 4</div>
      <div className="tm-text-heading" style={{ marginTop: 8 }}>
        주로 어디서<br/>운동하세요?
      </div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>근처 매치를 우선 추천해드려요</div>

      <div style={{ marginTop: 24, padding: '14px 16px', borderRadius: 12, background: 'var(--grey50)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="search" size={18} color="var(--text-muted)"/>
        <input placeholder="동·구 검색" style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 14, color: 'var(--text-strong)' }}/>
      </div>

      <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>인기 지역</div>
      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {['강남구', '마포구 (선택됨)', '송파구', '성동구', '용산구', '서초구', '영등포구', '관악구', '서대문구'].map((r, i) => (
          <button key={r} className="tm-pressable tm-break-keep" style={{
            height: 36,
            padding: '0 14px',
            borderRadius: 999,
            border: 0,
            background: i === 1 ? 'var(--grey900)' : 'var(--grey100)',
            color: i === 1 ? 'var(--static-white)' : 'var(--text-strong)',
            fontSize: 13,
            fontWeight: 600,
          }}>{r.replace(' (선택됨)', '')}</button>
        ))}
      </div>

      <div style={{ marginTop: 32, padding: 16, borderRadius: 12, background: 'var(--blue50)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>i</div>
        <div style={{ fontSize: 13, color: 'var(--blue700)', fontWeight: 500, lineHeight: 1.5 }}>
          마포구 근처에 <span style={{ fontWeight: 700 }}>이번 주 12개 매치</span>가 모집 중이에요!
        </div>
      </div>

      <div style={{ flex: 1 }}/>
      <div style={{ paddingBottom: 24 }}>
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">지역 선택 완료</button>
      </div>
    </div>
  </div>
);

const SMRevisionAuthSM3Welcome = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <div style={{ flex: 1, padding: '56px 24px 112px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ width: 72, height: 72, borderRadius: 24, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', marginBottom: 24 }}>
        <Icon name="check" size={30}/>
      </div>
      <div className="tm-text-heading">준비가 끝났어요</div>
      <div className="tm-text-body" style={{ marginTop: 10, color: 'var(--text-muted)' }}>선택한 종목, 레벨, 지역을 기준으로 홈 추천과 매치 필터가 시작됩니다.</div>
      <div style={{ display: 'grid', gap: 10, marginTop: 26 }}>
        <Card pad={16}>
          <div className="tm-text-caption">종목</div>
          <div className="tm-text-body-lg" style={{ marginTop: 4 }}>축구, 풋살, 하키, 배드민턴</div>
        </Card>
        <Card pad={16}>
          <div className="tm-text-caption">지역</div>
          <div className="tm-text-body-lg" style={{ marginTop: 4 }}>서울 강남구 · 현재 위치 허용</div>
        </Card>
      </div>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">홈으로 시작하기</button>
    </div>
  </div>
);

const SMRevisionAuthSM3ExceptionBoard = () => (
  <div style={{ width: 840, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', padding: 24, overflow: 'hidden' }}>
    <div className="tm-text-heading">01 인증 SM3 · 예외/처리 상태</div>
    <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)' }}>원본 01의 상태 보드와 SM2 callback/fallback을 하나의 처리 기준으로 합친다.</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginTop: 20 }}>
      {[
        ['Provider loading', '로그인 버튼 클릭 후 skeleton + 취소 CTA. 3초 이상 지연되면 도움말 노출.', 'blue'],
        ['Provider denied', '필수 정보 동의 취소. 다시 로그인과 다른 방법 선택을 제공.', 'red'],
        ['Network error', '입력/선택값은 보존하고 재시도 CTA를 제공.', 'red'],
        ['Account conflict', '이미 연결된 계정. 기존 계정으로 계속 또는 다른 방법 선택.', 'orange'],
        ['Required missing', '종목/레벨/지역 필수값 누락. CTA disabled + reason row.', 'orange'],
        ['Location denied', '위치 권한 거부. 수동 지역 선택과 나중에 설정하기 제공.', 'orange'],
        ['Signed out home', '안녕하세요만 표시, 개인 수치 - 처리, 랜덤 추천으로 대체.', 'grey'],
        ['Confirm edit', '확인 화면의 수정 버튼은 해당 step으로 복귀하고 선택값 보존.', 'blue'],
        ['Welcome complete', '홈 push transition. reduced motion에서는 fade만 사용.', 'green'],
      ].map(([title, body, tone], index) => (
        <Card key={title} pad={16} style={{ minHeight: 148 }}>
          <Badge tone={tone} size="sm">{String(index + 1).padStart(2, '0')}</Badge>
          <div className="tm-text-body-lg" style={{ marginTop: 10 }}>{title}</div>
          <div className="tm-text-caption" style={{ marginTop: 6, lineHeight: 1.45 }}>{body}</div>
        </Card>
      ))}
    </div>
  </div>
);

const SMRevisionAuthSM3ActionMap = () => (
  <div style={{ width: 840, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 24, overflow: 'hidden' }}>
    <div className="tm-text-heading">01 인증 SM3 · 버튼 행동표</div>
    <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)' }}>각 버튼은 trigger, feedback, final state를 분리한다.</div>
    <div style={{ display: 'grid', gap: 8, marginTop: 20 }}>
      {[
        ['로그인 없이 시작하기', '비로그인 홈 fallback', '홈: 안녕하세요, 수치 -, 랜덤 추천'],
        ['이메일로 로그인', '이메일 로그인 form 또는 magic link', '기존 계정이면 확인 화면, 실패 시 network error'],
        ['카카오/네이버/Apple', 'provider callback loading', '성공 시 기존 계정 여부에 따라 확인/홈 분기'],
        ['동의하고 계속하기', '필수 약관 확인', '누락 시 disabled reason, 완료 시 종목 선택'],
        ['선택 완료/레벨 저장/지역 저장', 'progress advance', '필수값 누락 시 현재 step 유지'],
        ['나중에 설정하기', '권한/지역 선택 skip', '홈은 서울 기본 또는 랜덤 추천으로 시작'],
        ['수정', '해당 step으로 복귀', '이전 선택값 보존 후 확인 화면으로 돌아오기'],
        ['홈으로 시작하기', 'welcome completion', '홈 02로 push transition'],
        ['다시 시도/다른 방법 선택', 'error recovery', 'callback 재시도 또는 로그인 main 복귀'],
      ].map(([button, feedback, result], index) => (
        <div key={button} className="tm-list-row" style={{ borderRadius: 14, border: '1px solid var(--grey100)', background: index % 2 ? 'var(--grey50)' : 'var(--bg)' }}>
          <div className="tm-text-micro tab-num" style={{ width: 34, color: 'var(--blue500)' }}>{String(index + 1).padStart(2, '0')}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tm-text-body-lg">{button}</div>
            <div className="tm-text-caption" style={{ marginTop: 2 }}>{feedback}</div>
          </div>
          <div className="tm-text-caption" style={{ width: 220 }}>{result}</div>
        </div>
      ))}
    </div>
  </div>
);

const SMRevisionAuthSM4Checklist = () => (
  <div style={{ width: 840, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', padding: 24, overflow: 'hidden' }}>
    <Badge tone="blue" size="sm">SM4 COMPLETE CHECK</Badge>
    <div className="tm-text-heading" style={{ marginTop: 12 }}>01 인증 SM4 · 추가 완료 체크리스트</div>
    <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)' }}>SM3를 복사한 뒤 기존 01/SM2/M01에서 빠진 화면을 실제 아트보드로 추가한 버전.</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 22 }}>
      {[
        ['선택 확인 화면', '종목, 종목별 레벨, 지역 요약과 항목별 수정 버튼을 추가.'],
        ['OAuth callback loading', 'provider 버튼 이후 skeleton, 취소 CTA, 중복 submit 차단.'],
        ['OAuth callback error/conflict', '네트워크 오류와 계정 충돌을 persistent card로 복구.'],
        ['약관 미동의 disabled', '필수 약관 누락 이유와 disabled CTA를 실제 화면화.'],
        ['이메일 로그인 오류', '이메일 형식, 비밀번호, 네트워크 오류 상태를 field helper로 표시.'],
        ['회원가입 입력 오류', '닉네임 중복, 비밀번호 불일치, 가입 CTA disabled를 추가.'],
        ['위치 권한 거부', '권한 거부 후 수동 지역 선택과 나중에 설정하기 복구 경로.'],
        ['온보딩 이어하기', '앱 종료/뒤로가기 후 저장된 값으로 이어서 진행.'],
        ['원본 비교 보강', '종목/레벨/지역/환영 원본 비교 아트보드 분리.'],
        ['버튼 행동 확장', '확인 화면 수정 버튼과 오류 복구 버튼까지 행동표에 포함.'],
      ].map(([title, body]) => (
        <Card key={title} pad={16} style={{ minHeight: 112 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <input type="checkbox" checked readOnly aria-label={title} style={{ width: 20, height: 20, accentColor: 'var(--blue500)', flexShrink: 0, marginTop: 2 }}/>
            <div>
              <div className="tm-text-body-lg">{title}</div>
              <div className="tm-text-caption" style={{ marginTop: 5, lineHeight: 1.45 }}>{body}</div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  </div>
);

const SMRevisionAuthSM4TermsDisabled = () => (
  <SMRevisionAuthStepShell
    step={1}
    title={<>필수 약관에<br/>동의해주세요</>}
    sub="SM4는 필수 약관 미체크 상태와 하단 CTA disabled reason을 실제 화면으로 분리한다."
    cta="필수 약관 동의 후 가능"
    disabled
    helper={{ title: '필수 누락', body: '서비스 이용약관과 개인정보 처리방침을 모두 선택해야 종목 선택으로 이동한다.' }}
  >
    <div style={{ display: 'grid', gap: 10 }}>
      <SMRevisionAuthV2Option title="서비스 이용약관" sub="필수 · 아직 동의하지 않음" tone="warning"/>
      <SMRevisionAuthV2Option title="개인정보 처리방침" sub="필수 · 아직 동의하지 않음" tone="warning"/>
      <SMRevisionAuthV2Option title="마케팅 알림 수신" sub="선택 · 나중에 설정 가능"/>
      <SMRevisionAuthV2Option title="위치 권한 안내" sub="선택 · 거부해도 지역 직접 선택 가능"/>
    </div>
  </SMRevisionAuthStepShell>
);

const SMRevisionAuthSM4Confirm = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <TopNav title="선택 확인" onBack={() => {}}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 20px 118px' }}>
      <Badge tone="blue" size="sm">CONFIRM</Badge>
      <div className="tm-text-heading" style={{ marginTop: 14 }}>이 설정으로<br/>시작할까요?</div>
      <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)' }}>각 항목의 수정 버튼은 해당 온보딩 step으로 돌아가고, 저장된 선택값을 유지한다.</div>
      <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
        {[
          ['관심 종목', '축구 · 풋살 · 아이스하키 · 배드민턴', 'Step 2로 이동'],
          ['종목별 레벨', '축구 B · 풋살 C · 하키 D · 배드민턴 B', 'Step 3으로 이동'],
          ['주 활동 지역', '마포구 · 강남구', 'Step 4로 이동'],
        ].map(([title, value, action]) => (
          <Card key={title} pad={16}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tm-text-label">{title}</div>
                <div className="tm-text-body-lg" style={{ marginTop: 5 }}>{value}</div>
                <div className="tm-text-caption" style={{ marginTop: 4 }}>{action}</div>
              </div>
              <button className="tm-btn tm-btn-sm tm-btn-neutral">수정</button>
            </div>
          </Card>
        ))}
      </div>
      <Card pad={16} style={{ marginTop: 14, background: 'var(--blue50)' }}>
        <div className="tm-text-body-lg">추천 준비 완료</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>마포구 기준 이번 주 개인 매치 5개와 팀 매치 3개를 먼저 보여준다.</div>
      </Card>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">Teameet 시작하기</button>
    </div>
  </div>
);

const SMRevisionAuthSM4EmailLoginError = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <TopNav title="이메일 로그인" onBack={() => {}}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '28px 24px 112px' }}>
      <Badge tone="red" size="sm">LOGIN ERROR</Badge>
      <div className="tm-text-heading" style={{ marginTop: 14 }}>입력 정보를<br/>다시 확인해주세요</div>
      <div style={{ display: 'grid', gap: 18, marginTop: 30 }}>
        <SMRevisionAuthField label="이메일" placeholder="wrong-email" type="email" state="error" helper="이메일 형식이 올바르지 않아요."/>
        <SMRevisionAuthField label="비밀번호" placeholder="비밀번호" type="password" state="error" helper="이메일 또는 비밀번호가 일치하지 않아요."/>
      </div>
      <Card pad={16} style={{ marginTop: 22, background: 'var(--red50)', borderColor: 'var(--red-alpha-08)' }}>
        <div className="tm-text-body-lg" style={{ color: 'var(--red500)' }}>로그인을 완료하지 못했어요</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>네트워크 실패는 입력값을 유지한 채 재시도 CTA를 보여주고, 계정 없음은 회원가입으로 연결한다.</div>
      </Card>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-btn tm-btn-lg tm-btn-danger tm-btn-block">다시 로그인</button>
    </div>
  </div>
);

const SMRevisionAuthSM4SignupError = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <TopNav title="회원가입" onBack={() => {}}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 20px 118px' }}>
      <Badge tone="orange" size="sm">SIGN UP CHECK</Badge>
      <div className="tm-text-heading" style={{ marginTop: 14 }}>가입 전<br/>확인이 필요해요</div>
      <div style={{ display: 'grid', gap: 16, marginTop: 24 }}>
        <div>
          <div className="tm-text-label" style={{ marginBottom: 8 }}>닉네임</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 92px', gap: 8 }}>
            <input className="tm-input" placeholder="정민" style={{ borderColor: 'var(--red500)' }}/>
            <button className="tm-btn tm-btn-md tm-btn-neutral">중복체크</button>
          </div>
          <div className="tm-text-caption" style={{ marginTop: 6, color: 'var(--red500)' }}>이미 사용 중인 닉네임이에요.</div>
        </div>
        <SMRevisionAuthField label="이메일" placeholder="you@example.com" type="email" state="success" helper="사용 가능한 이메일이에요."/>
        <SMRevisionAuthField label="비밀번호" placeholder="8자 이상" type="password"/>
        <SMRevisionAuthField label="비밀번호 확인" placeholder="비밀번호 다시 입력" type="password" state="error" helper="비밀번호가 일치하지 않아요."/>
      </div>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block" disabled>오류 수정 후 가입 가능</button>
      <div className="tm-text-micro" style={{ marginTop: 8, textAlign: 'center' }}>닉네임 중복과 비밀번호 확인을 먼저 해결해주세요.</div>
    </div>
  </div>
);

const SMRevisionAuthSM4LocationDenied = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <TopNav title="지역 선택" onBack={() => {}}/>
    <div style={{ flex: 1, padding: '28px 20px 118px' }}>
      <Badge tone="orange" size="sm">LOCATION DENIED</Badge>
      <div className="tm-text-heading" style={{ marginTop: 14 }}>위치 권한 없이도<br/>시작할 수 있어요</div>
      <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)', lineHeight: 1.55 }}>권한을 거부해도 수동 지역 선택으로 복구한다. 닫으면 기존 선택값은 유지한다.</div>
      <Card pad={18} style={{ marginTop: 24, background: 'var(--orange50)' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <Icon name="pin" size={22} color="var(--orange500)"/>
          <div>
            <div className="tm-text-body-lg">현재 위치를 가져오지 못했어요</div>
            <div className="tm-text-caption" style={{ marginTop: 6 }}>설정에서 권한을 다시 켜거나, 직접 지역을 검색해 선택할 수 있어요.</div>
          </div>
        </div>
      </Card>
      <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">수동으로 지역 선택</button>
        <button className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block">나중에 설정하기</button>
      </div>
    </div>
  </div>
);

const SMRevisionAuthSM4Resume = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <TopNav title="온보딩 이어하기" onBack={() => {}}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '28px 20px 118px' }}>
      <Badge tone="blue" size="sm">RESUME</Badge>
      <div className="tm-text-heading" style={{ marginTop: 14 }}>이어서<br/>설정할까요?</div>
      <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)' }}>앱 종료나 뒤로가기 후 재진입하면 마지막 저장 지점과 누락 항목을 먼저 보여준다.</div>
      <div style={{ display: 'grid', gap: 10, marginTop: 24 }}>
        {[
          ['완료', '관심 종목', '축구 · 풋살 · 아이스하키'],
          ['진행 중', '레벨 선택', '하키 레벨 입력 필요'],
          ['대기', '지역 선택', '레벨 완료 후 진행'],
        ].map(([status, title, sub]) => (
          <Card key={title} pad={15}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Badge tone={status === '완료' ? 'green' : status === '진행 중' ? 'orange' : 'grey'} size="sm">{status}</Badge>
              <div>
                <div className="tm-text-body-lg">{title}</div>
                <div className="tm-text-caption" style={{ marginTop: 4 }}>{sub}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block">이어서 진행하기</button>
      <button className="tm-btn tm-btn-lg tm-btn-ghost tm-btn-block" style={{ marginTop: 8 }}>처음부터 다시 설정</button>
    </div>
  </div>
);

const SMRevisionProfileReviewMobile = () => (
  <SMRevisionShell title="마이" search notificationNew bottom navActive="my">
    <div style={{ padding: 20 }}>
      <Card pad={18}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ width: 58, height: 58, borderRadius: 20, background: `url(${IMG.av1}) center/cover` }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tm-text-subhead">정민</div>
            <div className="tm-text-caption">축구 · 풋살 · 매너 4.9</div>
          </div>
          <Badge tone="blue">verified</Badge>
        </div>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
        {[
          ['참가', 24],
          ['MVP', 5],
          ['리뷰', 18],
        ].map(([label, value]) => (
          <Card key={label} pad={14}>
            <div className="tm-text-caption">{label}</div>
            <div className="tm-text-subhead tab-num" style={{ marginTop: 4 }}>{value}</div>
          </Card>
        ))}
      </div>
      <SectionTitle title="받은 리뷰" sub="리뷰와 평판 신호는 verified/sample을 구분한다."/>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {['시간 약속을 잘 지켜요', '팀 플레이가 좋아요', '다시 같이 뛰고 싶어요'].map((text, index) => (
          <Card key={text} pad={14}>
            <div className="tm-text-body-lg">{text}</div>
            <div className="tm-text-caption" style={{ marginTop: 4 }}>매치 후 작성 · {index + 1}일 전</div>
          </Card>
        ))}
      </div>
      <SectionTitle title="리뷰 작성 흐름"/>
      <Card pad={16}>
        <div className="tm-text-body-lg">별점 + 태그 + 본문</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>SM 원문은 review를 대상 surface로 지정했지만 상세 body는 없다. 결제/매치 완료 후 companion flow로 둔다.</div>
      </Card>
    </div>
  </SMRevisionShell>
);

const SMRevisionPaymentMobile = ({ refund = false }) => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <TopNav title={refund ? '환불 요청' : '결제'} onBack={() => {}}/>
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px 110px' }}>
      <Card pad={18}>
        <div className="tm-text-caption">테스트 결제</div>
        <NumberDisplay value={refund ? 8000 : 12000} unit="원" size={34} sub={refund ? '실환불 없음 · mock mode' : '실제 청구 없음 · mock mode'}/>
      </Card>
      <Card pad={16} style={{ marginTop: 12 }}>
        <MoneyRow label="매치 참가비" amount={refund ? 12000 : 12000}/>
        <MoneyRow label={refund ? '환불 가능 금액' : '플랫폼 할인'} amount={refund ? 8000 : -4000} accent/>
        <MoneyRow label={refund ? '환불 예정' : '결제 금액'} amount={refund ? 8000 : 8000} strong/>
      </Card>
      <Card pad={16} style={{ marginTop: 12 }}>
        <div className="tm-text-body-lg">{refund ? '환불 사유' : '결제 상태'}</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>{refund ? '처리 주체, 예상 다음 상태, 거절 가능성을 persistent UI로 표시한다.' : '성공/실패/pending은 toast가 아니라 내역과 상세 화면으로 이어진다.'}</div>
      </Card>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <SBtn full size="lg">{refund ? '환불 요청하기' : '결제하고 참가하기'}</SBtn>
    </div>
  </div>
);

const SMRevisionLandingMobile = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', overflow: 'hidden' }}>
    <StatusBar/>
    <div style={{ height: 56, padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div className="tm-text-body-lg">teameet</div>
      <button className="tm-btn tm-btn-sm tm-btn-primary">시작하기</button>
    </div>
    <div style={{ padding: '28px 24px 0' }}>
      <div className="tm-text-heading">오늘 같이 뛸 사람을<br/>가장 빠르게 찾는 방법</div>
      <div className="tm-text-body" style={{ marginTop: 10 }}>SM 대상 surface인 landing은 badge/title만으로 첫 화면을 비우지 않고, CTA와 next-step summary를 바로 보여준다.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 28 }}>
        {[
          ['개인 매치', '03으로 이동'],
          ['팀매치', '04로 이동'],
          ['팀 찾기', '05로 이동'],
          ['채팅/알림', '06 activity'],
        ].map(([title, sub]) => (
          <Card key={title} pad={16}>
            <div className="tm-text-body-lg">{title}</div>
            <div className="tm-text-caption" style={{ marginTop: 4 }}>{sub}</div>
          </Card>
        ))}
      </div>
      <Card pad={18} style={{ marginTop: 18, background: 'var(--grey900)', color: 'var(--static-white)' }}>
        <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.66)' }}>오늘 열린 매치</div>
        <div className="tm-text-title tab-num" style={{ color: 'var(--static-white)', marginTop: 4 }}>124</div>
        <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.66)' }}>서울 기준 · sample data</div>
      </Card>
    </div>
  </div>
);

const SMRevisionAdminMobile = () => (
  <div style={{ width: 375, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', overflow: 'hidden' }}>
    <StatusBar/>
    <TopNav title="Admin" trailing={<button className="tm-btn tm-btn-sm tm-btn-neutral">필터</button>}/>
    <div style={{ height: 756, overflow: 'auto', padding: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          ['신고 대기', 12],
          ['정산 보류', 7],
          ['분쟁', 3],
          ['리뷰 검토', 18],
        ].map(([label, value]) => (
          <Card key={label} pad={14}>
            <div className="tm-text-caption">{label}</div>
            <div className="tm-text-subhead tab-num" style={{ marginTop: 4 }}>{value}</div>
          </Card>
        ))}
      </div>
      <SectionTitle title="운영 큐" sub="SM 대상 surface인 admin은 상세 body가 없으므로 기존 admin shell 아래 판단/처리 추적성을 먼저 고정한다."/>
      {['분쟁 환불 판단 필요', '팀매치 신고 접수', '시설 등록 검수'].map((title, index) => (
        <Card key={title} pad={16} style={{ marginBottom: 10 }}>
          <div className="tm-text-body-lg">{title}</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>담당자 · 사유 · 부분 실패 · audit log를 남긴다.</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="tm-btn tm-btn-sm tm-btn-primary">처리</button>
            <button className="tm-btn tm-btn-sm tm-btn-neutral">보류</button>
          </div>
        </Card>
      ))}
    </div>
  </div>
);

const SM2_TEAM_SUMMARY = {
  home: { name: 'FC 발빠른놈들', grade: 'A', manner: '4.8', wins: 23, color: 'var(--blue500)' },
  away: { name: '상대팀 모집중', grade: '-', manner: '-', wins: '-', color: 'var(--grey500)' },
};

const SMRevisionTeamLogoSM2 = ({ name, color = 'var(--blue500)' }) => (
  <div style={{ width: 46, height: 46, borderRadius: 14, background: 'var(--grey50)', border: '1px solid var(--grey100)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
    <div className="tm-text-label" style={{ color }}>{name.slice(0, 2)}</div>
  </div>
);

const SMRevisionTeamMatchShellSM2 = ({ children, bottom = true }) => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: bottom ? 12 : 0 }}>
      {children}
    </div>
    {bottom && <SMBottomNav active="teamMatches"/>}
  </div>
);

const SMRevisionTeamMatchSM2Header = ({ mode = 'card', query = '' }) => (
  <div style={{ padding: '18px 20px 0' }}>
    <div style={{ display: 'flex', gap: 8 }}>
      <div style={{ flex: 1, minHeight: 48, borderRadius: 12, background: 'var(--grey100)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', color: 'var(--text-caption)' }}>
        <Icon name="search" size={18}/>
        <span className="tm-text-body" style={{ color: query ? 'var(--text-strong)' : 'var(--text-caption)' }}>{query || '지역, 시간, 팀명 검색'}</span>
      </div>
      <button className="tm-btn tm-btn-icon tm-btn-neutral" aria-label={mode === 'card' ? '콤팩트 보기로 전환' : '카드 보기로 전환'}>
        {mode === 'card' ? 'ㅁ|ㅁ' : 'ㅁ'}
      </button>
    </div>
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '16px 0 14px' }}>
      {SPORTS.slice(0, 7).map((sport, index) => (
        <HapticChip key={sport.id} active={index === 0} count={index === 0 ? TEAM_MATCHES.length : index + 1}>{sport.label}</HapticChip>
      ))}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, padding: '2px 0 4px' }}>
      {[
        ['매치수', '28', '선택 종목 기준'],
        ['오늘매치수', '5', '서울 전체'],
        ['마감임박', '3', '24시간 이내'],
      ].map(([label, value, sub]) => (
        <div key={label} style={{ minWidth: 0 }}>
          <div className="tm-text-caption">{label}</div>
          <div className="tm-text-subhead tab-num" style={{ marginTop: 4 }}>{value}</div>
          <div className="tm-text-micro" style={{ marginTop: 2, color: 'var(--text-caption)' }}>{sub}</div>
        </div>
      ))}
    </div>
  </div>
);

const SMRevisionTeamMatchSearchFocusMobileSM2 = () => (
  <SMRevisionTeamMatchShellSM2>
    <div style={{ padding: '18px 20px 0' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1, minHeight: 48, borderRadius: 12, background: 'var(--grey100)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', color: 'var(--text-strong)', boxShadow: '0 0 0 2px var(--blue50)' }}>
          <Icon name="search" size={18}/>
          <input value="풋살" readOnly aria-label="팀매치 검색어" style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-strong)' }} className="tm-text-body"/>
        </div>
        <button className="tm-btn tm-btn-icon tm-btn-primary" aria-label="검색 실행">
          <Icon name="search" size={19}/>
        </button>
        <button className="tm-btn tm-btn-md tm-btn-ghost">취소</button>
      </div>
      <div style={{ marginTop: 20 }}>
        <div className="tm-text-label">최근 검색</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {['풋살', '강남 FC', 'A등급', '오늘 저녁'].map((label) => <HapticChip key={label}>{label}</HapticChip>)}
        </div>
      </div>
      <div style={{ marginTop: 22 }}>
        <div className="tm-text-label">빠른 조건</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
          {[
            ['마감임박', '24시간 이내'],
            ['오늘매치', '오늘 진행'],
            ['매너 4.7+', '팀 신뢰도'],
            ['가격 낮은순', '참가비 기준'],
          ].map(([title, sub], index) => (
            <Card key={title} pad={14} style={{ background: index === 0 ? 'var(--blue50)' : 'var(--bg)' }}>
              <div className="tm-text-label" style={{ color: index === 0 ? 'var(--blue500)' : 'var(--text-strong)' }}>{title}</div>
              <div className="tm-text-caption" style={{ marginTop: 4 }}>{sub}</div>
            </Card>
          ))}
        </div>
      </div>
      <Card pad={14} style={{ marginTop: 18, background: 'var(--grey50)' }}>
        <div className="tm-text-label">검색 진입 규칙</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>개인매치와 같은 focused search 화면을 사용한다. 검색어를 입력하고 오른쪽 검색 아이콘으로 결과 화면에 진입한다.</div>
      </Card>
    </div>
  </SMRevisionTeamMatchShellSM2>
);

const SMRevisionTeamMatchCardSM2 = ({ item, index }) => (
  <Card pad={0} style={{ overflow: 'hidden' }}>
    <div style={{ height: 146, background: 'var(--grey900)', position: 'relative', color: 'var(--static-white)', padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Badge tone="blue">{item.sport}</Badge>
          <Badge tone="grey">{item.grade}등급</Badge>
          <Badge tone={index === 0 ? 'orange' : 'grey'}>{index === 0 ? '마감임박' : '모집중'}</Badge>
        </div>
        <div className="tm-text-micro tab-num" style={{ color: 'rgba(255,255,255,.74)' }}>{item.format}</div>
      </div>
      <div>
        <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.72)' }}>{item.date} · {item.time}</div>
        <div className="tm-text-subhead" style={{ color: 'var(--static-white)', marginTop: 4 }}>{item.host} vs 상대팀</div>
      </div>
    </div>
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <SMRevisionTeamLogoSM2 name={item.host}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tm-text-body-lg" style={{ color: 'var(--text-strong)' }}>{item.host}</div>
          <div className="tm-text-caption" style={{ marginTop: 3 }}>{item.venue}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="tm-text-label tab-num">{item.cost.toLocaleString()}원</div>
          <div className="tm-text-micro" style={{ color: 'var(--text-caption)', marginTop: 2 }}>승리 {index === 0 ? 23 : 15}회</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
        {[
          ['매너', index === 0 ? '4.8' : '4.6'],
          ['인원', item.format],
          ['유니폼', item.uniform],
        ].map(([label, value]) => (
          <div key={label} style={{ minWidth: 0 }}>
            <div className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>{label}</div>
            <div className="tm-text-label tab-num" style={{ marginTop: 3 }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  </Card>
);

const SMRevisionTeamMatchCompactSM2 = ({ item, index }) => (
  <Card pad={12}>
    <div style={{ display: 'grid', gridTemplateColumns: '46px minmax(0, 1fr) auto', gap: 12, alignItems: 'center' }}>
      <SMRevisionTeamLogoSM2 name={item.host} color={index === 0 ? 'var(--blue500)' : 'var(--orange500)'}/>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
          <Badge tone="blue">{item.grade}</Badge>
          <div className="tm-text-body-lg" style={{ color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.host}</div>
        </div>
        <div className="tm-text-caption" style={{ marginTop: 4 }}>{item.venue}</div>
        <div className="tm-text-caption tab-num" style={{ marginTop: 3 }}>매너 {index === 0 ? '4.8' : '4.6'} · {item.format} · {item.time}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="tm-text-label tab-num">{item.cost.toLocaleString()}원</div>
        <div className="tm-text-micro" style={{ color: 'var(--text-caption)', marginTop: 4 }}>승 {index === 0 ? 23 : 15}</div>
      </div>
    </div>
  </Card>
);

const SMRevisionTeamMatchListMobileSM2 = ({ mode = 'card' }) => (
  <SMRevisionTeamMatchShellSM2>
    <SMRevisionTeamMatchSM2Header mode={mode}/>
    <div style={{ padding: '16px 20px 24px' }}>
      <div style={{ marginBottom: 10 }}>
        <div className="tm-text-label">팀매치</div>
        <div className="tm-text-caption" style={{ marginTop: 2 }}>카드형과 콤팩트형은 동시에 노출하지 않고 하나의 보기 모드만 렌더합니다.</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {TEAM_MATCHES.map((item, index) => (
          mode === 'card'
            ? <SMRevisionTeamMatchCardSM2 key={item.id} item={item} index={index}/>
            : <SMRevisionTeamMatchCompactSM2 key={item.id} item={item} index={index}/>
        ))}
      </div>
    </div>
  </SMRevisionTeamMatchShellSM2>
);

const SMRevisionTeamMatchSearchMobileSM2 = ({ mode = 'card' }) => (
  <SMRevisionTeamMatchShellSM2>
    <SMRevisionTeamMatchSM2Header mode={mode} query="풋살"/>
    <div style={{ padding: '16px 20px 24px' }}>
      <div className="tm-text-label">검색 결과</div>
      <div className="tm-text-caption" style={{ marginTop: 2, marginBottom: 12 }}><span className="tab-num">2</span>개 팀매치 · 검색어와 종목은 유지하고 보기 모드에 맞춰 결과를 보여줍니다.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {TEAM_MATCHES.filter((item) => item.sport === '풋살').map((item, index) => (
          mode === 'card'
            ? <SMRevisionTeamMatchCardSM2 key={item.id} item={item} index={index + 1}/>
            : <SMRevisionTeamMatchCompactSM2 key={item.id} item={item} index={index + 1}/>
        ))}
      </div>
    </div>
  </SMRevisionTeamMatchShellSM2>
);

const SMRevisionTeamMatchStateMobileSM2 = ({ state = 'empty' }) => {
  const isError = state === 'error';
  return (
    <SMRevisionTeamMatchShellSM2>
      <SMRevisionTeamMatchSM2Header mode="card"/>
      <div style={{ padding: 20 }}>
        <Card pad={22} style={{ minHeight: 246, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, background: isError ? 'rgba(254,152,0,.12)' : 'var(--grey100)', color: isError ? 'var(--orange500)' : 'var(--grey500)', display: 'grid', placeItems: 'center', marginBottom: 14 }}>
            <Icon name={isError ? 'bell' : 'calendar'} size={25}/>
          </div>
          <div className="tm-text-subhead">{isError ? '새로고침 필요합니다 필요' : '매치가 없습니다'}</div>
          <div className="tm-text-body" style={{ color: 'var(--text)', marginTop: 8 }}>
            {isError ? '0502 원문 오류 문구를 보존하고, 검색 조건과 종목 선택을 잃지 않은 상태에서 재시도합니다.' : '선택한 종목과 지역에 맞는 팀매치가 없을 때는 전체 보기와 필터 초기화를 제공합니다.'}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <button className="tm-btn tm-btn-md tm-btn-primary">{isError ? '새로고침' : '전체 보기'}</button>
            <button className="tm-btn tm-btn-md tm-btn-neutral">필터 초기화</button>
          </div>
        </Card>
      </div>
    </SMRevisionTeamMatchShellSM2>
  );
};

const SMRevisionTeamMatchDetailMobileSM2 = ({ mine = false, status = 'default', sheet = false }) => {
  const match = TEAM_MATCHES[0];
  const requested = status !== 'default';
  return (
    <SMRevisionTeamMatchShellSM2 bottom={false}>
      <div style={{ height: 220, background: 'var(--grey900)', color: 'var(--static-white)', position: 'relative', padding: '22px 20px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div style={{ position: 'absolute', top: 12, right: 18, display: 'flex', gap: 4 }}>
          <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="공유" style={{ color: 'var(--static-white)' }}><Icon name="share" size={21}/></button>
          <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="알림" style={{ color: 'var(--static-white)' }}><Icon name="bell" size={21}/></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 44px 1fr', gap: 12, alignItems: 'center' }}>
          <div style={{ minWidth: 0 }}>
            <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.68)' }}>홈팀</div>
            <div className="tm-text-subhead" style={{ color: 'var(--static-white)', marginTop: 4 }}>{SM2_TEAM_SUMMARY.home.name}</div>
            <div className="tm-text-micro tab-num" style={{ color: 'rgba(255,255,255,.72)', marginTop: 4 }}>매너 {SM2_TEAM_SUMMARY.home.manner} · 승 {SM2_TEAM_SUMMARY.home.wins}</div>
          </div>
          <div className="tm-text-label" style={{ color: 'rgba(255,255,255,.76)', textAlign: 'center' }}>VS</div>
          <div style={{ minWidth: 0, textAlign: 'right' }}>
            <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.68)' }}>상대팀</div>
            <div className="tm-text-subhead" style={{ color: 'var(--static-white)', marginTop: 4 }}>모집중</div>
            <div className="tm-text-micro" style={{ color: 'rgba(255,255,255,.72)', marginTop: 4 }}>신청 후 승인</div>
          </div>
        </div>
      </div>
      <div style={{ padding: '6px 20px 118px' }}>
        <SMRevisionInfoRow label="날짜와 시간" value={`${match.date} ${match.time}`}/>
        <SMRevisionInfoRow label="장소" value={match.venue}/>
        <SMRevisionInfoRow label="경기정보" value={`${match.sport} · ${match.format} · 전후반 30분`} sub={`${match.grade}등급 · 유니폼 ${match.uniform}`}/>
        <SMRevisionInfoRow label="참가비" value={`${match.cost.toLocaleString()}원`} sub="팀 단위 정산 · 테스트 결제 흐름에서는 실제 청구 없음"/>
        {requested && (
          <Card pad={14} style={{ marginTop: 14, background: status === 'approved' ? 'rgba(3,178,108,.08)' : 'rgba(254,152,0,.10)' }}>
            <div className="tm-text-label" style={{ color: status === 'approved' ? 'var(--green500)' : 'var(--orange500)' }}>{status === 'approved' ? '승인완료' : '승인중'}</div>
            <div className="tm-text-caption" style={{ marginTop: 5 }}>{status === 'approved' ? '신청이 확정되었습니다. 팀매치 상세와 결제 내역을 계속 확인할 수 있습니다.' : '신청 확인을 마쳤고 상대팀 검토 대기 중입니다. 처리 주체와 다음 상태를 화면에 남깁니다.'}</div>
          </Card>
        )}
        <Card pad={16} style={{ marginTop: 14 }}>
          <div className="tm-text-body-lg">팀 정보 보러가기</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>팀 상세조회로 이동해 매너, 전적, 멤버 구성을 확인합니다.</div>
        </Card>
        <Card pad={16} style={{ marginTop: 10 }}>
          <div className="tm-text-body-lg">채팅 및 신청</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>채팅은 신청 전 문의용 보조 CTA입니다. 신청은 bottom sheet에서 경기 요약과 결제 문구를 다시 확인합니다.</div>
        </Card>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="tm-text-caption">{mine ? '내가 만든 팀매치' : requested ? '신청 상태' : '채팅 후 신청 가능'}</span>
          <span className="tm-text-label tab-num">{match.cost.toLocaleString()}원</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: mine ? '1fr' : '104px 1fr', gap: 8 }}>
          {!mine && <button className="tm-btn tm-btn-lg tm-btn-neutral">채팅</button>}
          <button className={`tm-btn tm-btn-lg ${requested && !mine ? 'tm-btn-neutral' : 'tm-btn-primary'}`} disabled={requested && !mine}>{mine ? '매치 관리' : requested ? (status === 'approved' ? '승인완료' : '승인중') : '신청하기'}</button>
        </div>
      </div>
      {status === 'pending' && (
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 104, borderRadius: 16, background: 'var(--grey900)', color: 'var(--static-white)', padding: '14px 16px', boxShadow: 'var(--sh-2)' }}>
          <div className="tm-text-label" style={{ color: 'var(--static-white)' }}>신청 확인을 완료했어요</div>
          <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.72)', marginTop: 3 }}>상대팀이 승인하면 알림으로 알려드릴게요.</div>
        </div>
      )}
      {sheet && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(25,31,40,.36)', display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', background: 'var(--bg)', borderRadius: '22px 22px 0 0', padding: '18px 20px 24px' }} role="dialog" aria-modal="true">
            <div style={{ width: 36, height: 4, borderRadius: 999, background: 'var(--grey200)', margin: '0 auto 18px' }}/>
            <div className="tm-text-subhead">신청 요약</div>
            <div className="tm-text-caption" style={{ marginTop: 6 }}>신청 전 팀, 일시, 장소, 금액을 다시 확인합니다.</div>
            <SMRevisionInfoRow label="팀매치" value={`${match.host} vs 상대팀`}/>
            <SMRevisionInfoRow label="일시와 장소" value={`${match.date} ${match.time} · ${match.venue}`}/>
            <SMRevisionInfoRow label="신청 금액" value={`${match.cost.toLocaleString()}원`} sub="테스트 결제 흐름에서는 실제 청구 없음"/>
            <Card pad={14} style={{ margin: '12px 0 14px', background: 'var(--grey50)' }}>
              {[
                ['팀 정보 확인', `${match.host} · ${match.grade}등급`],
                ['경기 조건 확인', `${match.format} · ${match.uniform} 유니폼`],
                ['결제 전 확인', '승인 후 상태와 내역을 계속 표시'],
              ].map(([title, sub]) => (
                <div key={title} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0' }}>
                  <div style={{ width: 22, height: 22, borderRadius: 999, background: 'var(--blue50)', color: 'var(--blue500)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Icon name="check" size={14}/>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="tm-text-label">{title}</div>
                    <div className="tm-text-caption" style={{ marginTop: 1 }}>{sub}</div>
                  </div>
                </div>
              ))}
            </Card>
            <SBtn full size="lg">결제하고 신청하기</SBtn>
          </div>
        </div>
      )}
    </SMRevisionTeamMatchShellSM2>
  );
};

const SMRevisionTeamMatchMobileGridSM2 = () => (
  <SMRevisionRuleBoard title="04 팀매치 · SM 수정안 2 mobile grid" items={[
    { title: '보존 기준', body: '원본 04와 기존 04 SM 수정안은 유지한다. SM2는 같은 번호 아래 새 비교 섹션으로만 추가한다.' },
    { title: '목록 셸', body: '팀매치 SM3에서는 상단바를 제거한다. 본문 검색바, 단일 보기 전환 버튼, 종목 count selector, 3개 요약 counter를 둔다.' },
    { title: '정렬 기준', body: '정렬기준 박스는 이번 pass에서 제외한다. 매치수, 오늘매치수, 마감임박 카운터까지만 유지한다.' },
    { title: '카드형', body: '이미지 대신 팀매치 전용 VS 히어로를 사용한다. 종목, 등급, 기간/마감, 일정, 팀명, 위치, 인원 포맷, 가격, 승리수를 분리한다.' },
    { title: '콤팩트형', body: '로고, 레벨, 매너정보, 팀 이름, 위치, 인원 포맷, 시간, 가격, 승리수를 한 행 안에서 빠르게 비교하게 한다.' },
    { title: '검색/상태', body: '검색 진입은 focused search 화면을 쓰고 오른쪽 검색 아이콘으로 실행한다. ㅁ 카드형과 ㅁ|ㅁ 콤팩트형 모두 검색 결과 보드를 둔다.' },
    { title: '상세 구조', body: '상세는 하단바를 제외하고 back/share/notification, 팀 정보 vs 히어로, 날짜/시간/장소, 경기정보, 팀 정보 보러가기를 분리한다.' },
    { title: '신청 흐름', body: '채팅은 보조 CTA, 신청은 primary CTA다. 신청하기 클릭 시 bottom sheet에서 팀/조건/결제 전 확인을 한 번 더 체크한 뒤 결제하고 신청하기로 확정한다.' },
    { title: '신청 후 상태', body: '신청 직후에는 확인 완료 피드백을 보여주고 CTA는 승인중으로 잠근다. 승인완료 상태도 버튼 자체가 승인완료로 잠긴다.' },
    { title: '내 팀매치', body: '내 팀매치에서는 채팅/신청 CTA를 제거하고 매치 관리 CTA만 남긴다. 관리 상세 이동 책임을 명시한다.' },
    { title: '미정 범위', body: '0502 문서에는 팀매치 만들기 상세 요구사항이 없다. SM2에서는 새 만들기 flow를 설계하지 않고 미정으로 남긴다.' },
  ]}/>
);

const SM2_TEAM_BROWSE_TEAMS = [
  { name: '성수 러너스 FC', sport: '풋살', region: '성동', members: 18, fit: 94, manner: 4.9, status: '모집중', tone: 'blue', logo: 'SR', trust: 'verified', next: '수 20:00 정기전', tags: ['주 1회', '초중급', '빠른 응답'] },
  { name: '마포 위클리 배드민턴', sport: '배드민턴', region: '마포', members: 24, fit: 88, manner: 4.8, status: '검토중', tone: 'orange', logo: 'MW', trust: 'estimated', next: '토 09:00 복식', tags: ['신입 환영', '여성 멤버', '대관 보유'] },
  { name: '강남 하프코트', sport: '농구', region: '강남', members: 12, fit: 76, manner: 4.7, status: '마감', tone: 'grey', logo: 'GH', trust: 'sample', next: '다음 모집 알림', tags: ['3on3', '경험자 선호', '월 2회'] },
];

const SM2InlineStat = ({ label, value, sub }) => (
  <Card pad={12} style={{ background: 'var(--grey50)' }}>
    <div className="tm-text-caption">{label}</div>
    <div className="tm-text-subhead tab-num" style={{ marginTop: 3 }}>{value}</div>
    {sub && <div className="tm-text-micro" style={{ marginTop: 2 }}>{sub}</div>}
  </Card>
);

const SM2TeamBrowseCard = ({ team, selected = false }) => (
  <Card pad={16} interactive style={{ borderColor: selected ? 'var(--blue500)' : 'var(--border)', background: selected ? 'var(--blue50)' : 'var(--bg)' }}>
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ width: 54, height: 54, borderRadius: 16, background: selected ? 'var(--blue500)' : 'var(--grey900)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{team.logo}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <div className="tm-text-body-lg line-clamp-2">{team.name}</div>
          <Badge tone={team.tone} size="sm">{team.status}</Badge>
        </div>
        <div className="tm-text-caption" style={{ marginTop: 4 }}>{team.sport} · {team.region} · {team.members}명</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {team.tags.map((tag) => <Badge key={tag} tone="grey" size="sm">{tag}</Badge>)}
        </div>
      </div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
      <SM2InlineStat label="추천 적합도" value={`${team.fit}%`}/>
      <SM2InlineStat label="매너" value={team.manner}/>
      <SM2InlineStat label="신뢰" value={team.trust}/>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--grey100)' }}>
      <div className="tm-text-caption">{team.next}</div>
      <SBtn size="sm" variant={team.status === '마감' ? 'neutral' : 'primary'} disabled={team.status === '마감'}>{team.status === '마감' ? '알림받기' : '팀 보기'}</SBtn>
    </div>
  </Card>
);

const SMRevisionTeamBrowseMobileSM2 = () => (
  <SMRevisionShell title="팀" notificationNew bottom navActive="teams">
    <div style={{ padding: '18px 20px 96px' }}>
      <div className="tm-text-heading">나와 맞는 팀을 먼저 비교해요</div>
      <div className="tm-text-body" style={{ marginTop: 6 }}>0502 문서에는 05의 상하단바 유지까지만 확정되어 있어, 기존 온보딩의 선택 카드와 02 홈의 조용한 추천 문법을 합쳐 팀 탐색 기준을 고정합니다.</div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '18px 0 12px' }}>
        {['전체 42', '풋살 12', '축구 8', '배드민턴 9', '농구 6', '테니스 7'].map((label, index) => <HapticChip key={label} active={index === 0}>{label}</HapticChip>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <SM2InlineStat label="모집중" value="18팀" sub="서울 기준"/>
        <SM2InlineStat label="내 프로필 매칭" value="7팀" sub="sample"/>
      </div>
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {SM2_TEAM_BROWSE_TEAMS.map((team, index) => <SM2TeamBrowseCard key={team.name} team={team} selected={index === 0}/>)}
      </div>
    </div>
  </SMRevisionShell>
);

const SMRevisionTeamBrowseDetailSM2 = () => {
  const team = SM2_TEAM_BROWSE_TEAMS[0];
  return (
    <SMRevisionShell title="" back notificationNew={false} bottom={false}>
      <div style={{ padding: '18px 20px 118px' }}>
        <Card pad={18} style={{ background: 'var(--grey900)', color: 'var(--static-white)' }}>
          <div style={{ width: 60, height: 60, borderRadius: 18, background: 'var(--blue500)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{team.logo}</div>
          <div className="tm-text-heading" style={{ color: 'var(--static-white)', marginTop: 14 }}>{team.name}</div>
          <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.72)', marginTop: 4 }}>{team.sport} · {team.region} · 매너 {team.manner}</div>
        </Card>
        <SectionTitle title="결정 정보" sub="팀 선택 전에 비교해야 하는 사실만 먼저 보여줍니다."/>
        <Card pad={16}>
          {[
            ['활동 방식', '주 1회 정기전 · 신규 멤버 3명 모집'],
            ['신뢰 신호', 'verified · 최근 경기 12회 · 신고 0건'],
            ['가입 조건', '풋살 초중급 · 성동/광진권 활동 가능'],
          ].map(([label, value]) => <SMRevisionInfoRow key={label} label={label} value={value}/>)}
        </Card>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
        <div className="tm-text-caption" style={{ marginBottom: 8 }}>신청 전 팀 정보와 내 프로필 공개 범위를 확인합니다.</div>
        <SBtn full size="lg">가입 가능 여부 확인</SBtn>
      </div>
    </SMRevisionShell>
  );
};

const SMRevisionTeamBrowseStateSM2 = ({ state = 'empty' }) => {
  const isError = state === 'error';
  return (
    <SMRevisionShell title="팀" notificationNew={false} bottom navActive="teams">
      <div style={{ padding: '18px 20px' }}>
        <div className="tm-text-heading">팀 둘러보기</div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '18px 0' }}>
          {['전체 0', '풋살 0', '축구 0', '배드민턴 0'].map((label, index) => <HapticChip key={label} active={index === 0}>{label}</HapticChip>)}
        </div>
        <EmptyState
          title={isError ? '새로고침이 필요합니다' : '조건에 맞는 팀이 없습니다'}
          sub={isError ? '팀 목록을 불러오지 못했습니다. 선택한 종목과 지역 조건은 유지한 채 다시 시도합니다.' : '필터를 초기화하거나 내 프로필을 보완하면 추천 후보를 넓힐 수 있습니다.'}
          cta={isError ? '다시 시도' : '필터 초기화'}
        />
      </div>
    </SMRevisionShell>
  );
};

const SMRevisionTeamBrowseMobileGridSM2 = () => (
  <SMRevisionRuleBoard title="05 팀 둘러보기 · SM2 mobile grid" items={[
    { title: '복사 기준', body: '기존 05와 기존 05 SM 수정안은 유지한다. SM2는 같은 번호 아래에 붙는 새 비교 섹션이다.' },
    { title: '확정 범위', body: '0502에서 확정된 상단바와 하단바 유지, 홈 team shortcut의 05 연결을 그대로 반영한다.' },
    { title: '본문 보완', body: '문서에 없는 본문은 온보딩 선택 카드, 02 홈 추천, 04 팀매치 신뢰 정보를 참고해 팀 비교 목록으로 설계한다.' },
    { title: '신뢰 신호', body: '매너, 추천 적합도, 활동 횟수는 verified/estimated/sample 상태를 분리한다.' },
    { title: '주요 상태', body: '모집중, 검토중, 마감, empty, network error를 목록 카드와 CTA 상태로 분리한다.' },
    { title: '다음 단계', body: '팀 보기에서 팀 상세로 진입하고, 가입 가능 여부 확인은 별도 bottom sheet 또는 상세 CTA로 확장한다.' },
  ]}/>
);

const SMRevisionPlusBoard = ({ eyebrow, title, sub, columns = 3, children }) => (
  <div style={{ width: '100%', height: '100%', background: 'var(--grey50)', fontFamily: 'var(--font)', padding: 24, overflow: 'hidden' }}>
    <Badge tone="blue" size="sm">{eyebrow}</Badge>
    <div className="tm-text-heading" style={{ marginTop: 10 }}>{title}</div>
    {sub && <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 6, maxWidth: 760 }}>{sub}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 12, marginTop: 20 }}>
      {children}
    </div>
  </div>
);

const SMRevisionPlusCard = ({ index, title, trigger, feedback, next, state, tone = 'blue' }) => (
  <Card pad={16} style={{ minHeight: 170, borderColor: tone === 'red' ? 'rgba(240,68,82,.22)' : tone === 'orange' ? 'rgba(254,152,0,.28)' : 'var(--grey100)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
      <Badge tone={tone === 'red' ? 'red' : tone === 'orange' ? 'orange' : 'blue'} size="sm">{String(index).padStart(2, '0')}</Badge>
      <div className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>{state}</div>
    </div>
    <div className="tm-text-body-lg" style={{ marginTop: 12 }}>{title}</div>
    <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.55 }}>
      <b>Trigger</b> {trigger}
    </div>
    <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.55 }}>
      <b>Feedback</b> {feedback}
    </div>
    <div className="tm-text-caption" style={{ color: 'var(--text-caption)', marginTop: 6, lineHeight: 1.55 }}>
      <b>Next</b> {next}
    </div>
  </Card>
);

const SMRevisionPlusStateCard = ({ title, body, action, tone = 'neutral' }) => (
  <Card pad={16} style={{ minHeight: 152, background: tone === 'blue' ? 'var(--blue50)' : tone === 'orange' ? 'rgba(254,152,0,.10)' : tone === 'green' ? 'rgba(3,178,108,.08)' : tone === 'red' ? 'rgba(240,68,82,.08)' : 'var(--bg)' }}>
    <div className="tm-text-body-lg">{title}</div>
    <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.55 }}>{body}</div>
    <div className="tm-text-micro" style={{ color: tone === 'red' ? 'var(--red500)' : tone === 'orange' ? 'var(--orange500)' : tone === 'green' ? 'var(--green500)' : 'var(--blue500)', marginTop: 12 }}>{action}</div>
  </Card>
);

const SMRevisionAuthSM5ActionMatrix = () => (
  <SMRevisionPlusBoard
    eyebrow="01 AUTH SM5 · ACTIONS"
    title="버튼/입력 동작 매트릭스"
    sub="SM4의 로그인·회원가입·약관·온보딩 flow를 복사한 뒤, 각 버튼이 어떤 화면으로 이동하고 어떤 피드백을 남기는지 고정한다."
  >
    <SMRevisionPlusCard index={1} title="카카오/네이버 로그인" trigger="provider 버튼 tap" feedback="pressed scale, callback loading 화면" next="성공은 약관/온보딩 resume, 실패는 provider denied" state="auth"/>
    <SMRevisionPlusCard index={2} title="이메일 로그인" trigger="이메일/비밀번호 입력 후 로그인" feedback="필드 검증, 중복 submit lock" next="홈 fallback 또는 온보딩 이어하기" state="form"/>
    <SMRevisionPlusCard index={3} title="회원가입" trigger="계정 생성 CTA" feedback="필수 입력 오류를 inline으로 표시" next="약관 확인 step" state="form"/>
    <SMRevisionPlusCard index={4} title="약관 전체 동의" trigger="전체 동의/개별 checkbox" feedback="CTA disabled 해제" next="종목 선택" state="step"/>
    <SMRevisionPlusCard index={5} title="종목 선택" trigger="종목 card tap" feedback="선택 card blue outline, helper 갱신" next="레벨 선택" state="step"/>
    <SMRevisionPlusCard index={6} title="지역 선택/권한" trigger="지역 chip 또는 현재 위치" feedback="권한 요청/거부 sheet" next="선택 확인" state="permission" tone="orange"/>
  </SMRevisionPlusBoard>
);

const SMRevisionAuthSM5StateMatrix = () => (
  <SMRevisionPlusBoard eyebrow="01 AUTH SM5 · STATES" title="인증/온보딩 모든 상황 처리" columns={4}>
    <SMRevisionPlusStateCard title="callback loading" body="OAuth redirect 직후 skeleton과 처리 문구. 뒤로가기 대신 취소 CTA만 둔다." action="persistent loading"/>
    <SMRevisionPlusStateCard title="provider denied" body="사용자가 provider 권한을 거부. 다른 로그인 수단과 재시도 제공." action="retry" tone="orange"/>
    <SMRevisionPlusStateCard title="account conflict" body="이미 연결된 이메일/휴대폰이 있을 때 계정 선택 또는 고객지원 안내." action="resolve" tone="red"/>
    <SMRevisionPlusStateCard title="network error" body="입력값은 유지하고 재시도 CTA를 제공. toast만 사용하지 않는다." action="retry" tone="red"/>
    <SMRevisionPlusStateCard title="required missing" body="필수 약관/종목/지역 미선택. CTA disabled와 이유 row를 함께 노출." action="disabled reason"/>
    <SMRevisionPlusStateCard title="permission denied" body="위치 권한 거부. 수동 지역 선택으로 복구 가능해야 한다." action="manual fallback" tone="orange"/>
    <SMRevisionPlusStateCard title="resume onboarding" body="중단된 step을 복원하고 이미 선택한 값은 유지한다." action="resume" tone="blue"/>
    <SMRevisionPlusStateCard title="completed" body="환영 화면에서 홈으로 이동. 비로그인 홈 fallback과 구분한다." action="home" tone="green"/>
  </SMRevisionPlusBoard>
);

const SMRevisionAuthSM5Flow = () => (
  <SMRevisionPlusBoard eyebrow="01 AUTH SM5 · FLOW" title="화면 전환 흐름" columns={4}>
    {[
      ['로그인 진입', 'social/email/signup 선택', 'OAuth 또는 form으로 분기'],
      ['callback', 'provider 처리', 'loading/success/error/conflict'],
      ['약관', '필수 동의 확인', 'disabled/active CTA'],
      ['종목', '지원 종목 선택', '축구/풋살/하키/수영/러닝/배드민턴/테니스'],
      ['레벨', '종목별 입력', '선출/NTRP/스케이트 연차 등'],
      ['지역', '권한 또는 수동 선택', '권한 거부 fallback'],
      ['확인', '선택 요약', '수정/완료'],
      ['환영', '다음 행동', '홈/매치 추천 진입'],
    ].map(([title, body, action], index) => (
      <SMRevisionPlusStateCard key={title} title={`${index + 1}. ${title}`} body={body} action={action} tone={index === 7 ? 'green' : 'blue'}/>
    ))}
  </SMRevisionPlusBoard>
);

const SMRevisionHomeSM3ActionMatrix = () => (
  <SMRevisionPlusBoard eyebrow="02 HOME SM3 · ACTIONS" title="홈 버튼/카드 동작 매트릭스">
    <SMRevisionPlusCard index={1} title="검색" trigger="상단 검색 icon" feedback="검색 전용 화면, 최근 검색/추천 검색어" next="결과 선택 시 해당 list/detail" state="home"/>
    <SMRevisionPlusCard index={2} title="알림" trigger="new dot 알림 icon" feedback="pressed scale, unread count 유지" next="06 알림 목록" state="notification"/>
    <SMRevisionPlusCard index={3} title="대표 추천 매치" trigger="featured card tap" feedback="card press, 충원률/추천 이유 유지" next="03 개인 매치 상세" state="detail"/>
    <SMRevisionPlusCard index={4} title="match shortcut" trigger="match shortcut tap" feedback="blue active" next="03 개인 매치 목록" state="shortcut"/>
    <SMRevisionPlusCard index={5} title="team match shortcut" trigger="team match shortcut tap" feedback="neutral press" next="04 팀매치 목록" state="shortcut"/>
    <SMRevisionPlusCard index={6} title="my team shortcut" trigger="미정 shortcut tap" feedback="disabled reason sheet" next="destination 확정 전 이동 없음" state="blocked" tone="orange"/>
  </SMRevisionPlusBoard>
);

const SMRevisionHomeSM3StateMatrix = () => (
  <SMRevisionPlusBoard eyebrow="02 HOME SM3 · STATES" title="홈 데이터/권한/네트워크 상황 처리" columns={4}>
    <SMRevisionPlusStateCard title="비로그인" body="인사만 표시. 활동/매너/통계는 '-'로, 추천은 랜덤 match 1+5개." action="login CTA optional"/>
    <SMRevisionPlusStateCard title="네트워크 이슈" body="인사만 표시. 숫자는 '-', 대표/추천/공지 제목은 새로고침 필요." action="refresh" tone="red"/>
    <SMRevisionPlusStateCard title="날씨 권한 없음" body="서울 날씨 fallback 또는 '-' 상태를 명시." action="manual region" tone="orange"/>
    <SMRevisionPlusStateCard title="추천 0건" body="관심 종목 기반 추천이 없으면 랜덤/인기 매치로 대체하고 이유를 표기." action="browse matches"/>
    <SMRevisionPlusStateCard title="공지 없음" body="pinned 공지가 없으면 영역을 과하게 비우지 않고 축소." action="hidden/compact"/>
    <SMRevisionPlusStateCard title="unread 알림" body="new dot과 count. 읽음 처리는 알림 화면에서 수행." action="notification list" tone="blue"/>
    <SMRevisionPlusStateCard title="통계 pending" body="집계 중이면 '-'가 아니라 pending label을 쓴다." action="processing" tone="orange"/>
    <SMRevisionPlusStateCard title="정상" body="인사/활동/추천/shortcut/weather/list/stat/notice 순서 유지." action="browse" tone="green"/>
  </SMRevisionPlusBoard>
);

const SMRevisionHomeSM3Flow = () => (
  <SMRevisionPlusBoard eyebrow="02 HOME SM3 · FLOW" title="홈 화면 전환과 후속 처리" columns={4}>
    {[
      ['홈 진입', 'auth 상태와 네트워크 상태를 먼저 판별', 'signed-in/signed-out/network'],
      ['활동 요약', '월간 활동/매너/통계 fetch', 'dash or value'],
      ['대표 추천', '관심 종목 중 충원률 최고 match', 'detail route'],
      ['shortcut', '4개 category action', '03/04/05/my-team'],
      ['날씨', '위치/온도/날씨', '서울 fallback'],
      ['추천 목록', '약 5개 match', '전체보기는 03'],
      ['통계/공지', '참가/MVP/결제 + pinned notice', 'detail route'],
      ['late update', '알림/통계 late fetch', 'layout shift 없이 row 갱신'],
    ].map(([title, body, action], index) => (
      <SMRevisionPlusStateCard key={title} title={`${index + 1}. ${title}`} body={body} action={action} tone={index === 7 ? 'orange' : 'blue'}/>
    ))}
  </SMRevisionPlusBoard>
);

const SMRevisionMatchSM4ActionMatrix = () => (
  <SMRevisionPlusBoard eyebrow="03 MATCH SM4 · ACTIONS" title="개인 매치 버튼/화면 동작 매트릭스">
    <SMRevisionPlusCard index={1} title="상단바 제거" trigger="03 SM4 매치 화면 진입" feedback="StatusBar만 남기고 app top bar 제거" next="본문 검색/필터가 최상단" state="shell"/>
    <SMRevisionPlusCard index={2} title="검색 입력" trigger="검색바 tap/type" feedback="focused search, query 유지" next="검색 아이콘으로 실행" state="search"/>
    <SMRevisionPlusCard index={3} title="검색 실행" trigger="blue search icon tap" feedback="현재 보기 모드 유지" next="카드형 또는 콤팩트형 검색 결과" state="submit"/>
    <SMRevisionPlusCard index={4} title="보기 전환" trigger="ㅁ|ㅁ / ㅁ 단일 icon tap" feedback="list shape 전환" next="같은 query/sport 유지" state="view"/>
    <SMRevisionPlusCard index={5} title="종목 선택" trigger="sport count chip tap" feedback="chip active, counter 갱신" next="선택 종목 기준 list" state="filter"/>
    <SMRevisionPlusCard index={6} title="카드 선택" trigger="match row/card tap" feedback="push transition" next="매치 상세" state="detail"/>
  </SMRevisionPlusBoard>
);

const SMRevisionMatchSM4Shell = ({ children, bottom = true }) => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: bottom ? 12 : 0 }}>
      {children}
    </div>
    {bottom && <SMBottomNav active="matches"/>}
  </div>
);

const SMRevisionMatchSM4SearchHeader = ({ mode = 'card', query = '', focused = false }) => (
  <div style={{ padding: '18px 20px 0' }}>
    <div style={{ display: 'grid', gridTemplateColumns: focused ? 'minmax(0, 1fr) 44px 44px auto' : 'minmax(0, 1fr) 44px 44px', gap: 8, alignItems: 'center' }}>
      <div style={{ minHeight: 48, borderRadius: 12, background: 'var(--grey100)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', color: query ? 'var(--text-strong)' : 'var(--text-caption)', boxShadow: focused ? '0 0 0 2px var(--blue50)' : 'none', minWidth: 0 }}>
        <Icon name="search" size={18}/>
        <span className="tm-text-body" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{query || '지역, 시간, 매치명 검색'}</span>
        {focused && <span style={{ width: 1, height: 20, background: 'var(--blue500)', marginLeft: 2, flexShrink: 0 }}/>}
      </div>
      <button className="tm-btn tm-btn-icon tm-btn-primary" aria-label="검색 실행">
        <Icon name="search" size={19}/>
      </button>
      <button className="tm-btn tm-btn-icon tm-btn-neutral" aria-label={mode === 'card' ? '콤팩트 보기로 전환' : '카드 보기로 전환'}>
        {mode === 'card' ? 'ㅁ|ㅁ' : 'ㅁ'}
      </button>
      {focused && <button className="tm-btn tm-btn-sm tm-btn-ghost">취소</button>}
    </div>
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '16px 0 14px' }}>
      {SPORTS.slice(0, 7).map((sport, index) => (
        <HapticChip key={sport.id} active={index === 0} count={index === 0 ? MATCHES.length : index + 2}>{sport.label}</HapticChip>
      ))}
    </div>
    {!focused && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, padding: '2px 0 4px' }}>
        {SM3_MATCH_STATS.map(([label, value, sub]) => (
          <div key={label} style={{ minWidth: 0 }}>
            <div className="tm-text-caption">{label}</div>
            <div className="tm-text-subhead tab-num" style={{ marginTop: 4 }}>{value}</div>
            <div className="tm-text-micro" style={{ marginTop: 2, color: 'var(--text-caption)' }}>{sub}</div>
          </div>
        ))}
      </div>
    )}
  </div>
);

const SMRevisionMatchListMobileSM4 = ({ mode = 'card' }) => (
  <SMRevisionMatchSM4Shell>
    <SMRevisionMatchSM4SearchHeader mode={mode}/>
    <div style={{ padding: '16px 20px 24px' }}>
      <div style={{ marginBottom: 10 }}>
        <div className="tm-text-label">개인 매치</div>
        <div className="tm-text-caption" style={{ marginTop: 2 }}>상단바 없이 검색, 실행, 보기 전환을 본문 상단에서 처리합니다.</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {MATCHES.slice(0, mode === 'card' ? 3 : 5).map((item, index) => (
          mode === 'card'
            ? <SMRevisionMatchSM3CardItem key={item.id} item={item} index={index}/>
            : <SMRevisionMatchSM3CompactItem key={item.id} item={item}/>
        ))}
      </div>
    </div>
  </SMRevisionMatchSM4Shell>
);

const SMRevisionMatchSearchFocusMobileSM4 = () => (
  <SMRevisionMatchSM4Shell>
    <SMRevisionMatchSM4SearchHeader mode="card" query="풋살" focused/>
    <div style={{ padding: '18px 20px 24px' }}>
      <div className="tm-text-label">최근 검색</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {['풋살', '강남', '오늘 저녁', '마감임박'].map((label, index) => (
          <button key={label} className={`tm-chip ${index === 0 ? 'tm-chip-active' : ''}`}>{label}</button>
        ))}
      </div>
      <div style={{ height: 1, background: 'var(--grey100)', margin: '20px 0' }}/>
      <div className="tm-text-label">빠른 조건</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
        {[
          ['오늘 참여 가능', '오늘매치수 기준'],
          ['내 주변 5km', '위치 권한 필요 시 안내'],
          ['마감임박', '24시간 이내'],
          ['초급 환영', '레벨 필터 적용'],
        ].map(([title, sub]) => (
          <Card key={title} pad={14} interactive>
            <div className="tm-text-label">{title}</div>
            <div className="tm-text-micro" style={{ marginTop: 4, color: 'var(--text-caption)' }}>{sub}</div>
          </Card>
        ))}
      </div>
      <Card pad={14} style={{ marginTop: 18, background: 'var(--grey50)' }}>
        <div className="tm-text-label">검색 실행</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>검색어 입력 후 blue 검색 아이콘을 누르면 현재 보기 모드에 맞는 검색 결과로 이동합니다.</div>
      </Card>
    </div>
  </SMRevisionMatchSM4Shell>
);

const SMRevisionMatchSearchMobileSM4 = ({ mode = 'compact' }) => {
  const results = MATCHES.filter((item) => item.title.includes('풋살') || item.venue.includes('풋살'));
  return (
    <SMRevisionMatchSM4Shell>
      <SMRevisionMatchSM4SearchHeader mode={mode} query="풋살"/>
      <div style={{ padding: '16px 20px 24px' }}>
        <div style={{ marginBottom: 12 }}>
          <div className="tm-text-label">검색 결과 · {mode === 'card' ? '카드형' : '콤팩트형'}</div>
          <div className="tm-text-caption" style={{ marginTop: 2 }}><span className="tab-num">{results.length}</span>개 매치 · 같은 검색어에서 보기 버튼만 전환합니다.</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {results.map((item, index) => (
            mode === 'card'
              ? <SMRevisionMatchSM3CardItem key={item.id} item={item} index={index}/>
              : <SMRevisionMatchSM3CompactItem key={item.id} item={item}/>
          ))}
        </div>
      </div>
    </SMRevisionMatchSM4Shell>
  );
};

const SMRevisionMatchSM4StateMatrix = () => (
  <SMRevisionPlusBoard eyebrow="03 MATCH SM4 · STATES" title="개인 매치 전체 상황 처리" columns={4}>
    <SMRevisionPlusStateCard title="loading" body="검색/목록 skeleton은 카드형과 콤팩트형 shape를 각각 유지." action="skeleton"/>
    <SMRevisionPlusStateCard title="조회 없음" body="'매치가 없습니다'와 필터 초기화 CTA를 함께 둔다." action="reset filter"/>
    <SMRevisionPlusStateCard title="네트워크 오류" body="'새로고침 필요합니다 필요' 원문 보존 + 재시도 CTA." action="retry" tone="red"/>
    <SMRevisionPlusStateCard title="마감 임박" body="deadline badge와 남은 시간. CTA 가능 여부는 별도 표기." action="deadline" tone="orange"/>
    <SMRevisionPlusStateCard title="모집 완료" body="sold out이면 참가 CTA 비활성, 대기 신청 가능 여부 분리." action="waitlist" tone="orange"/>
    <SMRevisionPlusStateCard title="승인중" body="참가 신청 후 CTA 잠금. 처리 주체와 다음 상태를 표시." action="pending" tone="orange"/>
    <SMRevisionPlusStateCard title="승인완료" body="승인완료 CTA는 disabled success. 결제/상세 진입 구분." action="approved" tone="green"/>
    <SMRevisionPlusStateCard title="내 매치" body="참가 흐름 제거. 관리 CTA와 참가자/상태 관리 진입." action="manage" tone="blue"/>
  </SMRevisionPlusBoard>
);

const SMRevisionMatchSM4Flow = () => (
  <SMRevisionPlusBoard eyebrow="03 MATCH SM4 · FLOW" title="목록 → 상세 → 참가 → 승인 흐름" columns={4}>
    {[
      ['목록 진입', '상단바 없이 검색바/보기전환/종목 selector/counter', 'list'],
      ['필터 변경', '종목별 카운터와 목록 동시 갱신', 'filtered list'],
      ['검색 입력', '검색어 입력 중 추천/최근 검색 표시, 검색 icon으로 실행', 'search focus'],
      ['검색 결과', 'ㅁ|ㅁ 카드형과 ㅁ 콤팩트형 결과를 모두 제공', 'search result'],
      ['상세', '이미지/일시/장소/인원/참가비/호스트/소개/참가자', 'detail'],
      ['참가 sheet', '요약과 결제 전 확인', 'bottom sheet'],
      ['결제하고 참가', 'mock/test 결제 문구 필요', 'pending'],
      ['승인 결과', '승인중/승인완료/거절', 'state locked'],
    ].map(([title, body, action], index) => (
      <SMRevisionPlusStateCard key={title} title={`${index + 1}. ${title}`} body={body} action={action} tone={index >= 5 ? 'orange' : 'blue'}/>
    ))}
  </SMRevisionPlusBoard>
);

const SMRevisionTeamMatchSM3ActionMatrix = () => (
  <SMRevisionPlusBoard eyebrow="04 TEAM MATCH SM3 · ACTIONS" title="팀매치 버튼/화면 동작 매트릭스">
    <SMRevisionPlusCard index={1} title="검색/보기 전환" trigger="검색바 또는 카드/콤팩트 icon" feedback="query와 view mode 유지" next="팀매치 목록 갱신" state="list"/>
    <SMRevisionPlusCard index={2} title="종목 선택" trigger="sport count chip tap" feedback="counter와 정렬 기준 갱신" next="선택 종목 팀매치" state="filter"/>
    <SMRevisionPlusCard index={3} title="팀 정보 보러가기" trigger="상세의 team info row tap" feedback="push transition" next="팀 세부조회" state="team"/>
    <SMRevisionPlusCard index={4} title="채팅" trigger="채팅 보조 CTA tap" feedback="context card 포함 chat room" next="06 채팅방" state="chat"/>
    <SMRevisionPlusCard index={5} title="신청하기" trigger="primary CTA tap" feedback="신청 요약 bottom sheet" next="결제하고 신청하기" state="apply"/>
    <SMRevisionPlusCard index={6} title="매치 관리" trigger="내 팀매치 CTA tap" feedback="owner manage route" next="내 팀매치 상세/관리" state="owner"/>
  </SMRevisionPlusBoard>
);

const SMRevisionTeamMatchSM3StateMatrix = () => (
  <SMRevisionPlusBoard eyebrow="04 TEAM MATCH SM3 · STATES" title="팀매치 전체 상황 처리" columns={4}>
    <SMRevisionPlusStateCard title="loading" body="VS 히어로/로고/카운터 skeleton shape 유지." action="skeleton"/>
    <SMRevisionPlusStateCard title="조회 없음" body="'매치가 없습니다'와 조건 초기화 CTA." action="reset"/>
    <SMRevisionPlusStateCard title="네트워크 오류" body="'새로고침 필요합니다 필요' 원문 보존 + 재시도." action="retry" tone="red"/>
    <SMRevisionPlusStateCard title="팀 권한 없음" body="팀 소속/주장 권한이 없으면 신청 CTA 이유 표시." action="permission" tone="orange"/>
    <SMRevisionPlusStateCard title="신청중" body="신청 후 승인중 CTA lock. 상대 팀/운영자 처리 주체 표시." action="pending" tone="orange"/>
    <SMRevisionPlusStateCard title="승인완료" body="승인완료 상태에서 결제/채팅/일정 확인 후속 행동 제공." action="approved" tone="green"/>
    <SMRevisionPlusStateCard title="충원/마감" body="마감/정원 완료면 신청 CTA 차단, 채팅 가능 여부 별도." action="closed" tone="orange"/>
    <SMRevisionPlusStateCard title="내 팀매치" body="신청/채팅 CTA 제거. 관리 CTA와 스코어/출석 후속 진입." action="manage" tone="blue"/>
  </SMRevisionPlusBoard>
);

const SMRevisionTeamMatchSM3Flow = () => (
  <SMRevisionPlusBoard eyebrow="04 TEAM MATCH SM3 · FLOW" title="팀매치 목록 → 상세 → 신청/관리 흐름" columns={4}>
    {[
      ['목록 진입', '검색/보기전환/종목 selector/counter', 'list'],
      ['팀매치 카드', 'VS 히어로, 팀명, 위치, 인원, 가격, 승리수', 'card'],
      ['콤팩트 행', '로고/레벨/매너/시간/가격/승리수', 'compact'],
      ['상세', 'back/share/notification, 팀 정보 vs, 날짜/장소/경기정보', 'detail'],
      ['팀 정보', '팀 세부조회로 이동', 'team detail'],
      ['신청 sheet', '요약과 결제 전 확인', 'bottom sheet'],
      ['승인 상태', '승인중/승인완료/거절', 'state'],
      ['내 팀매치', '관리/출석/스코어/평가 flow로 연결', 'ops'],
    ].map(([title, body, action], index) => (
      <SMRevisionPlusStateCard key={title} title={`${index + 1}. ${title}`} body={body} action={action} tone={index >= 5 ? 'orange' : 'blue'}/>
    ))}
  </SMRevisionPlusBoard>
);

const SM2_CHAT_ROOMS = [
  { title: '성수 러너스 FC', type: '팀', last: '이번 주 정기전 참석 가능하신가요?', time: '2분 전', unread: 3, pinned: true, avatar: IMG.av1 },
  { title: '주말 풋살 매치', type: '개인매치', last: '참가 승인 완료됐습니다.', time: '18분 전', unread: 1, pinned: false, avatar: IMG.av3 },
  { title: '마포 배드민턴 팀매치', type: '팀매치', last: '상대팀 유니폼은 흰색입니다.', time: '어제', unread: 0, pinned: false, avatar: IMG.av4 },
];

const SMRevisionChatListMobileSM2 = () => (
  <SMRevisionShell title="채팅" back search notificationNew bottom navActive="my">
    <div style={{ padding: '18px 20px 96px' }}>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 14 }}>
        {['전체', '개인매치', '팀매치', '팀'].map((label, index) => <HapticChip key={label} active={index === 0}>{label}</HapticChip>)}
      </div>
      <div className="tm-text-caption" style={{ marginBottom: 8 }}>고정 채팅방은 상단, 나머지는 최근순입니다.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SM2_CHAT_ROOMS.map((room) => (
          <Card key={room.title} pad={14} interactive style={{ background: room.unread ? 'var(--blue50)' : 'var(--bg)' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: 16, background: `url(${room.avatar}) center/cover`, flexShrink: 0 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div className="tm-text-body-lg line-clamp-2">{room.title}</div>
                  {room.pinned && <Badge tone="blue" size="sm">고정</Badge>}
                </div>
                <div className="tm-text-caption line-clamp-2" style={{ marginTop: 3 }}>{room.type} · {room.last}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="tm-text-micro">{room.time}</div>
                {room.unread > 0 && <div style={{ marginTop: 6, minWidth: 20, height: 20, borderRadius: 999, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{room.unread}</div>}
              </div>
            </div>
          </Card>
        ))}
      </div>
      <button className="tm-btn tm-btn-primary" aria-label="새 채팅" style={{ position: 'absolute', right: 20, bottom: 90, width: 54, height: 54, borderRadius: 999, padding: 0, display: 'grid', placeItems: 'center', boxShadow: '0 10px 24px rgba(49,130,246,.28)' }}>
        <Icon name="chat" size={22}/>
      </button>
    </div>
  </SMRevisionShell>
);

const SMRevisionChatRoomMobileSM2 = () => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <StatusBar/>
    <TopNav title="주말 풋살 매치" onBack={() => {}}/>
    <div style={{ padding: 16, borderBottom: '1px solid var(--grey100)' }}>
      <Card pad={14} interactive>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="calendar" size={20} color="var(--blue500)"/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tm-text-body-lg">개인매치 상세조회</div>
            <div className="tm-text-caption">카테고리에 맞는 맥락 바로가기 박스를 상단에 고정합니다.</div>
          </div>
          <Icon name="chevR" size={18} color="var(--grey400)"/>
        </div>
      </Card>
    </div>
    <div style={{ flex: 1, padding: 20, overflow: 'auto', background: 'var(--grey50)' }}>
      {[
        ['상대', '오늘 14:00 경기 인원 확인 부탁드려요.'],
        ['나', '네. 20분 전에 도착하겠습니다.'],
        ['상대', '참가 승인 완료했습니다. 결제 내역도 확인됐어요.'],
      ].map(([who, msg], index) => (
        <div key={msg} style={{ maxWidth: index === 1 ? 250 : 286, marginLeft: index === 1 ? 'auto' : 0, marginBottom: 10, padding: '10px 12px', borderRadius: 14, background: index === 1 ? 'var(--blue500)' : 'var(--bg)', color: index === 1 ? 'var(--static-white)' : 'var(--text-strong)', boxShadow: 'var(--sh-1)' }}>
          <div className="tm-text-micro" style={{ color: index === 1 ? 'rgba(255,255,255,.72)' : 'var(--text-caption)', marginBottom: 3 }}>{who}</div>
          <div className="tm-text-body" style={{ color: 'inherit' }}>{msg}</div>
        </div>
      ))}
    </div>
    <div style={{ padding: '12px 16px 22px', display: 'flex', gap: 8, borderTop: '1px solid var(--grey100)' }}>
      <button className="tm-btn tm-btn-icon tm-btn-neutral" aria-label="이미지 추가"><Icon name="plus" size={20}/></button>
      <div style={{ flex: 1, minHeight: 44, borderRadius: 999, background: 'var(--grey100)', display: 'flex', alignItems: 'center', padding: '0 14px' }} className="tm-text-caption">메시지 입력</div>
      <button className="tm-btn tm-btn-icon tm-btn-primary" aria-label="전송"><Icon name="send" size={20}/></button>
    </div>
  </div>
);

const SMRevisionNotificationsMobileSM2 = ({ readAll = false }) => (
  <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', overflow: 'hidden', position: 'relative' }}>
    <StatusBar/>
    <div style={{ height: 56, padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--grey100)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="tm-btn tm-btn-icon tm-btn-ghost" aria-label="뒤로가기"><Icon name="chevL" size={22}/></button>
        <div className="tm-text-body-lg">알림 <span className="tab-num" style={{ color: readAll ? 'var(--grey500)' : 'var(--blue500)' }}>{readAll ? 0 : 2}</span></div>
      </div>
      <button className="tm-btn tm-btn-sm tm-btn-ghost">모두읽음</button>
    </div>
    <div style={{ height: 756, overflow: 'auto', padding: 20 }}>
      {['오늘', '어제'].map((group, groupIndex) => (
        <div key={group} style={{ marginBottom: 20 }}>
          <div className="tm-text-label" style={{ marginBottom: 8 }}>{group}</div>
          {[
            ['매치 참가 확정', '성수 풋살파크 · 10명 · 8,000원', '방금 전'],
            ['팀 초대', '성수 러너스 FC · 풋살 · 신입 환영', '10분 전'],
            ['리뷰 요청', '지난 경기 후기를 남겨주세요', '어제'],
          ].slice(groupIndex, groupIndex + 2).map(([title, body, time], index) => {
            const unread = !readAll && groupIndex === 0 && index < 2;
            return (
              <Card key={title} pad={14} interactive style={{ marginBottom: 8, background: unread ? 'var(--blue50)' : 'var(--bg)' }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 14, background: unread ? 'var(--blue500)' : 'var(--grey100)', color: unread ? 'var(--static-white)' : 'var(--text-muted)', display: 'grid', placeItems: 'center' }}>
                    <Icon name="bell" size={18}/>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="tm-text-body-lg">{title}</div>
                    <div className="tm-text-caption line-clamp-2" style={{ marginTop: 3 }}>{body}</div>
                    <div className="tm-text-micro" style={{ marginTop: 6 }}>{time}</div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ))}
    </div>
    {readAll && <Toast msg="모든 알림을 읽음 처리했습니다" type="success"/>}
  </div>
);

const SMRevisionCommunityMobileGridSM2 = () => (
  <SMRevisionRuleBoard title="06 커뮤니티/채팅/알림 · SM2 mobile grid" items={[
    { title: '복사 기준', body: '기존 06과 기존 06 SM 수정안을 유지하고, SM2는 채팅 목록/방/알림 상태를 더 세분화한 비교 섹션이다.' },
    { title: '채팅 목록', body: '뒤로가기, 채팅 제목, 검색, 알림, 필터 4개, 고정방 우선, 최근순 정렬, unread badge를 고정한다.' },
    { title: '플로팅 진입', body: '채팅 floating button은 하단바 바로 위 우측 하단에 놓고 최소 54px 터치 영역을 유지한다.' },
    { title: '채팅방', body: '상하단바를 제외하고 맥락 바로가기 박스, 메시지 내역, + 이미지 첨부, 입력, 전송을 분리한다.' },
    { title: '알림', body: '상하단바 제거, 뒤로가기, unread count, 모두읽음, 날짜 그룹, read/unread 배경 상태를 분리한다.' },
    { title: '경합 방지', body: '읽음 처리와 딥링크 이동은 같은 기본 Link 동작에 맡기지 않고 명시적 순서를 둔다.' },
  ]}/>
);

const SM2_PROFILE_STATS = [
  ['참가', 24],
  ['MVP', 5],
  ['리뷰', 18],
];

const SMRevisionProfileReviewMobileSM2 = () => (
  <SMRevisionShell title="마이" search notificationNew bottom navActive="my">
    <div style={{ padding: '18px 20px 96px' }}>
      <Card pad={18}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ width: 62, height: 62, borderRadius: 22, background: `url(${IMG.av1}) center/cover` }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tm-text-subhead">정민</div>
            <div className="tm-text-caption">풋살 · 성동 · 매너 4.9</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
              <Badge tone="blue" size="sm">verified</Badge>
              <Badge tone="grey" size="sm">공개 프로필</Badge>
            </div>
          </div>
          <SBtn size="sm" variant="neutral">수정</SBtn>
        </div>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
        {SM2_PROFILE_STATS.map(([label, value]) => <SM2InlineStat key={label} label={label} value={value}/>)}
      </div>
      <SectionTitle title="평판 신호" sub="사용자 의사결정에 쓰이는 값은 상태를 분리합니다."/>
      <Card pad={16}>
        <StatBar label="시간 약속" value={94} sub="verified · 최근 12경기"/>
        <StatBar label="팀워크" value={88} sub="estimated · 리뷰 기반"/>
        <StatBar label="응답률" value={76} sub="sample · 프로토타입 데이터"/>
      </Card>
      <SectionTitle title="받은 리뷰" sub="리뷰는 작성자, 맥락, 상태를 함께 노출합니다."/>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          ['시간 약속을 잘 지켜요', '개인매치 완료 · verified'],
          ['팀 플레이가 좋아요', '팀매치 후 작성 · estimated'],
        ].map(([title, sub]) => (
          <Card key={title} pad={14}>
            <div className="tm-text-body-lg">{title}</div>
            <div className="tm-text-caption" style={{ marginTop: 4 }}>{sub}</div>
          </Card>
        ))}
      </div>
    </div>
  </SMRevisionShell>
);

const SMRevisionReviewWriteMobileSM2 = () => (
  <SMRevisionShell title="" back notificationNew={false} bottom={false}>
    <div style={{ padding: '18px 20px 118px' }}>
      <div className="tm-text-heading">리뷰 작성</div>
      <div className="tm-text-body" style={{ marginTop: 6 }}>매치나 팀매치가 끝난 뒤 연결되는 companion flow입니다. 0502 문서에 상세 본문은 없으므로 입력 가능 항목만 명시합니다.</div>
      <Card pad={16} style={{ marginTop: 18 }}>
        <div className="tm-text-body-lg">성수 풋살 매치</div>
        <div className="tm-text-caption" style={{ marginTop: 4 }}>완료된 경기 · 참가자 10명</div>
      </Card>
      <Card pad={16} style={{ marginTop: 12 }}>
        <div className="tm-text-label">별점</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {[1,2,3,4,5].map((n) => <Icon key={n} name="star" size={28} color="var(--blue500)" stroke={2}/>)}
        </div>
      </Card>
      <Card pad={16} style={{ marginTop: 12 }}>
        <div className="tm-text-label">태그</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {['시간 약속', '팀워크', '매너 좋음', '다시 함께'].map((label, index) => <HapticChip key={label} active={index < 2}>{label}</HapticChip>)}
        </div>
      </Card>
      <Card pad={16} style={{ marginTop: 12 }}>
        <div className="tm-text-label">본문</div>
        <div style={{ minHeight: 104, borderRadius: 14, background: 'var(--grey100)', padding: 14, marginTop: 10 }} className="tm-text-caption">경험을 구체적으로 적어주세요.</div>
      </Card>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 22px', background: 'var(--bg)', borderTop: '1px solid var(--grey100)' }}>
      <SBtn full size="lg">리뷰 등록</SBtn>
    </div>
  </SMRevisionShell>
);

const SMRevisionProfileStateMobileSM2 = ({ state = 'private' }) => (
  <SMRevisionShell title="마이" search={state !== 'network'} notificationNew={false} bottom navActive="my">
    <div style={{ padding: '18px 20px' }}>
      <div className="tm-text-heading">{state === 'network' ? '프로필을 불러오지 못했습니다' : '비공개 프로필'}</div>
      <EmptyState
        title={state === 'network' ? '새로고침이 필요합니다' : '공개되지 않은 정보입니다'}
        sub={state === 'network' ? '내 활동과 리뷰 신호는 유지된 상태에서 다시 불러옵니다.' : '상대에게 보이는 평판 신호와 내 설정 화면의 정보를 분리합니다.'}
        cta={state === 'network' ? '다시 시도' : '공개 설정 보기'}
      />
    </div>
  </SMRevisionShell>
);

const SMRevisionProfileReviewMobileGridSM2 = () => (
  <SMRevisionRuleBoard title="07 마이/프로필/리뷰 · SM2 mobile grid" items={[
    { title: '복사 기준', body: '기존 07과 기존 07 SM 수정안을 유지한다. SM2는 같은 번호 아래 새 비교 섹션으로만 추가한다.' },
    { title: '상단 검색', body: '전역 규칙대로 검색은 홈과 마이에서만 유지한다. 마이에서는 프로필, 리뷰, 내 활동 검색 진입을 담당한다.' },
    { title: '프로필', body: '매너, 활동, 리뷰, 배지는 verified/estimated/sample 상태를 분리해 신뢰 신호로 보여준다.' },
    { title: '리뷰', body: '0502 문서가 review target만 지정했으므로 받은 리뷰와 작성 companion flow를 함께 둔다.' },
    { title: '상태', body: '비공개, 네트워크 오류, 업로드 오류, 권한 부족 상태는 CTA와 이유를 남긴다.' },
    { title: '다음 단계', body: '리뷰 작성은 매치/팀매치 완료 후 진입하고, 프로필 공개 범위는 설정/legal 상태와 연결한다.' },
  ]}/>
);

Object.assign(window, {
  SMBottomNav,
  SM_BOTTOM_TABS,
  SMRevisionRuleBoard,
  SMRevisionHomeMobile,
  SMRevisionHomeStates,
  SMRevisionHomeMobileV2,
  SMRevisionHomeStatesV2,
  SMRevisionHomeUIRulesV2,
  SMRevisionHomeInteractionFlowV2,
  SMRevisionHomeSearchMobileV2,
  SMRevisionHomeSearchRulesV2,
  SMRevisionHomeMobileGridV2,
  SMRevisionMatchListMobile,
  SMRevisionMatchDetailMobile,
  SMRevisionMatchListMobileSM3,
  SMRevisionMatchSearchFocusMobileSM3,
  SMRevisionMatchSearchMobileSM3,
  SMRevisionMatchStateMobileSM3,
  SMRevisionMatchDetailMobileSM3,
  SMRevisionMatchJoinFeedbackOverlaySM3,
  SMRevisionMatchMobileGridSM3,
  SMRevisionMatchListMobileSM4,
  SMRevisionMatchSearchFocusMobileSM4,
  SMRevisionMatchSearchMobileSM4,
  SMRevisionTeamMatchListMobileSM2,
  SMRevisionTeamMatchSearchFocusMobileSM2,
  SMRevisionTeamMatchSearchMobileSM2,
  SMRevisionTeamMatchStateMobileSM2,
  SMRevisionTeamMatchDetailMobileSM2,
  SMRevisionTeamMatchMobileGridSM2,
  SMRevisionTeamBrowseMobile,
  SMRevisionTeamBrowseMobileSM2,
  SMRevisionTeamBrowseDetailSM2,
  SMRevisionTeamBrowseStateSM2,
  SMRevisionTeamBrowseMobileGridSM2,
  SMRevisionChatListMobile,
  SMRevisionChatRoomMobile,
  SMRevisionNotificationsMobile,
  SMRevisionChatListMobileSM2,
  SMRevisionChatRoomMobileSM2,
  SMRevisionNotificationsMobileSM2,
  SMRevisionCommunityMobileGridSM2,
  SMRevisionLoginMobile,
  SMRevisionLoginMobileV2,
  SMRevisionAuthTermsV2,
  SMRevisionAuthCallbackV2,
  SMRevisionAuthFallbackV2,
  SMRevisionAuthMobileGridV2,
  SMRevisionAuthSM3Login,
  SMRevisionAuthEmailLoginSM3,
  SMRevisionAuthSignupSM3,
  SMRevisionAuthSM3TermsStep,
  SMRevisionAuthSM3SportStep,
  SMRevisionAuthSM3LevelStep,
  SMRevisionAuthSM3RegionStep,
  SMRevisionAuthSM3Welcome,
  SMRevisionAuthSM3ExceptionBoard,
  SMRevisionAuthSM3ActionMap,
  SMRevisionAuthSM4Checklist,
  SMRevisionAuthSM4TermsDisabled,
  SMRevisionAuthSM4Confirm,
  SMRevisionAuthSM4EmailLoginError,
  SMRevisionAuthSM4SignupError,
  SMRevisionAuthSM4LocationDenied,
  SMRevisionAuthSM4Resume,
  SMRevisionAuthSM5ActionMatrix,
  SMRevisionAuthSM5StateMatrix,
  SMRevisionAuthSM5Flow,
  SMRevisionHomeSM3ActionMatrix,
  SMRevisionHomeSM3StateMatrix,
  SMRevisionHomeSM3Flow,
  SMRevisionMatchSM4ActionMatrix,
  SMRevisionMatchSM4StateMatrix,
  SMRevisionMatchSM4Flow,
  SMRevisionTeamMatchSM3ActionMatrix,
  SMRevisionTeamMatchSM3StateMatrix,
  SMRevisionTeamMatchSM3Flow,
  SMRevisionProfileReviewMobile,
  SMRevisionProfileReviewMobileSM2,
  SMRevisionReviewWriteMobileSM2,
  SMRevisionProfileStateMobileSM2,
  SMRevisionProfileReviewMobileGridSM2,
  SMRevisionPaymentMobile,
  SMRevisionLandingMobile,
  SMRevisionAdminMobile,
});
