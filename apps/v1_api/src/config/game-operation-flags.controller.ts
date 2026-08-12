import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { GameOperationFlagsService } from './game-operation-flags';

export class PatchGameOperationFlagDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsIn(['off', 'on'])
  value!: string;

  @IsString()
  @MinLength(1)
  gateBundlePath!: string;

  @IsString()
  @MinLength(64)
  @MaxLength(64)
  gateBundleHash!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1_000)
  reason!: string;
}

export class SimplifiedPatchGameOperationFlagDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsIn(['off', 'on'])
  value!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1_000)
  reason!: string;
}

export class SetSimplifiedGateDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(1_000)
  reason!: string;
}

@Controller('tournament-ops/operation-flags')
@UseGuards(V1AuthGuard)
export class GameOperationFlagsController {
  constructor(private readonly flags: GameOperationFlagsService) {}

  // Retired (Task 10 cutover cleanup): a `POST tuple-transition` route used to live here, atomically
  // rolling `GAME_READ`/`GAME_WRITE` backward together (the only pair `tupleTransition()` ever
  // accepted). Both flags are gone -- see `GameOperationFlagKey` in ./game-operation-flags.ts -- so
  // there is nothing left to roll back through it.

  @Get('simplified-gate/status')
  getSimplifiedGateStatus(@CurrentUser() user: V1AuthUser) {
    return this.flags.getSimplifiedGateStatus(user.id);
  }

  // Must stay above `@Patch(':key')` -- otherwise Nest's router would swallow this as
  // `:key='simplified-gate'` (same reason `@Get('simplified-gate/status')` above is also
  // declared before `@Get(':key')`).
  @Patch('simplified-gate')
  setSimplifiedGate(
    @CurrentUser() user: V1AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: SetSimplifiedGateDto,
  ) {
    return this.flags.setSimplifiedGate(user.id, dto, idempotencyKey);
  }

  @Get(':key')
  getFlag(@CurrentUser() user: V1AuthUser, @Param('key') key: string) {
    return this.flags.getFlag(user.id, key);
  }

  @Patch(':key')
  patchFlag(
    @CurrentUser() user: V1AuthUser,
    @Param('key') key: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: PatchGameOperationFlagDto,
  ) {
    return this.flags.patchFlag(user.id, key, dto, idempotencyKey);
  }

  // Admin fast path for both operation flags -- see `SIMPLIFIED_GATE_ALLOWED_KEYS`'s doc
  // comment in ./game-operation-flags.ts for what this does and does not relax. Whether this is
  // reachable at all is controlled by `v1_game_operation_gate_settings` (setSimplifiedGate below),
  // not by which environment this process runs in.
  @Patch(':key/simplified-toggle')
  simplifiedPatchFlag(
    @CurrentUser() user: V1AuthUser,
    @Param('key') key: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: SimplifiedPatchGameOperationFlagDto,
  ) {
    return this.flags.simplifiedPatchFlag(user.id, key, dto, idempotencyKey);
  }
}
