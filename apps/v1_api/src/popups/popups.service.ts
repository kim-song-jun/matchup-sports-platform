import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PopupTargetScreen } from './popup-screen';

@Injectable()
export class PopupsService {
  constructor(private readonly prisma: PrismaService) {}

  async findActive(screen: PopupTargetScreen, path?: string) {
    const now = new Date();
    const activeWindow = {
      status: 'published' as const,
      audience: 'public' as const,
      AND: [
        { OR: [{ displayStartAt: null }, { displayStartAt: { lte: now } }] },
        { OR: [{ displayEndAt: null }, { displayEndAt: { gt: now } }] },
      ],
    };
    const select = {
      id: true,
      title: true,
      body: true,
      contentJson: true,
      contentVersion: true,
      targetScreens: true,
      targetPaths: true,
      linkUrl: true,
      linkLabel: true,
      publishedAt: true,
    };
    const orderBy = [{ publishedAt: 'desc' as const }, { createdAt: 'desc' as const }];

    const exactPopup = path ? await this.prisma.v1Popup.findFirst({
      where: {
        ...activeWindow,
        targetPaths: { has: path },
      },
      orderBy,
      select,
    }) : null;

    const popup = exactPopup ?? await this.prisma.v1Popup.findFirst({
      where: {
        ...activeWindow,
        targetScreens: { has: screen },
      },
      orderBy,
      select,
    });

    return popup
      ? {
          popupId: popup.id,
          title: popup.title,
          body: popup.body,
          content: popup.contentJson,
          contentVersion: popup.contentVersion,
          targetScreens: popup.targetScreens,
          targetPaths: popup.targetPaths,
          linkUrl: popup.linkUrl,
          linkLabel: popup.linkLabel,
          publishedAt: popup.publishedAt,
        }
      : null;
  }
}
