import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import {
  criteriaSummary,
  emailForRoute,
  isProtectedRoute,
} from './v1-open-design-parity-lib.mjs';
import {
  addV1SessionInit,
  normalizeDevLoginSession,
  setV1SessionLocalStorage,
  v1SessionHeaders,
} from './v1-open-design-auth.mjs';

export async function capturePlan(plan) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || process.env.CHROME_EXECUTABLE,
  });
  const captures = [];
  try {
    for (const target of plan.captures) {
      await mkdir(path.dirname(target.staticScreenshot), { recursive: true });
      await mkdir(path.dirname(target.liveScreenshot), { recursive: true });
      const staticCapture = await capturePage(browser, target.staticUrl, target.staticScreenshot, target.viewport);
      const preflight = await preflightLiveRoute(browser, plan.baseUrl, target.liveRoute);
      const liveCapture = preflight.blocked
        ? { status: 'BLOCKED', metrics: null, issues: [preflight.reason] }
        : await capturePage(browser, target.liveUrl, target.liveScreenshot, target.viewport, preflight.session);
      captures.push({ ...target, preflight, staticCapture, liveCapture });
    }
  } finally {
    await browser.close();
  }
  return { ...plan, quantifiedCriteria: criteriaSummary(), captures };
}

async function capturePage(browser, url, screenshot, viewport, session) {
  const page = await browser.newPage({ viewport });
  try {
    if (session) await installSession(page, session);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 }).catch(async () => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    });
    await page.screenshot({ path: screenshot, fullPage: true });
    const metrics = await page.evaluate(collectMetrics);
    return { status: metrics.issues.length === 0 ? 'PASS' : 'FAIL', screenshot, metrics, issues: metrics.issues };
  } catch (error) {
    return { status: 'BLOCKED', screenshot, metrics: null, issues: [error instanceof Error ? error.message : String(error)] };
  } finally {
    await page.close();
  }
}

async function preflightLiveRoute(browser, baseUrl, route) {
  if (!isProtectedRoute(route)) return { status: 'public' };
  const health = await fetchText('http://localhost:8121/api/v1/health');
  const email = emailForRoute(route);
  const login = await devLogin(email);
  if (!login.ok) {
    return { status: 'BLOCKED', blocked: true, reason: 'dev-login preflight failed', health, devLogin: login, email };
  }
  const authMe = await fetchText('http://localhost:8121/api/v1/auth/me', { headers: v1SessionHeaders(login.session) });
  if (!authMe.ok) {
    return { status: 'BLOCKED', blocked: true, reason: 'auth/me preflight failed', health, authMe, devLogin: { ok: true }, email };
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(new URL('/home', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
    await setV1SessionLocalStorage(page, login.session);
  } finally {
    await page.close();
  }
  return { status: 'authenticated', email, health, authMe, devLogin: { ok: true }, session: login.session };
}

async function devLogin(email) {
  try {
    const response = await fetch('http://localhost:8121/api/v1/auth/dev-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const text = await response.text();
    if (!response.ok) return { ok: false, status: response.status, body: text };
    const body = JSON.parse(text);
    return { ok: true, session: normalizeDevLoginSession(body, email) };
  } catch (error) {
    return { ok: false, status: 0, body: error instanceof Error ? error.message : String(error) };
  }
}

async function installSession(page, session) {
  await addV1SessionInit(page, session);
}

function collectMetrics() {
  const isVisible = (selector) => {
    const node = document.querySelector(selector);
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    return getComputedStyle(node).display !== 'none' && rect.width > 0 && rect.height > 0;
  };
  const clipped = Array.from(document.querySelectorAll('button,a,h1,h2,h3,p,span'))
    .filter((node) => node.scrollWidth > node.clientWidth + 2 || node.scrollHeight > node.clientHeight + 2)
    .slice(0, 20);
  const deadLinks = Array.from(document.querySelectorAll('a[href]'))
    .map((node) => node.getAttribute('href') ?? '')
    .filter((href) => href === '#' || href.startsWith('file://') || href.endsWith('.html'));
  const desktopNavVisible = isVisible('.tm-desktop-nav');
  const bottomNavVisible = isVisible('.tm-bottom-nav');
  const horizontalOverflow = document.documentElement.scrollWidth > window.innerWidth + 2;
  const filterRailVisible = isVisible('.tm-filter-rail,[data-testid="filter-rail"]');
  const cardWidths = Array.from(document.querySelectorAll('.tm-card,.tm-match-card,.tm-team-card,[data-card]'))
    .map((node) => Math.round(node.getBoundingClientRect().width));
  const cardRhythm = { cardCount: cardWidths.length, minimumWidth: Math.min(...cardWidths, 9999) };
  const ctaContracts = { deadLinks, actionCount: document.querySelectorAll('a[href],button').length };
  const textClipping = clipped.map((node) => ({ text: (node.textContent ?? '').trim().slice(0, 80), className: node.className?.toString() ?? '' }));
  const issues = [];
  if (horizontalOverflow) issues.push('horizontalOverflow');
  if (window.innerWidth >= 1024 && !desktopNavVisible) issues.push('desktopNavVisible');
  if (window.innerWidth >= 1024 && bottomNavVisible) issues.push('bottomNavVisible');
  if (deadLinks.length > 0) issues.push('ctaContracts');
  if (textClipping.length > 0) issues.push('textClipping');
  return { desktopNavVisible, bottomNavVisible, horizontalOverflow, filterRailVisible, cardRhythm, ctaContracts, textClipping, issues };
}

async function fetchText(url, init) {
  try {
    const response = await fetch(url, init);
    return { ok: response.ok, status: response.status, body: await response.text() };
  } catch (error) {
    return { ok: false, status: 0, body: error instanceof Error ? error.message : String(error) };
  }
}
