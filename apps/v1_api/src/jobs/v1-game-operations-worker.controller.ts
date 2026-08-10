import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { GameOperationFlagsService } from '../config/game-operation-flags';
import { V1GameOperationsWorkerService } from './v1-game-operations-worker.service';

class RequeueGameOperationJobDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(1_000)
  reason!: string;
}

@Controller('game-operations-worker')
export class V1GameOperationsWorkerController {
  constructor(private readonly worker: V1GameOperationsWorkerService) {}

  @Get('health')
  async health() {
    return this.worker.getHealth();
  }

  @Get('metrics')
  async metrics() {
    return this.worker.getMetrics();
  }
}

@Controller('tournament-ops/jobs')
@UseGuards(V1AuthGuard)
export class V1GameOperationsJobsController {
  constructor(private readonly flags: GameOperationFlagsService) {}

  @Post(':jobId/requeue')
  requeue(
    @CurrentUser() user: V1AuthUser,
    @Param('jobId') jobId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: RequeueGameOperationJobDto,
  ) {
    return this.flags.requeueJob(user.id, jobId, dto, idempotencyKey);
  }
}
