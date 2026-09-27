/* Diversified Home & Matches — less templated, bolder editorial layouts */

/* ═══════════════════ HOME — Variant D (Editorial magazine) ═══════════════════ */

const HomeEditorial = ({ onNav }) => {
  const featured = MATCHES[0];
  return (
    <Phone>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80, background: 'var(--static-white)' }}>
        {/* Huge editorial header */}
        <div style={{ padding: '56px 24px 8px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: 'var(--grey500)', marginBottom: 8 }}>TEAMEET · VOL.04</div>
          <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 0.95, color: 'var(--text-strong)', letterSpacing: 0 }}>
            오늘<br/>뛸까?
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 24, paddingBottom: 18, borderBottom: '2px solid var(--grey900)' }}>
            <div>
              <div className="tab-num" style={{ fontSize: 28, fontWeight: 800 }}>124</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: 1 }}>OPEN</div>
            </div>
            <div>
              <div className="tab-num" style={{ fontSize: 28, fontWeight: 800, color: 'var(--red500)' }}>12</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: 1 }}>URGENT</div>
            </div>
            <div style={{ flex: 1 }}/>
            <button className="tm-pressable tm-break-keep" style={{ width: 44, height: 44, borderRadius: 22, background: 'var(--grey900)', color: 'var(--static-white)', display: 'grid', placeItems: 'center' }}>
              <Icon name="search" size={20}/>
            </button>
          </div>
        </div>

        {/* Featured "cover story" */}
        <div style={{ padding: '20px 24px 24px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: 'var(--blue500)', marginBottom: 8 }}>COVER · 추천 매치</div>
          <div style={{ position: 'relative', borderRadius: 0, overflow: 'hidden', aspectRatio: '4/5', marginBottom: 14 }}>
            <div style={{ position: 'absolute', inset: 0, background: `var(--grey100) url(${featured.img}) center/cover` }}/>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 30%, rgba(0,0,0,.8))' }}/>
            <div style={{ position: 'absolute', top: 16, right: 16, background: 'var(--static-white)', padding: '6px 12px', fontSize: 10, fontWeight: 900, letterSpacing: 1 }}>MANNER 4.9 ★</div>
            <div style={{ position: 'absolute', bottom: 20, left: 20, right: 20, color: 'var(--static-white)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, opacity: .9, marginBottom: 8 }}>⚽ 축구 · {featured.date} {featured.time}</div>
              <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.15, letterSpacing: 0 }}>{featured.title}</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
            <span>{featured.venue}</span>
            <span className="tab-num">{featured.cur}/{featured.max} · {featured.fee.toLocaleString()}원 →</span>
          </div>
        </div>

        {/* Big asymmetric tiles */}
        <div style={{ padding: '8px 24px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gridTemplateRows: 'auto auto', gap: 6 }}>
            <div style={{ gridRow: '1 / 3', background: 'var(--grey900)', color: 'var(--static-white)', padding: 20, minHeight: 220, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, opacity: .6 }}>01</div>
                <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.1, marginTop: 10 }}>지금<br/>빠른<br/>매칭</div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, opacity: .7 }}>→ 3분 안에<br/>자리 찾기</div>
            </div>
            <div style={{ background: 'var(--blue500)', color: 'var(--static-white)', padding: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, opacity: .7 }}>02</div>
              <div style={{ fontSize: 16, fontWeight: 900, lineHeight: 1.1, marginTop: 6 }}>팀<br/>매칭</div>
            </div>
            <div style={{ background: 'var(--orange500)', color: 'var(--static-white)', padding: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, opacity: .7 }}>03</div>
              <div style={{ fontSize: 16, fontWeight: 900, lineHeight: 1.1, marginTop: 6 }}>용병<br/>구인</div>
            </div>
          </div>
        </div>

        {/* Ranked list — typographic */}
        <div style={{ padding: '0 0 24px' }}>
          <div style={{ padding: '0 24px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--grey200)' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: 'var(--grey500)' }}>POPULAR THIS WEEK</div>
              <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>이번 주 TOP 5</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>전체 →</span>
          </div>
          {MATCHES.slice(0, 5).map((m, i) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 24px', borderBottom: '1px solid var(--grey100)' }}>
              <div className="tab-num" style={{ fontSize: 32, fontWeight: 900, minWidth: 36, color: i === 0 ? 'var(--blue500)' : 'var(--grey300)', letterSpacing: 0 }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontWeight: 600 }}>{m.venue} · {m.date}</div>
              </div>
              <div style={{ width: 48, height: 48, background: `var(--grey100) url(${m.img}) center/cover`, flexShrink: 0 }}/>
            </div>
          ))}
        </div>

        <div style={{ padding: '20px 24px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: 'var(--grey400)' }}>END OF FEED</div>
        </div>
      </div>
      <TabBar active="home"/>
    </Phone>
  );
};

