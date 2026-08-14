import { Prisma } from '@prisma/client';

/**
 * 팀매치(및 리그 대진)에 pin할 활성 competition config를 스포츠 코드로 찾는다.
 * team-matches.service.ts의 loadTeamMatchCreationSource에 있던 로직을 그대로 뽑았다 —
 * 어드민 리그 대진 생성(team-match-series-admin.service.ts)도 팀 멤버 권한 체크 없이
 * 이 조회만 재사용해야 하기 때문. DB 트리거(v1_pin_team_match_competition_config)가
 * V1TeamMatch insert 시 sport_id로 같은 매핑을 다시 계산해 검증하므로, 이 함수가 반환한
 * id를 그대로 넣으면 트리거와 항상 일치한다.
 */
export async function resolveTeamMatchCompetitionConfig(
  tx: Prisma.TransactionClient,
  sportId: string,
): Promise<{ id: string } | null> {
  const sport = await tx.v1Sport.findFirst({
    where: { id: sportId, isActive: true },
    select: { code: true },
  });
  const competitionSportCode =
    sport?.code.toLowerCase() === 'soccer' || sport?.code.toLowerCase() === 'football'
      ? 'football'
      : sport?.code.toLowerCase() === 'futsal'
        ? 'futsal'
        : null;
  if (competitionSportCode === null) return null;
  return tx.v1CompetitionConfigVersion.findFirst({
    where: { sportCode: competitionSportCode, name: `${competitionSportCode}-v1`, status: 'ACTIVE' },
    orderBy: { version: 'desc' },
    select: { id: true },
  });
}
