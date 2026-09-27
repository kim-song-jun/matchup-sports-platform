/* Teameet page-readiness boards — wave21a.
   Scope: 09 Tournaments and 10 Rental only. */

const Wave21AToneColor = (tone) => (
  tone === 'red' ? 'var(--red500)' :
  tone === 'orange' ? 'var(--orange500)' :
  tone === 'green' ? 'var(--green500)' :
  tone === 'blue' ? 'var(--blue500)' :
  'var(--grey600)'
);

const Wave21AToneBg = (tone) => (
  tone === 'red' ? 'var(--red50)' :
  tone === 'orange' ? 'var(--orange50)' :
  tone === 'green' ? 'var(--green50)' :
  tone === 'blue' ? 'var(--blue50)' :
  'var(--grey100)'
);

const Wave21AIconForTone = (tone, fallback = 'clock') => (
  tone === 'red' ? 'close' :
  tone === 'green' ? 'check' :
  tone === 'blue' ? fallback :
  'clock'
);

const Wave21AStickyCTA = ({ title, sub, disabled, danger }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 20px 24px', background: 'rgba(255,255,255,.96)', borderTop: '1px solid var(--border)' }}>
    <button className="tm-pressable tm-break-keep" disabled={disabled} style={{ width: '100%', minHeight: 52, borderRadius: 14, background: disabled ? 'var(--grey200)' : danger ? 'var(--red500)' : 'var(--blue500)', color: disabled ? 'var(--grey500)' : 'var(--static-white)', fontSize: 15, fontWeight: 700 }}>
      {title}
    </button>
    {sub && <div style={{ marginTop: 8, fontSize: 11, lineHeight: 1.35, color: 'var(--text-muted)', textAlign: 'center' }}>{sub}</div>}
  </div>
);

