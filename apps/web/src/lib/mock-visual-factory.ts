type SportPalette = {
  backgroundFrom: string;
  backgroundTo: string;
  surface: string;
  surfaceAlt: string;
  accent: string;
  accentAlt: string;
  foreground: string;
  shadow: string;
};

type LogoShape = 'shield' | 'roundel' | 'diamond' | 'hex' | 'banner' | 'orbit';

const palettes: Record<string, SportPalette> = {
  soccer: {
    backgroundFrom: '#0B1F33',
    backgroundTo: '#14532D',
    surface: '#0F766E',
    surfaceAlt: '#14532D',
    accent: '#84CC16',
    accentAlt: '#22C55E',
    foreground: '#E2E8F0',
    shadow: '#020617',
  },
  futsal: {
    backgroundFrom: '#082F49',
    backgroundTo: '#115E59',
    surface: '#0F766E',
    surfaceAlt: '#155E75',
    accent: '#22D3EE',
    accentAlt: '#38BDF8',
    foreground: '#F8FAFC',
    shadow: '#0F172A',
  },
  basketball: {
    backgroundFrom: '#1F2937',
    backgroundTo: '#7C2D12',
    surface: '#B45309',
    surfaceAlt: '#EA580C',
    accent: '#F59E0B',
    accentAlt: '#F97316',
    foreground: '#FFF7ED',
    shadow: '#431407',
  },
  badminton: {
    backgroundFrom: '#0F172A',
    backgroundTo: '#166534',
    surface: '#15803D',
    surfaceAlt: '#0F766E',
    accent: '#67E8F9',
    accentAlt: '#2DD4BF',
    foreground: '#F8FAFC',
    shadow: '#052E16',
  },
  ice_hockey: {
    backgroundFrom: '#0F172A',
    backgroundTo: '#155E75',
    surface: '#E0F2FE',
    surfaceAlt: '#BFDBFE',
    accent: '#38BDF8',
    accentAlt: '#F43F5E',
    foreground: '#F8FAFC',
    shadow: '#082F49',
  },
  swimming: {
    backgroundFrom: '#082F49',
    backgroundTo: '#0EA5E9',
    surface: '#0EA5E9',
    surfaceAlt: '#38BDF8',
    accent: '#67E8F9',
    accentAlt: '#F8FAFC',
    foreground: '#F8FAFC',
    shadow: '#0C4A6E',
  },
  tennis: {
    backgroundFrom: '#14532D',
    backgroundTo: '#0F172A',
    surface: '#166534',
    surfaceAlt: '#65A30D',
    accent: '#FDE047',
    accentAlt: '#FACC15',
    foreground: '#F8FAFC',
    shadow: '#052E16',
  },
  baseball: {
    backgroundFrom: '#111827',
    backgroundTo: '#9A3412',
    surface: '#166534',
    surfaceAlt: '#C2410C',
    accent: '#FB923C',
    accentAlt: '#FED7AA',
    foreground: '#FFF7ED',
    shadow: '#431407',
  },
  volleyball: {
    backgroundFrom: '#0F172A',
    backgroundTo: '#1D4ED8',
    surface: '#FDE68A',
    surfaceAlt: '#60A5FA',
    accent: '#F97316',
    accentAlt: '#38BDF8',
    foreground: '#F8FAFC',
    shadow: '#172554',
  },
  figure_skating: {
    backgroundFrom: '#1E1B4B',
    backgroundTo: '#2563EB',
    surface: '#EDE9FE',
    surfaceAlt: '#DBEAFE',
    accent: '#A78BFA',
    accentAlt: '#F9A8D4',
    foreground: '#F8FAFC',
    shadow: '#312E81',
  },
  short_track: {
    backgroundFrom: '#0F172A',
    backgroundTo: '#334155',
    surface: '#E2E8F0',
    surfaceAlt: '#CBD5E1',
    accent: '#F97316',
    accentAlt: '#38BDF8',
    foreground: '#F8FAFC',
    shadow: '#1E293B',
  },
};

const logoShapes: LogoShape[] = ['shield', 'roundel', 'diamond', 'hex', 'banner', 'orbit'];

