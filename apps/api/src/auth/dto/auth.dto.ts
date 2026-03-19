import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OAuthLoginDto {
  @ApiProperty({ description: 'OAuth 인증 코드' })
  @IsString()
  code: string;

  @ApiProperty({ description: '리다이렉트 URI', required: false })
  @IsString()
  @IsOptional()
  redirectUri?: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: '리프레시 토큰' })
  @IsString()
  refreshToken: string;
}
