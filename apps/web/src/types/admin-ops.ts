// Admin Ops types for Task 76 — operational observability dashboard.
// These types map to GET /admin/ops/summary and GET /admin/ops/recent-push-failures.

/** KPI snapshot returned by GET /admin/ops/summary. All fields are counts. */
export interface AdminOpsSummary {
  /** Matches with status=ongoing or scheduledAt within the last 3 hours and not yet complete. */
  matchesInProgress: number;
  /** Payments with status in (pending, processing) created within the last 24 hours. */
  paymentsPending: number;
  /** Disputes with status in (filed, seller_responded, admin_reviewing). */
  disputesOpen: number;
  /** SettlementRecords with status in (pending, held) and payoutId is null. */
  settlementsPending: number;
  /** Payouts with status=failed. */
  payoutsFailed: number;
  /** Web push failure count in the last 5 minutes (from WebPushFailureLog). */
  pushFailures5m: number;
}

/** A single web push failure log row returned by GET /admin/ops/recent-push-failures.
 * PII is redacted: endpoint is the last-6-char suffix; userId is sha256 8-char hash. */
export interface RecentPushFailure {
  id: string;
  /** Last 6 characters of the push subscription endpoint. */
  endpointSuffix: string;
  /** SHA-256 hash of the userId, truncated to 8 characters. */
  userIdHash: string;
  /** HTTP status code returned by the push service (e.g. 410, 500). */
  statusCode: number;
  /** Structured error code from the push service response (e.g. "UnsubscribeExpired"). */
  errorCode: string | null;
  /** ISO 8601 timestamp when the failure occurred. */
  occurredAt: string;
  /** ISO 8601 timestamp when an admin acknowledged this failure window; null if not yet acked. */
  acknowledgedAt: string | null;
}

/** Response from POST /admin/ops/push-failures/ack. */
export interface AckPushFailuresResponse {
  acknowledged: number;
}
