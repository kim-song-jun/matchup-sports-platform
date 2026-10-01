import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class ChatRoomsQueryDto {
  @IsOptional()
  @IsIn(['match', 'team', 'team_match', 'team_contact'])
  roomType?: 'match' | 'team' | 'team_match' | 'team_contact';

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
  @IsIn(['match', 'team', 'team_match', 'team_contact'])
  targetType!: 'match' | 'team' | 'team_match' | 'team_contact';

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

/** 텍스트(`content`) 또는 사진(`imageUrl`) 중 **하나**. 둘 다·둘 다 없음은 서비스가 400 으로 막는다. */
export class SendChatMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  /** 사진 메시지 — `POST /uploads` 가 돌려준 루트 상대 URL(`/uploads/...`). 보내는 사람이 올린 이미지여야 한다. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  imageUrl?: string;
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

export class ReportChatMessageDto {
  @IsIn(['spam', 'harassment', 'impersonation', 'inappropriate', 'other'])
  reason!: 'spam' | 'harassment' | 'impersonation' | 'inappropriate' | 'other';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  detail?: string;
}
