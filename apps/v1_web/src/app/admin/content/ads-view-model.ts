import { adChannelLabel, adChannelPhaseLabel, adPublishFieldLabel, isAdPublishMissingField } from '@/lib/admin-labels';
import { extractErrorCode, extractErrorDetails, extractErrorMessage } from '@/lib/error-message';
import { isoToKstDatetimeLocal, kstDatetimeLocalToIso, toKstDateString } from '@/lib/kst-calendar';
import type {
  V1AdCampaign,
  V1AdCampaignListItem,
  V1AdChannel,
  V1AdChannelCreative,
  V1AdChannelCreativeInput,
  V1AdChannelTotals,
  V1AdDailyStat,
  V1AdPopupCreative,
  V1AdPopupCreativeInput,
  V1SaveAdCampaignPayload,
} from '@/types/ads';
import { checkAdLink } from '@/lib/ad-link-rule';

/** Limits mirror `apps/v1_api/src/ads/dto/ad-campaign.dto.ts`; a longer value is a 400 on save. */
export const AD_TITLE_MAX_LENGTH = 120;
export const AD_ADVERTISER_MAX_LENGTH = 60;
export const AD_ALT_TEXT_MAX_LENGTH = 120;
export const AD_POPUP_HEADLINE_MAX_LENGTH = 40;
export const AD_POPUP_DESCRIPTION_MAX_LENGTH = 80;

export const CTR_NOT_COMPUTABLE = '계산 불가';

/** Every input is a string so a half-typed form never needs a second representation. Times are KST `datetime-local` values. */
export type AdChannelFormState = {
  imageUrl: string;
  altText: string;
  linkUrl: string;
  startAt: string;
  endAt: string;
};

export type AdPopupFormState = AdChannelFormState & {
  headline: string;
  description: string;
};

export type AdFormState = {
  advertiserName: string;
  title: string;
  banner: AdChannelFormState;
  popup: AdPopupFormState;
};

const EMPTY_CHANNEL: AdChannelFormState = { imageUrl: '', altText: '', linkUrl: '', startAt: '', endAt: '' };

export const EMPTY_AD_FORM: AdFormState = {
  advertiserName: '',
  title: '',
  banner: EMPTY_CHANNEL,
  popup: { ...EMPTY_CHANNEL, headline: '', description: '' },
};

function channelFormFromCreative(creative: V1AdChannelCreative | null): AdChannelFormState {
  if (!creative) return EMPTY_CHANNEL;
  return {
    imageUrl: creative.imageUrl ?? '',
    altText: creative.altText ?? '',
    linkUrl: creative.linkUrl ?? '',
    startAt: isoToKstDatetimeLocal(creative.startAt),
    endAt: isoToKstDatetimeLocal(creative.endAt),
  };
}

export function adFormFromCampaign(campaign: V1AdCampaign): AdFormState {
  return {
    advertiserName: campaign.advertiserName,
    title: campaign.title,
    banner: channelFormFromCreative(campaign.banner),
    popup: {
      ...channelFormFromCreative(campaign.popup),
      headline: campaign.popup?.headline ?? '',
      description: campaign.popup?.description ?? '',
    },
  };
}

/** `2026. 11. 12. 00:00` on the KST calendar. */
export function formatKstDateTime(iso: string | null | undefined): string {
  const local = isoToKstDatetimeLocal(iso);
  if (!local) return '—';
  const [date, time] = local.split('T');
  const [year, month, day] = date.split('-');
  return `${year}. ${Number(month)}. ${Number(day)}. ${time}`;
}

const trimmedOrNull = (value: string) => value.trim() || null;

const isBlank = (state: AdChannelFormState | AdPopupFormState) =>
  Object.values(state).every((value) => value.trim() === '');

type ChannelResult<T> = { value: T | null } | { error: string };

