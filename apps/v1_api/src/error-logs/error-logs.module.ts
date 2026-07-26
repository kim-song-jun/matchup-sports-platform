import { Global, Module } from '@nestjs/common';
import { AdminContextModule } from '../common/admin-context.module';
import { AdminErrorLogController } from './admin-error-log.controller';
import { ErrorLogService } from './error-log.service';

/**
 * ErrorLogService는 필터(AllExceptionsFilter)·로그 컨트롤러(LogsController) 등 여러
 * 다른 모듈에서 주입받아 record()를 호출해야 하므로 @Global로 두어 각 소비 모듈이
 * 매번 import하지 않아도 되게 한다. PrismaModule도 같은 이유로 @Global이다.
 */
@Global()
@Module({
  imports: [AdminContextModule],
  controllers: [AdminErrorLogController],
  providers: [ErrorLogService],
  exports: [ErrorLogService],
})
export class ErrorLogsModule {}
