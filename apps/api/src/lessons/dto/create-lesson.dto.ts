import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsNotEmpty,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SportType, LessonType } from '@prisma/client';

export class CreateLessonDto {
  @ApiProperty({ enum: SportType, description: '종목' })
  @IsEnum(SportType)
  sportType!: SportType;

  @ApiProperty({ enum: LessonType, description: '강좌 유형' })
  @IsEnum(LessonType)
  type!: LessonType;

  @ApiProperty({ description: '강좌 제목', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: '강좌 설명' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: '구장 ID (등록된 구장 연결)' })
  @IsString()
  @IsOptional()
  venueId?: string;

  @ApiPropertyOptional({ description: '구장 직접 입력 이름', maxLength: 200 })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  venueName?: string;

  @ApiProperty({ description: '강좌 날짜 (ISO8601 날짜)' })
  @IsDateString()
  lessonDate!: string;

  @ApiProperty({ description: '시작 시간 (HH:MM)', example: '10:00' })
  @IsString()
  @IsNotEmpty()
  startTime!: string;

  @ApiProperty({ description: '종료 시간 (HH:MM)', example: '12:00' })
  @IsString()
  @IsNotEmpty()
  endTime!: string;

  @ApiProperty({ description: '최대 참가 인원', minimum: 1 })
  @IsInt()
  @Min(1)
  maxParticipants!: number;

  @ApiPropertyOptional({ description: '참가비 (원)', minimum: 0, default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  fee?: number;

  @ApiPropertyOptional({ description: '최소 레벨', minimum: 1, maximum: 5, default: 1 })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  levelMin?: number;

  @ApiPropertyOptional({ description: '최대 레벨', minimum: 1, maximum: 5, default: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  levelMax?: number;

  @ApiPropertyOptional({ description: '코치 이름', maxLength: 100 })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  coachName?: string;

  @ApiPropertyOptional({ description: '코치 소개' })
  @IsString()
  @IsOptional()
  coachBio?: string;

  @ApiPropertyOptional({ description: '강좌 이미지 URL 목록', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  imageUrls?: string[];

  @ApiPropertyOptional({ description: '반복 일정 여부', default: false })
  @IsBoolean()
  @IsOptional()
  isRecurring?: boolean;

  @ApiPropertyOptional({ description: '반복 요일 (0=일, 1=월, ...6=토)', type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  recurringDays?: number[];

  @ApiPropertyOptional({ description: '반복 종료일 (ISO8601 날짜)' })
  @IsDateString()
  @IsOptional()
  recurringUntil?: string;
}
