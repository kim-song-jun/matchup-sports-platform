import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MutateTeamMatchRecordDto } from './team-match-record.dto';

describe('shared record command validation', () => {
  const valid = { commandId: '17200000-0000-4000-8000-000000000001', expectedVersion: 0, action: 'add', minute: null, participantId: null };
  it('allows an unknown scorer and optional clock', async () => {
    expect(await validate(plainToInstance(MutateTeamMatchRecordDto, valid))).toHaveLength(0);
  });
  it.each([{ minute: -1 }, { minute: 1.5 }, { minute: 1000 }, { expectedVersion: -1 }, { commandId: 'bad' }, { action: 'officialize' }, { ownGoal: 'yes' }])('rejects invalid command %j', async (patch) => {
    expect((await validate(plainToInstance(MutateTeamMatchRecordDto, { ...valid, ...patch }))).length).toBeGreaterThan(0);
  });
});
