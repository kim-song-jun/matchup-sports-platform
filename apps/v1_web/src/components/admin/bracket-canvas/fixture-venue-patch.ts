import { placeFromView, toVenuePayload, type PlaceValue } from '@/lib/place';
import type { V1PlaceView } from '@/types/api';

type FixtureVenueSource = { venue: string | null; place?: V1PlaceView | null };

/** 대진 경기의 현재 장소를 폼 값으로. `place` 가 없는 옛 응답은 이름만 있는 값으로 복원한다. */
export function fixtureVenueValue(fixture: FixtureVenueSource): PlaceValue | null {
  const fromPlace = placeFromView(fixture.place);
  if (fromPlace) return fromPlace;
  return fixture.venue ? { kind: 'manual', name: fixture.venue } : null;
}

/**
 * 경기 수정 payload 의 장소 필드. 서버는 `venue` 가 오면 스냅샷 전체를 교체하므로
 * 바뀌지 않았으면 아무것도 보내지 않고, 비웠으면 빈 이름으로 지운다.
 */
export function fixtureVenuePatch(
  next: PlaceValue | null,
  fixture: FixtureVenueSource,
): ReturnType<typeof toVenuePayload> {
  const payload = toVenuePayload(next);
  if (JSON.stringify(payload) === JSON.stringify(toVenuePayload(fixtureVenueValue(fixture)))) return {};
  return next ? payload : { venue: '' };
}
