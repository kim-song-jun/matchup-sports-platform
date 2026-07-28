export const meta = {
  name: 'login-promo-fix',
  description: '로그인·홍보랜딩 검수 fixNow 수정 (파일그룹 sonnet 2 + opus 리뷰)',
  phases: [
    { title: 'Fix', detail: '로그인·홍보 2그룹 병렬 수정 (sonnet)', model: 'sonnet' },
    { title: 'Review', detail: '적대 리뷰 (opus)', model: 'opus' },
  ],
}

const DS = `
## matchup v1 디자인 시스템 (라이트 전용, Toss급 절제)
- 토큰: blue500 #3182f6/blue600/blue50, orange500 #fe9800/orange50, green500, grey50~900. 시맨틱: --text-strong(grey900)·--text-body(grey700)·--text-muted(grey600)·--text-caption(grey500)·--border(grey200)·--surface(#fff). dark: 금지.
- 대비 4.5:1 필수(파란 배경 위 흰 텍스트는 opacity 낮추지 말 것), 터치 44px, 컬러+텍스트 병행, 포커스 링.
- 아이콘: 이모지 금지 — 단색 SVG(blue500/grey). 카피: 한글 해요체, 번역투·미완결·감탄남발·오타 금지.
- 간격: 8px 배수 리듬, 그룹 내 소간격 < 그룹 간 대간격.
- 최소 diff, JSX/로직 보존, 명시된 것만 변경. 완료 후 self-check.
`

phase('Fix')

const workers = [
  {
    key: 'login',
    review: true,
    files: 'apps/v1_web/src/app/login/page.tsx, apps/v1_web/src/components/auth/auth-page.tsx, apps/v1_web/src/components/auth/auth.view-model.ts, apps/v1_web/src/app/globals.css(.tm-auth-* 섹션만), apps/v1_web/src/app/desktop/auth.css',
    task: `로그인 화면 검수 수정:
[P0] **DevLoginPanel 프로덕션 게이트**: login/page.tsx에서 <DevLoginPanel/>이 무조건 렌더됨. \`process.env.NODE_ENV !== 'production'\`(또는 NEXT_PUBLIC dev 플래그)로 감싸 dev/staging에서만 렌더. 프로덕션 빌드에선 제거. (DevLoginPanel 컴포넌트 자체에도 가드 추가 가능)
[P1] **모바일 거대 공백**: globals.css .tm-auth-login 이 justify-content:space-between + 첫 div flex:1 로 두 그룹을 위/아래로 밀어 ~80-100px 공백 발생. space-between 제거(또는 상단 정렬) + 그룹 간 24-32px 고정 간격, 8px 배수로 요소 gap 통일. .tm-auth-sub margin-bottom 등 그룹 내 소간격(8-12) < 그룹 간 대간격(24-28) 으로 재정립.
[P1] **보조 안내 대비+카피**: auth-page.tsx .tm-auth-helper 가 grey500(2.6:1) → 최소 var(--text-muted) grey600 이상. 카피 '기존 계정이 있으면 이메일 로그인 후 종목, 레벨, 지역 확인으로 이어집니다.' → 단문 해요체('처음이라면 가입 후 종목·지역을 설정해요.' 수준)로 축약하거나 삭제. 번역투 제거.
[P1] **좌측 브랜드 패널 대비**: desktop/auth.css tagline(white@0.82)·feature(white@0.88) 가 blue 그라데이션 위 ~2.7-3:1. feature는 white 불투명+600 이상, tagline 0.9+ 로 올려 4.5:1 확보(또는 패널 배경을 blue600 단색으로).
[P1] **소셜 버튼**: 네이버/Apple disabled가 회색 죽은 버튼처럼 보임 → '(준비 중)' 텍스트/배지로 미연동 명시. 각 버튼 좌측에 간단한 단색 브랜드 표식(가능하면). 카카오는 컬러 유지. (브랜드 SVG 추가가 과하면 '준비 중' 명시만이라도)
[P2] 헤드라인/부제 종결어미 통일(auth.view-model.ts): '찾아요'(SNS 말투) → '같이 뛸 사람을 한 번에' 명사형 또는 '지금 찾아보세요' 청유로. 헤드라인↔부제 역할 중복 정리.
[P2] 약관 문구(auth-page.tsx .tm-auth-policy): '계속하면…동의합니다' → '로그인 또는 가입을 진행하면 서비스 이용약관 및 개인정보 처리방침에 동의하는 것으로 간주됩니다.' + '이용약관'·'개인정보 처리방침'을 blue500 링크(/terms 등)로.
[P2] 초광폭 비율(desktop/auth.css): 좌측 brand flex:1 무한 확장 → brand 또는 card-side에 max-width로 >1600px 비율 상한.
**주의**: '이메일로 로그인(outline) vs 로그인 없이 시작하기(primary)' CTA 위계는 변경하지 말 것(게스트 우선이 의도). 그대로 유지.
self-check 후 보고.`,
  },
  {
    key: 'promo',
    review: true,
    files: 'apps/v1_web/src/app/tournaments/page.tsx (PROCESS_STEPS·HOW_TO_STEPS·PrizeBreakdownCards), apps/v1_web/src/app/desktop/tournaments.css (.tm-tournament-promo-* 섹션만)',
    task: `대회 홍보 랜딩 검수 수정:
[P1] **이모지 → 단색 SVG**: PROCESS_STEPS 6스텝(📋💳👥⚽🏆🎉)·HOW_TO_STEPS 3카드(🏃📝📋)의 이모지를 전부 앱 단색 SVG로 교체(이모지 0건). 우승=TrophyIcon(@/components/v1-ui/icons 이미 존재) 사용. 나머지(신청=문서, 결제=카드, 선수명단=사람들, 조별리그=공, 결선=대진/토너먼트)는 page.tsx에 작은 인라인 단색 SVG 컴포넌트를 추가(stroke=currentColor, 24 viewBox, 1.8 strokeWidth — my-registration의 인라인 아이콘 패턴 참고)하여 사용. 색은 blue500(또는 타일 bg-blue50 + 아이콘 blue500). HOW_TO도 동일 톤.
[P1] **모바일 스텝 고아**: tournaments.css .tm-tournament-promo-steps 모바일 baseline이 flex-wrap:wrap이라 6번째('우승')가 2행 단독+잘림. 모바일에서 \`grid-template-columns: repeat(3, 1fr)\` 3열×2행으로 고정(각 스텝 flex column: 아이콘→번호→라벨 수직 중앙 정렬). connector(.tm-tournament-promo-step-connector)는 3열 그리드에서 행 끝/마지막엔 안 그려지게(또는 grid에선 connector 숨김) 조정. 데스크탑 nowrap은 유지. 섹션 하단 패딩 확보해 라벨 잘림 방지.
[P2] **참가 방법 카피 해요체 통일**(page.tsx HOW_TO_STEPS desc): 어조 통일 + STEP2 '원하는 대회를 골라' 제거(이미 랜딩 도착 맥락). 예: '내 팀으로 참가하거나 새 팀을 만들어 준비해요.' / '참가 신청 후 참가비를 결제해요.' / '대회 전까지 선수 명단을 등록하면 준비 완료예요.'
[P2] **ghost CTA 대비**(tournaments.css .tm-tournament-promo-cta-ghost): '대회 둘러보기'가 흰 텍스트 on rgba(white,0.15) blue → 2.8:1. fill rgba(255,255,255,0.22)+ border rgba(255,255,255,0.6) 이상으로 올려 대비 확보(흰 텍스트 유지).
[P2] **상금 카드 podium 위계**(tournaments.css .tm-tournament-promo-prize-card + page.tsx): 1·2·3위 카드가 전부 orange50 동일 배경이라 위계 없음. 1위 카드에만 border:1.5px solid var(--orange500)(또는 살짝 진한 tint) + 1위 트로피를 묻히지 않는 진한 amber로. 2·3위는 현행 유지(텍스트로 구분).
self-check 후 보고.`,
  },
]

