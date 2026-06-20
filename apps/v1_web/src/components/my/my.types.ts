export type MyUser = {
  name: string;
  handle: string;
  region: string;
  sports: string[];
  intro: string;
  initials: string;
  stats: Array<{ label: string; value: number | string; unit?: string }>;
  monthly: Array<{ label: string; value: number | string; unit?: string }>;
};

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
  groups: MyMenuSection[];
};

export type NotificationSetting = {
  label: string;
  sub: string;
  enabled: boolean;
};

export type NotificationSettingsViewModel = {
  settings: NotificationSetting[];
};
