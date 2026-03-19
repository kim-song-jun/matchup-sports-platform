import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LessonsService } from './lessons.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('강좌')
@Controller('lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Get()
  @ApiOperation({ summary: '강좌 목록' })
  async findAll(
    @Query('sportType') sportType?: string,
    @Query('type') type?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.lessonsService.findAll({ sportType, type, cursor });
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
  async create(@CurrentUser('id') userId: string, @Body() body: Record<string, unknown>) {
    return this.lessonsService.create(userId, body);
  }
}
