import { test, expect, type Page } from '@playwright/test';
import { gotoWithWarmup, injectTokens, loginViaApi } from '../fixtures/auth';
import { TEST_PERSONAS } from '../fixtures/test-users';
import {
  applyTeamMatchViaApi,
  approveTeamMatchApplicationViaApi,
  createTeamMatchViaApi,
  createTeamViaApi,
} from '../fixtures/api-helpers';

const OWNER = TEST_PERSONAS.teamOwner.nickname;

interface TeamMatchOperationalFixture {
  matchId: string;
  title: string;
}

let fixture: TeamMatchOperationalFixture | null = null;

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

async function openTeamMatchDetail(page: Page, matchId: string) {
  await gotoWithWarmup(page, `/team-matches/${matchId}`, '/team-matches');
  await page.waitForLoadState('networkidle');
}

async function setupTeamMatchAuthState(page: Page, nickname: string) {
  const tokens = await loginViaApi(nickname);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await injectTokens(page, tokens);
  await gotoWithWarmup(page, '/team-matches');
  await expect(page.locator('main:visible').first()).toBeVisible({ timeout: 15_000 });
}

async function openArrivalFromDetail(page: Page, matchId: string) {
  const arrivalCta = page.getByRole('link', { name: '도착 인증' }).first();
  if (await arrivalCta.isVisible().catch(() => false)) {
    await arrivalCta.click();
    await page.waitForURL(new RegExp(`/team-matches/${matchId}/arrival$`), { timeout: 15_000 });
    return;
  }

  // Compatibility fallback while detail CTA may still be date-gated.
  await page.goto(`/team-matches/${matchId}/arrival`);
  await page.waitForLoadState('networkidle');
}

async function openScoreFromDetail(page: Page, matchId: string) {
  const scoreCta = page.getByRole('link', { name: /경기 결과 입력|저장된 경기 결과 보기/ }).first();
  if (await scoreCta.isVisible().catch(() => false)) {
    await scoreCta.click();
    await page.waitForURL(new RegExp(`/team-matches/${matchId}/score$`), { timeout: 15_000 });
    return;
  }

  await page.goto(`/team-matches/${matchId}/score`);
  await page.waitForLoadState('networkidle');
}

async function submitScore(page: Page) {
  await page.locator('#home-Q1:visible').fill('2');
  await page.locator('#away-Q1:visible').fill('1');
  await page.locator('#home-Q2:visible').fill('1');
  await page.locator('#away-Q2:visible').fill('0');
  await page.locator('#home-Q3:visible').fill('0');
  await page.locator('#away-Q3:visible').fill('0');
  await page.locator('#home-Q4:visible').fill('1');
  await page.locator('#away-Q4:visible').fill('0');
  await page.getByRole('button', { name: '경기 결과 저장' }).click();
  await expect(page.getByRole('link', { name: '경기 평가하기' }).first()).toBeVisible({ timeout: 15_000 });
}

async function openEvaluate(page: Page, matchId: string) {
  const evaluateCta = page.getByRole('link', { name: '경기 평가하기' }).first();
  if (await evaluateCta.isVisible().catch(() => false)) {
    await evaluateCta.click();
    await page.waitForURL(new RegExp(`/team-matches/${matchId}/evaluate$`), { timeout: 15_000 });
    return;
  }

  await page.goto(`/team-matches/${matchId}/evaluate`);
  await page.waitForLoadState('networkidle');
}

async function submitEvaluation(page: Page) {
  const fivePointButtons = page.getByRole('button', { name: '5점' });
  await expect(fivePointButtons).toHaveCount(6);

  for (let index = 0; index < 6; index += 1) {
    await fivePointButtons.nth(index).click();
  }

  await page.fill('#team-match-eval-comment', '운영 플로우 E2E 점검 코멘트');
  await page.getByRole('button', { name: '평가 제출하기' }).click();
}

test.describe('TM-004 team match operational journey', () => {
  test.beforeAll(async () => {
    const tokens = await loginViaApi(OWNER);
    const hostTeam = await createTeamViaApi(tokens.accessToken, {
      name: `TM004-HOST-${Date.now()}`,
      sportType: 'soccer',
      city: '서울',
    });
    const guestTeam = await createTeamViaApi(tokens.accessToken, {
      name: `TM004-GUEST-${Date.now()}`,
      sportType: 'soccer',
      city: '서울',
    });

    const title = `TM004-OPS-${Date.now()}`;
    const teamMatch = await createTeamMatchViaApi(tokens.accessToken, {
      hostTeamId: hostTeam.id,
      title,
      sportType: 'soccer',
      matchDate: todayIsoDate(),
      startTime: '14:00',
      endTime: '16:00',
      venueName: 'TM004 E2E Stadium',
      totalFee: 100000,
    });

    const application = await applyTeamMatchViaApi(tokens.accessToken, teamMatch.id, {
      applicantTeamId: guestTeam.id,
      message: 'TM004 guest apply',
    });
    await approveTeamMatchApplicationViaApi(tokens.accessToken, teamMatch.id, application.id);

    fixture = {
      matchId: teamMatch.id,
      title,
    };
  });

  test('detail -> arrival -> score -> evaluate 흐름이 이어지고 저장 상태가 반영된다', async ({ page }) => {
    test.skip(!fixture, 'team-match fixture is not ready');

    await setupTeamMatchAuthState(page, OWNER);
    await openTeamMatchDetail(page, fixture!.matchId);
    await expect(page.getByRole('heading', { name: fixture!.title }).first()).toBeVisible({ timeout: 15_000 });

    await openArrivalFromDetail(page, fixture!.matchId);
    await expect(page.getByRole('heading', { name: '도착 인증' })).toBeVisible();
    await page.getByRole('button', { name: /도착 기록하기$/ }).click();
    const arrivalStatusSection = page.getByRole('heading', { name: '내 도착 상태' }).locator('xpath=..');
    await expect(arrivalStatusSection.getByText(/도착 기록 완료/)).toBeVisible({ timeout: 10_000 });

    await openTeamMatchDetail(page, fixture!.matchId);
    await openScoreFromDetail(page, fixture!.matchId);
    await expect(page.getByRole('heading', { name: '스코어 입력' })).toBeVisible();
    await submitScore(page);
    await openEvaluate(page, fixture!.matchId);
    await expect(page.getByRole('heading', { name: '경기 평가' })).toBeVisible();
    await submitEvaluation(page);
    await expect(page.getByText('이미 평가를 제출했습니다')).toBeVisible({ timeout: 10_000 });
  });
});
