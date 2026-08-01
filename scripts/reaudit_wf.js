export const meta = {
  name: 'tournament-full-reaudit-seq',
  description: 'Critical adversarial re-audit (sequential to avoid rate limit)',
  phases: [
    { title: 'Audit', detail: '3 sequential opus critics', model: 'opus' },
    { title: 'Synthesize', detail: 'prioritized still-lacking report', model: 'opus' },
  ],
}

const CTX = `
Teameet v1 tournament (대회) UI. User went through MULTIPLE polish passes (functional gaps, Toss-friendliness, directional, standings) and STILL says "all UI/content is lacking / 아쉬워". Previous on-brand nits are NOT wanted — find the DEEPER gaps keeping this one notch below production Toss/당근마켓-tier. Be HARSH and specific; "looks fine" is failure.
DESIGN BAR: Toss-like clean/warm (친근 70/전문 30), 즉시 이해, 신뢰 우선, 절제된 에너지, 모바일 본무대 + 데스크탑 동급. blue #3182f6, Pretendard, tokens, .tm-*. ANTI: 올드웹, 과한 장식, 차갑고 제네릭한 AI 기본값, 빈약한 정보, 데스크탑이 모바일 컬럼 가운데 둔 것.
SCREENSHOTS (read PNGs, both bp): docs/visual-qa/audit-full/{mobile,desktop}/ : 01-home 02-list 03-detail 04-apply-step1 05-apply-step2(mobile만) 06-roster 07-my 08-admin-list 09-admin-create 10-admin-registrations 11-admin-bracket 12-admin-announcements.
CODE: apps/v1_web/src/app/tournaments/** , apps/v1_web/src/app/admin/tournaments/** , components/home/tournament-teaser-card.tsx , components/tournaments/tournament-bracket.tsx.
Per finding: surface, lacking(harsh+specific), why-below-bar, concrete fix, severity(P0 product-credibility/P1/P2), kind ∈ {quick-polish, directional}.
`

const SCHEMA = { type: 'object', properties: { lens: { type: 'string' }, headline: { type: 'string' }, findings: { type: 'array', items: { type: 'object', properties: { surface: { type: 'string' }, lacking: { type: 'string' }, why: { type: 'string' }, fix: { type: 'string' }, severity: { type: 'string', enum: ['P0', 'P1', 'P2'] }, kind: { type: 'string', enum: ['quick-polish', 'directional'] } }, required: ['surface', 'lacking', 'why', 'fix', 'severity', 'kind'] } } }, required: ['lens', 'headline', 'findings'] }

phase('Audit')
const lenses = [
  ['consumer-visual-content', `${CTX}\n\nLENS: CONSUMER VISUAL CRAFT + CONTENT COMPLETENESS. Read consumer screenshots (01,02,03,07 + 04/05/06) both bp + the consumer code. Judge layout/hierarchy/spacing/density, the DESKTOP experience (does it earn its width or is it a narrow column with dead right-side space? is the bracket cramped?), card/section craft, empty states. AND content: the list hero promises "상금 대회 · 상위 팀에게 실제 상금 지급" — is PRIZE(상금) info shown ANYWHERE? rules depth, what-after-apply, organizer/credibility, thin/placeholder copy. Find what makes it feel one notch below production.`],
  ['ux-flow', `${CTX}\n\nLENS: UX FLOW & INTERACTION. Read apply(04,05)/roster(06)/my(07) screenshots + flow code. Walk discover→detail→apply(team→agree→pay→guide)→my→roster. Judge friction, dead-ends, unclear next-steps, action feedback, multi-step apply reassurance, mobile fixed-CTA vs desktop, nav/back, edge/empty states IN the flow, CTA consistency. Find where the journey feels clunky/uncertain/unfinished.`],
  ['admin-toss-bar', `${CTX}\n\nLENS: ADMIN CRAFT + 'TOSS BAR' production polish. Read admin screenshots (08-12) both bp + admin code, AND scan all 12 for production-tier signals. Admin: create form (long/dull? grouped? guidance?), list scannability, detail tabs ergonomics (registrations mgmt, bracket building, announcements), desktop density, whether it's a real ops tool or thrown-together forms. Toss-bar: name everything signaling 'AI-generated/MVP' vs 'shipped by top Korean product team' — generic styling, inconsistent radii/spacing/weight, missing warmth/illustration, robotic copy, soulless-but-correct. Be ruthless; prioritize the few highest-leverage moves.`],
]
const audits = []
for (const [key, prompt] of lenses) {
  const r = await agent(prompt, { label: `audit:${key}`, phase: 'Audit', schema: SCHEMA, model: 'opus', agentType: 'general-purpose' })
  if (r) audits.push(r)
}

phase('Synthesize')
const SYNTH = { type: 'object', properties: { overallVerdict: { type: 'string' }, themes: { type: 'array', items: { type: 'string' } }, topFixes: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, surfaces: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' }, severity: { type: 'string', enum: ['P0', 'P1', 'P2'] }, kind: { type: 'string', enum: ['quick-polish', 'directional'] }, effort: { type: 'string', enum: ['S', 'M', 'L'] } }, required: ['title', 'surfaces', 'problem', 'fix', 'severity', 'kind', 'effort'] } } }, required: ['overallVerdict', 'themes', 'topFixes'] }
const synth = await agent(`Lead product design director. 3 critics re-audited the tournament UI because the user STILL finds it lacking after multiple polish passes. Consolidate into the HONEST, prioritized set of changes that most move it to production-tier. Dedupe. Separate quick-polish (auto-applicable on-brand) from directional (mockup/decision). Lead with highest leverage; no trivia.

Audits: ${JSON.stringify(audits, null, 2)}`,
  { label: 'synthesize', phase: 'Synthesize', schema: SYNTH, model: 'opus', agentType: 'general-purpose' })

return { synth, perLens: audits.map((v) => ({ lens: v.lens, headline: v.headline, count: v.findings.length })) }
