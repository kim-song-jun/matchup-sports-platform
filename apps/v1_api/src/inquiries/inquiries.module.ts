import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { OmitErrorLogBodyMiddleware } from '../common/logging/omit-error-log-body';
import { PrismaModule } from '../prisma/prisma.module';
import { InquiriesController } from './inquiries.controller';
import { InquiriesService } from './inquiries.service';
import { PublicInquiriesController } from './public-inquiries.controller';

@Module({
  imports: [PrismaModule],
  controllers: [InquiriesController, PublicInquiriesController],
  providers: [InquiriesService],
})
export class InquiriesModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(OmitErrorLogBodyMiddleware)
      .forRoutes({ path: 'public/inquiries', method: RequestMethod.POST });
  }
}
