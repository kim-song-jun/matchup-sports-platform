import { Module } from '@nestjs/common';
import { AdminContextService } from './admin-context.service';

/**
 * 어드민 신원 확인 + 감사 로그 공용 서비스 모듈. PrismaModule이 @Global이므로
 * 별도 import 없이 PrismaService를 주입받는다. 신규 어드민 도메인 모듈이 import.
 */
@Module({
  providers: [AdminContextService],
  exports: [AdminContextService],
})
export class AdminContextModule {}
