import { IsDefined, IsString, MaxLength, ValidateIf } from 'class-validator';
import { IsSafeImageUrl } from '../../common/safe-image-url';

export class UpdateLeagueCoverImageDto {
  /** 키는 필수이고 null 이 제거다. 업로드가 만든 `/uploads/…` 경로만 받는다. */
  @ValidateIf((_object, value) => value !== null)
  @IsDefined()
  @IsString()
  @MaxLength(1000)
  @IsSafeImageUrl({ localUploadsOnly: true })
  coverImageUrl!: string | null;
}
