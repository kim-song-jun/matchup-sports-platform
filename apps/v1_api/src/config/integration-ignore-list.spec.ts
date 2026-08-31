import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * `jest.config.ts` 의 `testPathIgnorePatterns` 를 **게이트로 묶는다.**
 *
 * ## 왜 주석이 아니라 테스트인가
 * 그 목록 옆에는 이미 *"새 스펙을 여기 넣지 마라"* 라는 경고가 있다. 그런데 **이 저장소는
 * 같은 경고를 여섯 번 무시했다** — `jest.config.ts` 에서 지워진 주석 6개가 전부 같은 말을
 * 담고 있었고(team-schedules · team-match-series · team-lineups · team-matches ·
 * league-matches ×6), 다음 사람은 매번 한 줄을 더 추가했다. **주석이 안 통한다는 것이
 * 6개 데이터포인트로 증명된 상태다.**
 *
 * 대가도 실제로 났다: `league-completion-projection.integration-spec.ts` 는 생성된 이래
 * 한 번도 등록된 적이 없었고, 그 파일에 봉쇄 테스트를 넣고 *"변이로 red 확인"* 이라고
 * 보고한 일이 있었다 — **실행 자체가 불가능한 파일이었다.**
 *
 * ## 두 가지를 단언한다
 * 1. **제외 경로가 디스크에 실제로 있다.** 대상이 삭제·이름변경되면 제외 항목이 거짓말이
 *    되는데, ignore 목록의 표준 부패 방식이 그것이다. 죽은 항목은 "무언가 빠져 있다"는
 *    착시만 남기고 아무것도 막지 않는다.
 * 2. **개수가 핀 고정값과 같다.** 늘리려면 이 핀을 고쳐야 하고, 그러면 리뷰를 통과해야 한다.
 *    빨간 스펙을 조용히 잠재우는 경로가 닫힌다.
 *
 * ## 이 테스트가 잡는 실제 결함
 * 누군가 깨진 통합 스펙을 고치는 대신 ignore 목록에 한 줄 더한다 → **red.**
 * 실제로 여섯 번 일어난 종류다.
 */

/**
 * 지금 제외된 스펙 수. **줄이는 방향은 자유롭게, 늘리는 방향은 이 숫자를 고쳐야 한다.**
 * 늘릴 때는 왜 지금 고칠 수 없는지를 `jest.config.ts` 의 해당 항목 옆에 적는다.
 */
const PINNED_IGNORE_COUNT = 3;

/** `jest.config.ts` 가 `<rootDir>` 접두사와 정규식 이스케이프를 쓰므로 실제 경로로 되돌린다. */
function toRepoPath(pattern: string): string {
  const stripped = pattern.replace('<rootDir>/', '').replace(/[$]$/, '');
  // **필요한 이스케이프만 명시적으로 되돌린다.** 모든 백슬래시를 무조건 지우면
  // `\\d` 나 Windows 구분자까지 **조용히 다른 문자열로 변형**되고, 그러면 이 게이트가
  // 엉뚱한 경로를 검사하면서 통과한다 — 게이트 자신이 틀리는 종류다.
  // 설정 파일의 **텍스트**에는 백슬래시가 2개 들어 있다(TS 문자열 리터럴의 이스케이프가
  // 그대로 보인다). 그래서 여기서 지울 것도 `\\\\.` 다 — 1개로 매칭하면 안 물린다.
  const unescaped = stripped.split('\\\\.').join('.');
  if (unescaped.includes('\\')) {
    throw new Error(
      `제외 패턴에 아직 모르는 이스케이프가 남아 있다: ${pattern}. ` +
        '`\\.` 외의 정규식 문법을 쓰려면 toRepoPath 를 그 문법까지 다루도록 확장해라 — ' +
        '조용히 지우면 변형된 경로로 단언이 돌아 게이트가 틀린 채 통과한다.',
    );
  }
  return unescaped;
}

