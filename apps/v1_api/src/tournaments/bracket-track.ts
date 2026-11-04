import { UnprocessableEntityException } from '@nestjs/common';

export function assertSameBracketTrack(
  source: string,
  target: string,
): void {
  if (source !== target) {
    throw new UnprocessableEntityException({
      code: 'BRACKET_TRACK_MISMATCH',
      message: '서로 다른 결선 범위의 경기는 연결할 수 없어요.',
    });
  }
}
