import { Transform, Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class AdminOverviewQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ChangeUserStatusDto {
  @IsIn(['active', 'suspended', 'blocked', 'deleted'])
  status!: 'active' | 'suspended' | 'blocked' | 'deleted';

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class ChangeMatchStatusDto {
  @IsIn(['recruiting', 'closed', 'cancelled', 'completed', 'archived'])
  status!: 'recruiting' | 'closed' | 'cancelled' | 'completed' | 'archived';

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class ChangeTeamStatusDto {
  @IsIn(['active', 'suspended', 'archived'])
  status!: 'active' | 'suspended' | 'archived';

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class ChangeTeamMatchStatusDto {
  @IsIn(['recruiting', 'matched', 'cancelled', 'completed', 'archived'])
  status!: 'recruiting' | 'matched' | 'cancelled' | 'completed' | 'archived';

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class AdminLogsQueryDto {
  @IsOptional()
  @IsUUID()
  adminUserId?: string;

  @IsOptional()
  @IsString()
  targetType?: string;

  @IsOptional()
  @IsString()
  targetId?: string;

  @IsOptional()
  @IsString()
  actionType?: string;

  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class OpsQueueQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  targetType?: string;

  @IsOptional()
  @IsString()
  targetId?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class ReportActionDto {
  @IsIn(['assign', 'review', 'resolve', 'dismiss'])
  action!: 'assign' | 'review' | 'resolve' | 'dismiss';

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolutionNote?: string;
}

export class DisputeActionDto {
  @IsIn(['assign', 'wait', 'resolve', 'reject'])
  action!: 'assign' | 'wait' | 'resolve' | 'reject';

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolutionNote?: string;
}

export class CreatePaymentOrderDto {
  @IsOptional()
  @IsUUID()
  buyerUserId?: string;

  @IsString()
  @MaxLength(80)
  sourceType!: string;

  @IsString()
  @MaxLength(120)
  sourceId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @IsString()
  @MaxLength(120)
  orderName!: string;
}

export class ConfirmPaymentDto {
  @IsString()
  @MaxLength(240)
  paymentKey!: string;

  @IsString()
  @MaxLength(120)
  orderId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;
}

export class TossWebhookDto {
  @IsString()
  @MaxLength(120)
  eventType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  paymentKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  orderId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  amount?: number;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class RefundPaymentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class SettlementActionDto {
  @IsIn(['review', 'approve', 'hold', 'fail'])
  action!: 'review' | 'approve' | 'hold' | 'fail';

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class PayoutRequestDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount?: number;
}

function trimString({ value }: { value: unknown }) {
  return typeof value === 'string' ? value.trim() : value;
}
