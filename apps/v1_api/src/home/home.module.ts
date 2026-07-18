import { Module } from '@nestjs/common';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { PopupsModule } from '../popups/popups.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  imports: [PopupsModule],
  controllers: [HomeController],
  providers: [HomeService, OptionalV1AuthGuard],
})
export class HomeModule {}
