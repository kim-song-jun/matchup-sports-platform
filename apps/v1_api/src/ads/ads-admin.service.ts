import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { V1AuthUser } from '../auth/v1-auth-user';
import { AdminContextService, type V1ActiveAdmin } from '../common/admin-context.service';
import { buildPageInfo, paginationArgs } from '../common/pagination/page-args';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import {
  AD_CHANNELS,
  allChannelColumns,
  channelPhase,
  channelsFromRow,
  findPublishProblems,
  hasAnyChannelField,
  imageUrlsOf,
  overlapWhere,
  type AdChannel,
  type AdChannelFields,
  type AdChannels,
  type AdPublishProblem,
} from './ad-campaign';
import type {
  AdChannelCreativeDto,
  AdPopupCreativeDto,
  AdminAdCampaignListQueryDto,
  PublishAdCampaignDto,
  SaveAdCampaignDto,
  UpdateAdCampaignDto,
} from './dto/ad-campaign.dto';

const CAMPAIGN_INCLUDE = {
  createdByAdminUser: {
    select: { id: true, user: { select: { profile: { select: { nickname: true, displayName: true } } } } },
  },
} satisfies Prisma.V1AdCampaignInclude;

type CampaignRow = Prisma.V1AdCampaignGetPayload<{ include: typeof CAMPAIGN_INCLUDE }>;
type Tx = Prisma.TransactionClient;

const AD_STATUSES = ['draft', 'published', 'stopped'] as const;
const CHANNEL_LABEL: Record<AdChannel, string> = { banner: '배너', popup: '팝업' };
const FIELD_LABEL = { imageUrl: '이미지', altText: '대체 텍스트', headline: '제목', linkUrl: '링크', startAt: '시작 시각', endAt: '종료 시각' } as const;
/** All ad publishes and edits of published campaigns serialise on this lock so the overlap check cannot race. */
const PUBLISH_LOCK_KEY = 'ad-campaign-publish';

type Phase = ReturnType<typeof channelPhase>;
type BannerView = Omit<AdChannelFields, 'headline' | 'description'> & { phase: Phase };
type PopupView = AdChannelFields & { phase: Phase };
type ChannelTotals = { impressions: number; clicks: number };

