/**
 * Unsaved-changes guard on a cold entry (deep link, refresh, new tab, Android cold start) — alpha finding F2.
 * With no earlier entry in this document a back leaves the document, where no popstate can be intercepted.
 * jsdom keeps one document, so "earlier document" entries are the ones pushed before the tracker installs.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetNavigationHistoryForTests,
  bindSoftNavigator,
  currentEntryIsBuffer,
  hasPreviousSameDocumentEntry,
  installNavigationHistory,
} from '@/lib/navigation-history';
import { __resetOverlayHistoryForTests } from '@/lib/overlay-history';
import { currentPath, settleHistory } from '@/test/history-router';
import { useUnsavedChangesGuard } from './use-unsaved-changes-guard';

const FORM = '/team-matches/new';
const LEAVE_TITLE = '작성 중인 내용이 사라져요. 나갈까요?';
const nextRouterPop = vi.fn();

function reset() {
  __resetOverlayHistoryForTests();
  __resetNavigationHistoryForTests();
  window.sessionStorage.clear();
}

/** A fresh document at FORM; `previousDocument` puts another document's entry behind it. */
function bootAt({ previousDocument }: { previousDocument: boolean }) {
  if (previousDocument) {
    window.history.replaceState(null, '', '/landing');
    window.history.pushState(null, '', FORM);
  } else {
    window.history.replaceState(null, '', FORM);
  }
  installNavigationHistory();
  bindSoftNavigator((url) => window.history.replaceState({}, '', url));
  window.addEventListener('popstate', nextRouterPop); // after the tracker, like Next's router
}

beforeEach(() => {
  reset();
});
afterEach(() => {
  window.removeEventListener('popstate', nextRouterPop);
  reset();
  vi.restoreAllMocks();
});

function Form() {
  const [name, setName] = useState('');
  const { UnsavedChangesModal } = useUnsavedChangesGuard(name !== '');
  return (
    <>
      <label htmlFor="name">팀 이름</label>
      <input id="name" value={name} onChange={(event) => setName(event.target.value)} />
      {UnsavedChangesModal}
    </>
  );
}

const run = async (step: () => void, ticks = 10) => {
  await act(async () => {
    step();
    await settleHistory(ticks);
  });
};
const type = (value: string) => run(() => fireEvent.change(screen.getByLabelText('팀 이름'), { target: { value } }));
const input = () => screen.getByLabelText('팀 이름') as HTMLInputElement;
const leaveDialog = () => screen.queryByRole('dialog', { name: LEAVE_TITLE });

