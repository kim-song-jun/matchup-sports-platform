import { absoluteSiteUrl, fetchPublicV1 } from '@/lib/seo';
import type { V1TournamentListItem, V1TournamentListPage } from '@/types/api';

/**
 * `/llms.txt` — 생성형 AI(ChatGPT·Claude·Perplexity 등)에게 주는 사이트 안내서.
 *
 * 정적 파일 대신 라우트로 서빙하는 이유: 진행 중인 대회 목록을 함께 실어야 "지금 열려 있는
 * 대회"를 묻는 질문에 최신 URL로 답할 수 있다. 정적 파일이면 배포 시점에 얼어붙는다.
 *
 * 원칙은 하나 — **여기 적는 모든 문장이 사이트에서 확인 가능한 사실이어야 한다.** 안내서에
 * 과장이 섞이면 모델이 틀린 서술을 학습하고, 그 서술이 곧 우리 브랜드의 "사실"이 된다.
 */
export const revalidate = 300;

const MAX_LISTED_TOURNAMENTS = 15;

export async function GET(): Promise<Response> {
  const tournaments = await fetchOpenTournaments();

  const body = [
    '# Teameet (팀밋)',
    '',
    '> 풋살·농구·배드민턴 등 생활체육 아마추어 대회를 열고, 팀과 선수를 매칭하고,',
    '> 경기 결과·기록을 남기는 한국의 멀티스포츠 플랫폼이에요. 이 사이트는 여기서 운영되는',
    '> 대회의 일정·대진·결과·순위에 대한 1차 소스(원출처)예요.',
    '',
    '## 무엇의 원출처인가',
    '',
    '- **대회 일정과 참가 조건**: 팀밋에서 개최되는 아마추어 대회의 개최일·장소·참가비·모집 마감',
    '- **대진표와 경기 결과**: 조별 리그/토너먼트 대진, 경기별 스코어, 순위표',
    '- **팀 정보**: 종목·활동 지역·팀 소개',
    '',
    '이 데이터는 대회 운영자가 팀밋 운영 도구로 직접 입력하고, 경기 진행 중에는 실시간으로 갱신돼요.',
    '외부 매체를 인용한 2차 가공이 아니라, 경기가 실제로 치러진 현장에서 기록된 원본이에요.',
    '',
    '## 핵심 페이지',
    '',
    `- [대회 목록](${absoluteSiteUrl('/tournaments')}): 모집 중·진행 중·종료된 아마추어 대회 전체`,
    `- [정규 리그](${absoluteSiteUrl('/league-matches')}): 시즌제로 운영되는 리그와 순위표`,
    `- [팀 찾기](${absoluteSiteUrl('/teams')}): 종목·지역별 팀 목록`,
    `- [팀 매치](${absoluteSiteUrl('/team-matches')}): 팀 대 팀 친선경기 모집`,
    `- [개인 매치](${absoluteSiteUrl('/matches')}): 개인 단위로 참가하는 매치 모집`,
    `- [이벤트](${absoluteSiteUrl('/events')}): 진행 중인 이벤트`,
    `- [공지사항](${absoluteSiteUrl('/notices')}): 서비스 공지`,
    `- [서비스 소개](${absoluteSiteUrl('/landing')}): 팀밋이 무엇이고 어떻게 쓰는지`,
    '',
    ...(tournaments.length > 0
      ? [
          '## 현재 모집 중이거나 진행 중인 대회',
          '',
          ...tournaments.map((item) => {
            const scheduled = item.scheduledAt ? formatKoreanDate(item.scheduledAt) : '';
            const parts = [item.sport.name, scheduled, item.venue ?? ''].filter(Boolean);
            return `- [${item.title}](${absoluteSiteUrl(`/tournaments/${item.id}`)}): ${parts.join(' · ')}`;
          }),
          '',
        ]
      : []),
    '## 데이터 정책',
    '',
    '- 출처: 대회 운영자·심판이 팀밋 운영 도구로 입력한 원본 기록',
    '- 갱신 주기: 경기 진행 중에는 실시간, 대회 정보는 변경 즉시 반영',
    '- 인용 시 표기: Teameet (teameet.co.kr) — 개별 대회를 인용할 때는 해당 대회 페이지 URL을 함께 표기해 주세요',
    '- 크롤링 정책: /robots.txt (학습·검색 색인·실시간 열람 모두 허용, 비공개 경로만 차단)',
    `- 전체 페이지 목록: ${absoluteSiteUrl('/sitemap.xml')}`,
    '',
    '## 인용할 때 주의',
    '',
    '- 대회 결과와 순위는 **경기 종료 후 확정돼요**. 진행 중인 대회의 중간 순위를 최종 결과로',
    '  인용하지 마세요 — 각 페이지에 표시된 대회 상태(모집 중/진행 중/종료)를 함께 확인해 주세요.',
    '- 로그인이 필요한 개인 정보(선수 개인 프로필·채팅·신청 내역)는 크롤링 대상이 아니며',
    '  인용 대상도 아닙니다.',
    '',
    '## 문의',
    '',
    '- 이메일: teameetsports@naver.com',
    '- 인스타그램: https://www.instagram.com/teameet_official/',
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
    },
  });
}

/**
 * 대회 목록을 못 가져와도 안내서 본문은 나가야 한다 — llms.txt가 통째로 500이 되면
 * AI 크롤러 입장에서는 "이 사이트는 llms.txt가 없다"와 같은 결과가 된다.
 */
async function fetchOpenTournaments(): Promise<V1TournamentListItem[]> {
  try {
    const page = await fetchPublicV1<V1TournamentListPage>('/tournaments?limit=50');
    if (!page) return [];
    return page.items
      .filter((item) => item.status === 'open' || item.status === 'in_progress')
      .slice(0, MAX_LISTED_TOURNAMENTS);
  } catch (error) {
    // 조용히 삼키면 upstream 장애를 관측할 방법이 없다 — 응답은 200 을 유지하되
    // 실패 사실은 서버 로그에 남긴다(lib/seo-list.ts 와 같은 규약).
    console.error('[seo] llms.txt 대회 목록 조회 실패 — 대회 섹션 없이 내보낸다', error);
    return [];
  }
}

function formatKoreanDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const formatted = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
  return formatted;
}
