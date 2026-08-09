import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  GameOperationFlagKey,
  GameOperationFlagsService,
} from './game-operation-flags';

const FLAG_KEYS: GameOperationFlagKey[] = [
  'GAME_WRITE',
  'GAME_READ',
  'PUBLIC_LIVE',
  'DIRECTOR_OFFICIALIZE',
];

export class PatchGameOperationFlagDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsIn(['legacy', 'compare', 'new', 'off', 'on'])
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

export class GameOperationFlagTransitionDto {
  @IsString()
  @IsIn(FLAG_KEYS)
  key!: GameOperationFlagKey;

  @IsString()
  @IsIn(['legacy', 'compare', 'new', 'off', 'on'])
  from!: string;

  @IsString()
  @IsIn(['legacy', 'compare', 'new', 'off', 'on'])
  to!: string;
}

export class ExpectedGameOperationFlagVersionsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  GAME_WRITE?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  GAME_READ?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  PUBLIC_LIVE?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  DIRECTOR_OFFICIALIZE?: number;
}

export class TupleGameOperationFlagsDto {
  @ValidateNested()
  @Type(() => ExpectedGameOperationFlagVersionsDto)
  expectedVersions!: ExpectedGameOperationFlagVersionsDto;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => GameOperationFlagTransitionDto)
  transitions!: GameOperationFlagTransitionDto[];

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

@Controller('tournament-ops/operation-flags')
@UseGuards(V1AuthGuard)
export class GameOperationFlagsController {
  constructor(private readonly flags: GameOperationFlagsService) {}

  @Post('tuple-transition')
  tupleTransition(
    @CurrentUser() user: V1AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: TupleGameOperationFlagsDto,
  ) {
    return this.flags.tupleTransition(user.id, dto, idempotencyKey);
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
}
