export type MyUser = {
  /**
   * 공개 프로필(`/users/:id`) 진입에 쓴다. 로딩·에러 중에는 아직 모르므로 `null` 이고,
   * 그때는 진입점을 렌더하지 않는다 — 링크를 먼저 그려 두고 눌렀을 때 깨지는 것보다
   * 안 보이는 편이 낫다.
   */
  userId: string | null;
  name: string;
  handle: string;
  region: string;
  genderLabel: string;
  sports: string[];
  intro: string;
  initials: string;
  profileImageUrl?: string | null;
  loginMethod?: string;
  loginMethodProvider?: 'kakao' | 'email' | 'naver' | string | null;
  stats: Array<{ label: string; value: number | string; unit?: string }>;
  monthly: Array<{ label: string; value: number | string; unit?: string }>;
};

/** icon 값은 Lucide コンポーネント명 문자열 — MenuSection에서 매핑 후 렌더됨 */
export type MyMenuItem = {
  label: string;
  sub: string;
  href: string;
  icon: string;
  /** 라벨 옆 숫자 배지(예: 답장을 기다리는 컨택 수). 0 이거나 없으면 그리지 않는다. */
  badge?: number;
  /** 배지의 스크린리더 문구. badge 를 넣는 쪽이 의미를 함께 넣는다. */
  badgeLabel?: string;
};

export type MyMenuSection = {
  title: string;
  items: MyMenuItem[];
};

export type MyHomeViewModel = {
  user: MyUser;
  sections: MyMenuSection[];
  hasNewNotification?: boolean;
  /**
   * 휴대폰 본인인증 완료 여부. 아직 모를 때(로딩)는 undefined 로 두어 경고를 깜빡이지 않게 한다.
   * false 일 때만 인증 요청 카드를 띄운다.
   */
  phoneVerified?: boolean;
};

export type MyMatchStatus = 'pending' | 'approved' | 'recruiting' | 'ended';

export type MyMatch = {
  id: string;
  title: string;
  meta: string;
  status: MyMatchStatus;
  statusLabel: string;
  note: string;
  href: string;
  reviewHref?: string;
};

export type MyMatchesViewModel = {
  mode: 'joined' | 'created';
  summary: Array<{ label: string; value: number; unit: string }>;
  matches: MyMatch[];
  /** 조회 중. 스켈레톤을 그리고 빈 상태는 띄우지 않는다. */
  loading: boolean;
  /** 조회 실패. ErrorState + 재시도를 그린다(예전엔 알림 카드뿐이라 다시 부를 길이 없었다). */
  error: boolean;
  onRetry: () => void;
};

export type MyTeamRole = 'owner' | 'manager' | 'admin' | 'member';

export type MyTeam = {
  id: string;
  name: string;
  logo: string;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  sport: string;
  region: string;
  role: MyTeamRole;
  roleLabel: string;
  members: number;
  manner: string;
  next: string;
  description: string;
};

export type MyTeamsViewModel = {
  teams: MyTeam[];
  summary: Array<{ label: string; value: number | string; unit?: string }>;
};



export type ProfileEditViewModel = {
  user: MyUser;
  fields: Array<{ label: string; value: string; multiline?: boolean }>;
};

export type SettingsViewModel = {
  title: string;
  account?: {
    loginMethod: string;
    email: string;
    phone: string;
    /** 인증 여부를 아직 모를 때(로딩)는 undefined — 미인증으로 단정해 경고를 깜빡이지 않는다. */
    phoneVerified?: boolean;
    password: string;
    canRequestPasswordChange: boolean;
  };
  groups: MyMenuSection[];
};

export type MyInvitationItem = {
  invitationId: string;
  teamId: string;
  teamName: string;
  logoUrl: string | null;
  invitedByName: string;
  message: string | null;
  dateLabel: string;
  /** 이 초대건의 수락/거절 처리 중 여부 — 아이템별 상태(팀초대 목록의 cancelPending 패턴과 동일) */
  actionPending: boolean;
};

export type MyInvitationsViewModel = {
  invitations: MyInvitationItem[];
  error: boolean;
  onAccept: (invitationId: string) => void;
  onDecline: (invitationId: string) => void;
  onRetry: () => void;
};

export type MyJoinApplicationItem = {
  applicationId: string;
  teamId: string;
  teamName: string;
  logoUrl: string | null;
  /** 백엔드 원본 status — 'requested'일 때만 취소 가능 */
  status: string;
  statusLabel: string;
  statusTone: 'pending' | 'approved' | 'rejected' | 'neutral';
  /** 상태별 다음 행동 안내 ("관리자가 확인하고 있어요" 등) */
  statusHint: string;
  message: string | null;
  dateLabel: string;
  /** 이 신청건의 취소 처리 중 여부 — 아이템별 상태(전역이면 무관한 카드까지 비활성화됨) */
  actionPending: boolean;
};

export type MyJoinApplicationsViewModel = {
  applications: MyJoinApplicationItem[];
  loading: boolean;
  error: boolean;
  onWithdraw: (applicationId: string) => void;
  onRetry: () => void;
};

export type NotificationSetting = {
  label: string;
  sub: string;
  enabled: boolean;
};

export type NotificationSettingsViewModel = {
  settings: NotificationSetting[];
};
