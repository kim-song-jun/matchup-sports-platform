import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [UploadsModule],
  controllers: [AdminController],
  providers: [AdminService, V1AuthGuard],
})
export class AdminModule {}
