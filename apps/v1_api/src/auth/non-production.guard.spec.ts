import { NotFoundException } from '@nestjs/common';
import { NonProductionGuard } from './non-production.guard';

describe('NonProductionGuard', () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  it('answers 404 in production mode, which alpha runs in too', () => {
    process.env.NODE_ENV = 'production';
    expect(() => new NonProductionGuard().canActivate()).toThrow(NotFoundException);
  });

  it('lets local and CI runs through', () => {
    process.env.NODE_ENV = 'test';
    expect(new NonProductionGuard().canActivate()).toBe(true);
  });
});