function buildChannel(
  channel: V1AdChannel,
  state: AdChannelFormState,
): ChannelResult<V1AdChannelCreativeInput> {
  const name = adChannelLabel(channel);
  const linkUrl = state.linkUrl.trim();
  const linkCheck = linkUrl ? checkAdLink(linkUrl) : null;
  if (linkCheck && !linkCheck.ok) {
    return { error: `${name} 이동 링크를 쓸 수 없어요. ${linkCheck.reason}` };
  }
  // The server wants an explicit offset; the browser's own time zone must never decide which instant the owner meant.
  const startAt = kstDatetimeLocalToIso(state.startAt);
  const endAt = kstDatetimeLocalToIso(state.endAt);
  if ((state.startAt && !startAt) || (state.endAt && !endAt)) {
    return { error: `${name}의 시작·끝 시각을 올바르게 입력해 주세요.` };
  }
  if (startAt && endAt && Date.parse(endAt) <= Date.parse(startAt)) {
    return { error: `${name}의 끝 시각은 시작 시각보다 늦어야 해요.` };
  }
  return {
    value: {
      imageUrl: trimmedOrNull(state.imageUrl),
      altText: trimmedOrNull(state.altText),
      linkUrl: linkUrl || null,
      startAt,
      endAt,
    },
  };
}

/**
 * Builds the save body from DTO fields only (`forbidNonWhitelisted` rejects anything else). A channel with every
 * field empty is sent as `null`, which removes it; PUT replaces all editable fields.
 */
export function buildSavePayload(form: AdFormState): { payload: V1SaveAdCampaignPayload } | { error: string } {
  const advertiserName = form.advertiserName.trim();
  const title = form.title.trim();
  if (!title) return { error: '캠페인 이름을 입력해 주세요.' };
  if (!advertiserName) return { error: '광고주 표시 이름을 입력해 주세요.' };

  let banner: V1AdChannelCreativeInput | null = null;
  if (!isBlank(form.banner)) {
    const result = buildChannel('banner', form.banner);
    if ('error' in result) return result;
    banner = result.value;
  }

  let popup: V1AdPopupCreativeInput | null = null;
  if (!isBlank(form.popup)) {
    const result = buildChannel('popup', form.popup);
    if ('error' in result) return result;
    popup = {
      ...result.value,
      headline: trimmedOrNull(form.popup.headline),
      description: trimmedOrNull(form.popup.description),
    };
  }

  return { payload: { advertiserName, title, banner, popup } };
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('ko-KR').format(value);
}

/** Clicks over impressions times 100. Not clamped: counts are client-reported, so a rate above 100% is shown as it is. */
export function formatCtr(impressions: number, clicks: number): string {
  if (impressions <= 0) return CTR_NOT_COMPUTABLE;
  const rate = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format((clicks / impressions) * 100);
  return `${rate}%`;
}

/** One channel's counters for a single KST calendar day (`YYYY-MM-DD`). */
export function todayStats(daily: V1AdDailyStat[], channel: V1AdChannel, today: string): V1AdChannelTotals {
  return daily
    .filter((row) => row.channel === channel && row.date === today)
    .reduce((sum, row) => ({
      impressions: sum.impressions + row.impressions,
      clicks: sum.clicks + row.clicks,
    }), { impressions: 0, clicks: 0 });
}

