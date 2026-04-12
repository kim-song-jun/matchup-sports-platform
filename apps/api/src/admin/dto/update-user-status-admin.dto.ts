import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { AdminUserStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdateUserStatusAdminDto {
  @ApiProperty({ enum: AdminUserStatus, description: '변경할 관리자 상태' })
  @IsEnum(AdminUserStatus)
  status!: AdminUserStatus;

  @ApiProperty({ required: false, description: '운영 메모', maxLength: 500 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @ValidateIf((object: UpdateUserStatusAdminDto, value: unknown) => (
    object.status === AdminUserStatus.suspended || value !== undefined
  ))
  @IsString()
  @MaxLength(500)
  @IsNotEmpty({ message: '계정 정지 사유를 입력해주세요.' })
  note?: string;
}
