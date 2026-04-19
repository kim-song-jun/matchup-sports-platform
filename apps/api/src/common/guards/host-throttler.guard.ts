import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class HostThrottlerGuard extends ThrottlerGuard {
  // Use authenticated user id as the throttle key so hosts on shared NAT/VPN
  // receive independent rate-limit buckets. Falls back to req.ip for
  // unauthenticated requests (e.g. health check, OAuth redirects).
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.user?.id ?? req.ip;
  }
}
