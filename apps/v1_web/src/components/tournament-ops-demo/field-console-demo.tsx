'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { V1DataSourceProvider } from '@/components/providers/v1-data-source';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { AbnormalEndDialog, OperateConsoleCore, type OperateConsoleRuntime } from '@/shared/game-operations';
import { createAdminDemoSource } from '@/lib/tournament-admin-demo';
import { appendFieldDemoEvent, commandFieldDemo, createFieldDemo, fieldDemoCommandResult, FIELD_DEMO_ACTOR_ID, FIELD_DEMO_GAME_ID, type FieldDemoState } from '@/lib/field-console-demo';
import { v1Keys } from '@/lib/query-keys';
import { FieldConsoleGuide } from './field-console-guide';
import styles from './demo.module.css';
import { DemoReturnLink } from './demo-return-link';
import guide from './field-console-guide.module.css';

export function FieldConsoleDemo() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false }, mutations: { retry: false } } }));
  const [session, setSession] = useState(0);
  const [step, setStep] = useState<number | null>(0);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  useEffect(() => () => client.clear(), [client]);
  const root = useRef<HTMLDivElement>(null);
  const finishGuide = useCallback(() => { setStep(null); window.scrollTo({ top: 0 }); }, []);
  const { confirm, ConfirmModal } = useConfirm();
  async function reset() {
    if (!await confirm({ title: '샘플 경기를 초기화할까요?', message: '이 체험의 점수와 경기 기록을 지워요. 실제 대회에는 영향을 주지 않아요.', confirmLabel: '초기화' })) return;
    client.clear(); setSession((value) => value + 1);
  }
  return <div className={styles.page}>
    <div inert={step !== null}>
      <header className={styles.header}><div className={styles.headerInner}>
        <Link className={styles.brand} href="/home">teameet</Link>
        <span className={styles.badge}>필드 담당자 콘솔 · 샘플 체험</span>
        <div className={styles.actions}>
        <DemoReturnLink />
          <button className={styles.quiet} onClick={() => setStep(0)}>안내 다시 보기</button>
          <button className={styles.quiet} onClick={() => void reset()}>체험 초기화</button>
        </div>
      </div></header>
      <main className={styles.container}>
        <h1 className="tm-text-heading mb-3">경기 운영콘솔 체험</h1>
        <p className={styles.notice}>실제 필드 담당자와 같은 조작 화면이에요. 5인제 축구·팀별 교체 3회의 샘플 경기로 체험해요. 팀·선수는 모두 샘플이며 실제 서버에 전송하지 않아요. 새로고침하면 체험 기록이 초기화돼요.</p>
        <QueryClientProvider client={client}>
          <div hidden={step !== null}><FieldConsoleSession key={session} /></div>
        </QueryClientProvider>
        {step !== null && <div ref={root} className={guide.preview}>
          <GuidePreview key={step < 2 ? 'before' : step === 4 ? 'finish' : 'during'} phase={step < 2 ? 'before' : step === 4 ? 'finish' : 'during'} />
        </div>}
      </main>
    </div>
    {hydrated && step !== null && <FieldConsoleGuide root={root} step={step} onStep={setStep} onFinish={finishGuide} />}
    {ConfirmModal}
  </div>;
}

function GuidePreview({ phase }: { phase: 'before' | 'during' | 'finish' }) {
  // A separate client and session keep the walkthrough from changing practice records.
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: 0 } } }));
  useEffect(() => () => client.clear(), [client]);
  return <QueryClientProvider client={client}><FieldConsoleSession previewPhase={phase} /></QueryClientProvider>;
}

