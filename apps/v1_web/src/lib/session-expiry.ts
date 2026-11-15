import { trackEvent } from './analytics';
import { isUnauthenticatedError } from './api-client';
import { detectNativeShell } from './native-bridge';
import { clearStoredV1Session, hasStoredV1Session } from './session-storage';

/** Which place noticed the expiry. Fixed words: they become GA parameter values. */
export type SessionExpiredGate = 'app_gate' | 'require_auth' | 'entry_gate' | 'chat_room';

/**
 * Clears the stored sign-in hint after a 401. Every place that clears it because of a 401 goes
 * through here (sign-out and withdrawal do not). `session_expired` is sent only if the hint was
 * still on, and the clear happens in the same call, so a later pass over the same expiry sends
 * nothing. The payload carries the gate and the shell only.
 */
export function clearStoredV1SessionAfterAuthLoss(gate: SessionExpiredGate, error: unknown): void {
  if (isUnauthenticatedError(error) && hasStoredV1Session()) {
    trackEvent('session_expired', { gate, app_shell: detectNativeShell() ?? 'web' });
  }
  clearStoredV1Session();
}
