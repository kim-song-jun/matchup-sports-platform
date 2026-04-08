import { Injectable, NotFoundException } from '@nestjs/common';
import { ReportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto, UpdateReportStatusDto } from './dto/report.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async createReport(reporterId: string, dto: CreateReportDto) {
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
