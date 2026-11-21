#!/usr/bin/env node
// Production release gate: stops a promotion or production deploy while a tournament fixture
// is scheduled or live today (KST), unless the operator confirmed it explicitly.
//
// Reads only public endpoints (GET /tournaments, GET /tournaments/:id/schedule). When the
// fixtures cannot be read the gate fails closed, so an outage never looks like a quiet day —
// a hotfix passes with the explicit confirmation like any other match-day release.

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const CONFIRMATION_WORD = 'MATCHDAY';
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const PAGE_LIMIT = 50;
const SCHEDULE_PAGE_LIMIT = 100;
const MAX_PAGES = 20;
const OPEN_FIXTURE_STATUSES = new Set(['scheduled', 'live']);
const SKIPPED_TOURNAMENT_STATUSES = new Set(['completed', 'cancelled', 'draft']);

/** Calendar date (YYYY-MM-DD) of an instant in Asia/Seoul, by epoch arithmetic. */
export function kstDate(instant) {
  return new Date(instant.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * A stale or mistyped confirmation never passes. `confirmation` is the word typed into a
 * workflow_dispatch input; `overrideDate` is the repository variable the owner sets to today's
 * KST date for a push-triggered deploy, so the override expires at midnight by itself.
 */
export function isOverridden({ confirmation, overrideDate, today }) {
  return (confirmation ?? '').trim() === CONFIRMATION_WORD || (overrideDate ?? '').trim() === today;
}

// `isDone(pageItems)` ends the walk early for lists that are sorted by the field it checks.
async function pagedItems(fetchJson, pathFor, pageLimit, isDone = () => false) {
  const items = [];
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await fetchJson(pathFor(cursor));
    const pageItems = data.items ?? [];
    items.push(...pageItems);
    cursor = data.pageInfo?.nextCursor ?? data.nextCursor ?? null;
    if (!cursor || isDone(pageItems)) return items;
  }
  throw new Error(`${pathFor(null)} 가 ${MAX_PAGES * pageLimit} 건을 넘어 끝까지 읽지 못했어요.`);
}

/**
 * Fixtures kicking off today (KST) in every tournament whose date window overlaps today.
 * Returns the ones not yet finished (`open`) and a count of the finished ones.
 */
export async function collectMatchDay({ fetchJson, now }) {
  const today = kstDate(now);
  const tournaments = await pagedItems(
    fetchJson,
    (cursor) => `/tournaments?dateFrom=${today}&dateTo=${today}&limit=${PAGE_LIMIT}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    PAGE_LIMIT,
  );

  const open = [];
  let finished = 0;
  for (const tournament of tournaments) {
    if (SKIPPED_TOURNAMENT_STATUSES.has(tournament.status)) continue;
    const fixtures = await pagedItems(
      fetchJson,
      (cursor) => `/tournaments/${encodeURIComponent(tournament.id)}/schedule?limit=${SCHEDULE_PAGE_LIMIT}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      SCHEDULE_PAGE_LIMIT,
      // The schedule is ordered by kickoff, so a page ending after today has nothing left for today.
      (pageItems) => {
        const last = pageItems.at(-1)?.scheduledAt;
        return Boolean(last) && kstDate(new Date(last)) > today;
      },
    );
    for (const fixture of fixtures) {
      if (!fixture.scheduledAt || kstDate(new Date(fixture.scheduledAt)) !== today) continue;
      if (OPEN_FIXTURE_STATUSES.has(fixture.status)) {
        open.push({ title: tournament.title, scheduledAt: fixture.scheduledAt, status: fixture.status });
      } else if (fixture.status === 'ended') {
        finished += 1;
      }
    }
  }
  return { today, open, finished };
}

function formatKstTime(iso) {
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS).toISOString().slice(11, 16);
}

export function summarize({ today, open, finished }) {
  const live = open.filter((fixture) => fixture.status === 'live').length;
  const lines = [`오늘(${today}, KST) 대회 경기: 진행 중 ${live}건 · 남은 경기 ${open.length - live}건 · 끝난 경기 ${finished}건`];
  const byTitle = new Map();
  for (const fixture of open) byTitle.set(fixture.title, [...(byTitle.get(fixture.title) ?? []), fixture]);
  for (const [title, fixtures] of byTitle) {
    const last = fixtures.map((fixture) => fixture.scheduledAt).sort().at(-1);
    lines.push(`- ${title}: ${fixtures.length}건 (마지막 킥오프 ${formatKstTime(last)})`);
  }
  return lines;
}

/** Workflow-command payloads end at a newline and read `%XX` escapes, so error text from the network must be escaped. */
export function escapeCommandData(text) {
  return String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

export async function main({ env = process.env, fetchImpl = fetch, now = new Date(), log = console } = {}) {
  const base = (env.PUBLIC_API_BASE || 'https://teameet.co.kr/api/v1').replace(/\/$/, '');
  const summaryFile = env.GITHUB_STEP_SUMMARY;
  const today = kstDate(now);
  const overridden = isOverridden({
    confirmation: env.MATCHDAY_CONFIRMATION,
    overrideDate: env.MATCHDAY_OVERRIDE_DATE,
    today,
  });
  const note = (lines) => {
    if (summaryFile) appendFileSync(summaryFile, `### 경기일 배포 확인\n\n${lines.join('\n')}\n`);
  };

  const fetchJson = async (path) => {
    const response = await fetchImpl(`${base}${path}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`GET ${path} 가 ${response.status} 를 돌려줬어요.`);
    return (await response.json()).data;
  };

  let result;
  try {
    result = await collectMatchDay({ fetchJson, now });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const lines = [`오늘 경기를 확인하지 못했어요: ${reason}`];
    if (overridden) {
      log.log(`::warning::${escapeCommandData(`${lines[0]} 확인 입력이 있어 그대로 진행해요.`)}`);
      note([...lines, '확인 입력이 있어 진행했어요.']);
      return 0;
    }
    lines.push(`경기가 없는 날이거나 핫픽스라면 확인 입력(${CONFIRMATION_WORD})으로 다시 실행해 주세요.`);
    log.error(`::error::${escapeCommandData(lines.join(' '))}`);
    note(lines);
    return 1;
  }

  const lines = summarize(result);
  if (result.open.length === 0) {
    log.log(lines[0]);
    note([...lines, '남은 경기가 없어 진행해요.']);
    return 0;
  }
  if (overridden) {
    log.log(`::warning::${escapeCommandData(`${lines[0]} 확인 입력이 있어 그대로 진행해요.`)}`);
    note([...lines, '확인 입력이 있어 진행했어요.']);
    return 0;
  }
  lines.push(
    `경기가 끝난 뒤에 다시 실행하거나, 핫픽스라면 확인 입력(${CONFIRMATION_WORD})으로 다시 실행해 주세요. ` +
      `푸시로 시작된 운영 배포는 저장소 변수 PROD_MATCHDAY_OVERRIDE_DATE 를 오늘 날짜(${result.today})로 두고 실패한 작업을 다시 실행해요.`,
  );
  log.error(`::error::${escapeCommandData(lines.join(' '))}`);
  note(lines);
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main();
}
