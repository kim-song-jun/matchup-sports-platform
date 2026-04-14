import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse, ApiCreatedResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateReviewDto } from './dto/create-review.dto';

@ApiTags('평가')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '동료 평가 작성' })
  @ApiCreatedResponse({ description: 'Review created' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async create(@CurrentUser('id') userId: string, @Body() body: CreateReviewDto) {
    return this.reviewsService.create(userId, body);
  }

  @Get('pending')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '미작성 평가 목록' })
  @ApiOkResponse({ description: 'Pending review list' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async getPending(@CurrentUser('id') userId: string) {
    return this.reviewsService.getPending(userId);
  }
}
