/**
 * 시작 전/후 구간 목록(개인매치·팀매치)의 커서에 "구간 기준 시각"을 싣는 순수 코덱.
 *
 * 커서 형태: `<구간>:<id>@<기준 시각 epoch ms>` (예: `upcoming:3f2a…@1790000000000`).
 * 구간 경계가 요청마다 `new Date()` 로 움직이면, 넘기는 사이 시작한 행이 "시작 전" 구간에서
 * 빠져 "시작 후" 구간에 다시 나온다. 첫 페이지에서 정한 기준 시각을 커서로 이어 한 번의
 * 순회 동안 경계를 고정한다(커서 행이 조건에서 빠질 때의 누락은 resume-after-cursor.ts 가 막는다).
 *
 * 기준 시각은 **구간 분할에만** 쓴다. 가시성 조건(공개 기간·모집 중 여부 등)은 항상 실제
 * 현재 시각을 쓴다 -- 커서는 클라이언트가 만든 값이라, 조작된 시각이 노출 범위를 넓히면 안 된다.
 *
 * 이 파일은 `@prisma/client` 를 import 하지 않는다(단위 테스트가 DB 타입 없이 돌도록).
 */

/** epoch ms 는 Date 가 허용하는 최대 16자리 안쪽의 비음수 정수만 받는다. */
const EPOCH_MS = /^\d{1,16}$/;

export interface DecodedReferenceTimeCursor {
  /** `paginateByStatePriority` 에 그대로 넘기는 `<구간>:<id>`. 없으면 첫 페이지부터. */
  cursor: string | undefined;
  /** 구간 분할 기준. 첫 페이지·구형 커서는 `now`, 이어받은 커서는 `now` 를 넘지 않는 값. */
  referenceTime: Date;
}

/**
 * - 시각 없는 `<구간>:<id>`(배포 전에 발급된 커서)는 실제 `now` 를 기준으로 이어 읽는다 --
 *   예전 동작 그대로이며, 처음부터 다시 읽으면 클라이언트가 같은 페이지를 중복해서 받는다.
 * - 시각이 깨졌거나 `@` 앞이 비면 커서 전체를 없는 것으로 취급해 첫 페이지부터 다시 읽는다
 *   (해석 불가한 구형 커서와 같은 규칙).
 * - `now` 보다 미래인 시각은 `now` 로 내린다.
 */
export function decodeReferenceTimeCursor(raw: string | undefined, now: Date): DecodedReferenceTimeCursor {
  if (!raw) return { cursor: undefined, referenceTime: now };
  const sep = raw.lastIndexOf('@');
  if (sep === -1) return { cursor: raw, referenceTime: now };

  const cursor = raw.slice(0, sep);
  const time = raw.slice(sep + 1);
  if (!cursor || !EPOCH_MS.test(time)) return { cursor: undefined, referenceTime: now };
  const ms = Number(time);
  if (Number.isNaN(new Date(ms).getTime())) return { cursor: undefined, referenceTime: now };
  return { cursor, referenceTime: new Date(Math.min(ms, now.getTime())) };
}

/** `paginateByStatePriority` 가 돌려준 다음 커서에 기준 시각을 붙인다. 다음 페이지가 없으면 `null`. */
export function encodeReferenceTimeCursor(cursor: string | null, referenceTime: Date): string | null {
  return cursor === null ? null : `${cursor}@${referenceTime.getTime()}`;
}
