import { updateFixtureDisplayLabelsInTx } from './fixture-display-label';

function setup(bye = false) {
  const current = { homeDisplayLabel: null, awayDisplayLabel: '직접 입력', teamMatch: { deletedAt: null,
    homeSlot: bye ? { id: 'bye', kind: 'BYE', displayLabel: null } : null, awaySlot: null } };
  const tx = { $queryRaw: jest.fn(), v1TournamentMatchDetails: { findUniqueOrThrow: jest.fn().mockResolvedValue(current), update: jest.fn() }, v1TournamentSlot: { update: jest.fn() } };
  const context = { logAdminAction: jest.fn() };
  const save = (input: { homeDisplayLabel?: string | null; awayDisplayLabel?: string | null }) => updateFixtureDisplayLabelsInTx(tx as never, context as never, {} as never, 'fixture', input);
  return { tx, context, current, save };
}

describe('fixture display labels', () => {
  it('changes only presentation fields, leaving team assignment and advancement untouched', async () => {
    const { tx, context, save } = setup();
    await expect(save({ homeDisplayLabel: ' 준결승 A 승자 ' })).resolves.toEqual({ homeDisplayLabel: '준결승 A 승자', awayDisplayLabel: '직접 입력' });
    expect(tx.v1TournamentMatchDetails.update).toHaveBeenCalledWith({ where: { teamMatchId: 'fixture' }, data: { homeDisplayLabel: '준결승 A 승자' } });
    expect(tx.v1TournamentSlot.update).not.toHaveBeenCalled();
    expect(context.logAdminAction).toHaveBeenCalledTimes(1);
  });
  it('stores BYE overrides only on the shared slot used by the quarter-final', async () => {
    const { tx, save } = setup(true);
    await save({ homeDisplayLabel: '조 1위 중 5위' });
    expect(tx.v1TournamentSlot.update).toHaveBeenCalledWith({ where: { id: 'bye' }, data: { displayLabel: '조 1위 중 5위' } });
    expect(tx.v1TournamentMatchDetails.update).not.toHaveBeenCalled();
  });
  it('clears custom text to null and leaves unedited sides intact', async () => {
    const { tx, save } = setup();
    await expect(save({ awayDisplayLabel: '   ' })).resolves.toEqual({ homeDisplayLabel: null, awayDisplayLabel: null });
    expect(tx.v1TournamentMatchDetails.update).toHaveBeenCalledWith({ where: { teamMatchId: 'fixture' }, data: { awayDisplayLabel: null } });
  });
  it('does not write or audit an unchanged label', async () => {
    const { tx, context, save } = setup();
    await save({ awayDisplayLabel: '직접 입력' });
    expect(tx.v1TournamentMatchDetails.update).not.toHaveBeenCalled();
    expect(context.logAdminAction).not.toHaveBeenCalled();
  });
  it('rechecks deletion after taking the fixture locks', async () => {
    const { current, save } = setup();
    current.teamMatch.deletedAt = new Date() as never;
    await expect(save({ homeDisplayLabel: '수정' })).rejects.toMatchObject({ response: { code: 'FIXTURE_NOT_FOUND' } });
  });
});
