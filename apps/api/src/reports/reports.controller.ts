import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { ReportStatus, ReportTargetType } from '@prisma/client';
import { ReportsService } from './reports.service';
import { CreateReportDto, UpdateReportStatusDto } from './dto/report.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('신고')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post('reports')
  @ApiOperation({ summary: '신고 생성' })
  @ApiCreatedResponse({ description: 'Report created' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  createReport(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateReportDto,
  ) {
    return this.reportsService.createReport(userId, dto);
  }

  @Get('reports/me')
  @ApiOperation({ summary: '내 신고 목록' })
  @ApiOkResponse({ description: 'My report list' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  getMyReports(@CurrentUser('id') userId: string) {
    return this.reportsService.getMyReports(userId);
  }

  @Get('admin/reports')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '관리자 — 전체 신고 목록' })
  @ApiQuery({ name: 'status', enum: ReportStatus, required: false })
  @ApiQuery({ name: 'targetType', enum: ReportTargetType, required: false })
  @ApiOkResponse({ description: 'All reports (admin view)' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  @ApiForbiddenResponse({ description: 'Admin role required' })
  adminListReports(
    @Query('status') status?: ReportStatus,
    @Query('targetType') targetType?: string,
  ) {
    return this.reportsService.adminListReports({ status, targetType });
  }

  @Patch('admin/reports/:id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '관리자 — 신고 상태 업데이트' })
  @ApiOkResponse({ description: 'Report status updated' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  @ApiForbiddenResponse({ description: 'Admin role required' })
  adminUpdateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateReportStatusDto,
  ) {
    return this.reportsService.adminUpdateStatus(id, dto);
  }
}
