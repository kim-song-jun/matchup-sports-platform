/* fix32 — M19 공통 플로우·인터랙션 풀 grid.
   ID schema: m19-{mb|tb|dt}-{main|flow|state|components|assets|motion}[-{sub}]
   Light-only. References tokens.jsx + signatures.jsx + screens-forms.jsx.

   Boards (14):
     m19-mb-main          — global shell: bottom nav + global menu (global-nav, global-menu canonical)
     m19-tb-main          — tablet atlas
     m19-dt-main          — desktop atlas
     m19-mb-flow-form     — FormStepShell canonical (FormHead + Field + Input + CTAFooter)
     m19-mb-flow-edit     — edit-flow parity (matches/[id]/edit, teams/[id]/edit shared shell)
     m19-mb-flow-sheet    — bottom sheet variants (filter, action, info)
     m19-mb-flow-confirm  — ConfirmReplaceModal-like alertdialog pattern
     m19-mb-state-loading — skeleton catalog (Skeleton from signatures.jsx)
     m19-mb-state-success — toast variants (Toast from signatures.jsx)
     m19-mb-state-pending — pending (in progress)
     m19-mb-components    — FormHead, Field, Input, Select, Chips, CTAFooter, Toast, Skeleton, BottomSheet, Modal
     m19-mb-assets        — motion duration tokens, easing, semantic colors
     m19-mb-motion        — motion contract + prefers-reduced-motion fallback annotation
     m19-tb-components    — tablet component inventory
*/

const M19_MB_W = 375;
const M19_MB_H = 812;
const M19_TB_W = 768;
const M19_TB_H = 1024;
const M19_DT_W = 1280;
const M19_DT_H = 820;

/* ---------- M19-scoped local atoms ---------- */

const M19ComponentSwatch = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 12, background: 'var(--grey50)', border: '1px solid var(--grey100)' }}>
    <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</div>
  </div>
);

const M19AssetSwatch = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>{children}</div>
  </div>
);

const M19ColorSwatch = ({ token, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
    <div style={{ width: 36, height: 36, borderRadius: 8, background: value, border: '1px solid var(--grey100)' }}/>
    <div className="tm-text-micro tm-tabular">{token}</div>
  </div>
);

/* Step progress bar — scaleX via width (no transition-all) */
const M19StepBar = ({ step, total }) => {
  const pct = Math.round((step / total) * 100);
  return (
    <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>{step} / {total} 단계</div>
        <div className="tm-text-micro tm-tabular" style={{ color: 'var(--blue500)', fontWeight: 700 }}>{pct}%</div>
      </div>
      <div style={{ height: 4, background: 'var(--grey150)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: 'var(--blue500)',
          borderRadius: 999,
          transition: 'width var(--dur-slow) var(--ease-out-quint)',
        }}/>
      </div>
    </div>
  );
};

/* Global menu item row */
const M19MenuRow = ({ label, sub, icon, badge }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '14px 20px',
    borderBottom: '1px solid var(--grey100)',
    minHeight: 44,
  }}>
    <div style={{
      width: 40, height: 40, borderRadius: 12,
      background: 'var(--grey100)', display: 'grid', placeItems: 'center', flexShrink: 0,
    }}>
      <Icon name={icon} size={20} color="var(--text-muted)" stroke={1.8}/>
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{label}</div>
      {sub && <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
    {badge && <Badge tone="blue" size="sm">{badge}</Badge>}
    <Icon name="chevR" size={16} color="var(--text-caption)" stroke={2}/>
  </div>
);

/* Bottom sheet inner shell — handle + title + content */
const M19BottomSheetShell = ({ title, subtitle, children, peek }) => (
  <div style={{
    position: 'absolute', bottom: 0, left: 0, right: 0,
    background: 'var(--bg)',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    boxShadow: 'var(--sh-4)',
    paddingBottom: 32,
    animation: 'tm-sheet-up var(--dur-slow) var(--ease-out-expo) both',
  }}>
    <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
      <div style={{ width: 36, height: 4, background: 'var(--grey300)', borderRadius: 999 }} aria-hidden="true"/>
    </div>
    {title && (
      <div style={{ padding: '4px 20px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div className="tm-text-body-lg">{title}</div>
          {subtitle && <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 4 }}>{subtitle}</div>}
        </div>
        <button
          className="tm-btn-icon"
          aria-label="닫기"
          style={{ color: 'var(--text-caption)', flexShrink: 0, marginTop: -4 }}
        >
          <Icon name="close" size={20} color="var(--text-caption)" stroke={2}/>
        </button>
      </div>
    )}
    {peek && (
      <div style={{ padding: '4px 20px 8px' }}>
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>peek 상태 — 144px 고정 노출</div>
      </div>
    )}
    <div style={{ padding: '0 20px' }}>{children}</div>
  </div>
);

