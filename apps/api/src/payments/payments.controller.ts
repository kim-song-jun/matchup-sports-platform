import { Controller, Post, Get, Param, Body, UseGuards, Headers, RawBodyRequest, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('결제')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('prepare')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '결제 준비' })
  async prepare(@CurrentUser('id') userId: string, @Body() body: Record<string, unknown>) {
    return this.paymentsService.prepare(userId, body);
  }

  @Post('confirm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '결제 승인' })
  async confirm(@Body() body: Record<string, unknown>) {
    return this.paymentsService.confirm(body);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toss Payments 웹훅 수신 (내부용)' })
  @ApiHeader({ name: 'toss-signature', description: 'HMAC-SHA256 서명 (Toss 발급)', required: false })
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('toss-signature') signature: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(body));
    return this.paymentsService.handleWebhook(rawBody, signature, body);
  }

  @Post(':id/refund')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '환불 요청' })
  async refund(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.paymentsService.refund(userId, id, body);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 결제 내역' })
  async getMyPayments(@CurrentUser('id') userId: string) {
    return this.paymentsService.getByUserId(userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 결제 상세' })
  async getPaymentById(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.paymentsService.getById(userId, id);
  }
}
