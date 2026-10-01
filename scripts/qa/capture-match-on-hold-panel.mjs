/** Headed, component-only preview. API behavior is separately covered by service tests.
 * Does not prove deployed routes, authentication, or database integration.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
const root = process.cwd();
const web = path.join(root, 'apps/v1_web');
const require = createRequire(path.join(web, 'package.json'));
const vitestRoot = path.dirname(require.resolve('vitest/package.json'));
const vite = await import(pathToFileURL(require.resolve('vite', { paths: [vitestRoot] })));
const reactPlugin = (await import(pathToFileURL(require.resolve('@vitejs/plugin-react')))).default;
const temp = await mkdtemp(path.join(tmpdir(), 'teameet-on-hold-'));
const output = path.join(root, 'output/playwright/visual-audit/match-on-hold');
await mkdir(output, { recursive: true });
let browser;
let server;
try {
  await writeFile(path.join(temp, 'index.html'), '<html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><link rel="icon" href="data:,"/></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>');
  await writeFile(path.join(temp, 'navigation.ts'), 'export const useRouter = () => ({ replace: (path) => { window.__navigation = path; } });');
  await writeFile(path.join(temp, 'link.tsx'), 'import React from "react"; export default function Link(props) { return <a {...props}/>; }');
  await writeFile(path.join(temp, 'main.tsx'), `import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MatchLifecyclePanel} from '${web}/src/components/matches/match-lifecycle-panel.tsx';
import '${web}/src/app/globals.css';
const base={canEdit:true,canDelete:false,canConfirmProceed:false,onHoldReason:'NO_PARTICIPANTS'};
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><main style={{maxWidth:1180,margin:'auto',padding:16}}><h1>보류 상태 화면 검증</h1>
<MatchLifecyclePanel id="empty" domain="matches" status="on_hold" lifecycle={{...base,canDelete:true}} canManage current={1} capacity={10}/>
<MatchLifecyclePanel id="under" domain="matches" status="on_hold" lifecycle={{...base,canConfirmProceed:true,onHoldReason:'UNDER_CAPACITY'}} canManage current={3} capacity={10}/>
<MatchLifecyclePanel id="team" domain="team-matches" status="on_hold" lifecycle={{...base,canDelete:true,onHoldReason:'NO_OPPONENT'}} canManage/>
</main></QueryClientProvider>);`);
  server = await vite.createServer({ root: temp, configFile: false, plugins: [reactPlugin()],
    resolve: { alias: { '@': path.join(web, 'src'), 'next/navigation': path.join(temp, 'navigation.ts'), 'next/link': path.join(temp, 'link.tsx'),
      'react-dom/client': require.resolve('react-dom/client'), 'react-dom': path.dirname(require.resolve('react-dom/package.json')), react: path.dirname(require.resolve('react/package.json')), '@tanstack/react-query': path.dirname(require.resolve('@tanstack/react-query/package.json')) } },
    publicDir: path.join(web, 'public'), server: { host: '127.0.0.1', port: 3033, strictPort: true, fs: { allow: [root, temp] } },
    css: { postcss: { plugins: [] } }, define: { 'process.env.NODE_ENV': JSON.stringify('development'), 'process.env.NEXT_PUBLIC_API_URL': 'undefined' } });
  await server.listen();
  browser = await chromium.launch({ headless: false });
  const rows = execFileSync('ps', ['-eo', 'pid=,ppid=,comm='], { encoding: 'utf8' }).trim().split('\n').map(line => {
    const [pid, ppid, ...name] = line.trim().split(/\s+/); return { pid: Number(pid), ppid: Number(ppid), name: name.join(' ') };
  });
  const owned = new Set([process.pid]);
  for (let i=0; i<10; i++) for (const row of rows) if (owned.has(row.ppid)) owned.add(row.pid);
  await writeFile(path.join(output, 'processes.json'), JSON.stringify(rows.filter(r => owned.has(r.pid)), null, 2));
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('response', res => { if (res.status() >= 400) errors.push(`${res.status()} ${res.url()}`); });
  const verdicts = [];
  for (const width of [390,768,1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('http://127.0.0.1:3033');
    await page.getByRole('button', { name: '현재 인원으로 진행' }).waitFor();
    await page.getByRole('button', { name: '현재 인원으로 진행' }).click();
    await page.getByText('현재 3/10명으로 진행할까요? 확정 참가자에게 알려요.').waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    await page.screenshot({ path: path.join(output, `panel-${width}.png`), fullPage: true });
    verdicts.push({ width, overflow, proceedingButtons: await page.getByRole('button', { name: '현재 인원으로 진행' }).count() });
  }
  await writeFile(path.join(output, 'verdict.json'), JSON.stringify({ scope:'component-only headed preview; fixture props; no live route/DB verification', baseline:'unavailable: new surface', verdicts, errors }, null, 2));
  if(errors.length || verdicts.some(v => v.overflow || v.proceedingButtons !== 1)) throw new Error('Visual preview failed; see verdict.json');
  console.log(JSON.stringify({ output, verdicts, errors }));
} finally {
  await browser?.close();
  await server?.close();
  await rm(temp, { recursive: true, force: true });
}
