export const V1_LEVELS = [
  { code: 'beginner', label: '입문' },
  { code: 'novice', label: '초보' },
  { code: 'intermediate', label: '중수' },
  { code: 'advanced', label: '고수' },
] as const;

export type V1LevelCode = (typeof V1_LEVELS)[number]['code'];

const LEVEL_ORDER = V1_LEVELS.map((level) => level.code);

export function toLevelCodes(value: string | null): V1LevelCode[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .map((item) => (isLevelCode(item) ? item : extractLevelCodes(item)[0]))
        .filter((item): item is V1LevelCode => Boolean(item)),
    ),
  );
}

export function toggleLevelCode(levels: V1LevelCode[], level: V1LevelCode) {
  const next = levels.includes(level) ? levels.filter((item) => item !== level) : [...levels, level];
  return next.length ? next.join(',') : null;
}

export function levelCodeToLabel(code: V1LevelCode) {
  return V1_LEVELS.find((level) => level.code === code)?.label ?? code;
}

export function labelToLevelCode(label: string): V1LevelCode {
  return extractLevelCodes(label)[0] ?? 'beginner';
}

export function levelRangeMatches(
  selectedLevels: V1LevelCode[],
  minCode?: string | null,
  maxCode?: string | null,
  fallbackLabel?: string | null,
) {
  if (selectedLevels.length === 0) return true;

  if (isLevelCode(minCode) && isLevelCode(maxCode)) {
    const minIndex = LEVEL_ORDER.indexOf(minCode);
    const maxIndex = LEVEL_ORDER.indexOf(maxCode);
    return selectedLevels.some((code) => {
      const selectedIndex = LEVEL_ORDER.indexOf(code);
      return selectedIndex >= minIndex && selectedIndex <= maxIndex;
    });
  }

  const fallbackCodes = extractLevelCodes(fallbackLabel ?? '');
  if (fallbackCodes.length === 0) return false;
  return selectedLevels.some((code) => fallbackCodes.includes(code));
}

function extractLevelCodes(label: string): V1LevelCode[] {
  const codes: V1LevelCode[] = [];
  if (label.includes('전체')) return [...LEVEL_ORDER];
  if (label.includes('입문')) codes.push('beginner');
  if (label.includes('초보')) codes.push('novice');
  if (label.includes('중수')) codes.push('intermediate');
  if (label.includes('고수')) codes.push('advanced');
  if (label.startsWith('A')) codes.push('advanced');
  if (label.startsWith('B')) codes.push('intermediate');
  if (label.startsWith('C')) codes.push('novice');
  return Array.from(new Set(codes));
}

function isLevelCode(value?: string | null): value is V1LevelCode {
  return V1_LEVELS.some((level) => level.code === value);
}
