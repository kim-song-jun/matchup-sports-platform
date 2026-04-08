import { IsString, IsOptional, IsEnum, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TeamRole } from '@prisma/client';

export class AddMemberDto {
  @ApiProperty({ description: 'User ID to add as member' })
  @IsString()
  userId: string;

  @ApiPropertyOptional({ enum: TeamRole, description: 'Role to assign (defaults to member)' })
  @IsOptional()
  @IsEnum(TeamRole)
  role?: TeamRole;
}

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: TeamRole, description: 'New role to assign' })
  @IsEnum(TeamRole)
  role: TeamRole;
}

export class TransferOwnershipDto {
  @ApiProperty({ description: 'User ID of the new owner (must be an active team member)' })
  @IsString()
  toUserId: string;

  @ApiProperty({ enum: ['manager', 'member'], description: 'Role to assign to the current owner after transfer' })
  @IsIn(['manager', 'member'])
  demoteTo: 'manager' | 'member';
}

export class InviteMemberDto {
  @ApiProperty({ description: 'User ID to invite' })
  @IsString()
  inviteeId: string;

  @ApiPropertyOptional({ enum: ['manager', 'member'], description: 'Role to assign upon acceptance (defaults to member)' })
  @IsOptional()
  @IsIn(['manager', 'member'])
  role?: 'manager' | 'member';
}
