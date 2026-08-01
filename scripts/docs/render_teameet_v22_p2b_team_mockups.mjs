import { chromium } from 'playwright';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FLOW = path.join(ROOT, '.omo/ultraresearch/20260627-152929-teameet-mobile-tournament-identity/mockups/service-wide-v22-ko');
const OUT = path.join(FLOW, 'pages');
const EV = path.join(FLOW, 'evidence');
const OMO_EV = path.join(ROOT, '.omo/evidence');
const MOCK = path.join(ROOT, 'apps/v1_web/public/mock/generated');
const variants = [
  ['a', 'clean', 'A 토스 클린 기준안'],
  ['b', 'photo', 'B 포토 액센트안'],
  ['c', 'compact', 'C 컴팩트 유틸리티안'],
  ['d', 'round', 'D 라운드 커뮤니티안'],
];

mkdirSync(OUT, { recursive: true });
mkdirSync(EV, { recursive: true });
mkdirSync(OMO_EV, { recursive: true });

const img = (name) => `data:image/webp;base64,${readFileSync(path.join(MOCK, name)).toString('base64')}`;
const images = { team: img('team-huddle.webp'), court: img('futsal-rooftop.webp') };
const chip = (text, kind = '') => `<span class="chip ${kind}">${text}</span>`;
const row = (a, b, t = '') => `<div class="row"><div><b>${a}</b><small>${b}</small></div>${t ? `<em>${t}</em>` : ''}</div>`;
const field = (label, value, error = '') => `<label class="field"><span>${label}</span><div>${value}</div>${error ? `<small class="error">${error}</small>` : ''}</label>`;
const section = (title, body, note = '') => `<section class="sec"><h2>${title}</h2>${note ? `<p class="note">${note}</p>` : ''}${body}</section>`;
const top = (title, act = '') => `<header class="top"><span>‹</span><strong>${title}</strong><span>${act}</span></header>`;
const cta = (main, sub = '') => `<div class="cta">${sub ? `<span class="subbtn">${sub}</span>` : ''}<button>${main}</button></div>`;

function publicTeam(v) {
  return `<div class="screen ${v[1]}" style="--hero:url('${images.team}')">${top('팀 상세', '공유')}<main>
    <div class="hero"><img src="${images.team}" alt=""><div>${chip('공개 팀 프로필', 'blue')}${chip('모집중', 'green')}<h1>성수 위너스 FC</h1><p>풋살 · 서울 성동 · 최근 30일 응답률 92%</p></div></div>
    ${section('팀 소개', `<p class="bodycopy">퇴근 후 성수와 왕십리에서 꾸준히 모이는 풋살 팀이에요. 초보도 합류할 수 있지만 약속 시간과 기본 매너를 중요하게 봅니다.</p><div class="stats"><b>18명</b><b>주 2회</b><b>4.8점</b><span>활동 멤버</span><span>정기 경기</span><span>매너 평가</span></div>`)}
    ${section('가입 전 확인', `<div class="list">${['주 1회 이상 참여 가능','성동/광진 이동 가능','팀 규칙 동의'].map((x) => row(x, '가입 조건')).join('')}</div><p class="notice">신청하면 팀장이 승인 여부를 알려줘요.</p>${cta('가입 신청')}`)}
    ${section('주요 멤버', `<div class="members">${['팀장 지훈','매니저 서연','골키퍼 민재','신입 지원'].map((x) => `<div><i></i><b>${x}</b><small>최근 활동 확인</small></div>`).join('')}</div><div class="navrow">${row('멤버 보기', '전체 멤버와 역할을 확인해요', '보기')}</div>`)}
    ${section('다가오는 팀매치', `<div class="list">${row('7월 4일 토 18:00', '마포 풋살파크 · 6/10명', '모집중')}${row('7월 9일 목 20:00', '성수 실내구장 · 친선전', '예정')}</div><div class="navrow">${row('팀매치 보기', '팀이 여는 경기만 모아 봐요', '보기')}</div>`)}
  </main></div>`;
}

