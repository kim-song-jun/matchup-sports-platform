/**
 * 목업 대회 생성 스위치.
 *
 * NODE_ENV 로는 alpha 와 프로덕션을 구분할 수 없다 — 두 compose 파일 모두 production 을 박아
 * 둔다(config/game-operation-flags.ts 의 같은 지적 참조). 그래서 alpha compose 오버레이에만
 * 넣는 전용 플래그로 잠근다. 없으면 라우트가 404 로 사라진다.
 *
 * 이 기능은 대회·등록·명단·대진을 한 번에 만들어 내므로, 프로덕션에서 실수로 눌릴 여지 자체를
 * 없애는 쪽이 안전하다(권한·감사만으로 통제하는 game-operation-flags 와 성격이 다르다).
 */
export function isMockSeedEnabled(): boolean {
  return process.env.V1_ENABLE_MOCK_SEED === 'true';
}
