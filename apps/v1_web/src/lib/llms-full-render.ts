import { formatTournamentDateLong, formatTournamentDateTimeLong } from '@/lib/date-utils';
import type { LlmsFullSnapshot } from '@/lib/llms-full';
import { absoluteSiteUrl } from '@/lib/seo';
import { resolveTournamentRegistrationBlock } from '@/lib/tournament-registration-availability';
import type { V1Match, V1TournamentListItem, V1TournamentStatus } from '@/types/api';

/**
 * `/llms-full.txt` — `/llms.txt` 의 확장판. 서비스가 무엇이고 어떻게 참여하는지, 그리고 지금
 * 열려 있는 대회·리그·이벤트·매치·팀·구장을 한 문서에 담아 AI 가 한 번에 읽고 답하게 한다.
 *
 * `/llms.txt` 와 같은 원칙: 모든 문장은 사이트에서 확인 가능한 사실이어야 한다. 사용자가 쓴
 * 긴 글(팀 소개·매치 설명)은 싣지 않는다 — 연락처 같은 개인정보가 섞여 있을 수 있고, AI 가
 * 읽는 문서에 임의 텍스트를 그대로 넣으면 지시문 주입 통로가 된다. 제목·이름만 한 줄로 싣는다.
 */
const MAX_ROWS = 60;

const TOURNAMENT_STATUS_LABEL: Record<V1TournamentStatus, string> = {
  draft: '준비 중',
  open: '모집 중',
  closed: '모집 마감',
  in_progress: '진행 중',
  completed: '종료',
  cancelled: '취소',
};

const LEAGUE_STATE_LABEL = { draft: '준비 중', active: '진행 중', completed: '종료' } as const;

/**
 * 한 줄 링크 텍스트로 만든다. 줄바꿈을 접어 가짜 섹션을 막고, 대괄호는 소괄호로 바꿔 가짜 링크를 막는다
 * (`\]` 이스케이프는 AI 가 원문으로 읽으므로 방어가 안 된다).
 */
