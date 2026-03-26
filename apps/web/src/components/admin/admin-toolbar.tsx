'use client';

import { Search, Download } from 'lucide-react';

interface FilterOption {
  key: string;
  label: string;
}

interface AdminToolbarProps {
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  };
  filters?: FilterOption[];
  activeFilter?: string;
  onFilterChange?: (key: string) => void;
  count?: number;
  countLabel?: string;
  onDownload?: () => void;
}

export function AdminToolbar({
  search,
  filters,
  activeFilter = '',
  onFilterChange,
  count,
  countLabel = '건',
  onDownload,
}: AdminToolbarProps) {
  return (
    <div className="mb-4 space-y-3">
      {/* 검색 + 다운로드 */}
      <div className="flex items-center gap-2">
        {search && (
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={15} />
            <input
              type="text"
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder || '검색'}
              className="w-full rounded-lg bg-gray-50 py-2 pl-9 pr-3 text-[13px] text-gray-900 placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
            />
          </div>
        )}
        {onDownload && (
          <button onClick={onDownload}
            className="flex items-center gap-1.5 rounded-lg bg-white border border-gray-200 px-3 py-2 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition-colors shrink-0">
            <Download size={13} />
            내보내기
          </button>
        )}
      </div>

      {/* 필터 칩 + 카운트 */}
      <div className="flex items-center justify-between">
        {filters && filters.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {filters.map((f) => (
              <button key={f.key} onClick={() => onFilterChange?.(f.key)}
                className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  activeFilter === f.key
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        )}
        {count !== undefined && (
          <p className="text-[11px] text-gray-500 shrink-0 ml-2">{count}{countLabel}</p>
        )}
      </div>
    </div>
  );
}

/** 배열 데이터를 CSV로 변환 후 다운로드 */
export function downloadCSV(data: Record<string, unknown>[], filename: string) {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row =>
      headers.map(h => {
        const val = row[h];
        const str = val === null || val === undefined ? '' : String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }).join(',')
    ),
  ];
  const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
