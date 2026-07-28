export type MyUser = {
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
  title: string;
  summary: Array<{ label: string; value: number; unit: string }>;
  matches: MyMatch[];
  apiNotice?: {
    title: string;
    body: string;
    tone: 'info' | 'warning';
  };
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

export type MyTeamDetailViewModel = {
  team: MyTeam;
  actions: MyMenuItem[];
  recentMatches: MyMatch[];
  chatHref?: string;
};

export type MyMember = {
  /** membershipId(멤버) 또는 applicationId(가입 요청) — React list key에 사용 */
  id: string;
  name: string;
  role: string;
  meta: string;
  status: string;
  actions?: Array<{ label: string; tone?: 'danger'; onSelect: () => void }>;
  actionPending?: boolean;
  locked?: boolean;
};

export type MyTeamMembersViewModel = {
  teamName: string;
  activeTab: 'members' | 'requests';
  tabs: Array<{ key: 'members' | 'requests'; label: string; count: number; onSelect: () => void }>;
  summary: Array<{ label: string; value: number; unit: string }>;
  members: MyMember[];
  requests: MyMember[];
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
