import {
  parseArgs,
  parseViewports,
  readFeatureRows,
  REQUIRED_V1_BASE_URL,
  validateV1BaseUrl,
} from './v1-open-design-parity-lib.mjs';

export const DEFAULT_DESKTOP_VISUAL_ROUTES = ['/home', '/matches', '/team-matches', '/teams', '/my', '/search'];
export const DEFAULT_DESKTOP_VISUAL_VIEWPORTS = '1280x900';
export const DEFAULT_DESKTOP_VISUAL_OUT = 'evidence/open-design-rebuild-final';

const MOBILE_STANDALONE_ROUTES = new Set(['/search', '/search/empty', '/search/error', '/search/new', '/search/stale']);
const CORE_APP_CHROME_ROUTES = new Set(['/home', '/matches', '/team-matches', '/teams', '/my']);

export function buildDesktopVisualConfig(tokens) {
  const args = parseArgs(tokens);
  const baseUrl = args['base-url'] ?? REQUIRED_V1_BASE_URL;
  const baseCheck = validateV1BaseUrl(baseUrl);
  if (!baseCheck.ok) throw new Error(baseCheck.message);

  return {
    baseUrl,
    listOnly: args.list === true,
    matrix: args.matrix ? String(args.matrix) : null,
    outDir: args.out ?? DEFAULT_DESKTOP_VISUAL_OUT,
    routes: args.routes ? String(args.routes).split(',').filter(Boolean) : DEFAULT_DESKTOP_VISUAL_ROUTES,
    viewports: parseViewports(args.viewports ?? DEFAULT_DESKTOP_VISUAL_VIEWPORTS),
  };
}

export async function resolveDesktopVisualRoutes(config) {
  if (!config.matrix) return config.routes;
  const rows = await readFeatureRows(config.matrix);
  return rows
    .filter((row) => row.classification === 'implemented-route' && row.route.startsWith('/'))
    .map((row) => row.route);
}

export async function buildDesktopVisualRouteManifest(config) {
  const routes = await resolveDesktopVisualRoutes(config);
  return {
    baseUrl: config.baseUrl,
    matrix: config.matrix,
    outDir: config.outDir,
    routeCount: routes.length,
    routes,
    viewports: config.viewports,
  };
}

export function isDesktopViewport(viewport) {
  return viewport.width >= 1024;
}

export function buildRouteVisualExpectations(route) {
  const pathname = normalizePathname(route);
  const appChromeRequired = CORE_APP_CHROME_ROUTES.has(pathname);
  const standalone = MOBILE_STANDALONE_ROUTES.has(pathname) || isAuthStandaloneRoute(pathname);
  return {
    appFrameRequired: appChromeRequired,
    desktopSearchSurfaceRequired: appChromeRequired,
    desktopTopbarRequired: appChromeRequired,
    homeMobileFabRequired: pathname === '/home',
    homeRightRailRequired: pathname === '/home',
    mobileBottomNavRequired: !standalone,
    mobileBottomNavForbidden: standalone,
  };
}

function normalizePathname(route) {
  const pathname = String(route).split('?')[0].replace(/\/$/, '');
  return pathname || '/';
}

function isAuthStandaloneRoute(pathname) {
  return pathname === '/login'
    || pathname.startsWith('/login/')
    || pathname.startsWith('/auth/')
    || pathname.startsWith('/callback/')
    || pathname === '/signup'
    || pathname.startsWith('/signup/')
    || pathname === '/onboarding'
    || pathname.startsWith('/onboarding/')
    || pathname === '/terms'
    || pathname.startsWith('/terms/');
}
