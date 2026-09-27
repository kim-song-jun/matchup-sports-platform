/* Teameet readiness wave 21d.
   Modules 15 and 16 only: Settings and Public/Marketing boards. */

const Wave21DToneColor = (tone) => ({
  blue: 'var(--blue500)',
  red: 'var(--red500)',
  orange: 'var(--orange500)',
  green: 'var(--green500)',
  grey: 'var(--text-muted)',
}[tone] || 'var(--text-muted)');

const Wave21DToneBg = (tone) => ({
  blue: 'var(--blue50)',
  red: 'var(--red50)',
  orange: 'var(--orange50)',
  green: 'var(--green50)',
  grey: 'var(--grey50)',
}[tone] || 'var(--grey50)');

const Wave21DButtonClass = (type = 'primary', size = 'md') => {
  const variant = type === 'danger' ? 'tm-btn-danger' : type === 'secondary' ? 'tm-btn-secondary' : type === 'neutral' ? 'tm-btn-neutral' : 'tm-btn-primary';
  return `tm-btn tm-btn-${size} ${variant}`;
};

const Wave21DActionButton = ({ children, type = 'primary', size = 'md', disabled = false, style }) => (
  <button className={Wave21DButtonClass(type, size)} disabled={disabled} style={{ width: '100%', ...style }}>
    {children}
  </button>
);

const Wave21DHeader = ({ badge, title, sub, tone = 'blue' }) => (
  <div style={{ padding: '14px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)' }}>
    <Badge tone={tone} size="sm">{badge}</Badge>
    <div style={{ fontSize: 23, fontWeight: 700, lineHeight: 1.25, marginTop: 8 }}>{title}</div>
    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 6 }}>{sub}</div>
  </div>
);

const Wave21DStateCard = ({ item, actionLabel }) => (
  <Card pad={18} style={{ marginTop: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <Badge tone={item.tone}>{item.badge}</Badge>
        <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.25, marginTop: 14 }}>{item.title}</div>
      </div>
      <div style={{ width: 42, height: 42, borderRadius: 15, background: Wave21DToneBg(item.tone), color: Wave21DToneColor(item.tone), display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon name={item.icon || (item.tone === 'red' ? 'close' : item.tone === 'orange' ? 'clock' : 'shield')} size={20}/>
      </div>
    </div>
    <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 10 }}>{item.sub}</div>
    <div style={{ marginTop: 16, padding: 13, borderRadius: 14, background: Wave21DToneBg(item.tone), border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: Wave21DToneColor(item.tone) }}>{item.rule}</div>
      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.45, marginTop: 4 }}>{item.detail}</div>
    </div>
    <Wave21DActionButton type={item.tone === 'red' ? 'danger' : 'primary'} disabled={item.disabled} style={{ marginTop: 16 }}>
      {actionLabel || item.cta}
    </Wave21DActionButton>
  </Card>
);

const Wave21DToggleRow = ({ title, sub, on = false, disabled = false }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--grey100)' }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: disabled ? 'var(--text-muted)' : 'var(--text-strong)' }}>{title}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4, marginTop: 3 }}>{sub}</div>}
    </div>
    <div style={{ width: 44, height: 26, borderRadius: 999, background: disabled ? 'var(--grey200)' : on ? 'var(--blue500)' : 'var(--grey300)', position: 'relative', flexShrink: 0 }}>
      <div style={{ width: 22, height: 22, borderRadius: 999, background: 'var(--static-white)', position: 'absolute', top: 2, left: disabled ? 2 : on ? 20 : 2, boxShadow: '0 1px 3px rgba(0,0,0,.15)' }}/>
    </div>
  </div>
);