const Wave21AInfoRow = ({ title, sub, status, tone = 'grey', icon = 'clock' }) => (
  <Card pad={14}>
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ width: 38, height: 38, borderRadius: 13, background: Wave21AToneBg(tone), color: Wave21AToneColor(tone), display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={18}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <div style={{ minWidth: 0, fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          {status && <Badge tone={tone} size="sm">{status}</Badge>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{sub}</div>
      </div>
    </div>
  </Card>
);

const Wave21AMotionCard = ({ index, trigger, feedback, result, guard }) => (
  <Card pad={16} style={{ minHeight: 122, background: index % 2 ? 'var(--bg)' : 'var(--grey50)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div className="tab-num" style={{ width: 32, height: 32, borderRadius: 12, background: index === 0 ? 'var(--blue500)' : 'var(--grey100)', color: index === 0 ? 'var(--static-white)' : 'var(--text-muted)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{index + 1}</div>
      <div style={{ minWidth: 0, fontSize: 15, fontWeight: 700 }}>{trigger}</div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
      {[feedback, result, guard].map((txt, j) => (
        <div key={txt} style={{ padding: 10, borderRadius: 10, background: j === 0 ? 'var(--blue50)' : 'var(--bg)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text)', lineHeight: 1.35 }}>{txt}</div>
      ))}
    </div>
  </Card>
);

const Wave21AProgress = ({ step, total = 4 }) => (
  <div style={{ display: 'flex', gap: 6 }}>
    {Array.from({ length: total }).map((_, i) => (
      <div key={i} style={{ flex: 1, height: 5, borderRadius: 999, background: i < step ? 'var(--blue500)' : 'var(--grey150)' }}/>
    ))}
  </div>
);

const TournamentsStateCases = [
  { id: 'deadline', chip: '마감임박', label: '접수 마감임박', tone: 'orange', title: '오늘 23:59까지 참가 가능', sub: '팀원 수, 참가비, 계좌 정보가 모두 충족되어야 제출할 수 있습니다.', cta: '참가 신청 계속', meta: 'D-0' },
  { id: 'soldout', chip: '정원마감', label: '정원 마감', tone: 'red', title: '32팀 모집이 마감됐어요', sub: '대기팀 등록은 가능하지만 참가비 결제는 확정 전까지 막습니다.', cta: '대기팀 등록', meta: '32/32' },
  { id: 'pending', chip: '승인대기', label: '운영 승인 대기', tone: 'orange', title: '운영자가 참가 자격을 확인 중', sub: '결제 완료 후에도 대진표 배정 전까지 pending 상태를 유지합니다.', cta: '신청 내역 보기', meta: 'D+1' },
  { id: 'bracket', chip: '대진충돌', label: '대진 충돌', tone: 'red', title: '같은 팀이 두 경기 슬롯에 배정됨', sub: '운영자는 자동 재배정 전 충돌 라운드와 영향 범위를 확인해야 합니다.', cta: '충돌 해결', meta: '2건' },
  { id: 'dispute', chip: '결과이의', label: '결과 이의 제기', tone: 'red', title: '스코어 확정이 보류됐어요', sub: '순위표 반영을 잠그고 심판/양 팀 증빙을 한 화면에서 수집합니다.', cta: '증빙 확인', meta: '보류' },
  { id: 'account', chip: '계좌누락', label: '정산 계좌 누락', tone: 'orange', title: '상금 수령 계좌가 필요해요', sub: '우승팀 대표 계좌가 없으면 상금 지급과 영수증 발행 CTA를 분리합니다.', cta: '계좌 등록', meta: '미등록' },
  { id: 'weather', chip: '일정변경', label: '일정 일괄 변경', tone: 'orange', title: '우천으로 모든 경기 시간이 변경됨', sub: '참가팀 공지, 대진표 시간, 환불 가능 여부를 동시에 갱신합니다.', cta: '변경 공지 보기', meta: '우천' },
  { id: 'success', chip: '참가확정', label: '참가 확정', tone: 'green', title: '대진표와 공지가 열렸어요', sub: '팀 채팅, 경기 일정, 규정 확인을 다음 액션으로 제공합니다.', cta: '대진표 보기', meta: '확정' },
];

const TournamentsStateCard = ({ state }) => (
  <Card pad={18} style={{ marginTop: 14 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ minWidth: 0 }}>
        <Badge tone={state.tone} size="sm">{state.label}</Badge>
        <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.28, marginTop: 12 }}>{state.title}</div>
      </div>
      <div style={{ width: 42, height: 42, borderRadius: 14, background: Wave21AToneBg(state.tone), color: Wave21AToneColor(state.tone), display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon name={state.id === 'account' ? 'money' : state.id === 'bracket' ? 'swords' : Wave21AIconForTone(state.tone, 'trophy')} size={19}/>
      </div>
    </div>
    <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 10 }}>{state.sub}</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
      <div style={{ padding: 12, borderRadius: 13, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 700 }}>참가팀</div>
        <div className="tab-num" style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>31 / 32</div>
      </div>
      <div style={{ padding: 12, borderRadius: 13, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 700 }}>상태</div>
        <div className="tab-num" style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>{state.meta}</div>
      </div>
    </div>
    <button className="tm-pressable tm-break-keep" disabled={state.id === 'pending'} style={{ width: '100%', minHeight: 50, borderRadius: 14, background: state.id === 'pending' ? 'var(--grey200)' : state.tone === 'red' ? 'var(--red500)' : 'var(--blue500)', color: state.id === 'pending' ? 'var(--grey500)' : 'var(--static-white)', fontSize: 14, fontWeight: 700, marginTop: 16 }}>
      {state.cta}
    </button>
  </Card>
);

const TournamentsStateEdgeBoard = () => {
  const [active, setActive] = React.useState('deadline');
  const current = TournamentsStateCases.find((item) => item.id === active) || TournamentsStateCases[0];
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 92 }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="blue" size="sm">TOURNAMENT READINESS</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>대회 상태 UI</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>접수, 대진, 결과, 정산 상태를 같은 언어로 연결합니다.</div>
        </div>
        <div style={{ padding: '16px 20px 0', display: 'flex', gap: 8, overflowX: 'auto' }}>
          {TournamentsStateCases.map((item) => <HapticChip key={item.id} active={active === item.id} onClick={() => setActive(item.id)}>{item.chip}</HapticChip>)}
        </div>
        <div style={{ padding: '0 20px' }}>
          <TournamentsStateCard state={current}/>
          <Card pad={0} style={{ marginTop: 14 }}>
            <ListItem title="서울 풋살 챔피언십" sub="5/17~6/1 · 31/32팀 · 상금 200만" trailing={current.label} chev/>
            <ListItem title="주말 농구 3on3" sub="5/24 · 결과 이의 제기 1건" trailing="순위표 보류" chev/>
          </Card>
        </div>
        <BottomNav active="matches"/>
      </div>
    </Phone>
  );
};

const TournamentsBracketConflictBoard = () => {
  const rounds = [
    ['8강', ['FC 강남', '레드스타', '바모스', '원팀']],
    ['4강', ['FC 강남', '바모스']],
    ['결승', ['미정']],
  ];
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 116 }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="red" size="sm">BRACKET CONFLICT</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>대진표 충돌 해결</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>동일 팀 중복 배정, 경기장 변경, 팀원 부족을 운영 도구에서 즉시 분리합니다.</div>
        </div>
        <div style={{ padding: 20 }}>
          <Card pad={18}>
            <SectionTitle title="대진표" sub="라운드별 horizontal scroll 영역"/>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 14 }}>
              {rounds.map(([title, teams], roundIndex) => (
                <div key={title} style={{ minHeight: 172, borderRadius: 15, background: roundIndex === 1 ? 'var(--red50)' : 'var(--grey50)', border: '1px solid var(--border)', padding: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: roundIndex === 1 ? 'var(--red500)' : 'var(--text-muted)' }}>{title}</div>
                  <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                    {teams.map((team, i) => (
                      <div key={`${title}-${team}-${i}`} style={{ minHeight: 34, borderRadius: 10, background: 'var(--bg)', border: `1px solid ${roundIndex === 1 && i === 0 ? 'var(--red500)' : 'var(--border)'}`, padding: '8px 9px', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {team}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            <Wave21AInfoRow title="FC 강남 중복 배정" sub="4강 1경기와 4강 2경기에 같은 팀이 동시에 들어갔습니다." status="충돌" tone="red" icon="swords"/>
            <Wave21AInfoRow title="팀원 5명 미만" sub="레드스타는 최소 인원 6명 조건을 충족하지 못해 출전 확인이 필요합니다." status="확인" tone="orange" icon="people"/>
            <Wave21AInfoRow title="자동 재배정 가능" sub="운영자가 승인하면 경기장 A/B 슬롯을 바꾸고 팀 채팅에 공지합니다." status="추천" tone="blue" icon="arrow"/>
          </div>
        </div>
      </div>
      <Wave21AStickyCTA title="충돌 해결안 적용" sub="적용 전 참가팀에 변경 공지가 발송됩니다."/>
    </Phone>
  );
};

const TournamentsResultDisputeBoard = () => (
  <Phone>
    <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 116 }}>
      <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
        <Badge tone="red" size="sm">RESULT DISPUTE</Badge>
        <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>결과 이의 제기</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>스코어, 순위표, 상금 정산을 심판 확인 전까지 잠급니다.</div>
      </div>
      <div style={{ padding: 20 }}>
        <Card pad={18}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <Badge tone="orange" size="sm">순위표 반영 대기</Badge>
              <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.28, marginTop: 12 }}>FC 강남 2 : 1 바모스</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>4강 1경기 · 심판 김태훈</div>
            </div>
            <NumberDisplay value="90+2" unit="분" size={28} sub="쟁점 시점"/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
            <div style={{ padding: 12, borderRadius: 13, background: 'var(--red50)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--red500)', fontWeight: 800 }}>이의 제기</div>
              <div style={{ fontSize: 13, lineHeight: 1.4, marginTop: 5 }}>오프사이드 판정 재확인 요청</div>
            </div>
            <div style={{ padding: 12, borderRadius: 13, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 800 }}>영향</div>
              <div style={{ fontSize: 13, lineHeight: 1.4, marginTop: 5 }}>결승 진출, 상금 120만원</div>
            </div>
          </div>
        </Card>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {[
            ['증빙 제출', '양 팀 영상 2개와 심판 메모가 업로드되었습니다.', '완료', 'green'],
            ['운영 검토', '대회 운영자가 24시간 안에 최종 판정을 남깁니다.', '진행', 'orange'],
            ['순위표 잠금', '검토 중에는 다음 라운드와 상금 정산을 비활성화합니다.', '잠금', 'red'],
          ].map(([title, sub, status, tone]) => (
            <Wave21AInfoRow key={title} title={title} sub={sub} status={status} tone={tone} icon={tone === 'green' ? 'check' : tone === 'red' ? 'shield' : 'clock'}/>
          ))}
        </div>
        <Toast type="error" msg="이의 제기 중에는 결과를 확정할 수 없어요."/>
      </div>
    </div>
    <Wave21AStickyCTA title="심판 확인 요청" sub="확정 전까지 순위표와 상금 지급은 보류됩니다." danger/>
  </Phone>
);

const TournamentsPayoutAccountBoard = () => (
  <Phone>
    <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 116 }}>
      <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
        <Badge tone="orange" size="sm">PAYOUT / ACCOUNT</Badge>
        <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>상금 정산 계좌</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>계좌 누락과 분배 동의 상태를 결승 종료 전부터 보여줍니다.</div>
      </div>
      <div style={{ padding: 20 }}>
        <Card pad={18}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div>
              <Badge tone="blue" size="sm">총 상금</Badge>
              <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.25, marginTop: 12 }}>서울 풋살 챔피언십</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>1위 120만원 · 2위 50만원 · MVP 30만원</div>
            </div>
            <NumberDisplay value={200} unit="만원" size={30} sub="지급 예정"/>
          </div>
          <div style={{ marginTop: 16 }}>
            <MoneyRow label="우승팀 FC 강남" amount={1200000} accent/>
            <MoneyRow label="준우승 바모스" amount={500000}/>
            <MoneyRow label="MVP 김민재" amount={300000}/>
          </div>
        </Card>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          <Wave21AInfoRow title="대표 계좌 미등록" sub="FC 강남 대표 계좌가 없어 지급 신청 CTA를 차단합니다." status="필수" tone="red" icon="money"/>
          <Wave21AInfoRow title="팀원 분배 동의 8/11" sub="공동 수령을 선택한 팀은 분배 비율 동의가 모두 필요합니다." status="대기" tone="orange" icon="people"/>
          <Wave21AInfoRow title="세금/영수증 정보" sub="상금 지급 전 주민번호 대신 사업자/기타소득 안내를 분기합니다." status="안내" tone="blue" icon="ticket"/>
        </div>
      </div>
    </div>
    <Wave21AStickyCTA title="계좌 등록 후 지급 신청" sub="미등록 계좌가 있으면 상금 지급은 보류됩니다." disabled/>
  </Phone>
);

