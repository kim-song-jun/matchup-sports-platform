import { Type } from 'class-transformer';
import { IsIn, IsInt, Min } from 'class-validator';

// Decision #1 (frozen contract deviation, documented per user instruction): the shipped
// Prisma enum V1AttendanceStatus (GOING | MAYBE | NOT_GOING | WAITLISTED) is canonical, not
// the contract's attending|not_attending|undecided prose. WAITLISTED is deliberately excluded
// here — it is server-derived only (see ScheduleAttendanceService) and must never be
// client-settable, so this DTO uses @IsIn with an explicit allowlist rather than
// @IsEnum(V1AttendanceStatus), which would have accepted WAITLISTED as valid client input.
const CLIENT_SETTABLE_ATTENDANCE_STATUSES = ['GOING', 'MAYBE', 'NOT_GOING'] as const;

export type ClientSettableAttendanceStatus = (typeof CLIENT_SETTABLE_ATTENDANCE_STATUSES)[number];

export class SetAttendanceDto {
  @IsIn(CLIENT_SETTABLE_ATTENDANCE_STATUSES)
  status!: ClientSettableAttendanceStatus;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}
