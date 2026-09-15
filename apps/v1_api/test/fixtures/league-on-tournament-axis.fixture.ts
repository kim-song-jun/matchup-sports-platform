import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  competitionConfigVersionIdForSport,
  leagueMirrorCreateData,
} from '../../src/tournaments/league-competition-mirror';
import { LeagueStateValue } from '../../src/league-matches/league-state';

/**
 * **통합 축에 리그를 만드는 테스트 픽스처** (Task 164 BE-5 drop).
 *
 * `V1League` 테이블이 사라지면서 스펙들이 `prisma.v1League.create` 로 리그를 세우던 자리가
 * 전부 막혔다. 각 스펙이 `v1Tournament.create` 를 손으로 적으면 **필드 매핑이 스펙마다
 * 갈린다** — 어떤 스펙은 `scheduledAt` 을 빼먹고, 어떤 스펙은 `kind` 를 빠뜨려 리그가 아닌
 * 대회를 만든다. 프로덕션과 **같은 매핑 함수**(`leagueMirrorCreateData`)를 지나게 해서 그
 * 갈림을 없앤다.
 *
 * 로스터가 필요하면 `teamIds` 를 준다 — 로스터 = `confirmed` 등록이므로 등록 행으로 만든다.
 */
export async function seedLeagueOnTournamentAxis(
  prisma: PrismaClient,
  input: {
    id?: string;
    title: string;
    sportId: string;
    sportCode?: string;
    regionId: string;
    createdByAdminUserId?: string;
    startsOn?: Date;
    endsOn?: Date;
    state?: 'draft' | 'active' | 'completed';
    seriesId?: string | null;
    tier?: number | null;
    seasonNo?: number | null;
    teamIds?: readonly string[];
    /** 등록의 `appliedByUserId`. 팀 owner 를 쓰는 프로덕션과 달리 스펙은 아무 유저면 된다. */
    appliedByUserId?: string;
  },
): Promise<{ id: string; title: string; startsOn: Date; endsOn: Date }> {
  const id = input.id ?? randomUUID();
  const startsOn = input.startsOn ?? new Date();
  const endsOn = input.endsOn ?? new Date(Date.now() + 7 * 86_400_000);
  const sportCode = input.sportCode ?? 'futsal';

  // **`create` 가 아니라 `upsert` 다.** 고정 id 를 쓰는 스펙이 여러 개고(같은 파일 안의
  // 여러 케이스가 같은 리그를 재사용한다), 그때 `create` 면 두 번째 케이스가 P2002 로 죽는다
  // — 픽스처가 스펙을 깨는 자리가 된다.
  const data = {
    ...leagueMirrorCreateData({
      id,
      title: input.title,
      sportId: input.sportId,
      regionId: input.regionId,
      state: input.state ?? LeagueStateValue.draft,
      startsOn,
      endsOn,
      seriesId: input.seriesId ?? null,
      tier: input.tier ?? null,
      seasonNo: input.seasonNo ?? null,
      sportCode,
      createdAt: new Date(),
    }),
    ...(input.createdByAdminUserId === undefined
      ? {}
      : { createdByAdminUserId: input.createdByAdminUserId }),
  };
  // `update` 에서 `createdAt` 을 뺀다 — 재사용 때 생성 시각이 밀리면 **목록 정렬과 대진 생성
  // 순서가 달라진다**(그 두 곳이 createdAt 에 의존한다). 픽스처가 그 값을 흔들면 스펙이
  // 재는 순서가 실행마다 바뀐다.
  const { createdAt: _createdAtOnCreateOnly, ...updatable } = data;
  await prisma.v1Tournament.upsert({ where: { id }, update: updatable, create: data });

  for (const teamId of input.teamIds ?? []) {
    await prisma.v1TournamentRegistration.upsert({
      where: { tournamentId_teamId: { tournamentId: id, teamId } },
      update: { status: 'confirmed' },
      create: {
        tournamentId: id,
        teamId,
        appliedByUserId: input.appliedByUserId ?? 'fixture-user',
        status: 'confirmed',
        entrySource: 'seeded',
      },
    });
  }

  return { id, title: input.title, startsOn, endsOn };
}

/** 리그 설정 버전 id — 스펙이 대진을 만들 때 같은 값을 써야 한다. */
export function leagueCompetitionConfigId(sportCode = 'futsal'): string {
  return competitionConfigVersionIdForSport(sportCode);
}