function isChannel(value: unknown): value is V1AdChannel {
  return value === 'banner' || value === 'popup';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function incompleteMessage(details: unknown): string | null {
  if (!Array.isArray(details)) return null;
  const lines: string[] = [];
  for (const entry of details) {
    const record = asRecord(entry);
    if (record?.code !== 'AD_CHANNEL_INCOMPLETE' || !isChannel(record.channel) || !Array.isArray(record.missing)) continue;
    // A field name this screen does not know still gets a line item rather than being dropped.
    const fields = record.missing.map((field) => (isAdPublishMissingField(field) ? adPublishFieldLabel(field) : '필수 항목')).join(', ');
    lines.push(`${adChannelLabel(record.channel)}에 채우지 않은 항목이 있어요. (${fields})`);
  }
  return lines.length > 0 ? lines.join(' ') : null;
}

function firstChannel(details: unknown): V1AdChannel | null {
  const record = Array.isArray(details) ? asRecord(details[0]) : asRecord(details);
  return isChannel(record?.channel) ? record.channel : null;
}

/** Turns the ad API's refusal codes into the next step the owner can take; anything else keeps the server message. */
export function adErrorMessage(error: unknown, fallback: string): string {
  const code = extractErrorCode(error);
  const details = extractErrorDetails(error);
  const channel = firstChannel(details);
  const name = channel ? adChannelLabel(channel) : '광고';

  switch (code) {
    case 'AD_CHANNEL_INCOMPLETE':
      return incompleteMessage(details) ?? '게시하려면 채우지 않은 항목을 먼저 채워 주세요.';
    case 'AD_CHANNEL_REQUIRED':
      return '배너나 팝업 중 하나는 채워야 게시할 수 있어요.';
    case 'AD_WINDOW_ENDED':
      return `${name}의 끝 시각이 이미 지났어요. 끝 시각을 앞으로 바꿔 주세요.`;
    case 'AD_INVALID_WINDOW':
      return `${name}의 끝 시각은 시작 시각보다 늦어야 해요.`;
    case 'AD_CHANNEL_WINDOW_OVERLAP': {
      const conflicting = asRecord(details)?.conflictingTitle;
      const who = typeof conflicting === 'string' && conflicting ? `게시 중인 ‘${conflicting}’ 광고와` : '게시 중인 다른 광고와';
      return `${name} 기간이 ${who} 겹쳐요. 기간을 바꾸거나 그 광고를 먼저 중단해 주세요.`;
    }
    case 'AD_CAMPAIGN_VERSION_CONFLICT':
      return '다른 운영자가 먼저 저장했어요. 최신 내용을 다시 불러온 뒤 한 번 더 시도해 주세요.';
    case 'AD_CAMPAIGN_INVALID_STATE':
      return '이미 상태가 바뀐 광고예요. 목록을 새로 불러와 확인해 주세요.';
    case 'AD_CAMPAIGN_NOT_FOUND':
      return '광고를 찾을 수 없어요. 목록을 새로 불러와 확인해 주세요.';
    case 'CONTENT_ASSET_NOT_FOUND':
    case 'CONTENT_ASSET_UNAVAILABLE':
      return '이미지를 쓸 수 없어요. 다른 곳에 쓰인 이미지이거나 찾을 수 없으니 다시 올려 주세요.';
    case 'PERMISSION_DENIED':
      return '광고는 owner 운영자만 관리할 수 있어요.';
    default:
      return extractErrorMessage(error, fallback);
  }
}

/** The channels a campaign actually has, banner first. */
export function configuredChannels(campaign: V1AdCampaign): Array<[V1AdChannel, V1AdChannelCreative | V1AdPopupCreative]> {
  const channels: Array<[V1AdChannel, V1AdChannelCreative | V1AdPopupCreative]> = [];
  if (campaign.banner) channels.push(['banner', campaign.banner]);
  if (campaign.popup) channels.push(['popup', campaign.popup]);
  return channels;
}

function monthDay(date: string, withYear: boolean): string {
  const [year, month, day] = date.split('-');
  return `${withYear ? `${year}. ` : ''}${Number(month)}. ${Number(day)}`;
}

/** Earliest start to latest end across the channels, as KST calendar dates (`11. 12 ~ 12. 1`). The year shows only when it differs. */
export function formatWindowRange(campaign: V1AdCampaign, now: Date = new Date()): string {
  const starts: number[] = [];
  const ends: number[] = [];
  for (const [, creative] of configuredChannels(campaign)) {
    if (!creative.startAt || !creative.endAt) continue;
    starts.push(Date.parse(creative.startAt));
    ends.push(Date.parse(creative.endAt));
  }
  if (starts.length === 0) return '기간 미정';
  const first = toKstDateString(new Date(Math.min(...starts)));
  const last = toKstDateString(new Date(Math.max(...ends)));
  const startYear = first.slice(0, 4);
  return `${monthDay(first, startYear !== toKstDateString(now).slice(0, 4))} ~ ${monthDay(last, last.slice(0, 4) !== startYear)}`;
}

/** `배너 노출 중 + 팝업 예약` once published, `배너 + 팝업` while the phase is not derived. */
export function channelSummary(campaign: V1AdCampaign): string {
  const parts = configuredChannels(campaign).map(([channel, creative]) =>
    creative.phase ? `${adChannelLabel(channel)} ${adChannelPhaseLabel(creative.phase)}` : adChannelLabel(channel));
  return parts.length > 0 ? parts.join(' + ') : '소재 대기';
}

/** The list endpoint returns cumulative counters only; today's numbers live in the detail response. */
export function statsLine(item: V1AdCampaignListItem): string {
  if (item.status === 'draft') return '게시 전이라 집계가 없어요';
  const parts = configuredChannels(item).map(([channel]) => {
    const totals = item.stats[channel];
    return `${adChannelLabel(channel)} 노출 ${formatCount(totals.impressions)} · 클릭 ${formatCount(totals.clicks)}`;
  });
  return parts.length > 0 ? `누적 · ${parts.join(' / ')}` : '집계할 소재가 없어요';
}
