import { tmpdir } from 'node:os';
import { basename, dirname, resolve, sep } from 'node:path';
import {
  GameOperationGateRootConfigurationError,
  resolveGameOperationGateRoot,
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
