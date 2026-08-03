import { Injectable, InternalServerErrorException } from '@nestjs/common';
import type { GameReadAuthorityPort, GameReadAuthorityResult } from './game-read-authority.port';

/**
 * Default (Task-18-owned) `GAME_READ_AUTHORITY` implementation, bound by
 * `TournamentOperationsBoardModule.register()` whenever a composition root does not supply its own
 * provider. Task 18 has no dependency on Task 10 (dependency matrix row 18 lists 7, 8, 9, 11 only)
 * and there is no real comparator wired in this worktree.
 *
 * ## Fail-closed by design (P0 fix, review finding #4)
 * An earlier revision of this stub unconditionally returned `{ outcome: 'ok' }`, reasoning that
 * `resolve()` is only invoked while `GAME_READ === 'compare'` and, absent Task 10, nothing should
 * ever flip that flag. That reasoning lives entirely in a human's head, not in the code: nothing
 * stopped a composition root from calling `TournamentOperationsBoardModule.register()` with no
 * argument (picking up this class as `GAME_READ_AUTHORITY`) while an operator independently flips
 * the `GAME_READ` flag to `'compare'` (e.g. by mistake, or ahead of Task 10 actually landing). That
 * combination used to compile, boot, and silently approve every result under compare mode --
 * exactly the "fail-open by configuration omission" the review flags.
 *
 * `resolve()` now throws whenever it is actually invoked. Structurally, that is only possible if
 * `GAME_READ === 'compare'` while this no-op stub is still bound -- i.e. exactly the misconfigured
 * state above -- so the previously-silent bypass is now a loud, immediate 500
 * (`GAME_READ_AUTHORITY_NOT_CONFIGURED`) instead of a green response nobody can trust. Callers that
 * only ever exercise `'legacy'`/`'new'` modes (this class's only safe use) never reach this throw,
 * since the board never calls `resolve()` outside compare mode.
 */
@Injectable()
export class DirectGameReadAuthorityService implements GameReadAuthorityPort {
  async resolve(): Promise<GameReadAuthorityResult> {
    throw new InternalServerErrorException({
      code: 'GAME_READ_AUTHORITY_NOT_CONFIGURED',
      message:
        '경기 결과 조회 비교 기능이 아직 연결되지 않았어요. 운영팀에 문의해주세요.',
    });
  }
}
