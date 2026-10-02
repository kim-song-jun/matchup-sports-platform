import { Module } from '@nestjs/common';
import { AppleIdentityService } from './apple-identity.service';
import { AppleTokenService } from './apple-token.service';

/** Shared by sign-in (AuthModule) and withdrawal (ProfileModule); owns the one Apple key cache. */
@Module({
  providers: [AppleIdentityService, AppleTokenService],
  exports: [AppleIdentityService, AppleTokenService],
})
export class AppleTokenModule {}
