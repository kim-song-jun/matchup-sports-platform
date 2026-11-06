import { IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

/** Web sends `code` + `redirectUri` (OAuth authorization code); the native SDK sends `accessToken`. Exactly one form. */
export class LinkKakaoDto {
  @ValidateIf((dto: LinkKakaoDto) => dto.accessToken === undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  code?: string;

  @ValidateIf((dto: LinkKakaoDto) => dto.accessToken === undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  redirectUri?: string;

  // Not IsOptional: that also skips `null`, which would pass validation and then count as a present token.
  @ValidateIf((dto: LinkKakaoDto) => dto.accessToken !== undefined)
  @IsString()
  @MinLength(10)
  @MaxLength(4096)
  accessToken?: string;
}
