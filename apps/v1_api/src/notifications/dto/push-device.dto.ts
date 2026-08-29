import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class RegisterPushDeviceDto {
  @IsUUID()
  installationId!: string;

  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  token!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  appVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceModel?: string;
}
