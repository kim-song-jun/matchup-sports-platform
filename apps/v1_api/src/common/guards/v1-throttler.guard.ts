import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * 프로덕션에서만 레이트리밋을 강제하는 ThrottlerGuard.
 *
 * DoS/계정 enumeration 방어는 인터넷에 노출된 프로덕션 배포에만 필요하다.
 * dev/test/e2e(NODE_ENV !== 'production')에서는 스킵해, 테스트 스위트가 짧은 시간에
 * 반복 요청(로그인 등)을 보낼 때 429로 flaky 해지는 것을 방지한다.
 */
@Injectable()
export class V1ThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV !== 'production') {
      return true;
    }
    // 프로덕션에서는 @SkipThrottle 등 기본 스킵 규칙을 그대로 존중한다.
    return super.shouldSkip(context);
  }
}
