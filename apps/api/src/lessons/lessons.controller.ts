import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { LessonsService } from './lessons.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateLessonDto } from './dto/create-lesson.dto';

class ConfirmTicketPaymentDto {
  @ApiProperty({ description: '토스페이먼츠 paymentKey', required: false })
  @IsOptional()
  @IsString()
  paymentKey?: string;
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
    @Query('teamId') teamId?: string,
    @Query('venueId') venueId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? parseInt(limit, 10) : undefined;
    const safeLimit = parsed !== undefined
      ? Math.min(Math.max(1, Number.isNaN(parsed) ? 20 : parsed), 100)
      : undefined;
    return this.lessonsService.findAll({ sportType, type, teamId, venueId, cursor, limit: safeLimit });
  }

  @Get('tickets/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 수강권 목록' })
  async findMyTickets(@CurrentUser('id') userId: string) {
    return this.lessonsService.findMyTickets(userId);
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
  async create(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: string,
    @Body() body: CreateLessonDto,
  ) {
    return this.lessonsService.create(userId, userRole, body);
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
