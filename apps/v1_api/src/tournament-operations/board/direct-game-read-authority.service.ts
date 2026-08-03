import { Injectable } from '@nestjs/common';
import type { GameReadAuthorityPort, GameReadAuthorityResult } from './game-read-authority.port';

/**
 * Default (Task-18-owned) GAME_READ_AUTHORITY implementation.
 *
 * Task 18 has no dependency on Task 10 (dependency matrix row 18 lists 7, 8, 9, 11 only), and
 * there is no legacy comparator wired yet in this worktree. This implementation always reports
 * `{ outcome: 'ok' }` because the board already reads exclusively from the already-shipped
 * V1Game/V1GameResultRevision ('new') source -- there is nothing to compare against today. This
 * keeps Task 18 fully self-testable without Task 10's real module, while the port contract
 * (see game-read-authority.port.ts) documents exactly what Task 10 must provide to replace it.
 */
@Injectable()
export class DirectGameReadAuthorityService implements GameReadAuthorityPort {
  async resolve(): Promise<GameReadAuthorityResult> {
    return { outcome: 'ok' };
  }
}
