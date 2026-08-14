import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Query for GET /tournament-ops/tournaments/:tournamentId/staff/user-search.
 *
 * 최소 2글자를 강제한다 — 한 글자 검색은 사실상 사용자 명부 전체를 페이지네이션 없이
 * 훑는 것과 같아서, 배정할 사람을 찾는다는 이 검색의 목적을 넘어선다. 응답 건수 상한
 * (SEARCH_RESULT_LIMIT)·호출 빈도 제한(@Throttle)과 함께 "아는 사람을 찾는 검색"과
 * "명부 열람"을 가르는 세 겹의 장치 중 하나다.
 */
export class SearchStaffCandidatesDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  q!: string;
}