describe('통합 테스트 제외 목록 (jest.config.ts testPathIgnorePatterns)', () => {
  // **설정을 import 하지 않고 파일 텍스트를 읽는다.** ts 설정을 require 하면 ts-jest 변환
  // 경로에 얽히고, 무엇보다 우리가 단언하려는 것은 *"파일에 무엇이 적혀 있는가"* 다.
  const configPath = resolve(__dirname, '../../jest.config.ts');
  const source = readFileSync(configPath, 'utf8');

  // **선언부(`testPathIgnorePatterns: [`)에 고정한다.** 이름만으로 찾으면 위쪽 주석의
  // 언급을 먼저 물어 `testMatch` 블록을 파싱하게 된다 — 실제로 그렇게 한 번 틀렸고,
  // 그때 "읽어냈다" 가드는 **통과했다**(0건이 아니라 *다른* 목록을 읽었으니까).
  // **파싱 실패는 즉시 던진다 — "찾은 게 0건" 을 "제외가 0건" 으로 절대 읽지 않는다.**
  // 이 구분이 이 파일의 전부다: 조용히 빈 배열을 내면 `it.each([])` 가 **테스트를 하나도
  // 만들지 않고**, 개수 단언만 남아 실패 이유가 "포맷이 바뀌어 못 읽었다" 로 안 읽힌다.
  // (실측: 지금 코드도 red 는 난다 — 다만 원인이 안 보인다. 여기서 던지면 원인이 보인다.)
  const DECL = 'testPathIgnorePatterns: [';
  const declAt = source.indexOf(DECL);
  if (declAt === -1) {
    throw new Error(
      `jest.config.ts 에서 '${DECL}' 를 못 찾았다 — 포맷이 바뀌었으면 이 스펙의 파서를 같이 고쳐라. ` +
        '못 찾은 것을 "제외 0건" 으로 읽으면 이 게이트는 있으나 마나가 된다.',
    );
  }
  const block = source.slice(declAt + DECL.length);
  const endAt = block.indexOf('],');
  if (endAt === -1) {
    throw new Error("testPathIgnorePatterns 배열의 닫힘('],')을 못 찾았다 — 파서를 고쳐라.");
  }
  const patterns = [...block.slice(0, endAt).matchAll(/'([^']*<rootDir>[^']*)'/g)].map(
    (match) => match[1],
  );
  if (patterns.length === 0) {
    // 여기까지 왔다는 것은 **앵커와 닫힘은 읽혔다**는 뜻이다 — 위 두 throw 가 그걸 이미
    // 갈랐다. 그러니 남은 경우는 둘뿐이고, 문구도 그 둘만 말한다.
    throw new Error(
      '제외 목록의 선언과 닫힘은 찾았는데 **항목이 0개**다 — 배열이 정말 빈 것이거나, ' +
        "항목 표기가 바뀐 것이다(지금 파서는 작은따옴표 안의 '<rootDir>…' 만 읽는다). " +
        '전자면 이 스펙과 핀을 같이 지워라. 후자면 파서를 고쳐라.',
    );
  }

  it('제외 목록을 실제로 읽어냈다 — 못 읽으면 아래 단언이 전부 vacuous 하다', () => {
    expect(declAt).toBeGreaterThan(-1);
    expect(patterns.length).toBeGreaterThan(0);
    // 읽은 것이 **제외 목록**인지 확인한다 — 개수만 세면 다른 목록을 읽고도 통과한다.
    for (const pattern of patterns) {
      expect(toRepoPath(pattern)).toMatch(/^test\/.+\.integration-spec\.ts$/);
    }
  });

  it.each(patterns.map((p) => [toRepoPath(p)]))(
    '제외 대상이 디스크에 실제로 있다: %s',
    (repoPath) => {
      // 없으면 그 제외 항목은 아무것도 막지 않으면서 "빚이 있다"는 착시만 남긴다.
      expect(existsSync(resolve(__dirname, '../..', repoPath))).toBe(true);
    },
  );

  it(`제외 개수가 핀(${PINNED_IGNORE_COUNT})과 같다 — 늘리려면 핀을 고쳐 리뷰를 받아야 한다`, () => {
    expect(patterns).toHaveLength(PINNED_IGNORE_COUNT);
  });
});
