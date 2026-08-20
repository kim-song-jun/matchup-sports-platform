import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { OptionalV1AuthGuard } from '../../auth/optional-v1-auth.guard';
import { V1AuthUser } from '../../auth/v1-auth-user';
import { PublicRecordsQueryDto } from './dto/public-records-query.dto';
import { PublicUserRecordsService } from './public-user-records.service';

/**
 * Task 24 -- `GET /users/:id/records` (public, consent-gated personal projection).
 *
 * `OptionalV1AuthGuard`는 비로그인 요청을 막지 않고 그냥 통과시킨다(로그인 요청만
 * `request.v1User`를 채운다) -- 그래서 `@CurrentUser()`는 비로그인 요청에서 `undefined`를
 * 준다(`current-user.decorator.ts` 참고). 본인 조회 판별(self-view)은 이 `viewer`를
 * 서비스로 그대로 넘겨 서버 세션 기준으로만 하고, 쿼리 파라미터나 헤더로는 절대 받지 않는다.
 */
@Controller('users')
@UseGuards(OptionalV1AuthGuard)
export class PublicUserRecordsController {
  constructor(private readonly userRecords: PublicUserRecordsService) {}

  @Get(':userId/records')
  getRecords(
    @CurrentUser() viewer: V1AuthUser | undefined,
    @Param('userId') userId: string,
    @Query() query: PublicRecordsQueryDto,
  ) {
    return this.userRecords.getRecords(userId, query, viewer?.id);
  }
}