const TournamentsControlInteractionBoard = () => {
  const [type, setType] = React.useState('풋살');
  const [step, setStep] = React.useState(2);
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 116 }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="blue" size="sm">CONTROL STATES</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>참가 신청 컨트롤</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>종목, 팀, 참가비, 결과 입력 CTA의 상태를 명확히 분리합니다.</div>
        </div>
        <div style={{ padding: 20 }}>
          <Card pad={16}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>종목 필터</div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 12 }}>
              {['풋살', '농구', '테니스', '배드민턴'].map((item) => (
                <HapticChip key={item} active={type === item} onClick={() => setType(item)}>{item}</HapticChip>
              ))}
            </div>
          </Card>
          <Card pad={16} style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>참가 신청 단계</div>
              <Badge tone="blue" size="sm">STEP {step}/4</Badge>
            </div>
            <div style={{ marginTop: 12 }}><Wave21AProgress step={step}/></div>
            <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px', gap: 10, alignItems: 'center', marginTop: 14 }}>
              <button className="tm-pressable tm-break-keep" onClick={() => setStep(Math.max(1, step - 1))} style={{ height: 44, borderRadius: 14, background: 'var(--grey100)', fontSize: 18, fontWeight: 700 }}>-</button>
              <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>팀 정보 · 참가비 · 규정 동의</div>
              <button className="tm-pressable tm-break-keep" onClick={() => setStep(Math.min(4, step + 1))} style={{ height: 44, borderRadius: 14, background: 'var(--blue500)', color: 'var(--static-white)', fontSize: 18, fontWeight: 700 }}>+</button>
            </div>
          </Card>
          <Card pad={16} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>CTA 상태</div>
            <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
              {[
                ['참가 신청', 'primary', false],
                ['팀원 초대 후 계속', 'secondary', false],
                ['정원 마감 · 대기팀 등록', 'secondary', false],
                ['결과 이의 검토 중', 'disabled', true],
              ].map(([title, type, disabled]) => (
                <button className="tm-pressable tm-break-keep" key={title} disabled={disabled} style={{ height: 46, borderRadius: 13, background: type === 'primary' ? 'var(--blue500)' : disabled ? 'var(--grey200)' : 'var(--grey100)', color: type === 'primary' ? 'var(--static-white)' : disabled ? 'var(--grey500)' : 'var(--text-strong)', fontSize: 13, fontWeight: 700 }}>{title}</button>
              ))}
            </div>
          </Card>
        </div>
      </div>
      <Wave21AStickyCTA title="30,000원 참가비 결제" sub="결제 직전 정원과 참가 자격을 다시 확인합니다."/>
    </Phone>
  );
};

