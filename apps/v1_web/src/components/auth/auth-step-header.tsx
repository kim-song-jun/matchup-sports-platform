'use client';

import { useEffect, useRef } from 'react';

type Props = {
  /** 진행 바의 스크린리더 이름 앞부분 — "회원가입 진행 단계 2 / 3". */
  name: string;
  /** 단계 키. 개수가 진행 바 칸 수가 된다. */
  steps: readonly string[];
  /** 지금 단계의 0 기반 위치. */
  index: number;
  /** 줄바꿈(`\n`)이 들어갈 수 있다. */
  title: string;
  sub?: string;
  /**
   * 단계가 바뀔 때 제목으로 포커스를 옮긴다. 켜면 포커스 이동이 새 단계를 알려 주므로 단계 안내 live region 은 없다.
   * 끄면(기본) 포커스는 그대로 두고 live region 이 알린다 — 입력칸 `autoFocus` 를 쓰는 화면이 포커스를 뺏기지 않게 한다.
   */
  focusOnChange?: boolean;
};

/** 가입·이메일 로그인 연결처럼 "한 화면에 한 질문"을 묻는 단계 화면의 머리: 진행 바 + 제목 + 부제. */
export function AuthStepHeader({ name, steps, index, title, sub, focusOnChange = false }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // 처음 그릴 때와 개발 모드의 이펙트 재실행에서는 포커스를 옮기지 않는다 — 단계가 실제로 바뀐 경우만.
  const shownIndexRef = useRef(index);

  useEffect(() => {
    if (shownIndexRef.current === index) return;
    shownIndexRef.current = index;
    if (focusOnChange) headingRef.current?.focus();
  }, [index, focusOnChange]);

  return (
    <>
      {focusOnChange ? null : (
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {`${steps.length}단계 중 ${index + 1}단계: ${title.replace(/\n/g, ' ')}`}
        </p>
      )}
      <div
        className="tm-signup-progress"
        role="progressbar"
        aria-label={`${name} 진행 단계 ${index + 1} / ${steps.length}`}
        aria-valuenow={index + 1}
        aria-valuemin={1}
        aria-valuemax={steps.length}
        style={{ ['--signup-steps' as string]: steps.length }}
      >
        {steps.map((step, position) => (
          <span key={step} data-on={position <= index} aria-hidden="true" />
        ))}
      </div>
      <div className={`tm-signup-hero${sub ? '' : ' tm-signup-hero-title-only'}`}>
        <h1 ref={headingRef} tabIndex={focusOnChange ? -1 : undefined} className="tm-text-heading tm-auth-heading">{title}</h1>
        {sub ? <p className="tm-text-body tm-auth-sub">{sub}</p> : null}
      </div>
    </>
  );
}
