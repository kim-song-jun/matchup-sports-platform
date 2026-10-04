import React from 'react';
import { createRoot } from 'react-dom/client';
import { TournamentBracket } from '../../apps/v1_web/src/components/tournaments/tournament-bracket';
import { bracketSample } from './tournament-bracket-samples';
(window as any).renderBracketPreview = (selector: string, size: 4 | 8 | 12) => {
  const host = document.querySelector(selector)!;
  const holder = document.createElement('div');
  host.replaceChildren(holder);
  createRoot(holder).render(<><div className="tm-text-caption-strong" style={{ padding: '12px 0', color: 'var(--blue700)' }}>{size}강 화면 예시 · 실제 대회 데이터 아님</div><TournamentBracket {...bracketSample(size)} /></>);
};
