import { describe, expect, it } from 'vitest';
import { publicAssetPath } from './assets';

describe('publicAssetPath', () => {
  it('keeps public assets at the web root', () => {
    expect(publicAssetPath('/brand/teameet-mark.png')).toBe('/brand/teameet-mark.png');
  });
});
