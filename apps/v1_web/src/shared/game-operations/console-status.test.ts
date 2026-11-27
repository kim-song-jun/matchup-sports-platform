import { describe, expect, it } from 'vitest';
import { deriveConsoleStatus, type ConsoleStatusInput, type ConsoleStatusKey } from './console-status';

const HELD = { status: 'held', token: 'token-1', expiresAtMs: 0, assignmentVersion: 1 } as const;

function input(overrides: Partial<ConsoleStatusInput> = {}): ConsoleStatusInput {
  return {
    gameState: 'LIVE',
    leaseRequired: true,
    takeoverEnabled: true,
    sampleMode: false,
    takeover: HELD,
    handoff: null,
    connection: 'connected',
    offlineCommandAllowed: false,
    canOperate: true,
    syncGap: false,
    behind: false,
    periodExpired: false,
    expiryError: null,
    startBlockedByTeams: false,
    commandError: null,
    bannerMessage: null,
    retryLabel: null,
    queue: { waiting: 0, failed: 0 },
    undo: null,
    endPeriodLabel: '전반 종료',
    gameOperationsErrorMessage: (code) => `안내(${code})`,
    ...overrides,
  };
}

const SINGLE_CONDITIONS: ReadonlyArray<
  readonly [ConsoleStatusKey, Partial<ConsoleStatusInput>, 'info' | 'warning' | 'danger', string]
> = [
  ['undoing', { undo: 'sending' }, 'info', '되돌리는 중이에요…'],
  [
    'takeover-handoff',
    {
      takeover: { status: 'denied', code: 'TAKEOVER_HELD', holderName: '김운영' },
      handoff: { code: 'TAKEOVER_HELD', holderName: '김운영' },
      canOperate: false,
    },
    'warning',
    '다른 기기에서 기록하고 있어요',
  ],
  ['takeover-denied', { takeover: { status: 'denied', code: 'STAFF_SCOPE_DENIED' }, canOperate: false }, 'danger', '이 기기에서 기록할 수 없어요'],
  ['read-only', { takeoverEnabled: false, takeover: { status: 'none' }, canOperate: false }, 'info', '보기만 할 수 있어요'],
  ['command-error', { commandError: '명령을 처리하지 못했어요.' }, 'danger', '요청을 처리하지 못했어요'],
  ['command-retry', { retryLabel: '전반 종료' }, 'danger', '전반 종료 요청의 응답을 받지 못했어요'],
  ['banner-message', { bannerMessage: '기록 권한을 다시 확인하지 못했어요.' }, 'danger', '기록을 확인해 주세요'],
  ['expiry-error', { expiryError: '서버 상태 확인이 늦어지고 있어요.' }, 'danger', '경기 진행 상태를 확인하지 못했어요'],
  ['disconnected', { connection: 'disconnected' }, 'warning', '연결이 끊겼어요'],
  ['queue', { queue: { waiting: 1, failed: 0 } }, 'info', '기록 1개 보내는 중이에요'],
  ['takeover-expired', { takeover: { status: 'expired' }, canOperate: false }, 'warning', '기록 권한을 다시 가져오는 중이에요…'],
  ['takeover-pending', { takeover: { status: 'requesting' }, canOperate: false }, 'info', '이 기기에서 기록할 준비를 하는 중이에요…'],
  ['period-expired', { periodExpired: true }, 'warning', '설정된 시간이 끝났어요'],
  ['start-blocked-teams', { gameState: 'SCHEDULED', startBlockedByTeams: true }, 'warning', '팀을 먼저 정해 주세요'],
  ['sync-gap', { syncGap: true }, 'info', '기록을 다시 불러오는 중이에요…'],
  ['behind', { behind: true }, 'info', '최신 경기 상태를 확인하고 있어요'],
];

describe('deriveConsoleStatus — 조건 하나', () => {
  it.each(SINGLE_CONDITIONS)('%s 만 켜면 그 항목 하나가 제목이 된다', (key, overrides, tone, title) => {
    const status = deriveConsoleStatus(input(overrides));
    expect(status.items.map((item) => item.key)).toEqual([key]);
    expect(status.items[0]).toMatchObject({ tone, title });
    expect(status.tone).toBe(tone);
    expect(status.headline).toBe(title);
  });

  it('처리표의 16개 key 를 빠짐없이 다룬다', () => {
    expect(new Set(SINGLE_CONDITIONS.map(([key]) => key)).size).toBe(16);
  });
});

