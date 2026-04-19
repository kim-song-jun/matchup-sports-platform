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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiOkResponse, ApiCreatedResponse, ApiUnauthorizedResponse, ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { WebPushService } from './web-push.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PushSubscribeDto, PushUnsubscribeDto } from './dto/push-subscribe.dto';
import { UpdateNotificationPreferencesDto, NotificationPreferencesResponseDto } from './dto/notification-preference.dto';

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
  @ApiOkResponse({ description: 'Paginated notification list' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
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
  @ApiOkResponse({ description: 'Unread notification count' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async getUnreadCount(@CurrentUser('id') userId: string) {
    return this.notificationsService.getUnreadCount(userId);
  }

  @Get('vapid-public-key')
  @ApiOperation({ summary: 'VAPID 공개키 조회 (Web Push 구독 시 필요)' })
  @ApiOkResponse({ description: 'VAPID public key' })
  getVapidPublicKey() {
    return { key: this.webPushService.getPublicKey() };
  }

  @Patch('read-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '모든 알림 읽음 처리' })
  @ApiOkResponse({ description: 'All notifications marked as read' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async markAllRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllRead(userId);
  }

  @Patch(':id/read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '알림 읽음 처리' })
  @ApiOkResponse({ description: 'Notification marked as read' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async markRead(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.notificationsService.markRead(id, userId);
  }

  @Post('push-subscribe')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Web Push 구독 등록 (endpoint 기준 upsert, 분당 10회 제한)' })
  @ApiCreatedResponse({ description: 'Push subscription registered' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  @ApiTooManyRequestsResponse({ description: '분당 10회 초과 (Too many requests)' })
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
  @ApiOkResponse({ description: 'Push subscription removed' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async pushUnsubscribe(
    @CurrentUser('id') userId: string,
    @Body() dto: PushUnsubscribeDto,
  ) {
    return this.webPushService.unsubscribe(userId, dto.endpoint);
  }

  @Get('preferences')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '알림 설정 조회 (행 없으면 기본값 all=true 반환)' })
  @ApiOkResponse({ description: 'Notification preferences', type: NotificationPreferencesResponseDto })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async getPreferences(@CurrentUser('id') userId: string): Promise<NotificationPreferencesResponseDto> {
    return this.notificationsService.getPreferences(userId);
  }

  @Patch('preferences')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '알림 설정 업데이트 (upsert, 변경 필드만 전달)' })
  @ApiOkResponse({ description: 'Notification preferences updated', type: NotificationPreferencesResponseDto })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async updatePreferences(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesResponseDto> {
    return this.notificationsService.updatePreferences(userId, dto);
  }
}
