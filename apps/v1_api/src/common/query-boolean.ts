import type { TransformFnParams } from 'class-transformer';

/**
 * 쿼리스트링의 'true'/'false' 를 boolean 으로 바꾼다. 그 외 값은 그대로 두어 @IsBoolean 이 400 으로 거른다.
 * 전역 파이프의 enableImplicitConversion 이 `value` 를 먼저 Boolean('false') === true 로 바꿔 두므로 원문(obj[key])을 읽는다.
 */
export function queryBoolean({ obj, key, value }: TransformFnParams): unknown {
  const raw: unknown = obj?.[key] ?? value;
  if (raw === 'true' || raw === true) return true;
  if (raw === 'false' || raw === false) return false;
  return raw;
}
