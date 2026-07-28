export const meta = {
  name: 'login-promo-5x-review',
  description: '로그인·대회 홍보 랜딩 — 화면당 sonnet 인스펙터 5(관점 분산) + opus 종합',
  phases: [
    { title: 'Login', detail: '로그인 5-관점 검수 (sonnet)' },
    { title: 'Promo', detail: '홍보 랜딩 5-관점 검수 (sonnet)' },
    { title: 'Synthesize', detail: '화면별 종합 (opus)' },
  ],
}

const DS = `
## matchup v1 — Toss급 생활체육 앱(라이트 전용) 검수 기준
- solid-first·절제(과한 shadow/border/glass 금지)·단일 blue(#3182f6) 액센트, 상금/트로피 orange(#fe9800), 성공 green, 위험 red.
- 로고: 두 인물 파란 마크 + 'teameet' 워드마크 락업(인증 패널은 흰 타일에 파란 마크). 깨짐·비례·정렬 이상 = 결함.
- 글씨 짤림 0 · 대비 4.5:1 · 한글 카피 자연스러움(번역투·어색·미완결·오타 금지) · 컬러+텍스트 병행 · 터치 44px · 포커스 링.
- 데스크탑: 폭 활용·좌우 균형(좌측 쏠림/빈 거터 지양). 모바일: 본무대, 1단 자연 흐름·요소 정렬.
- 아이콘 톤 일관(예: 이모지 vs 앱 SVG 아이콘 혼용은 결함), 스텝/그리드 줄바꿈 어색함 적발.
`

const LENSES = [
  { key: 'layout', focus: '레이아웃·구조·균형: 섹션 순서/위계, 데스크탑 폭 활용·좌우 균형, 빈 공간·쏠림, 카드 비례, 히어로 구성.' },
  { key: 'typo-copy', focus: '타이포·카피: 폰트 위계(제목/본문/캡션) 명확성, 한글 문구 자연스러움(번역투·어색·미완결·오타), 줄바꿈 어색함, 라벨 명료성.' },
  { key: 'color-brand', focus: '색·대비·브랜드: 시맨틱 컬러(blue=상호작용·orange=상금 등) 적정, 대비 4.5:1, 로고/브랜드 일관·선명·정렬, 컬러단독 정보전달 여부.' },
  { key: 'spacing-align', focus: '간격·정렬·리듬: 4·8·12·16 간격 리듬, 요소 정렬(좌/중/우), 카드 패딩·갭 일관, 어긋난 베이스라인.' },
  { key: 'polish-mobile', focus: '폴리시·a11y·모바일·디테일: 아이콘 톤 일관(이모지/ SVG), 스텝·그리드 줄바꿈, 터치 타깃, 포커스/상태, 모바일 1단 흐름·요소 깨짐, 전반 완성도("애매"한 지점).' },
]

const FIND = {
  type: 'object', additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          where: { type: 'string', description: '화면+위치(예: mobile 진행 방식 스텝)' },
          severity: { type: 'string', enum: ['P0', 'P1', 'P2'] },
          problem: { type: 'string', description: '무엇이 어떻게 어색/잘못(한국어)' },
          fix: { type: 'string', description: '구체 수정안' },
        },
        required: ['where', 'severity', 'problem', 'fix'],
      },
    },
  },
  required: ['findings'],
}

const screens = [
  { key: 'login', phase: 'Login', label: '맨 처음 로그인 화면', imgs: ['docs/visual-qa/review2/desktop/login.png', 'docs/visual-qa/review2/mobile/login.png'] },
  { key: 'promo', phase: 'Promo', label: '대회 홍보 마케팅 랜딩(/tournaments 홍보-우선)', imgs: ['docs/visual-qa/review2/desktop/promo.png', 'docs/visual-qa/review2/mobile/promo.png'] },
]

const SYNTH = {
  type: 'object', additionalProperties: false,
  properties: {
    fixNow: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: { where: { type: 'string' }, severity: { type: 'string', enum: ['P0', 'P1', 'P2'] }, problem: { type: 'string' }, fix: { type: 'string' } },
        required: ['where', 'severity', 'problem', 'fix'],
      },
    },
    minor: { type: 'array', items: { type: 'string' } },
    rejected: { type: 'number' },
  },
  required: ['fixNow', 'minor', 'rejected'],
}

/** 한 화면: sonnet 인스펙터 5(관점) → opus 종합 */
async function reviewScreen(scr) {
  const insp = await parallel(LENSES.map((lens) => () =>
    agent(
      `너는 Toss급 시니어 프로덕트 디자이너다. matchup v1 "${scr.label}" 화면을 **'${lens.key}' 관점으로만** 적대적으로 검수한다(화면만, 코드 아님).
${DS}
## 검수 화면(반드시 Read 도구로 각 PNG를 실제 열어 픽셀을 보고 판단 — 데스크탑+모바일 둘 다)
${scr.imgs.join('\n')}
## 네 관점
${lens.focus}

실제로 보이는 결함만(추측·거짓양성 금지). 사용자가 "애매하다"고 느낄 지점을 이 관점에서 적극 발굴. findings 배열 반환.`,
      { label: `${scr.key}:${lens.key}`, phase: scr.phase, model: 'sonnet', schema: FIND }
    )
  ))
  const all = insp.filter(Boolean).flatMap((r) => r.findings || [])
  const synth = await agent(
    `너는 디자인 디렉터다. "${scr.label}" 화면을 5개 관점 인스펙터가 검수한 결과 ${all.length}건을 종합한다.
${DS}
## 원시 findings(JSON)
${JSON.stringify(all, null, 1)}
중복 병합, 거짓양성/과한 nitpick 제거(rejected 카운트), fixNow(바로 고칠 실제 결함, 심각도순)/minor(미세·주관) 분류. 반환.`,
    { label: `synth:${scr.key}`, phase: 'Synthesize', model: 'opus', schema: SYNTH }
  )
  return { screen: scr.key, raw: all.length, ...synth }
}

phase('Login')
const results = []
for (const scr of screens) {
  results.push(await reviewScreen(scr))
}
return { results }
