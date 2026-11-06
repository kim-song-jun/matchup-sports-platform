import { Module } from '@nestjs/common';
import { WithdrawalFinalizationService } from './withdrawal-finalization.service';

/** Imported once, by AppModule: every module that imports it would run its own hourly job. */
@Module({ providers: [WithdrawalFinalizationService] })
export class WithdrawalFinalizationModule {}
