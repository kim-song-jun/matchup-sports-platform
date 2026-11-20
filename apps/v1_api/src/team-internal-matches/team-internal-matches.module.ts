import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { TeamInternalMatchesController } from './team-internal-matches.controller';
import { TeamInternalMatchesService } from './team-internal-matches.service';

@Module({
  controllers: [TeamInternalMatchesController],
  providers: [TeamInternalMatchesService, V1AuthGuard],
})
export class TeamInternalMatchesModule {}
