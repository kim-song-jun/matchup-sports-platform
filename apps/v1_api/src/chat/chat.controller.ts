import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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

  @Post('rooms/:roomId/messages/:messageId/block')
  blockMessageSender(@CurrentUser() user: V1AuthUser, @Param('roomId') roomId: string, @Param('messageId') messageId: string) {
    return this.chatService.blockMessageSender(user, roomId, messageId);
  }

  @Post('rooms/:roomId/messages/:messageId/report')
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
