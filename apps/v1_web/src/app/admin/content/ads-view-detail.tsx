'use client';

import { useId, useState } from 'react';
import { ExternalLink, Pencil, Power, Rocket } from 'lucide-react';
import { AdminEmpty, AdminStatusPill, AdminTableSkeleton } from '@/components/admin';
import {
  adCampaignStatusLabel,
  adChannelLabel,
  adChannelPhaseLabel,
  adChannelPhasePillKey,
} from '@/lib/admin-labels';
import { resolveAdLink } from '@/lib/ad-link';
import { toKstDateString } from '@/lib/kst-calendar';
import type {
  V1AdCampaign,
  V1AdCampaignDetail,
  V1AdChannel,
  V1AdChannelCreative,
  V1AdPopupCreative,
} from '@/types/ads';
import { AdCreativePreview } from './ads-view-creative';
import { AdStatsPanel } from './ads-view-stats';
import { configuredChannels, formatKstDateTime } from './ads-view-model';

const NOT_SET = '아직 입력하지 않았어요';

const ACTION_CLASS =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-[length:var(--font-size-body-sm)] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500';

function CreativeSection({ channel, creative }: { channel: V1AdChannel; creative: V1AdChannelCreative | V1AdPopupCreative }) {
  const name = adChannelLabel(channel);
  const link = resolveAdLink(creative.linkUrl);
  const popup = 'headline' in creative ? creative : null;
  const period = creative.startAt && creative.endAt
    ? `${formatKstDateTime(creative.startAt)} ~ ${formatKstDateTime(creative.endAt)}`
    : NOT_SET;

  return (
    <section aria-label={`${name} 소재`} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[length:var(--font-size-body-sm)] font-bold text-[var(--text-strong)]">{name} 소재</h3>
        {creative.phase ? (
          <AdminStatusPill status={adChannelPhasePillKey(creative.phase)} label={adChannelPhaseLabel(creative.phase)} />
        ) : null}
      </div>
      {creative.imageUrl ? (
        <AdCreativePreview
          channel={channel}
          imageUrl={creative.imageUrl}
          altText={creative.altText}
          className={channel === 'popup' ? 'max-w-[240px]' : ''}
        />
      ) : (
        <p className="tm-on-tint rounded-xl bg-[var(--surface-soft)] px-3 py-6 text-center text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">이미지가 아직 없어요.</p>
      )}
      <dl className="tm-on-tint grid grid-cols-1 gap-3 rounded-xl bg-[var(--surface-soft)] p-3 text-[length:var(--font-size-body-sm)]">
        {popup ? (
          <div>
            <dt className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">팝업 문구</dt>
            <dd className="mt-1 text-[var(--text-body)]">
              <span className="font-semibold">{popup.headline ?? NOT_SET}</span>
              {popup.description ? <span className="mt-0.5 block text-[var(--text-muted)]">{popup.description}</span> : null}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">노출 기간 (한국 시간)</dt>
          <dd className="mt-1 text-[var(--text-body)]">{period}</dd>
        </div>
        <div>
          <dt className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">이동 링크</dt>
          <dd className="mt-1 break-all text-[var(--text-body)]">
            {creative.linkUrl ?? NOT_SET}
            {link ? (
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 flex min-h-[44px] w-fit items-center gap-1.5 text-[length:var(--font-size-label)] font-semibold text-[var(--blue700)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              >
                <ExternalLink size={14} aria-hidden="true" />
                새 탭에서 링크 열어 보기
              </a>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">대체 텍스트</dt>
          <dd className="mt-1 text-[var(--text-body)]">{creative.altText ?? NOT_SET}</dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * Right-hand panel in view mode: what the campaign is, how each channel looks, and how it performed.
 * `campaign` can come from the list row while `detail` (stats, daily rows) is still loading.
 */
export function AdDetail({
  campaign,
  detail,
  loading,
  statsError,
  canWrite,
  busy,
  onEdit,
  onPublish,
  onStop,
}: {
  campaign: V1AdCampaign | null;
  detail: V1AdCampaignDetail | undefined;
  loading: boolean;
  statsError?: string;
  canWrite: boolean;
  busy: boolean;
  onEdit: () => void;
  onPublish: () => void;
  onStop: () => void;
}) {
  const [showDaily, setShowDaily] = useState(false);
  const dailyId = useId();

  if (!campaign) {
    if (loading) return <AdminTableSkeleton rows={4} />;
    return <AdminEmpty title="광고를 선택해 주세요" description="목록의 조회 버튼을 누르면 소재와 성과를 확인할 수 있어요." />;
  }

  const channels = configuredChannels(campaign);
  const today = toKstDateString(new Date());

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[length:var(--font-size-caption)] font-semibold text-[var(--blue700)]">광고 상세</p>
          <h2 className="mt-1 break-words text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">{campaign.title}</h2>
          <p className="mt-0.5 text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">광고주 {campaign.advertiserName}</p>
        </div>
        <AdminStatusPill status={campaign.status} label={adCampaignStatusLabel(campaign.status)} />
      </div>

      {channels.length === 0 ? (
        <p className="tm-on-tint rounded-xl bg-[var(--surface-soft)] px-3 py-6 text-center text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">
          배너·팝업 소재가 아직 없어요. 수정에서 채워 주세요.
        </p>
      ) : (
        channels.map(([channel, creative]) => <CreativeSection key={channel} channel={channel} creative={creative} />)
      )}

      <AdStatsPanel
        channels={channels.map(([channel]) => channel)}
        detail={detail}
        today={today}
        loading={loading}
        error={statsError}
        showDaily={showDaily}
        dailyId={dailyId}
      />

      <div className="flex flex-wrap gap-2">
        {canWrite ? (
          <button type="button" onClick={onEdit} disabled={busy} className={`${ACTION_CLASS} bg-blue-500 text-white hover:bg-blue-600`}>
            <Pencil size={16} aria-hidden="true" /> 수정하기
          </button>
        ) : null}
        {canWrite && campaign.status === 'published' ? (
          <button type="button" onClick={onStop} disabled={busy} className={`${ACTION_CLASS} border border-[var(--tint-red-border)] bg-[var(--card-surface)] text-[var(--red700)] hover:bg-[var(--tint-red)]`}>
            <Power size={16} aria-hidden="true" /> 중단
          </button>
        ) : null}
        {canWrite && campaign.status !== 'published' ? (
          <button type="button" onClick={onPublish} disabled={busy} className={`${ACTION_CLASS} border border-[var(--border)] bg-[var(--card-surface)] text-[var(--text-body)] hover:border-blue-300 hover:text-[var(--blue700)]`}>
            <Rocket size={16} aria-hidden="true" /> 게시
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setShowDaily((open) => !open)}
          aria-expanded={showDaily}
          aria-controls={dailyId}
          className={`${ACTION_CLASS} border border-[var(--border)] bg-[var(--card-surface)] text-[var(--text-body)] hover:border-blue-300 hover:text-[var(--blue700)]`}
        >
          일별 표 {showDaily ? '닫기' : '보기'}
        </button>
      </div>
    </div>
  );
}
