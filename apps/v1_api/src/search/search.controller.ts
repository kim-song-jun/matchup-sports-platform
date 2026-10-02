import { Body, Controller, Get, Headers, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { RecentSearchesQueryDto, RecordSearchDto } from './dto/search-history.dto';
import { SearchService } from './search.service';

@Controller('search')
@UseGuards(OptionalV1AuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('recent')
  recent(
    @CurrentUser() user: V1AuthUser | undefined,
    @Headers('x-v1-search-session-id') sessionKey: string | undefined,
    @Query() query: RecentSearchesQueryDto,
  ): ReturnType<SearchService['recent']> {
    return this.searchService.recent(user ?? null, sessionKey ?? null, query);
  }

  @Post('recent')
  record(
    @CurrentUser() user: V1AuthUser | undefined,
    @Headers('x-v1-search-session-id') sessionKey: string | undefined,
    @Body() dto: RecordSearchDto,
  ): ReturnType<SearchService['record']> {
    return this.searchService.record(user ?? null, sessionKey ?? null, dto);
  }
}
