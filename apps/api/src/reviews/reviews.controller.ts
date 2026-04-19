import { Controller, Post, Get, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateReviewDto } from './dto/create-review.dto';

@ApiTags('평가')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '동료 평가 작성 (멱등)' })
  @ApiOkResponse({
    description: '평가 제출 성공 (최초: alreadySubmitted=false, 중복: alreadySubmitted=true). 두 경우 모두 200 반환.',
    schema: {
      properties: {
        review: { type: 'object', description: '기존 또는 신규 생성된 리뷰 객체' },
        alreadySubmitted: {
          type: 'boolean',
          description: '동일 matchId+authorId+targetId 조합으로 이미 제출된 평가면 true (멱등 재호출 감지용)',
        },
      },
    },
  })
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
