import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecentPushFailureDto {
  @ApiProperty({ description: 'WebPushFailureLog record ID' })
  id: string;

  @ApiProperty({ description: 'Last 6 characters of the push endpoint (PII-safe)' })
  endpointSuffix: string;

  @ApiProperty({ description: 'SHA-256 hash of userId, first 8 hex chars (PII-safe)' })
  userIdHash: string;

  @ApiPropertyOptional({ description: 'HTTP status code returned by the push service' })
  statusCode: number | null;

  @ApiPropertyOptional({ description: 'Error code string returned by the push service' })
  errorCode: string | null;

  @ApiProperty({ description: 'Timestamp when the failure occurred' })
  occurredAt: Date;

  @ApiPropertyOptional({ description: 'Timestamp when an admin acknowledged this failure, if any' })
  acknowledgedAt: Date | null;
}