describe('deriveConsoleStatus — 겹침과 우선순위', () => {
  it('여러 조건이 겹치면 번호가 작은 항목이 제목이고 ` 외 N개`가 붙는다', () => {
    const status = deriveConsoleStatus(input({ behind: true, connection: 'disconnected', commandError: '명령을 처리하지 못했어요.' }));
    expect(status.items.map((item) => item.key)).toEqual(['command-error', 'disconnected', 'behind']);
    expect(status.headline).toBe('요청을 처리하지 못했어요 외 2개');
    expect(status.tone).toBe('danger');
  });

  it('처리표 순서대로 정렬한다', () => {
    const status = deriveConsoleStatus(
      input({
        gameState: 'SCHEDULED',
        takeover: { status: 'denied', code: 'TAKEOVER_SUPERSEDED', holderName: null },
        handoff: { code: 'TAKEOVER_SUPERSEDED', holderName: null },
        commandError: 'e',
        retryLabel: '경기 시작',
        bannerMessage: 'b',
        expiryError: 'x',
        connection: 'disconnected',
        queue: { waiting: 0, failed: 1 },
        periodExpired: true,
        startBlockedByTeams: true,
        syncGap: true,
        behind: true,
        undo: 'waiting',
      }),
    );
    expect(status.items.map((item) => item.key)).toEqual([
      'undoing',
      'takeover-handoff',
      'command-error',
      'command-retry',
      'banner-message',
      'expiry-error',
      'disconnected',
      'queue',
      'period-expired',
      'start-blocked-teams',
      'sync-gap',
      'behind',
    ]);
  });

  it('끊김+보낼 기록 2개면 제목이 「연결이 끊겼어요 · 기록 2개 보낼 차례」이고 queue 항목은 따로 세지 않는다', () => {
    const status = deriveConsoleStatus(input({ connection: 'disconnected', queue: { waiting: 2, failed: 0 } }));
    expect(status.items.map((item) => item.key)).toEqual(['disconnected']);
    expect(status.headline).toBe('연결이 끊겼어요 · 기록 2개 보낼 차례');
  });

  it('끊긴 동안에도 전송 실패는 따로 알린다', () => {
    const status = deriveConsoleStatus(input({ connection: 'disconnected', queue: { waiting: 1, failed: 2 } }));
    expect(status.items.map((item) => item.key)).toEqual(['disconnected', 'queue']);
    expect(status.items[1]).toMatchObject({ tone: 'danger', title: '기록 2개를 보내지 못했어요' });
  });

  it('연결 중 전송 실패가 있으면 queue 항목은 danger 이고 실패 수를 말한다', () => {
    const status = deriveConsoleStatus(input({ queue: { waiting: 3, failed: 1 } }));
    expect(status.items[0]).toMatchObject({ key: 'queue', tone: 'danger', title: '기록 1개를 보내지 못했어요' });
  });
});

describe('deriveConsoleStatus — 되돌리는 중', () => {
  it('방금 누른 되돌리기가 도는 동안에는 다른 안내가 있어도 그것이 제목이다', () => {
    const status = deriveConsoleStatus(input({ undo: 'sending', commandError: '명령을 처리하지 못했어요.', connection: 'disconnected' }));
    expect(status.headline).toBe('되돌리는 중이에요… 외 2개');
    expect(status.items.map((item) => item.key)).toEqual(['undoing', 'command-error', 'disconnected']);
  });

  it('서버에 보낸 동안과 다른 기록을 기다리는 동안의 본문이 다르다', () => {
    expect(deriveConsoleStatus(input({ undo: 'sending' })).items[0].body).toBe('끝날 때까지 기록 버튼을 잠깐 막아 둬요.');
    expect(deriveConsoleStatus(input({ undo: 'waiting' })).items[0].body).toBe('보내던 기록을 다 보낸 뒤에 되돌려요.');
  });

  it('되돌리기가 없으면 항목도 없다', () => {
    expect(deriveConsoleStatus(input()).items).toEqual([]);
  });
});

