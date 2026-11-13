import { Module } from '@nestjs/common';
import { KakaoUnlinkService } from './kakao-unlink.service';

/** Shared by login-method removal (AuthModule), withdrawal (ProfileModule) and operator deletion (AdminModule). */
@Module({
  providers: [KakaoUnlinkService],
  exports: [KakaoUnlinkService],
})
export class KakaoUnlinkModule {}
