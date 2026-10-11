import { paginationArgs } from './page-args';

describe('paginationArgs', () => {
  it('page 1 wins over a cursor sent with it — the window starts at the top', () => {
    expect(paginationArgs({ page: 1, cursor: 'row-9' }, 20)).toEqual({});
  });

  it('a later page skips whole pages and ignores the cursor', () => {
    expect(paginationArgs({ page: 3, cursor: 'row-9' }, 20)).toEqual({ skip: 40 });
  });

  it('without a page the cursor resumes after its row', () => {
    expect(paginationArgs({ cursor: 'row-9' }, 20)).toEqual({ cursor: { id: 'row-9' }, skip: 1 });
  });

  it('neither starts at the top', () => {
    expect(paginationArgs({}, 20)).toEqual({});
  });
});
