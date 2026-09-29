import { IsBoolean } from 'class-validator';

/**
 * 명단 검인(체크인) — 이 참가자가 실제로 도착했는지를 현장에서 확정한다.
 *
 * 저장/제출과 달리 `expectedVersion` 을 받지 않는다. 체크인은 킥오프 직전 여러 명을
 * 연달아 누르는 조작이고 라인업 내용을 바꾸지 않는다 — 버전 커맨드로 만들면 한 명 누를
 * 때마다 revision 이 올라 다음 사람에서 곧바로 409 가 난다(라인업 화면이 겪던 바로 그
 * 함정이다). 그래서 라인업 revision 과 완전히 분리된 단순 상태 토글로 둔다.
 */
export class SetParticipantArrivalDto {
  @IsBoolean()
  arrived!: boolean;
}
