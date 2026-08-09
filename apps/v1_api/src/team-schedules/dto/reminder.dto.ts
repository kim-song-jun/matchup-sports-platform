import { IsIn } from 'class-validator';

/**
 * Decision #2 (user instruction): reminder `kind` allowlist is exactly these two values,
 * spelled verbatim ('guest_recruitment_close', not '_closing'). @IsIn rejects anything else
 * with the global ValidationPipe's 400 VALIDATION_ERROR (forbidNonWhitelisted convention),
 * not a 422 — matching this repo's established convention that class-validator failures are
 * pinned to 400.
 */
export class TriggerReminderDto {
  @IsIn(['rsvp_deadline', 'guest_recruitment_close'])
  kind!: 'rsvp_deadline' | 'guest_recruitment_close';
}
