import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { IsPlaceLatitude, IsPlaceLongitude, IsPlaceProvider, IsPlaceProviderId } from '../../places/place-snapshot';

/**
 * 리그 기본 장소. 새 대진만 이 값을 이어받는다. `venue` 는 키 자체가 필수다 — null·공백이면 장소 전체(주소·핀 포함)를
 * 비우고, 키가 빠진 본문은 400 VALIDATION_ERROR 다(빈 PATCH 가 기본 장소를 지우지 않게).
 */
export class UpdateLeagueVenueDto {
  @ValidateIf((dto: UpdateLeagueVenueDto) => dto.venue !== null)
  @IsString()
  @MaxLength(200)
  venue!: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  venueAddress?: string | null;

  @IsPlaceLatitude()
  venueLatitude?: number | null;

  @IsPlaceLongitude()
  venueLongitude?: number | null;

  @IsPlaceProvider()
  venueProvider?: string | null;

  @IsPlaceProviderId()
  venueProviderId?: string | null;
}
