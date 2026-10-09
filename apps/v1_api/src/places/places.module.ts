import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PlaceSearchService } from './place-search.service';
import { PlacesController } from './places.controller';

@Module({
  imports: [IntegrationsModule],
  controllers: [PlacesController],
  providers: [PlaceSearchService, V1AuthGuard],
})
export class PlacesModule {}
