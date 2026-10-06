// Inspect only the headed QA browser started by round12-flow-session.cjs.
// Attach through its local Playwright server; never read cookies or storage.
const { chromium } = require('../../node_modules/.pnpm/playwright-core@1.58.2/node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const port = Number(process.argv[2]);
const phase = process.argv[3];
if (!Number.isInteger(port) || port < 1024 || !['before', 'after'].includes(phase)) throw new Error('Expected owned server port and before/after');
const TARGET = 'https://alpha.teameet.co.kr/admin/tournaments/ad120000-0000-4000-8000-000000000001/bracket';
const OUT = path.resolve('tmp/qa-fixture-number-edit');
const DIALOG = `([...document.querySelectorAll('[role="dialog"]')].find(el => document.getElementById(el.getAttribute('aria-labelledby'))?.textContent.trim() === '경기 수정'))`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const discovery = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const browser = await chromium.connect(`ws://127.0.0.1:${port}${discovery.wsEndpointPath}`);
  const root = await browser.newBrowserCDPSession();
  let targetSession;
  let nextId = 0;
  const pending = new Map();
  const evidence = { phase, target: TARGET, inspectorPid: process.pid, console: [], authFlow: [], exceptions: [], httpErrors: [], mutations: [], views: [] };
  const requests = new Map();
  root.on('Target.receivedMessageFromTarget', ({ sessionId, message }) => {
    if (sessionId !== targetSession) return;
    const event = JSON.parse(message);
    if (event.id) {
      const waiter = pending.get(event.id);
      if (waiter) { pending.delete(event.id); clearTimeout(waiter.timer); event.error ? waiter.reject(new Error(event.error.message)) : waiter.resolve(event.result); }
      return;
    }
    const p = event.params;
    if (event.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(p.type)) evidence.console.push({ type: p.type, text: p.args.map((arg) => typeof arg.value === 'string' ? arg.value.slice(0, 250) : arg.type).join(' ') });
    if (event.method === 'Log.entryAdded' && ['error','warning'].includes(p.entry.level)) evidence.console.push({type:p.entry.level,source:p.entry.source,text:p.entry.text.slice(0,250)});
    if (event.method === 'Network.responseReceived' && /^https:\/\/alpha\.teameet\.co\.kr\/api\/v1\/auth\/(me|refresh)(?:\?|$)/.test(p.response.url)) evidence.authFlow.push({path:new URL(p.response.url).pathname,status:p.response.status});
    if (event.method === 'Runtime.exceptionThrown') evidence.exceptions.push({ text: p.exceptionDetails.text, description: p.exceptionDetails.exception?.description?.split('\n')[0] });
    if (event.method === 'Network.requestWillBeSent') {
      const pathname = new URL(p.request.url).pathname;
      requests.set(p.requestId, { method: p.request.method, path: pathname });
      if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(p.request.method) && /^\/api\/v1\/admin\/(fixtures|tournaments)/.test(pathname)) evidence.mutations.push({ method: p.request.method, path: pathname });
    }
    if (event.method === 'Network.responseReceived' && p.type === 'Document' && p.response.url === TARGET) evidence.commit = Object.entries(p.response.headers).find(([key])=>key.toLowerCase()==='x-teameet-commit')?.[1];
    if (event.method === 'Network.responseReceived' && p.response.status >= 400) evidence.httpErrors.push({ ...requests.get(p.requestId), status: p.response.status });
  });
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 30000);
      pending.set(id, { resolve, reject, timer });
      root.send('Target.sendMessageToTarget', { sessionId: targetSession, message: JSON.stringify({ id, method, params }) }).catch((error) => { clearTimeout(timer); pending.delete(id); reject(error); });
    });
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  async function waitFor(expression) {
    const until = Date.now() + 30000;
    while (Date.now() < until) { if (await evaluate(expression)) return; await sleep(100); }
    throw new Error(`UI condition timed out: ${expression}`);
  }
  async function clickFixture() {
    const rect = await evaluate(`(() => { const button = [...document.querySelectorAll('button[aria-label="12강 2번 경기 수정"]')].find(el => el.getClientRects().length); if (!button) throw new Error('Fixture edit control missing'); button.scrollIntoView({block:'center'}); const r=button.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...rect });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...rect, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...rect, button: 'left', clickCount: 1 });
    await waitFor(`!!${DIALOG}`);
  }
  try {
    const targets = (await root.send('Target.getTargets')).targetInfos.filter((target) => target.type === 'page' && target.url === TARGET);
    if (targets.length !== 1) throw new Error('Expected one authenticated target page in the owned browser');
    targetSession = (await root.send('Target.attachToTarget', { targetId: targets[0].targetId, flatten: false })).sessionId;
    await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable'); await send('Network.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.reload', { ignoreCache: true });
    await waitFor(`location.href === ${JSON.stringify(TARGET)} && [...document.querySelectorAll('button[aria-label="12강 2번 경기 수정"]')].some(el => el.getClientRects().length)`);
    await clickFixture();
    for (const width of [1440, 768, 390]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: width === 390 ? 844 : 900, deviceScaleFactor: 1, mobile: false });
      await sleep(350);
      const view = await evaluate(`(() => { const d=${DIALOG}; const r=d.getBoundingClientRect(); const input=d.querySelector('input[type="number"]'); return { width:innerWidth,height:innerHeight,teamColumns:[...d.querySelectorAll('label')].filter(l=>['edit-fx-home','edit-fx-away'].includes(l.htmlFor)).map(l=>{const r=l.parentElement.getBoundingClientRect();return {name:l.textContent,x:r.x,y:r.y,width:r.width,height:r.height};}),documentWidth:document.documentElement.scrollWidth,dialog:{x:r.x,y:r.y,width:r.width,height:r.height},number:input ? {value:input.value,min:input.min,max:input.max,step:input.step,disabled:input.disabled,label:[...d.querySelectorAll('label')].find(l=>l.htmlFor===input.id)?.textContent} : null,teamPickers:[...d.querySelectorAll('[role="combobox"],button[aria-label="선택 해제"]')].map(el=>({disabled:el.disabled})),buttons:[...d.querySelectorAll('button')].map(el=>({label:el.textContent.trim()||el.getAttribute('aria-label'),disabled:el.disabled}))}; })()`);
      if (view.width !== width || view.documentWidth > width || view.dialog.x < 0 || view.dialog.x + view.dialog.width > width || view.dialog.y < 0 || view.dialog.y + view.dialog.height > view.height) throw new Error(`Layout failed: ${JSON.stringify(view)}`);
      if (phase === 'after' && (view.number?.label !== '대진 번호' || view.number.value !== '2' || view.number.disabled)) throw new Error('Number field is missing, not hydrated, or disabled');
      if (phase === 'after' && view.teamColumns.some(col => col.x < view.dialog.x || col.x + col.width > view.dialog.x + view.dialog.width)) throw new Error('Team columns overflow edit modal');
      if (phase === 'after' && width === 390 && view.teamColumns[1].y <= view.teamColumns[0].y) throw new Error('Mobile team inputs are not stacked');
      if (phase === 'before' && view.number !== null) throw new Error('Unexpected before-state number field');
      const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(OUT, `${phase}-${width}.png`), Buffer.from(screenshot.data, 'base64'));
      evidence.views.push(view);
    }
    if (phase === 'after') {
      async function key(key, code, windowsVirtualKeyCode, modifiers = 0) {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, modifiers });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, modifiers });
      }
      async function clickAt(expression) {
        const rect = await evaluate(expression);
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...rect, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...rect, button: 'left', clickCount: 1 });
      }
      async function fillNumber(text) {
        await clickAt(`(() => {const r=${DIALOG}.querySelector('input[type="number"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
        await key('a', 'KeyA', 65, 2); await key('Backspace', 'Backspace', 8);
        await send('Input.insertText', { text });
        await waitFor(`${DIALOG}.querySelector('input[type="number"]').value === ${JSON.stringify(text)}`);
      }
      await fillNumber('0');
      await clickAt(`(() => {const b=[...${DIALOG}.querySelectorAll('button')].find(el=>el.textContent.trim()==='저장');const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      await waitFor(`document.body.innerText.includes('대진 번호는 1부터 2147483647까지의 정수로 입력해 주세요.') && !!${DIALOG}`);
      evidence.invalidNumberBlockedInUI = true;
      const invalidShot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(OUT, 'after-invalid-390.png'), Buffer.from(invalidShot.data, 'base64'));
      await fillNumber('7');
      await clickAt(`(() => {const b=[...${DIALOG}.querySelectorAll('button')].find(el=>el.textContent.trim()==='취소');const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      await waitFor(`!${DIALOG}`); await clickFixture(); await sleep(100);
      evidence.reopenedNumber = await evaluate(`${DIALOG}.querySelector('input[type="number"]').value`);
      if (evidence.reopenedNumber !== '2') throw new Error('Cancelled draft changed the fixture');
      await key('Tab', 'Tab', 9);
      evidence.numberReceivesFocusAfterCloseButton = await evaluate(`document.activeElement === ${DIALOG}.querySelector('input[type="number"]')`);
      if (!evidence.numberReceivesFocusAfterCloseButton) throw new Error('Number input focus order failed');
    }
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await waitFor(`!${DIALOG}`);
    const authRefreshed = evidence.authFlow.some(r=>r.path==='/api/v1/auth/refresh' && r.status===200) && evidence.authFlow.filter(r=>r.path==='/api/v1/auth/me').at(-1)?.status===200;
    evidence.expectedAuthRenewal401 = authRefreshed ? evidence.httpErrors.filter(r=>r.path==='/api/v1/auth/me' && r.status===401) : [];
    const unexpectedHttp = evidence.httpErrors.filter(r=>!evidence.expectedAuthRenewal401.includes(r));
    const unexpectedConsole = evidence.console.filter(entry=> !(evidence.expectedAuthRenewal401.length && entry.source==='network' && /^Failed to load resource: the server responded with a status of 401/.test(entry.text)));
    if (evidence.mutations.length || evidence.exceptions.length || unexpectedHttp.length || unexpectedConsole.length) throw new Error('Unexpected mutation or browser error; inspect evidence');
    evidence.baselineMobileTeamOverflow = phase === 'before' && evidence.views.filter(view=>view.width===390).some(view=>view.teamColumns.some(col=>col.x+col.width>view.dialog.x+view.dialog.width));
    evidence.verdict = phase === 'before' ? (evidence.baselineMobileTeamOverflow ? 'BASELINE_KNOWN_TEAM_OVERFLOW' : 'BASELINE') : 'PASS';
    console.log(JSON.stringify(evidence));
  } catch (error) { evidence.verdict = 'FAIL'; evidence.error = error.message; throw error; }
  finally {
    fs.writeFileSync(path.join(OUT, `${phase}-evidence.json`), JSON.stringify(evidence, null, 2));
    if (targetSession) await root.send('Target.detachFromTarget', { sessionId: targetSession });
    await root.detach(); await browser.close();
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
