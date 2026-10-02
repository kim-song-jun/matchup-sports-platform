// Presentation-only headed QA of the actual v1 components/CSS; no API or auth success is simulated.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, expect } from '@playwright/test';

const repo = process.cwd();
const web = path.join(repo, 'apps/v1_web');
const requireWeb = createRequire(path.join(web, 'package.json'));
const requireVitest = createRequire(requireWeb.resolve('vitest/package.json'));
const { createServer } = await import(pathToFileURL(requireVitest.resolve('vite')).href);
const react = (await import(pathToFileURL(requireWeb.resolve('@vitejs/plugin-react')).href)).default;
const tailwind = requireWeb('@tailwindcss/postcss');
const out = path.join(repo, 'output/playwright/visual-audit/team-match-image-brightness');
const fixture = path.join(out, 'fixture');
await fs.mkdir(fixture, { recursive: true });
const normalized = (file) => file.replaceAll('\\', '/');
await fs.writeFile(path.join(fixture, 'link.jsx'), `import React from 'react'; export default function Link({href,children,prefetch,replace,scroll,...props}) { return React.createElement('a',{...props,href},children); }`);
await fs.writeFile(path.join(fixture, 'image.jsx'), `import React from 'react'; export default function Image({src,fill,priority,unoptimized,loader,...props}) { return React.createElement('img',{...props,src,style:fill?{...props.style,width:'100%',height:'100%',objectFit:'cover'}:props.style}); }`);
await fs.writeFile(path.join(fixture, 'navigation.js'), `const query=new URLSearchParams(location.search); const router={push(){},replace(){},back(){},prefetch(){}}; export const useRouter=()=>router; export const usePathname=()=>'/team-matches'; export const useSearchParams=()=>query; export const useParams=()=>({});`);
await fs.writeFile(path.join(fixture, 'entry.tsx'), `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {TeamMatchListPageView,TeamMatchDetailPageView} from '@/components/team-matches/team-matches-page';
import {getTeamMatchListViewModel,getTeamMatchDetailViewModel} from '@/components/team-matches/team-matches.view-model';
import ${JSON.stringify(normalized(path.join(web, 'src/app/globals.css')))};
import ${JSON.stringify(normalized(path.join(web, 'src/app/desktop/index.css')))};
const kind=new URLSearchParams(location.search).get('surface');
const list=getTeamMatchListViewModel(); const detail=getTeamMatchDetailViewModel();
list.matches=list.matches.slice(0,2).map(m=>({...m,imageUrl:'/mock/generated/futsal-rooftop.webp'}));
detail.match.imageUrl='/mock/generated/futsal-rooftop.webp';
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><main style={{maxWidth:1200,margin:'auto'}}>{kind==='list'?<TeamMatchListPageView model={list}/>:<TeamMatchDetailPageView model={detail}/>}</main></QueryClientProvider>);
`);

const report = { scope: 'actual components with explicit presentation fixtures; no live API QA', processId: process.pid, captures: [] };
const sourceFiles = ['apps/v1_web/src/components/team-matches/team-matches-page.tsx', 'apps/v1_web/src/app/globals.css'];
// Capture each phase in a separate process: Tailwind keeps a process-level compilation cache.
const phaseToCapture = process.env.QA_PHASE ?? 'after';
if (!['before', 'after'].includes(phaseToCapture)) throw new Error('QA_PHASE must be before or after');
const phases = [phaseToCapture];
const baselineRef = process.env.QA_BASE_REF ?? 'HEAD';
let browser;
try {
  browser = await chromium.launch({ headless: false, channel: 'chrome' });
  const cdp = await browser.newBrowserCDPSession();
  report.browserProcesses = (await cdp.send('SystemInfo.getProcessInfo')).processInfo.map(({ id, type }) => ({ id, type }));
  await cdp.detach();
  for (const phase of phases) {
    const baseline = new Map(sourceFiles.map((file) => [normalized(path.join(repo, file)), execFileSync('git', ['show', `${baselineRef}:${file}`], { cwd: repo, encoding: 'utf8' })]));
    const server = await createServer({
      configFile: false, appType: 'custom', root: web, publicDir: path.join(web, 'public'),
      resolve: { alias: {
        'react': path.join(web, 'node_modules/react'), 'react-dom': path.join(web, 'node_modules/react-dom'),
        '@tanstack/react-query': path.join(web, 'node_modules/@tanstack/react-query'),
        '@': path.join(web, 'src'), 'next/link': path.join(fixture, 'link.jsx'),
        'next/image': path.join(fixture, 'image.jsx'), 'next/navigation': path.join(fixture, 'navigation.js'),
      } },
      plugins: [{ name: 'qa-original-source', enforce: 'pre', load(id) { if (phase === 'before') return baseline.get(normalized(id)); } }, react()],
      css: { postcss: { plugins: [tailwind()] } },
      server: { host: '127.0.0.1', port: 3193, strictPort: true, fs: { allow: [repo] } },
    });
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/__qa_team_match_image')) return next();
      res.setHeader('Content-Type', 'text/html');
      try {
        res.end(await server.transformIndexHtml(req.url, `<html><head><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="/@fs/${normalized(path.join(fixture, 'entry.tsx'))}"></script></body></html>`));
      } catch (error) { next(error); }
    });
    await server.listen();
    try {
      for (const [viewport, width, height] of [['mobile',390,844],['tablet',768,1024],['desktop',1440,900]]) {
        for (const surface of ['list', 'detail']) {
          const context = await browser.newContext({ viewport: { width, height } });
          try {
            const page = await context.newPage();
            const errors = [], failures = [];
            page.on('pageerror', (error) => errors.push(error.message));
            page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
            page.on('response', (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
            await page.goto(`http://127.0.0.1:3193/__qa_team_match_image?surface=${surface}`);
            const media = page.locator(surface === 'list' ? '.tm-match-row-thumb' : '.tm-team-vs-hero').first();
            await expect(media).toBeVisible();
            await page.waitForLoadState('networkidle');
            await page.evaluate(async () => { await document.fonts.ready; });
            const metrics = await media.evaluate((element) => ({ background: getComputedStyle(element).backgroundImage,
              width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height,
              filter: getComputedStyle(element).filter }));
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
            if (phase === 'after') expect(metrics.background).not.toContain('linear-gradient');
            if (phase === 'after' && surface === 'detail') {
              await expect(media).toHaveClass(/tm-team-vs-hero-photo/);
              await expect(media.locator('.tm-team-vs-summary')).toHaveCSS('background-color', 'rgba(17, 24, 39, 0.8)');
              await expect(media.locator('.tm-hero-button').first()).toHaveCSS('background-color', 'rgba(17, 24, 39, 0.8)');
            }
            expect(errors).toEqual([]); expect(failures).toEqual([]); expect(overflow).toBe(false);
            const directory = path.join(out, phase); await fs.mkdir(directory, { recursive: true });
            await page.screenshot({ path: path.join(directory, `${viewport}-${surface}.png`), fullPage: true });
            report.captures.push({ phase, viewport, surface, metrics, errors, failures, overflow });
          } finally { await context.close(); }
        }
      }
    } finally { await server.close(); }
  }
} finally {
  await browser?.close();
  await fs.writeFile(path.join(out, `report-${phaseToCapture}.json`), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ captures: report.captures.length, report: path.join(out, `report-${phaseToCapture}.json`) }));
