import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  nickname!: string;

  @IsString()
  @MinLength(3)
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsIn(['male', 'female'])
  gender?: 'male' | 'female';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  displayName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/)
  phone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{8}$/)
  birthDate?: string;

  @IsOptional()
  @IsString()
  profileImageUrl?: string;

  @IsBoolean()
  requiredTermsAccepted!: boolean;
}
