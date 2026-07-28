export const meta = {
  name: 'tournament-visual-review',
  description: '대회/로고/마케팅 전 서피스 스크린샷 적대적 시각 검토 (opus 4그룹 + triage)',
  phases: [
    { title: 'Review', detail: '4그룹 스크린샷 시각 검토 (opus)' },
    { title: 'Triage', detail: '중복제거·우선순위 (opus)' },
  ],
}

const DS = `
## 검토 기준 (matchup v1 — Toss급 생활체육 앱, 라이트 전용)
- 디자인: solid-first·절제(과한 shadow/border/glass 금지)·단일 blue(#3182f6) 액센트·정렬과 간격 리듬·여백 균형. 상금/트로피는 orange(#fe9800), 성공 green, 위험 red.
- 로고: 두 인물 파란 마크 — nav/footer/랜딩/인증에 마크+워드마크('teameet') 락업, 인증 패널은 흰 타일에 파란 마크. 로고가 깨지거나 비례 이상하면 결함.
- a11y/카피: 글씨 짤림 0, 대비 4.5:1, 한글 카피 자연스러움(번역투·어색·미완결·오타 금지), 컬러+텍스트 병행.
- 데스크탑: 폭 활용·좌우 균형(좌측 쏠림/빈 거터 지양). 모바일: 본무대, 1단 자연 흐름.
- 이번 세션 산출물(중점 검토): ① 로고 적용 ② /tournaments 홍보 마케팅 랜딩(상금 히어로 '최대 N만원'·상금 배분 카드·진행 방식 스텝·대진표 미리보기·참가 방법·CTA) ③ 상세 상금 카드 강조 ④ 대진표.
- 사용자가 "애매하다"고 느낀 지점을 적극 발굴: 폴리시 부족·어색한 정렬/간격·아이콘 톤 불일치(예: 이모지 vs SVG)·빈약한 섹션·비례 이상.
`

const FINDINGS = {
  type: 'object', additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          id: { type: 'string' },
          surface: { type: 'string', description: '어느 화면(예: desktop/02-list)' },
          severity: { type: 'string', enum: ['P0', 'P1', 'P2'] },
          area: { type: 'string', enum: ['layout', 'spacing', 'color', 'copy', 'logo', 'typography', 'a11y', 'polish', 'mobile'] },
          problem: { type: 'string', description: '무엇이 어떻게 어색/잘못됐는지(한국어, 화면 위치 포함)' },
          fix: { type: 'string', description: '구체 수정안' },
        },
        required: ['id', 'surface', 'severity', 'area', 'problem', 'fix'],
      },
    },
  },
  required: ['findings'],
}

phase('Review')

const B = 'docs/visual-qa'
const groups = [
  {
    key: 'logo',
    imgs: [`${B}/brand/desktop/login.png`, `${B}/brand/mobile/login.png`, `${B}/brand/desktop/landing.png`, `${B}/brand/mobile/landing.png`, `${B}/final/desktop/08-home.png`, `${B}/final/mobile/08-home.png`],
    focus: '로고 적용 품질 — nav/footer/랜딩/인증 패널·카드의 로고 마크+워드마크 락업이 선명·정렬·비례 맞는지, 흰 타일이 어색하지 않은지, 워드마크와 간격, 모바일에서의 로고 노출. 홈 전반의 정렬·균형.',
  },
  {
    key: 'promo-apply',
    imgs: [`${B}/final/desktop/02-list.png`, `${B}/final/mobile/02-list.png`, `${B}/final/desktop/03-apply.png`, `${B}/final/mobile/03-apply.png`],
    focus: '대회 홍보 마케팅 랜딩(02-list): 상금 히어로 임팩트·정렬, 상금 배분 카드, 진행 방식 스텝(아이콘 톤이 이모지라 앱 SVG와 불일치하지 않는지·모바일 스텝 줄바꿈 어색함), 대진표 미리보기, 참가 방법, CTA, 그 아래 목록 연결의 자연스러움. 신청(03-apply) 폼/요약 정렬.',
  },
  {
    key: 'detail-my-roster',
    imgs: [`${B}/final/desktop/01-detail.png`, `${B}/final/mobile/01-detail.png`, `${B}/final/desktop/04-my.png`, `${B}/final/mobile/04-my.png`, `${B}/final/desktop/05-roster.png`, `${B}/final/mobile/05-roster.png`],
    focus: '상세(01): 상금 카드 강조 적절한지·중복 없는지·2단 균형·조별순위/일정/대진표 정렬. 내신청(04): 참가권 패스·신청내역·균형. 명단(05): 폼 정렬.',
  },
  {
    key: 'admin',
    imgs: [`${B}/final/desktop/06-admin-bracket.png`, `${B}/final/mobile/06-admin-bracket.png`, `${B}/final/desktop/07-admin-create.png`, `${B}/final/mobile/07-admin-create.png`],
    focus: '어드민 상세(06): 2단 대시보드 정렬·카드 폭·read-back·결과입력. 어드민 생성(07): 폼 정렬·버튼·textarea. 데스크탑 폭 활용.',
  },
]

