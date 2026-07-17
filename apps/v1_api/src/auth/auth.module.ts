import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OptionalV1AuthGuard } from './optional-v1-auth.guard';
import { V1AuthGuard } from './v1-auth.guard';
import { V1SessionCookieInterceptor } from './v1-session.interceptor';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    V1AuthGuard,
    OptionalV1AuthGuard,
    V1SessionCookieInterceptor,
  ],
  exports: [V1AuthGuard, OptionalV1AuthGuard],
})
export class AuthModule {}
