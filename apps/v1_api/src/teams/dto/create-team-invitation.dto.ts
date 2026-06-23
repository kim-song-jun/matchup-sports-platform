import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTeamInvitationDto {
  @IsEmail()
  invitedEmail: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  message?: string;
}
