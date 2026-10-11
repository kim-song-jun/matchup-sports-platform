import type { TransformFnParams } from 'class-transformer';

/** 쿼리스트링의 'true'/'false' 를 boolean 으로 바꾼다. 그 외 값은 그대로 두어 @IsBoolean 이 400 으로 거른다. */
export function queryBoolean({ value }: TransformFnParams): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}
