import { Module } from '@nestjs/common';
import { KakaoUnlinkModule } from '../auth/kakao-unlink.module';
import { WithdrawalFinalizationService } from './withdrawal-finalization.service';

/** Imported once, by AppModule: every module that imports it would run its own hourly job. */
@Module({ imports: [KakaoUnlinkModule], providers: [WithdrawalFinalizationService] })
export class WithdrawalFinalizationModule {}
