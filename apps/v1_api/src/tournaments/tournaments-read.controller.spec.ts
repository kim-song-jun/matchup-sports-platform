import { GUARDS_METADATA } from '@nestjs/common/constants';
import { TournamentsReadController } from './tournaments-read.controller';

function getGuards(target: object) {
  return Reflect.getMetadata(GUARDS_METADATA, target) ?? [];
}

describe('TournamentsReadController auth contract', () => {
  it('keeps list/detail discovery routes public', () => {
    expect(getGuards(TournamentsReadController)).toHaveLength(0);
    expect(getGuards(TournamentsReadController.prototype.list)).toHaveLength(0);
    expect(getGuards(TournamentsReadController.prototype.get)).toHaveLength(0);
  });
});
