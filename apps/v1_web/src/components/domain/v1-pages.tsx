'use client';

import Link from 'next/link';
import { Search } from 'lucide-react';
import { AppShell } from '@/components/shell/app-shell';
import { FilterBar } from '@/components/domain/filter-bar';
import { MatchCard } from '@/components/domain/match-card';
import { TeamCard } from '@/components/domain/team-card';
import { Badge } from '@/components/ui/badge';
import { Section } from '@/components/ui/section';
import {
  useV1ChatRooms,
  useV1Home,
  useV1Matches,
  useV1Notices,
  useV1Notifications,
  useV1Profile,
  useV1Teams,
  useV1TeamMatches,
} from '@/hooks/use-v1-api';
import {
  activityRows,
  chatRooms,
  notices,
  notifications,
  personalMatches,
  teamMatches,
  teams,
} from '@/lib/mock-data';
import type {
  ChatRoom as MockChatRoom,
  MatchCard as MockMatch,
  NoticeItem as MockNotice,
  NotificationItem as MockNotification,
  TeamCard as MockTeam,
} from '@/lib/mock-data';
import type { V1ChatRoom, V1Match, V1Notice, V1Notification, V1Profile, V1Team } from '@/types/api';

export function HomeProductPage() {
  const homeQuery = useV1Home();
  const homeNotices = (homeQuery.data?.notices ?? notices).map(toNoticeItem);
  const heroMatch = homeQuery.data?.recommendedMatches?.[0] ? toMatchCard(homeQuery.data.recommendedMatches[0]) : personalMatches[0];

  return (
    <AppShell>
      <main className="v1-main">
        <Link className="v1-search-box" href="/search" aria-label="검색">
          <Search size={18} />
          <span className="v1-caption">동네, 종목, 팀 이름으로 찾아보세요</span>
        </Link>

        <Section title="오늘 바로 참여할 수 있는 매치" subtitle="신청 후 호스트 승인을 기다리는 v1 흐름입니다.">
          <div className="v1-card v1-hero-card">
            <div className="v1-hero-media">
              <div className="v1-hero-text">
                <Badge tone="blue">추천</Badge>
                <p className="v1-hero-title">{heroMatch.title}</p>
                <p className="v1-caption" style={{ color: 'rgba(255,255,255,.82)', marginTop: 6 }}>
                  {heroMatch.schedule} · {heroMatch.capacity} · 결제 없이 신청만 진행
                </p>
              </div>
            </div>
          </div>
        </Section>

        <Section title="빠른 이동">
          <div className="v1-quick-grid">
            <Link className="v1-quick v1-quick-primary" href="/matches">
              <strong>개인 매치</strong>
              <p className="v1-caption" style={{ color: 'rgba(255,255,255,.78)', marginTop: 4 }}>
                같이 뛸 사람 찾기
              </p>
            </Link>
            <Link className="v1-quick" href="/team-matches">
              <strong>팀매치</strong>
              <p className="v1-caption" style={{ marginTop: 4 }}>상대 팀 찾기</p>
            </Link>
            <Link className="v1-quick" href="/teams">
              <strong>팀</strong>
              <p className="v1-caption" style={{ marginTop: 4 }}>가입 승인 요청</p>
            </Link>
            <div className="v1-quick" aria-disabled>
              <strong>내 팀 바로가기</strong>
              <p className="v1-caption" style={{ marginTop: 4 }}>팀 선택 후 활성화</p>
            </div>
          </div>
        </Section>

        <Section title="활동 요약" subtitle="최근 매치 참여와 신청 상태를 확인하세요.">
          <div className="v1-grid-2">
            {activityRows.map((row) => (
              <div key={row.label} className="v1-card v1-card-pad">
                <span className="v1-big-number">{row.value}</span>
                <p className="v1-body" style={{ fontWeight: 800, marginTop: 8 }}>{row.label}</p>
                <p className="v1-caption" style={{ marginTop: 4 }}>{row.caption}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="공지" action={<Link className="v1-caption" href="/notices">전체 보기</Link>}>
          <div className="v1-list">
            {homeNotices.map((notice) => (
              <Link key={notice.id} className="v1-card v1-card-pad v1-card-link" href={`/notices/${notice.id}`}>
                <div className="v1-row">
                  <div>
                    <Badge>{notice.category}</Badge>
                    <p className="v1-item-title" style={{ marginTop: 8 }}>{notice.title}</p>
                  </div>
                  <p className="v1-caption">{notice.date}</p>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      </main>
    </AppShell>
  );
}

export function MatchesProductPage({ kind = 'personal' }: { kind?: 'personal' | 'team' }) {
  const isTeam = kind === 'team';
  const matchesQuery = useV1Matches();
  const teamMatchesQuery = useV1TeamMatches();
  const apiItems = isTeam ? teamMatchesQuery.data?.items.map(toMatchCard) : matchesQuery.data?.items.map(toMatchCard);
  const items = apiItems?.length ? apiItems : isTeam ? teamMatches : personalMatches;
  return (
    <AppShell>
      <main className="v1-main">
        <FilterBar items={isTeam ? ['추천', '축구', '풋살', '러닝', '수영'] : ['추천', '축구', '풋살', '러닝', '수영']} />
        <Section
          title={isTeam ? '팀매치 찾기' : '개인 매치 찾기'}
          subtitle={isTeam ? '팀 owner/manager만 신청할 수 있습니다.' : '결제 없이 신청과 승인 상태만 제공합니다.'}
          action={<Link className="v1-button v1-button-secondary" href={isTeam ? '/team-matches/new' : '/matches/new'}>만들기</Link>}
        >
          <div className="v1-list">
            {items.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                href={isTeam ? `/team-matches/${match.id}` : `/matches/${match.id}`}
              />
            ))}
          </div>
        </Section>
        <StateNote
          title="예외 상태"
          body="조건에 맞는 항목이 없거나 목록을 불러오지 못한 경우에도 현재 선택한 조건을 유지합니다."
        />
      </main>
    </AppShell>
  );
}

export function TeamsProductPage() {
  const teamsQuery = useV1Teams();
  const items = teamsQuery.data?.items.map(toTeamCard) ?? teams;

  return (
    <AppShell>
      <main className="v1-main">
        <FilterBar items={['추천', '풋살', '러닝', '서울', '승인 가능']} />
        <Section
          title="팀 둘러보기"
          subtitle="v1 팀 가입은 승인 요청 또는 마감 상태만 제공합니다."
          action={<Link className="v1-button v1-button-secondary" href="/teams/new">팀 만들기</Link>}
        >
          <div className="v1-list">
            {items.map((team) => (
              <TeamCard key={team.id} team={team} href={`/teams/${team.id}`} />
            ))}
          </div>
        </Section>
        <StateNote title="신뢰 라벨" body="검증됨, 추정 상태만 표시하고 값 없음은 -로 표시합니다." />
      </main>
    </AppShell>
  );
}

export function NoticesProductPage({ detail = false }: { detail?: boolean }) {
  const noticesQuery = useV1Notices();
  const items = (noticesQuery.data?.notices ?? notices).map(toNoticeItem);
  const notice = items[detail ? 1 : 0] ?? items[0] ?? notices[0];
  return (
    <AppShell>
      <main className="v1-main">
        {detail ? (
          <article className="v1-card v1-card-pad">
            <Badge>{notice.category}</Badge>
            <h2 className="v1-item-title" style={{ marginTop: 12 }}>{notice.title}</h2>
            <p className="v1-caption" style={{ marginTop: 6 }}>{notice.date}</p>
            <div className="v1-divider" />
            <p className="v1-body">{notice.body}</p>
          </article>
        ) : (
          <Section title="공지사항" subtitle="공지 열람은 알림 읽음 상태를 만들지 않습니다.">
            <div className="v1-list">
              {items.map((item) => (
                <Link key={item.id} className="v1-card v1-card-pad v1-card-link" href={`/notices/${item.id}`}>
                  <Badge>{item.category}</Badge>
                  <p className="v1-item-title" style={{ marginTop: 8 }}>{item.title}</p>
                  <p className="v1-caption" style={{ marginTop: 4 }}>{item.date}</p>
                </Link>
              ))}
            </div>
          </Section>
        )}
      </main>
    </AppShell>
  );
}

export function NotificationsProductPage({ readAll = false }: { readAll?: boolean }) {
  const notificationsQuery = useV1Notifications();
  const items = notificationsQuery.data?.items.map(toNotificationItem) ?? notifications;

  return (
    <AppShell>
      <main className="v1-main">
        <Section title="알림" subtitle="읽음 처리와 이동은 명시적인 핸들러로 분리해야 합니다.">
          <div className="v1-list">
            {items.map((item) => (
              <Link key={item.id} className="v1-card v1-card-pad v1-card-link" href={item.href}>
                <div className="v1-row">
                  <div>
                    <Badge tone={readAll || item.read ? 'green' : 'blue'}>{readAll || item.read ? '읽음' : '새 알림'}</Badge>
                    <p className="v1-item-title" style={{ marginTop: 8 }}>{item.title}</p>
                    <p className="v1-body" style={{ marginTop: 4 }}>{item.body}</p>
                  </div>
                  <p className="v1-caption">{item.time}</p>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      </main>
    </AppShell>
  );
}

export function ChatProductPage({ room = false }: { room?: boolean }) {
  const roomsQuery = useV1ChatRooms();
  const rooms = roomsQuery.data?.items.map(toChatRoom) ?? chatRooms;

  return (
    <AppShell>
      <main className="v1-main">
        {room ? (
          <Section title="성수 저녁 풋살 5:5" subtitle="개인 매치 연결 채팅">
            <div className="v1-list">
              <MessageBubble mine={false} body="오늘 경기 전 준비물을 확인해 주세요." />
              <MessageBubble mine body="네, 풋살화와 물 챙겨가겠습니다." />
            </div>
            <div className="v1-floating-cta">
              <div className="v1-search-box">
                <span className="v1-caption">메시지 입력</span>
              </div>
            </div>
          </Section>
        ) : (
          <Section title="채팅" subtitle="v1은 매치/팀매치 연결 채팅만 지원합니다.">
            <div className="v1-list">
              {rooms.map((chat) => (
                <Link key={chat.id} className="v1-card v1-card-pad v1-card-link" href={`/chat/${chat.id}`}>
                  <div className="v1-row">
                    <div>
                      <Badge tone="blue">{chat.target}</Badge>
                      <p className="v1-item-title" style={{ marginTop: 8 }}>{chat.title}</p>
                      <p className="v1-body" style={{ marginTop: 4 }}>{chat.preview}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p className="v1-caption">{chat.time}</p>
                      {chat.unread ? <Badge tone="red">{chat.unread}</Badge> : null}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </Section>
        )}
      </main>
    </AppShell>
  );
}

export function MyProductPage() {
  const profileQuery = useV1Profile();
  const profile = toProfileSummary(profileQuery.data);

  return (
    <AppShell>
      <main className="v1-main">
        <section className="v1-card v1-card-pad">
          <Badge tone="grey">신뢰 -</Badge>
          <h2 className="v1-item-title" style={{ marginTop: 10 }}>{profile.displayName}님</h2>
          <p className="v1-body" style={{ marginTop: 4 }}>{profile.bio}</p>
          <div className="v1-meta">
            <Badge tone="blue">참가 12회</Badge>
            <Badge tone="green">노쇼 0회</Badge>
            <Badge tone="grey">-</Badge>
          </div>
        </section>

        <Section title="내 활동">
          <div className="v1-grid-2">
            <Link className="v1-quick" href="/my/matches/joined">참가한 매치</Link>
            <Link className="v1-quick" href="/my/matches/created">만든 매치</Link>
            <Link className="v1-quick" href="/my/teams">내 팀</Link>
            <Link className="v1-quick" href="/my/settings">설정</Link>
          </div>
        </Section>

        <StateNote title="영구 팀 채팅" body="v1에서는 팀 상시 채팅을 제공하지 않습니다. 매치/팀매치 연결 채팅만 사용할 수 있습니다." />
      </main>
    </AppShell>
  );
}

export function StateFixturePage({ type, domain = 'matches' }: { type: 'empty' | 'error' | 'filter'; domain?: string }) {
  const title = type === 'empty' ? '결과가 없습니다' : type === 'error' ? '불러오지 못했습니다' : '필터 조정';
  const body =
    type === 'empty'
      ? '검색어와 필터는 유지하고 같은 화면 안에서 빈 상태를 보여줍니다.'
      : type === 'error'
        ? '같은 조건으로 다시 시도할 수 있어야 합니다.'
        : '필터는 적용 전까지 API를 호출하지 않는 draft 상태로 관리합니다.';

  return (
    <AppShell>
      <main className="v1-main">
        <div className="v1-state v1-card v1-card-pad">
          <div>
            <Badge tone={type === 'error' ? 'red' : 'blue'}>{domain}</Badge>
            <h2 className="v1-item-title" style={{ marginTop: 12 }}>{title}</h2>
            <p className="v1-body" style={{ marginTop: 8 }}>{body}</p>
            {type === 'filter' ? (
              <div className="v1-meta" style={{ justifyContent: 'center', marginTop: 14 }}>
                <Badge>종목</Badge>
                <Badge>지역</Badge>
                <Badge>상태</Badge>
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </AppShell>
  );
}

export function SearchProductPage({ state = 'results' }: { state?: 'results' | 'new' | 'empty' | 'error' | 'stale' }) {
  const hasResults = state === 'results';
  return (
    <AppShell>
      <main className="v1-main">
        <div className="v1-search-box">
          <Search size={18} />
          <input className="v1-input" aria-label="검색어" defaultValue={state === 'new' ? '' : '동네 강남'} placeholder="검색어를 입력해 주세요" />
        </div>

        <Section title="최근 검색">
          <div className="v1-toolbar">
            {['동네 강남', '오늘 참여 가능', '마감 임박', '초보 환영'].map((item, index) => (
              <button key={item} className={index === 0 ? 'v1-chip v1-chip-active' : 'v1-chip'} type="button">
                {item}
              </button>
            ))}
          </div>
        </Section>

        <Section title="빠른 조건">
          <div className="v1-grid-2">
            {['오늘 참여 가능', '24시간 내 마감', '초보 환영', '팀매치 포함'].map((item) => (
              <button key={item} type="button" className="v1-quick">{item}</button>
            ))}
          </div>
        </Section>

        <Section title="검색 결과" subtitle="매치, 팀매치, 팀을 같은 검색 문맥에서 보여줍니다.">
          {hasResults ? (
            <div className="v1-list">
              <MatchCard match={personalMatches[0]} href="/matches/match-1" />
              <MatchCard match={teamMatches[0]} href="/team-matches/team-match-1" />
              <TeamCard team={teams[0]} href="/teams/team-1" />
            </div>
          ) : (
            <div className="v1-state v1-card v1-card-pad">
              <div>
                <Badge tone={state === 'error' ? 'red' : 'blue'}>{state}</Badge>
                <h2 className="v1-item-title" style={{ marginTop: 12 }}>
                  {state === 'empty' ? '검색 결과가 없습니다' : state === 'error' ? '검색 결과를 불러오지 못했습니다' : '최신 검색 결과를 확인 중입니다'}
                </h2>
                <p className="v1-body" style={{ marginTop: 8 }}>최근 검색과 빠른 조건은 유지합니다.</p>
              </div>
            </div>
          )}
        </Section>
      </main>
    </AppShell>
  );
}

function StateNote({ title, body }: { title: string; body: string }) {
  return (
    <div className="v1-muted-panel" style={{ marginTop: 18 }}>
      <p className="v1-body" style={{ fontWeight: 800 }}>{title}</p>
      <p className="v1-caption" style={{ marginTop: 4 }}>{body}</p>
    </div>
  );
}

function MessageBubble({ body, mine }: { body: string; mine?: boolean }) {
  return (
    <div className="v1-card v1-card-pad" style={{ marginLeft: mine ? 48 : 0, marginRight: mine ? 0 : 48, background: mine ? 'var(--blue-soft)' : 'var(--surface)' }}>
      <p className="v1-body">{body}</p>
    </div>
  );
}

function toMatchCard(match: V1Match | MockMatch): MockMatch {
  if ('sportName' in match) {
    return {
      id: match.id,
      title: match.title,
      sport: match.sportName,
      level: match.levelLabel ?? '전체 레벨',
      place: match.placeName,
      schedule: formatShortDate(match.startsAt),
      capacity: match.capacityText,
      status: match.status === 'cancelled' ? 'closed' : match.status,
      tone: match.status === 'open' ? 'blue' : match.status === 'pending' ? 'green' : match.status === 'confirmed' ? 'orange' : 'red',
    };
  }

  return match;
}

function toTeamCard(team: V1Team | MockTeam): MockTeam {
  if ('sportName' in team) {
    return {
      id: team.id,
      name: team.name,
      sport: team.sportName,
      region: team.regionName,
      members: `${team.memberCount}명`,
      trust: team.trustState === 'none' ? 'sample' : team.trustState,
      joinStatus: team.joinPolicy,
    };
  }

  return team;
}

function toNoticeItem(notice: V1Notice | MockNotice): MockNotice {
  if ('publishedAt' in notice) {
    return {
      id: notice.noticeId ?? notice.id ?? 'notice',
      title: notice.title,
      date: formatShortDate(notice.publishedAt),
      category: notice.category ?? notice.audience ?? '공지',
      body: notice.body ?? '',
    };
  }

  return notice;
}

function toNotificationItem(notification: V1Notification | MockNotification): MockNotification {
  if ('createdAt' in notification) {
    return {
      id: notification.notificationId,
      title: notification.title,
      body: notification.body ?? '',
      time: formatShortDate(notification.createdAt),
      read: notification.status === 'read',
      href: normalizeNotificationRoute(notification.target.route, notification.type),
    };
  }

  return notification;
}

function normalizeNotificationRoute(route: string | null, type?: string | null) {
  if (!route) return type?.includes('review') ? '/my/reviews' : '/notifications';
  if (route === '/reviews' || route.startsWith('/reviews?')) return route.replace('/reviews', '/my/reviews');
  if (route.startsWith('/reviews/')) return `/my${route}`;
  if (type?.includes('review') && route === '/my') return '/my/reviews';
  return route;
}

function toChatRoom(room: V1ChatRoom | MockChatRoom): MockChatRoom {
  if ('roomType' in room) {
    return {
      id: room.roomId,
      title: room.title,
      target: room.roomType === 'match' ? '개인 매치' : room.roomType === 'team' ? '팀' : '팀매치',
      preview: room.lastMessage?.contentPreview ?? '아직 메시지가 없습니다.',
      time: formatShortDate(room.lastMessage?.sentAt ?? ''),
      unread: room.unreadCount,
    };
  }

  return room;
}

function toProfileSummary(profile?: V1Profile) {
  return {
    displayName: profile?.displayName ?? '송준',
    bio: profile?.bio ?? '풋살과 러닝을 중심으로 활동 중입니다.',
  };
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
