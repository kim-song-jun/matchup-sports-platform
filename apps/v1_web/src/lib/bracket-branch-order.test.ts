import { expect, it } from 'vitest';
import { bracketBranchOrder } from './bracket-branch-order';

it('moves feeders with their branches after both byes are assigned to one quarterfinal', () => {
  const columns = [['first', 'bye1', 'second', 'bye2'], ['q1', 'q2'], ['final']];
  const links = [
    { source: 'first', target: 'q1', side: 'HOME', outcome: 'WINNER' },
    { source: 'second', target: 'q1', side: 'AWAY', outcome: 'WINNER' },
    { source: 'bye1', target: 'q2', side: 'AWAY', outcome: 'BYE' },
    { source: 'bye2', target: 'q2', side: 'HOME', outcome: 'BYE' },
    { source: 'q1', target: 'final', side: 'AWAY', outcome: 'WINNER' },
    { source: 'q2', target: 'final', side: 'HOME', outcome: 'WINNER' },
  ] as const;
  expect(bracketBranchOrder(columns, links)).toEqual([
    ['bye2', 'bye1', 'first', 'second'], ['q2', 'q1'], ['final'],
  ]);
});
