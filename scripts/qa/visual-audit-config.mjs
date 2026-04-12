import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const VISUAL_AUDIT_BASELINE_COMMIT = '9ba813a25a349f4d60a1b5412ed8c90a455beb68';
export const VISUAL_AUDIT_BASELINE_DATE = '2026-04-06 14:27:18 +0900';
export const VISUAL_AUDIT_EXCLUDED_TEMPLATES = new Set([
  '/',
  '/callback/kakao',
  '/callback/naver',
]);

export const VIEWPORT_MATRIX = {
  'mobile-sm': { width: 360, height: 780, isMobile: true, hasTouch: true },
  'mobile-md': { width: 390, height: 844, isMobile: true, hasTouch: true },
  'mobile-lg': { width: 430, height: 932, isMobile: true, hasTouch: true },
  'tablet-sm': { width: 768, height: 1024, isMobile: false, hasTouch: true },
  'tablet-md': { width: 834, height: 1112, isMobile: false, hasTouch: true },
  'tablet-lg': { width: 1024, height: 1366, isMobile: false, hasTouch: true },
  'desktop-sm': { width: 1280, height: 800, isMobile: false, hasTouch: false },
  'desktop-md': { width: 1440, height: 900, isMobile: false, hasTouch: false },
  'desktop-lg': { width: 1920, height: 1080, isMobile: false, hasTouch: false },
};

export const POINTER_VIEWPORT_KEYS = new Set(['desktop-sm', 'desktop-md', 'desktop-lg']);

export const PERSONA_MATRIX = {
  guest: { nickname: null, warmupPath: '/landing' },
  user: { nickname: '시나로E2E', warmupPath: '/matches' },
  teamOwner: { nickname: '팀장오너E2E', warmupPath: '/teams' },
  seller: { nickname: '판매자E2E', warmupPath: '/marketplace' },
  instructor: { nickname: '강사E2E', warmupPath: '/lessons' },
  admin: { nickname: '관리자E2E', warmupPath: '/admin/dashboard' },
};

export const BATCH_LABELS = {
  'batch-1-public-auth': 'Public + Auth',
  'batch-2-main-discovery': 'Main Discovery Root',
  'batch-3-detail-pages': 'Detail Pages',
  'batch-4-create-edit-forms': 'Create / Edit / Forms',
  'batch-5-account-utility': 'Account / Utility / My',
  'batch-6-admin': 'Admin',
  'batch-7-interactions': 'Interaction-only Sweep',
  'batch-8-rerun': 'Blocked / Fail Rerun',
};

export function repoRootFromScript(importMetaUrl) {
  return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), '..', '..');
}