/* ------------------------------------------------------------------ */
/* m19-mb-main — global shell: bottom nav + global menu               */
/* CANONICAL: global-nav (TabBar), global-menu (topic-grouped list)   */
/* ------------------------------------------------------------------ */
const M19MobileMain = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* App bar */}
      <div style={{
        padding: '12px 20px 8px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
      }}>
        <div>
          <div className="tm-text-body-lg">M19 · 전역 쉘</div>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>global-nav · global-menu canonical</div>
        </div>
        <Badge tone="blue" size="sm">m19-mb-main</Badge>
      </div>

      {/* Global menu topic-grouped list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Section: 스포츠 활동 */}
        <div style={{ padding: '16px 20px 6px' }}>
          <div className="tm-text-micro" style={{ color: 'var(--text-muted)', letterSpacing: '0.04em' }}>스포츠 활동</div>
        </div>
        <M19MenuRow label="개인 매치"    sub="종목별 매치 참가·개설"    icon="soccer"   badge="NEW"/>
        <M19MenuRow label="팀 매칭"      sub="팀 vs 팀 경기 신청"      icon="trophy"/>
        <M19MenuRow label="레슨"         sub="코치·아카데미 수강"       icon="ticket"/>
        <M19MenuRow label="용병"         sub="경기 인원 채우기"         icon="swords"/>
        <M19MenuRow label="대회"         sub="리그·토너먼트 참가"       icon="star"/>

        {/* Section: 마켓 & 시설 */}
        <div style={{ padding: '16px 20px 6px' }}>
          <div className="tm-text-micro" style={{ color: 'var(--text-muted)', letterSpacing: '0.04em' }}>마켓 & 시설</div>
        </div>
        <M19MenuRow label="장터"         sub="중고 장비 사고팔기"       icon="store"/>
        <M19MenuRow label="장비 대여"    sub="단기 장비 빌리기"         icon="filter"/>
        <M19MenuRow label="시설 예약"    sub="구장·코트·센터 예약"      icon="pin"/>

        {/* Section: 커뮤니티 */}
        <div style={{ padding: '16px 20px 6px' }}>
          <div className="tm-text-micro" style={{ color: 'var(--text-muted)', letterSpacing: '0.04em' }}>커뮤니티</div>
        </div>
        <M19MenuRow label="채팅"         sub="팀 · 매칭 대화"           icon="chat"/>
        <M19MenuRow label="알림"         sub="매치·결제·신청 소식"      icon="bell"/>
      </div>

      {/* Bottom nav — TabBar canonical */}
      <TabBar active="home"/>
    </div>
  </Phone>
);

