import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MutateMatchDto } from './mutate-match.dto';

describe('MutateMatchDto costNote', () => {
  const valid = {
    sportId: '0e65978c-3a58-42e5-a371-cf6d6239699a',
    regionId: 'c9e88345-c8c1-4179-9f11-1c9698517008',
    title: '주말 저녁 풋살 멤버 모집',
    startsAt: '2026-10-20T10:00:00.000Z',
    capacity: 10,
    manualPlaceName: '종로구 실내풋살장',
  };

  it('accepts a payload without costNote (optional field)', async () => {
    const errors = await validate(plainToInstance(MutateMatchDto, valid));
    expect(errors.some((error) => error.property === 'costNote')).toBe(false);
  });

  it('accepts costNote at the 200-character limit', async () => {
    const errors = await validate(
      plainToInstance(MutateMatchDto, { ...valid, costNote: 'a'.repeat(200) }),
    );
    expect(errors.some((error) => error.property === 'costNote')).toBe(false);
  });

  /**
   * 200자를 넘기면 거절돼야 한다 — 안 그러면 매치 만들기 폼의 참가비 입력창(제한 없음)이
   * 그대로 통과해 DB 컬럼(varchar 200 상당)에 저장 시 잘리거나 카드 레이아웃이 깨진다.
   */
  it('rejects costNote over the 200-character limit', async () => {
    const errors = await validate(
      plainToInstance(MutateMatchDto, { ...valid, costNote: 'a'.repeat(201) }),
    );
    expect(errors.some((error) => error.property === 'costNote')).toBe(true);
  });

  it('accepts an explicit null costNote (clearing the field on update)', async () => {
    const errors = await validate(plainToInstance(MutateMatchDto, { ...valid, costNote: null }));
    expect(errors.some((error) => error.property === 'costNote')).toBe(false);
  });
});