function hashKey(key: string) {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 33 + key.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toDataUri(svg: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
}

function getPalette(sportType: string) {
  return palettes[sportType] || palettes.soccer;
}

function getMonogram(name: string) {
  const compact = name.replace(/\s+/g, '').trim();
  if (!compact) return 'M';
  const latin = compact.match(/[A-Za-z0-9]/)?.[0];
  if (latin) return latin.toUpperCase();
  return compact.slice(0, 1);
}

function renderLogoShape(shape: LogoShape, palette: SportPalette) {
  const frames: Record<LogoShape, string> = {
    shield: `
      <path d="M128 20L214 54V124C214 176 182 218 128 236C74 218 42 176 42 124V54L128 20Z" fill="${palette.surface}" />
      <path d="M128 34L198 62V122C198 168 172 204 128 220C84 204 58 168 58 122V62L128 34Z" fill="${palette.surfaceAlt}" fill-opacity="0.88" />
    `,
    roundel: `
      <circle cx="128" cy="128" r="102" fill="${palette.surface}" />
      <circle cx="128" cy="128" r="78" fill="${palette.surfaceAlt}" fill-opacity="0.88" />
      <circle cx="128" cy="128" r="96" stroke="${palette.foreground}" stroke-opacity="0.26" stroke-width="8" />
    `,
    diamond: `
      <path d="M128 22L228 128L128 234L28 128L128 22Z" fill="${palette.surface}" />
      <path d="M128 48L198 128L128 208L58 128L128 48Z" fill="${palette.surfaceAlt}" fill-opacity="0.88" />
    `,
    hex: `
      <path d="M72 34H184L238 128L184 222H72L18 128L72 34Z" fill="${palette.surface}" />
      <path d="M82 52H174L216 128L174 204H82L40 128L82 52Z" fill="${palette.surfaceAlt}" fill-opacity="0.88" />
    `,
    banner: `
      <path d="M44 34H212V196H44L70 128L44 34Z" fill="${palette.surface}" />
      <path d="M60 52H194V180H60L82 128L60 52Z" fill="${palette.surfaceAlt}" fill-opacity="0.88" />
    `,
    orbit: `
      <circle cx="128" cy="128" r="84" fill="${palette.surface}" />
      <ellipse cx="128" cy="128" rx="112" ry="44" stroke="${palette.foreground}" stroke-opacity="0.24" stroke-width="10" />
      <ellipse cx="128" cy="128" rx="112" ry="44" transform="rotate(58 128 128)" stroke="${palette.foreground}" stroke-opacity="0.18" stroke-width="10" />
      <circle cx="128" cy="128" r="58" fill="${palette.surfaceAlt}" fill-opacity="0.88" />
    `,
  };

  return frames[shape];
}

export function getGeneratedTeamLogo(teamName: string, sportType: string, key = '') {
  const palette = getPalette(sportType);
  const monogram = escapeSvgText(getMonogram(teamName));
  const seed = hashKey(`${sportType}:${teamName}:${key}`);
  const shape = logoShapes[seed % logoShapes.length];
  const stripeAngle = (seed % 5) * 12 - 24;

  return toDataUri(`
    <svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="256" height="256" rx="64" fill="${palette.shadow}" />
      <rect width="256" height="256" rx="64" fill="url(#logoBg)" />
      <circle cx="196" cy="50" r="44" fill="${palette.accent}" fill-opacity="0.18" />
      <g>
        ${renderLogoShape(shape, palette)}
      </g>
      <rect x="42" y="118" width="172" height="18" rx="9" fill="${palette.foreground}" fill-opacity="0.14" transform="rotate(${stripeAngle} 128 128)" />
      <text x="128" y="150" text-anchor="middle" fill="${palette.foreground}" font-size="92" font-weight="800" font-family="Inter, Arial, sans-serif">${monogram}</text>
      <circle cx="196" cy="52" r="12" fill="${palette.accentAlt}" />
      <defs>
        <linearGradient id="logoBg" x1="26" y1="16" x2="230" y2="240" gradientUnits="userSpaceOnUse">
          <stop stop-color="${palette.backgroundFrom}" />
          <stop offset="1" stop-color="${palette.backgroundTo}" />
        </linearGradient>
      </defs>
    </svg>
  `);
}