/* ------------------------------------------------------------------ */
/* m19-tb-main — tablet atlas                                          */
/* ------------------------------------------------------------------ */
const M19TabletMain = () => (
  <div style={{ width: M19_TB_W, height: M19_TB_H, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column' }}>
    <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div className="tm-text-heading">M19 공통 플로우 · 태블릿</div>
        <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>form shell · edit-flow parity · bottom sheet · toast · skeleton</div>
      </div>
      <Badge tone="blue">m19-tb-main</Badge>
    </div>

    <div style={{ flex: 1, padding: '24px 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, overflowY: 'auto' }}>
      {[
        { title: 'FormHead canonical', sub: 'step counter (N/total) · progress bar · h1 제목 · back ‹', tone: 'blue' },
        { title: 'Field + Input + CTAFooter', sub: '라벨 + required * · input h52 · hint · error · blur 16px backdrop CTA', tone: 'blue' },
        { title: 'Select + Chips', sub: 'Select h52 ▾ trigger · Chips HapticChip gap-6 flex-wrap', tone: 'blue' },
        { title: 'BottomSheet 3종', sub: 'filter (chip group) · action (list rows) · info (confirm CTA)', tone: 'grey' },
        { title: 'Toast · signatures.jsx', sub: 'info / success / error · abs bottom 90 · minH 44 · tm-animate-enter', tone: 'green' },
        { title: 'Skeleton · signatures.jsx', sub: 'w h r mb props · shimmer 1.4s ease infinite', tone: 'grey' },
        { title: 'alertdialog confirm', sub: 'role=alertdialog · aria-modal · red icon · 교체 / 취소 순서', tone: 'red' },
        { title: 'edit-flow parity', sub: '기존 값 prefill · prefill notice banner · 저장 / 변경사항 취소 CTA', tone: 'blue' },
        { title: 'pending state', sub: 'disabled CTA + step indicator · spinner loop · 진행 중 badge', tone: 'orange' },
        { title: 'prefers-reduced-motion', sub: '0.01ms duration · iteration-count: 1 · scroll-behavior: auto', tone: 'grey' },
      ].map((item) => (
        <div key={item.title} style={{
          padding: 16, borderRadius: 16,
          background: 'var(--bg)', border: '1px solid var(--border)',
        }}>
          <Badge tone={item.tone} size="sm">{item.title}</Badge>
          <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 8 }}>{item.sub}</div>
        </div>
      ))}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* m19-dt-main — desktop atlas                                         */
/* ------------------------------------------------------------------ */
const M19DesktopMain = () => (
  <div style={{ width: M19_DT_W, height: M19_DT_H, background: 'var(--bg)', fontFamily: 'var(--font)', display: 'grid', gridTemplateColumns: '260px 1fr' }}>
    <aside style={{ borderRight: '1px solid var(--border)', padding: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Badge tone="blue" size="sm">m19-dt-main</Badge>
      <div className="tm-text-subhead" style={{ marginTop: 4 }}>M19 공통 플로우</div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)' }}>전 모듈 공통 인터랙션 · edit-flow parity</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
        {[
          ['form-step-shell',    '폼 단계 쉘 · FormHead'],
          ['cta-footer',        'CTAFooter · blur backdrop'],
          ['bottom-sheet-3v',   '바텀시트 filter/action/info'],
          ['toast-variants',    '토스트 3종 · signatures'],
          ['skeleton-catalog',  '스켈레톤 6종 · signatures'],
          ['alertdialog',       'ConfirmReplaceModal-like'],
          ['edit-parity',       'prefill + cancel guard'],
          ['push-transition',   '페이지 전환 translateX'],
          ['reduced-motion',    'prefers-reduced-motion'],
        ].map(([id, label]) => (
          <div key={id} style={{
            padding: '10px 12px', borderRadius: 10,
            background: 'var(--grey50)', border: '1px solid var(--grey100)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--blue500)', flexShrink: 0 }} aria-hidden="true"/>
            <div className="tm-text-label">{label}</div>
          </div>
        ))}
      </div>
    </aside>

    <main style={{ padding: 32, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: 'auto auto auto', gap: 20, overflowY: 'auto', alignContent: 'start' }}>
      {/* FormHead canonical preview */}
      <div style={{ gridColumn: '1 / 3', padding: 24, borderRadius: 16, background: 'var(--bg)', border: '1px solid var(--border)' }}>
        <div className="tm-text-label" style={{ marginBottom: 12 }}>FormHead + Field + M19StepBar · step 2/3</div>
        <M19StepBar step={2} total={3}/>
        <div style={{ marginTop: 20, display: 'grid', gap: 16 }}>
          <Field label="매치 제목" required>
            <Input value="강남 풋살 6vs6"/>
          </Field>
          <Field label="날짜" required>
            <Input value="2026년 5월 10일 (일) 19:00"/>
          </Field>
        </div>
      </div>

      {/* Toast catalog */}
      <div style={{ padding: 24, borderRadius: 16, background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="tm-text-label" style={{ marginBottom: 4 }}>Toast · 3 variants (signatures.jsx)</div>
        <Toast msg="저장되었어요" type="success"/>
        <Toast msg="검토 중이에요" type="info"/>
        <Toast msg="저장 실패" type="error"/>
      </div>

      {/* Skeleton preview */}
      <div style={{ padding: 24, borderRadius: 16, background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="tm-text-label" style={{ marginBottom: 4 }}>Skeleton · card (signatures.jsx)</div>
        {[0, 1].map((i) => (
          <div key={i} style={{ padding: 16, borderRadius: 12, border: '1px solid var(--grey100)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Skeleton w="40%" h={14} r={99}/>
            <Skeleton w="80%" h={18}/>
            <Skeleton w="60%" h={12}/>
          </div>
        ))}
      </div>

      {/* CTAFooter preview */}
      <div style={{ padding: 24, borderRadius: 16, background: 'var(--bg)', border: '1px solid var(--border)', position: 'relative', minHeight: 160, overflow: 'hidden' }}>
        <div className="tm-text-label" style={{ marginBottom: 12 }}>CTAFooter · active / disabled</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SBtn size="lg" full>다음으로</SBtn>
          <SBtn size="lg" full disabled aria-disabled="true">다음으로 (disabled)</SBtn>
          <SBtn variant="neutral" size="md" full>취소</SBtn>
        </div>
      </div>

      {/* BottomSheet preview */}
      <div style={{ padding: 24, borderRadius: 16, background: 'var(--bg)', border: '1px solid var(--border)' }}>
        <div className="tm-text-label" style={{ marginBottom: 12 }}>BottomSheet · handle + 종목 선택</div>
        <div style={{ background: 'var(--grey50)', borderRadius: 12, border: '1px solid var(--grey100)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 8px' }}>
            <div style={{ width: 36, height: 4, background: 'var(--grey300)', borderRadius: 999 }} aria-hidden="true"/>
          </div>
          <div style={{ padding: '4px 16px 16px' }}>
            <div className="tm-text-body-lg" style={{ marginBottom: 8 }}>종목 선택</div>
            {['풋살', '농구', '배드민턴'].map((s, i) => (
              <div key={s} style={{ padding: '10px 0', borderBottom: i < 2 ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 }}>
                <div className="tm-text-body">{s}</div>
                <Icon name="chevR" size={16} color="var(--text-caption)" stroke={2}/>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* alertdialog preview */}
      <div style={{ padding: 24, borderRadius: 16, background: 'var(--bg)', border: '1px solid var(--border)' }}>
        <div className="tm-text-label" style={{ marginBottom: 12 }}>alertdialog · destructive confirm</div>
        <div role="alertdialog" aria-modal="true" style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--red50)', color: 'var(--red500)',
            display: 'grid', placeItems: 'center', margin: '0 auto 12px',
          }}>
            <Icon name="shield" size={24} color="var(--red500)" stroke={2}/>
          </div>
          <div className="tm-text-body-lg">정말 삭제할까요?</div>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 4 }}>이 작업은 되돌릴 수 없어요</div>
          <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
            <SBtn variant="danger" size="md" full>삭제</SBtn>
            <SBtn variant="outline" size="md" full>취소</SBtn>
          </div>
        </div>
      </div>
    </main>
  </div>
);

/* ------------------------------------------------------------------ */
/* m19-mb-flow-form — FormStepShell canonical (FormHead + Field + CTAFooter) */
/* ------------------------------------------------------------------ */
const M19MobileFlowForm = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* FormHead canonical from screens-forms.jsx */}
      <FormHead title="장소와 시간을 입력해요" step={2} total={3}/>

      {/* Step subtitle */}
      <div style={{ padding: '12px 20px 4px' }}>
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>정확한 정보를 입력하면 더 빠른 매칭이 가능해요</div>
      </div>

      {/* Form body using canonical Field + Input + Select + Chips */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 20px 0', paddingBottom: 100 }}>
        <Field label="구장" required hint="예: 잠실 대정 풋살장">
          <Input placeholder="구장명을 입력하세요"/>
        </Field>
        <Field label="날짜" required>
          <Select placeholder="날짜를 선택하세요"/>
        </Field>
        <Field label="시작 시간" required hint="경기 시간은 최소 1시간이에요">
          <Select placeholder="시작 시간을 선택하세요"/>
        </Field>
        <Field label="최대 인원" required hint="최소 4명 · 최대 22명">
          <Input placeholder="인원을 입력하세요" suffix="명" tabular/>
        </Field>
        <Field label="레벨">
          <Chips options={['입문', '초급', '중급', '상급']} active="초급"/>
        </Field>
      </div>

      {/* CTAFooter canonical from screens-forms.jsx */}
      <CTAFooter primary="다음" secondary="이전"/>
    </div>
  </Phone>
);

/* ------------------------------------------------------------------ */
/* m19-mb-flow-edit — edit-flow parity (matches/[id]/edit, teams/[id]/edit) */
/* ------------------------------------------------------------------ */
const M19MobileFlowEdit = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* FormHead canonical — edit mode (no step progress) */}
      <div style={{ padding: '16px 20px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--grey100)', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <button
            className="tm-pressable"
            style={{ width: 28, height: 28, color: 'var(--grey900)', minHeight: 44, display: 'grid', placeItems: 'center' }}
            aria-label="뒤로 가기"
          >
            <span className="tm-text-heading" style={{ lineHeight: 1 }}>‹</span>
          </button>
          <div style={{ flex: 1 }}/>
          <button
            className="tm-pressable"
            style={{ minHeight: 44, display: 'flex', alignItems: 'center', padding: '0 8px' }}
            aria-label="완료"
          >
            <span className="tm-text-label" style={{ color: 'var(--blue500)' }}>완료</span>
          </button>
        </div>
        <h1 className="tm-text-subhead" style={{ margin: 0, color: 'var(--grey900)' }}>매치 수정</h1>
      </div>

      {/* Prefill notice banner */}
      <div style={{ margin: '12px 20px 0', padding: '10px 14px', borderRadius: 10, background: 'var(--blue50)', border: '1px solid var(--blue100)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="edit" size={16} color="var(--blue500)" stroke={1.8}/>
        <div className="tm-text-caption" style={{ color: 'var(--blue500)' }}>기존 정보가 불러와졌어요 — 수정할 항목만 변경하세요</div>
      </div>

      {/* Prefilled form body — canonical Field + Input */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 0', paddingBottom: 100 }}>
        <Field label="매치 제목" required>
          <Input value="강남 풋살 6vs6"/>
        </Field>
        <Field label="구장" required>
          <Input value="잠실 대정 풋살장"/>
        </Field>
        <Field label="날짜" required>
          <Select value="2026년 5월 10일 (일) 19:00"/>
        </Field>
        <Field label="최대 인원" required hint="현재 3명 참가 중 — 3명 미만으로 줄일 수 없어요">
          <Input value="12" suffix="명" tabular/>
        </Field>
        <Field label="참가비" required hint="1인당 금액 (원)">
          <Input value="17,000" suffix="원" tabular/>
        </Field>
      </div>

      {/* CTAFooter — save + cancel */}
      <CTAFooter primary="저장" secondary="변경사항 취소"/>
    </div>
  </Phone>
);

/* ------------------------------------------------------------------ */
/* m19-mb-flow-sheet — bottom sheet variants (filter, action, info)   */
/* ------------------------------------------------------------------ */
const M19MobileFlowSheet = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Dimmed background */}
      <div style={{ flex: 1, padding: '16px 20px', opacity: 0.32 }}>
        <div className="tm-text-heading">종목 선택</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ height: 80, borderRadius: 12, background: 'var(--grey100)' }}/>
          ))}
        </div>
      </div>

      {/* Backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.36)' }} aria-hidden="true"/>

      {/* Filter variant — chip group */}
      <M19BottomSheetShell title="종목 선택" subtitle="매치에 적용할 종목을 선택하세요">
        {/* Chips filter group */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {[
            { id: 'futsal',     label: '풋살',      color: 'var(--blue500)' },
            { id: 'basketball', label: '농구',      color: 'var(--orange500)' },
            { id: 'badminton',  label: '배드민턴',  color: 'var(--green500)' },
            { id: 'tennis',     label: '테니스',    color: 'var(--purple500)' },
            { id: 'icehockey',  label: '아이스하키', color: 'var(--teal500)' },
          ].map((s, i) => (
            <button
              key={s.id}
              className={`tm-chip${i === 0 ? ' tm-chip-active' : ''}`}
              aria-pressed={i === 0}
              style={i === 0 ? {} : {}}
            >
              <span style={{ width: 8, height: 8, borderRadius: 4, background: s.color, flexShrink: 0, marginRight: 4 }} aria-hidden="true"/>
              {s.label}
            </button>
          ))}
        </div>

        {/* info row */}
        <div style={{ padding: '8px 0', borderTop: '1px solid var(--grey100)', marginBottom: 4 }}>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>종목을 여러 개 선택할 수 있어요</div>
        </div>

        <SBtn size="lg" full style={{ marginTop: 8 }}>선택 완료</SBtn>
      </M19BottomSheetShell>
    </div>
  </Phone>
);

/* ------------------------------------------------------------------ */
/* m19-mb-flow-confirm — ConfirmReplaceModal-like alertdialog         */
/* ------------------------------------------------------------------ */
const M19MobileFlowConfirm = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Dimmed background */}
      <div style={{ flex: 1, opacity: 0.2, padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ height: 72, borderRadius: 12, background: 'var(--grey100)' }}/>
        ))}
      </div>

      {/* Backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.40)' }} aria-hidden="true"/>

      {/* alertdialog — ConfirmReplaceModal pattern */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="m19-confirm-title"
        aria-describedby="m19-confirm-desc"
        style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'calc(100% - 48px)',
          background: 'var(--bg)',
          borderRadius: 20,
          padding: '28px 24px 20px',
          boxShadow: 'var(--sh-4)',
        }}
      >
        {/* Destructive icon */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--red50)',
            display: 'grid', placeItems: 'center',
          }}>
            <Icon name="shield" size={28} color="var(--red500)" stroke={2}/>
          </div>
        </div>

        <div id="m19-confirm-title" className="tm-text-body-lg" style={{ textAlign: 'center', marginBottom: 8 }}>매치를 삭제할까요?</div>
        <div id="m19-confirm-desc" className="tm-text-body" style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: 8 }}>
          이 작업은 되돌릴 수 없어요.
        </div>
        <div className="tm-text-caption" style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: 20 }}>
          참가자 전원에게 취소 알림이 전송됩니다.
        </div>

        {/* Current teams summary (ConfirmReplace pattern) */}
        <div style={{ background: 'var(--grey50)', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
          <div className="tm-text-micro" style={{ color: 'var(--text-muted)', marginBottom: 8 }}>현재 팀 구성</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {['팀 A (6명)', '팀 B (6명)'].map((t) => (
              <div key={t} style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{t}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA — danger first, cancel second (ConfirmReplace order) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SBtn variant="danger" size="lg" full>삭제 · 되돌릴 수 없어요</SBtn>
          <SBtn variant="outline" size="md" full>취소</SBtn>
        </div>
      </div>
    </div>
  </Phone>
);

/* ------------------------------------------------------------------ */
/* m19-mb-state-loading — skeleton catalog (Skeleton from signatures) */
/* ------------------------------------------------------------------ */
const M19MobileStateLoading = () => (
  <Phone>
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div className="tm-text-label" style={{ marginBottom: 10 }}>Card skeleton</div>
        {[0, 1].map((i) => (
          <div key={i} style={{ padding: 16, borderRadius: 16, border: '1px solid var(--grey100)', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Skeleton w="30%" h={18} r={99}/>
              <Skeleton w="12%" h={12}/>
            </div>
            <Skeleton w="75%" h={18}/>
            <Skeleton w="55%" h={13}/>
          </div>
        ))}
      </div>

      <div>
        <div className="tm-text-label" style={{ marginBottom: 10 }}>List row skeleton</div>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--grey100)' }}>
            <Skeleton w={44} h={44} r={12}/>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skeleton w="60%" h={14}/>
              <Skeleton w="40%" h={12}/>
            </div>
          </div>
        ))}
      </div>

      <div>
        <div className="tm-text-label" style={{ marginBottom: 10 }}>Detail hero skeleton</div>
        <Skeleton w="100%" h={180} r={16} mb={12}/>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton w="80%" h={22}/>
          <Skeleton w="50%" h={14}/>
          <Skeleton w="65%" h={14}/>
        </div>
      </div>

      <div>
        <div className="tm-text-label" style={{ marginBottom: 10 }}>Form skeleton</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {['label-a', 'label-b', 'label-c'].map((l) => (
            <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Skeleton w="28%" h={13}/>
              <Skeleton w="100%" h={48} r={12}/>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="tm-text-label" style={{ marginBottom: 10 }}>Profile skeleton</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Skeleton w={56} h={56} r={28}/>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton w="55%" h={17}/>
            <Skeleton w="38%" h={13}/>
          </div>
        </div>
      </div>

      <div>
        <div className="tm-text-label" style={{ marginBottom: 10 }}>Stat skeleton</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ padding: 14, borderRadius: 12, border: '1px solid var(--grey100)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skeleton w="60%" h={11}/>
              <Skeleton w="80%" h={22}/>
            </div>
          ))}
        </div>
      </div>
    </div>
  </Phone>
);

/* ------------------------------------------------------------------ */
/* m19-mb-state-success — success screen + Toast variants             */
/* ------------------------------------------------------------------ */
const M19MobileStateSuccess = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Success confirm screen */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px 24px', gap: 16 }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'var(--green50)', border: '2px solid var(--green500)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="check" size={32} color="var(--green500)" stroke={2.5}/>
        </div>
        <div>
          <div className="tm-text-heading" style={{ textAlign: 'center' }}>매치가 저장됐어요</div>
          <div className="tm-text-body" style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>참가 신청을 기다리는 중이에요</div>
        </div>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <SBtn size="lg" full>매치 보기</SBtn>
          <SBtn variant="ghost" size="md" full>홈으로</SBtn>
        </div>
      </div>

      {/* Toast variant catalog — signatures.jsx Toast */}
      <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="tm-text-label" style={{ marginBottom: 4 }}>Toast · 3 variants (signatures.jsx)</div>
        <Toast msg="저장되었어요" type="success"/>
        <Toast msg="매치 결과를 검토 중이에요" type="info"/>
        <Toast msg="저장에 실패했어요. 다시 시도해주세요" type="error"/>
      </div>
    </div>
  </Phone>
);

/* ------------------------------------------------------------------ */
/* m19-mb-state-pending — pending (in progress)                       */
/* ------------------------------------------------------------------ */
const M19MobileStatePending = () => (
  <Phone>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Processing banner */}
      <div style={{ margin: '20px 20px 0', padding: '14px 16px', borderRadius: 12, background: 'var(--orange50)', border: '1px solid var(--orange500)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
          border: '3px solid var(--orange500)', borderTopColor: 'transparent',
          animation: 'tm-enter-up 0.8s linear infinite',
        }} aria-hidden="true"/>
        <div>
          <div className="tm-text-label" style={{ color: 'var(--orange500)' }}>처리 중이에요</div>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>잠시 기다려 주세요 · 최대 30초</div>
        </div>
      </div>

      {/* In-progress steps */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="tm-text-label" style={{ marginBottom: 4 }}>진행 상태</div>
        {[
          { label: '결제 확인',   done: true  },
          { label: '팀 배정',     done: true  },
          { label: '알림 전송',   done: false, active: true },
          { label: '매치 확정',   done: false },
        ].map((step, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12,
            background: step.active ? 'var(--orange50)' : 'var(--bg)',
            border: `1px solid ${step.active ? 'var(--orange500)' : step.done ? 'var(--green500)' : 'var(--border)'}`,
            minHeight: 44,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: step.done ? 'var(--green50)' : step.active ? 'var(--orange50)' : 'var(--grey100)',
              display: 'grid', placeItems: 'center',
            }}>
              {step.done
                ? <Icon name="check" size={16} color="var(--green500)" stroke={2.5}/>
                : step.active
                  ? <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2.5px solid var(--orange500)', borderTopColor: 'transparent', animation: 'tm-enter-up 0.8s linear infinite' }} aria-hidden="true"/>
                  : <div style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--grey300)' }} aria-hidden="true"/>
              }
            </div>
            <div className="tm-text-body" style={{ color: step.done ? 'var(--text-muted)' : 'var(--text-strong)', flex: 1 }}>{step.label}</div>
            {step.done && <Badge tone="green" size="sm">완료</Badge>}
            {step.active && <Badge tone="orange" size="sm">진행 중</Badge>}
          </div>
        ))}

        {/* Disabled CTA during pending */}
        <div style={{ marginTop: 12 }}>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginBottom: 8 }}>처리 완료 전에는 진행할 수 없어요</div>
          <SBtn size="lg" full disabled aria-disabled="true">다음으로</SBtn>
        </div>
      </div>
    </div>
  </Phone>
);

