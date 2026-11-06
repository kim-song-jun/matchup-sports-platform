'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { bracketConnectionPath, bracketContentCenter } from '@/lib/tournament-bracket-graph';
import { CANVAS_COLUMN_GAP, CANVAS_NODE_WIDTH, CANVAS_PADDING } from '@/lib/bracket-canvas-layout';

export type SixTeamStageKey = 'quarter' | 'semi' | 'final';
type Connection = { key: string; path: string };

/** Round-six winners are ranked before selection, so no first-round paths are drawn. */
export function SixTeamBracketLayout({ first, semifinal, bye, final, swapFinal = false, selectedStage, labels = {}, surface = 'public' }: {
  first: ReactNode; semifinal: ReactNode; bye: ReactNode; final: ReactNode;
  swapFinal?: boolean; selectedStage?: SixTeamStageKey;
  labels?: Partial<Record<SixTeamStageKey, string>>;
  surface?: 'public' | 'admin';
}) {
  const connected = !selectedStage;
  const admin = surface === 'admin';
  const canvasRef = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<Connection[]>([]);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !connected) { setPaths([]); return; }
    const measure = () => {
      const bounds = canvas.getBoundingClientRect();
      const target = canvas.querySelector<HTMLElement>('[data-six-node="final"]');
      if (!target) return;
      const targets = target.querySelectorAll<HTMLElement>('[data-bracket-team-row], [data-side]');
      const next = ['upper', 'lower'].flatMap((key, index) => {
        const source = canvas.querySelector<HTMLElement>(`[data-six-node="${key}"]`);
        if (!source) return [];
        const card = source.querySelector<HTMLElement>('[data-fixture-id], .tm-bk2-card, [data-six-fixture-card]') ?? source;
        const rect = card.getBoundingClientRect();
        const rows = Array.from(card.querySelectorAll<HTMLElement>('[data-bracket-team-row], [data-side]')).map(row => row.getBoundingClientRect());
        const end = (targets[index] ?? target).getBoundingClientRect();
        const targetCard = (target.querySelector<HTMLElement>('[data-fixture-id], .tm-bk2-card, [data-six-fixture-card]') ?? target).getBoundingClientRect();
        return [{ key: (index === 0) !== swapFinal ? 'bye-final' : 'semifinal-final', path: bracketConnectionPath(
          { x: rect.right - bounds.left, y: bracketContentCenter(rect, rows) - bounds.top },
          { x: targetCard.left - bounds.left, y: end.top + end.height / 2 - bounds.top },
        ) }];
      });
      setPaths(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    canvas.querySelectorAll('[data-six-node], [data-bracket-team-row], [data-side]').forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [connected, swapFinal, first, semifinal, bye, final]);
  const stages = [
    { key: 'quarter' as const, title: labels.quarter ?? '6강', count: '3경기', content: first },
    { key: 'semi' as const, title: labels.semi ?? '준결승', count: '1경기 · 부전승 1팀', content: (
      <div className="grid h-full grid-rows-2 gap-6">
        <div className="flex items-center"><div data-six-node="upper" className="w-full">{swapFinal ? semifinal : bye}</div></div>
        <div className="flex items-center"><div data-six-node="lower" className="w-full">{swapFinal ? bye : semifinal}</div></div>
      </div>
    ) },
    { key: 'final' as const, title: labels.final ?? '결승', count: '1경기', content: <div className="flex h-full items-center"><div data-six-node="final" className="w-full">{final}</div></div> },
  ].filter(stage => !selectedStage || selectedStage === stage.key);
  return (
    <div className="w-full min-w-0 max-w-full">
      {connected && <p className="tm-bk2-scroll-hint">단계별 대진은 옆으로 밀어 확인할 수 있어요.</p>}
      <div role="region" aria-label="6강부터 결승까지 대진" tabIndex={0} className="w-full min-w-0 max-w-full overflow-x-auto pb-4 focus-visible:outline-2 focus-visible:outline-blue-500"
        style={admin ? { border: '1px solid var(--border)', borderRadius: 'var(--radius-container)', background: 'var(--card-surface-muted)' } : undefined}>
        <div ref={canvasRef} className="relative flex items-stretch justify-between" style={{ width: connected ? 'max-content' : '100%', minWidth: '100%', gap: admin ? CANVAS_COLUMN_GAP : 40, padding: admin ? CANVAS_PADDING : '12px 0' }}>
          {connected && <svg aria-label="경기별 진출 연결선" role="img" className="pointer-events-none absolute inset-0 h-full w-full">
            {paths.map(path => <path key={path.key} data-connection={path.key} d={path.path} fill="none" stroke={admin ? 'var(--grey500)' : 'var(--grey300)'} strokeWidth={2} strokeLinejoin="round"><title>{path.key === 'bye-final' ? '결승 직행팀' : '준결승 승리팀'} → 결승</title></path>)}
          </svg>}
          {stages.map(stage => <section key={stage.key} aria-label={stage.title} className="relative flex shrink-0 flex-col" style={{ width: connected ? admin ? CANVAS_NODE_WIDTH : 180 : '100%' }}>
            <h4 className={admin ? 'tm-text-caption-strong mb-4' : 'mb-4 flex h-10 items-center justify-center'}>
              <span className={admin ? undefined : 'tm-bk2-pill'}>{stage.title}</span>
              <span className="sr-only"> · {stage.count}</span>
            </h4>
            <div className="min-h-0 flex-1">{stage.content}</div>
          </section>)}
        </div>
      </div>
    </div>
  );
}

export function SixTeamBye({ name, pending, teamId = null, logoUrl = null, children }: { name: string; pending: boolean; teamId?: string | null; logoUrl?: string | null; children?: ReactNode }) {
  const label = pending ? '6강 승리팀 중 선정 대기' : name;
  return <div role="group" aria-label={`준결승 부전승 · ${name}`} className="tm-bk2-card tm-on-tint p-3" style={{ width: '100%', background: pending ? undefined : 'var(--blue50)' }}>
    <p className="tm-text-caption-strong mb-2" style={{ color: 'var(--blue700)' }}>부전승 · 결승 직행</p>
    <div className="flex items-center gap-2"><TeamAvatar teamId={pending ? null : teamId} name={label} logoUrl={pending ? null : logoUrl} size="sm" /><span className="tm-text-caption-strong min-w-0" style={{ color: pending ? undefined : 'var(--blue700)' }}>{label}</span></div>
    {children}
  </div>;
}
