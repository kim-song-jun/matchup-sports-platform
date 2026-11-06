import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { accountPasswordIssue } from './account-password-rules';

/**
 * The form hint and the server must judge a password the same way, and the two apps are built from separate
 * folders, so the rule file is kept as a byte-for-byte copy. This is the only thing that notices when one side
 * is edited alone.
 */
const SERVER_RULES = '../v1_api/src/auth/account-password-rules.ts';
const WEB_RULES = 'src/lib/account-password-rules.ts';

describe('account password rules', () => {
  it('is an exact copy of the server rule file', () => {
    // vitest's cwd is apps/v1_web (vitest-must-run-from-app-dir).
    const server = readFileSync(resolve(process.cwd(), SERVER_RULES), 'utf8');
    const web = readFileSync(resolve(process.cwd(), WEB_RULES), 'utf8');

    expect(
      web === server,
      `${WEB_RULES} differs from apps/v1_api/src/auth/account-password-rules.ts. Edit the server file, then copy it over it.`,
    ).toBe(true);
  });

  it('judges passwords the way the signup form relies on', () => {
    expect(accountPasswordIssue('1234567')).toBe('too_short');
    expect(accountPasswordIssue('Qwer1234')).toBe('too_common');
    expect(accountPasswordIssue('Sunny-ride-4')).toBeNull();
  });
});
