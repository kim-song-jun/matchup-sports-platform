import { describe, expect, it, vi } from 'vitest';
import { partialSaveMessage, runSaveSteps, saveStep, type SaveStep } from './sequential-save';

const step = (key: string, label: string, run: () => Promise<void> = async () => {}): SaveStep => ({ key, label, run });
const reason = () => '사유';

describe('runSaveSteps', () => {
  it('runs steps in order', async () => {
    const calls: string[] = [];
    const steps = ['a', 'b', 'c'].map((key) => step(key, key, async () => { calls.push(key); }));

    const outcome = await runSaveSteps(steps, new Set(), reason);

    expect(calls).toEqual(['a', 'b', 'c']);
    expect(outcome).toEqual({ status: 'saved', done: ['a', 'b', 'c'] });
  });

  it('stops at the first failure and never calls later steps', async () => {
    const third = vi.fn(async () => {});
    const steps = [
      step('periods', '경기 시간'),
      step('rules', '경기 규칙', async () => { throw new Error('boom'); }),
      step('later', '나중', third),
    ];

    const outcome = await runSaveSteps(steps, new Set(), reason);

    expect(outcome).toEqual({
      status: 'failed',
      done: ['periods'],
      failedKey: 'rules',
      message: '경기 시간은 저장됐고, 경기 규칙 저장에 실패했어요. 사유',
    });
    expect(third).not.toHaveBeenCalled();
  });

  it('skips keys in completed and still lists them in done', async () => {
    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});
    const steps = [step('periods', '경기 시간', first), step('rules', '경기 규칙', second)];

    const outcome = await runSaveSteps(steps, new Set(['periods']), reason);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ status: 'saved', done: ['periods', 'rules'] });
  });

  it('a retry that fails again still reports the earlier finished step', async () => {
    const steps = [step('periods', '경기 시간'), step('rules', '경기 규칙', async () => { throw new Error('again'); })];

    const outcome = await runSaveSteps(steps, new Set(['periods']), reason);

    expect(outcome).toMatchObject({ status: 'failed', done: ['periods'], failedKey: 'rules' });
    expect(outcome.status === 'failed' && outcome.message).toBe('경기 시간은 저장됐고, 경기 규칙 저장에 실패했어요. 사유');
  });

  it('toReason receives the error and the failed step', async () => {
    const error = new Error('boom');
    const failing = step('rules', '경기 규칙', async () => { throw error; });
    const toReason = vi.fn(() => '사유');

    await runSaveSteps([failing], new Set(), toReason);

    expect(toReason).toHaveBeenCalledWith(error, failing);
  });
});

describe('partialSaveMessage', () => {
  it('says what was saved and what failed', () => {
    expect(partialSaveMessage(['경기 시간'], '경기 규칙', '사유')).toBe('경기 시간은 저장됐고, 경기 규칙 저장에 실패했어요. 사유');
  });

  it('dedupes labels and joins them with a middle dot, picking the particle by the last one', () => {
    expect(partialSaveMessage(['출전 인원', '교체', '출전 인원'], '경기 규칙', '사유')).toBe(
      '출전 인원·교체는 저장됐고, 경기 규칙 저장에 실패했어요. 사유',
    );
  });

  it('returns the reason unchanged when nothing was saved', () => {
    expect(partialSaveMessage([], '경기 규칙', '사유')).toBe('사유');
  });
});

describe('saveStep', () => {
  it('같은 이름이라도 보낼 내용이 다르면 key 가 달라, 끝난 단계로 건너뛰지 않는다', async () => {
    const first = saveStep('periods', '경기 시간', { minutes: [20, 20] }, async () => {});
    const sameAgain = saveStep('periods', '경기 시간', { minutes: [20, 20] }, vi.fn(async () => {}));
    const edited = saveStep('periods', '경기 시간', { minutes: [25, 25] }, vi.fn(async () => {}));
    const completed = new Set([first.key]);

    await runSaveSteps([sameAgain], completed, reason);
    await runSaveSteps([edited], completed, reason);

    expect(sameAgain.run).not.toHaveBeenCalled();
    expect(edited.run).toHaveBeenCalledTimes(1);
  });
});