function FieldConsoleSession({ previewPhase = 'before' }: { previewPhase?: 'before' | 'during' | 'finish' }) {
  const client = useQueryClient();
  const { confirm, ConfirmModal } = useConfirm();
  const [state, setState] = useState<FieldDemoState>(() => {
    let sample = createFieldDemo();
    if (previewPhase === 'before') return sample;
    sample = commandFieldDemo(sample, 'start', sample.game.version);
    sample = appendFieldDemoEvent(sample, { type: 'GOAL', sideId: sample.game.sides[0].id,
      participantId: sample.game.lineups[0].participants[0].id, period: 1, clockMs: 0,
      occurredAt: new Date().toISOString(), payload: {} });
    if (previewPhase === 'finish') for (const command of ['end-period', 'start-period', 'end-period'] as const) {
      sample = commandFieldDemo(sample, command, sample.game.version);
    }
    return sample;
  });
  const current = useRef(state);
  const publish = (next: FieldDemoState) => {
    current.current = next; setState(next); client.setQueryData(v1Keys.game(FIELD_DEMO_GAME_ID), next.game);
  };
  const [source] = useState(() => createAdminDemoSource((method, path) => {
    if (method === 'GET' && path === `/games/${FIELD_DEMO_GAME_ID}`) return current.current.game;
    throw new Error('이 기능은 샘플 체험에서 지원하지 않아요. 실제 서버에는 요청하지 않았어요.');
  }));
  const detail = useQuery({ queryKey: v1Keys.game(FIELD_DEMO_GAME_ID), queryFn: async () => current.current.game, initialData: state.game });
  const operations: OperateConsoleRuntime['operations'] = {
    canOperate: state.game.state !== 'ENDED', connectionStatus: 'connected', sync: { status: 'synced', lastSequence: state.game.lastSequence },
    takeover: { status: 'held', token: 'sample-only', expiresAtMs: Number.MAX_SAFE_INTEGER, assignmentVersion: 0 },
    queue: { items: [] }, clockOffsetMs: 0, liveEvents: state.events,
    gameSnapshot: { state: state.game.state, version: state.game.version }, bannerMessage: null,
    submitEvent: async (input) => {
      const next = appendFieldDemoEvent(current.current, input); publish(next); return next.events.at(-1)!.clientEventId;
    },
    reverseEvent: async ({ eventId, reason }) => {
      const original = current.current.events.find((event) => event.id === eventId);
      if (!original || current.current.events.some((event) => event.reversesEventId === eventId)) throw new Error('이미 취소했거나 찾을 수 없는 샘플 기록이에요.');
      publish(appendFieldDemoEvent(current.current, { type: 'CORRECTION', period: original.period, clockMs: original.clockMs, occurredAt: new Date().toISOString(), payload: { reason }, reversesEventId: eventId }));
    },
    assignAssist: async ({ eventId, assistParticipantId }) => {
      if (current.current.game.state === 'ENDED') throw new Error('종료된 샘플 경기의 기록은 수정할 수 없어요.');
      const event = current.current.events.find((row) => row.id === eventId);
      if (!event || event.type !== 'GOAL') throw new Error('득점 기록을 찾을 수 없어요.');
      publish({ game: { ...current.current.game, version: current.current.game.version + 1 }, events: current.current.events.map((row) => row.id === eventId ? { ...row, assistParticipantId } : row) });
    },
    requestTakeover: () => { throw new Error('체험은 한 명의 필드 담당자만 지원해요.'); },
    retryFailedEvent: () => { throw new Error('체험에는 실제 서버 전송 대기 기록이 없어요.'); },
    applyCommandResult: (result) => result.version >= current.current.game.version,
  };
  return <V1DataSourceProvider source={source}>
    <OperateConsoleCore gameId={FIELD_DEMO_GAME_ID}
      runtime={{ authUserId: FIELD_DEMO_ACTOR_ID, resultRevisions: [], queryClient: client, confirm, confirmModal: ConfirmModal,
        operations, postGameCommand: async (gameId, command, body) => {
          if (gameId !== FIELD_DEMO_GAME_ID) throw new Error('샘플 경기만 조작할 수 있어요.');
          const next = commandFieldDemo(current.current, command, body.expectedVersion); publish(next); return fieldDemoCommandResult(next);
        }, gameOperationsErrorMessage: (code) => `샘플 기록을 처리하지 못했어요. (${code})`, isRetryableGameOperationsErrorCode: () => false }}
      gameDetail={detail} lineupsQuery={{ data: state.game.lineups, isLoading: false, isError: false, error: null, refetch: async () => state.game.lineups }}
      leaseRequired takeoverEnabled operatorScopeKey="FIELD_OPERATOR" operationContextKey="sample-field-console"
      headerTopClass="top-0" requiresLineupBeforeStart={false} allowPenaltyShootout={false} resultReviewEnabled={false}
      renderAbnormalEndDialog={(props) => <AbnormalEndDialog {...props} />}
    />
    {state.game.state === 'ENDED' && <p role="status" className={styles.notice}>샘플 경기를 종료했어요. 위 점수와 기록이 체험 결과예요. 실제 결과 확정·공식 기록 반영은 하지 않아요. 체험 초기화로 다시 시작할 수 있어요.</p>}
  </V1DataSourceProvider>;
}
