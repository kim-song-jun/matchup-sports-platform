import { IsOptional, IsString, MinLength } from 'class-validator';

export class KakaoLoginDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsOptional()
  @IsString()
  redirectUri?: string;
}
