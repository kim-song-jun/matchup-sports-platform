// 심화 before/after 갤러리 생성. before=원본 baseline(81ad72b3 responsive-v1), after=W6(0ff84631 design-deep).
const fs = require('fs');
const B = '81ad72b3e872b6c3cb9a75c5f6dbd8aa5e204a30';
const A = '0ff84631191b6627cb7bca319a9febc1d50861c4';
const REPO = 'kim-song-jun/matchup-sports-platform';
const bu = (n) => `https://raw.githubusercontent.com/${REPO}/${B}/docs/visual-qa/responsive-v1/desktop/${n}.png`;
const au = (n) => `https://raw.githubusercontent.com/${REPO}/${A}/docs/visual-qa/design-deep/desktop/${n}.png`;
const am = (n) => `https://raw.githubusercontent.com/${REPO}/${A}/docs/visual-qa/design-deep/mobile/${n}.png`;

const rows = [
  ['d11-notifications', '26-notifications', '알림', 'unread full-blue fill→6px 좌측 마커(단일 액센트), hover lift 제거'],
  ['d06-team-match-detail', '16-team-match-detail', '팀매치 상세', '11 flat InfoRow→의미 그룹 카드(일정·조건·비용)+부담금 강조, 신청불가 grey disabled CTA, 호스트팀 카드 우측 컬럼'],
  ['d01-match-detail', '11-match-detail', '매치 상세', '히어로 분류 배지 중립화(종목 dot)'],
  ['d04-team-detail', '19-team-detail', '팀 상세', 'info 테이블 파란칩→sport dot, 사이드바 결정단서화, 비공개 dim 제거'],
  ['d08-tournament-detail', '22b-tournament-detail', '대회 상세', 'rail CTA 줄바꿈 해소, 순위표 폭 캡 제거'],
  ['d09-chat-list', '23-chat-list', '채팅 목록', '빈 고정0 헤더 제거, unread 배지 meta 열 정렬, desktop 빈/로딩 중앙'],
  ['d12-search', '25-search', '검색', 'quick-condition 부제 mid-word 줄바꿈 해소'],
  ['d13-my-profile-edit', '29-my-profile-edit', '프로필 편집', '모바일 고정 CTA가 생년월일 가리던 차단버그 해소, desktop CTA 재배치, native select→커스텀'],
];

let out = '## 🔬 심화 UI 격상 — Before / After (WAVE 6)\n\n';
out += '"UI 개선이 아직 부족" 피드백 → 상세/폼/채팅/알림 surface를 토스 ship 기준 ruthless critique(7 surface 전부 needs-polish, 기능버그 2건 포함) 후 격상. Before=원본 baseline(`81ad72b`, 전 디자인작업 이전), After=W6 적용(`0ff8463`). 누적 개선. 썸네일 클릭→원본.\n\n';
out += '| 화면 | Before | After | 격상 |\n|---|---|---|---|\n';
for (const [a, b, label, note] of rows) {
  out += `| **${label}**<br><sub>📱[m](${am(a)})</sub> | <a href="${bu(b)}"><img width="220" src="${bu(b)}"></a> | <a href="${au(a)}"><img width="220" src="${au(a)}"></a> | ${note} |\n`;
}
out += '\n> 기능버그 2건(프로필 모바일 CTA가 생년월일 가림·팀매치 disabled CTA 활성버튼 오인) 포함. 모든 격상 opus 적대검증(도입 회귀 5건 같은 커밋 정리) + tsc/pattern-check + 라이브 + 단위테스트 49/49.\n';
fs.writeFileSync('/tmp/deep_gallery.md', out);
console.log('len', out.length, 'chars');
