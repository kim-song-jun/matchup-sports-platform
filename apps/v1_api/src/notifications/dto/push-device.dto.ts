import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { V1ApnsEnvironment, V1PushPlatform } from '@prisma/client';

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

  /**
   * Which APNs gateway issued this token, as the build's own signature reports it.
   *
   * Optional rather than required, unlike `platform`, and the difference is deliberate: a
   * build is already in testers' hands that predates this field, and rejecting its
   * registration would leave it unable to register at all. Omitting it falls back to the
   * server's environment — the behaviour every existing registration already has. An
   * unrecognised value is still rejected, because that can only be a client bug.
   *
   * Meaningless for Android, which has a single gateway; stored as null there.
   */
  @IsOptional()
  @IsEnum(V1ApnsEnvironment)
  apnsEnvironment?: V1ApnsEnvironment;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  appVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceModel?: string;
}
