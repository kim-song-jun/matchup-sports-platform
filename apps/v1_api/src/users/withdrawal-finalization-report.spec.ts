import { WITHDRAWAL_FINALIZATION_REPORT_TYPE, recordWithdrawalFinalizationReport } from './withdrawal-finalization-report';

type Row = { businessKey: string; type: string; aggregateId: string; payload: unknown };

function outbox() {
  const rows: Row[] = [];
  return {
    rows,
    db: {
      v1OutboxEvent: {
        createMany: jest.fn(async ({ data, skipDuplicates }: { data: Row[]; skipDuplicates: boolean }) => {
          expect(skipDuplicates).toBe(true);
          let count = 0;
          for (const row of data) {
            if (rows.some((existing) => existing.businessKey === row.businessKey)) continue;
            rows.push(row);
            count += 1;
          }
          return { count };
        }),
      },
    } as never,
  };
}

const RUN_AT = new Date('2026-11-30T12:00:00.000Z');

describe('recordWithdrawalFinalizationReport', () => {
  it('queues nothing for a run that did nothing', async () => {
    const { db, rows } = outbox();

    await expect(recordWithdrawalFinalizationReport(db, { finalizedUserIds: [], skipped: [] }, RUN_AT)).resolves.toBe(false);
    expect(rows).toEqual([]);
  });

  it('queues the counts and the skipped ids sorted, under the run time', async () => {
    const { db, rows } = outbox();

    await expect(
      recordWithdrawalFinalizationReport(
        db,
        {
          finalizedUserIds: ['u3', 'u1'],
          skipped: [
            { userId: 'u9', reason: 'team_authority' },
            { userId: 'u2', reason: 'no_request_log' },
          ],
        },
        RUN_AT,
      ),
    ).resolves.toBe(true);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: WITHDRAWAL_FINALIZATION_REPORT_TYPE,
      aggregateId: RUN_AT.toISOString(),
      payload: {
        runAt: RUN_AT.toISOString(),
        finalizedCount: 2,
        skipped: [
          { userId: 'u2', reason: 'no_request_log' },
          { userId: 'u9', reason: 'team_authority' },
        ],
      },
    });
  });

  it('reports the same outcome once per UTC day, whatever order it was found in', async () => {
    const { db, rows } = outbox();
    const skipped = [
      { userId: 'u2', reason: 'no_request_log' as const },
      { userId: 'u9', reason: 'active_admin' as const },
    ];

    await recordWithdrawalFinalizationReport(db, { finalizedUserIds: [], skipped }, RUN_AT);
    const again = await recordWithdrawalFinalizationReport(
      db,
      { finalizedUserIds: [], skipped: [...skipped].reverse() },
      new Date(RUN_AT.getTime() + 3 * 60 * 60_000),
    );
    expect(again).toBe(false);
    expect(rows).toHaveLength(1);

    await recordWithdrawalFinalizationReport(db, { finalizedUserIds: [], skipped }, new Date('2026-12-01T00:00:00.000Z'));
    expect(rows).toHaveLength(2);
  });

  it('reports a different outcome the same day as its own message', async () => {
    const { db, rows } = outbox();

    await recordWithdrawalFinalizationReport(db, { finalizedUserIds: ['u1'], skipped: [] }, RUN_AT);
    await recordWithdrawalFinalizationReport(db, { finalizedUserIds: ['u2'], skipped: [] }, RUN_AT);

    expect(rows).toHaveLength(2);
  });
});
