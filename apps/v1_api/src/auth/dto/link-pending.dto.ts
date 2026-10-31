import { IsString, MaxLength, MinLength } from 'class-validator';

/** The `details.linkToken` of a social sign-in or signup conflict. */
export class LinkPendingDto {
  @IsString()
  @MinLength(20)
  @MaxLength(2048)
  linkToken!: string;
}
