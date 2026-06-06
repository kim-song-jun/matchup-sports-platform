import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeDevLoginSession, v1SessionHeaders } from './v1-open-design-auth.mjs';

test('Given current v1 dev-login response When session is normalized Then local session identity is preserved', () => {
  const session = normalizeDevLoginSession({
    status: 'success',
    data: {
      session: { userId: 'user-1', userEmail: 'host@teameet.v1' },
      user: { id: 'user-1', email: 'host@teameet.v1' },
    },
  });

  assert.deepEqual(session, {
    user: { id: 'user-1', email: 'host@teameet.v1' },
    userEmail: 'host@teameet.v1',
    userId: 'user-1',
  });
  assert.deepEqual(v1SessionHeaders(session), {
    'x-v1-user-email': 'host@teameet.v1',
    'x-v1-user-id': 'user-1',
  });
});

test('Given legacy user-shaped payload When session is normalized Then user id fallback still works', () => {
  assert.deepEqual(normalizeDevLoginSession({ user: { id: 'user-2', email: 'owner@teameet.v1' } }), {
    user: { id: 'user-2', email: 'owner@teameet.v1' },
    userEmail: 'owner@teameet.v1',
    userId: 'user-2',
  });
});

test('Given invalid dev-login payload When session is normalized Then the harness fails closed', () => {
  assert.throws(() => normalizeDevLoginSession({ data: {} }), /does not contain a v1 session identity/);
});
