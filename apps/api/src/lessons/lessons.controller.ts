import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { LessonsService } from './lessons.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { LessonFilterDto } from './dto/lesson-filter.dto';
import { ConfirmTicketPaymentDto } from './dto/confirm-ticket-payment.dto';

@ApiTags('강좌')
@Controller('lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Get()
  @ApiOperation({ summary: '강좌 목록' })
  @ApiOkResponse({ description: '강좌 목록 반환 (cursor 페이지네이션)' })
  async findAll(@Query() filter: LessonFilterDto) {
    return this.lessonsService.findAll({
      sportType: filter.sportType,
      type: filter.type,
      teamId: filter.teamId,
      venueId: filter.venueId,
      cursor: filter.cursor,
      limit: filter.limit,
    });
  }

  @Get('tickets/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 수강권 목록' })
  @ApiOkResponse({ description: '수강권 목록 반환' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  async findMyTickets(@CurrentUser('id') userId: string) {
    return this.lessonsService.findMyTickets(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: '강좌 상세' })
  @ApiOkResponse({ description: '강좌 상세 반환' })
  @ApiNotFoundResponse({ description: '강좌 없음' })
  async findById(@Param('id') id: string) {
    return this.lessonsService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '강좌 생성' })
  @ApiCreatedResponse({ description: '강좌 생성 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '강사 또는 팀 관리자 권한 필요' })
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
  @ApiCreatedResponse({ description: '결제 준비 성공 — orderId, amount 반환' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiNotFoundResponse({ description: '티켓 플랜 없음' })
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
  @ApiOkResponse({ description: '결제 확인 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '본인 티켓만 확인 가능' })
  async confirmTicketPayment(
    @Param('ticketId') ticketId: string,
    @Body() body: ConfirmTicketPaymentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.lessonsService.confirmTicketPayment(ticketId, body.paymentKey, userId);
  }
}