describe('cold entry — dirty form + back', () => {
  it('back asks instead of leaving; 계속 작성 keeps the input and the next back asks again', async () => {
    bootAt({ previousDocument: false });
    render(<Form />);
    await type('풋살팀');

    await run(() => window.history.back());
    expect(leaveDialog()).not.toBeNull();
    expect(currentPath()).toBe(FORM);

    await run(() => fireEvent.click(screen.getByRole('button', { name: '계속 작성' })));
    expect(leaveDialog()).toBeNull();
    expect(input().value).toBe('풋살팀');
    expect(currentPath()).toBe(FORM);

    await run(() => window.history.back());
    expect(leaveDialog()).not.toBeNull();
    expect(nextRouterPop).not.toHaveBeenCalled();
  });

  it('나가기 goes past the buffer and the form entry to the previous document', async () => {
    bootAt({ previousDocument: true });
    const go = vi.spyOn(window.history, 'go');
    render(<Form />);
    await type('풋살팀');

    await run(() => window.history.back());
    await run(() => fireEvent.click(screen.getByRole('button', { name: '나가기' })));

    expect(go).toHaveBeenCalledWith(-2);
    expect(currentPath()).toBe('/landing');
  });

  it('나가기 with the form as the tab\'s first entry (new tab, Android cold start) exits to /home without go(-2)', async () => {
    // jsdom's one history outlives each test, so make "first entry of the tab" explicit at install time.
    const length = vi.spyOn(History.prototype, 'length', 'get').mockReturnValue(1);
    bootAt({ previousDocument: false });
    length.mockRestore();
    const go = vi.spyOn(window.history, 'go');
    render(<Form />);
    await type('풋살팀');

    await run(() => window.history.back());
    await run(() => fireEvent.click(screen.getByRole('button', { name: '나가기' })));

    expect(go).not.toHaveBeenCalled();
    expect(currentPath()).toBe('/home');
    expect(leaveDialog()).toBeNull();
    // The exit replaced the form entry itself — neither the form nor the buffer sits behind /home.
    expect(hasPreviousSameDocumentEntry()).toBe(false);
  });

  it('나가기 with something before the form arms no fallback — a slow cross-document go(-2) is not overtaken', async () => {
    bootAt({ previousDocument: true });
    // The traversal is still loading (slow network, non-bfcache page): nothing has moved yet.
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
    render(<Form />);
    await type('풋살팀');

    await run(() => window.history.back());
    await run(() => fireEvent.click(screen.getByRole('button', { name: '나가기' })));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await settleHistory(10);
    });

    expect(go).toHaveBeenCalledWith(-2);
    expect(currentPath()).toBe(FORM);
  });

  it('after a reload the earlier entries are another document — still exactly one buffer', async () => {
    window.history.replaceState(null, '', '/team-matches');
    installNavigationHistory();
    window.history.pushState({}, '', FORM);
    // Reload at FORM: the mirror remembers /team-matches, but it now lives in the previous document.
    __resetOverlayHistoryForTests();
    __resetNavigationHistoryForTests();
    installNavigationHistory();
    const before = window.history.length;

    render(<Form />);
    await type('풋');
    await type('풋살');
    expect(window.history.length).toBe(before + 1);
  });
});

describe('cold entry — dirty, then clean again', () => {
  it('takes the buffer off without a page pop, so one back leaves', async () => {
    bootAt({ previousDocument: true });
    const before = window.history.length;
    render(<Form />);
    await type('풋살팀');
    expect(window.history.length).toBe(before + 1); // the buffer went on
    await type('');

    expect(nextRouterPop).not.toHaveBeenCalled();
    await run(() => window.history.back());
    expect(leaveDialog()).toBeNull();
    expect(currentPath()).toBe('/landing');
  });
});

describe('reload while on the buffer', () => {
  /** Reload at the current entry: the tracker restarts from history.state + the sessionStorage mirror. */
  function reload() {
    __resetOverlayHistoryForTests();
    __resetNavigationHistoryForTests();
    installNavigationHistory();
    bindSoftNavigator((url) => window.history.replaceState({}, '', url));
  }

  async function reloadOnBuffer() {
    bootAt({ previousDocument: true });
    const view = render(<Form />);
    await type('풋살팀');
    expect(currentEntryIsBuffer()).toBe(true);
    view.unmount();
    reload();
  }

  it('dirty again: one live buffer, and 나가기 leaves past the dead same-URL form entry too', async () => {
    await reloadOnBuffer();
    const go = vi.spyOn(window.history, 'go');
    render(<Form />);
    await type('풋');

    await run(() => window.history.back());
    expect(leaveDialog()).not.toBeNull();
    await run(() => fireEvent.click(screen.getByRole('button', { name: '나가기' })));

    expect(go).toHaveBeenCalledWith(-3);
    expect(currentPath()).toBe('/landing');
  });

  it('clean: the old buffer is neutralized and a back onto the dead copy keeps going', async () => {
    await reloadOnBuffer();
    expect(currentEntryIsBuffer()).toBe(false);
    render(<Form />);
    await settleHistory(10);
    expect(currentPath()).toBe(FORM); // no consume back() off a buffer of another document

    // Back from here is cross-document: no popstate reaches this document, and the dead copy loads fresh.
    __resetNavigationHistoryForTests();
    await run(() => window.history.back());
    expect(currentPath()).toBe(FORM);
    await run(() => reload());
    expect(currentPath()).toBe('/landing');
  });
});
