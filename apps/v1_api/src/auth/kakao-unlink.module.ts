import { Module } from '@nestjs/common';
import { KakaoUnlinkService } from './kakao-unlink.service';

/**
 * Shared by login-method removal (AuthModule), withdrawal (ProfileModule), operator deletion (AdminModule) and the
 * grace-period deletion job (WithdrawalFinalizationModule).
 */
@Module({
  providers: [KakaoUnlinkService],
  exports: [KakaoUnlinkService],
})
export class KakaoUnlinkModule {}
