import { Global, Module } from '@nestjs/common';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { ManagedTermsRuntimeService } from './managed-terms-runtime.service';
import { TermsController } from './terms.controller';

@Global()
@Module({
  controllers: [TermsController],
  providers: [ManagedTermsRuntimeService, V1AuthGuard, OptionalV1AuthGuard],
  exports: [ManagedTermsRuntimeService],
})
export class TermsModule {}
