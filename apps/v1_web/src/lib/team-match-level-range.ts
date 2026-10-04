import { V1_LEVELS, type V1LevelCode } from './v1-levels';

type TeamMatchLevelRange = { minLevelCode: V1LevelCode | null; maxLevelCode: V1LevelCode | null };

function knownLevelCode(value: string): V1LevelCode | null {
  const canonical = V1_LEVELS.find((level) => level.label === value || level.code === value)?.code;
  if (canonical) return canonical;
  // 만료되지 않은 기존 단일 등급 드래프트/구조화 이전 조건의 알려진 보기만 보존한다.
  return value === 'A' ? 'advanced' : value === 'B' ? 'intermediate' : value === 'C' ? 'novice' : null;
}

/** 단일 등급 드래프트와 새 범위가 같은 저장 경로를 쓴다. 미상 값은 입문으로 바꾸지 않는다. */
export function parseTeamMatchLevelRange(value: string): TeamMatchLevelRange | null {
  const trimmed = value.trim();
  if (!trimmed) return { minLevelCode: null, maxLevelCode: null };
  const parts = trimmed.split(/[-~–]/).map((part) => part.trim());
  if (parts.length > 2 || parts.some((part) => !part)) return null;
  const min = knownLevelCode(parts[0]!);
  const max = knownLevelCode(parts[1] ?? parts[0]!);
  if (!min || !max || V1_LEVELS.findIndex((level) => level.code === min) > V1_LEVELS.findIndex((level) => level.code === max)) return null;
  return { minLevelCode: min, maxLevelCode: max };
}

/** API의 두 끝점을 모두 표시한다. 미상 코드도 보존하여 다음 저장에서 검증하도록 한다. */
export function formatTeamMatchLevelRange(minCode?: string | null, maxCode?: string | null): string {
  const min = minCode ?? maxCode;
  const max = maxCode ?? minCode;
  if (!min || !max) return '';
  const label = (code: string) => V1_LEVELS.find((level) => level.code === code)?.label ?? code;
  return min === max ? label(min) : `${label(min)}-${label(max)}`;
}
