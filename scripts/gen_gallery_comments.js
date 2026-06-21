// PR #29 전체 캡처 매트릭스(132장) → 페이지별 3-viewport 비교 그리드 코멘트 생성.
// 입력: /tmp/captured_pngs.txt (git ls-tree 결과), 출력: /tmp/gallery_{1..4}.md
// 이미지는 SHA 고정 raw URL(트리에서 git rm 됐어도 해당 SHA에선 렌더됨).
const fs = require('fs');

const SHA = '81ad72b3e872b6c3cb9a75c5f6dbd8aa5e204a30';
const REPO = 'kim-song-jun/matchup-sports-platform';
const base = (vp, name) =>
  `https://raw.githubusercontent.com/${REPO}/${SHA}/docs/visual-qa/responsive-v1/${vp}/${name}.png`;

const LABEL = {
  '01-landing': '랜딩', '02-login': '로그인', '03-login-email': '이메일 로그인', '04-signup': '회원가입',
  '05-onboarding-sport': '온보딩·종목', '06-onboarding-level': '온보딩·실력', '07-onboarding-region': '온보딩·지역', '08-onboarding-confirm': '온보딩·확인',
  '09-home': '홈', '10-matches-list': '매치 목록', '11-match-detail': '매치 상세', '12-match-new-info': '매치 생성·정보',
  '13-match-new-sport': '매치 생성·종목', '14-match-new-placetime': '매치 생성·장소시간', '15-team-matches-list': '팀매치 목록',
  '16-team-match-detail': '팀매치 상세', '17-team-match-new': '팀매치 생성', '18-teams-list': '팀 목록', '19-team-detail': '팀 상세',
  '20-team-members': '팀 멤버', '21-team-new': '팀 생성', '22-tournaments-list': '대회 목록', '22b-tournament-detail': '대회 상세',
  '23-chat-list': '채팅 목록', '24-chat-room': '채팅방', '25-search': '검색', '26-notifications': '알림', '27-notices': '공지',
  '28-my': '마이', '29-my-profile-edit': '프로필 편집', '30-my-teams': '내 팀', '31-my-matches': '내 매치', '32-my-reviews': '내 리뷰',
  '33-my-settings': '설정', '34-my-settings-notifications': '설정·알림', '35-my-settings-sports': '설정·종목', '36-team-members-private': '팀 멤버(비공개)',
  'admin-02-overview': '관리자·개요', 'admin-03-users': '관리자·사용자', 'admin-04-matches': '관리자·매치', 'admin-05-teams': '관리자·팀',
  'admin-06-team-matches': '관리자·팀매치', 'admin-07-audit': '관리자·감사로그', 'admin-08-admins': '관리자·관리자',
};

const lines = fs.readFileSync('/tmp/captured_pngs.txt', 'utf8').trim().split('\n');
const order = [];
const seen = new Set();
for (const l of lines) {
  const m = l.match(/responsive-v1\/(?:mobile|tablet|desktop)\/(.+)\.png$/);
  if (m && !seen.has(m[1])) { seen.add(m[1]); order.push(m[1]); }
}

const cell = (vp, name) => `<a href="${base(vp, name)}"><img width="230" src="${base(vp, name)}" alt="${name} ${vp}"></a>`;
const row = (name) =>
  `| **${LABEL[name] || name}**<br><sub>\`${name}\`</sub> | ${cell('mobile', name)} | ${cell('tablet', name)} | ${cell('desktop', name)} |`;

function table(names) {
  return [
    '| 페이지 | 📱 Mobile 390 | 📲 Tablet 768 | 🖥 Desktop 1440 |',
    '|---|---|---|---|',
    ...names.map(row),
  ].join('\n');
}

const groups = [
  { file: 1, title: '전체 캡처 매트릭스 ① — 공개 · 온보딩',
    note: '비로그인 공개 화면과 신규 가입 온보딩 4단계. 썸네일 클릭 시 원본(fullPage) 확대.',
    pick: (n) => /^0[1-8]-/.test(n) },
  { file: 2, title: '전체 캡처 매트릭스 ② — 메인(소비자) 핵심 플로우',
    note: '매치/팀매치/팀/대회/채팅 생성·목록·상세. host 페르소나 인증 기준.',
    pick: (n) => /^(09|1[0-9]|2[0-4]|22b)-/.test(n) },
  { file: 3, title: '전체 캡처 매트릭스 ③ — 검색 · 알림 · 마이 · 설정',
    note: '검색/알림/공지 및 마이페이지·설정 하위 전체.',
    pick: (n) => /^(2[5-9]|3[0-6])-/.test(n) },
  { file: 4, title: '전체 캡처 매트릭스 ④ — 관리자(Admin, Desktop)',
    note: '관리자 대시보드 전 목록 페이지. 과폭 방지 max-w 캡 적용 상태.',
    pick: (n) => /^admin-/.test(n) },
];

let total = 0;
for (const g of groups) {
  const names = order.filter(g.pick);
  total += names.length;
  const body = [
    `## 📸 ${g.title}`,
    '',
    `${g.note}`,
    `포함 ${names.length}개 페이지 × 3 viewport = **${names.length * 3}장** · SHA \`${SHA.slice(0, 7)}\` 고정.`,
    '',
    table(names),
  ].join('\n');
  fs.writeFileSync(`/tmp/gallery_${g.file}.md`, body);
  console.log(`gallery_${g.file}.md: ${names.length} pages (${names.length * 3} imgs), ${body.length} chars`);
}
console.log(`TOTAL pages: ${total} (expected 44), imgs: ${total * 3} (expected 132)`);
