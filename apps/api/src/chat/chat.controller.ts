import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateRoomDto } from './dto/create-room.dto';
import { PostMessageDto } from './dto/post-message.dto';
import { CursorQueryDto } from './dto/cursor-query.dto';

@ApiTags('채팅')
@Controller('chat')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('rooms')
  @ApiOperation({ summary: '채팅방 목록 (커서 페이지네이션)' })
  async listRooms(
    @CurrentUser('id') userId: string,
    @Query() q: CursorQueryDto,
  ) {
    return this.chatService.listRooms(userId, q.before, q.limit);
  }

  @Post('rooms')
  @ApiOperation({ summary: '채팅방 생성' })
  async createRoom(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateRoomDto,
  ) {
    return this.chatService.createRoom(userId, dto);
  }

  @Get('rooms/:id')
  @ApiOperation({ summary: '채팅방 상세 (최근 30개 메시지 포함)' })
  @ApiParam({ name: 'id', description: 'Room ID' })
  async getRoom(
    @Param('id') roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.chatService.getRoom(roomId, userId);
  }

  @Get('rooms/:id/messages')
  @ApiOperation({ summary: '메시지 목록 (커서 페이지네이션)' })
  @ApiParam({ name: 'id', description: 'Room ID' })
  async listMessages(
    @Param('id') roomId: string,
    @CurrentUser('id') userId: string,
    @Query() q: CursorQueryDto,
  ) {
    return this.chatService.listMessages(roomId, userId, q.before, q.limit);
  }

  @Post('rooms/:id/messages')
  @ApiOperation({ summary: '메시지 전송 (REST — WebSocket 병행 사용)' })
  @ApiParam({ name: 'id', description: 'Room ID' })
  async postMessage(
    @Param('id') roomId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: PostMessageDto,
  ) {
    return this.chatService.postMessage(roomId, userId, dto);
  }

  @Delete('rooms/:roomId/messages/:messageId')
  @ApiOperation({ summary: '메시지 삭제 (soft delete — 본인 메시지만)' })
  @ApiParam({ name: 'roomId', description: 'Room ID' })
  @ApiParam({ name: 'messageId', description: 'Message ID' })
  async deleteMessage(
    @Param('messageId') messageId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.chatService.deleteMessage(messageId, userId);
  }

  @Patch('rooms/:id/read')
  @ApiOperation({ summary: '읽음 처리 (messageId까지 읽음으로 표시)' })
  @ApiParam({ name: 'id', description: 'Room ID' })
  async markRead(
    @Param('id') roomId: string,
    @CurrentUser('id') userId: string,
    @Body('messageId') messageId: string,
  ) {
    return this.chatService.markRead(roomId, userId, messageId);
  }
}
