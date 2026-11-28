/**
 * 행 클릭(onRowClick) 계약. 데스크톱 <tr>에만 배선돼 있고 <lg 모바일 카드 스택에는
 * 없어서, 모바일(본무대)에서는 어느 목록도 행으로 상세 진입이 안 됐다 — 카드에도
 * 같은 계약을 배선하면서 그 계약을 여기 고정한다.
 *
 * jsdom 은 미디어쿼리로 숨겨진 데스크톱 표와 모바일 카드를 둘 다 렌더하므로,
 * 모바일 검증은 <ul role="list"> 안쪽으로 스코프를 좁혀서 본다.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminDataTable } from './admin-data-table';

interface Row {
  id: string;
  title: string;
}

const columns = [{ key: 'title', header: '제목', render: (row: Row) => row.title }];
const rows: Row[] = [{ id: 'r1', title: '첫 행' }];

function mobileCard() {
  const list = screen.getByRole('list');
  return within(list).getAllByRole('button', { name: '첫 행 상세 보기' })[0];
}

describe('AdminDataTable onRowClick', () => {
  it('모바일 카드도 role=button + 라벨을 갖고 클릭하면 onRowClick 이 호출된다', () => {
    const onRowClick = vi.fn();
    render(
      <AdminDataTable<Row>
        columns={columns}
        rows={rows}
        keyExtractor={(row) => row.id}
        onRowClick={onRowClick}
        rowClickLabel={(row) => `${row.title} 상세 보기`}
      />,
    );
    fireEvent.click(mobileCard());
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it('키보드 Enter 로도 카드 행 진입이 된다', () => {
    const onRowClick = vi.fn();
    render(
      <AdminDataTable<Row>
        columns={columns}
        rows={rows}
        keyExtractor={(row) => row.id}
        onRowClick={onRowClick}
        rowClickLabel={(row) => `${row.title} 상세 보기`}
      />,
    );
    fireEvent.keyDown(mobileCard(), { key: 'Enter' });
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it('액션 버튼 클릭은 행 클릭으로 전파되지 않는다 — 버튼을 눌렀는데 상세로 이동하면 안 된다', () => {
    const onRowClick = vi.fn();
    const onAction = vi.fn();
    render(
      <AdminDataTable<Row>
        columns={columns}
        rows={rows}
        keyExtractor={(row) => row.id}
        onRowClick={onRowClick}
        rowClickLabel={(row) => `${row.title} 상세 보기`}
        renderActions={() => (
          <button type="button" onClick={onAction}>
            상태 변경
          </button>
        )}
      />,
    );
    // 데스크톱 표 + 모바일 카드 양쪽의 액션 버튼 전부 — 어느 쪽에서도 전파되면 안 된다.
    for (const button of screen.getAllByRole('button', { name: '상태 변경' })) {
      fireEvent.click(button);
    }
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('onRowClick 이 없으면 카드는 눌리는 요소가 아니다', () => {
    render(<AdminDataTable<Row> columns={columns} rows={rows} keyExtractor={(row) => row.id} />);
    const list = screen.getByRole('list');
    expect(within(list).queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('AdminDataTable 데스크톱 표 폭', () => {
  // 기본값을 바꾸면 이 표를 쓰는 어드민 화면 전부의 열 배치가 함께 바뀐다.
  it('기본은 콘텐츠 폭(w-max)이고, fitContainer 를 켜면 카드 폭(w-full)에 맞춘다', () => {
    const { rerender } = render(
      <AdminDataTable<Row> columns={columns} rows={rows} keyExtractor={(row) => row.id} />,
    );
    expect(screen.getByRole('table')).toHaveClass('w-max');
    expect(screen.getByRole('table')).not.toHaveClass('w-full');

    rerender(<AdminDataTable<Row> columns={columns} rows={rows} keyExtractor={(row) => row.id} fitContainer />);
    expect(screen.getByRole('table')).toHaveClass('w-full');
    expect(screen.getByRole('table')).not.toHaveClass('w-max');
  });
});

describe('AdminDataTable rowTone', () => {
  // 한쪽만 두꺼운 색 띠(R-K3)는 상태를 색으로만 말한다 — 상태는 열의 글자가 맡고 행은 배경 틴트만 쓴다.
  it.each(['danger', 'warning'] as const)('rowTone=%s 는 배경 틴트만 쓰고 한쪽 색 띠를 만들지 않는다 — 상태는 글자로 남는다', (tone) => {
    const { container } = render(
      <AdminDataTable<{ id: string; name: string; status: string }>
        columns={[
          { key: 'n', header: '이름', render: (row) => row.name },
          { key: 's', header: '상태', render: (row) => row.status },
        ]}
        rows={[{ id: 'a', name: '가', status: '취소됨' }]}
        keyExtractor={(row) => row.id}
        rowTone={() => tone}
      />,
    );
    expect(screen.getAllByText('취소됨').length).toBeGreaterThan(0);
    for (const element of container.querySelectorAll('tr, td, li')) expect(element.className).not.toMatch(/border-l-/);
    expect(container.querySelector('tbody tr')!.className).toContain(tone === 'danger' ? 'bg-[var(--red50)]/40' : 'bg-[var(--tint-orange)]');
    expect(container.querySelector('li')!.className).toContain(tone === 'danger' ? 'bg-[var(--red50)]/40' : 'bg-[var(--tint-orange)]');
  });
});
