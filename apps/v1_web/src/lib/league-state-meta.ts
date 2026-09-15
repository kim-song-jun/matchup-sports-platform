/**
 * 리그 상태(준비 중 / 진행 중 / 종료) 라벨·배지의 단일 소스.
 *
 * 이 매핑은 원래 리그 목록·상세 두 파일에 값만 복제돼 있었다 — 두 화면이 서로 다른 병렬
 * 작업 트랙에서 동시에 편집되던 시기의 의도된 임시 조치였고, 그 파일 주석도 "상태 라벨을
 * 바꿀 일이 생기면 두 파일 모두 갱신해야 한다"고 적어 두고 있었다. 그 병렬 작업이 끝난
 * 뒤 마이 화면("내 리그")이 세 번째 복제본을 만들면서 드리프트 위험이 실제로 커졌으므로
 * (Copilot 리뷰 지적, 2026-08-21) 여기로 모은다.
 *
 * 세 화면이 같은 상태를 다르게 부르면 사용자는 그것을 다른 개념으로 읽는다.
 */
export type V1LeagueState = 'draft' | 'active' | 'completed';

export interface LeagueStateMeta {
  label: string;
  /** globals.css 의 tm-badge 계열 토큰. 컬러만으로 뜻을 전달하지 않도록 항상 label 과 함께 쓴다. */
  badgeClass: string;
}

export const LEAGUE_STATE_META: Record<V1LeagueState, LeagueStateMeta> = {
  draft: { label: '준비 중', badgeClass: 'tm-badge-grey' },
  active: { label: '진행 중', badgeClass: 'tm-badge-blue' },
  completed: { label: '종료', badgeClass: 'tm-badge-green' },
};
