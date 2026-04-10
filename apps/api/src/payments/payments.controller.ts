import { Controller, Post, Get, Param, Body, UseGuards, Headers, RawBodyRequest, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiHeader } from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PreparePaymentDto } from './dto/prepare-payment.dto';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { TossWebhookDto } from './dto/toss-webhook.dto';

@ApiTags('결제')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('prepare')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '결제 준비' })
  @ApiBody({ type: PreparePaymentDto })
  async prepare(@CurrentUser('id') userId: string, @Body() dto: PreparePaymentDto) {
    return this.paymentsService.prepare(userId, dto);
  }

  @Post('confirm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '결제 승인' })
  @ApiBody({ type: ConfirmPaymentDto })
  async confirm(@Body() dto: ConfirmPaymentDto) {
    return this.paymentsService.confirm(dto);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toss Payments 웹훅 수신 (내부용)' })
  @ApiHeader({ name: 'toss-signature', description: 'HMAC-SHA256 서명 (Toss 발급)', required: false })
  @ApiBody({ type: TossWebhookDto })
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('toss-signature') signature: string | undefined,
    @Body() body: TossWebhookDto,
  ) {
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(body));
    return this.paymentsService.handleWebhook(rawBody, signature, body);
  }

  @Post(':id/refund')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '환불 요청' })
  @ApiBody({ type: RefundPaymentDto })
  async refund(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: RefundPaymentDto) {
    return this.paymentsService.refund(userId, id, dto);
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
