import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PopupTargetScreen } from './popup-screen';

@Injectable()
export class PopupsService {
  constructor(private readonly prisma: PrismaService) {}

  async findActive(screen: PopupTargetScreen) {
    const now = new Date();
    const popup = await this.prisma.v1Popup.findFirst({
      where: {
        status: 'published',
        audience: 'public',
        targetScreens: { has: screen },
        AND: [
          { OR: [{ displayStartAt: null }, { displayStartAt: { lte: now } }] },
          { OR: [{ displayEndAt: null }, { displayEndAt: { gt: now } }] },
        ],
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        body: true,
        contentJson: true,
        contentVersion: true,
        targetScreens: true,
        linkUrl: true,
        linkLabel: true,
        publishedAt: true,
      },
    });

    return popup
      ? {
          popupId: popup.id,
          title: popup.title,
          body: popup.body,
          content: popup.contentJson,
          contentVersion: popup.contentVersion,
          targetScreens: popup.targetScreens,
          linkUrl: popup.linkUrl,
          linkLabel: popup.linkLabel,
          publishedAt: popup.publishedAt,
        }
      : null;
  }
}
