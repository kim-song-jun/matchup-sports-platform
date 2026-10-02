import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  ReportChatMessageDto,
  ChatMessagesQueryDto,
  ChatRoomsQueryDto,
  LeaveChatRoomDto,
  ResolveChatRoomDto,
  SendChatMessageDto,
  UpdateMyChatRoomDto,
} from './dto/chat.dto';
import { ChatService } from './chat.service';
import { UploadsService } from '../uploads/uploads.service';

@Controller('chat')
@UseGuards(V1AuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('blocked-users')
  blockedUsers(@CurrentUser() user: V1AuthUser) {
    return this.chatService.blockedUsers(user);
  }

  @Delete('blocked-users/:userId')
  unblockUser(@CurrentUser() user: V1AuthUser, @Param('userId') userId: string) {
    return this.chatService.unblockUser(user, userId);
  }

  /**
   * 파일 메시지 받기(Task 181 ③) — 방 참여자만. 파일은 공개 `/uploads` 밖(`.private/`)에 있어 이 경로가 유일한 입구다.
   * 공통 응답 감싸기(TransformInterceptor)를 거치지 않게 응답을 직접 쓴다. 항상 내려받기(attachment)로 보내고
   * MIME 추측을 막아(nosniff) 브라우저가 문서를 열어 실행하지 않게, 개인 대화 파일이라 캐시하지 않는다.
   */
  @Get('rooms/:roomId/messages/:messageId/file')
  async downloadMessageFile(
    @CurrentUser() user: V1AuthUser,
    @Param('roomId') roomId: string,
    @Param('messageId') messageId: string,
    @Res() res: Response,
  ) {
    const file = await this.chatService.messageFile(user, roomId, messageId);
    res.attachment(file.name);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    await new Promise<void>((resolve, reject) => {
      res.sendFile(
        file.storagePath,
        { root: UploadsService.UPLOAD_BASE, dotfiles: 'allow', headers: { 'Content-Type': file.mimeType } },
        (err) => (err && !res.headersSent ? reject(new NotFoundException({ code: 'NOT_FOUND', message: '파일을 찾을 수 없어요.' })) : resolve()),
      );
    });
  }

  @Post('rooms/:roomId/messages/:messageId/block')
  blockMessageSender(@CurrentUser() user: V1AuthUser, @Param('roomId') roomId: string, @Param('messageId') messageId: string) {
    return this.chatService.blockMessageSender(user, roomId, messageId);
  }

  @Post('rooms/:roomId/messages/:messageId/report')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  reportMessage(@CurrentUser() user: V1AuthUser, @Param('roomId') roomId: string, @Param('messageId') messageId: string, @Body() dto: ReportChatMessageDto) {
    return this.chatService.reportMessage(user, roomId, messageId, dto);
  }

  @Get('rooms')
  rooms(@CurrentUser() user: V1AuthUser, @Query() query: ChatRoomsQueryDto) {
    return this.chatService.rooms(user, query);
  }

  @Post('rooms/resolve')
  resolve(@CurrentUser() user: V1AuthUser, @Body() dto: ResolveChatRoomDto) {
    return this.chatService.resolve(user, dto);
  }

  @Get('rooms/:roomId')
  detail(@CurrentUser() user: V1AuthUser, @Param('roomId') roomId: string) {
    return this.chatService.detail(user, roomId);
  }

  @Get('rooms/:roomId/messages')
  messages(
    @CurrentUser() user: V1AuthUser,
    @Param('roomId') roomId: string,
    @Query() query: ChatMessagesQueryDto,
  ) {
    return this.chatService.messages(user, roomId, query);
  }

  @Post('rooms/:roomId/messages')
  sendMessage(
    @CurrentUser() user: V1AuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: SendChatMessageDto,
  ) {
    return this.chatService.sendMessage(user, roomId, dto);
  }

  @Patch('rooms/:roomId/me')
  updateMe(
    @CurrentUser() user: V1AuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: UpdateMyChatRoomDto,
  ) {
    return this.chatService.updateMe(user, roomId, dto);
  }

  @Post('rooms/:roomId/leave')
  leave(
    @CurrentUser() user: V1AuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: LeaveChatRoomDto,
  ) {
    return this.chatService.leave(user, roomId, dto);
  }
}
