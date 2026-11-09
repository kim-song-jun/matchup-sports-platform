import { describe, expect, it } from 'vitest';
import { adminActionLabel, adminTargetTypeLabel } from './admin-labels';

describe('audit labels for ad campaigns', () => {
  it.each([
    ['ad_campaign.create', '광고 초안 생성'],
    ['ad_campaign.update', '광고 수정'],
    ['ad_campaign.publish', '광고 게시'],
    ['ad_campaign.stop', '광고 중단'],
  ])('names the action %s for the operator', (action, label) => {
    expect(adminActionLabel(action)).toBe(label);
  });

  it('names the target type, and still shows an unknown code as it is', () => {
    expect(adminTargetTypeLabel('ad_campaign')).toBe('광고 캠페인');
    expect(adminActionLabel('ad_campaign.archive')).toBe('ad_campaign.archive');
  });
});