/* ------------------------------------------------------------------ */
/* m19-mb-components — component inventory (canonical M19 primitives) */
/* ------------------------------------------------------------------ */
const M19ComponentsBoard = ({ viewport }) => {
  const w = viewport === 'mb' ? M19_MB_W : viewport === 'tb' ? M19_TB_W : M19_DT_W;
  const h = viewport === 'mb' ? M19_MB_H : viewport === 'tb' ? M19_TB_H : M19_DT_H;
  return (
    <div style={{ width: w, height: h, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflow: 'hidden' }}>
      <Badge tone="blue" size="sm">{`m19-${viewport || 'mb'}-components`}</Badge>
      <div className="tm-text-subhead" style={{ marginTop: 8 }}>M19 공통 · 사용 컴포넌트</div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>공통 플로우 화면이 사용하는 canonical 컴포넌트 인벤토리</div>
      <div style={{ display: 'grid', gap: 10, marginTop: 14, overflowY: 'auto', height: 'calc(100% - 100px)' }}>

        {/* FormHead */}
        <M19ComponentSwatch label="FormHead · screens-forms.jsx · step counter + progress bar + title">
          <div style={{ width: '100%' }}>
            <FormHead title="장소와 시간을 입력해요" step={2} total={3}/>
          </div>
        </M19ComponentSwatch>

        {/* Field + Input + Select + Chips */}
        <M19ComponentSwatch label="Field + Input + Select + Chips · screens-forms.jsx">
          <div style={{ width: '100%', maxWidth: 280, display: 'flex', flexDirection: 'column' }}>
            <Field label="구장" required hint="예: 잠실 대정 풋살장">
              <Input placeholder="구장명을 입력하세요"/>
            </Field>
            <Field label="종목" required>
              <Chips options={['풋살', '농구', '배드민턴']} active="풋살"/>
            </Field>
          </div>
        </M19ComponentSwatch>

        {/* CTAFooter */}
        <M19ComponentSwatch label="CTAFooter · position absolute · blur 16px backdrop · gap 8 · primary + secondary">
          <div style={{ width: '100%', maxWidth: 280, background: 'rgba(255,255,255,0.95)', borderTop: '1px solid var(--grey100)', padding: '12px 20px 28px', display: 'flex', gap: 8 }}>
            <SBtn variant="neutral" size="lg" style={{ flex: 1 }}>이전</SBtn>
            <SBtn size="lg" style={{ flex: 2 }}>다음</SBtn>
          </div>
        </M19ComponentSwatch>

        {/* BottomSheet */}
        <M19ComponentSwatch label="BottomSheet · handle + title + close · 3 variants: filter, action, info">
          <div style={{ background: 'var(--grey50)', borderRadius: 16, border: '1px solid var(--grey100)', width: '100%', maxWidth: 280, padding: '8px 0 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
              <div style={{ width: 32, height: 4, background: 'var(--grey300)', borderRadius: 999 }} aria-hidden="true"/>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 8px' }}>
              <div className="tm-text-label">종목 선택</div>
              <button className="tm-btn-icon" aria-label="닫기" style={{ color: 'var(--text-caption)' }}>
                <Icon name="close" size={18} color="var(--text-caption)" stroke={2}/>
              </button>
            </div>
            {['풋살', '농구'].map((s, i) => (
              <div key={s} style={{ padding: '10px 16px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', minHeight: 44, display: 'flex', alignItems: 'center' }}>
                <div className="tm-text-body">{s}</div>
              </div>
            ))}
          </div>
        </M19ComponentSwatch>

        {/* Toast — signatures.jsx */}
        <M19ComponentSwatch label="Toast · signatures.jsx · info / success / error · minH 44 · tm-animate-enter">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: 300, position: 'relative' }}>
            <Toast msg="저장됐어요" type="success" visible/>
            <Toast msg="검토 중이에요" type="info" visible/>
            <Toast msg="저장 실패" type="error" visible/>
          </div>
        </M19ComponentSwatch>

        {/* Skeleton — signatures.jsx */}
        <M19ComponentSwatch label="Skeleton · signatures.jsx · w h r mb props · shimmer 1.4s ease infinite">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: 280 }}>
            <Skeleton w="45%" h={12} r={99}/>
            <Skeleton w="80%" h={18}/>
            <Skeleton w="62%" h={13}/>
          </div>
        </M19ComponentSwatch>

        {/* alertdialog pattern */}
        <M19ComponentSwatch label="alertdialog · role=alertdialog + aria-modal + aria-labelledby · 교체/취소 순서">
          <div role="alertdialog" aria-modal="true" style={{ width: '100%', maxWidth: 280, textAlign: 'center', padding: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--red50)', display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>
              <Icon name="shield" size={22} color="var(--red500)" stroke={2}/>
            </div>
            <div className="tm-text-label" style={{ marginBottom: 4 }}>정말 삭제할까요?</div>
            <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginBottom: 12 }}>이 작업은 되돌릴 수 없어요</div>
            <div style={{ display: 'grid', gap: 8 }}>
              <SBtn variant="danger" size="md" full>삭제</SBtn>
              <SBtn variant="outline" size="md" full>취소</SBtn>
            </div>
          </div>
        </M19ComponentSwatch>

      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* m19-tb-components — tablet component inventory                     */
