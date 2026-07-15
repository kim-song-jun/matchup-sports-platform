import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SocialTermsDto {
  @IsBoolean()
  requiredTermsAccepted!: boolean;
}

export class SocialProfileDto {
  @IsString()
  @MinLength(2)
  nickname!: string;

  @IsIn(['male', 'female'])
  gender!: 'male' | 'female';

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
}
