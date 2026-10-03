import { dropCursorRow, resumeAfterCursorArgs } from './resume-after-cursor';

describe('resume-after-cursor', () => {
  const rows = (...ids: string[]) => ids.map((id) => ({ id }));

  it('커서가 없으면 take 만 돌려준다', () => {
    expect(resumeAfterCursorArgs(undefined, 3)).toEqual({ take: 3 });
  });

  it('커서가 있으면 skip 없이 커서 행 자리를 포함해 take + 1 개를 읽는다', () => {
    expect(resumeAfterCursorArgs('a', 3)).toEqual({ cursor: { id: 'a' }, take: 4 });
  });

  it('첫 행이 커서 행이면 걷어내고 take 개로 자른다', () => {
    expect(dropCursorRow(rows('a', 'b', 'c', 'd'), 'a', 3)).toEqual(rows('b', 'c', 'd'));
  });

  it('커서 행이 where 를 벗어나 없으면 읽은 행을 버리지 않고 take 개만 남긴다', () => {
    expect(dropCursorRow(rows('b', 'c', 'd'), 'a', 2)).toEqual(rows('b', 'c'));
  });

  it('커서가 없으면 그대로 돌려준다', () => {
    expect(dropCursorRow(rows('a', 'b'), undefined, 2)).toEqual(rows('a', 'b'));
  });

  it('커서 id 와 같은 행이 첫 행이 아니면 걷어내지 않는다', () => {
    expect(dropCursorRow(rows('b', 'a'), 'a', 2)).toEqual(rows('b', 'a'));
  });
});