const Wave21DStep = ({ step, title, sub, active }) => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: 14, background: active ? 'var(--blue50)' : 'var(--grey50)', border: '1px solid var(--border)' }}>
    <div className="tab-num" style={{ width: 28, height: 28, borderRadius: 10, background: active ? 'var(--blue500)' : 'var(--grey100)', color: active ? 'var(--static-white)' : 'var(--text-muted)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{step}</div>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4, marginTop: 3 }}>{sub}</div>
    </div>
  </div>
);

const Wave21DMotionCard = ({ i, trigger, feedback, middle, final }) => (
  <Card pad={16} style={{ minHeight: 122, background: i % 2 ? 'var(--bg)' : 'var(--grey50)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div className="tab-num" style={{ width: 32, height: 32, borderRadius: 12, background: i === 0 ? 'var(--blue500)' : 'var(--grey100)', color: i === 0 ? 'var(--static-white)' : 'var(--text-muted)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{i + 1}</div>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{trigger}</div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
      {[feedback, middle, final].map((txt, j) => (
        <div key={txt} style={{ padding: 10, borderRadius: 10, background: j === 0 ? 'var(--blue50)' : 'var(--bg)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text)', lineHeight: 1.35 }}>{txt}</div>
      ))}
    </div>
  </Card>
);

const Wave21DSettingsStateCases = [
  { id: 'os-permission', chip: 'OS 권한', tone: 'orange', badge: '권한 필요', title: '알림 권한이 꺼져 있어요', sub: '앱 설정 토글이 켜져 있어도 OS 권한이 꺼져 있으면 푸시를 보낼 수 없습니다.', rule: '권한 상태 분리', detail: '서비스 토글, OS 권한, 채널 권한을 각각 다른 상태로 보여줍니다.', cta: 'OS 설정 열기', icon: 'bell' },
  { id: 'destructive', chip: '탈퇴 확인', tone: 'red', badge: '되돌릴 수 없음', title: '계정 삭제 전 최종 확인', sub: '팀 운영자, 예약, 결제 대기, 분쟁 상태가 남아 있으면 삭제 CTA를 막습니다.', rule: '파괴적 액션 보호', detail: '입력 확인, 영향 범위, 보류 사유를 한 화면에 남깁니다.', cta: '삭제 조건 확인', icon: 'shield' },
  { id: 'legal-update', chip: '약관 변경', tone: 'blue', badge: '버전 업데이트', title: '새 약관 동의가 필요해요', sub: '필수 약관 변경 시 앱 진입 전에 변경 요약과 이전 버전을 같이 제공합니다.', rule: '법적 버전 추적', detail: '동의 일시, 약관 버전, 변경 요약을 분리해 감사 가능하게 둡니다.', cta: '변경 내용 확인', icon: 'edit' },
  { id: 'not-found-auth', chip: '404 분기', tone: 'red', badge: '404 / AUTH', title: '로그인이 필요한 페이지예요', sub: '없는 페이지와 권한 없는 페이지를 같은 404처럼 보이지 않게 분리합니다.', rule: 'auth split', detail: '비로그인은 로그인 CTA, 로그인 사용자는 홈/문의 CTA를 제공합니다.', cta: '로그인하고 계속', icon: 'shield' },
  { id: 'loading-error', chip: '로딩 실패', tone: 'orange', badge: '재시도 가능', title: '설정을 불러오지 못했어요', sub: '저장된 알림/개인정보 상태를 모를 때는 낙관적으로 켜진 것처럼 표시하지 않습니다.', rule: 'honest state', detail: '마지막 동기화 시간과 재시도 버튼을 함께 노출합니다.', cta: '다시 불러오기', icon: 'clock' },
];

const Wave21DPublicStateCases = [
  { id: 'logged-out', chip: '비로그인 한계', tone: 'orange', badge: 'LOGIN REQUIRED', title: '계속하려면 로그인이 필요해요', sub: '둘러보기는 유지하되 신청, 저장, 채팅 CTA는 로그인 게이트를 통과해야 합니다.', rule: 'CTA limit', detail: '볼 수 있는 정보와 로그인 후 가능한 행동을 명확히 분리합니다.', cta: '로그인하고 계속', icon: 'shield' },
  { id: 'private-profile', chip: '비공개 프로필', tone: 'grey', badge: 'PRIVATE', title: '비공개 프로필이에요', sub: '이름, 팀, 활동 기록은 숨기고 공유 가능한 공개 신호만 남깁니다.', rule: 'privacy first', detail: '소유자, 팀원, 외부 방문자별 노출 범위를 나눕니다.', cta: '공개 범위 보기', icon: 'shield' },
  { id: 'faq-empty', chip: 'FAQ 없음', tone: 'orange', badge: '검색 결과 없음', title: '검색 결과가 없어요', sub: '빈 결과는 막다른 길이 아니라 카테고리 이동과 문의 작성으로 이어져야 합니다.', rule: 'empty recovery', detail: '검색어를 보존하고 추천 질문을 노출합니다.', cta: '문의 작성하기', icon: 'chat' },
  { id: 'offer-ended', chip: '가격 종료', tone: 'red', badge: 'OFFER ENDED', title: '종료된 혜택이에요', sub: '프로모션 카드가 남아 있어도 구독 CTA는 막고 현재 요금제만 표시합니다.', rule: 'pricing truth', detail: '종료 일시, 대체 혜택, 현재 가격을 숫자로 남깁니다.', cta: '현재 요금 보기', icon: 'money' },
  { id: 'service-error', chip: '공개 오류', tone: 'red', badge: 'ERROR', title: '페이지를 불러오지 못했어요', sub: '마케팅 페이지라도 오류, 네트워크 실패, 지역 제한은 별도 상태로 보여줍니다.', rule: 'public fallback', detail: '홈, 가이드, 문의로 복구할 수 있어야 합니다.', cta: '다시 시도', icon: 'close' },
];

const SettingsStateEdgeBoard = () => {
  const [active, setActive] = React.useState('os-permission');
  const current = Wave21DSettingsStateCases.find((item) => item.id === active) || Wave21DSettingsStateCases[0];
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 92 }}>
        <Wave21DHeader badge="SETTINGS STATES" tone="blue" title="설정/약관 상태 UI" sub="설정은 저장 상태, OS 권한, 법적 버전, 인증 분기를 같은 언어로 설명해야 합니다."/>
        <div style={{ padding: '16px 20px 0', display: 'flex', gap: 8, overflowX: 'auto' }}>
          {Wave21DSettingsStateCases.map((item) => <HapticChip key={item.id} active={active === item.id} onClick={() => setActive(item.id)}>{item.chip}</HapticChip>)}
        </div>
        <div style={{ padding: '0 20px' }}>
          <Wave21DStateCard item={current}/>
          <Card pad={0} style={{ marginTop: 14 }}>
            <ListItem title="알림 설정" sub="매치·레슨·장터·마케팅 채널" trailing={current.id === 'os-permission' ? '권한 필요' : '저장됨'} chev/>
            <ListItem title="개인정보 및 약관" sub="개인정보 처리방침 v2026.04" trailing={current.id === 'legal-update' ? '업데이트' : '최신'} chev/>
          </Card>
        </div>
        <BottomNav active="profile"/>
      </div>
    </Phone>
  );
};

