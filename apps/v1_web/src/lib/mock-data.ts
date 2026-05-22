export type MatchCard = {
  id: string;
  title: string;
  sport: string;
  level: string;
  place: string;
  schedule: string;
  capacity: string;
  status: 'open' | 'pending' | 'confirmed' | 'closed';
  tone: 'blue' | 'green' | 'orange' | 'red';
};

export type TeamCard = {
  id: string;
  name: string;
  sport: string;
  region: string;
  members: string;
  trust: 'verified' | 'estimated' | 'sample';
  joinStatus: 'approval_required' | 'closed';
};

export type NoticeItem = {
  id: string;
  title: string;
  date: string;
  category: string;
  body: string;
};

export type ChatRoom = {
  id: string;
  title: string;
  target: string;
  preview: string;
  time: string;
  unread: number;
};

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
  href: string;
};

export const personalMatches: MatchCard[] = [
  {
    id: 'match-1',
    title: '성수 저녁 풋살 5:5',
    sport: '풋살',
    level: '초보-중수',
    place: '성수 실내풋살장',
    schedule: '오늘 20:00',
    capacity: '7/10명',
    status: 'open',
    tone: 'blue',
  },
  {
    id: 'match-2',
    title: '잠실 아침 러닝 6km',
    sport: '러닝',
    level: '입문',
    place: '잠실 한강공원',
    schedule: '내일 07:30',
    capacity: '4/8명',
    status: 'pending',
    tone: 'green',
  },
  {
    id: 'match-3',
    title: '마포 저녁 수영 레인',
    sport: '수영',
    level: '중수',
    place: '마포 스포츠센터',
    schedule: '토 15:00',
    capacity: '10/10명',
    status: 'closed',
    tone: 'orange',
  },
];

export const teamMatches: MatchCard[] = [
  {
    id: 'team-match-1',
    title: '마포 FC 상대팀 모집',
    sport: '축구',
    level: 'A-',
    place: '마포 월드컵 보조구장',
    schedule: '금 21:00',
    capacity: '상대 0/1팀',
    status: 'open',
    tone: 'blue',
  },
  {
    id: 'team-match-2',
    title: '루키즈 러닝 정기전',
    sport: '러닝',
    level: 'B',
    place: '서초 한강공원',
    schedule: '일 10:00',
    capacity: '승인 대기',
    status: 'pending',
    tone: 'green',
  },
];

export const teams: TeamCard[] = [
  {
    id: 'team-1',
    name: '성수 볼러즈',
    sport: '풋살',
    region: '서울 성동',
    members: '18명',
    trust: 'verified',
    joinStatus: 'approval_required',
  },
  {
    id: 'team-2',
    name: '한강 러너스',
    sport: '러닝',
    region: '서울 송파',
    members: '42명',
    trust: 'estimated',
    joinStatus: 'approval_required',
  },
  {
    id: 'team-3',
    name: '노원 스윔 클럽',
    sport: '수영',
    region: '서울 노원',
    members: '12명',
    trust: 'sample',
    joinStatus: 'closed',
  },
];

export const notices: NoticeItem[] = [
  {
    id: 'notice-1',
    title: 'v1 베타 운영 기준 안내',
    date: '오늘',
    category: '운영',
    body: 'SM New v1은 새 앱과 새 데이터베이스에서 검증 중입니다. 기존 서비스 데이터와 직접 연결하지 않습니다.',
  },
  {
    id: 'notice-2',
    title: '결제와 환불 기능은 이번 v1 범위에서 제외됩니다',
    date: '어제',
    category: '범위',
    body: '매치와 팀매치 참여는 신청과 승인 흐름까지만 제공합니다. 실제 청구, 환불, 정산 성공 화면은 제공하지 않습니다.',
  },
];

export const activityRows = [
  { label: '참가 대기', value: '2', caption: '호스트 승인 필요' },
  { label: '운영 중', value: '3', caption: '매치와 팀매치 포함' },
  { label: '신뢰 상태', value: 'sample', caption: '실제 평판 아님' },
];

export const chatRooms: ChatRoom[] = [
  {
    id: 'chat-1',
    title: '성수 저녁 풋살 5:5',
    target: '개인 매치',
    preview: '오늘 경기 전 준비물을 확인해 주세요.',
    time: '9분 전',
    unread: 2,
  },
  {
    id: 'chat-2',
    title: '마포 FC 상대팀 모집',
    target: '팀매치',
    preview: '상대팀 승인 후 경기 세부 조건을 조율합니다.',
    time: '1시간 전',
    unread: 0,
  },
];

export const notifications: NotificationItem[] = [
  {
    id: 'notification-1',
    title: '매치 신청이 접수되었습니다',
    body: '성수 저녁 풋살 5:5 호스트 승인을 기다리고 있습니다.',
    time: '방금',
    read: false,
    href: '/matches/match-1',
  },
  {
    id: 'notification-2',
    title: '팀 가입 요청이 도착했습니다',
    body: '성수 볼러즈에 새 가입 요청이 있습니다.',
    time: '오늘',
    read: false,
    href: '/teams/team-1/members',
  },
  {
    id: 'notification-3',
    title: 'v1 운영 공지',
    body: '결제/환불 기능은 아직 활성화되지 않았습니다.',
    time: '어제',
    read: true,
    href: '/notices/notice-2',
  },
];
