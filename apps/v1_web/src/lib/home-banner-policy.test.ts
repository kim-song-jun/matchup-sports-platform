import { describe, expect, it } from 'vitest';
import { decideHomeBanners, MAX_NUDGES, NUDGE_PRIORITY, type HomeBannerAvailability } from './home-banner-policy';

const none: HomeBannerAvailability = {
  phoneVerify: false,
  recordConsent: false,
  pendingReviews: false,
  push: false,
};

describe('홈 배너 표시 정책 (A안)', () => {
  it('아무 조건도 안 맞으면 아무것도 안 보여준다', () => {
    const d = decideHomeBanners(none);
    expect(d.showPhoneVerify).toBe(false);
    expect(d.nudge).toBeNull();
    expect(d.deferred).toEqual([]);
  });

  // ── 이 스펙의 핵심 계약 ────────────────────────────────────────────────────
  // 차단성 배너(휴대폰 인증)가 유도 배너에 밀리면, 사용자는 매치 신청이 왜 거부되는지
  // 모른 채 이탈한다(조회는 되므로 화면상 정상으로 보인다). 상한을 도입하면서 이걸
  // 깨뜨리는 게 가장 쉬운 실수라 여기서 못 박는다.
  it('유도 배너가 전부 걸려 있어도 차단성 배너는 절대 밀리지 않는다', () => {
    const d = decideHomeBanners({ phoneVerify: true, recordConsent: true, pendingReviews: true, push: true });
    expect(d.showPhoneVerify).toBe(true);
  });

  it('유도 배너가 여럿이면 우선순위 첫 번째 하나만 보여준다', () => {
    const d = decideHomeBanners({ phoneVerify: false, recordConsent: true, pendingReviews: true, push: true });
    expect(d.nudge).toBe('recordConsent');
    expect(d.deferred).toEqual(['pendingReviews', 'push']);
  });

  it('우선순위 앞의 것이 없으면 다음 것이 자리를 가져간다', () => {
    expect(decideHomeBanners({ ...none, pendingReviews: true, push: true }).nudge).toBe('pendingReviews');
    expect(decideHomeBanners({ ...none, push: true }).nudge).toBe('push');
  });

  it('차단성 배너가 유도 배너의 자리를 빼앗지 않는다 (둘은 별개 예산)', () => {
    const d = decideHomeBanners({ phoneVerify: true, recordConsent: true, pendingReviews: false, push: false });
    expect(d.showPhoneVerify).toBe(true);
    expect(d.nudge).toBe('recordConsent');
  });

  it('어떤 조합에서도 유도 배너는 MAX_NUDGES 를 넘지 않는다', () => {
    for (let mask = 0; mask < 16; mask += 1) {
      const a: HomeBannerAvailability = {
        phoneVerify: Boolean(mask & 1),
        recordConsent: Boolean(mask & 2),
        pendingReviews: Boolean(mask & 4),
        push: Boolean(mask & 8),
      };
      const d = decideHomeBanners(a);
      const shownCount = d.nudge === null ? 0 : 1;
      expect(shownCount).toBeLessThanOrEqual(MAX_NUDGES);
      // 보여준 것과 미룬 것을 합치면 조건이 맞는 유도 배너 전체와 같아야 한다 --
      // 어느 하나가 조용히 사라지면(=영영 안 뜨면) 여기서 잡힌다.
      const eligible = NUDGE_PRIORITY.filter((k) => a[k]);
      expect([...(d.nudge ? [d.nudge] : []), ...d.deferred]).toEqual(eligible);
    }
  });

  it('밀린 배너는 조건이 유지되면 다음 방문에 자리를 얻는다 (앞의 것이 해소된 뒤)', () => {
    // 기록 공개를 켜서 조건이 사라진 다음 방문.
    const after = decideHomeBanners({ ...none, recordConsent: false, pendingReviews: true, push: true });
    expect(after.nudge).toBe('pendingReviews');
  });
});
