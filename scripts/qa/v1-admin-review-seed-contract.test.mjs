import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const API_BASE = process.env.API_BASE ?? 'http://localhost:8121';
const REVIEW_EMAILS = (process.env.REVIEW_EMAILS ?? 'owner@teameet.v1,admin@teameet.v1')
  .split(',')
  .map((email) => email.trim())
  .filter(Boolean);
const EVIDENCE_JSON = process.env.EVIDENCE_JSON
  ?? 'evidence/task103-admin-review-seed-20260607/reviews-api.json';

test('seeded admin review personas have pending review work', async () => {
  const evidence = [];

  for (const email of REVIEW_EMAILS) {
    evidence.push(await fetchReviewEvidence(email));
  }

  await writeEvidence({
    checkedAt: new Date().toISOString(),
    apiBase: API_BASE,
    personas: evidence,
  });

  for (const persona of evidence) {
    assert.ok(persona.totalItems > 0, `expected seeded pending reviews for ${persona.email}, got 0`);
    assert.ok(persona.readyItems > 0, `expected at least one ready review item for ${persona.email}`);
    assert.ok(
      persona.items.some((item) => item.sourceType === 'match' || item.sourceType === 'team_match'),
      `pending item for ${persona.email} must link to a reviewable source`,
    );
  }
});

async function fetchReviewEvidence(email) {
  const login = await fetchJson('/api/v1/auth/dev-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const session = unwrapData(login).session;
  assert.ok(session?.userId, 'dev-login must return a v1 user id');
  assert.equal(session.userEmail, email);

  const reviews = await fetchJson('/api/v1/reviews?tab=pending&limit=12', {
    headers: {
      'x-v1-user-id': session.userId,
      'x-v1-user-email': session.userEmail,
    },
  });
  const payload = unwrapData(reviews);
  const items = Array.isArray(payload.items) ? payload.items : [];
  const readyItems = items.filter((item) => item.state === 'ready' && Number(item.remainingCount) > 0);

  return {
    email,
    session: { userEmail: session.userEmail, hasUserId: Boolean(session.userId) },
    totalItems: items.length,
    readyItems: readyItems.length,
    items,
  };
}

async function fetchJson(pathname, init = {}) {
  const response = await fetch(`${API_BASE}${pathname}`, init);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${pathname} failed: ${response.status} ${text}`);
  }
  return body;
}

function unwrapData(body) {
  return body && typeof body === 'object' && 'data' in body ? body.data : body;
}

async function writeEvidence(value) {
  await mkdir(path.dirname(EVIDENCE_JSON), { recursive: true });
  await writeFile(EVIDENCE_JSON, `${JSON.stringify(value, null, 2)}\n`);
}