export function routeTemplateFromPageFile(filePath) {
  const normalized = filePath
    .replace(/^apps\/web\/src\/app/, '')
    .replace(/\/page\.tsx$/, '')
    .replace(/\/layout\.tsx$/, '')
    .replace(/\/+/g, '/');

  const segments = normalized
    .split('/')
    .filter(Boolean)
    .filter((segment) => !segment.startsWith('(') || !segment.endsWith(')'));

  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

export function routeSlugFromTemplate(template) {
  if (template === '/') {
    return 'root';
  }

  return template
    .replace(/^\//, '')
    .replace(/\//g, '__')
    .replace(/\[([^\]]+)\]/g, '$1')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .toLowerCase();
}

export function collectVisualRouteTemplates(repoRoot) {
  const output = execSync("rg --files 'apps/web/src/app' -g 'page.tsx' | sort", {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(routeTemplateFromPageFile)
    .filter((template) => !VISUAL_AUDIT_EXCLUDED_TEMPLATES.has(template));
}

function isPublicRoute(template) {
  return ['/landing', '/about', '/guide', '/pricing', '/faq'].includes(template);
}

function isAuthRoute(template) {
  return template === '/login';
}

function isAdminRoute(template) {
  return template.startsWith('/admin');
}

function isMyRoute(template) {
  return template.startsWith('/my/');
}

function isAccountUtilityRoute(template) {
  return [
    '/profile',
    '/settings',
    '/settings/account',
    '/settings/notifications',
    '/settings/privacy',
    '/settings/terms',
    '/notifications',
    '/chat',
    '/reviews',
    '/badges',
    '/feed',
    '/onboarding',
  ].includes(template);
}

function isDetailLikeRoute(template) {
  return template.includes('[id]');
}

function isCreateEditFormRoute(template) {
  return (
    template.endsWith('/new') ||
    template.endsWith('/edit') ||
    template.endsWith('/arrival') ||
    template.endsWith('/score') ||
    template.endsWith('/evaluate') ||
    template.endsWith('/checkout') ||
    template.endsWith('/refund')
  );
}

export function classifyRouteTemplate(template) {
  const topSegment = template.split('/').filter(Boolean)[0] ?? 'root';

  let batch = 'batch-2-main-discovery';
  if (isPublicRoute(template) || isAuthRoute(template)) batch = 'batch-1-public-auth';
  else if (isAdminRoute(template)) batch = 'batch-6-admin';
  else if (isMyRoute(template) || isAccountUtilityRoute(template)) batch = 'batch-5-account-utility';
  else if (isCreateEditFormRoute(template)) batch = 'batch-4-create-edit-forms';
  else if (isDetailLikeRoute(template)) batch = 'batch-3-detail-pages';

  let family = topSegment;
  if (isPublicRoute(template)) family = 'public';
  else if (isAuthRoute(template)) family = 'auth';
  else if (isAdminRoute(template)) family = 'admin';
  else if (isMyRoute(template)) family = 'my';
  else if (template.startsWith('/settings')) family = 'account';
  else if (['/profile', '/notifications', '/chat', '/reviews', '/badges', '/feed', '/onboarding'].includes(template)) family = 'account';

  let personaKey = 'user';
  if (isPublicRoute(template) || isAuthRoute(template)) personaKey = 'guest';
  else if (isAdminRoute(template)) personaKey = 'admin';
  else if (template.startsWith('/teams') || template.startsWith('/team-matches') || template.startsWith('/my/team')) personaKey = 'teamOwner';
  else if (template.startsWith('/mercenary/new') || template.startsWith('/mercenary/') && template.endsWith('/edit') || template === '/my/mercenary') personaKey = 'teamOwner';
  else if (template.startsWith('/marketplace/new') || template.startsWith('/marketplace/') && template.endsWith('/edit') || template === '/my/listings') personaKey = 'seller';
  else if (template.startsWith('/lessons/new') || template.startsWith('/lessons/') && template.endsWith('/edit') || template === '/my/lessons') personaKey = 'instructor';
  else if (template.startsWith('/venues/') && template.endsWith('/edit')) personaKey = 'admin';

  return {
    template,
    slug: routeSlugFromTemplate(template),
    family,
    batch,
    personaKey,
    isDynamic: template.includes('[id]'),
    isAdmin: isAdminRoute(template),
  };
}

const ROUTE_STATES = {
  '/landing': ['default', 'scrolled', 'menu-open', 'hover-primary-cta'],
  '/about': ['default', 'scrolled', 'menu-open', 'hover-primary-cta'],
  '/guide': ['default', 'scrolled', 'menu-open', 'hover-primary-cta'],
  '/pricing': ['default', 'scrolled', 'menu-open', 'hover-primary-cta'],
  '/faq': ['default', 'scrolled', 'menu-open', 'hover-primary-cta'],
  '/login': ['default', 'focus-first-input'],
  '/home': ['default', 'scrolled', 'hover-primary-cta', 'hover-card-first'],
  '/matches': ['default', 'scrolled', 'focus-first-input', 'filter-open', 'hover-card-first'],
  '/team-matches': ['default', 'scrolled', 'focus-first-input', 'hover-card-first'],
  '/teams': ['default', 'scrolled', 'hover-primary-cta', 'hover-card-first'],
  '/lessons': ['default', 'scrolled', 'focus-first-input', 'hover-card-first'],
  '/marketplace': ['default', 'scrolled', 'focus-first-input', 'hover-card-first'],
  '/mercenary': ['default', 'scrolled', 'hover-card-first'],
  '/venues': ['default', 'scrolled', 'focus-first-input', 'hover-card-first'],
  '/tournaments': ['default', 'scrolled', 'hover-primary-cta', 'hover-card-first'],
  '/profile': ['default', 'scrolled', 'hover-primary-cta'],
  '/settings': ['default', 'scrolled'],
  '/settings/notifications': ['default', 'scrolled'],
  '/notifications': ['default', 'scrolled'],
  '/chat': ['default', 'scrolled', 'hover-card-first'],
  '/reviews': ['default', 'scrolled'],
};

export function supportedStatesForTemplate(template) {
  if (ROUTE_STATES[template]) {
    return ROUTE_STATES[template];
  }

  const states = ['default'];
  if (!isPublicRoute(template) && !isAuthRoute(template)) {
    states.push('scrolled');
  }
  if (isCreateEditFormRoute(template)) {
    states.push('focus-first-input');
  }
  if (isDetailLikeRoute(template) && !template.endsWith('/edit')) {
    states.push('scrolled');
  }
  return Array.from(new Set(states));
}

function readyContract(anySelectors, contentSelectors = [], options = {}) {
  return {
    anySelectors,
    contentSelectors,
    postReadyDelayMs: options.postReadyDelayMs ?? 600,
    selectorTimeoutMs: options.selectorTimeoutMs ?? null,
    transientTimeoutMs: options.transientTimeoutMs ?? null,
  };
}

export function readyContractForTemplate(template) {
  if (template === '/login') {
    return readyContract(
      ['[data-testid="login-page"]'],
      ['[data-testid="auth-submit"]', '[data-testid="dev-login-panel"]', 'form button[type="submit"]'],
    );
  }

  if (template === '/matches') {
    return readyContract(
      ['[data-testid="match-search-input"]'],
      ['[data-testid="match-results"]', '[data-testid="match-count"]', '[data-testid="match-filter-toggle"]'],
    );
  }

  if (template === '/payments/checkout') {
    return readyContract(
      ['text=결제하기', 'text=테스트 결제', 'text=결제 정보가 없어요', 'main h1', 'main h2'],
      ['text=주문 정보', 'text=결제 수단', 'text=결제 금액', 'text=최종 결제 금액', 'main button', 'main a[href]'],
      {
        postReadyDelayMs: 900,
        selectorTimeoutMs: 45_000,
        transientTimeoutMs: 25_000,
      },
    );
  }

  if (template === '/payments/[id]/refund') {
    return readyContract(
      [
        'text=환불 요청',
        'text=테스트 환불',
        'text=환불 정보를 불러오지 못했어요',
        'text=환불 대상을 찾을 수 없어요',
        'text=실결제 환불 연동이 비활성화되어 있어요',
        'text=지금은 환불할 수 없어요',
        'main h1',
        'main h2',
      ],
      ['text=결제 정보', 'text=환불 규정', 'text=예상 환불 금액', 'text=환불 사유', 'main button', 'main textarea', 'main a[href]'],
      {
        postReadyDelayMs: 900,
        selectorTimeoutMs: 45_000,
        transientTimeoutMs: 25_000,
      },
    );
  }

  if (isPublicRoute(template)) {
    return readyContract(
      ['nav', 'main h1'],
      ['main section', 'main a[href]', 'footer'],
      { postReadyDelayMs: 1200 },
    );
  }

  if (template === '/home') {
    return readyContract(
      ['[data-testid="mobile-page-top-zone"]', 'main h1', 'main h2'],
      ['text=더 찾아보기', 'text=추천 매치', 'main a[href^="/matches/"]', 'main section'],
      {
        postReadyDelayMs: 1_000,
        selectorTimeoutMs: 30_000,
        transientTimeoutMs: 25_000,
      },
    );
  }

  if (['/team-matches', '/teams', '/lessons', '/marketplace', '/mercenary', '/venues', '/tournaments'].includes(template)) {
    return readyContract(
      ['[data-testid="mobile-page-top-zone"]', 'main h1', 'main h2'],
      ['main a[href]', 'main article', 'main button', 'main section'],
    );
  }

  if (template.startsWith('/notifications')) {
    return readyContract(
      ['[data-testid="mobile-glass-header"]', 'h1', 'h2'],
      ['[data-testid^="notification-card-"]', 'button', 'a[href]'],
    );
  }

  if (template === '/chat/[id]') {
    return readyContract(
      ['header span', 'text=채팅방', 'button[aria-label=\"더보기 메뉴\"]'],
      ['text=빠른 메시지', 'input[placeholder*=\"메시지\"]', 'button[aria-label=\"정보 보기\"]', 'button[aria-label=\"정보 닫기\"]'],
      { postReadyDelayMs: 800 },
    );
  }

  if (template === '/teams/[id]/members') {
    return readyContract(
      ['[data-testid=\"team-members-heading\"]', 'text=멤버 관리', 'text=멤버 목록'],
      ['[data-testid^=\"team-member-row-\"]', '[data-testid^=\"team-member-menu-\"]', 'text=팀 멤버'],
      { postReadyDelayMs: 800 },
    );
  }

  if (template === '/venues/[id]') {
    return readyContract(
      ['[data-testid=\"mobile-glass-header\"]', 'button[aria-label=\"공유하기\"]', 'main h1', 'main h2'],
      ['text=기본 정보', 'text=향후 7일 예약', 'text=허브 섹션', 'main article', 'main section'],
      {
        postReadyDelayMs: 1_000,
        selectorTimeoutMs: 45_000,
        transientTimeoutMs: 25_000,
      },
    );
  }

  if (template.startsWith('/chat')) {
    return readyContract(
      ['[data-testid="mobile-glass-header"]', 'h1', 'h2', 'a[href^="/chat/"]', 'text=채팅방을 선택하세요', 'text=대화를 시작해보세요'],
      ['a[href^="/chat/"]', 'button', 'text=채팅방을 선택하세요', 'text=대화를 시작해보세요'],
    );
  }

  if (template.startsWith('/profile') || template.startsWith('/settings')) {
    return readyContract(
      ['[data-testid="mobile-glass-header"]', 'h1', 'h2'],
      ['a[href]', 'button', 'section', 'article'],
    );
  }

  if (template.startsWith('/admin')) {
    return readyContract(
      ['main h1', 'main h2', '[data-testid="admin-auth-wall"]'],
      ['main table', 'main a[href]', 'main button', 'main section', 'main article'],
    );
  }

  if (isCreateEditFormRoute(template)) {
    return readyContract(
      [
        '[data-testid="mobile-glass-header"]',
        '[data-testid="mobile-page-top-zone"]',
        'h1',
        'h2',
        'main h1',
        'main h2',
        'main form',
        'form input:not([type="hidden"])',
        'form textarea',
        'form select',
        'form button[type="submit"]',
        'input:not([type="hidden"])',
        'textarea',
        'select',
        'main input:not([type="hidden"])',
        'main textarea',
        'main select',
      ],
      [
        'form',
        'input:not([type="hidden"])',
        'textarea',
        'select',
        'button',
        'main button',
        'main input:not([type="hidden"])',
        'main textarea',
        'main select',
        'main section',
        'main article',
        'label',
      ],
      {
        postReadyDelayMs: 800,
        selectorTimeoutMs: 45_000,
        transientTimeoutMs: 25_000,
      },
    );
  }

  return readyContract(
    ['[data-testid="mobile-glass-header"]', '[data-testid="mobile-page-top-zone"]', 'main h1', 'main h2', 'main form'],
    ['main a[href]', 'main button', 'main input', 'main textarea', 'main section', 'main article'],
  );
}

export function stateAssertionsForTemplate(template) {
  const assertions = {
    'tab-switch': {
      requireTargetSelected: true,
    },
    'dialog-open': {
      anyVisibleSelectors: ['[role="dialog"]', '[aria-modal="true"]', '[data-state="open"][role="dialog"]'],
    },
    'drawer-open': {
      anyVisibleSelectors: ['[role="dialog"]', '[data-state="open"]', '[data-testid*="drawer"]'],
    },
  };

  if (['/landing', '/about', '/guide', '/pricing', '/faq'].includes(template)) {
    assertions['menu-open'] = {
      requireTriggerAttributeChange: ['aria-label', 'aria-expanded'],
      anyVisibleSelectors: ['button[aria-label*="메뉴 닫기"]', 'nav .md\\:hidden a[href]', '.animate-fade-in a[href]'],
    };
  }

  if (template === '/matches') {
    assertions['filter-open'] = {
      requireTriggerAttributeChange: ['aria-pressed'],
      anyVisibleSelectors: ['[data-testid="match-date-input"]', '[data-testid="match-region-input"]'],
    };
  }

  return assertions;
}

export function interactionSelectorsForTemplate(template) {
  const selectors = {
    menuOpen: [],
    primaryCta: [],
    firstCard: [],
    firstInput: [],
    filterToggle: [],
    tabTrigger: [],
    dialogTrigger: [],
    drawerTrigger: [],
  };

  if (['/landing', '/about', '/guide', '/pricing', '/faq'].includes(template)) {
    selectors.menuOpen.push('button[aria-label*="menu"]', 'button[aria-label*="메뉴"]');
    selectors.primaryCta.push('a[href="/login"]', 'a[href="/matches"]', 'a[href="/pricing"]');
  }

  if (template === '/home') {
    selectors.primaryCta.push('a[href="/matches/new"]', 'a[href="/login"]');
    selectors.firstCard.push('a[href^="/matches/"]:not([href*="/new"]):not([href*="/edit"])');
  }

  if (template === '/matches') {
    selectors.firstInput.push('#match-search-input');
    selectors.filterToggle.push('[data-testid="match-filter-toggle"]');
    selectors.firstCard.push('a[href^="/matches/"]:not([href*="/new"]):not([href*="/edit"])');
  }

  if (template === '/team-matches') {
    selectors.firstInput.push('#team-match-date-filter');
    selectors.primaryCta.push('a[href="/team-matches/new"]');
    selectors.firstCard.push('a[href^="/team-matches/"]:not([href*="/new"]):not([href*="/edit"])');
  }

  if (template === '/teams') {
    selectors.primaryCta.push('a[href="/teams/new"]');
    selectors.firstCard.push('a[href^="/teams/"]:not([href*="/new"]):not([href*="/edit"])');
  }

  if (template === '/lessons') {
    selectors.firstInput.push('#lessons-search', 'input[placeholder*="검색"]');
    selectors.primaryCta.push('a[href="/lessons/new"]');
    selectors.firstCard.push('a[href^="/lessons/"]:not([href*="/new"]):not([href*="/edit"])');
  }

  if (template === '/marketplace') {
    selectors.firstInput.push('#marketplace-search');
    selectors.primaryCta.push('a[href="/marketplace/new"]');
    selectors.firstCard.push('a[href^="/marketplace/"]:not([href*="/new"]):not([href*="/edit"])');
  }

  if (template === '/mercenary') {
    selectors.primaryCta.push('a[href="/mercenary/new"]', 'a[href="/my/mercenary"]');
    selectors.firstCard.push('a[href^="/mercenary/"]:not([href*="/new"]):not([href*="/edit"])');
  }

  if (template === '/venues') {
    selectors.firstInput.push('#venues-search');
    selectors.firstCard.push('a[href^="/venues/"]:not([href*="/edit"])');
  }

  if (template === '/tournaments') {
    selectors.primaryCta.push('a[href="/tournaments/new"]');
    selectors.firstCard.push('a[href^="/tournaments/"]:not([href*="/new"])');
  }

  if (template === '/profile') {
    selectors.primaryCta.push('a[href="/settings"]');
  }

  if (template === '/chat') {
    selectors.firstCard.push('a[href^="/chat/"]');
  }

  selectors.tabTrigger.push('[role="tab"]');
  selectors.dialogTrigger.push('[aria-haspopup="dialog"]', '[data-testid*="dialog-trigger"]');
  selectors.drawerTrigger.push('[data-testid*="drawer-trigger"]', '[aria-controls*="drawer"]');

  return selectors;
}

export const ROUTE_RESOLVER_SPECS = {
  '/matches/[id]': { sourceTemplates: ['/matches'], pattern: '^/matches/(?!new$)[^/]+$' },
  '/matches/[id]/edit': { sourceTemplates: ['/my/matches'], pattern: '^/matches/[^/]+/edit$', apiStrategy: 'hosted-match-edit' },
  '/team-matches/[id]': { sourceTemplates: ['/team-matches'], pattern: '^/team-matches/(?!new$)[^/]+$' },
  '/team-matches/[id]/edit': { sourceTemplates: ['/my/team-matches'], pattern: '^/team-matches/[^/]+/edit$', apiStrategy: 'managed-team-match-edit' },
  '/team-matches/[id]/arrival': { sourceTemplates: ['/my/team-matches'], pattern: '^/team-matches/[^/]+/arrival$', apiStrategy: 'managed-team-match-arrival' },
  '/team-matches/[id]/score': { sourceTemplates: ['/my/team-matches'], pattern: '^/team-matches/[^/]+/score$', apiStrategy: 'managed-team-match-score' },
  '/team-matches/[id]/evaluate': { sourceTemplates: ['/my/team-matches', '/my/team-match-applications'], pattern: '^/team-matches/[^/]+/evaluate$', apiStrategy: 'managed-team-match-evaluate' },
  '/teams/[id]': { sourceTemplates: ['/teams'], pattern: '^/teams/(?!new$)[^/]+$', apiStrategy: 'managed-team-detail' },
  '/teams/[id]/edit': { sourceTemplates: ['/my/teams'], pattern: '^/teams/[^/]+/edit$', apiStrategy: 'managed-team-edit' },
  '/teams/[id]/matches': { baseTemplate: '/teams/[id]', append: '/matches', apiStrategy: 'managed-team-matches' },
  '/teams/[id]/members': { baseTemplate: '/teams/[id]', append: '/members', apiStrategy: 'managed-team-members' },
  '/teams/[id]/mercenary': { baseTemplate: '/teams/[id]', append: '/mercenary', apiStrategy: 'managed-team-mercenary' },
  '/lessons/[id]': { sourceTemplates: ['/lessons'], pattern: '^/lessons/(?!new$)[^/]+$' },
  '/lessons/[id]/edit': { sourceTemplates: ['/my/lessons'], pattern: '^/lessons/[^/]+/edit$', apiStrategy: 'owned-lesson-edit' },
  '/marketplace/[id]': { sourceTemplates: ['/marketplace'], pattern: '^/marketplace/(?!new$)[^/]+$' },
  '/marketplace/[id]/edit': { sourceTemplates: ['/my/listings'], pattern: '^/marketplace/[^/]+/edit$', apiStrategy: 'owned-listing-edit' },
  '/mercenary/[id]': { sourceTemplates: ['/mercenary'], pattern: '^/mercenary/(?!new$)[^/]+$' },
  '/mercenary/[id]/edit': { sourceTemplates: ['/my/mercenary'], pattern: '^/mercenary/[^/]+/edit$', apiStrategy: 'authored-mercenary-edit' },
  '/venues/[id]': { sourceTemplates: ['/venues'], pattern: '^/venues/(?!new$)[^/]+$', apiStrategy: 'venue-detail' },
  '/venues/[id]/edit': { baseTemplate: '/venues/[id]', append: '/edit', apiStrategy: 'editable-venue-edit' },
  '/tournaments/[id]': { sourceTemplates: ['/tournaments'], pattern: '^/tournaments/(?!new$)[^/]+$', apiStrategy: 'tournament-detail' },
  '/payments/[id]': { sourceTemplates: ['/payments'], pattern: '^/payments/[^/]+$' },
  '/payments/checkout': { sourceTemplates: ['/lessons'], pattern: '^/payments/checkout(?:\\?.+)?$', apiStrategy: 'lesson-ticket-checkout' },
  '/payments/[id]/refund': { sourceTemplates: ['/payments'], pattern: '^/payments/[^/]+/refund$', apiStrategy: 'payment-refund' },
  '/chat/[id]': { sourceTemplates: ['/chat'], pattern: '^/chat/[^/]+$', apiStrategy: 'chat-room' },
  '/user/[id]': { sourceTemplates: ['/feed', '/reviews', '/my/reviews-received'], pattern: '^/user/[^/]+$', apiStrategy: 'current-user-profile' },
  '/admin/disputes/[id]': { sourceTemplates: ['/admin/disputes'], pattern: '^/admin/disputes/[^/]+$' },
  '/admin/lessons/[id]': { sourceTemplates: ['/admin/lessons'], pattern: '^/admin/lessons/(?!new$)[^/]+$', apiStrategy: 'admin-lesson-detail' },
  '/admin/matches/[id]': { sourceTemplates: ['/admin/matches'], pattern: '^/admin/matches/(?!new$)[^/]+$' },
  '/admin/team-matches/[id]': { sourceTemplates: ['/admin/team-matches'], pattern: '^/admin/team-matches/(?!new$)[^/]+$' },
  '/admin/teams/[id]': { sourceTemplates: ['/admin/teams'], pattern: '^/admin/teams/(?!new$)[^/]+$', apiStrategy: 'admin-team-detail' },
  '/admin/users/[id]': { sourceTemplates: ['/admin/users'], pattern: '^/admin/users/(?!new$)[^/]+$' },
  '/admin/venues/[id]': { sourceTemplates: ['/admin/venues'], pattern: '^/admin/venues/(?!new$)[^/]+$' },
};

export function buildRouteCatalog(repoRoot) {
  return collectVisualRouteTemplates(repoRoot).map((template) => ({
    ...classifyRouteTemplate(template),
    supportedStates: supportedStatesForTemplate(template),
    readyContract: readyContractForTemplate(template),
    stateAssertions: stateAssertionsForTemplate(template),
    interactionSelectors: interactionSelectorsForTemplate(template),
    resolver: ROUTE_RESOLVER_SPECS[template] ?? null,
  }));
}