/* ------------------------------------------------------------------ */
const M19TabletComponents = () => (
  <M19ComponentsBoard viewport="tb"/>
);

/* ------------------------------------------------------------------ */
/* m19-mb-assets — motion tokens, easing, semantic colors             */
/* ------------------------------------------------------------------ */
const M19AssetsBoard = ({ viewport }) => {
  const w = viewport === 'mb' ? M19_MB_W : viewport === 'tb' ? M19_TB_W : M19_DT_W;
  const h = viewport === 'mb' ? M19_MB_H : viewport === 'tb' ? M19_TB_H : M19_DT_H;
  return (
    <div style={{ width: w, height: h, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)', overflow: 'hidden' }}>
      <Badge tone="blue" size="sm">{`m19-${viewport || 'mb'}-assets`}</Badge>
      <div className="tm-text-subhead" style={{ marginTop: 8 }}>M19 · 토큰 / 에셋</div>
      <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>공통 플로우 화면의 디자인 토큰 인벤토리</div>
      <div style={{ display: 'grid', gap: 14, marginTop: 14, overflowY: 'auto', height: 'calc(100% - 100px)' }}>

        <M19AssetSwatch label="Motion duration tokens">
          {[
            ['dur-fast', '120ms', 'tap scale'],
            ['dur-base', '180ms', 'color transition'],
            ['dur-slow', '280ms', 'page push / sheet / toast'],
          ].map(([token, ms, use]) => (
            <div key={token} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--grey50)', border: '1px solid var(--grey100)' }}>
              <Badge tone="blue" size="sm">{ms}</Badge>
              <div>
                <div className="tm-text-label">var(--{token})</div>
                <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{use}</div>
              </div>
            </div>
          ))}
        </M19AssetSwatch>

        <M19AssetSwatch label="Easing tokens">
          {[
            ['ease-out-quart', 'cubic-bezier(0.25,1,0.5,1)',  'tap / chip'],
            ['ease-out-quint', 'cubic-bezier(0.22,1,0.36,1)', 'toast enter-up'],
            ['ease-out-expo',  'cubic-bezier(0.16,1,0.3,1)',  'sheet slide-up'],
          ].map(([token, curve, use]) => (
            <div key={token} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 10px', borderRadius: 8, background: 'var(--grey50)', border: '1px solid var(--grey100)' }}>
              <div className="tm-text-label">var(--{token})</div>
              <div className="tm-text-micro tm-tabular" style={{ color: 'var(--text-muted)' }}>{curve}</div>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{use}</div>
            </div>
          ))}
        </M19AssetSwatch>

        <M19AssetSwatch label="Semantic colors · state">
          <M19ColorSwatch token="green500"  value="var(--green500)"/>
          <M19ColorSwatch token="green50"   value="var(--green50)"/>
          <M19ColorSwatch token="red500"    value="var(--red500)"/>
          <M19ColorSwatch token="red50"     value="var(--red50)"/>
          <M19ColorSwatch token="orange500" value="var(--orange500)"/>
          <M19ColorSwatch token="orange50"  value="var(--orange50)"/>
          <M19ColorSwatch token="blue500"   value="var(--blue500)"/>
          <M19ColorSwatch token="blue50"    value="var(--blue50)"/>
          <M19ColorSwatch token="purple500" value="var(--purple500)"/>
          <M19ColorSwatch token="teal500"   value="var(--teal500)"/>
        </M19AssetSwatch>

        <M19AssetSwatch label="Shadows">
          {[['sh-1','var(--sh-1)'],['sh-2','var(--sh-2)'],['sh-4','var(--sh-4)']].map(([t, v]) => (
            <div key={t} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg)', boxShadow: v }}>
              <div className="tm-text-micro">var(--{t})</div>
            </div>
          ))}
        </M19AssetSwatch>

        <M19AssetSwatch label="Control height · form / CTA · min touch target 44px">
          {['sm 40','md 48','lg 56','icon 44'].map((t) => <Badge key={t} tone="grey" size="sm">{t}px</Badge>)}
        </M19AssetSwatch>

        <M19AssetSwatch label="Radius tokens">
          {[['r-sm','8px'],['r-md','12px'],['r-lg','16px'],['r-pill','9999px'],['sheet','20px']].map(([t, v]) => (
            <div key={t} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 32, height: 32, background: 'var(--blue500)', borderRadius: v }} aria-hidden="true"/>
              <div className="tm-text-micro">{t}</div>
            </div>
          ))}
        </M19AssetSwatch>

        <M19AssetSwatch label="Typography · form / flow screens">
          <span className="tm-text-body-lg">body-lg · 폼 제목</span>
          <span className="tm-text-body">body · 안내 문구</span>
          <span className="tm-text-label">label · 필드명</span>
          <span className="tm-text-caption">caption · 힌트·에러</span>
          <span className="tm-text-micro">micro · 단계 표시</span>
        </M19AssetSwatch>

      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* m19-mb-motion — motion contract + prefers-reduced-motion fallback  */