const reviews = await parallel(groups.map((g) => () =>
  agent(
    `너는 Toss급 시니어 프로덕트 디자이너다. matchup v1 대회 도메인의 스크린샷을 **적대적으로 시각 검토**한다(코드 아님, 화면만).
${DS}
## 담당 화면 (반드시 Read 도구로 각 PNG를 실제 열어 픽셀을 보고 판단)
${g.imgs.join('\n')}
## 중점
${g.focus}

각 화면을 Read로 직접 열어 본 뒤, 실제로 보이는 결함만(추측 금지) findings로. 사용자가 "애매하다"고 느낄 폴리시·정렬·간격·아이콘 톤·비례·카피 문제를 적극 발굴하되 거짓양성은 배제. 심각도(P0 눈에 띔 > P1 > P2 미세). findings 배열 반환.`,
    { label: `review:${g.key}`, phase: 'Review', model: 'opus', schema: FINDINGS }
  )
))

const all = reviews.filter(Boolean).flatMap((r) => r.findings || [])
log(`시각 검토 ${all.length}건 수집 → triage`)

phase('Triage')

const TRIAGE = {
  type: 'object', additionalProperties: false,
  properties: {
    fixNow: {
      type: 'array', description: '바로 고칠 가치가 있는 실제 결함(우선순위순)',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          id: { type: 'string' }, surface: { type: 'string' }, severity: { type: 'string', enum: ['P0', 'P1', 'P2'] },
          area: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' },
        },
        required: ['id', 'surface', 'severity', 'area', 'problem', 'fix'],
      },
    },
    minorOrSubjective: {
      type: 'array', description: '미세하거나 주관적 — 보고만',
      items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, problem: { type: 'string' } }, required: ['id', 'problem'] },
    },
    rejectedCount: { type: 'number' },
  },
  required: ['fixNow', 'minorOrSubjective', 'rejectedCount'],
}

const triage = await agent(
  `너는 디자인 디렉터다. 4그룹 시각 검토가 모은 ${all.length}건을 종합한다.
${DS}
## 원시 findings(JSON)
${JSON.stringify(all, null, 1)}
## 작업
1. 중복 병합. 2. 거짓양성·과한 nitpick 제거(rejectedCount). 3. 분류: fixNow(바로 고칠 실제 결함, 심각도순) / minorOrSubjective(미세·주관, 보고만). 화면 근거가 분명한 것만 fixNow.
fixNow/minorOrSubjective/rejectedCount 반환.`,
  { label: 'triage', phase: 'Triage', model: 'opus', schema: TRIAGE }
)

return { raw: all.length, fixNow: triage.fixNow, minor: triage.minorOrSubjective, rejected: triage.rejectedCount }
