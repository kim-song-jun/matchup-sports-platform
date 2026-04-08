import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:3003';
const OUT = 'docs/screenshots/v4_intro';

const pages = [
  // Intro pages - desktop
  { url: '/landing', name: 'landing_desktop', width: 1440, height: 900 },
  { url: '/guide', name: 'guide_desktop', width: 1440, height: 900 },
  { url: '/pricing', name: 'pricing_desktop', width: 1440, height: 900 },
  { url: '/faq', name: 'faq_desktop', width: 1440, height: 900 },
  { url: '/about', name: 'about_desktop', width: 1440, height: 900 },

  // Intro pages - mobile
  { url: '/landing', name: 'landing_mobile', width: 390, height: 844 },
  { url: '/guide', name: 'guide_mobile', width: 390, height: 844 },
  { url: '/pricing', name: 'pricing_mobile', width: 390, height: 844 },
  { url: '/faq', name: 'faq_mobile', width: 390, height: 844 },
  { url: '/about', name: 'about_mobile', width: 390, height: 844 },

  // Main app pages - desktop (update v3 screenshots)
  { url: '/login', name: 'login_desktop', width: 1440, height: 900 },
  { url: '/home', name: 'home_desktop', width: 1440, height: 900 },
  { url: '/matches', name: 'matches_desktop', width: 1440, height: 900 },
  { url: '/team-matches', name: 'team_matches_desktop', width: 1440, height: 900 },
  { url: '/teams', name: 'teams_desktop', width: 1440, height: 900 },
  { url: '/lessons', name: 'lessons_desktop', width: 1440, height: 900 },
  { url: '/marketplace', name: 'marketplace_desktop', width: 1440, height: 900 },
  { url: '/venues', name: 'venues_desktop', width: 1440, height: 900 },
  { url: '/mercenary', name: 'mercenary_desktop', width: 1440, height: 900 },
  { url: '/badges', name: 'badges_desktop', width: 1440, height: 900 },
  { url: '/profile', name: 'profile_desktop', width: 1440, height: 900 },
  { url: '/settings', name: 'settings_desktop', width: 1440, height: 900 },

  // Main app pages - mobile
  { url: '/home', name: 'home_mobile', width: 390, height: 844 },
  { url: '/matches', name: 'matches_mobile', width: 390, height: 844 },
  { url: '/profile', name: 'profile_mobile', width: 390, height: 844 },
];

async function capture() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  for (const page of pages) {
    console.log(`Capturing: ${page.name} (${page.width}x${page.height})`);
    const tab = await context.newPage();
    await tab.setViewportSize({ width: page.width, height: page.height });

    try {
      await tab.goto(`${BASE}${page.url}`, { waitUntil: 'networkidle', timeout: 15000 });
      // Wait for animations to settle
      await tab.waitForTimeout(1500);
      await tab.screenshot({
        path: `${OUT}/${page.name}.png`,
        fullPage: true,
      });
      console.log(`  -> ${OUT}/${page.name}.png`);
    } catch (err) {
      console.error(`  FAILED: ${page.name} - ${err.message}`);
    }
    await tab.close();
  }

  await browser.close();
  console.log('\nDone! All screenshots saved to', OUT);
}

capture();
