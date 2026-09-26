'use client';

import { useState, type ReactNode } from 'react';

type View = 'before' | 'after';

const OPTIONS: ReadonlyArray<{ view: View; label: string }> = [
  { view: 'before', label: '예전엔' },
  { view: 'after', label: '이제는' },
];

/**
 * 챕터의 "예전엔 / 이제는" 수동 토글. 스크롤·노출 시간으로 넘기지 않는다 — 읽는 도중 화면이
 * 바뀌면 느리게 읽는 사람이 내용을 놓친다. 두 면은 서버가 모두 그려 두고 이 섬은 보기만 바꾼다.
 */
export function LandingV2Compare({
  label,
  before,
  after,
}: {
  label: string;
  before: ReactNode;
  after: ReactNode;
}) {
  const [view, setView] = useState<View>('after');
  return (
    <div className="tm-landing-v2-compare" data-view={view}>
      <div className="tm-landing-v2-switch" role="group" aria-label={`${label} 예전과 지금 비교`}>
        {OPTIONS.map((option) => (
          <button
            key={option.view}
            type="button"
            className="tm-landing-v2-switch-option"
            data-option={option.view}
            aria-pressed={view === option.view}
            onClick={() => setView(option.view)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="tm-landing-v2-faces">
        <div className="tm-landing-v2-face" data-face="before">{before}</div>
        {/* data-loop: 이 면이 가려지면 뷰포트 밖과 같이 취급돼 라이브 시계·반복 모션이 멈춘다 */}
        <div className="tm-landing-v2-face" data-face="after" data-loop="off">{after}</div>
      </div>
    </div>
  );
}
