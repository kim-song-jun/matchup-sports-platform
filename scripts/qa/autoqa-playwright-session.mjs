#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const DEFAULT_BASE_URL = process.env.AUTOQA_BASE_URL ?? 'http://localhost:3003';
const DEFAULT_API_BASE = process.env.AUTOQA_API_BASE ?? 'http://localhost:8111';
const DEFAULT_LOGIN_PATH = '/login';
const DEFAULT_HOME_PATTERN = '/home(?:\\?|$)';
const DEFAULT_SCREENSHOT_SETTLE_MS = 500;
const REQUIRED_AUTH_KEYS = ['accessToken', 'refreshToken', 'authUser'];

function fail(message) {
  console.error(`autoqa-session: ERROR: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { _: [] };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      options._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = rest[index + 1];
    if (next === undefined || next.startsWith('--')) {
      options[key] = true;
      continue;
    }

    if (options[key] === undefined) {
      options[key] = next;
    } else if (Array.isArray(options[key])) {
      options[key].push(next);
    } else {
      options[key] = [options[key], next];
    }
    index += 1;
  }

  return { command, options };
}

function toArray(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function formatUrl(baseUrl, routePath) {
  return new URL(routePath, baseUrl).toString();
}

function readStorageState(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`storage state file not found: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getStorageOrigin(state, baseUrl) {
  const origin = new URL(baseUrl).origin;
  return {
    origin,
    entry: state.origins?.find((candidate) => candidate.origin === origin) ?? null,
  };
}

function readLocalStorageMap(originEntry) {
  return Object.fromEntries((originEntry?.localStorage ?? []).map((entry) => [entry.name, entry.value]));
}

function upsertLocalStorage(originEntry, name, value) {
  const localStorage = Array.isArray(originEntry.localStorage) ? originEntry.localStorage : [];
  const next = localStorage.filter((entry) => entry.name !== name);
  next.push({ name, value });
  originEntry.localStorage = next;
}

async function collectStorageKeys(page) {
  return page.evaluate(() => ({
    accessToken: Boolean(localStorage.getItem('accessToken')),
    refreshToken: Boolean(localStorage.getItem('refreshToken')),
    authUser: Boolean(localStorage.getItem('authUser')),
  }));
}

async function loginViaApi(apiBase, nickname) {
  const response = await fetch(new URL('/api/v1/auth/dev-login', apiBase), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  });

  if (!response.ok) {
    const body = await response.text();
    fail(`dev-login API failed for ${nickname}: ${response.status} ${body}`);
  }

  const payload = await response.json();
  const data = payload.data ?? payload;
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    user: data.user,
  };
}

async function refreshViaApi(apiBase, refreshToken) {
  const response = await fetch(new URL('/api/v1/auth/refresh', apiBase), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    const body = await response.text();
    fail(`auth refresh failed: ${response.status} ${body}`);
  }

  const payload = await response.json();
  const data = payload.data ?? payload;
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  };
}

async function refreshStorageStateIfNeeded(storageStatePath, baseUrl, apiBase) {
  if (!storageStatePath) {
    return undefined;
  }

  const state = readStorageState(storageStatePath);
  const { origin, entry } = getStorageOrigin(state, baseUrl);
  if (!entry) {
    fail(`storage state ${storageStatePath} is missing origin ${origin}`);
  }

  const storageMap = readLocalStorageMap(entry);
  for (const key of REQUIRED_AUTH_KEYS) {
    if (!storageMap[key]) {
      fail(`storage state ${storageStatePath} is missing localStorage key: ${key}`);
    }
  }

  const refreshed = await refreshViaApi(apiBase, storageMap.refreshToken);
  upsertLocalStorage(entry, 'accessToken', refreshed.accessToken);
  upsertLocalStorage(entry, 'refreshToken', refreshed.refreshToken);

  fs.writeFileSync(storageStatePath, JSON.stringify(state, null, 2));
  return state;
}

