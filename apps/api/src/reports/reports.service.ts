import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ReportStatus, ReportTargetType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto, UpdateReportStatusDto } from './dto/report.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verifies that the report target exists. Throws NotFound when targetId does
   * not correspond to a row of the declared targetType. Protects the admin
   * queue from spam/DoS via forged targetIds.
   */
  private async assertTargetExists(targetType: ReportTargetType, targetId: string) {
    switch (targetType) {
      case ReportTargetType.user: {
        const exists = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
        if (!exists) throw new NotFoundException('REPORT_TARGET_NOT_FOUND');
        return;
      }
      case ReportTargetType.message: {
        const exists = await this.prisma.chatMessage.findUnique({ where: { id: targetId }, select: { id: true } });
        if (!exists) throw new NotFoundException('REPORT_TARGET_NOT_FOUND');
        return;
      }
      case ReportTargetType.listing: {
        const exists = await this.prisma.marketplaceListing.findUnique({ where: { id: targetId }, select: { id: true } });
        if (!exists) throw new NotFoundException('REPORT_TARGET_NOT_FOUND');
        return;
      }
      case ReportTargetType.review: {
        const exists = await this.prisma.review.findUnique({ where: { id: targetId }, select: { id: true } });
        if (!exists) throw new NotFoundException('REPORT_TARGET_NOT_FOUND');
        return;
      }
      default:
        throw new BadRequestException('INVALID_REPORT_TARGET_TYPE');
    }
  }

  async createReport(reporterId: string, dto: CreateReportDto) {
    await this.assertTargetExists(dto.targetType, dto.targetId);

    return this.prisma.report.create({
      data: {
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
        description: dto.description,
      },
      select: {
        id: true,
        targetType: true,
        targetId: true,
        reason: true,
        description: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async getMyReports(userId: string) {
    return this.prisma.report.findMany({
      where: { reporterId: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        targetType: true,
        targetId: true,
        reason: true,
        description: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async adminListReports(filter: { status?: ReportStatus; targetType?: string }) {
    return this.prisma.report.findMany({
      where: {
        ...(filter.status && { status: filter.status }),
        ...(filter.targetType && { targetType: filter.targetType as any }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: {
          select: { id: true, nickname: true, email: true },
        },
      },
    });
  }

  async adminUpdateStatus(id: string, dto: UpdateReportStatusDto) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) {
      throw new NotFoundException('REPORT_NOT_FOUND');
    }
    return this.prisma.report.update({
      where: { id },
      data: { status: dto.status },
      select: {
        id: true,
        status: true,
        createdAt: true,
      },
    });
  }
}
