import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class GameLineupParticipantDto {
  @IsOptional()
  @IsUUID()
  participantId?: string;

  @IsString()
  @IsNotEmpty()
  displayNameSnapshot!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  jerseyNumber?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  position?: string;

  @IsBoolean()
  started!: boolean;
}

export class SaveGameLineupDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  clientCommandId!: string;

  @IsOptional()
  @IsString()
  formation?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GameLineupParticipantDto)
  participants!: GameLineupParticipantDto[];
}

export class SubmitGameLineupDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  clientCommandId!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  takeoverToken?: string;
}
