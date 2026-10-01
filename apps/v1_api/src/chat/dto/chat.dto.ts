import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

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

export const CHAT_SHARE_KINDS = ['team_schedule', 'match'] as const;
export type ChatShareKind = (typeof CHAT_SHARE_KINDS)[number];

/** 공유할 대상 — 서버가 보내는 사람의 열람 권한을 확인하고 제목·일시·장소를 스냅숏한다(Task 181 ②). */
export class ChatShareTargetDto {
  @IsIn(CHAT_SHARE_KINDS)
  kind!: ChatShareKind;

  @IsUUID()
  targetId!: string;
}

/** 텍스트(`content`) · 사진(`imageUrl`) · 공유(`share`) · 파일(`fileId`) 중 **하나**. 여러 개·하나도 없음은 서비스가 400 으로 막는다. */
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

  // @IsObject 가 없으면 `share: []` 가 ValidateNested 를 그냥 통과한다(검사할 원소가 없어서) — 대상 없는 공유를 막는다.
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ChatShareTargetDto)
  share?: ChatShareTargetDto;

  /** 파일 메시지 — `POST /uploads/files` 가 돌려준 `fileId`. 보내는 사람이 올린 파일이어야 한다(Task 181 ③). */
  @IsOptional()
  @IsUUID()
  fileId?: string;
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