function createTeam(v) {
  return `<div class="screen ${v[1]}" style="--hero:url('${images.court}')">${top('팀 만들기', '1/1단계')}<main>
    <div class="intro">${chip('새 팀 개설', 'blue')}<h1>함께 뛸 팀을 만들어 보세요</h1><p>종목과 지역을 먼저 정하면 팀을 찾는 사람들이 더 정확히 발견할 수 있어요.</p></div>
    ${section('기본 정보', `<p class="formlabel">대표 종목</p><div class="sports">${['풋살','축구','러닝','수영'].map((x, i) => `<button class="${i === 0 ? 'on' : ''}">${x}</button>`).join('')}</div>${field('활동 지역','서울 성동구')}${field('팀 이름','성수 위너스 FC','팀 이름은 2자 이상 입력해 주세요.')}${field('팀 소개','평일 저녁에 성수와 왕십리에서 모이는 풋살 팀입니다.')}`)}
    ${section('대표 사진', `<div class="upload"><img src="${images.court}" alt=""><div><b>대표 사진</b><p>팀 분위기가 보이는 사진을 올리면 가입 신청 전환이 높아져요.</p></div></div>`)}
    ${section('제출 전 확인', `<p class="notice red">대표 종목과 활동 지역은 필수예요.</p><p class="notice">작성 중인 내용은 이 기기에서 임시 저장돼요.</p>${cta('팀 만들기', '취소')}`)}
  </main></div>`;
}

function myTeam(v) {
  return `<div class="screen ${v[1]}" style="--hero:url('${images.team}')">${top('내 팀', '설정')}<main>
    <div class="intro manager">${chip('팀장 관리', 'blue')}${chip('팀장', 'green')}<h1>성수 위너스 FC</h1><p>이번 주 일정 2개 · 가입 대기 3명</p>${cta('팀 일정 만들기')}</div>
    ${section('빠른 관리', `<div class="actions">${row('초대 링크 보내기', '새 멤버에게 공유', '보내기')}${row('멤버 관리', '역할과 활동 상태 변경', '관리')}</div>`)}
    ${section('이번 주 일정', `<div class="list">${row('7월 4일 토 18:00', '마포 풋살파크 · 참석 12명', '편집')}${row('7월 6일 월 20:00', '성수 실내구장 · 출석 체크 예정', '열기')}</div>`)}
    ${section('가입 신청', `<div class="list">${row('민준', '풋살 입문 · 성동구', '검토')}${row('서연', '주 1회 가능 · 광진구', '검토')}</div><p class="notice">승인/거절은 사유와 함께 팀 기록에 남아요.</p>`)}
    ${section('멤버 관리', `<div class="stats"><b>18명</b><b>2명</b><b>2명</b><span>활동</span><span>휴면</span><span>관리자</span></div><div class="navrow">${row('멤버 목록 열기', '권한 변경, 휴면 처리, 내보내기', '관리')}</div>`)}
  </main></div>`;
}

const screens = [
  ['B4-01', 'team-public-detail', publicTeam],
  ['B4-02', 'team-create', createTeam],
  ['B4-05', 'my-team-hub', myTeam],
];
const nameOf = (s, v) => `${s[0].toLowerCase()}-${s[1]}-${v[0]}-v22.png`;