/* ------------------------------------------------------------------ */
const M19MotionBoard = () => (
  <div style={{ width: M19_MB_W, height: M19_MB_H, background: 'var(--bg)', padding: 24, fontFamily: 'var(--font)' }}>
    <Badge tone="blue" size="sm">m19-mb-motion</Badge>
    <div className="tm-text-subhead" style={{ marginTop: 8 }}>M19 · motion contract</div>
    <div className="tm-text-body" style={{ color: 'var(--text-muted)', marginTop: 4 }}>공통 플로우 motion + prefers-reduced-motion 명시</div>
    <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>

      {[
        {
          title: 'Step progress bar',
          sub: 'width 전환 · 280ms · ease-out-quint · no transition-all',
          trailing: 'step',
          tone: 'grey',
        },
        {
          title: 'Page push transition',
          sub: 'translateX(0 → 20px) + opacity → 0 · 280ms · ease-out-expo',
          trailing: 'push',
          tone: 'grey',
        },
        {
          title: 'Sheet slide-up',
          sub: 'translateY(20px → 0) + opacity · 280ms · ease-out-expo · tm-sheet-up keyframe',
          trailing: 'sheet',
          tone: 'grey',
        },
        {
          title: 'Toast enter-up',
          sub: 'translateY(8px → 0) + opacity · 280ms · ease-out-quint · tm-enter-up keyframe',
          trailing: 'toast',
          tone: 'grey',
        },
        {
          title: 'Tap scale (button)',
          sub: 'scale(.98) · 120ms · ease-out-quart · transform only · no layout shift',
          trailing: 'tap',
          tone: 'grey',
        },
        {
          title: 'Skeleton shimmer',
          sub: 'backgroundPosition 200% → 0 · 1.4s ease infinite · sk-shimmer keyframe',
          trailing: 'load',
          tone: 'grey',
        },
        {
          title: 'Spinner (pending)',
          sub: 'rotate 360deg · 0.8s linear infinite · border-top transparent',
          trailing: 'spin',
          tone: 'orange',
        },
        {
          title: 'Success check draw',
          sub: 'stroke-dashoffset · 400ms · no scale · opacity in 280ms',
          trailing: 'ok',
          tone: 'green',
        },
        {
          /* prefers-reduced-motion — highlighted blue as canonical a11y note */
          title: 'prefers-reduced-motion: reduce',
          sub: '→ animation-duration: 0.01ms !important · transition-duration: 0.01ms !important · animation-iteration-count: 1 · scroll-behavior: auto !important  (tokens.jsx @media prefers-reduced-motion)',
          trailing: 'a11y',
          tone: 'blue',
        },
      ].map((row) => (
        <div key={row.title} style={{
          display: 'flex', alignItems: 'flex-start', gap: 14,
          padding: '12px 16px', borderRadius: 12,
          background: row.tone === 'a11y' || row.tone === 'blue' ? 'var(--blue50)' : row.tone === 'orange' ? 'var(--orange50)' : row.tone === 'green' ? 'var(--green50)' : 'var(--grey50)',
          border: `1px solid ${row.tone === 'a11y' || row.tone === 'blue' ? 'var(--blue100)' : row.tone === 'orange' ? 'var(--orange500)' : row.tone === 'green' ? 'var(--green500)' : 'var(--grey100)'}`,
        }}>
          <div style={{ flex: 1 }}>
            <div className="tm-text-label" style={{ color: row.tone === 'a11y' || row.tone === 'blue' ? 'var(--blue500)' : 'var(--text-strong)' }}>{row.title}</div>
            <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 3 }}>{row.sub}</div>
          </div>
          <Badge tone={row.tone === 'grey' ? 'grey' : row.tone === 'orange' ? 'orange' : row.tone === 'green' ? 'green' : 'blue'} size="sm">{row.trailing}</Badge>
        </div>
      ))}

    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* exports                                                             */
/* ------------------------------------------------------------------ */
Object.assign(window, {
  M19MobileMain,
  M19TabletMain,
  M19DesktopMain,
  M19MobileFlowForm,
  M19MobileFlowEdit,
  M19MobileFlowSheet,
  M19MobileFlowConfirm,
  M19MobileStateLoading,
  M19MobileStateSuccess,
  M19MobileStatePending,
  M19ComponentsBoard,
  M19TabletComponents,
  M19AssetsBoard,
  M19MotionBoard,
});
