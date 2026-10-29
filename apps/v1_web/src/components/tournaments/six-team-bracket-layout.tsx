'use client';

import type { ReactNode } from 'react';
import { SectionTitle } from '@/components/v1-ui/primitives';

export type SixTeamStageKey = 'quarter' | 'semi' | 'final';

/** Selection changes the teams, never the geometry. Round-six paths intentionally stop here. */
export function SixTeamBracketLayout({ first, semifinal, bye, final, swapFinal = false, selectedStage, labels = {} }: {
  first: ReactNode;
  semifinal: ReactNode;
  bye: ReactNode;
  final: ReactNode;
  swapFinal?: boolean;
  selectedStage?: SixTeamStageKey;
  labels?: Partial<Record<SixTeamStageKey, string>>;
}) {
  const connected = !selectedStage;
  const stages = [
    { key: 'quarter' as const, title: labels.quarter ?? '6강', count: '3경기', content: first },
    { key: 'semi' as const, title: labels.semi ?? '준결승', count: '1경기 · 부전승 1팀', content: (
      <div className="relative grid h-full grid-rows-2 gap-4">
        <div className="flex items-center"><div className="w-full">{swapFinal ? semifinal : bye}</div></div>
        <div className="flex items-center"><div className="w-full">{swapFinal ? bye : semifinal}</div></div>
        {connected && <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute left-full top-0 h-full w-12 overflow-visible">
          <path data-connection={swapFinal ? 'semifinal-final' : 'bye-final'} d="M0 25 H50 V50 H100" fill="none" stroke="var(--grey500)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <path data-connection={swapFinal ? 'bye-final' : 'semifinal-final'} d="M0 75 H50 V50 H100" fill="none" stroke="var(--grey500)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>}
      </div>
    ) },
    { key: 'final' as const, title: labels.final ?? '결승', count: '1경기', content: <div className="flex h-full items-center"><div className="w-full">{final}</div></div> },
  ].filter(stage => !selectedStage || selectedStage === stage.key);
  return (
    <div role="region" aria-label="6강부터 결승까지 대진" tabIndex={0} className="min-w-0 overflow-x-auto pb-4 focus-visible:outline-2 focus-visible:outline-blue-500">
      <div className={`flex items-stretch gap-12${connected ? ' w-max' : ''}`}>
        {stages.map(stage => <section key={stage.key} aria-label={stage.title} className={`flex shrink-0 flex-col gap-4${connected ? ' w-72' : ' w-full'}`}>
          <div role="heading" aria-level={4}><SectionTitle title={`${stage.title} · ${stage.count}`} /></div>
          <div className="min-h-0 flex-1">{stage.content}</div>
        </section>)}
      </div>
    </div>
  );
}

export function SixTeamBye({ name, pending, children }: { name: string; pending: boolean; children?: ReactNode }) {
  return <div role="group" aria-label={`준결승 부전승 · ${name}`} className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] p-4">
    <p className="tm-text-caption text-[var(--text-muted)]">부전승 · 결승 직행</p>
    <p className="tm-text-body font-semibold">{pending ? '6강 승리팀 중 선정 대기' : name}</p>
    {children}
  </div>;
}
