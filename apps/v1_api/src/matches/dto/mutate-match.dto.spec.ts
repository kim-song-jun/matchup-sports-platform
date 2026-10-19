import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MutateMatchDto, UpdateMatchDto } from './mutate-match.dto';

describe('MutateMatchDto', () => {
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

  it('accepts a one-person match capacity', async () => {
    const errors = await validate(plainToInstance(MutateMatchDto, { ...valid, capacity: 1 }));
    expect(errors.some((error) => error.property === 'capacity')).toBe(false);
  });

  it('rejects a capacity below one person', async () => {
    const errors = await validate(plainToInstance(MutateMatchDto, { ...valid, capacity: 0 }));
    expect(errors.some((error) => error.property === 'capacity')).toBe(true);
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

  /**
   * MD-QA #163 — 웹 폼은 title.trim() 으로 막지만 서버는 빈 제목을 그대로 받아
   * alpha 에 제목 없는 매치가 201 로 생성됐다. 서버 경계에서도 거절해야 한다.
   */
  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
  ])('rejects a %s title', async (_label, title) => {
    const errors = await validate(plainToInstance(MutateMatchDto, { ...valid, title }));
    expect(errors.some((error) => error.property === 'title')).toBe(true);
  });

  it('trims surrounding whitespace from the title', async () => {
    const dto = plainToInstance(MutateMatchDto, { ...valid, title: '  주말 풋살  ' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'title')).toBe(false);
    expect(dto.title).toBe('주말 풋살');
  });

  it('applies the same title rule to updates', async () => {
    const errors = await validate(
      plainToInstance(UpdateMatchDto, { ...valid, title: '   ', version: '2026-10-16T00:00:00.000Z' }),
    );
    expect(errors.some((error) => error.property === 'title')).toBe(true);
  });
});
