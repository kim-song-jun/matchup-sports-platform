import { describe, expect, it } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { createV1AdCampaignFixture } from '@/test/msw/ads-fixtures';
import type { V1AdCampaignListItem, V1AdDailyStat } from '@/types/ads';
import {
  EMPTY_AD_FORM,
  adErrorMessage,
  adFormFromCampaign,
  buildSavePayload,
  channelSummary,
  formatCtr,
  formatKstDateTime,
  formatWindowRange,
  statsLine,
  todayStats,
  type AdFormState,
} from './ads-view-model';

function apiError(statusCode: number, code: string, details?: unknown, message = '서버 메시지') {
  return new V1ApiError({ status: 'error', statusCode, code, message, details, timestamp: '2026-11-08T00:00:00.000Z' });
}

const filledBanner = {
  imageUrl: '/uploads/ads/banner.webp',
  altText: '에버데이 신제품',
  linkUrl: '/tournaments/123',
  startAt: '2026-11-12T00:00',
  endAt: '2026-11-20T23:59',
};

function form(overrides: Partial<AdFormState> = {}): AdFormState {
  return { ...EMPTY_AD_FORM, advertiserName: '에버데이', title: '11월 협업', ...overrides };
}

describe('formatKstDateTime', () => {
  it('shows the instant on the KST calendar regardless of the browser time zone', () => {
    // 2026-11-11T15:00Z is already 2026-11-12 00:00 in Seoul.
    expect(formatKstDateTime('2026-11-11T15:00:00.000Z')).toBe('2026. 11. 12. 00:00');
    expect(formatKstDateTime(null)).toBe('—');
  });
});

describe('buildSavePayload', () => {
  it('sends only DTO fields and drops a channel whose fields are all empty', () => {
    const result = buildSavePayload(form({ banner: filledBanner }));
    expect(result).toEqual({
      payload: {
        advertiserName: '에버데이',
        title: '11월 협업',
        banner: {
          imageUrl: '/uploads/ads/banner.webp',
          altText: '에버데이 신제품',
          linkUrl: '/tournaments/123',
          startAt: '2026-11-11T15:00:00.000Z',
          endAt: '2026-11-20T14:59:00.000Z',
        },
        popup: null,
      },
    });
  });

  it('sends the popup headline and description and nulls the blank ones', () => {
    const result = buildSavePayload(form({
      popup: {
        ...filledBanner,
        imageUrl: '/uploads/ads/popup.webp',
        headline: '  11월 이벤트  ',
        description: '   ',
      },
    }));
    expect(result).toMatchObject({
      payload: {
        banner: null,
        popup: { headline: '11월 이벤트', description: null, imageUrl: '/uploads/ads/popup.webp' },
      },
    });
  });

  it('keeps a half-filled channel as a draft with the empty fields as null', () => {
    const result = buildSavePayload(form({ banner: { ...EMPTY_AD_FORM.banner, altText: '에버데이' } }));
    expect(result).toMatchObject({
      payload: {
        banner: { imageUrl: null, altText: '에버데이', linkUrl: null, startAt: null, endAt: null },
      },
    });
  });

  it.each([
    ['캠페인 이름', { title: '  ' }],
    ['광고주 표시 이름', { advertiserName: '' }],
  ])('refuses a blank %s', (label, overrides) => {
    const result = buildSavePayload(form(overrides));
    expect(result).toEqual({ error: expect.stringContaining(label) });
  });

  it('refuses a window that ends at or before it starts, naming the channel', () => {
    const result = buildSavePayload(form({ banner: { ...filledBanner, endAt: filledBanner.startAt } }));
    expect(result).toEqual({ error: '배너의 끝 시각은 시작 시각보다 늦어야 해요.' });
  });

  it.each([
    'javascript:alert(1)',
    'http://example.com',
    '//evil.example',
    'tournaments/1',
    '/admin/ops/push-send',
    'https://localhost/admin',
    'https://192.168.0.1/',
    'https://user:pw@example.com/',
  ])(
    'refuses the link %s that the server would refuse, naming the channel',
    (linkUrl) => {
      const result = buildSavePayload(form({ popup: { ...EMPTY_AD_FORM.popup, linkUrl } }));
      expect(result).toEqual({ error: expect.stringContaining('팝업 이동 링크를 쓸 수 없어요.') });
    },
  );

  it('says in the refusal which part of the link is wrong', () => {
    const result = buildSavePayload(form({ banner: { ...filledBanner, linkUrl: '  /admin/users  ' } }));
    expect(result).toEqual({ error: expect.stringContaining('/tournament-ops') });
  });

  it('refuses a time that does not exist instead of sending a guess', () => {
    const result = buildSavePayload(form({ banner: { ...filledBanner, startAt: '2026-13-40T00:00' } }));
    expect(result).toEqual({ error: '배너의 시작·끝 시각을 올바르게 입력해 주세요.' });
  });

  it('accepts an https link and an in-app path', () => {
    expect(buildSavePayload(form({ banner: { ...filledBanner, linkUrl: 'https://everyday.example.com/event' } })))
      .toHaveProperty('payload');
  });
});

