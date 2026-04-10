import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { LessonsService } from './lessons.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

class ConfirmTicketPaymentDto {
  @ApiProperty({ description: '토스페이먼츠 paymentKey' })
  @IsString()
  @IsNotEmpty()
  paymentKey!: string;
}

@ApiTags('강좌')
@Controller('lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Get()
  @ApiOperation({ summary: '강좌 목록' })
  async findAll(
    @Query('sportType') sportType?: string,
    @Query('type') type?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.lessonsService.findAll({ sportType, type, cursor, limit: limit ? parseInt(limit, 10) : undefined });
  }

  @Get(':id')
  @ApiOperation({ summary: '강좌 상세' })
  async findById(@Param('id') id: string) {
    return this.lessonsService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '강좌 생성' })
  async create(@CurrentUser('id') userId: string, @Body() body: Record<string, unknown>) {
    return this.lessonsService.create(userId, body);
  }

  @Post('plans/:planId/purchase')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '레슨 티켓 구매 (결제 prepare — orderId + amount 반환)' })
  async purchaseTicket(
    @Param('planId') planId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.lessonsService.purchaseTicket(userId, planId);
  }

  @Post('tickets/:ticketId/confirm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '레슨 티켓 결제 확인 (Toss 승인 후 호출)' })
  async confirmTicketPayment(
    @Param('ticketId') ticketId: string,
    @Body() body: ConfirmTicketPaymentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.lessonsService.confirmTicketPayment(ticketId, body.paymentKey, userId);
  }
}
