import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminOpsModule } from './ops/admin-ops.module';

@Module({
  imports: [AdminOpsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
