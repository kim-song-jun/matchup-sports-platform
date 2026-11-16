import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { MasterController } from './master.controller';
import { MasterService } from './master.service';

@Module({
  imports: [IntegrationsModule],
  controllers: [MasterController],
  providers: [MasterService],
})
export class MasterModule {}
