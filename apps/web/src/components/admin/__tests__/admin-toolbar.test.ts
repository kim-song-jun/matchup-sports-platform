import { describe, it, expect, vi, beforeEach } from 'vitest';
import { downloadCSV } from '../admin-toolbar';

describe('downloadCSV', () => {
  beforeEach(() => {
    // Mock URL.createObjectURL and URL.revokeObjectURL for jsdom
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('does nothing for empty data', () => {
    expect(() => downloadCSV([], 'test')).not.toThrow();
  });

  it('creates and clicks a download link', () => {
    const clickMock = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValueOnce({
      href: '',
      download: '',
      click: clickMock,
    } as unknown as HTMLAnchorElement);

    const data = [
      { name: '매치1', sport: '축구', fee: 15000 },
      { name: '매치2', sport: '풋살', fee: 20000 },
    ];

    downloadCSV(data, 'matches');
    expect(clickMock).toHaveBeenCalled();
  });

  it('handles special characters (comma, newline, quotes)', () => {
    const clickMock = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValueOnce({
      href: '',
      download: '',
      click: clickMock,
    } as unknown as HTMLAnchorElement);

    const data = [
      { title: '제목에, 쉼표가 있는 경우', desc: '줄바꿈\n있는 설명' },
    ];

    downloadCSV(data, 'special');
    expect(clickMock).toHaveBeenCalled();
  });

  it('handles null and undefined values', () => {
    const clickMock = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValueOnce({
      href: '',
      download: '',
      click: clickMock,
    } as unknown as HTMLAnchorElement);

    const data = [
      { name: null, value: undefined, normal: '정상' } as Record<string, unknown>,
    ];

    downloadCSV(data, 'nulls');
    expect(clickMock).toHaveBeenCalled();
  });
});
