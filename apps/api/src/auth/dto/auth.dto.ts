import { IsString, IsOptional, IsEmail, MinLength, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

export class EmailRegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: '축구왕민수' })
  @IsString()
  @IsNotEmpty()
  nickname: string;
}

export class EmailLoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  password: string;
}

/** Dev-only: typed DTO so class-validator can reject malformed dev-login bodies. */
export class DevLoginDto {
  @ApiPropertyOptional({ example: '테스트유저', description: 'Nickname to log in or create (dev environment only)', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;
}
