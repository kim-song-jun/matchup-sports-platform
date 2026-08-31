import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { assertTeamLineupManager, assertTeamLineupMember } from './team-lineup-access';
import { parseLineupLimits } from '../tournaments/competition-config/competition-config.parse';
import type {
  SaveTeamTacticsBoardDto,
  TeamTacticsBoardEntryDto,
} from './dto/team-tactics-board.dto';

/**
 * 첫 저장의 버전. 스키마 기본값 0 을 그대로 쓰면 "아직 저장 안 됨"(serialize 가 보드 없음을
 * 0 으로 표현한다)과 "방금 처음 저장됨"이 같은 값이 돼, 화면이 둘을 구분할 수 없다.
 */
const FIRST_SAVED_VERSION = 1;

type BoardRow = {
  id: string;
  teamId: string;
  formation: string | null;
  version: number;
  updatedByUserId: string | null;
  updatedAt: Date;
  entries: Array<{
    userId: string | null;
    displayName: string;
    jerseyNumber: number | null;
    position: string | null;
    positionX: number | null;
    positionY: number | null;
    started: boolean;
    goalkeeper: boolean;
  }>;
};

/**
 * 팀 전술보드 — 한 경기에서 한 팀이 짜는 배치.
 *
 * 경기 기록(`V1GameParticipant`)과 **책임이 다르다.** 참가자 행은 "이 사람이 이 경기
 * 명단에 있다"는 사실이고, 보드는 "그 사람들을 어떻게 놓을 것인가"라는 팀의 계획이다.
 * 그래서 보드는 몇 번을 고쳐도 기록에 영향이 없고, 리비전을 쌓지 않으며(사이드당 한 행),
 * 그 팀 밖으로 나가지 않는다.
 *
 * 가시성은 두 단계다. 보는 것은 활성 팀원 전체(자기가 어디서 뛰는지 알아야 한다),
 * 고치는 것은 운영진(owner/manager)이다.
 */
