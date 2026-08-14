import { tmpdir } from 'node:os';
import { basename, dirname, resolve, sep } from 'node:path';
import {
  GameOperationEvidencePathError,
  GameOperationGateRootConfigurationError,
  resolveGameOperationEvidencePath,
  resolveGameOperationGateRoot,
  SIMPLIFIED_GATE_ALLOWED_KEYS,
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

  it('accepts nested evidence below the canonical gate root', () => {
    const gateRoot = resolveGameOperationGateRoot();
    const nestedReceipt = resolve(gateRoot, 'receipts', 'accepted.json');

    expect(resolveGameOperationEvidencePath(nestedReceipt)).toBe(nestedReceipt);
  });

  it('rejects arbitrary and traversal-shaped evidence paths', () => {
    const gateRoot = resolveGameOperationGateRoot();
    const outsidePath = resolve(gateRoot, '..', 'operator-secret.json');

    expect(() => resolveGameOperationEvidencePath(outsidePath)).toThrow(
      GameOperationEvidencePathError,
    );
    expect(() => resolveGameOperationEvidencePath('/etc/passwd')).toThrow(
      GameOperationEvidencePathError,
    );
  });

  it('requires a gate bundle itself to be a direct child of the gate root', () => {
    const gateRoot = resolveGameOperationGateRoot();
    const directBundle = resolve(gateRoot, 'flag-gate-attempt-C-enable.json');
    const nestedBundle = resolve(gateRoot, 'nested', 'flag-gate-attempt-C-enable.json');

    expect(resolveGameOperationEvidencePath(directBundle, true)).toBe(directBundle);
    expect(() => resolveGameOperationEvidencePath(nestedBundle, true)).toThrow(
      GameOperationEvidencePathError,
    );
  });
});

// Task: admin on/off for both operation flags without the immutable gate bundle. Whether the
// path is reachable at all is now a DB-backed switch (`v1_game_operation_gate_settings`, see the
// integration spec for CAS/audit coverage of that switch) rather than an environment variable --
// this spec only covers the key allowlist, which is a pure/static export. `GAME_WRITE`/`GAME_READ`
// were retired with the Task 10 cutover cleanup -- `GameOperationFlagKey` no longer has those
// values at all, so this list can only ever contain the two operational kill switches.
describe('simplified operation flag gate allowed keys', () => {
  it('allows both operation flags now that the gate is a DB switch, not an env var', () => {
    expect(SIMPLIFIED_GATE_ALLOWED_KEYS).toEqual(['PUBLIC_LIVE', 'DIRECTOR_OFFICIALIZE']);
  });
});
