import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TeamsService } from './teams.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('팀/클럽')
@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  @ApiOperation({ summary: '팀 목록' })
  async findAll(
    @Query('sportType') sportType?: string,
    @Query('city') city?: string,
    @Query('recruiting') recruiting?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.teamsService.findAll({ sportType, city, recruiting, cursor });
  }

  @Get(':id')
  @ApiOperation({ summary: '팀 상세' })
  async findById(@Param('id') id: string) {
    return this.teamsService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '팀 생성' })
  async create(@CurrentUser('id') userId: string, @Body() body: Record<string, unknown>) {
    return this.teamsService.create(userId, body);
  }
}
