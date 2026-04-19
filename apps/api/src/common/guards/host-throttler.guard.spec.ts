import { HostThrottlerGuard } from './host-throttler.guard';

// Access protected getTracker without constructing real DI dependencies.
const getTracker = (req: Record<string, any>): Promise<string> =>
  (HostThrottlerGuard.prototype as any).getTracker(req);

describe('HostThrottlerGuard.getTracker', () => {
  it('returns req.user.id when an authenticated user is present', async () => {
    const result = await getTracker({ user: { id: 'u123' }, ip: '1.2.3.4' });
    expect(result).toBe('u123');
  });

  it('returns req.ip when no user is attached (unauthenticated request)', async () => {
    const result = await getTracker({ ip: '1.2.3.4' });
    expect(result).toBe('1.2.3.4');
  });

  it('returns req.ip when req.user exists but has no id', async () => {
    const result = await getTracker({ user: {}, ip: '5.6.7.8' });
    expect(result).toBe('5.6.7.8');
  });
});
