import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  AdminLogsQueryDto,
  AdminOverviewQueryDto,
  ChangeMatchStatusDto,
  ChangeTeamMatchStatusDto,
  ChangeTeamStatusDto,
  ChangeUserStatusDto,
  ConfirmPaymentDto,
  CreatePaymentOrderDto,
  DisputeActionDto,
  OpsQueueQueryDto,
  PayoutRequestDto,
  RefundPaymentDto,
  ReportActionDto,
  SettlementActionDto,
  TossWebhookDto,
} from './dto/admin.dto';
import { AdminService } from './admin.service';
import { AdminOpsService } from './admin-ops.service';

@Controller('admin')
@UseGuards(V1AuthGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly adminOpsService: AdminOpsService,
  ) {}

  @Get('me')
  me(@CurrentUser() user: V1AuthUser) {
    return this.adminService.me(user);
  }

  @Get('overview')
  overview(@CurrentUser() user: V1AuthUser, @Query() query: AdminOverviewQueryDto) {
    return this.adminService.overview(user, query);
  }

  @Post('users/:userId/status')
  changeUserStatus(
    @CurrentUser() user: V1AuthUser,
    @Param('userId') userId: string,
    @Body() dto: ChangeUserStatusDto,
  ) {
    return this.adminService.changeUserStatus(user, userId, dto);
  }

  @Post('matches/:matchId/status')
  changeMatchStatus(
    @CurrentUser() user: V1AuthUser,
    @Param('matchId') matchId: string,
    @Body() dto: ChangeMatchStatusDto,
  ) {
    return this.adminService.changeMatchStatus(user, matchId, dto);
  }

  @Post('teams/:teamId/status')
  changeTeamStatus(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Body() dto: ChangeTeamStatusDto,
  ) {
    return this.adminService.changeTeamStatus(user, teamId, dto);
  }

  @Post('team-matches/:teamMatchId/status')
  changeTeamMatchStatus(
    @CurrentUser() user: V1AuthUser,
    @Param('teamMatchId') teamMatchId: string,
    @Body() dto: ChangeTeamMatchStatusDto,
  ) {
    return this.adminService.changeTeamMatchStatus(user, teamMatchId, dto);
  }

  @Get('action-logs')
  actionLogs(@CurrentUser() user: V1AuthUser, @Query() query: AdminLogsQueryDto) {
    return this.adminService.actionLogs(user, query);
  }

  @Get('status-change-logs')
  statusChangeLogs(@CurrentUser() user: V1AuthUser, @Query() query: AdminLogsQueryDto) {
    return this.adminService.statusChangeLogs(user, query);
  }

  @Get('ops/overview')
  opsOverview(@CurrentUser() user: V1AuthUser) {
    return this.adminOpsService.overview(user);
  }

  @Get('reports')
  reports(@CurrentUser() user: V1AuthUser, @Query() query: OpsQueueQueryDto) {
    return this.adminOpsService.reports(user, query);
  }

  @Get('reports/:reportId')
  reportDetail(@CurrentUser() user: V1AuthUser, @Param('reportId') reportId: string) {
    return this.adminOpsService.reportDetail(user, reportId);
  }

  @Post('reports/:reportId/actions')
  reportAction(@CurrentUser() user: V1AuthUser, @Param('reportId') reportId: string, @Body() dto: ReportActionDto) {
    return this.adminOpsService.reportAction(user, reportId, dto);
  }

  @Get('disputes')
  disputes(@CurrentUser() user: V1AuthUser, @Query() query: OpsQueueQueryDto) {
    return this.adminOpsService.disputes(user, query);
  }

  @Get('disputes/:disputeId')
  disputeDetail(@CurrentUser() user: V1AuthUser, @Param('disputeId') disputeId: string) {
    return this.adminOpsService.disputeDetail(user, disputeId);
  }

  @Post('disputes/:disputeId/actions')
  disputeAction(@CurrentUser() user: V1AuthUser, @Param('disputeId') disputeId: string, @Body() dto: DisputeActionDto) {
    return this.adminOpsService.disputeAction(user, disputeId, dto);
  }

  @Get('payments')
  payments(@CurrentUser() user: V1AuthUser, @Query() query: OpsQueueQueryDto) {
    return this.adminOpsService.payments(user, query);
  }

  @Post('payments/orders')
  createPaymentOrder(@CurrentUser() user: V1AuthUser, @Body() dto: CreatePaymentOrderDto) {
    return this.adminOpsService.createPaymentOrder(user, dto);
  }

  @Post('payments/confirm')
  confirmPayment(@CurrentUser() user: V1AuthUser, @Body() dto: ConfirmPaymentDto) {
    return this.adminOpsService.confirmPayment(user, dto);
  }

  @Post('payments/:paymentOrderId/refunds')
  refundPayment(@CurrentUser() user: V1AuthUser, @Param('paymentOrderId') paymentOrderId: string, @Body() dto: RefundPaymentDto) {
    return this.adminOpsService.refundPayment(user, paymentOrderId, dto);
  }

  @Get('settlements')
  settlements(@CurrentUser() user: V1AuthUser, @Query() query: OpsQueueQueryDto) {
    return this.adminOpsService.settlements(user, query);
  }

  @Get('settlements/:settlementBatchId')
  settlementDetail(@CurrentUser() user: V1AuthUser, @Param('settlementBatchId') settlementBatchId: string) {
    return this.adminOpsService.settlementDetail(user, settlementBatchId);
  }

  @Post('settlements/:settlementBatchId/actions')
  settlementAction(@CurrentUser() user: V1AuthUser, @Param('settlementBatchId') settlementBatchId: string, @Body() dto: SettlementActionDto) {
    return this.adminOpsService.settlementAction(user, settlementBatchId, dto);
  }

  @Post('settlements/:settlementBatchId/payouts')
  requestPayout(@CurrentUser() user: V1AuthUser, @Param('settlementBatchId') settlementBatchId: string, @Body() dto: PayoutRequestDto) {
    return this.adminOpsService.requestPayout(user, settlementBatchId, dto);
  }

  @Get('ops/audit')
  opsAudit(@CurrentUser() user: V1AuthUser, @Query() query: OpsQueueQueryDto) {
    return this.adminOpsService.audit(user, query);
  }
}

@Controller('admin/payments/webhooks')
export class AdminPaymentsWebhookController {
  constructor(private readonly adminOpsService: AdminOpsService) {}

  @Post('toss')
  tossWebhook(@Body() dto: TossWebhookDto) {
    return this.adminOpsService.tossWebhook(dto);
  }
}
