import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { WebPushService } from './web-push.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PushSubscribeDto, PushUnsubscribeDto } from './dto/push-subscribe.dto';

@ApiTags('알림')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly webPushService: WebPushService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '알림 목록 (커서 페이지네이션)' })
  @ApiQuery({ name: 'isRead', required: false, type: Boolean })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findMine(
    @CurrentUser('id') userId: string,
    @Query('isRead') isRead?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.findMine(userId, {
      isRead: isRead !== undefined ? isRead === 'true' : undefined,
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('unread-count')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '읽지 않은 알림 수' })
  async getUnreadCount(@CurrentUser('id') userId: string) {
    return this.notificationsService.getUnreadCount(userId);
  }

  @Get('vapid-public-key')
  @ApiOperation({ summary: 'VAPID 공개키 조회 (Web Push 구독 시 필요)' })
  getVapidPublicKey() {
    return { key: this.webPushService.getPublicKey() };
  }

  @Patch('read-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '모든 알림 읽음 처리' })
  async markAllRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllRead(userId);
  }

  @Patch(':id/read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '알림 읽음 처리' })
  async markRead(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.notificationsService.markRead(id, userId);
  }

  @Post('push-subscribe')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Web Push 구독 등록' })
  async pushSubscribe(
    @CurrentUser('id') userId: string,
    @Body() dto: PushSubscribeDto,
  ) {
    return this.webPushService.subscribe(userId, { endpoint: dto.endpoint, keys: dto.keys });
  }

  @Delete('push-unsubscribe')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Web Push 구독 취소' })
  async pushUnsubscribe(
    @CurrentUser('id') userId: string,
    @Body() dto: PushUnsubscribeDto,
  ) {
    return this.webPushService.unsubscribe(userId, dto.endpoint);
  }
}
