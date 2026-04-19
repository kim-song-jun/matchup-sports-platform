import { IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({ description: 'Enable match notifications' })
  @IsOptional()
  @IsBoolean()
  matchEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable team notifications' })
  @IsOptional()
  @IsBoolean()
  teamEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable chat notifications' })
  @IsOptional()
  @IsBoolean()
  chatEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable payment notifications' })
  @IsOptional()
  @IsBoolean()
  paymentEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable team application notifications (received/accepted/rejected)' })
  @IsOptional()
  @IsBoolean()
  teamApplicationEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable match completed notifications' })
  @IsOptional()
  @IsBoolean()
  matchCompletedEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable ELO rating change notifications' })
  @IsOptional()
  @IsBoolean()
  eloChangedEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable individual chat message notifications' })
  @IsOptional()
  @IsBoolean()
  chatMessageEnabled?: boolean;
}

/** @deprecated Use UpdateNotificationPreferencesDto (plural). Kept for backward-compat import in service. */
export class UpdateNotificationPreferenceDto extends UpdateNotificationPreferencesDto {}

export class NotificationPreferencesResponseDto {
  @ApiProperty({ description: 'Preference row id (null when using defaults)', nullable: true })
  id!: string | null;

  @ApiProperty({ description: 'Enable match notifications', default: true })
  matchEnabled!: boolean;

  @ApiProperty({ description: 'Enable team notifications', default: true })
  teamEnabled!: boolean;

  @ApiProperty({ description: 'Enable chat notifications', default: true })
  chatEnabled!: boolean;

  @ApiProperty({ description: 'Enable payment notifications', default: true })
  paymentEnabled!: boolean;

  @ApiProperty({ description: 'Enable team application notifications', default: true })
  teamApplicationEnabled!: boolean;

  @ApiProperty({ description: 'Enable match completed notifications', default: true })
  matchCompletedEnabled!: boolean;

  @ApiProperty({ description: 'Enable ELO rating change notifications', default: true })
  eloChangedEnabled!: boolean;

  @ApiProperty({ description: 'Enable individual chat message notifications', default: true })
  chatMessageEnabled!: boolean;
}
