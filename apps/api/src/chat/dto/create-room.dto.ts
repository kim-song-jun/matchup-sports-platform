import { IsEnum, IsArray, IsString, ArrayMinSize, IsOptional, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChatRoomType } from '@prisma/client';

export class CreateRoomDto {
  @ApiProperty({ enum: ChatRoomType, description: 'Room type' })
  @IsEnum(ChatRoomType)
  type: ChatRoomType;

  @ApiPropertyOptional({ description: 'TeamMatch ID (required when type is team_match)' })
  @ValidateIf((o: CreateRoomDto) => o.type === ChatRoomType.team_match)
  @IsString()
  teamMatchId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Participant IDs (ignored for team_match type — derived server-side)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  participantIds?: string[];
}