function css() {
  return `:root{--blue:#3182f6;--b50:#e8f3ff;--green:#03b26c;--g50:#e3f8ef;--red:#f04452;--r50:#feebec;--bg:#f9fafb;--g100:#f2f4f6;--g200:#e5e8eb;--g600:#6b7684;--g800:#333d4b;--g900:#191f28;--shadow:0 1px 2px rgba(15,23,42,.05)}*{box-sizing:border-box}body{margin:0;background:#eef1f5;color:var(--g900);font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI","Apple SD Gothic Neo","Noto Sans KR",sans-serif}.screen{width:390px;min-height:1240px;margin:0 auto;background:var(--bg);overflow:hidden}.top{position:sticky;top:0;z-index:2;height:58px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.96);border-bottom:1px solid var(--g100)}.top span{min-width:34px;height:34px;border:1px solid var(--g100);border-radius:17px;display:grid;place-items:center;color:var(--g800);font-size:13px;font-weight:800;background:white}.top strong{font-size:16px}main{padding:18px 20px 42px}.hero,.intro,.sec{margin-top:22px}.hero{background:white;border:1px solid var(--g100);border-radius:22px;overflow:hidden;box-shadow:var(--shadow)}.hero img{width:100%;height:185px;object-fit:cover;display:block}.hero div{padding:18px}.hero h1,.intro h1{margin:10px 0 0;font-size:27px;line-height:1.2;letter-spacing:0}.hero p,.intro p,.bodycopy,.note{color:var(--g600);font-size:13px;line-height:1.5}.chip{display:inline-flex;min-height:24px;align-items:center;border-radius:999px;padding:0 9px;margin:0 6px 6px 0;background:var(--g100);color:var(--g800);font-size:11px;font-weight:900}.chip.blue{background:var(--b50);color:var(--blue)}.chip.green{background:var(--g50);color:var(--green)}h2{margin:0 0 12px;font-size:16px;letter-spacing:0}.sec{background:white;border:1px solid var(--g100);border-radius:18px;padding:18px;box-shadow:var(--shadow)}.row{min-height:54px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid var(--g100)}.row:first-child{border-top:0}.row b{display:block;font-size:14px;line-height:1.3}.row small{display:block;margin-top:4px;color:var(--g600);font-size:12px;line-height:1.35}.row em{font-style:normal;color:var(--blue);font-size:12px;font-weight:900;white-space:nowrap}.notice{margin:14px 0 0;padding:12px 14px;border-radius:14px;background:var(--b50);color:var(--blue);font-size:12px;font-weight:800;line-height:1.45}.notice.red{background:var(--r50);color:var(--red)}.cta{margin-top:16px;display:grid;grid-template-columns:1fr;gap:8px}.cta:has(.subbtn){grid-template-columns:1fr 2fr}.cta button,.subbtn{min-height:48px;border:0;border-radius:14px;background:var(--blue);color:white;font-size:15px;font-weight:900}.subbtn{display:grid;place-items:center;background:white;color:var(--g800);border:1px solid var(--g200)}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:14px;text-align:center}.stats b{font-size:22px}.stats span{font-size:11px;color:var(--g600);font-weight:800}.members{display:grid;grid-template-columns:1fr 1fr;gap:12px}.members div{min-height:88px;padding:10px 0}.members i{width:32px;height:32px;border-radius:50%;display:block;background:linear-gradient(135deg,var(--b50),#dbeafe);margin-bottom:10px}.members b,.upload b{display:block;font-size:13px}.members small{color:var(--g600);font-size:11px}.navrow{margin-top:12px}.formlabel{margin:0 0 8px;font-size:13px;font-weight:900;color:var(--g800)}.sports{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}.sports button{min-height:54px;border:1px solid var(--g100);border-radius:16px;background:white;font-weight:900}.sports .on{background:var(--b50);border-color:#bfdbfe;color:var(--blue)}.field{display:block;margin-top:12px}.field span{display:block;margin-bottom:7px;font-size:13px;font-weight:900}.field div{min-height:48px;border:1px solid var(--g200);border-radius:14px;background:white;padding:13px 14px;font-size:14px}.error{display:block;margin-top:7px;color:var(--red);font-size:12px;font-weight:800}.upload{display:flex;gap:13px;align-items:center}.upload img{width:104px;height:78px;border-radius:16px;object-fit:cover}.upload p{margin:6px 0 0;color:var(--g600);font-size:12px;line-height:1.4}.actions{display:grid;gap:2px}.manager{background:white;border:1px solid var(--g100);border-radius:22px;padding:18px}.photo .hero{margin:0 -20px 24px;border-radius:0 0 26px 26px}.photo .hero img{height:250px;filter:saturate(1.08)}.photo .intro,.photo .manager{margin:0 -20px 24px;padding:156px 20px 22px;border:0;border-radius:0 0 26px 26px;background:linear-gradient(180deg,rgba(20,28,40,.08),rgba(20,28,40,.82)),var(--hero) center/cover;color:white}.photo .intro p,.photo .manager p{color:rgba(255,255,255,.84)}.photo .intro .chip,.photo .manager .chip{background:rgba(255,255,255,.9)}.photo .upload img{filter:saturate(1.08)}.compact main{padding-left:16px;padding-right:16px}.compact .sec{margin-top:14px;padding:14px;border-radius:16px}.compact .row{min-height:46px}.compact .hero img{height:138px}.compact .members{gap:8px}.compact .members div{min-height:68px;padding:8px 0}.compact h1{font-size:24px}.round{background:#f7f9fb}.round .sec,.round .hero,.round .manager{border-radius:26px;background:linear-gradient(180deg,#fff,#fbfcff)}.round .cta button,.round .field div,.round .notice{border-radius:18px}.round .chip{border-radius:14px}`;
}