const SettingsNotificationPermissionBoard = () => {
  const [channel, setChannel] = React.useState('매치');
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 24 }}>
        <Wave21DHeader badge="NOTIFICATION PERMISSION" tone="orange" title="OS 알림 권한 분리" sub="앱 내 채널 토글과 OS 권한을 분리해, 사용자가 왜 알림을 받지 못하는지 즉시 알 수 있게 합니다."/>
        <div style={{ padding: 20 }}>
          <Card pad={18}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <Badge tone="orange" size="sm">OS 권한 꺼짐</Badge>
                <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.25, marginTop: 12 }}>기기 설정에서<br/>알림을 허용해주세요</div>
              </div>
              <div style={{ width: 52, height: 52, borderRadius: 18, background: 'var(--orange50)', color: 'var(--orange500)', display: 'grid', placeItems: 'center' }}>
                <Icon name="bell" size={24}/>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 12 }}>채널 설정은 저장되어 있지만, OS 권한이 꺼져 있어 실제 푸시는 발송되지 않습니다.</div>
            <Wave21DActionButton style={{ marginTop: 16 }}>기기 설정 열기</Wave21DActionButton>
          </Card>
          <Card pad={16} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>채널별 알림</div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 12 }}>
              {['매치', '팀', '레슨', '장터', '마케팅'].map((item) => <HapticChip key={item} active={channel === item} onClick={() => setChannel(item)}>{item}</HapticChip>)}
            </div>
            <div style={{ marginTop: 8 }}>
              <Wave21DToggleRow title={`${channel} 중요 알림`} sub="참가 확정, 취소, 일정 변경" on/>
              <Wave21DToggleRow title={`${channel} 추천 알림`} sub="내 지역과 레벨에 맞는 새 항목" on={channel !== '마케팅'} disabled={channel === '마케팅'}/>
              <Wave21DToggleRow title="야간 방해 금지" sub="오후 10시부터 오전 8시까지 요약 발송" on={false}/>
            </div>
          </Card>
          <Toast type="error" msg="OS 권한이 꺼져 있어 푸시를 보낼 수 없어요."/>
        </div>
      </div>
    </Phone>
  );
};

const SettingsDestructiveConfirmBoard = () => (
  <Phone>
    <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 116 }}>
      <Wave21DHeader badge="DESTRUCTIVE CONFIRM" tone="red" title="탈퇴/초기화 확인" sub="파괴적 액션은 영향 범위, 보류 조건, 최종 확인 입력을 한 흐름에 둡니다."/>
      <div style={{ padding: 20, display: 'grid', gap: 12 }}>
        <Card pad={18}>
          <Badge tone="red" size="sm">계정 삭제</Badge>
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.25, marginTop: 12 }}>삭제하면 복구할 수 없어요</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 16 }}>
            <KPIStat label="예약" value={2}/>
            <KPIStat label="분쟁" value={1}/>
            <KPIStat label="정산" value="대기"/>
          </div>
          <div style={{ marginTop: 16, padding: 13, borderRadius: 14, background: 'var(--red50)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red500)' }}>삭제 불가 조건</div>
            <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.45, marginTop: 4 }}>진행 중인 예약과 분쟁이 있어 계정 삭제를 진행할 수 없습니다.</div>
          </div>
        </Card>
        {[
          ['진행 중인 매치 취소', '참가 확정된 매치 2건을 먼저 취소하거나 경기 완료 후 다시 시도하세요.', '필수', 'red'],
          ['분쟁 답변 대기', '장터 거래 분쟁 1건이 운영자 검토 중입니다.', '보류', 'orange'],
          ['팀 소유권 이전', '운영 중인 팀의 소유권을 다른 멤버에게 넘겨야 합니다.', '필수', 'red'],
          ['삭제 문구 입력', '마지막 단계에서 “계정 삭제”를 직접 입력해야 CTA가 활성화됩니다.', '확인', 'grey'],
        ].map(([title, sub, action, tone]) => (
          <Card key={title} pad={14}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 4 }}>{sub}</div>
              </div>
              <Badge tone={tone} size="sm">{action}</Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 20px 24px', background: 'rgba(255,255,255,.96)', borderTop: '1px solid var(--border)' }}>
      <Wave21DActionButton disabled>삭제 조건을 먼저 해결해주세요</Wave21DActionButton>
    </div>
  </Phone>
);