function inline(value: string | null | undefined, max = 80): string {
  const text = (value ?? '').replace(/\s+/g, ' ').trim().replace(/\[/g, '(').replace(/\]/g, ')');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function link(title: string, path: string): string {
  return `[${inline(title)}](${absoluteSiteUrl(path)})`;
}

function fee(amount: number | null | undefined): string | null {
  if (amount == null) return null;
  return amount === 0 ? '참가비 무료' : `참가비 ${amount.toLocaleString('ko-KR')}원`;
}

function row(head: string, parts: Array<string | null | undefined | false>): string {
  const tail = parts.filter(Boolean).join(' · ');
  return tail ? `- ${head}: ${tail}` : `- ${head}`;
}

function section(title: string, items: string[] | null, emptyText: string): string[] {
  // null = 조회 실패 → 섹션을 통째로 뺀다("없다"고 적으면 장애가 사실로 학습된다).
  if (items === null) return [];
  return [`## ${title}`, '', ...(items.length > 0 ? items.slice(0, MAX_ROWS) : [emptyText]), ''];
}

const MAX_LINKS_PER_VENUE = 8;

/** `status: open` 은 마감·정원이 지나도 남는다 — 상세 화면의 신청 버튼과 같은 판정으로 적는다. */
function tournamentState(t: V1TournamentListItem, now: Date): string {
  if (t.status !== 'open') return TOURNAMENT_STATUS_LABEL[t.status];
  const block = resolveTournamentRegistrationBlock(
    { ...t, teamCount: t.teamCount ?? Number.MAX_SAFE_INTEGER },
    now,
  );
  if (block === 'deadline_passed') return '신청 마감';
  if (block === 'capacity_full') return '정원 마감';
  return '신청 받는 중';
}

function matchId(item: V1Match): string | undefined {
  return item.matchId ?? item.id;
}

// 흐름 서술의 근거는 docs/design/competition-canonical-flow.md(정본). 정본이 바뀌면 여기도 바꾼다.
const PARTICIPATION_GUIDE = [
  '## 팀밋에서 할 수 있는 일',
  '',
  `- **개인 매치** (${absoluteSiteUrl('/matches')}): 혼자서도 참가할 수 있는 매치를 종목·지역·일정으로 찾아 신청해요.`,
  '  호스트 승인이 필요한 매치는 승인 뒤에 참가가 확정돼요.',
  `- **팀** (${absoluteSiteUrl('/teams')}): 종목·활동 지역별 팀을 찾아 가입을 신청하면, 팀장이나 감독이 수락해요.`,
  '  팀을 직접 만들어 팀장으로 멤버를 모을 수도 있어요.',
  `- **팀 매치** (${absoluteSiteUrl('/team-matches')}): 팀 대 팀 친선 경기예요. 한 팀이 경기를 올리면 상대 팀이 신청하고,`,
  '  올린 팀이 승인하면 경기가 성사돼요.',
  `- **대회·정규 리그** (${absoluteSiteUrl('/tournaments')}): 대회는 한 번에 치르는 정규 대회와 시즌제로 운영되는`,
  '  정규 리그로 나뉘어요. 모든 경기는 팀 대 팀이에요.',
  `- **이벤트** (${absoluteSiteUrl('/events')}): 운영팀이 소개하는 대회 기획전이에요.`,
  '',
  '## 대회·리그 참가 흐름',
  '',
  '1. 팀장이 팀 단위로 참가를 신청하고, 대회 운영자가 확정해요.',
  '2. 신청할 때 출전 명단을 등번호와 이름으로 등록해요. 명단에 있는 선수가 곧 그 경기의 출전자예요.',
  '3. 경기 중에는 운영팀이 점수를 실시간으로 입력하고, 관전자는 대회 페이지에서 라이브 스코어를 봐요.',
  '4. 경기가 끝나면 결과가 제출되고, 어드민이 확인하면 공식 결과로 확정돼요. 확정 전 점수에는 "확정 전" 표시가 붙어요.',
  '5. 순위·승점·전적에는 확정된 결과만 반영돼요. 동점이면 승점 → 골득실 → 다득점 → 승자승 → 최소 실점 순으로 가려요.',
  '6. 결과는 팀 전적(전체·대회·리그·친선)과 선수 개인 기록 양쪽에 남아요.',
  '',
];

const CITATION_POLICY = [
  '## 인용할 때',
  '',
  '- 출처 표기: Teameet (teameet.co.kr). 개별 대회·팀·매치를 인용할 때는 해당 페이지 URL 을 함께 적어 주세요.',
  '- 진행 중인 대회의 중간 순위를 최종 결과로 인용하지 마세요. 각 항목의 상태(모집 중·진행 중·종료)를 함께 확인해 주세요.',
  '- 모집 상태와 일정은 수시로 바뀌어요. 이 문서의 생성 시각보다 오래된 정보라면 해당 페이지에서 다시 확인해 주세요.',
  '- 선수 개인 프로필·채팅·신청 내역처럼 로그인이 필요한 정보는 이 문서에 없고, 인용 대상도 아니에요.',
  `- 요약본: ${absoluteSiteUrl('/llms.txt')} · 전체 페이지 목록: ${absoluteSiteUrl('/sitemap.xml')}`,
  '- 문의: teameetsports@naver.com',
  '',
];

type VenueEvent = { venue: string; line: string };

export function renderLlmsFull(s: LlmsFullSnapshot, now = new Date()): string {
  const venueEvents: VenueEvent[] = [];
  const noteVenue = (venue: string | null | undefined, line: string) => {
    const name = inline(venue, 60);
    if (name) venueEvents.push({ venue: name, line });
  };

  const tournaments = s.tournaments?.filter((t) => t.kind !== 'regular_league' && t.status !== 'draft') ?? null;
  const tournamentRows = tournaments?.map((t) => {
    const head = link(t.title, `/tournaments/${t.id}`);
    noteVenue(t.venue, head);
    return row(head, [
      t.sport.name,
      tournamentState(t, now),
      t.scheduledAt && formatTournamentDateLong(t.scheduledAt),
      t.venue && `장소 ${inline(t.venue, 60)}`,
      fee(t.entryFee),
      t.status === 'open' && t.registrationDeadlineAt && `신청 마감 ${formatTournamentDateTimeLong(t.registrationDeadlineAt)}`,
      t.status === 'completed' && `결과 ${absoluteSiteUrl(`/tournaments/${t.id}/results`)}`,
    ]);
  }) ?? null;

  const leagueRows = s.leagues?.map((l) => row(link(l.title, `/league-matches/${l.leagueId}`), [
    l.sport.name,
    LEAGUE_STATE_LABEL[l.state],
    `${formatTournamentDateLong(l.startsOn)} ~ ${formatTournamentDateLong(l.endsOn)}`,
    l.region?.name && `지역 ${inline(l.region.name, 30)}`,
    l.teamCount != null && `참가 ${l.teamCount}팀`,
  ])) ?? null;

  const campaignRows = s.campaigns?.map((c) => row(link(c.heroTitle, `/tournaments/campaigns/${c.slug}`), [
    c.tournament.sport.name,
    TOURNAMENT_STATUS_LABEL[c.tournament.status],
    c.tournament.scheduledAt && formatTournamentDateLong(c.tournament.scheduledAt),
    c.tournament.venue && `장소 ${inline(c.tournament.venue, 60)}`,
  ])) ?? null;

  // 목록 API 의 `status` 는 마감이 지나도 recruiting 으로 남는다 — 화면이 쓰는 displayState 로 거른다.
  const openMatches = s.matches?.filter((m) => m.displayState === 'recruiting' && matchId(m)) ?? null;
  const matchRows = openMatches?.map((m) => {
    const head = link(m.title, `/matches/${matchId(m)}`);
    noteVenue(m.place?.name, head);
    return row(head, [
      m.sport?.name ?? m.sportName,
      formatTournamentDateTimeLong(m.startsAt),
      m.place?.name && `장소 ${inline(m.place.name, 60)}`,
      m.region?.name && `지역 ${inline(m.region.name, 30)}`,
      m.approvalRequired ? '호스트 승인 후 확정' : '신청 즉시 참가',
    ]);
  }) ?? null;

  const openTeamMatches = s.teamMatches?.filter((m) => m.displayState === 'recruiting' && (m.teamMatchId ?? m.id)) ?? null;
  const teamMatchRows = openTeamMatches?.map((m) => {
    const head = link(m.title, `/team-matches/${m.teamMatchId ?? m.id}`);
    noteVenue(m.place?.name, head);
    return row(head, [
      m.sport?.name ?? m.sportName,
      formatTournamentDateTimeLong(m.startsAt),
      m.place?.name && `장소 ${inline(m.place.name, 60)}`,
      m.hostTeam?.name && `모집 팀 ${inline(m.hostTeam.name, 40)}`,
      m.league?.title ? `리그 경기(${inline(m.league.title, 40)})` : '친선 경기',
    ]);
  }) ?? null;

  const teamRows = s.teams?.map((t) => row(link(t.name, `/teams/${t.teamId ?? t.id}`), [
    t.sport?.name ?? t.sportName,
    t.regionName && `활동 지역 ${inline(t.regionName, 30)}`,
    `멤버 ${t.memberCount}명`,
    t.joinPolicy === 'approval_required' ? '가입 신청 받는 중' : '가입 신청 닫힘',
  ])) ?? null;

  const venues = new Map<string, string[]>();
  for (const { venue, line } of venueEvents) venues.set(venue, [...(venues.get(venue) ?? []), line]);
  const venueRows = [...venues.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'ko'))
    .map(([venue, lines]) => `- **${venue}**: ${lines.slice(0, MAX_LINKS_PER_VENUE).join(', ')}`);

  return [
    '# Teameet (팀밋) — 전체 안내서',
    '',
    '> 축구·풋살·러닝·수영 생활체육의 개인 매치·팀·팀 매치·아마추어 대회와 정규 리그를 한 곳에서',
    '> 찾고 참여하고, 경기 결과와 기록을 남기는 한국의 멀티스포츠 플랫폼이에요.',
    '',
    `이 문서는 ${absoluteSiteUrl('/llms.txt')} 의 확장판이에요. 아래 목록은 공개 API 에서 방금 만든 것이고`,
    `(생성 시각 ${formatTournamentDateTimeLong(now.toISOString())} KST), 최대 5분 캐시돼요.`,
    '',
    ...PARTICIPATION_GUIDE,
    ...section('대회', tournamentRows, '지금 공개된 대회가 없어요.'),
    ...section('정규 리그', leagueRows, '지금 공개된 리그가 없어요.'),
    ...section('이벤트', campaignRows, '지금 진행 중인 이벤트가 없어요.'),
    ...section('모집 중인 개인 매치', matchRows, '지금 모집 중인 개인 매치가 없어요.'),
    ...section('모집 중인 팀 매치', teamMatchRows, '지금 상대 팀을 찾는 팀 매치가 없어요.'),
    ...section('팀', teamRows, '공개된 팀이 없어요.'),
    ...(venueRows.length > 0 ? ['## 구장별 대회·매치', '', '위 목록의 대회·매치를 경기 장소별로 다시 묶었어요.', '', ...venueRows, ''] : []),
    ...CITATION_POLICY,
  ].join('\n');
}

