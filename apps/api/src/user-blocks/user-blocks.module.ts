import { Module } from '@nestjs/common';
import { UserBlocksController } from './user-blocks.controller';
import { UserBlocksService } from './user-blocks.service';

@Module({
  controllers: [UserBlocksController],
  providers: [UserBlocksService],
  exports: [UserBlocksService],
})
export class UserBlocksModule {}
