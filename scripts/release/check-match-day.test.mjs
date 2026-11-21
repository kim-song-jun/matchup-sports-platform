import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectMatchDay, isOverridden, kstDate, main } from './check-match-day.mjs';

// 2026-11-21 10:00 KST
const NOW = new Date('2026-11-21T01:00:00.000Z');

function fakeApi({ tournaments, schedules, failOn }) {
  const calls = [];
  const fetchImpl = async (url) => {
    const path = url.replace('https://api.test/v1', '');
    calls.push(path);
    if (failOn && path.startsWith(failOn)) return { ok: false, status: 503, json: async () => ({}) };
    if (path.startsWith('/tournaments?')) {
      return { ok: true, status: 200, json: async () => ({ data: { items: tournaments, pageInfo: { nextCursor: null } } }) };
    }
    const id = path.split('/')[2];
    return { ok: true, status: 200, json: async () => ({ data: { items: schedules[id] ?? [], nextCursor: null } }) };
  };
  return { fetchImpl, calls };
}

const quietLog = { log: () => {}, error: () => {} };

async function run(api, env = {}) {
  return main({ env: { PUBLIC_API_BASE: 'https://api.test/v1', ...env }, fetchImpl: api.fetchImpl, now: NOW, log: quietLog });
}

test('KST date rolls over at 15:00 UTC, not at UTC midnight', () => {
  assert.equal(kstDate(new Date('2026-11-21T14:59:59.000Z')), '2026-11-21');
  assert.equal(kstDate(new Date('2026-11-21T15:00:00.000Z')), '2026-11-22');
  assert.equal(kstDate(new Date('2026-11-20T15:00:00.000Z')), '2026-11-21');
});

test('only the exact word or today\'s date overrides — a stale date or a typo does not', () => {
  const today = '2026-11-21';
  assert.equal(isOverridden({ confirmation: 'MATCHDAY', overrideDate: '', today }), true);
  assert.equal(isOverridden({ confirmation: '', overrideDate: today, today }), true);
  assert.equal(isOverridden({ confirmation: 'matchday', overrideDate: '2026-11-20', today }), false);
  assert.equal(isOverridden({ confirmation: undefined, overrideDate: undefined, today }), false);
});

test('a multi-week tournament with no fixture today does not block', async () => {
  const api = fakeApi({
    tournaments: [{ id: 'league', title: '리그', status: 'in_progress' }],
    schedules: { league: [{ scheduledAt: '2026-11-25T01:00:00.000Z', status: 'scheduled' }] },
  });
  assert.equal(await run(api), 0);
});

test('a fixture today that already ended does not block', async () => {
  const api = fakeApi({
    tournaments: [{ id: 't1', title: '컵', status: 'in_progress' }],
    schedules: { t1: [{ scheduledAt: '2026-11-21T00:30:00.000Z', status: 'ended' }] },
  });
  const result = await collectMatchDay({ fetchJson: async (p) => (await (await api.fetchImpl(`https://api.test/v1${p}`)).json()).data, now: NOW });
  assert.deepEqual({ open: result.open.length, finished: result.finished }, { open: 0, finished: 1 });
  assert.equal(await run(api), 0);
});

test('a scheduled or live fixture today blocks without confirmation', async () => {
  const api = fakeApi({
    tournaments: [{ id: 't1', title: '컵', status: 'in_progress' }],
    schedules: {
      t1: [
        { scheduledAt: '2026-11-21T00:30:00.000Z', status: 'ended' },
        { scheduledAt: '2026-11-21T05:00:00.000Z', status: 'scheduled' },
      ],
    },
  });
  assert.equal(await run(api), 1);
});

test('the same match day passes with the confirmation word or today\'s override date', async () => {
  const api = fakeApi({
    tournaments: [{ id: 't1', title: '컵', status: 'in_progress' }],
    schedules: { t1: [{ scheduledAt: '2026-11-21T05:00:00.000Z', status: 'live' }] },
  });
  assert.equal(await run(api, { MATCHDAY_CONFIRMATION: 'MATCHDAY' }), 0);
  assert.equal(await run(api, { MATCHDAY_OVERRIDE_DATE: '2026-11-21' }), 0);
  assert.equal(await run(api, { MATCHDAY_OVERRIDE_DATE: '2026-11-20' }), 1);
});

test('a fixture at 00:30 KST tomorrow is not today', async () => {
  const api = fakeApi({
    tournaments: [{ id: 't1', title: '컵', status: 'in_progress' }],
    schedules: { t1: [{ scheduledAt: '2026-11-21T15:30:00.000Z', status: 'scheduled' }] },
  });
  assert.equal(await run(api), 0);
});

test('completed tournaments are not read at all', async () => {
  const api = fakeApi({ tournaments: [{ id: 'done', title: '끝난 대회', status: 'completed' }], schedules: {} });
  assert.equal(await run(api), 0);
  assert.ok(!api.calls.some((call) => call.includes('/schedule')));
});

test('an unreadable API fails closed, and only the confirmation lets it through', async () => {
  const api = fakeApi({ tournaments: [], schedules: {}, failOn: '/tournaments?' });
  assert.equal(await run(api), 1);
  assert.equal(await run(api, { MATCHDAY_CONFIRMATION: 'MATCHDAY' }), 0);
});
