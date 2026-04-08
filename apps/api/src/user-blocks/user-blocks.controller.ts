import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserBlocksService } from './user-blocks.service';
import { CreateUserBlockDto } from './dto/user-block.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('사용자 차단')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/blocks')
export class UserBlocksController {
  constructor(private readonly userBlocksService: UserBlocksService) {}

  @Post()
  @ApiOperation({ summary: '사용자 차단' })
  block(@CurrentUser('id') userId: string, @Body() dto: CreateUserBlockDto) {
    return this.userBlocksService.block(userId, dto.blockedId, dto.reason);
  }

  @Delete(':blockedId')
  @ApiOperation({ summary: '차단 해제' })
  unblock(
    @CurrentUser('id') userId: string,
    @Param('blockedId') blockedId: string,
  ) {
    return this.userBlocksService.unblock(userId, blockedId);
  }

  @Get()
  @ApiOperation({ summary: '내가 차단한 사용자 목록' })
  listBlocks(@CurrentUser('id') userId: string) {
    return this.userBlocksService.listBlocks(userId);
  }
}