async function runCapture(options) {
  const persona = options.persona;
  const label = options.label;
  const out = options.out;
  const mode = options.mode ?? 'api';
  const baseUrl = options['base-url'] ?? DEFAULT_BASE_URL;
  const apiBase = options['api-base'] ?? DEFAULT_API_BASE;
  const loginPath = options['login-path'] ?? DEFAULT_LOGIN_PATH;
  const postLoginPattern = options['post-login-pattern'] ?? DEFAULT_HOME_PATTERN;

  if (!persona) fail('missing --persona');
  if (!label) fail('missing --label');
  if (!out) fail('missing --out');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });

    await page.goto(formatUrl(baseUrl, loginPath), { waitUntil: 'domcontentloaded' });
    if (mode === 'ui') {
      await page.locator("[data-testid='dev-login-input']").waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator("[data-testid='dev-login-input']").fill(label);
      await page.locator("[data-testid='dev-login-submit']").click();
      await page.waitForFunction((keys) => keys.every((key) => Boolean(localStorage.getItem(key))), REQUIRED_AUTH_KEYS, {
        timeout: 20_000,
      });
      await page.waitForURL(new RegExp(postLoginPattern), { timeout: 5_000 }).catch(() => {});
    } else if (mode === 'api') {
      const tokens = await loginViaApi(apiBase, label);
      await page.evaluate((payload) => {
        localStorage.setItem('accessToken', payload.accessToken);
        localStorage.setItem('refreshToken', payload.refreshToken);
        if (payload.user) {
          localStorage.setItem('authUser', JSON.stringify(payload.user));
        }
      }, tokens);
      await page.waitForFunction((keys) => keys.every((key) => Boolean(localStorage.getItem(key))), REQUIRED_AUTH_KEYS, {
        timeout: 5_000,
      });
    } else {
      fail(`unsupported capture mode: ${mode}`);
    }

    const storageKeys = await collectStorageKeys(page);
    for (const key of REQUIRED_AUTH_KEYS) {
      if (!storageKeys[key]) {
        fail(`capture for ${persona} completed without required localStorage key: ${key}`);
      }
    }

    ensureDir(out);
    await context.storageState({ path: out });

    if (consoleErrors.length > 0) {
      console.warn(`autoqa-session: WARN: console errors seen during capture for ${persona}`);
    }

    console.log(`autoqa-session: captured ${persona} storage state -> ${out}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function runCheck(options) {
  const baseUrl = options['base-url'] ?? DEFAULT_BASE_URL;
  const apiBase = options['api-base'] ?? DEFAULT_API_BASE;
  const routePath = options.path;
  const storageState = options.state;
  const expectUrl = options['expect-url'];
  const selectors = toArray(options['expect-selector']);
  const requiredKeys = toArray(options['expect-storage-key']);
  const screenshot = options.screenshot;
  const waitMs = Number(options['wait-ms'] ?? 0);
  const screenshotSettleMs = Number(options['screenshot-settle-ms'] ?? DEFAULT_SCREENSHOT_SETTLE_MS);
  const noConsoleErrors = Boolean(options['no-console-errors']);

  if (!routePath) fail('missing --path');

  const browser = await chromium.launch({ headless: true });
  const refreshedStorageState = await refreshStorageStateIfNeeded(storageState, baseUrl, apiBase);
  const context = await browser.newContext(
    refreshedStorageState ? { storageState: refreshedStorageState } : storageState ? { storageState } : {},
  );
  const page = await context.newPage();
  const consoleErrors = [];

  try {
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });

    await page.goto(formatUrl(baseUrl, routePath), { waitUntil: 'domcontentloaded' });

    if (expectUrl) {
      await page.waitForURL(new RegExp(expectUrl), { timeout: 20_000 });
    }

    if (waitMs > 0) {
      await page.waitForTimeout(waitMs);
    }

    for (const selector of selectors) {
      await page.locator(selector).first().waitFor({ state: 'visible', timeout: 10_000 });
    }

    if (requiredKeys.length > 0) {
      const present = await page.evaluate((keys) => Object.fromEntries(
        keys.map((key) => [key, Boolean(localStorage.getItem(key))]),
      ), requiredKeys);

      for (const key of requiredKeys) {
        if (!present[key]) {
          fail(`loaded state is missing required localStorage key: ${key}`);
        }
      }
    }

    if (screenshot) {
      if (screenshotSettleMs > 0) {
        await page.waitForTimeout(screenshotSettleMs);
      }
      ensureDir(screenshot);
      await page.screenshot({ path: screenshot, fullPage: false });
    }

    if (noConsoleErrors && consoleErrors.length > 0) {
      fail(`console errors detected: ${consoleErrors[0]}`);
    }

    console.log(`autoqa-session: check passed for ${routePath}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (command === 'capture') {
    await runCapture(options);
    return;
  }

  if (command === 'check') {
    await runCheck(options);
    return;
  }

  fail('usage: autoqa-playwright-session.mjs <capture|check> [options]');
}

await main();
