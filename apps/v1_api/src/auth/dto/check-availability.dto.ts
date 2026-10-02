import { IsNotEmpty, IsString } from 'class-validator';

// Format rules stay in AuthService; these only guarantee the value is present.
export class CheckEmailQueryDto {
  @IsString()
  @IsNotEmpty()
  email!: string;
}

export class CheckNicknameQueryDto {
  @IsString()
  @IsNotEmpty()
  nickname!: string;
}
