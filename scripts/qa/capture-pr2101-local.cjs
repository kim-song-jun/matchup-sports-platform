// Local visual evidence only. API fixtures do not prove database writes or server authorization.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const phase = process.argv[2];
if (!['before', 'after', 'before-visibility'].includes(phase)) throw new Error('Use before or after');
const origin = 'http://127.0.0.1:3023';
const id = '21010000-0000-4000-8000-000000000001';
const userId = '21010000-0000-4000-8000-000000000002';
const out = path.resolve('docs/screenshots/pr2101-local');
const title = '디렉터 검증용 비공개 풋살 대회';
const assignment = { id: 'assignment-local', userId, tournamentId: id, role: 'TOURNAMENT_DIRECTOR', fieldId: null, fieldName: null, version: 1, fixtureIds: [], expiresAt: null, revokedAt: null, createdAt: '2026-11-01T00:00:00Z', user: { id: userId, nickname: '테스트 디렉터' }, displayName: '테스트 디렉터' };
const tournament = { id, title, kind: 'regular_tournament', sportId: 'futsal', sport: { id: 'futsal', code: 'futsal', name: '풋살' }, status: 'closed', isPublic: false, format: 'group_tournament', teamCount: 8, registrationCount: 4, entryFee: 0, prizePool: 0, genderCategory: 'mixed', venue: '테스트 풋살장', scheduledAt: '2026-11-20T00:00:00Z', scheduledEndAt: '2026-11-20T09:00:00Z', registrationDeadlineAt: '2026-11-15T09:00:00Z', rosterDeadlineAt: '2026-11-18T09:00:00Z', operationCounts: { registrations: 4, fixtures: 0, announcements: 0 }, description: '로컬 화면 검증을 위한 테스트 데이터예요.', images: [], imageUrls: [], awards: [], sponsors: [], fixtures: [], groups: [], lineupMaxPlayers: 5, substitutionMode: 'unlimited', coverImageUrl: null, bracketPublishedAt: null, createdAt: '2026-11-01T00:00:00Z' };
const group = { tournamentId: id, tournamentTitle: title, tournamentStatus: tournament.status, tournamentKind: tournament.kind, assignments: [assignment], fixtures: [] };
const report = { phase, runtime: 'local Next.js; synthetic API fixtures; no real login/database', sourceHead: require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim(), shots: [], errors: [], requests: [], mutations: [] };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const server = await chromium.launchServer({ headless: false, args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: '/tmp/teameet-browser-libs/root/usr/lib/x86_64-linux-gnu' } });
  report.browserPid = server.process().pid; report.parentPid = process.pid;
  console.log(JSON.stringify({ browserPid: report.browserPid, parentPid: report.parentPid }));
  const browser = await chromium.connect(server.wsEndpoint());
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(({ userId }) => { localStorage.setItem('teameet.v1.userId', userId); localStorage.setItem('teameet.v1.session','active'); }, {userId});
    await context.route('**/api/v1/**', async route => {
      const req = route.request(), p = new URL(req.url()).pathname.replace('/api/v1', '');
      report.requests.push({ method:req.method(), path:p });
      const ok = data => route.fulfill({ json: { status:'success', data, timestamp:'2026-11-04T00:00:00Z' } });
      if(req.method() !== 'GET') {
        if(p === '/logs/client-error') return ok({});
        // Never simulate a saved mutation as backend evidence.
        report.mutations.push(p);
        return route.fulfill({status:503,json:{status:'error',statusCode:503,code:'LOCAL_VISUAL_ONLY',message:'로컬 캡처에서는 실제 저장을 수행하지 않아요.'}});
      }
      if (p === '/admin/me') return route.fulfill({status:403,json:{status:'error',statusCode:403,code:'PERMISSION_DENIED',message:'플랫폼 관리자 권한이 없어요.'}});
      if (p === '/auth/me') return ok({ user: { id:userId, nickname:'테스트 디렉터', accountStatus:'active', termsAgreedAt:'2026-01-01T00:00:00Z', phoneVerifiedAt:'2026-01-01T00:00:00Z', emailVerifiedAt:'2026-01-01T00:00:00Z' }, profile: { nickname:'테스트 디렉터' } });
      if (p === '/me/tournament-staff') return ok({platformRole:null,items:[group]});
      if (p === `/admin/tournaments/${id}`) return ok(tournament);
      if (p === `/tournaments/${id}`) return route.fulfill({status:404,json:{status:'error',statusCode:404,code:'TOURNAMENT_NOT_FOUND',message:'비공개 대회예요.'}});
      if (p.endsWith('/staff')) return ok({items:[assignment]});
      if (p.endsWith('/operations')) return ok({items:[],liveWarnings:[],pageInfo:{hasNextPage:false,nextCursor:null}});
      if (p === '/master/sports' || p === '/sports') return ok([tournament.sport]);
      if (p.endsWith('/periods')) return ok({ tournamentId:id, kind:'regular_tournament', competitionConfigVersionId:'local-config', expectedVersion:'2026-11-04T00:00:00Z', periods:[{code:'P1',label:'전반',durationMinutes:20,extraTime:false},{code:'P2',label:'후반',durationMinutes:20,extraTime:false}], legacyPeriodCount:null, requiresDurationInput:false, stageOverrides:[], groupOverrides:[], matchOverrideCount:0 });
      if (p.endsWith('/lineup-size-options')) return ok({items:[{value:5,label:'5명'}]});
      if (p.endsWith('/bracket')) return ok({groups:[],fixtures:[],slots:[],standings:[]});
      if (p.endsWith('/unread-count')) return ok({count:0});
      if (p.includes('campaign')) return ok(null);
      if (p === '/health') return ok({status:'ok',version:'local-fixture',checks:{db:false}});
      if (p === '/me/settings') return ok({theme:'light'});
      if (p.endsWith('/fields')) return ok({items:[]});
      return route.fulfill({status:501,json:{status:'error',statusCode:501,code:'UNHANDLED_VISUAL_FIXTURE',message:'캡처 스크립트에 정의되지 않은 API예요.'}});
    });
    const page = await context.newPage();
    page.on('pageerror',e=>report.errors.push({type:'pageerror',message:e.message}));
    page.on('console',m=>{if(m.type()==='error')report.errors.push({type:'console',message:m.text().slice(0,400)})});
    page.on('response',r=>{if(r.status()>=400)report.errors.push({type:'http',status:r.status(),path:new URL(r.url()).pathname})});
    const capture = async (name, url, ready, menu=false) => {
      await page.goto(origin+url,{waitUntil:'domcontentloaded',timeout:120000});
      await page.getByRole('heading',{name:ready,exact:false}).first().waitFor({timeout:60000});
      await page.waitForTimeout(700);
      if (await page.locator('nextjs-portal').count() && await page.locator('body').innerText().then(t=>t.includes('Application error'))) throw new Error('Runtime error');
      for(const width of [1440,768,390]) {
        await page.setViewportSize({width,height:1000});
        if(menu && width<1024) await page.getByRole('button',{name:'메뉴 열기'}).click();
        await page.waitForTimeout(350);
        const file=`${phase}-${name}-${width}.png`;
        await page.screenshot({path:path.join(out,file),fullPage:true});
        report.shots.push({file,path:url,width,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),title:await page.title()});
        if(menu && width<1024) await page.getByRole('button',{name:'메뉴 닫기'}).click();
      }
    };
    if (phase === 'before-visibility') await capture('overview',`/tournament-management/tournaments/${id}/overview`,title);
    else await capture('operations',`/tournament-ops/tournaments/${id}/operations`,'운영 보드');
    if(phase==='after') {
      await capture('management-list','/tournament-management','담당 대회 관리');
      await capture('overview',`/tournament-management/tournaments/${id}/overview`,title);
      await capture('info',`/tournament-management/tournaments/${id}/info`,title);
      await capture('operations-menu',`/tournament-ops/tournaments/${id}/operations`,'운영 보드',true);
      // Exercise the actual management entry and return links, preserving the route entity.
      await page.setViewportSize({width:1440,height:1000});
      await page.getByRole('link',{name:'대회 관리로 돌아가기',exact:true}).click();
      await page.waitForURL(`**/tournament-management/tournaments/${id}/overview`);
      report.managementReturn = new URL(page.url()).pathname;
      const visibilityButton = page.getByRole('button',{name:'공개로 전환',exact:true});
      await visibilityButton.waitFor();
      if (!await visibilityButton.isEnabled()) throw new Error('Director visibility button remains disabled');
      await visibilityButton.click();
      await page.getByText('로컬 캡처에서는 실제 저장을 수행하지 않아요.',{exact:true}).waitFor();
      if (await page.getByText('공개 상태를 저장했어요.',{exact:true}).count()) throw new Error('Failure rendered as success');
      report.visibilityFailureSurfaced = true;
      for (const width of [1440,768,390]) {
        await page.setViewportSize({width,height:1000});
        const file=`after-visibility-error-${width}.png`;
        await page.screenshot({path:path.join(out,file),fullPage:true});
        report.shots.push({file,width,path:report.managementReturn,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
      }
    }
    await context.close();
  } finally {
    await browser.close(); await server.close(); report.cleanup='owned contexts and headed browser closed';
    fs.writeFileSync(path.join(out,`${phase}-evidence.json`),JSON.stringify(report,null,2));
  }
  console.log(JSON.stringify({shots:report.shots, errors:report.errors, managementReturn:report.managementReturn,cleanup:report.cleanup}));
})().catch(e=>{console.error(e);process.exitCode=1});
