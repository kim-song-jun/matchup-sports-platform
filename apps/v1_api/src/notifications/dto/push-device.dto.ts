import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { V1PushPlatform } from '@prisma/client';

export class RegisterPushDeviceDto {
  @IsUUID()
  installationId!: string;

  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  token!: string;

  /**
   * Required, not defaulted.
   *
   * A default would let a client that forgot the field register as the wrong platform, and
   * the send path would then hand an APNs token to Firebase — a failure that looks like
   * "notifications just stop" rather than an error anyone sees.
   */
  @IsEnum(V1PushPlatform)
  platform!: V1PushPlatform;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  appVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceModel?: string;
}