const SettingsLegalVersionBoard = () => (
  <Phone>
    <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 24 }}>
      <Wave21DHeader badge="LEGAL VERSION" tone="blue" title="약관 버전 업데이트" sub="필수 약관, 선택 약관, 개인정보 처리방침의 버전과 동의 일시를 분리합니다."/>
      <div style={{ padding: 20, display: 'grid', gap: 12 }}>
        <Card pad={18}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <Badge tone="blue" size="sm">v2026.04</Badge>
              <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.25, marginTop: 12 }}>개인정보 처리방침이<br/>변경됐어요</div>
            </div>
            <NumberDisplay value="04.25" unit="" size={30} sub="시행일"/>
          </div>
          <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
            <Wave21DStep step="1" title="변경 요약" sub="위치 기반 추천과 알림 분석 항목을 추가합니다." active/>
            <Wave21DStep step="2" title="이전 버전" sub="v2026.01 문서와 비교해 볼 수 있습니다."/>
            <Wave21DStep step="3" title="동의 기록" sub="필수 약관은 동의 후 앱을 계속 사용할 수 있습니다."/>
          </div>
        </Card>
        <Card pad={0}>
          <ListItem title="서비스 이용약관" sub="v2026.04 · 필수" trailing="동의 필요" chev/>
          <ListItem title="개인정보 처리방침" sub="v2026.04 · 필수" trailing="새 버전" chev/>
          <ListItem title="마케팅 수신 동의" sub="v2025.12 · 선택" trailing="미동의" chev/>
        </Card>
      </div>
    </div>
  </Phone>
);

const SettingsControlInteractionBoard = () => {
  const [tab, setTab] = React.useState('계정');
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 116 }}>
        <Wave21DHeader badge="CONTROL STATES" tone="blue" title="설정 컨트롤 상태" sub="토글, 저장 버튼, 로그아웃, 계정 삭제 같은 설정 컨트롤의 default/loading/disabled/error 상태입니다."/>
        <div style={{ padding: 20 }}>
          <Card pad={16}>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
              {['계정', '알림', '개인정보', '약관'].map((item) => <HapticChip key={item} active={tab === item} onClick={() => setTab(item)}>{item}</HapticChip>)}
            </div>
          </Card>
          <Card pad={16} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{tab} 컨트롤</div>
            <Wave21DToggleRow title="중요 알림" sub="확정, 취소, 결제 실패는 항상 우선 표시" on/>
            <Wave21DToggleRow title="공개 프로필" sub="닉네임, 종목, 레벨만 공개" on={tab !== '개인정보'} disabled={tab === '개인정보'}/>
            <Wave21DToggleRow title="마케팅 수신" sub="이벤트와 혜택 안내" on={false}/>
          </Card>
          <Card pad={16} style={{ marginTop: 14 }}>
            <div style={{ display: 'grid', gap: 9 }}>
              {[
                ['저장하기', 'primary', false],
                ['저장 중...', 'loading', true],
                ['변경 사항 없음', 'disabled', true],
                ['로그아웃', 'secondary', false],
                ['계정 삭제', 'danger', false],
              ].map(([title, type, disabled]) => (
                <Wave21DActionButton key={title} type={type === 'danger' ? 'danger' : type === 'secondary' ? 'secondary' : type === 'primary' ? 'primary' : 'neutral'} disabled={disabled}>{title}</Wave21DActionButton>
              ))}
            </div>
          </Card>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 20px 24px', background: 'rgba(255,255,255,.96)', borderTop: '1px solid var(--border)' }}>
        <Wave21DActionButton>{tab} 설정 저장</Wave21DActionButton>
      </div>
    </Phone>
  );
};

