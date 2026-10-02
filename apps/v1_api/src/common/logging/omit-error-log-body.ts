import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const OMIT_ERROR_LOG_BODY = Symbol('omitErrorLogBody');

type MarkableRequest = Request & { [OMIT_ERROR_LOG_BODY]?: true };

/**
 * 요청 본문을 에러 로그에 남기지 않을 라우트에 건다. 동의 전에 받은 개인정보가 보존 기한 없는
 * 에러 로그로 들어가면 안 되는 비회원 폼이 대상이다.
 * 전역 가드(스로틀 429)·검증 파이프(400)보다 먼저 돌아야 해서 인터셉터가 아니라 미들웨어다.
 */
@Injectable()
export class OmitErrorLogBodyMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    (req as MarkableRequest)[OMIT_ERROR_LOG_BODY] = true;
    next();
  }
}

export function shouldOmitErrorLogBody(req: Request): boolean {
  return (req as MarkableRequest)[OMIT_ERROR_LOG_BODY] === true;
}
