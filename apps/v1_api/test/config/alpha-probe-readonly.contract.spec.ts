import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * **alpha 를 여는 도구는 읽기만 한다 — 그 성질을 테스트로 묶는다.**
 *
 * ## 왜 주석이 아니라 테스트인가
 * 이 저장소에서 **alpha 데이터를 만들거나 바꾸는 실행은 사용자 직접 승인이 필요하다.**
 * 지금 이 스크립트들은 `goto`·`evaluate`·`screenshot` 만 쓰므로 승인 없이 돌릴 수 있는데,
 * 그건 **코드가 그렇게 생겨서**이지 어디에도 강제돼 있지 않다. 다음 사람이 편의로
 * `page.click('신청하기')` 한 줄을 넣는 순간 **그 도구는 alpha 에 신청 row 를 만드는
 * 도구가 되고, 승인 없이 돌리면 안 되는 것이 된다.** 그 전환이 조용히 일어나면 안 된다.
 *
 * 주석으로 적어 두면 지켜지지 않는다는 것은 이 저장소가 이미 여러 번 보여줬다 — 그래서
 * 게이트로 건다.
 *
 * ## 이 테스트가 잡는 실제 결함
 * 누군가 프로브에 클릭·폼 입력·mutation 요청을 추가한다 → **red.**
 * 그때 할 일은 이 테스트를 고치는 게 아니라, **그 도구가 승인이 필요한 도구가 됐다는 것을
 * 인정하고** 목록에서 빼거나 사용자 승인 절차를 붙이는 것이다.
 */

/** 읽기 전용이어야 하는 alpha 도구들. 새로 만들면 여기 추가한다. */
const READ_ONLY_SCRIPTS = [
  'scripts/probe-alpha-league-subroutes.mjs',
  'scripts/capture-alpha-league-on-tournament-surface.mjs',
  'scripts/capture-alpha-competition-lists.mjs',
];

/**
 * 화면을 **바꾸는** 동작들. `page.click` 하나만 막으면 `dispatchEvent` 로 우회되므로
 * playwright 의 상호작용 API 를 함께 센다.
 */
const MUTATING_TOKENS = [
  '.click(',
  '.dblclick(',
  '.fill(',
  '.press(',
  '.type(',
  '.check(',
  '.selectOption(',
  '.setInputFiles(',
  '.dispatchEvent(',
  'requestSubmit(',
  '.submit(',
];

/** 서버 상태를 바꾸는 HTTP 메서드. `POST` 는 로그인에 필요해 따로 다룬다. */
const MUTATING_METHODS = ["method: 'PUT'", "method: 'PATCH'", "method: 'DELETE'"];

const repoRoot = resolve(__dirname, '../../../..');

describe('alpha 프로브는 읽기 전용이다', () => {
  it.each(READ_ONLY_SCRIPTS)('%s 가 실제로 존재한다', (relative) => {
    // 없는 파일을 검사하면 아래 단언이 전부 vacuous 하다 — 파일이 사라지면 여기서 red 다.
    expect(existsSync(resolve(repoRoot, relative))).toBe(true);
  });

  it.each(READ_ONLY_SCRIPTS)('%s 에 화면을 바꾸는 동작이 없다', (relative) => {
    const source = readFileSync(resolve(repoRoot, relative), 'utf8');
    // 검사 대상이 비면 "토큰 0개" 가 성립해 통과한다 — 내용이 있는지 먼저 본다.
    expect(source.length).toBeGreaterThan(500);
    const found = MUTATING_TOKENS.filter((token) => source.includes(token));
    expect(found).toEqual([]);
  });

  it.each(READ_ONLY_SCRIPTS)('%s 의 쓰기 메서드는 로그인 POST 하나뿐이다', (relative) => {
    const source = readFileSync(resolve(repoRoot, relative), 'utf8');
    expect(MUTATING_METHODS.filter((m) => source.includes(m))).toEqual([]);

    // POST 는 세션 발급에만 쓴다. 개수를 세어 **두 번째 POST 가 생기면 red** 로 만든다 —
    // 그게 "로그인 말고 다른 걸 보낸다" 는 뜻이다.
    const postCount = source.split("method: 'POST'").length - 1;
    expect(postCount).toBeLessThanOrEqual(1);
    if (postCount === 1) {
      // 그 하나가 정말 로그인인지 확인한다. 개수만 세면 다른 POST 로 바꿔치기해도 통과한다.
      expect(source).toMatch(/auth\/login/);
    }
  });
});
