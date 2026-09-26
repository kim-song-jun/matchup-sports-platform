import { Module } from '@nestjs/common';
import { AppleTokenService } from './apple-token.service';

/** Shared by sign-in (AuthModule) and withdrawal (ProfileModule), so the key is read once per importer. */
@Module({
  providers: [AppleTokenService],
  exports: [AppleTokenService],
})
export class AppleTokenModule {}
