import { UnprocessableEntityException } from '@nestjs/common';
import { assertSameBracketTrack } from './bracket-track';

describe('assertSameBracketTrack', () => {
  it.each([
    ['upper', 'lower'],
    ['upper', 'overall'],
    ['lower', 'overall'],
  ] as const)('rejects %s → %s edges', (source, target) => {
    expect(() => assertSameBracketTrack(source, target)).toThrow(UnprocessableEntityException);
    expect(() => assertSameBracketTrack(source, target)).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ code: 'BRACKET_TRACK_MISMATCH' }) }),
    );
  });

  it.each(['overall', 'upper', 'lower'] as const)('allows an edge within %s', (track) => {
    expect(() => assertSameBracketTrack(track, track)).not.toThrow();
  });
});
