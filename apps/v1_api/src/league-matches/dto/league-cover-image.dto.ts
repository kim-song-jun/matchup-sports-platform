import { IsDefined, IsString, MaxLength, ValidateIf } from 'class-validator';
import { IsSafeImageUrl } from '../../common/safe-image-url';

export class UpdateLeagueCoverImageDto {
  /** 최소 한 이미지 키가 필요하다. 생략은 유지, null은 해당 이미지만 제거한다. */
  @ValidateIf((object, value) => value !== null && (value !== undefined || object.listImageUrl === undefined))
  @IsDefined()
  @IsString()
  @MaxLength(1000)
  @IsSafeImageUrl({ localUploadsOnly: true })
  coverImageUrl?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(1000)
  @IsSafeImageUrl({ localUploadsOnly: true })
  listImageUrl?: string | null;
}