@Injectable()
export class TeamTacticsBoardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: V1AuthUser, teamId: string, gameId: string) {
    await assertTeamLineupMember(this.prisma, teamId, user.id);
    const side = await this.resolveSide(gameId, teamId);
    const board = await this.loadBoard(side);
    return this.serialize(side, board, await this.resolveLineupLimits(gameId));
  }

  async save(user: V1AuthUser, teamId: string, gameId: string, dto: SaveTeamTacticsBoardDto) {
    await assertTeamLineupManager(this.prisma, teamId, user.id);
    const side = await this.resolveSide(gameId, teamId);
    this.assertCoordinatePairs(dto.entries);

    const entryRows = this.toEntryRows(dto.entries);
    /* 버전 검사와 실제 쓰기가 **한 트랜잭션 안에서** 일어나야 한다.
     *
     * 밖에서 읽어 비교하면 두 운영진이 동시에 저장할 때 둘 다 검사를 통과한 뒤 나중 커밋이
     * 앞 저장을 통째로 덮어쓴다 — 낙관적 잠금이 막으려던 바로 그 일이 그대로 일어난다.
     * 그래서 트랜잭션 안에서 다시 읽고, 쓰기 자체를 `where: { id, version }` 조건부
     * updateMany 로 건다(compare-and-swap). 그 사이 다른 트랜잭션이 버전을 올렸다면
     * WHERE 가 더 이상 맞지 않아 count 가 0 이 되고, 우리는 엔트리를 건드리기 전에 멈춘다.
     * 엔트리 삭제·생성을 CAS **뒤에** 두는 순서가 중요하다 — 앞에 두면 진 쪽이 이긴 쪽의
     * 엔트리를 지우고 나서 실패한다. */
    const saved = await this.prisma.$transaction(async (tx) => {
      const current = await tx.v1TeamTacticsBoard.findUnique({
        where: { sideId: side.id },
        select: { id: true, teamId: true, version: true },
      });

      if (current === null) {
        // 아직 보드가 없다. 화면이 빈 판(version 0)을 읽고 저장하는 정상 경로다.
        if (dto.expectedVersion !== undefined && dto.expectedVersion !== 0) {
          throw this.versionConflict();
        }
        try {
          return await tx.v1TeamTacticsBoard.create({
            data: {
              gameId,
              sideId: side.id,
              // side 에서 그대로 가져온다 — 호출자가 준 teamId 를 쓰지 않는 것이 요점이다.
              // loadBoard 의 불변식 검사와 짝을 이뤄 "보드의 팀 ≠ 사이드의 팀" 상태가
              // 애초에 만들어지지 않게 한다.
              teamId: side.teamId,
              formation: dto.formation ?? null,
              // 스키마 기본값 0 을 그대로 두면 "한 번도 저장 안 됨"과 "방금 처음 저장됨"이
              // 같은 값이 된다(serialize 가 보드 없음을 0 으로 표현한다). 첫 저장을 1 로
              // 시작해 그 둘을 구분한다.
              version: FIRST_SAVED_VERSION,
              updatedByUserId: user.id,
              entries: { create: entryRows },
            },
            include: { entries: { orderBy: { sortOrder: 'asc' } } },
          });
        } catch (error) {
          // sideId 유니크 — 그 사이 다른 운영진이 먼저 만들었다는 뜻이다.
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw this.versionConflict();
          }
          throw error;
        }
      }

      // 읽기와 같은 불변식을 쓰기에서도 확인한다 — 어긋난 보드를 덮어쓰는 것도 안 된다.
      if (current.teamId !== side.teamId) throw this.teamMismatch();
      // 이건 **선제 검사**일 뿐이고 잠금 자체가 아니다. 아래 조건부 갱신이 언제나 CAS 로
      // 동작하므로, expectedVersion 을 주지 않아도 동시 저장 보호는 그대로다 — 값을 주면
      // 쓰기를 시도하기 전에 어긋남을 알려주는 것뿐이다(DTO 주석에 이유를 적어 뒀다).
      if (dto.expectedVersion !== undefined && dto.expectedVersion !== current.version) {
        throw this.versionConflict();
      }

      const swapped = await tx.v1TeamTacticsBoard.updateMany({
        where: { id: current.id, version: current.version },
        data: {
          formation: dto.formation ?? null,
          version: { increment: 1 },
          updatedByUserId: user.id,
        },
      });
      if (swapped.count === 0) throw this.versionConflict();

      // 전체 교체 — 부분 병합을 하지 않는 이유는 DTO 주석 참고.
      await tx.v1TeamTacticsBoardEntry.deleteMany({ where: { boardId: current.id } });
      if (entryRows.length > 0) {
        await tx.v1TeamTacticsBoardEntry.createMany({
          data: entryRows.map((row) => ({ ...row, boardId: current.id })),
        });
      }
      return tx.v1TeamTacticsBoard.findUniqueOrThrow({
        where: { id: current.id },
        include: { entries: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    return this.serialize(side, saved, await this.resolveLineupLimits(gameId));
  }

  // ─── internals ───────────────────────────────────────────────────────────

  /**
   * 이 경기에서 그 팀이 서 있는 사이드. 팀이 이 경기에 없으면 보드도 없다.
   *
   * `gameId` 단독으로 조회하지 않고 반드시 `teamId` 와 함께 좁힌다 — 권한은 팀 단위로
   * 검증했으므로, 남의 사이드 id 를 끼워 넣어 상대 전술을 여는 경로가 열려서는 안 된다.
   */
  private async resolveSide(gameId: string, teamId: string) {
    const side = await this.prisma.v1GameSide.findFirst({
      where: { gameId, teamId },
      select: { id: true, teamId: true, sideKey: true, displayNameSnapshot: true },
    });
    if (side === null || side.teamId === null) {
      throw new NotFoundException({
        code: 'TACTICS_BOARD_SIDE_NOT_FOUND',
        message: '이 경기에서 팀을 찾을 수 없어요.',
      });
    }
    return { ...side, teamId: side.teamId };
  }

  /**
   * **불변식: `board.teamId === side.teamId`.**
   *
   * DB 제약으로는 걸 수 없다 — `V1GameSide.teamId` 가 nullable 이라(게스트 상대) 복합 FK 가
   * 성립하지 않는다. 그래서 읽을 때마다 검사한다. 어긋나는 경우는 보드가 만들어진 뒤
   * 운영자가 그 사이드의 팀을 교체했을 때다. 그때 보드를 그대로 돌려주면 **새로 들어온
   * 팀에게 이전 팀의 전술이 그대로 보인다** — 조용히 새는 종류라 발견되지 않는다.
   * 잘못된 값을 고쳐서 이어가지 않고 멈추는 이유는, 어느 쪽이 옳은지 서비스가 알 수 없기
   * 때문이다(이전 팀의 보드를 지워야 하는지 이관해야 하는지는 운영 판단이다).
   */
  private async loadBoard(side: { id: string; teamId: string }): Promise<BoardRow | null> {
    const board = await this.prisma.v1TeamTacticsBoard.findUnique({
      where: { sideId: side.id },
      include: { entries: { orderBy: { sortOrder: 'asc' } } },
    });
    if (board === null) return null;
    if (board.teamId !== side.teamId) throw this.teamMismatch();
    return board;
  }

  private teamMismatch() {
    return new ConflictException({
      code: 'TACTICS_BOARD_TEAM_MISMATCH',
      message: '이 경기의 팀 구성이 바뀌어 저장된 전술을 열 수 없어요. 운영자에게 문의해 주세요.',
    });
  }

  private versionConflict() {
    return new ConflictException({
      code: 'TACTICS_BOARD_VERSION_CONFLICT',
      message: '다른 운영진이 먼저 저장했어요. 최신 배치를 불러와 다시 저장해 주세요.',
    });
  }

  /** 좌표는 둘 다 있거나 둘 다 없어야 한다 — 부분 좌표를 허용하면 렌더링이 조용히 깨진다. */
  private assertCoordinatePairs(entries: TeamTacticsBoardEntryDto[]) {
    const broken = entries.findIndex(
      (entry) => (entry.positionX === undefined) !== (entry.positionY === undefined),
    );
    if (broken >= 0) {
      throw new UnprocessableEntityException({
        code: 'TACTICS_BOARD_INVALID_COORDINATE',
        message: '배치 좌표는 X와 Y를 함께 주거나 함께 비워야 해요.',
      });
    }
  }

  private toEntryRows(entries: TeamTacticsBoardEntryDto[]) {
    return entries.map((entry, index) => ({
      userId: entry.userId ?? null,
      displayName: entry.displayName,
      jerseyNumber: entry.jerseyNumber ?? null,
      position: entry.position ?? null,
      positionX: entry.positionX ?? null,
      positionY: entry.positionY ?? null,
      started: entry.started,
      goalkeeper: entry.goalkeeper ?? false,
      sortOrder: index,
    }));
  }

  /**
   * [P1-d] 이 경기의 **선발 인원 한도**를 읽는다. 경기별 라인업 화면이 사라지면서 그
   * 화면이 하던 인원수 검사가 갈 곳을 잃었고, 이 보드가 그 자리를 잇는다.
   * 설정을 못 찾으면 파서의 기본값이 쓰인다 — 한도를 모른다고 보드를 못 열게 하지 않는다.
   */
  private async resolveLineupLimits(gameId: string) {
    const game = await this.prisma.v1Game.findUnique({
      where: { id: gameId },
      select: { competitionConfigVersionId: true },
    });
    const config =
      game === null
        ? null
        : await this.prisma.v1CompetitionConfigVersion.findUnique({
            where: { id: game.competitionConfigVersionId },
            select: { lineup: true },
          });
    return parseLineupLimits(config?.lineup ?? null);
  }

  private serialize(
    side: { id: string; sideKey: string; displayNameSnapshot: string },
    board: BoardRow | null,
    lineupLimits: ReturnType<typeof parseLineupLimits>,
  ) {
    return {
      gameSideId: side.id,
      sideKey: side.sideKey,
      teamNameSnapshot: side.displayNameSnapshot,
      // 보드가 아직 없으면 빈 판을 돌려준다 — 화면이 404 와 "아직 안 짰다"를 구분하려고
      // 두 경로를 갖지 않아도 되게 한다. version 0 은 저장된 적이 없다는 뜻이다.
      formation: board?.formation ?? null,
      version: board?.version ?? 0,
      updatedAt: board?.updatedAt ?? null,
      updatedByUserId: board?.updatedByUserId ?? null,
      starterCount: board?.entries.filter((entry) => entry.started).length ?? 0,
      benchCount: board?.entries.filter((entry) => !entry.started).length ?? 0,
      // [P1-d] 선발 인원 한도. 경기별 라인업 화면이 사라지면서 그 화면이 하던
      // 인원수 검사가 갈 곳을 잃었다 -- 이 보드가 그 자리를 잇는다.
      //
      // **값을 내려줄 뿐 저장을 막지 않는다.** 화면이 "선발 5명이어야 하는데 3명"
      // 같은 경고를 띄우는 데 쓴다. 게이트로 만들지 않는 이유는 P1-c 가 지운 것이
      // 정확히 그런 게이트이기 때문이다 -- 명단이 덜 찼다고 경기를 못 여는 쪽이
      // 현장에서 더 큰 문제였다. 팀이 유효한 포메이션을 짜도록 **돕되 막지 않는다.**
      lineupLimits,
      entries:
        board?.entries.map((entry) => ({
          userId: entry.userId,
          displayName: entry.displayName,
          jerseyNumber: entry.jerseyNumber,
          position: entry.position,
          positionX: entry.positionX,
          positionY: entry.positionY,
          started: entry.started,
          goalkeeper: entry.goalkeeper,
        })) ?? [],
    };
  }
}
