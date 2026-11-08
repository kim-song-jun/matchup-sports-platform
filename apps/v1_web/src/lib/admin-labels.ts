import type {
  V1AdCampaignStatus,
  V1AdChannel,
  V1AdChannelPhase,
  V1AdPublishMissingField,
} from '@/types/ads';

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
  'user.phone.release': '휴대폰 번호 해제',
  'match.status.update': '매치 상태 변경',
  'match.online.update': '매치 온라인 장소 분류 변경',
  'team.status.update': '팀 상태 변경',
  'team.rename': '보관 팀 이름 변경',
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
  'player.export': '명단 CSV 내려받기',
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
  user_contact: '회원 연락처',
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

// ── 광고 캠페인 ────────────────────────────────────────────────────────────

const AD_CAMPAIGN_STATUS_LABEL: Record<V1AdCampaignStatus, string> = {
  draft: '초안',
  published: '게시 중',
  stopped: '중단',
};

export function adCampaignStatusLabel(status: V1AdCampaignStatus): string {
  return AD_CAMPAIGN_STATUS_LABEL[status] ?? '—';
}

/**
 * AdminStatusPill 은 STATUS_META 키로 톤·아이콘을 고른다. 광고의 '중단'은 그 표에 같은 뜻이 없어
 * 같은 톤(주의·정지)의 'suspended' 를 빌리고 말은 위 라벨로 덮는다.
 */
const AD_CAMPAIGN_STATUS_PILL_KEY: Record<V1AdCampaignStatus, string> = {
  draft: 'draft',
  published: 'published',
  stopped: 'suspended',
};

export function adCampaignStatusPillKey(status: V1AdCampaignStatus): string {
  return AD_CAMPAIGN_STATUS_PILL_KEY[status] ?? 'draft';
}

const AD_CHANNEL_PHASE_LABEL: Record<V1AdChannelPhase, string> = {
  scheduled: '예약',
  live: '노출 중',
  ended: '종료',
};

export function adChannelPhaseLabel(phase: V1AdChannelPhase): string {
  return AD_CHANNEL_PHASE_LABEL[phase] ?? '—';
}

/** 채널 단계 알약의 톤·아이콘은 경기 단계 알약과 같은 뜻(예정·진행·끝)이라 그 키를 빌린다. */
const AD_CHANNEL_PHASE_PILL_KEY: Record<V1AdChannelPhase, string> = {
  scheduled: 'match_scheduled',
  live: 'match_live',
  ended: 'completed',
};

export function adChannelPhasePillKey(phase: V1AdChannelPhase): string {
  return AD_CHANNEL_PHASE_PILL_KEY[phase] ?? 'match_scheduled';
}

const AD_CHANNEL_LABEL: Record<V1AdChannel, string> = {
  banner: '배너',
  popup: '팝업',
};

export function adChannelLabel(channel: V1AdChannel): string {
  return AD_CHANNEL_LABEL[channel] ?? '—';
}

const AD_PUBLISH_FIELD_LABEL: Record<V1AdPublishMissingField, string> = {
  imageUrl: '이미지',
  altText: '대체 텍스트',
  linkUrl: '이동 링크',
  startAt: '시작 시각',
  endAt: '끝 시각',
  headline: '제목',
};

export function adPublishFieldLabel(field: V1AdPublishMissingField): string {
  return AD_PUBLISH_FIELD_LABEL[field] ?? '필수 항목';
}
