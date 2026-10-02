/**
 * 선수 카드 OG 이미지가 **사용자별로 다른 그림**인지 판정한다 (Task 155).
 *
 * 이 스크립트가 있는 이유: 같은 결함을 두 번 놓쳤기 때문이다.
 *  - 1차: 라우트가 정적 생성돼 빌드 타임 폴백 한 장이 모든 id 에 나갔다.
 *  - 2차: force-dynamic 을 켰는데도 같은 폴백이었다(fetch 캐시 전략 모순 + 빈 catch).
 * 둘 다 "HTTP 200 이고 PNG 다"까지는 통과했다 -- 상태코드만 보면 못 잡는다.
 * **여러 사용자의 응답 바이트를 서로 비교**해야만 드러난다.
 *
 * 판정: 서로 다른 사용자의 sha 가 **달라야** 통과. 같으면 전원이 같은 폴백을 받고 있다.
 *
 * 사용법:
 *   node scripts/verify-alpha-og-card.mjs <userId> <userId> [...]
 *   CAPTURE_BASE_URL=... 로 대상 변경 가능(기본 alpha).
 *
 * 자격증명이 필요 없다 -- 공개 프로필과 OG 이미지는 비인증 경로다.
 */
import { createHash } from 'node:crypto';

const BASE = process.env.CAPTURE_BASE_URL ?? 'https://alpha.teameet.co.kr';
const ids = process.argv.slice(2);
if (ids.length < 2) {
  console.error('사용자 id 를 2개 이상 주세요 — 하나만으로는 "전원 동일" 결함을 볼 수 없어요.');
  process.exit(1);
}

const rows = [];
for (const id of ids) {
  const url = `${BASE}/users/${id}/card/opengraph-image`;
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  const buf = Buffer.from(await res.arrayBuffer());
  const sha = createHash('sha256').update(buf).digest('hex').slice(0, 12);
  const isPng = buf.subarray(0, 4).toString('hex') === '89504e47';
  rows.push({ id, status: res.status, bytes: buf.length, sha, isPng });
  console.log(`${id.slice(0, 8)}  HTTP ${res.status}  ${String(buf.length).padStart(7)} bytes  sha ${sha}  png=${isPng}`);
}

const bad = rows.filter((r) => r.status !== 200 || !r.isPng);
if (bad.length > 0) {
  console.error(`\n실패: PNG 200 이 아닌 응답 ${bad.length}건`);
  process.exit(1);
}

const distinct = new Set(rows.map((r) => r.sha));
console.log(`\n서로 다른 이미지: ${distinct.size} / ${rows.length}`);
if (distinct.size < 2) {
  console.error('실패: 모든 사용자가 같은 이미지를 받았다 — 폴백 한 장이 전원에게 나가고 있다.');
  process.exit(1);
}
console.log('통과: 사용자별로 다른 카드가 생성된다.');
