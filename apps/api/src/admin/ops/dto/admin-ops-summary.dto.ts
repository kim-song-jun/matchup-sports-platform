import { ApiProperty } from '@nestjs/swagger';

export class AdminOpsSummaryDto {
  @ApiProperty({ description: 'Matches currently in progress (status = in_progress)' })
  matchesInProgress: number;

  @ApiProperty({ description: 'Payments in pending state created within the last 24 hours' })
  paymentsPending: number;

  @ApiProperty({ description: 'Disputes in filed / seller_responded / admin_reviewing state' })
  disputesOpen: number;

  @ApiProperty({ description: 'SettlementRecords in pending or held state with no payout assigned' })
  settlementsPending: number;

  @ApiProperty({ description: 'Payouts in failed state' })
  payoutsFailed: number;

  @ApiProperty({ description: 'Web push failure log entries in the last 5 minutes that have not been acknowledged' })
  pushFailures5m: number;
}
