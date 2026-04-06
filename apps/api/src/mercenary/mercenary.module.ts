import { Module } from '@nestjs/common';
import { MercenaryController } from './mercenary.controller';
import { MercenaryService } from './mercenary.service';
import { TeamsModule } from '../teams/teams.module';

@Module({
  imports: [TeamsModule],
  controllers: [MercenaryController],
  providers: [MercenaryService],
})
export class MercenaryModule {}
