import { useCallback, useEffect, useRef, useState } from 'react';

/** 입력을 멈춘 뒤 자동 확인까지 기다리는 시간. */
export const DUPLICATE_CHECK_DEBOUNCE_MS = 500;

export type DuplicateCheckStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error' | 'invalid';

type CheckResult = { value: string; status: 'checking' | 'available' | 'taken' | 'error' };

type Options = {
  /** 정규화된 현재 입력값. 값이 바뀌면 이전 판정은 자동으로 버려진다. */
  value: string;
  /** 서버에 물어볼 만한 입력인지. 아니면 요청하지 않고, 칸을 벗어날 때 `invalid` 가 된다. */
  isCheckable: (value: string) => boolean;
  check: (value: string) => Promise<{ available: boolean }>;
};

/**
 * 닉네임·이메일 중복을 입력이 멈추면(0.5초) 또는 칸을 벗어날 때 자동으로 확인한다.
 *
 * 판정은 "어느 값에 대한 것인지"와 함께 저장하고 현재 값과 같을 때만 상태로 읽는다. 그래서 값을 고치면
 * 옛 판정이 즉시 사라지고, 늦게 도착한 옛 요청의 응답은 요청 순번으로 걸러 최신 입력을 덮지 못한다.
 */
export function useDuplicateCheck({ value, isCheckable, check }: Options) {
  const [result, setResult] = useState<CheckResult | null>(null);
  const [invalidValue, setInvalidValue] = useState<string | null>(null);
  const resultRef = useRef<CheckResult | null>(null);
  const seqRef = useRef(0);
  const checkRef = useRef(check);

  useEffect(() => {
    checkRef.current = check;
  });

  const commit = useCallback((next: CheckResult) => {
    resultRef.current = next;
    setResult(next);
  }, []);

  const run = useCallback((target: string) => {
    const current = resultRef.current;
    // 같은 값을 이미 확인했거나 확인 중이면 다시 묻지 않는다. 실패만 다시 시도한다.
    if (current?.value === target && current.status !== 'error') return;

    const seq = ++seqRef.current;
    commit({ value: target, status: 'checking' });
    checkRef.current(target).then(
      (response) => {
        if (seq === seqRef.current) commit({ value: target, status: response.available ? 'available' : 'taken' });
      },
      () => {
        if (seq === seqRef.current) commit({ value: target, status: 'error' });
      },
    );
  }, [commit]);

  const checkable = isCheckable(value);
  useEffect(() => {
    if (!checkable) return undefined;
    const timer = window.setTimeout(() => run(value), DUPLICATE_CHECK_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [checkable, run, value]);

  const onBlur = useCallback(() => {
    if (value === '') return;
    if (checkable) run(value);
    else setInvalidValue(value);
  }, [checkable, run, value]);

  /** 가입 요청이 중복으로 거절됐을 때, 화면의 판정을 서버 결과에 맞춘다. */
  const markTaken = useCallback((target: string) => {
    seqRef.current += 1;
    commit({ value: target, status: 'taken' });
  }, [commit]);

  const status: DuplicateCheckStatus = result?.value === value
    ? result.status
    : invalidValue === value && !checkable
      ? 'invalid'
      : 'idle';

  return {
    status,
    verified: status === 'available',
    /** 확인할 수 있는 값이 입력됐고 아직 판정이 나오지 않았다 — 곧 결과가 나온다. */
    waiting: checkable && (status === 'idle' || status === 'checking'),
    onBlur,
    markTaken,
  };
}
