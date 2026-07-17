import { Module } from '@nestjs/common';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1SessionLogoutInterceptor } from '../auth/v1-session.interceptor';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  controllers: [ProfileController],
  providers: [
    ProfileService,
    V1AuthGuard,
    OptionalV1AuthGuard,
    V1SessionLogoutInterceptor,
  ],
})
export class ProfileModule {}
