/* Teameet — V2 서브 화면 (본 라인 03~23 나머지)
   LessonsV2 · MarketplaceV2 · VenuesV2 · ChatRoomV2
   TeamDetailV2 · TeamMatchDetailV2 · MyActivityV2
   MicroInteractionsDemo · MatchesMapV2 */

const LessonAcademyHub = () => {
  const tracks = [
    { title: '축구 입문 아카데미', sub: '4주 과정 · 패스/드리블/게임 이해', level: '입문', price: 120000, tone: 'blue' },
    { title: '풋살 실전반', sub: '6회 과정 · 전술/압박/공간 활용', level: '중급', price: 180000, tone: 'green' },
    { title: '테니스 NTRP 업그레이드', sub: '8회 과정 · 단식 랠리와 서브 안정화', level: '3.0+', price: 240000, tone: 'orange' },
  ];
  return (
    <Phone>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 90, background: 'var(--grey50)' }}>
        <div style={{ padding: '12px 20px 18px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue500)' }}>TEAMEET ACADEMY</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', marginTop: 6, lineHeight: 1.22 }}>레슨의 메인은<br/>아카데미 허브입니다</div>
            </div>
            <button className="tm-pressable tm-break-keep" style={{ width: 42, height: 42, borderRadius: 14, background: 'var(--grey100)', display: 'grid', placeItems: 'center' }}>
              <Icon name="search" size={20}/>
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <KPIStat label="검증 코치" value={86}/>
            <KPIStat label="운영 코스" value={320}/>
            <KPIStat label="평균 평점" value="4.8"/>
          </div>
        </div>

        <div style={{ padding: 20 }}>
          <SectionTitle title="추천 학습 경로" sub="단건 레슨보다 먼저 보여주는 메인 IA"/>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {tracks.map((track) => (
              <Card key={track.title} pad={16} interactive style={{ borderRadius: 16 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <Badge tone={track.tone}>{track.level}</Badge>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>{track.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.45 }}>{track.sub}</div>
                    <div style={{ marginTop: 10 }}>
                      <MoneyRow label="패키지 시작가" amount={track.price}/>
                    </div>
                  </div>
                  <Icon name="chevR" size={18} color="var(--grey400)"/>
                </div>
              </Card>
            ))}
          </div>

          <div style={{ marginTop: 20 }}>
            <SectionTitle title="레슨 탐색" sub="사용자는 여기서 코스, 코치, 수강권으로 분기"/>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
              {[
                ['코스 찾기', '목표별 커리큘럼', 'lessons'],
                ['코치 찾기', '검증 코치 프로필', 'coaches'],
                ['무료 체험', '이번 주 시작', 'trial'],
                ['내 수강권', '잔여/만료 관리', 'tickets'],
              ].map(([title, sub, id], i) => (
                <Card key={id} pad={14} interactive style={{ minHeight: 96 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 12, background: i === 0 ? 'var(--blue50)' : 'var(--grey100)', color: i === 0 ? 'var(--blue500)' : 'var(--grey700)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{i + 1}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 10 }}>{title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
      <BottomNav active="lessons"/>
    </Phone>
  );
};

/* ─────────────── Lessons List V2 ─────────────── */
const LessonsListV2 = () => {
  const [cat, setCat] = React.useState('all');
  const lessons = [
    { sport:'⚽',title:'축구 기초 드리블 클래스',coach:'김코치',level:'초급',fee:50000,per:'회',sessions:8,region:'강남구',rating:4.9,reviews:87,img:'',badge:'베스트' },
    { sport:'🎾',title:'테니스 NTRP 3.0 → 4.0 집중반',coach:'박프로',level:'중급',fee:80000,per:'회',sessions:12,region:'서초구',rating:4.8,reviews:54,img:'',badge:'인기' },
    { sport:'🏀',title:'농구 개인 트레이닝',coach:'이코치',level:'고급',fee:120000,per:'회',sessions:4,region:'송파구',rating:5.0,reviews:23,img:'',badge:'NEW' },
    { sport:'🏸',title:'배드민턴 복식 전략 레슨',coach:'최선수',level:'중급',fee:40000,per:'회',sessions:6,region:'마포구',rating:4.7,reviews:112,img:'',badge:null },
  ];
  const cats = [
    {id:'all',label:'전체',count:48},
    {id:'soccer',label:'⚽ 축구',count:14},
    {id:'tennis',label:'🎾 테니스',count:9},
    {id:'basketball',label:'🏀 농구',count:7},
  ];
  return (
    <div style={{ width:375,height:812,background:'var(--bg)',fontFamily:'var(--font)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
      <StatusBar/>
      <div style={{ padding:'12px 20px 0',display:'flex',alignItems:'center',gap:8 }}>
        <div style={{ flex:1,display:'flex',alignItems:'center',gap:8,height:42,borderRadius:12,background:'var(--grey100)',padding:'0 14px' }}>
          <Icon name="search" size={18} color="var(--text-caption)"/>
          <div style={{ fontSize:14,color:'var(--text-placeholder)' }}>코치명, 종목, 지역 검색</div>
        </div>
        <button className="tm-pressable tm-break-keep" style={{ width:42,height:42,borderRadius:12,background:'var(--grey100)',border:'none',display:'grid',placeItems:'center',flexShrink:0 }}>
          <Icon name="filter" size={20}/>
        </button>
      </div>
      <div style={{ display:'flex',gap:8,padding:'10px 20px',overflowX:'auto' }}>
        {cats.map(c=><HapticChip key={c.id} active={cat===c.id} onClick={()=>setCat(c.id)} count={c.count}>{c.label}</HapticChip>)}
      </div>
      {/* KPI */}
      <div style={{ padding:'0 20px 12px',display:'flex',gap:0,borderBottom:'1px solid var(--grey100)' }}>
        {[{l:'전체 레슨',v:48},{l:'이번 주 시작',v:12},{l:'무료 체험',v:5}].map((k,i)=>(
          <div key={i} style={{ flex:1,textAlign:i===1?'center':i===2?'right':'left' }}>
            <div className="tab-num" style={{ fontSize:20,fontWeight:800,color:i===2?'var(--green500)':'var(--text-strong)' }}>{k.v}</div>
            <div style={{ fontSize:11,color:'var(--text-caption)',fontWeight:500,marginTop:2 }}>{k.l}</div>
          </div>
        ))}
      </div>
      <div style={{ flex:1,overflow:'auto',paddingBottom:80 }}>
        <div style={{ padding:'12px 20px',display:'flex',flexDirection:'column',gap:14 }}>
          {lessons.map((l,i)=>(
            <div key={i} style={{ borderRadius:16,border:'1px solid var(--border)',overflow:'hidden',cursor:'pointer',transition:'box-shadow .15s' }}
              onMouseEnter={e=>e.currentTarget.style.boxShadow='var(--sh-2)'}
              onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}>
              <div style={{ display:'flex',gap:14,padding:'16px' }}>
                <div style={{ width:64,height:64,borderRadius:14,background:'var(--grey100)',display:'grid',placeItems:'center',fontSize:28,flexShrink:0,position:'relative' }}>
                  <span aria-hidden="true">{l.sport}</span>
                  {l.badge && <div style={{ position:'absolute',top:-4,right:-4,padding:'2px 6px',borderRadius:999,background:l.badge==='베스트'?'var(--blue500)':l.badge==='인기'?'var(--orange500)':'var(--green500)',color:'var(--static-white)',fontSize:9,fontWeight:800 }}>{l.badge}</div>}
                </div>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:14,fontWeight:700,color:'var(--text-strong)',lineHeight:1.35 }}>{l.title}</div>
                  <div style={{ fontSize:12,color:'var(--text-muted)',marginTop:4,fontWeight:500 }}>{l.coach} · {l.region} · {l.level}</div>
                  <div style={{ display:'flex',alignItems:'center',gap:6,marginTop:6 }}>
                    <span style={{ fontSize:12,color:'var(--orange500)',fontWeight:700 }}>★ {l.rating}</span>
                    <span style={{ fontSize:11,color:'var(--text-caption)' }}>({l.reviews})</span>
                    <span style={{ fontSize:11,color:'var(--text-caption)' }}>· {l.sessions}회 과정</span>
                  </div>
                </div>
              </div>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderTop:'1px solid var(--grey100)',background:'var(--grey50)' }}>
                <MoneyRow label={`${l.sessions}회 과정`} amount={l.fee} unit={`원/${l.per}`}/>
                <button className="tm-pressable tm-break-keep" style={{ height:34,padding:'0 16px',borderRadius:999,background:'var(--blue500)',color:'var(--static-white)',fontSize:12,fontWeight:700,border:'none',flexShrink:0,marginLeft:12 }}>신청</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <BottomNav active="lessons"/>
    </div>
  );
};

/* ─────────────── Marketplace V2 ─────────────── */
const MarketplaceV2 = () => {
  const [cat, setCat] = React.useState('all');
  const items = [
    { emoji:'👟',title:'나이키 머큐리얼 슈퍼플라이 260mm',sub:'3회 착용 · 상태 A+',price:180000,org:320000,region:'강남구',ago:'방금',img:'',badge:'급처' },
    { emoji:'🎾',title:'Wilson Ultra 100 테니스 라켓',sub:'2022년 구매 · 케이스 포함',price:150000,org:260000,region:'서초구',ago:'1시간 전',img:'',badge:null },
    { emoji:'🏀',title:'나이키 에어 줌 농구화 270mm',sub:'미착용 · 박스 포함',price:95000,org:149000,region:'마포구',ago:'3시간 전',img:'',badge:'인기' },
    { emoji:'🏸',title:'요넥스 배드민턴 라켓 세트',sub:'라켓 2개+셔틀콕+가방',price:55000,org:120000,region:'송파구',ago:'어제',img:'',badge:null },
  ];
  const cats = ['all','신발','라켓','의류','보호대','기타'];
  const disc = i => Math.round((1-items[i].price/items[i].org)*100);
  return (
    <div style={{ width:375,height:812,background:'var(--bg)',fontFamily:'var(--font)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
      <StatusBar/>
      <div style={{ padding:'12px 20px 0',display:'flex',alignItems:'center',gap:8 }}>
        <div style={{ flex:1,display:'flex',alignItems:'center',gap:8,height:42,borderRadius:12,background:'var(--grey100)',padding:'0 14px' }}>
          <Icon name="search" size={18} color="var(--text-caption)"/>
          <div style={{ fontSize:14,color:'var(--text-placeholder)' }}>장터 검색</div>
        </div>
        <button className="tm-pressable tm-break-keep" style={{ height:34,padding:'0 14px',borderRadius:999,background:'var(--blue500)',border:'none',color:'var(--static-white)',fontSize:13,fontWeight:700,flexShrink:0 }}>+ 등록</button>
      </div>
      <div style={{ display:'flex',gap:8,padding:'10px 20px',overflowX:'auto' }}>
        {cats.map((c,i)=><HapticChip key={i} active={cat===c} onClick={()=>setCat(c)}>{c==='all'?'전체':c}</HapticChip>)}
      </div>
      <div style={{ flex:1,overflow:'auto',paddingBottom:80 }}>
        <div style={{ padding:'4px 20px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
          {items.map((item,i)=>(
            <div key={i} style={{ borderRadius:14,border:'1px solid var(--border)',overflow:'hidden',cursor:'pointer',transition:'box-shadow .15s' }}
              onMouseEnter={e=>e.currentTarget.style.boxShadow='var(--sh-2)'}
              onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}>
              <div style={{ aspectRatio:'1',background:'var(--grey100)',display:'grid',placeItems:'center',fontSize:48,position:'relative' }}>
                {item.emoji}
                {item.badge && <div style={{ position:'absolute',top:8,left:8,padding:'3px 8px',borderRadius:999,background:item.badge==='급처'?'var(--red500)':'var(--orange500)',color:'var(--static-white)',fontSize:10,fontWeight:800 }}>{item.badge}</div>}
                <div style={{ position:'absolute',top:8,right:8,padding:'3px 8px',borderRadius:999,background:'rgba(0,0,0,.45)',color:'var(--static-white)',fontSize:10,fontWeight:700 }}>{disc(i)}%↓</div>
              </div>
              <div style={{ padding:'10px 12px 12px' }}>
                <div style={{ fontSize:13,fontWeight:700,color:'var(--text-strong)',lineHeight:1.3,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden' }}>{item.title}</div>
                <div style={{ fontSize:11,color:'var(--text-muted)',marginTop:4 }}>{item.sub}</div>
                <div style={{ marginTop:8 }}>
                  <div className="tab-num" style={{ fontSize:15,fontWeight:800,color:'var(--text-strong)' }}>{item.price.toLocaleString()}원</div>
                  <div className="tab-num" style={{ fontSize:11,color:'var(--text-caption)',textDecoration:'line-through' }}>{item.org.toLocaleString()}원</div>
                </div>
                <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:8 }}>
                  <span style={{ fontSize:11,color:'var(--text-caption)' }}>{item.region}</span>
                  <span style={{ fontSize:11,color:'var(--text-caption)' }}>{item.ago}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <BottomNav active="market"/>
    </div>
  );
};

/* ─────────────── Chat Room V2 ─────────────── */
const ChatRoomV2 = () => {
  const msgs = [
    { me:false,text:'내일 몇 시에 모여요?',time:'14:22' },
    { me:false,text:'복장은 어떻게 해야 하나요?',time:'14:23' },
    { me:true,text:'오후 2시에 상암 보조구장 앞에서 만나요!',time:'14:25' },
    { me:true,text:'운동복 편한거 입으시면 됩니다 ⚽',time:'14:25' },
    { me:false,text:'넵 감사합니다!',time:'14:26' },
    { me:false,text:'혹시 주차 가능한가요?',time:'14:30' },
    { me:true,text:'경기장 주차장 이용 가능해요. 1시간 무료',time:'14:32' },
    { me:false,text:'👍',time:'14:32' },
  ];
  const [input, setInput] = React.useState('');
  return (
    <div style={{ width:375,height:812,background:'var(--bg)',fontFamily:'var(--font)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
      <StatusBar/>
      {/* 헤더 */}
      <div style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 16px 10px',borderBottom:'1px solid var(--grey100)' }}>
        <button className="tm-pressable tm-break-keep" style={{ width:40,height:40,display:'grid',placeItems:'center',background:'transparent',border:'none',flexShrink:0 }}><Icon name="chevL" size={22}/></button>
        <div style={{ width:36,height:36,borderRadius:12,background:'var(--blue50)',display:'grid',placeItems:'center',fontSize:18,flexShrink:0 }}>⚽</div>
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ fontSize:15,fontWeight:700,color:'var(--text-strong)' }}>상암 주말 축구</div>
          <div style={{ fontSize:12,color:'var(--text-muted)',fontWeight:500 }}>20명 참가 · 오늘 14:00</div>
        </div>
        <button className="tm-pressable tm-break-keep" style={{ width:40,height:40,display:'grid',placeItems:'center',background:'transparent',border:'none' }}><Icon name="more" size={22}/></button>
      </div>
      {/* 매치 카드 임베드 */}
      <div style={{ margin:'10px 16px',padding:'12px 14px',borderRadius:12,background:'var(--blue50)',border:'1px solid var(--blue100)',display:'flex',alignItems:'center',gap:12,cursor:'pointer' }}>
        <div style={{ width:40,height:40,borderRadius:10,background:'var(--blue500)',display:'grid',placeItems:'center',fontSize:18,flexShrink:0 }}>⚽</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13,fontWeight:700,color:'var(--blue700)' }}>상암 주말 축구 · 오늘 14:00</div>
          <div style={{ fontSize:11,color:'var(--blue600)',marginTop:2 }}>상암월드컵경기장 보조구장 · 20/22명</div>
        </div>
        <Icon name="chevR" size={16} color="var(--blue400)"/>
      </div>
      {/* 메시지 */}
      <div style={{ flex:1,overflow:'auto',padding:'4px 16px 8px',display:'flex',flexDirection:'column',gap:8 }}>
        {msgs.map((msg,i)=>(
          <div key={i} style={{ display:'flex',flexDirection:msg.me?'row-reverse':'row',gap:8,alignItems:'flex-end' }}>
            {!msg.me && <div style={{ width:28,height:28,borderRadius:'50%',background:'var(--grey200)',flexShrink:0,display:'grid',placeItems:'center',fontSize:12 }}>👤</div>}
            <div style={{ maxWidth:'72%' }}>
              <div style={{ padding:'10px 13px',borderRadius:msg.me?'14px 14px 4px 14px':'14px 14px 14px 4px',background:msg.me?'var(--blue500)':'var(--grey100)',color:msg.me?'var(--static-white)':'var(--text-strong)',fontSize:14,fontWeight:500,lineHeight:1.45 }}>{msg.text}</div>
              <div style={{ fontSize:10,color:'var(--text-caption)',marginTop:3,textAlign:msg.me?'right':'left' }}>{msg.time}</div>
            </div>
          </div>
        ))}
      </div>
      {/* 입력창 */}
      <div style={{ padding:'8px 12px 16px',borderTop:'1px solid var(--grey100)',display:'flex',gap:8,alignItems:'flex-end' }}>
        <button className="tm-pressable tm-break-keep" style={{ width:36,height:36,borderRadius:999,background:'var(--grey100)',border:'none',display:'grid',placeItems:'center',flexShrink:0 }}><Icon name="plus" size={18}/></button>
        <div style={{ flex:1,minHeight:36,padding:'8px 14px',borderRadius:20,background:'var(--grey100)',fontSize:14,color:'var(--text-placeholder)',display:'flex',alignItems:'center' }}>메시지 입력</div>
        <button className="tm-pressable tm-break-keep" style={{ width:36,height:36,borderRadius:999,background:'var(--blue500)',border:'none',display:'grid',placeItems:'center',flexShrink:0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--static-white)"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
        </button>
      </div>
    </div>
  );
};

/* ─────────────── Team Match Detail V2 ─────────────── */
const TeamMatchDetailV2 = () => (
  <div style={{ width:375,height:812,background:'var(--bg)',fontFamily:'var(--font)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
    <StatusBar/>
    <div style={{ display:'flex',alignItems:'center',padding:'10px 16px',borderBottom:'1px solid var(--grey100)' }}>
      <button className="tm-pressable tm-break-keep" style={{ width:40,height:40,display:'grid',placeItems:'center',background:'transparent',border:'none' }}><Icon name="chevL" size={22}/></button>
      <div style={{ flex:1,fontSize:15,fontWeight:700,color:'var(--text-strong)',textAlign:'center' }}>팀 매치 상세</div>
      <div style={{ width:40 }}/>
    </div>
    <div style={{ flex:1,overflow:'auto',paddingBottom:100 }}>
      {/* vs 헤더 */}
      <div style={{ padding:'24px 20px 20px',background:'var(--grey50)',borderBottom:'1px solid var(--border)',textAlign:'center' }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:20,marginBottom:16 }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ width:56,height:56,borderRadius:18,background:'var(--blue50)',display:'grid',placeItems:'center',fontSize:28,margin:'0 auto 8px' }}>⚽</div>
            <div style={{ fontSize:15,fontWeight:800,color:'var(--text-strong)' }}>강남 FC</div>
            <div style={{ padding:'2px 8px',borderRadius:6,background:'var(--blue-alpha-10)',color:'var(--blue500)',fontSize:11,fontWeight:800,display:'inline-block',marginTop:4 }}>A등급</div>
          </div>
          <div>
            <div style={{ fontSize:24,fontWeight:900,color:'var(--text-caption)',letterSpacing:2 }}>VS</div>
            <div style={{ fontSize:11,color:'var(--text-caption)',marginTop:4 }}>2024.12.21</div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ width:56,height:56,borderRadius:18,background:'var(--purple50,var(--grey100))',display:'grid',placeItems:'center',fontSize:28,margin:'0 auto 8px' }}>⚽</div>
            <div style={{ fontSize:15,fontWeight:800,color:'var(--text-strong)' }}>서초 Raiders</div>
            <div style={{ padding:'2px 8px',borderRadius:6,background:'var(--purple-alpha-10)',color:'var(--purple500)',fontSize:11,fontWeight:800,display:'inline-block',marginTop:4 }}>A등급</div>
          </div>
        </div>
        <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginTop:8 }}>
          <KPIStat label="날짜" value="12/21"/>
          <KPIStat label="시간" value="14:00"/>
          <KPIStat label="장소" value="상암"/>
        </div>
      </div>
      {/* 상세 정보 */}
      <div style={{ padding:'16px 20px' }}>
        <SectionTitle title="경기 정보"/>
        <div style={{ padding:'0 0 8px' }}>
          {[
            { label:'종목', value:'⚽ 축구 (11인제)' },
            { label:'장소', value:'상암월드컵경기장 A구장' },
            { label:'참가비', value:'15,000원 / 인' },
            { label:'전반/후반', value:'각 30분' },
          ].map((r,i)=><MoneyRow key={i} label={r.label} amount={r.value} unit=""/>)}
        </div>
        {/* 팀 멤버 */}
        <div style={{ marginTop:8 }}>
          <SectionTitle title="참가 인원" sub="11/14명 확정"/>
          <div style={{ display:'flex',gap:8,flexWrap:'wrap',padding:'0 0 16px' }}>
            {['김민준','이지수','박철수','최아름','정현우','한동훈','오세진','신미래','유준호','강다솔','배현식'].map((name,i)=>(
              <div key={i} style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:4,width:52 }}>
                <div style={{ width:40,height:40,borderRadius:14,background:`hsl(${i*33},55%,75%)`,display:'grid',placeItems:'center',fontSize:14 }}>🧑</div>
                <div style={{ fontSize:10,color:'var(--text-muted)',textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',width:'100%' }}>{name.slice(0,2)}</div>
              </div>
            ))}
            <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:4,width:52 }}>
              <div style={{ width:40,height:40,borderRadius:14,background:'var(--grey100)',display:'grid',placeItems:'center',color:'var(--text-caption)' }}><Icon name="plus" size={18}/></div>
              <div style={{ fontSize:10,color:'var(--text-caption)',textAlign:'center' }}>3자리</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    {/* 하단 CTA */}
    <div style={{ padding:'12px 20px 28px',borderTop:'1px solid var(--border)',background:'var(--bg)' }}>
      <div style={{ display:'flex',gap:10 }}>
        <button className="tm-pressable tm-break-keep" style={{ flex:1,height:52,borderRadius:14,background:'var(--grey100)',border:'none',fontSize:15,fontWeight:700,color:'var(--text-strong)',cursor:'pointer' }}>채팅</button>
        <button className="tm-pressable tm-break-keep" style={{ flex:2,height:52,borderRadius:14,background:'var(--blue500)',border:'none',fontSize:15,fontWeight:700,color:'var(--static-white)',cursor:'pointer' }}>신청하기</button>
      </div>
    </div>
  </div>
);

/* ─────────────── Team Detail V2 ─────────────── */
const TeamDetailV2 = () => (
  <div style={{ width:375,height:812,background:'var(--bg)',fontFamily:'var(--font)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
    <StatusBar/>
    <div style={{ display:'flex',alignItems:'center',padding:'10px 16px',position:'absolute',top:44,left:0,right:0,zIndex:10 }}>
      <button className="tm-pressable tm-break-keep" style={{ width:40,height:40,display:'grid',placeItems:'center',background:'rgba(0,0,0,.3)',border:'none',borderRadius:'50%',backdropFilter:'blur(8px)' }}><Icon name="chevL" size={22} color="var(--static-white)"/></button>
      <div style={{ flex:1 }}/>
      <button className="tm-pressable tm-break-keep" style={{ width:40,height:40,display:'grid',placeItems:'center',background:'rgba(0,0,0,.3)',border:'none',borderRadius:'50%',backdropFilter:'blur(8px)' }}><Icon name="share" size={20} color="var(--static-white)"/></button>
    </div>
    <div style={{ flex:1,overflow:'auto',paddingBottom:100 }}>
      {/* 히어로 */}
      <div style={{ height:200,background:'linear-gradient(135deg,#1a237e,var(--blue500))',position:'relative',display:'flex',alignItems:'center',justifyContent:'center' }}>
        <div style={{ textAlign:'center',color:'var(--static-white)' }}>
          <div style={{ fontSize:48 }}>⚽</div>
          <div style={{ fontSize:22,fontWeight:900,marginTop:8,letterSpacing: 0 }}>강남 FC</div>
        </div>
      </div>
      {/* 팀 정보 */}
      <div style={{ padding:'20px 20px 0' }}>
        <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:16 }}>
          <div style={{ padding:'4px 12px',borderRadius:8,background:'var(--blue-alpha-10)',color:'var(--blue500)',fontSize:13,fontWeight:800 }}>A등급</div>
          <div style={{ fontSize:13,color:'var(--text-muted)',fontWeight:500 }}>강남구 · 2021년 창단</div>
          <div style={{ flex:1 }}/>
          <div style={{ display:'flex',gap:4,alignItems:'center' }}>
            <span style={{ fontSize:13,color:'var(--orange500)',fontWeight:700 }}>★ 4.8</span>
          </div>
        </div>
        {/* KPI */}
        <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:0,padding:'16px 0',borderTop:'1px solid var(--border)',borderBottom:'1px solid var(--border)',marginBottom:20 }}>
          {[{l:'총원',v:'14명'},{l:'승',v:23},{l:'무',v:5},{l:'패',v:8}].map((k,i)=>(
            <div key={i} style={{ textAlign:'center',borderRight:i<3?'1px solid var(--border)':undefined }}>
              <div className="tab-num" style={{ fontSize:20,fontWeight:800,color:i===1?'var(--blue500)':i===3?'var(--red500)':'var(--text-strong)' }}>{k.v}</div>
              <div style={{ fontSize:11,color:'var(--text-caption)',fontWeight:500,marginTop:2 }}>{k.l}</div>
            </div>
          ))}
        </div>
        {/* 멤버 */}
        <SectionTitle title="팀원" action="전체보기"/>
        <div style={{ display:'flex',gap:10,overflowX:'auto',padding:'4px 0 16px' }}>
          {['주장 김민준','이지수','박철수','최아름','정현우'].map((name,i)=>(
            <div key={i} style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:6,flexShrink:0 }}>
              <div style={{ width:52,height:52,borderRadius:18,background:`hsl(${i*60},55%,75%)`,display:'grid',placeItems:'center',fontSize:20,border:i===0?'2px solid var(--blue500)':undefined }}>🧑</div>
              <div style={{ fontSize:11,color:'var(--text-muted)',fontWeight:500,maxWidth:60,textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{name.split(' ').pop()}</div>
              {i===0 && <div style={{ fontSize:9,color:'var(--blue500)',fontWeight:700 }}>주장</div>}
            </div>
          ))}
        </div>
        {/* 최근 경기 */}
        <SectionTitle title="최근 경기"/>
        {[{opp:'서초 Raiders',result:'승',score:'3:1',date:'12.14'},{opp:'마포 유나이티드',result:'무',score:'2:2',date:'12.07'}].map((g,i)=>(
          <div key={i} style={{ display:'flex',alignItems:'center',padding:'12px 0',borderBottom:'1px solid var(--grey100)' }}>
            <div style={{ flex:1,fontSize:14,fontWeight:600,color:'var(--text-strong)' }}>vs {g.opp}</div>
            <div style={{ display:'flex',gap:10,alignItems:'center' }}>
              <span className="tab-num" style={{ fontSize:14,fontWeight:700 }}>{g.score}</span>
              <span style={{ padding:'3px 10px',borderRadius:999,background:g.result==='승'?'var(--green50)':g.result==='무'?'var(--grey100)':'var(--red50)',color:g.result==='승'?'var(--green500)':g.result==='무'?'var(--text-muted)':'var(--red500)',fontSize:11,fontWeight:800 }}>{g.result}</span>
              <span style={{ fontSize:12,color:'var(--text-caption)' }}>{g.date}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
    <div style={{ padding:'12px 20px 28px',borderTop:'1px solid var(--border)',background:'var(--bg)' }}>
      <button className="tm-pressable tm-break-keep" style={{ width:'100%',height:52,borderRadius:14,background:'var(--blue500)',border:'none',fontSize:15,fontWeight:700,color:'var(--static-white)',cursor:'pointer' }}>팀 매치 신청</button>
    </div>
  </div>
);

/* ─────────────── My Activity V2 ─────────────── */
const MyActivityV2 = () => {
  const [tab, setTab] = React.useState('matches');
  const tabs = [{id:'matches',label:'내 매치'},{id:'lessons',label:'레슨'},{id:'teams',label:'팀'}];
  const history = [
    { sport:'⚽',title:'상암 주말 축구',date:'2024.12.14',venue:'상암 보조구장',result:'win',fee:12000 },
    { sport:'🏀',title:'이태원 3on3 농구',date:'2024.12.07',venue:'이태원 농구장',result:'lose',fee:10000 },
    { sport:'🎾',title:'강남 테니스 복식',date:'2024.11.30',venue:'강남구민체육관',result:'win',fee:15000 },
    { sport:'🏸',title:'마포 배드민턴',date:'2024.11.23',venue:'마포스포츠센터',result:'draw',fee:8000 },
  ];
  return (
    <div style={{ width:375,height:812,background:'var(--bg)',fontFamily:'var(--font)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
      <StatusBar/>
      <div style={{ padding:'12px 20px 0',display:'flex',alignItems:'center',justifyContent:'space-between' }}>
        <button className="tm-pressable tm-break-keep" style={{ width:40,height:40,display:'grid',placeItems:'center',background:'transparent',border:'none' }}><Icon name="chevL" size={22}/></button>
        <div style={{ fontSize:16,fontWeight:700,color:'var(--text-strong)' }}>내 활동</div>
        <div style={{ width:40 }}/>
      </div>
      {/* KPI */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,padding:'16px 20px',borderBottom:'1px solid var(--grey100)' }}>
        <KPIStat label="총 매치" value={87} unit="회" delta={3} deltaLabel="회"/>
        <KPIStat label="총 지출" value="424K" unit="원"/>
        <KPIStat label="승률" value="68%" delta={5} deltaLabel="%"/>
      </div>
      {/* 탭 */}
      <div style={{ display:'flex',borderBottom:'1px solid var(--grey100)' }}>
        {tabs.map(t=>(
          <button className="tm-pressable tm-break-keep" key={t.id} onClick={()=>setTab(t.id)} style={{ flex:1,height:44,background:'transparent',border:'none',fontSize:14,fontWeight:tab===t.id?700:500,color:tab===t.id?'var(--text-strong)':'var(--text-caption)',borderBottom:tab===t.id?'2px solid var(--grey900)':'none',cursor:'pointer' }}>{t.label}</button>
        ))}
      </div>
      <div style={{ flex:1,overflow:'auto',paddingBottom:80 }}>
        {tab==='matches' ? history.map((h,i)=>(
          <div key={i} style={{ display:'flex',gap:14,padding:'14px 20px',borderBottom:'1px solid var(--grey100)',cursor:'pointer',alignItems:'center' }}>
            <div style={{ width:44,height:44,borderRadius:14,background:'var(--grey100)',display:'grid',placeItems:'center',fontSize:22,flexShrink:0 }}>{h.sport}</div>
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ fontSize:14,fontWeight:700,color:'var(--text-strong)' }}>{h.title}</div>
              <div style={{ fontSize:12,color:'var(--text-muted)',marginTop:3 }}>{h.date} · {h.venue}</div>
            </div>
            <div style={{ textAlign:'right',flexShrink:0 }}>
              <div style={{ padding:'3px 10px',borderRadius:999,background:h.result==='win'?'var(--green50)':h.result==='lose'?'var(--red50)':'var(--grey100)',color:h.result==='win'?'var(--green500)':h.result==='lose'?'var(--red500)':'var(--text-muted)',fontSize:11,fontWeight:700,marginBottom:6 }}>{h.result==='win'?'승':h.result==='lose'?'패':'무'}</div>
              <div className="tab-num" style={{ fontSize:12,color:'var(--text-muted)',fontWeight:600 }}>{h.fee.toLocaleString()}원</div>
            </div>
          </div>
        )) : (
          <EmptyState title="내역이 없어요" sub="레슨이나 팀 활동을 시작해보세요" cta="둘러보기"/>
        )}
      </div>
      <BottomNav active="my"/>
    </div>
  );
};

/* ─────────────── Micro Interactions Demo ─────────────── */
const MicroInteractionsDemo = () => {
  const [skLoading, setSkLoading] = React.useState(false);
  const [toastType, setToastType] = React.useState(null);
  const [chips, setChips] = React.useState(['⚽ 축구','🏀 농구','🎾 테니스']);
  const [activeChips, setActiveChips] = React.useState(['⚽ 축구']);

  React.useEffect(()=>{
    if(skLoading){ const t=setTimeout(()=>setSkLoading(false),2000); return()=>clearTimeout(t); }
  },[skLoading]);
  React.useEffect(()=>{
    if(toastType){ const t=setTimeout(()=>setToastType(null),2200); return()=>clearTimeout(t); }
  },[toastType]);

  return (
    <div style={{ width:375,height:812,background:'var(--bg)',fontFamily:'var(--font)',display:'flex',flexDirection:'column',overflow:'hidden',position:'relative' }}>
      <SignatureCSS/>
      <StatusBar/>
      <div style={{ padding:'12px 20px 8px',borderBottom:'1px solid var(--grey100)' }}>
        <div style={{ fontSize:17,fontWeight:700,color:'var(--text-strong)' }}>마이크로 인터랙션</div>
        <div style={{ fontSize:12,color:'var(--text-muted)',fontWeight:500,marginTop:4 }}>탭 해보세요!</div>
      </div>
      <div style={{ flex:1,overflow:'auto',paddingBottom:20 }}>
        {/* PTR 힌트 */}
        <PullHint/>
        {/* HapticChip */}
        <div style={{ padding:'16px 20px' }}>
          <div style={{ fontSize:13,fontWeight:700,color:'var(--text-strong)',marginBottom:10 }}>HapticChip — 탭 스케일</div>
          <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
            {chips.map(c=>(
              <HapticChip key={c} active={activeChips.includes(c)} onClick={()=>setActiveChips(prev=>prev.includes(c)?prev.filter(x=>x!==c):[...prev,c])}>{c}</HapticChip>
            ))}
          </div>
        </div>
        <div style={{ height:1,background:'var(--grey100)',margin:'0 20px' }}/>
        {/* Skeleton */}
        <div style={{ padding:'16px 20px' }}>
          <div style={{ fontSize:13,fontWeight:700,color:'var(--text-strong)',marginBottom:10 }}>Skeleton Loading</div>
          <button className="tm-pressable tm-break-keep" onClick={()=>setSkLoading(true)} style={{ height:36,padding:'0 16px',borderRadius:999,background:'var(--blue500)',color:'var(--static-white)',fontSize:13,fontWeight:700,border:'none',cursor:'pointer',marginBottom:14 }}>로딩 시뮬레이션</button>
          {skLoading ? (
            <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
              {[1,2].map(i=>(
                <div key={i} style={{ padding:'14px 16px',borderRadius:14,border:'1px solid var(--border)' }}>
                  <div style={{ display:'flex',gap:12,marginBottom:12 }}>
                    <Skeleton w={48} h={48} r={12}/>
                    <div style={{ flex:1 }}>
                      <Skeleton h={14} w="70%" mb={8}/>
                      <Skeleton h={12} w="50%"/>
                    </div>
                  </div>
                  <Skeleton h={8} r={4}/>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
              {MATCHES.slice(0,2).map((m,i)=>(
                <div key={i} style={{ display:'flex',gap:12,padding:'14px 16px',borderRadius:14,border:'1px solid var(--border)',cursor:'pointer' }}>
                  <div style={{ width:48,height:48,borderRadius:12,background:`var(--grey100) url(${m.img}) center/cover`,flexShrink:0 }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14,fontWeight:700,color:'var(--text-strong)' }}>{m.title}</div>
                    <div style={{ fontSize:12,color:'var(--text-muted)',marginTop:4 }}>{m.venue}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ height:1,background:'var(--grey100)',margin:'0 20px' }}/>
        {/* Toast */}
        <div style={{ padding:'16px 20px' }}>
          <div style={{ fontSize:13,fontWeight:700,color:'var(--text-strong)',marginBottom:10 }}>Toast 알림</div>
          <div style={{ display:'flex',gap:8 }}>
            {['success','error','info'].map(t=>(
              <button className="tm-pressable tm-break-keep" key={t} onClick={()=>setToastType(t)} style={{ flex:1,height:36,borderRadius:999,background:t==='success'?'var(--green500)':t==='error'?'var(--red500)':'var(--grey900)',color:'var(--static-white)',fontSize:12,fontWeight:700,border:'none',cursor:'pointer' }}>
                {t==='success'?'성공':t==='error'?'오류':'정보'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ height:1,background:'var(--grey100)',margin:'0 20px' }}/>
        {/* NumberDisplay */}
        <div style={{ padding:'16px 20px' }}>
          <div style={{ fontSize:13,fontWeight:700,color:'var(--text-strong)',marginBottom:16 }}>NumberDisplay & MoneyRow</div>
          <div style={{ display:'flex',gap:24,marginBottom:20 }}>
            <NumberDisplay value={87} unit="경기" size={36} sub="이번 달 +3"/>
            <NumberDisplay value="4.9" unit="★" size={36} color="var(--orange500)" sub="상위 5%"/>
          </div>
          <div style={{ border:'1px solid var(--border)',borderRadius:14,padding:'0 16px' }}>
            <MoneyRow label="매치 참가비" amount={12000}/>
            <div style={{ height:1,background:'var(--grey100)' }}/>
            <MoneyRow label="시설 이용료" amount={5000}/>
            <div style={{ height:1,background:'var(--grey100)' }}/>
            <MoneyRow label="총 결제 금액" amount={17000} strong accent/>
          </div>
        </div>
        {/* StatBar */}
        <div style={{ padding:'0 20px 20px' }}>
          <div style={{ fontSize:13,fontWeight:700,color:'var(--text-strong)',marginBottom:14 }}>StatBar</div>
          <div style={{ display:'flex',flexDirection:'column',gap:14 }}>
            <StatBar label="출석률" value={18} total={22} color="var(--green500)" sub="평균 15회 대비 +3"/>
            <StatBar label="승률" value={68} total={100} color="var(--blue500)"/>
            <StatBar label="매너 점수" value={4.9} total={5} color="var(--orange500)"/>
          </div>
        </div>
      </div>
      {toastType && <Toast msg={toastType==='success'?'참가 신청 완료!':toastType==='error'?'오류가 발생했어요':'알림이 없어요'} type={toastType} visible/>}
    </div>
  );
};

/* ─────────────── Matches Map V2 ─────────────── */
const MatchesMapV2 = () => {
  const [selected, setSelected] = React.useState(0);
  const pins = [
    { x:80, y:120, sport:'⚽', count:3, m:MATCHES[0] },
    { x:200, y:180, sport:'🏀', count:1, m:MATCHES[1] },
    { x:140, y:260, sport:'🎾', count:2, m:MATCHES[2] },
    { x:260, y:100, sport:'🏸', count:1, m:MATCHES[3] },
    { x:60, y:300, sport:'⚽', count:4, m:MATCHES[0] },
  ];
  const sel = pins[selected];
  return (
    <div style={{ width:375,height:812,background:'var(--bg)',fontFamily:'var(--font)',display:'flex',flexDirection:'column',overflow:'hidden',position:'relative' }}>
      <StatusBar/>
      {/* 검색 오버레이 */}
      <div style={{ position:'absolute',top:44+8,left:20,right:20,zIndex:10,display:'flex',gap:8 }}>
        <div style={{ flex:1,height:42,borderRadius:12,background:'var(--static-white)',boxShadow:'0 2px 12px rgba(0,0,0,.12)',display:'flex',alignItems:'center',gap:10,padding:'0 14px' }}>
          <Icon name="search" size={18} color="var(--text-caption)"/>
          <div style={{ fontSize:14,color:'var(--text-placeholder)' }}>지역 검색</div>
        </div>
        <button className="tm-pressable tm-break-keep" style={{ width:42,height:42,borderRadius:12,background:'var(--static-white)',border:'none',boxShadow:'0 2px 12px rgba(0,0,0,.12)',display:'grid',placeItems:'center' }}>
          <Icon name="filter" size={20}/>
        </button>
      </div>
      {/* 지도 */}
      <div style={{ flex:1,background:'#e8f0e8',position:'relative',overflow:'hidden' }}>
        {/* 도로 */}
        <svg style={{ position:'absolute',inset:0 }} width="375" height="680">
          <line x1="0" y1="220" x2="375" y2="220" stroke="var(--static-white)" strokeWidth="12" opacity=".7"/>
          <line x1="0" y1="160" x2="375" y2="160" stroke="var(--static-white)" strokeWidth="8" opacity=".6"/>
          <line x1="160" y1="0" x2="160" y2="680" stroke="var(--static-white)" strokeWidth="12" opacity=".7"/>
          <line x1="240" y1="0" x2="240" y2="680" stroke="var(--static-white)" strokeWidth="8" opacity=".6"/>
          <rect x="80" y="100" width="60" height="80" rx="4" fill="#d4e8d4" opacity=".8"/>
          <rect x="200" y="240" width="80" height="60" rx="4" fill="#d4e8d4" opacity=".8"/>
        </svg>
        {/* 핀 */}
        {pins.map((p,i)=>(
          <button className="tm-pressable tm-break-keep" key={i} onClick={()=>setSelected(i)} style={{ position:'absolute',left:p.x,top:p.y,width:48,transform:'translate(-50%,-100%)',background:'transparent',border:'none',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:0,zIndex:i===selected?20:10,transition:'transform .15s' }}>
            <div style={{ width:40,height:40,borderRadius:14,background:i===selected?'var(--grey900)':'var(--static-white)',boxShadow:'0 2px 12px rgba(0,0,0,.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,border:i===selected?'2px solid var(--grey900)':'2px solid transparent',transform:i===selected?'scale(1.15)':'scale(1)' }}>
              {p.sport}
            </div>
            {p.count>1 && <div style={{ height:16,minWidth:16,borderRadius:8,background:'var(--red500)',color:'var(--static-white)',fontSize:10,fontWeight:800,display:'grid',placeItems:'center',padding:'0 4px',marginTop:2 }}>{p.count}</div>}
            <div style={{ width:0,height:0,borderLeft:'5px solid transparent',borderRight:'5px solid transparent',borderTop:`6px solid ${i===selected?'var(--grey900)':'var(--static-white)'}` }}/>
          </button>
        ))}
      </div>
      {/* 바텀 카드 */}
      <div style={{ padding:'16px 20px 28px',borderTop:'1px solid var(--border)',background:'var(--bg)' }}>
        <div style={{ display:'flex',gap:14,alignItems:'center' }}>
          <div style={{ width:56,height:56,borderRadius:14,background:`var(--grey100) url(${sel.m.img}) center/cover`,flexShrink:0 }}/>
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ fontSize:15,fontWeight:700,color:'var(--text-strong)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{sel.m.title}</div>
            <div style={{ fontSize:12,color:'var(--text-muted)',marginTop:3,fontWeight:500 }}>{sel.m.venue} · {sel.m.date}</div>
            <div style={{ display:'flex',alignItems:'center',gap:10,marginTop:6 }}>
              <span className="tab-num" style={{ fontSize:12,color:'var(--text-muted)',fontWeight:600 }}>{sel.m.cur}/{sel.m.max}명</span>
              <span className="tab-num" style={{ fontSize:13,fontWeight:700,color:'var(--blue500)' }}>{sel.m.fee===0?'무료':sel.m.fee.toLocaleString()+'원'}</span>
            </div>
          </div>
          <button className="tm-pressable tm-break-keep" style={{ height:40,padding:'0 18px',borderRadius:999,background:'var(--blue500)',color:'var(--static-white)',fontSize:13,fontWeight:700,border:'none',flexShrink:0 }}>참가</button>
        </div>
      </div>
    </div>
  );
};

const TeamBrowseV2 = () => {
  const [sport, setSport] = React.useState('all');
  const [sort, setSort] = React.useState('recommended');
  const teams = TEAMS.map((team, index) => ({
    ...team,
    region: ['마포구', '용산구', '강남구', '서초구'][index] || '서울',
    record: ['12승 4무 5패', '8승 3무 6패', '18승 2무 4패', '10승 7무 3패'][index] || '기록 없음',
    open: [true, true, false, true][index],
    next: ['토 09:00 팀매치', '수 20:00 풋살', '일 10:00 농구', '목 19:00 정기전'][index] || '일정 조율 중',
    fit: [92, 86, 78, 74][index] || 70,
    tags: [
      ['주말 활동', '신입 환영', '매너 우선'],
      ['평일 저녁', '풋살', '빠른 응답'],
      ['3on3', '경험자 선호', '경쟁형'],
      ['복식', '정기 모임', '초중급'],
    ][index] || ['팀'],
  }));
  const visibleTeams = teams.filter((team) => sport === 'all' || team.sport.includes(sport));
  const sortedTeams = [...visibleTeams].sort((a, b) => {
    if (sort === 'manner') return b.manner - a.manner;
    if (sort === 'member') return b.members - a.members;
    return b.fit - a.fit;
  });

  return (
    <div style={{ width: 375, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <StatusBar/>
      <div style={{ padding: '12px 20px 0', borderBottom: '1px solid var(--grey100)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 42, borderRadius: 12, background: 'var(--grey100)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px' }}>
            <Icon name="search" size={18} color="var(--text-caption)"/>
            <div style={{ fontSize: 14, color: 'var(--text-placeholder)' }}>팀 이름, 지역, 종목 검색</div>
          </div>
          <button className="tm-pressable tm-break-keep" style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--grey100)', border: 'none', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Icon name="filter" size={20}/>
          </button>
        </div>
        <div style={{ padding: '16px 0 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue500)', letterSpacing: 0 }}>TEAM DISCOVERY</div>
          <div style={{ fontSize: 24, lineHeight: '31px', fontWeight: 800, color: 'var(--text-strong)', marginTop: 4, letterSpacing: 0 }}>
            나와 맞는 팀을<br/>먼저 둘러보세요
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>
            <KPIStat label="모집 중" value={3} unit="팀"/>
            <KPIStat label="평균 매너" value="4.8"/>
            <KPIStat label="내 근처" value={12} unit="팀"/>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '10px 20px 8px', overflowX: 'auto' }}>
        {[
          ['all', '전체', teams.length],
          ['축구', '축구', 1],
          ['풋살', '풋살', 1],
          ['농구', '농구', 1],
          ['배드민턴', '배드민턴', 1],
        ].map(([id, label, count]) => (
          <HapticChip key={id} active={sport === id} onClick={() => setSport(id)} count={count}>{label}</HapticChip>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '0 20px 10px', overflowX: 'auto' }}>
        {[
          ['recommended', '추천순'],
          ['manner', '매너 높은순'],
          ['member', '멤버 많은순'],
        ].map(([id, label]) => (
          <button key={id} className="tm-pressable tm-break-keep" onClick={() => setSort(id)} style={{
            height: 32,
            padding: '0 12px',
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: sort === id ? 'var(--grey900)' : 'var(--bg)',
            color: sort === id ? 'var(--static-white)' : 'var(--text-muted)',
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
          }}>{label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 92px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sortedTeams.map((team) => (
          <div key={team.id} className="tm-card tm-card-interactive" style={{ padding: 16, borderRadius: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 58, height: 58, borderRadius: 18, background: team.color, color: 'var(--static-white)', display: 'grid', placeItems: 'center', fontSize: 26, fontWeight: 900, flexShrink: 0 }}>
                {team.logo}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team.name}</div>
                  <Badge tone={team.open ? 'blue' : 'grey'} size="sm">{team.open ? '모집중' : '마감'}</Badge>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontWeight: 600 }}>
                  {team.sport} · {team.region} · 멤버 {team.members}명
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
                  {team.tags.map((tag) => <Badge key={tag} tone="grey" size="sm">{tag}</Badge>)}
                </div>
              </div>
              <Icon name="chevR" size={18} color="var(--grey400)"/>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>
              <div style={{ padding: 10, borderRadius: 12, background: 'var(--grey50)' }}>
                <div className="tab-num" style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)' }}>{team.fit}%</div>
                <div style={{ fontSize: 10, color: 'var(--text-caption)', marginTop: 2 }}>추천 적합도</div>
              </div>
              <div style={{ padding: 10, borderRadius: 12, background: 'var(--grey50)' }}>
                <div className="tab-num" style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)' }}>{team.manner}</div>
                <div style={{ fontSize: 10, color: 'var(--text-caption)', marginTop: 2 }}>매너 점수</div>
              </div>
              <div style={{ padding: 10, borderRadius: 12, background: 'var(--grey50)' }}>
                <div className="tab-num" style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)' }}>{team.level}</div>
                <div style={{ fontSize: 10, color: 'var(--text-caption)', marginTop: 2 }}>팀 레벨</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--grey100)' }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{team.record}</div>
                <div style={{ fontSize: 11, color: 'var(--text-caption)', marginTop: 3 }}>{team.next}</div>
              </div>
              <button className="tm-pressable tm-break-keep" disabled={!team.open} style={{
                height: 36,
                padding: '0 16px',
                borderRadius: 999,
                border: 'none',
                background: team.open ? 'var(--blue500)' : 'var(--grey100)',
                color: team.open ? 'var(--static-white)' : 'var(--text-caption)',
                fontSize: 12,
                fontWeight: 800,
                opacity: team.open ? 1 : .7,
              }}>{team.open ? '팀 보기' : '마감'}</button>
            </div>
          </div>
        ))}
      </div>
      <BottomNav active="teams"/>
    </div>
  );
};

const TeamBrowseFlowBoard = () => (
  <div style={{ width: 840, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 36, color: 'var(--text-strong)', overflow: 'hidden' }}>
    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--blue500)' }}>05 FLOW</div>
    <div style={{ fontSize: 30, lineHeight: '38px', fontWeight: 800, marginTop: 8, letterSpacing: 0 }}>팀 전체 조회 흐름</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>02 홈 Toss canonical처럼 화면, 결정 정보, 다음 행동을 같은 보드 안에서 고정한다.</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginTop: 28 }}>
      {[
        ['1', '탐색', '검색과 종목 chip으로 팀 후보를 줄인다.'],
        ['2', '비교', '추천 적합도, 매너, 레벨, 활동 지역을 같은 위치에서 읽는다.'],
        ['3', '선택', '팀 카드를 눌러 팀 프로필로 진입한다.'],
        ['4', '검증', '멤버, 최근 경기, 모집 상태, 권한을 확인한다.'],
        ['5', '신청', '가입 신청 또는 팀매칭 요청으로 이어진다.'],
      ].map(([n, title, sub]) => (
        <div key={n} className="tm-card" style={{ padding: 16, minHeight: 190, borderRadius: 16 }}>
          <div style={{ width: 34, height: 34, borderRadius: 12, background: n === '1' ? 'var(--blue500)' : 'var(--grey100)', color: n === '1' ? 'var(--static-white)' : 'var(--text-strong)', display: 'grid', placeItems: 'center', fontWeight: 900 }}>{n}</div>
          <div style={{ fontSize: 16, fontWeight: 800, marginTop: 16 }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8 }}>{sub}</div>
        </div>
      ))}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 28 }}>
      <div className="tm-card" style={{ padding: 18, borderRadius: 16 }}>
        <SectionTitle title="필수 상태" sub="목록만 만들지 않고 상태까지 함께 둔다."/>
        {['모집 중 / 마감', '권한 없음', '검색 결과 없음', '팀 가입 신청 pending', '팀장 승인/거절'].map((item) => (
          <ListItem key={item} title={item} sub="사용자가 다음 행동을 판단할 수 있는 사유와 CTA를 함께 둔다."/>
        ))}
      </div>
      <div className="tm-card" style={{ padding: 18, borderRadius: 16 }}>
        <SectionTitle title="진입/이탈" sub="bottom nav teams와 detail shell의 연결."/>
        {[
          ['진입', '/teams 또는 bottom nav teams'],
          ['상세', '/teams/[id]'],
          ['후속', '가입 신청, 팀매칭 요청, 채팅'],
          ['관리', '내 팀, 팀장 도구'],
        ].map(([title, sub]) => <ListItem key={title} title={title} sub={sub}/>)}
      </div>
    </div>
  </div>
);

const TeamBrowseRulesBoard = () => (
  <div style={{ width: 840, height: 812, background: 'var(--grey50)', fontFamily: 'var(--font)', padding: 36, color: 'var(--text-strong)', overflow: 'hidden' }}>
    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--blue500)' }}>05 UI CONTRACT</div>
    <div style={{ fontSize: 30, lineHeight: '38px', fontWeight: 800, marginTop: 8, letterSpacing: 0 }}>팀 탐색 화면 규약</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 26 }}>
      {[
        ['Layout', '검색 → 종목 chip → 정렬 chip → 팀 카드 리스트. Hero showcase를 쓰지 않는다.'],
        ['Card', '팀 로고, 팀명, 모집 상태, 종목/지역/멤버, 태그, 추천 적합도, 매너, 레벨을 고정 위치에 둔다.'],
        ['Action', 'primary CTA는 팀 보기 1개. 마감이면 disabled와 사유를 보여준다.'],
        ['Trust', '매너/레벨/전적은 verified, estimated, sample을 구분할 수 있어야 한다.'],
        ['Color', 'blue는 active chip과 CTA에만 사용한다. 팀 색상은 로고 surface 안에만 제한한다.'],
        ['State', 'empty/loading/error/permission/pending/closed 상태를 case matrix에 연결한다.'],
      ].map(([title, sub]) => (
        <div key={title} className="tm-card" style={{ padding: 16, borderRadius: 16, minHeight: 162 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 8 }}>{sub}</div>
        </div>
      ))}
    </div>
    <div className="tm-card" style={{ marginTop: 20, padding: 18, borderRadius: 16, background: 'var(--bg)' }}>
      <SectionTitle title="02 홈 Toss canonical에서 가져온 원칙" sub="첫 화면은 장식보다 선택 가능한 후보와 다음 행동을 먼저 보여준다."/>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
        {[
          ['조용한 상단', '큰 배경 이미지 대신 검색과 요약 KPI'],
          ['칩 언어', 'active는 blue, inactive는 neutral'],
          ['숫자 문법', '멤버/매너/적합도는 tabular'],
          ['상태 명시', '마감/권한/대기 상태를 버튼만으로 숨기지 않음'],
        ].map(([title, sub]) => (
          <div key={title} style={{ padding: 14, borderRadius: 14, background: 'var(--grey50)' }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>{title}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 6 }}>{sub}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

Object.assign(window, {
  LessonAcademyHub, LessonsListV2, MarketplaceV2, ChatRoomV2,
  TeamMatchDetailV2, TeamDetailV2,
  TeamBrowseV2, TeamBrowseFlowBoard, TeamBrowseRulesBoard,
  MyActivityV2,
  MicroInteractionsDemo,
  MatchesMapV2,
});
