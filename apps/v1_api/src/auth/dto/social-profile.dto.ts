import { IsBoolean, IsString, MinLength } from 'class-validator';
import { RequiredSignupProfileDto } from './required-signup-profile.dto';

export class SocialTermsDto {
  @IsBoolean()
  requiredTermsAccepted!: boolean;
}

export class SocialProfileDto extends RequiredSignupProfileDto {
  @IsString()
  @MinLength(2)
  nickname!: string;

}
