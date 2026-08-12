/**
 * 위저드 작성 중 내용(드래프트)을 localStorage에 잠시 맡아두는 계층.
 *
 * ## 왜 만료가 필요한가 (2026-08 사용자 제보)
 *
 * 매치·팀매치 생성 위저드는 step마다 별도 라우트라 컴포넌트가 재마운트된다. 그래서 종목·지역
 * 선택과 입력값을 localStorage에 영속시키는데, **지우는 시점이 "생성 성공" 하나뿐이었다.**
 * 위저드를 중간에 빠져나오면 그 값이 무기한 남아, 며칠 뒤 새 매치를 만들 때 지난번 종목·지역이
 * 기본값인 것처럼 되살아났다("설정이 로컬스토리지에 있으면 자꾸 매치가 이상해진다"). 사용자는
 * 새로 고르는 중이라고 믿는데 화면은 옛 선택을 복원하고 있으니, 의도하지 않은 종목·지역으로
 * 매치가 만들어질 수 있었다.
 *
 * 만료를 붙이면 "잠깐 나갔다 돌아오는" 정상 흐름은 그대로 보존하면서 오래된 찌꺼기는 스스로
 * 사라진다. 이탈 시점에 지우지 않는 이유는, 사용자가 실수로 뒤로 가거나 새로고침한 경우까지
 * 작성 내용을 날려버리게 되기 때문이다 — 만료는 그 둘을 시간으로 가른다.
 */

/** 하루. 위저드 한 번은 보통 몇 분이라 "잠깐 이탈 후 복귀"는 넉넉히 덮고, 어제 이전의
 * 드래프트는 새 작성으로 취급한다. */
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

interface Envelope<T> {
  savedAt: number;
  value: T;
}

function isEnvelope(value: unknown): value is Envelope<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { savedAt?: unknown }).savedAt === 'number' &&
    'value' in value
  );
}

/** localStorage 자체가 막힌 환경(프라이빗 모드·일부 WebView)에서도 화면이 죽지 않게 한다 —
 * 드래프트 보존은 편의 기능이므로 접근 실패는 "저장된 것 없음"과 같게 다룬다. */
function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // 스토리지 접근이 차단된 환경. 지울 것도 없으므로 그대로 진행한다.
  }
}

/**
 * 만료되지 않은 드래프트만 돌려준다. 만료됐거나, 깨졌거나, 만료 정보가 없는 예전 형식이면
 * 그 자리에서 지우고 null을 준다 — 예전 형식은 언제 저장된 건지 알 수 없으니 보존하는 쪽이
 * 오히려 이 결함(오래된 값 되살아남)을 남긴다.
 */
export function readExpiringDraft<T>(key: string, now: number = Date.now()): T | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return null; // 스토리지 접근 차단 — 저장된 것이 없는 것과 동일하게 취급한다.
  }
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    safeRemove(key);
    return null;
  }

  if (!isEnvelope(parsed)) {
    safeRemove(key);
    return null;
  }
  if (now - parsed.savedAt > DRAFT_TTL_MS) {
    safeRemove(key);
    return null;
  }
  return parsed.value as T;
}

/** 저장 시각을 함께 박아 둔다 — 이 타임스탬프가 없으면 만료 판정 자체가 불가능하다. */
export function writeExpiringDraft<T>(key: string, value: T, now: number = Date.now()): void {
  try {
    window.localStorage.setItem(key, JSON.stringify({ savedAt: now, value } satisfies Envelope<T>));
  } catch {
    // 용량 초과·스토리지 차단. 드래프트 보존은 편의 기능이고 화면 상태는 메모리에 그대로
    // 있으므로, 작성 흐름을 끊지 않고 이번 저장만 포기한다.
  }
}

/** 작성이 끝났을 때(생성 성공) 명시적으로 비운다. */
export function clearExpiringDraft(key: string): void {
  safeRemove(key);
}
