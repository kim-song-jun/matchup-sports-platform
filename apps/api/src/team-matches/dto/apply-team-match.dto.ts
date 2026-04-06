import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsString, IsBoolean } from 'class-validator';

export class ApplyTeamMatchDto {
  @ApiProperty() @IsUUID() applicantTeamId!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() message?: string;
  @ApiProperty({ required: false, default: false }) @IsOptional() @IsBoolean() confirmedInfo?: boolean;
  @ApiProperty({ required: false, default: false }) @IsOptional() @IsBoolean() confirmedLevel?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() proPlayerCheck?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() mercenaryCheck?: boolean;
}
