import type { NextFunction, Request, Response } from 'express';
import {
  createV1MutationOriginMiddleware,
  requireProductionFrontendOrigin,
  V1FrontendOriginConfigurationError,
} from './v1-mutation-origin';

describe('v1 mutation origin security', () => {
  it('requires one canonical HTTPS frontend origin in production', () => {
    expect(requireProductionFrontendOrigin('https://teameet.co.kr/')).toBe(
      'https://teameet.co.kr',
    );
    expect(() => requireProductionFrontendOrigin(undefined)).toThrow(
      V1FrontendOriginConfigurationError,
    );
    expect(() => requireProductionFrontendOrigin('http://teameet.co.kr')).toThrow(
      V1FrontendOriginConfigurationError,
    );
    expect(() => requireProductionFrontendOrigin('https://teameet.co.kr/app')).toThrow(
      V1FrontendOriginConfigurationError,
    );
  });

  it('rejects a cross-origin browser mutation before it reaches a controller', () => {
    const { request, response, next, status, json } = requestContext(
      'POST',
      'https://attacker.teameet.co.kr',
    );

    createV1MutationOriginMiddleware('https://teameet.co.kr')(request, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_REQUEST_ORIGIN' }),
    );
  });

  it.each([
    ['POST', 'https://teameet.co.kr'],
    ['PATCH', undefined],
    ['GET', 'https://attacker.teameet.co.kr'],
  ])('allows %s with origin %s when it cannot be browser CSRF', (method, origin) => {
    const { request, response, next } = requestContext(method, origin);

    createV1MutationOriginMiddleware('https://teameet.co.kr')(request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

function requestContext(method: string, origin: string | undefined) {
  const status = jest.fn().mockReturnThis();
  const json = jest.fn();
  const request = {
    method,
    header: jest.fn((name: string) => (name === 'origin' ? origin : undefined)),
  } as unknown as Request;
  const response = { status, json } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { request, response, next, status, json };
}
