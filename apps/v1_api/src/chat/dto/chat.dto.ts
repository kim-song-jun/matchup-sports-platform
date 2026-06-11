import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class ChatRoomsQueryDto {
  @IsOptional()
  @IsIn(['match', 'team', 'team_match'])
  roomType?: 'match' | 'team' | 'team_match';

  @IsOptional()
  @IsIn(['active', 'archived'])
  status?: 'active' | 'archived';

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class ResolveChatRoomDto {
  @IsIn(['match', 'team', 'team_match'])
  targetType!: 'match' | 'team' | 'team_match';

  @IsUUID()
  targetId!: string;
}

export class ChatMessagesQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn(['before', 'after'])
  direction?: 'before' | 'after';
}

export class SendChatMessageDto {
  @IsString()
  @MaxLength(2000)
  content!: string;
}

export class UpdateMyChatRoomDto {
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsUUID()
  lastReadMessageId?: string | null;

  @IsOptional()
  @IsDateString()
  mutedUntil?: string | null;
}

export class LeaveChatRoomDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}
