import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * What the iOS shell collected from the Apple sheet.
 *
 * `fullName` is optional and arrives **only on the very first authorization** — Apple never
 * sends it again, not even after the app is deleted and reinstalled. That is why it is
 * carried here at all rather than read back later: if it is not stored on this request, the
 * name is gone for good and the reader has to type it in during onboarding.
 */
export class AppleLoginDto {
  /** The RS256 JWT Apple signed. Verified against Apple's published keys, never trusted as sent. */
  @IsString()
  @MinLength(20)
  @MaxLength(8192)
  identityToken!: string;

  /** The nonce this server issued for this sign-in, unhashed. */
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  nonce!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  fullName?: string;
}
