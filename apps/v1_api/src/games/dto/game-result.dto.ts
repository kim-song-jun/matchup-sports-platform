import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class GameScoreDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  home!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  away!: number;

  @IsOptional()
  @IsObject()
  penalties?: { home: number; away: number };
}

export class GameResultParticipantDto {
  @IsUUID()
  participantId!: string;

  @IsUUID()
  sideId!: string;

  @IsBoolean()
  started!: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minutesPlayed?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  goals!: number;

  @IsObject()
  cards!: { yellow: number; red: number };

  @IsBoolean()
  goalkeeper!: boolean;
}

export class CreateGameResultRevisionDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  clientCommandId!: string;

  @ValidateNested()
  @Type(() => GameScoreDto)
  score!: GameScoreDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GameResultParticipantDto)
  actualParticipants!: GameResultParticipantDto[];

  @IsString()
  @IsNotEmpty()
  eventsHash!: string;

  @IsOptional()
  @IsUUID()
  mvpParticipantId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reason?: string;
}

export class SubmitGameResultRevisionDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  clientCommandId!: string;
}

export class DecideGameResultRevisionDto extends SubmitGameResultRevisionDto {
  @IsIn(['approve', 'change_request'])
  decision!: 'approve' | 'change_request';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reason?: string;
}
