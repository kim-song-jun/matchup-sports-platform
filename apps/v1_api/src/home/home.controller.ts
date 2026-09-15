import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { HomeQueryDto, HomeRecommendationsQueryDto } from './dto/home-query.dto';
import { HomeService } from './home.service';

@Controller('home')
@UseGuards(OptionalV1AuthGuard)
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get()
  getHome(@CurrentUser() user: V1AuthUser | undefined, @Query() query: HomeQueryDto): ReturnType<HomeService['getHome']> {
    return this.homeService.getHome(user ?? null, query);
  }

  @Get('recommendations')
  getRecommendations(
    @CurrentUser() user: V1AuthUser | undefined,
    @Query() query: HomeRecommendationsQueryDto,
  ) {
    return this.homeService.getRecommendations(user ?? null, query);
  }
}
