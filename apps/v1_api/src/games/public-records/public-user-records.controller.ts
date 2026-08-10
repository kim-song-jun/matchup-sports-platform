import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { OptionalV1AuthGuard } from '../../auth/optional-v1-auth.guard';
import { PublicRecordsQueryDto } from './dto/public-records-query.dto';
import { PublicUserRecordsService } from './public-user-records.service';

/** Task 24 -- `GET /users/:id/records` (public, consent-gated personal projection). */
@Controller('users')
@UseGuards(OptionalV1AuthGuard)
export class PublicUserRecordsController {
  constructor(private readonly userRecords: PublicUserRecordsService) {}

  @Get(':userId/records')
  getRecords(@Param('userId') userId: string, @Query() query: PublicRecordsQueryDto) {
    return this.userRecords.getRecords(userId, query);
  }
}
