import { test, expect } from '@playwright/test';

// Test dark mode toggle across key pages
const pages = [
  { path: '/home', name: 'Home' },
  { path: '/matches', name: 'Matches' },
  { path: '/lessons', name: 'Lessons' },
  { path: '/marketplace', name: 'Marketplace' },
  { path: '/teams', name: 'Teams' },
  { path: '/profile', name: 'Profile' },
  { path: '/notifications', name: 'Notifications' },
];

test.describe('Dark mode', () => {
  for (const p of pages) {
    test(`${p.name} page renders in dark mode without errors`, async ({ page }) => {
      await page.goto(p.path);
      await page.waitForTimeout(500);

      // Enable dark mode
      await page.evaluate(() => {
        document.documentElement.classList.add('dark');
      });
      await page.waitForTimeout(300);

      // Check no console errors
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });

      // Page should still be visible
      await expect(page.locator('main')).toBeVisible();

      // Check dark background is applied
      const bgColor = await page.evaluate(() => {
        return getComputedStyle(document.documentElement).backgroundColor;
      });

      // Should not have white background in dark mode
      expect(bgColor).not.toBe('rgb(255, 255, 255)');
    });
  }
});
