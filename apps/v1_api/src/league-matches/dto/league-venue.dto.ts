import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IsPlaceLatitude, IsPlaceLongitude, IsPlaceProvider, IsPlaceProviderId } from '../../places/place-snapshot';

/** 리그 기본 장소. `venue` 키는 필수이고, null·공백이면 장소 전체(주소·핀 포함)를 비운다. 새 대진만 이 값을 이어받는다. */
export class UpdateLeagueVenueDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  venue?: string | null;

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
