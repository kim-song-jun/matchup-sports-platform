import { beforeEach, describe, expect, it } from 'vitest';
import { clearExpiringDraft, readExpiringDraft, writeExpiringDraft } from './expiring-draft';

/**
 * 만료 없는 드래프트가 며칠 뒤 되살아나 새 매치의 종목·지역을 조용히 덮어쓰던 결함
 * (2026-08 사용자 제보)에 대한 회귀 테스트.
 */
describe('expiring-draft', () => {
  const key = 'teameet:v1:test-draft';
  const DAY = 24 * 60 * 60 * 1000;
  const now = 1_760_000_000_000;

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('방금 저장한 드래프트는 그대로 돌려준다 — 정상적인 위저드 흐름을 깨지 않는다', () => {
    writeExpiringDraft(key, { sportId: 'futsal', regionId: 'gangnam' }, now);
    expect(readExpiringDraft(key, now + 60_000)).toEqual({ sportId: 'futsal', regionId: 'gangnam' });
  });

  it('하루가 지난 드래프트는 되살리지 않고 저장소에서도 지운다', () => {
    writeExpiringDraft(key, { sportId: 'futsal' }, now);
    expect(readExpiringDraft(key, now + DAY + 1)).toBeNull();
    // 다음 진입에서 또 만료 판정을 반복하지 않도록 실제로 비워져야 한다.
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it('만료 직전(24시간 이내)까지는 유지한다 — 잠깐 이탈 후 복귀는 보존된다', () => {
    writeExpiringDraft(key, { sportId: 'futsal' }, now);
    expect(readExpiringDraft(key, now + DAY - 1)).toEqual({ sportId: 'futsal' });
  });

  it('만료 정보가 없는 예전 형식은 폐기한다 — 언제 저장된 값인지 알 수 없다', () => {
    // 이번 변경 전에 저장된 값의 모양(봉투 없이 값이 그대로 들어 있음).
    window.localStorage.setItem(key, JSON.stringify({ sportId: 'football', regionId: 'seocho' }));
    expect(readExpiringDraft(key, now)).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it('깨진 JSON은 폐기하고 화면을 죽이지 않는다', () => {
    window.localStorage.setItem(key, '{not json');
    expect(readExpiringDraft(key, now)).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it('clearExpiringDraft는 작성 완료 후 값을 비운다', () => {
    writeExpiringDraft(key, { sportId: 'futsal' }, now);
    clearExpiringDraft(key);
    expect(readExpiringDraft(key, now)).toBeNull();
  });
});