@Injectable()
export class AdsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
    private readonly uploads: UploadsService,
    @InjectPinoLogger(AdsAdminService.name) private readonly logger: PinoLogger,
  ) {}

  async list(user: V1AuthUser, query: AdminAdCampaignListQueryDto) {
    await this.adminContext.getActiveAdmin(user.id);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const searchWhere: Prisma.V1AdCampaignWhereInput = query.q
      ? {
          OR: [
            { advertiserName: { contains: query.q, mode: 'insensitive' } },
            { title: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {};

    const [rows, statusGroups] = await Promise.all([
      this.prisma.v1AdCampaign.findMany({
        where: { ...(query.status ? { status: query.status } : {}), ...searchWhere },
        include: CAMPAIGN_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...paginationArgs(query, limit),
      }),
      this.prisma.v1AdCampaign.groupBy({ by: ['status'], where: searchWhere, _count: { _all: true } }),
    ]);

    const pageRows = rows.slice(0, limit);
    const hasNext = rows.length > limit;
    const byStatus = Object.fromEntries(AD_STATUSES.map((status) => [status, 0])) as Record<(typeof AD_STATUSES)[number], number>;
    for (const group of statusGroups) byStatus[group.status] = group._count._all;
    const total = AD_STATUSES.reduce((sum, status) => sum + byStatus[status], 0);

    const totals = await this.totalsFor(pageRows.map((row) => row.id));
    const now = new Date();
    return {
      items: pageRows.map((row) => ({ ...this.toView(row, now), stats: totals.get(row.id) ?? emptyTotals() })),
      pageInfo: buildPageInfo({
        page: query.page,
        limit,
        total: query.status ? byStatus[query.status] : total,
        hasNext,
        nextCursor: hasNext ? pageRows.at(-1)?.id ?? null : null,
      }),
      summary: { total, byStatus },
    };
  }

  async detail(user: V1AuthUser, id: string) {
    await this.adminContext.getActiveAdmin(user.id);
    const row = await this.prisma.v1AdCampaign.findUnique({ where: { id }, include: CAMPAIGN_INCLUDE });
    if (!row) throw notFound();

    const daily = await this.prisma.v1AdCampaignDailyStat.findMany({
      where: { campaignId: id },
      orderBy: [{ statDate: 'desc' }, { channel: 'asc' }],
    });
    const totals = emptyTotals();
    let updatedAt: Date | null = null;
    for (const stat of daily) {
      totals[stat.channel].impressions += stat.impressions;
      totals[stat.channel].clicks += stat.clicks;
      if (!updatedAt || stat.updatedAt > updatedAt) updatedAt = stat.updatedAt;
    }
    return {
      campaign: this.toView(row, new Date()),
      stats: {
        ...totals,
        daily: daily.map((stat) => ({
          date: stat.statDate.toISOString().slice(0, 10),
          channel: stat.channel,
          impressions: stat.impressions,
          clicks: stat.clicks,
        })),
        updatedAt,
      },
    };
  }

  async create(user: V1AuthUser, dto: SaveAdCampaignDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const channels = this.readChannels(dto);
    const now = new Date();

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.v1AdCampaign.create({
        data: {
          advertiserName: dto.advertiserName,
          title: dto.title,
          status: 'draft',
          ...allChannelColumns(channels),
          createdByAdminUserId: admin.id,
          updatedByAdminUserId: admin.id,
        },
        include: CAMPAIGN_INCLUDE,
      });
      await this.syncCampaignAssets(tx, admin.id, created.id, imageUrlsOf(channels));
      await this.adminContext.logAdminAction(
        admin,
        { action: 'ad_campaign.create', targetType: 'ad_campaign', targetId: created.id, afterJson: auditSnapshot(created), toStatus: 'draft' },
        tx,
      );
      return created;
    });
    return { campaign: this.toView(row, now) };
  }

  async update(user: V1AuthUser, id: string, dto: UpdateAdCampaignDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const channels = this.readChannels(dto);
    const now = new Date();

    const { row, removedUrls } = await this.prisma.$transaction(async (tx) => {
      await this.lockPublishing(tx);
      const existing = await this.loadCampaign(tx, id);
      assertVersion(existing, dto.expectedVersion);
      if (existing.status === 'published') {
        this.assertPublishable(channels, now, false);
        await this.assertNoOverlap(tx, id, channels);
      }
      const saved = await tx.v1AdCampaign.updateMany({
        where: { id, version: existing.version },
        data: {
          advertiserName: dto.advertiserName,
          title: dto.title,
          ...allChannelColumns(channels),
          version: { increment: 1 },
          updatedByAdminUserId: admin.id,
        },
      });
      if (saved.count !== 1) throw versionConflict(existing.version);
      const removed = await this.syncCampaignAssets(tx, admin.id, id, imageUrlsOf(channels));
      const updated = await tx.v1AdCampaign.findUniqueOrThrow({ where: { id }, include: CAMPAIGN_INCLUDE });
      await this.adminContext.logAdminAction(
        admin,
        { action: 'ad_campaign.update', targetType: 'ad_campaign', targetId: id, beforeJson: auditSnapshot(existing), afterJson: auditSnapshot(updated) },
        tx,
      );
      return { row: updated, removedUrls: removed };
    });

    await this.removeFiles(removedUrls);
    return { campaign: this.toView(row, now) };
  }

  async publish(user: V1AuthUser, id: string, dto: PublishAdCampaignDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const now = new Date();

    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockPublishing(tx);
      const existing = await this.loadCampaign(tx, id);
      assertVersion(existing, dto.expectedVersion);
      if (existing.status === 'published') throw invalidState('이미 게시된 광고예요.');
      const channels = channelsFromRow(existing);
      this.assertPublishable(channels, now, true);
      await this.assertNoOverlap(tx, id, channels);

      const published = await tx.v1AdCampaign.updateMany({
        where: { id, version: existing.version },
        data: { status: 'published', publishedAt: now, stoppedAt: null, version: { increment: 1 }, updatedByAdminUserId: admin.id },
      });
      if (published.count !== 1) throw versionConflict(existing.version);
      return this.recordTransition(tx, admin, existing, 'ad_campaign.publish', 'published');
    });
    return { campaign: this.toView(row, now) };
  }

  async stop(user: V1AuthUser, id: string) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const now = new Date();

    const row = await this.prisma.$transaction(async (tx) => {
      // Same lock as publish: a publish that starts after this stop must see the campaign as stopped, not as a stale overlap.
      await this.lockPublishing(tx);
      const existing = await this.loadCampaign(tx, id);
      if (existing.status !== 'published') throw invalidState('게시 중인 광고만 중단할 수 있어요.');
      const stopped = await tx.v1AdCampaign.updateMany({
        where: { id, status: 'published' },
        data: { status: 'stopped', stoppedAt: now, version: { increment: 1 }, updatedByAdminUserId: admin.id },
      });
      if (stopped.count !== 1) throw invalidState('게시 중인 광고만 중단할 수 있어요.');
      return this.recordTransition(tx, admin, existing, 'ad_campaign.stop', 'stopped');
    });
    return { campaign: this.toView(row, now) };
  }

  private async recordTransition(tx: Tx, admin: V1ActiveAdmin, before: CampaignRow, action: string, toStatus: 'published' | 'stopped') {
    const after = await tx.v1AdCampaign.findUniqueOrThrow({ where: { id: before.id }, include: CAMPAIGN_INCLUDE });
    await this.adminContext.logAdminAction(
      admin,
      {
        action,
        targetType: 'ad_campaign',
        targetId: before.id,
        beforeJson: auditSnapshot(before),
        afterJson: auditSnapshot(after),
        fromStatus: before.status,
        toStatus,
      },
      tx,
    );
    return after;
  }

  private readChannels(dto: SaveAdCampaignDto): AdChannels {
    return { banner: readChannel('banner', dto.banner), popup: readChannel('popup', dto.popup) };
  }

  private assertPublishable(channels: AdChannels, now: Date, requireFutureEnd: boolean) {
    const problems = findPublishProblems(channels, now, requireFutureEnd);
    if (problems.length > 0) {
      throw new BadRequestException({ code: problems[0].code, message: problemMessage(problems[0]), details: problems });
    }
  }

  private async assertNoOverlap(tx: Tx, campaignId: string, channels: AdChannels) {
    for (const channel of AD_CHANNELS) {
      const fields = channels[channel];
      if (!fields?.startAt || !fields.endAt) continue;
      const conflict = await tx.v1AdCampaign.findFirst({
        where: overlapWhere(channel, { startAt: fields.startAt, endAt: fields.endAt }, campaignId),
        orderBy: [{ id: 'asc' }],
        select: { id: true, title: true },
      });
      if (conflict) {
        throw new ConflictException({
          code: 'AD_CHANNEL_WINDOW_OVERLAP',
          message: `같은 시간에 게시 중인 ${CHANNEL_LABEL[channel]} 광고가 있어요. 기간을 조정하거나 기존 광고를 중단해 주세요.`,
          details: { channel, conflictingCampaignId: conflict.id, conflictingTitle: conflict.title },
        });
      }
    }
  }

  private async lockPublishing(tx: Tx) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${PUBLISH_LOCK_KEY}, 0))`;
  }

  private async loadCampaign(tx: Tx, id: string): Promise<CampaignRow> {
    const row = await tx.v1AdCampaign.findUnique({ where: { id }, include: CAMPAIGN_INCLUDE });
    if (!row) throw notFound();
    return row;
  }

  /**
   * Attaches the images the campaign now references and releases the ones it no longer does. An image
   * must come from `POST /admin/content-assets`: a temporary asset this admin uploaded, or one already
   * attached to this campaign. The existing single-owner CHECK only covers notice/popup, so exclusivity
   * with those owners is enforced here. Returns the urls whose files must be deleted after commit.
   */
  private async syncCampaignAssets(tx: Tx, adminUserId: string, campaignId: string, urls: string[]): Promise<string[]> {
    const referenced = urls.length > 0 ? await tx.v1ContentAsset.findMany({ where: { url: { in: urls } } }) : [];
    if (referenced.length !== urls.length) {
      throw new BadRequestException({ code: 'CONTENT_ASSET_NOT_FOUND', message: '업로드하지 않은 이미지가 있어요. 이미지를 다시 올려 주세요.' });
    }
    for (const asset of referenced) {
      const ownedByCampaign = asset.adCampaignId === campaignId;
      const availableTemporary =
        asset.status === 'temporary' && !asset.noticeId && !asset.popupId && !asset.adCampaignId && asset.uploadedByAdminUserId === adminUserId;
      if (!ownedByCampaign && !availableTemporary) {
        throw new BadRequestException({ code: 'CONTENT_ASSET_UNAVAILABLE', message: '다른 곳에서 쓰는 이미지이거나 다른 운영자가 올린 이미지는 쓸 수 없어요.' });
      }
    }

    const newlyAttached = referenced.filter((asset) => asset.adCampaignId !== campaignId);
    if (newlyAttached.length > 0) {
      const attached = await tx.v1ContentAsset.updateMany({
        where: { id: { in: newlyAttached.map((asset) => asset.id) }, status: 'temporary', adCampaignId: null, noticeId: null, popupId: null },
        data: { status: 'attached', adCampaignId: campaignId, attachedAt: new Date() },
      });
      if (attached.count !== newlyAttached.length) {
        throw new BadRequestException({ code: 'CONTENT_ASSET_UNAVAILABLE', message: '이미지 상태가 바뀌었어요. 이미지를 다시 올린 뒤 저장해 주세요.' });
      }
    }

    const ownedNow = await tx.v1ContentAsset.findMany({ where: { adCampaignId: campaignId } });
    const released = ownedNow.filter((asset) => !urls.includes(asset.url));
    if (released.length > 0) {
      await tx.v1ContentAsset.deleteMany({ where: { id: { in: released.map((asset) => asset.id) } } });
    }
    return released.map((asset) => asset.url);
  }

  private async removeFiles(urls: string[]) {
    const results = await Promise.allSettled(urls.map((url) => this.uploads.removeStoredUrl(url)));
    results.forEach((result, index) => {
      if (result.status === 'rejected') this.logger.error({ url: urls[index], err: result.reason }, '광고 이미지 파일 정리 실패');
    });
  }

  private async totalsFor(campaignIds: string[]): Promise<Map<string, Record<AdChannel, ChannelTotals>>> {
    const result = new Map<string, Record<AdChannel, ChannelTotals>>();
    if (campaignIds.length === 0) return result;
    const groups = await this.prisma.v1AdCampaignDailyStat.groupBy({
      by: ['campaignId', 'channel'],
      where: { campaignId: { in: campaignIds } },
      _sum: { impressions: true, clicks: true },
    });
    for (const group of groups) {
      const totals = result.get(group.campaignId) ?? emptyTotals();
      totals[group.channel] = { impressions: group._sum.impressions ?? 0, clicks: group._sum.clicks ?? 0 };
      result.set(group.campaignId, totals);
    }
    return result;
  }

  private toView(row: CampaignRow, now: Date) {
    const channels = channelsFromRow(row);
    const bannerFields = channels.banner;
    const popupFields = channels.popup;
    const banner: BannerView | null = bannerFields
      ? {
          imageUrl: bannerFields.imageUrl,
          altText: bannerFields.altText,
          linkUrl: bannerFields.linkUrl,
          startAt: bannerFields.startAt,
          endAt: bannerFields.endAt,
          phase: channelPhase(row.status, bannerFields, now),
        }
      : null;
    const popup: PopupView | null = popupFields ? { ...popupFields, phase: channelPhase(row.status, popupFields, now) } : null;
    const profile = row.createdByAdminUser.user.profile;
    return {
      id: row.id,
      advertiserName: row.advertiserName,
      title: row.title,
      status: row.status,
      version: row.version,
      banner,
      popup,
      publishedAt: row.publishedAt,
      stoppedAt: row.stoppedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: { adminUserId: row.createdByAdminUser.id, name: profile?.displayName ?? profile?.nickname ?? null },
    };
  }
}

function readChannel(channel: AdChannel, input: AdChannelCreativeDto | AdPopupCreativeDto | null | undefined): AdChannelFields | null {
  if (!input) return null;
  const popupTexts = channel === 'popup' ? (input as AdPopupCreativeDto) : null;
  const fields: AdChannelFields = {
    imageUrl: input.imageUrl ?? null,
    altText: input.altText?.trim() || null,
    headline: popupTexts?.headline?.trim() || null,
    description: popupTexts?.description?.trim() || null,
    linkUrl: input.linkUrl ?? null,
    startAt: input.startAt ? new Date(input.startAt) : null,
    endAt: input.endAt ? new Date(input.endAt) : null,
  };
  if (!hasAnyChannelField(fields)) return null;
  if (fields.startAt && fields.endAt && fields.endAt.getTime() <= fields.startAt.getTime()) {
    throw new BadRequestException({
      code: 'AD_INVALID_WINDOW',
      message: `${CHANNEL_LABEL[channel]} 종료 시각은 시작 시각보다 뒤여야 해요.`,
      details: { channel },
    });
  }
  return fields;
}

function emptyTotals(): Record<AdChannel, ChannelTotals> {
  return { banner: { impressions: 0, clicks: 0 }, popup: { impressions: 0, clicks: 0 } };
}

function assertVersion(existing: { version: number }, expectedVersion: number) {
  if (existing.version !== expectedVersion) throw versionConflict(existing.version);
}

function versionConflict(currentVersion: number) {
  return new ConflictException({
    code: 'AD_CAMPAIGN_VERSION_CONFLICT',
    message: '다른 운영자가 먼저 저장했어요. 화면을 새로 고쳐 최신 내용을 확인해 주세요.',
    details: { currentVersion },
  });
}

function invalidState(message: string) {
  return new ConflictException({ code: 'AD_CAMPAIGN_INVALID_STATE', message });
}

function notFound() {
  return new NotFoundException({ code: 'AD_CAMPAIGN_NOT_FOUND', message: '광고 캠페인을 찾을 수 없어요.' });
}

function problemMessage(problem: AdPublishProblem): string {
  switch (problem.code) {
    case 'AD_CHANNEL_REQUIRED':
      return '배너나 팝업 중 하나는 채워야 게시할 수 있어요.';
    case 'AD_CHANNEL_INCOMPLETE':
      return `${CHANNEL_LABEL[problem.channel]}에 채우지 않은 항목이 있어요: ${problem.missing.map((name) => FIELD_LABEL[name]).join(', ')}`;
    case 'AD_WINDOW_ENDED':
      return `${CHANNEL_LABEL[problem.channel]} 종료 시각이 이미 지났어요.`;
  }
}

function auditSnapshot(row: CampaignRow): Prisma.InputJsonValue {
  const channels = channelsFromRow(row);
  const channel = (name: AdChannel): Prisma.InputJsonValue | null => {
    const fields = channels[name];
    if (!fields) return null;
    return {
      imageUrl: fields.imageUrl,
      altText: fields.altText,
      ...(name === 'popup' ? { headline: fields.headline, description: fields.description } : {}),
      linkUrl: fields.linkUrl,
      startAt: fields.startAt?.toISOString() ?? null,
      endAt: fields.endAt?.toISOString() ?? null,
    };
  };
  return {
    advertiserName: row.advertiserName,
    title: row.title,
    status: row.status,
    version: row.version,
    banner: channel('banner'),
    popup: channel('popup'),
  };
}
