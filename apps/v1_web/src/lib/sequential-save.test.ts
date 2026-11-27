import { describe, expect, it, vi } from 'vitest';
import { partialSaveMessage, runSaveSteps, saveStep, type SavedSteps } from './sequential-save';

const reason = () => '사유';
const ok = async () => {};
const fresh = (): SavedSteps => new Map();

describe('runSaveSteps', () => {
  it('runs steps in order and remembers what each place last saved', async () => {
    const calls: string[] = [];
    const steps = ['a', 'b', 'c'].map((key) => saveStep(key, key, { value: key }, async () => { calls.push(key); }));
    const saved = fresh();

    const outcome = await runSaveSteps(steps, saved, reason);

    expect(calls).toEqual(['a', 'b', 'c']);
    expect(outcome).toEqual({ status: 'saved' });
    expect([...saved.keys()]).toEqual(['a', 'b', 'c']);
  });

  it('stops at the first failure and never calls later steps', async () => {
    const third = vi.fn(ok);
    const steps = [
      saveStep('periods', '경기 시간', [25, 20], ok),
      saveStep('rules', '경기 규칙', { teamFoulThreshold: 6 }, async () => { throw new Error('boom'); }),
      saveStep('later', '나중', {}, third),
    ];
    const saved = fresh();

    const outcome = await runSaveSteps(steps, saved, reason);

    expect(outcome).toEqual({
      status: 'failed',
      failedKey: 'rules',
      message: '경기 시간은 저장됐고, 경기 규칙 저장에 실패했어요. 사유',
    });
    expect(third).not.toHaveBeenCalled();
    expect([...saved.keys()]).toEqual(['periods']);
  });

  it('a retry skips a step whose content was already saved and sends only the rest', async () => {
    const saved = fresh();
    await runSaveSteps(
      [saveStep('periods', '경기 시간', [25, 20], ok), saveStep('rules', '경기 규칙', { a: 1 }, async () => { throw new Error('boom'); })],
      saved,
      reason,
    );
    const periodsAgain = vi.fn(ok);
    const rulesAgain = vi.fn(ok);

    const outcome = await runSaveSteps(
      [saveStep('periods', '경기 시간', [25, 20], periodsAgain), saveStep('rules', '경기 규칙', { a: 1 }, rulesAgain)],
      saved,
      reason,
    );

    expect(periodsAgain).not.toHaveBeenCalled();
    expect(rulesAgain).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ status: 'saved' });
  });

  it('a retry that fails again still says the skipped step is saved', async () => {
    const saved = fresh();
    saved.set('periods', JSON.stringify([25, 20]));

    const outcome = await runSaveSteps(
      [saveStep('periods', '경기 시간', [25, 20], ok), saveStep('rules', '경기 규칙', {}, async () => { throw new Error('again'); })],
      saved,
      reason,
    );

    expect(outcome).toMatchObject({ status: 'failed', failedKey: 'rules', message: '경기 시간은 저장됐고, 경기 규칙 저장에 실패했어요. 사유' });
  });

  it('a place whose content changed is sent again — also when it returns to an earlier saved value (A → B → A)', async () => {
    const saved = fresh();
    const run = vi.fn(ok);
    const periods = (minutes: number[]) => saveStep('periods', '경기 시간', minutes, run);

    await runSaveSteps([periods([25, 20])], saved, reason);
    await runSaveSteps([periods([20, 20])], saved, reason);
    await runSaveSteps([periods([25, 20])], saved, reason);

    expect(run).toHaveBeenCalledTimes(3);
    expect(saved.get('periods')).toBe(JSON.stringify([25, 20]));
  });

  it('toReason receives the error and the failed step', async () => {
    const error = new Error('boom');
    const failing = saveStep('rules', '경기 규칙', {}, async () => { throw error; });
    const toReason = vi.fn(() => '사유');

    await runSaveSteps([failing], fresh(), toReason);

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
