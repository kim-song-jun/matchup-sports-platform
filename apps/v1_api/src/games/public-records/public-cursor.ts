/**
 * Task 24 -- opaque cursor for the `{items,nextCursor}` collection contract
 * (frozen REST contract: "opaque cursor"). `key` is whichever ISO-8601
 * instant the list is ordered by (`playedAt` for team records, `officialAt`
 * for user records, `scheduledAt` for the tournament schedule); `id` is the tie-breaker for
 * rows that land on the same instant, so a page boundary on a tie still
 * resumes at the exact row instead of skipping or repeating siblings.
 */
export interface RecordCursor {
  readonly key: string;
  readonly id: string;
}

export function encodeRecordCursor(value: RecordCursor): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeRecordCursor(cursor: string | undefined): RecordCursor | null {
  if (!cursor) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as RecordCursor).key !== 'string' ||
      typeof (parsed as RecordCursor).id !== 'string'
    ) {
      return null;
    }
    return parsed as RecordCursor;
  } catch {
    return null;
  }
}

/**
 * True when `row` sorts strictly after `cursor` under `(key, id)` ordered in
 * `direction` (`'desc'` for team/user records -- newest first; `'asc'` for
 * the tournament schedule -- soonest first).
 */
export function isAfterCursor(row: RecordCursor, cursor: RecordCursor, direction: 'asc' | 'desc'): boolean {
  if (row.key !== cursor.key) {
    return direction === 'desc' ? row.key < cursor.key : row.key > cursor.key;
  }
  return direction === 'desc' ? row.id < cursor.id : row.id > cursor.id;
}
