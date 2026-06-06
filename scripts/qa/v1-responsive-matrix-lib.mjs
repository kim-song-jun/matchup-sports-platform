export const REQUIRED_V1_BASE_URL = 'http://localhost:3013';

export const VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 812 },
  { name: 'mobile-360', width: 360, height: 812 },
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-412', width: 412, height: 915 },
  { name: 'mobile-430', width: 430, height: 932 },
  { name: 'mobile-480', width: 480, height: 932 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'tablet-900', width: 900, height: 1024 },
  { name: 'tablet-1023', width: 1023, height: 1024 },
  { name: 'desktop-1024', width: 1024, height: 900 },
  { name: 'desktop-1180', width: 1180, height: 900 },
  { name: 'desktop-1280', width: 1280, height: 900 },
  { name: 'desktop-1440', width: 1440, height: 960 },
  { name: 'desktop-1920', width: 1920, height: 1080 },
];

export const DEFAULT_ROUTES = [
  '/home',
  '/search',
  '/matches',
  '/team-matches',
  '/teams',
  '/my',
  '/chat',
  '/notifications',
  '/notices',
  '/matches/match-1',
  '/team-matches/team-match-1',
  '/teams/team-1',
  '/matches/new/confirm',
  '/team-matches/new/confirm',
  '/teams/new',
  '/my/settings',
  '/my/reviews',
];

export function validateV1BaseUrl(baseUrl) {
  if (baseUrl === REQUIRED_V1_BASE_URL) {
    return { ok: true, message: `using ${REQUIRED_V1_BASE_URL}` };
  }

  return {
    ok: false,
    message: `v1 responsive matrix must target ${REQUIRED_V1_BASE_URL}; received ${baseUrl}`,
  };
}

export function slugRoute(route) {
  return route.replace(/^\//, '').replaceAll('/', '__') || 'root';
}

export function detectLayoutIssues(metrics) {
  const issues = [];
  if (metrics.horizontalOverflow) {
    issues.push('document has horizontal overflow');
  }
  for (const overlap of metrics.fixedOverlaps) {
    issues.push(`fixed chrome overlaps: ${overlap.a}/${overlap.b}`);
  }
  for (const item of metrics.clippedText) {
    issues.push(`possible clipped text: ${item.text || item.className}`);
  }
  if (metrics.hiddenPrimaryCta) {
    issues.push('primary CTA is hidden or unreachable');
  }
  return issues;
}

export function manifestText(routes = DEFAULT_ROUTES, viewports = VIEWPORTS) {
  return [
    `base=${REQUIRED_V1_BASE_URL}`,
    `routes=${routes.join(',')}`,
    `viewports=${viewports.map((viewport) => viewport.width).join(',')}`,
  ].join('\n');
}
