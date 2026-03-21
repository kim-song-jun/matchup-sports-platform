import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('채팅')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('rooms')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '채팅방 목록' })
  async getRooms() {
    return this.chatService.getRooms();
  }

  @Get('rooms/:id')
  @ApiOperation({ summary: '채팅방 메시지 조회' })
  async getMessages(@Param('id') id: string) {
    return this.chatService.getMessages(id);
  }

  @Post('rooms/:id/messages')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '메시지 전송' })
  async sendMessage(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body('message') message: string,
  ) {
    return this.chatService.sendMessage(id, userId, message);
  }

  @Post('rooms')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '채팅방 생성' })
  async createRoom(
    @Body()
    body: {
      teamMatchId: string;
      homeTeamId: string;
      awayTeamId: string;
    },
  ) {
    return this.chatService.createRoom(body);
  }
}
