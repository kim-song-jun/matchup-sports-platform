import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class KakaoLoginDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsOptional()
  @IsString()
  redirectUri?: string;
}

export class KakaoTokenLoginDto {
  @IsString()
  @MinLength(10)
  @MaxLength(4096)
  accessToken!: string;
}
