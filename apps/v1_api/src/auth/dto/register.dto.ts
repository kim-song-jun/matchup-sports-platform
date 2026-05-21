import { IsBoolean, IsString, MinLength } from 'class-validator';

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

  @IsBoolean()
  requiredTermsAccepted!: boolean;
}