describe('adFormFromCampaign', () => {
  it('turns stored UTC instants back into KST wall-clock inputs and a missing channel into empty fields', () => {
    const state = adFormFromCampaign(createV1AdCampaignFixture());
    expect(state.advertiserName).toBe('에버데이');
    expect(state.banner).toMatchObject({
      imageUrl: '/uploads/ads/banner.webp',
      startAt: '2026-11-12T00:00',
      endAt: '2026-11-20T00:00',
    });
    expect(state.popup).toEqual(EMPTY_AD_FORM.popup);
  });

  it('round-trips: loading a campaign and saving it unchanged sends the same window', () => {
    const campaign = createV1AdCampaignFixture();
    const result = buildSavePayload(adFormFromCampaign(campaign));
    expect(result).toMatchObject({
      payload: { banner: { startAt: '2026-11-11T15:00:00.000Z', endAt: '2026-11-19T15:00:00.000Z' } },
    });
  });
});

describe('formatCtr', () => {
  it('is not computable without impressions, even when clicks exist', () => {
    expect(formatCtr(0, 0)).toBe('계산 불가');
    expect(formatCtr(0, 3)).toBe('계산 불가');
  });

  it('is clicks over impressions times 100', () => {
    expect(formatCtr(150, 5)).toBe('3.33%');
    expect(formatCtr(1000, 0)).toBe('0%');
  });

  it('does not clamp a CTR above 100% — client-reported counts can exceed impressions', () => {
    expect(formatCtr(100, 120)).toBe('120%');
  });
});

describe('todayStats', () => {
  const daily: V1AdDailyStat[] = [
    { date: '2026-11-12', channel: 'banner', impressions: 100, clicks: 4 },
    { date: '2026-11-12', channel: 'popup', impressions: 20, clicks: 2 },
    { date: '2026-11-11', channel: 'banner', impressions: 50, clicks: 1 },
  ];

  it('picks only the given KST day and channel', () => {
    expect(todayStats(daily, 'banner', '2026-11-12')).toEqual({ impressions: 100, clicks: 4 });
    expect(todayStats(daily, 'popup', '2026-11-12')).toEqual({ impressions: 20, clicks: 2 });
  });

  it('is zero when nothing was counted today', () => {
    expect(todayStats(daily, 'popup', '2026-11-13')).toEqual({ impressions: 0, clicks: 0 });
  });
});

