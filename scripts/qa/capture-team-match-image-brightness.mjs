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
const imageSlots = process.env.QA_MODE === 'slots';
const closedCards = process.env.QA_MODE === 'closed';
const out = path.join(repo, `output/playwright/visual-audit/${closedCards ? 'team-match-closed-cards' : imageSlots ? 'team-match-image-slots' : 'team-match-image-brightness'}`);
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
import {TeamMatchListPageView,TeamMatchDetailPageView,TeamMatchCreatePageView} from '@/components/team-matches/team-matches-page';
import {TeamMatchImagesField} from '@/components/team-matches/team-match-images';
import {getTeamMatchListViewModel,getTeamMatchDetailViewModel,getTeamMatchCreateViewModel} from '@/components/team-matches/team-matches.view-model';
import ${JSON.stringify(normalized(path.join(web, 'src/app/globals.css')))};
import ${JSON.stringify(normalized(path.join(web, 'src/app/desktop/index.css')))};
const kind=new URLSearchParams(location.search).get('surface');
const list=getTeamMatchListViewModel(); const detail=getTeamMatchDetailViewModel();
list.matches=list.matches.slice(0,2).map(m=>({...m,imageUrl:'/mock/generated/futsal-rooftop.webp'}));
detail.match.imageUrl='/mock/generated/futsal-rooftop.webp';
const create=getTeamMatchCreateViewModel('info'); create.selectedSport='풋살';
create.form={selectedTeamId:'team-1',selectedSportId:'sport-1',regionId:'region-1',regions:[],onSelectTeam(){},onSelectSport(){},onFieldChange(){},onRegionChange(){},onBack(){},onNext(){},onSubmit(){},uploadImage:async()=>{throw new Error('Presentation fixture has no upload API');}};
if(${imageSlots}) {
  list.matches=list.matches.map(m=>({...m,listImageUrl:'/mock/generated/team-huddle.webp'}));
  detail.match.listImageUrl='/mock/generated/team-huddle.webp';
}
if(${closedCards}) { list.matches=[{...list.matches[0],closed:false,status:'open'}, {...list.matches[1],closed:true,status:'closed',apiStatus:'completed',live:false,completionPending:false}]; }
function Images(){const [images,setImages]=React.useState({imageUrl:'',listImageUrl:''});return <TeamMatchImagesField sport="풋살" images={images} onChange={(field,value)=>setImages(current=>({...current,[field]:value}))}/>;}
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><main style={{maxWidth:1200,margin:'auto'}}>{kind==='list'?<TeamMatchListPageView model={list}/>:kind==='create'?<TeamMatchCreatePageView model={create}/>:kind==='images'?<Images/>:<TeamMatchDetailPageView model={detail}/>}</main></QueryClientProvider>);
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
        for (const surface of closedCards ? ['list'] : imageSlots ? ['list', 'detail', 'create', ...(phase === 'after' ? ['images'] : [])] : ['list', 'detail']) {
          const context = await browser.newContext({ viewport: { width, height } });
          try {
            const page = await context.newPage();
            const errors = [], failures = [];
            page.on('pageerror', (error) => errors.push(error.message));
            page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
            page.on('response', (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
            await page.goto(`http://127.0.0.1:3193/__qa_team_match_image?surface=${surface}`);
            const media = page.locator(surface === 'list' ? '.tm-match-row-thumb' : surface === 'detail' ? '.tm-team-vs-hero' : phase === 'before' ? '.tm-create-image-preview' : '.tm-team-match-image-preview').first();
            try { await expect(media).toBeVisible({ timeout: 15000 }); }
            catch (error) {
              report.captures.push({ phase, viewport, surface, errors, failures, renderFailure: error.message });
              console.error(JSON.stringify({ errors, failures }));
              throw error;
            }
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
            if (imageSlots && phase === 'after') {
              if (surface === 'list') expect(metrics.background).toContain('/mock/generated/team-huddle.webp');
              if (surface === 'detail') expect(metrics.background).toContain('/mock/generated/futsal-rooftop.webp');
              if (surface === 'create' || surface === 'images') {
                await expect(page.getByRole('img', { name: '목록 이미지 미리보기' })).toBeVisible();
                await expect(page.getByRole('img', { name: '상세 이미지 미리보기' })).toBeVisible();
                const square = await page.locator('.tm-team-match-image-square').evaluate(e=>({width:e.clientWidth,height:e.clientHeight}));
                expect(Math.abs(square.width-square.height)).toBeLessThanOrEqual(1);
              }
            }
            if (closedCards && phase === 'after') {
              await expect(page.locator('.tm-match-row.tm-card-closed')).toHaveCSS('filter', 'brightness(0.88) grayscale(0.35)');
              await expect(page.locator('.tm-match-row.tm-card-closed .tm-match-row-thumb')).toHaveCSS('opacity', '1');
              await expect(page.locator('.tm-match-row:not(.tm-card-closed)').first()).toHaveCSS('filter', 'none');
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
