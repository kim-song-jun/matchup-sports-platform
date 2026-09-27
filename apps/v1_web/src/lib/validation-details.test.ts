import { describe, expect, it } from 'vitest';
import { validationFieldMessages } from './validation-details';

const validationError = (details: unknown) => ({ code: 'VALIDATION_ERROR', details });

describe('validationFieldMessages', () => {
  it('필드별 메시지를 모은다', () => {
    expect(
      validationFieldMessages(validationError([{ field: 'email', messages: ['이메일 형식이 아니에요', 3] }])),
    ).toEqual({ email: ['이메일 형식이 아니에요'] });
  });

  it('검증 오류가 아니면 빈 객체', () => {
    expect(validationFieldMessages({ code: 'INQUIRY_DUPLICATE', details: [{ field: 'email', messages: ['x'] }] })).toEqual({});
  });

  it('요청자가 보낸 __proto__·constructor 키는 결과 객체의 프로토타입을 바꾸지 않는다', () => {
    const result = validationFieldMessages(
      validationError([
        { field: '__proto__', messages: ['polluted'] },
        { field: 'constructor', messages: ['polluted'] },
        { field: 'name', messages: ['이름을 적어 주세요'] },
      ]),
    );
    expect(Object.keys(result)).toEqual(['name']);
    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
