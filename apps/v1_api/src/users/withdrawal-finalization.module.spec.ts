import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from '../prisma/prisma.module';
import { WithdrawalFinalizationModule } from './withdrawal-finalization.module';
import { WithdrawalFinalizationService } from './withdrawal-finalization.service';

describe('WithdrawalFinalizationModule', () => {
  it('provides the job with the global database and logger it needs', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, LoggerModule.forRoot(), WithdrawalFinalizationModule],
    }).compile();

    expect(moduleRef.get(WithdrawalFinalizationService)).toBeInstanceOf(WithdrawalFinalizationService);
    await moduleRef.close();
  });
});
