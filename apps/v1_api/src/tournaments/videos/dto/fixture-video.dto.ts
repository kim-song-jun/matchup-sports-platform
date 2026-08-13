import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { FIXTURE_VIDEO_URL_MAX_LENGTH } from '../fixture-video-url';

export const FIXTURE_VIDEO_TITLE_MAX_LENGTH = 80;

const trimmed = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** 외부 링크 또는 이미 업로드된 파일 URL 을 경기에 등록한다. */
export class CreateFixtureVideoDto {
  /** 표시 제목 (예: "전반 하이라이트") — 없으면 재생 UI 가 "경기 영상 N"으로 표시한다. */
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(FIXTURE_VIDEO_TITLE_MAX_LENGTH)
  title?: string;

  /**
   * 스킴·경로 검증은 `parseFixtureVideoUrl()` 한 곳에서만 한다 — 여기서 `@IsUrl()` 을 겹쳐
   * 걸면 업로드 파일의 루트-상대 경로(`/uploads/...`)가 먼저 튕겨 나가고, 거부 사유도 두
   * 군데로 갈라진다.
   */
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(FIXTURE_VIDEO_URL_MAX_LENGTH)
  url!: string;
}

/**
 * multipart 업로드 + 등록을 한 번에 하는 경로의 본문. 파일은 `files` 필드(1개)로 받고,
 * 여기서는 함께 온 텍스트 필드만 검증한다.
 */
export class UploadFixtureVideoDto {
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(FIXTURE_VIDEO_TITLE_MAX_LENGTH)
  title?: string;
}
