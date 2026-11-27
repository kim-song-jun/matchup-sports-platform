import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, vi } from 'vitest';
import { InfoSectionSheet } from '@/app/admin/tournaments/[id]/info-section-sheet';
import type { InfoSectionDefinition } from '@/app/admin/tournaments/[id]/info-forms/types';
import { TOURNAMENT_INFO_SECTION_META } from '@/app/admin/tournaments/[id]/info-sections';
import { TournamentAdminProvider } from '@/app/admin/tournaments/[id]/tournament-admin-context';
import type { V1Tournament } from '@/types/api';
import { createTournamentInfoServer } from './msw/tournament-info-handlers';

/** 섹션 시트 테스트 파일이 한 번 부른다 — 실제 훅이 MSW 가짜 서버로 요청을 보낸다. */
export function setupTournamentInfoBackend() {
  const server = setupServer();
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => {
    cleanup();
    server.resetHandlers();
  });
  afterAll(() => server.close());

  return function start(initial: Partial<V1Tournament> = {}) {
    const backend = createTournamentInfoServer(initial);
    server.use(...backend.handlers);
    return backend;
  };
}

type Backend = ReturnType<typeof createTournamentInfoServer>;

/** 섹션 하나의 수정 시트를 실제 `SideSheet`·저장 훅과 함께 연다. */
export function renderInfoSheet(definition: InfoSectionDefinition, backend: Backend, options: { focusField?: string } = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const showToast = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TournamentAdminProvider value={{ tournamentId: backend.state.tournament.id, role: 'PLATFORM_OPS', canWrite: true, showToast }}>
        <InfoSectionSheet
          definition={definition}
          initialTournament={backend.state.tournament}
          focusField={options.focusField}
          onClose={onClose}
          onSaved={onSaved}
        />
      </TournamentAdminProvider>
    </QueryClientProvider>,
  );
  const sheet = () => screen.getByRole('dialog', { name: TOURNAMENT_INFO_SECTION_META[definition.key].title });
  return {
    onClose,
    onSaved,
    showToast,
    sheet,
    inSheet: () => within(sheet()),
    save: () => fireEvent.click(within(sheet()).getByRole('button', { name: '저장' })),
    /** 저장이 끝나 시트가 닫힐 때까지 기다린다. */
    saved: () => waitFor(() => expect(onClose).toHaveBeenCalled()),
    /** 대회 PATCH 본문에서 버전을 뺀 키(정렬). */
    patchKeys: (index = 0) => Object.keys(backend.state.patches[index] ?? {}).filter((key) => key !== 'expectedVersion').sort(),
  };
}
