import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class TeamApplicationActionDto {
  @ApiPropertyOptional({
    description: 'Optional reason for accept or reject action (audit log only)',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class TeamApplicationUserDto {
  id!: string;
  nickname!: string;
  profileImageUrl!: string | null;
  mannerScore!: number;
}

export class TeamApplicationResponseDto {
  id!: string;
  teamId!: string;
  userId!: string;
  user!: TeamApplicationUserDto;
  createdAt!: Date;
}
