import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MercenaryService } from './mercenary.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('용병')
@Controller('mercenary')
export class MercenaryController {
  constructor(private readonly mercenaryService: MercenaryService) {}

  @Get()
  @ApiOperation({ summary: '용병 모집글 목록' })
  async findAll(
    @Query('sportType') sportType?: string,
    @Query('status') status?: string,
  ) {
    return this.mercenaryService.findAll({ sportType, status });
  }

  @Get(':id')
  @ApiOperation({ summary: '용병 모집글 상세' })
  async findById(@Param('id') id: string) {
    return this.mercenaryService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '용병 모집글 생성' })
  async create(
    @CurrentUser('id') userId: string,
    @Body()
    body: {
      teamId: string;
      matchDate: string;
      venue: string;
      position: string;
      count: number;
      level: number;
      fee: number;
      notes?: string;
    },
  ) {
    return this.mercenaryService.create(userId, body);
  }

  @Post(':id/apply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '용병 지원' })
  async apply(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.mercenaryService.apply(id, userId);
  }
}