const fixed = await parallel(workers.map((w) => () =>
  agent(
    `너는 Toss급 시니어 프론트엔드 엔지니어다. matchup v1의 한 화면 그룹 검수 결함을 정밀 수정한다.
${DS}
## 소유 파일(이 그룹만)
${w.files}
## 작업
${w.task}

파일을 Read로 열어 확인 후 Edit. 다른 파일/섹션 건드리지 말 것.`,
    { label: `fix:${w.key}`, phase: 'Fix', model: 'sonnet' }
  ).then((r) => ({ key: w.key, report: typeof r === 'string' ? r.slice(0, 500) : r }))
))
log(`수정 ${fixed.filter(Boolean).length}/${workers.length} → 리뷰`)

phase('Review')
const VERDICT = {
  type: 'object', additionalProperties: false,
  properties: { target: { type: 'string' }, pass: { type: 'boolean' }, issues: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } },
  required: ['target', 'pass', 'issues', 'notes'],
}
const reviews = await parallel([
  { t: 'login', file: 'apps/v1_web/src/components/auth/auth-page.tsx + login/page.tsx + globals.css(.tm-auth) + desktop/auth.css', check: 'DevLoginPanel 프로덕션 게이트(NODE_ENV) 적용·모바일 space-between 공백 해소·보조안내+브랜드패널 대비≥4.5:1·소셜 준비중 명시·카피 해요체·약관 링크. CTA 위계는 변경 안 됨(게스트 primary 유지). 이모지 0·dark: 0·tsc 안전·JSX 보존.' },
  { t: 'promo', file: 'apps/v1_web/src/app/tournaments/page.tsx + desktop/tournaments.css(.tm-tournament-promo-*)', check: '진행방식/참가방법 이모지 0(단색 SVG 교체)·모바일 스텝 3열 그리드(고아/잘림 해소)·ghost CTA 대비·1위 podium 강조·HOW_TO 해요체. 기존 목록/로직 보존·tsc 안전·dark: 0.' },
].map((rt) => () =>
  agent(`너는 Toss급 리뷰어다. 아래 파일들의 최근 수정을 적대 검증(의심되면 fail).\n${DS}\n## 검증\n${rt.file}\n## 체크\n${rt.check}\n파일 Read + 필요한 grep 후 verdict.`,
    { label: `review:${rt.t}`, phase: 'Review', model: 'opus', schema: VERDICT })
))

return { fixed, reviews: reviews.filter(Boolean) }
