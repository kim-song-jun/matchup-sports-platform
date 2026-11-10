import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDefined, IsUUID } from 'class-validator';
import { RequiredSignupProfileDto } from './required-signup-profile.dto';

export class SocialTermsDto {
  @IsBoolean()
  requiredTermsAccepted!: boolean;

  @IsBoolean()
  ageConfirmed!: boolean;

  @IsArray()
  @IsDefined()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  acceptedTermsDocumentIds?: string[];
}

/** The nickname is generated server-side, so it is not part of this payload (forbidNonWhitelisted rejects it). */
export class SocialProfileDto extends RequiredSignupProfileDto {}