const SettingsMotionContractBoard = () => (
  <div style={{ width: 840, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">SETTINGS MOTION</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>설정 모션 계약</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8 }}>설정은 장식 모션보다 저장 여부, 권한 변경, 위험 액션의 최종 상태가 남는 것이 중요합니다.</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
      {[
        ['토글 변경', 'tap scale 0.97', '낙관 상태 표시', '저장됨/실패 row'],
        ['OS 권한 열기', 'button loading', '앱 복귀 감지', '권한 상태 재검증'],
        ['저장 실패', 'toast error', '변경값 유지', '재시도 CTA'],
        ['탈퇴 confirm', 'sheet rise 260ms', '영향 범위 확인', 'disabled 사유 유지'],
        ['약관 동의', 'check reveal', '버전 row 갱신', '앱 진입 허용'],
        ['404 auth split', 'fade only', '로그인 CTA 고정', '홈/문의 복구'],
      ].map(([trigger, feedback, middle, final], i) => <Wave21DMotionCard key={trigger} i={i} trigger={trigger} feedback={feedback} middle={middle} final={final}/>)}
    </div>
    <div style={{ marginTop: 18, padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Reduced motion</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 5 }}>sheet rise, check reveal, tap scale은 fade-only로 대체합니다. 파괴적 액션은 모션보다 조건과 결과 기록을 우선합니다.</div>
    </div>
  </div>
);

const Wave21DMiniSettingsLayout = ({ mode = 'mobile', dark = false }) => {
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
        <div style={{ fontSize: 12, color: palette.muted, fontWeight: 700 }}>Settings</div>
        <div style={{ width: isMobile ? 92 : 104, height: isMobile ? 92 : 104, borderRadius: 20, background: palette.weak, border: `1px solid ${palette.border}`, display: 'grid', placeItems: 'center', color: dark ? '#c9d2dc' : 'var(--grey600)', marginTop: 14 }}><Icon name="shield" size={32}/></div>
        <div style={{ fontSize: isMobile ? 17 : 19, fontWeight: 700, lineHeight: 1.25, marginTop: 12 }}>알림과 개인정보<br/>상태 관리</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ padding: 14, borderRadius: 16, background: palette.panel, border: `1px solid ${palette.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontSize: 13, color: palette.muted, fontWeight: 700 }}>권한 상태</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6, lineHeight: 1.25 }}>OS 권한 필요</div>
              <div style={{ fontSize: 11, color: palette.muted, marginTop: 4 }}>마지막 저장 2분 전</div>
            </div>
            <Badge tone="orange" size="sm">확인</Badge>
          </div>
          <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
            {['매치 알림', '공개 프로필', '약관 v2026.04'].map((item, i) => (
              <div key={item} style={{ height: 34, borderRadius: 11, background: palette.weak, border: `1px solid ${palette.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', fontSize: 11, fontWeight: 700 }}>
                {item}<span style={{ color: i === 0 ? 'var(--orange500)' : palette.muted }}>{i === 0 ? '권한' : '저장'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {mode === 'desktop' && (
        <div style={{ minWidth: 0 }}>
          {['저장하기', '기기 설정 열기', '약관 보기'].map((item, i) => (
            <button key={item} className="tm-btn tm-btn-sm tm-pressable" style={{ width: '100%', background: i === 0 ? 'var(--blue500)' : palette.weak, color: i === 0 ? 'var(--static-white)' : palette.text, marginBottom: 8 }}>{item}</button>
          ))}
          <div style={{ padding: 10, borderRadius: 12, background: 'var(--red50)', color: 'var(--red500)', fontSize: 11, lineHeight: 1.35, fontWeight: 700 }}>탈퇴/초기화는 확인 시트로 분리</div>
        </div>
      )}
    </div>
  );
};

const SettingsResponsiveBoard = () => (
  <div style={{ width: 1280, height: 820, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">RESPONSIVE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>설정 · Mobile/Tablet/Desktop 재배치</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>모바일은 단일 리스트와 고정 저장 CTA, 태블릿은 설정 그룹 2열, 데스크탑은 좌측 메뉴와 우측 상세 패널로 확장합니다.</div>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginTop: 26 }}>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Mobile 375</div><Wave21DMiniSettingsLayout mode="mobile"/></div>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Tablet 768</div><Wave21DMiniSettingsLayout mode="tablet"/></div>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Desktop 1280</div><Wave21DMiniSettingsLayout mode="desktop"/></div>
    </div>
    <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {[
        ['Mobile', '계정/알림/약관 리스트, 저장 CTA, OS 권한 sheet'],
        ['Tablet', '그룹 카드 2열, 권한 상태와 채널 토글 병렬'],
        ['Desktop', '좌측 설정 메뉴, 우측 상세, 위험 액션 별도 영역'],
      ].map(([title, sub]) => <Card key={title} pad={16}><div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div><div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{sub}</div></Card>)}
    </div>
  </div>
);

const SettingsDarkModeBoard = () => (
  <div style={{ width: 920, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">DARK MODE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>설정 · Light/Dark 비교</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>권한 필요, 저장됨, 법적 업데이트, 위험 액션이 dark mode에서도 같은 우선순위로 읽혀야 합니다.</div>
    <div style={{ display: 'flex', gap: 18, marginTop: 28 }}>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Light</div><Wave21DMiniSettingsLayout mode="tablet"/></div>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Dark</div><Wave21DMiniSettingsLayout mode="tablet" dark/></div>
    </div>
    <div style={{ marginTop: 22, padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>설정 dark 검수 포인트</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
        {['OS 권한 orange', '위험 red', '저장 blue', '약관 버전'].map((item) => <Badge key={item} tone="grey">{item}</Badge>)}
      </div>
    </div>
  </div>
);

const PublicStateEdgeBoard = () => {
  const [active, setActive] = React.useState('logged-out');
  const current = Wave21DPublicStateCases.find((item) => item.id === active) || Wave21DPublicStateCases[0];
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 92 }}>
        <Wave21DHeader badge="PUBLIC STATES" tone="blue" title="공개/마케팅 상태 UI" sub="랜딩, 가격, FAQ, 가이드, 공개 프로필의 비로그인/비공개/종료/빈 상태를 분리합니다."/>
        <div style={{ padding: '16px 20px 0', display: 'flex', gap: 8, overflowX: 'auto' }}>
          {Wave21DPublicStateCases.map((item) => <HapticChip key={item.id} active={active === item.id} onClick={() => setActive(item.id)}>{item.chip}</HapticChip>)}
        </div>
        <div style={{ padding: '0 20px' }}>
          <Wave21DStateCard item={current}/>
          <Card pad={0} style={{ marginTop: 14 }}>
            <ListItem title="주말 풋살 매치" sub="서울 · 초급~중급 · 비로그인 둘러보기" trailing={current.id === 'logged-out' ? '로그인 필요' : '공개'} chev/>
            <ListItem title="민준님의 공개 프로필" sub="종목 3개 · 리뷰 공개 범위 제한" trailing={current.id === 'private-profile' ? '비공개' : '보기'} chev/>
          </Card>
        </div>
        <BottomNav active="home"/>
      </div>
    </Phone>
  );
};

const PublicLoggedOutLimitsBoard = () => (
  <Phone>
    <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 116 }}>
      <Wave21DHeader badge="LOGGED-OUT LIMITS" tone="orange" title="비로그인 CTA 한계" sub="공개 탐색은 허용하되 저장, 신청, 채팅, 결제는 로그인 이후로 명확하게 분기합니다."/>
      <div style={{ padding: 20 }}>
        <Card pad={18}>
          <SectionTitle title="둘러보기 가능한 정보" sub="로그인 전에도 결정을 시작할 수 있는 범위"/>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            {[
              ['목록', '가능', 'blue'],
              ['상세 일부', '가능', 'blue'],
              ['신청', '로그인', 'orange'],
              ['채팅', '로그인', 'orange'],
            ].map(([title, label, tone]) => (
              <div key={title} style={{ padding: 12, borderRadius: 13, background: Wave21DToneBg(tone), border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{title}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: Wave21DToneColor(tone), marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card pad={16} style={{ marginTop: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>CTA 상태</div>
          <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
            {[
              ['무료로 시작하기', 'primary', false],
              ['로그인하고 매치 신청', 'primary', false],
              ['관심 매치 저장 · 로그인 필요', 'disabled', true],
              ['앱에서 계속 보기', 'secondary', false],
            ].map(([title, type, disabled]) => (
              <Wave21DActionButton key={title} type={type === 'primary' ? 'primary' : 'secondary'} disabled={disabled}>{title}</Wave21DActionButton>
            ))}
          </div>
        </Card>
        <Toast msg="로그인 후 저장할 수 있어요."/>
      </div>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 20px 24px', background: 'rgba(255,255,255,.96)', borderTop: '1px solid var(--border)' }}>
      <Wave21DActionButton>로그인하고 계속</Wave21DActionButton>
    </div>
  </Phone>
);

const PublicFaqPricingEdgeBoard = () => (
  <Phone>
    <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 24 }}>
      <Wave21DHeader badge="FAQ / PRICING EDGE" tone="orange" title="FAQ 빈 검색과 종료 혜택" sub="FAQ 검색 결과 없음, 가격 혜택 종료, 지역/기간 제한 같은 공개 페이지의 예외 상태입니다."/>
      <div style={{ padding: 20, display: 'grid', gap: 12 }}>
        <Card pad={18}>
          <div style={{ height: 46, borderRadius: 14, background: 'var(--grey100)', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 8 }}>
            <Icon name="search" size={18} color="var(--text-muted)"/>
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>“빙상 장비 대여 환불”</div>
          </div>
          <div style={{ marginTop: 18, textAlign: 'center', padding: '18px 10px' }}>
            <div style={{ width: 58, height: 58, borderRadius: 20, background: 'var(--grey100)', color: 'var(--text-muted)', display: 'grid', placeItems: 'center', margin: '0 auto' }}><Icon name="chat" size={24}/></div>
            <div style={{ fontSize: 17, fontWeight: 700, marginTop: 12 }}>검색 결과가 없어요</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>검색어를 유지하고 결제·환불 카테고리와 문의 작성을 제안합니다.</div>
          </div>
        </Card>
        <Card pad={18}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div>
              <Badge tone="red" size="sm">혜택 종료</Badge>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 10 }}>Plus 첫 달 0원</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5 }}>2026.04.24 23:59 종료</div>
            </div>
            <NumberDisplay value={4900} unit="원" size={28} sub="현재 가격"/>
          </div>
          <Wave21DActionButton disabled style={{ marginTop: 16 }}>종료된 혜택</Wave21DActionButton>
        </Card>
        {[
          ['카테고리 추천', '결제·환불, 레슨, 장터 FAQ를 추천합니다.', 'FAQ', 'blue'],
          ['문의 전환', '빈 검색에서 고객센터 문의로 이동합니다.', '문의', 'orange'],
          ['대체 요금 표시', '종료 혜택 대신 현재 구독 가격을 보여줍니다.', '가격', 'red'],
        ].map(([title, sub, action, tone]) => (
          <Card key={title} pad={14}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div><div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div><div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 4 }}>{sub}</div></div>
              <Badge tone={tone} size="sm">{action}</Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
  </Phone>
);

const PublicProfilePrivacyBoard = () => (
  <Phone>
    <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 24 }}>
      <Wave21DHeader badge="PROFILE PRIVACY" tone="grey" title="공개 프로필 개인정보" sub="외부 방문자, 로그인 사용자, 본인에게 보이는 정보를 단계적으로 분리합니다."/>
      <div style={{ padding: 20 }}>
        <Card pad={18}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 54, height: 54, borderRadius: 18, background: 'var(--grey100)', display: 'grid', placeItems: 'center', color: 'var(--grey600)' }}><Icon name="people" size={24}/></div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>민준</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>축구 · 풋살 · 테니스</div>
            </div>
            <Badge tone="grey" size="sm">부분 공개</Badge>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 16 }}>
            <KPIStat label="리뷰" value="비공개"/>
            <KPIStat label="팀" value="3"/>
            <KPIStat label="매너" value="4.8"/>
          </div>
        </Card>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {[
            ['외부 방문자', '닉네임, 대표 종목, 공개 배지만 표시합니다.', '제한', 'grey'],
            ['로그인 사용자', '리뷰 수와 매너 점수는 보이지만 상세 활동 내역은 숨깁니다.', '일부', 'orange'],
            ['팀 멤버', '소속 팀 일정과 포지션 정보만 추가로 볼 수 있습니다.', '팀', 'blue'],
            ['본인', '공개 범위 변경과 미리보기를 같은 화면에서 제공합니다.', '관리', 'green'],
          ].map(([title, sub, action, tone]) => (
            <Card key={title} pad={14}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div><div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 4 }}>{sub}</div></div>
                <Badge tone={tone} size="sm">{action}</Badge>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  </Phone>
);

const PublicControlInteractionBoard = () => {
  const [topic, setTopic] = React.useState('FAQ');
  return (
    <Phone>
      <div style={{ flex: 1, background: 'var(--grey50)', overflow: 'auto', paddingBottom: 116 }}>
        <Wave21DHeader badge="PUBLIC CONTROLS" tone="blue" title="공개 페이지 컨트롤" sub="랜딩 CTA, FAQ 검색, 가격 토글, 공개 프로필 공유의 상태를 하나의 컨트롤 언어로 맞춥니다."/>
        <div style={{ padding: 20 }}>
          <Card pad={16}>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
              {['FAQ', '가격', '가이드', '프로필'].map((item) => <HapticChip key={item} active={topic === item} onClick={() => setTopic(item)}>{item}</HapticChip>)}
            </div>
          </Card>
          <Card pad={16} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{topic} 입력/선택 상태</div>
            <div style={{ height: 46, borderRadius: 14, background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 8, marginTop: 12 }}>
              <Icon name="search" size={18} color="var(--text-muted)"/>
              <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>{topic === 'FAQ' ? '질문을 검색하세요' : topic === '가격' ? '월간 / 연간 선택' : '키워드 입력'}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
              {['전체', '결제·환불', '레슨', '장터'].map((item, i) => (
                <Wave21DActionButton key={item} type={i === 0 ? 'primary' : 'secondary'} size="sm">{item}</Wave21DActionButton>
              ))}
            </div>
          </Card>
          <Card pad={16} style={{ marginTop: 14 }}>
            <div style={{ display: 'grid', gap: 9 }}>
              {[
                ['무료로 시작하기', 'primary', false],
                ['공유 링크 복사', 'secondary', false],
                ['신청하기 · 로그인 필요', 'disabled', true],
                ['종료된 혜택', 'disabled', true],
              ].map(([title, type, disabled]) => (
                <Wave21DActionButton key={title} type={type === 'primary' ? 'primary' : 'secondary'} disabled={disabled}>{title}</Wave21DActionButton>
              ))}
            </div>
          </Card>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 20px 24px', background: 'rgba(255,255,255,.96)', borderTop: '1px solid var(--border)' }}>
        <Wave21DActionButton>{topic} 계속 보기</Wave21DActionButton>
      </div>
    </Phone>
  );
};

const PublicMotionContractBoard = () => (
  <div style={{ width: 840, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">PUBLIC MOTION</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>공개 페이지 모션 계약</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8 }}>마케팅 모션은 전환을 돕는 피드백만 남기고, 정보 탐색을 방해하지 않습니다.</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
      {[
        ['랜딩 CTA', 'tap scale 0.97', '로그인 게이트', '계속 경로 유지'],
        ['FAQ 검색', 'input focus', '결과 count 갱신', 'empty recovery'],
        ['요금제 토글', 'chip active', '가격 숫자 갱신', '현재 조건 표시'],
        ['혜택 종료', 'red banner fade', 'CTA disabled', '대체 가격 제안'],
        ['프로필 공유', 'button loading', 'copied toast', '공개 범위 표시'],
        ['가이드 이동', 'card press', 'detail push', 'back context 유지'],
      ].map(([trigger, feedback, middle, final], i) => <Wave21DMotionCard key={trigger} i={i} trigger={trigger} feedback={feedback} middle={middle} final={final}/>)}
    </div>
    <div style={{ marginTop: 18, padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Reduced motion</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 5 }}>hero reveal, card push, copied toast는 fade-only로 대체합니다. 비로그인/혜택 종료는 애니메이션보다 상태 문구와 CTA 제한이 우선입니다.</div>
    </div>
  </div>
);

const Wave21DMiniPublicLayout = ({ mode = 'mobile', dark = false }) => {
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
        <div style={{ fontSize: 12, color: palette.muted, fontWeight: 700 }}>Public</div>
        <div style={{ fontSize: isMobile ? 23 : 26, fontWeight: 800, lineHeight: 1.15, marginTop: 18 }}>내 주변<br/>운동 시작</div>
        <div style={{ fontSize: 12, color: palette.muted, lineHeight: 1.45, marginTop: 10 }}>비로그인도 둘러보고, 신청은 로그인 후 이어집니다.</div>
        <Wave21DActionButton size="sm" style={{ marginTop: 16 }}>무료로 시작</Wave21DActionButton>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ padding: 14, borderRadius: 16, background: palette.panel, border: `1px solid ${palette.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontSize: 13, color: palette.muted, fontWeight: 700 }}>FAQ / Pricing</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6, lineHeight: 1.25 }}>검색 결과 없음</div>
              <div style={{ fontSize: 11, color: palette.muted, marginTop: 4 }}>문의로 이어가기</div>
            </div>
            <Badge tone="orange" size="sm">복구</Badge>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
            <div style={{ padding: 10, borderRadius: 12, background: palette.weak, border: `1px solid ${palette.border}` }}>
              <div style={{ fontSize: 11, color: palette.muted }}>Plus</div>
              <div className="tab-num" style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>4,900원</div>
            </div>
            <div style={{ padding: 10, borderRadius: 12, background: palette.weak, border: `1px solid ${palette.border}` }}>
              <div style={{ fontSize: 11, color: palette.muted }}>공개범위</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>제한</div>
            </div>
          </div>
        </div>
      </div>
      {mode === 'desktop' && (
        <div style={{ minWidth: 0 }}>
          {['로그인하고 신청', 'FAQ 문의', '프로필 공유'].map((item, i) => (
            <button key={item} className="tm-btn tm-btn-sm tm-pressable" style={{ width: '100%', background: i === 0 ? 'var(--blue500)' : palette.weak, color: i === 0 ? 'var(--static-white)' : palette.text, marginBottom: 8 }}>{item}</button>
          ))}
          <div style={{ padding: 10, borderRadius: 12, background: 'var(--orange50)', color: 'var(--orange500)', fontSize: 11, lineHeight: 1.35, fontWeight: 700 }}>비로그인 CTA 제한과 공개 범위 유지</div>
        </div>
      )}
    </div>
  );
};

const PublicResponsiveBoard = () => (
  <div style={{ width: 1280, height: 820, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">RESPONSIVE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>공개 · Mobile/Tablet/Desktop 재배치</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>모바일은 CTA와 핵심 설명, 태블릿은 FAQ/가격 미리보기, 데스크탑은 중앙 콘텐츠와 우측 전환 레일로 확장합니다.</div>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginTop: 26 }}>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Mobile 375</div><Wave21DMiniPublicLayout mode="mobile"/></div>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Tablet 768</div><Wave21DMiniPublicLayout mode="tablet"/></div>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Desktop 1280</div><Wave21DMiniPublicLayout mode="desktop"/></div>
    </div>
    <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {[
        ['Mobile', '짧은 가치 제안, CTA, FAQ/가격 진입'],
        ['Tablet', '랜딩/FAQ/가격을 두 패널로 병렬 표시'],
        ['Desktop', '중앙 콘텐츠, 우측 CTA 레일, 공개 프로필 미리보기'],
      ].map(([title, sub]) => <Card key={title} pad={16}><div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div><div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>{sub}</div></Card>)}
    </div>
  </div>
);

const PublicDarkModeBoard = () => (
  <div style={{ width: 920, height: 812, background: 'var(--bg)', fontFamily: 'var(--font)', padding: 28, overflow: 'hidden' }}>
    <Badge tone="blue">DARK MODE</Badge>
    <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>공개 · Light/Dark 비교</div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>비로그인 제한, FAQ 빈 검색, 가격 종료, 비공개 프로필이 dark mode에서도 과장 없이 읽혀야 합니다.</div>
    <div style={{ display: 'flex', gap: 18, marginTop: 28 }}>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Light</div><Wave21DMiniPublicLayout mode="tablet"/></div>
      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Dark</div><Wave21DMiniPublicLayout mode="tablet" dark/></div>
    </div>
    <div style={{ marginTop: 22, padding: 16, borderRadius: 16, background: 'var(--grey50)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>공개 dark 검수 포인트</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
        {['CTA blue', '혜택 red', 'FAQ empty', 'privacy grey'].map((item) => <Badge key={item} tone="grey">{item}</Badge>)}
      </div>
    </div>
  </div>
);

Object.assign(window, {
  SettingsStateEdgeBoard,
  SettingsNotificationPermissionBoard,
  SettingsDestructiveConfirmBoard,
  SettingsLegalVersionBoard,
  SettingsControlInteractionBoard,
  SettingsMotionContractBoard,
  SettingsResponsiveBoard,
  SettingsDarkModeBoard,
  PublicStateEdgeBoard,
  PublicLoggedOutLimitsBoard,
  PublicFaqPricingEdgeBoard,
  PublicProfilePrivacyBoard,
  PublicControlInteractionBoard,
  PublicMotionContractBoard,
  PublicResponsiveBoard,
  PublicDarkModeBoard,
});
