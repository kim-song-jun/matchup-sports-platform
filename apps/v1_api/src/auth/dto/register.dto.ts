import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDefined, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { RequiredSignupProfileDto } from './required-signup-profile.dto';

export class RegisterDto extends RequiredSignupProfileDto {
  @IsString()
  @MinLength(2)
  nickname!: string;

  @IsString()
  @MinLength(3)
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsBoolean()
  requiredTermsAccepted!: boolean;

  @IsArray()
  @IsDefined()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  acceptedTermsDocumentIds?: string[];

  @IsOptional()
  @IsString()
  phoneProofToken?: string;
}
