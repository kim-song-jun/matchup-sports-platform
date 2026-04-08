import { IsEnum, IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportTargetType, ReportStatus } from '@prisma/client';

export class CreateReportDto {
  @ApiProperty({ enum: ReportTargetType, description: '신고 대상 유형' })
  @IsEnum(ReportTargetType)
  targetType: ReportTargetType;

  @ApiProperty({ description: '신고 대상 ID' })
  @IsString()
  targetId: string;

  @ApiProperty({ description: '신고 사유', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  reason: string;

  @ApiPropertyOptional({ description: '상세 설명', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class UpdateReportStatusDto {
  @ApiProperty({ enum: ReportStatus, description: '변경할 신고 상태' })
  @IsEnum(ReportStatus)
  status: ReportStatus;
}
