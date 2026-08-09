import { FUTSAL_V1_CONFIG } from './competition-config.presets';

describe('FUTSAL_V1_CONFIG.events', () => {
  it('uses FOUL, not the legacy TEAM_FOUL label that predates V1GameEventType.FOUL', () => {
    expect(FUTSAL_V1_CONFIG.events).not.toContain('TEAM_FOUL');
    expect(FUTSAL_V1_CONFIG.events).toContain('FOUL');
  });
});