describe('deriveConsoleStatus — 문구', () => {
  it('끊김 본문 4변형', () => {
    const body = (overrides: Partial<ConsoleStatusInput>) =>
      deriveConsoleStatus(input({ connection: 'disconnected', ...overrides })).items[0]?.body;
    expect(body({ leaseRequired: false })).toBe(
      '실시간 연결이 끊겼어요. 진행 요청은 서버에 직접 보내고, 기록은 다시 연결되면 전송돼요.',
    );
    expect(body({ offlineCommandAllowed: false })).toBe(
      '다시 연결하는 중이에요. 연결될 때까지 재개·종료 같은 진행 버튼은 잠겨요. 그동안 적는 기록은 이 기기에 모아 두었다가 보내요.',
    );
    expect(body({ offlineCommandAllowed: true, canOperate: true })).toBe(
      '다시 연결하는 중이에요. 진행 버튼은 그대로 쓸 수 있고, 보낸 명령은 서버 기준으로 반영돼요.',
    );
    expect(body({ offlineCommandAllowed: true, canOperate: false })).toBe(
      '연결이 끊긴 사이 기록 권한이 만료돼 진행 명령을 보낼 수 없어요. 다시 연결되면 권한을 새로 받아요.',
    );
  });

  it('보기 전용 지원 담당자에게는 끊김을 따로 알리지 않는다', () => {
    const status = deriveConsoleStatus(input({ takeoverEnabled: false, takeover: { status: 'none' }, connection: 'disconnected' }));
    expect(status.items.map((item) => item.key)).toEqual(['read-only']);
  });

  it('다른 기기 안내 본문은 이름·코드에 따라 달라지고 가져오기 버튼이 붙는다', () => {
    const item = (code: string, holderName: string | null) =>
      deriveConsoleStatus(input({ takeover: { status: 'denied', code, holderName }, handoff: { code, holderName } })).items[0];
    expect(item('TAKEOVER_HELD', '김운영')).toMatchObject({
      body: '김운영님이 이 경기를 기록하고 있어요. 이 기기는 보기만 할 수 있어요.',
      action: { kind: 'takeover', label: '이 기기에서 기록하기' },
    });
    expect(item('TAKEOVER_SUPERSEDED', '김운영')?.body).toBe('김운영님이 기록 권한을 가져갔어요. 이 기기는 보기만 할 수 있어요.');
    expect(item('TAKEOVER_HELD', null)?.body).toBe('다른 기기에서 기록하고 있어요. 이 기기는 보기만 할 수 있어요.');
  });

  it('거부 사유는 코드별 문구와 코드를 함께 적는다', () => {
    const status = deriveConsoleStatus(input({ takeover: { status: 'denied', code: 'STAFF_SCOPE_DENIED' } }));
    expect(status.items[0]?.body).toBe('안내(STAFF_SCOPE_DENIED) (STAFF_SCOPE_DENIED)');
  });

  it('재시도·종료 확인 항목에는 줄 안에서 누를 버튼이 있다', () => {
    expect(deriveConsoleStatus(input({ retryLabel: '재개' })).items[0]).toMatchObject({
      body: '같은 요청을 다시 보낼 수 있어요.',
      action: { kind: 'retry-command', label: '같은 요청 재시도' },
    });
    expect(deriveConsoleStatus(input({ expiryError: '확인 실패' })).items[0]).toMatchObject({
      body: '확인 실패',
      action: { kind: 'retry-expiry', label: '종료 상태 다시 확인' },
    });
  });

  it('시간 종료 안내는 눌러야 할 버튼 이름을 말한다', () => {
    expect(deriveConsoleStatus(input({ periodExpired: true, endPeriodLabel: '후반 종료' })).items[0]?.body).toBe(
      '서버의 시간 종료 처리를 확인하고 있어요. 처리가 늦어지면 ‘후반 종료’를 눌러 주세요.',
    );
  });

  it('SCHEDULED 가 아니면 팀 미배정을 알리지 않는다', () => {
    expect(deriveConsoleStatus(input({ gameState: 'LIVE', startBlockedByTeams: true })).items).toEqual([]);
  });
});

describe('deriveConsoleStatus — 정상 줄', () => {
  it('조건이 없으면 tone ok 와 정상 줄 문구 4종', () => {
    const ok = (overrides: Partial<ConsoleStatusInput>) => deriveConsoleStatus(input(overrides));
    expect(ok({ gameState: 'SCHEDULED' })).toMatchObject({ tone: 'ok', headline: '이 기기에서 기록할 수 있어요 · 연결됨', items: [] });
    expect(ok({ gameState: 'LIVE' }).headline).toBe('이 기기에서 기록 중 · 연결됨');
    expect(ok({ gameState: 'PAUSED' }).headline).toBe('이 기기에서 기록 중 · 연결됨');
    expect(ok({ gameState: 'ENDED' }).headline).toBe('연결됨');
    expect(ok({ leaseRequired: false, takeover: { status: 'none' } }).headline).toBe('연결됨');
    expect(ok({ sampleMode: true })).toMatchObject({ tone: 'ok', headline: '체험 중 · 서버 연결 없음' });
  });

  it('아직 연결하는 중이면 연결됐다고 말하지 않는다', () => {
    const status = deriveConsoleStatus(input({ leaseRequired: false, takeover: { status: 'none' }, connection: 'connecting' }));
    expect(status).toMatchObject({ tone: 'info', headline: '연결하는 중이에요…', items: [] });
  });

  it('자세히 시트의 고정 줄 값을 함께 낸다', () => {
    expect(deriveConsoleStatus(input()).facts).toEqual({ connection: '연결됨', recordingDevice: '이 기기' });
    expect(
      deriveConsoleStatus(
        input({
          connection: 'disconnected',
          takeover: { status: 'denied', code: 'TAKEOVER_HELD', holderName: null },
          handoff: { code: 'TAKEOVER_HELD', holderName: null },
        }),
      ).facts,
    ).toEqual({ connection: '끊겼어요', recordingDevice: '다른 기기' });
    expect(deriveConsoleStatus(input({ leaseRequired: false, takeover: { status: 'none' } })).facts.recordingDevice).toBeNull();
    expect(deriveConsoleStatus(input({ sampleMode: true })).facts.connection).toBe('서버 연결 없음');
  });
});
