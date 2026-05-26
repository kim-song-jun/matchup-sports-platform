import { IsBoolean, IsIn, IsString, MinLength } from 'class-validator';

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
}
