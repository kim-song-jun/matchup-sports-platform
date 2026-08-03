import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

/**
 * W10 fix: the frozen contract (docs/api/global-contract.md:59) states schedule transitions are
 * literally `scheduled -> cancelled|completed` — but nothing in the originally-shipped Task 12
 * code ever moved a schedule into COMPLETED (the `status=completed` filter on GET /me/schedule
 * was reachable-but-dead). This DTO backs an explicit, versioned completion mutation
 * (TeamSchedulesService.complete(), mirrored on the same CAS + idempotency pattern as cancel()),
 * making COMPLETED an honest, reachable terminal state instead of a query-only one.
 */
export class CompleteScheduleDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}
