const VIEWPORTS = [
  { code: 'MS', name: 'iPhone SE2', width: 375, height: 667, band: 'mobile', order: 1 },
  { code: 'MM', name: 'iPhone 14', width: 390, height: 844, band: 'mobile', order: 2 },
  { code: 'ML', name: 'iPhone 16 Pro Max', width: 430, height: 932, band: 'mobile', order: 3 },
  { code: 'TS', name: 'iPad Mini', width: 768, height: 1024, band: 'tablet', order: 4 },
  { code: 'TM', name: 'iPad Air', width: 820, height: 1180, band: 'tablet', order: 5 },
  { code: 'TL', name: 'iPad Pro 12.9"', width: 1024, height: 1366, band: 'tablet', order: 6 },
  { code: 'DS', name: 'Laptop 13"', width: 1280, height: 800, band: 'desktop', order: 7 },
  { code: 'DM', name: 'Monitor 16"', width: 1440, height: 900, band: 'desktop', order: 8 },
  { code: 'DL', name: 'Full HD', width: 1920, height: 1080, band: 'desktop', order: 9 },
  { code: 'DXL', name: '2K QHD', width: 2560, height: 1440, band: 'desktop', order: 10 },
  { code: 'DXXL', name: '4K UHD', width: 3840, height: 2160, band: 'desktop', order: 11 },
];

export const E2E_ANALYZER_VIEWPORTS = Object.freeze(VIEWPORTS);
export const E2E_ANALYZER_VIEWPORT_CODES = Object.freeze(VIEWPORTS.map((viewport) => viewport.code));
export const E2E_ANALYZER_VIEWPORT_MAP = Object.freeze(
  Object.fromEntries(VIEWPORTS.map((viewport) => [viewport.code, viewport])),
);
export const E2E_ANALYZER_VIEWPORT_ORDER = new Map(
  VIEWPORTS.map((viewport, index) => [viewport.code, index]),
);

export const E2E_ANALYZER_LEGACY_VIEWPORT_ALIASES = Object.freeze({
  M1: 'MS',
  M2: 'MM',
  M3: 'ML',
  T1: 'TS',
  T2: 'TM',
  T3: 'TL',
  D1: 'DS',
  D2: 'DM',
  D3: 'DL',
});

const DETECTION_TOKENS = Object.freeze(
  [...E2E_ANALYZER_VIEWPORT_CODES, ...Object.keys(E2E_ANALYZER_LEGACY_VIEWPORT_ALIASES)]
    .sort((left, right) => right.length - left.length),
);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeViewportCode(rawCode) {
  if (!rawCode) {
    return null;
  }

  const normalized = String(rawCode).trim().toUpperCase();
  if (E2E_ANALYZER_VIEWPORT_MAP[normalized]) {
    return normalized;
  }
  return E2E_ANALYZER_LEGACY_VIEWPORT_ALIASES[normalized] ?? null;
}

export function parseViewportTokenFromName(fileStem) {
  const normalized = String(fileStem ?? '').trim();
  if (!normalized) {
    return null;
  }

  for (const token of DETECTION_TOKENS) {
    const pattern = new RegExp(`(?:^|[-_.])${escapeRegExp(token)}(?:$|[-_.])`, 'i');
    if (pattern.test(normalized)) {
      return token.toUpperCase();
    }
  }

  return null;
}

export function stripViewportToken(fileStem, token) {
  if (!fileStem || !token) {
    return String(fileStem ?? '').trim();
  }

  const escaped = escapeRegExp(token);
  return String(fileStem)
    .replace(new RegExp(`([._-])${escaped}(?=$|[._-])`, 'i'), '')
    .replace(new RegExp(`^${escaped}([._-])`, 'i'), '')
    .replace(new RegExp(`${escaped}$`, 'i'), '')
    .replace(/[._-]{2,}/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .trim();
}

export function viewportLabel(code) {
  const normalized = normalizeViewportCode(code);
  if (!normalized) {
    return String(code ?? '').trim() || 'unknown';
  }

  const viewport = E2E_ANALYZER_VIEWPORT_MAP[normalized];
  return `${viewport.code} ${viewport.name} (${viewport.width}x${viewport.height})`;
}

export function sortViewportCodes(codes) {
  return [...codes].sort((left, right) => {
    const leftIndex = E2E_ANALYZER_VIEWPORT_ORDER.get(normalizeViewportCode(left)) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = E2E_ANALYZER_VIEWPORT_ORDER.get(normalizeViewportCode(right)) ?? Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }
    return String(left).localeCompare(String(right));
  });
}
