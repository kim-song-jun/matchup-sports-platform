import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDefined, IsString, IsUUID, MinLength } from 'class-validator';
import { RequiredSignupProfileDto } from './required-signup-profile.dto';

export class SocialTermsDto {
  @IsBoolean()
  requiredTermsAccepted!: boolean;

  @IsArray()
  @IsDefined()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  acceptedTermsDocumentIds?: string[];
}

export class SocialProfileDto extends RequiredSignupProfileDto {
  @IsString()
  @MinLength(2)
  nickname!: string;

}
