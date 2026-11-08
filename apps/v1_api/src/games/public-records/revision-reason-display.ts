import { QUICK_RESULT_REASON_MARKER } from '../../tournament-operations/results/quick-result.constants';

/** League result entry/correction paths prefix `reason` with an uppercase audit code such as `[LEAGUE_RESULT_ENTRY]`. */
const AUDIT_CODE_MARKER = /^\[[A-Z0-9_]+\]\s*/;

/**
 * Public wording of a result revision's `reason`: leading machine markers removed, `null` when nothing
 * human-written remains. Markers are stored because writers classify revisions by them (startsWith),
 * so the stored value stays untouched and only the public response is cleaned. Only leading markers go —
 * a marker-looking token inside a sentence, or a non-uppercase bracket prefix like `[비고]`, is operator text.
 */
export function displayRevisionReason(reason: string | null): string | null {
  let text = reason ?? '';
  for (;;) {
    const stripped = text.startsWith(QUICK_RESULT_REASON_MARKER)
      ? text.slice(QUICK_RESULT_REASON_MARKER.length).trimStart()
      : text.replace(AUDIT_CODE_MARKER, '');
    if (stripped === text) break;
    text = stripped;
  }
  text = text.trim();
  return text === '' ? null : text;
}
