'use client';

import { useState, type ReactNode } from 'react';

type View = 'before' | 'after';

const OPTIONS: ReadonlyArray<{ view: View; label: string }> = [
  { view: 'before', label: '예전엔' },
  { view: 'after', label: '이제는' },
];

/**
 * "예전엔 / 이제는" 수동 토글. 자동으로 넘기지 않는다 — 읽는 도중 화면이 바뀌면
 * 느리게 읽는 사람이 내용을 놓친다. 두 문장은 서버가 모두 그려 두고 이 섬은 보기만 바꾼다.
 */
export function LandingBeforeAfter({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>('after');
  return (
    <div className="tm-landing-ba" data-view={view}>
      <div className="tm-landing-ba-switch" role="group" aria-label="예전과 지금 비교">
        {OPTIONS.map((option) => (
          <button
            key={option.view}
            type="button"
            className="tm-landing-ba-option"
            aria-pressed={view === option.view}
            onClick={() => setView(option.view)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