describe('adErrorMessage', () => {
  it('lists the missing fields per channel by their screen names', () => {
    const message = adErrorMessage(apiError(400, 'AD_CHANNEL_INCOMPLETE', [
      { code: 'AD_CHANNEL_INCOMPLETE', channel: 'banner', missing: ['imageUrl', 'altText'] },
      { code: 'AD_CHANNEL_INCOMPLETE', channel: 'popup', missing: ['headline', 'endAt'] },
    ]), '게시하지 못했어요.');
    expect(message).toContain('배너');
    expect(message).toContain('이미지, 대체 텍스트');
    expect(message).toContain('팝업');
    expect(message).toContain('제목, 끝 시각');
    expect(message).not.toContain('imageUrl');
  });

  it('names a field it does not know as 필수 항목 instead of dropping it or printing the raw key', () => {
    const message = adErrorMessage(apiError(400, 'AD_CHANNEL_INCOMPLETE', [
      { code: 'AD_CHANNEL_INCOMPLETE', channel: 'popup', missing: ['headline', 'callToAction', 42] },
    ]), '게시하지 못했어요.');
    expect(message).toBe('팝업에 채우지 않은 항목이 있어요. (제목, 필수 항목, 필수 항목)');
  });

  it('says which advertisement a window overlaps with', () => {
    const message = adErrorMessage(apiError(409, 'AD_CHANNEL_WINDOW_OVERLAP', {
      channel: 'popup',
      conflictingCampaignId: 'c-9',
      conflictingTitle: '가을 할인',
    }), '게시하지 못했어요.');
    expect(message).toContain('팝업');
    expect(message).toContain('가을 할인');
  });

  it('still explains an overlap when the response names no campaign', () => {
    const message = adErrorMessage(apiError(409, 'AD_CHANNEL_WINDOW_OVERLAP', { channel: 'banner' }), '게시하지 못했어요.');
    expect(message).toContain('배너');
    expect(message).not.toContain('undefined');
  });

  it('tells the owner to reload after a version conflict', () => {
    const message = adErrorMessage(apiError(409, 'AD_CAMPAIGN_VERSION_CONFLICT', { currentVersion: 4 }), '저장하지 못했어요.');
    expect(message).toContain('다른 운영자');
    expect(message).toContain('다시 불러');
  });

  it('explains an ended window and an empty campaign', () => {
    expect(adErrorMessage(apiError(400, 'AD_WINDOW_ENDED', [{ code: 'AD_WINDOW_ENDED', channel: 'banner' }]), 'x'))
      .toContain('배너');
    expect(adErrorMessage(apiError(400, 'AD_CHANNEL_REQUIRED', [{ code: 'AD_CHANNEL_REQUIRED' }]), 'x'))
      .toContain('배너나 팝업');
  });

  it('falls back to the server message, then to the given fallback', () => {
    expect(adErrorMessage(apiError(400, 'VALIDATION_ERROR', undefined, 'title must be shorter'), 'x'))
      .toBe('title must be shorter');
    expect(adErrorMessage(null, '저장하지 못했어요.')).toBe('저장하지 못했어요.');
  });
});

describe('list card summaries', () => {
  const popupCreative = {
    imageUrl: '/uploads/ads/popup.webp',
    altText: '팝업',
    linkUrl: '/matches',
    startAt: '2026-11-14T15:00:00.000Z',
    endAt: '2026-11-30T15:00:00.000Z',
    phase: null,
    headline: '이벤트',
    description: null,
  };
  const now = new Date('2026-11-08T00:00:00.000Z');

  it('spans the earliest start to the latest end across channels, on the KST calendar', () => {
    const campaign = createV1AdCampaignFixture({ popup: popupCreative });
    // banner 11. 12 (KST) ~ 11. 20, popup 11. 15 ~ 12. 1 → whole campaign 11. 12 ~ 12. 1
    expect(formatWindowRange(campaign, now)).toBe('11. 12 ~ 12. 1');
  });

  it('adds the year only when the window is not in the current KST year', () => {
    const campaign = createV1AdCampaignFixture();
    expect(formatWindowRange(campaign, new Date('2027-01-05T00:00:00.000Z'))).toBe('2026. 11. 12 ~ 11. 20');
  });

  it('says the window is not set when no channel has both ends', () => {
    expect(formatWindowRange(createV1AdCampaignFixture({ banner: null }), now)).toBe('기간 미정');
  });

  it('names each channel with its phase once published, and plainly while a draft', () => {
    const draft = createV1AdCampaignFixture({ popup: popupCreative });
    expect(channelSummary(draft)).toBe('배너 + 팝업');
    const live = createV1AdCampaignFixture({
      status: 'published',
      banner: { ...createV1AdCampaignFixture().banner!, phase: 'live' },
      popup: { ...popupCreative, phase: 'scheduled' },
    });
    expect(channelSummary(live)).toBe('배너 노출 중 + 팝업 예약');
    expect(channelSummary(createV1AdCampaignFixture({ banner: null }))).toBe('소재 대기');
  });

  it('shows cumulative counters per configured channel, and nothing to count before publishing', () => {
    const base = createV1AdCampaignFixture({ status: 'published', popup: popupCreative });
    const item: V1AdCampaignListItem = {
      ...base,
      stats: { banner: { impressions: 1240, clicks: 38 }, popup: { impressions: 20, clicks: 2 } },
    };
    expect(statsLine(item)).toBe('누적 · 배너 노출 1,240 · 클릭 38 / 팝업 노출 20 · 클릭 2');
    expect(statsLine({ ...item, status: 'draft' })).toBe('게시 전이라 집계가 없어요');
  });
});
