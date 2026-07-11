/**
 * 관리자 액션 코드를 사람이 읽을 수 있는 한국어 레이블로 변환해요.
 *
 * 백엔드가 기록하는 실제 action 코드(dot-notation)를 기준으로 매핑해요.
 * 알 수 없는 코드는 raw 문자열을 그대로 반환해 감사 정밀도를 유지해요.
 */
const ACTION_LABEL_MAP: Record<string, string> = {
  // 회원 · 매치 · 팀
  'user.status.update': '회원 상태 변경',
  'user.delete': '회원 삭제',
  'match.status.update': '매치 상태 변경',
  'team.status.update': '팀 상태 변경',
  'team_match.status.update': '팀매치 상태 변경',
  // 관리자
  'admin.grant': '관리자 권한 부여',
  'admin.revoke': '관리자 권한 회수',
  'admin.update': '관리자 정보 수정',
  // 대회
  'tournament.create': '대회 생성',
  'tournament.update': '대회 수정',
  'tournament.status': '대회 상태 변경',
  // 대회 — 참가 신청
  'player.eligibility': '선수 자격 변경',
  'registration.confirm': '참가 확정',
  'registration.confirm_payment': '참가비 결제 확인',
  'registration.cancel': '참가 신청 취소',
  'registration.roster_lock': '로스터 잠금',
  'registration.roster_unlock': '로스터 잠금 해제',
  // 대회 — 대진표
  'tournament.bracket.group.create': '조 생성',
  'tournament.bracket.group_team.create': '조 편성',
  'tournament.bracket.fixture.create': '대진 경기 생성',
  'tournament.bracket.result.record': '경기 결과 입력',
  'tournament.bracket.standings.recalculate': '순위 재계산',
  // 대회 — 공지
  'tournament_announcement.create': '공지 작성',
  'tournament_announcement.publish': '공지 발행',
};

export function adminActionLabel(action: string): string {
  return ACTION_LABEL_MAP[action] ?? action;
}

/**
 * 감사 로그 대상(targetType) 코드를 한국어 레이블로 변환해요.
 * 백엔드 actionLog/statusChangeLog가 기록하는 targetType 값을 기준으로 매핑해요.
 * 알 수 없는 코드는 raw 문자열을 그대로 반환해요.
 */
const TARGET_TYPE_LABEL_MAP: Record<string, string> = {
  user: '회원',
  user_onboarding: '회원 온보딩',
  match: '매치',
  match_application: '매치 신청',
  team: '팀',
  team_join_application: '팀 가입 신청',
  team_membership: '팀 멤버십',
  team_match: '팀매치',
  team_match_application: '팀매치 신청',
  tournament: '대회',
  tournament_registration: '대회 참가',
  tournament_player: '대회 선수',
  tournament_announcement: '대회 공지',
  tournament_group: '대회 조',
  tournament_group_team: '조 편성',
  tournament_fixture: '대진 경기',
  admin: '관리자',
  chat: '채팅',
  chat_room_participant: '채팅 참여자',
};

export function adminTargetTypeLabel(targetType: string): string {
  return TARGET_TYPE_LABEL_MAP[targetType] ?? targetType;
}
