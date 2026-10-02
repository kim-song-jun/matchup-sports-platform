import { describe, expect, it } from 'vitest';
import { formatPlayerLabel, jerseyText } from './player-label';

describe('선수 라벨 — 등번호가 없을 때', () => {
  it('등번호가 있으면 "번호 이름"으로 붙인다', () => {
    expect(formatPlayerLabel(5, '지원수')).toBe('5 지원수');
    expect(formatPlayerLabel(0, '영번')).toBe('0 영번');
  });

  it('등번호가 없으면 이름만 남긴다 — 앞에 "-" 를 붙이지 않는다', () => {
    // 이 단정이 깨지면 화면에 `- 큐에이04` 처럼 오타로 읽히는 라벨이 다시 나온다.
    expect(formatPlayerLabel(null, '큐에이04')).toBe('큐에이04');
    expect(formatPlayerLabel(undefined, '큐에이04')).toBe('큐에이04');
    expect(formatPlayerLabel(null, '큐에이04')).not.toContain('-');
  });

  it('jerseyText 는 번호가 없으면 빈 문자열 — 칸은 호출부가 유지한다', () => {
    expect(jerseyText(7)).toBe('7');
    expect(jerseyText(null)).toBe('');
    expect(jerseyText(undefined)).toBe('');
  });
});
