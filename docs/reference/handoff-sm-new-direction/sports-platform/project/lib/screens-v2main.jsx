/* Teameet — V2 메인 화면 (본 라인 02~11)
   Toss DNA 전면 적용: NumberDisplay · MoneyRow · KPIStat · HapticChip
   SectionTitle · StackedAvatars · Skeleton · PullHint · Toast */

/* ─────────────── Home B V2 — 4 quick tiles ─────────────── */
const HomeB_V2 = () => {
  const [sport, setSport] = React.useState('soccer');
  const tiles = [
    { label: '매치 찾기', icon: 'search', color: 'var(--blue500)', sub: '124개 진행중' },
    { label: '팀 매칭', icon: 'people', color: 'var(--purple500)', sub: 'S~D 등급' },
    { label: '용병', icon: 'bolt', color: 'var(--orange500)', sub: '긴급 12건' },
    { label: '대회', icon: 'star', color: 'var(--green500)', sub: '이번 주 3개' },
  ];
  return (
    <div style={{ width:375,height:812,background:'var(--bg)',fontFamily:'var(--font)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
      <StatusBar/>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 20px 8px' }}>
        <div style={{ fontSize:22,fontWeight:800,letterSpacing: 0,color:'var(--text-strong)' }}>teameet</div>
        <div style={{ display:'flex',gap:4 }}>
          <button className="tm-pressable tm-break-keep" style={{ width:40,height:40,display:'grid',placeItems:'center',background:'transparent',border:'none',color:'var(--text-strong)' }}><Icon name="search" size={22}/></button>
          <button className="tm-pressable tm-break-keep" style={{ width:40,height:40,display:'grid',placeItems:'center',background:'transparent',border:'none',color:'var(--text-strong)',position:'relative' }}>
            <Icon name="bell" size={22}/>
            <span style={{ position:'absolute',top:8,right:9,width:8,height:8,borderRadius:'50%',background:'var(--red500)',border:'2px solid var(--bg)' }}/>
          </button>
        </div>
      </div>
      <div style={{ flex:1,overflow:'auto',paddingBottom:80 }}>
        <PullHint/>
        {/* KPI 헤더 */}
        <div style={{ padding:'8px 20px 20px',display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12 }}>
          <KPIStat label="이번 달" value={12} unit="경기" delta={3} deltaLabel="경기"/>
          <KPIStat label="매너" value="4.9" delta={0.2} deltaLabel="점"/>
          <KPIStat label="총 활동" value={87} unit="회"/>
        </div>
        {/* 4 타일 */}
        <div style={{ padding:'0 20px 24px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
          {tiles.map((t,i) => (
            <div key={i} style={{ padding:'20px 16px',borderRadius:16,background: i===0?'var(--blue500)':'var(--grey100)',color:i===0?'var(--static-white)':'var(--text-strong)',cursor:'pointer',transition:'transform .1s' }}
              onMouseDown={e=>e.currentTarget.style.transform='scale(0.97)'}
              onMouseUp={e=>e.currentTarget.style.transform='scale(1)'}
              onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
              <Icon name={t.icon} size={24} color={i===0?'rgba(255,255,255,.8)':t.color}/>
              <div style={{ fontSize:17,fontWeight:700,marginTop:12,letterSpacing: 0 }}>{t.label}</div>
              <div style={{ fontSize:12,marginTop:4,opacity:i===0?0.8:undefined,color:i===0?undefined:'var(--text-muted)',fontWeight:500 }}>{t.sub}</div>
            </div>
          ))}
        </div>
        {/* 오늘의 추천 */}
        <SectionTitle title="오늘 추천 매치" action="전체보기"/>
        <div style={{ padding:'0 20px',display:'flex',flexDirection:'column',gap:12 }}>
          {MATCHES.slice(0,3).map((m,i)=>(
            <div key={i} style={{ display:'flex',gap:12,padding:'14px 16px',borderRadius:14,background:'var(--grey50)',border:'1px solid var(--border)',cursor:'pointer' }}>
              <div style={{ width:56,height:56,borderRadius:12,background:`var(--grey100) url(${m.img}) center/cover`,flexShrink:0 }}/>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:14,fontWeight:700,color:'var(--text-strong)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{m.title}</div>
                <div style={{ fontSize:12,color:'var(--text-muted)',marginTop:3,fontWeight:500 }}>{m.venue} · {m.date}</div>
                <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:6 }}>
                  <StackedAvatars avatars={[]} size={20} max={3}/>
                  <span className="tab-num" style={{ fontSize:13,fontWeight:700,color:'var(--blue500)' }}>{m.fee===0?'무료':m.fee.toLocaleString()+'원'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ height:24 }}/>
      </div>
      <BottomNav active="home"/>
    </div>
  );
};

/* ─────────────── Home C V2 — 인사말 미니멀 ─────────────── */
const HomeC_V2 = () => {
  const hour = 14;
  const greeting = hour < 12 ? '좋은 아침이에요' : hour < 18 ? '좋은 오후예요' : '좋은 저녁이에요';
  return (
    <div style={{ width:375,height:812,background:'var(--bg)',fontFamily:'var(--font)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
      <StatusBar/>
      <div style={{ flex:1,overflow:'auto',paddingBottom:80 }}>
        {/* 인사 헤더 */}
        <div style={{ padding:'32px 24px 28px' }}>
          <div style={{ fontSize:13,color:'var(--text-muted)',fontWeight:500 }}>{greeting} 👋</div>
          <div style={{ fontSize:28,fontWeight:800,color:'var(--text-strong)',letterSpacing: 0,marginTop:6,lineHeight:1.2 }}>
            정민님, 오늘<br/>운동 어때요?
          </div>
        </div>
        {/* 날씨 스트립 */}
        <div style={{ padding:'0 20px 24px' }}><WeatherStrip/></div>
        {/* 빠른 액션 */}
        <div style={{ padding:'0 20px 28px',display:'flex',gap:8 }}>
          {['⚽ 매치찾기','🏅 팀매칭','⚡ 용병'].map((l,i)=>(
            <HapticChip key={i} active={i===0}>{l}</HapticChip>
          ))}
        </div>
        {/* 피처드 카드 */}
        <div style={{ margin:'0 20px 24px',padding:20,borderRadius:16,background:'var(--grey900)',color:'var(--static-white)' }}>
          <div style={{ fontSize:11,fontWeight:700,opacity:.6,letterSpacing:.5 }}>이번 주 핫이슈</div>
          <div style={{ fontSize:20,fontWeight:800,marginTop:8,letterSpacing: 0,lineHeight:1.3 }}>서울 리그 시즌2<br/>모집 시작</div>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:20 }}>
            <NumberDisplay value={47} unit="팀 참가" size={22} color="var(--static-white)"/>
            <button className="tm-pressable tm-break-keep" style={{ height:36,padding:'0 18px',borderRadius:999,background:'var(--blue500)',color:'var(--static-white)',fontSize:13,fontWeight:700,border:'none' }}>신청하기</button>
          </div>
        </div>
        {/* 최근 활동 */}
        <SectionTitle title="최근 활동" action="더보기"/>
        {[
          { e:'✅', t:'주말 축구 매치 완료', s:'어제 · 상암 보조구장', c:'var(--green500)' },
          { e:'💬', t:'팀채팅 5개 새 메시지', s:'강남 FC · 2시간 전', c:'var(--blue500)' },
          { e:'⭐', t:'리뷰 요청 도착', s:'김민준님이 남긴 리뷰', c:'var(--orange500)' },
        ].map((a,i)=>(
          <div key={i} style={{ display:'flex',alignItems:'center',gap:14,padding:'14px 20px',borderBottom:i<2?'1px solid var(--grey100)':undefined }}>
            <div style={{ width:40,height:40,borderRadius:12,background:a.c+'18',display:'grid',placeItems:'center',fontSize:18,flexShrink:0 }}>{a.e}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14,fontWeight:600,color:'var(--text-strong)' }}>{a.t}</div>
              <div style={{ fontSize:12,color:'var(--text-muted)',marginTop:2 }}>{a.s}</div>
            </div>
            <Icon name="chevR" size={16} color="var(--text-caption)"/>
          </div>
        ))}
      </div>
      <BottomNav active="home"/>
    </div>
  );
};

/* ─────────────── Home D V2 — 에디토리얼 ─────────────── */
const HomeEditorialV2 = () => (
  <div style={{ width:375,height:812,background:'var(--static-white)',fontFamily:'var(--font)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
    <StatusBar/>
    <div style={{ flex:1,overflow:'auto',paddingBottom:80 }}>
      <div style={{ padding:'48px 24px 8px' }}>
        <div style={{ fontSize:10,fontWeight:800,letterSpacing:3,color:'var(--grey500)',marginBottom:8 }}>TEAMEET · VOL.04</div>
        <div style={{ fontSize:48,fontWeight:900,lineHeight:.95,color:'var(--text-strong)',letterSpacing: 0 }}>오늘<br/>뛸까?</div>
        <div style={{ display:'flex',gap:20,marginTop:20,paddingBottom:16,borderBottom:'2px solid var(--grey900)' }}>
          <div><div className="tab-num" style={{ fontSize:28,fontWeight:800 }}>124</div><div style={{ fontSize:10,color:'var(--text-muted)',fontWeight:700,letterSpacing:1 }}>OPEN</div></div>
          <div><div className="tab-num" style={{ fontSize:28,fontWeight:800,color:'var(--red500)' }}>12</div><div style={{ fontSize:10,color:'var(--text-muted)',fontWeight:700,letterSpacing:1 }}>URGENT</div></div>
          <div style={{ flex:1 }}/>
          <button className="tm-pressable tm-break-keep" style={{ width:44,height:44,borderRadius:22,background:'var(--grey900)',color:'var(--static-white)',border:'none',display:'grid',placeItems:'center' }}><Icon name="search" size={20}/></button>
        </div>
      </div>
      {/* 커버 */}
      <div style={{ padding:'20px 24px' }}>
        <div style={{ fontSize:10,fontWeight:800,letterSpacing:2,color:'var(--blue500)',marginBottom:8 }}>COVER · 추천 매치</div>
        <div style={{ position:'relative',borderRadius:4,overflow:'hidden',aspectRatio:'4/5' }}>
          <div style={{ position:'absolute',inset:0,background:`#222 url(${MATCHES[0].img}) center/cover` }}/>
          <div style={{ position:'absolute',inset:0,background:'linear-gradient(180deg,transparent 30%,rgba(0,0,0,.85))' }}/>
          <div style={{ position:'absolute',top:16,right:16,background:'var(--static-white)',padding:'6px 12px',fontSize:10,fontWeight:900,letterSpacing:1 }}>MANNER 4.9 ★</div>
          <div style={{ position:'absolute',bottom:20,left:20,right:20,color:'var(--static-white)' }}>
            <div style={{ fontSize:11,fontWeight:700,letterSpacing:1,opacity:.9,marginBottom:8 }}>⚽ 축구 · 오늘 14:00</div>
            <div style={{ fontSize:26,fontWeight:900,lineHeight:1.15,letterSpacing: 0 }}>{MATCHES[0].title}</div>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:14 }}>
              <StackedAvatars avatars={[]} size={26} max={4}/>
              <button className="tm-pressable tm-break-keep" style={{ height:34,padding:'0 16px',borderRadius:999,background:'var(--static-white)',color:'var(--blue500)',fontSize:12,fontWeight:700,border:'none' }}>참가하기</button>
            </div>
          </div>
        </div>
      </div>
      {/* 타일 그리드 */}
      <div style={{ padding:'0 24px 24px',display:'grid',gridTemplateColumns:'1.3fr 1fr',gridTemplateRows:'auto auto',gap:6 }}>
        <div style={{ gridRow:'1/3',background:'var(--grey900)',color:'var(--static-white)',padding:20,minHeight:200,display:'flex',flexDirection:'column',justifyContent:'space-between' }}>
          <div><div style={{ fontSize:10,fontWeight:800,letterSpacing:2,opacity:.6 }}>01</div><div style={{ fontSize:22,fontWeight:900,lineHeight:1.1,marginTop:10 }}>지금<br/>빠른<br/>매칭</div></div>
          <div style={{ fontSize:11,fontWeight:600,opacity:.7 }}>→ 3분 안에 자리</div>
        </div>
        <div style={{ background:'var(--blue500)',color:'var(--static-white)',padding:16 }}><div style={{ fontSize:10,fontWeight:800,letterSpacing:2,opacity:.7 }}>02</div><div style={{ fontSize:16,fontWeight:900,lineHeight:1.1,marginTop:6 }}>팀 매칭</div></div>
        <div style={{ background:'var(--orange500)',color:'var(--static-white)',padding:16 }}><div style={{ fontSize:10,fontWeight:800,letterSpacing:2,opacity:.7 }}>03</div><div style={{ fontSize:16,fontWeight:900,lineHeight:1.1,marginTop:6 }}>용병 구인</div></div>
      </div>
    </div>
    <BottomNav active="home"/>
  </div>
);

/* ─────────────── Home E V2 — 다크 대시보드 ─────────────── */
const HomeDarkV2 = () => (
  <div style={{ width:375,height:812,background:'#0d1117',fontFamily:'var(--font)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
    <StatusBar dark/>
    <div style={{ flex:1,overflow:'auto',paddingBottom:80 }}>
      <div style={{ padding:'20px 20px 24px',borderBottom:'1px solid rgba(255,255,255,.06)' }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
          <div style={{ fontSize:22,fontWeight:800,letterSpacing: 0,color:'var(--static-white)' }}>teameet</div>
          <button className="tm-pressable tm-break-keep" style={{ width:40,height:40,borderRadius:999,background:'rgba(255,255,255,.06)',border:'none',display:'grid',placeItems:'center',color:'var(--static-white)',position:'relative' }}>
            <Icon name="bell" size={22}/>
            <span style={{ position:'absolute',top:8,right:9,width:8,height:8,borderRadius:'50%',background:'var(--red500)',border:'2px solid #0d1117' }}/>
          </button>
        </div>
        {/* KPI row */}
        <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginTop:24 }}>
          {[{l:'이번 달',v:12,u:'경기'},{l:'매너',v:'4.9',u:''},{l:'팀 순위',v:'2위',u:''}].map((k,i)=>(
            <div key={i} style={{ padding:'14px 0' }}>
              <div style={{ fontSize:12,color:'rgba(255,255,255,.45)',fontWeight:500 }}>{k.l}</div>
              <div className="tab-num" style={{ fontSize:24,fontWeight:800,color:'var(--static-white)',marginTop:4,letterSpacing: 0 }}>{typeof k.v==='number'?k.v.toLocaleString():k.v}<span style={{ fontSize:13,color:'rgba(255,255,255,.4)',fontWeight:500 }}>{k.u}</span></div>
            </div>
          ))}
        </div>
      </div>
      {/* 라이브 매치 섹션 */}
      <div style={{ padding:'20px 20px 0' }}>
        <div style={{ fontSize:11,color:'rgba(255,255,255,.4)',fontWeight:700,letterSpacing:1,marginBottom:16 }}>실시간 · LIVE</div>
        {MATCHES.slice(0,3).map((m,i)=>(
          <div key={i} style={{ display:'flex',gap:14,marginBottom:14,padding:'14px 16px',borderRadius:14,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.06)',cursor:'pointer' }}>
            <div style={{ width:48,height:48,borderRadius:10,background:`#333 url(${m.img}) center/cover`,flexShrink:0 }}/>
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ fontSize:14,fontWeight:700,color:'var(--static-white)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{m.title}</div>
              <div style={{ fontSize:12,color:'rgba(255,255,255,.4)',marginTop:3 }}>{m.venue}</div>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:6 }}>
                <div style={{ fontSize:11,color:'rgba(255,255,255,.35)',fontWeight:500 }}>{m.cur}/{m.max}명</div>
                <span className="tab-num" style={{ fontSize:13,fontWeight:700,color:'var(--blue400)' }}>{m.fee===0?'무료':m.fee.toLocaleString()+'원'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
    {/* 다크 탭바 */}
    <div style={{ display:'flex',borderTop:'1px solid rgba(255,255,255,.08)',background:'#0d1117' }}>
      {['home','search','plus','chat','my'].map((id,i)=>(
        <button className="tm-pressable tm-break-keep" key={id} style={{ flex:1,height:56,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4,background:'transparent',border:'none',color:i===0?'var(--blue400)':'rgba(255,255,255,.35)' }}>
          <Icon name={id==='plus'?'plus':id==='my'?'person':id} size={22}/>
          <span style={{ fontSize:10,fontWeight:600 }}>{['홈','탐색','','채팅','마이'][i]}</span>
        </button>
      ))}
    </div>
  </div>
);

/* ─────────────── Home F V2 — 소셜 피드/스토리 ─────────────── */
const HomeStoriesV2 = () => {
  const stories = ['김민준','이지수','박철수','최아름','정현우'];
  return (
    <div style={{ width:375,height:812,background:'var(--bg)',fontFamily:'var(--font)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
      <StatusBar/>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 20px 8px' }}>
        <div style={{ fontSize:22,fontWeight:800,letterSpacing: 0,color:'var(--text-strong)' }}>teameet</div>
        <div style={{ display:'flex',gap:4 }}>
          <button className="tm-pressable tm-break-keep" style={{ width:40,height:40,display:'grid',placeItems:'center',background:'transparent',border:'none',color:'var(--text-strong)' }}><Icon name="search" size={22}/></button>
          <button className="tm-pressable tm-break-keep" style={{ width:40,height:40,display:'grid',placeItems:'center',background:'transparent',border:'none',color:'var(--text-strong)',position:'relative' }}>
            <Icon name="bell" size={22}/>
            <span style={{ position:'absolute',top:8,right:9,width:8,height:8,borderRadius:'50%',background:'var(--red500)',border:'2px solid var(--bg)' }}/>
          </button>
        </div>
      </div>
      <div style={{ flex:1,overflow:'auto',paddingBottom:80 }}>
        {/* 스토리 */}
        <div style={{ display:'flex',gap:12,padding:'8px 20px 20px',overflowX:'auto' }}>
          <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:6,flexShrink:0 }}>
            <div style={{ width:60,height:60,borderRadius:'50%',background:'var(--blue50)',border:'2px dashed var(--blue300)',display:'grid',placeItems:'center' }}><Icon name="plus" size={22} color="var(--blue500)"/></div>
            <div style={{ fontSize:11,color:'var(--text-muted)',fontWeight:500 }}>추가</div>
          </div>
          {stories.map((name,i)=>(
            <div key={i} style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:6,flexShrink:0 }}>
              <div style={{ width:60,height:60,borderRadius:'50%',background:`hsl(${i*60},60%,75%)`,border:`3px solid ${['var(--blue500)','var(--green500)','var(--orange500)','var(--purple500)','var(--red500)'][i]}`,display:'grid',placeItems:'center',fontSize:20 }}>
                {['⚽','🏀','🎾','🏸','🏒'][i]}
              </div>
              <div style={{ fontSize:11,color:'var(--text-muted)',fontWeight:500,maxWidth:60,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textAlign:'center' }}>{name.split('').slice(0,2).join('')}님</div>
            </div>
          ))}
        </div>
        {/* 피드 */}
        {MATCHES.slice(0,3).map((m,i)=>(
          <div key={i} style={{ marginBottom:12,borderBottom:'1px solid var(--grey100)' }}>
            <div style={{ display:'flex',alignItems:'center',gap:10,padding:'12px 20px 10px' }}>
              <div style={{ width:36,height:36,borderRadius:'50%',background:`hsl(${i*80},55%,70%)`,flexShrink:0 }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13,fontWeight:700,color:'var(--text-strong)' }}>{['김민준','이지수','박철수'][i]}</div>
                <div style={{ fontSize:11,color:'var(--text-caption)' }}>3시간 전 · {m.venue}</div>
              </div>
              <button className="tm-pressable tm-break-keep" style={{ height:30,padding:'0 14px',borderRadius:999,background:'var(--blue50)',border:'1px solid var(--blue200)',color:'var(--blue500)',fontSize:12,fontWeight:700 }}>참가</button>
            </div>
            <div style={{ aspectRatio:'16/9',background:`var(--grey100) url(${m.img}) center/cover`,margin:'0 20px',borderRadius:12,overflow:'hidden' }}/>
            <div style={{ padding:'12px 20px 16px' }}>
              <div style={{ fontSize:14,fontWeight:700,color:'var(--text-strong)' }}>{m.title}</div>
              <div style={{ display:'flex',alignItems:'center',gap:16,marginTop:10 }}>
                <button className="tm-pressable tm-break-keep" style={{ display:'flex',alignItems:'center',gap:4,background:'transparent',border:'none',color:'var(--text-muted)',fontSize:13,fontWeight:500,cursor:'pointer' }}>❤️ {12+i*7}</button>
                <button className="tm-pressable tm-break-keep" style={{ display:'flex',alignItems:'center',gap:4,background:'transparent',border:'none',color:'var(--text-muted)',fontSize:13,fontWeight:500,cursor:'pointer' }}>💬 {3+i*2}</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <BottomNav active="home"/>
    </div>
  );
};

/* ─────────────── Matches List V2 ─────────────── */
const MatchesListV2 = () => {
  const [sport, setSport] = React.useState('all');
  const [loading, setLoading] = React.useState(false);
  const filtered = sport==='all' ? MATCHES : MATCHES.filter(m=>m.sport===sport);
  return (
    <div style={{ width:375,height:812,background:'var(--bg)',fontFamily:'var(--font)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
      <StatusBar/>
      <div style={{ padding:'12px 20px 0',display:'flex',alignItems:'center',gap:8 }}>
        <div style={{ flex:1,display:'flex',alignItems:'center',gap:8,height:42,borderRadius:12,background:'var(--grey100)',padding:'0 14px' }}>
          <Icon name="search" size={18} color="var(--text-caption)"/>
          <div style={{ fontSize:14,color:'var(--text-placeholder)',fontWeight:400 }}>지역, 종목, 날짜 검색</div>
        </div>
        <button className="tm-pressable tm-break-keep" style={{ width:42,height:42,borderRadius:12,background:'var(--grey100)',border:'none',display:'grid',placeItems:'center',color:'var(--text-strong)',flexShrink:0 }}>
          <Icon name="filter" size={20}/>
        </button>
      </div>
      {/* 종목 칩 */}
      <div style={{ display:'flex',gap:8,padding:'12px 20px',overflowX:'auto' }}>
        {[{id:'all',label:'전체',count:124},...SPORTS.filter(s=>s.id!=='all').slice(0,6).map(s=>({id:s.id,label:s.label,count:Math.floor(Math.random()*30)+5}))].map(s=>(
          <HapticChip key={s.id} active={sport===s.id} onClick={()=>setSport(s.id)} count={s.count}>{s.label}</HapticChip>
        ))}
      </div>
      {/* KPI 스트립 */}
      <div style={{ display:'flex',gap:0,padding:'0 20px 12px',borderBottom:'1px solid var(--grey100)' }}>
        {[{l:'열린 매치',v:124},{l:'오늘',v:18},{l:'마감임박',v:6}].map((k,i)=>(
          <div key={i} style={{ flex:1,textAlign:i===1?'center':i===2?'right':'left' }}>
            <div className="tab-num" style={{ fontSize:20,fontWeight:800,color:i===2?'var(--red500)':'var(--text-strong)' }}>{k.v}</div>
            <div style={{ fontSize:11,color:'var(--text-caption)',fontWeight:500,marginTop:2 }}>{k.l}</div>
          </div>
        ))}
      </div>
      <div style={{ flex:1,overflow:'auto',paddingBottom:80 }}>
        <div style={{ padding:'16px 20px',display:'flex',flexDirection:'column',gap:12 }}>
          {loading ? [1,2,3].map(i=>(
            <div key={i} style={{ borderRadius:16,overflow:'hidden',border:'1px solid var(--border)' }}>
              <Skeleton h={140} r={0}/>
              <div style={{ padding:'14px 16px' }}>
                <Skeleton h={16} w="70%" mb={8}/>
                <Skeleton h={12} w="50%" mb={12}/>
                <Skeleton h={8} r={4}/>
              </div>
            </div>
          )) : filtered.map((m,i)=>{
            const urgent = (m.cur/m.max)>=0.7;
            return (
              <div key={i} style={{ borderRadius:16,overflow:'hidden',border:'1px solid var(--border)',cursor:'pointer',transition:'box-shadow .15s' }}
                onMouseEnter={e=>e.currentTarget.style.boxShadow='var(--sh-2)'}
                onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}>
                <div style={{ position:'relative',aspectRatio:'16/9',background:`var(--grey100) url(${m.img}) center/cover` }}>
                  <div style={{ position:'absolute',inset:0,background:'linear-gradient(180deg,transparent 50%,rgba(0,0,0,.55))' }}/>
                  <div style={{ position:'absolute',top:10,left:12,display:'flex',gap:6 }}>
                    <span style={{ padding:'4px 10px',borderRadius:999,background:'rgba(0,0,0,.5)',color:'var(--static-white)',fontSize:11,fontWeight:700 }}>{SPORTS.find(s=>s.id===m.sport)?.label}</span>
                    {urgent && <span style={{ padding:'4px 10px',borderRadius:999,background:'var(--red500)',color:'var(--static-white)',fontSize:11,fontWeight:700 }}>마감임박</span>}
                  </div>
                  <div style={{ position:'absolute',bottom:10,left:14,color:'var(--static-white)',fontSize:11,fontWeight:600 }}>{m.date} · {m.time}</div>
                </div>
                <div style={{ padding:'14px 16px 16px' }}>
                  <div style={{ fontSize:15,fontWeight:700,color:'var(--text-strong)',marginBottom:6 }}>{m.title}</div>
                  <div style={{ display:'flex',alignItems:'center',gap:4,fontSize:12,color:'var(--text-muted)',marginBottom:10 }}>
                    <Icon name="pin" size={13}/> {m.venue}
                  </div>
                  <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
                    <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                      <StackedAvatars avatars={[]} size={22} max={3}/>
                      <span style={{ fontSize:12,color:urgent?'var(--red500)':'var(--text-muted)',fontWeight:600 }} className="tab-num">{m.cur}/{m.max}명</span>
                    </div>
                    <NumberDisplay value={m.fee===0?'무료':m.fee} unit={m.fee===0?'':' 원'} size={16}/>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <BottomNav active="matches"/>
    </div>
  );
};

/* ─────────────── Matches Timeline V2 ─────────────── */
const MatchesTimelineV2 = () => {
  const times = ['09:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];
  const events = { '09:00':MATCHES[0], '14:00':MATCHES[1], '16:00':MATCHES[2], '19:00':MATCHES[3] };
  return (
    <div style={{ width:375,height:812,background:'var(--bg)',fontFamily:'var(--font)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
      <StatusBar/>
      <div style={{ padding:'12px 20px 12px',display:'flex',alignItems:'center',justifyContent:'space-between' }}>
        <div style={{ fontSize:17,fontWeight:700,color:'var(--text-strong)' }}>타임라인</div>
        <div style={{ display:'flex',alignItems:'center',gap:12 }}>
          <button className="tm-pressable tm-break-keep" style={{ fontSize:13,color:'var(--text-muted)',fontWeight:600,background:'transparent',border:'none' }}>오늘</button>
          <HapticChip active>날짜 선택</HapticChip>
        </div>
      </div>
      {/* 날짜 스크롤 */}
      <div style={{ display:'flex',gap:8,padding:'0 20px 14px',overflowX:'auto' }}>
        {['일','월','화','수','목','금','토'].map((d,i)=>(
          <div key={i} style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:4,flexShrink:0,width:44,padding:'8px 0',borderRadius:12,background:i===3?'var(--blue500)':'transparent',cursor:'pointer' }}>
            <div style={{ fontSize:11,fontWeight:600,color:i===3?'rgba(255,255,255,.7)':'var(--text-caption)' }}>{d}</div>
            <div className="tab-num" style={{ fontSize:18,fontWeight:700,color:i===3?'var(--static-white)':'var(--text-strong)' }}>{10+i}</div>
            {events[times[i]] && <div style={{ width:6,height:6,borderRadius:3,background:i===3?'rgba(255,255,255,.6)':'var(--blue500)' }}/>}
          </div>
        ))}
      </div>
      <div style={{ flex:1,overflow:'auto',paddingBottom:80 }}>
        <div style={{ padding:'0 20px' }}>
          {times.map((t,i)=>{
            const m = events[t];
            return (
              <div key={i} style={{ display:'flex',gap:14,minHeight:52 }}>
                <div style={{ width:44,paddingTop:14,flexShrink:0 }}>
                  <div className="tab-num" style={{ fontSize:12,color:m?'var(--blue500)':'var(--text-caption)',fontWeight:m?700:500,textAlign:'right' }}>{t}</div>
                </div>
                <div style={{ width:1,background:m?'var(--blue200)':'var(--grey150)',position:'relative',flexShrink:0 }}>
                  {m && <div style={{ position:'absolute',top:18,left:'50%',transform:'translateX(-50%)',width:10,height:10,borderRadius:'50%',background:'var(--blue500)',border:'2px solid var(--bg)' }}/>}
                </div>
                <div style={{ flex:1,paddingTop:10,paddingBottom:10 }}>
                  {m && (
                    <div style={{ padding:'12px 14px',borderRadius:12,background:'var(--blue50)',border:'1px solid var(--blue100)',cursor:'pointer' }}>
                      <div style={{ fontSize:13,fontWeight:700,color:'var(--text-strong)' }}>{m.title}</div>
                      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:6 }}>
                        <div style={{ fontSize:11,color:'var(--text-muted)',fontWeight:500 }}>{m.venue} · {m.cur}/{m.max}명</div>
                        <span className="tab-num" style={{ fontSize:12,fontWeight:700,color:'var(--blue500)' }}>{m.fee===0?'무료':m.fee.toLocaleString()+'원'}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <BottomNav active="matches"/>
    </div>
  );
};

/* ─────────────── Matches Swipe V2 ─────────────── */
const MatchesSwipeV2 = () => {
  const [idx, setIdx] = React.useState(0);
  const m = MATCHES[idx % MATCHES.length];
  return (
    <div style={{ width:375,height:812,background:'var(--bg)',fontFamily:'var(--font)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
      <StatusBar/>
      <div style={{ padding:'12px 20px 8px',display:'flex',alignItems:'center',justifyContent:'space-between' }}>
        <div style={{ fontSize:17,fontWeight:700,color:'var(--text-strong)' }}>스와이프 매칭</div>
        <div style={{ display:'flex',gap:4 }}>
          {[1,2,3].map(i=>(<div key={i} style={{ width:8,height:8,borderRadius:4,background:i===1?'var(--blue500)':'var(--grey200)' }}/>))}
        </div>
      </div>
      <div style={{ flex:1,display:'flex',flexDirection:'column',padding:'8px 20px 20px',gap:16 }}>
        {/* 카드 */}
        <div style={{ flex:1,borderRadius:24,overflow:'hidden',position:'relative',background:`var(--grey100) url(${m.img}) center/cover`,cursor:'pointer',boxShadow:'0 8px 32px rgba(0,0,0,.18)' }}>
          <div style={{ position:'absolute',inset:0,background:'linear-gradient(180deg,transparent 40%,rgba(0,0,0,.9))' }}/>
          <div style={{ position:'absolute',top:16,left:16,display:'flex',gap:6 }}>
            <span style={{ padding:'6px 12px',borderRadius:999,background:'rgba(0,0,0,.4)',backdropFilter:'blur(8px)',color:'var(--static-white)',fontSize:12,fontWeight:700 }}>{SPORTS.find(s=>s.id===m.sport)?.label}</span>
          </div>
          <div style={{ position:'absolute',bottom:24,left:20,right:20,color:'var(--static-white)' }}>
            <div style={{ fontSize:11,fontWeight:700,opacity:.7,letterSpacing:.4,marginBottom:8 }}>{m.date} · {m.time}</div>
            <div style={{ fontSize:22,fontWeight:800,letterSpacing: 0,lineHeight:1.2,marginBottom:8 }}>{m.title}</div>
            <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:16 }}>
              <Icon name="pin" size={14} color="rgba(255,255,255,.7)"/>
              <span style={{ fontSize:13,opacity:.8,fontWeight:500 }}>{m.venue}</span>
            </div>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px',borderRadius:14,background:'rgba(255,255,255,.12)',backdropFilter:'blur(12px)' }}>
              <div>
                <div style={{ fontSize:11,opacity:.7 }}>참가 인원</div>
                <div className="tab-num" style={{ fontSize:18,fontWeight:700,marginTop:2 }}>{m.cur}/{m.max}명</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:11,opacity:.7 }}>참가비</div>
                <div className="tab-num" style={{ fontSize:18,fontWeight:700,marginTop:2 }}>{m.fee===0?'무료':m.fee.toLocaleString()+'원'}</div>
              </div>
            </div>
          </div>
        </div>
        {/* 액션 버튼 */}
        <div style={{ display:'flex',gap:12,alignItems:'center',justifyContent:'center' }}>
          <button className="tm-pressable tm-break-keep" onClick={()=>setIdx(i=>(i+1)%MATCHES.length)} style={{ width:56,height:56,borderRadius:28,background:'var(--grey100)',border:'none',display:'grid',placeItems:'center',fontSize:24,cursor:'pointer',transition:'transform .1s' }}
            onMouseDown={e=>e.currentTarget.style.transform='scale(0.93)'}
            onMouseUp={e=>e.currentTarget.style.transform='scale(1)'}>✕</button>
          <button className="tm-pressable tm-break-keep" style={{ width:64,height:64,borderRadius:32,background:'var(--green500)',border:'none',display:'grid',placeItems:'center',fontSize:28,cursor:'pointer',boxShadow:'0 4px 16px rgba(3,178,108,.35)',transition:'transform .1s' }}
            onMouseDown={e=>e.currentTarget.style.transform='scale(0.93)'}
            onMouseUp={e=>e.currentTarget.style.transform='scale(1)'}>✓</button>
          <button className="tm-pressable tm-break-keep" style={{ width:56,height:56,borderRadius:28,background:'var(--orange50)',border:'none',display:'grid',placeItems:'center',fontSize:24,cursor:'pointer',transition:'transform .1s' }}
            onMouseDown={e=>e.currentTarget.style.transform='scale(0.93)'}
            onMouseUp={e=>e.currentTarget.style.transform='scale(1)'}>⭐</button>
        </div>
      </div>
      <BottomNav active="matches"/>
    </div>
  );
};

/* ─────────────── Matches Dense V2 ─────────────── */
const MatchesDenseV2 = () => (
  <div style={{ width:375,height:812,background:'var(--bg)',fontFamily:'var(--font)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
    <StatusBar/>
    <div style={{ padding:'12px 20px 10px',display:'flex',alignItems:'center',gap:8 }}>
      <div style={{ flex:1,display:'flex',alignItems:'center',gap:8,height:38,borderRadius:10,background:'var(--grey100)',padding:'0 12px' }}>
        <Icon name="search" size={16} color="var(--text-caption)"/>
        <div style={{ fontSize:13,color:'var(--text-placeholder)' }}>검색</div>
      </div>
      <HapticChip active>오늘</HapticChip>
      <HapticChip>주말</HapticChip>
    </div>
    <div style={{ flex:1,overflow:'auto',paddingBottom:80 }}>
      {/* 콤팩트 리스트 */}
      {MATCHES.map((m,i)=>{
        const urgent=(m.cur/m.max)>=0.7;
        return (
          <div key={i} style={{ display:'flex',gap:12,padding:'12px 20px',borderBottom:'1px solid var(--grey100)',cursor:'pointer',alignItems:'center' }}>
            <div style={{ width:56,height:56,borderRadius:12,background:`var(--grey100) url(${m.img}) center/cover`,flexShrink:0,position:'relative' }}>
              {urgent && <div style={{ position:'absolute',bottom:-2,right:-2,width:16,height:16,borderRadius:8,background:'var(--red500)',border:'2px solid var(--bg)',display:'grid',placeItems:'center' }}><div style={{ width:6,height:6,borderRadius:3,background:'var(--static-white)' }}/></div>}
            </div>
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ fontSize:14,fontWeight:700,color:'var(--text-strong)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{m.title}</div>
              <div style={{ fontSize:12,color:'var(--text-muted)',marginTop:2 }}>{m.venue} · {m.date} {m.time}</div>
              <div style={{ display:'flex',alignItems:'center',gap:8,marginTop:4 }}>
                <span style={{ fontSize:11,padding:'2px 8px',borderRadius:999,background:'var(--grey100)',color:'var(--text-muted)',fontWeight:600 }}>{SPORTS.find(s=>s.id===m.sport)?.label}</span>
                <span className="tab-num" style={{ fontSize:11,color:urgent?'var(--red500)':'var(--text-caption)',fontWeight:600 }}>{m.cur}/{m.max}명</span>
              </div>
            </div>
            <div style={{ textAlign:'right',flexShrink:0 }}>
              <div className="tab-num" style={{ fontSize:14,fontWeight:700,color:'var(--text-strong)' }}>{m.fee===0?'무료':(m.fee/1000)+'K'}</div>
              <div style={{ fontSize:11,color:'var(--text-caption)',marginTop:2 }}>원</div>
            </div>
          </div>
        );
      })}
    </div>
    <BottomNav active="matches"/>
  </div>
);

/* ─────────────── Matches Card News + Compact Feed Candidate ─────────────── */
const MatchesCardNewsCompactV2 = () => {
  const cardNews = MATCHES.slice(0, 3);
  const feed = MATCHES.slice(0, 5);
  return (
    <div style={{ width:375,height:812,background:'var(--bg)',fontFamily:'var(--font)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
      <StatusBar/>
      <div style={{ padding:'12px 20px 10px',display:'flex',alignItems:'center',gap:8 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:18,fontWeight:800,color:'var(--text-strong)',letterSpacing:0 }}>개인 매치</div>
          <div style={{ fontSize:12,color:'var(--text-muted)',marginTop:3 }}>카드뉴스로 발견하고, 피드에서 빠르게 비교</div>
        </div>
        <button className="tm-pressable tm-break-keep" style={{ width:40,height:40,borderRadius:12,background:'var(--grey100)',border:'none',display:'grid',placeItems:'center',color:'var(--text-strong)',flexShrink:0 }}>
          <Icon name="filter" size={18}/>
        </button>
      </div>
      <div style={{ display:'flex',gap:8,padding:'0 20px 12px',overflowX:'auto' }}>
        <HapticChip active>추천</HapticChip>
        <HapticChip>오늘</HapticChip>
        <HapticChip>마감임박</HapticChip>
        <HapticChip>무료</HapticChip>
      </div>
      <div style={{ flex:1,overflow:'auto',paddingBottom:84 }}>
        <div style={{ padding:'0 20px 12px' }}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10 }}>
            <div style={{ fontSize:14,fontWeight:800,color:'var(--text-strong)' }}>카드뉴스 추천</div>
            <div style={{ fontSize:12,fontWeight:700,color:'var(--blue500)' }}>전체</div>
          </div>
          <div style={{ display:'flex',gap:12,overflowX:'auto',paddingBottom:2 }}>
            {cardNews.map((m,i)=>{
              const urgent = (m.cur/m.max)>=0.7;
              return (
                <div key={m.id || i} style={{ flexShrink:0,width:252,borderRadius:18,overflow:'hidden',border:'1px solid var(--border)',background:'var(--bg)' }}>
                  <div style={{ height:142,background:`var(--grey100) url(${m.img}) center/cover`,position:'relative' }}>
                    <div style={{ position:'absolute',inset:0,background:'linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.58))' }}/>
                    <div style={{ position:'absolute',top:12,left:12,display:'flex',gap:6 }}>
                      <span style={{ padding:'4px 9px',borderRadius:999,background:'rgba(0,0,0,.46)',color:'var(--static-white)',fontSize:11,fontWeight:800 }}>{SPORTS.find(s=>s.id===m.sport)?.label}</span>
                      {urgent && <span style={{ padding:'4px 9px',borderRadius:999,background:'var(--red500)',color:'var(--static-white)',fontSize:11,fontWeight:800 }}>마감임박</span>}
                    </div>
                    <div style={{ position:'absolute',left:14,right:14,bottom:12,color:'var(--static-white)' }}>
                      <div style={{ fontSize:11,fontWeight:700,opacity:.78,marginBottom:5 }}>{m.date} · {m.time}</div>
                      <div style={{ fontSize:17,fontWeight:800,lineHeight:1.25,letterSpacing:0 }}>{m.title}</div>
                    </div>
                  </div>
                  <div style={{ padding:'12px 14px 14px' }}>
                    <div style={{ display:'flex',alignItems:'center',gap:4,fontSize:12,color:'var(--text-muted)',marginBottom:10 }}>
                      <Icon name="pin" size={13}/> <span style={{ overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{m.venue}</span>
                    </div>
                    <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                      <span className="tab-num" style={{ fontSize:12,fontWeight:800,color:urgent?'var(--red500)':'var(--text-muted)' }}>{m.cur}/{m.max}명</span>
                      <span className="tab-num" style={{ fontSize:14,fontWeight:800,color:'var(--text-strong)' }}>{m.fee===0?'무료':m.fee.toLocaleString()+'원'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ padding:'8px 20px 0' }}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4 }}>
            <div style={{ fontSize:14,fontWeight:800,color:'var(--text-strong)' }}>콤팩트 피드</div>
            <div className="tab-num" style={{ fontSize:12,color:'var(--text-caption)',fontWeight:700 }}>{feed.length}개</div>
          </div>
          <div style={{ borderTop:'1px solid var(--grey100)' }}>
            {feed.map((m,i)=>{
              const urgent = (m.cur/m.max)>=0.7;
              return (
                <div key={m.id || i} style={{ display:'flex',gap:12,padding:'12px 0',borderBottom:'1px solid var(--grey100)',alignItems:'center',cursor:'pointer' }}>
                  <div style={{ width:58,height:58,borderRadius:13,background:`var(--grey100) url(${m.img}) center/cover`,flexShrink:0,position:'relative' }}>
                    {urgent && <div style={{ position:'absolute',right:-2,bottom:-2,width:17,height:17,borderRadius:999,background:'var(--red500)',border:'2px solid var(--bg)' }}/>}
                  </div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:3 }}>
                      <span style={{ fontSize:11,padding:'2px 7px',borderRadius:999,background:'var(--grey100)',color:'var(--text-muted)',fontWeight:700 }}>{SPORTS.find(s=>s.id===m.sport)?.label}</span>
                      {urgent && <span style={{ fontSize:11,color:'var(--red500)',fontWeight:800 }}>마감임박</span>}
                    </div>
                    <div style={{ fontSize:14,fontWeight:800,color:'var(--text-strong)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{m.title}</div>
                    <div style={{ fontSize:12,color:'var(--text-muted)',marginTop:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{m.venue} · {m.date} {m.time}</div>
                  </div>
                  <div style={{ textAlign:'right',flexShrink:0 }}>
                    <div className="tab-num" style={{ fontSize:13,fontWeight:800,color:'var(--text-strong)' }}>{m.fee===0?'무료':(m.fee/1000)+'K'}</div>
                    <div className="tab-num" style={{ fontSize:11,color:urgent?'var(--red500)':'var(--text-caption)',fontWeight:700,marginTop:4 }}>{m.cur}/{m.max}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <BottomNav active="matches"/>
    </div>
  );
};

/* ─────────────── Team Matches List V2 ─────────────── */
const MatchesCardCompactSwitcherV2 = () => {
  const [mode, setMode] = React.useState('card');
  const shown = MATCHES.slice(0, 5);
  const renderCard = (m, i) => {
    const urgent = (m.cur / m.max) >= 0.7;
    return (
      <div key={m.id || i} style={{ borderRadius:16,overflow:'hidden',border:'1px solid var(--border)',background:'var(--bg)' }}>
        <div style={{ position:'relative',aspectRatio:'16/9',background:`var(--grey100) url(${m.img}) center/cover` }}>
          <div style={{ position:'absolute',inset:0,background:'linear-gradient(180deg,transparent 46%,rgba(0,0,0,.58))' }}/>
          <div style={{ position:'absolute',top:10,left:12,display:'flex',gap:6 }}>
            <span style={{ padding:'4px 10px',borderRadius:999,background:'rgba(0,0,0,.48)',color:'var(--static-white)',fontSize:11,fontWeight:800 }}>{SPORTS.find(s=>s.id===m.sport)?.label}</span>
            {urgent && <span style={{ padding:'4px 10px',borderRadius:999,background:'var(--red500)',color:'var(--static-white)',fontSize:11,fontWeight:800 }}>마감임박</span>}
          </div>
          <div style={{ position:'absolute',bottom:11,left:14,color:'var(--static-white)',fontSize:11,fontWeight:700 }}>{m.date} · {m.time}</div>
        </div>
        <div style={{ padding:'14px 16px 16px' }}>
          <div style={{ fontSize:15,fontWeight:800,color:'var(--text-strong)',marginBottom:6,lineHeight:1.35 }}>{m.title}</div>
          <div style={{ display:'flex',alignItems:'center',gap:4,fontSize:12,color:'var(--text-muted)',marginBottom:10 }}>
            <Icon name="pin" size={13}/> <span style={{ overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{m.venue}</span>
          </div>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
            <span className="tab-num" style={{ fontSize:12,fontWeight:800,color:urgent?'var(--red500)':'var(--text-muted)' }}>{m.cur}/{m.max}명</span>
            <span className="tab-num" style={{ fontSize:15,fontWeight:800,color:'var(--text-strong)' }}>{m.fee===0?'무료':m.fee.toLocaleString()+'원'}</span>
          </div>
        </div>
      </div>
    );
  };
  const renderCompact = (m, i) => {
    const urgent = (m.cur / m.max) >= 0.7;
    return (
      <div key={m.id || i} style={{ display:'flex',gap:12,padding:'12px 0',borderBottom:'1px solid var(--grey100)',alignItems:'center' }}>
        <div style={{ width:58,height:58,borderRadius:13,background:`var(--grey100) url(${m.img}) center/cover`,flexShrink:0,position:'relative' }}>
          {urgent && <div style={{ position:'absolute',right:-2,bottom:-2,width:17,height:17,borderRadius:999,background:'var(--red500)',border:'2px solid var(--bg)' }}/>}
        </div>
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:3 }}>
            <span style={{ fontSize:11,padding:'2px 7px',borderRadius:999,background:'var(--grey100)',color:'var(--text-muted)',fontWeight:700 }}>{SPORTS.find(s=>s.id===m.sport)?.label}</span>
            {urgent && <span style={{ fontSize:11,color:'var(--red500)',fontWeight:800 }}>마감임박</span>}
          </div>
          <div style={{ fontSize:14,fontWeight:800,color:'var(--text-strong)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{m.title}</div>
          <div style={{ fontSize:12,color:'var(--text-muted)',marginTop:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{m.venue} · {m.date} {m.time}</div>
        </div>
        <div style={{ textAlign:'right',flexShrink:0 }}>
          <div className="tab-num" style={{ fontSize:13,fontWeight:800,color:'var(--text-strong)' }}>{m.fee===0?'무료':(m.fee/1000)+'K'}</div>
          <div className="tab-num" style={{ fontSize:11,color:urgent?'var(--red500)':'var(--text-caption)',fontWeight:700,marginTop:4 }}>{m.cur}/{m.max}</div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ width:375,height:812,background:'var(--bg)',fontFamily:'var(--font)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
      <StatusBar/>
      <div style={{ padding:'12px 20px 10px' }}>
        <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:12 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:18,fontWeight:800,color:'var(--text-strong)',letterSpacing:0 }}>개인 매치</div>
            <div style={{ fontSize:12,color:'var(--text-muted)',marginTop:3 }}>카드형 또는 콤팩트형으로 전환</div>
          </div>
          <button className="tm-pressable tm-break-keep" style={{ width:40,height:40,borderRadius:12,background:'var(--grey100)',border:'none',display:'grid',placeItems:'center',color:'var(--text-strong)',flexShrink:0 }}>
            <Icon name="filter" size={18}/>
          </button>
        </div>
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,padding:4,borderRadius:14,background:'var(--grey100)' }}>
          {[
            ['card', '카드'],
            ['compact', '콤팩트'],
          ].map(([id, label]) => (
            <button key={id} className="tm-pressable tm-break-keep" onClick={()=>setMode(id)} style={{
              height:36,borderRadius:11,border:'none',
              background:mode===id?'var(--bg)':'transparent',
              color:mode===id?'var(--text-strong)':'var(--text-muted)',
              fontSize:13,fontWeight:800,
              boxShadow:mode===id?'0 1px 2px rgba(0,0,0,.05)':'none',
            }}>{label}</button>
          ))}
        </div>
      </div>
      <div style={{ display:'flex',gap:8,padding:'0 20px 12px',overflowX:'auto' }}>
        <HapticChip active>추천</HapticChip>
        <HapticChip>오늘</HapticChip>
        <HapticChip>마감임박</HapticChip>
        <HapticChip>무료</HapticChip>
      </div>
      <div style={{ flex:1,overflow:'auto',padding:'0 20px 84px' }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10 }}>
          <div style={{ fontSize:14,fontWeight:800,color:'var(--text-strong)' }}>{mode==='card'?'카드형 추천':'콤팩트 피드'}</div>
          <div className="tab-num" style={{ fontSize:12,color:'var(--text-caption)',fontWeight:700 }}>{shown.length}개</div>
        </div>
        <div style={mode==='card' ? { display:'flex',flexDirection:'column',gap:12 } : { borderTop:'1px solid var(--grey100)' }}>
          {shown.map((m,i)=>mode==='card' ? renderCard(m,i) : renderCompact(m,i))}
        </div>
      </div>
      <BottomNav active="matches"/>
    </div>
  );
};

const TeamMatchesListV2 = () => {
  const [grade, setGrade] = React.useState('all');
  const grades = ['all','S','A','B','C','D'];
  const teams = [
    { name:'강남 FC',sport:'⚽',grade:'A',cur:11,max:14,fee:15000,region:'강남구',manner:4.8,wins:23,img:'' },
    { name:'서초 Ballers',sport:'🏀',grade:'B',cur:8,max:10,fee:10000,region:'서초구',manner:4.6,wins:15,img:'' },
    { name:'송파 스매쉬',sport:'🎾',grade:'S',cur:2,max:4,fee:20000,region:'송파구',manner:4.9,wins:41,img:'' },
    { name:'마포 슬래머',sport:'🏸',grade:'C',cur:5,max:8,fee:8000,region:'마포구',manner:4.5,wins:9,img:'' },
  ];
  const filtered = grade==='all'?teams:teams.filter(t=>t.grade===grade);
  return (
    <div style={{ width:375,height:812,background:'var(--bg)',fontFamily:'var(--font)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
      <StatusBar/>
      <div style={{ padding:'12px 20px 0',display:'flex',alignItems:'center',justifyContent:'space-between' }}>
        <div style={{ fontSize:17,fontWeight:700,color:'var(--text-strong)' }}>팀 매칭</div>
        <button className="tm-pressable tm-break-keep" style={{ width:40,height:40,borderRadius:12,background:'var(--grey100)',border:'none',display:'grid',placeItems:'center',color:'var(--text-strong)' }}><Icon name="filter" size={20}/></button>
      </div>
      {/* KPI */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:0,padding:'12px 20px',borderBottom:'1px solid var(--grey100)' }}>
        {[{l:'참가 가능',v:47},{l:'오늘 매치',v:8},{l:'S급',v:12}].map((k,i)=>(
          <div key={i} style={{ textAlign:i===1?'center':i===2?'right':'left' }}>
            <div className="tab-num" style={{ fontSize:22,fontWeight:800,color:i===2?'var(--purple500)':'var(--text-strong)' }}>{k.v}</div>
            <div style={{ fontSize:11,color:'var(--text-caption)',fontWeight:500,marginTop:2 }}>{k.l}</div>
          </div>
        ))}
      </div>
      {/* 등급 필터 */}
      <div style={{ display:'flex',gap:8,padding:'10px 20px',overflowX:'auto' }}>
        {grades.map(g=>{
          const colors = {S:'var(--purple500)',A:'var(--blue500)',B:'var(--green500)',C:'var(--orange500)',D:'var(--grey500)',all:'var(--grey900)'};
          return <HapticChip key={g} active={grade===g} onClick={()=>setGrade(g)}>{g==='all'?'전체':g+'등급'}</HapticChip>;
        })}
      </div>
      <div style={{ flex:1,overflow:'auto',paddingBottom:80 }}>
        <div style={{ padding:'4px 20px',display:'flex',flexDirection:'column',gap:10 }}>
          {filtered.map((t,i)=>{
            const gradeColors = {S:'var(--purple500)',A:'var(--blue500)',B:'var(--green500)',C:'var(--orange500)',D:'var(--grey500)'};
            return (
              <div key={i} style={{ padding:'16px',borderRadius:16,border:'1px solid var(--border)',cursor:'pointer',transition:'box-shadow .15s' }}
                onMouseEnter={e=>e.currentTarget.style.boxShadow='var(--sh-2)'}
                onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}>
                <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:12 }}>
                  <div style={{ width:44,height:44,borderRadius:14,background:'var(--grey100)',display:'grid',placeItems:'center',fontSize:22,flexShrink:0 }}>{t.sport}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                      <div style={{ fontSize:15,fontWeight:700,color:'var(--text-strong)' }}>{t.name}</div>
                      <div style={{ padding:'2px 8px',borderRadius:6,background:gradeColors[t.grade]+'18',color:gradeColors[t.grade],fontSize:11,fontWeight:800 }}>{t.grade}</div>
                    </div>
                    <div style={{ fontSize:12,color:'var(--text-muted)',marginTop:3 }}>{t.region} · 매너 {t.manner}점</div>
                  </div>
                  <div className="tab-num" style={{ fontSize:16,fontWeight:700,color:'var(--text-strong)' }}>{t.fee.toLocaleString()}원</div>
                </div>
                <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
                  <div style={{ display:'flex',gap:16 }}>
                    <KPIStat label="참가" value={`${t.cur}/${t.max}`} unit="명"/>
                    <KPIStat label="승리" value={t.wins} unit="전"/>
                  </div>
                  <button className="tm-pressable tm-break-keep" style={{ height:34,padding:'0 16px',borderRadius:999,background:'var(--blue500)',color:'var(--static-white)',fontSize:13,fontWeight:700,border:'none',cursor:'pointer' }}>신청</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <BottomNav active="matches"/>
    </div>
  );
};

/* ─────────────── Notifications V2 — 그룹핑 ─────────────── */
const NotificationsV2 = () => {
  const groups = [
    { label:'오늘', items:[
      { icon:'⚽',title:'주말 축구 매치 모집 마감 2시간 전',sub:'상암 보조구장 · 20/22명',time:'방금',unread:true,color:'var(--red500)' },
      { icon:'💬',title:'강남 FC 채팅에 5개의 새 메시지',sub:'김민준: 내일 몇 시에 모이나요?',time:'23분 전',unread:true,color:'var(--blue500)' },
      { icon:'✅',title:'결제가 완료되었어요',sub:'이태원 농구 3on3 · 10,000원',time:'1시간 전',color:'var(--green500)' },
    ]},
    { label:'어제', items:[
      { icon:'⭐',title:'정현우님이 리뷰를 남겼어요',sub:'"정말 즐거웠어요! 또 같이 뛰어요"',time:'어제 19:34',color:'var(--orange500)' },
      { icon:'🏅',title:'팀 매치 신청이 수락됐어요',sub:'서초 Ballers vs 강남 FC · B등급',time:'어제 15:12',color:'var(--purple500)' },
    ]},
    { label:'이번 주', items:[
      { icon:'🔔',title:'주의: 매치 시작 1시간 전이에요',sub:'화요일 풋살 리그 · 구로 풋살파크',time:'화요일',color:'var(--yellow500)' },
      { icon:'👤',title:'박철수님이 팀 가입을 신청했어요',sub:'강남 FC · 공격수',time:'월요일',color:'var(--teal500)' },
      { icon:'💰',title:'정산이 완료됐어요',sub:'지난주 매치 정산 · +47,000원',time:'월요일',color:'var(--green500)' },
    ]},
  ];
  return (
    <div style={{ width:375,height:812,background:'var(--bg)',fontFamily:'var(--font)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
      <StatusBar/>
      <div style={{ padding:'12px 20px 12px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid var(--grey100)' }}>
        <div style={{ fontSize:17,fontWeight:700,color:'var(--text-strong)' }}>알림</div>
        <button className="tm-pressable tm-break-keep" style={{ fontSize:13,color:'var(--text-muted)',background:'transparent',border:'none',fontWeight:600,cursor:'pointer' }}>모두 읽음</button>
      </div>
      <div style={{ flex:1,overflow:'auto',paddingBottom:80 }}>
        {groups.map((g,gi)=>(
          <div key={gi}>
            <div style={{ padding:'16px 20px 8px',fontSize:12,fontWeight:700,color:'var(--text-caption)',letterSpacing:.3 }}>{g.label}</div>
            {g.items.map((n,i)=>(
              <div key={i} style={{ display:'flex',gap:14,padding:'14px 20px',borderBottom:'1px solid var(--grey50)',background:n.unread?'var(--blue50)':undefined,cursor:'pointer',alignItems:'flex-start',transition:'background .15s' }}
                onMouseEnter={e=>e.currentTarget.style.background=n.unread?'var(--blue100)':'var(--grey50)'}
                onMouseLeave={e=>e.currentTarget.style.background=n.unread?'var(--blue50)':undefined}>
                <div style={{ width:42,height:42,borderRadius:14,background:n.color+'18',display:'grid',placeItems:'center',fontSize:20,flexShrink:0 }}>{n.icon}</div>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:14,fontWeight:n.unread?700:500,color:'var(--text-strong)',lineHeight:1.4 }}>{n.title}</div>
                  <div style={{ fontSize:12,color:'var(--text-muted)',marginTop:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{n.sub}</div>
                  <div style={{ fontSize:11,color:'var(--text-caption)',marginTop:4,fontWeight:500 }}>{n.time}</div>
                </div>
                {n.unread && <div style={{ width:8,height:8,borderRadius:4,background:'var(--blue500)',flexShrink:0,marginTop:6 }}/>}
              </div>
            ))}
          </div>
        ))}
        <div style={{ padding:'24px 20px' }}>
          <button className="tm-pressable tm-break-keep" style={{ width:'100%',height:44,borderRadius:12,background:'var(--grey100)',border:'none',fontSize:14,color:'var(--text-muted)',fontWeight:600,cursor:'pointer' }}>이전 알림 더보기</button>
        </div>
      </div>
    </div>
  );
};

/* ─────────────── MyPage V2 ─────────────── */
const MyPageV2 = () => (
  <div style={{ width:375,height:812,background:'var(--bg)',fontFamily:'var(--font)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
    <StatusBar/>
    <div style={{ flex:1,overflow:'auto',paddingBottom:80 }}>
      {/* 프로필 헤더 */}
      <div style={{ padding:'20px 20px 0',background:'var(--grey50)',borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex',alignItems:'center',gap:16,marginBottom:20 }}>
          <div style={{ width:64,height:64,borderRadius:20,background:'linear-gradient(135deg,var(--blue500),var(--purple500))',display:'grid',placeItems:'center',fontSize:28,color:'var(--static-white)',flexShrink:0 }}>🏃</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:18,fontWeight:800,color:'var(--text-strong)',letterSpacing: 0 }}>정민님</div>
            <div style={{ fontSize:13,color:'var(--text-muted)',marginTop:4,fontWeight:500 }}>@jungmin · 서울 강남구</div>
            <div style={{ display:'flex',gap:4,marginTop:8 }}>
              {['⚽ 축구','🏀 농구'].map((t,i)=><span key={i} style={{ padding:'3px 10px',borderRadius:999,background:'var(--blue50)',color:'var(--blue500)',fontSize:11,fontWeight:700 }}>{t}</span>)}
            </div>
          </div>
          <button className="tm-pressable tm-break-keep" style={{ height:34,padding:'0 14px',borderRadius:999,background:'var(--grey200)',border:'none',fontSize:12,fontWeight:700,color:'var(--text-strong)',cursor:'pointer' }}>편집</button>
        </div>
        {/* KPI 행 */}
        <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',borderTop:'1px solid var(--border)',paddingTop:16,paddingBottom:16,gap:0 }}>
          {[{l:'매치',v:87},{l:'팀',v:3},{l:'매너',v:'4.9'},{l:'뱃지',v:12}].map((k,i)=>(
            <div key={i} style={{ textAlign:'center',borderRight:i<3?'1px solid var(--border)':undefined }}>
              <div className="tab-num" style={{ fontSize:22,fontWeight:800,color:i===2?'var(--orange500)':'var(--text-strong)' }}>{k.v}</div>
              <div style={{ fontSize:11,color:'var(--text-caption)',fontWeight:500,marginTop:2 }}>{k.l}</div>
            </div>
          ))}
        </div>
      </div>
      {/* 이번 달 활동 */}
      <div style={{ margin:'16px 20px',padding:16,borderRadius:16,background:'var(--grey50)',border:'1px solid var(--border)' }}>
        <div style={{ fontSize:13,color:'var(--text-muted)',fontWeight:600,marginBottom:10 }}>이번 달 활동</div>
        <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16 }}>
          <KPIStat label="경기" value={12} unit="회" delta={3} deltaLabel="회"/>
          <KPIStat label="이동 거리" value={34} unit="km" delta={8} deltaLabel="km"/>
          <KPIStat label="지출" value="48K" unit="원"/>
        </div>
      </div>
      {/* 메뉴 */}
      {[
        { section:'내 활동', items:[{icon:'⚽',t:'내 매치'},{icon:'🏅',t:'팀 매칭'},{icon:'📚',t:'레슨 기록'},{icon:'💳',t:'결제 내역'}] },
        { section:'커뮤니티', items:[{icon:'👥',t:'내 팀'},{icon:'⭐',t:'받은 리뷰'},{icon:'🎖️',t:'뱃지'}] },
        { section:'설정', items:[{icon:'🔔',t:'알림 설정'},{icon:'🔒',t:'계정 설정'},{icon:'❓',t:'고객센터'}] },
      ].map((sec,si)=>(
        <div key={si} style={{ marginBottom:8 }}>
          <div style={{ padding:'12px 20px 4px',fontSize:12,color:'var(--text-caption)',fontWeight:700,letterSpacing:.3 }}>{sec.section}</div>
          {sec.items.map((item,i)=>(
            <ListItem key={i} leading={<div style={{ width:32,height:32,borderRadius:10,background:'var(--grey100)',display:'grid',placeItems:'center',fontSize:16 }}>{item.icon}</div>} title={item.t} chev onClick={()=>{}}/>
          ))}
        </div>
      ))}
      <div style={{ padding:'20px 20px 0' }}>
        <button className="tm-pressable tm-break-keep" style={{ width:'100%',height:48,borderRadius:12,background:'var(--red50)',border:'none',color:'var(--red500)',fontSize:14,fontWeight:700,cursor:'pointer' }}>로그아웃</button>
      </div>
    </div>
    <BottomNav active="my"/>
  </div>
);

/* ─────────────── HomePlus V2 ─────────────── */
const HomePlusV2 = () => {
  const [showToast, setShowToast] = React.useState(false);
  return (
    <div style={{ width:375,height:812,background:'var(--bg)',fontFamily:'var(--font)',display:'flex',flexDirection:'column',overflow:'hidden',position:'relative' }}>
      <StatusBar/>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 20px 8px' }}>
        <div style={{ fontSize:22,fontWeight:800,letterSpacing: 0,color:'var(--text-strong)' }}>teameet</div>
        <div style={{ display:'flex',gap:4 }}>
          <button className="tm-pressable tm-break-keep" style={{ width:40,height:40,display:'grid',placeItems:'center',background:'transparent',border:'none',color:'var(--text-strong)' }}><Icon name="search" size={22}/></button>
          <button className="tm-pressable tm-break-keep" style={{ width:40,height:40,display:'grid',placeItems:'center',background:'transparent',border:'none',color:'var(--text-strong)',position:'relative' }}>
            <Icon name="bell" size={22}/>
            <span style={{ position:'absolute',top:8,right:9,width:8,height:8,borderRadius:'50%',background:'var(--red500)',border:'2px solid var(--bg)' }}/>
          </button>
        </div>
      </div>
      <div style={{ flex:1,overflow:'auto',paddingBottom:100 }}>
        <PullHint/>
        {/* 오늘의 일정 위젯 */}
        <div style={{ margin:'8px 20px 20px',padding:18,borderRadius:18,background:'linear-gradient(135deg,var(--blue500) 0%,#6c3ce1 100%)',color:'var(--static-white)',position:'relative',overflow:'hidden' }}>
          <div style={{ position:'absolute',right:-24,top:-24,width:120,height:120,borderRadius:'50%',background:'rgba(255,255,255,.07)' }}/>
          <div style={{ fontSize:12,fontWeight:700,opacity:.8 }}>오늘 일정</div>
          <div style={{ fontSize:20,fontWeight:800,marginTop:6,letterSpacing: 0 }}>상암 주말 축구 14:00</div>
          <div style={{ fontSize:13,opacity:.75,marginTop:4,fontWeight:500 }}>상암월드컵경기장 보조구장 · 20/22명</div>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:16 }}>
            <StackedAvatars avatars={[]} size={26} max={5}/>
            <button className="tm-pressable tm-break-keep" style={{ height:34,padding:'0 16px',borderRadius:999,background:'rgba(255,255,255,.18)',border:'none',color:'var(--static-white)',fontSize:13,fontWeight:700,backdropFilter:'blur(8px)' }}>입장하기</button>
          </div>
        </div>
        {/* 날씨 + 매너 위젯 */}
        <div style={{ padding:'0 20px 20px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
          <div style={{ padding:'14px 14px',borderRadius:14,background:'var(--blue50)',border:'1px solid var(--blue100)' }}>
            <div style={{ fontSize:24 }}>☀️</div>
            <div className="tab-num" style={{ fontSize:20,fontWeight:800,color:'var(--blue700)',marginTop:6 }}>18°</div>
            <div style={{ fontSize:11,color:'var(--blue600)',marginTop:2,fontWeight:500 }}>서울 · 맑음</div>
            <div style={{ fontSize:11,color:'var(--text-caption)',marginTop:4 }}>운동하기 좋아요</div>
          </div>
          <div style={{ padding:'14px 14px',borderRadius:14,background:'var(--orange50)',border:'1px solid #ffe0b2' }}>
            <div style={{ fontSize:13,fontWeight:700,color:'var(--text-muted)' }}>매너 점수</div>
            <div className="tab-num" style={{ fontSize:32,fontWeight:900,color:'var(--orange500)',marginTop:4,letterSpacing: 0 }}>4.9</div>
            <div style={{ fontSize:11,color:'var(--text-muted)',marginTop:2,fontWeight:500 }}>상위 5%</div>
          </div>
        </div>
        {/* 추천 매치 */}
        <SectionTitle title="추천 매치" action="전체"/>
        <div style={{ display:'flex',gap:12,padding:'4px 20px',overflowX:'auto' }}>
          {MATCHES.slice(0,4).map((m,i)=>(
            <div key={i} style={{ flexShrink:0,width:180,borderRadius:14,border:'1px solid var(--border)',overflow:'hidden',cursor:'pointer' }}>
              <div style={{ height:90,background:`var(--grey100) url(${m.img}) center/cover`,position:'relative' }}>
                {(m.cur/m.max)>=0.7 && <div style={{ position:'absolute',top:8,left:8,padding:'3px 8px',borderRadius:999,background:'var(--red500)',color:'var(--static-white)',fontSize:10,fontWeight:700 }}>마감임박</div>}
              </div>
              <div style={{ padding:'10px 12px' }}>
                <div style={{ fontSize:13,fontWeight:700,color:'var(--text-strong)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{m.title}</div>
                <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:6 }}>
                  <span style={{ fontSize:11,color:'var(--text-caption)' }}>{m.cur}/{m.max}명</span>
                  <span className="tab-num" style={{ fontSize:12,fontWeight:700,color:'var(--blue500)' }}>{m.fee===0?'무료':m.fee.toLocaleString()+'원'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ height:20 }}/>
      </div>
      {/* FAB */}
      <button className="tm-pressable tm-break-keep" onClick={()=>{setShowToast(true);setTimeout(()=>setShowToast(false),2500);}} style={{ position:'absolute',bottom:90,right:20,width:52,height:52,borderRadius:26,background:'var(--blue500)',border:'none',display:'grid',placeItems:'center',color:'var(--static-white)',boxShadow:'0 6px 20px rgba(49,130,246,.4)',cursor:'pointer',zIndex:10,transition:'transform .1s' }}
        onMouseDown={e=>e.currentTarget.style.transform='scale(0.93)'}
        onMouseUp={e=>e.currentTarget.style.transform='scale(1)'}>
        <Icon name="plus" size={24}/>
      </button>
      {showToast && <Toast msg="매치 만들기" type="info" visible/>}
      <BottomNav active="home"/>
    </div>
  );
};

Object.assign(window, {
  HomeB_V2, HomeC_V2, HomeEditorialV2, HomeDarkV2, HomeStoriesV2,
  MatchesListV2, MatchesTimelineV2, MatchesSwipeV2, MatchesDenseV2, MatchesCardNewsCompactV2, MatchesCardCompactSwitcherV2,
  TeamMatchesListV2,
  NotificationsV2,
  MyPageV2,
  HomePlusV2,
});