const TournamentsMotionContractBoard = () => (
  <div style={{ width: 840, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">TOURNAMENT MOTION</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>대회 모션 계약</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8 }}>대진표와 결과처럼 상태 관계가 중요한 화면에서만 짧고 기능적인 전이를 사용합니다.</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
      {[
        ['대진표 스크롤', '라운드 snap 180ms', '현재 라운드 badge 갱신', '키보드 이동 가능'],
        ['참가 신청 다음', 'CTA scale 0.98', 'progress bar advance', '입력값 유지'],
        ['정원 재검증', 'button loading', 'sold out sheet', '중복 결제 차단'],
        ['결과 입력', 'score stepper feedback', 'confirm sheet open', '순위표 pending'],
        ['이의 제기', 'error row reveal', 'timeline lock', '정산 CTA 비활성'],
        ['공지 발송', 'toast 220ms fade', 'pinned notice 생성', '읽음 상태 분리'],
      ].map(([trigger, feedback, result, guard], i) => (
        <Wave21AMotionCard key={trigger} index={i} trigger={trigger} feedback={feedback} result={result} guard={guard}/>
      ))}
    </div>
    <div style={{ marginTop: 18, padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Reduced motion</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 5 }}>대진표 snap, sheet rise, toast fade는 즉시 상태 전환과 persistent row로 대체합니다. 결과/정산 잠금은 모션보다 텍스트 상태가 우선입니다.</div>
    </div>
  </div>
);

const TournamentsMiniLayout = ({ mode = 'mobile', dark = false }) => {
  const palette = dark
    ? { bg: '#0f1318', panel: '#181d24', weak: '#242a33', border: '#303742', text: 'var(--grey100)', muted: 'var(--grey500)' }
    : { bg: 'var(--static-white)', panel: 'var(--static-white)', weak: 'var(--grey100)', border: 'var(--grey200)', text: 'var(--grey900)', muted: 'var(--grey600)' };
  const isMobile = mode === 'mobile';
  const isTablet = mode === 'tablet';
  const width = isMobile ? 220 : isTablet ? 330 : 520;
  const height = isMobile ? 430 : 390;
  return (
    <div style={{ width, height, borderRadius: isMobile ? 30 : 18, background: palette.bg, color: palette.text, border: `1px solid ${palette.border}`, padding: isMobile ? 16 : 18, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '150px 1fr 170px', gap: 14, overflow: 'hidden' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: palette.muted, fontWeight: 700 }}>Tournament</div>
        <div style={{ width: isMobile ? 82 : 98, height: isMobile ? 82 : 98, borderRadius: 20, background: palette.weak, border: `1px solid ${palette.border}`, color: 'var(--blue500)', display: 'grid', placeItems: 'center', marginTop: 14 }}>
          <Icon name="trophy" size={34}/>
        </div>
        <div style={{ fontSize: isMobile ? 17 : 19, fontWeight: 700, lineHeight: 1.25, marginTop: 12 }}>서울 풋살<br/>챔피언십</div>
        <div className="tab-num" style={{ fontSize: 22, fontWeight: 800, marginTop: 10 }}>31/32팀</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ padding: 14, borderRadius: 16, background: palette.panel, border: `1px solid ${palette.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontSize: 13, color: palette.muted, fontWeight: 700 }}>대진 상태</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>4강 진행</div>
              <div style={{ fontSize: 11, color: palette.muted, marginTop: 4 }}>결과 이의 1건</div>
            </div>
            <Badge tone="orange" size="sm">검토</Badge>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
            {['8강', '4강', '결승', '정산'].map((item, i) => (
              <div key={item} style={{ padding: 10, borderRadius: 12, background: i === 1 ? 'var(--blue50)' : palette.weak, border: `1px solid ${palette.border}` }}>
                <div style={{ fontSize: 11, color: palette.muted }}>{item}</div>
                <div className="tab-num" style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{i < 1 ? '완료' : i === 1 ? '진행' : '대기'}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {mode === 'desktop' && (
        <div style={{ minWidth: 0 }}>
          {['참가 승인', '대진표 편집', '결과 검토'].map((item, i) => (
            <button className="tm-pressable tm-break-keep" key={item} style={{ width: '100%', height: 42, borderRadius: 12, background: i === 0 ? 'var(--blue500)' : palette.weak, color: i === 0 ? 'var(--static-white)' : palette.text, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{item}</button>
          ))}
          <div style={{ padding: 10, borderRadius: 12, background: 'var(--orange50)', color: 'var(--orange500)', fontSize: 11, lineHeight: 1.35, fontWeight: 700 }}>충돌과 이의 제기는 순위표/정산을 잠급니다.</div>
        </div>
      )}
    </div>
  );
};

const TournamentsResponsiveBoard = () => (
  <div style={{ width: 1280, height: 820, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">RESPONSIVE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>대회 · Mobile/Tablet/Desktop 재배치</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>모바일은 참가/대진 요약, 태블릿은 대회 상세와 대진표 분할, 데스크탑은 운영 액션 레일을 추가합니다.</div>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginTop: 26 }}>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Mobile 375</div><TournamentsMiniLayout mode="mobile"/></div>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Tablet 768</div><TournamentsMiniLayout mode="tablet"/></div>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Desktop 1280</div><TournamentsMiniLayout mode="desktop"/></div>
    </div>
    <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {[
        ['Mobile', '참가 CTA, 정원/마감 상태, 내 팀 신청 상태를 우선 노출'],
        ['Tablet', '대회 상세와 대진표/순위표를 2열로 분리'],
        ['Desktop', '좌측 필터, 중앙 대진표, 우측 운영/정산 레일'],
      ].map(([title, sub]) => <Card key={title} pad={16}><div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div><div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{sub}</div></Card>)}
    </div>
  </div>
);

const TournamentsDarkModeBoard = () => (
  <div style={{ width: 920, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">DARK MODE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>대회 · Light/Dark 비교</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>대진 충돌, 결과 이의, 정산 계좌 누락의 red/orange 상태가 dark에서도 같은 우선순위로 보여야 합니다.</div>
    <div style={{ display: 'flex', gap: 18, marginTop: 28 }}>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Light</div><TournamentsMiniLayout mode="tablet"/></div>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Dark</div><TournamentsMiniLayout mode="tablet" dark/></div>
    </div>
    <div style={{ marginTop: 22, padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>대회 dark 검수 포인트</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
        {['대진표 contrast', '이의 red', '마감 orange', '상금 tabular'].map((item) => <Badge key={item} tone="grey">{item}</Badge>)}
      </div>
    </div>
  </div>
);

const RentalStateCases = [
  { id: 'available', chip: '대여가능', label: '대여 가능', tone: 'blue', title: '오늘 18시 픽업 가능', sub: '보증금, 대여료, 반납 장소를 결제 전 한 번 더 확인합니다.', cta: '대여 예약', meta: '3개' },
  { id: 'disabled', chip: '정비중', label: '정비중', tone: 'grey', title: '검수 중이라 대여할 수 없어요', sub: '정비 사유와 다음 가능 시간을 비활성 카드 안에 표시합니다.', cta: '입고 알림 받기', meta: '정비' },
  { id: 'pendingPickup', chip: '픽업대기', label: '픽업 대기', tone: 'orange', title: 'QR 확인 후 장비를 받을 수 있어요', sub: '픽업 QR은 예약자와 운영자 확인이 동시에 필요합니다.', cta: '픽업 QR 열기', meta: '오늘' },
  { id: 'inUse', chip: '사용중', label: '사용 중', tone: 'blue', title: '반납 예정 시간이 다가와요', sub: '연장 가능 여부를 다음 예약과 재고 상태로 판단합니다.', cta: '반납 준비', meta: 'D-0' },
  { id: 'late', chip: '반납지연', label: '반납 지연', tone: 'red', title: '2시간 지연되어 추가 요금이 예상돼요', sub: '지연 요금, 보증금 차감, 다음 예약 영향을 함께 보여줍니다.', cta: '반납 시간 조정', meta: '+2h' },
  { id: 'damage', chip: '파손신고', label: '파손 신고', tone: 'red', title: '반납 사진과 기존 상태가 달라요', sub: '보증금 차감 전 사진, 운영자 검수, 사용자 동의를 분리합니다.', cta: '파손 내역 확인', meta: '검수' },
  { id: 'inventory', chip: '재고충돌', label: '재고 충돌', tone: 'red', title: '다음 예약과 기간 연장이 겹쳐요', sub: '기간 연장 CTA를 막고 대체 장비를 추천합니다.', cta: '대체 장비 보기', meta: '충돌' },
  { id: 'complete', chip: '반납완료', label: '반납 완료', tone: 'green', title: '검수가 끝나 보증금이 반환돼요', sub: '반환 예정일, 차감 없음, 영수증을 한 화면에 남깁니다.', cta: '영수증 보기', meta: '완료' },
];

const RentalStateCard = ({ state }) => (
  <Card pad={18} style={{ marginTop: 14 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ minWidth: 0 }}>
        <Badge tone={state.tone} size="sm">{state.label}</Badge>
        <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.28, marginTop: 12 }}>{state.title}</div>
      </div>
      <div style={{ width: 42, height: 42, borderRadius: 14, background: Wave21AToneBg(state.tone), color: Wave21AToneColor(state.tone), display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon name={state.id === 'damage' ? 'shield' : state.id === 'inventory' ? 'store' : Wave21AIconForTone(state.tone, 'ticket')} size={19}/>
      </div>
    </div>
    <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 10 }}>{state.sub}</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
      <div style={{ padding: 12, borderRadius: 13, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 700 }}>보증금</div>
        <div className="tab-num" style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>50,000원</div>
      </div>
      <div style={{ padding: 12, borderRadius: 13, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 700 }}>상태</div>
        <div className="tab-num" style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>{state.meta}</div>
      </div>
    </div>
    <button className="tm-pressable tm-break-keep" disabled={state.id === 'disabled'} style={{ width: '100%', minHeight: 50, borderRadius: 14, background: state.id === 'disabled' ? 'var(--grey200)' : state.tone === 'red' ? 'var(--red500)' : 'var(--blue500)', color: state.id === 'disabled' ? 'var(--grey500)' : 'var(--static-white)', fontSize: 14, fontWeight: 700, marginTop: 16 }}>
      {state.cta}
    </button>
  </Card>
);

const RentalStateEdgeBoard = () => {
  const [active, setActive] = React.useState('available');
  const current = RentalStateCases.find((item) => item.id === active) || RentalStateCases[0];
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 92 }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="blue" size="sm">RENTAL READINESS</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>장비 대여 상태 UI</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>재고, 보증금, 픽업, 반납, 파손 검수를 같은 상태 체계로 묶습니다.</div>
        </div>
        <div style={{ padding: '16px 20px 0', display: 'flex', gap: 8, overflowX: 'auto' }}>
          {RentalStateCases.map((item) => <HapticChip key={item.id} active={active === item.id} onClick={() => setActive(item.id)}>{item.chip}</HapticChip>)}
        </div>
        <div style={{ padding: '0 20px' }}>
          <RentalStateCard state={current}/>
          <Card pad={0} style={{ marginTop: 14 }}>
            <ListItem title="풋살화 + 정강이 보호대" sub="강남 픽업 · 8,000원/일 · 보증금 50,000원" trailing={current.label} chev/>
            <ListItem title="아이스하키 풀세트 L" sub="목동 링크 · 정비 완료 예정 18:00" trailing="정비중" chev/>
          </Card>
        </div>
        <BottomNav active="marketplace"/>
      </div>
    </Phone>
  );
};

const RentalPickupReturnBoard = () => (
  <Phone>
    <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 116 }}>
      <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
        <Badge tone="blue" size="sm">PICKUP / RETURN QR</Badge>
        <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>픽업 · 반납 QR</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>예약자, 운영자, 장비 ID가 모두 맞아야 상태가 넘어갑니다.</div>
      </div>
      <div style={{ padding: 20 }}>
        <Card pad={18}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <Badge tone="orange" size="sm">픽업 대기</Badge>
              <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.28, marginTop: 12 }}>강남역 A픽업지점</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>오늘 18:00까지 수령</div>
            </div>
            <div style={{ width: 92, height: 92, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, padding: 12 }}>
              {Array.from({ length: 9 }).map((_, i) => <div key={i} style={{ borderRadius: 3, background: [0, 2, 4, 6, 7].includes(i) ? 'var(--text-strong)' : 'var(--grey200)' }}/>)}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
            <div style={{ padding: 12, borderRadius: 13, background: 'var(--blue50)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--blue500)', fontWeight: 800 }}>예약자 확인</div>
              <div style={{ fontSize: 13, marginTop: 5 }}>김정민 · 270mm</div>
            </div>
            <div style={{ padding: 12, borderRadius: 13, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-caption)', fontWeight: 800 }}>장비 ID</div>
              <div className="tab-num" style={{ fontSize: 13, marginTop: 5 }}>TM-GR-270-18</div>
            </div>
          </div>
        </Card>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          <Wave21AInfoRow title="다른 사용자의 QR" sub="예약자 이름과 장비 ID가 다르면 픽업 확정을 막습니다." status="차단" tone="red" icon="shield"/>
          <Wave21AInfoRow title="반납 사진 3장 필요" sub="전체, 밑창, 손상 의심 부위를 촬영해야 검수로 넘어갑니다." status="필수" tone="orange" icon="edit"/>
          <Wave21AInfoRow title="운영자 확인" sub="운영자가 QR을 스캔하면 상태가 사용 중/반납 완료로 바뀝니다." status="확인" tone="blue" icon="check"/>
        </div>
      </div>
    </div>
    <Wave21AStickyCTA title="픽업 확인 요청" sub="QR은 5분마다 갱신되며 캡처본은 사용할 수 없습니다."/>
  </Phone>
);

const RentalDepositDamageBoard = () => (
  <Phone>
    <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 116 }}>
      <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
        <Badge tone="red" size="sm">DEPOSIT / DAMAGE</Badge>
        <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>보증금 · 파손 검수</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>차감 전 사용자의 동의, 증빙, 운영 검수 상태를 모두 노출합니다.</div>
      </div>
      <div style={{ padding: 20 }}>
        <Card pad={18}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div>
              <Badge tone="red" size="sm">파손 검수 중</Badge>
              <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.25, marginTop: 12 }}>풋살화 밑창 손상</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>반납 사진과 대여 전 사진이 일치하지 않습니다.</div>
            </div>
            <NumberDisplay value={15000} unit="원" size={28} sub="예상 차감"/>
          </div>
          <div style={{ marginTop: 16 }}>
            <MoneyRow label="보증금" amount={50000} accent/>
            <MoneyRow label="예상 차감" amount={15000}/>
            <MoneyRow label="반환 예정" amount={35000}/>
          </div>
        </Card>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          <Wave21AInfoRow title="대여 전 사진" sub="운영자가 등록한 기준 사진 5장을 함께 비교합니다." status="기준" tone="blue" icon="shield"/>
          <Wave21AInfoRow title="사용자 이의 제기" sub="차감 금액 확정 전 24시간 동안 이의를 제출할 수 있습니다." status="D+1" tone="orange" icon="chat"/>
          <Wave21AInfoRow title="보증금 반환 보류" sub="검수 완료 전에는 자동 반환과 영수증 발행을 막습니다." status="보류" tone="red" icon="money"/>
        </div>
      </div>
    </div>
    <Wave21AStickyCTA title="파손 내역에 동의" sub="동의 후 보증금 차감 영수증이 발행됩니다." danger/>
  </Phone>
);

const RentalInventoryConflictBoard = () => {
  const [days, setDays] = React.useState(2);
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 116 }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="red" size="sm">INVENTORY CONFLICT</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>재고 · 기간 충돌</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>기간 연장, 다음 예약, 정비 상태가 겹칠 때 대체 장비를 제안합니다.</div>
        </div>
        <div style={{ padding: 20 }}>
          <Card pad={18}>
            <SectionTitle title="대여 기간" sub="5월 4일 18:00 픽업"/>
            <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px', gap: 10, alignItems: 'center', marginTop: 14 }}>
              <button className="tm-pressable tm-break-keep" onClick={() => setDays(Math.max(1, days - 1))} style={{ height: 44, borderRadius: 14, background: 'var(--grey100)', fontSize: 18, fontWeight: 700 }}>-</button>
              <div style={{ textAlign: 'center' }}>
                <div className="tab-num" style={{ fontSize: 22, fontWeight: 800 }}>{days}일</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>연장 시 다음 예약과 충돌</div>
              </div>
              <button className="tm-pressable tm-break-keep" onClick={() => setDays(days + 1)} style={{ height: 44, borderRadius: 14, background: 'var(--blue500)', color: 'var(--static-white)', fontSize: 18, fontWeight: 700 }}>+</button>
            </div>
            <div style={{ marginTop: 16, padding: 13, borderRadius: 14, background: 'var(--red50)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red500)' }}>5월 6일 09:00 다음 예약 있음</div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.45, marginTop: 4 }}>현재 장비 연장은 불가합니다. 같은 사이즈 대체 장비 2개를 추천합니다.</div>
            </div>
          </Card>
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            <Wave21AInfoRow title="풋살화 270mm 대체" sub="같은 픽업지점 · 보증금 동일 · 오늘 사용 가능" status="추천" tone="blue" icon="store"/>
            <Wave21AInfoRow title="정비 중 장비 제외" sub="밑창 수리 예정 장비는 검색 결과와 연장 옵션에서 제외합니다." status="정비" tone="orange" icon="shield"/>
          </div>
        </div>
      </div>
      <Wave21AStickyCTA title="대체 장비로 변경" sub="변경 전 보증금과 대여료를 다시 계산합니다."/>
    </Phone>
  );
};

const RentalControlInteractionBoard = () => {
  const [size, setSize] = React.useState('270');
  const [days, setDays] = React.useState(1);
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 116 }}>
        <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
          <Badge tone="blue" size="sm">CONTROL STATES</Badge>
          <div style={{ fontSize: 23, fontWeight: 700, marginTop: 8 }}>대여 컨트롤</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>사이즈, 기간, 보증금, QR, 반납 CTA의 상태를 한 화면에서 점검합니다.</div>
        </div>
        <div style={{ padding: 20 }}>
          <Card pad={16}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>사이즈 선택</div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 12 }}>
              {['260', '265', '270', '275', '280'].map((item) => <HapticChip key={item} active={size === item} onClick={() => setSize(item)}>{item}</HapticChip>)}
            </div>
          </Card>
          <Card pad={16} style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>대여 기간</div>
              <Badge tone="blue" size="sm">{days}일</Badge>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px', gap: 10, alignItems: 'center', marginTop: 14 }}>
              <button className="tm-pressable tm-break-keep" onClick={() => setDays(Math.max(1, days - 1))} style={{ height: 44, borderRadius: 14, background: 'var(--grey100)', fontSize: 18, fontWeight: 700 }}>-</button>
              <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>대여료 {(8000 * days).toLocaleString()}원 + 보증금</div>
              <button className="tm-pressable tm-break-keep" onClick={() => setDays(days + 1)} style={{ height: 44, borderRadius: 14, background: 'var(--blue500)', color: 'var(--static-white)', fontSize: 18, fontWeight: 700 }}>+</button>
            </div>
          </Card>
          <Card pad={16} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>CTA 상태</div>
            <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
              {[
                ['대여 예약', 'primary', false],
                ['픽업 QR 보기', 'secondary', false],
                ['반납 사진 업로드', 'secondary', false],
                ['재고 없음', 'disabled', true],
              ].map(([title, type, disabled]) => (
                <button className="tm-pressable tm-break-keep" key={title} disabled={disabled} style={{ height: 46, borderRadius: 13, background: type === 'primary' ? 'var(--blue500)' : disabled ? 'var(--grey200)' : 'var(--grey100)', color: type === 'primary' ? 'var(--static-white)' : disabled ? 'var(--grey500)' : 'var(--text-strong)', fontSize: 13, fontWeight: 700 }}>{title}</button>
              ))}
            </div>
          </Card>
        </div>
      </div>
      <Wave21AStickyCTA title={`${(8000 * days + 50000).toLocaleString()}원 예약하기`} sub="보증금 50,000원은 검수 후 반환됩니다."/>
    </Phone>
  );
};

const RentalMotionContractBoard = () => (
  <div style={{ width: 840, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">RENTAL MOTION</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>장비 대여 모션 계약</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8 }}>대여 흐름은 빠른 피드백보다 상태 증거와 재고 재검증이 중요합니다.</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
      {[
        ['기간 변경', 'stepper scale 0.98', '금액 즉시 갱신', '다음 예약 재검증'],
        ['예약 제출', 'button loading', '재고 lock 확인', '결제/보증금 sheet'],
        ['QR 열기', 'sheet rise 240ms', 'QR 갱신 타이머', '캡처본 차단 안내'],
        ['반납 사진', 'upload progress', '검수 pending row', '누락 사진 표시'],
        ['파손 신고', 'red row reveal', '보증금 보류', '이의 제기 CTA'],
        ['반납 완료', 'success toast', '반환 예정일 생성', '영수증 링크'],
      ].map(([trigger, feedback, result, guard], i) => (
        <Wave21AMotionCard key={trigger} index={i} trigger={trigger} feedback={feedback} result={result} guard={guard}/>
      ))}
    </div>
    <div style={{ marginTop: 18, padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Reduced motion</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 5 }}>QR sheet, upload progress, success toast는 opacity 또는 즉시 상태 row로 대체합니다. 재고 충돌과 파손 보류는 persistent copy를 우선합니다.</div>
    </div>
  </div>
);

const RentalMiniLayout = ({ mode = 'mobile', dark = false }) => {
  const palette = dark
    ? { bg: '#0f1318', panel: '#181d24', weak: '#242a33', border: '#303742', text: 'var(--grey100)', muted: 'var(--grey500)' }
    : { bg: 'var(--static-white)', panel: 'var(--static-white)', weak: 'var(--grey100)', border: 'var(--grey200)', text: 'var(--grey900)', muted: 'var(--grey600)' };
  const isMobile = mode === 'mobile';
  const isTablet = mode === 'tablet';
  const width = isMobile ? 220 : isTablet ? 330 : 520;
  const height = isMobile ? 430 : 390;
  return (
    <div style={{ width, height, borderRadius: isMobile ? 30 : 18, background: palette.bg, color: palette.text, border: `1px solid ${palette.border}`, padding: isMobile ? 16 : 18, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '150px 1fr 170px', gap: 14, overflow: 'hidden' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: palette.muted, fontWeight: 700 }}>Rental</div>
        <div style={{ width: isMobile ? 92 : 104, height: isMobile ? 92 : 104, borderRadius: 18, background: palette.weak, border: `1px solid ${palette.border}`, color: 'var(--blue500)', display: 'grid', placeItems: 'center', marginTop: 14 }}>
          <Icon name="store" size={34}/>
        </div>
        <div style={{ fontSize: isMobile ? 17 : 19, fontWeight: 700, lineHeight: 1.25, marginTop: 12 }}>풋살화 +<br/>보호대 세트</div>
        <div className="tab-num" style={{ fontSize: 22, fontWeight: 800, marginTop: 10 }}>8,000원/일</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ padding: 14, borderRadius: 16, background: palette.panel, border: `1px solid ${palette.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontSize: 13, color: palette.muted, fontWeight: 700 }}>대여 상태</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>픽업 대기</div>
              <div style={{ fontSize: 11, color: palette.muted, marginTop: 4 }}>QR 확인 필요</div>
            </div>
            <Badge tone="orange" size="sm">대기</Badge>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
            <div style={{ padding: 10, borderRadius: 12, background: palette.weak, border: `1px solid ${palette.border}` }}>
              <div style={{ fontSize: 11, color: palette.muted }}>보증금</div>
              <div className="tab-num" style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>50,000</div>
            </div>
            <div style={{ padding: 10, borderRadius: 12, background: palette.weak, border: `1px solid ${palette.border}` }}>
              <div style={{ fontSize: 11, color: palette.muted }}>재고</div>
              <div className="tab-num" style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>3개</div>
            </div>
          </div>
        </div>
      </div>
      {mode === 'desktop' && (
        <div style={{ minWidth: 0 }}>
          {['대여 승인', 'QR 확인', '반납 검수'].map((item, i) => (
            <button className="tm-pressable tm-break-keep" key={item} style={{ width: '100%', height: 42, borderRadius: 12, background: i === 0 ? 'var(--blue500)' : palette.weak, color: i === 0 ? 'var(--static-white)' : palette.text, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{item}</button>
          ))}
          <div style={{ padding: 10, borderRadius: 12, background: 'var(--red50)', color: 'var(--red500)', fontSize: 11, lineHeight: 1.35, fontWeight: 700 }}>파손/재고 충돌은 보증금 반환을 보류합니다.</div>
        </div>
      )}
    </div>
  );
};

const RentalResponsiveBoard = () => (
  <div style={{ width: 1280, height: 820, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">RESPONSIVE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>장비 대여 · Mobile/Tablet/Desktop 재배치</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>모바일은 예약과 QR, 태블릿은 장비 상세와 상태, 데스크탑은 재고 운영 레일로 확장합니다.</div>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginTop: 26 }}>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Mobile 375</div><RentalMiniLayout mode="mobile"/></div>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Tablet 768</div><RentalMiniLayout mode="tablet"/></div>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Desktop 1280</div><RentalMiniLayout mode="desktop"/></div>
    </div>
    <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {[
        ['Mobile', '대여 기간, 보증금, QR, 고정 예약 CTA를 우선 노출'],
        ['Tablet', '장비 상세와 픽업/반납 상태를 2열로 분리'],
        ['Desktop', '필터, 재고 목록, 운영 액션 레일을 동시에 표시'],
      ].map(([title, sub]) => <Card key={title} pad={16}><div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div><div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{sub}</div></Card>)}
    </div>
  </div>
);

const RentalDarkModeBoard = () => (
  <div style={{ width: 920, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">DARK MODE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>장비 대여 · Light/Dark 비교</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>보증금, QR, 파손 신고, 재고 충돌이 dark mode에서도 같은 위험도로 보여야 합니다.</div>
    <div style={{ display: 'flex', gap: 18, marginTop: 28 }}>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Light</div><RentalMiniLayout mode="tablet"/></div>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Dark</div><RentalMiniLayout mode="tablet" dark/></div>
    </div>
    <div style={{ marginTop: 22, padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>장비 대여 dark 검수 포인트</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
        {['보증금 tabular', 'QR contrast', '파손 red', '정비 disabled'].map((item) => <Badge key={item} tone="grey">{item}</Badge>)}
      </div>
    </div>
  </div>
);

Object.assign(window, {
  TournamentsStateEdgeBoard,
  TournamentsBracketConflictBoard,
  TournamentsResultDisputeBoard,
  TournamentsPayoutAccountBoard,
  TournamentsControlInteractionBoard,
  TournamentsMotionContractBoard,
  TournamentsResponsiveBoard,
  TournamentsDarkModeBoard,
  RentalStateEdgeBoard,
  RentalPickupReturnBoard,
  RentalDepositDamageBoard,
  RentalInventoryConflictBoard,
  RentalControlInteractionBoard,
  RentalMotionContractBoard,
  RentalResponsiveBoard,
  RentalDarkModeBoard,
});