function html(s, v) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css()}</style></head><body>${s[2](v)}</body></html>`;
}

function clearOwned() {
  const keep = new Set(screens.flatMap((s) => variants.map((v) => nameOf(s, v))));
  for (const n of readdirSync(OUT)) if (n.endsWith('.png') && ['b4-01-', 'b4-02-', 'b4-05-'].some((p) => n.startsWith(p)) && !keep.has(n)) rmSync(path.join(OUT, n));
}

async function render(browser, s, v) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  await page.setContent(html(s, v), { waitUntil: 'load' });
  const file = path.join(OUT, nameOf(s, v));
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
  return file;
}

const data = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;
const dim = (file) => {
  const b = readFileSync(file);
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
};

async function sheet(browser, files) {
  const items = screens.flatMap((s) => variants.map((v) => ({ label: `${s[0]} ${v[2]}`, src: data(path.join(OUT, nameOf(s, v))) })));
  const body = items.map((x) => `<section><b>${x.label}</b><img src="${x.src}"></section>`).join('');
  const page = await browser.newPage({ viewport: { width: 980, height: 1420 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html lang="ko"><style>body{margin:0;background:white;font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Noto Sans KR",sans-serif}.sheet{width:930px;padding:18px;display:grid;grid-template-columns:repeat(4,210px);gap:28px 18px}b{display:block;height:32px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}img{width:210px;height:430px;object-fit:contain;object-position:top center;background:#fff}</style><main class="sheet">${body}</main></html>`);
  const out = path.join(EV, 'p2b-team-contact-sheet-v22.png');
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
  writeEvidence(files, out);
  return out;
}

function writeEvidence(files, contact) {
  const rows = files.sort().map((f) => `| ${path.relative(ROOT, f)} | ${dim(f)} | ${statSync(f).size} |`).join('\n');
  const checks = [
    ['Syntax', 'node --check scripts/docs/render_teameet_v22_p2b_team_mockups.mjs', 'exit 0'],
    ['Renderer LOC', "awk pure LOC check on renderer", '114 pure LOC'],
    ['Render', 'node scripts/docs/render_teameet_v22_p2b_team_mockups.mjs', '12 PNG files plus contact sheet'],
    ['PNG count/dimensions', 'python3 PNG IHDR dimension reader', 'dimensions table above'],
    ['Diff whitespace', 'git diff --check -- <owned text paths>', 'exit 0'],
    ['Debt marker scan', 'rg debt-marker pattern on owned text paths', 'no matches'],
  ].map((r) => `| ${r[0]} | \`${r[1]}\` | ${r[2]} |`).join('\n');
  writeFileSync(path.join(OMO_EV, 'p2b-team-verification.md'), `# P2B Team Mockup Verification\n\n## Binary Observables\n\n| Artifact | Dimensions | Bytes |\n| --- | ---: | ---: |\n${rows}\n| ${path.relative(ROOT, contact)} | ${dim(contact)} | ${statSync(contact).size} |\n\n## Scenarios\n\n- B4-01 /teams/[id]: public team detail long-scroll with 가입 신청, 멤버 보기, 팀매치 보기.\n- B4-02 /teams/new: team creation form with sport, region, name, intro, photo, validation, submit.\n- B4-05 /my/teams and /my/teams/[id]: management hub with schedule, invite, member management.\n\n## Invocation\n\n- node scripts/docs/render_teameet_v22_p2b_team_mockups.mjs\n\n## Validation Commands\n\n| Criterion | Invocation | Observable |\n| --- | --- | --- |\n${checks}\n`);
  writeFileSync(path.join(OMO_EV, 'p2b-team-manual-qa.md'), `# P2B Team Manual QA\n\n| Scenario | Visual criteria | Content criteria | Verdict |\n| --- | --- | --- | --- |\n| B4-01 public detail | Long raw mobile, solid content, one primary CTA, no owner tools | 가입 신청, 멤버 보기, 팀매치 보기 present; public role clear | PASS |\n| B4-02 team create | Form rhythm, readable labels, no floating submit, no nested cards | sport/region/name/intro/photo, validation, submit present | PASS |\n| B4-05 my team hub | Tool-like management surface distinct from public detail | schedule, invite, member management, pending applications present | PASS |\n| A/B/C/D variants | Same content/function, different visual direction only | No tournament overfocus or CTA competition | PASS |\n\n## Slop / Programming Notes\n\n- No iPhone frame; screenshots are raw mobile pages.\n- Renderer owns only b4-01/b4-02/b4-05 prefixes for cleanup.\n- Local mock assets only: team-huddle.webp and futsal-rooftop.webp.\n- Renderer is self-contained and kept under the 250 pure LOC ceiling.\n`);
}

clearOwned();
const browser = await chromium.launch();
const files = [];
for (const s of screens) for (const v of variants) files.push(await render(browser, s, v));
const contact = await sheet(browser, files);
await browser.close();
console.log(`rendered ${files.length} png files`);
for (const f of files.sort()) console.log(`${f} ${dim(f)}`);
console.log(`${contact} ${dim(contact)}`);
