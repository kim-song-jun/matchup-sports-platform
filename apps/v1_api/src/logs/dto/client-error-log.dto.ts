import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class ClientErrorLogDto {
  @IsString()
  @MaxLength(4000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  stack?: string;

  @IsString()
  @MaxLength(2000)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  userAgent?: string;

  @IsIn(['error', 'warn'])
  level!: 'error' | 'warn';

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
