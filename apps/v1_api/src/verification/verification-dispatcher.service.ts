import { Injectable, Logger } from '@nestjs/common';
import { V1VerificationChannel } from '@prisma/client';

/**
 * 인증코드 발송기 — 프로토타입엔 실제 SMS/이메일 provider 가 없어 스텁.
 * 발송은 서버 로그로만 남기고, V1_VERIFICATION_DEV_ECHO=true 일 때만 서비스가
 * 응답에 devCode 를 포함해 개발/검증 흐름을 가능하게 한다.
 * 실제 provider 연동 시 send() 에 어댑터 1개만 끼우면 된다(상태머신·게이트 변경 불필요).
 */
@Injectable()
export class VerificationDispatcherService {
  private readonly logger = new Logger(VerificationDispatcherService.name);

  readonly devEcho = process.env.V1_VERIFICATION_DEV_ECHO === 'true';

  send(channel: V1VerificationChannel, target: string, code: string) {
    const masked = target.length > 4 ? `${target.slice(0, 2)}***${target.slice(-2)}` : '***';
    this.logger.log(
      `[verification:${channel}] dispatched code to ${masked}${this.devEcho ? ` (dev code=${code})` : ''}`,
    );
  }
}
