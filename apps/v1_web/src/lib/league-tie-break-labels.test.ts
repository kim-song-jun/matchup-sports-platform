import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { V1LeagueTieBreakCriterion } from '@/types/league-match';
import { LEAGUE_TIE_BREAK_LABELS, LEAGUE_TIE_BREAK_ORDER, formatTieBreakRule } from './league-tie-break-labels';

/**
 * v1_web 테스트가 v1_api 소스를 직접 읽는다 — 서버 enum 과 화면 라벨의 계약은 패키지
 * 경계를 넘어가 타입으로 이어지지 않는다. 파싱이 0건이면 아래 두 검사가 모두 공회전하므로
 * length 단언이 그 방어막이다 — 지우면 이 파일은 통과만 하고 아무것도 잡지 않는다.
 */
function readApiSource(fileName: string): string {
  // vitest 의 cwd 는 apps/v1_web 이다(vitest-must-run-from-app-dir).
  return readFileSync(resolve(process.cwd(), '../v1_api/src/league-matches', fileName), 'utf8');
}

function parseQuotedValues(block: string): string[] {
  return [...block.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

function parseServerUnionMembers(): string[] {
  const body = readApiSource('league-standings.ts').match(/export type LeagueTieBreakCriterion\s*=([\s\S]*?);/)?.[1];
  return body === undefined ? [] : parseQuotedValues(body);
}

function parseServerOrder(): string[] {
  const body = readApiSource('league-tie-break.ts').match(/export const LEAGUE_TIE_BREAK_ORDER[^=]*=\s*\[([\s\S]*?)\]/)?.[1];
  return body === undefined ? [] : parseQuotedValues(body);
}

describe('리그 동점 처리 라벨', () => {
  it('서버 enum 의 모든 기준에 한국어 라벨이 있다', () => {
    const members = parseServerUnionMembers();

    expect(members).toHaveLength(5);
    expect(members).toContain('fewestGoalsAgainst');
    for (const member of members) {
      expect(
        LEAGUE_TIE_BREAK_LABELS[member as V1LeagueTieBreakCriterion],
        `서버 기준 '${member}' 의 한국어 라벨이 없어요`,
      ).toBeDefined();
    }
  });

  it('화면이 쓰는 기본 순서가 서버 상수와 값·순서까지 같다', () => {
    const serverOrder = parseServerOrder();

    expect(serverOrder).toHaveLength(5);
    expect([...LEAGUE_TIE_BREAK_ORDER]).toEqual(serverOrder);
  });

  it('라벨은 식별자가 아니라 한국어다', () => {
    for (const [criterion, label] of Object.entries(LEAGUE_TIE_BREAK_LABELS)) {
      expect(label, `'${criterion}' 라벨이 식별자 그대로예요`).not.toMatch(/[A-Za-z]/);
    }
  });

  it('라벨을 모르는 기준은 식별자로 찍지 않고 버린다', () => {
    expect(formatTieBreakRule(['points', 'someFutureCriterion', 'goalsFor'])).toBe('승점 → 다득점');
    expect(formatTieBreakRule(['someFutureCriterion'])).toBe('');
  });
});
