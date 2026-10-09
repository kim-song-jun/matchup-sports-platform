import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { PlaceSearchQueryDto } from './dto/place-search-query.dto';
import { PlaceSearchService } from './place-search.service';

@Controller('places')
@UseGuards(V1AuthGuard)
export class PlacesController {
  constructor(private readonly placeSearch: PlaceSearchService) {}

  @Get('search')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  search(@Query() query: PlaceSearchQueryDto) {
    return this.placeSearch.search(query.query, query.page);
  }
}