/* ═══════════════════ HOME — Variant E (Dark, stats-forward) ═══════════════════ */

const HomeDark = ({ onNav }) => (
  <Phone>
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80, background: '#0b0e14', color: 'var(--static-white)' }}>
      <div style={{ padding: '54px 20px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 36, height: 36, borderRadius: 18, background: `url(${IMG.av1}) center/cover`, border: '2px solid #2a3140' }}/>
          <div style={{ marginLeft: 12, flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--grey500)', fontWeight: 600 }}>GM, 정민</div>
            <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2 }}>다음 매치 D-1</div>
          </div>
          <button className="tm-pressable tm-break-keep" style={{ width: 40, height: 40, borderRadius: 20, background: '#1a1f2b', display: 'grid', placeItems: 'center', position: 'relative' }}>
            <Icon name="bell" size={18} color="var(--static-white)"/>
            <div style={{ position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: 4, background: 'var(--blue500)' }}/>
          </button>
        </div>
      </div>

      {/* Next match countdown card */}
      <div style={{ padding: '0 20px 16px' }}>
        <div style={{ padding: 20, background: 'linear-gradient(135deg, var(--blue500) 0%, #1a42a8 100%)', borderRadius: 20, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, background: 'rgba(255,255,255,.08)' }}/>
          <div style={{ position: 'absolute', top: 60, right: -80, width: 200, height: 200, borderRadius: 100, background: 'rgba(255,255,255,.06)' }}/>
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 11, fontWeight: 700, opacity: .8, letterSpacing: 1 }}>NEXT MATCH</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 8, lineHeight: 1.3 }}>주말 축구 한 판</div>
            <div style={{ fontSize: 12, opacity: .85, marginTop: 4 }}>상암 월드컵 보조구장</div>

            <div style={{ display: 'flex', gap: 6, marginTop: 22 }}>
              {[['22', 'H'], ['13', 'M'], ['44', 'S']].map(([v, u]) => (
                <div key={u} style={{ flex: 1, padding: '10px 6px', background: 'rgba(0,0,0,.25)', borderRadius: 10, textAlign: 'center' }}>
                  <div className="tab-num" style={{ fontSize: 22, fontWeight: 900, letterSpacing: 0 }}>{v}</div>
                  <div style={{ fontSize: 10, opacity: .8, fontWeight: 700 }}>{u}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Metric strip */}
      <div style={{ padding: '0 20px 20px' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { k: 'WIN', v: '12', s: '73%', c: 'var(--blue500)' },
            { k: 'MNR', v: '4.8', s: '↑0.2', c: '#10b981' },
            { k: 'MVP', v: '3', s: '이번달', c: 'var(--orange500)' },
          ].map(x => (
            <div key={x.k} style={{ flex: 1, padding: 14, background: '#1a1f2b', borderRadius: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: x.c }}>{x.k}</div>
              <div className="tab-num" style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>{x.v}</div>
              <div style={{ fontSize: 10, color: 'var(--grey500)', fontWeight: 600, marginTop: 2 }}>{x.s}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sport quick filter — pill row */}
      <div style={{ padding: '0 20px 16px', overflow: 'auto' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['전체', '⚽ 축구', '🏀 농구', '🎾 테니스', '🏸 배민', '🏒 하키', '🏐 발리'].map((s, i) => (
            <button key={s} className="tm-chip" style={{
              background: i === 0 ? 'var(--static-white)' : '#1a1f2b',
              color: i === 0 ? '#0b0e14' : 'var(--static-white)',
            }}>{s}</button>
          ))}
        </div>
      </div>

      {/* Live feed — dark cards */}
      <div style={{ padding: '0 20px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--red500)', marginRight: 8, animation: 'pulse 2s infinite' }}/>
          <span style={{ fontSize: 13, fontWeight: 800 }}>실시간 모집중</span>
          <div style={{ flex: 1 }}/>
          <span style={{ fontSize: 11, color: 'var(--grey500)' }}>3분 전 업데이트</span>
        </div>
        {MATCHES.slice(0, 3).map(m => (
          <div key={m.id} style={{ display: 'flex', gap: 12, padding: 14, background: '#151a23', borderRadius: 14, marginBottom: 8, border: '1px solid #2a3140' }}>
            <div style={{ width: 54, height: 54, borderRadius: 10, background: `url(${m.img}) center/cover`, flexShrink: 0 }}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', background: 'rgba(49,130,246,.2)', color: '#6ba4ff', borderRadius: 4 }}>LV.{m.level}</span>
                <span className="tab-num" style={{ fontSize: 10, color: 'var(--red500)', fontWeight: 700 }}>D-1 · {m.time}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
              <div style={{ fontSize: 11, color: 'var(--grey500)', marginTop: 2 }}>{m.venue}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div className="tab-num" style={{ fontSize: 11, fontWeight: 800 }}>{m.cur}/{m.max}</div>
              <div style={{ width: 40, height: 4, background: '#2a3140', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(m.cur/m.max)*100}%`, background: 'var(--blue500)' }}/>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
    <TabBar active="home" dark/>
  </Phone>
);

/* ═══════════════════ HOME — Variant F (Story-cards / Instagram-like) ═══════════════════ */

const HomeStories = ({ onNav }) => (
  <Phone>
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80, background: 'var(--grey50)' }}>
      <div style={{ padding: '52px 20px 12px', display: 'flex', alignItems: 'center', background: 'var(--bg)' }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--blue500)', letterSpacing: 0 }}>Teameet</div>
        <div style={{ flex: 1 }}/>
        <Icon name="heart" size={22} color="var(--grey800)"/>
        <div style={{ width: 18 }}/>
        <Icon name="bell" size={22} color="var(--grey800)"/>
      </div>

      {/* Stories ring — 주변 친구들 매치 */}
      <div style={{ padding: '12px 0 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', overflow: 'auto' }}>
        <div style={{ display: 'flex', gap: 14, padding: '0 16px' }}>
          {[
            { lbl: '내 매치', me: true, img: IMG.av1 },
            { lbl: '지훈님', img: IMG.av2, live: true },
            { lbl: '현우님', img: IMG.av3, live: true },
            { lbl: '은서님', img: IMG.av4 },
            { lbl: '민정님', img: IMG.av5 },
            { lbl: '지훈코치', img: IMG.av6 },
            { lbl: '축구단', img: IMG.av7 },
          ].map((s, i) => (
            <div key={i} style={{ minWidth: 68, textAlign: 'center' }}>
              <div style={{
                width: 64, height: 64, borderRadius: 32, padding: 2,
                background: s.live ? 'conic-gradient(from 0deg, var(--red500), var(--orange500), var(--blue500), var(--red500))' : s.me ? 'var(--grey200)' : 'var(--grey300)',
                margin: '0 auto',
                position: 'relative',
              }}>
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: `var(--static-white) url(${s.img}) center/cover`, backgroundOrigin: 'content-box', padding: 2 }}/>
                {s.me && (
                  <div style={{ position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, background: 'var(--blue500)', color: 'var(--static-white)', display: 'grid', placeItems: 'center', border: '2px solid var(--static-white)' }}>
                    <Icon name="plus" size={14} stroke={2.8}/>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, marginTop: 6, color: 'var(--text-strong)' }}>{s.lbl}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Feed — full-bleed with comments */}
      {MATCHES.slice(0, 3).map((m, i) => (
        <div key={m.id} style={{ background: 'var(--bg)', marginTop: i === 0 ? 8 : 6, padding: '12px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px 10px' }}>
            <div style={{ width: 36, height: 36, borderRadius: 18, background: `url(${[IMG.av2, IMG.av3, IMG.av4][i]}) center/cover` }}/>
            <div style={{ marginLeft: 10, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{m.host}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{m.venue} · 2시간 전</div>
            </div>
            <Icon name="menu" size={18} color="var(--grey700)"/>
          </div>
          <div style={{ position: 'relative', width: '100%', aspectRatio: '1/1', background: `var(--grey100) url(${m.img}) center/cover` }}>
            <div style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(0,0,0,.65)', color: 'var(--static-white)', padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--red500)' }}/> 모집중 {m.cur}/{m.max}
            </div>
            <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14, color: 'var(--static-white)', textShadow: '0 2px 8px rgba(0,0,0,.5)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: .9 }}>{m.date} · {m.time}</div>
              <div style={{ fontSize: 19, fontWeight: 800, marginTop: 4, lineHeight: 1.3 }}>{m.title}</div>
            </div>
          </div>
          <div style={{ padding: '10px 14px 2px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <Icon name="heart" size={24} color="var(--grey800)"/>
            <Icon name="chat" size={24} color="var(--grey800)"/>
            <Icon name="share" size={22} color="var(--grey800)"/>
            <div style={{ flex: 1 }}/>
            <div className="tab-num" style={{ fontSize: 14, fontWeight: 800, color: 'var(--blue500)' }}>{m.fee.toLocaleString()}원</div>
          </div>
          <div style={{ padding: '6px 16px 4px', fontSize: 12 }}>
            <b>{m.cur}명</b>이 참가중 · <span style={{ color: 'var(--text-muted)' }}>{12 + i*7}명이 관심 있어해요</span>
          </div>
          <div style={{ padding: '4px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
            <b style={{ color: 'var(--text-strong)' }}>은서님</b> 저도 참가할게요! · 댓글 {3+i}개 모두 보기
          </div>
          <SBtn full size="md" variant="dark" style={{ margin: '10px 16px 6px', width: 'calc(100% - 32px)' }}>참가 신청하기</SBtn>
        </div>
      ))}
    </div>
    <TabBar active="home"/>
  </Phone>
);

/* ═══════════════════ MATCHES LIST — Variant B: Map-first ═══════════════════ */

const MatchesMap = ({ onNav }) => {
  const [sel, setSel] = React.useState(0);
  const pins = [
    { x: 28, y: 34, m: MATCHES[0], urgent: true },
    { x: 62, y: 28, m: MATCHES[1] },
    { x: 44, y: 52, m: MATCHES[2], urgent: true },
    { x: 74, y: 66, m: MATCHES[3] },
    { x: 22, y: 72, m: MATCHES[4] },
  ];
  const active = pins[sel];
  return (
    <Phone>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, padding: '48px 16px 12px', display: 'flex', gap: 8 }}>
        <button onClick={() => onNav?.('matches')} className="tm-btn tm-btn-outline tm-btn-icon" style={{ boxShadow: 'var(--sh-2)' }}>
          <Icon name="chevL" size={20} color="var(--grey800)"/>
        </button>
        <div style={{ flex: 1, height: 40, background: 'var(--static-white)', boxShadow: 'var(--sh-2)', borderRadius: 20, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8 }}>
          <Icon name="search" size={18} color="var(--grey600)"/>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', flex: 1 }}>주변 매치 검색</span>
          <Badge tone="blue" size="sm">5km</Badge>
        </div>
      </div>

      {/* Map — stylized */}
      <div style={{ flex: 1, position: 'relative', background: 'linear-gradient(135deg, var(--blue50) 0%, #d4e4f6 50%, #c1d7ed 100%)', overflow: 'hidden' }}>
        {/* fake roads */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <path d="M 0 200 Q 200 150 400 300" stroke="var(--static-white)" strokeWidth="18" fill="none" opacity=".7"/>
          <path d="M 0 200 Q 200 150 400 300" stroke="#d4e4f6" strokeWidth="14" fill="none"/>
          <path d="M 100 0 Q 150 300 250 600" stroke="var(--static-white)" strokeWidth="14" fill="none" opacity=".6"/>
          <path d="M 100 0 Q 150 300 250 600" stroke="#d4e4f6" strokeWidth="10" fill="none"/>
          <path d="M 50 500 L 350 450" stroke="var(--static-white)" strokeWidth="10" fill="none" opacity=".5"/>
          {/* water */}
          <path d="M 0 380 Q 100 420 200 400 Q 300 380 400 420 L 400 460 L 0 460 Z" fill="#b4d1ec" opacity=".7"/>
          {/* park */}
          <rect x="60" y="100" width="100" height="80" fill="#b7dfc0" opacity=".6" rx="8"/>
          <rect x="220" y="460" width="120" height="90" fill="#b7dfc0" opacity=".6" rx="8"/>
        </svg>

        {/* pins */}
        {pins.map((p, i) => {
          const active = sel === i;
          return (
            <button className="tm-pressable tm-break-keep" key={i} onClick={() => setSel(i)} style={{
              position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -100%)',
              zIndex: active ? 20 : 10,
            }}>
              <div style={{
                padding: '6px 10px', borderRadius: 16,
                background: p.urgent ? 'var(--red500)' : active ? 'var(--grey900)' : 'var(--static-white)',
                color: p.urgent || active ? 'var(--static-white)' : 'var(--text-strong)',
                fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap',
                boxShadow: active ? '0 6px 20px rgba(0,0,0,.25)' : 'var(--sh-2)',
                border: '2px solid var(--static-white)',
                transform: active ? 'scale(1.1)' : 'scale(1)',
                transition: 'transform .2s',
              }}>
                {p.m.fee === 0 ? '무료' : `${(p.m.fee/1000).toFixed(0)}k`}
              </div>
              <div style={{ width: 0, height: 0, margin: '-1px auto 0', borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `6px solid ${p.urgent ? 'var(--red500)' : active ? 'var(--grey900)' : 'var(--static-white)'}` }}/>
            </button>
          );
        })}

        {/* compass */}
        <div style={{ position: 'absolute', top: 100, right: 14, width: 40, height: 40, borderRadius: 20, background: 'var(--static-white)', boxShadow: 'var(--sh-2)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, color: 'var(--red500)' }}>N</div>

        {/* filter chips */}
        <div style={{ position: 'absolute', top: 100, left: 16, right: 64, overflow: 'auto' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {['오늘', '무료', '초급OK', '11:11', '야간'].map((c, i) => (
              <button key={c} className={i === 0 ? 'tm-chip tm-chip-active' : 'tm-chip'} style={{ boxShadow: 'var(--sh-1)' }}>{c}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom sheet — sticky card */}
      <div style={{ position: 'absolute', bottom: 64, left: 12, right: 12, padding: 12, background: 'var(--static-white)', borderRadius: 18, boxShadow: '0 10px 30px rgba(0,0,0,.15)', zIndex: 30 }}>
        <div style={{ width: 32, height: 4, background: 'var(--grey200)', borderRadius: 2, margin: '0 auto 10px' }}/>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ width: 76, height: 76, borderRadius: 12, background: `url(${active.m.img}) center/cover`, flexShrink: 0 }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <Badge tone="blue" size="sm">{SPORTS.find(s => s.id === active.m.sport)?.label}</Badge>
              {active.urgent && <Badge tone="red" size="sm">마감임박</Badge>}
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active.m.title}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>📍 {active.m.venue} · 1.2km</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <span className="tab-num" style={{ fontSize: 12, fontWeight: 700 }}>{active.m.cur}/{active.m.max}명</span>
              <span className="tab-num" style={{ fontSize: 15, fontWeight: 800, color: 'var(--blue500)' }}>{active.m.fee.toLocaleString()}원</span>
            </div>
          </div>
        </div>
      </div>
      <TabBar active="match"/>
    </Phone>
  );
};

/* ═══════════════════ MATCHES LIST — Variant C: Timeline (time-bucketed) ═══════════════════ */

const MatchesTimeline = ({ onNav }) => {
  const buckets = [
    { day: '오늘', date: '5/3 (토)', weather: '☀️ 22°', hot: true },
    { day: '내일', date: '5/4 (일)', weather: '⛅ 19°' },
    { day: '월요일', date: '5/5', weather: '🌧 15°' },
    { day: '화요일', date: '5/6', weather: '☀️ 20°' },
  ];
  const groups = [
    { hour: '오전', slots: [{ t: '09:00', m: MATCHES[1] }, { t: '11:00', m: MATCHES[2] }] },
    { hour: '오후', slots: [{ t: '14:00', m: MATCHES[0], urgent: true }, { t: '16:00', m: MATCHES[3] }] },
    { hour: '저녁', slots: [{ t: '19:00', m: MATCHES[4] }, { t: '20:30', m: MATCHES[5] || MATCHES[0], urgent: true }] },
  ];
  return (
    <Phone>
      <AppBar title="매치 타임라인" trailing={[
        <button className="tm-pressable tm-break-keep" key="v" style={{ padding: 8 }}><Icon name="menu" size={22} color="var(--grey800)"/></button>,
      ]}/>

      {/* Day selector */}
      <div style={{ padding: '4px 16px 16px', overflow: 'auto' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {buckets.map((b, i) => (
            <button className="tm-pressable tm-break-keep" key={i} style={{
              minWidth: 90, padding: '12px 10px', borderRadius: 14, textAlign: 'left', flexShrink: 0,
              background: i === 0 ? 'var(--grey900)' : 'var(--bg)',
              color: i === 0 ? 'var(--static-white)' : 'var(--text-strong)',
              border: i === 0 ? 'none' : '1px solid var(--border)',
              position: 'relative',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: i === 0 ? .9 : .7 }}>{b.day}</div>
              <div className="tab-num" style={{ fontSize: 14, fontWeight: 800, marginTop: 2 }}>{b.date}</div>
              <div style={{ fontSize: 11, marginTop: 6, opacity: i === 0 ? .9 : .6 }}>{b.weather}</div>
              {b.hot && <div style={{ position: 'absolute', top: 8, right: 8, padding: '2px 6px', borderRadius: 4, background: 'var(--red500)', color: 'var(--static-white)', fontSize: 9, fontWeight: 800 }}>HOT</div>}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 0 100px' }}>
        {groups.map(g => (
          <div key={g.hour}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '18px 20px 12px', gap: 10, position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 5 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: 'var(--grey500)' }}>— {g.hour.toUpperCase()}</div>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }}/>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{g.slots.length}건</span>
            </div>
            {g.slots.map((s, i) => (
              <div key={i} style={{ display: 'flex', padding: '0 20px 18px' }}>
                {/* Time rail */}
                <div style={{ width: 56, flexShrink: 0, position: 'relative' }}>
                  <div className="tab-num" style={{ fontSize: 15, fontWeight: 800, color: s.urgent ? 'var(--red500)' : 'var(--text-strong)' }}>{s.t}</div>
                  <div style={{ width: 10, height: 10, borderRadius: 5, background: s.urgent ? 'var(--red500)' : 'var(--blue500)', border: '2px solid var(--bg)', boxShadow: `0 0 0 2px ${s.urgent ? 'var(--red500)' : 'var(--blue500)'}`, marginTop: 8 }}/>
                  <div style={{ position: 'absolute', left: 4, top: 34, bottom: -24, width: 2, background: 'var(--grey200)' }}/>
                </div>
                <div style={{ flex: 1, padding: 14, background: s.urgent ? 'var(--red50)' : 'var(--grey50)', borderRadius: 14, border: s.urgent ? '1px solid var(--red100)' : '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <Badge tone="blue" size="sm">{SPORTS.find(x => x.id === s.m.sport)?.label}</Badge>
                    {s.urgent && <Badge tone="red" size="sm">1자리 남음</Badge>}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{s.m.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>📍 {s.m.venue}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                    <div style={{ display: 'flex' }}>
                      {[IMG.av1, IMG.av2, IMG.av3, IMG.av4].map((a, j) => (
                        <div key={j} style={{ width: 22, height: 22, borderRadius: 11, background: `url(${a}) center/cover`, border: '2px solid var(--bg)', marginLeft: j === 0 ? 0 : -6 }}/>
                      ))}
                      <span className="tab-num" style={{ fontSize: 11, fontWeight: 700, marginLeft: 8, alignSelf: 'center' }}>{s.m.cur}/{s.m.max}</span>
                    </div>
                    <SBtn size="sm" variant="dark">참가</SBtn>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <TabBar active="match"/>
    </Phone>
  );
};

/* ═══════════════════ MATCHES LIST — Variant D: Swipe cards (Tinder-style) ═══════════════════ */

const MatchesSwipe = ({ onNav }) => {
  const m = MATCHES[0];
  const m2 = MATCHES[1];
  return (
    <Phone>
      <div style={{ padding: '48px 20px 12px', display: 'flex', alignItems: 'center' }}>
        <button className="tm-pressable tm-break-keep" onClick={() => onNav?.('matches')} style={{ padding: 8 }}><Icon name="chevL" size={22} color="var(--grey800)"/></button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 800 }}>스와이프 매칭</div>
        <button className="tm-pressable tm-break-keep" style={{ padding: 8 }}><Icon name="filter" size={22} color="var(--grey800)"/></button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 20 }}>← 패스 · 참가 → · 위로 스와이프 시 찜</div>

      <div style={{ flex: 1, position: 'relative', padding: '0 20px' }}>
        {/* back card */}
        <div style={{ position: 'absolute', top: 10, left: 30, right: 30, bottom: 40, background: `var(--grey100) url(${m2.img}) center/cover`, borderRadius: 24, transform: 'scale(.95) rotate(-2deg)', opacity: .6 }}/>
        {/* front card */}
        <div style={{ position: 'absolute', top: 0, left: 20, right: 20, bottom: 30, borderRadius: 24, overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,.15)', transform: 'rotate(3deg)' }}>
          <div style={{ position: 'absolute', inset: 0, background: `var(--grey100) url(${m.img}) center/cover` }}/>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,.9))' }}/>

          {/* stamp */}
          <div style={{ position: 'absolute', top: 30, right: 20, padding: '8px 16px', border: '4px solid var(--blue500)', color: 'var(--blue500)', fontSize: 20, fontWeight: 900, letterSpacing: 2, transform: 'rotate(12deg)', background: 'rgba(255,255,255,.9)', borderRadius: 8 }}>
            참가!
          </div>

          {/* meta chips top-left */}
          <div style={{ position: 'absolute', top: 20, left: 20, display: 'flex', gap: 6 }}>
            <Badge tone="dark">Lv {m.level}</Badge>
            <Badge tone="red">마감 2시간전</Badge>
          </div>

          {/* Bottom content */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '28px 22px 24px', color: 'var(--static-white)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, opacity: .85, letterSpacing: 1 }}>{m.date} · {m.time}</div>
            <div style={{ fontSize: 24, fontWeight: 900, marginTop: 6, lineHeight: 1.2 }}>{m.title}</div>
            <div style={{ fontSize: 13, marginTop: 6, opacity: .9 }}>📍 {m.venue} · 1.2km</div>

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              {['11:11', '초급OK', '주차가능', '샤워실'].map(t => (
                <span key={t} style={{ padding: '4px 10px', background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', borderRadius: 999, fontSize: 10, fontWeight: 700 }}>#{t}</span>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex' }}>
                  {[IMG.av1, IMG.av2, IMG.av3].map((a, i) => (
                    <div key={i} style={{ width: 24, height: 24, borderRadius: 12, background: `url(${a}) center/cover`, border: '2px solid var(--static-black)', marginLeft: i === 0 ? 0 : -8 }}/>
                  ))}
                </div>
                <span className="tab-num" style={{ fontSize: 12, fontWeight: 700 }}>{m.cur}/{m.max}명 참가중</span>
              </div>
              <span className="tab-num" style={{ fontSize: 18, fontWeight: 800 }}>{m.fee.toLocaleString()}원</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ padding: '12px 40px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="tm-pressable tm-break-keep" style={{ width: 52, height: 52, borderRadius: 26, background: 'var(--static-white)', border: '2px solid var(--red500)', color: 'var(--red500)', fontSize: 22, boxShadow: 'var(--sh-1)' }}>✕</button>
        <button className="tm-pressable tm-break-keep" style={{ width: 44, height: 44, borderRadius: 22, background: 'var(--static-white)', border: '2px solid var(--orange500)', color: 'var(--orange500)', fontSize: 18, boxShadow: 'var(--sh-1)' }}>♡</button>
        <button className="tm-pressable tm-break-keep" style={{ width: 44, height: 44, borderRadius: 22, background: 'var(--static-white)', border: '2px solid var(--blue500)', color: 'var(--blue500)', fontSize: 16, boxShadow: 'var(--sh-1)' }}>📅</button>
        <button className="tm-pressable tm-break-keep" style={{ width: 52, height: 52, borderRadius: 26, background: 'var(--blue500)', color: 'var(--static-white)', fontSize: 22, boxShadow: '0 8px 20px rgba(49,130,246,.4)' }}>✓</button>
      </div>
      <TabBar active="match"/>
    </Phone>
  );
};

/* ═══════════════════ MATCHES LIST — Variant E: Dense feed ═══════════════════ */

const MatchesDense = ({ onNav }) => {
  const list = MATCHES;
  return (
    <Phone>
      <AppBar title="매치 피드" trailing={[
        <button key="s" className="tm-btn tm-btn-ghost tm-btn-icon"><Icon name="search" size={22} color="var(--grey800)"/></button>,
      ]}/>
      <div style={{ padding: '0 16px 10px', display: 'flex', gap: 6, overflow: 'auto' }}>
        {['전체', '마감임박', '무료', '오늘', '내일', '주말', '근처'].map((c, i) => (
          <HapticChip key={c} active={i === 0}>{c}</HapticChip>
        ))}
      </div>

      {/* Summary bar */}
      <div style={{ padding: '8px 16px', background: 'var(--blue50)', display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
        <span style={{ color: 'var(--blue500)', fontWeight: 800 }}>🔥 지금 124개</span>
        <span style={{ color: 'var(--text-muted)' }}>·</span>
        <span style={{ color: 'var(--text-muted)' }}>오늘만 <b className="tab-num">32</b>개 모집중</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
        {list.map((m, i) => {
          const fillPct = (m.cur / m.max) * 100;
          const urgent = fillPct >= 70;
          return (
            <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '56px 1fr auto', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div className="tab-num" style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)', letterSpacing: 1 }}>{['SAT','SUN','MON','TUE','WED','THU','FRI'][i%7]}</div>
                <div className="tab-num" style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-strong)', lineHeight: 1, marginTop: 2 }}>{3+i}</div>
                <div className="tab-num" style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue500)', marginTop: 4 }}>{m.time}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--grey700)' }}>{SPORTS.find(s => s.id === m.sport)?.label}</span>
                  <span style={{ fontSize: 10, color: 'var(--grey400)' }}>·</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue500)' }}>Lv {m.level}</span>
                  {urgent && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--static-white)', background: 'var(--red500)', padding: '1px 5px', borderRadius: 3, marginLeft: 4 }}>HOT</span>}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>{m.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{m.venue}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <div style={{ flex: 1, height: 3, background: 'var(--grey100)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${fillPct}%`, background: urgent ? 'var(--red500)' : 'var(--blue500)' }}/>
                  </div>
                  <span className="tab-num" style={{ fontSize: 10, fontWeight: 700, color: urgent ? 'var(--red500)' : 'var(--text-muted)' }}>{m.cur}/{m.max}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="tab-num" style={{ fontSize: 14, fontWeight: 800 }}>{m.fee === 0 ? '무료' : `${(m.fee/1000).toFixed(0)}k`}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>1.{i+2}km</div>
              </div>
            </div>
          );
        })}
      </div>
      <TabBar active="match"/>
    </Phone>
  );
};

Object.assign(window, { HomeEditorial, HomeDark, HomeStories, MatchesMap, MatchesTimeline, MatchesSwipe, MatchesDense });
