import { tmpdir } from 'node:os';
import { basename, dirname, resolve, sep } from 'node:path';
import {
  GameOperationGateRootConfigurationError,
  isSimplifiedOperationFlagGateEnabled,
  resolveGameOperationGateRoot,
  SIMPLIFIED_GATE_ALLOWED_KEYS,
  SIMPLIFIED_OPERATION_FLAG_GATE_ENV_VAR,
} from './game-operation-flags';

describe('game operation gate root', () => {
  it('selects the current OS temporary root for gate evidence', () => {
    const gateRoot = resolveGameOperationGateRoot();

    expect(dirname(gateRoot)).toBe(
      resolve(tmpdir(), 'teameet-ulw-evidence'),
    );
    expect(basename(gateRoot)).toBe('teameet-team-tournament-operations-v1');
  });

  it('rejects a sibling temporary root', () => {
    expect(() =>
      resolveGameOperationGateRoot(resolve(tmpdir(), 'teameet-sibling-root')),
    ).toThrow(GameOperationGateRootConfigurationError);
  });

  it('rejects traversal-shaped configured roots outside the temporary root', () => {
    const traversalRoot = `${tmpdir()}${sep}..${sep}teameet-traversal-root`;

    expect(() => resolveGameOperationGateRoot(traversalRoot)).toThrow(
      GameOperationGateRootConfigurationError,
    );
  });
});

// Task: admin on/off for PUBLIC_LIVE/DIRECTOR_OFFICIALIZE without the immutable gate bundle
// (non-production only). This is the single most important test in this PR -- it is what proves
// the shortcut cannot silently activate in production. `docker-compose.alpha.yml` and
// `docker-compose.prod.yml` both hardcode `NODE_ENV=production` (alpha is deployed as an overlay
// on top of the prod compose), so this dedicated, default-disabled variable -- not NODE_ENV -- is
// the only environment signal `isSimplifiedOperationFlagGateEnabled` can trust.
describe('simplified operation flag gate environment signal', () => {
  it('is disabled by default (an unconfigured/production-shaped env)', () => {
    expect(isSimplifiedOperationFlagGateEnabled({})).toBe(false);
  });

  it('rejects every value except the exact literal "true"', () => {
    for (const value of ['TRUE', 'True', '1', 'yes', 'false', '']) {
      expect(
        isSimplifiedOperationFlagGateEnabled({
          [SIMPLIFIED_OPERATION_FLAG_GATE_ENV_VAR]: value,
        }),
      ).toBe(false);
    }
  });

  it('is enabled only by the exact opt-in literal "true"', () => {
    expect(
      isSimplifiedOperationFlagGateEnabled({
        [SIMPLIFIED_OPERATION_FLAG_GATE_ENV_VAR]: 'true',
      }),
    ).toBe(true);
  });

  it('scopes the simplified path to boolean, always-rollback-able flags only', () => {
    expect(SIMPLIFIED_GATE_ALLOWED_KEYS).toEqual(['PUBLIC_LIVE', 'DIRECTOR_OFFICIALIZE']);
    expect(SIMPLIFIED_GATE_ALLOWED_KEYS).not.toContain('GAME_WRITE');
    expect(SIMPLIFIED_GATE_ALLOWED_KEYS).not.toContain('GAME_READ');
  });
});
